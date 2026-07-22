import { describe, it, expect } from 'vitest';
import {
  buildCompletenessInput,
  validateSubmissionCompleteness,
  validateMinorGuardianConsent,
} from '../form-submission-validation.service.js';
import type { FlattenedForm } from '../native-form.service.js';
import { AppError } from '@oslsr/utils';

function makeForm(overrides: Partial<FlattenedForm> = {}): FlattenedForm {
  return {
    formId: 'form-1',
    title: 'Test',
    version: '1.0.0',
    questions: [
      { id: 'q1', type: 'text', name: 'nin', label: 'NIN', required: true, sectionId: 's1', sectionTitle: 'S1' },
      { id: 'q2', type: 'text', name: 'occupation', label: 'Occupation', required: true, sectionId: 's1', sectionTitle: 'S1' },
    ],
    choiceLists: {},
    sectionShowWhen: {},
    calculations: [],
    ...overrides,
  };
}

/** Story 13-34 — a pinned form carrying a REQUIRED geopoint (the prod shape). */
function formWithRequiredGeopoint(): FlattenedForm {
  return makeForm({
    questions: [
      { id: 'q1', type: 'text', name: 'occupation', label: 'Occupation', required: true, sectionId: 's1', sectionTitle: 'S1' },
      { id: 'q2', type: 'geopoint', name: 'gps_location', label: 'GPS', required: true, sectionId: 's1', sectionTitle: 'S1' },
    ],
  });
}

describe('buildCompletenessInput', () => {
  it('excludes NIN-mapped questions when pendingNin is set', () => {
    const input = buildCompletenessInput(makeForm(), { pendingNin: true });
    expect(input.excludeNames?.has('nin')).toBe(true);
    expect(input.excludeNames?.has('occupation')).toBe(false);
  });

  it('does not exclude NIN when not pending', () => {
    const input = buildCompletenessInput(makeForm(), { pendingNin: false });
    expect(input.excludeNames?.has('nin')).toBe(false);
  });

  it('merges caller-provided extra excludes', () => {
    const input = buildCompletenessInput(makeForm(), { extraExcludeNames: ['occupation'] });
    expect(input.excludeNames?.has('occupation')).toBe(true);
  });

  // Story 13-34 AC2 (code-review H1) — the public renderer suppresses geopoint;
  // the authoritative gate must agree or it 422s over an invisible field.
  it('excludes geopoint questions when excludeGeopoint is set (public paths)', () => {
    const input = buildCompletenessInput(formWithRequiredGeopoint(), { excludeGeopoint: true });
    expect(input.excludeNames?.has('gps_location')).toBe(true);
    expect(input.excludeNames?.has('occupation')).toBe(false);
  });

  it('KEEPS geopoint required by default (clerk/enumerator submitForm still captures field GPS)', () => {
    const input = buildCompletenessInput(formWithRequiredGeopoint());
    expect(input.excludeNames?.has('gps_location')).toBe(false);
  });
});

