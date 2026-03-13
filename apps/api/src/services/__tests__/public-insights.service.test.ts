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
    // 8 parallel queries: summary, gender, age, skills, desiredSkills, emp, formal, lga
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
        { skill: 'plumbing', count: '30' },
        { skill: 'driving', count: '20' },
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
    expect(result.allSkills).toHaveLength(2);
    expect(result.allSkills[0].skill).toBe('welding');
    expect(result.desiredSkills).toHaveLength(2);
    expect(result.desiredSkills[0].skill).toBe('plumbing');
    expect(result.businessOwnershipRate).toBe(12.5);
    expect(result.unemploymentEstimate).toBe(8.3);
    expect(result.youthEmploymentRate).toBe(65.2);
    expect(result.gpi).toBe(0.85);
    expect(result.lastUpdated).toBeDefined();
    expect(new Date(result.lastUpdated).getTime()).not.toBeNaN();
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
    expect(result.allSkills).toEqual([]);
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
    expect(result.allSkills[0].percentage).toBe(60); // 30/50 * 100
    expect(result.allSkills[1].percentage).toBe(40); // 20/50 * 100
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
    expect(result.allSkills).toHaveLength(1);
    expect(result.allSkills[0].skill).toBe('welding');
  });

  it('returns all skills without LIMIT (not just top 10)', async () => {
    const manySkills = Array.from({ length: 15 }, (_, i) => ({
      skill: `skill_${i}`,
      count: String(50 - i), // all above PUBLIC_MIN_N=10
    }));
    mockExecute
      .mockResolvedValueOnce(mockRows([{
        total: '500', lgas_covered: '10',
        biz_rate: null, unemployment_est: null,
        youth_emp_rate: null, gpi: null,
      }]))
      .mockResolvedValueOnce(mockRows([])) // gender
      .mockResolvedValueOnce(mockRows([])) // age
      .mockResolvedValueOnce(mockRows(manySkills)) // allSkills — 15 skills returned
      .mockResolvedValue(mockRows([]));

    const result = await PublicInsightsService.getPublicInsights();
    expect(result.allSkills).toHaveLength(15);
    expect(result.allSkills[0].skill).toBe('skill_0');
    expect(result.allSkills[14].skill).toBe('skill_14');
  });

  it('populates desiredSkills from training_interest field', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{
        total: '300', lgas_covered: '8',
        biz_rate: null, unemployment_est: null,
        youth_emp_rate: null, gpi: null,
      }]))
      .mockResolvedValueOnce(mockRows([])) // gender
      .mockResolvedValueOnce(mockRows([])) // age
      .mockResolvedValueOnce(mockRows([])) // allSkills
      .mockResolvedValueOnce(mockRows([ // desiredSkills
        { skill: 'coding', count: '40' },
        { skill: 'marketing', count: '25' },
      ]))
      .mockResolvedValue(mockRows([]));

    const result = await PublicInsightsService.getPublicInsights();
    expect(result.desiredSkills).toHaveLength(2);
    expect(result.desiredSkills[0].skill).toBe('coding');
    expect(result.desiredSkills[0].count).toBe(40);
    expect(result.desiredSkills[0].percentage).toBeCloseTo(61.5, 0);
    expect(result.desiredSkills[1].skill).toBe('marketing');
  });

  it('applies suppression to both allSkills and desiredSkills', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{
        total: '200', lgas_covered: '5',
        biz_rate: null, unemployment_est: null,
        youth_emp_rate: null, gpi: null,
      }]))
      .mockResolvedValueOnce(mockRows([])) // gender
      .mockResolvedValueOnce(mockRows([])) // age
      .mockResolvedValueOnce(mockRows([ // allSkills
        { skill: 'welding', count: '50' },
        { skill: 'niche_skill', count: '5' }, // below PUBLIC_MIN_N=10
      ]))
      .mockResolvedValueOnce(mockRows([ // desiredSkills
        { skill: 'coding', count: '30' },
        { skill: 'rare_interest', count: '8' }, // below PUBLIC_MIN_N=10
      ]))
      .mockResolvedValue(mockRows([]));

    const result = await PublicInsightsService.getPublicInsights();
    expect(result.allSkills).toHaveLength(1);
    expect(result.allSkills[0].skill).toBe('welding');
    expect(result.desiredSkills).toHaveLength(1);
    expect(result.desiredSkills[0].skill).toBe('coding');
  });
});

describe('PublicInsightsService.getTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns daily registrations for last 90 days', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([
        { date: '2026-03-01', count: '25' },
        { date: '2026-03-02', count: '30' },
        { date: '2026-03-03', count: '15' },
      ]))
      .mockResolvedValueOnce(mockRows([])); // employment breakdown

    const result = await PublicInsightsService.getTrends();

    expect(result.dailyRegistrations).toHaveLength(3);
    expect(result.dailyRegistrations[0]).toEqual({ date: '2026-03-01', count: 25 });
    expect(result.totalDays).toBe(3);
    expect(result.lastUpdated).toBeDefined();
  });

  it('returns empty data for no submissions', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([]))
      .mockResolvedValueOnce(mockRows([]));

    const result = await PublicInsightsService.getTrends();

    expect(result.dailyRegistrations).toEqual([]);
    expect(result.employmentByWeek).toEqual([]);
    expect(result.totalDays).toBe(0);
  });

  it('suppresses days with count below PUBLIC_MIN_N (10)', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([
        { date: '2026-03-01', count: '25' },
        { date: '2026-03-02', count: '5' },  // below threshold
        { date: '2026-03-03', count: '10' }, // at threshold
      ]))
      .mockResolvedValueOnce(mockRows([]));

    const result = await PublicInsightsService.getTrends();

    expect(result.dailyRegistrations[0].count).toBe(25);
    expect(result.dailyRegistrations[1].count).toBeNull(); // suppressed
    expect(result.dailyRegistrations[2].count).toBe(10); // at threshold, not suppressed
  });

  it('returns weekly employment breakdown with per-cell suppression', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{ date: '2026-03-01', count: '50' }])) // daily
      .mockResolvedValueOnce(mockRows([
        { week: '2026-02-24', status: 'employed', count: '30' },
        { week: '2026-02-24', status: 'unemployed_seeking', count: '12' },
        { week: '2026-02-24', status: 'temporarily_absent', count: '3' }, // below threshold
        { week: '2026-02-24', status: 'other', count: '5' }, // below threshold
        { week: '2026-03-03', status: 'employed', count: '25' },
      ]));

    const result = await PublicInsightsService.getTrends();

    expect(result.employmentByWeek).toHaveLength(2);
    const week1 = result.employmentByWeek[0];
    expect(week1.week).toBe('2026-02-24');
    expect(week1.employed).toBe(30);
    expect(week1.unemployedSeeking).toBe(12);
    expect(week1.temporarilyAbsent).toBeNull(); // suppressed (3 < 10)
    expect(week1.other).toBeNull(); // suppressed (5 < 10)
    expect(result.employmentByWeek[1].employed).toBe(25);
  });
});
