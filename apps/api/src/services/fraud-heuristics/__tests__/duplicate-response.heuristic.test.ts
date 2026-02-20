import { describe, it, expect } from 'vitest';
import { calculateFieldMatchRatio, duplicateResponseHeuristic } from '../duplicate-response.heuristic.js';
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
