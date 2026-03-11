import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnalyticsScope } from '../../middleware/analytics-scope.js';
import type { AnalyticsQueryParams } from '@oslsr/types';

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
        }]));

      const result = await SurveyAnalyticsService.getHousehold(systemScope);
      expect(result.dependencyRatio).toBe(0.45);
      expect(result.businessOwnershipRate).toBe(30);
      expect(result.businessRegistrationRate).toBe(53.3);
      expect(result.apprenticeTotal).toBe(12);
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
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ skill: 'welding', count: 30, percentage: 30 });
      expect(result[1]).toEqual({ skill: 'carpentry', count: 20, percentage: 20 });
    });

    it('respects custom limit', async () => {
      mockExecute
        .mockResolvedValueOnce(mockRows([{ total: '50' }]))
        .mockResolvedValueOnce(mockRows([{ skill: 'plumbing', count: '10' }]));

      const result = await SurveyAnalyticsService.getSkillsFrequency(systemScope, {}, 5);
      expect(result).toHaveLength(1);
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
      expect(result).toEqual([]);
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
      expect(result).toHaveLength(1);
      expect(result[0].skill).toBe('welding');
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
