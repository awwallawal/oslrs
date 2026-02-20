import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FraudThresholdConfig, SubmissionWithContext } from '@oslsr/types';

// ── Hoisted mocks ──────────────────────────────────────────────────────
const mockGetActiveThresholds = vi.fn();
const mockGetCurrentConfigVersion = vi.fn();
const mockDbSelect = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockDbSelect(),
          orderBy: () => ({
            limit: () => mockDbSelect(),
          }),
        }),
        orderBy: () => ({
          limit: () => mockDbSelect(),
        }),
      }),
    }),
  },
}));

vi.mock('../fraud-config.service.js', () => ({
  FraudConfigService: {
    getActiveThresholds: () => mockGetActiveThresholds(),
    getCurrentConfigVersion: () => mockGetCurrentConfigVersion(),
  },
}));

// Mock all heuristics to return known scores
const mockGpsEvaluate = vi.fn().mockResolvedValue({ score: 0, details: {} });
const mockSpeedEvaluate = vi.fn().mockResolvedValue({ score: 0, details: {} });
const mockStraightlineEvaluate = vi.fn().mockResolvedValue({ score: 0, details: {} });
const mockDuplicateEvaluate = vi.fn().mockResolvedValue({ score: 0, details: {} });
const mockOffHoursEvaluate = vi.fn().mockResolvedValue({ score: 0, details: {} });

vi.mock('../fraud-heuristics/gps-clustering.heuristic.js', () => ({
  gpsClusteringHeuristic: { key: 'gps_clustering', category: 'gps', evaluate: (...args: unknown[]) => mockGpsEvaluate(...args) },
}));
vi.mock('../fraud-heuristics/speed-run.heuristic.js', () => ({
  speedRunHeuristic: { key: 'speed_run', category: 'speed', evaluate: (...args: unknown[]) => mockSpeedEvaluate(...args) },
}));
vi.mock('../fraud-heuristics/straight-lining.heuristic.js', () => ({
  straightLiningHeuristic: { key: 'straight_lining', category: 'straightline', evaluate: (...args: unknown[]) => mockStraightlineEvaluate(...args) },
}));
vi.mock('../fraud-heuristics/duplicate-response.heuristic.js', () => ({
  duplicateResponseHeuristic: { key: 'duplicate_response', category: 'duplicate', evaluate: (...args: unknown[]) => mockDuplicateEvaluate(...args) },
}));
vi.mock('../fraud-heuristics/off-hours.heuristic.js', () => ({
  offHoursHeuristic: { key: 'off_hours', category: 'timing', evaluate: (...args: unknown[]) => mockOffHoursEvaluate(...args) },
}));

