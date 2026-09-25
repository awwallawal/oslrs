import { describe, it, expect } from 'vitest';
import { calculateMedian, calculateTheoreticalMinimum, speedRunHeuristic } from '../speed-run.heuristic.js';
import type { SubmissionWithContext, FraudThresholdConfig } from '@oslsr/types';

const defaultConfig: FraudThresholdConfig[] = [
  { id: '1', ruleKey: 'speed_superspeceder_pct', displayName: 'Superspeceder %', ruleCategory: 'speed', thresholdValue: 25, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '2', ruleKey: 'speed_speeder_pct', displayName: 'Speeder %', ruleCategory: 'speed', thresholdValue: 50, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '3', ruleKey: 'speed_bootstrap_n', displayName: 'Bootstrap N', ruleCategory: 'speed', thresholdValue: 30, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '4', ruleKey: 'speed_weight', displayName: 'Speed Weight', ruleCategory: 'speed', thresholdValue: 25, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
];

function makeSubmission(overrides: Partial<SubmissionWithContext> = {}): SubmissionWithContext {
  return {
    submissionId: 'sub-1',
    enumeratorId: 'enum-1',
    questionnaireFormId: 'form-1',
    submittedAt: '2026-02-20T10:00:00Z',
    gpsLatitude: null,
    gpsLongitude: null,
    completionTimeSeconds: 300,
    rawData: null,
    formSchema: null,
    recentSubmissions: [],
    nearbySubmissions: [],
    ...overrides,
  };
}

describe('calculateMedian', () => {
  it('returns 0 for empty array', () => {
    expect(calculateMedian([])).toBe(0);
  });

  it('returns single value for array of one', () => {
    expect(calculateMedian([42])).toBe(42);
  });

  it('calculates median for odd-length array', () => {
    expect(calculateMedian([1, 3, 5, 7, 9])).toBe(5);
  });

  it('calculates median for even-length array', () => {
    expect(calculateMedian([1, 3, 5, 7])).toBe(4);
  });
});

describe('calculateTheoreticalMinimum', () => {
  it('returns 60s fallback when no schema', () => {
    expect(calculateTheoreticalMinimum(null)).toBe(60);
  });

  it('calculates minimum from mixed question types', () => {
    const schema = {
      sections: [
        {
          id: 's1',
          questions: [
            { name: 'q1', type: 'select_one' },
            { name: 'q2', type: 'select_one' },
            { name: 'q3', type: 'text' },
            { name: 'q4', type: 'number' },
          ],
        },
      ],
    };
    // (2 * 3) + (1 * 8) + (1 * 4) + 30 = 6 + 8 + 4 + 30 = 48
    expect(calculateTheoreticalMinimum(schema)).toBe(48);
  });

  it('returns at least 30 seconds', () => {
    const schema = { sections: [{ id: 's1', questions: [] }] };
    expect(calculateTheoreticalMinimum(schema)).toBe(30);
  });
});

describe('speedRunHeuristic', () => {
  it('returns 0 when no completion time', async () => {
    const sub = makeSubmission({ completionTimeSeconds: null });
    const result = await speedRunHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(0);
    expect(result.details.reason).toBe('no_completion_time');
  });

  it('flags superspeceder when completion < 25% of median', async () => {
    // Median = 400s, current = 50s (12.5% of median)
    const recent = Array.from({ length: 35 }, (_, i) => ({
      id: `sub-${i}`,
      submittedAt: new Date(Date.now() - i * 3600000).toISOString(),
      gpsLatitude: null,
      gpsLongitude: null,
      completionTimeSeconds: 400,
      rawData: null,
      enumeratorId: 'enum-1',
      questionnaireFormId: 'form-1',
    }));

    const sub = makeSubmission({ completionTimeSeconds: 50, recentSubmissions: recent });
    const result = await speedRunHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(25); // Full weight
    expect(result.details.tier).toBe('superspeceder');
  });

  it('flags speeder when completion < 50% of median', async () => {
    // Median = 400s, current = 150s (37.5% of median)
    const recent = Array.from({ length: 35 }, (_, i) => ({
      id: `sub-${i}`,
      submittedAt: new Date(Date.now() - i * 3600000).toISOString(),
      gpsLatitude: null,
      gpsLongitude: null,
      completionTimeSeconds: 400,
      rawData: null,
      enumeratorId: 'enum-1',
      questionnaireFormId: 'form-1',
    }));

    const sub = makeSubmission({ completionTimeSeconds: 150, recentSubmissions: recent });
    const result = await speedRunHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(12); // ~48% of 25
    expect(result.details.tier).toBe('speeder');
  });

  it('returns 0 when completion time is normal', async () => {
    const recent = Array.from({ length: 35 }, (_, i) => ({
      id: `sub-${i}`,
      submittedAt: new Date(Date.now() - i * 3600000).toISOString(),
      gpsLatitude: null,
      gpsLongitude: null,
      completionTimeSeconds: 400,
      rawData: null,
      enumeratorId: 'enum-1',
      questionnaireFormId: 'form-1',
    }));

    const sub = makeSubmission({ completionTimeSeconds: 350, recentSubmissions: recent });
    const result = await speedRunHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(0);
    expect(result.details.tier).toBe('normal');
  });

  it('uses bootstrap fallback when fewer than 30 historical interviews', async () => {
    const recent = Array.from({ length: 10 }, (_, i) => ({
      id: `sub-${i}`,
      submittedAt: new Date(Date.now() - i * 3600000).toISOString(),
      gpsLatitude: null,
      gpsLongitude: null,
      completionTimeSeconds: 400,
      rawData: null,
      enumeratorId: 'enum-1',
      questionnaireFormId: 'form-1',
    }));

    const sub = makeSubmission({ completionTimeSeconds: 10, recentSubmissions: recent });
    const result = await speedRunHeuristic.evaluate(sub, defaultConfig);
    expect(result.details.referenceType).toBe('theoretical_minimum');
  });

  /*
   * Story 13-73 AC2 (13-69 R8). The reason keys on "the schema is null" and only on
   * the theoretical-minimum branch — the one that consults the schema.
   */
  describe('says when its floor is a guess (13-73 AC2)', () => {
    const recentOf = (n: number, seconds: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `sub-${i}`,
        submittedAt: new Date(Date.now() - i * 3600000).toISOString(),
        gpsLatitude: null,
        gpsLongitude: null,
        completionTimeSeconds: seconds,
        rawData: null,
        enumeratorId: 'enum-1',
        questionnaireFormId: 'form-1',
      }));

    it('marks no_form_schema on the 60 s fallback and keeps the score it computed', async () => {
      // 10 s against a 60 s guess is a superspeeder: the marker labels that number, it does not void it (AC8).
      const result = await speedRunHeuristic.evaluate(
        makeSubmission({ completionTimeSeconds: 10, formSchema: null }),
        defaultConfig,
      );
      expect(result.details.reason).toBe('no_form_schema');
      expect(result.details.referenceTime).toBe(60);
      expect(result.details.referenceType).toBe('theoretical_minimum');
      expect(result.details.tier).toBe('superspeceder');
      expect(result.score).toBe(25);
    });

    it('carries no reason when the floor is computed from a real schema', async () => {
      const formSchema = { sections: [{ id: 's1', questions: [{ name: 'q1', type: 'text' }] }] };
      const result = await speedRunHeuristic.evaluate(makeSubmission({ formSchema }), defaultConfig);
      expect(result.details.reason).toBeUndefined();
      expect(result.details.referenceTime).toBe(38); // 1 open question × 8 s + 30 s overhead
    });

    /*
     * Story 13-73 R5 (ruled "fix" by Awwal, 2026-09-24): a schema that is PRESENT but
     * yields no countable question makes the floor a flat 30 s — the same guess as
     * the null case, in a different costume.
     */
    it.each([
      ['no sections', { sections: [] }],
      ['sections with no questions', { sections: [{ id: 's1', questions: [] }] }],
      ['a shape the parser does not read', { groups: [{ items: [{ name: 'q1' }] }] }],
    ])('marks no_countable_questions when the schema has %s', async (_label, formSchema) => {
      const result = await speedRunHeuristic.evaluate(
        makeSubmission({ formSchema: formSchema as Record<string, unknown> }),
        defaultConfig,
      );
      expect(result.details.reason).toBe('no_countable_questions');
      expect(result.details.referenceTime).toBe(30);
    });

    it('carries no reason on an empirical median, which never consults the schema', async () => {
      const result = await speedRunHeuristic.evaluate(
        makeSubmission({ formSchema: null, recentSubmissions: recentOf(30, 400) }),
        defaultConfig,
      );
      expect(result.details.referenceType).toBe('empirical_median');
      expect(result.details.reason).toBeUndefined();
    });
  });

  it('reports correct heuristic metadata', () => {
    expect(speedRunHeuristic.key).toBe('speed_run');
    expect(speedRunHeuristic.category).toBe('speed');
  });
});
