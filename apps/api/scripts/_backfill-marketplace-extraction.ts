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
 * Scope (AC3): only respondents WITH a submission carrying rawData can be
 * extracted. The 55 data_lost / no-submission opt-ins have NO answers to derive
 * profession/skills from — they are correctly LEFT (documented, not fabricated).
 * Enumerator/clerk profiles are unaffected — they queue via the live worker path.
 *
 * ── WIDENED BY STORY 13-2 R-A2 (2026-09-12) ─────────────────────────────────
 *
 * This script is no longer public-only. It is now the ONLY path by which an
 * `imported_association` respondent can receive a marketplace card: the importer
 * enqueues nothing, so opening `PIPELINE_EXCLUDED_STATUSES` creates ZERO profiles
 * without this run. See `fetchCandidates` for the predicate, and the one condition
 * the widening made necessary (`rolled_back`).
 *
 * ⛔ AGAINST PRODUCTION THIS IS A PUBLIC PUBLISH. There is no staging step between
 * the dry-run and the cards going live (13-2 R-A3), and the cohort is up to 8,278
 * people. Dry-run first, read the by-cohort breakdown, compare it against a
 * prediction measured from prod, and only then confirm.
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
  'batch-id',
  'help',
]);

const HELP_TEXT = `
Story 13-27 (AC3), widened by 13-2 R-A2 — backfill marketplace extraction for the
opt-ins no live path ever queued: the public rows the wizard bypass missed, and the
imported_association rows the importer never enqueues at all.

⛔ Against production this is a PUBLIC PUBLISH of up to 8,278 people. Dry-run first.

  --dry-run                          Preview: count + masked sample, no enqueue (mandatory first).
  --apply                            Switch to apply mode (still PREVIEW unless confirmed).
  --confirm-i-am-not-dry-running     Required with --apply to actually ENQUEUE.
  --batch-id UUID                    Scope to ONE import batch (stage the publish: a small
                                     batch first, read its live cards, then the next).
                                     Public opt-ins belong to no batch — an unscoped run
                                     picks them up.
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
  const batchIdRaw = flags['batch-id'];
  /*
   * 13-2 R-A2 review P4 — a scoping flag must fail CLOSED. A mistyped or valueless
   * --batch-id that parsed as "no batch" would widen a staged publish to EVERY
   * consenting person at once, which is the exact event staging exists to prevent.
   */
  if (batchIdRaw !== undefined && (typeof batchIdRaw !== 'string' || !UUID_RE.test(batchIdRaw))) {
    throw new Error(`--batch-id must be an import batch UUID, got: ${String(batchIdRaw)}`);
  }
  return {
    dryRun: flags['dry-run'] === true,
    apply: flags['apply'] === true,
    confirmLive: flags['confirm-i-am-not-dry-running'] === true,
    maxRows: typeof maxRowsRaw === 'string' ? Math.max(1, parseInt(maxRowsRaw, 10)) : null,
    batchId: typeof batchIdRaw === 'string' ? batchIdRaw : null,
  };
}


export interface CandidateRow {
  respondentId: string;
  submissionId: string;
  firstName: string | null;
  status: string;
  /**
   * 13-2 R-A2 — carried so the dry-run can break its count down BY COHORT. The
   * prediction this run is compared against is about the imported rows
   * specifically, and a single total cannot be checked against it.
   */
  source: string;
  createdAt: Date;
}

/**
 * Respondents who (a) consented to the marketplace, (b) have at least one submission
 * carrying rawData, and (c) do NOT already have a marketplace profile. DISTINCT ON
 * picks the most recent submission per respondent (the worker reads that
 * submission's rawData for skills/profession/experience).
 *
 * ── THE SOURCE PREDICATE — WIDENED BY 13-2 R-A2 ─────────────────────────────
 *
 * Was `r.source = 'public'`, which silently skipped every imported row. That is why
 * opening `PIPELINE_EXCLUDED_STATUSES` creates ZERO profiles on its own: the
 * importer enqueues nothing, so THIS SELECT is the only path by which an imported
 * person can ever get a card.
 *
 * It is an ALLOW-LIST, not a removal. Dropping the condition entirely would also
 * sweep in `enumerator` and `clerk` rows, whose profiles are created by the live
 * worker path — a different cohort, published as a side effect of a story about
 * association imports.
 *
 * ⚖️ NO VOUCH IS NOT AN EXCLUSION. An `imported_association` row with no
 * `metadata.association_name` is still a consenting person and still gets a card — it
 * renders WITHOUT a badge (13-58: no vouch ⇒ no badge, never no card; re-affirmed by
 * Awwal 2026-09-13). R-A2 first shipped this SELECT requiring a vouch, which withheld
 * the card over a metadata gap; that was reversed. The dry-run still COUNTS those
 * rows, so the operator knows how many cards will publish badge-less.
 *
 * ⛔ `rolled_back` is excluded explicitly. No PUBLIC row is ever rolled back — that
 * status only arises from a retracted import batch — so the condition was
 * unnecessary until the widening and is REQUIRED by it. The worker would refuse
 * those rows at its own gate anyway; what breaks without this is the OPERATOR'S
 * COUNT, and a dry-run that over-promises cannot be told apart from a real defect
 * when the comparison is made.
 */
export async function fetchCandidates(
  maxRows: number | null,
  batchId: string | null = null,
): Promise<CandidateRow[]> {
  const limitClause = maxRows ? sql`LIMIT ${maxRows}` : sql``;
  // P4 — staging by batch is INTENTIONAL scoping; `--max-rows` only ever staged by
  // insertion order, which a single new opt-in silently reshuffles.
  const batchClause = batchId ? sql`AND r.import_batch_id = ${batchId}::uuid` : sql``;
  const result = (await db.execute(sql`
    SELECT DISTINCT ON (r.id)
      r.id AS respondent_id,
      s.id AS submission_id,
      r.first_name,
      r.status,
      r.source,
      r.created_at
    FROM respondents r
    JOIN submissions s ON s.respondent_id = r.id AND s.raw_data IS NOT NULL
    LEFT JOIN marketplace_profiles mp ON mp.respondent_id = r.id
    WHERE r.consent_marketplace = true
      AND mp.id IS NULL
      AND r.status <> 'rolled_back'
      AND r.source IN ('public', 'imported_association')
      ${batchClause}
    ORDER BY r.id, s.submitted_at DESC NULLS LAST
    ${limitClause}
  `)) as {
    rows: Array<{
      respondent_id: string;
      submission_id: string;
      first_name: string | null;
      status: string;
      source: string;
      created_at: string | Date;
    }>;
  };
  return result.rows.map((r) => ({
    respondentId: r.respondent_id,
    submissionId: r.submission_id,
    firstName: r.first_name,
    status: r.status,
    source: r.source,
    createdAt: new Date(r.created_at),
  }));
}

/**
 * 13-2 R-A2 — THE NUMBERS AN OPERATOR CAN PREDICT AGAINST.
 *
 * A single total cannot be checked. The prediction this run is compared against is
 * about the IMPORTED rows specifically ("profiles created should equal imported
 * respondents who consented"), so the dry-run has to say how many of its candidates
 * are imported and — where that falls short of the cohort — why the rest were left.
 * Without the second half, a predicate that still silently drops people looks
 * identical to a correct run against a smaller cohort.
 */
export function summariseBySource(candidates: CandidateRow[]): Map<string, number> {
  const bySource = new Map<string, number>();
  for (const row of candidates) {
    bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
  }
  return bySource;
}

export interface ImportedCohortDiagnostics {
  consented: number;
  noSubmission: number;
  alreadyHasProfile: number;
  /** NOT an exclusion — consenting rows whose card will render WITHOUT a badge. */
  noVouch: number;
  rolledBack: number;
}

/**
 * Why consenting `imported_association` rows are NOT candidates.
 *
 * These are INDEPENDENT reasons measured over one cohort, not a partition — a row can
 * be both rolled back and profile-less, so they do not sum to `consented`. `noVouch`
 * is reported beside them but is NOT a reason: those rows ARE candidates, badge-less. They
 * exist to explain the gap between the cohort size and the candidate count, which is
 * the number predict-then-compare actually turns on.
 */
export async function fetchImportedCohortDiagnostics(
  batchId: string | null = null,
): Promise<ImportedCohortDiagnostics> {
  const batchClause = batchId ? sql`AND r.import_batch_id = ${batchId}::uuid` : sql``;
  const result = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE r.consent_marketplace = true) AS consented,
      count(*) FILTER (WHERE r.consent_marketplace = true AND s.id IS NULL) AS no_submission,
      count(*) FILTER (WHERE r.consent_marketplace = true AND mp.id IS NOT NULL) AS already_has_profile,
      count(*) FILTER (WHERE r.consent_marketplace = true
        AND NULLIF(btrim(r.metadata->>'association_name'), '') IS NULL) AS no_vouch,
      count(*) FILTER (WHERE r.consent_marketplace = true AND r.status = 'rolled_back') AS rolled_back
    FROM respondents r
    LEFT JOIN LATERAL (
      SELECT sub.id FROM submissions sub
      WHERE sub.respondent_id = r.id AND sub.raw_data IS NOT NULL LIMIT 1
    ) s ON true
    LEFT JOIN marketplace_profiles mp ON mp.respondent_id = r.id
    WHERE r.source = 'imported_association'
      ${batchClause}
  `)) as { rows: Array<Record<string, string | number>> };

  const row = result.rows[0] ?? {};
  const n = (k: string): number => Number(row[k] ?? 0);
  return {
    consented: n('consented'),
    noSubmission: n('no_submission'),
    alreadyHasProfile: n('already_has_profile'),
    noVouch: n('no_vouch'),
    rolledBack: n('rolled_back'),
  };
}

