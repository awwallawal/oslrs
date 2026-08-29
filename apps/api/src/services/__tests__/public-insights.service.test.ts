import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.hoisted(() => vi.fn());
const mockCountCore = vi.hoisted(() => vi.fn());

vi.mock('../../db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

// 13-25: the respondent-scoped count-core is a separate module. Mocking it here
// keeps the 8-query `db.execute` sequence below untouched AND lets each test
// prove the headline (`totalRegistered`) is decoupled from the submission-scoped
// breakdown denominator (`summary.total`).
//
// ⚠️ `answeredFieldDenominator` is imported from the REAL module (Story 12-4,
// ruling R-E). Stubbing it would let this suite stay green while the published
// rates divided by the wrong denominator — the binding is exactly what needs
// proving, so the real SQL builder runs.
vi.mock('../registry-totals.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../registry-totals.service.js')>();
  return {
    ...actual,
    getRegistryCountCore: () => mockCountCore(),
  };
});

import { PublicInsightsService } from '../public-insights.service.js';
import { answeredFieldDenominator } from '../registry-totals.service.js';
import { sqlShape } from './sql-text.test-helpers.js';

function mockRows(rows: Record<string, unknown>[]) {
  return { rows };
}

/*
 * ⛔ THE K-ANONYMITY FLOOR IS ENFORCED IN SQL, WHERE A MOCKED-DB TEST CANNOT SEE IT.
 *
 * Found by RED-verify 2026-08-29: dropping the skills-by-LGA floor from 10 to 1 left
 * ALL 15 tests green. The suite mocks `db.execute`, so the HAVING clause is never
 * executed and the guard that stops the page identifying an individual was itself
 * unguarded — [[pattern-test-that-passes-over-a-hole]].
 *
 * This asserts the SOURCE, the same way `nginx-header-hygiene.test.ts` asserts a
 * directive it cannot execute. It is a weaker check than running the query, and it is
 * enormously better than none: it fails the moment someone lowers or deletes the floor.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

describe('public insights — privacy floors are present in the SQL', () => {
  const src = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../public-insights.service.ts'),
    'utf-8',
  );

  it('⭐ skills x LGA is floored at PUBLIC_MIN_N, not banded and not ungated', () => {
    // Finest-grained cell the page publishes: a rare trade in a thin LGA identifies a
    // person, and "present but fewer than 10" still discloses that — so it is ABSENT
    // below the floor, unlike the density map which bands.
    expect(src).toMatch(/HAVING COUNT\(\*\) >= \$\{PUBLIC_MIN_N\}/);
    expect(src).not.toMatch(/HAVING COUNT\(\*\) >= \d/);
  });

  it('PUBLIC_MIN_N is 10 — the public threshold, stricter than the internal one', () => {
    expect(src).toMatch(/const PUBLIC_MIN_N = 10;/);
  });
});

describe('PublicInsightsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: headline decoupled from breakdown denominator; tests override.
    mockCountCore.mockResolvedValue({ totalRespondents: 0, withAnswers: 0 });
  });

  it('returns pre-computed public insights (cache miss)', async () => {
    // 520 registered people, 500 of them with complete survey responses.
    mockCountCore.mockResolvedValue({ totalRespondents: 520, withAnswers: 500 });
    /*
     * 5 parallel queries: summary, gender, skills, desiredSkills, lga.
     * ⚠️ POSITIONAL. These mocks are consumed IN ORDER by one `Promise.all`, so a
     * query removed from the service without removing its mock here silently shifts
     * every later result onto the wrong name — and the types are identical, so `tsc`
     * cannot see it. That is exactly how a first cut of this change made `summaryRows`
     * read the GENDER query. Keep this list and the service's array in lockstep.
     *
     * The age / employment / formal-informal queries were REMOVED 2026-08-26 with the
     * metrics they fed (see the service header).
     */
    mockExecute
      .mockResolvedValueOnce(mockRows([{
        total: '500',
        lgas_covered: '15',
        gpi: '0.85',
      }]))
      .mockResolvedValueOnce(mockRows([
        { label: 'male', count: '280' },
        { label: 'female', count: '220' },
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
        { label: 'Ibadan North', count: '100' },
      ]))
      // skillsByLga — already floored at PUBLIC_MIN_N by the query's HAVING clause
      .mockResolvedValueOnce(mockRows([
        { lga_id: 'ibadan_north', skill: 'welding', count: '30' },
        { lga_id: 'ibadan_north', skill: 'tailoring', count: '12' },
        { lga_id: 'egbeda', skill: 'carpentry', count: '15' },
      ]))
      // growth — daily counts; the service computes the running total
      .mockResolvedValueOnce(mockRows([
        { day: '2026-08-24', count: '6' },
        { day: '2026-08-25', count: '4' },
        { day: '2026-08-26', count: '19' },
      ]));

    const result = await PublicInsightsService.getPublicInsights();

    // Headline = registered PEOPLE (count-core), NOT the 500 answer-bearing submissions.
    expect(result.totalRegistered).toBe(520);
    expect(result.withAnswers).toBe(500);
    expect(result.lgasCovered).toBe(15);
    expect(result.genderSplit).toHaveLength(2);
    expect(result.allSkills).toHaveLength(2);
    expect(result.allSkills[0].skill).toBe('welding');
    expect(result.desiredSkills).toHaveLength(2);
    expect(result.desiredSkills[0].skill).toBe('plumbing');
    expect(result.gpi).toBe(0.85);

    // ⭐ Skills x LGA — grouped per LGA, counts preserved. The k-anonymity floor is
    // enforced by the QUERY (HAVING >= PUBLIC_MIN_N), so anything that arrives here is
    // already publishable; the service must not silently re-filter or re-band it.
    expect(result.skillsByLga).toEqual([
      { lgaId: 'ibadan_north', skills: [{ skill: 'welding', count: 30 }, { skill: 'tailoring', count: 12 }] },
      { lgaId: 'egbeda', skills: [{ skill: 'carpentry', count: 15 }] },
    ]);

    // ⭐ Growth — the RUNNING TOTAL is computed in one pass beside the daily figure, so
    // the two can never disagree. 6 → 10 → 29.
    expect(result.growth).toEqual([
      { day: '2026-08-24', count: 6, cumulative: 6 },
      { day: '2026-08-25', count: 4, cumulative: 10 },
      { day: '2026-08-26', count: 19, cumulative: 29 },
    ]);
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
    mockCountCore.mockResolvedValue({ totalRespondents: 0, withAnswers: 0 });
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
    expect(result.withAnswers).toBe(0);
    expect(result.lgasCovered).toBe(0);
    expect(result.genderSplit).toEqual([]);
    expect(result.allSkills).toEqual([]);
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
    // 12 registered people, but only 8 answer-bearing submissions — scalar
    // suppression is driven by the with-answers denominator, NOT the headline.
    mockCountCore.mockResolvedValue({ totalRespondents: 12, withAnswers: 8 });
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
    expect(result.totalRegistered).toBe(12); // headline = registered people, always returned
    expect(result.withAnswers).toBe(8);
    expect(result.gpi).toBeNull();
  });

  it('funnel: headline counts registered people, withAnswers is the completed subset (prod 142/79)', async () => {
    // The exact prod-verified split: 142 registered people, 79 with complete
    // survey responses. The 63 answer-less registrants (data_lost + no_submission
    // + pending_nin) are counted in the headline but excluded from breakdowns.
    mockCountCore.mockResolvedValue({ totalRespondents: 142, withAnswers: 79 });
    mockExecute
      .mockResolvedValueOnce(mockRows([{
        total: '79', lgas_covered: '20',
        biz_rate: null, unemployment_est: null, youth_emp_rate: null, gpi: null,
      }]))
      .mockResolvedValue(mockRows([]));

    const result = await PublicInsightsService.getPublicInsights();
    expect(result.totalRegistered).toBe(142);
    expect(result.withAnswers).toBe(79);
    expect(result.totalRegistered - result.withAnswers).toBe(63);
  });

  it('filters out skills below public suppression threshold (count < 10)', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{
        total: '200', lgas_covered: '10',
        biz_rate: null, unemployment_est: null,
        youth_emp_rate: null, gpi: null,
      }]))
      .mockResolvedValueOnce(mockRows([])) // gender
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

  /**
   * ⭐ Story 12-4 / RULING R-E — THE PUBLISHED RATES' DENOMINATOR.
   *
   * `answersWhere` (`ru.raw_data IS NOT NULL`) means "has ANY answers". Two
   * published rates on the PUBLIC /insights page divided by it, so a person who
   * was never ASKED the employment question sat in its denominator and *not
   * asked* silently became *not employed*. Both rates read LOWER than the truth,
   * on the page the launch blast points a radio audience at.
   *
   * These assert the BINDING, not the helper — 13-55's lesson: a census that
   * counts sites while production calls something else stays green forever.
   */
  /*
   * ⛔ THE `rateDenominators` DESCRIBE BLOCK REMOVED — 2026-08-26 (Awwal's ruling).
   *
   * It asserted ruling R-E's contract: every published rate ships the n it was computed
   * from, and those n's legitimately differ. Right for a page that publishes deep-field
   * rates; this page no longer does. Unemployment, youth employment and business
   * ownership were REMOVED rather than caveated — post-intake each is collected on ~2%
   * of the registry, and the unemployment figure had already published WRONG once
   * (12-6 ruling R-E: "not asked" silently became "not employed", 18.4% vs 23.9%).
   *
   * R-E itself is UNCHANGED for the internal dashboards, which still publish n beside
   * every rate. What changed is which rates this public surface publishes at all.
   */
});
