/**
 * Survey Analytics shared types
 *
 * Story 8.1: Analytics Backend Foundation & Descriptive Statistics API
 * Shared between API service and web frontend.
 */

// --- Query & Filtering ---

export interface AnalyticsQueryParams {
  lgaId?: string;
  dateFrom?: string;
  dateTo?: string;
  source?: string;
}

// --- Reusable Bucket Types ---

export interface FrequencyBucket {
  label: string;
  count: number | null;
  percentage: number | null;
  suppressed?: boolean;
  /**
   * Story 13-33 AC3 — banded disclosure. `true` marks a bucket that is PRESENT
   * but below the k-anonymity floor: `count`/`percentage` are nulled (exact small
   * number withheld) yet the bucket still exists, so a public map/list can render
   * a "present / fewer than N" state instead of dropping it to blank. Set only by
   * `bandSmallBuckets`; absent (undefined) for normally-suppressed or exact buckets.
   */
  banded?: boolean;
}

export interface SkillsFrequency {
  skill: string;
  count: number;
  percentage: number;
}

/**
 * The skills-frequency response, WITH the denominator its percentages divide by.
 *
 * Story 12-5 (AC4). `percentage` is `count / respondentsAnswering`, and that
 * denominator used to be computed server-side and thrown away — so the chart
 * published shares with no way to say what they were shares OF, and the number
 * could not be recovered client-side (percentages are rounded to 1dp). A rate
 * published without the count it came from is the defect this story exists to
 * end, so the denominator now ships with the rates it produced.
 */
export interface SkillsFrequencyResult {
  skills: SkillsFrequency[];
  /**
   * Respondents who ANSWERED the skills question — not respondents overall, and
   * not the number of skill selections (a multi-select respondent contributes
   * one to this and several to the counts).
   */
  respondentsAnswering: number;
}

export interface TrendDataPoint {
  date: string;
  count: number;
}

// --- Demographic Statistics ---

export interface DemographicStats {
  genderDistribution: FrequencyBucket[];
  ageDistribution: FrequencyBucket[];
  educationDistribution: FrequencyBucket[];
  maritalDistribution: FrequencyBucket[];
  disabilityPrevalence: FrequencyBucket[];
  lgaDistribution: FrequencyBucket[];
  consentMarketplace: FrequencyBucket[];
  consentEnriched: FrequencyBucket[];
}

// --- Employment Statistics ---

export interface EmploymentStats {
  workStatusBreakdown: FrequencyBucket[];
  employmentTypeBreakdown: FrequencyBucket[];
  formalInformalRatio: FrequencyBucket[];
  experienceDistribution: FrequencyBucket[];
  hoursWorked: FrequencyBucket[];
  incomeDistribution: FrequencyBucket[];
  incomeByLga: FrequencyBucket[];
}

// --- Household Statistics ---

export interface HouseholdStats {
  householdSizeDistribution: FrequencyBucket[];
  dependencyRatio: number | null;
  headOfHouseholdByGender: FrequencyBucket[];
  housingDistribution: FrequencyBucket[];
  /**
   * Share of households that own a business, over THOSE ASKED — not over
   * everyone with any answers (ruling R-E). Story 12-5 repointed this; before
   * that it read lower than the truth, and disagreed with the public page,
   * which 12-4 had already corrected.
   */
  businessOwnershipRate: number | null;
  businessRegistrationRate: number | null;
  apprenticeTotal: number | null;
  /**
   * Story 12-5 (AC4) — the base EACH statistic above was computed over.
   *
   * Four different numbers on purpose. Publishing a ratio without the count it
   * came from is the same defect as a mislabelled total, and these four cards
   * were the last surface on the dashboard still doing it. `null` where the
   * statistic itself is null or suppressed.
   */
  denominators: {
    /** Households that gave a numeric `household_size` — the divisor's own set. */
    dependencyRatio: number | null;
    /** Respondents who ANSWERED the business-ownership question. */
    businessOwnership: number | null;
    /** Business owners — the set the registration rate is a share of. */
    businessRegistration: number | null;
    /** Respondents who gave a numeric apprentice count. */
    apprenticeTotal: number | null;
  };
}

