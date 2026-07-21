import { describe, it, expect } from 'vitest';
import {
  assertWithinLimit,
  assertBeforeDeadline,
  countLines,
  ParseLimitExceededError,
  ParseDeadlineExceededError,
} from '../parse-limits.js';

describe('parse-limits (Story 11-2 code-review M1)', () => {
  describe('assertWithinLimit', () => {
    it('passes at or below the limit', () => {
      expect(() => assertWithinLimit(0, 5, 'rows')).not.toThrow();
      expect(() => assertWithinLimit(5, 5, 'rows')).not.toThrow();
    });
    it('throws a ParseLimitExceededError above the limit', () => {
      expect(() => assertWithinLimit(6, 5, 'rows')).toThrow(ParseLimitExceededError);
      try {
        assertWithinLimit(6, 5, 'rows');
      } catch (err) {
        expect((err as { code?: string }).code).toBe('PARSE_LIMIT_EXCEEDED');
      }
    });
  });

  describe('assertBeforeDeadline', () => {
    it('no-ops when deadline is undefined or in the future', () => {
      expect(() => assertBeforeDeadline(undefined, 'pdf')).not.toThrow();
      expect(() => assertBeforeDeadline(Date.now() + 60_000, 'pdf')).not.toThrow();
    });
    it('throws a ParseDeadlineExceededError once the deadline has passed', () => {
      expect(() => assertBeforeDeadline(Date.now() - 1, 'pdf')).toThrow(ParseDeadlineExceededError);
      try {
        assertBeforeDeadline(Date.now() - 1, 'pdf');
      } catch (err) {
        expect((err as { code?: string }).code).toBe('PARSE_DEADLINE_EXCEEDED');
      }
    });
  });

  describe('countLines', () => {
    it('counts physical lines (no trailing newline)', () => {
      expect(countLines('')).toBe(0);
      expect(countLines('a')).toBe(1);
      expect(countLines('a\nb\nc')).toBe(3);
      expect(countLines('a\nb\n')).toBe(3); // trailing newline → empty final line counted
    });
  });
});
