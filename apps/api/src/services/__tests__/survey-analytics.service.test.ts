import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnalyticsScope } from '../../middleware/analytics-scope.js';
import type { AnalyticsQueryParams } from '@oslsr/types';
import { CrossTabDimension } from '@oslsr/types';
import {
  analyticsCacheKey,
  ANALYTICS_CACHE_VERSION,
  PUBLIC_KEY_FINDINGS_CACHE_KEY,
} from '../analytics-cache-keys.js';

// Hoisted mock for db.execute
const mockExecute = vi.hoisted(() => vi.fn());

vi.mock('../../db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

import { SurveyAnalyticsService } from '../survey-analytics.service.js';

// Helper: mock db.execute to return given rows
function mockRows(rows: Record<string, unknown>[]) {
  return { rows };
}

const systemScope: AnalyticsScope = { type: 'system' };
const lgaScope: AnalyticsScope = { type: 'lga', lgaId: 'lga-uuid', lgaCode: 'ibadan_north' };
const personalScope: AnalyticsScope = { type: 'personal', userId: 'user-123' };
const emptyParams: AnalyticsQueryParams = {};

describe('SurveyAnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDemographics', () => {
    it('returns demographic stats with system scope including consent rates', async () => {
      // Mock: total, gender, age, edu, marital, disability, lga, consent_mkt, consent_enr (9 calls)
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '100' }])) // total
        .mockResolvedValueOnce(mockRows([{ label: 'male', count: '60' }, { label: 'female', count: '40' }])) // gender
        .mockResolvedValueOnce(mockRows([{ label: '20-24', count: '30' }, { label: '25-29', count: '70' }])) // age
        .mockResolvedValueOnce(mockRows([{ label: 'sss', count: '50' }])) // edu
        .mockResolvedValueOnce(mockRows([{ label: 'married', count: '60' }])) // marital
        .mockResolvedValueOnce(mockRows([{ label: 'no', count: '90' }])) // disability
        .mockResolvedValueOnce(mockRows([{ label: 'Ibadan North', count: '40' }])) // lga
        .mockResolvedValueOnce(mockRows([{ label: 'yes', count: '70' }, { label: 'no', count: '30' }])) // consent marketplace
        .mockResolvedValueOnce(mockRows([{ label: 'yes', count: '55' }, { label: 'no', count: '45' }])); // consent enriched

      const result = await SurveyAnalyticsService.getDemographics(systemScope);

      expect(result.genderDistribution).toHaveLength(2);
      expect(result.genderDistribution[0]).toEqual({
        label: 'male', count: 60, percentage: 60,
      });
      expect(result.ageDistribution).toHaveLength(2);
      expect(result.educationDistribution).toHaveLength(1);
      expect(result.maritalDistribution).toHaveLength(1);
      expect(result.disabilityPrevalence).toHaveLength(1);
      expect(result.lgaDistribution).toHaveLength(1);
      expect(result.consentMarketplace).toHaveLength(2);
      expect(result.consentMarketplace[0]).toEqual({ label: 'yes', count: 70, percentage: 70 });
      expect(result.consentEnriched).toHaveLength(2);
      expect(result.consentEnriched[0]).toEqual({ label: 'yes', count: 55, percentage: 55 });
    });

    it('applies LGA scope filter', async () => {
      mockExecute.mockResolvedValue(mockRows([{ total: '0' }]));
      await SurveyAnalyticsService.getDemographics(lgaScope);
      // Verify db.execute was called (scope filter embedded in SQL)
      expect(mockExecute).toHaveBeenCalled();
    });

    it('applies personal scope filter', async () => {
      mockExecute.mockResolvedValue(mockRows([{ total: '0' }]));
      await SurveyAnalyticsService.getDemographics(personalScope);
      expect(mockExecute).toHaveBeenCalled();
    });

    it('handles empty results', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '0' }])) // total
        .mockResolvedValueOnce(mockRows([])) // gender
        .mockResolvedValueOnce(mockRows([])) // age
        .mockResolvedValueOnce(mockRows([])) // edu
        .mockResolvedValueOnce(mockRows([])) // marital
        .mockResolvedValueOnce(mockRows([])) // disability
        .mockResolvedValueOnce(mockRows([])) // lga
        .mockResolvedValueOnce(mockRows([])) // consent marketplace
        .mockResolvedValueOnce(mockRows([])); // consent enriched

      const result = await SurveyAnalyticsService.getDemographics(systemScope);
      expect(result.genderDistribution).toEqual([]);
      expect(result.consentMarketplace).toEqual([]);
      expect(result.consentEnriched).toEqual([]);
    });

    it('suppresses small buckets (count < 5) including consent', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '100' }]))
        .mockResolvedValueOnce(mockRows([
          { label: 'male', count: '96' },
          { label: 'other', count: '4' }, // below threshold
        ]))
        .mockResolvedValueOnce(mockRows([])) // age
        .mockResolvedValueOnce(mockRows([])) // edu
        .mockResolvedValueOnce(mockRows([])) // marital
        .mockResolvedValueOnce(mockRows([])) // disability
        .mockResolvedValueOnce(mockRows([])) // lga
        .mockResolvedValueOnce(mockRows([
          { label: 'yes', count: '97' },
          { label: 'no', count: '3' }, // below threshold
        ])) // consent marketplace
        .mockResolvedValueOnce(mockRows([])); // consent enriched

      const result = await SurveyAnalyticsService.getDemographics(systemScope);
      expect(result.genderDistribution[1].suppressed).toBe(true);
      expect(result.genderDistribution[1].count).toBeNull();
      expect(result.consentMarketplace[1].suppressed).toBe(true);
      expect(result.consentMarketplace[1].count).toBeNull();
    });
  });

  describe('getEmployment', () => {
    it('returns employment stats with work status breakdown', async () => {
      // 8 calls: total + 7 distribution queries
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '200' }]))
        .mockResolvedValueOnce(mockRows([
          { label: 'employed', count: '120' },
          { label: 'not_in_labour_force', count: '80' },
        ]))
        .mockResolvedValue(mockRows([]));

      const result = await SurveyAnalyticsService.getEmployment(systemScope);
      expect(result.workStatusBreakdown).toHaveLength(2);
      expect(result.workStatusBreakdown[0].label).toBe('employed');
    });

    it('handles query params filtering', async () => {
      mockExecute.mockResolvedValue(mockRows([{ total: '0' }]));
      const params: AnalyticsQueryParams = {
        dateFrom: '2026-01-01',
        dateTo: '2026-03-01',
        source: 'enumerator',
      };
      await SurveyAnalyticsService.getEmployment(systemScope, params);
      expect(mockExecute).toHaveBeenCalled();
    });
  });

  describe('getHousehold', () => {
    it('returns household stats with aggregates', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '50' }]))
        .mockResolvedValueOnce(mockRows([{ label: '4-6', count: '25' }])) // size
        .mockResolvedValueOnce(mockRows([{ label: 'male', count: '30' }])) // head
        .mockResolvedValueOnce(mockRows([{ label: 'rented', count: '20' }])) // housing
        .mockResolvedValueOnce(mockRows([{
          dependency_ratio: '0.45',
          biz_owners: '15',
          biz_registered: '8',
          apprentice_total: '12',
          total_count: '50',
          // Story 12-5: the per-field bases. 40 people were ASKED about a
          // business; the other 10 of the 50 never were.
          household_size_n: '48',
          has_business_n: '40',
          apprentice_n: '35',
        }]));

      const result = await SurveyAnalyticsService.getHousehold(systemScope);
      expect(result.dependencyRatio).toBe(0.45);
      expect(result.businessRegistrationRate).toBe(53.3);
      expect(result.apprenticeTotal).toBe(12);

      // Ruling R-E: 15 owners over the 40 ASKED, not over all 50 with answers.
      // 30% was the old, coarse figure — it counted the 10 never asked as
      // "does not own a business". This assertion fails if that regresses.
      expect(result.businessOwnershipRate).toBe(37.5);
      expect(result.businessOwnershipRate).not.toBe(30);
    });

    it('publishes the base each household statistic was computed over (AC4)', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '50' }]))
        .mockResolvedValueOnce(mockRows([{ label: '4-6', count: '25' }]))
        .mockResolvedValueOnce(mockRows([{ label: 'male', count: '30' }]))
        .mockResolvedValueOnce(mockRows([{ label: 'rented', count: '20' }]))
        .mockResolvedValueOnce(mockRows([{
          dependency_ratio: '0.45', biz_owners: '15', biz_registered: '8',
          apprentice_total: '12', total_count: '50',
          household_size_n: '48', has_business_n: '40', apprentice_n: '35',
        }]));

      const result = await SurveyAnalyticsService.getHousehold(systemScope);
      // Four statistics, four DIFFERENT bases — that difference is the
      // information, and inferring any of them from a rounded ratio was the
      // defect Story 12-5 exists to end.
      expect(result.denominators).toEqual({
        dependencyRatio: 48,
        businessOwnership: 40,
        businessRegistration: 15,
        apprenticeTotal: 35,
      });
    });

    it('publishes no base for a statistic it suppressed', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '30' }]))
        .mockResolvedValueOnce(mockRows([{ label: '4-6', count: '25' }]))
        .mockResolvedValueOnce(mockRows([{ label: 'male', count: '30' }]))
        .mockResolvedValueOnce(mockRows([{ label: 'rented', count: '20' }]))
        .mockResolvedValueOnce(mockRows([{
          dependency_ratio: null, biz_owners: '2', biz_registered: '1',
          apprentice_total: '2', total_count: '30',
          household_size_n: '28', has_business_n: '25', apprentice_n: '20',
        }]));

      const result = await SurveyAnalyticsService.getHousehold(systemScope);
      // A base under a figure we are not showing is noise.
      expect(result.businessOwnershipRate).toBeNull();
      expect(result.denominators.businessOwnership).toBeNull();
      expect(result.dependencyRatio).toBeNull();
      expect(result.denominators.dependencyRatio).toBeNull();
      expect(result.denominators.apprenticeTotal).toBeNull();
    });

    it('returns null for suppressed scalar values', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '3' }]))
        .mockResolvedValue(mockRows([{
          dependency_ratio: null,
          biz_owners: '3', // below threshold
          biz_registered: '1',
          apprentice_total: '2', // below threshold
          total_count: '3',
          household_size_n: '3',
          has_business_n: '3',
          apprentice_n: '3',
        }]));

      const result = await SurveyAnalyticsService.getHousehold(systemScope);
      expect(result.businessOwnershipRate).toBeNull();
      expect(result.apprenticeTotal).toBeNull();
    });
  });

  describe('getSkillsFrequency', () => {
    it('returns top skills sorted by count', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '100' }]))
        .mockResolvedValueOnce(mockRows([
          { skill: 'welding', count: '30' },
          { skill: 'carpentry', count: '20' },
          { skill: 'tailoring', count: '10' },
        ]));

      const result = await SurveyAnalyticsService.getSkillsFrequency(systemScope);
      expect(result.skills).toHaveLength(3);
      expect(result.skills[0]).toEqual({ skill: 'welding', count: 30, percentage: 30 });
      expect(result.skills[1]).toEqual({ skill: 'carpentry', count: 20, percentage: 20 });
      // Story 12-5: the denominator the percentages divide by ships with them.
      expect(result.respondentsAnswering).toBe(100);
    });

    it('respects custom limit', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '50' }]))
        .mockResolvedValueOnce(mockRows([{ skill: 'plumbing', count: '10' }]));

      const result = await SurveyAnalyticsService.getSkillsFrequency(systemScope, {}, 5);
      expect(result.skills).toHaveLength(1);
      expect(result.respondentsAnswering).toBe(50);
    });

    it('clamps limit to valid range', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '0' }]))
        .mockResolvedValueOnce(mockRows([]));

      await SurveyAnalyticsService.getSkillsFrequency(systemScope, {}, 200);
      // Should not crash; limit clamped to 100
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it('returns empty for no submissions with skills', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '0' }]))
        .mockResolvedValueOnce(mockRows([]));

      const result = await SurveyAnalyticsService.getSkillsFrequency(systemScope);
      expect(result.skills).toEqual([]);
      expect(result.respondentsAnswering).toBe(0);
    });

    it('filters out skills below suppression threshold (count < 5)', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '100' }]))
        .mockResolvedValueOnce(mockRows([
          { skill: 'welding', count: '30' },
          { skill: 'rare_skill', count: '4' }, // below threshold
          { skill: 'very_rare', count: '1' }, // below threshold
        ]));

      const result = await SurveyAnalyticsService.getSkillsFrequency(systemScope);
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].skill).toBe('welding');
      // The denominator counts PEOPLE who answered, so suppressing rare skills
      // from the display must not shrink it.
      expect(result.respondentsAnswering).toBe(100);
    });
  });

  describe('getTrends', () => {
    it('returns daily trend data', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([
        { date: '2026-03-01', count: '10' },
        { date: '2026-03-02', count: '15' },
      ]));

      const result = await SurveyAnalyticsService.getTrends(systemScope, {}, 'day', 7);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ date: '2026-03-01', count: 10 });
    });

    it('supports weekly granularity', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([
        { date: '2026-03-01', count: '50' },
      ]));

      const result = await SurveyAnalyticsService.getTrends(systemScope, {}, 'week', 30);
      expect(result).toHaveLength(1);
    });

    it('supports monthly granularity', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([
        { date: '2026-03', count: '200' },
      ]));

      const result = await SurveyAnalyticsService.getTrends(systemScope, {}, 'month', 90);
      expect(result).toHaveLength(1);
    });

    it('clamps days to valid range', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([]));
      await SurveyAnalyticsService.getTrends(systemScope, {}, 'day', 500);
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRegistrySummary', () => {
    it('returns 5 stat cards with correct calculations', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{
        total: '200',
        employed: '120',
        female: '90',
        avg_age: '32.5',
        biz_owners: '40',
        consent_marketplace_pct: '70.0',
        consent_enriched_pct: '55.0',
      }]));

      const result = await SurveyAnalyticsService.getRegistrySummary(systemScope);
      expect(result.totalRespondents).toBe(200);
      expect(result.employedCount).toBe(120);
      expect(result.employedPct).toBe(60);
      expect(result.femaleCount).toBe(90);
      expect(result.femalePct).toBe(45);
      expect(result.avgAge).toBe(32.5);
      expect(result.businessOwners).toBe(40);
      expect(result.businessOwnersPct).toBe(20);
    });

    it('returns consent rate percentages when total >= suppression threshold', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{
        total: '100',
        employed: '60',
        female: '50',
        avg_age: '30.0',
        biz_owners: '20',
        consent_marketplace_pct: '75.5',
        consent_enriched_pct: '42.3',
      }]));

      const result = await SurveyAnalyticsService.getRegistrySummary(systemScope);
      expect(result.consentMarketplacePct).toBe(75.5);
      expect(result.consentEnrichedPct).toBe(42.3);
    });

    it('suppresses consent rates when total < 5', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{
        total: '3',
        employed: '2',
        female: '1',
        avg_age: '28.0',
        biz_owners: '1',
        consent_marketplace_pct: '66.7',
        consent_enriched_pct: '33.3',
      }]));

      const result = await SurveyAnalyticsService.getRegistrySummary(systemScope);
      expect(result.consentMarketplacePct).toBeNull();
      expect(result.consentEnrichedPct).toBeNull();
    });

    it('handles zero total gracefully', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{
        total: '0',
        employed: '0',
        female: '0',
        avg_age: null,
        biz_owners: '0',
        consent_marketplace_pct: null,
        consent_enriched_pct: null,
      }]));

      const result = await SurveyAnalyticsService.getRegistrySummary(systemScope);
      expect(result.totalRespondents).toBe(0);
      expect(result.employedPct).toBe(0);
      expect(result.avgAge).toBeNull();
      expect(result.consentMarketplacePct).toBeNull();
      expect(result.consentEnrichedPct).toBeNull();
    });

    it('works with LGA scope', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{
        total: '50',
        employed: '30',
        female: '25',
        avg_age: '28.3',
        biz_owners: '10',
        consent_marketplace_pct: '60.0',
        consent_enriched_pct: '40.0',
      }]));

      const result = await SurveyAnalyticsService.getRegistrySummary(lgaScope);
      expect(result.totalRespondents).toBe(50);
      expect(result.employedPct).toBe(60);
    });

    it('works with personal scope', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{
        total: '5',
        employed: '3',
        female: '2',
        avg_age: '25.0',
        biz_owners: '1',
        consent_marketplace_pct: '80.0',
        consent_enriched_pct: '60.0',
      }]));

      const result = await SurveyAnalyticsService.getRegistrySummary(personalScope);
      expect(result.totalRespondents).toBe(5);
    });

    // Story 9-26 Part D (AC#D3) — wizard respondents (source='public') were
    // invisible to analytics pre-9-26 because the wizard never wrote a
    // submissions row, and buildWhereFragments() requires `raw_data IS NOT
    // NULL AND respondent_id IS NOT NULL`. Part A now writes that row, so
    // wizard respondents ARE counted. This test locks the analytics side of
    // the contract: with no source param, the generated WHERE clause must NOT
    // restrict to a single source (which would re-hide wizard rows), and a
    // wizard-style count flows through unchanged.
    it('AC#D3 — counts wizard (source=public) respondents; no source exclusion in default query', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{
        total: '43',
        employed: '20',
        female: '18',
        avg_age: '29.0',
        biz_owners: '8',
        consent_marketplace_pct: '70.0',
        consent_enriched_pct: '40.0',
      }]));

      const result = await SurveyAnalyticsService.getRegistrySummary(systemScope);
      // The 43 wizard respondents from the 2026-05-14→2026-05-19 window are now
      // visible in the registry summary.
      expect(result.totalRespondents).toBe(43);

      // No source filter is bound when params.source is omitted — all sources
      // (public/enumerator/clerk) are counted together. A regression that
      // hard-codes a source restriction would surface here.
      const sqlString = JSON.stringify(mockExecute.mock.calls[0][0]);
      expect(sqlString).not.toContain('source =');

      // Story 12-6 — this used to assert `s.respondent_id IS NOT NULL`, the
      // guard that kept orphan submissions out of the population. That
      // condition is GONE, and its absence is the fix rather than a regression:
      // the aggregate now reads the respondent-anchored canonical source, where
      // a submission with no respondent cannot enter the population at all.
      // Assert the grain that replaced it, not the guard that is no longer
      // needed — a stale assertion here would have to be satisfied by
      // reintroducing a submission-grained WHERE.
      //
      // ⚠️ The negative assertion names the RETIRED JOIN, not `FROM submissions`
      // — the canonical read's own latest-non-empty LATERAL legitimately reads
      // `FROM submissions sx`, so a bare `FROM submissions` check passes on a
      // prefix and asserts nothing.
      expect(sqlString).not.toContain('LEFT JOIN respondents r ON r.id = s.respondent_id');
      expect(sqlString).toContain('ru.raw_data IS NOT NULL');
      expect(sqlString).toContain('FROM respondents r');
    });
  });

  describe('getPipelineSummary', () => {
    it('returns pipeline stats with system scope', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{
        totalSubmissions: '500',
        completionRate: '85.0',
        avgCompletionTimeSecs: '1234.5',
        activeEnumerators: '12',
      }]));

      const result = await SurveyAnalyticsService.getPipelineSummary(systemScope);
      expect(result.totalSubmissions).toBe(500);
      expect(result.completionRate).toBe(85);
      expect(result.avgCompletionTimeSecs).toBe(1234.5);
      expect(result.activeEnumerators).toBe(12);
    });

    it('returns pipeline stats with LGA scope', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{
        totalSubmissions: '120',
        completionRate: '90.5',
        avgCompletionTimeSecs: '800.0',
        activeEnumerators: '3',
      }]));

      const result = await SurveyAnalyticsService.getPipelineSummary(lgaScope);
      expect(result.totalSubmissions).toBe(120);
      expect(result.completionRate).toBe(90.5);
      expect(result.activeEnumerators).toBe(3);
    });

    it('returns pipeline stats with personal scope', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{
        totalSubmissions: '25',
        completionRate: '100.0',
        avgCompletionTimeSecs: '600.0',
        activeEnumerators: '1',
      }]));

      const result = await SurveyAnalyticsService.getPipelineSummary(personalScope);
      expect(result.totalSubmissions).toBe(25);
      expect(result.completionRate).toBe(100);
    });

    it('handles empty data (no submissions) — suppressed when < 5', async () => {
      mockExecute.mockResolvedValueOnce(mockRows([{
        totalSubmissions: '0',
        completionRate: '0',
        avgCompletionTimeSecs: null,
        activeEnumerators: '0',
      }]));

      const result = await SurveyAnalyticsService.getPipelineSummary(systemScope);
      expect(result.totalSubmissions).toBe(0);
      // Suppressed: totalSubmissions (0) < SUPPRESSION_MIN_N (5)
      expect(result.completionRate).toBeNull();
      expect(result.avgCompletionTimeSecs).toBeNull();
      expect(result.activeEnumerators).toBeNull();
    });
  });

  describe('scope and param filtering', () => {
    it('passes lgaId param to filter', async () => {
      mockExecute.mockResolvedValue(mockRows([{
        total: '0', employed: '0', female: '0', avg_age: null,
        biz_owners: '0', consent_marketplace_pct: null, consent_enriched_pct: null,
      }]));
      const result = await SurveyAnalyticsService.getRegistrySummary(systemScope, { lgaId: 'ibadan_north' });
      // getRegistrySummary runs exactly 1 db.execute call
      expect(mockExecute).toHaveBeenCalledTimes(1);
      // Verify the SQL contains the lgaId parameter value
      const sqlArg = mockExecute.mock.calls[0][0];
      const sqlString = JSON.stringify(sqlArg);
      expect(sqlString).toContain('ibadan_north');
      // Verify the result is well-formed
      expect(result.totalRespondents).toBe(0);
    });

    it('passes dateFrom and dateTo params', async () => {
      mockExecute.mockResolvedValue(mockRows([{
        total: '0', employed: '0', female: '0', avg_age: null,
        biz_owners: '0', consent_marketplace_pct: null, consent_enriched_pct: null,
      }]));
      const result = await SurveyAnalyticsService.getRegistrySummary(systemScope, {
        dateFrom: '2026-01-01',
        dateTo: '2026-03-01',
      });
      expect(mockExecute).toHaveBeenCalledTimes(1);
      const sqlString = JSON.stringify(mockExecute.mock.calls[0][0]);
      expect(sqlString).toContain('2026-01-01');
      expect(sqlString).toContain('2026-03-01');
      expect(result.totalRespondents).toBe(0);
    });

    it('passes source param', async () => {
      mockExecute.mockResolvedValue(mockRows([{
        total: '0', employed: '0', female: '0', avg_age: null,
        biz_owners: '0', consent_marketplace_pct: null, consent_enriched_pct: null,
      }]));
      const result = await SurveyAnalyticsService.getRegistrySummary(systemScope, { source: 'enumerator' });
      expect(mockExecute).toHaveBeenCalledTimes(1);
      const sqlString = JSON.stringify(mockExecute.mock.calls[0][0]);
      expect(sqlString).toContain('enumerator');
      expect(result.totalRespondents).toBe(0);
    });

    it('embeds lgaCode in SQL for LGA scope', async () => {
      // getDemographics with LGA scope: 1 total count + 8 parallel distribution queries = 9 calls
      mockExecute.mockResolvedValue(mockRows([{ total: '0' }]));
      await SurveyAnalyticsService.getDemographics(lgaScope);
      expect(mockExecute).toHaveBeenCalledTimes(9);
      // Every SQL query should reference the lgaCode via parameterized WHERE
      const firstSqlString = JSON.stringify(mockExecute.mock.calls[0][0]);
      expect(firstSqlString).toContain('ibadan_north');
    });

    it('embeds userId in SQL for personal scope', async () => {
      mockExecute.mockResolvedValue(mockRows([{ total: '0' }]));
      await SurveyAnalyticsService.getDemographics(personalScope);
      expect(mockExecute).toHaveBeenCalledTimes(9);
      const firstSqlString = JSON.stringify(mockExecute.mock.calls[0][0]);
      expect(firstSqlString).toContain('user-123');
    });
  });
});

