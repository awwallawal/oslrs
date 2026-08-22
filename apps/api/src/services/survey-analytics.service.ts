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
  SkillsFrequencyResult,
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
  DataHealthData,
  DataHealthField,
  DataHealthRecoveryCohort,
  DataHealthRecoveryRow,
  NativeFormSchema,
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
import { skillSectorForSlug } from '@oslsr/types';
import { selectMultipleUnnest } from '../lib/skills-extraction.js';
import type { AnalyticsScope } from '../middleware/analytics-scope.js';
import { registryUnifiedSource } from './registry-unified.js';
import { analyticsCacheKey, PUBLIC_KEY_FINDINGS_CACHE_KEY } from './analytics-cache-keys.js';
import {
  buildRegistryFilter,
  getRegistryTotals,
  hasAnswer,
} from './registry-totals.service.js';
// Story 12-6 — the Data-Health view CONSUMES 9-59's atoms; it does not redefine
// the taxonomy or the key map. See `tallyFieldResponses` for why each matters.
import { deriveDataStatus, hasNonEmptyRawData } from './registry-data-status.js';
import { normalizeRawDataKeys } from './registry-key-normalization.js';
import { buildColumnsFromFormSchema } from './export-query.service.js';
import { QuestionnaireService } from './questionnaire.service.js';
import { AppError } from '@oslsr/utils';
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
  /**
   * Story 12-5 AC4 — the PER-FIELD bases, one per household statistic.
   *
   * `total_count` is not any of these. It counts everyone with ANY answers,
   * which is ruling R-E's coarse denominator: a respondent never ASKED about
   * business ownership used to sit in that rate's divisor, turning *not asked*
   * into *does not own a business*.
   */
  household_size_n: string | number;
  has_business_n: string | number;
  apprentice_n: string | number;
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
      return sql`ru.raw_data->>'gender'`;
    case CrossTabDimension.AGE_BAND:
      return sql`CASE
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 15 AND 19 THEN '15-19'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 20 AND 24 THEN '20-24'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 25 AND 29 THEN '25-29'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 30 AND 34 THEN '30-34'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 35 AND 39 THEN '35-39'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 40 AND 44 THEN '40-44'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 45 AND 49 THEN '45-49'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 50 AND 54 THEN '50-54'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 55 AND 59 THEN '55-59'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) >= 60 THEN '60+'
        ELSE 'unknown'
      END`;
    case CrossTabDimension.EDUCATION:
      return sql`ru.raw_data->>'education_level'`;
    case CrossTabDimension.LGA:
      return sql`COALESCE(l.name, ru.lga_id, 'Unknown')`;
    case CrossTabDimension.EMPLOYMENT_TYPE:
      return sql`ru.raw_data->>'employment_type'`;
    case CrossTabDimension.MARITAL_STATUS:
      return sql`ru.raw_data->>'marital_status'`;
    case CrossTabDimension.HOUSING:
      return sql`ru.raw_data->>'housing_status'`;
    case CrossTabDimension.DISABILITY:
      return sql`ru.raw_data->>'disability_status'`;
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
 * The answers-present cohort on the canonical respondent-anchored read —
 * Story 12-6 (inherited 12-5 R2).
 *
 * ⭐ WHY THIS REPLACED `buildWhereFragments` FOR EVERY PUBLISHED RATE. The old
 * filter ran over `FROM submissions s`: ONE ROW PER SUBMISSION. Anyone holding
 * more than one answer-bearing submission was weighted twice in every rate the
 * dashboard published. Measured on prod 2026-08-20: 286 answer-bearing
 * submissions against 272 answer-bearing people — ~14 people counted twice, in
 * figures a Ministry reads. That is a GRAIN defect, and 12-5 fixed only the
 * DIVISOR; a right numerator over a doubled population is still wrong.
 *
 * ⚠️ Re-pointing is not a search-and-replace, because the canonical read is
 * respondent-anchored and therefore does not carry three columns the old filter
 * used. Each was a decision, taken deliberately (Task 0, Awwal 2026-08-20):
 *
 *   - `s.submitter_id` → `ru.submitter_id`, via `buildRegistryFilter`'s
 *     `'submitter'` personal-scope mode. "The people I registered", not
 *     "the submissions I filed" —
 *     the only question a per-person read can answer, and the attribution
 *     `productivity.service.ts` already reports staff counts from.
 *   - `s.submitted_at` → `ru.created_at`. A date range now selects WHEN THE
 *     PERSON REGISTERED, not when an answer arrived. This is what
 *     `/registry-totals` already meant by a date range, so the two endpoints
 *     stop disagreeing about what the filter selects.
 *   - `s.source` → `ru.source` (respondent provenance). The vocabularies
 *     overlap on `enumerator`/`public`/`clerk`; `ru.source` also carries the
 *     `imported_*` values, which is the honest superset.
 *
 * ⭐ And one condition simply stops existing: the old filter needed
 * `s.respondent_id IS NOT NULL` to exclude orphan submissions (prod holds 2,
 * from the 13-57 pair — and forgetting that half of the predicate is what made
 * 12-5's prod prediction wrong). Here the grain IS the respondent, so an orphan
 * submission cannot enter the population at all. A condition nobody can forget
 * beats a condition everybody must remember.
 *
 * The scope/params half is 12-4's `buildRegistryFilter` — imported, never
 * re-written. A private second copy of a registry filter is precisely the drift
 * 13-33/13-37 exist to kill.
 */
function buildUnifiedAnswersWhere(
  scope: AnalyticsScope,
  params: AnalyticsQueryParams = {},
): SQL {
  return sql`${buildRegistryFilter(scope, params, 'submitter')} AND ru.raw_data IS NOT NULL`;
}

/**
 * Build parameterized WHERE clause fragments for scope + optional params.
 * Uses Drizzle sql template tag — NEVER sql.raw() for user-supplied values.
 *
 * ⚠️ SUBMISSION-GRAINED — one row per submission. Story 12-6 moved every
 * PUBLISHED RATE off this and onto {@link buildUnifiedAnswersWhere}; what still
 * uses it are the surfaces whose subject genuinely IS a submission (processing
 * pipeline, per-day submission counts, per-enumerator comparison). Before
 * reaching for it on anything that divides people by people, read that
 * function's note — this one double-counts by construction.
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


/* ══════════════════════════════════════════════════════════════════════════
 * Story 12-6 — Data-Health helpers
 * ══════════════════════════════════════════════════════════════════════════ */

/** Default page bound for the `data_lost` drill (AC4.3 — never unbounded). */
const DATA_HEALTH_DRILL_LIMIT = 50;

/** Per-request knobs that are not part of the shared analytics filter. */
export interface DataHealthOptions {
  /** Which published form's schema supplies the field axis. Defaults to the latest. */
  formId?: string;
  limit?: number;
  offset?: number;
}

/** Raw row shape of the recovery-cohort query. */
interface RecoveryCohortRow {
  respondent_id: string;
  lga_id: string | null;
  status: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  phone_number: string | null;
  created_at: string | Date | null;
  raw_data: Record<string, unknown> | null;
  reference_code: string | null;
  first_name: string | null;
  last_name: string | null;
  lga_name: string | null;
}

/**
 * Resolve the form whose schema defines the per-field axis.
 *
 * An explicit `formId` wins. Otherwise the MOST RECENTLY PUBLISHED form is used
 * — `listForms` already orders by `createdAt DESC`, and "the instrument we are
 * currently collecting on" is the only default a completeness view can defend.
 *
 * ⚠️ Returns a null schema rather than throwing when no published form exists.
 * That state is unreachable in prod (registration requires a published form) but
 * it IS reachable on a fresh test/dev database, and a Data-Health tab that 500s
 * on an empty environment would be blamed on the tab. The view then renders the
 * recovery cohort and an empty field list, which is the honest picture: no
 * instrument, therefore no per-question rates.
 */
async function resolveDataHealthForm(formId?: string): Promise<{
  id: string | null;
  title: string | null;
  schema: NativeFormSchema | null;
}> {
  if (formId) {
    const schema = await QuestionnaireService.getFormSchemaById(formId);
    if (!schema) {
      throw new AppError('FORM_NOT_FOUND', 'Questionnaire form not found or has no schema', 404);
    }
    return { id: formId, title: schema.title ?? null, schema };
  }

  const published = await QuestionnaireService.listForms({ status: 'published', pageSize: 1 });
  const latest = published.data[0];
  if (!latest) return { id: null, title: null, schema: null };

  const schema = await QuestionnaireService.getFormSchemaById(latest.id);
  return { id: latest.id, title: latest.title ?? null, schema: schema ?? null };
}

/**
 * Tally per-field response rates over the answer-bearing cohort (AC3).
 *
 * Pure so the arithmetic is testable without a database — the drift class this
 * story sits in is arithmetic, not plumbing.
 *
 * Two things it must get right, both of which have bitten this codebase:
 *
 * 1. **`normalizeRawDataKeys` runs BEFORE the answered test.** The same concept
 *    appears under different keys across form versions (`dob`↔`date_of_birth`,
 *    `firstname`↔`surname`, `_gpsLatitude`↔`gps_latitude`). Without this, a
 *    field reads as under-answered purely because older submissions spelled it
 *    differently — a data-health view reporting a data-health defect it invented.
 * 2. **"Answered" is `hasAnswer` (12-4), not a local emptiness check.** That is
 *    the TS half of the same contract `answeredFieldDenominator` speaks in SQL;
 *    a third definition would let a row read `partial` on Axis-2 while counting
 *    as answered here. Note `'0'` and `'false'` ARE answers; `''`/`[]`/`{}` are not.
 *
 * Sorted ascending by rate so the most under-answered questions surface first —
 * which is the question the view exists to answer.
 */
export function tallyFieldResponses(
  rawRows: Array<Record<string, unknown> | null>,
  columns: Array<{ key: string; header: string }>,
  withAnswers: number,
): DataHealthField[] {
  const answered = new Map<string, number>(columns.map((c) => [c.key, 0]));

  for (const raw of rawRows) {
    if (raw == null) continue;
    const normalized = normalizeRawDataKeys(raw);
    for (const column of columns) {
      if (hasAnswer(normalized, column.key)) {
        answered.set(column.key, (answered.get(column.key) ?? 0) + 1);
      }
    }
  }

  return columns
    .map((column) => {
      const answeredCount = answered.get(column.key) ?? 0;

      // ⚠️ THE NUMERATOR COUNTS ROWS; THE DENOMINATOR COUNTS PEOPLE (12-6
      // review M1). `rawRows` is one row per `respondents.id`, while
      // `withAnswers` is `getRegistryTotals().byDataStatus.completed`, counted
      // AFTER 12-4's identity-key collapse (NIN → E.164 phone). Two respondent
      // rows resolving to one person therefore contribute 2 to a field's
      // numerator and 1 to the denominator, and the rate exceeds 100%.
      //
      // Measured on prod 2026-08-21 the collapse removes nothing (272 rows →
      // 272 identities), so this is latent today — but the difference is
      // structural, not arithmetic, and the chart's X axis is fixed to
      // `domain={[0, 100]}`, so an over-100 bar would render as a FULL bar with
      // an over-100 tooltip: wrong and silent at the same time.
      //
      // So: clamp for display, and say so in the log. Never "fix" it by
      // dividing by `rawRows.length` instead — that publishes a denominator
      // beside a `withAnswers` caption the arithmetic did not use, which is the
      // defect ruling R-E named.
      const rawRate = withAnswers > 0 ? (answeredCount / withAnswers) * 100 : 0;
      if (answeredCount > withAnswers) {
        logger.warn({
          event: 'analytics.data_health_field_rate_exceeds_cohort',
          field: column.key,
          answeredCount,
          withAnswers,
          why: 'answer-bearing ROWS exceed identity-collapsed PEOPLE — duplicate registrations (12-4 identityAmbiguous territory); rate clamped to 100 for display',
        });
      }

      return {
        key: column.key,
        label: column.header,
        answeredCount,
        // Guarded because a filtered view can legitimately select nobody, and
        // 0/0 must render as "no data", never as NaN on a Ministry dashboard.
        responseRate: Math.min(100, Math.round(rawRate * 10) / 10),
      };
    })
    .sort((a, b) => a.responseRate - b.responseRate || a.key.localeCompare(b.key));
}
const SUPPRESSION_MIN_N = 5;
const ACTIVE_ENUMERATOR_DEFAULT_DAYS = 7;

export class SurveyAnalyticsService {
  /**
   * Demographics: gender, age bands, education, marital status, disability, LGA distribution
   */
  static async getDemographics(scope: AnalyticsScope, params: AnalyticsQueryParams = {}): Promise<DemographicStats> {
    const where = buildUnifiedAnswersWhere(scope, params);

    // Total count for percentage calculations
    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM ${registryUnifiedSource('ru')}
      WHERE ${where}
    `);
    const total = Number((totalResult.rows[0] as unknown as TotalRow)?.total ?? 0);

    // Run all distribution queries in parallel
    const [genderRows, ageRows, eduRows, maritalRows, disabilityRows, lgaRows, consentMktRows, consentEnrRows] = await Promise.all([
      // Gender
      db.execute(sql`
        SELECT ru.raw_data->>'gender' AS label, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where} AND ru.raw_data->>'gender' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Age bands
      db.execute(sql`
        SELECT
          CASE
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 15 AND 19 THEN '15-19'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 20 AND 24 THEN '20-24'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 25 AND 29 THEN '25-29'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 30 AND 34 THEN '30-34'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 35 AND 39 THEN '35-39'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 40 AND 44 THEN '40-44'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 45 AND 49 THEN '45-49'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 50 AND 54 THEN '50-54'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) BETWEEN 55 AND 59 THEN '55-59'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)) >= 60 THEN '60+'
            ELSE 'unknown'
          END AS label,
          COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where} AND ru.raw_data->>'dob' IS NOT NULL
        GROUP BY label ORDER BY label
      `),
      // Education
      db.execute(sql`
        SELECT ru.raw_data->>'education_level' AS label, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where} AND ru.raw_data->>'education_level' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Marital status
      db.execute(sql`
        SELECT ru.raw_data->>'marital_status' AS label, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where} AND ru.raw_data->>'marital_status' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Disability
      db.execute(sql`
        SELECT ru.raw_data->>'disability_status' AS label, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where} AND ru.raw_data->>'disability_status' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // LGA distribution
      db.execute(sql`
        SELECT COALESCE(l.name, ru.lga_id, 'Unknown') AS label, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        LEFT JOIN lgas l ON l.code = ru.lga_id
        WHERE ${where}
        GROUP BY label ORDER BY count DESC
      `),
      // Consent: marketplace opt-in (AC#2)
      db.execute(sql`
        SELECT ru.raw_data->>'consent_marketplace' AS label, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where} AND ru.raw_data->>'consent_marketplace' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Consent: enriched data sharing (AC#2)
      db.execute(sql`
        SELECT ru.raw_data->>'consent_enriched' AS label, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where} AND ru.raw_data->>'consent_enriched' IS NOT NULL
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
    const where = buildUnifiedAnswersWhere(scope, params);

    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM ${registryUnifiedSource('ru')}
      WHERE ${where}
    `);
    const total = Number((totalResult.rows[0] as unknown as TotalRow)?.total ?? 0);

    const [workStatusRows, empTypeRows, formalInformalRows, expRows, hoursRows, incomeRows, incomeByLgaRows] = await Promise.all([
      // Work status (ILO-aligned classification)
      db.execute(sql`
        SELECT
          CASE
            WHEN ru.raw_data->>'employment_status' = 'yes' THEN 'employed'
            WHEN ru.raw_data->>'temp_absent' = 'yes' THEN 'temporarily_absent'
            WHEN ru.raw_data->>'looking_for_work' = 'yes' THEN 'unemployed_seeking'
            WHEN ru.raw_data->>'available_for_work' = 'yes' THEN 'unemployed_available'
            ELSE 'not_in_labour_force'
          END AS label,
          COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where}
        GROUP BY label ORDER BY count DESC
      `),
      // Employment type
      db.execute(sql`
        SELECT ru.raw_data->>'employment_type' AS label, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where} AND ru.raw_data->>'employment_type' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Formal vs informal
      db.execute(sql`
        SELECT
          CASE
            WHEN ru.raw_data->>'employment_type' IN ('wage_public', 'wage_private', 'contractor') THEN 'formal'
            WHEN ru.raw_data->>'employment_type' IN ('self_employed', 'family_unpaid', 'apprentice') THEN 'informal'
            ELSE 'unknown'
          END AS label,
          COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where} AND ru.raw_data->>'employment_type' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Experience
      db.execute(sql`
        SELECT ru.raw_data->>'years_experience' AS label, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where} AND ru.raw_data->>'years_experience' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Hours worked (bands)
      db.execute(sql`
        SELECT
          CASE
            WHEN (ru.raw_data->>'hours_worked')::int BETWEEN 0 AND 19 THEN '0-19'
            WHEN (ru.raw_data->>'hours_worked')::int BETWEEN 20 AND 34 THEN '20-34'
            WHEN (ru.raw_data->>'hours_worked')::int BETWEEN 35 AND 44 THEN '35-44'
            WHEN (ru.raw_data->>'hours_worked')::int BETWEEN 45 AND 59 THEN '45-59'
            WHEN (ru.raw_data->>'hours_worked')::int >= 60 THEN '60+'
            ELSE 'unknown'
          END AS label,
          COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where}
          AND ru.raw_data->>'hours_worked' IS NOT NULL
          AND ru.raw_data->>'hours_worked' ~ '^[0-9]+$'
        GROUP BY label ORDER BY label
      `),
      // Income distribution (bands in Naira)
      db.execute(sql`
        SELECT
          CASE
            WHEN (ru.raw_data->>'monthly_income')::int < 30000 THEN 'under_30k'
            WHEN (ru.raw_data->>'monthly_income')::int BETWEEN 30000 AND 49999 THEN '30k-50k'
            WHEN (ru.raw_data->>'monthly_income')::int BETWEEN 50000 AND 99999 THEN '50k-100k'
            WHEN (ru.raw_data->>'monthly_income')::int BETWEEN 100000 AND 199999 THEN '100k-200k'
            WHEN (ru.raw_data->>'monthly_income')::int >= 200000 THEN '200k+'
            ELSE 'unknown'
          END AS label,
          COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where}
          AND ru.raw_data->>'monthly_income' IS NOT NULL
          AND ru.raw_data->>'monthly_income' ~ '^[0-9]+$'
        GROUP BY label ORDER BY label
      `),
      // Income-reporting respondents by LGA
      db.execute(sql`
        SELECT COALESCE(l.name, ru.lga_id, 'Unknown') AS label, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        LEFT JOIN lgas l ON l.code = ru.lga_id
        WHERE ${where}
          AND ru.raw_data->>'monthly_income' IS NOT NULL
          AND ru.raw_data->>'monthly_income' ~ '^[0-9]+$'
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
    const where = buildUnifiedAnswersWhere(scope, params);

    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM ${registryUnifiedSource('ru')}
      WHERE ${where}
    `);
    const total = Number((totalResult.rows[0] as unknown as TotalRow)?.total ?? 0);

    const [sizeRows, headRows, housingRows, aggregates] = await Promise.all([
      // Household size bands
      db.execute(sql`
        SELECT
          CASE
            WHEN (ru.raw_data->>'household_size')::int = 1 THEN '1'
            WHEN (ru.raw_data->>'household_size')::int BETWEEN 2 AND 3 THEN '2-3'
            WHEN (ru.raw_data->>'household_size')::int BETWEEN 4 AND 6 THEN '4-6'
            WHEN (ru.raw_data->>'household_size')::int BETWEEN 7 AND 10 THEN '7-10'
            WHEN (ru.raw_data->>'household_size')::int > 10 THEN '11+'
            ELSE 'unknown'
          END AS label,
          COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where}
          AND ru.raw_data->>'household_size' IS NOT NULL
          AND ru.raw_data->>'household_size' ~ '^[0-9]+$'
        GROUP BY label ORDER BY label
      `),
      // Head of household by gender
      db.execute(sql`
        SELECT ru.raw_data->>'gender' AS label, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where}
          AND ru.raw_data->>'is_head' = 'yes'
          AND ru.raw_data->>'gender' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Housing status
      db.execute(sql`
        SELECT ru.raw_data->>'housing_status' AS label, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where} AND ru.raw_data->>'housing_status' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      // Aggregate scalars
      db.execute(sql`
        SELECT
          -- Both sums are restricted to households that gave a household_size:
          -- the divisor already was, so summing dependents over rows OUTSIDE
          -- that set put people in the numerator who were absent from the
          -- denominator, inflating the ratio by an amount nobody could state.
          CASE WHEN COUNT(*) > 0
            THEN ROUND(
              SUM(CASE WHEN ru.raw_data->>'dependents_count' ~ '^[0-9]+$'
                       AND ru.raw_data->>'household_size' ~ '^[0-9]+$'
                  THEN (ru.raw_data->>'dependents_count')::numeric ELSE 0 END)::numeric /
              NULLIF(SUM(CASE WHEN ru.raw_data->>'household_size' ~ '^[0-9]+$'
                  THEN (ru.raw_data->>'household_size')::numeric ELSE 0 END), 0)
            , 2)
            ELSE NULL
          END AS dependency_ratio,
          COUNT(*) FILTER (WHERE ru.raw_data->>'has_business' = 'yes') AS biz_owners,
          COUNT(*) FILTER (WHERE ru.raw_data->>'business_reg' = 'registered') AS biz_registered,
          SUM(CASE WHEN ru.raw_data->>'apprentice_count' ~ '^[0-9]+$'
              THEN (ru.raw_data->>'apprentice_count')::int ELSE 0 END) AS apprentice_total,
          COUNT(*) AS total_count,
          -- Story 12-5 AC4 / ruling R-E: each statistic's OWN base — the people
          -- who answered ITS question, counted through the same WHERE.
          COUNT(*) FILTER (WHERE ru.raw_data->>'household_size' ~ '^[0-9]+$') AS household_size_n,
          COUNT(*) FILTER (WHERE ru.raw_data->>'has_business' IS NOT NULL) AS has_business_n,
          COUNT(*) FILTER (WHERE ru.raw_data->>'apprentice_count' ~ '^[0-9]+$') AS apprentice_n
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where}
      `),
    ]);

    const agg = aggregates.rows[0] as unknown as HouseholdAggRow;
    const bizOwners = Number(agg?.biz_owners ?? 0);
    const bizRegistered = Number(agg?.biz_registered ?? 0);
    const apprenticeTotal = suppressIfTooFew(Number(agg?.apprentice_total ?? 0));

    // Per-field bases (Story 12-5 AC4). `total_count` is deliberately unused as
    // a divisor now: it counts everyone with ANY answers, which is ruling R-E's
    // coarse denominator. See the businessOwnershipRate note below.
    const householdSizeN = Number(agg?.household_size_n ?? 0);
    const hasBusinessN = Number(agg?.has_business_n ?? 0);
    const apprenticeN = Number(agg?.apprentice_n ?? 0);

    const headTotal = (headRows.rows as unknown as LabelCountRow[]).reduce((sum: number, r: LabelCountRow) => sum + Number(r.count), 0);

    return {
      householdSizeDistribution: suppressSmallBuckets(toBuckets(sizeRows.rows as unknown as LabelCountRow[], total)),
      dependencyRatio: agg?.dependency_ratio != null ? Number(agg.dependency_ratio) : null,
      headOfHouseholdByGender: suppressSmallBuckets(toBuckets(headRows.rows as unknown as LabelCountRow[], headTotal)),
      housingDistribution: suppressSmallBuckets(toBuckets(housingRows.rows as unknown as LabelCountRow[], total)),
      /**
       * ⚠️ Ruling R-E, applied here too. This divided by `total_count` —
       * everyone with ANY answers — so a respondent never ASKED about business
       * ownership sat in the divisor and *not asked* silently became *does not
       * own a business*. 12-4 fixed this exact defect in
       * `public-insights.service.ts`; THIS second code path was never touched,
       * so the dashboard and the public page have been publishing different
       * values for the same statistic. It now divides by the people who
       * answered the question, which is what the public page already does.
       */
      businessOwnershipRate: suppressIfTooFew(bizOwners) !== null && hasBusinessN > 0
        ? Math.round((bizOwners / hasBusinessN) * 1000) / 10
        : null,
      businessRegistrationRate: suppressIfTooFew(bizRegistered) !== null && bizOwners > 0
        ? Math.round((bizRegistered / bizOwners) * 1000) / 10
        : null,
      apprenticeTotal,
      /**
       * Story 12-5 AC4 — the base each statistic above was computed over.
       *
       * Four different numbers, and that difference is the information: the
       * dependency ratio divides by households that gave a size, the ownership
       * rate by those asked about a business, the registration rate by the
       * business owners among them, and the apprentice total is a sum over
       * those who gave a count. `null` where the statistic itself is null — a
       * base for a figure that is not on screen is noise.
       */
      denominators: {
        dependencyRatio: agg?.dependency_ratio != null ? householdSizeN : null,
        businessOwnership: suppressIfTooFew(bizOwners) !== null && hasBusinessN > 0 ? hasBusinessN : null,
        businessRegistration: suppressIfTooFew(bizRegistered) !== null && bizOwners > 0 ? bizOwners : null,
        apprenticeTotal: apprenticeTotal !== null ? apprenticeN : null,
      },
    };
  }

  /**
   * Top N skills by frequency, unnesting space-separated skill codes.
   *
   * Story 12-5 (AC4): returns the DENOMINATOR alongside the rates it produced.
   * `total` below was already computed here and then discarded, so the chart
   * published shares with no way to say what they were shares OF — and it could
   * not be recovered downstream, because `percentage` is rounded to 1dp. A rate
   * without the count it came from is the same defect as a mislabelled total.
   */
  static async getSkillsFrequency(
    scope: AnalyticsScope,
    params: AnalyticsQueryParams = {},
    limit: number = 20,
  ): Promise<SkillsFrequencyResult> {
    const where = buildUnifiedAnswersWhere(scope, params);

    // Total submissions with skills for percentage
    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM ${registryUnifiedSource('ru')}
      WHERE ${where}
        AND ru.raw_data->>'skills_possessed' IS NOT NULL
        AND ru.raw_data->>'skills_possessed' != ''
    `);
    const total = Number((totalResult.rows[0] as unknown as TotalRow)?.total ?? 0);

    const safeLimit = Math.max(1, Math.min(limit, 100));

    const rows = await db.execute(sql`
      SELECT skill, COUNT(*) AS count
      FROM ${registryUnifiedSource('ru')},
           ${selectMultipleUnnest(sql`ru.raw_data`, 'skills_possessed')} AS skill
      WHERE ${where}
        AND ru.raw_data->>'skills_possessed' IS NOT NULL
        AND ru.raw_data->>'skills_possessed' != ''
      GROUP BY skill
      ORDER BY count DESC
      LIMIT ${safeLimit}
    `);

    const skills = (rows.rows as Array<{ skill: string; count: string | number }>)
      .map((r) => ({
        skill: String(r.skill),
        count: Number(r.count),
        percentage: total > 0 ? Math.round((Number(r.count) / total) * 1000) / 10 : 0,
      }))
      .filter((s) => s.count >= SUPPRESSION_MIN_N);

    // `total`, not the sum of `count`: one respondent selecting five skills is
    // one person in the denominator and five in the counts.
    return { skills, respondentsAnswering: total };
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
    const where = buildUnifiedAnswersWhere(scope, params);

    const rows = await db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE ru.raw_data->>'employment_status' = 'yes') AS employed,
        COUNT(*) FILTER (WHERE ru.raw_data->>'gender' = 'female') AS female,
        AVG(EXTRACT(YEAR FROM AGE(NOW(), (ru.raw_data->>'dob')::date)))
          FILTER (WHERE ru.raw_data->>'dob' IS NOT NULL) AS avg_age,
        COUNT(*) FILTER (WHERE ru.raw_data->>'has_business' = 'yes') AS biz_owners,
        ROUND(100.0 * COUNT(*) FILTER (WHERE ru.raw_data->>'consent_marketplace' = 'yes') / NULLIF(COUNT(*), 0), 1) AS consent_marketplace_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE ru.raw_data->>'consent_enriched' = 'yes') / NULLIF(COUNT(*), 0), 1) AS consent_enriched_pct
      FROM ${registryUnifiedSource('ru')}
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
   * Story 12-6 — the Data-Health aggregate: per-field response rates + the
   * `data_lost` recovery cohort.
   *
   * ── What this OWNS, and what it deliberately does not ───────────────────────
   * 12-4 exposed the funnel head (`totalRespondents` / `withAnswers`) and the
   * per-`data_status` breakdown and explicitly left per-field rates here,
   * because flattening `raw_data` per QUESTION is a different aggregation
   * altitude from a distinct-respondent tally. So this calls
   * `getRegistryTotals()` for every count it needs and re-counts nothing: one
   * registry, one number. The tab renders the funnel from that same aggregate.
   *
   * ── The field list comes from the SCHEMA, not from the data ────────────────
   * `buildColumnsFromFormSchema` (the same builder the Full/Unified exports use)
   * supplies the questions and their labels. Deriving the field list from the
   * keys actually present would make a question with a 0% response rate
   * invisible — and a question nobody answered is the single most important row
   * a data-health view can show.
   */
  static async getDataHealth(
    scope: AnalyticsScope,
    params: AnalyticsQueryParams = {},
    options: DataHealthOptions = {},
  ): Promise<DataHealthData> {
    const limit = Math.max(1, Math.min(options.limit ?? DATA_HEALTH_DRILL_LIMIT, 200));
    const offset = Math.max(0, options.offset ?? 0);

    const form = await resolveDataHealthForm(options.formId);
    const where = buildUnifiedAnswersWhere(scope, params);

    const [totals, answerRows] = await Promise.all([
      // ⚠️ `'submitter'` is NOT optional here, and the 12-6 review (M2) is why.
      // The per-field NUMERATOR below narrows a `personal` scope to one
      // submitter through `buildUnifiedAnswersWhere`; the DENOMINATOR is
      // `totals.withAnswers`. `getRegistryTotals` defaults `personal` to
      // "no filter" — the right reading for `/registry-totals`, where the
      // register is one shared already-public object — so taking the default
      // here would divide one enumerator's answered fields by the WHOLE
      // register. Both halves of a rate must describe one population.
      getRegistryTotals(scope, params, 'submitter'),
      // Only `raw_data` crosses the wire: this pass counts answered questions,
      // so there is no reason for every respondent's NIN and phone to enter the
      // API process on a dashboard hit (12-4's narrowed-projection discipline).
      db.execute(sql`
        SELECT ru.raw_data
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where}
      `),
    ]);

    const columns = form.schema ? buildColumnsFromFormSchema(form.schema) : [];
    const fields = tallyFieldResponses(
      (answerRows.rows as unknown as Array<{ raw_data: Record<string, unknown> | null }>)
        .map((r) => r.raw_data),
      columns,
      totals.withAnswers,
    );

    const recoveryCohort = await SurveyAnalyticsService.getRecoveryCohort(
      scope,
      params,
      totals.byDataStatus.data_lost,
      limit,
      offset,
    );

    logger.info({
      event: 'analytics.data_health_computed',
      withAnswers: totals.withAnswers,
      fieldCount: fields.length,
      formId: form.id,
      dataLostTotal: recoveryCohort.total,
      drillRows: recoveryCohort.rows.length,
    });

    return {
      withAnswers: totals.withAnswers,
      formId: form.id,
      formTitle: form.title,
      fields,
      recoveryCohort,
    };
  }

  /**
   * One bounded page of the `data_lost` cohort (AC4.2/4.3).
   *
   * ── Why the SQL narrows but the ATOM decides ───────────────────────────────
   * `deriveDataStatus` (9-59) is the single authority on what `data_lost` means,
   * and re-expressing its precedence as a SQL `CASE` would be the second
   * definition 13-33/13-37 exist to prevent. But the list must also be BOUNDED —
   * "derive in TS" and "do not build the whole cohort in memory" pull opposite
   * ways at scale.
   *
   * Resolution: SQL narrows using only the atom's own INPUTS (`raw_data` absent,
   * the `questionnaire_data_lost` marker set) — never its precedence — so the
   * query returns a superset-free page, and `deriveDataStatus` is then run over
   * that page as the authority. Any row the atom disagrees with is DROPPED and
   * counted, because a silent disagreement between the narrowing and the
   * taxonomy is exactly the drift worth hearing about.
   *
   * The cohort SIZE comes from 12-4's `byDataStatus.data_lost`, never from
   * `rows.length` — a page is not a population.
   */
  private static async getRecoveryCohort(
    scope: AnalyticsScope,
    params: AnalyticsQueryParams,
    total: number,
    limit: number,
    offset: number,
  ): Promise<DataHealthRecoveryCohort> {
    const result = await db.execute(sql`
      SELECT
        ru.respondent_id,
        ru.lga_id,
        ru.status,
        ru.source,
        ru.metadata,
        ru.phone_number,
        ru.created_at,
        ru.raw_data,
        r.reference_code,
        r.first_name,
        r.last_name,
        l.name AS lga_name
      FROM ${registryUnifiedSource('ru')}
      JOIN respondents r ON r.id = ru.respondent_id
      LEFT JOIN lgas l ON l.code = ru.lga_id
      WHERE ${buildRegistryFilter(scope, params, 'submitter')}
        AND ru.raw_data IS NULL
        AND ru.metadata->>'questionnaire_data_lost' = 'true'
      ORDER BY ru.created_at DESC NULLS LAST, ru.respondent_id
      LIMIT ${limit} OFFSET ${offset}
    `);

    const rows: DataHealthRecoveryRow[] = [];
    let atomDisagreements = 0;

    for (const raw of result.rows as unknown as RecoveryCohortRow[]) {
      const status = deriveDataStatus({
        hasSubmissionData: hasNonEmptyRawData(raw.raw_data),
        status: raw.status,
        source: raw.source,
        metadata: raw.metadata as { questionnaire_data_lost?: boolean } | null,
      });

      if (status !== 'data_lost') {
        atomDisagreements += 1;
        continue;
      }

      const name = [raw.first_name, raw.last_name].filter(Boolean).join(' ').trim();
      rows.push({
        respondentId: raw.respondent_id,
        referenceCode: raw.reference_code ?? null,
        fullName: name === '' ? null : name,
        lgaId: raw.lga_id ?? null,
        lgaName: raw.lga_name ?? null,
        registeredAt: raw.created_at == null ? null : new Date(raw.created_at).toISOString(),
        phoneNumber: raw.phone_number ?? null,
      });
    }

    if (atomDisagreements > 0) {
      logger.warn({
        event: 'analytics.data_health_cohort_narrowing_drift',
        atomDisagreements,
        why: 'SQL narrowing selected rows deriveDataStatus does not classify data_lost',
      });
    }

    return { total, rows, limit, offset };
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
    const where = buildUnifiedAnswersWhere(scope, params);

    // Check cache
    const cacheKey = analyticsCacheKey('cross-tab', scope.type, scope.lgaCode || scope.userId || 'all', rowDim, colDim, measure, stableStringify(params as unknown as Record<string, unknown>));
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
      FROM ${registryUnifiedSource('ru')}
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
    const lgaJoin = needsLgaJoin ? sql`LEFT JOIN lgas l ON l.code = ru.lga_id` : sql``;

    const rows = await db.execute(sql`
      SELECT
        ${rowExpr} AS row_val,
        ${colExpr} AS col_val,
        COUNT(*) AS cell_count
      FROM ${registryUnifiedSource('ru')}
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
    const where = buildUnifiedAnswersWhere(scope, params);

    // Check cache
    const cacheKey = analyticsCacheKey('skills-inventory', scope.type, scope.lgaCode || scope.userId || 'all', stableStringify(params as unknown as Record<string, unknown>));
    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (err) {
        logger.warn({ event: 'skills_inventory.cache_read_failed', error: (err as Error).message });
      }
    }

    // Count the PEOPLE with skills data for threshold checks.
    const totalSkillsResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM ${registryUnifiedSource('ru')}
      WHERE ${where}
        AND ru.raw_data->>'skills_possessed' IS NOT NULL
        AND ru.raw_data->>'skills_possessed' != ''
    `);
    const totalWithSkills = Number((totalSkillsResult.rows[0] as unknown as TotalRow)?.total ?? 0);

    // Count the answer-bearing PEOPLE for LGA-specific thresholds.
    //
    // ⚠️ `totalSubmissions` keeps its name only because it feeds the shared
    // threshold shape; as of Story 12-6 it counts people, like every other
    // denominator in this method. Suppression thresholds that were sized against
    // a double-counted population were, by construction, slightly too easy to
    // clear — a suppression gate is the last place that should round in the
    // permissive direction.
    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM ${registryUnifiedSource('ru')}
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
        FROM ${registryUnifiedSource('ru')},
             ${selectMultipleUnnest(sql`ru.raw_data`, 'skills_possessed')} AS skill
        WHERE ${where}
          AND ru.raw_data->>'skills_possessed' IS NOT NULL
          AND ru.raw_data->>'skills_possessed' != ''
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
        const category = skillSectorForSlug(skill.skill);
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
          SELECT ru.lga_id, skill, COUNT(*) AS count
          FROM ${registryUnifiedSource('ru')},
               ${selectMultipleUnnest(sql`ru.raw_data`, 'skills_possessed')} AS skill
          WHERE ${where}
            AND ru.raw_data->>'skills_possessed' IS NOT NULL
            AND ru.raw_data->>'skills_possessed' != ''
          GROUP BY ru.lga_id, skill
          HAVING COUNT(*) >= ${SUPPRESSION_MIN_N}
        ),
        ranked AS (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY lga_id ORDER BY count DESC) AS rn
          FROM skill_counts
        )
        -- rk is the RANKED CTE, not the respondents table. It was aliased r
        -- before Story 12-6, which read exactly like the respondent join two
        -- lines above and made a mechanical r. -> ru. rewrite silently wrong.
        -- Renamed so the two can never be confused again.
        SELECT rk.lga_id, COALESCE(l.name, rk.lga_id, 'Unknown') AS lga_name, rk.skill, rk.count
        FROM ranked rk
        LEFT JOIN lgas l ON l.code = rk.lga_id
        WHERE rk.rn <= 3
        ORDER BY lga_name, rk.rn
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
          FROM ${registryUnifiedSource('ru')},
               ${selectMultipleUnnest(sql`ru.raw_data`, 'skills_possessed')} AS skill
          WHERE ${where}
            AND ru.raw_data->>'skills_possessed' IS NOT NULL
            AND ru.raw_data->>'skills_possessed' != ''
          GROUP BY skill
          HAVING COUNT(*) >= ${SUPPRESSION_MIN_N}
        `),
        db.execute(sql`
          SELECT skill, COUNT(*) AS count
          FROM ${registryUnifiedSource('ru')},
               ${selectMultipleUnnest(sql`ru.raw_data`, 'training_interest')} AS skill
          WHERE ${where}
            AND ru.raw_data->>'training_interest' IS NOT NULL
            AND ru.raw_data->>'training_interest' != ''
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
        SELECT ru.lga_id, COALESCE(l.name, ru.lga_id, 'Unknown') AS lga_name,
               skill, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        LEFT JOIN lgas l ON l.code = ru.lga_id,
             ${selectMultipleUnnest(sql`ru.raw_data`, 'skills_possessed')} AS skill
        WHERE ${where}
          AND ru.raw_data->>'skills_possessed' IS NOT NULL
          AND ru.raw_data->>'skills_possessed' != ''
        GROUP BY ru.lga_id, lga_name, skill
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
        ru.raw_data->>'gender' AS gender,
        ru.raw_data->>'employment_type' AS employment_type,
        ru.raw_data->>'education_level' AS education_level,
        ru.raw_data->>'disability_status' AS disability_status,
        ru.raw_data->>'marital_status' AS marital_status,
        ru.raw_data->>'is_head' AS is_head,
        ru.raw_data->>'housing_status' AS housing_status,
        ru.raw_data->>'has_business' AS has_business,
        ru.raw_data->>'monthly_income' AS monthly_income,
        ru.raw_data->>'years_experience' AS years_experience,
        ru.raw_data->>'household_size' AS household_size,
        ru.raw_data->>'hours_worked' AS hours_worked,
        CASE WHEN ru.raw_data->>'employment_status' = 'yes' THEN 'employed'
             WHEN ru.raw_data->>'looking_for_work' = 'yes' THEN 'unemployed' ELSE 'other' END AS work_status,
        ru.lga_id
      FROM ${registryUnifiedSource('ru')}
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
    const where = buildUnifiedAnswersWhere(scope, params);

    // Check cache
    const cacheKey = analyticsCacheKey('insights', scope.type, scope.lgaCode || scope.userId || 'all', stableStringify(params as unknown as Record<string, unknown>));
    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (err) {
        logger.warn({ event: 'insights.cache_read_failed', error: (err as Error).message });
      }
    }

    // Get total count for threshold checks.
    //
    // ⚠️ This `totalN` is the n of every confidence interval and every
    // chi-square below. On the old submission grain it over-counted anyone with
    // two answer-bearing submissions, which does not merely shift a point
    // estimate — it NARROWS the interval around it, publishing more confidence
    // than the data supports. Of everything Story 12-6 re-pointed, this is the
    // number where the grain mattered most.
    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM ${registryUnifiedSource('ru')}
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
      // ⚠️ THE ONE QUERY IN THIS METHOD THAT STAYS SUBMISSION-GRAINED, and it
      // needs its own filter to do so. This is a TIME SERIES of enrolment
      // EVENTS per day, keyed on `s.submitted_at` — a column the canonical
      // respondent-anchored read does not carry, because a person has one
      // registration date and any number of submissions. Feeding it the unified
      // `where` would reference `ru.*` in a query with no `ru` in scope: a
      // straight SQL error, which is the good outcome. The bad outcome would be
      // re-pointing it "for consistency" and silently turning a rate-of-arrival
      // forecast into something else. Same reasoning as `getTrends`.
      const trendsResult = await db.execute(sql`
        SELECT
          DATE(s.submitted_at AT TIME ZONE 'Africa/Lagos') AS day,
          COUNT(*) AS count
        FROM submissions s
        LEFT JOIN respondents r ON r.id = s.respondent_id
        WHERE ${buildWhereFragments(scope, params)}
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
          await redis.set(PUBLIC_KEY_FINDINGS_CACHE_KEY, JSON.stringify(significantFindings), 'EX', 3600);
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
    const where = buildUnifiedAnswersWhere(scope, params);

    // Check cache
    const cacheKey = analyticsCacheKey('equity', scope.type, scope.lgaCode || scope.userId || 'all', stableStringify(params as unknown as Record<string, unknown>));
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
      FROM ${registryUnifiedSource('ru')}
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
          ru.raw_data->>'disability_status' AS disability_status,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE
            CASE WHEN ru.raw_data->>'employment_status' = 'yes' THEN 'employed'
                 WHEN ru.raw_data->>'looking_for_work' = 'yes' THEN 'unemployed' ELSE 'other' END = 'employed'
          ) AS employed
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where} AND ru.raw_data->>'disability_status' IS NOT NULL
        GROUP BY ru.raw_data->>'disability_status'
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
          ru.raw_data->>'education_level' AS education_level,
          ru.raw_data->>'employment_type' AS employment_type
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where}
          AND CASE WHEN ru.raw_data->>'employment_status' = 'yes' THEN 'employed'
                   WHEN ru.raw_data->>'looking_for_work' = 'yes' THEN 'unemployed' ELSE 'other' END = 'employed'
          AND ru.raw_data->>'education_level' IS NOT NULL
          AND ru.raw_data->>'employment_type' IS NOT NULL
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
        SELECT ru.lga_id, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ${where} AND ru.lga_id IS NOT NULL
        GROUP BY ru.lga_id
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
    // Routed through the shared helper like every other analytics cache. This
    // aggregate's VALUE did not change in 12-6 (it is deliberately still
    // submission-grained), so this bump costs one cold recompute of a 600s
    // entry — worth it to leave no unversioned literal for a later reader to
    // treat as the pattern.
    const cacheKey = analyticsCacheKey('reliability', lgaCode || 'all');

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
    const cacheKey = analyticsCacheKey('activation-status', scope.type, scope.lgaCode || scope.userId || 'all');

    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (err) {
        logger.warn({ event: 'activation_status.cache_read_failed', error: (err as Error).message });
      }
    }

    // Simple COUNT query — no expensive computation.
    //
    // ⚠️ Story 12-6: this gate counts PEOPLE, and it had to. The features it
    // activates ARE the statistics in `getInferentialInsights` (chi-square at
    // n≥100, CIs at n≥30) — and those now compute over the answer-bearing
    // respondent cohort. While this counted submissions, the two surfaces
    // published DIFFERENT n for the same threshold: /activation-status could
    // report a feature live at 286 while /insights computed it at 272. A gate
    // that disagrees with the statistic it gates is the same mislabel defect as
    // the one this epic exists to end, just wearing a threshold.
    //
    // It also rounded the wrong way: submissions ≥ people, so every gate was
    // marginally too EASY to clear — the last direction a suppression threshold
    // should err in.
    const totalRespondents = Number(
      (
        (
          await db.execute(sql`
            SELECT COUNT(*) AS total
            FROM ${registryUnifiedSource('ru')}
            WHERE ${buildUnifiedAnswersWhere(scope)}
          `)
        ).rows[0] as unknown as TotalRow
      )?.total ?? 0,
    );

    const features = ACTIVATION_REGISTRY.map(feat => {
      const met = feat.phase <= 4 && totalRespondents >= feat.requiredN;
      const ratio = feat.requiredN > 0 ? totalRespondents / feat.requiredN : 0;
      const category = met ? 'active' as const
        : (feat.phase >= 5 || ratio <= 0.5) ? 'dormant' as const
        : 'approaching' as const;
      return { ...feat, currentN: totalRespondents, met, category };
    });

    const result: ActivationStatusData = { totalRespondents, features };

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
