import { describe, it, expect } from 'vitest';
import {
  buildCompletenessInput,
  validateSubmissionCompleteness,
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
});
