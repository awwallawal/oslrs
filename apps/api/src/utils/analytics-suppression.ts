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
 * Banded disclosure (Story 13-33 AC3) — the honest alternative to blank
 * suppression for a PUBLIC map/list where absence and small-but-present are
 * different facts:
 *   - `count >= minN`  → keep the EXACT count (graduated, `banded: false`).
 *   - `0 < count < minN` → PRESENT but banded: `count`/`percentage` nulled (the
 *     exact small number never leaves the server — k-anonymity floor preserved),
 *     `suppressed: true`, `banded: true`. Downstream renders a "present /
 *     fewer than N" state rather than dropping the bucket to blank.
 *   - `count === 0` never appears here (absent buckets aren't emitted by the
 *     GROUP BY), so the map leaves them blank.
 *
 * The k-anonymity disclosure control on EXACT numbers is retained; only the
 * binary blank-vs-count is replaced with blank / present / count. This is the
 * single authority — consumers must NOT re-suppress on top of it.
 */
export function bandSmallBuckets(
  buckets: FrequencyBucket[],
  minN: number = 10,
): FrequencyBucket[] {
  return buckets.map((bucket) => {
    // A pre-nulled bucket (already suppressed upstream) is passed through
    // untouched — stamping `banded: false` onto a `count: null` bucket would
    // produce an incoherent {suppressed:true, banded:false, count:null} state
    // (13-33 review M2). The density path feeds raw non-null counts, so this
    // only guards reuse of this shared primitive by other callers.
    if (bucket.count === null) {
      return bucket;
    }
    if (bucket.count < minN) {
      return { label: bucket.label, count: null, percentage: null, suppressed: true, banded: true };
    }
    return { ...bucket, banded: false };
  });
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
