/**
 * Story 9-18 Part F (AC#F5) — operator-gated name-canonicalization backfill.
 *
 * The pre-9-18 wizard parsed a single "Full Name" into first_name (first token)
 * + last_name (rest). Yoruba/Nigerian surname-first entries ("OLOWU KAYODE
 * FEMI") were stored mis-split. Part F's given/family split fixes NEW
 * registrations; this one-shot script fixes the EXISTING respondent rows.
 *
 * SURNAME-DESIGNATION model (revised 2026-06-11): the operator fills a single
 * `surname` column with the true surname for each row (their confident, eyeballed
 * judgment). The script then derives, per row:
 *     family_name = surname
 *     given_name  = the full name (current_first + current_last) with the
 *                   surname token(s) removed.
 * This is correct for surname-first 2-token names AND 3-token names where the
 * surname is the last token ("Adaora | Winnie Adelakun" → given "Adaora Winnie",
 * family "Adelakun") — cases the earlier swap/keep model could not express. It
 * also removes the swap/keep judgment that was producing inconsistent decisions
 * (the Last-Name vs Surname confusion).
 *
 * Phases:
 *   1. --dry-run — writes an `.xlsx` worksheet (current names + an EMPTY surname
 *      column to fill; per-row `proposed_given`/`proposed_family`/`status`
 *      computed live from whatever surname is present). Rows the script can't
 *      resolve (no surname, or surname not found in the name) are amber-flagged.
 *   2. --apply --file <reviewed.xlsx> — PREVIEW (no writes): prints what WOULD
 *      change. Add --confirm-i-am-not-dry-running to write. For each row with a
 *      resolvable surname that actually changes the stored values, it re-reads
 *      the LIVE row inside a txn, swaps only if the DB still matches the reviewed
 *      snapshot (drift/already-applied → skipped), and emits one
 *      `OPERATOR_RESPONDENT_NAME_CANONICALIZED` audit row (awaited logActionTx).
 *
 * Deviations from the AC (documented for review):
 *   - Review file is `.xlsx` (exceljs) for a frozen header + amber flagging of
 *     rows needing a second look (unmatched / no-surname).
 *   - No phone-only skip: `respondents` has no email column; the name fix
 *     benefits the ID card / any display regardless of channel. Rows that need
 *     no change (computed == current) are auto-skipped (no write, no audit).
 *
 * Usage:
 *   tsx scripts/_backfill-name-canonicalization.ts --help
 *   tsx scripts/_backfill-name-canonicalization.ts --dry-run
 *   tsx scripts/_backfill-name-canonicalization.ts --apply --file <reviewed.xlsx>            # preview
 *   tsx scripts/_backfill-name-canonicalization.ts --apply --confirm-i-am-not-dry-running --file <reviewed.xlsx>
 *
 * Exit codes: 0 — ok (dry / preview / apply); 1 — config error or per-row failure.
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

Canonicalises first_name/last_name on existing respondent rows from an
operator-filled "surname" column (family = surname; given = name minus surname).

  --dry-run                         Write the .xlsx worksheet (fill the surname column), no DB writes
  --apply --file <path>             PREVIEW what would change from the reviewed file (no writes)
  --apply --confirm-i-am-not-dry-running --file <path>   Apply the changes
  --out-dir <path>                  Override the dry-run output dir
  --max-rows <N>                    Safety cap (default 1000)
  --help                            Show this message and exit
`;

function norm(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export interface Canonical {
  given: string;
  family: string;
  /** true when the surname was found as a token-run within the name. */
  matched: boolean;
  /** true when the canonical (given, family) differs from the current (first, last). */
  changed: boolean;
}

/**
 * Derive the canonical given/family from the current name + the operator's
 * surname. The surname (one or more tokens) is located as a contiguous run
 * within `current_first + ' ' + current_last` (case-insensitive); the remaining
 * tokens become the given name. If the surname isn't found, or removing it would
 * leave no given name, the row is `matched: false` (flagged, never guessed).
 */
