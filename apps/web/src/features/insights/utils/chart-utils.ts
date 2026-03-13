/** Shared chart utilities for insights components */

/** OSLRS brand chart color palette */
export const CHART_COLORS = ['#9C1E23', '#2563EB', '#059669', '#D97706', '#7C3AED', '#718096'];

/** Convert snake_case labels to Title Case for chart display */
export function formatLabel(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
