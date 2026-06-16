import { describe, it, expect } from 'vitest';
import {
  normalizeRawDataKeys,
  CANONICAL_KEY_GROUPS,
} from '../registry-key-normalization.js';

describe('normalizeRawDataKeys', () => {
  it('propagates a legacy `dob` value to `date_of_birth` (and vice-versa)', () => {
    expect(normalizeRawDataKeys({ dob: '1990-01-01' })).toMatchObject({
      dob: '1990-01-01',
      date_of_birth: '1990-01-01',
    });
    expect(normalizeRawDataKeys({ date_of_birth: '1985-05-05' })).toMatchObject({
      dob: '1985-05-05',
      date_of_birth: '1985-05-05',
    });
  });

  it('collapses the firstname/surname variants so the schema column resolves either spelling', () => {
    const out = normalizeRawDataKeys({ firstname: 'Ade', surname: 'Johnson' });
    expect(out.first_name).toBe('Ade');
    expect(out.firstName).toBe('Ade');
    expect(out.last_name).toBe('Johnson');
    expect(out.lastName).toBe('Johnson');
  });

  it('honours first-non-empty preference order within a group', () => {
    // first_name is preferred over its later variants when both present
    const out = normalizeRawDataKeys({ first_name: 'Canonical', firstname: 'Legacy' });
    expect(out.first_name).toBe('Canonical');
    expect(out.firstName).toBe('Canonical');
    expect(out.firstname).toBe('Legacy'); // already non-empty → left untouched
  });

  it('treats empty string and null as absent when resolving', () => {
    const out = normalizeRawDataKeys({ first_name: '', firstName: '', firstname: 'Fallback' });
    expect(out.first_name).toBe('Fallback');
    expect(out.firstName).toBe('Fallback');
  });

  it('normalizes the GPS coordinate variants', () => {
    const out = normalizeRawDataKeys({ _gpsLatitude: '7.37', _gpsLongitude: '3.94' });
    expect(out.gps_latitude).toBe('7.37');
    expect(out.gps_longitude).toBe('3.94');
  });

  it('leaves a group entirely untouched when no variant is present', () => {
    const out = normalizeRawDataKeys({ employment_status: 'employed' });
    expect(out).not.toHaveProperty('date_of_birth');
    expect(out).not.toHaveProperty('first_name');
    expect(out.employment_status).toBe('employed');
  });

  it('passes through keys outside every canonical group untouched', () => {
    const out = normalizeRawDataKeys({ main_occupation: 'carpentry', skills_possessed: 'a b' });
    expect(out.main_occupation).toBe('carpentry');
    expect(out.skills_possessed).toBe('a b');
  });

  it('does not mutate the input object', () => {
    const input = { dob: '2000-01-01' };
    const out = normalizeRawDataKeys(input);
    expect(input).toEqual({ dob: '2000-01-01' });
    expect(out).not.toBe(input);
  });

  it('every group lists at least two spellings (else it would not need normalizing)', () => {
    for (const [, variants] of Object.entries(CANONICAL_KEY_GROUPS)) {
      expect(variants.length).toBeGreaterThanOrEqual(2);
    }
  });
});
