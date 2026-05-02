import { describe, it, expect } from 'vitest';
import {
  NormalisedEmailSchema,
  NigerianPhoneSchema,
  NormalisedNameSchema,
  NormalisedDateSchema,
  NormalisedTradeSchema,
} from '../normalised.js';

describe('NormalisedEmailSchema', () => {
  it('lowercases + trims + validates a clean address', () => {
    expect(NormalisedEmailSchema.parse('  Foo@Bar.COM  ')).toBe('foo@bar.com');
  });

  it('rejects an input with no @ as invalid', () => {
    const r = NormalisedEmailSchema.safeParse('not-an-email');
    expect(r.success).toBe(false);
  });
});

describe('NigerianPhoneSchema', () => {
  it.each([
    ['08012345678', '+2348012345678'],
    ['+2348012345678', '+2348012345678'],
    ['234 801 234 5678', '+2348012345678'],
    ['+234-801-234-5678', '+2348012345678'],
    ['09112345678', '+2349112345678'],
  ])('canonicalises %s to %s', (input, expected) => {
    expect(NigerianPhoneSchema.parse(input)).toBe(expected);
  });

  it('rejects too-short input', () => {
    expect(NigerianPhoneSchema.safeParse('080123').success).toBe(false);
  });

  it('rejects unknown mobile prefix', () => {
    expect(NigerianPhoneSchema.safeParse('05012345678').success).toBe(false);
  });
});

describe('NormalisedNameSchema', () => {
  it('title-cases + collapses whitespace', () => {
    expect(NormalisedNameSchema.parse('  john   doe  ')).toBe('John Doe');
  });

  it('preserves hyphenated compound surnames', () => {
    expect(NormalisedNameSchema.parse('jean-baptiste adeyemi-bolade')).toBe(
      'Jean-Baptiste Adeyemi-Bolade',
    );
  });

  it('rejects empty / whitespace-only input', () => {
    expect(NormalisedNameSchema.safeParse('').success).toBe(false);
    expect(NormalisedNameSchema.safeParse('   ').success).toBe(false);
  });
});

describe('NormalisedDateSchema', () => {
  it('passes through ISO YYYY-MM-DD', () => {
    expect(NormalisedDateSchema.parse('2026-04-25')).toBe('2026-04-25');
  });

  it('canonicalises DMY (Nigerian convention) to ISO', () => {
    expect(NormalisedDateSchema.parse('25/04/2026')).toBe('2026-04-25');
    expect(NormalisedDateSchema.parse('25-04-2026')).toBe('2026-04-25');
    expect(NormalisedDateSchema.parse('25.4.2026')).toBe('2026-04-25');
  });

  it('rejects invalid date components (Feb 30)', () => {
    expect(NormalisedDateSchema.safeParse('30/02/2026').success).toBe(false);
  });

  it('rejects unparseable input', () => {
    expect(NormalisedDateSchema.safeParse('foobar').success).toBe(false);
  });

  it('expands 2-digit years (DMY)', () => {
    expect(NormalisedDateSchema.parse('25/04/26')).toBe('2026-04-25');
    expect(NormalisedDateSchema.parse('25/04/85')).toBe('1985-04-25');
  });
});

describe('NormalisedTradeSchema', () => {
  it('lowercases + trims + collapses whitespace', () => {
    expect(NormalisedTradeSchema.parse('  Plumbing   Services  ')).toBe(
      'plumbing services',
    );
  });

  it('rejects empty input', () => {
    expect(NormalisedTradeSchema.safeParse('').success).toBe(false);
  });
});
