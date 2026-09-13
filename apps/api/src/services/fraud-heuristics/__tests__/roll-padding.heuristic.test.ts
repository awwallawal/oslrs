/**
 * Story 13-2 R-A2 — the roll-padding heuristic.
 *
 * The integration sibling (`fraud-engine.imports.integration.test.ts`) proves the
 * COUNTS are derived correctly from a real batch. This file proves the SCORING
 * given those counts — in particular the boundary below which ordinary shared
 * handsets stay silent, which is the difference between a safety net and an
 * accusation against hundreds of real farmers (calibration: see the heuristic header).
 */

import { describe, it, expect } from 'vitest';
import { rollPaddingHeuristic } from '../roll-padding.heuristic.js';
import type { SubmissionWithContext, FraudThresholdConfig } from '@oslsr/types';

/** Defaults matching the seeded thresholds; passing [] exercises the same values. */
const CONFIG: FraudThresholdConfig[] = [];

function ctx(cohort: SubmissionWithContext['importCohort']): SubmissionWithContext {
  return {
    submissionId: 'sub-1',
    enumeratorId: null,
    questionnaireFormId: 'import:imported_association',
    submittedAt: new Date('2026-09-12T10:00:00Z').toISOString(),
    gpsLatitude: null,
    gpsLongitude: null,
    completionTimeSeconds: null,
    rawData: null,
    formSchema: null,
    importBatchId: cohort ? 'batch-1' : null,
    importCohort: cohort,
    recentSubmissions: [],
    nearbySubmissions: [],
  } as SubmissionWithContext;
}

const cohort = (over: Partial<NonNullable<SubmissionWithContext['importCohort']>> = {}) => ({
  batchSize: 8222,
  sameIdentityCount: 1,
  samePhoneCount: 1,
  ...over,
});

describe('rollPaddingHeuristic', () => {
  it('scores zero for a unique person on their own phone', async () => {
    const r = await rollPaddingHeuristic.evaluate(ctx(cohort()), CONFIG);
    expect(r.score).toBe(0);
    expect(r.details.reason).toBe('no_padding_signal');
  });

  it('scores a duplicated identity inside the batch', async () => {
    const r = await rollPaddingHeuristic.evaluate(ctx(cohort({ sameIdentityCount: 2 })), CONFIG);
    expect(r.score).toBeGreaterThan(0);
    expect(r.details.flags).toContain('duplicate_identity_in_batch');
  });

  /**
   * Saturation: a cluster of 12 is the same FINDING as a cluster of 4, about more
   * people. Without this the score would run away and drag unrelated rows into
   * `critical` purely because a common name recurs in a large roll.
   */
  it('saturates rather than scaling without limit on cluster size', async () => {
    const four = await rollPaddingHeuristic.evaluate(ctx(cohort({ sameIdentityCount: 4 })), CONFIG);
    const twelve = await rollPaddingHeuristic.evaluate(ctx(cohort({ sameIdentityCount: 12 })), CONFIG);
    expect(twelve.score).toBe(four.score);
  });

  /**
   * ⛔ THE FALSE-POSITIVE BOUNDARY — the most consequential assertion in this file.
   * The 9,563-row farming consolidation has 345 shared numbers, 333 of them used by
   * 2-4 rows — ordinary household/co-op handsets. Scoring at two or three would
   * accuse hundreds of real people. These two tests pin both sides of the configured
   * minimum of 5 (which fires on the 12 heaviest-shared numbers, 83 rows).
   */
  it('stays SILENT for an ordinary shared household handset (2 rows)', async () => {
    const r = await rollPaddingHeuristic.evaluate(ctx(cohort({ samePhoneCount: 2 })), CONFIG);
    expect(r.score).toBe(0);
    expect(r.details.flags).toEqual([]);
  });

  it('stays silent at 4 rows and fires at 5 (the configured minimum)', async () => {
    const four = await rollPaddingHeuristic.evaluate(ctx(cohort({ samePhoneCount: 4 })), CONFIG);
    const five = await rollPaddingHeuristic.evaluate(ctx(cohort({ samePhoneCount: 5 })), CONFIG);
    expect(four.score).toBe(0);
    expect(five.score).toBeGreaterThan(0);
    expect(five.details.flags).toContain('contact_reused_across_batch');
  });

  /**
   * A row with no phone must not be treated as "measured and unique". `null` is the
   * honest value and the heuristic must not score on it — the same not-measurable
   * vs measured-clean distinction the provenance split exists to preserve.
   */
  it('does not score contact reuse when the row has no phone at all', async () => {
    const r = await rollPaddingHeuristic.evaluate(ctx(cohort({ samePhoneCount: null })), CONFIG);
    expect(r.score).toBe(0);
    expect(r.details.samePhoneCount).toBeNull();
  });

  it('never exceeds the duplicate category maximum of 20', async () => {
    const r = await rollPaddingHeuristic.evaluate(
      ctx(cohort({ sameIdentityCount: 50, samePhoneCount: 50 })),
      CONFIG,
    );
    expect(r.score).toBeLessThanOrEqual(20);
  });

  /**
   * Defensive: the engine selects this heuristic by provenance so a field
   * submission never reaches it, but scoring on absent context is exactly the
   * failure mode R-A2 exists to stamp out.
   */
  it('refuses to score a row that is not an import', async () => {
    const r = await rollPaddingHeuristic.evaluate(ctx(null), CONFIG);
    expect(r.score).toBe(0);
    expect(r.details.reason).toBe('not_an_imported_row');
  });
});
