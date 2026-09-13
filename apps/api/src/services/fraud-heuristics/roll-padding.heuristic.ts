/**
 * Roll-Padding Heuristic — Story 13-2 R-A2.
 *
 * ⭐ WHY A SIXTH HEURISTIC RATHER THAN REUSING `duplicate_response`.
 *
 * The five field heuristics all read evidence a FIELD WORKER generates: GPS tracks,
 * completion times, answer variance, submission clocks, and an enumerator's own
 * recent history. An imported association roll has none of it — measured at 13-2
 * R-A2, every one of the five returns 0 for an imported row, and `off_hours` is
 * worse than useless because all 8,222 rows of a batch share the operator's single
 * import timestamp, so it would flag the whole batch on the operator's clock.
 *
 * The fraud this cohort is actually exposed to is different in kind: an association
 * head inflating a membership roll to claim more members. Its evidence is INTERNAL
 * to the batch — the same person entered twice, or one contact standing in for many
 * names — so it needs its own heuristic.
 *
 * ── IT SHARES THE `duplicate` CATEGORY DELIBERATELY ─────────────────────────
 *
 * Roll padding IS duplicate detection, batch-scoped instead of enumerator-scoped.
 * Sharing the category means it inherits the existing weight (max 20), lands in the
 * existing `duplicate_score` column, and renders on the existing review surfaces —
 * no new column, no new severity maths, no new UI. A field submission runs
 * `duplicate_response`; an imported one runs this. They are never both scored.
 *
 * ── WHAT IT DOES NOT FLAG, AND WHY THAT MATTERS ─────────────────────────────
 *
 * ⛔ A SHARED PHONE IS NOT, BY ITSELF, PADDING. Calibrated 2026-09-13 on the
 * 9,563-row farming consolidation (the only intake that has shared phones): 345
 * shared numbers — 305 used by 2 rows, 19 by 3, 9 by 4, 12 by 5+ (83 rows).
 * Household and co-op handsets are ordinary, so `padding_contact_reuse_min`
 * defaults to 5: the 2-4-person handsets stay silent and only the 12 heaviest fire.
 * The score is capped below the identity signal. (An earlier note cited 13-2 R-A4's
 * "9,563 imported rows" — that figure describes the consolidation, not what was
 * imported; the imported batches carry 8,278 distinct phones.)
 *
 * WHAT REACHES HERE. The importer (`services/import/ingest-plan.ts`) skips a row
 * whose NIN matches anyone, or whose phone matches an EXISTING respondent — but it
 * deliberately INSERTS rows that share a phone with another row of the same batch
 * (taxonomy R2: a shared phone never merges distinct people). So contact reuse
 * within a batch DOES reach this heuristic, as does the same person re-entered
 * under a different contact — the shape deliberate padding takes.
 *
 * ⚠️ It scores ONE ROW against its batch. A high score is a prompt to review the
 * batch, not proof about the person in the row — a duplicate cluster means at least
 * one of its members is spurious, never that a particular one is.
 */

import type { FraudHeuristic, SubmissionWithContext, FraudThresholdConfig } from '@oslsr/types';
import { getThreshold } from './utils.js';

export const rollPaddingHeuristic: FraudHeuristic = {
  key: 'roll_padding',
  category: 'duplicate',

  async evaluate(
    submission: SubmissionWithContext,
    config: FraudThresholdConfig[],
  ): Promise<{ score: number; details: Record<string, unknown> }> {
    const cohort = submission.importCohort;

    // A field submission never reaches here (the engine selects by provenance), but
    // refuse defensively rather than score on absent context.
    if (!cohort) {
      return { score: 0, details: { reason: 'not_an_imported_row' } };
    }

    const weight = getThreshold(config, 'duplicate_weight', 20);
    const identityWeight = getThreshold(config, 'padding_identity_weight', 12);
    const contactWeight = getThreshold(config, 'padding_contact_weight', 8);
    const contactReuseMin = getThreshold(config, 'padding_contact_reuse_min', 5);

    const flags: string[] = [];
    let score = 0;

    /*
     * Identity duplication. `sameIdentityCount` counts rows in THIS batch sharing a
     * normalised name+LGA key, this row included — so 1 means unique and is the
     * expected value. The score scales with cluster size but saturates: a cluster of
     * 12 is not six times more suspicious than a cluster of 2, it is the same
     * finding about a bigger group.
     */
    if (cohort.sameIdentityCount > 1) {
      const excess = cohort.sameIdentityCount - 1;
      const saturation = Math.min(1, excess / 3);
      score += identityWeight * saturation;
      flags.push('duplicate_identity_in_batch');
    }

    /*
     * Contact reuse, thresholded so ordinary sharing is silent. See the calibration note
     * above: below `padding_contact_reuse_min` this is a household, not a signal.
     */
    if (cohort.samePhoneCount !== null && cohort.samePhoneCount >= contactReuseMin) {
      const excess = cohort.samePhoneCount - contactReuseMin + 1;
      const saturation = Math.min(1, excess / 5);
      score += contactWeight * saturation;
      flags.push('contact_reused_across_batch');
    }

    score = Math.min(score, weight);
    score = Math.round(score * 100) / 100;

    return {
      score,
      details: {
        flags,
        batchSize: cohort.batchSize,
        sameIdentityCount: cohort.sameIdentityCount,
        samePhoneCount: cohort.samePhoneCount,
        contactReuseMin,
        reason: flags.length === 0 ? 'no_padding_signal' : undefined,
      },
    };
  },
};
