/**
 * Story 9-26 Part B — Operator-gated data-loss marker backfill.
 *
 * One-shot script that stamps `metadata.questionnaire_data_lost = true` on the
 * wizard respondents created during the 2026-05-14 → 2026-05-19 data-loss
 * window, whose Step 4 `questionnaireResponses` (+ `gender`, `authChoice`) were
 * silently dropped by the pre-9-26 wizard handler. The dropped answers are
 * UNRECOVERABLE (request bodies were never logged). This marker is an NDPA-clean
 * record of what we know we don't have — preserving attribution for any future
 * audit, and keeping the operator action out of the silent-forensic-gap class
 * the 2026-05-13 incident exposed.
 *
 * Cohort = respondents WHERE
 *   source = 'public'
 *   AND created_at >= '2026-05-14 00:00:00+00'   (configurable via --since)
 *   AND created_at <  '<--until>'                (default: the Part A deploy
 *                                                 cutover; configurable via --until)
 *   AND (metadata->>'questionnaire_data_lost') IS DISTINCT FROM 'true'  (idempotent)
 *
 * The default `--until` is the Story 9-26 Part A deploy timestamp
 * (2026-05-20T00:00:00Z). Respondents created AFTER Part A deployed have their
 * full questionnaire data persisted to `submissions.raw_data` and MUST NOT be
 * marked — passing an --until bound makes the script idempotent + safe to run
 * after the cutover.
 *
 * Per-row audit: each update emits an `OPERATOR_BACKFILL_DATA_LOSS_MARKER`
 * audit-log entry (hash-chained via AuditService). 43 rows = 43 entries —
 * acceptable noise; preserves the forensic trail.
 *
 * Dry-run discipline: --dry-run is MANDATORY for the first invocation. The live
 * run requires the deliberately ugly --confirm-i-am-not-dry-running flag.
 *
 * Usage:
 *   tsx scripts/_backfill-wizard-questionnaire-loss.ts --help
 *   tsx scripts/_backfill-wizard-questionnaire-loss.ts --dry-run
 *   tsx scripts/_backfill-wizard-questionnaire-loss.ts --confirm-i-am-not-dry-running
 *
 * Exit codes:
 *   0 — successful run (live or dry).
 *   1 — config error or any per-row write failure during a live run.
 */
import os from 'node:os';
import { and, gte, lt, sql } from 'drizzle-orm';
import pino from 'pino';
import { db } from '../src/db/index.js';
import { respondents } from '../src/db/schema/index.js';
import type { RespondentMetadata } from '../src/db/schema/respondents.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from '../src/services/audit.service.js';

const logger = pino({ name: 'backfill-wizard-questionnaire-loss' });

// Cohort window defaults. The lower bound is the first wizard registration day;
// the upper bound is the Story 9-26 Part A deploy cutover — respondents created
// on/after this carry their full questionnaire data and must NOT be marked.
const DEFAULT_SINCE = '2026-05-14';
const DEFAULT_UNTIL = '2026-05-20'; // Part A deploy day (UTC midnight)

// Known CLI flags. parseArgs rejects anything outside this set so a typo
// (e.g. --dry-rn) cannot silently slip past the dry-run gate.
export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'dry-run',
  'confirm-i-am-not-dry-running',
  'since',
  'until',
  'max-rows',
  'help',
]);

const HELP_TEXT = `Usage: tsx scripts/_backfill-wizard-questionnaire-loss.ts [options]

Marks pre-9-26 wizard respondents (whose Step 4 answers were dropped) with
metadata.questionnaire_data_lost = true. One audit-log entry per row.

Options:
  --dry-run                         Mandatory first invocation; prints masked cohort, no writes
  --confirm-i-am-not-dry-running    Required for live run (deliberately ugly)
  --since <YYYY-MM-DD>              Lower created_at bound (default ${DEFAULT_SINCE}, UTC midnight)
  --until <YYYY-MM-DD>              Upper created_at bound, EXCLUSIVE (default ${DEFAULT_UNTIL} = Part A deploy)
  --max-rows <N>                    Safety cap (default 200)
  --help                            Show this message and exit

The --until bound is what makes this idempotent + safe post-cutover: rows
created on/after the Part A deploy already persist their questionnaire data and
are never marked.
`;

export interface Args {
  dryRun: boolean;
  confirmLive: boolean;
  since: Date;
  until: Date;
  maxRows: number;
}

function parseDateFlag(raw: unknown, label: string, fallback: string): Date {
  const value = typeof raw === 'string' ? raw : fallback;
  // `new Date('YYYY-MM-DD')` parses as UTC midnight.
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`--${label} must be a valid date (YYYY-MM-DD) — got ${String(raw)}`);
  }
  return d;
}

export function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (!KNOWN_FLAGS.has(key)) {
      throw new Error(`Unknown flag --${key}. Run with --help for the supported list.`);
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
  const maxRows = typeof maxRowsRaw === 'string' ? Number(maxRowsRaw) : 200;
  if (!Number.isFinite(maxRows) || maxRows <= 0) {
    throw new Error(`--max-rows must be a positive integer (got ${String(maxRowsRaw)})`);
  }

  return {
    dryRun: flags['dry-run'] === true,
    confirmLive: flags['confirm-i-am-not-dry-running'] === true,
    since: parseDateFlag(flags.since, 'since', DEFAULT_SINCE),
    until: parseDateFlag(flags.until, 'until', DEFAULT_UNTIL),
    maxRows,
  };
}

