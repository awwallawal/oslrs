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

// --- Public Insights ---

export interface PublicInsightsData {
  totalRegistered: number;
  lgasCovered: number;
  genderSplit: FrequencyBucket[];
  ageDistribution: FrequencyBucket[];
  topSkills: SkillsFrequency[];
  employmentBreakdown: FrequencyBucket[];
  formalInformalRatio: FrequencyBucket[];
  businessOwnershipRate: number | null;
  unemploymentEstimate: number | null;
  youthEmploymentRate: number | null;
  gpi: number | null;
  lgaDensity: FrequencyBucket[];
}
