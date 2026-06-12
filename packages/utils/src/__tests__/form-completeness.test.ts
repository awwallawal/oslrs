import { describe, it, expect } from 'vitest';
import { findMissingRequiredAnswers, type CompletenessInput } from '../form-completeness.js';

// The rule is now PURE GATING (Story 9-54 L2) — it receives an answer map that
// the caller has ALREADY merged with computed (`calculate`) fields, so these
// tests pass `age` directly rather than evaluating it. The calc-evaluation +
// rule composition is covered end-to-end in xlsform-calculate.test.ts and the
// API form-submission-validation.service.test.ts.
const baseInput: CompletenessInput = {
  questions: [
    { name: 'consent_basic', required: true, sectionId: 's-general' },
    { name: 'dob', required: true, sectionId: 's-identity' },
    { name: 'surname', required: true, sectionId: 's-identity' },
    { name: 'employment_status', required: true, sectionId: 's-labor' },
    { name: 'monthly_income', required: false, sectionId: 's-labor' },
  ],
  sectionShowWhen: {
    's-identity': { field: 'consent_basic', operator: 'equals', value: 'yes' },
    's-labor': { field: 'age', operator: 'greater_or_equal', value: 15 },
  },
};

describe('findMissingRequiredAnswers', () => {
  it('passes a complete, fully-relevant submission', () => {
    const evalData = {
      consent_basic: 'yes',
      dob: '1984-06-06',
      surname: 'Lawal',
      employment_status: 'employed',
      age: 42, // computed; gates s-labor on
    };
    expect(findMissingRequiredAnswers(baseInput, evalData)).toEqual({
      complete: true,
      missing: [],
    });
  });

  it('flags a missing required answer in a relevant section', () => {
    const evalData = { consent_basic: 'yes', dob: '1984-06-06', employment_status: 'employed', age: 42 };
    const res = findMissingRequiredAnswers(baseInput, evalData);
    expect(res.complete).toBe(false);
    expect(res.missing).toEqual(['surname']);
  });

  it('does NOT require questions in a section gated off by consent', () => {
    // consent_basic = 'no' hides identity; with no dob, age is incomputable so it
    // is absent from the map and the labour gate (age >= 15) is also off.
    const evalData = { consent_basic: 'no' };
    expect(findMissingRequiredAnswers(baseInput, evalData)).toEqual({
      complete: true,
      missing: [],
    });
  });

  it('does NOT require labour questions for a respondent under the age gate', () => {
    const evalData = {
      consent_basic: 'yes',
      dob: '2014-01-01',
      surname: 'Junior',
      age: 12, // below the 15 floor → grp_labor hidden
    };
    // employment_status (labour) must NOT be required
    expect(findMissingRequiredAnswers(baseInput, evalData)).toEqual({
      complete: true,
      missing: [],
    });
  });

  it('DOES require labour questions once age >= 15', () => {
    const evalData = { consent_basic: 'yes', dob: '2000-01-01', surname: 'Adult', age: 26 };
    const res = findMissingRequiredAnswers(baseInput, evalData);
    expect(res.complete).toBe(false);
    expect(res.missing).toEqual(['employment_status']);
  });

  it('honours excludeNames (pending-NIN / wizard-prefilled fields)', () => {
    const input: CompletenessInput = {
      questions: [
        { name: 'nin', required: true, sectionId: 's' },
        { name: 'occupation', required: true, sectionId: 's' },
      ],
      excludeNames: new Set(['nin']),
    };
    const res = findMissingRequiredAnswers(input, { occupation: 'tailor' });
    expect(res.complete).toBe(true);
    expect(res.missing).toEqual([]);
  });

  it('treats empty string and empty array as unanswered', () => {
    const input: CompletenessInput = {
      questions: [
        { name: 'a', required: true },
        { name: 'b', required: true },
      ],
    };
    const res = findMissingRequiredAnswers(input, { a: '', b: [] });
    expect(res.missing).toEqual(['a', 'b']);
  });

  it('ignores optional questions entirely', () => {
    const input: CompletenessInput = { questions: [{ name: 'note', required: false }] };
    expect(findMissingRequiredAnswers(input, {}).complete).toBe(true);
  });
});