describe('validateSubmissionCompleteness', () => {
  it('passes a complete submission and returns computed fields', () => {
    const form = makeForm({
      questions: [{ id: 'q', type: 'date', name: 'dob', label: 'DOB', required: true, sectionId: 's1', sectionTitle: 'S1' }],
      calculations: [{ name: 'age', expression: 'int((today() - ${dob}) div 365.25)' }],
    });
    const { computed } = validateSubmissionCompleteness(form, { dob: '1984-06-06' });
    expect(typeof computed.age).toBe('number');
  });

  it('AC1.4 — recomputes the AUTHORITATIVE age deterministically via the injected clock', () => {
    // Review fix M1: the clock is now injectable, so the canonical
    // dob=1984-06-06 / today=2026-06-12 → age=42 case is assertable at the
    // SERVER persist layer, not only in the utils unit test.
    const form = makeForm({
      questions: [{ id: 'q', type: 'date', name: 'dob', label: 'DOB', required: true, sectionId: 's1', sectionTitle: 'S1' }],
      calculations: [{ name: 'age', expression: 'int((today() - ${dob}) div 365.25)' }],
    });
    const { computed } = validateSubmissionCompleteness(
      form,
      { dob: '1984-06-06' },
      { today: new Date('2026-06-12T00:00:00.000Z') },
    );
    expect(computed.age).toBe(42);
  });

  it('throws INCOMPLETE_SUBMISSION (422) naming missing fields', () => {
    expect(() => validateSubmissionCompleteness(makeForm(), { nin: '12345678901' })).toThrow(AppError);
    try {
      validateSubmissionCompleteness(makeForm(), { nin: '12345678901' });
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('INCOMPLETE_SUBMISSION');
      expect((err as AppError).statusCode).toBe(422);
      expect((err as AppError).details?.fields).toEqual(['occupation']);
    }
  });

  it('does not require the NIN question on the pending-NIN path', () => {
    const res = validateSubmissionCompleteness(makeForm(), { occupation: 'tailor' }, { pendingNin: true });
    expect(res.computed).toEqual({});
  });

  // Story 13-34 AC2 (code-review H1) — a required geopoint would otherwise HARD
  // BLOCK public registration: the wizard suppresses the question, so the
  // respondent can never supply it.
  it('accepts a public submission with an unanswered REQUIRED geopoint when excludeGeopoint is set', () => {
    expect(() =>
      validateSubmissionCompleteness(
        formWithRequiredGeopoint(),
        { occupation: 'tailor' },
        { excludeGeopoint: true },
      ),
    ).not.toThrow();
  });

  it('still rejects the same submission on a NON-public path (geopoint enforced)', () => {
    expect(() =>
      validateSubmissionCompleteness(formWithRequiredGeopoint(), { occupation: 'tailor' }),
    ).toThrow(AppError);
  });
});

describe('validateMinorGuardianConsent (Story 9-55)', () => {
  const completeGuardian = {
    guardian_name: 'Adunni Okafor',
    guardian_relationship: 'parent',
    guardian_phone: '08031234567',
    guardian_consent: 'yes',
    is_supervised_apprentice: 'yes',
  };

  it('passes (not applicable) for an adult age', () => {
    const res = validateMinorGuardianConsent({}, 30);
    expect(res.applicable).toBe(false);
    expect(res.guardian).toBeNull();
  });

  it('passes (not applicable) when age is unknown — no guardian PII demanded', () => {
    expect(() => validateMinorGuardianConsent({}, null)).not.toThrow();
  });

  it('accepts a complete minor guardian path and returns the guardian to persist', () => {
    const res = validateMinorGuardianConsent(completeGuardian, 13);
    expect(res.applicable).toBe(true);
    expect(res.complete).toBe(true);
    expect(res.guardian).toMatchObject({ name: 'Adunni Okafor', consent: 'yes', isSupervisedApprentice: 'yes' });
  });

  it('throws MINOR_GUARDIAN_CONSENT_REQUIRED (422) naming missing guardian fields', () => {
    try {
      validateMinorGuardianConsent({ is_supervised_apprentice: 'yes' }, 9);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('MINOR_GUARDIAN_CONSENT_REQUIRED');
      expect((err as AppError).statusCode).toBe(422);
      expect((err as AppError).details?.fields).toEqual(
        expect.arrayContaining(['guardian_name', 'guardian_relationship', 'guardian_phone', 'guardian_consent']),
      );
    }
  });

  it('rejects a minor whose guardian declined consent (consent !== yes)', () => {
    expect(() =>
      validateMinorGuardianConsent({ ...completeGuardian, guardian_consent: 'no' }, 14),
    ).toThrow(AppError);
  });

  it('a forged ≥15 age cannot be used — gate keys on the passed (server) age, not raw answers', () => {
    // Even if the answers carried no guardian data, passing age 8 (the server
    // recompute) makes the gate fire. A client cannot dodge by omitting age.
    expect(() => validateMinorGuardianConsent({}, 8)).toThrow(AppError);
  });
});