// --- Registry Summary (5 Stat Cards) ---

export interface RegistrySummary {
  totalRespondents: number;
  employedCount: number;
  employedPct: number;
  femaleCount: number;
  femalePct: number;
  avgAge: number | null;
  businessOwners: number;
  businessOwnersPct: number;
  consentMarketplacePct: number | null;
  consentEnrichedPct: number | null;
}

// --- Pipeline Summary (Submission Processing Stats) ---

export interface PipelineSummary {
  totalSubmissions: number;
  completionRate: number;
  avgCompletionTimeSecs: number | null;
  activeEnumerators: number;
}

// --- Equity Metrics (derived from Demographics + Employment + RegistrySummary) ---

export interface EquityData {
  /** Gender Parity Index: female / male ratio from genderDistribution. Null if missing/suppressed. */
  gpiRatio: number | null;
  /** Employment rate percentage from RegistrySummary. Null if unavailable. */
  employmentRatePct: number | null;
  /** Informal sector percentage from formalInformalRatio. Null if missing/suppressed. */
  informalSectorPct: number | null;
  /**
   * Story 12-5 (AC4) — the n EACH metric above was computed from.
   *
   * They are three DIFFERENT numbers and must not be collapsed into one: the
   * GPI divides by the people who gave a gender, the informal share by those
   * who gave a sector, and the employment rate by the answers subset. A reader
   * shown one figure for all three would mis-weight two of them.
   *
   * `null` where the source metric is itself null (missing or suppressed) —
   * a denominator for a number we are not showing would be noise.
   */
  denominators: {
    gpi: number | null;
    employmentRate: number | null;
    informalSector: number | null;
  };
}

// --- Public Insights ---

// --- Registry Totals (Story 12-4 model — rendered by Story 12-5) ---

/**
 * The canonical data-completeness states a respondent can be in.
 *
 * ⚠️ MIRROR of `REGISTRY_DATA_STATUSES` in
 * `apps/api/src/services/registry-data-status.ts`, which is the canonical
 * source (9-59 owns the taxonomy atom; it cannot import from here because the
 * derivation is pure API-side logic). The API asserts at COMPILE TIME that the
 * two agree — see the drift guard in `registry-totals.service.ts` — so adding a
 * status there without adding it here fails `tsc`, not prod.
 */
export type RegistryDataStatus =
  | 'completed'
  | 'data_lost'
  | 'pending_nin'
  | 'nin_unavailable'
  | 'imported'
  | 'no_submission';

/** Axis-2 — derived from the FIELDS PRESENT, never from which form was used. */
export type RegistryCompleteness = 'full' | 'core' | 'partial';

/**
 * Axis-3 verification tiers. **There is no `verified`** (12-4 AC9 / R1): a NIN
 * is CAPTURED, never validated — no NIMC path exists and NINs carry no check
 * digit. `nin_on_file` is the top tier and must never be rendered as "verified".
 */
export type RegistryVerification =
  | 'nin_on_file'
  | 'self_declared'
  | 'pending_nin'
  | 'unverified_import';

/**
 * The authoritative registry aggregate (Story 12-4), counting PEOPLE.
 *
 * ⚠️ NOT interchangeable with {@link RegistrySummary}. That one counts
 * answer-bearing SUBMISSIONS and its `totalRespondents` is the "with answers"
 * numerator — the 76-labelled-as-139 mislabel Story 12-5 exists to end. Any
 * surface showing a registry TOTAL reads `totalRespondents` from here.
 */
