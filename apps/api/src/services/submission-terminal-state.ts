/**
 * Story 13-57 AC2 — A SUBMISSION THAT CANNOT BECOME A RESPONDENT MUST SCREAM.
 *
 * ── The three states, and why `processed` alone could not carry them ────────
 * `submissions.processed` is a boolean, and before this story it meant two
 * completely different things at once:
 *
 *     processed = false   →  "queued, your turn is coming"
 *                        AND "permanently dead, nothing will ever touch this again"
 *
 * That is why two dead rows sat among healthy ones on production from
 * 2026-08-04 to 2026-08-09 and were found by accident during unrelated cleanup.
 * Nothing was broken-looking; they looked *busy*.
 *
 * The discriminator is `processing_error IS NOT NULL`:
 *
 * | state      | processed | processed_at | processing_error |
 * |------------|-----------|--------------|------------------|
 * | queued     | false     | NULL         | NULL             |
 * | processed  | true      | set          | NULL             |
 * | **dead**   | **true**  | **set**      | **set**          |
 *
 * `processed = true` therefore means "the pipeline is FINISHED with this row",
 * not "it succeeded".
 *
 * ── Why this encoding and not a new column ─────────────────────────────────
 * It is not invented here: the **webhook** ingestion path has written exactly
 * this shape since Story 3.7 (`webhook-ingestion.worker.ts`), three surfaces
 * already READ it — `form.controller.getSubmissionStatuses` (the field
 * officer's own status poll), `supervisor.controller.getPendingAlerts`, and the
 * web `sync-manager`, which keys "stop retrying this offline item" on
 * `processed` — and `submissions.processing_error` already existed, `text`,
 * nullable, NULL on all 284 production rows. A third boolean or a status enum
 * would have forked the two ingest channels rather than bringing the human one
 * up to parity with the webhook one. This module is the shared writer so the
 * shape cannot drift between them again.
 *
 * ⚠️ THIS DOES NOT RETROSPECTIVELY LABEL THE TWO 2026-08-04 ROWS. They carry no
 * reason and never will — nothing recorded one. They are `processed = false`
 * with a NULL error, and the digest counts them as STUCK rather than DEAD
 * (`operations.service.getIngestionHealth`). Inventing a reason for them would
 * be the same class of error as the impact claim this story had to retract.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { submissions } from '../db/schema/index.js';
import pino from 'pino';

const logger = pino({ name: 'submission-terminal-state' });

/**
 * AC2.2 — the stable event name. Grep prod for this; it is the signal that
 * fires the instant a citizen's submission stops being recoverable, which is
 * the moment the 2026-08-04 pair produced nothing at all.
 */
export const SUBMISSION_WRITE_FAILED_EVENT = 'submission.respondent_write_failed';

/**
 * ⭐ THE STATE PREDICATES, DEFINED ONCE — because the last time they were not,
 * a failure counter could not count failures.
 *
 * `supervisor.controller.getPendingAlerts` had hand-written
 * `processing_error IS NOT NULL AND processed = true`, which structurally
 * excluded every row this story is about (they are `processed = false`). It
 * would have kept reading zero even after the column started being written
 * ([[pattern-monitor-measuring-something-else]]).
 *
 * ⚠️ THE POINT IS THAT CONSUMERS BIND TO THESE, NOT COPY THEM. A census that
 * counts SITES rather than CALLERS is how a "9/9 green" guard sat over a real
 * bypass ([[pattern-census-counts-sites-not-callers]]) — so both the operator
 * counter (drizzle, via `sql.raw`) and the ops digest (raw `pool.query`) build
 * their filters from these exact strings.
 *
 * ⚠️ THE COLUMN NAMES ARE DERIVED, NOT TYPED (code review 2026-08-14, M3).
 * They used to be hand-written string literals, which is the same defect one
 * level down: this module preaches "bind to the definition", then bound to a
 * copy of the schema that `tsc` cannot see. Rename `submissions.processing_error`
 * and a literal would keep compiling green while both counters broke at
 * runtime. Reading the names off the drizzle columns makes the rename
 * propagate, and a deleted column a compile error.
 */
const COL_PROCESSED = submissions.processed.name;
const COL_ERROR = submissions.processingError.name;

/**
 * ⭐ THE ACKNOWLEDGEMENT PREFIX — the clearing path, and why there has to be one
 * (code review 2026-08-14, H2).
 *
 * Without it, DEAD had no upper bound in time and no resolution state at all:
 * a row that acquired a reason counted forever, `oldestAt` only ever grew, and
 * the two 2026-08-04 orphans (already ten days old at ship time) put the digest
 * at 🔴 on its FIRST tick and every tick after it. An operator who read
 * `processing_error`, understood it, and acted could not make the number fall.
 * A red that can never go green is a red nobody reads — which is the exact
 * monitor failure this story was written to end
 * ([[pattern-monitor-measuring-something-else]]).
 *
 * ⚠️ AN ACKNOWLEDGEMENT IS A STATEMENT ABOUT THE OPERATOR, NOT A DIAGNOSIS.
 * It prepends; it never overwrites. The original reason (or its absence) stays
 * readable in the same column, so acknowledging the two 2026-08-04 rows discharges
 * R1's nag WITHOUT inventing a cause for them — which is precisely what R1
 * refused to do, and rightly.
 */
