import { describe, it, expect } from 'vitest';
import { deriveReviewCompleteness, type ReviewStepLike } from '../review-completeness';
import type { FlattenedForm, WizardDraftData } from '../../api/wizard.api';

// Fixed clock so the age-based minor branch is deterministic.
const TODAY = new Date('2026-06-14T00:00:00.000Z');

const guardianQ = (name: string) => ({
  id: `q-${name}`,
  type: 'text',
  name,
  label: name,
  required: true,
  sectionId: 'grp_guardian',
  sectionTitle: 'Guardian',
});

function formWithGuardianGroup(): FlattenedForm {
  return {
    formId: 'f-guardian',
    title: 'Survey',
    version: '1.0.0',
    questions: [
      { id: 'q-dob', type: 'date', name: 'dob', label: 'DOB', required: true, sectionId: 's1', sectionTitle: 'Identity' },
      guardianQ('guardian_name'),
      guardianQ('guardian_relationship'),
      guardianQ('guardian_phone'),
      guardianQ('guardian_consent'),
      guardianQ('is_supervised_apprentice'),
    ],
    choiceLists: {},
    sectionShowWhen: { grp_guardian: { field: 'age', operator: 'less_than', value: 15 } },
    calculations: [{ name: 'age', expression: 'int((today() - ${dob}) div 365.25)' }],
  } as unknown as FlattenedForm;
}

const STEPS: ReviewStepLike[] = [
  {}, {}, {}, // head steps
  { sectionId: 's1' },
  { sectionId: 'grp_guardian' },
  {}, // review
];

function draft(responses: Record<string, unknown>): WizardDraftData {
  return { questionnaireResponses: responses } as unknown as WizardDraftData;
}

/** Story 13-34 — a form carrying a REQUIRED geopoint (the pre-fix prod shape). */
function formWithRequiredGeopoint(): FlattenedForm {
  return {
    formId: 'f-gps',
    title: 'Survey',
    version: '1.0.0',
    questions: [
      { id: 'q-occ', type: 'text', name: 'main_occupation', label: 'Occupation', required: true, sectionId: 's1', sectionTitle: 'Work' },
      { id: 'q-gps', type: 'geopoint', name: 'gps_location', label: 'GPS', required: true, sectionId: 's1', sectionTitle: 'Work' },
    ],
    choiceLists: {},
    sectionShowWhen: {},
    calculations: [],
  } as unknown as FlattenedForm;
}

describe('deriveReviewCompleteness — geopoint suppression (Story 13-34 AC2, code-review H2)', () => {
  it('does NOT demand a suppressed geopoint at Review (it is unreachable in the wizard)', () => {
    const result = deriveReviewCompleteness(
      formWithRequiredGeopoint(),
      draft({ main_occupation: 'tailor' }),
      [{}, {}, {}, { sectionId: 's1' }, {}],
      TODAY,
    );
    // Pre-fix: missing=['gps_location'] → "go back and fill" pointing at a step
    // whose only unanswered question is never rendered (the 13-29 loop).
    expect(result.missing).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it('still demands other required answers on a form that has a geopoint', () => {
    const result = deriveReviewCompleteness(
      formWithRequiredGeopoint(),
      draft({}),
      [{}, {}, {}, { sectionId: 's1' }, {}],
      TODAY,
    );
    expect(result.missing).toEqual(['main_occupation']);
    expect(result.complete).toBe(false);
  });
});

describe('deriveReviewCompleteness (Story 9-55 minor folding)', () => {
  it('is complete when no form is pinned (survey skipped)', () => {
    const result = deriveReviewCompleteness(undefined, draft({}), STEPS, TODAY);
    expect(result.complete).toBe(true);
  });

  it('an ADULT with the guardian section hidden is complete (guardian fields not required)', () => {
    const result = deriveReviewCompleteness(
      formWithGuardianGroup(),
      draft({ dob: '1990-01-01' }), // age ~36 → grp_guardian hidden
      STEPS,
      TODAY,
    );
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('an under-15 with NO guardian answers is incomplete and points to the guardian step', () => {
    const result = deriveReviewCompleteness(
      formWithGuardianGroup(),
      draft({ dob: '2015-01-01' }), // age ~11 → grp_guardian relevant + required
      STEPS,
      TODAY,
    );
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(['guardian_name', 'guardian_consent']));
    expect(result.missingStepIndex).toBe(4); // the grp_guardian step
  });

  it('an under-15 whose guardian DECLINED consent is incomplete (value-level check the generic rule misses)', () => {
    const result = deriveReviewCompleteness(
      formWithGuardianGroup(),
      draft({
        dob: '2015-01-01',
        guardian_name: 'Adunni Okafor',
        guardian_relationship: 'parent',
        guardian_phone: '08031234567',
        guardian_consent: 'no', // present (generic completeness passes) but declined
        is_supervised_apprentice: 'yes',
      }),
      STEPS,
      TODAY,
    );
    expect(result.complete).toBe(false);
    expect(result.missing).toContain('guardian_consent');
  });

  it('an under-15 with a complete, consented guardian path is complete', () => {
    const result = deriveReviewCompleteness(
      formWithGuardianGroup(),
      draft({
        dob: '2015-01-01',
        guardian_name: 'Adunni Okafor',
        guardian_relationship: 'parent',
        guardian_phone: '08031234567',
        guardian_consent: 'yes',
        is_supervised_apprentice: 'yes',
      }),
      STEPS,
      TODAY,
    );
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });
});
