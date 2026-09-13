/**
 * Story 13-2 R-A2 half (c) — enqueue fraud detection for imported association rows.
 *
 * ⭐ WHY THIS SCRIPT HAD TO BE WRITTEN RATHER THAN A PREDICATE WIDENED.
 *
 * The marketplace half had a create-profiles script to widen. Fraud had nothing:
 * nine `_backfill-*` scripts existed and not one queued fraud detection. The only
 * production enqueue of `queueFraudDetection` is `submission-processing.service.ts`,
 * which the importer never calls — and it is GPS-gated besides, so it would skip
 * every imported row even if it were called. Opening `PIPELINE_EXCLUDED_STATUSES`
 * therefore creates no fraud runs at all on its own. This is the missing path.
 *
 * ⛔ AND OPENING THE GATE WAS NOT ENOUGH EITHER — THE ENGINE WAS FIXED TOO.
 * Traced at R-A2: an imported row could not be SCORED, let alone enqueued. All five
 * field heuristics returned 0 (no GPS, no completion time, no enumerator history),
 * `off_hours` would have flagged all 8,222 rows on the operator's single import
 * clock, and the insert threw `invalid input syntax for type uuid: ""` because the
 * engine coerced the missing enumerator to `''` against a NOT NULL uuid column. So
 * this story also made `enumerator_id` nullable, added `import_batch_id`, split the
 * heuristic registry by provenance, and added the `roll_padding` heuristic — which
 * is the only fraud an imported roll can actually evidence.
 *
 * ── WHAT IT MEASURES ────────────────────────────────────────────────────────
 *
 * Roll padding: an association head inflating a membership roll. The importer
 * already auto-skips exact phone/NIN twins at ingest (11-2 dedup), so what this
 * looks for is what SURVIVES that — the same person re-entered under a different
 * contact, and one contact standing in for many names.
 *
 * ⚠️ Unlike the marketplace half, this publishes NOTHING. No public surface reads
 * `fraud_detections`; the output lands on super-admin and assessor review screens.
 * It is the anti-roll-padding safety net, not a publicity event.
 *
 * Mirrors the `_backfill-marketplace-extraction.ts` discipline:
 *   - PREVIEW BY DEFAULT. `--dry-run` (mandatory first) counts + samples, no enqueue.
 *   - LIVE requires the deliberately ugly `--confirm-i-am-not-dry-running` flag.
 *   - Batched, because all ten BullMQ workers run IN the API process on a 2 GB VPS;
 *     8,278 jobs shoved in at once is a self-inflicted load spike.
 *   - `--batch-id` scopes a run to ONE import batch, so the 56-row pilot can be
 *     scored and read in full before the 8,222-row batch is touched.
 *
 * Usage:
 *   tsx scripts/_backfill-fraud-detection-imports.ts --dry-run [--batch-id UUID]
 *   tsx scripts/_backfill-fraud-detection-imports.ts --apply --confirm-i-am-not-dry-running [--batch-id UUID] [--max-rows N] [--batch-size N]
 *
 * Exit codes: 0 success, 1 on bad args / any per-row enqueue failure.
 */
import os from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { queueFraudDetection, getFraudDetectionQueue } from '../src/queues/fraud-detection.queue.js';
import pino from 'pino';

const logger = pino({ name: 'fraud-detection-imports-backfill' });

export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'dry-run',
  'apply',
  'confirm-i-am-not-dry-running',
  'max-rows',
  'batch-size',
  'batch-id',
  'help',
]);

const DEFAULT_BATCH_SIZE = 250;
/** Pause between batches so the in-process workers get scheduler time. */
const BATCH_PAUSE_MS = 1000;

const HELP_TEXT = `
Story 13-2 R-A2 (half c) — enqueue fraud detection for imported association rows.

Nothing else queues fraud for an import: the only production enqueue is
submission-processing.service.ts, which the importer never calls. This is the path.

  --dry-run                          Preview: counts + masked sample, no enqueue (mandatory first).
  --apply                            Switch to apply mode (still PREVIEW unless confirmed).
  --confirm-i-am-not-dry-running     Required with --apply to actually ENQUEUE.
  --batch-id UUID                    Scope to ONE import batch (run the small pilot batch
                                     first and read its output in full).
  --max-rows N                       Cap respondents processed this run (default: all).
  --batch-size N                     Jobs per batch (default: ${DEFAULT_BATCH_SIZE}).
  --help                             Show this help.

Idempotent: selection excludes submissions that already have a fraud_detections row;
the queue de-dups on jobId 'fraud-<submissionId>'. Safe to re-run. Requires the
fraud-detection worker to be running to process the queued jobs.

This publishes nothing. Fraud results are visible only on internal review surfaces.
`;