/**
 * Story 12-6 (inherited 12-5 R2) — the GRAIN guard.
 *
 * 12-5 fixed the DIVISOR of the dashboard's published rates and left the GRAIN:
 * `buildWhereFragments` read `FROM submissions s`, so a person holding more than
 * one answer-bearing submission was weighted twice. Prod 2026-08-20 measured 286
 * answer-bearing submissions against 272 answer-bearing people — ~14 people
 * double-counted in every published rate.
 *
 * ⚠️ These assert the SQL, not an outcome, and that is deliberate. A mocked-DB
 * test that only checks the returned numbers passes over this hole completely:
 * the double-count lives in which rows the database would have returned, which a
 * mock never exercises. Asserting the composed source is the only thing at this
 * level that fails if the re-point is reverted.
 *
 * RED-VERIFY: point any method below back at `buildWhereFragments` and its case
 * fails on the missing canonical source.
 */
describe('SurveyAnalyticsService — respondent grain (Story 12-6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Every re-pointed method issues 1..9 queries; a bare `{ rows: [] }` for all
    // of them is enough, because these cases assert the SQL that was SENT.
    mockExecute.mockResolvedValue(mockRows([]));
  });

  /** The canonical read's unmistakable fingerprint (registry-unified.sql.ts). */
  const CANONICAL_ANCHOR = 'FROM respondents r';
  /** The retired submission-anchored join this story removed. */
  const RETIRED_JOIN = 'LEFT JOIN respondents r ON r.id = s.respondent_id';

  const REPOINTED: Array<[string, () => Promise<unknown>]> = [
    ['getDemographics', () => SurveyAnalyticsService.getDemographics(systemScope)],
    ['getEmployment', () => SurveyAnalyticsService.getEmployment(systemScope)],
    ['getHousehold', () => SurveyAnalyticsService.getHousehold(systemScope)],
    ['getSkillsFrequency', () => SurveyAnalyticsService.getSkillsFrequency(systemScope)],
    ['getRegistrySummary', () => SurveyAnalyticsService.getRegistrySummary(systemScope)],
    // Added when the ruling was extended to the full set. These four reach the
    // canonical source only through their FIRST (threshold) query when the mock
    // returns no rows — every later query is gated behind a threshold that an
    // empty result cannot meet. That is why the per-method cases below drive
    // them with counts high enough to open those gates.
    ['getCrossTab', () => SurveyAnalyticsService.getCrossTab(
      CrossTabDimension.GENDER, CrossTabDimension.EDUCATION, 'count', systemScope)],
    ['getSkillsInventory', () => SurveyAnalyticsService.getSkillsInventory(systemScope)],
    ['getInferentialInsights', () => SurveyAnalyticsService.getInferentialInsights(systemScope)],
    ['getExtendedEquity', () => SurveyAnalyticsService.getExtendedEquity(systemScope)],
  ];

  it.each(REPOINTED)('%s reads every query from the canonical respondent source', async (_name, run) => {
    await run();

    expect(mockExecute.mock.calls.length).toBeGreaterThan(0);
    for (const call of mockExecute.mock.calls) {
      const sqlString = JSON.stringify(call[0]);
      expect(sqlString).toContain(CANONICAL_ANCHOR);
      expect(sqlString).not.toContain(RETIRED_JOIN);
      // The answers-present cohort is now expressed on `ru`, and the orphan
      // guard (`s.respondent_id IS NOT NULL`) is gone because the grain makes it
      // unnecessary — an orphan submission cannot enter a respondent-anchored
      // population at all.
      expect(sqlString).toContain('ru.raw_data IS NOT NULL');
      expect(sqlString).not.toContain('s.respondent_id IS NOT NULL');
    }
  });

  it('scopes a personal request by the PEOPLE the user registered, not their submissions', async () => {
    await SurveyAnalyticsService.getRegistrySummary(personalScope);

    const sqlString = JSON.stringify(mockExecute.mock.calls[0][0]);
    // `ru.submitter_id` — respondents.submitter_id, the attribution
    // productivity.service.ts already reports staff counts from. The retired
    // filter said `s.submitter_id`, which asked a question about submissions.
    expect(sqlString).toContain('ru.submitter_id');
    expect(sqlString).not.toContain('s.submitter_id');
    expect(sqlString).toContain('user-123');
  });

  it('filters a date range on registration date, not submission date', async () => {
    await SurveyAnalyticsService.getRegistrySummary(systemScope, {
      dateFrom: '2026-01-01',
      dateTo: '2026-02-01',
    });

    const sqlString = JSON.stringify(mockExecute.mock.calls[0][0]);
    // A respondent-anchored read has no submitted_at to filter on, and this is
    // what /registry-totals already meant by a date range — so the two endpoints
    // now agree on what a date range selects.
    expect(sqlString).toContain('ru.created_at');
    expect(sqlString).not.toContain('s.submitted_at');
  });

  it('the submission-grained survivors are an ENUMERATED set, not a leftover (review L1/M4)', async () => {
    // ⭐ WHY A COUNT IS PINNED HERE. Story 12-6's Dev Notes, its Change Log and
    // the adjudication hand-off's §2ad backstop all quote this number as the
    // evidence that the grain re-point landed — and all three drifted from it.
    // The story said "46 → 7" while its own survivor table enumerated 6; the
    // hand-off said "46 → 22", a mid-development count that phase 2 invalidated
    // the same day. A number that three documents assert and nothing measures is
    // a claim, not a check.
    //
    // So the check lives with the code. If a later sweep re-points one of the
    // survivors, or a new submission-grained query appears, this reds and the
    // prose has to be updated WITH it rather than after it.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(
      new URL('../survey-analytics.service.ts', import.meta.url),
      'utf-8',
    );

    // ⚠️ Counted as "prefix minus the alias that shares it". `FROM submissions sx`
    // is the canonical read's own latest-non-empty LATERAL, and a bare prefix
    // match counts it as a survivor — the exact trap that made two of this
    // story's own negative assertions assert nothing.
    const prefix = src.split('FROM submissions s').length - 1;
    const canonicalLateral = src.split('FROM submissions sx').length - 1;
    const sites = { length: prefix - canonicalLateral };
    // 1 doc comment + getPipelineSummary + getTrends + the inferential 90-day
    // forecast + getEnumeratorReliability ×2. Every one is attributed in the
    // story's "what did NOT move, and why" table.
    expect(
      sites.length,
      'submission-grained site count changed — update Dev Notes AND the §2ad hand-off check, not just the code',
    ).toBe(6);
  });

  it('leaves genuinely submission-grained surfaces alone', async () => {
    // getTrends counts registration EVENTS per day and reads s.submitted_at;
    // getPipelineSummary's subject IS the submission (processing, completion
    // time). Re-pointing those would not be an honesty fix, it would be a
    // different metric. The guard exists so a later sweep does not "finish the
    // job" by moving them too.
    await SurveyAnalyticsService.getTrends(systemScope);
    expect(JSON.stringify(mockExecute.mock.calls[0][0])).toContain(RETIRED_JOIN);
  });
});

