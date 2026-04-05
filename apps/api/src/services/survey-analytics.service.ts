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
  InferentialInsightsData,
  ExtendedEquityData,
  ActivationStatusData,
  ThresholdStatus,
  EnumeratorReliabilityData,
  EnumeratorDistribution,
  ReliabilityPair,
} from '@oslsr/types';
import { CrossTabDimension } from '@oslsr/types';
import {
  runChiSquareTest,
  runCorrelationTest,
  runGroupComparisonTest,
  runProportionCI,
  linearRegressionForecast,
  wilsonScoreInterval,
} from './statistical-tests.service.js';
// simple-statistics used via statistical-tests.service.ts
import { ISCO08_SECTOR_MAP } from '@oslsr/types';
import type { AnalyticsScope } from '../middleware/analytics-scope.js';
import { suppressSmallBuckets, suppressIfTooFew, toBuckets } from '../utils/analytics-suppression.js';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import pino from 'pino';

const logger = pino({ name: 'survey-analytics' });

/** Row shape returned by Drizzle `db.execute(sql...)` for queries with a single COUNT(*) AS total */
interface TotalRow { total: string | number }

/** Row shape for label/count distribution queries used with toBuckets() */
interface LabelCountRow { label: string; count: string | number }

/** Row shape for aggregate household scalars */
interface HouseholdAggRow {
  dependency_ratio: string | number | null;
  biz_owners: string | number;
  biz_registered: string | number;
  apprentice_total: string | number;
  total_count: string | number;
}

/** Row shape for registry summary query */
interface RegistrySummaryRow {
  total: string | number;
  employed: string | number;
  female: string | number;
  avg_age: string | number | null;
  biz_owners: string | number;
  consent_marketplace_pct: string | number;
  consent_enriched_pct: string | number;
}

/** Row shape for pipeline summary query */
interface PipelineSummaryRow {
  totalSubmissions: string | number;
  completionRate: string | number;
  avgCompletionTimeSecs: string | number | null;
  activeEnumerators: string | number;
}

/** Row shape for disability gap query */
interface DisabilityGapRow {
  disability_status: string;
  total: string | number;
  employed: string | number;
}

/** Row shape for education-employment alignment query */
interface AlignmentRow {
  education_level: string;
  employment_type: string;
}

/** Row shape for LGA count query */
interface LgaCountRow { lga_id: string; count: string | number }

/** Row shape for daily count query */
interface DailyCountRow { day: string; count: string | number }

const isTestMode = () =>
  process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';

