/**
 * Survey Analytics Service
 *
 * Story 8.1: Analytics Backend Foundation & Descriptive Statistics API
 * Role-scoped descriptive statistics from submissions + respondents.
 *
 * All queries:
 * - JOIN submissions ↔ respondents for geographic and identity data
 * - Apply scope filtering (system / LGA / personal)
 * - Apply optional query params (lgaId, dateFrom, dateTo, source)
 * - Extract from submissions.raw_data JSONB using questionnaire field names
 * - Apply suppression to bucket-based results (AC#3)
 */

import { db } from '../db/index.js';
import { sql, type SQL } from 'drizzle-orm';
import type {
  AnalyticsQueryParams,
  DemographicStats,
  EmploymentStats,
  HouseholdStats,
  SkillsFrequency,
  TrendDataPoint,
  RegistrySummary,
  PipelineSummary,
  CrossTabResult,
  CrossTabMeasure,
  SkillsInventoryData,
} from '@oslsr/types';
import { CrossTabDimension } from '@oslsr/types';
import { ISCO08_SECTOR_MAP } from '@oslsr/types';
import type { AnalyticsScope } from '../middleware/analytics-scope.js';
import { suppressSmallBuckets, suppressIfTooFew, toBuckets } from '../utils/analytics-suppression.js';
import { Redis } from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'survey-analytics' });

const isTestMode = () =>
  process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';

let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  if (!redisClient && !isTestMode()) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
}

/**
 * Map CrossTabDimension enum to SQL expression.
 * All use Drizzle sql template tags — never sql.raw() for safety.
 */
function dimensionToSql(dim: CrossTabDimension): SQL {
  switch (dim) {
    case CrossTabDimension.GENDER:
      return sql`s.raw_data->>'gender'`;
    case CrossTabDimension.AGE_BAND:
      return sql`CASE
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 15 AND 19 THEN '15-19'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 20 AND 24 THEN '20-24'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 25 AND 29 THEN '25-29'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 30 AND 34 THEN '30-34'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 35 AND 39 THEN '35-39'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 40 AND 44 THEN '40-44'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 45 AND 49 THEN '45-49'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 50 AND 54 THEN '50-54'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 55 AND 59 THEN '55-59'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) >= 60 THEN '60+'
        ELSE 'unknown'
      END`;
    case CrossTabDimension.EDUCATION:
      return sql`s.raw_data->>'education_level'`;
    case CrossTabDimension.LGA:
      return sql`COALESCE(l.name, r.lga_id, 'Unknown')`;
    case CrossTabDimension.EMPLOYMENT_TYPE:
      return sql`s.raw_data->>'employment_type'`;
    case CrossTabDimension.MARITAL_STATUS:
      return sql`s.raw_data->>'marital_status'`;
    case CrossTabDimension.HOUSING:
      return sql`s.raw_data->>'housing_status'`;
    case CrossTabDimension.DISABILITY:
      return sql`s.raw_data->>'disability_status'`;
  }
}

/**
 * Shannon diversity index: H = -sum(p_i * ln(p_i))
 */
function shannonIndex(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return -counts
    .filter(c => c > 0)
    .reduce((H, c) => H + (c / total) * Math.log(c / total), 0);
}

