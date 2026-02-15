/**
 * useDashboardStats — Pure function tests
 * Story prep-2: Tests for fillDateGaps, getTodayCount, computeSummary
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fillDateGaps, getTodayCount, computeSummary } from '../useDashboardStats';

describe('fillDateGaps', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fills missing dates with count 0', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));

    const result = fillDateGaps([{ date: '2026-02-15', count: 5 }], 3);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ date: '2026-02-13', count: 0 });
    expect(result[1]).toEqual({ date: '2026-02-14', count: 0 });
    expect(result[2]).toEqual({ date: '2026-02-15', count: 5 });
  });

  it('preserves existing counts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));

    const result = fillDateGaps([
      { date: '2026-02-13', count: 3 },
      { date: '2026-02-15', count: 7 },
    ], 3);

    expect(result).toEqual([
      { date: '2026-02-13', count: 3 },
      { date: '2026-02-14', count: 0 },
      { date: '2026-02-15', count: 7 },
    ]);
  });

  it('returns all zeros when no data', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));

    const result = fillDateGaps([], 7);

    expect(result).toHaveLength(7);
    result.forEach((d) => expect(d.count).toBe(0));
  });

  it('handles 30-day range', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));

    const result = fillDateGaps([], 30);

    expect(result).toHaveLength(30);
    expect(result[0].date).toBe('2026-01-17');
    expect(result[29].date).toBe('2026-02-15');
  });
});

describe('getTodayCount', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns count for today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));

    const result = getTodayCount([
      { date: '2026-02-14', count: 3 },
      { date: '2026-02-15', count: 10 },
    ]);

    expect(result).toBe(10);
  });

  it('returns 0 if today not in data', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));

    const result = getTodayCount([
      { date: '2026-02-14', count: 3 },
    ]);

    expect(result).toBe(0);
  });

  it('returns 0 for empty data', () => {
    expect(getTodayCount([])).toBe(0);
  });
});

describe('computeSummary', () => {
  it('returns correct avg, best, total', () => {
    const data = [
      { date: '2026-02-13', count: 10 },
      { date: '2026-02-14', count: 20 },
      { date: '2026-02-15', count: 30 },
    ];

    const result = computeSummary(data);

    expect(result).toEqual({ avg: 20, best: 30, total: 60 });
  });

  it('returns zeros for empty data', () => {
    expect(computeSummary([])).toEqual({ avg: 0, best: 0, total: 0 });
  });

  it('rounds avg to nearest integer', () => {
    const data = [
      { date: '2026-02-14', count: 1 },
      { date: '2026-02-15', count: 2 },
    ];

    const result = computeSummary(data);

    expect(result.avg).toBe(2); // 1.5 rounds to 2
  });
});
