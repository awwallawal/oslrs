/**
 * Story 13-2 R-A2 review P1 — record provenance on the two association batches that
 * predate `import_batches.provenance_stats`.
 *
 * Thin I/O wrapper over `src/lib/import-provenance-backfill.ts` (type-checked + tested
 * there). Writes NO personal data — only row counts and reason tallies.
 *
 *   - PREVIEW BY DEFAULT. `--dry-run` predicts and writes nothing.
 *   - WRITES only with `--apply --confirm-i-am-not-dry-running`.
 *   - `--dry-run` and `--apply` together are REFUSED.
 *   - Never overwrites: a batch that already carries a record is skipped.
 *   - Refuses a record that does not reconcile with the LIVE batch (e.g. `cleanRows`
 *     ≠ the batch's parsed rows) — that means this is not the database the numbers
 *     were reconciled against.
 *
 * Usage:
 *   tsx scripts/_backfill-import-provenance-stats.ts --dry-run
 *   tsx scripts/_backfill-import-provenance-stats.ts --apply --confirm-i-am-not-dry-running
 *
 * Exit codes: 0 success, 1 on bad args / a missing batch / a reconciliation problem.
 */
import pino from 'pino';
import { db, pool } from '../src/db/index.js';
import {
  predictProvenanceBackfill,
  applyProvenanceBackfill,
  type ProvenanceBackfillPrediction,
} from '../src/lib/import-provenance-backfill.js';

const logger = pino({ name: 'import-provenance-backfill' });

const HELP_TEXT = `
Story 13-2 R-A2 review P1 — write the reconciled provenance record (raw → merged →
held → clean) onto the two live association batches. Counts only, no personal data.

  --dry-run                          Predict only, no writes (default).
  --apply                            Switch to apply mode (still refuses unless confirmed).
  --confirm-i-am-not-dry-running     Required with --apply to actually WRITE.
  --help                             Show this help.
`;

function report(rows: ProvenanceBackfillPrediction[]): void {
  for (const p of rows) {
    console.log(
      '  ' +
        JSON.stringify({
          batch: p.label,
          batchId: p.batchId,
          exists: p.batchExists,
          rowsParsed: p.rowsParsed,
          alreadyRecorded: p.alreadyRecorded,
          willWrite: p.willWrite,
          problems: p.problems,
        }),
    );
  }
}

/** 1 when any batch is missing or does not reconcile — a wrong database, stop. */
function blockingCode(rows: ProvenanceBackfillPrediction[]): number {
  return rows.some((p) => !p.batchExists || p.problems.length > 0) ? 1 : 0;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }
  const known = new Set(['--dry-run', '--apply', '--confirm-i-am-not-dry-running', '--help']);
  const unknown = argv.filter((a) => !known.has(a));
  if (unknown.length > 0) {
    console.error(`ERROR: unknown argument(s): ${unknown.join(', ')}`);
    process.exit(1);
  }
  const dryRun = argv.includes('--dry-run');
  const apply = argv.includes('--apply');
  const confirmed = argv.includes('--confirm-i-am-not-dry-running');

  if (apply && dryRun) {
    console.error('ERROR: --dry-run and --apply are mutually exclusive. Pass exactly one.');
    await pool.end();
    process.exit(1);
  }

  let code: number;
  if (apply) {
    if (!confirmed) {
      console.error('ERROR: --apply requires --confirm-i-am-not-dry-running to write.');
      code = 1;
    } else {
      const outcomes = await applyProvenanceBackfill(db);
      console.log('\nRESULT:');
      report(outcomes);
      for (const o of outcomes) console.log(`  ${o.label}: ${o.written ? '✓ written' : '· not written'}`);
      code = blockingCode(outcomes);
    }
  } else if (dryRun) {
    const predictions = await predictProvenanceBackfill(db);
    console.log('\nPREDICTION (no writes performed):');
    report(predictions);
    code = blockingCode(predictions);
    if (code === 0) console.log('\nRe-run with --apply --confirm-i-am-not-dry-running to write.\n');
    else console.error('\n⛔ A batch is missing or does not reconcile — this is not the database the figures were reconciled against. Do not apply.\n');
  } else {
    console.error('ERROR: pass --dry-run, or --apply --confirm-i-am-not-dry-running to write.');
    code = 1;
  }

  await pool.end();
  process.exit(code);
}

// Only invoke when executed directly via tsx (vitest sets VITEST=true).
if (!process.env.VITEST) {
  main().catch(async (err) => {
    logger.error({ event: 'import_provenance_backfill.fatal', error: (err as Error).message });
    console.error(`FATAL: ${(err as Error).message}`);
    await pool.end().catch(() => {});
    process.exit(1);
  });
}