export function computeCanonical(
  currentFirst: string | null,
  currentLast: string | null,
  surname: string | null,
): Canonical {
  const first = norm(currentFirst);
  const last = norm(currentLast);
  const sn = norm(surname);
  const asIs = (): Canonical => ({
    given: [first, last].filter(Boolean).join(' '),
    family: sn,
    matched: false,
    changed: false,
  });
  if (!sn) return { ...asIs(), family: '' };

  const fullTokens = `${first} ${last}`.split(/\s+/).filter(Boolean);
  const snTokens = sn.split(/\s+/).filter(Boolean);
  const fU = fullTokens.map((t) => t.toUpperCase());
  const sU = snTokens.map((t) => t.toUpperCase());

  let idx = -1;
  for (let i = 0; i + sU.length <= fU.length; i++) {
    if (sU.every((t, j) => fU[i + j] === t)) {
      idx = i;
      break;
    }
  }
  if (idx === -1) return asIs(); // surname not present in the stored name → flag

  const givenTokens = [...fullTokens.slice(0, idx), ...fullTokens.slice(idx + snTokens.length)];
  if (givenTokens.length === 0) return asIs(); // would leave no given name → flag

  const given = givenTokens.join(' ');
  const family = sn;
  return { given, family, matched: true, changed: given !== first || family !== last };
}

/**
 * Apply-path safety guard (AI-Review H1/H2): only write a row when the LIVE DB
 * values still match the snapshot the operator reviewed. Protects against drift
 * between dry-run and apply, an edited snapshot cell, and re-runs (an
 * already-canonicalised row no longer matches the pre-fix snapshot → skipped).
 */
export function dbMatchesSnapshot(
  dbFirst: string | null,
  dbLast: string | null,
  snapFirst: string,
  snapLast: string,
): boolean {
  return norm(dbFirst) === norm(snapFirst) && norm(dbLast) === norm(snapLast);
}

/** Per-row status for the worksheet (advisory). */
export type RowStatus = 'change' | 'no change' | 'UNMATCHED' | 'no surname';

export function rowStatus(c: Canonical, surname: string | null): RowStatus {
  if (!norm(surname)) return 'no surname';
  if (!c.matched) return 'UNMATCHED';
  return c.changed ? 'change' : 'no change';
}

export interface ProposedRow {
  respondentId: string;
  currentFirst: string;
  currentLast: string;
  /** Operator input; empty on a fresh dry-run worksheet. */
  surname: string;
}

const COLUMNS = [
  { header: 'respondent_id', key: 'respondent_id', width: 38 },
  { header: 'current_first_name', key: 'current_first_name', width: 22 },
  { header: 'current_last_name', key: 'current_last_name', width: 24 },
  { header: 'surname', key: 'surname', width: 20 },
  { header: 'proposed_given', key: 'proposed_given', width: 24 },
  { header: 'proposed_family', key: 'proposed_family', width: 20 },
  { header: 'status', key: 'status', width: 12 },
] as const;

const AMBER = 'FFFFE0B2';
const SURNAME_COL = 4; // 1-based index of the editable surname column

/** Build the operator worksheet (in-memory). Surname is the only input. */
export function buildWorkbook(rows: ProposedRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Name Backfill');
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of rows) {
    const canon = computeCanonical(row.currentFirst, row.currentLast, row.surname);
    const status = rowStatus(canon, row.surname);
    const added = ws.addRow({
      respondent_id: row.respondentId,
      current_first_name: row.currentFirst,
      current_last_name: row.currentLast,
      surname: row.surname,
      proposed_given: canon.matched ? canon.given : '',
      proposed_family: canon.matched ? canon.family : '',
      status,
    });
    // Amber-flag the rows that need a human second look: no surname yet, or the
    // surname doesn't resolve within the stored name (spelling drift / oddball).
    if (status === 'no surname' || status === 'UNMATCHED') {
      added.getCell(SURNAME_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER } };
    }
  }
  return wb;
}

export interface ReviewedRow {
  respondentId: string;
  currentFirst: string;
  currentLast: string;
  surname: string;
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
  for (const required of ['respondent_id', 'current_first_name', 'current_last_name', 'surname']) {
    if (!colIndex[required]) throw new Error(`Reviewed file missing column: ${required}`);
  }

  const cellStr = (rowNum: number, name: string): string => {
    const v = ws.getRow(rowNum).getCell(colIndex[name]).value;
    if (v == null) return '';
    if (typeof v === 'object') {
      if (Array.isArray((v as { richText?: { text: string }[] }).richText)) {
        return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('').trim();
      }
      if ('text' in v) return String((v as { text: unknown }).text).trim();
      if ('result' in v) return String((v as { result: unknown }).result).trim();
    }
    return String(v).trim();
  };