export interface RegistryTotals {
  /** Distinct PEOPLE (identity key: NIN → E.164 phone → respondent id). */
  totalRespondents: number;
  /** The subset whose answers we hold — equals `byDataStatus.completed`. */
  withAnswers: number;
  byDataStatus: Record<RegistryDataStatus, number>;
  /** Axis-1 — registration channel. Open-ended: unknown sources appear dynamically. */
  bySource: Record<string, number>;
  byCompleteness: Record<RegistryCompleteness, number>;
  byVerification: Record<RegistryVerification, number>;
  /**
   * People whose identity could not be resolved. They ARE counted in
   * `totalRespondents` — this is the honest uncertainty band on the headline,
   * not a bucket subtracted from it.
   */
  identityAmbiguous: number;
  /**
   * Wizard drafts STILL IN PROGRESS — a funnel metric, NEVER folded into the
   * total. Always GLOBAL even when the rest of this object is filtered, so a
   * filtered view must label it "(all LGAs)" or omit it rather than print it
   * beside a filtered total as though the two shared a denominator.
   */
  inProgressDrafts: number;
}

// --- Team Quality (Story 8.3: Supervisor view) ---

export interface EnumeratorQualityMetric {
  enumeratorId: string;
  name: string;
  submissionCount: number;
  avgCompletionTimeSec: number | null;
  gpsRate: number | null;
  ninRate: number | null;
  skipRate: number | null;
  fraudFlagRate: number | null;
  status: 'active' | 'inactive';
}

export interface TeamQualityData {
  enumerators: EnumeratorQualityMetric[];
  teamAverages: {
    avgCompletionTime: number | null;
    gpsRate: number | null;
    ninRate: number | null;
    skipRate: number | null;
    fraudRate: number | null;
  };
  submissionsByDay: TrendDataPoint[];
  dayOfWeekPattern: FrequencyBucket[];
  hourOfDayPattern: FrequencyBucket[];
}

// --- Personal Stats (Story 8.3: Enumerator/Clerk view) ---

export interface PersonalStatsData {
  dailyTrend: TrendDataPoint[];
  cumulativeCount: number;
  avgCompletionTimeSec: number | null;
  teamAvgCompletionTimeSec: number | null;
  gpsRate: number | null;
  ninRate: number | null;
  skipRate: number | null;
  fraudFlagRate: number | null;
  teamAvgFraudRate: number | null;
  respondentDiversity: {
    genderSplit: FrequencyBucket[];
    ageSpread: FrequencyBucket[];
  };
  topSkillsCollected: SkillsFrequency[];
  compositeQualityScore: number | null;
}

export interface DataQualityScorecard {
  gpsScore: number | null;
  ninScore: number | null;
  completionTimeScore: number | null;
  skipScore: number | null;
  rejectionScore: number | null;
  diversityScore: number | null;
  compositeScore: number | null;
}

// --- Verification Pipeline Analytics (Story 8.4: Assessor Dashboard) ---

export interface VerificationFunnel {
  totalSubmissions: number;
  totalFlagged: number;
  totalReviewed: number;
  totalApproved: number;
  totalRejected: number;
}

export interface FraudTypeBreakdown {
  gpsCluster: number;
  speedRun: number;
  straightLining: number;
  duplicateResponse: number;
  offHours: number;
}

export interface ReviewThroughput {
  date: string;
  reviewedCount: number;
  approvedCount: number;
  rejectedCount: number;
}

export interface TopFlaggedEnumerator {
  enumeratorId: string;
  name: string;
  flagCount: number;
  criticalCount: number;
  highCount: number;
  approvalRate: number;
}

export interface BacklogTrend {
  date: string;
  pendingCount: number;
  highCriticalCount: number;
}

export interface RejectionReasonFrequency {
  reason: string;
  count: number;
  percentage: number;
}

