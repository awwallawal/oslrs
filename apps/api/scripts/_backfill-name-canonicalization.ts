/**
 * Story 9-18 Part F (AC#F5) — operator-gated name-canonicalization backfill.
 *
 * The pre-9-18 wizard parsed a single "Full Name" into first_name (first token)
 * + last_name (rest). Yoruba/Nigerian surname-first entries ("OLOWU KAYODE")
 * were therefore stored swapped (first_name=OLOWU, last_name=KAYODE). Part F's
 * given/family split fixes NEW registrations; this one-shot script fixes the
 * EXISTING respondent rows.
 *
 * Two phases:
 *   1. --dry-run (MANDATORY first) — reads every respondent that has BOTH a
 *      first and last name, applies a (non-exhaustive, advisory) surname
 *      heuristic to pre-suggest swap/keep, and writes an `.xlsx` review file
 *      with a click-to-pick decision dropdown (swap / keep / skip), the
 *      heuristic suggestion pre-filled, likely-swaps amber-highlighted, a frozen
 *      header, and current-vs-proposed columns side by side.
 *   2. --apply --confirm-i-am-not-dry-running --file <reviewed.xlsx> — reads the
 *      operator-reviewed file back and, for every row marked `swap`, swaps
 *      first_name/last_name in a transaction that also emits an
 *      `OPERATOR_RESPONDENT_NAME_CANONICALIZED` audit row (awaited logActionTx —
 *      atomic + flush-safe, per the 9-26 backfill pattern).
 *
 * Deviations from the AC (documented for review):
 *   - Review file is `.xlsx` (not `.csv`) so it can carry a real data-validation
 *     dropdown (operator decision, 2026-06-11). Needs `exceljs`.
 *   - No phone-only skip: `respondents` has no email column, so reachability
 *     can't be determined without fragile joins — and name canonicalization
 *     benefits the ID card / any display regardless of contact channel. The
 *     backfill covers ALL rows with both names present; the operator marks
 *     `keep`/`skip` for any that shouldn't change.
 *   - The surname heuristic is a starting point only; the operator has final say
 *     via the dropdown. Default-on-no-match is `keep` (safe — no change).
 *
 * Usage:
 *   tsx scripts/_backfill-name-canonicalization.ts --help
 *   tsx scripts/_backfill-name-canonicalization.ts --dry-run
 *   tsx scripts/_backfill-name-canonicalization.ts --apply \
 *     --confirm-i-am-not-dry-running --file <path-to-reviewed.xlsx>
 *
 * Exit codes: 0 — ok (dry or apply); 1 — config error or any per-row failure.
 */
import os from 'node:os';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { db } from '../src/db/index.js';
import { respondents } from '../src/db/schema/index.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from '../src/services/audit.service.js';

const logger = pino({ name: 'backfill-name-canonicalization' });

export const DECISIONS = ['swap', 'keep', 'skip'] as const;
export type Decision = (typeof DECISIONS)[number];

export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'dry-run',
  'apply',
  'confirm-i-am-not-dry-running',
  'file',
  'out-dir',
  'max-rows',
  'help',
]);

const HELP_TEXT = `Usage: tsx scripts/_backfill-name-canonicalization.ts [options]

Canonicalises swapped first_name/last_name on existing respondent rows.

  --dry-run                         Mandatory first; writes the .xlsx review file, no DB writes
  --apply                           Apply the operator-reviewed decisions
  --confirm-i-am-not-dry-running    Required with --apply (deliberately ugly)
  --file <path>                     Reviewed .xlsx (required with --apply)
  --out-dir <path>                  Override the dry-run output dir
  --max-rows <N>                    Safety cap (default 1000)
  --help                            Show this message and exit
`;

/**
 * Advisory, NON-EXHAUSTIVE seed of common Yoruba surnames. Used only to
 * pre-suggest a swap when the stored first_name looks like a surname. The
 * operator reviews + overrides every row; this list is a convenience, not an
 * authority. Stored uppercase for case-insensitive matching.
 */
