import type { FrequencyBucket } from '@oslsr/types';

/** A choropleth datum. `banded` = present but below the k-anon floor (Story 13-33 AC3). */
export interface ChoroplethDatum {
  lgaName: string;
  value: number;
  banded?: boolean;
}

/**
 * Transform FrequencyBucket[] (from demographics/insights lgaDistribution) to
 * choropleth map data. Story 13-33 AC3: a `banded` bucket (present, 1–9, exact
 * count withheld) is INCLUDED with `banded: true` and `value: 0` so the map can
 * render a "present" shade instead of dropping it to blank. Exact buckets carry
 * their real `value`. Absent LGAs aren't emitted by the backend GROUP BY, so
 * they're simply not in the array (→ blank on the map). A legacy suppressed
 * bucket that is NOT banded is still excluded.
 */
export function lgaDistributionToMapData(
  distribution: FrequencyBucket[] | undefined,
): ChoroplethDatum[] {
  if (!distribution) return [];
  return distribution
    .filter((b) => (b.count != null && !b.suppressed) || b.banded)
    .map((b) =>
      b.banded
        ? { lgaName: b.label, value: 0, banded: true }
        : { lgaName: b.label, value: b.count!, banded: false },
    );
}
