/**
 * Story 13-57 AC3 — CLOSE OUT AN UNPROCESSABLE SUBMISSION.
 *
 * Added by code review 2026-08-14 (H2). AC3's digest counts every submission
 * that never became a respondent and reddens once the oldest has outlived a
 * digest cycle. Shipped without this script that count had no way DOWN: an
 * operator could read `processing_error`, phone the citizen, register them by
 * hand — and still get the same 🔴 twice a day forever. The two known
 * 2026-08-04 orphans are already ten days old, so the FIRST digest after deploy
 * would have been red, and so would every digest after it. A red that can never
 * go green is a red nobody reads, which is the monitor failure this whole story
 * was written to end ([[pattern-monitor-measuring-something-else]]).
 *
 * ⚠️ AN ACKNOWLEDGEMENT IS NOT A DIAGNOSIS. It prepends `ACKNOWLEDGED: <note>`
 * and keeps whatever was in the column behind it — or `(no reason was ever
 * recorded)` when nothing ever was. That is what lets residual R1's two orphans
 * be discharged WITHOUT inventing a cause for them, which R1 explicitly
 * refused to do and was right to.
 *
 * ⚠️ `scripts/` IS OUTSIDE tsconfig — a green `tsc` says NOTHING about this
 * file. It has been RUN (`--dry-run`) against the test DB, which is the only
 * evidence that counts here.
 *
 * USAGE
 *   List everything the digest is currently counting:
 *     pnpm --filter @oslsr/api exec tsx scripts/acknowledge-unprocessable-submission.ts --list
 *
 *   Rehearse (default — writes nothing):
 *     ... --id <submission-uuid> --note "registered by hand, OSL-2026-XXXXXX"
 *
 *   Commit:
 *     ... --id <submission-uuid> --note "..." --commit
 */
import { pool } from '../src/db/index.js';
import {
  acknowledgeUnprocessableSubmission,
  SQL_SUBMISSION_DEAD,
  SQL_SUBMISSION_AWAITING,
} from '../src/services/submission-terminal-state.js';
import { INGESTION_STUCK_AFTER_MINUTES } from '@oslsr/types';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string): boolean => process.argv.includes(`--${name}`);

async function list(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id, submission_uid, ingested_at, processed, processing_error,
            round(extract(epoch FROM now() - ingested_at) / 3600)::int AS age_hours
       FROM submissions
      WHERE (${SQL_SUBMISSION_DEAD})
         OR (${SQL_SUBMISSION_AWAITING}
             AND ingested_at < now() - ($1 || ' minutes')::interval)
      ORDER BY ingested_at ASC`,
    [String(INGESTION_STUCK_AFTER_MINUTES)],
  );

  if (rows.length === 0) {
    console.log('✓ Nothing unprocessable. The digest is silent, and correctly so.');
    return;
  }

  console.log(`${rows.length} submission(s) the ops digest is counting:\n`);
  for (const r of rows) {
    console.log(`  id     ${r.id}`);
    console.log(`  uid    ${r.submission_uid}`);
    console.log(`  age    ${r.age_hours}h  (ingested ${r.ingested_at.toISOString()})`);
    console.log(`  reason ${r.processing_error ?? '(none was ever recorded — STUCK)'}`);
    console.log('');
  }
  console.log(
    'Acknowledge one with:  --id <id> --note "what you did about it" --commit\n' +
      'The original reason is preserved behind the marker; nothing is destroyed.',
  );
}

async function run(): Promise<void> {
  if (has('list') || (!arg('id') && !arg('note'))) {
    await list();
    return;
  }

  const submissionId = arg('id');
  const note = arg('note');
  if (!submissionId || !note) {
    console.error('❌ Both --id and --note are required. --note is written into the column.');
    process.exitCode = 1;
    return;
  }

  const commit = has('commit');

  // Read-back BEFORE, so a dry run reports the real row rather than a guess.
  const { rows } = await pool.query(
    'SELECT id, submission_uid, processed, processing_error FROM submissions WHERE id = $1',
    [submissionId],
  );
  if (rows.length === 0) {
    console.error(`❌ No submission with id ${submissionId}.`);
    process.exitCode = 1;
    return;
  }
  const before = rows[0];
  console.log(`submission ${before.submission_uid}`);
  console.log(`  before: processed=${before.processed} error=${before.processing_error ?? 'NULL'}`);

  if (!commit) {
    console.log(
      `  DRY RUN — would write: ACKNOWLEDGED: ${note} — ` +
        `${before.processing_error ?? '(no reason was ever recorded)'}`,
    );
    console.log('  Re-run with --commit to apply.');
    return;
  }

  const result = await acknowledgeUnprocessableSubmission({ submissionId, note });
  if (!result.acknowledged) {
    console.log(`  SKIPPED (${result.skipped}) — nothing written.`);
    return;
  }

  // Read the row back. "The update returned" is not "the row changed"
  // ([[pattern-a-record-about-the-work-is-not-the-work]]).
  const { rows: after } = await pool.query(
    'SELECT processed, processing_error FROM submissions WHERE id = $1',
    [submissionId],
  );
  console.log(`  after:  processed=${after[0].processed} error=${after[0].processing_error}`);
  if (!after[0].processing_error?.startsWith('ACKNOWLEDGED:')) {
    console.error('❌ Read-back does not show the marker. Investigate before trusting this.');
    process.exitCode = 1;
    return;
  }
  console.log('✓ Acknowledged. The next digest will no longer count this row.');
}

run()
  .catch((err: unknown) => {
    console.error('❌', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
