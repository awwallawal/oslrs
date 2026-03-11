/**
 * Equity Data Derivation
 *
 * Story 8.2: Extracts equity-focused metrics from marginal frequency distributions.
 * Shared by SurveyAnalyticsPage and OfficialStatsPage to keep derivation logic
 * out of the EquityMetrics presentation component.
 */

import type {
  DemographicStats,
  EmploymentStats,
  RegistrySummary,
  FrequencyBucket,
  EquityData,
} from '@oslsr/types';

/** Find a bucket by case-insensitive label match. */
function findBucket(buckets: FrequencyBucket[] | undefined, label: string): FrequencyBucket | undefined {
  return buckets?.find((b) => b.label.toLowerCase() === label.toLowerCase());
}

/**
 * Compute Gender Parity Index: femaleCount / maleCount.
 * Returns null if either bucket is missing, suppressed, or zero.
 */
function computeGpi(genderDistribution: FrequencyBucket[] | undefined): number | null {
  if (!genderDistribution) return null;

  const femaleBucket = findBucket(genderDistribution, 'female');
  const maleBucket = findBucket(genderDistribution, 'male');

  if (!femaleBucket || !maleBucket) return null;
  if (femaleBucket.suppressed || maleBucket.suppressed) return null;
  if (femaleBucket.count == null || maleBucket.count == null) return null;
  if (maleBucket.count === 0) return null;

  return femaleBucket.count / maleBucket.count;
}

/**
 * Extract informal sector percentage from formalInformalRatio buckets.
 * Returns null if bucket is missing or suppressed.
 */
function computeInformalPct(formalInformalRatio: FrequencyBucket[] | undefined): number | null {
  if (!formalInformalRatio) return null;

  const informalBucket = findBucket(formalInformalRatio, 'informal');
  if (!informalBucket) return null;
  if (informalBucket.suppressed) return null;
  if (informalBucket.percentage == null) return null;

  return informalBucket.percentage;
}

/**
 * Derive equity data from raw analytics responses.
 * Returns undefined if no source data is available at all.
 */
export function deriveEquityData(
  demographics: DemographicStats | undefined,
  employment: EmploymentStats | undefined,
  registrySummary: RegistrySummary | undefined,
): EquityData | undefined {
  // If none of the sources are available, return undefined (still loading or no data)
  if (!demographics && !employment && !registrySummary) return undefined;

  return {
    gpiRatio: computeGpi(demographics?.genderDistribution),
    employmentRatePct: registrySummary?.employedPct ?? null,
    informalSectorPct: computeInformalPct(employment?.formalInformalRatio),
  };
}
