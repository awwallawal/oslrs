import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnalyticsScope } from '../../middleware/analytics-scope.js';
import { CrossTabDimension, CrossTabMeasure } from '@oslsr/types';

// Hoisted mock for db.execute
const mockExecute = vi.hoisted(() => vi.fn());

vi.mock('../../db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn(),
}));

vi.mock('pino', () => ({
  default: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

import { SurveyAnalyticsService } from '../survey-analytics.service.js';

function mockRows(rows: Record<string, unknown>[]) {
  return { rows };
}

const systemScope: AnalyticsScope = { type: 'system' };
const lgaScope: AnalyticsScope = { type: 'lga', lgaId: 'lga-uuid', lgaCode: 'ibadan_north' };

describe('SurveyAnalyticsService - Cross-Tabulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct matrix structure with rowLabels, colLabels, and cells', async () => {
    // Mock: total count, then cross-tab rows
    mockExecute
      .mockResolvedValueOnce(mockRows([{ total: '100' }])) // total
      .mockResolvedValueOnce(mockRows([
        { row_val: 'female', col_val: 'self_employed', cell_count: '25' },
        { row_val: 'female', col_val: 'wage_public', cell_count: '15' },
        { row_val: 'male', col_val: 'self_employed', cell_count: '35' },
        { row_val: 'male', col_val: 'wage_public', cell_count: '25' },
      ]));

    const result = await SurveyAnalyticsService.getCrossTab(
      CrossTabDimension.GENDER,
      CrossTabDimension.EMPLOYMENT_TYPE,
      CrossTabMeasure.COUNT,
      systemScope,
    );

    expect(result.rowLabels).toEqual(['female', 'male']);
    expect(result.colLabels).toEqual(['self_employed', 'wage_public']);
    expect(result.cells).toEqual([
      [25, 15],
      [35, 25],
    ]);
    expect(result.totalN).toBe(100);
    expect(result.anySuppressed).toBe(false);
  });

  it('suppresses cells with count < 5 and sets anySuppressed=true', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{ total: '60' }]))
      .mockResolvedValueOnce(mockRows([
        { row_val: 'female', col_val: 'self_employed', cell_count: '3' }, // below threshold
        { row_val: 'female', col_val: 'wage_public', cell_count: '20' },
        { row_val: 'male', col_val: 'self_employed', cell_count: '30' },
        { row_val: 'male', col_val: 'wage_public', cell_count: '7' },
      ]));

    const result = await SurveyAnalyticsService.getCrossTab(
      CrossTabDimension.GENDER,
      CrossTabDimension.EMPLOYMENT_TYPE,
      CrossTabMeasure.COUNT,
      systemScope,
    );

    expect(result.cells[0][0]).toBeNull(); // suppressed (3 < 5)
    expect(result.cells[0][1]).toBe(20);
    expect(result.anySuppressed).toBe(true);
  });

  it('returns belowThreshold when < 50 submissions', async () => {
    mockExecute.mockResolvedValueOnce(mockRows([{ total: '30' }]));

    const result = await SurveyAnalyticsService.getCrossTab(
      CrossTabDimension.GENDER,
      CrossTabDimension.EDUCATION,
      CrossTabMeasure.COUNT,
      systemScope,
    );

    expect(result.belowThreshold).toBe(true);
    expect(result.currentN).toBe(30);
    expect(result.requiredN).toBe(50);
    expect(result.cells).toEqual([]);
  });

  it('applies LGA scope for Supervisor', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{ total: '80' }]))
      .mockResolvedValueOnce(mockRows([
        { row_val: 'male', col_val: 'sss', cell_count: '50' },
        { row_val: 'female', col_val: 'sss', cell_count: '30' },
      ]));

    const result = await SurveyAnalyticsService.getCrossTab(
      CrossTabDimension.GENDER,
      CrossTabDimension.EDUCATION,
      CrossTabMeasure.COUNT,
      lgaScope,
    );

    expect(result.totalN).toBe(80);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('fills sparse matrix cells with 0', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{ total: '60' }]))
      .mockResolvedValueOnce(mockRows([
        { row_val: 'female', col_val: 'wage_public', cell_count: '30' },
        { row_val: 'male', col_val: 'self_employed', cell_count: '30' },
        // female×self_employed and male×wage_public are missing
      ]));

    const result = await SurveyAnalyticsService.getCrossTab(
      CrossTabDimension.GENDER,
      CrossTabDimension.EMPLOYMENT_TYPE,
      CrossTabMeasure.COUNT,
      systemScope,
    );

    expect(result.rowLabels).toEqual(['female', 'male']);
    expect(result.colLabels).toEqual(['self_employed', 'wage_public']);
    // female×self_employed = 0, female×wage_public = 30
    expect(result.cells[0]).toEqual([0, 30]);
    // male×self_employed = 30, male×wage_public = 0
    expect(result.cells[1]).toEqual([30, 0]);
  });

  it('computes rowPct correctly', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{ total: '100' }]))
      .mockResolvedValueOnce(mockRows([
        { row_val: 'female', col_val: 'employed', cell_count: '30' },
        { row_val: 'female', col_val: 'unemployed', cell_count: '20' },
        { row_val: 'male', col_val: 'employed', cell_count: '40' },
        { row_val: 'male', col_val: 'unemployed', cell_count: '10' },
      ]));

    const result = await SurveyAnalyticsService.getCrossTab(
      CrossTabDimension.GENDER,
      CrossTabDimension.EMPLOYMENT_TYPE,
      CrossTabMeasure.ROW_PCT,
      systemScope,
    );

    // female row: 30/(30+20)=60%, 20/(30+20)=40%
    expect(result.cells[0]).toEqual([60, 40]);
    // male row: 40/(40+10)=80%, 10/(40+10)=20%
    expect(result.cells[1]).toEqual([80, 20]);
  });

  it('computes colPct correctly', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{ total: '100' }]))
      .mockResolvedValueOnce(mockRows([
        { row_val: 'female', col_val: 'employed', cell_count: '30' },
        { row_val: 'female', col_val: 'unemployed', cell_count: '20' },
        { row_val: 'male', col_val: 'employed', cell_count: '70' },
        { row_val: 'male', col_val: 'unemployed', cell_count: '80' },
      ]));

    const result = await SurveyAnalyticsService.getCrossTab(
      CrossTabDimension.GENDER,
      CrossTabDimension.EMPLOYMENT_TYPE,
      CrossTabMeasure.COL_PCT,
      systemScope,
    );

    // employed col: female 30/(30+70)=30%, male 70/(30+70)=70%
    expect(result.cells[0][0]).toBe(30);
    expect(result.cells[1][0]).toBe(70);
  });

  it('computes totalPct correctly', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{ total: '200' }]))
      .mockResolvedValueOnce(mockRows([
        { row_val: 'female', col_val: 'employed', cell_count: '60' },
        { row_val: 'male', col_val: 'employed', cell_count: '140' },
      ]));

    const result = await SurveyAnalyticsService.getCrossTab(
      CrossTabDimension.GENDER,
      CrossTabDimension.EMPLOYMENT_TYPE,
      CrossTabMeasure.TOTAL_PCT,
      systemScope,
    );

    // female/employed: 60/200 = 30%
    expect(result.cells[0][0]).toBe(30);
    // male/employed: 140/200 = 70%
    expect(result.cells[1][0]).toBe(70);
  });
});

