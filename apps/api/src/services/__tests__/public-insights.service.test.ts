import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.hoisted(() => vi.fn());

vi.mock('../../db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

import { PublicInsightsService } from '../public-insights.service.js';

function mockRows(rows: Record<string, unknown>[]) {
  return { rows };
}

describe('PublicInsightsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns pre-computed public insights (cache miss)', async () => {
    // 7 parallel queries: summary, gender, age, skills, emp, formal, lga
    mockExecute
      .mockResolvedValueOnce(mockRows([{
        total: '500',
        lgas_covered: '15',
        biz_rate: '12.5',
        unemployment_est: '8.3',
        youth_emp_rate: '65.2',
        gpi: '0.85',
      }]))
      .mockResolvedValueOnce(mockRows([
        { label: 'male', count: '280' },
        { label: 'female', count: '220' },
      ]))
      .mockResolvedValueOnce(mockRows([
        { label: '15-24', count: '150' },
        { label: '25-34', count: '200' },
      ]))
      .mockResolvedValueOnce(mockRows([
        { skill: 'welding', count: '50' },
        { skill: 'tailoring', count: '40' },
      ]))
      .mockResolvedValueOnce(mockRows([
        { label: 'employed', count: '350' },
        { label: 'unemployed_seeking', count: '100' },
      ]))
      .mockResolvedValueOnce(mockRows([
        { label: 'formal', count: '200' },
        { label: 'informal', count: '150' },
      ]))
      .mockResolvedValueOnce(mockRows([
        { label: 'Ibadan North', count: '100' },
      ]));

    const result = await PublicInsightsService.getPublicInsights();

    expect(result.totalRegistered).toBe(500);
    expect(result.lgasCovered).toBe(15);
    expect(result.genderSplit).toHaveLength(2);
    expect(result.topSkills).toHaveLength(2);
    expect(result.topSkills[0].skill).toBe('welding');
    expect(result.businessOwnershipRate).toBe(12.5);
    expect(result.unemploymentEstimate).toBe(8.3);
    expect(result.youthEmploymentRate).toBe(65.2);
    expect(result.gpi).toBe(0.85);
  });

  it('uses stricter suppression (minN=10) for public data', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{
        total: '100',
        lgas_covered: '5',
        biz_rate: null,
        unemployment_est: null,
        youth_emp_rate: null,
        gpi: null,
      }]))
      .mockResolvedValueOnce(mockRows([
        { label: 'male', count: '91' },
        { label: 'other', count: '9' }, // below public minN=10
      ]))
      .mockResolvedValue(mockRows([]));

    const result = await PublicInsightsService.getPublicInsights();

    expect(result.genderSplit[0].count).toBe(91); // above threshold
    expect(result.genderSplit[1].suppressed).toBe(true);
    expect(result.genderSplit[1].count).toBeNull();
  });

  it('handles empty database', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{
        total: '0',
        lgas_covered: '0',
        biz_rate: null,
        unemployment_est: null,
        youth_emp_rate: null,
        gpi: null,
      }]))
      .mockResolvedValue(mockRows([]));

    const result = await PublicInsightsService.getPublicInsights();

    expect(result.totalRegistered).toBe(0);
    expect(result.lgasCovered).toBe(0);
    expect(result.genderSplit).toEqual([]);
    expect(result.topSkills).toEqual([]);
    expect(result.businessOwnershipRate).toBeNull();
    expect(result.gpi).toBeNull();
  });

  it('returns null rates when not computable', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{
        total: '10',
        lgas_covered: '2',
        biz_rate: null,
        unemployment_est: null,
        youth_emp_rate: null,
        gpi: null,
      }]))
      .mockResolvedValue(mockRows([]));

    const result = await PublicInsightsService.getPublicInsights();

    expect(result.businessOwnershipRate).toBeNull();
    expect(result.unemploymentEstimate).toBeNull();
    expect(result.youthEmploymentRate).toBeNull();
    expect(result.gpi).toBeNull();
  });

  it('calculates skills frequency percentages correctly', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{
        total: '100', lgas_covered: '5',
        biz_rate: null, unemployment_est: null,
        youth_emp_rate: null, gpi: null,
      }]))
      .mockResolvedValueOnce(mockRows([])) // gender
      .mockResolvedValueOnce(mockRows([])) // age
      .mockResolvedValueOnce(mockRows([
        { skill: 'welding', count: '30' },
        { skill: 'carpentry', count: '20' },
      ]))
      .mockResolvedValue(mockRows([]));

    const result = await PublicInsightsService.getPublicInsights();
    expect(result.topSkills[0].percentage).toBe(60); // 30/50 * 100
    expect(result.topSkills[1].percentage).toBe(40); // 20/50 * 100
  });

  it('suppresses scalar metrics when total < PUBLIC_MIN_N (10)', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{
        total: '8', // below PUBLIC_MIN_N=10
        lgas_covered: '2',
        biz_rate: '25.0',
        unemployment_est: '12.5',
        youth_emp_rate: '50.0',
        gpi: '0.9',
      }]))
      .mockResolvedValue(mockRows([]));

    const result = await PublicInsightsService.getPublicInsights();
    expect(result.totalRegistered).toBe(8); // total always returned
    expect(result.businessOwnershipRate).toBeNull();
    expect(result.unemploymentEstimate).toBeNull();
    expect(result.youthEmploymentRate).toBeNull();
    expect(result.gpi).toBeNull();
  });

  it('filters out skills below public suppression threshold (count < 10)', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{
        total: '200', lgas_covered: '10',
        biz_rate: null, unemployment_est: null,
        youth_emp_rate: null, gpi: null,
      }]))
      .mockResolvedValueOnce(mockRows([])) // gender
      .mockResolvedValueOnce(mockRows([])) // age
      .mockResolvedValueOnce(mockRows([
        { skill: 'welding', count: '50' },
        { skill: 'rare_skill', count: '9' }, // below PUBLIC_MIN_N=10
      ]))
      .mockResolvedValue(mockRows([]));

    const result = await PublicInsightsService.getPublicInsights();
    expect(result.topSkills).toHaveLength(1);
    expect(result.topSkills[0].skill).toBe('welding');
  });
});
