import { describe, it, expect } from 'vitest';
import {
  calculatePIR,
  calculateLIS,
  calculateShannonEntropy,
  identifyBatteries,
  straightLiningHeuristic,
} from '../straight-lining.heuristic.js';
import type { SubmissionWithContext, FraudThresholdConfig } from '@oslsr/types';

const defaultConfig: FraudThresholdConfig[] = [
  { id: '1', ruleKey: 'straightline_pir_threshold', displayName: 'PIR Threshold', ruleCategory: 'straightline', thresholdValue: 0.8, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '2', ruleKey: 'straightline_min_battery_size', displayName: 'Min Battery Size', ruleCategory: 'straightline', thresholdValue: 5, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '3', ruleKey: 'straightline_entropy_threshold', displayName: 'Entropy Threshold', ruleCategory: 'straightline', thresholdValue: 0.5, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '4', ruleKey: 'straightline_min_flagged_batteries', displayName: 'Min Flagged Batteries', ruleCategory: 'straightline', thresholdValue: 2, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '5', ruleKey: 'straightline_weight', displayName: 'Weight', ruleCategory: 'straightline', thresholdValue: 20, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
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
    rawData: {},
    formSchema: null,
    recentSubmissions: [],
    nearbySubmissions: [],
    ...overrides,
  };
}

describe('calculatePIR', () => {
  it('returns 0 for empty array', () => {
    expect(calculatePIR([])).toBe(0);
  });

  it('returns 1.0 for all identical responses', () => {
    expect(calculatePIR(['3', '3', '3', '3', '3'])).toBe(1);
  });

  it('returns correct ratio for mixed responses', () => {
    // 3 out of 5 are '3' → PIR = 0.6
    expect(calculatePIR(['3', '3', '3', '2', '1'])).toBe(0.6);
  });

  it('handles single element', () => {
    expect(calculatePIR(['1'])).toBe(1);
  });
});

describe('calculateLIS', () => {
  it('returns 0 for empty array', () => {
    expect(calculateLIS([])).toBe(0);
  });

  it('returns full length for all identical', () => {
    expect(calculateLIS(['3', '3', '3', '3', '3'])).toBe(5);
  });

  it('finds longest consecutive run', () => {
    expect(calculateLIS(['1', '3', '3', '3', '2', '2'])).toBe(3);
  });

  it('returns 1 for all different', () => {
    expect(calculateLIS(['1', '2', '3', '4', '5'])).toBe(1);
  });
});

describe('calculateShannonEntropy', () => {
  it('returns 0 for empty array', () => {
    expect(calculateShannonEntropy([])).toBe(0);
  });

  it('returns 0 for all identical (zero diversity)', () => {
    expect(calculateShannonEntropy(['3', '3', '3', '3'])).toBe(0);
  });

  it('returns max entropy for uniform distribution', () => {
    // 5 distinct values → log2(5) ≈ 2.32
    const entropy = calculateShannonEntropy(['1', '2', '3', '4', '5']);
    expect(entropy).toBeGreaterThan(2);
  });

  it('returns low entropy for mostly identical', () => {
    // 9 of '3' and 1 of '1' → low entropy
    const entropy = calculateShannonEntropy(['3', '3', '3', '3', '3', '3', '3', '3', '3', '1']);
    expect(entropy).toBeLessThan(0.5);
  });
});

describe('identifyBatteries', () => {
  it('returns empty for null schema', () => {
    expect(identifyBatteries(null, 5)).toEqual([]);
  });

  it('identifies batteries with 5+ scale questions', () => {
    const schema = {
      sections: [
        {
          id: 'section1',
          questions: [
            { name: 'q1', type: 'select_one' },
            { name: 'q2', type: 'select_one' },
            { name: 'q3', type: 'select_one' },
            { name: 'q4', type: 'select_one' },
            { name: 'q5', type: 'select_one' },
          ],
        },
      ],
    };
    const batteries = identifyBatteries(schema, 5);
    expect(batteries).toHaveLength(1);
    expect(batteries[0].questionNames).toHaveLength(5);
  });

  it('skips sections with fewer than minBatterySize scale questions', () => {
    const schema = {
      sections: [
        { id: 's1', questions: [{ name: 'q1', type: 'select_one' }, { name: 'q2', type: 'text' }] },
      ],
    };
    expect(identifyBatteries(schema, 5)).toHaveLength(0);
  });
});

describe('straightLiningHeuristic', () => {
  it('returns 0 when no batteries found', async () => {
    const sub = makeSubmission({ formSchema: { sections: [] } });
    const result = await straightLiningHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(0);
    expect(result.details.reason).toBe('no_batteries_found');
  });

  it('flags multi-battery straight-lining (full score)', async () => {
    const schema = {
      sections: [
        { id: 's1', questions: Array.from({ length: 6 }, (_, i) => ({ name: `s1_q${i}`, type: 'select_one' })) },
        { id: 's2', questions: Array.from({ length: 6 }, (_, i) => ({ name: `s2_q${i}`, type: 'select_one' })) },
      ],
    };
    const rawData: Record<string, unknown> = {};
    // All '3' in both batteries → PIR = 1.0 in both
    for (let i = 0; i < 6; i++) {
      rawData[`s1_q${i}`] = '3';
      rawData[`s2_q${i}`] = '3';
    }

    const sub = makeSubmission({ formSchema: schema, rawData });
    const result = await straightLiningHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(20); // Full weight
    expect((result.details.flags as string[])).toContain('multi_battery_straight_lining');
  });

  it('gives half score for single battery flagged', async () => {
    const schema = {
      sections: [
        { id: 's1', questions: Array.from({ length: 6 }, (_, i) => ({ name: `s1_q${i}`, type: 'select_one' })) },
        { id: 's2', questions: Array.from({ length: 6 }, (_, i) => ({ name: `s2_q${i}`, type: 'select_one' })) },
      ],
    };
    const rawData: Record<string, unknown> = {};
    // All '3' in battery 1 (PIR=1.0), varied in battery 2
    for (let i = 0; i < 6; i++) {
      rawData[`s1_q${i}`] = '3';
      rawData[`s2_q${i}`] = String(i + 1);
    }

    const sub = makeSubmission({ formSchema: schema, rawData });
    const result = await straightLiningHeuristic.evaluate(sub, defaultConfig);
    // Half weight (10) + low_entropy secondary signal (5) = 15
    expect(result.score).toBe(15);
    expect((result.details.flags as string[])).toContain('single_battery_straight_lining');
    expect((result.details.flags as string[])).toContain('low_entropy');
  });

  it('returns 0 for varied responses (no straight-lining)', async () => {
    const schema = {
      sections: [
        { id: 's1', questions: Array.from({ length: 6 }, (_, i) => ({ name: `q${i}`, type: 'select_one' })) },
      ],
    };
    const rawData: Record<string, unknown> = {};
    for (let i = 0; i < 6; i++) rawData[`q${i}`] = String(i + 1);

    const sub = makeSubmission({ formSchema: schema, rawData });
    const result = await straightLiningHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(0);
  });

  it('reports correct heuristic metadata', () => {
    expect(straightLiningHeuristic.key).toBe('straight_lining');
    expect(straightLiningHeuristic.category).toBe('straightline');
  });
});