export const ACKNOWLEDGED_PREFIX = 'ACKNOWLEDGED:';

/**
 * ⭐ REJECTED-AS-DUPLICATE IS NOT A LOST CITIZEN (code review 2026-08-14, H1).
 *
 * `findOrCreateRespondent` throws `PermanentProcessingError` on a duplicate NIN
 * (`NIN_DUPLICATE:` / `NIN_DUPLICATE_STAFF:`), and that lands here as a terminal
 * row with a reason — indistinguishable, to a predicate that only asks "is there
 * a reason?", from a submission whose citizen never made it onto the register.
 *
 * They are opposites. The duplicate reason's own text says *"This individual was
 * already registered on `<date>` via `<source>`"*: the person IS on the register,
 * and the pipeline refusing to mint them a second record is the pipeline WORKING.
 * Counting those under a digest line that reads "these people are NOT on the
 * register" would be inferring IMPACT from STRUCTURE — the error this story had
 * to retract three separate times, reappearing inside the monitor built to stop
 * it. On prod today it is invisible (0 of 284 rows carry any reason); after the
 * jingle it would be the bulk of the count.
 */
export const DUPLICATE_REASON_PREFIX = 'NIN_DUPLICATE';

/**
 * TERMINALLY DEAD, AND THE PERSON IS NOT ON THE REGISTER: a reason was recorded,
 * it is not a duplicate rejection, and no operator has acknowledged it.
 *
 * DEAD, DEDUPLICATED and AWAITING are mutually exclusive by construction, so a
 * caller may sum them without double-counting.
 */
export const SQL_SUBMISSION_DEAD =
  `${COL_ERROR} IS NOT NULL` +
  ` AND ${COL_ERROR} NOT LIKE '${DUPLICATE_REASON_PREFIX}%'` +
  ` AND ${COL_ERROR} NOT LIKE '${ACKNOWLEDGED_PREFIX}%'`;

/** Refused because the NIN was already registered — the person IS on the register. */
export const SQL_SUBMISSION_DEDUPLICATED = `${COL_ERROR} LIKE '${DUPLICATE_REASON_PREFIX}%'`;

/** An operator has seen this row and closed it out. Never alarms again. */
export const SQL_SUBMISSION_ACKNOWLEDGED = `${COL_ERROR} LIKE '${ACKNOWLEDGED_PREFIX}%'`;

/** The submission is queued: not processed, and no reason was ever recorded. */
export const SQL_SUBMISSION_AWAITING = `${COL_PROCESSED} = false AND ${COL_ERROR} IS NULL`;

/**
 * Carries a reason of ANY kind — dead, deduplicated or acknowledged.
 *
 * This is what `supervisor.controller` counts as `failedCount`: a supervisor's
 * alert list is about "the pipeline finished with this and it did not become a
 * respondent", which is true of all three. The digest is the surface that has
 * to tell them apart, because it is the one that makes a claim about PEOPLE.
 */
export const SQL_SUBMISSION_HAS_REASON = `${COL_ERROR} IS NOT NULL`;

/**
 * SQLSTATE classes a retry can never fix, because the payload itself is what
 * the database refused.
 *
 * ⭐ THIS IS THE OTHER HALF OF THE 2026-08-04 MECHANISM, and the half that is
 * easy to miss. `runProcessing` only recorded a reason for
 * `PermanentProcessingError`; ANY other throw was re-thrown as transient, so
 * BullMQ retried it three times and then gave up — leaving the submission at
 * `processed = false` with no reason, forever. A CHECK-constraint violation was
 * being treated as a temporary blip. It is not: `+234 08120004038` will fail
 * that constraint on the first attempt and the ten-thousandth.
 *
 * ⚠️ DELIBERATELY EXCLUDED:
 *   - `23505` unique_violation — already handled upstream (the reference-code
 *     re-mint retry, and NIN duplicates which throw PermanentProcessingError
 *     with a reason a human needs to read).
 *   - `23503` foreign_key_violation — genuinely CAN be transient here; Story
 *     13-30 chased a real delete-order race that a bounded retry resolves.
 *     Retrying is the safe default for that one.
 */
const NON_RETRYABLE_SQLSTATES = new Set([
  '23514', // check_violation           — e.g. chk_respondents_phone_number_e164
  '23502', // not_null_violation
  '22P02', // invalid_text_representation — the 22P02 class behind the 13-61 500s
  '22001', // string_data_right_truncation
  '22007', // invalid_datetime_format
  '22008', // datetime_field_overflow
]);

/** True when the error is a Postgres rejection of the DATA, not of the moment. */
export function isNonRetryablePostgresError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && NON_RETRYABLE_SQLSTATES.has(code);
}