export interface Args {
  dryRun: boolean;
  apply: boolean;
  confirmLive: boolean;
  maxRows: number | null;
  batchSize: number;
  batchId: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const batchRaw = flags['batch-size'];
  const batchIdRaw = flags['batch-id'];
  // A mistyped or valueless batch id must not silently widen the run to EVERY batch.
  if (batchIdRaw !== undefined && (typeof batchIdRaw !== 'string' || !UUID_RE.test(batchIdRaw))) {
    throw new Error(`--batch-id must be an import batch UUID, got: ${String(batchIdRaw)}`);
  }
  return {
    dryRun: flags['dry-run'] === true,
    apply: flags['apply'] === true,
    confirmLive: flags['confirm-i-am-not-dry-running'] === true,
    maxRows: typeof maxRowsRaw === 'string' ? Math.max(1, parseInt(maxRowsRaw, 10)) : null,
    batchSize: typeof batchRaw === 'string' ? Math.max(1, parseInt(batchRaw, 10)) : DEFAULT_BATCH_SIZE,
    batchId: typeof batchIdRaw === 'string' ? batchIdRaw : null,
  };
}

export interface CandidateRow {
  respondentId: string;
  submissionId: string;
  batchId: string;
  status: string;
}

/**
 * ⭐ ONE CLASSIFICATION, READ TWICE — 13-2 R-A2 review (2026-09-13).
 *
 * Every `imported_association` respondent lands in EXACTLY ONE bucket, first match
 * wins. `fetchCandidates` reads the `selectable` bucket; `fetchCohortCounts` counts
 * all of them. Because both read the same CTE, "respondents − exclusions ==
 * selectable" holds by construction.
 *
 * It did not before. The counts were a separate query whose exclusions OVERLAPPED
 * (a rolled-back row with no submission was subtracted twice), ignored
 * `import_batch_id IS NULL` (which the selection excluded), and LEFT JOINed
 * `fraud_detections` — which has no unique constraint on `submission_id` — so a
 * re-scored submission inflated `respondents`. The documented prediction formula
 * could therefore disagree with the selection, and at compare time that is
 * indistinguishable from a real defect.
 *
 * ⛔ THE SUBMISSION IS THE IMPORT SUBMISSION (`questionnaire_form_id LIKE 'import:%'`).
 * A person on an association roll can later gain a wizard registration or an
 * enumerator's capture on the same respondent row. Those are FIELD submissions,
 * scored by the live path with the field heuristics (the engine keys provenance on
 * the submission), and must not be enqueued here as if they were the roll row. The
 * previous predicate took the most recent submission with raw data, which after
 * such a merge is exactly the wrong one.
 *
 * ⛔ Scoped to `imported_association`, not to imports generally. The roll-padding
 * heuristic reasons about an association's membership roll; `imported_itf_supa` and
 * `imported_other` are different provenances whose padding risk has not been
 * measured against their data.
 */
function cohortSql(batchId: string | null): SQL {
  const batchClause = batchId ? sql`AND r.import_batch_id = ${batchId}::uuid` : sql``;
  return sql`
    WITH cohort AS (
      SELECT
        r.id AS respondent_id,
        r.import_batch_id AS batch_id,
        r.status,
        s.id AS submission_id,
        CASE
          WHEN r.status = 'rolled_back' THEN 'rolled_back'
          WHEN r.import_batch_id IS NULL THEN 'no_batch'
          WHEN s.id IS NULL THEN 'no_import_submission'
          WHEN EXISTS (SELECT 1 FROM fraud_detections fd WHERE fd.submission_id = s.id) THEN 'already_scored'
          ELSE 'selectable'
        END AS bucket
      FROM respondents r
      -- registry-read-drift-ok: selects the IMPORT submission (form id 'import:%'), not the latest non-empty one — the canonical read would pick a later field submission, which is exactly the row this script must not score
      LEFT JOIN LATERAL (
        SELECT sub.id FROM submissions sub
        WHERE sub.respondent_id = r.id
          AND sub.raw_data IS NOT NULL
          AND sub.questionnaire_form_id LIKE 'import:%'
        ORDER BY sub.submitted_at DESC NULLS LAST, sub.id
        LIMIT 1
      ) s ON true
      WHERE r.source = 'imported_association'
        ${batchClause}
    )`;
}

/**
 * Imported association respondents whose IMPORT submission has never been
 * fraud-scored — the `selectable` bucket of `cohortSql`.
 *
 * Idempotent by construction: a submission that already has a `fraud_detections`
 * row is never re-selected, and the queue de-dups on `fraud-<submissionId>`.
 */
