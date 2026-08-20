/**
 * Shared Chart Utilities
 *
 * Extracted from DemographicCharts, EmploymentCharts, HouseholdCharts to
 * eliminate duplication of color palettes, suppression constants, and
 * bucket helper functions.
 */

import type { FrequencyBucket } from '@oslsr/types';

// ---------------------------------------------------------------------------
// Color palette (maroon brand gradient + neutral grays)
// ---------------------------------------------------------------------------

export const CHART_COLORS = [
  '#9C1E23', '#7A171B', '#B4383D', '#CC5257', '#D97B7E',
  '#E8A1A3', '#F0C0C2', '#4A5568', '#718096', '#A0AEC0',
];

// ---------------------------------------------------------------------------
// Suppression constants
// ---------------------------------------------------------------------------

export const SUPPRESSED_COLOR = '#D1D5DB';
export const SUPPRESSED_LABEL = '< 5';
export const SUPPRESSED_TOOLTIP = 'Suppressed: fewer than 5 responses';

// ---------------------------------------------------------------------------
// Bucket helpers
// ---------------------------------------------------------------------------

/** Return display-safe count: 0 for suppressed buckets, otherwise the real count. */
export function safeCount(bucket: FrequencyBucket): number {
  return bucket.suppressed ? 0 : (bucket.count ?? 0);
}

/**
 * The denominator a bucket chart was actually counted over — Story 12-5 (AC4).
 *
 * Sums the NON-SUPPRESSED buckets, which is precisely the population the chart
 * draws and its percentages divide by. Suppressed buckets contribute 0 because
 * their counts are withheld (<5), so including them would state a total the
 * chart cannot show the parts of.
 *
 * ⚠️ Each chart's N is its own. Gender-answered, age-answered and
 * employment-answered are different populations, and all three differ from the
 * registry total — a chart over a question only 70 people answered shows 70.
 * Do not normalise these to a single house number.
 */
export function bucketTotal(buckets: FrequencyBucket[]): number {
  return buckets.reduce((sum, b) => sum + safeCount(b), 0);
}

/** Return the fill color for a bucket, respecting suppression. */
export function bucketColor(bucket: FrequencyBucket, index: number): string {
  return bucket.suppressed ? SUPPRESSED_COLOR : CHART_COLORS[index % CHART_COLORS.length];
}

/** Format a label for display (replace underscores, title-case). */
export function formatLabel(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Map FrequencyBucket[] to display-safe objects with displayCount and displayLabel. */
export function prepareBuckets(buckets: FrequencyBucket[]) {
  return buckets.map((b) => ({
    ...b,
    displayCount: safeCount(b),
    displayLabel: b.suppressed ? SUPPRESSED_LABEL : formatLabel(b.label),
  }));
}