export const COMMON_YORUBA_SURNAMES: ReadonlySet<string> = new Set([
  'ADEBAYO', 'ADELEKE', 'ADENIYI', 'ADESANYA', 'ADEYEMI', 'AFOLABI', 'AKINTOLA',
  'AKINWANDE', 'BABATUNDE', 'BALOGUN', 'FALOLA', 'OGUNDIPE', 'OGUNLEYE',
  'OLADIPO', 'OLANIYAN', 'OLOWU', 'OLUWASEUN', 'OYELARAN', 'OYINLOLA', 'SOYINKA',
]);

function norm(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * Heuristic suggestion (AC#F5): suggest `swap` when the stored first_name reads
 * like a surname and the last_name does not. Otherwise `keep` (safe default).
 */
export function suggestDecision(firstName: string | null, lastName: string | null): Decision {
  const first = norm(firstName).toUpperCase();
  const last = norm(lastName).toUpperCase();
  if (!first || !last) return 'keep';
  if (COMMON_YORUBA_SURNAMES.has(first) && !COMMON_YORUBA_SURNAMES.has(last)) return 'swap';
  return 'keep';
}

/** Apply a decision to produce the canonical given/family pair. */
export function computeProposed(
  firstName: string | null,
  lastName: string | null,
  decision: Decision,
): { given: string; family: string } {
  const first = norm(firstName);
  const last = norm(lastName);
  if (decision === 'swap') return { given: last, family: first };
  return { given: first, family: last }; // keep / skip leave it as-is
}

/**
 * Apply-path safety guard (AI-Review H1/H2): only swap a row when the LIVE DB
 * values still match the snapshot the operator reviewed. This protects against
 * (a) drift between dry-run and apply, (b) an accidental edit to the snapshot's
 * `current_*` cells flowing into the swap/audit, and (c) a re-run — an
 * already-swapped row's DB state no longer matches the pre-swap snapshot, so it
 * is skipped instead of swapped back. Trim-based exact match (mirrors `norm`).
 */
export function dbMatchesSnapshot(
  dbFirst: string | null,
  dbLast: string | null,
  snapFirst: string,
  snapLast: string,
): boolean {
  return norm(dbFirst) === norm(snapFirst) && norm(dbLast) === norm(snapLast);
}

export interface ProposedRow {
  respondentId: string;
  currentFirst: string;
  currentLast: string;
  suggested: Decision;
}

const COLUMNS = [
  { header: 'respondent_id', key: 'respondent_id', width: 38 },
  { header: 'current_first_name', key: 'current_first_name', width: 22 },
  { header: 'current_last_name', key: 'current_last_name', width: 22 },
  { header: 'proposed_given', key: 'proposed_given', width: 22 },
  { header: 'proposed_family', key: 'proposed_family', width: 22 },
  { header: 'decision', key: 'decision', width: 12 },
] as const;

const AMBER = 'FFFFE0B2';

/** Build the operator-review workbook (in-memory; AC#F5 + dropdown). */
export function buildWorkbook(rows: ProposedRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Name Backfill');
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.views = [{ state: 'frozen', ySplit: 1 }]; // frozen header

  for (const row of rows) {
    const proposed = computeProposed(row.currentFirst, row.currentLast, row.suggested);
    const added = ws.addRow({
      respondent_id: row.respondentId,
      current_first_name: row.currentFirst,
      current_last_name: row.currentLast,
      proposed_given: proposed.given,
      proposed_family: proposed.family,
      decision: row.suggested,
    });
    // Click-to-pick dropdown on the decision cell.
    added.getCell('decision').dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: [`"${DECISIONS.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Invalid decision',
      error: 'Choose swap, keep, or skip.',
    };
    // Amber-highlight rows the heuristic suggests swapping, so the eye lands there.
    if (row.suggested === 'swap') {
      added.getCell('decision').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: AMBER },
      };
    }
  }
  return wb;
}

export interface ReviewedRow {
  respondentId: string;
  currentFirst: string;
  currentLast: string;
  decision: Decision;
}

/** Read an operator-reviewed workbook back into typed rows (header-driven). */
export function parseReviewedRows(wb: ExcelJS.Workbook): ReviewedRow[] {
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Reviewed file has no worksheet');
  const header = ws.getRow(1);
  const colIndex: Record<string, number> = {};
  header.eachCell((cell, col) => {
    colIndex[String(cell.value ?? '').trim()] = col;
  });
  for (const required of ['respondent_id', 'current_first_name', 'current_last_name', 'decision']) {
    if (!colIndex[required]) throw new Error(`Reviewed file missing column: ${required}`);
  }

  const cellStr = (rowNum: number, name: string): string => {
    const v = ws.getRow(rowNum).getCell(colIndex[name]).value;
    return v == null ? '' : String(typeof v === 'object' && 'text' in v ? v.text : v).trim();
  };

  const out: ReviewedRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const respondentId = cellStr(r, 'respondent_id');
    if (!respondentId) continue; // skip blank trailing rows
    const decisionRaw = cellStr(r, 'decision').toLowerCase();
    if (!(DECISIONS as readonly string[]).includes(decisionRaw)) {
      throw new Error(`Row ${r}: invalid decision "${decisionRaw}" for ${respondentId}`);
    }
    out.push({
      respondentId,
      currentFirst: cellStr(r, 'current_first_name'),
      currentLast: cellStr(r, 'current_last_name'),
      decision: decisionRaw as Decision,
    });
  }
  return out;
}

interface Args {
  dryRun: boolean;
  apply: boolean;
  confirmLive: boolean;
  file: string | null;
  outDir: string | null;
  maxRows: number;
}

export function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (!KNOWN_FLAGS.has(key)) throw new Error(`Unknown flag --${key}. Run with --help.`);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  const maxRaw = flags['max-rows'];
  const maxRows = typeof maxRaw === 'string' ? Number(maxRaw) : 1000;
  if (!Number.isFinite(maxRows) || maxRows < 1) {
    throw new Error(`--max-rows must be a positive number (got ${String(maxRaw)})`);
  }
  return {
    dryRun: flags['dry-run'] === true,
    apply: flags['apply'] === true,
    confirmLive: flags['confirm-i-am-not-dry-running'] === true,
    file: typeof flags.file === 'string' ? flags.file : null,
    outDir: typeof flags['out-dir'] === 'string' ? flags['out-dir'] : null,
    maxRows,
  };
}

async function runDryRun(args: Args): Promise<void> {
  const rowsRaw = await db
    .select({ id: respondents.id, firstName: respondents.firstName, lastName: respondents.lastName })
    .from(respondents)
    .where(sql`COALESCE(TRIM(${respondents.firstName}), '') <> '' AND COALESCE(TRIM(${respondents.lastName}), '') <> ''`)
    .limit(args.maxRows);

  const rows: ProposedRow[] = rowsRaw.map((r) => ({
    respondentId: r.id,
    currentFirst: norm(r.firstName),
    currentLast: norm(r.lastName),
    suggested: suggestDecision(r.firstName, r.lastName),
  }));

  const suggestedSwaps = rows.filter((r) => r.suggested === 'swap').length;
  const wb = buildWorkbook(rows);

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = args.outDir ?? path.resolve(__dirname, `../../../_bmad-output/scratch/name-backfill-${stamp}`);
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'proposed.xlsx');
  await wb.xlsx.writeFile(outPath);

  console.log(`\n[DRY-RUN] ${rows.length} respondent(s) with both names; heuristic suggests ${suggestedSwaps} swap(s).`);
  // AI-Review L1: never silently truncate — if we hit the cap there may be more.
  if (rows.length === args.maxRows) {
    console.warn(
      `  [WARN] Hit the --max-rows cap (${args.maxRows}). There may be MORE respondents not in this file — ` +
        `re-run with a higher --max-rows to capture all of them.`,
    );
  }
  console.log(`  Review file: ${outPath}`);
  console.log('  Mark each row swap / keep / skip (heuristic pre-filled; amber = suggested swap), save, then:');
  console.log('  tsx scripts/_backfill-name-canonicalization.ts --apply --confirm-i-am-not-dry-running --file <path>\n');
}

async function runApply(args: Args): Promise<number> {
  if (!args.file) {
    console.error('ERROR: --apply requires --file <reviewed.xlsx>');
    return 1;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(args.file);
  const reviewed = parseReviewedRows(wb); // throws on any invalid decision

  const operatorHost = os.hostname();
  const operatorInvocation = 'tsx scripts/_backfill-name-canonicalization.ts --apply';
  let swapped = 0;
  let kept = 0;
  let skippedDrift = 0;
  let failed = 0;

  for (const row of reviewed) {
    if (row.decision !== 'swap') {
      kept++;
      continue;
    }
    try {
      // AI-Review H1/H2: re-read the LIVE row inside the txn and swap the DB
      // values (not the snapshot), only when the DB still matches what the
      // operator reviewed. Records the actual DB `previous` in the audit; a
      // drifted or already-swapped row is skipped, never clobbered/double-swapped.
      const outcome = await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ firstName: respondents.firstName, lastName: respondents.lastName })
          .from(respondents)
          .where(sql`${respondents.id} = ${row.respondentId}`)
          .limit(1);

        if (!current) return 'missing' as const;
        if (!dbMatchesSnapshot(current.firstName, current.lastName, row.currentFirst, row.currentLast)) {
          return 'drift' as const;
        }

        const proposed = computeProposed(current.firstName, current.lastName, 'swap');
        await tx
          .update(respondents)
          .set({ firstName: proposed.given, lastName: proposed.family, updatedAt: new Date() })
          .where(sql`${respondents.id} = ${row.respondentId}`);

        await AuditService.logActionTx(tx, {
          actorId: null,
          action: AUDIT_ACTIONS.OPERATOR_RESPONDENT_NAME_CANONICALIZED,
          targetResource: AUDIT_TARGETS.RESPONDENT,
          targetId: row.respondentId,
          details: {
            previous: { first_name: norm(current.firstName), last_name: norm(current.lastName) },
            new: { first_name: proposed.given, last_name: proposed.family },
            decision: 'swap',
            operator_marker: 'manual_xlsx_review',
          },
          ipAddress: operatorHost,
          userAgent: operatorInvocation,
        });
        return 'swapped' as const;
      });

      if (outcome === 'swapped') {
        swapped++;
        logger.info({ event: 'name_backfill.swapped', respondentId: row.respondentId });
      } else {
        skippedDrift++;
        logger.warn({
          event: outcome === 'missing' ? 'name_backfill.skipped_missing' : 'name_backfill.skipped_drift',
          respondentId: row.respondentId,
          reason:
            outcome === 'missing'
              ? 'respondent no longer exists'
              : 'live DB name no longer matches the reviewed snapshot (changed since dry-run, or already applied)',
        });
      }
    } catch (err) {
      failed++;
      logger.error({ event: 'name_backfill.failed', respondentId: row.respondentId, error: (err as Error).message });
    }
  }

  console.log(
    `\nSummary: swapped=${swapped} kept/skipped=${kept} drift-skipped=${skippedDrift} failed=${failed} total=${reviewed.length}`,
  );
  if (skippedDrift > 0) {
    console.log(
      `  NOTE: ${skippedDrift} row(s) were skipped because the live DB no longer matches the reviewed file ` +
        `(changed since dry-run, or already applied). Re-run --dry-run to review them afresh if needed.`,
    );
  }
  console.log('');
  return failed > 0 ? 1 : 0;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }
  const args = parseArgs(argv);

  if (args.apply) {
    if (!args.confirmLive) {
      console.error('ERROR: --apply requires --confirm-i-am-not-dry-running.');
      process.exit(1);
    }
    process.exit(await runApply(args));
  }

  if (!args.dryRun) {
    console.error('ERROR: pass --dry-run (mandatory first) or --apply --confirm-i-am-not-dry-running --file <path>.');
    process.exit(1);
  }
  await runDryRun(args);
  process.exit(0);
}

// Only invoke when executed directly via tsx (vitest sets VITEST=true).
if (!process.env.VITEST) {
  main().catch((err) => {
    logger.error({ event: 'name_backfill.fatal', error: (err as Error).message });
    console.error(`FATAL: ${(err as Error).message}`);
    process.exit(1);
  });
}
