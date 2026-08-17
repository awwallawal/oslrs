/**
 * Public Insights Service
 *
 * Story 8.1: Analytics Backend Foundation & Descriptive Statistics API (AC#4)
 * Pre-computed anonymized aggregates for unauthenticated visitors.
 * Redis cached with 1-hour TTL. Stricter suppression (minN=10).
 */

import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import type { PublicInsightsData, PublicTrendsData, SkillsFrequency, EmploymentTrendPoint } from '@oslsr/types';
import { suppressSmallBuckets, bandSmallBuckets, toBuckets } from '../utils/analytics-suppression.js';
import { selectMultipleUnnest } from '../lib/skills-extraction.js';
import { getRegistryCountCore, answeredFieldDenominator } from './registry-totals.service.js';
import { registryUnifiedSource } from './registry-unified.js';
import pino from 'pino';

const logger = pino({ name: 'public-insights' });

/**
 * ⚠️ BUMP THE `:vN` SUFFIX WHENEVER THE PAYLOAD SHAPE CHANGES.
 *
 * The cached JSON outlives the deploy by up to `CACHE_TTL`. A field that the
 * TYPE declares as always-present but a cached pre-deploy payload lacks is a
 * `undefined is not an object` on the PUBLIC page for that hour — and the hour
 * after a deploy is exactly when someone is looking. Equally, a corrected
 * FIGURE (ruling R-E moved two published rates) would otherwise stay hidden
 * behind the stale entry while the correction is announced.
 *
 * v2 (Story 12-4, 2026-08-17): added the required `rateDenominators`, and the
 * business-ownership + unemployment rates changed value.
 */
const CACHE_KEY = 'analytics:public:insights:v2';
const TRENDS_CACHE_KEY = 'analytics:public:trends';
const CACHE_TTL = 3600; // 1 hour
const PUBLIC_MIN_N = 10; // Stricter suppression for public data

const isTestMode = () =>
  process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';

function getRedisClient() {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
}

