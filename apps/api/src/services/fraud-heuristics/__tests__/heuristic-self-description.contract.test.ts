/**
 * THE CONTRACT: A DETECTOR'S DETAILS MUST SAY WHICH KIND OF ZERO IT IS.
 *
 * ⭐ WHY THIS FILE EXISTS, AND WHY IT IS ONE TEST RATHER THAN FOUR PATCHES.
 *
 * 13-69 exists because four detectors were dark and their `fraud_detections` rows
 * were indistinguishable from a clean population. Its review then found the SAME
 * defect wearing five different costumes, in one week:
 *
 *   • `straight_lining` drops a battery with too few ANSWERED questions and emits
 *     no `reason` — so the labour battery a real straight-liner would trip is
 *     discarded silently (13-69 R5).
 *   • `speed_run` falls back to a 60-second theoretical minimum when `formSchema`
 *     is null — which is what 293 live rows look like — and says nothing about the
 *     schema being absent (13-69 R8).
 *   • the duplicate heuristic flattens object answers through `String()`, so two
 *     different GPS points compare EQUAL (13-69 R9).
 *   • in the UI, a refused location permission and one never attempted are the
 *     same absent value (13-71).
 *
 * Patching each one leaves the class alive and the NEXT heuristic free to repeat
 * it. So this file states the property instead:
 *
 *   ⛔ FOR ANY CONTEXT, A HEURISTIC'S `details` MUST DESCRIBE ITSELF — carrying
 *      EITHER a `reason` explaining why it could not measure, OR the computed
 *      evidence proving that it did. Never neither. A bare `score: 0` with
 *      featureless details is the defect, whatever produced it.
 *
 * ⭐ IT IS ALSO A REGISTRY GUARD. `EVIDENCE_OF` is keyed by heuristic; a heuristic
 * added to `FIELD_HEURISTICS` or `IMPORT_HEURISTICS` without an entry here fails
 * the first test below. A new detector therefore cannot ship a silent zero without
 * someone deciding, in this file, what its evidence looks like.
 *
 * ⚠️ THE KNOWN VIOLATIONS ARE PINNED, NOT SKIPPED (see the last describe block).
 * R5 and R8 are real and are NOT fixed here — `fraud-heuristics/` is out of scope
 * by 13-69 AC10, and the fix is a threshold/design question. Hiding them behind an
 * allowlist would make this file a test that passes over a hole
 * [[pattern-test-that-passes-over-a-hole]], so instead the current wrong behaviour
 * is asserted explicitly. **Those tests RED when R5 or R8 is fixed** — that is
 * intentional, and the fix is to move the heuristic's row from the violations
 * block into the contract sweep above it.
 */

import { describe, it, expect } from 'vitest';
import type { SubmissionWithContext, FraudHeuristic } from '@oslsr/types';
import { heuristicsFor } from '../../fraud-engine.service.js';

/**
 * What "it measured" looks like, per heuristic. A predicate rather than a field
 * name, because for two of them the evidence is a COUNT that can legitimately be
 * zero — and zero analysed batteries is precisely the silent failure, not proof.
 */
const EVIDENCE_OF: Record<string, (d: Record<string, unknown>) => boolean> = {
  gps_clustering: (d) => d.clusterCount !== undefined,
  speed_run: (d) => d.tier !== undefined,
  straight_lining: (d) => Number(d.analyzedBatteries ?? 0) >= 1,
  duplicate_response: (d) => Number(d.comparedSubmissions ?? 0) >= 1,
  off_hours: (d) => d.watHour !== undefined,
  roll_padding: (d) => d.batchSize !== undefined,
};

/** `reason: undefined` is a present key with no meaning — roll_padding writes that. */
const hasReason = (d: Record<string, unknown>) =>
  typeof d.reason === 'string' && d.reason.length > 0;

function describesItself(key: string, details: Record<string, unknown>): boolean {
  const evidence = EVIDENCE_OF[key];
  return hasReason(details) || (evidence ? evidence(details) : false);
}

/** A context in which NOTHING is measurable — the hardest case for the contract. */
function emptyContext(overrides: Partial<SubmissionWithContext> = {}): SubmissionWithContext {
  return {
    submissionId: '00000000-0000-0000-0000-000000000001',
    enumeratorId: null,
    questionnaireFormId: '00000000-0000-0000-0000-000000000002',
    submittedAt: new Date('2026-09-18T10:00:00Z').toISOString(),
    gpsLatitude: null,
    gpsLongitude: null,
    completionTimeSeconds: null,
    rawData: null,
    formSchema: null,
    recentSubmissions: [],
    importBatchId: null,
    importCohort: null,
    nearbySubmissions: [],
    ...overrides,
  };
}

/** Every heuristic the engine can select, field and import registries alike. */
function allHeuristics(): FraudHeuristic[] {
  const field = heuristicsFor(emptyContext());
  const imported = heuristicsFor(emptyContext({ importBatchId: 'batch-1' }));
  return [...field, ...imported];
}

