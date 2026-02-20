import { describe, it, expect } from 'vitest';
import { getWATHour, isWeekendWAT, offHoursHeuristic } from '../off-hours.heuristic.js';
import type { SubmissionWithContext, FraudThresholdConfig } from '@oslsr/types';

const defaultConfig: FraudThresholdConfig[] = [
  { id: '1', ruleKey: 'timing_night_start_hour', displayName: 'Night Start', ruleCategory: 'timing', thresholdValue: 23, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '2', ruleKey: 'timing_night_end_hour', displayName: 'Night End', ruleCategory: 'timing', thresholdValue: 5, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '3', ruleKey: 'timing_weekend_penalty', displayName: 'Weekend Penalty', ruleCategory: 'timing', thresholdValue: 5, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '4', ruleKey: 'timing_weight', displayName: 'Timing Weight', ruleCategory: 'timing', thresholdValue: 10, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
];

function makeSubmission(overrides: Partial<SubmissionWithContext> = {}): SubmissionWithContext {
  return {
    submissionId: 'sub-1',
    enumeratorId: 'enum-1',
    questionnaireFormId: 'form-1',
    submittedAt: '2026-02-20T10:00:00Z', // Friday 11:00 WAT (normal hours)
    gpsLatitude: null,
    gpsLongitude: null,
    completionTimeSeconds: null,
    rawData: null,
    formSchema: null,
    recentSubmissions: [],
    nearbySubmissions: [],
    ...overrides,
  };
}

describe('getWATHour', () => {
  it('converts UTC midnight to WAT 1:00', () => {
    const date = new Date('2026-02-20T00:00:00Z');
    expect(getWATHour(date)).toBe(1);
  });

  it('converts UTC 23:00 to WAT 0:00 (next day)', () => {
    const date = new Date('2026-02-20T23:00:00Z');
    expect(getWATHour(date)).toBe(0);
  });

  it('converts UTC 14:00 to WAT 15:00', () => {
    const date = new Date('2026-02-20T14:00:00Z');
    expect(getWATHour(date)).toBe(15);
  });
});

describe('isWeekendWAT', () => {
  it('returns false for a weekday (Friday)', () => {
    // 2026-02-20 is a Friday
    const date = new Date('2026-02-20T10:00:00Z');
    expect(isWeekendWAT(date)).toBe(false);
  });

  it('returns true for Saturday', () => {
    // 2026-02-21 is a Saturday
    const date = new Date('2026-02-21T10:00:00Z');
    expect(isWeekendWAT(date)).toBe(true);
  });

  it('returns true for Sunday', () => {
    // 2026-02-22 is a Sunday
    const date = new Date('2026-02-22T10:00:00Z');
    expect(isWeekendWAT(date)).toBe(true);
  });

  it('handles WAT day boundary (UTC Saturday 23:00 = WAT Sunday 00:00)', () => {
    // UTC Saturday 23:00 → WAT Sunday 00:00 → weekend
    const date = new Date('2026-02-21T23:00:00Z');
    expect(isWeekendWAT(date)).toBe(true);
  });
});

describe('offHoursHeuristic', () => {
  it('returns 0 for normal weekday hours', async () => {
    // Friday 11:00 WAT (10:00 UTC)
    const sub = makeSubmission({ submittedAt: '2026-02-20T10:00:00Z' });
    const result = await offHoursHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(0);
    expect(result.details.flags).toEqual([]);
  });

  it('flags night hours (full weight)', async () => {
    // WAT 2:00 AM (UTC 1:00 AM) → night hours
    const sub = makeSubmission({ submittedAt: '2026-02-20T01:00:00Z' });
    const result = await offHoursHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(10);
    expect((result.details.flags as string[])).toContain('night_hours');
  });

  it('flags weekend submissions', async () => {
    // Saturday 10:00 WAT (09:00 UTC) → weekend only, not night
    const sub = makeSubmission({ submittedAt: '2026-02-21T09:00:00Z' });
    const result = await offHoursHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(5);
    expect((result.details.flags as string[])).toContain('weekend');
  });

  it('caps score at weight when both night + weekend', async () => {
    // Sunday 2:00 WAT (UTC 01:00) → both night AND weekend
    const sub = makeSubmission({ submittedAt: '2026-02-22T01:00:00Z' });
    const result = await offHoursHeuristic.evaluate(sub, defaultConfig);
    // Night=10 + Weekend=5 = 15, but capped at weight=10
    expect(result.score).toBe(10);
    expect((result.details.flags as string[])).toContain('night_hours');
    expect((result.details.flags as string[])).toContain('weekend');
  });

  it('correctly identifies WAT hour 23 as night', async () => {
    // WAT 23:00 = UTC 22:00 → night start
    const sub = makeSubmission({ submittedAt: '2026-02-20T22:00:00Z' });
    const result = await offHoursHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(10);
    expect(result.details.watHour).toBe(23);
    expect((result.details.flags as string[])).toContain('night_hours');
  });

  it('reports correct heuristic metadata', () => {
    expect(offHoursHeuristic.key).toBe('off_hours');
    expect(offHoursHeuristic.category).toBe('timing');
  });
});
