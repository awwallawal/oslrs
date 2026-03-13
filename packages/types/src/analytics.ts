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
}

export interface SkillsFrequency {
  skill: string;
  count: number;
  percentage: number;
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
  businessOwnershipRate: number | null;
  businessRegistrationRate: number | null;
  apprenticeTotal: number | null;
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
}

// --- Public Insights ---

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
  totalRegistered: number;
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
  lgaDensity: FrequencyBucket[];
  lastUpdated: string;
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