/**
 * Story 12-6 phase 2 — the four aggregates whose deeper queries sit BEHIND a
 * suppression threshold.
 *
 * ⚠️ WHY THESE EXIST SEPARATELY. The `it.each` guard above drives each method
 * with an empty mock, so every one of these four returns after its FIRST
 * (threshold) query — the rest of the method never runs. That guard would
 * therefore have stayed green with every re-pointed query below still reading
 * `FROM submissions`. It asserts the safe OUTCOME and would pass with the fix
 * deleted, which is the exact shape of a test passing over a hole.
 *
 * These cases feed counts high enough to OPEN the gates, so the queries that
 * actually publish the rates get executed and inspected.
 */
describe('SurveyAnalyticsService — threshold-gated aggregates read the canonical source too', () => {
  const CANONICAL_ANCHOR = 'FROM respondents r';
  const RETIRED_JOIN = 'LEFT JOIN respondents r ON r.id = s.respondent_id';

  beforeEach(() => {
    vi.clearAllMocks();
    // Every query returns a row set that both clears the thresholds and is
    // shaped plausibly enough for the in-memory maths that follows.
    mockExecute.mockResolvedValue(
      mockRows([
        {
          total: '500',
          cell_count: '30',
          count: '30',
          skill: 'tailoring',
          lga_id: 'ibadan_north',
          lga_name: 'Ibadan North',
          row_val: 'female',
          col_val: 'sss',
          gender: 'female',
          employment_type: 'wage_private',
          education_level: 'tertiary',
          disability_status: 'no',
          work_status: 'employed',
          marital_status: 'married',
          is_head: 'yes',
          has_business: 'yes',
          day: '2026-08-01',
          employed: '20',
        },
      ]),
    );
  });

  function everyCallCanonical(exceptIndexes: number[] = []) {
    mockExecute.mock.calls.forEach((call, i) => {
      if (exceptIndexes.includes(i)) return;
      const s = JSON.stringify(call[0]);
      expect(s, `query #${i} is not canonical`).toContain(CANONICAL_ANCHOR);
      expect(s, `query #${i} still carries the retired join`).not.toContain(RETIRED_JOIN);
    });
  }

  it('getCrossTab builds its matrix over people once past the n>=50 gate', async () => {
    await SurveyAnalyticsService.getCrossTab(
      CrossTabDimension.GENDER, CrossTabDimension.LGA, 'count', systemScope,
    );
    // Threshold query + the matrix query — the second only runs above 50.
    expect(mockExecute.mock.calls.length).toBeGreaterThan(1);
    everyCallCanonical();
    // The LGA dimension joins lgas against the unified alias, not respondents.
    expect(JSON.stringify(mockExecute.mock.calls[1][0])).toContain('l.code = ru.lga_id');
  });

  it('getSkillsInventory reads all four sections from the canonical source', async () => {
    await SurveyAnalyticsService.getSkillsInventory(systemScope);
    // 2 threshold + allSkills + byLga + 2 gap + diversity.
    expect(mockExecute.mock.calls.length).toBeGreaterThanOrEqual(6);
    everyCallCanonical();
  });

  it('getExtendedEquity computes disability gap, alignment and gini over people', async () => {
    await SurveyAnalyticsService.getExtendedEquity(systemScope);
    expect(mockExecute.mock.calls.length).toBeGreaterThanOrEqual(4);
    everyCallCanonical();
  });

  it('getInferentialInsights re-points its n but keeps the FORECAST submission-grained', async () => {
    await SurveyAnalyticsService.getInferentialInsights(systemScope);

    // call 0 = the threshold count (n of every CI below), call 1 = the
    // extraction, last = the 90-day enrolment forecast.
    const calls = mockExecute.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(calls.length).toBeGreaterThanOrEqual(3);

    // ⚠️ Identify the forecast by its 90-day window, NOT by 'submitted_at':
    // the canonical read's own latest-non-empty LATERAL orders by
    // `sx.submitted_at`, so a substring search for the column name matches the
    // canonical queries and points this assertion at the wrong one. (It did,
    // the first time this was written.)
    const forecastIndex = calls.findIndex((s) => s.includes("INTERVAL '90 days'"));
    expect(forecastIndex).toBeGreaterThanOrEqual(0);

    // Everything EXCEPT the forecast counts people...
    everyCallCanonical([forecastIndex]);

    // ...and the forecast is a time series of arrival EVENTS, so it keeps the
    // submission grain AND its own submission-grained filter. Re-pointing it
    // "for consistency" would turn a rate-of-arrival forecast into a different
    // metric — and would reference `ru` with no `ru` in scope.
    expect(calls[forecastIndex]).toContain(RETIRED_JOIN);
    expect(calls[forecastIndex]).not.toContain('ru.raw_data IS NOT NULL');
  });
});

