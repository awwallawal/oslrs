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

import { PersonalStatsService } from '../personal-stats.service.js';

function mockRows(rows: Record<string, unknown>[]) {
  return { rows };
}

/**
 * Universal default mock — returns one row with all fields any query might read.
 * Each query only reads what it expects, so extra fields are harmlessly ignored.
 */
function setupUniversalMock(overrides: Record<string, unknown> = {}) {
  const defaultRow = {
    cumulative_count: '25',
    avg_completion_time: '280',
    gps_rate: '0.92',
    nin_rate: '0.85',
    skip_rate: '0.15',
    fraud_rate: '0.04',
    avg_time: '300',
    supervisor_id: 'sup-1',
    lga_id: 'ibadan',
    total: '25',
    count: '5',
    date: '2026-03-10',
    label: 'male',
    skill: 'carpentry',
    id: 'e1',
    ...overrides,
  };

  mockExecute.mockResolvedValue(mockRows([defaultRow]));
  mockGetEnumeratorIds.mockResolvedValue(['e1', 'e2']);
}

describe('PersonalStatsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPersonalStats', () => {
    it('returns all expected fields for enumerator', async () => {
      setupUniversalMock();

      const result = await PersonalStatsService.getPersonalStats('user-1', {}, false);

      expect(result.cumulativeCount).toBe(25);
      expect(result.avgCompletionTimeSec).toBe(280);
      expect(result.gpsRate).toBe(0.92);
      expect(result.ninRate).toBe(0.85);
      expect(result.fraudFlagRate).toBe(0.04);
      expect(result.dailyTrend).toHaveLength(1);
      expect(result.respondentDiversity.genderSplit).toHaveLength(1);
      expect(result.topSkillsCollected).toHaveLength(1);
      expect(result.compositeQualityScore).not.toBeNull();
      expect(result.compositeQualityScore).toBeGreaterThan(0);
    });

    it('returns team comparison metrics when supervisor exists', async () => {
      setupUniversalMock();

      const result = await PersonalStatsService.getPersonalStats('user-1');

      expect(result.teamAvgCompletionTimeSec).toBe(300);
      expect(result.teamAvgFraudRate).toBe(0.04);
    });

    it('handles no supervisor and no LGA gracefully', async () => {
      setupUniversalMock({ supervisor_id: null, lga_id: null });
      // Return empty rows for supervisor/LGA lookups
      mockExecute.mockResolvedValue(mockRows([]));
      mockGetEnumeratorIds.mockResolvedValue([]);

      const result = await PersonalStatsService.getPersonalStats('user-orphan');

      expect(result.teamAvgFraudRate).toBeNull();
      expect(result.teamAvgCompletionTimeSec).toBeNull();
      expect(result.cumulativeCount).toBe(0);
    });

    it('passes isClerk flag to scorecard', async () => {
      setupUniversalMock();

      const result = await PersonalStatsService.getPersonalStats('clerk-1', {}, true);

      expect(typeof result.compositeQualityScore).toBe('number');
    });

    it('applies date filters', async () => {
      setupUniversalMock();

      await PersonalStatsService.getPersonalStats('user-1', {
        dateFrom: '2026-03-01',
        dateTo: '2026-03-10',
      });

      expect(mockExecute).toHaveBeenCalled();
    });
  });

  describe('computeScorecard', () => {
    const metrics = {
      gpsRate: 0.95,
      ninRate: 0.85,
      avgCompletionTimeSec: 300,
      skipRate: 0.1,
      fraudFlagRate: 0.02,
      teamAvgCompletionTimeSec: 280,
    };
    const diversity = {
      genderSplit: [
        { label: 'male', count: 15, percentage: 60 },
        { label: 'female', count: 10, percentage: 40 },
      ],
      ageSpread: [
        { label: '25-34', count: 12, percentage: 48 },
        { label: '35-44', count: 8, percentage: 32 },
        { label: '15-24', count: 5, percentage: 20 },
      ],
    };

    it('computes enumerator scorecard with GPS weight', () => {
      const scorecard = PersonalStatsService.computeScorecard(metrics, diversity, false);

      expect(scorecard.gpsScore).toBeCloseTo(95);
      expect(scorecard.ninScore).toBeCloseTo(85);
      expect(scorecard.completionTimeScore).toBe(100);
      expect(scorecard.skipScore).toBeCloseTo(90);
      expect(scorecard.rejectionScore).toBeCloseTo(98);
      expect(scorecard.diversityScore).not.toBeNull();
      expect(scorecard.compositeScore).toBeGreaterThan(0);
      expect(scorecard.compositeScore).toBeLessThanOrEqual(100);
    });

    it('computes clerk scorecard without GPS (null gpsScore)', () => {
      const scorecard = PersonalStatsService.computeScorecard(metrics, diversity, true);

      expect(scorecard.gpsScore).toBeNull();
      expect(scorecard.ninScore).toBeCloseTo(85);
      expect(scorecard.compositeScore).toBeGreaterThan(0);
    });

    it('returns null composite when all metrics are null', () => {
      const nullMetrics = {
        gpsRate: null,
        ninRate: null,
        avgCompletionTimeSec: null,
        skipRate: null,
        fraudFlagRate: null,
        teamAvgCompletionTimeSec: null,
      };
      const emptyDiversity = { genderSplit: [], ageSpread: [] };

      const scorecard = PersonalStatsService.computeScorecard(nullMetrics, emptyDiversity);

      expect(scorecard.compositeScore).toBeNull();
    });

    it('handles completion time outlier scoring', () => {
      const slowMetrics = { ...metrics, avgCompletionTimeSec: 600 };
      const scorecard = PersonalStatsService.computeScorecard(slowMetrics, diversity);

      expect(scorecard.completionTimeScore).toBeLessThan(100);
      expect(scorecard.completionTimeScore).toBeGreaterThanOrEqual(0);
    });

    it('diversity score is 0-100', () => {
      const scorecard = PersonalStatsService.computeScorecard(metrics, diversity);
      expect(scorecard.diversityScore).toBeGreaterThanOrEqual(0);
      expect(scorecard.diversityScore).toBeLessThanOrEqual(100);
    });

    it('handles extreme completion time', () => {
      const extremeMetrics = { ...metrics, avgCompletionTimeSec: 1000 };
      const scorecard = PersonalStatsService.computeScorecard(extremeMetrics, diversity);
      expect(scorecard.completionTimeScore).toBeGreaterThanOrEqual(0);
    });
  });
});
