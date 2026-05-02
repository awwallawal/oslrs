import { describe, it, expect } from 'vitest';
import { normaliseDate } from '../date.js';

describe('normaliseDate', () => {
  describe('ISO-8601 fast path', () => {
    it('parses YYYY-MM-DD as UTC midnight', () => {
      const result = normaliseDate('2026-04-25');
      expect(result.value?.toISOString()).toBe('2026-04-25T00:00:00.000Z');
      expect(result.warnings).toEqual([]);
    });

    it('rejects roundtrip-invalid ISO date (Feb 30)', () => {
      const result = normaliseDate('2026-02-30');
      expect(result.value).toBeNull();
      expect(result.warnings).toContain('invalid_date_components');
    });
  });

  describe('DMY default (Nigerian convention)', () => {
    it('parses 25/04/2026 as April 25, 2026', () => {
      const result = normaliseDate('25/04/2026');
      expect(result.value?.toISOString()).toBe('2026-04-25T00:00:00.000Z');
      expect(result.warnings).toEqual([]);
    });

    it('parses 25-04-2026 with dashes', () => {
      const result = normaliseDate('25-04-2026');
      expect(result.value?.toISOString()).toBe('2026-04-25T00:00:00.000Z');
    });

    it('parses 25.04.2026 with dots', () => {
      const result = normaliseDate('25.04.2026');
      expect(result.value?.toISOString()).toBe('2026-04-25T00:00:00.000Z');
    });
  });

  describe('explicit MDY format', () => {
    it('parses 04/25/2026 as April 25, 2026', () => {
      const result = normaliseDate('04/25/2026', 'MDY');
      expect(result.value?.toISOString()).toBe('2026-04-25T00:00:00.000Z');
    });
  });

  describe('explicit YMD format', () => {
    it('parses 2026/04/25 as April 25, 2026', () => {
      const result = normaliseDate('2026/04/25', 'YMD');
      expect(result.value?.toISOString()).toBe('2026-04-25T00:00:00.000Z');
    });
  });

  describe('auto mode', () => {
    it('infers YMD when first component > 31', () => {
      const result = normaliseDate('2026/04/25', 'auto');
      expect(result.value?.toISOString()).toBe('2026-04-25T00:00:00.000Z');
    });

    it('infers DMY when last component > 31 and middle ≤ 12', () => {
      const result = normaliseDate('25/04/2026', 'auto');
      expect(result.value?.toISOString()).toBe('2026-04-25T00:00:00.000Z');
      expect(result.warnings).not.toContain('ambiguous_date');
    });

    it('infers MDY when middle > 12', () => {
      // Middle component 25 > 12 means middle is the day; first is the month.
      const result = normaliseDate('04/25/2026', 'auto');
      expect(result.value?.toISOString()).toBe('2026-04-25T00:00:00.000Z');
    });

    it('warns ambiguous_date when day and month both ≤ 12 in auto mode', () => {
      const result = normaliseDate('01/02/2026', 'auto');
      expect(result.value?.toISOString()).toBe('2026-02-01T00:00:00.000Z'); // DMY default
      expect(result.warnings).toContain('ambiguous_date');
    });
  });

  describe('two-digit year handling', () => {
    it('expands 2-digit year > 50 → 1900s', () => {
      const result = normaliseDate('25/04/85');
      expect(result.value?.getUTCFullYear()).toBe(1985);
      expect(result.warnings).toContain('two_digit_year_expanded');
    });

    it('expands 2-digit year ≤ 50 → 2000s', () => {
      const result = normaliseDate('25/04/26');
      expect(result.value?.getUTCFullYear()).toBe(2026);
      expect(result.warnings).toContain('two_digit_year_expanded');
    });
  });

  describe('validation failures', () => {
    it('rejects invalid month (e.g. 13)', () => {
      const result = normaliseDate('25/13/2026');
      expect(result.value).toBeNull();
      expect(result.warnings.some((w) => w.startsWith('invalid_month'))).toBe(true);
    });

    it('rejects invalid day (e.g. 32)', () => {
      const result = normaliseDate('32/04/2026');
      expect(result.value).toBeNull();
      expect(result.warnings.some((w) => w.startsWith('invalid_day'))).toBe(true);
    });

    it('rejects roundtrip-invalid date (Feb 30 in DMY)', () => {
      const result = normaliseDate('30/02/2026');
      expect(result.value).toBeNull();
      expect(result.warnings).toContain('invalid_date_components');
    });

    it('rejects input that lacks 3 parts as unparseable_format', () => {
      const result = normaliseDate('foobar');
      expect(result.value).toBeNull();
      expect(result.warnings).toContain('unparseable_format');
    });

    it('rejects 3-part non-numeric input as non_numeric_components', () => {
      // "not-a-date" splits into 3 parts on the dash separator, so it passes
      // the parts.length check and then fails on numeric parsing.
      const result = normaliseDate('not-a-date');
      expect(result.value).toBeNull();
      expect(result.warnings).toContain('non_numeric_components');
    });

    it('rejects non-numeric components', () => {
      const result = normaliseDate('25/Apr/2026');
      expect(result.value).toBeNull();
      expect(result.warnings).toContain('non_numeric_components');
    });
  });

  describe('edge cases', () => {
    it('returns empty_input for empty / whitespace / non-string', () => {
      expect(normaliseDate('').warnings).toEqual(['empty_input']);
      expect(normaliseDate('   ').warnings).toEqual(['empty_input']);
      expect(normaliseDate(null).warnings).toEqual(['empty_input']);
      expect(normaliseDate(undefined).warnings).toEqual(['empty_input']);
    });
  });
});
