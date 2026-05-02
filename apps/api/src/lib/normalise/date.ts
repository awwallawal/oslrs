/**
 * Date normaliser.
 *
 * Parses common date string formats into a UTC `Date`. Defaults to DMY
 * (Nigerian convention). The `auto` mode infers format from component
 * magnitudes; ambiguous DMY/MDY inputs (both day and month ≤ 12) are
 * resolved as DMY but emit a warning so admin review is possible.
 *
 * Accepted separators: `/`, `-`, `.`, whitespace.
 * ISO-8601 `YYYY-MM-DD` is fast-pathed regardless of `format` argument.
 *
 * Two-digit years are expanded heuristically: > 50 → 19xx, ≤ 50 → 20xx
 * (with `two_digit_year_expanded` warning).
 *
 * Warning codes:
 *   - empty_input
 *   - unparseable_format        (not 3 numeric parts, not ISO)
 *   - non_numeric_components
 *   - invalid_iso_date
 *   - invalid_month:<N>
 *   - invalid_day:<N>
 *   - invalid_date_components   (e.g. Feb 30 → roundtrip mismatch)
 *   - ambiguous_date            (auto mode, day≤12 ∧ month≤12; defaulted to DMY)
 *   - two_digit_year_expanded
 */

import type { NormaliseDateResult } from './types.js';

export type DateFormat = 'DMY' | 'MDY' | 'YMD' | 'auto';

export function normaliseDate(
  input: unknown,
  format: DateFormat = 'DMY',
): NormaliseDateResult {
  if (typeof input !== 'string' || input.trim() === '') {
    return { value: null, warnings: ['empty_input'] };
  }

  const trimmed = input.trim();

  // Fast-path ISO-8601 YYYY-MM-DD.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) {
      return { value: null, warnings: ['invalid_iso_date'] };
    }
    // Roundtrip-validate (catches 2026-02-30 etc.).
    const [y, m, day] = trimmed.split('-').map(Number);
    if (
      d.getUTCFullYear() !== y ||
      d.getUTCMonth() !== m - 1 ||
      d.getUTCDate() !== day
    ) {
      return { value: null, warnings: ['invalid_date_components'] };
    }
    return { value: d, warnings: [] };
  }

  // Whitespace is a deliberate separator alongside `/`, `-`, `.` so inputs
  // like "01 02 2026" parse the same as "01/02/2026". Inputs with trailing
  // text ("01/02/2026 (DOB)") split into >3 parts → unparseable_format.
  // F8 (code-review 2026-05-02): documented the whitespace-as-separator
  // intent so a future maintainer doesn't mistake it for a bug and remove `\s`.
  const parts = trimmed.split(/[/\-.\s]+/).filter(Boolean);
  if (parts.length !== 3) {
    return { value: null, warnings: ['unparseable_format'] };
  }

  const nums = parts.map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n))) {
    return { value: null, warnings: ['non_numeric_components'] };
  }

  const warnings: string[] = [];
  let effectiveFormat: 'DMY' | 'MDY' | 'YMD' = format === 'auto' ? 'DMY' : format;

  if (format === 'auto') {
    if (nums[0] > 31) {
      effectiveFormat = 'YMD';
    } else if (nums[2] > 31) {
      // Last component is the year; first vs middle is D-vs-M.
      if (nums[1] > 12) {
        // Middle > 12 must be the day (so first is month → MDY).
        effectiveFormat = 'MDY';
      } else if (nums[0] > 12) {
        // First > 12 must be the day → DMY.
        effectiveFormat = 'DMY';
      } else {
        // Both ≤ 12 → genuinely ambiguous; default to DMY (Nigerian convention).
        warnings.push('ambiguous_date');
        effectiveFormat = 'DMY';
      }
    } else if (nums[0] <= 12 && nums[1] <= 12) {
      warnings.push('ambiguous_date');
      effectiveFormat = 'DMY';
    } else if (nums[0] > 12) {
      effectiveFormat = 'DMY';
    } else {
      effectiveFormat = 'MDY';
    }
  }

  let day: number;
  let month: number;
  let year: number;
  switch (effectiveFormat) {
    case 'DMY':
      [day, month, year] = nums;
      break;
    case 'MDY':
      [month, day, year] = nums;
      break;
    case 'YMD':
      [year, month, day] = nums;
      break;
  }

  if (year < 100) {
    year = year > 50 ? 1900 + year : 2000 + year;
    warnings.push('two_digit_year_expanded');
  }

  if (month < 1 || month > 12) {
    warnings.push(`invalid_month:${month}`);
    return { value: null, warnings };
  }
  if (day < 1 || day > 31) {
    warnings.push(`invalid_day:${day}`);
    return { value: null, warnings };
  }

  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    warnings.push('invalid_date_components');
    return { value: null, warnings };
  }

  return { value: d, warnings };
}
