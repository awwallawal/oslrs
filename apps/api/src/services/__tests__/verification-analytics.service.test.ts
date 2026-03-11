import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.hoisted(() => vi.fn());

vi.mock('../../db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

import { VerificationAnalyticsService } from '../verification-analytics.service.js';

function mockRows(rows: Record<string, unknown>[]) {
  return { rows };
}

describe('VerificationAnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getVerificationFunnel', () => {
    it('returns all funnel counts', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ count: '100' }]))
        .mockResolvedValueOnce(mockRows([{ flagged: '30', reviewed: '20', approved: '15', rejected: '5' }]));

      const result = await VerificationAnalyticsService.getVerificationFunnel();
      expect(result.totalSubmissions).toBe(100);
      expect(result.totalFlagged).toBe(30);
      expect(result.totalReviewed).toBe(20);
      expect(result.totalApproved).toBe(15);
      expect(result.totalRejected).toBe(5);
    });

    it('returns zeros for empty data', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ count: '0' }]))
        .mockResolvedValueOnce(mockRows([{ flagged: '0', reviewed: '0', approved: '0', rejected: '0' }]));

      const result = await VerificationAnalyticsService.getVerificationFunnel();
      expect(result.totalSubmissions).toBe(0);
      expect(result.totalFlagged).toBe(0);
    });
  });

  describe('getFraudTypeBreakdown', () => {
    it('returns per-heuristic counts', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{
        gps_cluster: '10', speed_run: '8', straight_lining: '5', duplicate_response: '3', off_hours: '2',
      }]));

      const result = await VerificationAnalyticsService.getFraudTypeBreakdown();
      expect(result.gpsCluster).toBe(10);
      expect(result.speedRun).toBe(8);
      expect(result.straightLining).toBe(5);
      expect(result.duplicateResponse).toBe(3);
      expect(result.offHours).toBe(2);
    });

    it('returns zeros for no flagged submissions', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{
        gps_cluster: '0', speed_run: '0', straight_lining: '0', duplicate_response: '0', off_hours: '0',
      }]));

      const result = await VerificationAnalyticsService.getFraudTypeBreakdown();
      expect(result.gpsCluster).toBe(0);
    });
  });

  describe('getReviewThroughput', () => {
    it('returns daily reviewed/approved/rejected counts', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([
        { date: '2026-03-10', reviewed_count: '5', approved_count: '3', rejected_count: '2' },
        { date: '2026-03-11', reviewed_count: '8', approved_count: '6', rejected_count: '2' },
      ]));

      const result = await VerificationAnalyticsService.getReviewThroughput();
      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2026-03-10');
      expect(result[0].reviewedCount).toBe(5);
      expect(result[0].approvedCount).toBe(3);
      expect(result[1].rejectedCount).toBe(2);
    });

    it('returns empty array when no reviews', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([]));
      const result = await VerificationAnalyticsService.getReviewThroughput();
      expect(result).toEqual([]);
    });
  });

  describe('getTopFlaggedEnumerators', () => {
    it('returns enumerators with flag counts and approval rate', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([
        { enumerator_id: 'e1', name: 'Adamu', flag_count: '15', critical_count: '3', high_count: '5', total_assessed: '10', approved_count: '6' },
        { enumerator_id: 'e2', name: 'Bola', flag_count: '8', critical_count: '1', high_count: '2', total_assessed: '5', approved_count: '4' },
      ]));

      const result = await VerificationAnalyticsService.getTopFlaggedEnumerators();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Adamu');
      expect(result[0].flagCount).toBe(15);
      expect(result[0].approvalRate).toBe(0.6);
      expect(result[1].approvalRate).toBe(0.8);
    });

    it('returns 0 approval rate when none assessed', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([
        { enumerator_id: 'e1', name: 'Test', flag_count: '5', critical_count: '0', high_count: '2', total_assessed: '0', approved_count: '0' },
      ]));

      const result = await VerificationAnalyticsService.getTopFlaggedEnumerators();
      expect(result[0].approvalRate).toBe(0);
    });
  });

  describe('getBacklogTrend', () => {
    it('returns daily pending and high/critical counts', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([
        { day: '2026-03-10', pending_count: '12', high_critical_count: '4' },
        { day: '2026-03-11', pending_count: '10', high_critical_count: '3' },
      ]));

      const result = await VerificationAnalyticsService.getBacklogTrend();
      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2026-03-10');
      expect(result[0].pendingCount).toBe(12);
      expect(result[0].highCriticalCount).toBe(4);
    });
  });

  describe('getRejectionReasons', () => {
    it('returns reason frequencies with percentages', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([
        { reason: 'confirmed_fraud', count: '15' },
        { reason: 'needs_investigation', count: '10' },
        { reason: 'false_positive', count: '5' },
      ]));

      const result = await VerificationAnalyticsService.getRejectionReasons();
      expect(result).toHaveLength(3);
      expect(result[0].reason).toBe('confirmed_fraud');
      expect(result[0].count).toBe(15);
      expect(result[0].percentage).toBe(50);
    });

    it('suppresses reasons with fewer than 5 items', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([
        { reason: 'confirmed_fraud', count: '20' },
        { reason: 'dismissed', count: '3' },
      ]));

      const result = await VerificationAnalyticsService.getRejectionReasons();
      expect(result).toHaveLength(1);
      expect(result[0].reason).toBe('confirmed_fraud');
    });
  });

  describe('getAvgReviewTime', () => {
    it('returns average review time in minutes', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{ avg_minutes: '45.5' }]));
      const result = await VerificationAnalyticsService.getAvgReviewTime();
      expect(result).toBe(45.5);
    });

    it('returns null when no reviews', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{ avg_minutes: null }]));
      const result = await VerificationAnalyticsService.getAvgReviewTime();
      expect(result).toBeNull();
    });
  });

  describe('getTimeToResolution', () => {
    it('returns median days to resolution', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{ median_days: '2.5' }]));
      const result = await VerificationAnalyticsService.getTimeToResolution();
      expect(result).toBe(2.5);
    });

    it('returns null when no resolved detections', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{ median_days: null }]));
      const result = await VerificationAnalyticsService.getTimeToResolution();
      expect(result).toBeNull();
    });
  });

  describe('getDataQualityScore', () => {
    it('returns completeness and consistency rates', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '100', complete: '95' }]))
        .mockResolvedValueOnce(mockRows([{ total: '50', clean: '40' }]));

      const result = await VerificationAnalyticsService.getDataQualityScore();
      expect(result.completenessRate).toBe(95);
      expect(result.consistencyRate).toBe(80);
    });

    it('returns 0 for empty data', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '0', complete: '0' }]))
        .mockResolvedValueOnce(mockRows([{ total: '0', clean: '0' }]));

      const result = await VerificationAnalyticsService.getDataQualityScore();
      expect(result.completenessRate).toBe(0);
      expect(result.consistencyRate).toBe(0);
    });
  });

  describe('getFullPipelineData', () => {
    it('orchestrates all methods and returns complete pipeline data', async () => {
      // Spy on individual methods to avoid parallel mock ordering issues
      const spies = {
        funnel: vi.spyOn(VerificationAnalyticsService, 'getVerificationFunnel').mockResolvedValue({
          totalSubmissions: 100, totalFlagged: 30, totalReviewed: 20, totalApproved: 15, totalRejected: 5,
        }),
        breakdown: vi.spyOn(VerificationAnalyticsService, 'getFraudTypeBreakdown').mockResolvedValue({
          gpsCluster: 10, speedRun: 8, straightLining: 5, duplicateResponse: 3, offHours: 2,
        }),
        throughput: vi.spyOn(VerificationAnalyticsService, 'getReviewThroughput').mockResolvedValue([
          { date: '2026-03-11', reviewedCount: 5, approvedCount: 3, rejectedCount: 2 },
        ]),
        topFlagged: vi.spyOn(VerificationAnalyticsService, 'getTopFlaggedEnumerators').mockResolvedValue([
          { enumeratorId: 'e1', name: 'Adamu', flagCount: 10, criticalCount: 2, highCount: 3, approvalRate: 0.75 },
        ]),
        backlog: vi.spyOn(VerificationAnalyticsService, 'getBacklogTrend').mockResolvedValue([
          { date: '2026-03-11', pendingCount: 10, highCriticalCount: 3 },
        ]),
        rejection: vi.spyOn(VerificationAnalyticsService, 'getRejectionReasons').mockResolvedValue([
          { reason: 'confirmed_fraud', count: 15, percentage: 100 },
        ]),
        avgTime: vi.spyOn(VerificationAnalyticsService, 'getAvgReviewTime').mockResolvedValue(30),
        resolution: vi.spyOn(VerificationAnalyticsService, 'getTimeToResolution').mockResolvedValue(2),
        quality: vi.spyOn(VerificationAnalyticsService, 'getDataQualityScore').mockResolvedValue({
          completenessRate: 90, consistencyRate: 90,
        }),
      };

      const result = await VerificationAnalyticsService.getFullPipelineData({ lgaId: 'test' });

      expect(result.funnel.totalSubmissions).toBe(100);
      expect(result.fraudTypeBreakdown.gpsCluster).toBe(10);
      expect(result.throughputTrend).toHaveLength(1);
      expect(result.topFlaggedEnumerators).toHaveLength(1);
      expect(result.backlogTrend).toHaveLength(1);
      expect(result.rejectionReasons).toHaveLength(1);
      expect(result.avgReviewTimeMinutes).toBe(30);
      expect(result.medianTimeToResolutionDays).toBe(2);
      expect(result.dataQualityScore.completenessRate).toBe(90);
      expect(result.dataQualityScore.consistencyRate).toBe(90);

      // Verify all methods were called with the same params
      for (const spy of Object.values(spies)) {
        expect(spy).toHaveBeenCalledWith({ lgaId: 'test' });
        spy.mockRestore();
      }
    });
  });

  describe('filter parameters', () => {
    it('passes lgaId filter through to queries', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ count: '50' }]))
        .mockResolvedValueOnce(mockRows([{ flagged: '10', reviewed: '5', approved: '3', rejected: '2' }]));

      await VerificationAnalyticsService.getVerificationFunnel({ lgaId: 'akinyele' });

      expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it('passes date range filters', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{
        gps_cluster: '5', speed_run: '3', straight_lining: '2', duplicate_response: '1', off_hours: '0',
      }]));

      const result = await VerificationAnalyticsService.getFraudTypeBreakdown({
        dateFrom: '2026-03-01',
        dateTo: '2026-03-11',
      });

      expect(result.gpsCluster).toBe(5);
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it('passes severity filter', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{
        gps_cluster: '3', speed_run: '2', straight_lining: '1', duplicate_response: '0', off_hours: '0',
      }]));

      const result = await VerificationAnalyticsService.getFraudTypeBreakdown({
        severity: ['high', 'critical'],
      });

      expect(result.gpsCluster).toBe(3);
    });
  });
});