/**
 * Story 12-6 code review (H1) — every analytics Redis cache is VERSIONED.
 *
 * ⭐ THE DEFECT THIS EXISTS TO PREVENT. Deploys do not flush Redis: the prod
 * instance is a long-lived `unless-stopped` container and the deploy chain never
 * touches it. So a cached payload OUTLIVES the release that corrected it — for
 * up to an hour on `/insights` and the public key-findings bridge. Story 12-6
 * moved ten aggregates onto the respondent grain (284 → 272 answer-bearing) and
 * renamed `ActivationStatusData.totalSubmissions` → `totalRespondents`, so six
 * cached payloads changed value and one changed SHAPE — and not one key was
 * bumped, because the discipline lived in a comment beside a single literal in
 * `public-insights.service.ts` rather than in a shared constant.
 *
 * Concretely, unversioned: `/insights` publishes n=284 confidence intervals for
 * an hour AFTER the fix that narrowed them; and `getActivationStatus` returns a
 * cached object whose `totalRespondents` is `undefined`, which the (correctly
 * fail-closed) policy-brief gate then refuses — 400ing a Ministry document on a
 * register of 272.
 *
 * ⚠️ This asserts the KEY, not an outcome. A mocked Redis will happily round-trip
 * any string, so no behavioural test can see a missing version suffix.
 */
