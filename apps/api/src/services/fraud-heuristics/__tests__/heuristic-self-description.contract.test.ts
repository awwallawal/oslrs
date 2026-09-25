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
 * ✅ THE KNOWN VIOLATIONS BLOCK IS EMPTY (Story 13-73 AC3). 13-69 shipped this
 * file with R5 and R8 pinned as asserted-wrong behaviour rather than skipped, so
 * the class was countable — two. 13-73 fixed both and PROMOTED them into the sweep
 * below as two new contexts: an under-answered battery (R5), and a schema that is
 * absent (R8). The second is a stronger clause than "describes itself", because
 * R8 always passed that one — it reports a `tier` — while measuring against a
 * guessed 60-second floor. See the last describe block for why it is behavioural.
 * ⛔ A future violation goes back into a pinned block here, never into an allowlist
 * [[pattern-test-that-passes-over-a-hole]].
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

  it('describes itself when a battery is FOUND but under-answered (13-69 R5, promoted by 13-73)', async () => {
    // A real battery (5 `select_one` in one section) with only 3 answered — exactly
    // what the master form's labour battery produces, because its skip logic caps a
    // respondent at 4 of 6 against `straightline_min_battery_size = 5`. Until 13-73
    // this returned `batteryCount: 1, analyzedBatteries: 0` and nothing else.
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

    const failures: string[] = [];
    let slDetails: Record<string, unknown> | undefined;
    for (const h of heuristicsFor(ctx)) {
      const { details } = await h.evaluate(ctx, []);
      if (h.key === 'straight_lining') slDetails = details;
      if (!describesItself(h.key, details)) failures.push(`${h.key} → ${JSON.stringify(details)}`);
    }

    // Non-vacuity (13-73 code review): the pin this replaced asserted the battery was
    // FOUND. Without it, a drift in battery detection turns this fixture into
    // `no_batteries_found` — which "describes itself" — and the clause stops testing R5.
    expect(slDetails, 'straight_lining did not run on this context').toBeDefined();
    expect(slDetails).toMatchObject({ batteryCount: 1, analyzedBatteries: 0 });
    expect(failures, 'Silent zeroes on an under-answered battery:\n' + failures.join('\n')).toEqual([]);
  });

  /*
   * ⭐ R8, PROMOTED — AND WHY THIS CLAUSE IS BEHAVIOURAL RATHER THAN A LIST.
   *
   * `speed_run` always passed "describes itself": it reports a `tier`. What it did
   * not do was say that the reference the tier was computed against was a GUESS —
   * `calculateTheoreticalMinimum(null)` is a flat 60 s. So the property here is
   * stronger: **if a heuristic's result DEPENDS on the form schema, then when the
   * schema is absent it must carry a `reason`.**
   *
   * Dependence is DETECTED, not declared: every heuristic is run on the same
   * answers and clock with the schema and without it, and any whose details differ
   * is schema-dependent by observation. A declared list would be one more registry
   * a new heuristic could be left out of; this cannot be — a heuristic that starts
   * reading `formSchema` is enrolled by the act of reading it.
   *
   * The context is chosen so the schema MATTERS to both readers today (a full
   * battery for `straight_lining`, a countable question set whose floor is not 60 s
   * for `speed_run`). The first assertion proves that, so this test cannot pass
   * vacuously by comparing two identical outputs.
   */
  it('says so when the form schema is ABSENT, for every heuristic whose result depends on it (13-69 R8, promoted by 13-73)', async () => {
    const answers = { q1: 'a', q2: 'b', q3: 'c', q4: 'd', q5: 'e' };
    const schema = {
      sections: [
        { id: 'battery', questions: Object.keys(answers).map((name) => ({ name, type: 'select_one' })) },
      ],
    };
    const withSchema = emptyContext({ completionTimeSeconds: 800, rawData: answers, formSchema: schema });
    const withoutSchema = emptyContext({ completionTimeSeconds: 800, rawData: answers, formSchema: null });

    const dependent: string[] = [];
    const silent: string[] = [];
    for (const h of heuristicsFor(withSchema)) {
      const a = (await h.evaluate(withSchema, [])).details;
      const b = (await h.evaluate(withoutSchema, [])).details;
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      dependent.push(h.key);
      if (!hasReason(b)) silent.push(`${h.key} → ${JSON.stringify(b)}`);
    }

    // Non-vacuity: both of today's schema readers were observed to depend on it.
    expect(dependent).toEqual(expect.arrayContaining(['speed_run', 'straight_lining']));
    expect(
      silent,
      'These computed a result WITHOUT the schema their result depends on, and did not say so:\n' +
        silent.join('\n'),
    ).toEqual([]);
  });

  /*
   * 13-73 R5 (ruled "fix" by Awwal, 2026-09-24) — AN EMPTY SCHEMA IS AS ABSENT AS A
   * NULL ONE. Same behavioural clause as above, with `{ sections: [] }` in place of
   * `null`: `speed_run` fell back to a flat 30 s floor here and said nothing. The
   * detection is again by observation, so a future reader of the schema is enrolled
   * by reading it.
   */
  it('says so when the form schema is present but EMPTY, for every heuristic whose result depends on it (13-73 R5)', async () => {
    const answers = { q1: 'a', q2: 'b', q3: 'c', q4: 'd', q5: 'e' };
    const schema = {
      sections: [
        { id: 'battery', questions: Object.keys(answers).map((name) => ({ name, type: 'select_one' })) },
      ],
    };
    const withSchema = emptyContext({ completionTimeSeconds: 800, rawData: answers, formSchema: schema });
    const emptySchema = emptyContext({ completionTimeSeconds: 800, rawData: answers, formSchema: { sections: [] } });

    const dependent: string[] = [];
    const silent: string[] = [];
    for (const h of heuristicsFor(withSchema)) {
      const a = (await h.evaluate(withSchema, [])).details;
      const b = (await h.evaluate(emptySchema, [])).details;
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      dependent.push(h.key);
      if (!hasReason(b)) silent.push(`${h.key} → ${JSON.stringify(b)}`);
    }

    expect(dependent).toEqual(expect.arrayContaining(['speed_run', 'straight_lining']));
    expect(
      silent,
      'These computed a result from an EMPTY schema and did not say so:\n' + silent.join('\n'),
    ).toEqual([]);
  });
});

/*
 * ✅ THE KNOWN VIOLATIONS — NONE (Story 13-73 AC3, 2026-09-24).
 *
 * A describe block here held R5 and R8 as asserted-wrong behaviour from 13-69 until
 * 13-73 fixed both; each now lives in the sweep above as a context of its own. The
 * count is ZERO. The next violation found goes HERE as a pinned block — asserting
 * its current wrong output, so it goes red when fixed — never into an allowlist and
 * never skipped.
 */
