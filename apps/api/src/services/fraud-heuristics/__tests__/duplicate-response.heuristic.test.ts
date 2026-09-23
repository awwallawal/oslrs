import { describe, it, expect } from 'vitest';
import { calculateFieldMatchRatio, canonicaliseAnswer, duplicateResponseHeuristic } from '../duplicate-response.heuristic.js';
import type { SubmissionWithContext, FraudThresholdConfig } from '@oslsr/types';

const defaultConfig: FraudThresholdConfig[] = [
  { id: '1', ruleKey: 'duplicate_exact_threshold', displayName: 'Exact Threshold', ruleCategory: 'duplicate', thresholdValue: 1.0, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '2', ruleKey: 'duplicate_partial_threshold', displayName: 'Partial Threshold', ruleCategory: 'duplicate', thresholdValue: 0.7, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '3', ruleKey: 'duplicate_weight', displayName: 'Duplicate Weight', ruleCategory: 'duplicate', thresholdValue: 20, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
];

function makeSubmission(overrides: Partial<SubmissionWithContext> = {}): SubmissionWithContext {
  return {
    submissionId: 'sub-1',
    enumeratorId: 'enum-1',
    questionnaireFormId: 'form-1',
    submittedAt: '2026-02-20T10:00:00Z',
    gpsLatitude: null,
    gpsLongitude: null,
    completionTimeSeconds: null,
    rawData: { q1: 'a', q2: 'b', q3: 'c' },
    formSchema: null,
    recentSubmissions: [],
    nearbySubmissions: [],
    ...overrides,
  };
}

describe('calculateFieldMatchRatio', () => {
  it('returns 0 for two empty objects', () => {
    expect(calculateFieldMatchRatio({}, {})).toBe(0);
  });

  it('returns 1.0 for identical objects', () => {
    const obj = { q1: 'a', q2: 'b', q3: 'c' };
    expect(calculateFieldMatchRatio(obj, obj)).toBe(1);
  });

  it('returns correct ratio for partial match', () => {
    const a = { q1: 'a', q2: 'b', q3: 'c', q4: 'd' };
    const b = { q1: 'a', q2: 'b', q3: 'x', q4: 'y' };
    // 2 out of 4 match → 0.5
    expect(calculateFieldMatchRatio(a, b)).toBe(0.5);
  });

  it('ignores metadata fields prefixed with _', () => {
    const a = { q1: 'a', _gpsLatitude: '7.3', _internal: 'meta' };
    const b = { q1: 'a', _gpsLatitude: '99', _internal: 'other' };
    // Only q1 is compared → 1/1 = 1.0
    expect(calculateFieldMatchRatio(a, b)).toBe(1);
  });

  it('handles different key sets (union)', () => {
    const a = { q1: 'a', q2: 'b' };
    const b = { q1: 'a', q3: 'c' };
    // Union keys: q1, q2, q3. q1 matches, q2 (undefined vs 'b'), q3 (undefined vs 'c') → 1/3
    expect(calculateFieldMatchRatio(a, b)).toBeCloseTo(1 / 3);
  });
});

/**
 * Story 13-71 AC12 — geopoints stop comparing equal to each other.
 *
 * RULED IN from 13-73 (was its AC7). Evidence and recommendation by adjudication
 * 2026-09-20; RULING by Awwal, 2026-09-20 -- "fix it once with 13-71", because
 * 13-71 is what makes the defect universal.
 *
 * ⛔ BOTH DIRECTIONS ARE ASSERTED, AND THAT IS THE POINT. A fix that only stops
 * different locations matching can be had by dropping the key entirely -- and it
 * would destroy the strongest evidence this detector has: two interviews at
 * genuinely identical coordinates. Satisfying half of this pair licenses the
 * opposite defect, so the two halves sit next to each other in one describe block
 * where nobody can satisfy one without reading the other.
 */
describe('13-71 AC12 — geopoint answers compare by rounded coordinate', () => {
  // Real Ibadan-scale coordinates. ~0.05 degrees apart is about 5.5 km.
  const HERE = { latitude: 7.3775, longitude: 3.9470, accuracy: 12 };
  const FAR = { latitude: 7.4300, longitude: 3.9000, accuracy: 12 };

  it('⛔ two DIFFERENT locations no longer compare equal', () => {
    // Before this fix BOTH rendered as "[object Object]" and this was 1.0.
    expect(calculateFieldMatchRatio({ gps: HERE }, { gps: FAR })).toBe(0);
  });

  it('⭐ two IDENTICAL locations STILL compare equal — the other direction', () => {
    // Real duplicate evidence. A fix that lost this would be worse than the bug.
    expect(calculateFieldMatchRatio({ gps: HERE }, { gps: { ...HERE } })).toBe(1);
  });

  it('a different location no longer inflates the ratio of an otherwise-partial match', () => {
    // 4 keys: q1 and q2 match, q3 does not, gps does not. Was 3/4 (partial,
    // scoring); is now 2/4.
    const a = { q1: 'a', q2: 'b', q3: 'c', gps: HERE };
    const b = { q1: 'a', q2: 'b', q3: 'DIFFERENT', gps: FAR };
    expect(calculateFieldMatchRatio(a, b)).toBe(0.5);
  });

  it('ACCURACY is excluded — the same doorway twice is the same place', () => {
    // A phone never reports the same accuracy radius twice. If accuracy were part
    // of the comparison, a genuine re-capture of one doorway would never match.
    const sameSpotSharperFix = { ...HERE, accuracy: 3 };
    expect(canonicaliseAnswer(HERE)).toBe(canonicaliseAnswer(sameSpotSharperFix));
  });

  it('rounds to 4 dp — two points ~1 m apart are the same place', () => {
    // 0.000005 degrees is well under a metre, far inside any phone GPS fix radius.
    const jitter = { latitude: 7.3775 + 0.000005, longitude: 3.947 - 0.000004, accuracy: 30 };
    expect(calculateFieldMatchRatio({ gps: HERE }, { gps: jitter })).toBe(1);
  });

  it('rounds to 4 dp — two points ~100 m apart are NOT the same place', () => {
    // ~0.001 degrees is ~110 m: two different buildings, not one compound.
    const nextStreet = { latitude: 7.3785, longitude: 3.9480, accuracy: 30 };
    expect(calculateFieldMatchRatio({ gps: HERE }, { gps: nextStreet })).toBe(0);
  });

  it('a geopoint and an UNANSWERED geopoint do not match', () => {
    expect(calculateFieldMatchRatio({ gps: HERE }, { gps: null })).toBe(0);
  });

  it('two unanswered geopoints still match, exactly as before', () => {
    expect(calculateFieldMatchRatio({ gps: null }, { gps: null })).toBe(1);
  });

  it('a malformed geopoint falls back to structural comparison rather than throwing', () => {
    const half = { latitude: 7.3775 };
    expect(calculateFieldMatchRatio({ gps: half }, { gps: { ...half } })).toBe(1);
    expect(calculateFieldMatchRatio({ gps: half }, { gps: HERE })).toBe(0);
  });

  it('-0 and 0 are the same place on the ground', () => {
    expect(canonicaliseAnswer({ latitude: -0, longitude: 0 }))
      .toBe(canonicaliseAnswer({ latitude: 0, longitude: 0 }));
  });
});

/**
 * Task 6b.3 — geopoint was NOT the only object on the `String()` path.
 *
 * Measured against the shipped forms on 2026-09-20: `oslsr_master_v3` serves 1
 * geopoint and 2 `select_multiple` questions (`skills_possessed`,
 * `training_interest`); `oslsr_public_core_v1` serves NO geopoint but 1
 * `select_multiple`. A `select_multiple` answer is an ARRAY, so the PUBLIC channel
 * -- which has no geopoint at all -- carried a false match of its own.
 */
describe('13-71 Task 6b.3 — array answers (select_multiple) on the same path', () => {
  it('⛔ an EMPTY multi-select no longer matches an UNANSWERED question', () => {
    // String([]) === '' === String(undefined ?? ''), so every respondent who
    // skipped the question matched every respondent who opened it and chose
    // nothing. Live on BOTH forms, including Public Core.
    expect(calculateFieldMatchRatio({ skills: [] }, { skills: undefined })).toBe(0);
    expect(calculateFieldMatchRatio({ skills: [] }, {})).toBe(0);
  });

  it('two empty multi-selects still match each other', () => {
    expect(calculateFieldMatchRatio({ skills: [] }, { skills: [] })).toBe(1);
  });

  it('identical selections match, and different selections do not', () => {
    expect(calculateFieldMatchRatio({ s: ['tailoring', 'welding'] }, { s: ['tailoring', 'welding'] })).toBe(1);
    expect(calculateFieldMatchRatio({ s: ['tailoring'] }, { s: ['welding'] })).toBe(0);
  });

  it('a value containing a comma no longer collides with a two-element array', () => {
    // Structurally possible under String(): String(['a,b']) === String(['a','b']).
    // Measured 0 such choice values on either live form today, so this is
    // hardening rather than a live fix — and it is recorded as such.
    expect(calculateFieldMatchRatio({ s: ['a,b'] }, { s: ['a', 'b'] })).toBe(0);
  });

  it('⚠️ array ORDER is still significant — deliberately unchanged by this story', () => {
    // `SelectMultipleInput` appends in TAP order, so these are arguably the same
    // answer. Sorting would make them match and would INCREASE match ratios on
    // the channel R-A8 is about to calibrate; AC12's mandate is to remove a bias,
    // not to trade it for one pointing the other way. Recorded, not silently decided.
    expect(calculateFieldMatchRatio({ s: ['a', 'b'] }, { s: ['b', 'a'] })).toBe(0);
  });
});

describe('13-71 — canonicaliseAnswer preserves the previous behaviour for scalars', () => {
  it.each([
    ['a string', 'hello', 'hello'],
    ['a number', 42, '42'],
    ['zero', 0, '0'],
    ['false', false, 'false'],
    ['an empty string', '', ''],
    ['null', null, ''],
    ['undefined', undefined, ''],
  ])('%s renders exactly as String(value ?? "") did', (_label, input, expected) => {
    // Everything that was NOT an object must compare exactly as it did before, or
    // this change is not a geopoint fix but a silent re-baselining of the whole
    // detector on the eve of R-A8's calibration.
    expect(canonicaliseAnswer(input)).toBe(expected);
  });
});

describe('duplicateResponseHeuristic', () => {
  it('returns 0 when no rawData', async () => {
    const sub = makeSubmission({ rawData: null });
    const result = await duplicateResponseHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(0);
    expect(result.details.reason).toBe('no_data_or_history');
  });

  it('returns 0 when no recent submissions', async () => {
    const sub = makeSubmission({ recentSubmissions: [] });
    const result = await duplicateResponseHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(0);
    expect(result.details.reason).toBe('no_data_or_history');
  });

  it('flags exact duplicate (full weight)', async () => {
    const rawData = { q1: 'a', q2: 'b', q3: 'c' };
    const recent = [
      { id: 'prev-1', submittedAt: '2026-02-20T09:00:00Z', gpsLatitude: null, gpsLongitude: null, completionTimeSeconds: null, rawData: { q1: 'a', q2: 'b', q3: 'c' }, enumeratorId: 'enum-1', questionnaireFormId: 'form-1' },
    ];

    const sub = makeSubmission({ rawData, recentSubmissions: recent });
    const result = await duplicateResponseHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(20);
    expect(result.details.matchType).toBe('exact');
  });

  it('flags partial duplicate (half weight)', async () => {
    // 3 out of 4 fields match → 0.75 ratio (above 0.7 threshold, below 1.0)
    const rawData = { q1: 'a', q2: 'b', q3: 'c', q4: 'd' };
    const recent = [
      { id: 'prev-1', submittedAt: '2026-02-20T09:00:00Z', gpsLatitude: null, gpsLongitude: null, completionTimeSeconds: null, rawData: { q1: 'a', q2: 'b', q3: 'c', q4: 'DIFFERENT' }, enumeratorId: 'enum-1', questionnaireFormId: 'form-1' },
    ];

    const sub = makeSubmission({ rawData, recentSubmissions: recent });
    const result = await duplicateResponseHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(10);
    expect(result.details.matchType).toBe('partial');
  });

  it('returns 0 for low similarity (below partial threshold)', async () => {
    const rawData = { q1: 'a', q2: 'b', q3: 'c', q4: 'd' };
    const recent = [
      { id: 'prev-1', submittedAt: '2026-02-20T09:00:00Z', gpsLatitude: null, gpsLongitude: null, completionTimeSeconds: null, rawData: { q1: 'x', q2: 'y', q3: 'z', q4: 'w' }, enumeratorId: 'enum-1', questionnaireFormId: 'form-1' },
    ];

    const sub = makeSubmission({ rawData, recentSubmissions: recent });
    const result = await duplicateResponseHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(0);
    expect(result.details.matchType).toBe('none');
  });

  it('skips recent submissions without rawData', async () => {
    const rawData = { q1: 'a', q2: 'b' };
    const recent = [
      { id: 'prev-1', submittedAt: '2026-02-20T09:00:00Z', gpsLatitude: null, gpsLongitude: null, completionTimeSeconds: null, rawData: null, enumeratorId: 'enum-1', questionnaireFormId: 'form-1' },
    ];

    const sub = makeSubmission({ rawData, recentSubmissions: recent });
    const result = await duplicateResponseHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(0);
    expect(result.details.matchType).toBe('none');
  });

  it('reports correct heuristic metadata', () => {
    expect(duplicateResponseHeuristic.key).toBe('duplicate_response');
    expect(duplicateResponseHeuristic.category).toBe('duplicate');
  });
});