/** Mask a respondent id for dry-run output (first 8 chars + ellipsis). */
export function maskId(id: string): string {
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

interface RespondentRow {
  id: string;
  source: string;
  createdAt: Date;
  metadata: RespondentMetadata | null;
}

/**
 * Build (but do not execute) the backfill cohort query: pre-Part-A public
 * (wizard) respondents inside the loss window that aren't already marked.
 * Exported so a unit test can lock the window + idempotency predicates via
 * `.toSQL()` without a DB connection (Story 9-26 Part H / M2 — the cohort SQL
 * decides which rows get stamped and must not silently drift).
 */
export function buildCohortQuery(args: Args) {
  return db
    .select({
      id: respondents.id,
      source: respondents.source,
      createdAt: respondents.createdAt,
      metadata: respondents.metadata,
    })
    .from(respondents)
    .where(
      and(
        sql`${respondents.source} = 'public'`,
        gte(respondents.createdAt, args.since),
        lt(respondents.createdAt, args.until),
        // Idempotency: skip rows already marked.
        sql`(${respondents.metadata}->>'questionnaire_data_lost') IS DISTINCT FROM 'true'`,
      ),
    )
    .orderBy(respondents.createdAt)
    .limit(args.maxRows);
}

async function selectCohort(args: Args): Promise<RespondentRow[]> {
  return buildCohortQuery(args);
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const args = parseArgs(argv);

  if (!args.dryRun && !args.confirmLive) {
    logger.error({ event: 'backfill_loss.missing_confirm' });
    console.error(
      'ERROR: must pass either --dry-run (mandatory first) or --confirm-i-am-not-dry-running (live).',
    );
    process.exit(1);
  }

  const cohort = await selectCohort(args);
  logger.info({
    event: 'backfill_loss.cohort_selected',
    count: cohort.length,
    dryRun: args.dryRun,
    since: args.since.toISOString(),
    until: args.until.toISOString(),
  });

  if (cohort.length === 0) {
    console.log('Cohort is empty — no unmarked pre-9-26 wizard respondents in the window. Exiting.');
    process.exit(0);
  }

  // No silent caps (Story 9-26 Part H / L1): a cohort that exactly fills the
  // limit may have more unmarked rows beyond it. Warn rather than letting the
  // operator assume every lost respondent was marked.
  if (cohort.length === args.maxRows) {
    console.warn(
      `WARNING: cohort hit the --max-rows cap (${args.maxRows}). There may be MORE ` +
        `unmarked respondents beyond this limit — re-run with a higher --max-rows to mark them.`,
    );
    logger.warn({ event: 'backfill_loss.cap_hit', maxRows: args.maxRows });
  }

  const lostAt = new Date().toISOString();

  if (args.dryRun) {
    console.log(`\n[DRY-RUN] Would mark ${cohort.length} respondent(s) as questionnaire_data_lost:\n`);
    for (const row of cohort) {
      console.log(`  ${maskId(row.id).padEnd(12)} source=${row.source.padEnd(10)} created=${row.createdAt.toISOString()}`);
    }
    console.log(
      `\n[DRY-RUN] No rows written. To run live, re-invoke with --confirm-i-am-not-dry-running.\n`,
    );
    process.exit(0);
  }

  let written = 0;
  let failed = 0;
  const operatorHost = os.hostname();
  const operatorInvocation = 'tsx scripts/_backfill-wizard-questionnaire-loss.ts';

  for (const row of cohort) {
    const newMetadata: RespondentMetadata = {
      ...(row.metadata ?? {}),
      questionnaire_data_lost: true,
      lost_at: lostAt,
      recovery_email_eligible: false,
    };

    try {
      // Marker update + forensic audit in ONE transaction, using the AWAITED
      // `logActionTx` (not the fire-and-forget `logAction`). Two reasons:
      //   1. Atomicity — the metadata marker and its audit row commit together;
      //      we never end up with a marked row whose audit entry is missing.
      //   2. Flush guarantee — `logAction` returns void and runs its hash-chain
      //      transaction detached, so the tight loop + immediate `process.exit`
      //      at the end of main() could terminate Node before those detached
      //      writes flush, silently losing the audit trail the script exists to
      //      produce. Awaiting `logActionTx` inside the per-row transaction
      //      closes that race.
      await db.transaction(async (tx) => {
        await tx
          .update(respondents)
          .set({ metadata: newMetadata, updatedAt: new Date() })
          .where(sql`${respondents.id} = ${row.id}`);

        await AuditService.logActionTx(tx, {
          actorId: null,
          action: AUDIT_ACTIONS.OPERATOR_BACKFILL_DATA_LOSS_MARKER,
          targetResource: AUDIT_TARGETS.RESPONDENT,
          targetId: row.id,
          details: {
            marker: 'questionnaire_data_lost',
            lost_at: lostAt,
            source: row.source,
            created_at: row.createdAt.toISOString(),
          },
          ipAddress: operatorHost,
          userAgent: operatorInvocation,
        });
      });

      written++;
      logger.info({ event: 'backfill_loss.marked', respondentId: row.id });
    } catch (err) {
      failed++;
      logger.error({
        event: 'backfill_loss.write_failed',
        respondentId: row.id,
        error: (err as Error).message,
      });
    }
  }

  console.log(`\nSummary: marked=${written} failed=${failed} total=${cohort.length}\n`);
  logger.info({ event: 'backfill_loss.summary', written, failed, total: cohort.length });

  process.exit(failed > 0 ? 1 : 0);
}

// Only invoke main() under direct tsx execution; skip during vitest so the test
// file can import pure functions without a DB connection.
if (!process.env.VITEST) {
  main().catch((err) => {
    logger.error({ event: 'backfill_loss.fatal', error: (err as Error).message });
    process.exit(1);
  });
}