describe('SurveyAnalyticsService - Skills Inventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns full skills list (not top-10 limited)', async () => {
    const manySkills = Array.from({ length: 25 }, (_, i) => ({
      skill: `skill_${i}`,
      count: String(100 - i * 3),
    }));

    mockExecute
      .mockResolvedValueOnce(mockRows([{ total: '100' }])) // totalWithSkills
      .mockResolvedValueOnce(mockRows([{ total: '100' }])) // totalSubmissions
      .mockResolvedValueOnce(mockRows(manySkills)) // allSkills
      // gap: have + want (lga scope, threshold met)
      .mockResolvedValueOnce(mockRows([]))
      .mockResolvedValueOnce(mockRows([]));

    const result = await SurveyAnalyticsService.getSkillsInventory(lgaScope);

    // All 25 skills should be returned (not limited to top 10)
    expect(result.allSkills.length).toBe(25);
    expect(result.thresholds.allSkills.met).toBe(true);
  });

  it('groups skills by ISCO-08 category correctly', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{ total: '50' }]))
      .mockResolvedValueOnce(mockRows([{ total: '50' }]))
      .mockResolvedValueOnce(mockRows([
        { skill: 'bricklaying', count: '20' },
        { skill: 'plastering', count: '15' },
        { skill: 'tailoring', count: '10' },
        { skill: 'catering', count: '5' },
      ]))
      // gap: have + want (lga scope, threshold met)
      .mockResolvedValueOnce(mockRows([]))
      .mockResolvedValueOnce(mockRows([]));

    const result = await SurveyAnalyticsService.getSkillsInventory(lgaScope);

    expect(result.byCategory.length).toBeGreaterThanOrEqual(3);
    const construction = result.byCategory.find(c => c.category === 'Construction & Building');
    expect(construction).toBeDefined();
    expect(construction!.totalCount).toBe(35); // 20+15
    expect(construction!.skills).toHaveLength(2);
  });

  it('returns top 3 skills per LGA for system scope', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{ total: '100' }]))
      .mockResolvedValueOnce(mockRows([{ total: '100' }]))
      .mockResolvedValueOnce(mockRows([
        { skill: 'bricklaying', count: '50' },
        { skill: 'tailoring', count: '30' },
      ]))
      .mockResolvedValueOnce(mockRows([
        { lga_id: 'lga1', lga_name: 'Ibadan North', skill: 'bricklaying', count: '20' },
        { lga_id: 'lga1', lga_name: 'Ibadan North', skill: 'tailoring', count: '15' },
        { lga_id: 'lga1', lga_name: 'Ibadan North', skill: 'plumbing', count: '10' },
      ]))
      // gap analysis: have query, want query
      .mockResolvedValueOnce(mockRows([{ skill: 'bricklaying', count: '50' }]))
      .mockResolvedValueOnce(mockRows([{ skill: 'web_dev', count: '30' }]))
      // diversity index
      .mockResolvedValueOnce(mockRows([
        { lga_id: 'lga1', lga_name: 'Ibadan North', skill: 'bricklaying', count: '30' },
        { lga_id: 'lga1', lga_name: 'Ibadan North', skill: 'tailoring', count: '20' },
      ]));

    const result = await SurveyAnalyticsService.getSkillsInventory(systemScope);

    expect(result.byLga).not.toBeNull();
    expect(result.byLga![0].topSkills).toHaveLength(3);
    expect(result.byLga![0].lgaName).toBe('Ibadan North');
  });

  it('returns gap analysis with have vs want matched skills', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{ total: '50' }]))
      .mockResolvedValueOnce(mockRows([{ total: '50' }]))
      .mockResolvedValueOnce(mockRows([
        { skill: 'bricklaying', count: '30' },
        { skill: 'tailoring', count: '20' },
      ]))
      // byLga for system scope
      .mockResolvedValueOnce(mockRows([]))
      // gap: have
      .mockResolvedValueOnce(mockRows([
        { skill: 'bricklaying', count: '30' },
        { skill: 'tailoring', count: '20' },
      ]))
      // gap: want
      .mockResolvedValueOnce(mockRows([
        { skill: 'web_dev', count: '25' },
        { skill: 'bricklaying', count: '10' },
      ]))
      // diversity
      .mockResolvedValueOnce(mockRows([]));

    const result = await SurveyAnalyticsService.getSkillsInventory(systemScope);

    expect(result.gapAnalysis).not.toBeNull();
    const bricklaying = result.gapAnalysis!.find(g => g.skill === 'bricklaying');
    expect(bricklaying).toEqual({ skill: 'bricklaying', haveCount: 30, wantCount: 10 });
    const webDev = result.gapAnalysis!.find(g => g.skill === 'web_dev');
    expect(webDev).toEqual({ skill: 'web_dev', haveCount: 0, wantCount: 25 });
  });

  it('returns null gapAnalysis when no training_interest data exists', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{ total: '50' }]))
      .mockResolvedValueOnce(mockRows([{ total: '50' }]))
      .mockResolvedValueOnce(mockRows([{ skill: 'bricklaying', count: '30' }]))
      // byLga (system scope)
      .mockResolvedValueOnce(mockRows([]))
      // gap: have + want (parallel — Promise.all resolves both)
      .mockResolvedValueOnce(mockRows([{ skill: 'bricklaying', count: '30' }]))
      .mockResolvedValueOnce(mockRows([]))  // want — EMPTY → wantMap.size === 0 → null
      // diversity
      .mockResolvedValueOnce(mockRows([]));

    const result = await SurveyAnalyticsService.getSkillsInventory(systemScope);

    expect(result.gapAnalysis).toBeNull();
  });

  it('computes Shannon diversity index correctly', async () => {
    // Known input: 2 skills with equal counts → Shannon = ln(2) ≈ 0.69
    mockExecute
      .mockResolvedValueOnce(mockRows([{ total: '50' }]))
      .mockResolvedValueOnce(mockRows([{ total: '50' }]))
      .mockResolvedValueOnce(mockRows([
        { skill: 'bricklaying', count: '25' },
        { skill: 'tailoring', count: '25' },
      ]))
      // byLga
      .mockResolvedValueOnce(mockRows([]))
      // gap: have, want
      .mockResolvedValueOnce(mockRows([]))
      .mockResolvedValueOnce(mockRows([]))
      // diversity
      .mockResolvedValueOnce(mockRows([
        { lga_id: 'lga1', lga_name: 'Test LGA', skill: 'bricklaying', count: '25' },
        { lga_id: 'lga1', lga_name: 'Test LGA', skill: 'tailoring', count: '25' },
      ]));

    const result = await SurveyAnalyticsService.getSkillsInventory(systemScope);

    expect(result.diversityIndex).not.toBeNull();
    expect(result.diversityIndex!).toHaveLength(1);
    // Shannon for equal distribution of 2: ln(2) ≈ 0.69
    expect(result.diversityIndex![0].index).toBeCloseTo(0.69, 1);
    expect(result.diversityIndex![0].skillCount).toBe(2);
  });

  it('suppresses skills with count < 5', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{ total: '50' }]))
      .mockResolvedValueOnce(mockRows([{ total: '50' }]))
      .mockResolvedValueOnce(mockRows([
        { skill: 'bricklaying', count: '20' },
        { skill: 'tailoring', count: '3' }, // below SUPPRESSION_MIN_N
      ]))
      // gap: have + want (lga scope)
      .mockResolvedValueOnce(mockRows([]))
      .mockResolvedValueOnce(mockRows([]));

    const result = await SurveyAnalyticsService.getSkillsInventory(lgaScope);

    expect(result.allSkills).toHaveLength(1);
    expect(result.allSkills[0].skill).toBe('bricklaying');
  });

  it('returns per-section thresholds correctly', async () => {
    // Below general threshold (30)
    mockExecute
      .mockResolvedValueOnce(mockRows([{ total: '20' }])) // totalWithSkills
      .mockResolvedValueOnce(mockRows([{ total: '20' }])); // totalSubmissions

    const result = await SurveyAnalyticsService.getSkillsInventory(lgaScope);

    expect(result.thresholds.allSkills).toEqual({ met: false, currentN: 20, requiredN: 30 });
    expect(result.thresholds.byCategory).toEqual({ met: false, currentN: 20, requiredN: 30 });
    expect(result.allSkills).toEqual([]);
    expect(result.byCategory).toEqual([]);
  });

  it('Supervisor gets LGA-scoped data with byLga and diversityIndex null', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{ total: '50' }]))  // totalWithSkills
      .mockResolvedValueOnce(mockRows([{ total: '50' }]))  // totalSubmissions
      .mockResolvedValueOnce(mockRows([{ skill: 'bricklaying', count: '30' }]))  // allSkills
      // byLga skipped (lga scope)
      // gap: have + want (parallel)
      .mockResolvedValueOnce(mockRows([{ skill: 'bricklaying', count: '30' }]))
      .mockResolvedValueOnce(mockRows([]));
      // diversityIndex skipped (lga scope)

    const result = await SurveyAnalyticsService.getSkillsInventory(lgaScope);

    expect(result.byLga).toBeNull();
    expect(result.diversityIndex).toBeNull();
  });
});