function getRedisClient() {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
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

/** KL divergence: sum(p_i * log2(p_i / q_i)) — base-2 for [0, 1] bound in JSD */
function klDivergence(p: number[], q: number[]): number {
  return p.reduce((sum, pi, i) => {
    if (pi === 0) return sum;
    return sum + pi * Math.log2(pi / q[i]);
  }, 0);
}

/** Jensen-Shannon divergence (bounded [0, 1] with base-2 log) */
function jsDivergence(p: number[], q: number[]): number {
  const m = p.map((pi, i) => (pi + q[i]) / 2);
  return (klDivergence(p, m) + klDivergence(q, m)) / 2;
}

/** Deterministic JSON serialization for cache keys (recursively sorted object keys). */
function stableStringify(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, (_, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = (value as Record<string, unknown>)[key];
        return sorted;
      }, {});
    }
    return value;
  });
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
    const total = Number((totalResult.rows[0] as unknown as TotalRow)?.total ?? 0);

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
      genderDistribution: suppressSmallBuckets(toBuckets(genderRows.rows as unknown as LabelCountRow[], total)),
      ageDistribution: suppressSmallBuckets(toBuckets(ageRows.rows as unknown as LabelCountRow[], total)),
      educationDistribution: suppressSmallBuckets(toBuckets(eduRows.rows as unknown as LabelCountRow[], total)),
      maritalDistribution: suppressSmallBuckets(toBuckets(maritalRows.rows as unknown as LabelCountRow[], total)),
      disabilityPrevalence: suppressSmallBuckets(toBuckets(disabilityRows.rows as unknown as LabelCountRow[], total)),
      lgaDistribution: suppressSmallBuckets(toBuckets(lgaRows.rows as unknown as LabelCountRow[], total)),
      consentMarketplace: suppressSmallBuckets(toBuckets(consentMktRows.rows as unknown as LabelCountRow[], total)),
      consentEnriched: suppressSmallBuckets(toBuckets(consentEnrRows.rows as unknown as LabelCountRow[], total)),
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
    const total = Number((totalResult.rows[0] as unknown as TotalRow)?.total ?? 0);

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
      workStatusBreakdown: suppressSmallBuckets(toBuckets(workStatusRows.rows as unknown as LabelCountRow[], total)),
      employmentTypeBreakdown: suppressSmallBuckets(toBuckets(empTypeRows.rows as unknown as LabelCountRow[], total)),
      formalInformalRatio: suppressSmallBuckets(toBuckets(formalInformalRows.rows as unknown as LabelCountRow[], total)),
      experienceDistribution: suppressSmallBuckets(toBuckets(expRows.rows as unknown as LabelCountRow[], total)),
      hoursWorked: suppressSmallBuckets(toBuckets(hoursRows.rows as unknown as LabelCountRow[], total)),
      incomeDistribution: suppressSmallBuckets(toBuckets(incomeRows.rows as unknown as LabelCountRow[], total)),
      incomeByLga: suppressSmallBuckets(toBuckets(incomeByLgaRows.rows as unknown as LabelCountRow[], total)),
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
    const total = Number((totalResult.rows[0] as unknown as TotalRow)?.total ?? 0);

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

    const agg = aggregates.rows[0] as unknown as HouseholdAggRow;
    const totalCount = Number(agg?.total_count ?? 0);
    const bizOwners = Number(agg?.biz_owners ?? 0);
    const bizRegistered = Number(agg?.biz_registered ?? 0);

    const headTotal = (headRows.rows as unknown as LabelCountRow[]).reduce((sum: number, r: LabelCountRow) => sum + Number(r.count), 0);

    return {
      householdSizeDistribution: suppressSmallBuckets(toBuckets(sizeRows.rows as unknown as LabelCountRow[], total)),
      dependencyRatio: agg?.dependency_ratio != null ? Number(agg.dependency_ratio) : null,
      headOfHouseholdByGender: suppressSmallBuckets(toBuckets(headRows.rows as unknown as LabelCountRow[], headTotal)),
      housingDistribution: suppressSmallBuckets(toBuckets(housingRows.rows as unknown as LabelCountRow[], total)),
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
    const total = Number((totalResult.rows[0] as unknown as TotalRow)?.total ?? 0);

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

    const row = rows.rows[0] as unknown as RegistrySummaryRow;
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

    const row = rows.rows[0] as unknown as PipelineSummaryRow;
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
    const totalN = Number((totalResult.rows[0] as unknown as TotalRow)?.total ?? 0);

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
      cells = rawCells.map((row, _ri) => {
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
    const totalWithSkills = Number((totalSkillsResult.rows[0] as unknown as TotalRow)?.total ?? 0);

    // Count total submissions for LGA-specific thresholds
    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      WHERE ${where}
    `);
    const totalSubmissions = Number((totalResult.rows[0] as unknown as TotalRow)?.total ?? 0);

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

  // =========================================================================
  // Story 8.7: Inferential Insights
  // =========================================================================

  /**
   * Single extraction query for all inferential tests.
   * Returns typed row array for in-memory computation.
   */
  private static async extractInferentialData(where: SQL): Promise<InferentialRow[]> {
    const result = await db.execute(sql`
      SELECT
        s.raw_data->>'gender' AS gender,
        s.raw_data->>'employment_type' AS employment_type,
        s.raw_data->>'education_level' AS education_level,
        s.raw_data->>'disability_status' AS disability_status,
        s.raw_data->>'marital_status' AS marital_status,
        s.raw_data->>'is_head' AS is_head,
        s.raw_data->>'housing_status' AS housing_status,
        s.raw_data->>'has_business' AS has_business,
        s.raw_data->>'monthly_income' AS monthly_income,
        s.raw_data->>'years_experience' AS years_experience,
        s.raw_data->>'household_size' AS household_size,
        s.raw_data->>'hours_worked' AS hours_worked,
        CASE WHEN s.raw_data->>'employment_status' = 'yes' THEN 'employed'
             WHEN s.raw_data->>'looking_for_work' = 'yes' THEN 'unemployed' ELSE 'other' END AS work_status,
        r.lga_id
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      WHERE ${where}
    `);
    return result.rows as unknown as InferentialRow[];
  }

  /**
   * Build a contingency table from two categorical columns.
   * Returns { table: number[][], rowLabels, colLabels }
   */
  private static buildContingencyTable(
    rows: InferentialRow[],
    rowField: keyof InferentialRow,
    colField: keyof InferentialRow,
  ): { table: number[][]; rowLabels: string[]; colLabels: string[] } {
    const rowSet = new Set<string>();
    const colSet = new Set<string>();
    const counts = new Map<string, number>();

    for (const row of rows) {
      const r = row[rowField];
      const c = row[colField];
      if (!r || !c) continue;
      rowSet.add(r);
      colSet.add(c);
      const key = `${r}|${c}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const rowLabels = [...rowSet].sort();
    const colLabels = [...colSet].sort();
    const table = rowLabels.map((rl) =>
      colLabels.map((cl) => counts.get(`${rl}|${cl}`) || 0),
    );

    return { table, rowLabels, colLabels };
  }

  /**
   * Extract numeric pairs filtering nulls.
   */
  private static extractNumericPairs(
    rows: InferentialRow[],
    xField: keyof InferentialRow,
    yField: keyof InferentialRow,
    xEncoder?: (v: string) => number | null,
  ): { x: number[]; y: number[] } {
    const x: number[] = [];
    const y: number[] = [];
    for (const row of rows) {
      const xRaw = row[xField];
      const yRaw = row[yField];
      if (!xRaw || !yRaw) continue;
      const xVal = xEncoder ? xEncoder(xRaw) : parseFloat(xRaw);
      const yVal = parseFloat(yRaw);
      if (xVal === null || isNaN(xVal) || isNaN(yVal)) continue;
      x.push(xVal);
      y.push(yVal);
    }
    return { x, y };
  }

  /**
   * Partition rows into groups by categorical field, extracting a numeric value.
   */
  private static partitionGroups(
    rows: InferentialRow[],
    groupField: keyof InferentialRow,
    valueField: keyof InferentialRow,
  ): Record<string, number[]> {
    const groups: Record<string, number[]> = {};
    for (const row of rows) {
      const group = row[groupField];
      const val = row[valueField];
      if (!group || !val) continue;
      const num = parseFloat(val);
      if (isNaN(num)) continue;
      if (!groups[group]) groups[group] = [];
      groups[group].push(num);
    }
    return groups;
  }

  static async getInferentialInsights(
    scope: AnalyticsScope,
    params: AnalyticsQueryParams = {},
  ): Promise<InferentialInsightsData> {
    const where = buildWhereFragments(scope, params);

    // Check cache
    const cacheKey = `analytics:insights:${scope.type}:${scope.lgaCode || scope.userId || 'all'}:${stableStringify(params as unknown as Record<string, unknown>)}`;
    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (err) {
        logger.warn({ event: 'insights.cache_read_failed', error: (err as Error).message });
      }
    }

    // Get total count for threshold checks
    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      WHERE ${where}
    `);
    const totalN = Number((totalResult.rows[0] as unknown as TotalRow)?.total ?? 0);

    // Per-section thresholds
    const thresholds = {
      chiSquare: { met: totalN >= 100, currentN: totalN, requiredN: 100 } as ThresholdStatus,
      correlations: { met: totalN >= 100, currentN: totalN, requiredN: 100 } as ThresholdStatus,
      groupComparisons: { met: totalN >= 50, currentN: totalN, requiredN: 50 } as ThresholdStatus,
      proportionCIs: { met: totalN >= 30, currentN: totalN, requiredN: 30 } as ThresholdStatus,
      forecast: { met: totalN >= 10, currentN: totalN, requiredN: 10 } as ThresholdStatus,
    };

    // Extract all data in one query
    const rows = totalN >= 30 ? await SurveyAnalyticsService.extractInferentialData(where) : [];

    // --- Chi-Square Tests (need >= 100) ---
    const chiSquare = thresholds.chiSquare.met ? [
      runChiSquareTest('gender and employment type',
        SurveyAnalyticsService.buildContingencyTable(rows, 'gender', 'employment_type').table),
      runChiSquareTest('education level and employment type',
        SurveyAnalyticsService.buildContingencyTable(rows, 'education_level', 'employment_type').table),
      runChiSquareTest('LGA and work status',
        SurveyAnalyticsService.buildContingencyTable(rows, 'lga_id', 'work_status').table),
      runChiSquareTest('gender and business ownership',
        SurveyAnalyticsService.buildContingencyTable(rows, 'gender', 'has_business').table),
      runChiSquareTest('disability status and work status',
        SurveyAnalyticsService.buildContingencyTable(rows, 'disability_status', 'work_status').table),
      runChiSquareTest('marital status and head of household',
        SurveyAnalyticsService.buildContingencyTable(rows, 'marital_status', 'is_head').table),
    ] : [];

    // --- Correlations (need >= 100) ---
    const educationEncoder = (v: string): number | null => {
      const map: Record<string, number> = { none: 0, primary: 1, secondary: 2, vocational: 3, tertiary: 4, postgraduate: 5 };
      return map[v] ?? null;
    };

    const correlations = thresholds.correlations.met ? (() => {
      const eduIncome = SurveyAnalyticsService.extractNumericPairs(rows, 'education_level', 'monthly_income', educationEncoder);
      const expIncome = SurveyAnalyticsService.extractNumericPairs(rows, 'years_experience', 'monthly_income');
      const hhIncome = SurveyAnalyticsService.extractNumericPairs(rows, 'household_size', 'monthly_income');
      const hrsIncome = SurveyAnalyticsService.extractNumericPairs(rows, 'hours_worked', 'monthly_income');
      return [
        ...(eduIncome.x.length >= 10 ? [runCorrelationTest('education level and monthly income', eduIncome.x, eduIncome.y, 'spearman')] : []),
        ...(expIncome.x.length >= 10 ? [runCorrelationTest('years of experience and monthly income', expIncome.x, expIncome.y, 'spearman')] : []),
        ...(hhIncome.x.length >= 10 ? [runCorrelationTest('household size and monthly income', hhIncome.x, hhIncome.y, 'pearson')] : []),
        ...(hrsIncome.x.length >= 10 ? [runCorrelationTest('hours worked and monthly income', hrsIncome.x, hrsIncome.y, 'pearson')] : []),
      ];
    })() : [];

    // --- Group Comparisons (need >= 50) ---
    const groupComparisons = thresholds.groupComparisons.met ? (() => {
      const incomeByLga = SurveyAnalyticsService.partitionGroups(rows, 'lga_id', 'monthly_income');
      const incomeByGender = SurveyAnalyticsService.partitionGroups(rows, 'gender', 'monthly_income');
      const incomeByEdu = SurveyAnalyticsService.partitionGroups(rows, 'education_level', 'monthly_income');
      const hhByHousing = SurveyAnalyticsService.partitionGroups(rows, 'housing_status', 'household_size');
      const hrsByEmpType = SurveyAnalyticsService.partitionGroups(rows, 'employment_type', 'hours_worked');
      return [
        ...(Object.keys(incomeByLga).length >= 2 ? [runGroupComparisonTest('Monthly income across LGAs', incomeByLga)] : []),
        ...(Object.keys(incomeByGender).length >= 2 ? [runGroupComparisonTest('Monthly income by gender', incomeByGender)] : []),
        ...(Object.keys(incomeByEdu).length >= 2 ? [runGroupComparisonTest('Monthly income by education level', incomeByEdu)] : []),
        ...(Object.keys(hhByHousing).length >= 2 ? [runGroupComparisonTest('Household size by housing status', hhByHousing)] : []),
        ...(Object.keys(hrsByEmpType).length >= 2 ? [runGroupComparisonTest('Hours worked by employment type', hrsByEmpType)] : []),
      ];
    })() : [];

    // --- Proportion CIs (need >= 30) ---
    const proportionCIs = thresholds.proportionCIs.met ? (() => {
      const total = rows.length;
      const unemployed = rows.filter(r => r.work_status === 'unemployed').length;
      const disabled = rows.filter(r => r.disability_status === 'yes').length;
      const hasBusiness = rows.filter(r => r.has_business === 'yes').length;
      const females = rows.filter(r => r.gender === 'female');
      const femaleHeads = females.filter(r => r.is_head === 'yes').length;
      const employed = rows.filter(r => r.work_status === 'employed');
      const formalTypes = ['wage_public', 'wage_private', 'contractor'];
      const formal = employed.filter(r => formalTypes.includes(r.employment_type || '')).length;
      return [
        runProportionCI('Unemployment rate', unemployed, total),
        runProportionCI('Disability rate', disabled, total),
        runProportionCI('Business ownership rate', hasBusiness, total),
        ...(females.length >= 10 ? [runProportionCI('Female head-of-household rate', femaleHeads, females.length)] : []),
        ...(employed.length >= 10 ? [runProportionCI('Formal employment rate', formal, employed.length)] : []),
      ];
    })() : [];

    // --- Enrollment Forecast ---
    let forecast = null;
    if (thresholds.forecast.met) {
      const trendsResult = await db.execute(sql`
        SELECT
          DATE(s.submitted_at AT TIME ZONE 'Africa/Lagos') AS day,
          COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where}
          AND s.submitted_at >= NOW() - INTERVAL '90 days'
        GROUP BY DATE(s.submitted_at AT TIME ZONE 'Africa/Lagos')
        ORDER BY day
      `);
      const dailyCounts = (trendsResult.rows as unknown as DailyCountRow[]).map((r, i) => ({
        day: i,
        count: Number(r.count),
      }));

      // Determine next threshold
      const nextThreshold = totalN < 100 ? { n: 100, label: 'Phase 4 Inferential Statistics' }
        : totalN < 200 ? { n: 200, label: 'Public Key Findings' }
        : totalN < 500 ? { n: 500, label: 'Phase 5 Regression Models' }
        : { n: 1000, label: 'Large-scale Analytics' };

      forecast = linearRegressionForecast(dailyCounts, totalN, nextThreshold.n, nextThreshold.label);
    }

    const result: InferentialInsightsData = {
      chiSquare,
      correlations,
      groupComparisons,
      proportionCIs,
      forecast,
      thresholds,
    };

    // Cache result (1 hour)
    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(result), 'EX', 3600);
      } catch (err) {
        logger.warn({ event: 'insights.cache_write_failed', error: (err as Error).message });
      }

      // Write key findings to public cache (Task 2.9)
      try {
        const significantFindings = [
          ...chiSquare.filter(r => r.significant),
          ...correlations.filter(r => r.significant),
          ...groupComparisons.filter(r => r.significant),
        ]
          .sort((a, b) => a.pValue - b.pValue)
          .slice(0, 3)
          .map(f => {
            // Strip stats from interpretation for public consumption
            const interp = f.interpretation;
            // Remove parenthetical stats: "(chi-sq = ..., p < ...)" or "(r = ..., p ...)"
            return interp.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
          });

        if (significantFindings.length > 0 && scope.type === 'system') {
          await redis.set('analytics:public:key-findings', JSON.stringify(significantFindings), 'EX', 3600);
        }
      } catch (err) {
        logger.warn({ event: 'insights.public_cache_write_failed', error: (err as Error).message });
      }
    }

    return result;
  }

  // =========================================================================
  // Story 8.7: Extended Equity Metrics
  // =========================================================================

  static async getExtendedEquity(
    scope: AnalyticsScope,
    params: AnalyticsQueryParams = {},
  ): Promise<ExtendedEquityData> {
    const where = buildWhereFragments(scope, params);

    // Check cache
    const cacheKey = `analytics:equity:${scope.type}:${scope.lgaCode || scope.userId || 'all'}:${stableStringify(params as unknown as Record<string, unknown>)}`;
    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (err) {
        logger.warn({ event: 'equity.cache_read_failed', error: (err as Error).message });
      }
    }

    // Total count for thresholds
    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      WHERE ${where}
    `);
    const totalN = Number((totalResult.rows[0] as unknown as TotalRow)?.total ?? 0);

    const thresholds = {
      disabilityGap: { met: totalN >= 100, currentN: totalN, requiredN: 100 } as ThresholdStatus,
      educationAlignment: { met: totalN >= 100, currentN: totalN, requiredN: 100 } as ThresholdStatus,
      giniCoefficient: { met: totalN >= 30, currentN: totalN, requiredN: 30 } as ThresholdStatus,
    };

    let disabilityGap: ExtendedEquityData['disabilityGap'] = null;
    let educationAlignment: ExtendedEquityData['educationAlignment'] = null;
    let giniCoefficient: ExtendedEquityData['giniCoefficient'] = null;

    if (thresholds.disabilityGap.met) {
      const disabilityResult = await db.execute(sql`
        SELECT
          s.raw_data->>'disability_status' AS disability_status,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE
            CASE WHEN s.raw_data->>'employment_status' = 'yes' THEN 'employed'
                 WHEN s.raw_data->>'looking_for_work' = 'yes' THEN 'unemployed' ELSE 'other' END = 'employed'
          ) AS employed
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where} AND s.raw_data->>'disability_status' IS NOT NULL
        GROUP BY s.raw_data->>'disability_status'
      `);

      const disabledRow = (disabilityResult.rows as unknown as DisabilityGapRow[]).find(r => r.disability_status === 'yes');
      const nonDisabledRow = (disabilityResult.rows as unknown as DisabilityGapRow[]).find(r => r.disability_status === 'no');

      if (disabledRow && nonDisabledRow) {
        const dTotal = Number(disabledRow.total);
        const dEmployed = Number(disabledRow.employed);
        const ndTotal = Number(nonDisabledRow.total);
        const ndEmployed = Number(nonDisabledRow.employed);

        const dRate = dTotal > 0 ? dEmployed / dTotal : 0;
        const ndRate = ndTotal > 0 ? ndEmployed / ndTotal : 0;

        disabilityGap = {
          disabledEmployedRate: Math.round(dRate * 10000) / 10000,
          nonDisabledEmployedRate: Math.round(ndRate * 10000) / 10000,
          gap: Math.round((ndRate - dRate) * 10000) / 10000,
          disabledCI: wilsonScoreInterval(dEmployed, dTotal),
          nonDisabledCI: wilsonScoreInterval(ndEmployed, ndTotal),
        };
      }
    }

    if (thresholds.educationAlignment.met) {
      const alignResult = await db.execute(sql`
        SELECT
          s.raw_data->>'education_level' AS education_level,
          s.raw_data->>'employment_type' AS employment_type
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where}
          AND CASE WHEN s.raw_data->>'employment_status' = 'yes' THEN 'employed'
                   WHEN s.raw_data->>'looking_for_work' = 'yes' THEN 'unemployed' ELSE 'other' END = 'employed'
          AND s.raw_data->>'education_level' IS NOT NULL
          AND s.raw_data->>'employment_type' IS NOT NULL
      `);

      const alignRows = alignResult.rows as unknown as AlignmentRow[];
      if (alignRows.length >= 10) {
        const eduTier = (v: string): number => {
          if (['none', 'primary'].includes(v)) return 1;
          if (['secondary', 'vocational'].includes(v)) return 2;
          if (['tertiary', 'postgraduate'].includes(v)) return 3;
          return 0;
        };
        const empTier = (v: string): number => {
          if (['family_unpaid', 'apprentice'].includes(v)) return 1;
          if (v === 'self_employed') return 2;
          if (['wage_private', 'wage_public', 'contractor'].includes(v)) return 3;
          return 0;
        };

        let aligned = 0, over = 0, under = 0;
        const valid = alignRows.filter(r => eduTier(r.education_level) > 0 && empTier(r.employment_type) > 0);
        for (const r of valid) {
          const et = eduTier(r.education_level);
          const emp = empTier(r.employment_type);
          if (et === emp) aligned++;
          else if (et > emp) over++;
          else under++;
        }

        const n = valid.length;
        if (n > 0) {
          educationAlignment = {
            alignedPct: Math.round((aligned / n) * 10000) / 100,
            overQualifiedPct: Math.round((over / n) * 10000) / 100,
            underQualifiedPct: Math.round((under / n) * 10000) / 100,
            n,
          };
        }
      }
    }

    if (thresholds.giniCoefficient.met) {
      const lgaResult = await db.execute(sql`
        SELECT r.lga_id, COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${where} AND r.lga_id IS NOT NULL
        GROUP BY r.lga_id
        ORDER BY count
      `);

      const lgaCounts = (lgaResult.rows as unknown as LgaCountRow[]).map(r => Number(r.count));
      if (lgaCounts.length >= 2) {
        // Gini coefficient using sorted proportions
        const sorted = lgaCounts.slice().sort((a, b) => a - b);
        const n = sorted.length;
        const total = sorted.reduce((a, b) => a + b, 0);
        if (total > 0) {
          let sumOfWeighted = 0;
          for (let i = 0; i < n; i++) {
            sumOfWeighted += (2 * (i + 1) - n - 1) * sorted[i];
          }
          const gini = Math.round((sumOfWeighted / (n * total)) * 1000) / 1000;
          const interpretation = gini < 0.2 ? 'low inequality' : gini <= 0.4 ? 'moderate inequality' : 'high inequality';
          giniCoefficient = { value: gini, interpretation, lgaCount: n };
        }
      }
    }

    const result: ExtendedEquityData = { disabilityGap, educationAlignment, giniCoefficient, thresholds };

    // Cache result (10 min)
    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(result), 'EX', 600);
      } catch (err) {
        logger.warn({ event: 'equity.cache_write_failed', error: (err as Error).message });
      }
    }

    return result;
  }

  // =========================================================================
  // Story 8.8: Inter-Enumerator Reliability (Supervisor + SA + Assessor)
  // =========================================================================

  static async getEnumeratorReliability(
    scope: AnalyticsScope,
    params: AnalyticsQueryParams = {},
  ): Promise<EnumeratorReliabilityData> {
    const redis = getRedisClient();
    const lgaCode = scope.type === 'lga' && scope.lgaCode ? scope.lgaCode : params.lgaId;
    const cacheKey = `analytics:reliability:${lgaCode || 'all'}`;

    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (err) {
        logger.warn({ event: 'reliability.cache_read_failed', error: (err as Error).message });
      }
    }

    // Build scope conditions
    const conditions: SQL[] = [
      sql`s.raw_data IS NOT NULL`,
      sql`s.respondent_id IS NOT NULL`,
    ];
    if (lgaCode) {
      conditions.push(sql`r.lga_id = ${lgaCode}`);
    }
    if (params.dateFrom) {
      conditions.push(sql`s.submitted_at >= ${params.dateFrom}::timestamptz`);
    }
    if (params.dateTo) {
      conditions.push(sql`s.submitted_at <= ${params.dateTo}::timestamptz`);
    }
    const whereClause = sql.join(conditions, sql` AND `);

    // Count submissions per enumerator
    const enumeratorCounts = await db.execute(sql`
      SELECT s.submitter_id AS enumerator_id, u.full_name AS enumerator_name, COUNT(*) AS count
      FROM submissions s
      JOIN users u ON s.submitter_id = u.id::text
      JOIN respondents r ON r.id = s.respondent_id
      WHERE ${whereClause}
      GROUP BY s.submitter_id, u.full_name
      ORDER BY count DESC
    `);
    const qualified = (enumeratorCounts.rows as { enumerator_id: string; enumerator_name: string; count: string | number }[])
      .filter(row => Number(row.count) >= 20);

    // Threshold check: need 2+ enumerators with 20+ submissions
    if (qualified.length < 2) {
      const result: EnumeratorReliabilityData = {
        enumerators: [],
        pairs: [],
        threshold: { met: false, currentN: qualified.length, requiredN: 2 },
      };
      return result;
    }

    const qualifiedIds = qualified.map(r => r.enumerator_id);
    const QUESTIONS = ['gender', 'employment_type', 'education_level'];

    // Query answer distributions for all qualified enumerators across 3 questions
    const distRows = await db.execute(sql`
      SELECT
        s.submitter_id AS enumerator_id,
        q.question,
        q.answer,
        COUNT(*) AS count
      FROM submissions s
      JOIN respondents r ON r.id = s.respondent_id
      CROSS JOIN LATERAL (
        VALUES
          ('gender', s.raw_data->>'gender'),
          ('employment_type', s.raw_data->>'employment_type'),
          ('education_level', s.raw_data->>'education_level')
      ) AS q(question, answer)
      WHERE ${whereClause}
        AND s.submitter_id IN (${sql.join(qualifiedIds.map(id => sql`${id}`), sql`, `)})
        AND q.answer IS NOT NULL
      GROUP BY s.submitter_id, q.question, q.answer
      ORDER BY s.submitter_id, q.question, q.answer
    `);

    // Build per-enumerator distributions
    type DistRow = { enumerator_id: string; question: string; answer: string; count: string | number };
    const distMap = new Map<string, Map<string, Map<string, number>>>();

    for (const row of distRows.rows as DistRow[]) {
      if (!distMap.has(row.enumerator_id)) distMap.set(row.enumerator_id, new Map());
      const qMap = distMap.get(row.enumerator_id)!;
      if (!qMap.has(row.question)) qMap.set(row.question, new Map());
      qMap.get(row.question)!.set(row.answer, Number(row.count));
    }

    const enumerators: EnumeratorDistribution[] = qualified.map(q => {
      const qMap = distMap.get(q.enumerator_id) || new Map<string, Map<string, number>>();
      const distributions = QUESTIONS.map(question => {
        const answerMap: Map<string, number> = qMap.get(question) || new Map<string, number>();
        const total = Array.from(answerMap.values()).reduce((a: number, b: number) => a + b, 0);
        const answers = Array.from(answerMap.entries())
          .sort(([a]: [string, number], [b]: [string, number]) => a.localeCompare(b))
          .map(([label, count]: [string, number]) => ({
            label,
            count,
            proportion: total > 0 ? count / total : 0,
          }));
        return { question, answers };
      });
      return {
        enumeratorId: q.enumerator_id,
        enumeratorName: q.enumerator_name,
        submissionCount: Number(q.count),
        distributions,
      };
    });

    // Compute pairwise JSD
    const pairs: ReliabilityPair[] = [];
    for (let i = 0; i < enumerators.length; i++) {
      for (let j = i + 1; j < enumerators.length; j++) {
        const a = enumerators[i];
        const b = enumerators[j];
        const divergenceScores = QUESTIONS.map(question => {
          const distA = a.distributions.find(d => d.question === question)?.answers ?? [];
          const distB = b.distributions.find(d => d.question === question)?.answers ?? [];
          // Align labels
          const allLabels = [...new Set([...distA.map(x => x.label), ...distB.map(x => x.label)])].sort();
          const pA = allLabels.map(l => distA.find(x => x.label === l)?.proportion ?? 0);
          const pB = allLabels.map(l => distB.find(x => x.label === l)?.proportion ?? 0);
          return { question, jsDivergence: jsDivergence(pA, pB) };
        });
        const avgDivergence = divergenceScores.reduce((sum, d) => sum + d.jsDivergence, 0) / divergenceScores.length;
        const flag = avgDivergence > 0.7 ? 'red' as const : avgDivergence > 0.5 ? 'amber' as const : 'normal' as const;
        const interpretation = flag !== 'normal'
          ? `${a.enumeratorName} and ${b.enumeratorName} report significantly different distributions in the same area — may warrant investigation`
          : '';
        pairs.push({
          enumeratorA: a.enumeratorName,
          enumeratorB: b.enumeratorName,
          divergenceScores,
          avgDivergence,
          flag,
          interpretation,
        });
      }
    }

    const result: EnumeratorReliabilityData = {
      enumerators,
      pairs,
      threshold: { met: true, currentN: qualified.length, requiredN: 2 },
    };

    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(result), 'EX', 600);
      } catch (err) {
        logger.warn({ event: 'reliability.cache_write_failed', error: (err as Error).message });
      }
    }

    return result;
  }

  // =========================================================================
  // Story 8.7: Activation Status (lightweight — all roles)
  // =========================================================================

  static async getActivationStatus(scope: AnalyticsScope): Promise<ActivationStatusData> {
    const redis = getRedisClient();
    const cacheKey = `analytics:activation-status:${scope.type}:${scope.lgaCode || scope.userId || 'all'}`;

    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (err) {
        logger.warn({ event: 'activation_status.cache_read_failed', error: (err as Error).message });
      }
    }

    // Simple COUNT query — no expensive computation
    const conditions: SQL[] = [
      sql`s.raw_data IS NOT NULL`,
      sql`s.respondent_id IS NOT NULL`,
    ];
    if (scope.type === 'lga' && scope.lgaCode) {
      conditions.push(sql`r.lga_id = ${scope.lgaCode}`);
    } else if (scope.type === 'personal' && scope.userId) {
      conditions.push(sql`s.submitter_id = ${scope.userId}`);
    }
    const whereClause = sql.join(conditions, sql` AND `);

    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      WHERE ${whereClause}
    `);
    const totalSubmissions = Number((totalResult.rows[0] as unknown as TotalRow)?.total ?? 0);

    const features = ACTIVATION_REGISTRY.map(feat => {
      const met = feat.phase <= 4 && totalSubmissions >= feat.requiredN;
      const ratio = feat.requiredN > 0 ? totalSubmissions / feat.requiredN : 0;
      const category = met ? 'active' as const
        : (feat.phase >= 5 || ratio <= 0.5) ? 'dormant' as const
        : 'approaching' as const;
      return { ...feat, currentN: totalSubmissions, met, category };
    });

    const result: ActivationStatusData = { totalSubmissions, features };

    // Cache for 5 min
    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
      } catch (err) {
        logger.warn({ event: 'activation_status.cache_write_failed', error: (err as Error).message });
      }
    }

    return result;
  }
}

// ---------------------------------------------------------------------------
// Story 8.7: Types and constants used by inferential methods
// ---------------------------------------------------------------------------

interface InferentialRow {
  gender: string | null;
  employment_type: string | null;
  education_level: string | null;
  disability_status: string | null;
  marital_status: string | null;
  is_head: string | null;
  housing_status: string | null;
  has_business: string | null;
  monthly_income: string | null;
  years_experience: string | null;
  household_size: string | null;
  hours_worked: string | null;
  work_status: string | null;
  lga_id: string | null;
}

/**
 * Activation Feature Registry — Phase 4 (built) + Phase 5 (dormant hooks only)
 */
const ACTIVATION_REGISTRY: Omit<import('@oslsr/types').ActivationFeature, 'currentN' | 'met' | 'category'>[] = [
  // Phase 4 — Built
  { id: 'chi_square', label: 'Association Tests (Chi-Square)', requiredN: 100, phase: 4 },
  { id: 'correlations', label: 'Correlation Analysis', requiredN: 100, phase: 4 },
  { id: 'group_comparisons', label: 'Group Comparisons', requiredN: 50, phase: 4 },
  { id: 'proportion_cis', label: 'Confidence Intervals', requiredN: 30, phase: 4 },
  { id: 'equity_extended', label: 'Extended Equity Metrics', requiredN: 100, phase: 4 },
  { id: 'enrollment_forecast', label: 'Enrollment Velocity Forecast', requiredN: 10, phase: 4 },
  { id: 'policy_brief', label: 'Policy Brief PDF Export', requiredN: 100, phase: 4 },
  { id: 'public_key_findings', label: 'Public Key Findings', requiredN: 200, phase: 4 },
  // Phase 5 — Dormant
  { id: 'regression_income', label: 'Income Predictors (OLS Regression)', requiredN: 500, phase: 5 },
  { id: 'regression_employment', label: 'Employment Predictors (Logistic)', requiredN: 500, phase: 5 },
  { id: 'regression_business', label: 'Business Ownership Predictors (Logistic)', requiredN: 500, phase: 5 },
  { id: 'inter_rater_reliability', label: 'Inter-Rater Reliability Scoring', requiredN: 200, phase: 5 },
  { id: 'anomaly_detection', label: 'Automated Anomaly Detection', requiredN: 500, phase: 5 },
  // Story 8.8: Phase 5 dormant hooks — AC#6
  { id: 'seasonality_detection', label: 'Seasonality Detection', requiredN: 365, phase: 5 },
  { id: 'campaign_effectiveness', label: 'Campaign Effectiveness Analysis', requiredN: 0, phase: 5 },
  { id: 'response_entropy', label: 'Response Pattern Entropy', requiredN: 50, phase: 5 },
  { id: 'gps_dispersion', label: 'GPS Dispersion Analysis', requiredN: 20, phase: 5 },
];