export async function fetchCandidates(
  maxRows: number | null,
  batchId: string | null = null,
): Promise<CandidateRow[]> {
  const limitClause = maxRows ? sql`LIMIT ${maxRows}` : sql``;
  const result = (await db.execute(sql`
    ${cohortSql(batchId)}
    SELECT respondent_id, submission_id, batch_id, status
    FROM cohort
    WHERE bucket = 'selectable'
    ORDER BY respondent_id
    ${limitClause}
  `)) as {
    rows: Array<{
      respondent_id: string;
      submission_id: string;
      batch_id: string;
      status: string;
    }>;
  };
  return result.rows.map((r) => ({
    respondentId: r.respondent_id,
    submissionId: r.submission_id,
    batchId: r.batch_id,
    status: r.status,
  }));
}

export interface CohortCounts {
  batches: number;
  respondents: number;
  rolledBack: number;
  noBatch: number;
  noImportSubmission: number;
  alreadyScored: number;
  selectable: number;
}

/**
 * The numbers an operator PREDICTS AGAINST before running this. The buckets are a
 * PARTITION (see `cohortSql`), so
 *   respondents − rolledBack − noBatch − noImportSubmission − alreadyScored = selectable
 * exactly, and `selectable` equals the candidate count of an uncapped run. Expect one
 * `fraud_detections` row per enqueued job once the worker drains.
 */
export async function fetchCohortCounts(batchId: string | null = null): Promise<CohortCounts> {
  const result = (await db.execute(sql`
    ${cohortSql(batchId)}
    SELECT
      count(DISTINCT batch_id) AS batches,
      count(*) AS respondents,
      count(*) FILTER (WHERE bucket = 'rolled_back') AS rolled_back,
      count(*) FILTER (WHERE bucket = 'no_batch') AS no_batch,
      count(*) FILTER (WHERE bucket = 'no_import_submission') AS no_import_submission,
      count(*) FILTER (WHERE bucket = 'already_scored') AS already_scored,
      count(*) FILTER (WHERE bucket = 'selectable') AS selectable
    FROM cohort
  `)) as { rows: Array<Record<string, string | number>> };

  const row = result.rows[0] ?? {};
  const n = (k: string): number => Number(row[k] ?? 0);
  return {
    batches: n('batches'),
    respondents: n('respondents'),
    rolledBack: n('rolled_back'),
    noBatch: n('no_batch'),
    noImportSubmission: n('no_import_submission'),
    alreadyScored: n('already_scored'),
    selectable: n('selectable'),
  };
}

export interface EnqueueResult {
  enqueued: number;
  deduped: number;
  failed: number;
}

/**
 * Enqueue fraud detection for each candidate, in batches. In PREVIEW mode (`live`
 * false) nothing is enqueued.
 *
 * Idempotency, same shape as the marketplace backfill (13-27 review L1): on BullMQ 5
 * a duplicate `queue.add` silently returns the EXISTING job instead of throwing, so
 * the producer's return value cannot distinguish a dedup. We PROBE
 * `queue.getJob('fraud-<submissionId>')` first and count a hit as `deduped`.
 * Submissions already carrying a `fraud_detections` row never reach here at all —
 * the SQL selection excludes them.
 *
 * ⚠️ Batched with a pause on purpose. All ten BullMQ workers run IN the API process
 * on a 2 GB VPS (see the worker-model note in MEMORY.md), so this is sharing a CPU
 * with the live API. Enqueuing 8,278 jobs in one burst is a self-inflicted spike.
 */
