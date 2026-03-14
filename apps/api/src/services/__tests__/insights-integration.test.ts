/**
 * Story 8.7: Insights, Equity, Activation integration tests
 * Mocked DB with realistic data shapes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AnalyticsScope } from '../../middleware/analytics-scope.js';

const mockExecute = vi.hoisted(() => vi.fn());
const mockRedisGet = vi.hoisted(() => vi.fn());
const mockRedisSet = vi.hoisted(() => vi.fn());

vi.mock('ioredis', () => ({
  Redis: class MockRedis {
    get = mockRedisGet;
    set = mockRedisSet;
  },
}));

vi.mock('../../db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

import { SurveyAnalyticsService } from '../survey-analytics.service.js';

function mockRows(rows: Record<string, unknown>[]) {
  return { rows };
}

const systemScope: AnalyticsScope = { type: 'system' };

// Helper: generate N rows of inferential data
function generateInferentialRows(n: number) {
  const genders = ['male', 'female'];
  const empTypes = ['wage_public', 'wage_private', 'self_employed', 'family_unpaid'];
  const eduLevels = ['none', 'primary', 'secondary', 'vocational', 'tertiary', 'postgraduate'];
  const disabilityStatuses = ['yes', 'no'];
  const maritalStatuses = ['single', 'married', 'divorced'];
  const lgaIds = ['ibadan_north', 'ibadan_south', 'ogbomoso'];
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      gender: genders[i % 2],
      employment_type: empTypes[i % 4],
      education_level: eduLevels[i % 6],
      disability_status: disabilityStatuses[i % 2 === 0 ? 1 : 0],
      marital_status: maritalStatuses[i % 3],
      is_head: i % 3 === 0 ? 'yes' : 'no',
      housing_status: i % 2 === 0 ? 'owned' : 'rented',
      has_business: i % 4 === 0 ? 'yes' : 'no',
      monthly_income: String(10000 + i * 500),
      years_experience: String(1 + (i % 15)),
      household_size: String(2 + (i % 6)),
      hours_worked: String(30 + (i % 20)),
      work_status: i % 5 === 0 ? 'unemployed' : 'employed',
      lga_id: lgaIds[i % 3],
    });
  }
  return rows;
}

describe('SurveyAnalyticsService — Story 8.7', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getInferentialInsights', () => {
    it('returns complete structure with all sections for N >= 100', async () => {
      const rows = generateInferentialRows(120);
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '120' }])) // total count
        .mockResolvedValueOnce(mockRows(rows)) // extraction query
        .mockResolvedValueOnce(mockRows([  // trends for forecast
          { day: '2026-03-01', count: '5' },
          { day: '2026-03-02', count: '6' },
          { day: '2026-03-03', count: '7' },
        ]));

      const result = await SurveyAnalyticsService.getInferentialInsights(systemScope);

      expect(result.chiSquare).toHaveLength(6); // 6 hypotheses
      expect(result.correlations.length).toBeGreaterThanOrEqual(1);
      expect(result.groupComparisons.length).toBeGreaterThanOrEqual(1);
      expect(result.proportionCIs.length).toBeGreaterThanOrEqual(3);
      expect(result.forecast).not.toBeNull();
      expect(result.thresholds.chiSquare.met).toBe(true);
      expect(result.thresholds.correlations.met).toBe(true);
    });

    it('returns threshold guards for low N', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '20' }])) // total
        .mockResolvedValueOnce(mockRows([  // trends for forecast (N >= 10)
          { day: '2026-03-01', count: '5' },
          { day: '2026-03-02', count: '6' },
        ]));

      const result = await SurveyAnalyticsService.getInferentialInsights(systemScope);

      expect(result.chiSquare).toHaveLength(0);
      expect(result.correlations).toHaveLength(0);
      expect(result.groupComparisons).toHaveLength(0);
      expect(result.proportionCIs).toHaveLength(0);
      expect(result.thresholds.chiSquare.met).toBe(false);
      expect(result.thresholds.chiSquare.currentN).toBe(20);
      expect(result.thresholds.chiSquare.requiredN).toBe(100);
    });

    it('returns per-section thresholds: N=40 has proportionCIs but not chiSquare', async () => {
      const rows = generateInferentialRows(40);
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '40' }])) // total
        .mockResolvedValueOnce(mockRows(rows)) // extraction
        .mockResolvedValueOnce(mockRows([  // trends for forecast (N >= 10)
          { day: '2026-03-01', count: '5' },
          { day: '2026-03-02', count: '6' },
        ]));

      const result = await SurveyAnalyticsService.getInferentialInsights(systemScope);

      expect(result.thresholds.chiSquare.met).toBe(false);
      expect(result.thresholds.proportionCIs.met).toBe(true);
      expect(result.chiSquare).toHaveLength(0);
      expect(result.proportionCIs.length).toBeGreaterThan(0);
    });

    it('chi-square results include required fields', async () => {
      const rows = generateInferentialRows(120);
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '120' }]))
        .mockResolvedValueOnce(mockRows(rows))
        .mockResolvedValueOnce(mockRows([
          { day: '2026-03-01', count: '5' },
          { day: '2026-03-02', count: '6' },
        ]));

      const result = await SurveyAnalyticsService.getInferentialInsights(systemScope);

      for (const chi of result.chiSquare) {
        expect(chi).toHaveProperty('hypothesis');
        expect(chi).toHaveProperty('chiSq');
        expect(chi).toHaveProperty('df');
        expect(chi).toHaveProperty('pBracket');
        expect(chi).toHaveProperty('cramersV');
        expect(chi).toHaveProperty('effectLabel');
        expect(chi).toHaveProperty('interpretation');
        expect(chi).toHaveProperty('significant');
      }
    });
  });

  describe('getExtendedEquity', () => {
    it('returns disability gap for N >= 100', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '150' }]))
        .mockResolvedValueOnce(mockRows([
          { disability_status: 'yes', total: '30', employed: '10' },
          { disability_status: 'no', total: '120', employed: '80' },
        ]))
        .mockResolvedValueOnce(mockRows(
          Array.from({ length: 50 }, (_, i) => ({
            education_level: ['primary', 'secondary', 'tertiary'][i % 3],
            employment_type: ['self_employed', 'wage_public', 'family_unpaid'][i % 3],
          })),
        ))
        .mockResolvedValueOnce(mockRows([
          { lga_id: 'ibadan_north', count: '50' },
          { lga_id: 'ibadan_south', count: '50' },
          { lga_id: 'ogbomoso', count: '50' },
        ]));

      const result = await SurveyAnalyticsService.getExtendedEquity(systemScope);

      expect(result.disabilityGap).not.toBeNull();
      expect(result.disabilityGap!.disabledEmployedRate).toBeCloseTo(10 / 30, 2);
      expect(result.disabilityGap!.nonDisabledEmployedRate).toBeCloseTo(80 / 120, 2);
      expect(result.disabilityGap!.gap).toBeGreaterThan(0);
      expect(result.thresholds.disabilityGap.met).toBe(true);
    });

    it('returns Gini coefficient = 0 for perfectly equal distribution', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '100' }]))
        .mockResolvedValueOnce(mockRows([
          { disability_status: 'no', total: '100', employed: '50' },
        ]))
        .mockResolvedValueOnce(mockRows(
          Array.from({ length: 30 }, (_, i) => ({
            education_level: 'secondary',
            employment_type: 'self_employed',
          })),
        ))
        .mockResolvedValueOnce(mockRows([
          { lga_id: 'a', count: '25' },
          { lga_id: 'b', count: '25' },
          { lga_id: 'c', count: '25' },
          { lga_id: 'd', count: '25' },
        ]));

      const result = await SurveyAnalyticsService.getExtendedEquity(systemScope);

      expect(result.giniCoefficient).not.toBeNull();
      expect(result.giniCoefficient!.value).toBeCloseTo(0, 2);
      expect(result.giniCoefficient!.interpretation).toBe('low inequality');
    });

    it('returns high Gini for very unequal distribution', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '100' }]))
        .mockResolvedValueOnce(mockRows([
          { disability_status: 'no', total: '100', employed: '50' },
        ]))
        .mockResolvedValueOnce(mockRows([]))
        .mockResolvedValueOnce(mockRows([
          { lga_id: 'a', count: '1' },
          { lga_id: 'b', count: '1' },
          { lga_id: 'c', count: '1' },
          { lga_id: 'd', count: '97' },
        ]));

      const result = await SurveyAnalyticsService.getExtendedEquity(systemScope);

      expect(result.giniCoefficient).not.toBeNull();
      expect(result.giniCoefficient!.value).toBeGreaterThan(0.4);
      expect(result.giniCoefficient!.interpretation).toBe('high inequality');
    });

    it('education alignment: all tier-matched → 100% aligned', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '100' }]))
        .mockResolvedValueOnce(mockRows([
          { disability_status: 'no', total: '100', employed: '50' },
        ]))
        .mockResolvedValueOnce(mockRows(
          // All tertiary + wage_public = Tier 3 + Tier 3 = aligned
          Array.from({ length: 20 }, () => ({
            education_level: 'tertiary',
            employment_type: 'wage_public',
          })),
        ))
        .mockResolvedValueOnce(mockRows([
          { lga_id: 'a', count: '50' },
          { lga_id: 'b', count: '50' },
        ]));

      const result = await SurveyAnalyticsService.getExtendedEquity(systemScope);

      expect(result.educationAlignment).not.toBeNull();
      expect(result.educationAlignment!.alignedPct).toBeCloseTo(100, 0);
    });

    it('education alignment: tertiary + family_unpaid → over-qualified', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '100' }]))
        .mockResolvedValueOnce(mockRows([
          { disability_status: 'no', total: '100', employed: '50' },
        ]))
        .mockResolvedValueOnce(mockRows(
          // All tertiary (T3) + family_unpaid (T1) = over-qualified
          Array.from({ length: 20 }, () => ({
            education_level: 'tertiary',
            employment_type: 'family_unpaid',
          })),
        ))
        .mockResolvedValueOnce(mockRows([
          { lga_id: 'a', count: '50' },
          { lga_id: 'b', count: '50' },
        ]));

      const result = await SurveyAnalyticsService.getExtendedEquity(systemScope);

      expect(result.educationAlignment).not.toBeNull();
      expect(result.educationAlignment!.overQualifiedPct).toBeCloseTo(100, 0);
    });

    it('returns null for low N', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{ total: '20' }]));

      const result = await SurveyAnalyticsService.getExtendedEquity(systemScope);

      expect(result.disabilityGap).toBeNull();
      expect(result.educationAlignment).toBeNull();
      expect(result.giniCoefficient).toBeNull();
      expect(result.thresholds.disabilityGap.met).toBe(false);
    });
  });

  describe('getActivationStatus', () => {
    it('returns activation status for all features', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{ total: '75' }]));

      const result = await SurveyAnalyticsService.getActivationStatus(systemScope);

      expect(result.totalSubmissions).toBe(75);
      expect(result.features.length).toBe(13); // 8 Phase 4 + 5 Phase 5
      // Phase 5 always dormant
      const phase5 = result.features.filter(f => f.phase === 5);
      expect(phase5.every(f => f.category === 'dormant')).toBe(true);
      expect(phase5.every(f => f.met === false)).toBe(true);
    });

    it('marks Phase 4 features as active when threshold met', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{ total: '200' }]));

      const result = await SurveyAnalyticsService.getActivationStatus(systemScope);

      const chiSquare = result.features.find(f => f.id === 'chi_square');
      expect(chiSquare?.met).toBe(true);
      expect(chiSquare?.category).toBe('active');
    });

    it('marks features as approaching when > 50% of threshold', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{ total: '60' }]));

      const result = await SurveyAnalyticsService.getActivationStatus(systemScope);

      // chi_square needs 100, at 60 that's 60% → approaching
      const chiSquare = result.features.find(f => f.id === 'chi_square');
      expect(chiSquare?.category).toBe('approaching');
    });
  });

  // ---------------------------------------------------------------------------
  // Gap 1 & 2: Key findings cache write + cache hit path
  //
  // We mock ioredis at the module level and temporarily disable isTestMode()
  // by toggling process.env.VITEST / NODE_ENV so getRedisClient() returns
  // the mock Redis instance instead of null.
  // ---------------------------------------------------------------------------
  describe('key findings Redis cache', () => {
    let origVitest: string | undefined;
    let origNodeEnv: string | undefined;

    beforeEach(() => {
      origVitest = process.env.VITEST;
      origNodeEnv = process.env.NODE_ENV;
      process.env.VITEST = 'false';
      process.env.NODE_ENV = 'development';
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');
    });

    afterEach(() => {
      process.env.VITEST = origVitest;
      process.env.NODE_ENV = origNodeEnv;
    });

    it('Gap 1: writes key findings to analytics:public:key-findings for system scope with N >= 100', async () => {
      const rows = generateInferentialRows(120);
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '120' }]))
        .mockResolvedValueOnce(mockRows(rows))
        .mockResolvedValueOnce(mockRows([
          { day: '2026-03-01', count: '5' },
          { day: '2026-03-02', count: '6' },
          { day: '2026-03-03', count: '7' },
        ]));

      const result = await SurveyAnalyticsService.getInferentialInsights(systemScope);

      // Verify chi-square produced significant results (data is structured enough)
      const significantCount = result.chiSquare.filter(r => r.significant).length;
      expect(significantCount).toBeGreaterThan(0);

      // Verify key findings were written to Redis
      const keyFindingsCall = mockRedisSet.mock.calls.find(
        (call: unknown[]) => call[0] === 'analytics:public:key-findings',
      );
      expect(keyFindingsCall).toBeDefined();

      const findings = JSON.parse(keyFindingsCall![1] as string);
      expect(Array.isArray(findings)).toBe(true);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.length).toBeLessThanOrEqual(3); // capped at top 3
    });

    it('Gap 2: returns cached result on cache hit and skips DB queries', async () => {
      const cachedResult = {
        chiSquare: [],
        correlations: [],
        groupComparisons: [],
        proportionCIs: [],
        forecast: null,
        thresholds: {
          chiSquare: { met: true, currentN: 200, requiredN: 100 },
          correlations: { met: true, currentN: 200, requiredN: 100 },
          groupComparisons: { met: true, currentN: 200, requiredN: 50 },
          proportionCIs: { met: true, currentN: 200, requiredN: 30 },
          forecast: { met: true, currentN: 200, requiredN: 10 },
        },
      };
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedResult));

      const result = await SurveyAnalyticsService.getInferentialInsights(systemScope);

      expect(result).toEqual(cachedResult);
      // DB should NOT be queried — cache hit returns immediately
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });
});