export class PublicInsightsService {
  /**
   * Get anonymized public insights. Checks Redis cache first.
   * No scope params, no filters accepted (prevents enumeration).
   */
  static async getPublicInsights(): Promise<PublicInsightsData> {
    // Try cache first
    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(CACHE_KEY);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err) {
        logger.warn({ event: 'public_insights.cache_read_failed', error: (err as Error).message });
      }
    }

    // Compute fresh data
    const data = await PublicInsightsService.computeInsights();

    // Cache result
    if (redis) {
      try {
        await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(data));
      } catch (err) {
        logger.warn({ event: 'public_insights.cache_write_failed', error: (err as Error).message });
      }
    }

    return data;
  }

  private static async computeInsights(): Promise<PublicInsightsData> {
    // Story 13-33 (AC2) — everything reads the ONE canonical respondent-anchored
    // unified source (`registry-unified`), NOT `FROM submissions`. Consequences:
    //   • per-respondent (a person with multiple submissions is counted once —
    //     `ru` is one row per respondent), and
    //   • no exclusion of submission-less registrants (imported / data_lost /
    //     no_submission still appear — they just carry a null `ru.raw_data`).
    // The DEMOGRAPHIC/SKILLS breakdowns need answers, so they filter to the
    // answer-bearing subset (`answersWhere`); the DENSITY + LGAs-covered count
    // ALL respondents (so the map agrees with the headline count by construction
    // and kills the 13-25-class drift). `answersWhere` on `ru` == "has answers"
    // because the LATERAL already keeps only the latest NON-EMPTY submission.
    //
    // ⭐ STORY 12-4 / RULING R-E — `answersWhere` IS NOT A RATE DENOMINATOR.
    // It means "has ANY answers". Two published rates used to divide by it, so
    // a person who was never ASKED about employment sat in the unemployment
    // denominator and *not asked* silently became *not employed* — both rates
    // read LOWER than the truth, on the page the launch blast drives traffic to.
    // A rate's denominator is now the set of people who answered THAT question
    // (`answeredFieldDenominator`, defined once in the 12-4 totals model).
    // `answersWhere` survives ONLY for the breakdown/suppression subset, which
    // legitimately means "has answers at all".
    const answersWhere = sql`ru.raw_data IS NOT NULL`;

    // The youth band, written ONCE. It is the youth rate's numerator filter, its
    // denominator, AND its published `n`, so three copies of the same EXTRACT
    // was three places to fix when the band or the source field moves. The
    // comment below on `youth_emp_n` explains why that move is a live risk.
    const youthBand = sql`EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 15 AND 35`;

    // Run all queries in parallel.
    // `countCore` (13-25) is respondent-scoped — registered PEOPLE (headline) +
    // the completed-survey subset (`withAnswers`). It now reads the SAME
    // `registry-unified` source these breakdowns do, so the headline, the
    // breakdown denominator, and the density can no longer disagree.
    const [
      countCore,
      summaryRows,
      genderRows,
      ageRows,
      skillRows,
      desiredSkillRows,
      empRows,
      formalInformalRows,
      lgaRows,
    ] = await Promise.all([
      // Respondent-scoped registry count-core (headline + funnel). Seed of 12-4.
      getRegistryCountCore(),

      // Summary aggregates. FROM the whole respondent set (no outer answers
      // filter): `lgas_covered` counts ALL respondents' LGAs (matches the density
      // map); the answer-based RATES use per-metric `FILTER (WHERE answersWhere)`
      // so their denominator stays the honest with-answers subset.
      db.execute(sql`
        SELECT
          COUNT(DISTINCT ru.lga_id) FILTER (WHERE ru.lga_id IS NOT NULL) AS lgas_covered,
          ROUND(
            COUNT(*) FILTER (WHERE ru.raw_data->>'has_business' = 'yes')::numeric * 100.0 /
            NULLIF(${answeredFieldDenominator('has_business')}, 0)
          , 1) AS biz_rate,
          ${answeredFieldDenominator('has_business')} AS biz_n,
          ROUND(
            COUNT(*) FILTER (WHERE
              ru.raw_data->>'employment_status' = 'no'
              AND COALESCE(ru.raw_data->>'temp_absent', 'no') = 'no'
              AND ru.raw_data->>'looking_for_work' = 'yes'
            )::numeric * 100.0 / NULLIF(${answeredFieldDenominator('employment_status')}, 0)
          , 1) AS unemployment_est,
          ${answeredFieldDenominator('employment_status')} AS unemployment_n,
          ROUND(
            COUNT(*) FILTER (WHERE
              ru.raw_data->>'employment_status' = 'yes'
              AND ${youthBand}
            )::numeric * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE ${youthBand}), 0)
          , 1) AS youth_emp_rate,
          -- Already per-field (the dob band IS its denominator) — but that was
          -- true BY ACCIDENT, not by design: association rows happen to carry
          -- age_years rather than dob, so they fell out of it. Luck changes;
          -- the n is published so a shift is visible instead of silent.
          COUNT(*) FILTER (WHERE ${youthBand}) AS youth_emp_n,
          ROUND(
            COUNT(*) FILTER (WHERE ru.raw_data->>'gender' = 'female')::numeric /
            NULLIF(COUNT(*) FILTER (WHERE ru.raw_data->>'gender' = 'male'), 0)
          , 2) AS gpi,
          ${answeredFieldDenominator('gender')} AS gpi_n
        FROM ${registryUnifiedSource('ru')}
      `),

      // Gender split (per answer-bearing respondent)
      db.execute(sql`
        SELECT ru.raw_data->>'gender' AS label, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${answersWhere} AND ru.raw_data->>'gender' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),

      // Age distribution
      db.execute(sql`
        SELECT
          CASE
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 15 AND 24 THEN '15-24'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 25 AND 34 THEN '25-34'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 35 AND 44 THEN '35-44'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 45 AND 54 THEN '45-54'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 55 AND 64 THEN '55-64'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) >= 65 THEN '65+'
            ELSE 'unknown'
          END AS label,
          COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${answersWhere} AND ru.raw_data->>'dob' IS NOT NULL
        GROUP BY label ORDER BY label
      `),

      // All skills (no LIMIT — frontend slices for display)
      db.execute(sql`
        SELECT skill, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')},
             ${selectMultipleUnnest(sql`ru.raw_data`, 'skills_possessed')} AS skill
        WHERE ${answersWhere}
          AND ru.raw_data->>'skills_possessed' IS NOT NULL
          AND ru.raw_data->>'skills_possessed' != ''
        GROUP BY skill
        ORDER BY count DESC
      `),

      // Desired skills (training_interest — want-to-learn)
      db.execute(sql`
        SELECT skill, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')},
             ${selectMultipleUnnest(sql`ru.raw_data`, 'training_interest')} AS skill
        WHERE ${answersWhere}
          AND ru.raw_data->>'training_interest' IS NOT NULL
          AND ru.raw_data->>'training_interest' != ''
        GROUP BY skill
        ORDER BY count DESC
      `),

      // Employment breakdown
      db.execute(sql`
        SELECT
          CASE
            WHEN ru.raw_data->>'employment_status' = 'yes' THEN 'employed'
            WHEN ru.raw_data->>'temp_absent' = 'yes' THEN 'temporarily_absent'
            WHEN ru.raw_data->>'looking_for_work' = 'yes' THEN 'unemployed_seeking'
            ELSE 'other'
          END AS label,
          COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${answersWhere}
        GROUP BY label ORDER BY count DESC
      `),

      // Formal vs informal ratio
      db.execute(sql`
        SELECT
          CASE
            WHEN ru.raw_data->>'employment_type' IN ('wage_public', 'wage_private', 'contractor') THEN 'formal'
            WHEN ru.raw_data->>'employment_type' IN ('self_employed', 'family_unpaid', 'apprentice') THEN 'informal'
            ELSE 'unknown'
          END AS label,
          COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${answersWhere} AND ru.raw_data->>'employment_type' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),

      // LGA density — ALL respondents per LGA (NOT the answer-bearing subset), so
      // the map counts every registered person (incl. submission-less imports)
      // and equals COUNT(DISTINCT r.id) per LGA over the unified read (AC2/AC3).
      // Null-`lga_id` respondents are EXCLUDED (13-33 review L2): they're already
      // in the headline (`totalRespondents`), but they can't be placed on a
      // geographic map — emitting them as an `'Unknown'` bucket would surface an
      // unplaceable row on the public table and a bucket the map silently drops.
      db.execute(sql`
        SELECT COALESCE(l.name, ru.lga_id) AS label, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        LEFT JOIN lgas l ON l.code = ru.lga_id
        WHERE ru.lga_id IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
    ]);

    interface SummaryRow {
      lgas_covered: string;
      biz_rate: string | null;
      biz_n: string | number | null;
      unemployment_est: string | null;
      unemployment_n: string | number | null;
      youth_emp_rate: string | null;
      youth_emp_n: string | number | null;
      gpi: string | null;
      gpi_n: string | number | null;
    }

    interface LabelCountRow {
      label: string;
      count: string | number;
    }

    interface SkillCountRow {
      skill: string;
      count: string | number;
    }

    const summary = summaryRows.rows[0] as unknown as SummaryRow | undefined;
    // Respondent-scoped with-answers count (13-33 AC2) — the honest denominator
    // for the demographic/skills breakdowns and their small-bucket suppression.
    // Sourced from `countCore` (the SAME registry-unified read the breakdowns use)
    // so it can no longer drift from the summary query's own tally. This is NOT
    // the headline: `totalRegistered` counts ALL registered people.
    const total = countCore.withAnswers;

    // Skills total for percentage
    const skillsTotal = (skillRows.rows as unknown as SkillCountRow[]).reduce(
      (sum: number, r: SkillCountRow) => sum + Number(r.count), 0,
    );

    const allSkills: SkillsFrequency[] = (skillRows.rows as Array<{ skill: string; count: string | number }>)
      .map((r) => ({
        skill: String(r.skill),
        count: Number(r.count),
        percentage: skillsTotal > 0 ? Math.round((Number(r.count) / skillsTotal) * 1000) / 10 : 0,
      }))
      .filter((s) => s.count >= PUBLIC_MIN_N);

    // Desired skills (training_interest)
    const desiredTotal = (desiredSkillRows.rows as unknown as SkillCountRow[]).reduce(
      (sum: number, r: SkillCountRow) => sum + Number(r.count), 0,
    );

    const desiredSkills: SkillsFrequency[] = (desiredSkillRows.rows as Array<{ skill: string; count: string | number }>)
      .map((r) => ({
        skill: String(r.skill),
        count: Number(r.count),
        percentage: desiredTotal > 0 ? Math.round((Number(r.count) / desiredTotal) * 1000) / 10 : 0,
      }))
      .filter((s) => s.count >= PUBLIC_MIN_N);

    // Suppress scalar metrics when total sample is below public threshold
    const meetsThreshold = total >= PUBLIC_MIN_N;

    return {
      // Headline: registered PEOPLE, not submissions (13-25 AC1). ~139+ today.
      totalRegistered: countCore.totalRespondents,
      // Funnel subset: registered people with complete survey responses (~79).
      // Breakdowns below are computed over this subset (13-25 AC2).
      withAnswers: countCore.withAnswers,
      lgasCovered: Number(summary?.lgas_covered ?? 0),
      genderSplit: suppressSmallBuckets(toBuckets(genderRows.rows as unknown as LabelCountRow[], total), PUBLIC_MIN_N),
      ageDistribution: suppressSmallBuckets(toBuckets(ageRows.rows as unknown as LabelCountRow[], total), PUBLIC_MIN_N),
      allSkills,
      desiredSkills,
      employmentBreakdown: suppressSmallBuckets(toBuckets(empRows.rows as unknown as LabelCountRow[], total), PUBLIC_MIN_N),
      formalInformalRatio: suppressSmallBuckets(toBuckets(formalInformalRows.rows as unknown as LabelCountRow[], total), PUBLIC_MIN_N),
      businessOwnershipRate: meetsThreshold && summary?.biz_rate != null ? Number(summary.biz_rate) : null,
      unemploymentEstimate: meetsThreshold && summary?.unemployment_est != null ? Number(summary.unemployment_est) : null,
      youthEmploymentRate: meetsThreshold && summary?.youth_emp_rate != null ? Number(summary.youth_emp_rate) : null,
      gpi: meetsThreshold && summary?.gpi != null ? Number(summary.gpi) : null,
      // R-E: each rate ships with the n it was computed from. These differ from
      // each other and from `withAnswers` — that difference IS the information.
      rateDenominators: {
        businessOwnership: Number(summary?.biz_n ?? 0),
        unemployment: Number(summary?.unemployment_n ?? 0),
        youthEmployment: Number(summary?.youth_emp_n ?? 0),
        gpi: Number(summary?.gpi_n ?? 0),
      },
      // Density is respondent-scoped over ALL registered people (share of the
      // headline total, not the with-answers subset) and BANDED, not blank-
      // suppressed (13-33 AC3): ≥10 → exact graduated count; 1–9 → present-but-
      // banded (exact number withheld, k-anon floor kept); 0 → absent (blank).
      // `bandSmallBuckets` is the SINGLE suppression authority — the frontend map
      // no longer re-suppresses.
      lgaDensity: bandSmallBuckets(toBuckets(lgaRows.rows as unknown as LabelCountRow[], countCore.totalRespondents), PUBLIC_MIN_N),
      lastUpdated: new Date().toISOString(),
      // Story 8.7: Key findings from inferential engine (Redis cache bridge)
      ...(await PublicInsightsService.getKeyFindings(total)),
    };
  }

  /**
   * Story 8.7: Read pre-computed key findings from Redis.
   * Written by SurveyAnalyticsService.getInferentialInsights() (Task 2.9).
   * Returns keyFindings only when total >= 200 and cache exists.
   */
  private static async getKeyFindings(totalSubmissions: number): Promise<{ keyFindings?: string[] }> {
    if (totalSubmissions < 200) return {};

    const redis = getRedisClient();
    if (!redis) return {};

    try {
      const cached = await redis.get('analytics:public:key-findings');
      if (cached) {
        const findings = JSON.parse(cached) as string[];
        if (Array.isArray(findings) && findings.length > 0) {
          return { keyFindings: findings };
        }
      }
    } catch (err) {
      logger.warn({ event: 'public_insights.key_findings_read_failed', error: (err as Error).message });
    }

    return {};
  }

  /**
   * Get daily registration trends for the last 90 days.
   * Redis cached with 1-hour TTL. Days with count < PUBLIC_MIN_N return null.
   */
  static async getTrends(): Promise<PublicTrendsData> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(TRENDS_CACHE_KEY);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err) {
        logger.warn({ event: 'public_trends.cache_read_failed', error: (err as Error).message });
      }
    }

    const data = await PublicInsightsService.computeTrends();

    if (redis) {
      try {
        await redis.setex(TRENDS_CACHE_KEY, CACHE_TTL, JSON.stringify(data));
      } catch (err) {
        logger.warn({ event: 'public_trends.cache_write_failed', error: (err as Error).message });
      }
    }

    return data;
  }

  private static async computeTrends(): Promise<PublicTrendsData> {
    const [dailyResult, empResult] = await Promise.all([
      db.execute(sql`
        SELECT DATE(s.created_at AT TIME ZONE 'Africa/Lagos') AS date,
               COUNT(*) AS count
        FROM submissions s
        WHERE s.raw_data IS NOT NULL
          AND s.respondent_id IS NOT NULL
          AND s.created_at >= NOW() - INTERVAL '90 days'
        GROUP BY date
        ORDER BY date ASC
      `),
      // Weekly employment type breakdown (AC#5)
      db.execute(sql`
        SELECT DATE_TRUNC('week', s.created_at AT TIME ZONE 'Africa/Lagos')::date AS week,
               CASE
                 WHEN s.raw_data->>'employment_status' = 'yes' THEN 'employed'
                 WHEN s.raw_data->>'temp_absent' = 'yes' THEN 'temporarily_absent'
                 WHEN s.raw_data->>'looking_for_work' = 'yes' THEN 'unemployed_seeking'
                 ELSE 'other'
               END AS status,
               COUNT(*) AS count
        FROM submissions s
        WHERE s.raw_data IS NOT NULL
          AND s.respondent_id IS NOT NULL
          AND s.created_at >= NOW() - INTERVAL '90 days'
        GROUP BY week, status
        ORDER BY week ASC
      `),
    ]);

    const dailyRegistrations = (dailyResult.rows as Array<{ date: string; count: string | number }>)
      .map((r) => ({
        date: String(r.date),
        count: Number(r.count) >= PUBLIC_MIN_N ? Number(r.count) : null,
      }));

    // Pivot employment rows into weekly points with per-cell suppression
    const weekMap = new Map<string, EmploymentTrendPoint>();
    for (const row of empResult.rows as Array<{ week: string; status: string; count: string | number }>) {
      const week = String(row.week);
      if (!weekMap.has(week)) {
        weekMap.set(week, { week, employed: null, unemployedSeeking: null, temporarilyAbsent: null, other: null });
      }
      const point = weekMap.get(week)!;
      const count = Number(row.count);
      const val = count >= PUBLIC_MIN_N ? count : null;
      switch (row.status) {
        case 'employed': point.employed = val; break;
        case 'unemployed_seeking': point.unemployedSeeking = val; break;
        case 'temporarily_absent': point.temporarilyAbsent = val; break;
        default: point.other = val; break;
      }
    }

    return {
      dailyRegistrations,
      employmentByWeek: Array.from(weekMap.values()),
      totalDays: dailyRegistrations.length,
      lastUpdated: new Date().toISOString(),
    };
  }
}
