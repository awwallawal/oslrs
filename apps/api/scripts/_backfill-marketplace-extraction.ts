/**
 * Story 13-27 (AC3) — idempotent backfill of the marketplace profiles that were
 * NEVER extracted for the public channel (124 public opt-ins → 0 profiles).
 *
 * Root cause (AC1): the public wizard writes its submission as `processed:true`
 * and bypasses `SubmissionProcessingService.processSubmission`, where
 * `queueMarketplaceExtraction` lived — so no public registration ever queued a
 * marketplace profile. AC1 fixes the go-forward path (the shared
 * `runPostSubmissionSideEffects` entrypoint); this script retroactively queues
 * extraction for the REAL public opt-ins who missed it (69 today).
 *
 * It ENQUEUES onto the SAME marketplace-extraction queue the live path uses, so
 * the SAME worker does the SAME extraction (single source of truth — no drift).
 * Idempotent by construction:
 *   - selection EXCLUDES respondents who already have a marketplace_profiles row
 *     (AC3 "skips those that already have a profile"),
 *   - the worker UPSERTs on respondent_id + re-checks consent,
 *   - the queue de-dups on jobId `marketplace-<respondentId>`.
 * Re-running never creates a duplicate. Requires the marketplace worker to be
 * running to actually process the queued jobs; verify with:
 *   SELECT count(*) FROM marketplace_profiles;
 *
 * Scope (AC3): only PUBLIC respondents WITH a submission carrying rawData can be
 * extracted. The 55 data_lost / no-submission opt-ins have NO answers to derive
 * profession/skills from — they are correctly LEFT (documented, not fabricated).
 * Enumerator/clerk profiles are unaffected — they queue via the live worker path.
 *
 * Mirrors the `_backfill-registration-autosends.ts` discipline:
 *   - PREVIEW BY DEFAULT. `--dry-run` (mandatory first) counts + samples, no enqueue.
 *   - LIVE requires the deliberately ugly `--confirm-i-am-not-dry-running` flag.
 *
 * Usage:
 *   tsx scripts/_backfill-marketplace-extraction.ts --dry-run
 *   tsx scripts/_backfill-marketplace-extraction.ts --apply --confirm-i-am-not-dry-running [--max-rows N]
 *
 * Exit codes: 0 success, 1 on bad args / any per-row enqueue failure.
 */
import os from 'node:os';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import {
  queueMarketplaceExtraction,
  getMarketplaceExtractionQueue,
  marketplaceExtractionJobId,
} from '../src/queues/marketplace-extraction.queue.js';
import pino from 'pino';

const logger = pino({ name: 'marketplace-extraction-backfill' });

export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'dry-run',
  'apply',
  'confirm-i-am-not-dry-running',
  'max-rows',
  'help',
]);

