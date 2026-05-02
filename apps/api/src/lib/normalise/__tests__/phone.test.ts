import { describe, it, expect } from 'vitest';
import { normaliseNigerianPhone } from '../phone.js';

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
});
