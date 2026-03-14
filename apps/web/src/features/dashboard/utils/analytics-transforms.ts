import type { FrequencyBucket } from '@oslsr/types';

/** Transform FrequencyBucket[] (from demographics lgaDistribution) to choropleth map data */
export function lgaDistributionToMapData(
  distribution: FrequencyBucket[] | undefined,
): { lgaName: string; value: number }[] {
  if (!distribution) return [];
  return distribution
    .filter((b) => b.count != null && !b.suppressed)
    .map((b) => ({ lgaName: b.label, value: b.count! }));
}