export async function enqueueCandidates(
  candidates: CandidateRow[],
  opts: { live: boolean; batchSize: number; pauseMs?: number },
): Promise<EnqueueResult> {
  const operatorHost = os.hostname();
  const queue = opts.live ? getFraudDetectionQueue() : null;
  let enqueued = 0;
  let deduped = 0;
  let failed = 0;

  for (let i = 0; i < candidates.length; i += opts.batchSize) {
    const batch = candidates.slice(i, i + opts.batchSize);

    for (const row of batch) {
      if (!opts.live || !queue) continue;
      try {
        const existing = await queue.getJob(`fraud-${row.submissionId}`);
        if (existing) {
          deduped++;
          logger.info({
            event: 'fraud_imports_backfill.deduped',
            respondentId: row.respondentId,
            jobId: existing.id,
            operatorHost,
          });
          continue;
        }
        const jobId = await queueFraudDetection({
          submissionId: row.submissionId,
          respondentId: row.respondentId,
        });
        if (jobId) {
          enqueued++;
          logger.info({
            event: 'fraud_imports_backfill.enqueued',
            respondentId: row.respondentId,
            submissionId: row.submissionId,
            batchId: row.batchId,
            jobId,
            operatorHost,
          });
        } else {
          // Producer self-reported a dedup (see the queue's own note).
          deduped++;
        }
      } catch (err) {
        failed++;
        logger.error({
          event: 'fraud_imports_backfill.row_failed',
          respondentId: row.respondentId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const more = i + opts.batchSize < candidates.length;
    if (opts.live && more) await sleep(opts.pauseMs ?? BATCH_PAUSE_MS);
  }

  return { enqueued, deduped, failed };
}

function printCohort(counts: CohortCounts, candidateCount: number, args: Args): void {
  const scope = args.batchId ? ` — batch ${args.batchId}` : ' — ALL batches';
  console.log(`\n[COHORT] imported_association${scope} — PREDICT AGAINST THESE:`);
  console.log(`    import batches           ${counts.batches}`);
  console.log(`    respondents              ${counts.respondents}`);
  console.log(`      - rolled back          ${counts.rolledBack}`);
  console.log(`      - no import batch      ${counts.noBatch}`);
  console.log(`      - no import submission ${counts.noImportSubmission}`);
  console.log(`      - already fraud-scored ${counts.alreadyScored}`);
  console.log(`    = selectable             ${counts.selectable}`);
  console.log(
    `    candidates this run      ${candidateCount}${args.maxRows ? ` (capped by --max-rows ${args.maxRows})` : ''}`,
  );
  /*
   * The buckets are a partition of one CTE, so an uncapped mismatch means the SQL
   * was edited out of step with itself — say so loudly rather than hand the
   * operator a number that cannot reconcile.
   */
  if (!args.maxRows && candidateCount !== counts.selectable) {
    console.log(
      `\n  ⛔ RECONCILIATION FAILED: selectable ${counts.selectable} ≠ candidates ${candidateCount}. Do not confirm.`,
    );
  }
  console.log('\n  Expect one fraud_detections row per enqueued job once the worker drains, then read');
  console.log('  the distribution as CALIBRATION (R-A8) before acting on any single detection:');
  console.log('    SELECT severity, count(*) FROM fraud_detections WHERE import_batch_id IS NOT NULL GROUP BY 1;');
}

async function runDryRun(args: Args): Promise<number> {
  const candidates = await fetchCandidates(args.maxRows, args.batchId);
  const counts = await fetchCohortCounts(args.batchId);

  console.log(
    `\n[DRY-RUN] ${candidates.length} imported row(s) whose import submission has NO fraud detection yet.`,
  );
  printCohort(counts, candidates.length, args);

  console.log('\n[DRY-RUN] would enqueue fraud detection for:\n');
  for (const row of candidates.slice(0, 25)) {
    console.log(
      `  respondent=${row.respondentId.slice(0, 8)}… submission=${row.submissionId.slice(0, 8)}…` +
        ` batch=${row.batchId.slice(0, 8)}… status=${row.status}`,
    );
  }
  if (candidates.length > 25) console.log(`  … and ${candidates.length - 25} more.`);
  console.log('\n  PREVIEW only — re-run with --apply --confirm-i-am-not-dry-running to enqueue.\n');
  return 0;
}

async function runApply(args: Args): Promise<number> {
  const live = args.confirmLive;
  const candidates = await fetchCandidates(args.maxRows, args.batchId);
  const counts = await fetchCohortCounts(args.batchId);

  console.log(`\n[${live ? 'LIVE' : 'PREVIEW'}] ${candidates.length} candidate(s), batch size ${args.batchSize}.`);
  printCohort(counts, candidates.length, args);

  const { enqueued, deduped, failed } = await enqueueCandidates(candidates, {
    live,
    batchSize: args.batchSize,
  });

  console.log(
    `\nSummary (${live ? 'LIVE' : 'PREVIEW'}): enqueued=${enqueued} deduped=${deduped} failed=${failed}\n`,
  );
  if (!live) {
    console.log('  PREVIEW only — re-run with --confirm-i-am-not-dry-running to enqueue.\n');
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
    console.error('ERROR: pass --dry-run, or --apply --confirm-i-am-not-dry-running to enqueue.');
    process.exit(1);
  }
  process.exit(await runDryRun(args));
}

// Only invoke when executed directly via tsx (vitest sets VITEST=true).
if (!process.env.VITEST) {
  main().catch((err) => {
    logger.error({ event: 'fraud_imports_backfill.fatal', error: (err as Error).message });
    console.error(`FATAL: ${(err as Error).message}`);
    process.exit(1);
  });
}
