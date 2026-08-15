import { describe, it, expect } from 'vitest';
import {
  normaliseNigerianPhone,
  isStorableNigerianPhone,
  RESPONDENT_PHONE_CONSTRAINT,
} from '../phone.js';

describe('normaliseNigerianPhone', () => {
  it('canonicalises a local trunk-prefixed number to E.164', () => {
    const result = normaliseNigerianPhone('08012345678');
    expect(result.value).toBe('+2348012345678');
    expect(result.warnings).toEqual([]);
  });

  it('passes through an already-E.164 number', () => {
    const result = normaliseNigerianPhone('+2348012345678');
    expect(result.value).toBe('+2348012345678');
    expect(result.warnings).toEqual([]);
  });

  it('canonicalises a country-coded number without leading +', () => {
    const result = normaliseNigerianPhone('2348012345678');
    expect(result.value).toBe('+2348012345678');
    expect(result.warnings).toEqual([]);
  });

  it('strips spaces, dashes, and parentheses', () => {
    expect(normaliseNigerianPhone('234 801 234 5678').value).toBe('+2348012345678');
    expect(normaliseNigerianPhone('+234-801-234-5678').value).toBe('+2348012345678');
    expect(normaliseNigerianPhone('(0) 801 234 5678').value).toBe('+2348012345678');
  });

  it('accepts all known mobile prefixes (70, 80, 81, 90, 91)', () => {
    for (const prefix of ['070', '080', '081', '090', '091']) {
      const local = `${prefix}12345678`;
      const result = normaliseNigerianPhone(local);
      expect(result.value).toBe(`+234${local.slice(1)}`);
      expect(result.warnings).toEqual([]);
    }
  });

  /**
   * Story 13-57 AC1.2 — the country code and the local trunk zero are BOTH
   * written by real people, together. `+234 08120004038` is Rosemary's number
   * exactly as she typed it on 2026-08-04: it derived an 11-digit NSN, tripped
   * `wrong_length`, and the raw string went on to be rejected by
   * `respondents.phone_number`'s CHECK. The digits were never ambiguous — the
   * normaliser simply had no branch for the redundant trunk zero.
   *
   * Only the COUNTRY-CODE branches strip it. A bare `00812…` is not a Nigerian
   * local format (a leading `00` is an international dialling prefix), so the
   * `0` branch keeps its single-strip behaviour and lands in `wrong_length`
   * where it belongs.
   */
  describe('AC1.2 — a trunk zero after the country code', () => {
    it('drops the redundant trunk zero after +234', () => {
      const result = normaliseNigerianPhone('+234 08120004038');
      expect(result.value).toBe('+2348120004038');
      expect(result.warnings).toEqual([]);
    });

    it('drops the redundant trunk zero after a bare 234', () => {
      const result = normaliseNigerianPhone('234 07051286580');
      expect(result.value).toBe('+2347051286580');
      expect(result.warnings).toEqual([]);
    });

    it('resolves every written form of one number to a single E.164 value', () => {
      const forms = [
        '07051286580',
        '+2347051286580',
        '2347051286580',
        '+234 07051286580',
        '234 070 5128 6580',
        '+234-0705-128-6580',
      ];
      for (const form of forms) {
        const result = normaliseNigerianPhone(form);
        expect(result.value, `input: ${form}`).toBe('+2347051286580');
        expect(result.warnings, `input: ${form}`).toEqual([]);
      }
    });

    it('still reports wrong_length for a leading 00 (not a Nigerian local format)', () => {
      const result = normaliseNigerianPhone('008120004038');
      expect(result.warnings.some((w) => w.startsWith('wrong_length:'))).toBe(true);
    });
  });

  it('canonicalises but warns on unknown mobile prefix', () => {
    const result = normaliseNigerianPhone('+2345012345678'); // 50 prefix unknown
    expect(result.value).toBe('+2345012345678');
    expect(result.warnings).toContain('unknown_mobile_prefix:50');
  });

  it('warns on wrong length when leading 0', () => {
    const result = normaliseNigerianPhone('080123456'); // 9 digits after 0
    expect(result.warnings.some((w) => w.startsWith('wrong_length:'))).toBe(true);
  });

  it('returns unknown_format when no recognised prefix', () => {
    const result = normaliseNigerianPhone('12345678901');
    expect(result.warnings).toEqual(['unknown_format']);
  });

  it('returns non_numeric on letter contamination after stripping cosmetics', () => {
    const result = normaliseNigerianPhone('+234abc12345678');
    expect(result.warnings).toContain('non_numeric');
  });

  it('returns empty_input for empty / whitespace / non-string', () => {
    expect(normaliseNigerianPhone('').warnings).toEqual(['empty_input']);
    expect(normaliseNigerianPhone('   ').warnings).toEqual(['empty_input']);
    expect(normaliseNigerianPhone(null).warnings).toEqual(['empty_input']);
    expect(normaliseNigerianPhone(undefined).warnings).toEqual(['empty_input']);
  });

  /**
   * ⭐ CODE REVIEW 2026-08-14 (H3) — `''` IS NOT `null`, AND THE COLUMN KNOWS IT.
   *
   * `isStorableNigerianPhone` used to answer TRUE for the empty string, on the
   * reasoning that `respondents.phone_number` is nullable. But a caller holding
   * `''` writes `''`, not `NULL`, and the CHECK is
   * `phone_number IS NULL OR phone_number ~ '^\+234\d{10}$'`. Probed against the
   * real database, that insert returns
   * `23514 chk_respondents_phone_number_e164` — this story's own incident,
   * walking through this story's own guard.
   *
   * The route in was `submitWizardSchema`'s `phone: z.string().min(10)`: ten
   * spaces is a well-formed body, and it normalises to `''`.
   *
   * ⛔ NEUTER-CHECK: delete the `''` case and the second assertion here reds.
   */
  describe('isStorableNigerianPhone — the CHECK constraint, restated in code', () => {
    it('accepts a canonical number and null (the column is nullable)', () => {
      expect(isStorableNigerianPhone('+2348120004038')).toBe(true);
      expect(isStorableNigerianPhone(null)).toBe(true);
      expect(isStorableNigerianPhone(undefined)).toBe(true);
    });

    it('REFUSES the empty string — a caller holding it writes it, not NULL', () => {
      expect(isStorableNigerianPhone('')).toBe(false);
      // The path that produced it: ten spaces passes `z.string().min(10)`.
      expect(isStorableNigerianPhone(normaliseNigerianPhone('          ').value)).toBe(false);
    });

    it('refuses everything else the CHECK would refuse', () => {
      expect(isStorableNigerianPhone('+234 08120004038')).toBe(false); // raw, unstripped
      expect(isStorableNigerianPhone('08120004038')).toBe(false); // local, un-canonicalised
      expect(isStorableNigerianPhone('+23481200040385')).toBe(false); // one digit too many
    });

    it('accepts an unknown mobile prefix — a warning is not a verdict on storability', () => {
      // A guard written against the WARNING LIST would reject this and lock out
      // every new prefix the NCC ever issues. The regex is the authority.
      const r = normaliseNigerianPhone('+2345012345678');
      expect(r.warnings).toContain('unknown_mobile_prefix:50');
      expect(isStorableNigerianPhone(r.value)).toBe(true);
    });

    it('names the constraint it restates, so a failure can quote it (AC2.2)', () => {
      expect(RESPONDENT_PHONE_CONSTRAINT).toBe('chk_respondents_phone_number_e164');
    });
  });
});
