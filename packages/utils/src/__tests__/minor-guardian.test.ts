import { describe, it, expect } from 'vitest';
import {
  MINOR_AGE_FLOOR,
  GUARDIAN_QUESTION_NAMES,
  isMinorAge,
  evaluateMinorGuardianConsent,
} from '../minor-guardian.js';

const G = GUARDIAN_QUESTION_NAMES;

const completeGuardianAnswers = {
  [G.name]: 'Adunni Okafor',
  [G.relationship]: 'parent',
  [G.phone]: '08031234567',
  [G.consent]: 'yes',
  [G.isApprentice]: 'yes',
  [G.apprenticeshipDetails]: 'Tailoring apprentice under Mrs. Bello',
};

describe('MINOR_AGE_FLOOR', () => {
  it('is the ILO C138 general minimum working age (15)', () => {
    expect(MINOR_AGE_FLOOR).toBe(15);
  });
});

describe('isMinorAge', () => {
  it('treats a known age below 15 as a minor', () => {
    expect(isMinorAge(14)).toBe(true);
    expect(isMinorAge(0)).toBe(true);
  });

  it('treats 15 and above as NOT a minor (floor is inclusive of 15)', () => {
    expect(isMinorAge(15)).toBe(false);
    expect(isMinorAge(42)).toBe(false);
  });

  it('treats unknown / non-finite age as NOT a minor (data-minimisation default)', () => {
    expect(isMinorAge(null)).toBe(false);
    expect(isMinorAge(undefined)).toBe(false);
    expect(isMinorAge(NaN)).toBe(false);
    expect(isMinorAge(Infinity)).toBe(false);
  });
});

describe('evaluateMinorGuardianConsent', () => {
  it('is not applicable for an adult — guardian answers ignored', () => {
    const result = evaluateMinorGuardianConsent({}, 30);
    expect(result).toEqual({ applicable: false, complete: true, missing: [], guardian: null });
  });

  it('is not applicable when age is unknown (no dob → no guardian PII requested)', () => {
    const result = evaluateMinorGuardianConsent({}, null);
    expect(result.applicable).toBe(false);
    expect(result.complete).toBe(true);
    expect(result.guardian).toBeNull();
  });

  it('does NOT exclude a minor — routes to the guardian path and accepts a complete one', () => {
    const result = evaluateMinorGuardianConsent(completeGuardianAnswers, 13);
    expect(result.applicable).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.guardian).toEqual({
      name: 'Adunni Okafor',
      relationship: 'parent',
      phone: '08031234567',
      consent: 'yes',
      isSupervisedApprentice: 'yes',
      apprenticeshipDetails: 'Tailoring apprentice under Mrs. Bello',
    });
  });

  it('accepts the ILO Art.6 carve-out attestation answered "no" without excluding', () => {
    const result = evaluateMinorGuardianConsent(
      { ...completeGuardianAnswers, [G.isApprentice]: 'no', [G.apprenticeshipDetails]: '' },
      10,
    );
    expect(result.complete).toBe(true);
    expect(result.guardian?.isSupervisedApprentice).toBe('no');
    expect(result.guardian?.apprenticeshipDetails).toBeUndefined();
  });

  it('rejects a minor submission missing guardian identity fields', () => {
    const result = evaluateMinorGuardianConsent(
      { [G.consent]: 'yes', [G.isApprentice]: 'yes' },
      9,
    );
    expect(result.applicable).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.guardian).toBeNull();
    expect(result.missing).toEqual(
      expect.arrayContaining([G.name, G.relationship, G.phone]),
    );
  });

  it('requires AFFIRMATIVE consent — a "no" guardian_consent is rejected (not merely "answered")', () => {
    const result = evaluateMinorGuardianConsent(
      { ...completeGuardianAnswers, [G.consent]: 'no' },
      14,
    );
    expect(result.complete).toBe(false);
    expect(result.missing).toContain(G.consent);
  });

  it('requires the apprenticeship attestation to be answered (yes or no)', () => {
    const { [G.isApprentice]: _omit, ...withoutAttestation } = completeGuardianAnswers;
    const result = evaluateMinorGuardianConsent(withoutAttestation, 12);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain(G.isApprentice);
  });

  it('coerces non-string answer values safely', () => {
    const result = evaluateMinorGuardianConsent(
      {
        [G.name]: '  Bola  ',
        [G.relationship]: 'legal_guardian',
        [G.phone]: 8031234567,
        [G.consent]: 'YES',
        [G.isApprentice]: 'NO',
      },
      8,
    );
    expect(result.complete).toBe(true);
    expect(result.guardian).toMatchObject({
      name: 'Bola',
      phone: '8031234567',
      consent: 'yes',
      isSupervisedApprentice: 'no',
    });
  });
});
