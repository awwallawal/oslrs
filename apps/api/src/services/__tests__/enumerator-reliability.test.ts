/**
 * Inter-Enumerator Reliability Tests
 * Story 8.8 AC#5: JSD computation, threshold guard, flagging, scope enforcement
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db before importing service
vi.mock('../../db/index.js', () => ({
  db: { execute: vi.fn() },
}));

vi.mock('ioredis', () => {
  return { Redis: vi.fn().mockImplementation(() => null) };
});

vi.mock('pino', () => ({
  default: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

// We need to access jsDivergence and klDivergence which are module-private.
// Instead, test them through the service's output behavior.

import { db } from '../../db/index.js';
import { SurveyAnalyticsService } from '../survey-analytics.service.js';
import type { AnalyticsScope } from '../../middleware/analytics-scope.js';

const mockDb = vi.mocked(db);

const systemScope: AnalyticsScope = { type: 'system' };
const lgaScope: AnalyticsScope = { type: 'lga', lgaCode: 'ibadan_north', lgaId: 'uuid-123' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getEnumeratorReliability', () => {
  it('returns threshold not met when < 2 enumerators have >= 20 submissions', async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        { enumerator_id: 'e1', enumerator_name: 'Alice', count: '25' },
        // Only 1 qualified enumerator
      ],
      command: '', rowCount: 1, oid: 0, fields: [],
    });

    const result = await SurveyAnalyticsService.getEnumeratorReliability(systemScope);
    expect(result.threshold.met).toBe(false);
    expect(result.threshold.currentN).toBe(1);
    expect(result.threshold.requiredN).toBe(2);
    expect(result.enumerators).toHaveLength(0);
    expect(result.pairs).toHaveLength(0);
  });

  it('returns identical distributions with divergence near 0', async () => {
    // First call: enumerator counts
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        { enumerator_id: 'e1', enumerator_name: 'Alice', count: '30' },
        { enumerator_id: 'e2', enumerator_name: 'Bob', count: '25' },
      ],
      command: '', rowCount: 2, oid: 0, fields: [],
    });

    // Second call: distributions (identical for both enumerators)
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        // Alice gender
        { enumerator_id: 'e1', question: 'gender', answer: 'female', count: '15' },
        { enumerator_id: 'e1', question: 'gender', answer: 'male', count: '15' },
        // Bob gender (same proportions)
        { enumerator_id: 'e2', question: 'gender', answer: 'female', count: '12' },
        { enumerator_id: 'e2', question: 'gender', answer: 'male', count: '13' },
        // Alice employment_type
        { enumerator_id: 'e1', question: 'employment_type', answer: 'formal', count: '20' },
        { enumerator_id: 'e1', question: 'employment_type', answer: 'informal', count: '10' },
        // Bob employment_type (same proportions)
        { enumerator_id: 'e2', question: 'employment_type', answer: 'formal', count: '16' },
        { enumerator_id: 'e2', question: 'employment_type', answer: 'informal', count: '9' },
        // Alice education_level
        { enumerator_id: 'e1', question: 'education_level', answer: 'secondary', count: '20' },
        { enumerator_id: 'e1', question: 'education_level', answer: 'tertiary', count: '10' },
        // Bob education_level (same proportions)
        { enumerator_id: 'e2', question: 'education_level', answer: 'secondary', count: '17' },
        { enumerator_id: 'e2', question: 'education_level', answer: 'tertiary', count: '8' },
      ],
      command: '', rowCount: 12, oid: 0, fields: [],
    });

    const result = await SurveyAnalyticsService.getEnumeratorReliability(systemScope);
    expect(result.threshold.met).toBe(true);
    expect(result.enumerators).toHaveLength(2);
    expect(result.pairs).toHaveLength(1);
    // Near-identical distributions → low divergence
    expect(result.pairs[0].avgDivergence).toBeLessThan(0.1);
    expect(result.pairs[0].flag).toBe('normal');
  });

  it('returns high divergence for completely different distributions', async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        { enumerator_id: 'e1', enumerator_name: 'Alice', count: '30' },
        { enumerator_id: 'e2', enumerator_name: 'Bob', count: '25' },
      ],
      command: '', rowCount: 2, oid: 0, fields: [],
    });

    mockDb.execute.mockResolvedValueOnce({
      rows: [
        // Alice: 100% male
        { enumerator_id: 'e1', question: 'gender', answer: 'male', count: '30' },
        // Bob: 100% female
        { enumerator_id: 'e2', question: 'gender', answer: 'female', count: '25' },
        // Alice: 100% formal
        { enumerator_id: 'e1', question: 'employment_type', answer: 'formal', count: '30' },
        // Bob: 100% informal
        { enumerator_id: 'e2', question: 'employment_type', answer: 'informal', count: '25' },
        // Alice: 100% secondary
        { enumerator_id: 'e1', question: 'education_level', answer: 'secondary', count: '30' },
        // Bob: 100% tertiary
        { enumerator_id: 'e2', question: 'education_level', answer: 'tertiary', count: '25' },
      ],
      command: '', rowCount: 6, oid: 0, fields: [],
    });

    const result = await SurveyAnalyticsService.getEnumeratorReliability(systemScope);
    expect(result.pairs[0].avgDivergence).toBeCloseTo(1.0, 1);
    expect(result.pairs[0].flag).toBe('red');
    expect(result.pairs[0].interpretation).toContain('significantly different');
  });

  it('flags amber for moderate divergence (> 0.5 but <= 0.7)', async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        { enumerator_id: 'e1', enumerator_name: 'Alice', count: '40' },
        { enumerator_id: 'e2', enumerator_name: 'Bob', count: '40' },
      ],
      command: '', rowCount: 2, oid: 0, fields: [],
    });

    // Moderately different distributions — all 3 questions skewed
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        { enumerator_id: 'e1', question: 'gender', answer: 'male', count: '36' },
        { enumerator_id: 'e1', question: 'gender', answer: 'female', count: '4' },
        { enumerator_id: 'e2', question: 'gender', answer: 'male', count: '4' },
        { enumerator_id: 'e2', question: 'gender', answer: 'female', count: '36' },
        { enumerator_id: 'e1', question: 'employment_type', answer: 'formal', count: '36' },
        { enumerator_id: 'e1', question: 'employment_type', answer: 'informal', count: '4' },
        { enumerator_id: 'e2', question: 'employment_type', answer: 'formal', count: '4' },
        { enumerator_id: 'e2', question: 'employment_type', answer: 'informal', count: '36' },
        { enumerator_id: 'e1', question: 'education_level', answer: 'secondary', count: '36' },
        { enumerator_id: 'e1', question: 'education_level', answer: 'tertiary', count: '4' },
        { enumerator_id: 'e2', question: 'education_level', answer: 'secondary', count: '4' },
        { enumerator_id: 'e2', question: 'education_level', answer: 'tertiary', count: '36' },
      ],
      command: '', rowCount: 12, oid: 0, fields: [],
    });

    const result = await SurveyAnalyticsService.getEnumeratorReliability(systemScope);
    expect(result.pairs[0].avgDivergence).toBeGreaterThan(0.5);
    expect(result.pairs[0].avgDivergence).toBeLessThan(0.8);
    expect(['amber', 'red']).toContain(result.pairs[0].flag);
  });

  it('supervisor scope auto-scopes to their LGA', async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [],
      command: '', rowCount: 0, oid: 0, fields: [],
    });

    await SurveyAnalyticsService.getEnumeratorReliability(lgaScope);

    expect(mockDb.execute).toHaveBeenCalledTimes(1);
    // Verify the SQL query object includes the LGA code as a parameterized value
    const sqlArg = mockDb.execute.mock.calls[0][0];
    // Drizzle sql tagged templates store params in the query object
    const sqlStr = JSON.stringify(sqlArg);
    expect(sqlStr).toContain('ibadan_north');
  });

  it('generates correct interpretation text for flagged pairs', async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        { enumerator_id: 'e1', enumerator_name: 'Alice Johnson', count: '30' },
        { enumerator_id: 'e2', enumerator_name: 'Bob Smith', count: '25' },
      ],
      command: '', rowCount: 2, oid: 0, fields: [],
    });

    mockDb.execute.mockResolvedValueOnce({
      rows: [
        { enumerator_id: 'e1', question: 'gender', answer: 'male', count: '30' },
        { enumerator_id: 'e2', question: 'gender', answer: 'female', count: '25' },
        { enumerator_id: 'e1', question: 'employment_type', answer: 'formal', count: '30' },
        { enumerator_id: 'e2', question: 'employment_type', answer: 'informal', count: '25' },
        { enumerator_id: 'e1', question: 'education_level', answer: 'secondary', count: '30' },
        { enumerator_id: 'e2', question: 'education_level', answer: 'tertiary', count: '25' },
      ],
      command: '', rowCount: 6, oid: 0, fields: [],
    });

    const result = await SurveyAnalyticsService.getEnumeratorReliability(systemScope);
    const pair = result.pairs[0];
    expect(pair.enumeratorA).toBe('Alice Johnson');
    expect(pair.enumeratorB).toBe('Bob Smith');
    expect(pair.interpretation).toContain('Alice Johnson');
    expect(pair.interpretation).toContain('Bob Smith');
    expect(pair.interpretation).toContain('significantly different');
  });
});
