/**
 * Full-name normaliser.
 *
 * Trims, collapses internal whitespace, and applies title casing while
 * preserving compound surnames separated by hyphens (e.g. `adeyemi-bolade`
 * → `Adeyemi-Bolade`). Apostrophes and accented characters pass through
 * unchanged after the casing fold.
 *
 * Casing strategy: lowercase the whole word first, then upper-case the first
 * code-unit of each hyphen-separated part. This produces predictable output
 * for inputs like `JOHN DOE` → `John Doe`, `john doe` → `John Doe`, and
 * `Jean-Baptiste` → `Jean-Baptiste`.
 *
 * Warning codes:
 *   - empty_input
 *   - all_caps           (input was all upper-case with ≥3 letters)
 *   - single_word        (no internal whitespace — likely missing surname)
 */

import type { NormaliseResult } from './types.js';

export function normaliseFullName(input: unknown): NormaliseResult {
  if (typeof input !== 'string' || input.trim() === '') {
    return { value: '', warnings: ['empty_input'] };
  }

  const collapsed = input.trim().replace(/\s+/g, ' ');
  const warnings: string[] = [];

  if (
    collapsed === collapsed.toUpperCase() &&
    /[A-Z]{3,}/.test(collapsed)
  ) {
    warnings.push('all_caps');
  }

  if (!collapsed.includes(' ')) {
    warnings.push('single_word');
  }

  const titled = collapsed
    .split(' ')
    .map((word) =>
      word
        .split('-')
        .map((part) =>
          part === '' ? '' : part[0].toUpperCase() + part.slice(1).toLowerCase(),
        )
        .join('-'),
    )
    .join(' ');

  return { value: titled, warnings };
}
