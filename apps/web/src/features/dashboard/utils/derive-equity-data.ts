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
 * Sum the non-suppressed counts of a bucket set — the population the metric
 * derived from it was actually computed over. Returns null when there is no
 * source data, so an absent denominator is never reported as 0.
 *
 * `labels`, when given, restricts the sum to those buckets. Use it whenever a
 * metric consumes only PART of a distribution.
 */
function bucketSum(
  buckets: FrequencyBucket[] | undefined,
  labels?: readonly string[],
): number | null {
  if (!buckets) return null;
  const relevant = labels
    ? buckets.filter((b) => labels.some((l) => l.toLowerCase() === b.label.toLowerCase()))
    : buckets;
  return relevant.reduce((sum, b) => sum + (b.suppressed ? 0 : (b.count ?? 0)), 0);
}

/**
 * The only two buckets the GPI is computed from.
 *
 * The GPI is female ÷ male. Summing the WHOLE gender distribution would publish
 * a base larger than the ratio was taken over the moment an "Other" or "Prefer
 * not to say" bucket exists — an n that is not the metric's n, which is the
 * defect this story exists to end, committed by the fix for it.
 */
const GPI_BUCKETS = ['female', 'male'] as const;

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

  const gpiRatio = computeGpi(demographics?.genderDistribution);
  const employmentRatePct = registrySummary?.employedPct ?? null;
  const informalSectorPct = computeInformalPct(employment?.formalInformalRatio);

  return {
    gpiRatio,
    employmentRatePct,
    informalSectorPct,
    // Story 12-5 AC4 — each metric's OWN denominator, paired with the metric it
    // produced. Null when the metric is null, so we never publish a base for a
    // figure that is not on screen.
    denominators: {
      gpi: gpiRatio == null ? null : bucketSum(demographics?.genderDistribution, GPI_BUCKETS),
      employmentRate: employmentRatePct == null ? null : (registrySummary?.totalRespondents ?? null),
      informalSector: informalSectorPct == null ? null : bucketSum(employment?.formalInformalRatio),
    },
  };
}