export interface VerificationPipelineData {
  funnel: VerificationFunnel;
  fraudTypeBreakdown: FraudTypeBreakdown;
  throughputTrend: ReviewThroughput[];
  topFlaggedEnumerators: TopFlaggedEnumerator[];
  backlogTrend: BacklogTrend[];
  rejectionReasons: RejectionReasonFrequency[];
  avgReviewTimeMinutes: number | null;
  medianTimeToResolutionDays: number | null;
  dataQualityScore: {
    completenessRate: number;
    consistencyRate: number;
  };
}

export interface VerificationPipelineQueryParams {
  lgaId?: string;
  severity?: string[];
  dateFrom?: string;
  dateTo?: string;
}

// --- Public Insights ---

export interface PublicInsightsData {
  /** Registered PEOPLE — the honest headline count (Story 13-25). NOT submissions. */
  totalRegistered: number;
  /**
   * Subset of `totalRegistered` with complete survey responses (Story 13-25) —
   * the count of registered PEOPLE the breakdowns describe. Note the breakdown
   * percentages/suppression are computed over the answer-bearing SUBMISSIONS
   * (submission-scoped `total`), which equals this people-count today but can
   * diverge if a respondent has multiple non-empty submissions; the two
   * converge under full 12-4. The remainder are registered people whose survey
   * answers are not on file (soft-launch `data_lost` salvage + `no_submission`
   * + `pending_nin`).
   */
  withAnswers: number;
  lgasCovered: number;
  genderSplit: FrequencyBucket[];
  ageDistribution: FrequencyBucket[];
  allSkills: SkillsFrequency[];
  desiredSkills: SkillsFrequency[];
  employmentBreakdown: FrequencyBucket[];
  formalInformalRatio: FrequencyBucket[];
  businessOwnershipRate: number | null;
  unemploymentEstimate: number | null;
  youthEmploymentRate: number | null;
  gpi: number | null;
  /**
   * Story 12-4 (ruling R-E) — the n EACH rate was actually computed from.
   *
   * These are NOT all the same number and must never be collapsed into one.
   * Every rate above divides by the people who answered ITS OWN question, so a
   * question fewer people were asked has a smaller n. Publishing the n beside
   * the rate is what stops the next reader having to work out which denominator
   * produced it — and what stops a rate over 40 people being read with the
   * authority of one over 300.
   */
  rateDenominators: {
    businessOwnership: number;
    unemployment: number;
    youthEmployment: number;
    gpi: number;
  };
  lgaDensity: FrequencyBucket[];
  lastUpdated: string;
  keyFindings?: string[];
}

export interface PublicTrendDataPoint {
  date: string;
  count: number | null;
}

export interface EmploymentTrendPoint {
  week: string;
  employed: number | null;
  unemployedSeeking: number | null;
  temporarilyAbsent: number | null;
  other: number | null;
}

export interface PublicTrendsData {
  dailyRegistrations: PublicTrendDataPoint[];
  employmentByWeek: EmploymentTrendPoint[];
  totalDays: number;
  lastUpdated: string;
}

// --- Cross-Tabulation (Story 8.6) ---

export enum CrossTabDimension {
  GENDER = 'gender',
  AGE_BAND = 'ageBand',
  EDUCATION = 'education',
  LGA = 'lga',
  EMPLOYMENT_TYPE = 'employmentType',
  MARITAL_STATUS = 'maritalStatus',
  HOUSING = 'housing',
  DISABILITY = 'disability',
}

export enum CrossTabMeasure {
  COUNT = 'count',
  ROW_PCT = 'rowPct',
  COL_PCT = 'colPct',
  TOTAL_PCT = 'totalPct',
}

export interface CrossTabResult {
  rowLabels: string[];
  colLabels: string[];
  cells: (number | null)[][];
  totalN: number;
  anySuppressed: boolean;
  belowThreshold?: boolean;
  currentN?: number;
  requiredN?: number;
}

export interface CrossTabQuery {
  rowDim: CrossTabDimension;
  colDim: CrossTabDimension;
  measure?: CrossTabMeasure;
}

