/**
 * Public Insights Service
 *
 * Story 8.1: Analytics Backend Foundation & Descriptive Statistics API (AC#4)
 * Pre-computed anonymized aggregates for unauthenticated visitors.
 * Redis cached with 1-hour TTL. Stricter suppression (minN=10).
 */

import { Redis } from 'ioredis';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import type { PublicInsightsData, FrequencyBucket, SkillsFrequency } from '@oslsr/types';
import { suppressSmallBuckets, toBuckets } from '../utils/analytics-suppression.js';
import pino from 'pino';

const logger = pino({ name: 'public-insights' });

const CACHE_KEY = 'analytics:public:insights';
const CACHE_TTL = 3600; // 1 hour
const PUBLIC_MIN_N = 10; // Stricter suppression for public data

const isTestMode = () =>
  process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';

let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  if (!redisClient && !isTestMode()) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
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
    const baseWhere = sql`s.raw_data IS NOT NULL AND s.respondent_id IS NOT NULL`;

    // Run all queries in parallel
    const [
      summaryRows,
      genderRows,
      ageRows,
      skillRows,
      empRows,
      formalInformalRows,
      lgaRows,
    ] = await Promise.all([
      // Summary aggregates
      db.execute(sql`
        SELECT
          COUNT(*) AS total,
          COUNT(DISTINCT r.lga_id) FILTER (WHERE r.lga_id IS NOT NULL) AS lgas_covered,
          ROUND(
            COUNT(*) FILTER (WHERE s.raw_data->>'has_business' = 'yes')::numeric * 100.0 /
            NULLIF(COUNT(*), 0)
          , 1) AS biz_rate,
          ROUND(
            COUNT(*) FILTER (WHERE
              s.raw_data->>'employment_status' = 'no'
              AND COALESCE(s.raw_data->>'temp_absent', 'no') = 'no'
              AND s.raw_data->>'looking_for_work' = 'yes'
            )::numeric * 100.0 / NULLIF(COUNT(*), 0)
          , 1) AS unemployment_est,
          ROUND(
            COUNT(*) FILTER (WHERE
              s.raw_data->>'employment_status' = 'yes'
              AND EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 15 AND 35
            )::numeric * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE
              EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 15 AND 35
            ), 0)
          , 1) AS youth_emp_rate,
          ROUND(
            COUNT(*) FILTER (WHERE s.raw_data->>'gender' = 'female')::numeric /
            NULLIF(COUNT(*) FILTER (WHERE s.raw_data->>'gender' = 'male'), 0)
          , 2) AS gpi
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${baseWhere}
      `),

      // Gender split
      db.execute(sql`
        SELECT s.raw_data->>'gender' AS label, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${baseWhere} AND s.raw_data->>'gender' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),

      // Age distribution
      db.execute(sql`
        SELECT
          CASE
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 15 AND 24 THEN '15-24'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 25 AND 34 THEN '25-34'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 35 AND 44 THEN '35-44'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 45 AND 54 THEN '45-54'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 55 AND 64 THEN '55-64'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) >= 65 THEN '65+'
            ELSE 'unknown'
          END AS label,
          COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${baseWhere} AND s.raw_data->>'dob' IS NOT NULL
        GROUP BY label ORDER BY label
      `),

      // Top 10 skills
      db.execute(sql`
        SELECT skill, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id,
             unnest(string_to_array(s.raw_data->>'skills_possessed', ' ')) AS skill
        WHERE ${baseWhere}
          AND s.raw_data->>'skills_possessed' IS NOT NULL
          AND s.raw_data->>'skills_possessed' != ''
        GROUP BY skill
        ORDER BY count DESC
        LIMIT 10
      `),

      // Employment breakdown
      db.execute(sql`
        SELECT
          CASE
            WHEN s.raw_data->>'employment_status' = 'yes' THEN 'employed'
            WHEN s.raw_data->>'temp_absent' = 'yes' THEN 'temporarily_absent'
            WHEN s.raw_data->>'looking_for_work' = 'yes' THEN 'unemployed_seeking'
            ELSE 'other'
          END AS label,
          COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${baseWhere}
        GROUP BY label ORDER BY count DESC
      `),

      // Formal vs informal ratio
      db.execute(sql`
        SELECT
          CASE
            WHEN s.raw_data->>'employment_type' IN ('wage_public', 'wage_private', 'contractor') THEN 'formal'
            WHEN s.raw_data->>'employment_type' IN ('self_employed', 'family_unpaid', 'apprentice') THEN 'informal'
            ELSE 'unknown'
          END AS label,
          COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${baseWhere} AND s.raw_data->>'employment_type' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),

      // LGA density
      db.execute(sql`
        SELECT COALESCE(l.name, r.lga_id, 'Unknown') AS label, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        LEFT JOIN lgas l ON l.code = r.lga_id
        WHERE ${baseWhere}
        GROUP BY label ORDER BY count DESC
      `),
    ]);

    const summary = summaryRows.rows[0] as any;
    const total = Number(summary?.total ?? 0);

    // Skills total for percentage
    const skillsTotal = (skillRows.rows as any[]).reduce(
      (sum: number, r: any) => sum + Number(r.count), 0,
    );

    const topSkills: SkillsFrequency[] = (skillRows.rows as Array<{ skill: string; count: string | number }>)
      .map((r) => ({
        skill: String(r.skill),
        count: Number(r.count),
        percentage: skillsTotal > 0 ? Math.round((Number(r.count) / skillsTotal) * 1000) / 10 : 0,
      }))
      .filter((s) => s.count >= PUBLIC_MIN_N);

    // Suppress scalar metrics when total sample is below public threshold
    const meetsThreshold = total >= PUBLIC_MIN_N;

    return {
      totalRegistered: total,
      lgasCovered: Number(summary?.lgas_covered ?? 0),
      genderSplit: suppressSmallBuckets(toBuckets(genderRows.rows as any, total), PUBLIC_MIN_N),
      ageDistribution: suppressSmallBuckets(toBuckets(ageRows.rows as any, total), PUBLIC_MIN_N),
      topSkills,
      employmentBreakdown: suppressSmallBuckets(toBuckets(empRows.rows as any, total), PUBLIC_MIN_N),
      formalInformalRatio: suppressSmallBuckets(toBuckets(formalInformalRows.rows as any, total), PUBLIC_MIN_N),
      businessOwnershipRate: meetsThreshold && summary?.biz_rate != null ? Number(summary.biz_rate) : null,
      unemploymentEstimate: meetsThreshold && summary?.unemployment_est != null ? Number(summary.unemployment_est) : null,
      youthEmploymentRate: meetsThreshold && summary?.youth_emp_rate != null ? Number(summary.youth_emp_rate) : null,
      gpi: meetsThreshold && summary?.gpi != null ? Number(summary.gpi) : null,
      lgaDensity: suppressSmallBuckets(toBuckets(lgaRows.rows as any, total), PUBLIC_MIN_N),
    };
  }
}
