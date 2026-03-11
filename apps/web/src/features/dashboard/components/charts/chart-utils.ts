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