describe('analytics cache keys are versioned (Story 12-6 review H1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue(mockRows([]));
  });

  it('composes every key through the shared helper, version suffix included', () => {
    expect(analyticsCacheKey('insights', 'system', 'all')).toBe(
      `analytics:insights:system:all:${ANALYTICS_CACHE_VERSION}`,
    );
    expect(ANALYTICS_CACHE_VERSION).toMatch(/^v\d+$/);
  });

  it('leaves no unversioned `analytics:` literal in the service', async () => {
    // A literal is how the previous six escaped. The source is read rather than
    // the behaviour observed, because behaviour cannot show the difference.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(
      new URL('../survey-analytics.service.ts', import.meta.url),
      'utf-8',
    );

    // Redis key literals only — `event:` log names share the `analytics.` prefix
    // with a DOT, not a colon, so they are not matched here.
    const rawKeys = src.match(/['"`]analytics:[^'"`]*['"`]/g) ?? [];
    expect(rawKeys, `unversioned analytics cache key literal(s): ${rawKeys.join(', ')}`)
      .toEqual([]);
  });

  it('the public key-findings bridge is versioned on BOTH sides', async () => {
    // Writer and reader share ONE constant. Bumping only the writer would leave
    // the public page reading a key nothing writes — it would silently lose its
    // key findings rather than show stale ones, which is quieter and worse.
    const publicSrc = (await import('node:fs')).readFileSync(
      new URL('../public-insights.service.ts', import.meta.url),
      'utf-8',
    );
    expect(publicSrc).toContain('PUBLIC_KEY_FINDINGS_CACHE_KEY');
    expect(publicSrc).not.toContain("'analytics:public:key-findings'");
    expect(PUBLIC_KEY_FINDINGS_CACHE_KEY).toMatch(/:v\d+$/);
  });
});
