import { describe, it, expect } from 'vitest';
import {
  generateReferenceCode,
  isValidReferenceCode,
  REFERENCE_CODE_ALPHABET,
  REFERENCE_CODE_REGEX,
} from '../reference-code.js';

describe('reference-code (Story 9-58)', () => {
  describe('generateReferenceCode', () => {
    it('produces the canonical OSL-<YYYY>-<6 chars> shape', () => {
      const code = generateReferenceCode(2026);
      expect(code).toMatch(/^OSL-2026-.{6}$/);
      expect(isValidReferenceCode(code)).toBe(true);
    });

    it('never emits the ambiguous characters I, L, O, U', () => {
      const ambiguous = /[ILOU]/;
      for (let i = 0; i < 2000; i++) {
        const suffix = generateReferenceCode(2026).split('-')[2];
        expect(suffix).not.toMatch(ambiguous);
        // every char is from the Crockford alphabet
        for (const ch of suffix) {
          expect(REFERENCE_CODE_ALPHABET).toContain(ch);
        }
      }
    });

    it('is overwhelmingly unique across many generations', () => {
      const seen = new Set<string>();
      let collisions = 0;
      const N = 5000;
      for (let i = 0; i < N; i++) {
        const code = generateReferenceCode(2026);
        if (seen.has(code)) collisions++;
        seen.add(code);
      }
      // 32^6 keyspace (~1.07e9): the birthday-paradox EXPECTED collision count at
      // 5k samples is ~0.012, so a single collision is rare-but-possible. Asserting
      // exactly-zero was flaky (it tripped CI ~1%/run). Assert the actual PROPERTY —
      // overwhelmingly unique — which tolerates the occasional birthday collision
      // while still failing hard on a broken (non-random) generator.
      expect(seen.size).toBeGreaterThan(N * 0.999);
      expect(collisions).toBeLessThan(N * 0.001);
    });

    it('rejects a non-4-digit year', () => {
      expect(() => generateReferenceCode(26)).toThrow();
      expect(() => generateReferenceCode(20260)).toThrow();
    });
  });

  describe('isValidReferenceCode', () => {
    it('accepts a well-formed code', () => {
      expect(isValidReferenceCode('OSL-2026-7F3K9Q')).toBe(true);
    });

    it('rejects codes containing ambiguous characters', () => {
      expect(isValidReferenceCode('OSL-2026-IIIIII')).toBe(false);
      expect(isValidReferenceCode('OSL-2026-LLLLLL')).toBe(false);
      expect(isValidReferenceCode('OSL-2026-OOOOOO')).toBe(false);
      expect(isValidReferenceCode('OSL-2026-UUUUUU')).toBe(false);
    });

    it('rejects malformed shapes', () => {
      expect(isValidReferenceCode('osl-2026-7f3k9q')).toBe(false); // lowercase
      expect(isValidReferenceCode('OSL-2026-7F3K9')).toBe(false); // 5 chars
      expect(isValidReferenceCode('OSL-26-7F3K9Q')).toBe(false); // 2-digit year
      expect(isValidReferenceCode('7F3K9Q')).toBe(false); // no prefix
      expect(isValidReferenceCode('')).toBe(false);
    });

    it('REFERENCE_CODE_REGEX is anchored', () => {
      expect(REFERENCE_CODE_REGEX.test('prefix OSL-2026-7F3K9Q suffix')).toBe(false);
    });
  });
});
