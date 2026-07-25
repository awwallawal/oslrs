import type { WizardDraftData, FlattenedForm } from '../api/wizard.api';
import {
  findWizardFieldForQuestionName,
  mapWizardValueToChoice,
  WIZARD_CHOICE_FIELD_KEYS,
  type WizardProvidedFieldKey,
} from './wizard-provided-field-names';

/**
 * Story 9-18 Part B (Pattern C) wizard-field dedup — the PURE derivation.
 *
 * Extracted from `Step4Questionnaire` by Story 13-35 (code-review H1). It used
 * to live inside the step component, which made the prefilled-question hide-set
 * reachable ONLY once that step had mounted. `WizardPage` needs the same set
 * *before* it decides whether to navigate INTO a section, so the derivation has
 * to be a pure function of (form, draft) that either caller can run at any time.
 *
 * The bug that forced the move: `WizardPage` read the hide-set from
 * `draft.formData.prefilledQuestionNames`, which is stamped by
 * `Step4Questionnaire`'s effect — i.e. by the very step the skip is meant to
 * avoid. On a FIRST forward pass that field is still empty, so an all-prefilled
 * section read as "has visible questions", the wizard navigated into it, and
 * FormRenderer painted "No questions available" — the exact dead-end 13-29/13-34
 * closed for other causes. Deriving from the form + draft directly (as
 * `unionGeopointNames` already does for geopoints) makes the skip fire on the
 * first pass. See [[pattern-ship-a-fix-that-never-fires]].
 */

/** wizard field key -> the `WizardDraftData` field that holds its value. */
export const WIZARD_KEY_TO_FORMDATA_FIELD: Record<WizardProvidedFieldKey, string> = {
  fullName: 'fullName',
  givenName: 'givenName',
  familyName: 'familyName',
  phone: 'phone',
  email: 'email',
  dob: 'dateOfBirth',
  nin: 'nin',
  // Story 9-54 AC4 — choice fields (mapped via mapWizardValueToChoice).
  gender: 'gender',
  lgaId: 'lgaId',
  consentMarketplace: 'consentMarketplace',
  consentEnriched: 'consentEnriched',
};

export interface PrefillResult {
  /** Question names to hide from the renderer (auto-filled OR pending-NIN). */
  hideNames: Set<string>;
  /** Question name -> wizard value to auto-fill into questionnaireResponses. */
  prefillValues: Record<string, unknown>;
  /** Wizard field keys that contributed a value (drives the banner). */
  prefilledKeys: Set<WizardProvidedFieldKey>;
}

/**
 * AC#B4 — introspect the form schema against the wizard's collected identity
 * fields. A question is a "prefill" when its name matches a wizard field alias
 * AND the wizard holds a non-empty value for that field. The pending-NIN edge
 * case hides the NIN question without a value (no NIN to write yet).
 */
export function computePrefill(
  form: FlattenedForm | null,
  formData: WizardDraftData,
): PrefillResult {
  const hideNames = new Set<string>();
  const prefillValues: Record<string, unknown> = {};
  const prefilledKeys = new Set<WizardProvidedFieldKey>();
  if (!form) return { hideNames, prefillValues, prefilledKeys };

  const fdRecord = formData as Record<string, unknown>;
  for (const q of form.questions) {
    const key = findWizardFieldForQuestionName(q.name);
    if (!key) continue;

    // Pending-NIN edge case (AC#B4): hide the NIN question but do NOT auto-fill
    // — there is no NIN value. Banner omits NIN (not added to prefilledKeys).
    if (key === 'nin' && formData.pendingNinToggle === true) {
      hideNames.add(q.name);
      continue;
    }

    // Story 9-54 AC4 — CHOICE fields go through the value-mapping layer and are
    // only deduped when the wizard value maps to a value that EXISTS in this
    // question's choice list; an unmappable value falls through to NOT deduping
    // (the question is shown) rather than injecting an invalid choice.
    let value: unknown;
    if (WIZARD_CHOICE_FIELD_KEYS.has(key)) {
      value = mapWizardValueToChoice(key, fdRecord[WIZARD_KEY_TO_FORMDATA_FIELD[key]], q.choices);
    } else if (key === 'fullName') {
      // AI-Review H1: Part F removed `formData.fullName`, so a questionnaire
      // "Full Name"/"name" question (which maps to the `fullName` key) must be
      // composed from the given + family fields — otherwise the most common dedup
      // case silently regressed (the user got re-asked their name in Step 4).
      value =
        [formData.givenName, formData.familyName].map((v) => (v ?? '').trim()).filter(Boolean).join(' ') ||
        (formData.fullName ?? '').trim(); // legacy/unmigrated draft fallback
    } else {
      value = fdRecord[WIZARD_KEY_TO_FORMDATA_FIELD[key]];
    }
    if (value === undefined || value === null || value === '') continue;

    hideNames.add(q.name);
    prefillValues[q.name] = value;
    prefilledKeys.add(key);
  }

  return { hideNames, prefillValues, prefilledKeys };
}

/**
 * Identity signature — the ONLY draft inputs `computePrefill` reads. Memoising
 * on this (instead of the whole `formData`) keeps the derived hide-set
 * referentially stable across question-to-question answering, so it doesn't
 * churn `isStepSkippable` / the step indicator on every keystroke.
 *
 * Derived from `WIZARD_KEY_TO_FORMDATA_FIELD` (which TypeScript forces to hold
 * every wizard-field key) rather than a hand-maintained list — adding a wizard
 * field extends the signature automatically.
 */
export function buildWizardIdentitySignature(formData: WizardDraftData): string {
  const fdRecord = formData as Record<string, unknown>;
  return JSON.stringify([
    ...Object.values(WIZARD_KEY_TO_FORMDATA_FIELD).map((field) => fdRecord[field]),
    formData.pendingNinToggle,
  ]);
}