vi.mock('pino', () => ({ default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

// Import after mocks
const { FraudEngine } = await import('../fraud-engine.service.js');

// ── Defaults ───────────────────────────────────────────────────────────
const defaultThresholds: FraudThresholdConfig[] = [
  { id: '1', ruleKey: 'gps_weight', displayName: 'GPS Weight', ruleCategory: 'gps', thresholdValue: 25, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '2', ruleKey: 'speed_weight', displayName: 'Speed Weight', ruleCategory: 'speed', thresholdValue: 25, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '3', ruleKey: 'severity_low_min', displayName: 'Low Min', ruleCategory: 'severity', thresholdValue: 25, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '4', ruleKey: 'severity_medium_min', displayName: 'Med Min', ruleCategory: 'severity', thresholdValue: 50, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '5', ruleKey: 'severity_high_min', displayName: 'High Min', ruleCategory: 'severity', thresholdValue: 70, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '6', ruleKey: 'severity_critical_min', displayName: 'Critical Min', ruleCategory: 'severity', thresholdValue: 85, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
];

describe('FraudEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveThresholds.mockResolvedValue(defaultThresholds);
    mockGetCurrentConfigVersion.mockResolvedValue(1);
  });

  describe('runHeuristics', () => {
    it('runs all 5 heuristics and returns results map', async () => {
      mockGpsEvaluate.mockResolvedValue({ score: 10, details: { inCluster: true } });
      mockSpeedEvaluate.mockResolvedValue({ score: 5, details: { tier: 'speeder' } });
      mockStraightlineEvaluate.mockResolvedValue({ score: 0, details: {} });
      mockDuplicateEvaluate.mockResolvedValue({ score: 0, details: {} });
      mockOffHoursEvaluate.mockResolvedValue({ score: 0, details: {} });

      const context: SubmissionWithContext = {
        submissionId: 'sub-1',
        enumeratorId: 'enum-1',
        questionnaireFormId: 'form-1',
        submittedAt: '2026-02-20T10:00:00Z',
        gpsLatitude: 7.37,
        gpsLongitude: 3.94,
        completionTimeSeconds: 300,
        rawData: null,
        formSchema: null,
        recentSubmissions: [],
        nearbySubmissions: [],
      };

      const results = await FraudEngine.runHeuristics(context, defaultThresholds);

      expect(results.size).toBe(5);
      expect(results.get('gps_clustering')?.score).toBe(10);
      expect(results.get('speed_run')?.score).toBe(5);
      expect(results.get('straight_lining')?.score).toBe(0);
      expect(results.get('duplicate_response')?.score).toBe(0);
      expect(results.get('off_hours')?.score).toBe(0);
    });

    it('handles heuristic errors gracefully (returns 0 score)', async () => {
      mockGpsEvaluate.mockRejectedValue(new Error('GPS calculation failed'));
      mockSpeedEvaluate.mockResolvedValue({ score: 10, details: {} });
      mockStraightlineEvaluate.mockResolvedValue({ score: 0, details: {} });
      mockDuplicateEvaluate.mockResolvedValue({ score: 0, details: {} });
      mockOffHoursEvaluate.mockResolvedValue({ score: 0, details: {} });

      const context: SubmissionWithContext = {
        submissionId: 'sub-1',
        enumeratorId: 'enum-1',
        questionnaireFormId: 'form-1',
        submittedAt: '2026-02-20T10:00:00Z',
        gpsLatitude: null,
        gpsLongitude: null,
        completionTimeSeconds: null,
        rawData: null,
        formSchema: null,
        recentSubmissions: [],
        nearbySubmissions: [],
      };

      const results = await FraudEngine.runHeuristics(context, defaultThresholds);

      // GPS errored but still has entry with 0
      expect(results.get('gps_clustering')?.score).toBe(0);
      expect(results.get('gps_clustering')?.details.error).toBeDefined();
      // Speed still ran
      expect(results.get('speed_run')?.score).toBe(10);
    });

    it('skips heuristics when all category thresholds are inactive', async () => {
      const inactiveThresholds = defaultThresholds.map((t) =>
        t.ruleCategory === 'gps' ? { ...t, isActive: false } : t,
      );

      const context: SubmissionWithContext = {
        submissionId: 'sub-1',
        enumeratorId: 'enum-1',
        questionnaireFormId: 'form-1',
        submittedAt: '2026-02-20T10:00:00Z',
        gpsLatitude: null,
        gpsLongitude: null,
        completionTimeSeconds: null,
        rawData: null,
        formSchema: null,
        recentSubmissions: [],
        nearbySubmissions: [],
      };

      const results = await FraudEngine.runHeuristics(context, inactiveThresholds);

      expect(results.get('gps_clustering')?.score).toBe(0);
      expect(results.get('gps_clustering')?.details.reason).toBe('heuristic_disabled');
      // GPS evaluate should NOT have been called
      expect(mockGpsEvaluate).not.toHaveBeenCalled();
    });
  });

  describe('evaluate (severity mapping via full pipeline)', () => {
    const mockSubmissionRow = {
      id: 'sub-1',
      submittedAt: new Date('2026-02-20T10:00:00Z'),
      enumeratorId: 'enum-1',
      submitterId: 'enum-1',
      questionnaireFormId: 'form-1',
      gpsLatitude: null,
      gpsLongitude: null,
      completionTimeSeconds: null,
      rawData: null,
    };

    beforeEach(() => {
      // Mock DB to return a submission + empty recent/nearby
      mockDbSelect
        .mockResolvedValueOnce([mockSubmissionRow]) // submission lookup
        .mockResolvedValueOnce([])  // recent submissions
        .mockResolvedValue([]);     // any other queries
    });

    it('maps score 0-24 to "clean"', async () => {
      mockGpsEvaluate.mockResolvedValue({ score: 10, details: {} });
      mockSpeedEvaluate.mockResolvedValue({ score: 5, details: {} });
      mockStraightlineEvaluate.mockResolvedValue({ score: 0, details: {} });
      mockDuplicateEvaluate.mockResolvedValue({ score: 0, details: {} });
      mockOffHoursEvaluate.mockResolvedValue({ score: 0, details: {} });

      const result = await FraudEngine.evaluate('sub-1');

      expect(result.totalScore).toBe(15);
      expect(result.severity).toBe('clean');
    });

    it('maps score 25-49 to "low"', async () => {
      mockGpsEvaluate.mockResolvedValue({ score: 20, details: {} });
      mockSpeedEvaluate.mockResolvedValue({ score: 12, details: {} });
      mockStraightlineEvaluate.mockResolvedValue({ score: 0, details: {} });
      mockDuplicateEvaluate.mockResolvedValue({ score: 0, details: {} });
      mockOffHoursEvaluate.mockResolvedValue({ score: 0, details: {} });

      const result = await FraudEngine.evaluate('sub-1');

      expect(result.totalScore).toBe(32);
      expect(result.severity).toBe('low');
    });

    it('maps score 50-69 to "medium"', async () => {
      mockGpsEvaluate.mockResolvedValue({ score: 25, details: {} });
      mockSpeedEvaluate.mockResolvedValue({ score: 25, details: {} });
      mockStraightlineEvaluate.mockResolvedValue({ score: 10, details: {} });
      mockDuplicateEvaluate.mockResolvedValue({ score: 0, details: {} });
      mockOffHoursEvaluate.mockResolvedValue({ score: 0, details: {} });

      const result = await FraudEngine.evaluate('sub-1');

      expect(result.totalScore).toBe(60);
      expect(result.severity).toBe('medium');
    });

    it('maps score 70-84 to "high"', async () => {
      mockGpsEvaluate.mockResolvedValue({ score: 25, details: {} });
      mockSpeedEvaluate.mockResolvedValue({ score: 25, details: {} });
      mockStraightlineEvaluate.mockResolvedValue({ score: 15, details: {} });
      mockDuplicateEvaluate.mockResolvedValue({ score: 10, details: {} });
      mockOffHoursEvaluate.mockResolvedValue({ score: 0, details: {} });

      const result = await FraudEngine.evaluate('sub-1');

      expect(result.totalScore).toBe(75);
      expect(result.severity).toBe('high');
    });

    it('maps score 85-100 to "critical"', async () => {
      mockGpsEvaluate.mockResolvedValue({ score: 25, details: {} });
      mockSpeedEvaluate.mockResolvedValue({ score: 25, details: {} });
      mockStraightlineEvaluate.mockResolvedValue({ score: 20, details: {} });
      mockDuplicateEvaluate.mockResolvedValue({ score: 20, details: {} });
      mockOffHoursEvaluate.mockResolvedValue({ score: 10, details: {} });

      const result = await FraudEngine.evaluate('sub-1');

      expect(result.totalScore).toBe(100);
      expect(result.severity).toBe('critical');
    });

    it('caps total score at 100', async () => {
      mockGpsEvaluate.mockResolvedValue({ score: 25, details: {} });
      mockSpeedEvaluate.mockResolvedValue({ score: 25, details: {} });
      mockStraightlineEvaluate.mockResolvedValue({ score: 20, details: {} });
      mockDuplicateEvaluate.mockResolvedValue({ score: 20, details: {} });
      mockOffHoursEvaluate.mockResolvedValue({ score: 15, details: {} }); // over 10 max but heuristic could return it

      const result = await FraudEngine.evaluate('sub-1');

      expect(result.totalScore).toBeLessThanOrEqual(100);
    });

    it('includes configVersion in result', async () => {
      mockGetCurrentConfigVersion.mockResolvedValue(7);
      mockGpsEvaluate.mockResolvedValue({ score: 0, details: {} });
      mockSpeedEvaluate.mockResolvedValue({ score: 0, details: {} });
      mockStraightlineEvaluate.mockResolvedValue({ score: 0, details: {} });
      mockDuplicateEvaluate.mockResolvedValue({ score: 0, details: {} });
      mockOffHoursEvaluate.mockResolvedValue({ score: 0, details: {} });

      const result = await FraudEngine.evaluate('sub-1');

      expect(result.configVersion).toBe(7);
    });
  });
});