/** The constraint Postgres named, when it named one — so the reason is actionable. */
export function constraintOf(error: unknown): string | null {
  if (error === null || typeof error !== 'object') return null;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' && constraint.length > 0 ? constraint : null;
}

export interface MarkUnprocessableArgs {
  submissionId: string;
  /** Written verbatim to `submissions.processing_error`. */
  reason: string;
  /** The rejecting constraint, when the database named one (AC2.2). */
  constraint?: string | null;
  /** How the row died — distinguishes a classified failure from an exhausted queue. */
  cause: 'permanent_error' | 'non_retryable_db_error' | 'retries_exhausted';
  submissionUid?: string;
}

/**
 * Move a submission to the terminal DEAD state and say so at ERROR level.
 *
 * Awaited, never fire-and-forget: the whole point is that the row and the
 * signal both exist before the worker moves on. A failure to RECORD a failure
 * is the shape this story was written to end.
 */
export async function markSubmissionUnprocessable(args: MarkUnprocessableArgs): Promise<void> {
  const { submissionId, reason, constraint = null, cause, submissionUid } = args;

  await db
    .update(submissions)
    .set({
      // "The pipeline is finished with this row" — NOT "it succeeded". See the
      // state table above; `processing_error` is what tells the two apart.
      processed: true,
      processedAt: new Date(),
      processingError: reason,
      updatedAt: new Date(),
    })
    .where(eq(submissions.id, submissionId));

  logger.error(
    {
      event: SUBMISSION_WRITE_FAILED_EVENT,
      submissionId,
      submissionUid: submissionUid ?? null,
      cause,
      constraint,
      reason,
    },
    'A submission could not become a respondent and has been marked terminal. ' +
      'The person who filled this form is NOT on the register — check the ops digest ' +
      'for the count and the age of the oldest (Story 13-57 AC3).',
  );
}

/** The stable event name for a close-out, so the audit trail has one word for it. */
export const SUBMISSION_ACKNOWLEDGED_EVENT = 'submission.unprocessable_acknowledged';

export interface AcknowledgeResult {
  /** False when the row does not exist, or was already acknowledged. */
  acknowledged: boolean;
  /** What `processing_error` now holds — empty when nothing was written. */
  reason: string;
  /** Why nothing was written, when nothing was. */
  skipped?: 'not_found' | 'already_acknowledged';
}

/**
 * ⭐ CLOSE OUT AN UNPROCESSABLE SUBMISSION (code review 2026-08-14, H2).
 *
 * The AC3 digest counts every unprocessable row and ages the oldest. Without a
 * way to say "seen, dealt with", that count could only ever rise: an operator
 * who read the reason, contacted the citizen and registered them by hand still
 * watched the same 🔴 arrive twice a day forever. This is the exit.
 *
 * ⚠️ IT PREPENDS, IT DOES NOT OVERWRITE. The original reason stays in the same
 * column behind the marker, so nothing is destroyed and the row can still be
 * read by a person a month later. A STUCK row — no reason, and none was ever
 * recorded — gets `ACKNOWLEDGED: <note> — (no reason was ever recorded)`, which
 * says exactly what is true and invents no cause for it. That is what lets R1's
 * two 2026-08-04 orphans be discharged without repeating the class of error
 * this story had to retract three times.
 *
 * Returns whether it wrote, so a caller can report a real number rather than
 * assuming ([[pattern-test-that-passes-over-a-hole]]).
 */
export async function acknowledgeUnprocessableSubmission(args: {
  submissionId: string;
  /** Free text: what the operator did about it. Written into the column. */
  note: string;
  actorId?: string;
}): Promise<AcknowledgeResult> {
  const { submissionId, note, actorId } = args;

  const row = await db.query.submissions.findFirst({
    where: eq(submissions.id, submissionId),
    columns: { id: true, processingError: true, submissionUid: true },
  });
  if (!row) return { acknowledged: false, reason: '', skipped: 'not_found' };
  if (row.processingError?.startsWith(ACKNOWLEDGED_PREFIX)) {
    return { acknowledged: false, reason: row.processingError, skipped: 'already_acknowledged' };
  }

  const original = row.processingError ?? '(no reason was ever recorded)';
  const reason = `${ACKNOWLEDGED_PREFIX} ${note} — ${original}`;

  await db
    .update(submissions)
    .set({
      // Terminal in both senses now: the pipeline is finished with it AND a
      // human has closed it. `processed` is set so a STUCK row also stops
      // looking queued — the state it was wrongly in for five days.
      processed: true,
      processedAt: new Date(),
      processingError: reason,
      updatedAt: new Date(),
    })
    .where(eq(submissions.id, submissionId));

  logger.warn(
    {
      event: SUBMISSION_ACKNOWLEDGED_EVENT,
      submissionId,
      submissionUid: row.submissionUid,
      actorId: actorId ?? null,
      note,
      originalReason: row.processingError,
    },
    'An unprocessable submission was acknowledged by an operator and will no longer ' +
      'be counted by the ops digest. The original reason is preserved behind the marker.',
  );

  return { acknowledged: true, reason };
}