  const out: ReviewedRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const respondentId = cellStr(r, 'respondent_id');
    if (!respondentId) continue; // skip blank trailing rows
    out.push({
      respondentId,
      currentFirst: cellStr(r, 'current_first_name'),
      currentLast: cellStr(r, 'current_last_name'),
      surname: cellStr(r, 'surname'),
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
    surname: '', // operator fills this
  }));

  const wb = buildWorkbook(rows);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = args.outDir ?? path.resolve(here, `../../../_bmad-output/scratch/name-backfill-${stamp}`);
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'proposed.xlsx');
  await wb.xlsx.writeFile(outPath);

  console.log(`\n[DRY-RUN] ${rows.length} respondent(s) with both names.`);
  if (rows.length === args.maxRows) {
    console.warn(
      `  [WARN] Hit the --max-rows cap (${args.maxRows}). There may be MORE respondents — re-run with a higher --max-rows.`,
    );
  }
  console.log(`  Worksheet: ${outPath}`);
  console.log('  Fill the `surname` column for each row (amber = needs attention), save, then preview:');
  console.log('  tsx scripts/_backfill-name-canonicalization.ts --apply --file <path>   (then add --confirm-i-am-not-dry-running to write)\n');
}

async function runApply(args: Args): Promise<number> {
  if (!args.file) {
    console.error('ERROR: --apply requires --file <reviewed.xlsx>');
    return 1;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(args.file);
  const reviewed = parseReviewedRows(wb);
  const live = args.confirmLive;

  const operatorHost = os.hostname();
  const operatorInvocation = 'tsx scripts/_backfill-name-canonicalization.ts --apply';
  let changed = 0;
  let unchanged = 0;
  let noSurname = 0;
  let unmatched = 0;
  let driftSkipped = 0;
  let failed = 0;

  for (const row of reviewed) {
    const canon = computeCanonical(row.currentFirst, row.currentLast, row.surname);
    if (!norm(row.surname)) {
      noSurname++;
      continue;
    }
    if (!canon.matched) {
      unmatched++;
      logger.warn({ event: 'name_backfill.unmatched', respondentId: row.respondentId, surname: row.surname });
      continue;
    }
    if (!canon.changed) {
      unchanged++;
      continue;
    }

    if (!live) {
      changed++; // preview count
      console.log(
        `  WOULD FIX ${row.respondentId.slice(0, 8)}  [${row.currentFirst} | ${row.currentLast}]  ->  given=[${canon.given}] family=[${canon.family}]`,
      );
      continue;
    }

    try {
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
        // Recompute from the LIVE values (== snapshot here) so the write + audit
        // reflect exactly what's in the DB.
        const c = computeCanonical(current.firstName, current.lastName, row.surname);
        if (!c.matched || !c.changed) return 'noop' as const;

        await tx
          .update(respondents)
          .set({ firstName: c.given, lastName: c.family, updatedAt: new Date() })
          .where(sql`${respondents.id} = ${row.respondentId}`);

        await AuditService.logActionTx(tx, {
          actorId: null,
          action: AUDIT_ACTIONS.OPERATOR_RESPONDENT_NAME_CANONICALIZED,
          targetResource: AUDIT_TARGETS.RESPONDENT,
          targetId: row.respondentId,
          details: {
            previous: { first_name: norm(current.firstName), last_name: norm(current.lastName) },
            new: { first_name: c.given, last_name: c.family },
            designated_surname: row.surname,
            operator_marker: 'manual_xlsx_review',
          },
          ipAddress: operatorHost,
          userAgent: operatorInvocation,
        });
        return 'changed' as const;
      });

      if (outcome === 'changed') {
        changed++;
        logger.info({ event: 'name_backfill.changed', respondentId: row.respondentId });
      } else if (outcome === 'noop') {
        unchanged++;
      } else {
        driftSkipped++;
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

  const verb = live ? 'changed' : 'would-change';
  console.log(
    `\nSummary (${live ? 'LIVE' : 'PREVIEW'}): ${verb}=${changed} no-change=${unchanged} no-surname=${noSurname} unmatched=${unmatched} drift-skipped=${driftSkipped} failed=${failed} total=${reviewed.length}`,
  );
  if (unmatched > 0) {
    console.log(`  NOTE: ${unmatched} row(s) have a surname that isn't found in the stored name (spelling drift?) — review manually.`);
  }
  if (!live && changed > 0) {
    console.log('  This was a PREVIEW. Re-run with --confirm-i-am-not-dry-running to write.\n');
  } else {
    console.log('');
  }
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
    process.exit(await runApply(args)); // preview unless --confirm-i-am-not-dry-running
  }

  if (!args.dryRun) {
    console.error('ERROR: pass --dry-run, or --apply --file <path> (preview), or --apply --confirm-i-am-not-dry-running --file <path>.');
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