const HELP_TEXT = `
Story 13-27 (AC3) — backfill marketplace extraction for the public opt-ins the
wizard bypass never queued (124 opted in → 0 public profiles; 69 extractable).

  --dry-run                          Preview: count + masked sample, no enqueue (mandatory first).
  --apply                            Switch to apply mode (still PREVIEW unless confirmed).
  --confirm-i-am-not-dry-running     Required with --apply to actually ENQUEUE.
  --max-rows N                       Cap respondents processed this run (default: all).
  --help                             Show this help.

Idempotent: selection excludes respondents that already have a profile; the worker
UPSERTs on respondent_id + re-checks consent; the queue de-dups on jobId. Safe to
re-run. Requires the marketplace-extraction worker to be running to process jobs.

Examples:
  tsx scripts/_backfill-marketplace-extraction.ts --dry-run
  tsx scripts/_backfill-marketplace-extraction.ts --apply --confirm-i-am-not-dry-running
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

export interface CandidateRow {
  respondentId: string;
  submissionId: string;
  firstName: string | null;
  status: string;
  createdAt: Date;
}

/**
 * Public respondents who (a) consented to the marketplace, (b) have at least one
 * submission carrying rawData, and (c) do NOT already have a marketplace profile.
 * DISTINCT ON picks the most recent submission per respondent (the worker reads
 * that submission's rawData for skills/profession/experience).
 */
export async function fetchCandidates(maxRows: number | null): Promise<CandidateRow[]> {
  const limitClause = maxRows ? sql`LIMIT ${maxRows}` : sql``;
  const result = (await db.execute(sql`
    SELECT DISTINCT ON (r.id)
      r.id AS respondent_id,
      s.id AS submission_id,
      r.first_name,
      r.status,
      r.created_at
    FROM respondents r
    JOIN submissions s ON s.respondent_id = r.id AND s.raw_data IS NOT NULL
    LEFT JOIN marketplace_profiles mp ON mp.respondent_id = r.id
    WHERE r.consent_marketplace = true
      AND r.source = 'public'
      AND mp.id IS NULL
    ORDER BY r.id, s.submitted_at DESC NULLS LAST
    ${limitClause}
  `)) as {
    rows: Array<{
      respondent_id: string;
      submission_id: string;
      first_name: string | null;
      status: string;
      created_at: string | Date;
    }>;
  };
  return result.rows.map((r) => ({
    respondentId: r.respondent_id,
    submissionId: r.submission_id,
    firstName: r.first_name,
    status: r.status,
    createdAt: new Date(r.created_at),
  }));
}

async function runDryRun(args: Args): Promise<number> {
  const candidates = await fetchCandidates(args.maxRows);
  console.log(`\n[DRY-RUN] ${candidates.length} public opt-in(s) with a submission and NO profile yet.`);
  console.log('[DRY-RUN] would enqueue marketplace extraction for:\n');
  for (const row of candidates.slice(0, 25)) {
    console.log(
      `  respondent=${row.respondentId.slice(0, 8)}… submission=${row.submissionId.slice(0, 8)}…` +
        ` status=${row.status} name=${row.firstName ?? '—'}`,
    );
  }
  if (candidates.length > 25) console.log(`  … and ${candidates.length - 25} more.`);
  console.log('\n  PREVIEW only — re-run with --apply --confirm-i-am-not-dry-running to enqueue.\n');
  return 0;
}

export interface EnqueueResult {
  enqueued: number;
  deduped: number;
  failed: number;
}

/**
 * Enqueue marketplace extraction for each candidate. In PREVIEW mode (`live`
 * false) nothing is enqueued.
 *
 * Idempotency (Story 13-27 review L1): on BullMQ 5 a duplicate `queue.add`
 * silently returns the EXISTING job rather than throwing, so we cannot infer a
 * dedup from the producer's return value. We instead PROBE `queue.getJob(jobId)`
 * up-front: if a job already exists for this respondent (an in-flight or recently
 * retained duplicate — e.g. the operator double-ran before the worker drained),
 * we count it as `deduped` and skip re-adding. Respondents whose profile already
 * exists never reach here at all (the SQL selection excludes them); the worker's
 * UPSERT on respondent_id is the final idempotency backstop.
 */
export async function enqueueCandidates(
  candidates: CandidateRow[],
  opts: { live: boolean },
): Promise<EnqueueResult> {
  const operatorHost = os.hostname();
  const queue = opts.live ? getMarketplaceExtractionQueue() : null;
  let enqueued = 0;
  let deduped = 0;
  let failed = 0;

  for (const row of candidates) {
    if (!opts.live || !queue) continue;
    try {
      // Probe for an existing in-flight/retained job for this respondent.
      const existing = await queue.getJob(marketplaceExtractionJobId(row.respondentId));
      if (existing) {
        deduped++;
        logger.info({
          event: 'marketplace_extraction_backfill.deduped',
          respondentId: row.respondentId,
          jobId: existing.id,
          operatorHost,
        });
        continue;
      }
      const jobId = await queueMarketplaceExtraction({
        respondentId: row.respondentId,
        submissionId: row.submissionId,
      });
      if (jobId) {
        enqueued++;
        logger.info({
          event: 'marketplace_extraction_backfill.enqueued',
          respondentId: row.respondentId,
          submissionId: row.submissionId,
          jobId,
          operatorHost,
        });
      } else {
        // Legacy/rare: producer reported a dedup itself (see queue note).
        deduped++;
      }
    } catch (err) {
      failed++;
      logger.error({
        event: 'marketplace_extraction_backfill.row_failed',
        respondentId: row.respondentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { enqueued, deduped, failed };
}

async function runApply(args: Args): Promise<number> {
  const live = args.confirmLive;
  const candidates = await fetchCandidates(args.maxRows);
  console.log(`\n[${live ? 'LIVE' : 'PREVIEW'}] ${candidates.length} candidate(s) to enqueue.`);

  const { enqueued, deduped, failed } = await enqueueCandidates(candidates, { live });

  console.log(
    `\nSummary (${live ? 'LIVE' : 'PREVIEW'}): enqueued=${enqueued} deduped=${deduped} failed=${failed}\n`,
  );
  if (live) {
    console.log('  Verify once the worker drains: SELECT count(*) FROM marketplace_profiles;\n');
  } else {
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
    logger.error({ event: 'marketplace_extraction_backfill.fatal', error: (err as Error).message });
    console.error(`FATAL: ${(err as Error).message}`);
    process.exit(1);
  });
}
