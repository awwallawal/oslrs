/**
 * Story 13-29 — section-step relevance derivation (the two-pass-loop fix).
 *
 * Pins the invariant that broke in Dry-run #2: auto-skip must evaluate section
 * visibility against the SAME calculated-field-augmented answer map the Review
 * completeness gate uses. A section gated on a calculated field (`grp_labor` /
 * `${age} >= 15`, `age` from `dob`) must:
 *   - appear in the forward pass once `dob` makes `age >= 15` (NOT skipped), and
 *   - still be skipped for an under-15 registrant (`age < 15`).
 * The final `describe` asserts skippability never contradicts completeness — the
 * precise asymmetry (raw vs calc-augmented) that produced the bounce-back loop.
 */

import { describe, it, expect } from 'vitest';
import type { Calculation } from '@oslsr/types';
import { isSectionStepSkippable } from '../section-relevance';
import { deriveReviewCompleteness } from '../review-completeness';
import type { FlattenedForm } from '../../../forms/api/form.api';
import type { WizardDraftData } from '../../api/wizard.api';

// Fixed clock so the age-based branch is deterministic (matches 9-54/9-55 tests).
const TODAY = new Date('2026-07-11T00:00:00Z');

const AGE_CALC: Calculation = { name: 'age', expression: 'int((today() - ${dob}) div 365.25)' };

/** Two sections: demographics (holds `dob`) + grp_labor (gated on `${age} >= 15`). */
function calcGatedForm(): FlattenedForm {
  return {
    formId: 'f-labor',
    title: 'Public Core',
    version: '1.0.0',
    questions: [
      { id: 'q-dob', type: 'date', name: 'dob', label: 'Date of birth', required: true, sectionId: 'grp_demo', sectionTitle: 'About you' },
      { id: 'q-occ', type: 'text', name: 'main_occupation', label: 'Main occupation', required: true, sectionId: 'grp_labor', sectionTitle: 'Your work' },
      { id: 'q-emp', type: 'text', name: 'employment_type', label: 'Employment type', required: true, sectionId: 'grp_labor', sectionTitle: 'Your work' },
    ],
    choiceLists: {},
    sectionShowWhen: {
      grp_labor: { field: 'age', operator: 'greater_or_equal', value: 15 },
    },
    calculations: [AGE_CALC],
  };
}

describe('isSectionStepSkippable (Story 13-29)', () => {
  it('is never skippable when there is no form', () => {
    expect(isSectionStepSkippable(null, 'grp_labor', {}, TODAY)).toBe(false);
  });

  it('is never skippable for a head/review step (no sectionId)', () => {
    expect(isSectionStepSkippable(calcGatedForm(), undefined, {}, TODAY)).toBe(false);
  });

  it('an ungated section with questions is not skippable', () => {
    expect(isSectionStepSkippable(calcGatedForm(), 'grp_demo', {}, TODAY)).toBe(false);
  });

  it('CORE FIX: a calc-gated section is NOT skipped once dob makes age >= 15 (one forward pass)', () => {
    const form = calcGatedForm();
    // Adult: born 1990 → age ~36. Section relevance ${age} >= 15 is true.
    const responses = { dob: '1990-05-01' };
    expect(isSectionStepSkippable(form, 'grp_labor', responses, TODAY)).toBe(false);
  });

  it('AC4: the same calc-gated section IS still skipped for an under-15 registrant', () => {
    const form = calcGatedForm();
    // Child: born 2015 → age ~11. Section relevance ${age} >= 15 is false → hidden.
    const responses = { dob: '2015-05-01' };
    expect(isSectionStepSkippable(form, 'grp_labor', responses, TODAY)).toBe(true);
  });

  it('is skipped while dob is still unanswered (age not yet computable) — but so is the requirement', () => {
    const form = calcGatedForm();
    expect(isSectionStepSkippable(form, 'grp_labor', {}, TODAY)).toBe(true);
  });

  it('regression: question-level showWhen still gates a no-calc form (parity with 9-18)', () => {
    const form: FlattenedForm = {
      formId: 'f-q',
      title: 'Survey',
      version: '1.0.0',
      questions: [
        {
          id: 'qb', type: 'text', name: 'beta_q', label: 'Beta', required: false,
          sectionId: 'sB', sectionTitle: 'Beta',
          showWhen: { field: 'gate', operator: 'equals', value: 'yes' },
        },
      ],
      choiceLists: {},
      sectionShowWhen: {},
    };
    expect(isSectionStepSkippable(form, 'sB', {}, TODAY)).toBe(true); // gate not 'yes' → hidden
    expect(isSectionStepSkippable(form, 'sB', { gate: 'yes' }, TODAY)).toBe(false); // shown
  });

  it('AI-Review L1: a section made entirely of wizard-prefilled (hidden) questions is skippable', () => {
    const form: FlattenedForm = {
      formId: 'f-prefill',
      title: 'Survey',
      version: '1.0.0',
      questions: [
        { id: 'q-name', type: 'text', name: 'full_name', label: 'Full name', required: true, sectionId: 'sID', sectionTitle: 'Your details' },
        { id: 'q-phone', type: 'text', name: 'phone', label: 'Phone', required: true, sectionId: 'sID', sectionTitle: 'Your details' },
      ],
      choiceLists: {},
      sectionShowWhen: {},
    };
    // Without the hide-set the section reads as visible (the pre-13-29 dead-end).
    expect(isSectionStepSkippable(form, 'sID', {}, TODAY)).toBe(false);
    // Both questions prefilled/hidden → no user-visible question → skippable.
    expect(isSectionStepSkippable(form, 'sID', {}, TODAY, new Set(['full_name', 'phone']))).toBe(true);
    // A section with even ONE non-hidden question still stops the user.
    expect(isSectionStepSkippable(form, 'sID', {}, TODAY, new Set(['full_name']))).toBe(false);
  });
});

describe('agreement invariant: skippability never contradicts Review completeness (Story 13-29)', () => {
  // The bug WAS this contradiction: navigation skipped grp_labor (raw responses,
  // no age) while completeness demanded it (calc-augmented, age present).
  const steps = [
    { sectionId: 'grp_demo' },
    { sectionId: 'grp_labor' },
    { sectionId: undefined }, // review
  ];

  function check(dob: string | undefined) {
    const form = calcGatedForm();
    const responses: Record<string, unknown> = dob ? { dob } : {};
    const skippable = isSectionStepSkippable(form, 'grp_labor', responses, TODAY);
    const completeness = deriveReviewCompleteness(
      form,
      { questionnaireResponses: responses } as WizardDraftData,
      steps,
      TODAY,
    );
    const labourRequired = completeness.missing.includes('main_occupation');
    return { skippable, labourRequired };
  }

  it('adult (age >= 15): grp_labor is required at Review AND not skipped in navigation', () => {
    const { skippable, labourRequired } = check('1990-05-01');
    expect(labourRequired).toBe(true);
    expect(skippable).toBe(false);
    // The invariant: a required-at-Review section is never auto-skipped.
    expect(labourRequired && skippable).toBe(false);
  });

  it('under-15: grp_labor is NOT required at Review AND is skipped in navigation (consistent)', () => {
    const { skippable, labourRequired } = check('2015-05-01');
    expect(labourRequired).toBe(false);
    expect(skippable).toBe(true);
  });
});
