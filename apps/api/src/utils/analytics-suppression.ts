import type { FrequencyBucket } from '@oslsr/types';

/**
 * Suppress buckets with fewer than minN observations to prevent de-identification.
 * Sets count and percentage to null and marks suppressed: true.
 */
export function suppressSmallBuckets(
  buckets: FrequencyBucket[],
  minN: number = 5,
): FrequencyBucket[] {
  return buckets.map((bucket) => {
    if (bucket.count !== null && bucket.count < minN) {
      return { label: bucket.label, count: null, percentage: null, suppressed: true };
    }
    return bucket;
  });
}

/**
 * Suppress a single numeric value if it falls below the minimum threshold.
 */
export function suppressIfTooFew(value: number, minN: number = 5): number | null {
  return value < minN ? null : value;
}

/**
 * Convert raw SQL rows ({ label, count }) into FrequencyBucket[] with percentages.
 */
export function toBuckets(rows: Array<{ label: string; count: string | number }>, total: number): FrequencyBucket[] {
  return rows.map((r) => {
    const count = Number(r.count);
    return {
      label: String(r.label || 'Unknown'),
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    };
  });
}
