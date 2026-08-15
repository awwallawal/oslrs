/**
 * Story 13-57 AC3 — UNPROCESSABLE SUBMISSIONS, AS A STANDING SIGNAL.
 *
 * On 2026-08-04 two submissions failed to become respondents. They were found
 * on 2026-08-09, by accident, during unrelated cleanup. Nothing counted them,
 * nothing aged them, and nothing said a word — which is the entire defect;
 * a person who fills in a government form must either succeed or visibly fail.
 *
 * Pure module — no Node or browser dependencies — so the digest worker, the CLI
 * and the React bundle can all import it.
 */

/**
 * A submission is UNPROCESSABLE in one of two distinguishable ways, and the
 * distinction is the whole point of Story 13-57: before it, `processed = false`
 * meant both "queued" and "permanently dead", so the dead hid among the busy.
 */
export interface IngestionHealth {
  /**
   * DEAD — the pipeline finished with the row and recorded a REASON
   * (`processing_error IS NOT NULL`). Someone can read why and act.
   */
  dead: number;
  /**
   * STUCK — not processed, no reason ever recorded, and older than
   * `stuckAfterMinutes`. This is the pre-13-57 shape: the two 2026-08-04
   * orphans live here and always will, because nothing recorded a reason for
   * them and inventing one now would be a guess dressed as a fact.
   *
   * A fresh row still working its way through the queue is NOT stuck; the age
   * floor is what keeps this from crying about normal traffic.
   */
  stuck: number;
  /**
   * ⭐ REJECTED AS A DUPLICATE — and therefore NOT a lost citizen.
   *
   * Added by code review 2026-08-14 (H1). `findOrCreateRespondent` throws a
   * permanent error on a duplicate NIN, which lands as a terminal row carrying
   * a reason — structurally identical, to a predicate that only asks "is there
   * a reason?", to a submission whose citizen never reached the register. They
   * are OPPOSITES: the duplicate reason's own text reads *"already registered
   * on `<date>` via `<source>`"*. Folding these into `dead` would put them under
   * a digest line that says "these people are NOT on the register", which is
   * inferring IMPACT from STRUCTURE — the exact error this story had to retract
   * three times, reappearing inside the monitor built to prevent it.
   *
   * Reported, never alarmed on, and excluded from `oldestAt`.
   */
  deduplicated: number;
  /**
   * Closed out by an operator (`processing_error` prefixed `ACKNOWLEDGED:`).
   *
   * Added by code review 2026-08-14 (H2). Without a clearing path the count
   * could only ever rise and `oldestAt` only ever grow, so the first digest
   * after deploy was red and so was every digest after it — a red that can
   * never go green is a red nobody reads. Excluded from every other count.
   */
  acknowledged: number;
  /** The age floor applied to `stuck`, echoed so a reader need not guess it. */
  stuckAfterMinutes: number;
  /**
   * ISO 8601 ingest time of the oldest row that is actually a FINDING — dead or
   * stuck. Deliberately not the oldest row with a reason of any kind: a
   * two-year-old duplicate rejection would otherwise redden the digest forever
   * about a person who is on the register.
   */
  oldestAt: string | null;
  /** Whole hours since `oldestAt`; null when there is nothing to age. */
  oldestAgeHours: number | null;
}

/**
 * How long a submission may sit unprocessed before it counts as STUCK.
 *
 * The ingestion queue clears in seconds, so an hour is two orders of magnitude
 * of headroom — generous enough that a busy morning never trips it, tight
 * enough that a queue outage is visible at the next digest rather than the next
 * accident.
 */
export const INGESTION_STUCK_AFTER_MINUTES = 60;

/**
 * AC3.1 — "non-zero for more than one digest cycle is a red."
 *
 * The digest runs at 06:00 and 18:00 UTC, so surviving one cycle is 12 hours.
 * Expressed as an AGE rather than as remembered state on purpose: a stateless
 * rule cannot be wrong about history it failed to persist, and the age is the
 * thing an operator can check independently.
 *
 * ⚠️ RULED DEVIATION FROM AC3.1, STATED RATHER THAN LEFT IMPLICIT (code review
 * 2026-08-14, L1). The AC says "non-zero for MORE THAN ONE DIGEST CYCLE is a
 * red"; this rule says "the oldest is at least 12 hours old". They differ for
 * one case: a row that is already 13 hours old the first time a digest sees it
 * reads red immediately, having survived zero observed cycles. That is the
 * better answer — the row HAS been unprocessable for longer than a cycle, and
 * the AC's phrasing accidentally makes the severity depend on when the monitor
 * happened to be switched on. Honouring the AC literally would need persisted
 * per-row observation history, which is state that can be wrong about the past
 * ([[pattern-monitor-measuring-something-else]]). Deviation accepted; recorded
 * here so nobody re-derives it as a defect.
 */
export const INGESTION_RED_AFTER_HOURS = 12;