// --- Inferential Insights (Story 8.7) ---

export interface ChiSquareResult {
  hypothesis: string;
  chiSq: number;
  df: number;
  pValue: number; // exact if implemented, or -1 for bracket-only
  pBracket: string; // '< 0.005' | '< 0.01' | '< 0.05' | '>= 0.05'
  cramersV: number;
  effectLabel: 'negligible' | 'small' | 'medium' | 'large';
  interpretation: string;
  significant: boolean;
}

export interface CorrelationResult {
  hypothesis: string;
  coefficient: number;
  pValue: number;
  pBracket: string;
  method: 'spearman' | 'pearson';
  interpretation: string;
  significant: boolean;
}

export interface GroupComparisonResult {
  hypothesis: string;
  statistic: number;
  pValue: number;
  pBracket: string;
  method: 'mann-whitney' | 'kruskal-wallis';
  groupMedians: Record<string, number>;
  interpretation: string;
  significant: boolean;
}

export interface ProportionCI {
  metric: string;
  estimate: number;
  ci95Lower: number;
  ci95Upper: number;
  n: number;
  interpretation: string;
}

export interface EnrollmentForecast {
  dailyRate: number;
  currentN: number;
  nextThresholdN: number;
  nextThresholdLabel: string;
  projectedDate: string | null; // ISO date, null if rate <= 0
  interpretation: string;
}

export type ThresholdStatus = {
  met: boolean;
  currentN: number;
  requiredN: number;
};

export interface InferentialInsightsData {
  chiSquare: ChiSquareResult[];
  correlations: CorrelationResult[];
  groupComparisons: GroupComparisonResult[];
  proportionCIs: ProportionCI[];
  forecast: EnrollmentForecast | null;
  thresholds: {
    chiSquare: ThresholdStatus;
    correlations: ThresholdStatus;
    groupComparisons: ThresholdStatus;
    proportionCIs: ThresholdStatus;
    forecast: ThresholdStatus;
  };
}

export interface ActivationFeature {
  id: string;
  label: string;
  requiredN: number;
  currentN: number;
  met: boolean;
  phase: number;
  category: 'active' | 'approaching' | 'dormant';
}

export interface ActivationStatusData {
  /**
   * The answer-bearing RESPONDENT count the feature gates are measured against.
   *
   * ⚠️ Renamed from `totalSubmissions` by Story 12-6, together with the query
   * behind it. The features gated here are the statistics in
   * `getInferentialInsights`, which count people — so a submission-grained gate
   * published a different n for the same threshold than the statistic it
   * gated. Keeping the old name over the new number would have been the exact
   * mislabel Epic 12 exists to remove.
   */
  totalRespondents: number;
  features: ActivationFeature[];
}

export interface ExtendedEquityData {
  disabilityGap: {
    disabledEmployedRate: number;
    nonDisabledEmployedRate: number;
    gap: number;
    disabledCI: { lower: number; upper: number };
    nonDisabledCI: { lower: number; upper: number };
  } | null;
  educationAlignment: {
    alignedPct: number;
    overQualifiedPct: number;
    underQualifiedPct: number;
    n: number;
  } | null;
  giniCoefficient: {
    value: number;
    interpretation: string;
    lgaCount: number;
  } | null;
  thresholds: {
    disabilityGap: ThresholdStatus;
    educationAlignment: ThresholdStatus;
    giniCoefficient: ThresholdStatus;
  };
}

// --- Skills Inventory (Story 8.6) ---