async function runDryRun(args: Args): Promise<number> {
  const candidates = await fetchCandidates(args.maxRows, args.batchId);
  const scope = args.batchId ? ` in batch ${args.batchId}` : ' (ALL batches + public)';
  console.log(`\n[DRY-RUN] ${candidates.length} consenting opt-in(s)${scope} with a submission and NO profile yet.`);

  console.log('\n[DRY-RUN] by cohort — PREDICT AGAINST THESE, not the total:');
  for (const [source, count] of [...summariseBySource(candidates)].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${source.padEnd(24)} ${count}`);
  }

  const diag = await fetchImportedCohortDiagnostics(args.batchId);
  console.log('\n[DRY-RUN] imported_association — why consenting rows are NOT candidates:');
  console.log(`    consented                ${diag.consented}`);
  console.log(`      - no submission row    ${diag.noSubmission}`);
  console.log(`      - already has profile  ${diag.alreadyHasProfile}`);
  console.log(`      - rolled back          ${diag.rolledBack}`);
  console.log(`    of which NO association name ${diag.noVouch}  (still candidates — cards render WITHOUT a badge)`);

  console.log('\n[DRY-RUN] would enqueue marketplace extraction for:\n');
  for (const row of candidates.slice(0, 25)) {
    console.log(
      `  respondent=${row.respondentId.slice(0, 8)}… submission=${row.submissionId.slice(0, 8)}…` +
        ` source=${row.source} status=${row.status} name=${row.firstName ?? '—'}`,
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
  const candidates = await fetchCandidates(args.maxRows, args.batchId);
  const scope = args.batchId ? ` in batch ${args.batchId}` : ' (ALL batches + public)';
  console.log(`\n[${live ? 'LIVE' : 'PREVIEW'}] ${candidates.length} candidate(s)${scope} to enqueue.`);

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
