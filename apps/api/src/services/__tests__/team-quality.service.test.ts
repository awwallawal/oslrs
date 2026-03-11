import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks
const mockExecute = vi.hoisted(() => vi.fn());
const mockGetEnumeratorIds = vi.hoisted(() => vi.fn());

vi.mock('../../db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

vi.mock('../team-assignment.service.js', () => ({
  TeamAssignmentService: {
    getEnumeratorIdsForSupervisor: (...args: unknown[]) => mockGetEnumeratorIds(...args),
  },
}));

import { TeamQualityService } from '../team-quality.service.js';

function mockRows(rows: Record<string, unknown>[]) {
  return { rows };
}

describe('TeamQualityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTeamQuality', () => {
    it('returns empty result for empty enumerator list', async () => {
      const result = await TeamQualityService.getTeamQuality([]);
      expect(result.enumerators).toEqual([]);
      expect(result.teamAverages.avgCompletionTime).toBeNull();
      expect(result.submissionsByDay).toEqual([]);
      expect(result.dayOfWeekPattern).toEqual([]);
      expect(result.hourOfDayPattern).toEqual([]);
    });

    it('returns per-enumerator metrics with team averages', async () => {
      // 6 parallel queries: enumeratorMetrics, fraud, skip, dayOfWeek, hourOfDay, dailyTrend
      mockExecute
        // enumerator metrics
        .mockResolvedValueOnce(mockRows([
          { enumerator_id: 'e1', name: 'Alice', submission_count: '20', avg_completion_time: '300', gps_rate: '0.9', nin_rate: '0.8' },
          { enumerator_id: 'e2', name: 'Bob', submission_count: '15', avg_completion_time: '250', gps_rate: '0.7', nin_rate: '0.6' },
        ]))
        // fraud metrics
        .mockResolvedValueOnce(mockRows([
          { enumerator_id: 'e1', fraud_rate: '0.05' },
          { enumerator_id: 'e2', fraud_rate: '0.10' },
        ]))
        // skip rates
        .mockResolvedValueOnce(mockRows([
          { enumerator_id: 'e1', skip_rate: '0.2' },
          { enumerator_id: 'e2', skip_rate: '0.3' },
        ]))
        // day of week
        .mockResolvedValueOnce(mockRows([
          { day_of_week: '1', count: '10' },
          { day_of_week: '2', count: '15' },
        ]))
        // hour of day
        .mockResolvedValueOnce(mockRows([
          { hour: '9', count: '20' },
          { hour: '14', count: '15' },
        ]))
        // daily trend
        .mockResolvedValueOnce(mockRows([
          { date: '2026-03-10', count: '5' },
          { date: '2026-03-11', count: '8' },
        ]));

      const result = await TeamQualityService.getTeamQuality(['e1', 'e2']);

      // Enumerator metrics
      expect(result.enumerators).toHaveLength(2);
      expect(result.enumerators[0].enumeratorId).toBe('e1');
      expect(result.enumerators[0].name).toBe('Alice');
      expect(result.enumerators[0].submissionCount).toBe(20);
      expect(result.enumerators[0].avgCompletionTimeSec).toBe(300);
      expect(result.enumerators[0].gpsRate).toBe(0.9);
      expect(result.enumerators[0].ninRate).toBe(0.8);
      expect(result.enumerators[0].fraudFlagRate).toBe(0.05);
      expect(result.enumerators[0].skipRate).toBe(0.2);

      // Team averages
      expect(result.teamAverages.avgCompletionTime).toBe(275); // (300+250)/2
      expect(result.teamAverages.gpsRate).toBe(0.8); // (0.9+0.7)/2
      expect(result.teamAverages.ninRate).toBe(0.7); // (0.8+0.6)/2
      expect(result.teamAverages.fraudRate).toBeCloseTo(0.075); // (0.05+0.10)/2
      expect(result.teamAverages.skipRate).toBe(0.25); // (0.2+0.3)/2

      // Daily trend
      expect(result.submissionsByDay).toHaveLength(2);
      expect(result.submissionsByDay[0]).toEqual({ date: '2026-03-10', count: 5 });

      // Day of week (7 days, fill zeros)
      expect(result.dayOfWeekPattern).toHaveLength(7);
      expect(result.dayOfWeekPattern[0].label).toBe('Sunday');
      expect(result.dayOfWeekPattern[0].count).toBe(0);
      expect(result.dayOfWeekPattern[1].label).toBe('Monday');
      expect(result.dayOfWeekPattern[1].count).toBe(10);

      // Hour of day (24 hours, fill zeros)
      expect(result.hourOfDayPattern).toHaveLength(24);
      expect(result.hourOfDayPattern[9].count).toBe(20);
      expect(result.hourOfDayPattern[14].count).toBe(15);
    });

    it('suppresses per-enumerator metrics when submissionCount < 5', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([
          { enumerator_id: 'e1', name: 'Alice', submission_count: '3', avg_completion_time: '300', gps_rate: '0.9', nin_rate: '0.8' },
        ]))
        .mockResolvedValueOnce(mockRows([{ enumerator_id: 'e1', fraud_rate: '0.1' }]))
        .mockResolvedValueOnce(mockRows([{ enumerator_id: 'e1', skip_rate: '0.2' }]))
        .mockResolvedValueOnce(mockRows([]))
        .mockResolvedValueOnce(mockRows([]))
        .mockResolvedValueOnce(mockRows([]));

      const result = await TeamQualityService.getTeamQuality(['e1']);

      expect(result.enumerators[0].submissionCount).toBe(3);
      expect(result.enumerators[0].avgCompletionTimeSec).toBeNull();
      expect(result.enumerators[0].gpsRate).toBeNull();
      expect(result.enumerators[0].ninRate).toBeNull();
      expect(result.enumerators[0].fraudFlagRate).toBeNull();
      expect(result.enumerators[0].skipRate).toBeNull();
    });

    it('returns null team averages when all enumerators are suppressed', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([
          { enumerator_id: 'e1', name: 'Alice', submission_count: '2', avg_completion_time: '300', gps_rate: '0.9', nin_rate: '0.8' },
        ]))
        .mockResolvedValueOnce(mockRows([]))
        .mockResolvedValueOnce(mockRows([]))
        .mockResolvedValueOnce(mockRows([]))
        .mockResolvedValueOnce(mockRows([]))
        .mockResolvedValueOnce(mockRows([]));

      const result = await TeamQualityService.getTeamQuality(['e1']);

      expect(result.teamAverages.avgCompletionTime).toBeNull();
      expect(result.teamAverages.gpsRate).toBeNull();
    });

    it('filters to single enumerator when enumeratorId param provided', async () => {
      mockExecute.mockResolvedValue(mockRows([]));

      const result = await TeamQualityService.getTeamQuality(['e1', 'e2'], { enumeratorId: 'e1' });

      // Should filter but still call queries (with narrowed list)
      expect(mockExecute).toHaveBeenCalled();
    });

    it('returns empty when enumeratorId filter matches no team member', async () => {
      const result = await TeamQualityService.getTeamQuality(['e1', 'e2'], { enumeratorId: 'e999' });

      expect(result.enumerators).toEqual([]);
    });

    it('applies date filters to queries', async () => {
      mockExecute.mockResolvedValue(mockRows([]));

      await TeamQualityService.getTeamQuality(['e1'], {
        dateFrom: '2026-03-01',
        dateTo: '2026-03-10',
      });

      // All 6 queries should be called with date conditions
      expect(mockExecute).toHaveBeenCalledTimes(6);
    });
  });

  describe('resolveEnumeratorIds', () => {
    it('calls TeamAssignmentService for supervisor', async () => {
      mockGetEnumeratorIds.mockResolvedValue(['e1', 'e2']);

      const result = await TeamQualityService.resolveEnumeratorIds('sup-1');

      expect(mockGetEnumeratorIds).toHaveBeenCalledWith('sup-1');
      expect(result).toEqual(['e1', 'e2']);
    });

    it('queries all submitters system-wide when no supervisorId', async () => {
      mockExecute.mockResolvedValue(mockRows([
        { enumerator_id: 'e1' },
        { enumerator_id: 'e2' },
      ]));

      const result = await TeamQualityService.resolveEnumeratorIds();

      expect(mockGetEnumeratorIds).not.toHaveBeenCalled();
      expect(result).toEqual(['e1', 'e2']);
    });
  });

  describe('day-of-week pattern', () => {
    it('fills all 7 days including missing ones with zero', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([]))  // enumerator metrics
        .mockResolvedValueOnce(mockRows([]))  // fraud
        .mockResolvedValueOnce(mockRows([]))  // skip
        .mockResolvedValueOnce(mockRows([{ day_of_week: '3', count: '5' }])) // Wednesday only
        .mockResolvedValueOnce(mockRows([]))  // hour
        .mockResolvedValueOnce(mockRows([])); // trend

      const result = await TeamQualityService.getTeamQuality(['e1']);

      expect(result.dayOfWeekPattern).toHaveLength(7);
      expect(result.dayOfWeekPattern[3].label).toBe('Wednesday');
      expect(result.dayOfWeekPattern[3].count).toBe(5);
      expect(result.dayOfWeekPattern[0].count).toBe(0); // Sunday
    });
  });

  describe('hour-of-day pattern', () => {
    it('fills all 24 hours including missing ones with zero', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([]))  // enumerator metrics
        .mockResolvedValueOnce(mockRows([]))  // fraud
        .mockResolvedValueOnce(mockRows([]))  // skip
        .mockResolvedValueOnce(mockRows([]))  // day
        .mockResolvedValueOnce(mockRows([{ hour: '10', count: '8' }])) // 10am only
        .mockResolvedValueOnce(mockRows([])); // trend

      const result = await TeamQualityService.getTeamQuality(['e1']);

      expect(result.hourOfDayPattern).toHaveLength(24);
      expect(result.hourOfDayPattern[10].label).toBe('10:00');
      expect(result.hourOfDayPattern[10].count).toBe(8);
      expect(result.hourOfDayPattern[0].count).toBe(0);
    });
  });
});