export interface SkillsInventoryData {
  allSkills: SkillsFrequency[];
  byCategory: { category: string; totalCount: number; skills: SkillsFrequency[] }[];
  byLga: { lgaId: string; lgaName: string; topSkills: { skill: string; count: number }[] }[] | null;
  gapAnalysis: { skill: string; haveCount: number; wantCount: number }[] | null;
  diversityIndex: { lgaId: string; lgaName: string; index: number; skillCount: number }[] | null;
  thresholds: {
    allSkills: { met: boolean; currentN: number; requiredN: number };
    byCategory: { met: boolean; currentN: number; requiredN: number };
    byLga: { met: boolean; currentN: number; requiredN: number };
    gapAnalysis: { met: boolean; currentN: number; requiredN: number };
    diversityIndex: { met: boolean; currentN: number; requiredN: number };
  };
}

// --- Story 8.8: Inter-Enumerator Reliability ---

export interface EnumeratorDistribution {
  enumeratorId: string;
  enumeratorName: string;
  submissionCount: number;
  distributions: {
    question: string;
    answers: { label: string; count: number; proportion: number }[];
  }[];
}

export interface ReliabilityPair {
  enumeratorA: string;
  enumeratorB: string;
  divergenceScores: { question: string; jsDivergence: number }[];
  avgDivergence: number;
  flag: 'normal' | 'amber' | 'red';
  interpretation: string;
}

export interface EnumeratorReliabilityData {
  enumerators: EnumeratorDistribution[];
  pairs: ReliabilityPair[];
  threshold: ThresholdStatus;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Story 12-6 — the Data-Health view
 * ══════════════════════════════════════════════════════════════════════════ */

/** One questionnaire field's response rate among the answer-bearing cohort. */
export interface DataHealthField {
  /** The form schema's question name (the `raw_data` key). */
  key: string;
  /** The form schema's human label for that question. */
  label: string;
  /** Answer-bearing respondents who answered THIS question. */
  answeredCount: number;
  /**
   * `answeredCount / withAnswers`, as a percentage to 1dp.
   *
   * ⚠️ The denominator is the answers-present cohort, NOT the registry total: a
   * `data_lost` / `no_submission` respondent cannot answer a field, so including
   * them would deflate every field uniformly and mislead. Always render this
   * beside {@link DataHealthData.withAnswers}.
   */
  responseRate: number;
}

/**
 * One recoverable respondent in the `data_lost` cohort.
 *
 * ⚠️ PII BOUNDARY: every field here is already exposed by the existing registry
 * table and the unified export under the SAME roles (super-admin + government
 * official). This is deliberately the existing projection, not a new wider one —
 * a recovery list is a reason to reuse a projection, never to mint one.
 */
export interface DataHealthRecoveryRow {
  respondentId: string;
  referenceCode: string | null;
  fullName: string | null;
  lgaId: string | null;
  lgaName: string | null;
  /** ISO-8601. When the person was registered. */
  registeredAt: string | null;
  phoneNumber: string | null;
}

/** The `data_lost` recovery cohort: the count, plus one bounded page of it. */
export interface DataHealthRecoveryCohort {
  /**
   * The whole cohort's size, from 12-4's `byDataStatus.data_lost` — NOT
   * `rows.length`, which is one bounded page. A drill that reported its page
   * size as the cohort size would understate the recoverable population.
   */
  total: number;
  rows: DataHealthRecoveryRow[];
  /** The page bound applied to `rows`, so the UI can say "showing N of total". */
  limit: number;
  offset: number;
}

/**
 * The Data-Health view's own aggregate (Story 12-6).
 *
 * ⚠️ Deliberately does NOT carry the funnel or the per-`data_status` breakdown.
 * Those come from {@link RegistryTotals} (12-4), which the tab already fetches —
 * re-serving them here would be a second count of the registry, which is the
 * whole class of defect Epic 12 exists to close.
 */
export interface DataHealthData {
  /** The per-field denominator, from 12-4's `getRegistryTotals().withAnswers`. */
  withAnswers: number;
  /** The form whose schema supplied the field list + labels. */
  formId: string | null;
  formTitle: string | null;
  /** Ascending by `responseRate` — the most under-answered questions first. */
  fields: DataHealthField[];
  recoveryCohort: DataHealthRecoveryCohort;
}
