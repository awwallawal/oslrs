/**
 * Story 9-58 (Deliverable B) — one-shot idempotent reference-code backfill.
 *
 * Assigns a human-friendly `OSL-<YYYY>-<6 base32>` reference code to every
 * existing respondent that has none (`reference_code IS NULL`). Pre-9-58 rows
 * predate the generate-at-creation chokepoint, so they need a one-time fill so
 * support (9-56), the public status check (9-58 Deliverable A), and the
 * re-engagement blasts (9-27 / 9-28) can quote / resolve by the code.
 *
 * Mirrors the `_backfill-name-canonicalization.ts` discipline:
 *   - PREVIEW BY DEFAULT. `--dry-run` (or no apply flag) only counts + samples.
 *   - WRITES only with `--apply --confirm-i-am-not-dry-running`.
 *   - Per-row work + audit emission wrapped in one `db.transaction` (atomic;
 *     a re-check of `reference_code IS NULL` inside the txn makes it safe to
 *     re-run and immune to a row that got a code between selection and write).
 *   - Year namespace = the respondent's `created_at` year (stable, meaningful).
 *   - Emits `OPERATOR_REFERENCE_CODE_BACKFILLED` per assigned code.
 *
 * Runbook: docs/runbooks/reference-code-backfill.md
 *
 * Usage:
 *   tsx scripts/_backfill-reference-code.ts --dry-run [--max-rows N]
 *   tsx scripts/_backfill-reference-code.ts --apply --confirm-i-am-not-dry-running [--max-rows N]
 *
 * Exit codes: 0 success, 1 on bad args / any per-row failure.
 */
import os from 'node:os';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { ReferenceCodeService } from '../src/services/reference-code.service.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from '../src/services/audit.service.js';
import pino from 'pino';

const logger = pino({ name: 'reference-code-backfill' });

export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'dry-run',
  'apply',
  'confirm-i-am-not-dry-running',
  'max-rows',
  'help',
]);

const HELP_TEXT = `
Story 9-58 — reference-code backfill (assigns OSL-YYYY-XXXXXX to rows with none).

  --dry-run                          Preview: count + sample, no writes (default).
  --apply                            Switch to apply mode (still PREVIEW unless confirmed).
  --confirm-i-am-not-dry-running     Required with --apply to actually WRITE.
  --max-rows N                       Cap rows processed this run (default: all).
  --help                             Show this help.

Examples:
  tsx scripts/_backfill-reference-code.ts --dry-run
  tsx scripts/_backfill-reference-code.ts --apply --confirm-i-am-not-dry-running
`;

export interface Args {
  dryRun: boolean;
  apply: boolean;
  confirmLive: boolean;
  maxRows: number | null;
}

export function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (!KNOWN_FLAGS.has(key)) {
      throw new Error(`Unknown flag --${key}. Known flags: ${[...KNOWN_FLAGS].join(', ')}`);
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  const maxRowsRaw = flags['max-rows'];
  return {
    dryRun: flags['dry-run'] === true,
    apply: flags['apply'] === true,
    confirmLive: flags['confirm-i-am-not-dry-running'] === true,
    maxRows: typeof maxRowsRaw === 'string' ? Math.max(1, parseInt(maxRowsRaw, 10)) : null,
  };
}

interface CandidateRow {
  id: string;
  createdAt: Date;
}

async function fetchCandidates(maxRows: number | null): Promise<CandidateRow[]> {
  const limitClause = maxRows ? sql`LIMIT ${maxRows}` : sql``;
  const result = (await db.execute(sql`
    SELECT id, created_at
    FROM "respondents"
    WHERE "reference_code" IS NULL
    ORDER BY "created_at" ASC
    ${limitClause}
  `)) as { rows: Array<{ id: string; created_at: string | Date }> };
  return result.rows.map((r) => ({ id: r.id, createdAt: new Date(r.created_at) }));
}

async function runDryRun(args: Args): Promise<number> {
  const candidates = await fetchCandidates(args.maxRows);
  console.log(`\n[DRY-RUN] ${candidates.length} respondent(s) without a reference code.`);
  if (args.maxRows && candidates.length === args.maxRows) {
    console.warn(`  [WARN] Hit the --max-rows cap (${args.maxRows}); more rows may remain.`);
  }
  for (const row of candidates.slice(0, 10)) {
    console.log(`  WOULD ASSIGN ${row.id.slice(0, 8)}…  (year ${row.createdAt.getFullYear()})`);
  }
  if (candidates.length > 10) console.log(`  … and ${candidates.length - 10} more.`);
  console.log('\n  This was a PREVIEW. Re-run with --apply --confirm-i-am-not-dry-running to write.\n');
  return 0;
}

async function runApply(args: Args): Promise<number> {
  const candidates = await fetchCandidates(args.maxRows);
  const live = args.confirmLive;
  const operatorHost = os.hostname();
  const operatorInvocation = `reference-code-backfill ${process.argv.slice(2).join(' ')}`;

  let assigned = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of candidates) {
    if (!live) {
      assigned++;
      continue;
    }
    try {
      const outcome = await db.transaction(async (tx) => {
        // Drift / idempotency guard — re-check inside the txn that the row
        // still has no code (another run / the live chokepoint may have set it).
        const current = (await tx.execute(sql`
          SELECT "reference_code" FROM "respondents" WHERE "id" = ${row.id} FOR UPDATE
        `)) as { rows: Array<{ reference_code: string | null }> };
        if (current.rows.length === 0) return 'missing' as const;
        if (current.rows[0].reference_code != null) return 'noop' as const;

        const code = await ReferenceCodeService.generateUnique(tx, row.createdAt.getFullYear());
        await tx.execute(sql`
          UPDATE "respondents"
          SET "reference_code" = ${code}, "updated_at" = now()
          WHERE "id" = ${row.id}
        `);
        await AuditService.logActionTx(tx, {
          actorId: null,
          action: AUDIT_ACTIONS.OPERATOR_REFERENCE_CODE_BACKFILLED,
          targetResource: AUDIT_TARGETS.RESPONDENT,
          targetId: row.id,
          details: { reference_code: code, operator_marker: 'reference_code_backfill' },
          ipAddress: operatorHost,
          userAgent: operatorInvocation,
        });
        return 'assigned' as const;
      });
      if (outcome === 'assigned') assigned++;
      else skipped++;
    } catch (err) {
      failed++;
      logger.error({
        event: 'reference_code_backfill.row_failed',
        respondentId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const verb = live ? 'assigned' : 'would-assign';
  console.log(`\nSummary (${live ? 'LIVE' : 'PREVIEW'}): ${verb}=${assigned} skipped=${skipped} failed=${failed}`);
  if (!live && assigned > 0) {
    console.log('  This was a PREVIEW. Re-run with --confirm-i-am-not-dry-running to write.\n');
  }
  return failed > 0 ? 1 : 0;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }
  const args = parseArgs(argv);

  if (args.apply) {
    process.exit(await runApply(args));
  }
  if (!args.dryRun) {
    console.error('ERROR: pass --dry-run, or --apply --confirm-i-am-not-dry-running to write.');
    process.exit(1);
  }
  process.exit(await runDryRun(args));
}

// Only invoke when executed directly via tsx (vitest sets VITEST=true).
if (!process.env.VITEST) {
  main().catch((err) => {
    logger.error({ event: 'reference_code_backfill.fatal', error: (err as Error).message });
    console.error(`FATAL: ${(err as Error).message}`);
    process.exit(1);
  });
}
