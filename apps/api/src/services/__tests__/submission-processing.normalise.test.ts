import { describe, it, expect } from 'vitest';
import { normaliseRespondentPii } from '../submission-processing.service.js';

const baseInput = {
  nin: '12345678901',
  consentMarketplace: false,
  consentEnriched: false,
};

describe('normaliseRespondentPii (submission-processing wiring)', () => {
  it('passes through clean canonical inputs with no metadata', () => {
    const { canonical, metadata } = normaliseRespondentPii({
      ...baseInput,
      firstName: 'John',
      lastName: 'Doe',
      phoneNumber: '+2348012345678',
      dateOfBirth: '2000-04-25',
    });

    expect(canonical.firstName).toBe('John');
    expect(canonical.lastName).toBe('Doe');
    expect(canonical.phoneNumber).toBe('+2348012345678');
    expect(canonical.dateOfBirth).toBe('2000-04-25');
    expect(metadata).toBeNull();
  });

  it('canonicalises non-canonical phone format', () => {
    const { canonical, metadata } = normaliseRespondentPii({
      ...baseInput,
      phoneNumber: '0801 234 5678',
    });
    expect(canonical.phoneNumber).toBe('+2348012345678');
    expect(metadata).toBeNull();
  });

  it('title-cases names that arrive ALL CAPS and surfaces warning in metadata', () => {
    const { canonical, metadata } = normaliseRespondentPii({
      ...baseInput,
      firstName: 'JOHN',
      lastName: 'DOE',
    });
    expect(canonical.firstName).toBe('John');
    expect(canonical.lastName).toBe('Doe');
    // `single_word` is suppressed for firstName/lastName columns by design;
    // only the meaningful `all_caps` warning surfaces.
    expect(metadata?.normalisation_warnings).toEqual(
      expect.arrayContaining(['first_name:all_caps', 'last_name:all_caps']),
    );
    expect(metadata?.normalisation_warnings).not.toContain('first_name:single_word');
    expect(metadata?.normalisation_warnings).not.toContain('last_name:single_word');
  });

  it('canonicalises DMY date to ISO YYYY-MM-DD', () => {
    const { canonical } = normaliseRespondentPii({
      ...baseInput,
      dateOfBirth: '25/04/2000',
    });
    expect(canonical.dateOfBirth).toBe('2000-04-25');
  });

  it('preserves the raw DOB and warns when normalisation fails', () => {
    const { canonical, metadata } = normaliseRespondentPii({
      ...baseInput,
      dateOfBirth: 'not-a-date',
    });
    expect(canonical.dateOfBirth).toBe('not-a-date');
    expect(metadata?.normalisation_warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^date_of_birth:/),
      ]),
    );
  });

  it('aggregates warnings from multiple fields with field-prefix codes', () => {
    const { metadata } = normaliseRespondentPii({
      ...baseInput,
      firstName: 'JOHN',
      phoneNumber: '+2345012345678', // unknown mobile prefix
    });
    expect(metadata?.normalisation_warnings).toEqual(
      expect.arrayContaining([
        'first_name:all_caps',
        'phone_number:unknown_mobile_prefix:50',
      ]),
    );
  });

  it('returns no metadata when only the NIN is provided', () => {
    const { canonical, metadata } = normaliseRespondentPii(baseInput);
    expect(canonical.firstName).toBeNull();
    expect(metadata).toBeNull();
  });
});