describe('fraud heuristics — the self-description contract', () => {
  it('every registered heuristic is declared in EVIDENCE_OF (registry guard)', () => {
    const undeclared = allHeuristics()
      .map((h) => h.key)
      .filter((k) => !(k in EVIDENCE_OF));

    expect(
      undeclared,
      `A heuristic was registered without declaring what "it measured" looks like: ${undeclared.join(', ')}. ` +
        'Add it to EVIDENCE_OF — deciding that is how a new detector avoids shipping a silent zero.',
    ).toEqual([]);
  });

  it('describes itself when NOTHING is measurable', async () => {
    const failures: string[] = [];

    for (const h of allHeuristics()) {
      const { details } = await h.evaluate(emptyContext(), []);
      if (!describesItself(h.key, details)) {
        failures.push(`${h.key} → ${JSON.stringify(details)}`);
      }
    }

    expect(
      failures,
      'These returned a zero that cannot say why it is zero:\n' + failures.join('\n'),
    ).toEqual([]);
  });

  it('describes itself when only the CLOCK is available (the GPS-less field case 13-69 ungated)', async () => {
    // The shape of a real GPS-less enumerator submission: answers and a duration,
    // no coordinates. This is the population the whole story turned on.
    const ctx = emptyContext({
      completionTimeSeconds: 800,
      rawData: { gender: 'female', marital_status: 'single' },
      formSchema: { sections: [{ id: 's1', questions: [{ name: 'gender', type: 'select_one' }] }] },
    });

    const failures: string[] = [];
    for (const h of heuristicsFor(ctx)) {
      const { details } = await h.evaluate(ctx, []);
      if (!describesItself(h.key, details)) failures.push(`${h.key} → ${JSON.stringify(details)}`);
    }

    expect(failures, 'Silent zeroes on a GPS-less field submission:\n' + failures.join('\n')).toEqual([]);
  });

  it('describes itself for an IMPORT row with no cohort context', async () => {
    const ctx = emptyContext({ importBatchId: 'batch-1', importCohort: null });
    for (const h of heuristicsFor(ctx)) {
      const { details } = await h.evaluate(ctx, []);
      expect(describesItself(h.key, details), `${h.key} → ${JSON.stringify(details)}`).toBe(true);
    }
  });
});

/*
 * ⛔ THE KNOWN VIOLATIONS, ASSERTED AS THEY CURRENTLY BEHAVE.
 *
 * Both are recorded residuals of 13-69 and both are out of scope by AC10. They are
 * here so the class is COUNTABLE — two, today — rather than rediscovered. When
 * either is fixed these tests go red, which is the signal to move that heuristic
 * into the contract sweep above and delete its block here.
 */
describe('fraud heuristics — known contract violations (13-69 R5, R8)', () => {
  it('R5: straight_lining drops an under-answered battery with NO reason', async () => {
    // A real battery (5 `select_one` in one section) with only 3 answered — exactly
    // what the master form's labour battery produces, because its skip logic caps a
    // respondent at 4 of 6 against `straightline_min_battery_size = 5`.
    const ctx = emptyContext({
      formSchema: {
        sections: [
          {
            id: 'battery',
            questions: ['q1', 'q2', 'q3', 'q4', 'q5'].map((name) => ({ name, type: 'select_one' })),
          },
        ],
      },
      rawData: { q1: 'no', q2: 'no', q3: 'no' },
    });

    const h = heuristicsFor(ctx).find((x) => x.key === 'straight_lining')!;
    const { score, details } = await h.evaluate(ctx, []);

    expect(score).toBe(0);
    expect(details.batteryCount).toBe(1); // it FOUND the battery …
    expect(details.analyzedBatteries).toBe(0); // … and then dropped it,
    expect(hasReason(details)).toBe(false); // … saying nothing. ← R5
    expect(describesItself('straight_lining', details)).toBe(false);
  });

  it('R8: speed_run uses the 60s fallback when the form schema is GONE, and does not say so', async () => {
    // 293 live rows resolve to a null schema — 283 whose form row was deleted, plus
    // the `self-edit` and `no-form-pinned-at-submit` sentinels. The real floor for
    // the master form is 246s; measuring against 60 under-flags and is invisible.
    const ctx = emptyContext({ completionTimeSeconds: 800, formSchema: null });

    const h = heuristicsFor(ctx).find((x) => x.key === 'speed_run')!;
    const { details } = await h.evaluate(ctx, []);

    expect(details.referenceTime).toBe(60); // the fallback, not a real floor
    expect(details.referenceType).toBe('theoretical_minimum');
    // ⚠️ It passes the self-description contract (it reports a `tier`), which is why
    // R8 needs its own marker: nothing here distinguishes "computed from the form"
    // from "the form is missing and I guessed 60".
    expect(details.schemaMissing).toBeUndefined(); // ← R8: the marker that should exist
    expect(describesItself('speed_run', details)).toBe(true);
  });
});