/** Deterministic JSON serialization for cache keys (sorted object keys). */
function stableStringify(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

const CROSS_TAB_THRESHOLD = 50;
const SKILLS_THRESHOLD_GENERAL = 30;
const SKILLS_THRESHOLD_PER_LGA = 20;

/**
 * Build parameterized WHERE clause fragments for scope + optional params.
 * Uses Drizzle sql template tag — NEVER sql.raw() for user-supplied values.
 */
function buildWhereFragments(scope: AnalyticsScope, params: AnalyticsQueryParams = {}): SQL {
  const conditions: SQL[] = [
    sql`s.raw_data IS NOT NULL`,
    sql`s.respondent_id IS NOT NULL`,
  ];

  // Scope filtering
  switch (scope.type) {
    case 'lga':
      if (!scope.lgaCode) {
        throw new Error('AnalyticsScope type is "lga" but lgaCode is undefined');
      }
      conditions.push(sql`r.lga_id = ${scope.lgaCode}`);
      break;
    case 'personal':
      if (!scope.userId) {
        throw new Error('AnalyticsScope type is "personal" but userId is undefined');
      }
      conditions.push(sql`s.submitter_id = ${scope.userId}`);
      break;
    // system: no additional filter
  }

  // Optional query param filters
  if (params.lgaId) {
    conditions.push(sql`r.lga_id = ${params.lgaId}`);
  }
  if (params.dateFrom) {
    conditions.push(sql`s.submitted_at >= ${params.dateFrom}::timestamptz`);
  }
  if (params.dateTo) {
    conditions.push(sql`s.submitted_at <= ${params.dateTo}::timestamptz`);
  }
  if (params.source) {
    conditions.push(sql`s.source = ${params.source}`);
  }

  return sql.join(conditions, sql` AND `);
}

const SUPPRESSION_MIN_N = 5;
const ACTIVE_ENUMERATOR_DEFAULT_DAYS = 7;

export class SurveyAnalyticsService {
  /**
   * Demographics: gender, age bands, education, marital status, disability, LGA distribution
   */
  static async getDemographics(scope: AnalyticsScope, params: AnalyticsQueryParams = {}): Promise<DemographicStats> {
    const where = buildWhereFragments(scope, params);

    // Total count for percentage calculations
    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      WHERE ${where}
    `);
    const total = Number((totalResult.rows[0] as any)?.total ?? 0);

    // Run all distribution queries in parallel
    const [genderRows, ageRows, eduRows, maritalRows, disabilityRows, lgaRows, consentMktRows, consentEnrRows] = await Promise.all([
      // Gender
      db.execute(sql`
        SELECT s.raw_data->>'gender' AS label, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where} AND s.raw_data->>'gender' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Age bands
      db.execute(sql`
        SELECT
          CASE
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 15 AND 19 THEN '15-19'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 20 AND 24 THEN '20-24'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 25 AND 29 THEN '25-29'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 30 AND 34 THEN '30-34'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 35 AND 39 THEN '35-39'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 40 AND 44 THEN '40-44'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 45 AND 49 THEN '45-49'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 50 AND 54 THEN '50-54'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 55 AND 59 THEN '55-59'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) >= 60 THEN '60+'
            ELSE 'unknown'
          END AS label,
          COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where} AND s.raw_data->>'dob' IS NOT NULL
        GROUP BY label ORDER BY label
      `),
      // Education
      db.execute(sql`
        SELECT s.raw_data->>'education_level' AS label, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where} AND s.raw_data->>'education_level' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Marital status
      db.execute(sql`
        SELECT s.raw_data->>'marital_status' AS label, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where} AND s.raw_data->>'marital_status' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Disability
      db.execute(sql`
        SELECT s.raw_data->>'disability_status' AS label, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where} AND s.raw_data->>'disability_status' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // LGA distribution
      db.execute(sql`
        SELECT COALESCE(l.name, r.lga_id, 'Unknown') AS label, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        LEFT JOIN lgas l ON l.code = r.lga_id
        WHERE ${where}
        GROUP BY label ORDER BY count DESC
      `),
      // Consent: marketplace opt-in (AC#2)
      db.execute(sql`
        SELECT s.raw_data->>'consent_marketplace' AS label, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where} AND s.raw_data->>'consent_marketplace' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Consent: enriched data sharing (AC#2)
      db.execute(sql`
        SELECT s.raw_data->>'consent_enriched' AS label, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where} AND s.raw_data->>'consent_enriched' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
    ]);

    return {
      genderDistribution: suppressSmallBuckets(toBuckets(genderRows.rows as any, total)),
      ageDistribution: suppressSmallBuckets(toBuckets(ageRows.rows as any, total)),
      educationDistribution: suppressSmallBuckets(toBuckets(eduRows.rows as any, total)),
      maritalDistribution: suppressSmallBuckets(toBuckets(maritalRows.rows as any, total)),
      disabilityPrevalence: suppressSmallBuckets(toBuckets(disabilityRows.rows as any, total)),
      lgaDistribution: suppressSmallBuckets(toBuckets(lgaRows.rows as any, total)),
      consentMarketplace: suppressSmallBuckets(toBuckets(consentMktRows.rows as any, total)),
      consentEnriched: suppressSmallBuckets(toBuckets(consentEnrRows.rows as any, total)),
    };
  }

  /**
   * Employment statistics: work status, type, experience, hours, income
   */
  static async getEmployment(scope: AnalyticsScope, params: AnalyticsQueryParams = {}): Promise<EmploymentStats> {
    const where = buildWhereFragments(scope, params);

    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      WHERE ${where}
    `);
    const total = Number((totalResult.rows[0] as any)?.total ?? 0);

    const [workStatusRows, empTypeRows, formalInformalRows, expRows, hoursRows, incomeRows, incomeByLgaRows] = await Promise.all([
      // Work status (ILO-aligned classification)
      db.execute(sql`
        SELECT
          CASE
            WHEN s.raw_data->>'employment_status' = 'yes' THEN 'employed'
            WHEN s.raw_data->>'temp_absent' = 'yes' THEN 'temporarily_absent'
            WHEN s.raw_data->>'looking_for_work' = 'yes' THEN 'unemployed_seeking'
            WHEN s.raw_data->>'available_for_work' = 'yes' THEN 'unemployed_available'
            ELSE 'not_in_labour_force'
          END AS label,
          COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where}
        GROUP BY label ORDER BY count DESC
      `),
      // Employment type
      db.execute(sql`
        SELECT s.raw_data->>'employment_type' AS label, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where} AND s.raw_data->>'employment_type' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Formal vs informal
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
        WHERE ${where} AND s.raw_data->>'employment_type' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Experience
      db.execute(sql`
        SELECT s.raw_data->>'years_experience' AS label, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where} AND s.raw_data->>'years_experience' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Hours worked (bands)
      db.execute(sql`
        SELECT
          CASE
            WHEN (s.raw_data->>'hours_worked')::int BETWEEN 0 AND 19 THEN '0-19'
            WHEN (s.raw_data->>'hours_worked')::int BETWEEN 20 AND 34 THEN '20-34'
            WHEN (s.raw_data->>'hours_worked')::int BETWEEN 35 AND 44 THEN '35-44'
            WHEN (s.raw_data->>'hours_worked')::int BETWEEN 45 AND 59 THEN '45-59'
            WHEN (s.raw_data->>'hours_worked')::int >= 60 THEN '60+'
            ELSE 'unknown'
          END AS label,
          COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where}
          AND s.raw_data->>'hours_worked' IS NOT NULL
          AND s.raw_data->>'hours_worked' ~ '^[0-9]+$'
        GROUP BY label ORDER BY label
      `),
      // Income distribution (bands in Naira)
      db.execute(sql`
        SELECT
          CASE
            WHEN (s.raw_data->>'monthly_income')::int < 30000 THEN 'under_30k'
            WHEN (s.raw_data->>'monthly_income')::int BETWEEN 30000 AND 49999 THEN '30k-50k'
            WHEN (s.raw_data->>'monthly_income')::int BETWEEN 50000 AND 99999 THEN '50k-100k'
            WHEN (s.raw_data->>'monthly_income')::int BETWEEN 100000 AND 199999 THEN '100k-200k'
            WHEN (s.raw_data->>'monthly_income')::int >= 200000 THEN '200k+'
            ELSE 'unknown'
          END AS label,
          COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where}
          AND s.raw_data->>'monthly_income' IS NOT NULL
          AND s.raw_data->>'monthly_income' ~ '^[0-9]+$'
        GROUP BY label ORDER BY label
      `),
      // Income-reporting respondents by LGA
      db.execute(sql`
        SELECT COALESCE(l.name, r.lga_id, 'Unknown') AS label, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        LEFT JOIN lgas l ON l.code = r.lga_id
        WHERE ${where}
          AND s.raw_data->>'monthly_income' IS NOT NULL
          AND s.raw_data->>'monthly_income' ~ '^[0-9]+$'
        GROUP BY label ORDER BY count DESC
      `),
    ]);

    return {
      workStatusBreakdown: suppressSmallBuckets(toBuckets(workStatusRows.rows as any, total)),
      employmentTypeBreakdown: suppressSmallBuckets(toBuckets(empTypeRows.rows as any, total)),
      formalInformalRatio: suppressSmallBuckets(toBuckets(formalInformalRows.rows as any, total)),
      experienceDistribution: suppressSmallBuckets(toBuckets(expRows.rows as any, total)),
      hoursWorked: suppressSmallBuckets(toBuckets(hoursRows.rows as any, total)),
      incomeDistribution: suppressSmallBuckets(toBuckets(incomeRows.rows as any, total)),
      incomeByLga: suppressSmallBuckets(toBuckets(incomeByLgaRows.rows as any, total)),
    };
  }

  /**
   * Household statistics: size distribution, dependency, housing, business
   */
  static async getHousehold(scope: AnalyticsScope, params: AnalyticsQueryParams = {}): Promise<HouseholdStats> {
    const where = buildWhereFragments(scope, params);

    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      WHERE ${where}
    `);
    const total = Number((totalResult.rows[0] as any)?.total ?? 0);

    const [sizeRows, headRows, housingRows, aggregates] = await Promise.all([
      // Household size bands
      db.execute(sql`
        SELECT
          CASE
            WHEN (s.raw_data->>'household_size')::int = 1 THEN '1'
            WHEN (s.raw_data->>'household_size')::int BETWEEN 2 AND 3 THEN '2-3'
            WHEN (s.raw_data->>'household_size')::int BETWEEN 4 AND 6 THEN '4-6'
            WHEN (s.raw_data->>'household_size')::int BETWEEN 7 AND 10 THEN '7-10'
            WHEN (s.raw_data->>'household_size')::int > 10 THEN '11+'
            ELSE 'unknown'
          END AS label,
          COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where}
          AND s.raw_data->>'household_size' IS NOT NULL
          AND s.raw_data->>'household_size' ~ '^[0-9]+$'
        GROUP BY label ORDER BY label
      `),
      // Head of household by gender
      db.execute(sql`
        SELECT s.raw_data->>'gender' AS label, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where}
          AND s.raw_data->>'is_head' = 'yes'
          AND s.raw_data->>'gender' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Housing status
      db.execute(sql`
        SELECT s.raw_data->>'housing_status' AS label, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where} AND s.raw_data->>'housing_status' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Aggregate scalars
      db.execute(sql`
        SELECT
          CASE WHEN COUNT(*) > 0
            THEN ROUND(
              SUM(CASE WHEN s.raw_data->>'dependents_count' ~ '^[0-9]+$'
                  THEN (s.raw_data->>'dependents_count')::numeric ELSE 0 END)::numeric /
              NULLIF(SUM(CASE WHEN s.raw_data->>'household_size' ~ '^[0-9]+$'
                  THEN (s.raw_data->>'household_size')::numeric ELSE 0 END), 0)
            , 2)
            ELSE NULL
          END AS dependency_ratio,
          COUNT(*) FILTER (WHERE s.raw_data->>'has_business' = 'yes') AS biz_owners,
          COUNT(*) FILTER (WHERE s.raw_data->>'business_reg' = 'registered') AS biz_registered,
          SUM(CASE WHEN s.raw_data->>'apprentice_count' ~ '^[0-9]+$'
              THEN (s.raw_data->>'apprentice_count')::int ELSE 0 END) AS apprentice_total,
          COUNT(*) AS total_count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where}
      `),
    ]);

    const agg = aggregates.rows[0] as any;
    const totalCount = Number(agg?.total_count ?? 0);
    const bizOwners = Number(agg?.biz_owners ?? 0);
    const bizRegistered = Number(agg?.biz_registered ?? 0);

    const headTotal = (headRows.rows as any[]).reduce((sum: number, r: any) => sum + Number(r.count), 0);

    return {
      householdSizeDistribution: suppressSmallBuckets(toBuckets(sizeRows.rows as any, total)),
      dependencyRatio: agg?.dependency_ratio != null ? Number(agg.dependency_ratio) : null,
      headOfHouseholdByGender: suppressSmallBuckets(toBuckets(headRows.rows as any, headTotal)),
      housingDistribution: suppressSmallBuckets(toBuckets(housingRows.rows as any, total)),
      businessOwnershipRate: suppressIfTooFew(bizOwners) !== null && totalCount > 0
        ? Math.round((bizOwners / totalCount) * 1000) / 10
        : null,
      businessRegistrationRate: suppressIfTooFew(bizRegistered) !== null && bizOwners > 0
        ? Math.round((bizRegistered / bizOwners) * 1000) / 10
        : null,
      apprenticeTotal: suppressIfTooFew(Number(agg?.apprentice_total ?? 0)),
    };
  }

  /**
   * Top N skills by frequency, unnesting space-separated skill codes
   */
  static async getSkillsFrequency(
    scope: AnalyticsScope,
    params: AnalyticsQueryParams = {},
    limit: number = 20,
  ): Promise<SkillsFrequency[]> {
    const where = buildWhereFragments(scope, params);

    // Total submissions with skills for percentage
    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      WHERE ${where}
        AND s.raw_data->>'skills_possessed' IS NOT NULL
        AND s.raw_data->>'skills_possessed' != ''
    `);
    const total = Number((totalResult.rows[0] as any)?.total ?? 0);

    const safeLimit = Math.max(1, Math.min(limit, 100));

    const rows = await db.execute(sql`
      SELECT skill, COUNT(*) AS count
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id,
           unnest(string_to_array(s.raw_data->>'skills_possessed', ' ')) AS skill
      WHERE ${where}
        AND s.raw_data->>'skills_possessed' IS NOT NULL
        AND s.raw_data->>'skills_possessed' != ''
      GROUP BY skill
      ORDER BY count DESC
      LIMIT ${safeLimit}
    `);

    return (rows.rows as Array<{ skill: string; count: string | number }>)
      .map((r) => ({
        skill: String(r.skill),
        count: Number(r.count),
        percentage: total > 0 ? Math.round((Number(r.count) / total) * 1000) / 10 : 0,
      }))
      .filter((s) => s.count >= SUPPRESSION_MIN_N);
  }

  /**
   * Time series trends grouped by day, week, or month
   */
  static async getTrends(
    scope: AnalyticsScope,
    params: AnalyticsQueryParams = {},
    granularity: 'day' | 'week' | 'month' = 'day',
    days: number = 30,
  ): Promise<TrendDataPoint[]> {
    const where = buildWhereFragments(scope, params);
    const safeDays = Math.max(1, Math.min(days, 365));

    // Granularity is controlled by code (not user input), safe to use sql.raw
    let dateExpr: SQL;
    switch (granularity) {
      case 'week':
        dateExpr = sql`TO_CHAR(DATE_TRUNC('week', s.submitted_at AT TIME ZONE 'Africa/Lagos'), 'YYYY-MM-DD')`;
        break;
      case 'month':
        dateExpr = sql`TO_CHAR(DATE_TRUNC('month', s.submitted_at AT TIME ZONE 'Africa/Lagos'), 'YYYY-MM')`;
        break;
      default:
        dateExpr = sql`TO_CHAR(s.submitted_at AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD')`;
    }

    const rows = await db.execute(sql`
      SELECT ${dateExpr} AS date, COUNT(*) AS count
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      WHERE ${where}
        AND s.submitted_at >= NOW() - (${safeDays}::int * INTERVAL '1 day')
      GROUP BY date
      ORDER BY date
    `);

    return (rows.rows as Array<{ date: string; count: string | number }>).map((r) => ({
      date: String(r.date),
      count: Number(r.count),
    }));
  }

  /**
   * 7 stat fields: totalRespondents, employed, female, avgAge, businessOwners,
   * consentMarketplacePct, consentEnrichedPct. Single query for efficiency (AC#6)
   */
  static async getRegistrySummary(scope: AnalyticsScope, params: AnalyticsQueryParams = {}): Promise<RegistrySummary> {
    const where = buildWhereFragments(scope, params);

    const rows = await db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE s.raw_data->>'employment_status' = 'yes') AS employed,
        COUNT(*) FILTER (WHERE s.raw_data->>'gender' = 'female') AS female,
        AVG(EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)))
          FILTER (WHERE s.raw_data->>'dob' IS NOT NULL) AS avg_age,
        COUNT(*) FILTER (WHERE s.raw_data->>'has_business' = 'yes') AS biz_owners,
        ROUND(100.0 * COUNT(*) FILTER (WHERE s.raw_data->>'consent_marketplace' = 'yes') / NULLIF(COUNT(*), 0), 1) AS consent_marketplace_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE s.raw_data->>'consent_enriched' = 'yes') / NULLIF(COUNT(*), 0), 1) AS consent_enriched_pct
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      WHERE ${where}
    `);

    const row = rows.rows[0] as any;
    const total = Number(row?.total ?? 0);
    const employed = Number(row?.employed ?? 0);
    const female = Number(row?.female ?? 0);
    const bizOwners = Number(row?.biz_owners ?? 0);

    return {
      totalRespondents: total,
      employedCount: employed,
      employedPct: total > 0 ? Math.round((employed / total) * 1000) / 10 : 0,
      femaleCount: female,
      femalePct: total > 0 ? Math.round((female / total) * 1000) / 10 : 0,
      avgAge: row?.avg_age != null ? Math.round(Number(row.avg_age) * 10) / 10 : null,
      businessOwners: bizOwners,
      businessOwnersPct: total > 0 ? Math.round((bizOwners / total) * 1000) / 10 : 0,
      consentMarketplacePct: total < SUPPRESSION_MIN_N ? null : Number(row?.consent_marketplace_pct ?? 0),
      consentEnrichedPct: total < SUPPRESSION_MIN_N ? null : Number(row?.consent_enriched_pct ?? 0),
    };
  }

  /**
   * Pipeline summary: submission processing operational stats
   * Queries submissions table directly (no raw_data requirement).
   */
  static async getPipelineSummary(scope: AnalyticsScope, params: AnalyticsQueryParams = {}): Promise<PipelineSummary> {
    const conditions: SQL[] = [sql`s.respondent_id IS NOT NULL`];

    // Scope filtering
    switch (scope.type) {
      case 'lga':
        if (!scope.lgaCode) {
          throw new Error('AnalyticsScope type is "lga" but lgaCode is undefined');
        }
        conditions.push(sql`r.lga_id = ${scope.lgaCode}`);
        break;
      case 'personal':
        if (!scope.userId) {
          throw new Error('AnalyticsScope type is "personal" but userId is undefined');
        }
        conditions.push(sql`s.submitter_id = ${scope.userId}`);
        break;
    }

    // Optional query param filters
    if (params.lgaId) {
      conditions.push(sql`r.lga_id = ${params.lgaId}`);
    }
    if (params.dateFrom) {
      conditions.push(sql`s.submitted_at >= ${params.dateFrom}::timestamptz`);
    }
    if (params.dateTo) {
      conditions.push(sql`s.submitted_at <= ${params.dateTo}::timestamptz`);
    }
    if (params.source) {
      conditions.push(sql`s.source = ${params.source}`);
    }

    const where = sql.join(conditions, sql` AND `);

    // Build the active enumerators filter: use caller's date range if provided, otherwise default window
    let activeEnumFilter: SQL;
    if (params.dateFrom && params.dateTo) {
      activeEnumFilter = sql`s.submitted_at >= ${params.dateFrom}::timestamptz AND s.submitted_at <= ${params.dateTo}::timestamptz`;
    } else if (params.dateFrom) {
      activeEnumFilter = sql`s.submitted_at >= ${params.dateFrom}::timestamptz`;
    } else if (params.dateTo) {
      activeEnumFilter = sql`s.submitted_at <= ${params.dateTo}::timestamptz`;
    } else {
      activeEnumFilter = sql`s.submitted_at > NOW() - INTERVAL '${sql.raw(String(ACTIVE_ENUMERATOR_DEFAULT_DAYS))} days'`;
    }

    const rows = await db.execute(sql`
      SELECT
        COUNT(*) AS "totalSubmissions",
        ROUND(100.0 * COUNT(*) FILTER (WHERE s.processed = true) / NULLIF(COUNT(*), 0), 1) AS "completionRate",
        AVG(s.completion_time_seconds) AS "avgCompletionTimeSecs",
        COUNT(DISTINCT s.enumerator_id) FILTER (WHERE ${activeEnumFilter}) AS "activeEnumerators"
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      WHERE ${where}
    `);

    const row = rows.rows[0] as any;
    const totalSubmissions = Number(row?.totalSubmissions ?? 0);

    // Suppress pipeline stats when sample size is too small
    if (totalSubmissions < SUPPRESSION_MIN_N) {
      return {
        totalSubmissions,
        completionRate: null as unknown as number,
        avgCompletionTimeSecs: null,
        activeEnumerators: null as unknown as number,
      };
    }

    return {
      totalSubmissions,
      completionRate: Number(row?.completionRate ?? 0),
      avgCompletionTimeSecs: row?.avgCompletionTimeSecs != null ? Number(row.avgCompletionTimeSecs) : null,
      activeEnumerators: Number(row?.activeEnumerators ?? 0),
    };
  }

  /**
   * Cross-tabulation: 2D pivot of any two demographic dimensions.
   * Returns matrix structure with suppression and percentage measures.
   */
  static async getCrossTab(
    rowDim: CrossTabDimension,
    colDim: CrossTabDimension,
    measure: CrossTabMeasure | string = 'count',
    scope: AnalyticsScope,
    params: AnalyticsQueryParams = {},
  ): Promise<CrossTabResult> {
    const where = buildWhereFragments(scope, params);

    // Check cache
    const cacheKey = `analytics:cross-tab:${scope.type}:${scope.lgaCode || scope.userId || 'all'}:${rowDim}:${colDim}:${measure}:${stableStringify(params as unknown as Record<string, unknown>)}`;
    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (err) {
        logger.warn({ event: 'cross_tab.cache_read_failed', error: (err as Error).message });
      }
    }

    // Threshold guard
    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      WHERE ${where}
    `);
    const totalN = Number((totalResult.rows[0] as any)?.total ?? 0);

    if (totalN < CROSS_TAB_THRESHOLD) {
      return { rowLabels: [], colLabels: [], cells: [], totalN, anySuppressed: false, belowThreshold: true, currentN: totalN, requiredN: CROSS_TAB_THRESHOLD };
    }

    const rowExpr = dimensionToSql(rowDim);
    const colExpr = dimensionToSql(colDim);

    // LGA dimension requires extra JOIN
    const needsLgaJoin = rowDim === CrossTabDimension.LGA || colDim === CrossTabDimension.LGA;
    const lgaJoin = needsLgaJoin ? sql`LEFT JOIN lgas l ON l.code = r.lga_id` : sql``;

    const rows = await db.execute(sql`
      SELECT
        ${rowExpr} AS row_val,
        ${colExpr} AS col_val,
        COUNT(*) AS cell_count
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      ${lgaJoin}
      WHERE ${where}
        AND ${rowExpr} IS NOT NULL
        AND ${colExpr} IS NOT NULL
      GROUP BY row_val, col_val
      ORDER BY row_val, col_val
    `);

    // Pivot flat results into matrix
    const rowLabelSet = new Set<string>();
    const colLabelSet = new Set<string>();
    const cellMap = new Map<string, number>();

    for (const r of rows.rows as Array<{ row_val: string; col_val: string; cell_count: string | number }>) {
      const rv = String(r.row_val);
      const cv = String(r.col_val);
      rowLabelSet.add(rv);
      colLabelSet.add(cv);
      cellMap.set(`${rv}|${cv}`, Number(r.cell_count));
    }

    const rowLabels = [...rowLabelSet].sort();
    const colLabels = [...colLabelSet].sort();

    // Build raw count matrix and apply suppression
    let anySuppressed = false;
    const rawCells: (number | null)[][] = rowLabels.map((rl) =>
      colLabels.map((cl) => {
        const count = cellMap.get(`${rl}|${cl}`) ?? 0;
        if (count > 0 && count < SUPPRESSION_MIN_N) {
          anySuppressed = true;
          return null;
        }
        return count;
      }),
    );

    // Compute percentage measures if requested
    let cells: (number | null)[][];
    if (measure === 'count') {
      cells = rawCells;
    } else {
      cells = rawCells.map((row, ri) => {
        const rowTotal = row.reduce((sum: number, c) => sum + (c ?? 0), 0);
        return row.map((cell, ci) => {
          if (cell === null) return null;
          if (measure === 'rowPct') {
            return rowTotal > 0 ? Math.round((cell / rowTotal) * 1000) / 10 : 0;
          } else if (measure === 'colPct') {
            const colTotal = rawCells.reduce((sum: number, r) => sum + (r[ci] ?? 0), 0);
            return colTotal > 0 ? Math.round((cell / colTotal) * 1000) / 10 : 0;
          } else {
            // totalPct
            return totalN > 0 ? Math.round((cell / totalN) * 1000) / 10 : 0;
          }
        });
      });
    }

    const result: CrossTabResult = { rowLabels, colLabels, cells, totalN, anySuppressed };

    // Cache result
    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
      } catch (err) {
        logger.warn({ event: 'cross_tab.cache_write_failed', error: (err as Error).message });
      }
    }

    return result;
  }

  /**
   * Skills Inventory: full skills list, category grouping, LGA concentration,
   * gap analysis (have vs want), and Shannon diversity index.
   */
  static async getSkillsInventory(
    scope: AnalyticsScope,
    params: AnalyticsQueryParams = {},
  ): Promise<SkillsInventoryData> {
    const where = buildWhereFragments(scope, params);

    // Check cache
    const cacheKey = `analytics:skills-inventory:${scope.type}:${scope.lgaCode || scope.userId || 'all'}:${stableStringify(params as unknown as Record<string, unknown>)}`;
    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (err) {
        logger.warn({ event: 'skills_inventory.cache_read_failed', error: (err as Error).message });
      }
    }

    // Count total submissions with skills data for threshold checks
    const totalSkillsResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      WHERE ${where}
        AND s.raw_data->>'skills_possessed' IS NOT NULL
        AND s.raw_data->>'skills_possessed' != ''
    `);
    const totalWithSkills = Number((totalSkillsResult.rows[0] as any)?.total ?? 0);

    // Count total submissions for LGA-specific thresholds
    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      WHERE ${where}
    `);
    const totalSubmissions = Number((totalResult.rows[0] as any)?.total ?? 0);

    // Build threshold objects
    const thresholds = {
      allSkills: { met: totalWithSkills >= SKILLS_THRESHOLD_GENERAL, currentN: totalWithSkills, requiredN: SKILLS_THRESHOLD_GENERAL },
      byCategory: { met: totalWithSkills >= SKILLS_THRESHOLD_GENERAL, currentN: totalWithSkills, requiredN: SKILLS_THRESHOLD_GENERAL },
      byLga: { met: totalSubmissions >= SKILLS_THRESHOLD_PER_LGA, currentN: totalSubmissions, requiredN: SKILLS_THRESHOLD_PER_LGA },
      gapAnalysis: { met: totalWithSkills >= SKILLS_THRESHOLD_GENERAL, currentN: totalWithSkills, requiredN: SKILLS_THRESHOLD_GENERAL },
      diversityIndex: { met: totalSubmissions >= SKILLS_THRESHOLD_GENERAL, currentN: totalSubmissions, requiredN: SKILLS_THRESHOLD_GENERAL },
    };

    // allSkills: full skills frequency (no LIMIT)
    let allSkills: SkillsFrequency[] = [];
    if (thresholds.allSkills.met) {
      const skillRows = await db.execute(sql`
        SELECT skill, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id,
             unnest(string_to_array(s.raw_data->>'skills_possessed', ' ')) AS skill
        WHERE ${where}
          AND s.raw_data->>'skills_possessed' IS NOT NULL
          AND s.raw_data->>'skills_possessed' != ''
        GROUP BY skill
        ORDER BY count DESC
      `);
      allSkills = (skillRows.rows as Array<{ skill: string; count: string | number }>)
        .map((r) => ({
          skill: String(r.skill),
          count: Number(r.count),
          percentage: totalWithSkills > 0 ? Math.round((Number(r.count) / totalWithSkills) * 1000) / 10 : 0,
        }))
        .filter((s) => s.count >= SUPPRESSION_MIN_N);
    }

    // byCategory: group by ISCO-08 sector
    const byCategory: SkillsInventoryData['byCategory'] = [];
    if (thresholds.byCategory.met && allSkills.length > 0) {
      const categoryMap = new Map<string, { totalCount: number; skills: SkillsFrequency[] }>();
      for (const skill of allSkills) {
        const category = ISCO08_SECTOR_MAP[skill.skill] || 'Other';
        const entry = categoryMap.get(category) || { totalCount: 0, skills: [] };
        entry.totalCount += skill.count;
        entry.skills.push(skill);
        categoryMap.set(category, entry);
      }
      for (const [category, data] of categoryMap) {
        byCategory.push({ category, totalCount: data.totalCount, skills: data.skills });
      }
      byCategory.sort((a, b) => b.totalCount - a.totalCount);
    }

    // byLga: top 3 skills per LGA (SA/Official only)
    let byLga: SkillsInventoryData['byLga'] = null;
    if (scope.type === 'system' && thresholds.byLga.met) {
      const lgaSkillRows = await db.execute(sql`
        WITH skill_counts AS (
          SELECT r.lga_id, skill, COUNT(*) AS count
          FROM submissions s
          LEFT JOIN respondents r ON r.id = s.respondent_id,
               unnest(string_to_array(s.raw_data->>'skills_possessed', ' ')) AS skill
          WHERE ${where}
            AND s.raw_data->>'skills_possessed' IS NOT NULL
            AND s.raw_data->>'skills_possessed' != ''
          GROUP BY r.lga_id, skill
          HAVING COUNT(*) >= ${SUPPRESSION_MIN_N}
        ),
        ranked AS (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY lga_id ORDER BY count DESC) AS rn
          FROM skill_counts
        )
        SELECT r.lga_id, COALESCE(l.name, r.lga_id, 'Unknown') AS lga_name, r.skill, r.count
        FROM ranked r
        LEFT JOIN lgas l ON l.code = r.lga_id
        WHERE r.rn <= 3
        ORDER BY lga_name, r.rn
      `);

      const lgaMap = new Map<string, { lgaId: string; lgaName: string; topSkills: { skill: string; count: number }[] }>();
      for (const row of lgaSkillRows.rows as Array<{ lga_id: string; lga_name: string; skill: string; count: string | number }>) {
        const key = row.lga_id || 'unknown';
        const entry = lgaMap.get(key) || { lgaId: key, lgaName: String(row.lga_name), topSkills: [] };
        entry.topSkills.push({ skill: String(row.skill), count: Number(row.count) });
        lgaMap.set(key, entry);
      }
      byLga = [...lgaMap.values()];
    }

    // gapAnalysis: have vs want-to-learn
    let gapAnalysis: SkillsInventoryData['gapAnalysis'] = null;
    if (thresholds.gapAnalysis.met) {
      const [haveRows, wantRows] = await Promise.all([
        db.execute(sql`
          SELECT skill, COUNT(*) AS count
          FROM submissions s
          LEFT JOIN respondents r ON r.id = s.respondent_id,
               unnest(string_to_array(s.raw_data->>'skills_possessed', ' ')) AS skill
          WHERE ${where}
            AND s.raw_data->>'skills_possessed' IS NOT NULL
            AND s.raw_data->>'skills_possessed' != ''
          GROUP BY skill
          HAVING COUNT(*) >= ${SUPPRESSION_MIN_N}
        `),
        db.execute(sql`
          SELECT skill, COUNT(*) AS count
          FROM submissions s
          LEFT JOIN respondents r ON r.id = s.respondent_id,
               unnest(string_to_array(s.raw_data->>'training_interest', ' ')) AS skill
          WHERE ${where}
            AND s.raw_data->>'training_interest' IS NOT NULL
            AND s.raw_data->>'training_interest' != ''
          GROUP BY skill
          HAVING COUNT(*) >= ${SUPPRESSION_MIN_N}
        `),
      ]);

      const wantMap = new Map<string, number>();
      for (const r of wantRows.rows as Array<{ skill: string; count: string | number }>) {
        wantMap.set(String(r.skill), Number(r.count));
      }

      // Only produce gap analysis if we have want data
      if (wantMap.size > 0) {
        const haveMap = new Map<string, number>();
        for (const r of haveRows.rows as Array<{ skill: string; count: string | number }>) {
          haveMap.set(String(r.skill), Number(r.count));
        }

        // Merge all skills from both dimensions
        const allSkillKeys = new Set([...haveMap.keys(), ...wantMap.keys()]);
        gapAnalysis = [...allSkillKeys]
          .map((skill) => ({
            skill,
            haveCount: haveMap.get(skill) ?? 0,
            wantCount: wantMap.get(skill) ?? 0,
          }))
          .sort((a, b) => (b.wantCount - b.haveCount) - (a.wantCount - a.haveCount));
      }
    }

    // diversityIndex: Shannon diversity per LGA (SA/Official only)
    let diversityIndex: SkillsInventoryData['diversityIndex'] = null;
    if (scope.type === 'system' && thresholds.diversityIndex.met) {
      const divRows = await db.execute(sql`
        SELECT r.lga_id, COALESCE(l.name, r.lga_id, 'Unknown') AS lga_name,
               skill, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        LEFT JOIN lgas l ON l.code = r.lga_id,
             unnest(string_to_array(s.raw_data->>'skills_possessed', ' ')) AS skill
        WHERE ${where}
          AND s.raw_data->>'skills_possessed' IS NOT NULL
          AND s.raw_data->>'skills_possessed' != ''
        GROUP BY r.lga_id, lga_name, skill
      `);

      // Group by LGA, compute Shannon index
      const lgaDivMap = new Map<string, { lgaName: string; counts: number[]; skillCount: number }>();
      for (const row of divRows.rows as Array<{ lga_id: string; lga_name: string; skill: string; count: string | number }>) {
        const key = row.lga_id || 'unknown';
        const entry = lgaDivMap.get(key) || { lgaName: String(row.lga_name), counts: [], skillCount: 0 };
        entry.counts.push(Number(row.count));
        entry.skillCount++;
        lgaDivMap.set(key, entry);
      }

      diversityIndex = [...lgaDivMap.entries()]
        .filter(([, data]) => data.counts.reduce((a, b) => a + b, 0) >= SKILLS_THRESHOLD_GENERAL)
        .map(([lgaId, data]) => ({
          lgaId,
          lgaName: data.lgaName,
          index: Math.round(shannonIndex(data.counts) * 100) / 100,
          skillCount: data.skillCount,
        }))
        .sort((a, b) => b.index - a.index);
    }

    const result: SkillsInventoryData = { allSkills, byCategory, byLga, gapAnalysis, diversityIndex, thresholds };

    // Cache result
    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(result), 'EX', 600);
      } catch (err) {
        logger.warn({ event: 'skills_inventory.cache_write_failed', error: (err as Error).message });
      }
    }

    return result;
  }
}
