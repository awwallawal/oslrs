import { describe, it, expect } from 'vitest';
import { normaliseEmail } from '../email.js';

describe('normaliseEmail', () => {
  it('lowercases and trims a clean address with no warnings', () => {
    const result = normaliseEmail('  Awwal@Example.COM  ');
    expect(result.value).toBe('awwal@example.com');
    expect(result.warnings).toEqual([]);
  });

  it('flags suspected typo from curated dictionary', () => {
    const result = normaliseEmail('user@gmail.vom');
    expect(result.value).toBe('user@gmail.vom');
    expect(result.warnings).toContain('suspected_typo:gmail.vom->gmail.com');
  });

  it('flags multiple curated typos (gmial, yahooo)', () => {
    const r1 = normaliseEmail('a@gmial.com');
    expect(r1.warnings).toContain('suspected_typo:gmial.com->gmail.com');
    const r2 = normaliseEmail('b@yahooo.com');
    expect(r2.warnings).toContain('suspected_typo:yahooo.com->yahoo.com');
  });

  it('warns on missing TLD', () => {
    const result = normaliseEmail('foo@bar');
    expect(result.warnings).toContain('missing_tld');
  });

  it('rejects input with no @ as invalid_format', () => {
    const result = normaliseEmail('not-an-email');
    expect(result.warnings).toEqual(['invalid_format']);
  });

  it('rejects input with @ at boundary as invalid_format', () => {
    expect(normaliseEmail('@x.com').warnings).toContain('invalid_format');
    expect(normaliseEmail('user@').warnings).toContain('invalid_format');
  });

  it('returns empty_input for empty / whitespace / non-string', () => {
    expect(normaliseEmail('').warnings).toEqual(['empty_input']);
    expect(normaliseEmail('   ').warnings).toEqual(['empty_input']);
    expect(normaliseEmail(null).warnings).toEqual(['empty_input']);
    expect(normaliseEmail(undefined).warnings).toEqual(['empty_input']);
  });

  it('preserves the local part case-folded but does not mangle plus-addressing', () => {
    const result = normaliseEmail('User+tag@Example.com');
    expect(result.value).toBe('user+tag@example.com');
    expect(result.warnings).toEqual([]);
  });

  it('handles multiple @ by treating the last as the separator', () => {
    // RFC-5321 quoted local-parts can contain @, but for our purposes
    // splitting on the last @ is the safest practical choice.
    const result = normaliseEmail('weird@local@example.com');
    expect(result.value).toBe('weird@local@example.com');
    expect(result.warnings).toEqual([]);
  });
});
