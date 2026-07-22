/**
 * Story 9-54 AC6.2 + Story 9-55 — pure Step-5 completeness derivation.
 *
 * Extracted from WizardPage so the client-side guard logic (which mirrors the
 * authoritative server gate) is unit-testable in isolation, with an injectable
 * clock for the age-based minor rule. The wizard page just memoises a call to
 * this; the server rule (AC5 + the 9-55 minor gate) stays the backstop.
 */

import { findMissingRequiredAnswers } from '@oslsr/utils/src/form-completeness';
import { withCalculatedFields } from '@oslsr/utils/src/xlsform-calculate';
import { evaluateMinorGuardianConsent } from '@oslsr/utils/src/minor-guardian';
import { derivePendingNin, type WizardDraftData, type FlattenedForm } from '../api/wizard.api';
import { NIN_QUESTION_NAMES } from './wizard-provided-field-names';
import { geopointQuestionNames } from '../../forms/utils/geopoint-suppression';

export interface ReviewStepLike {
  sectionId?: string;
}

export interface ReviewCompleteness {
  complete: boolean;
  missing: string[];
  /** Step index to send the user back to (first missing question's section), or null. */
  missingStepIndex: number | null;
}

/**
 * Derive whether the questionnaire is complete enough to submit.
 *
 * Combines the 9-54 required-and-relevant rule with the 9-55 minor
 * guardian-consent rule (affirmative consent + apprenticeship attestation), both
 * evaluated against the computed-field map (so `${age}` gates resolve). When no
 * form is pinned the survey is skipped → always complete.
 *
 * @param today injectable clock for `today()` in calculations (defaults to now;
 *   tests pass a fixed date so the age-based minor branch is deterministic).
 */
export function deriveReviewCompleteness(
  form: FlattenedForm | null | undefined,
  formData: WizardDraftData,
  steps: ReviewStepLike[],
  today: Date = new Date(),
): ReviewCompleteness {
  if (!form) {
    return { complete: true, missing: [], missingStepIndex: null };
  }

  const pending = derivePendingNin(formData);
  const exclude = new Set<string>();
  if (pending) {
    for (const q of form.questions) {
      if (NIN_QUESTION_NAMES.includes(q.name)) exclude.add(q.name);
    }
  }

  // Story 13-34 (AI-Review H2) — the public wizard renders with
  // `suppressGeopoint`, so a geopoint question is unreachable: demanding it at
  // Review would send the user "back to fill" a step that shows nothing. Mirrors
  // the server's `excludeGeopoint` on the same submit path, so the client gate
  // and the authoritative gate cannot disagree.
  for (const name of geopointQuestionNames(form.questions)) exclude.add(name);

  // Resolve computed (calculate) fields ONCE, then gate on the merged map — the
  // rule itself is calc-free (Story 9-54 L2 fix).
  const responses = formData.questionnaireResponses ?? {};
  const evalData = withCalculatedFields(responses, form.calculations, today);

  const base = findMissingRequiredAnswers(
    {
      questions: form.questions.map((q) => ({
        name: q.name,
        required: q.required,
        sectionId: q.sectionId,
        showWhen: q.showWhen,
      })),
      sectionShowWhen: form.sectionShowWhen,
      excludeNames: exclude,
    },
    evalData,
  );

  // Story 9-55 — fold the minor guardian-consent rule in (defence-in-depth; the
  // server gate is authoritative). Adds the value-level checks generic
  // completeness can't express — affirmative guardian consent + the
  // apprenticeship attestation. Keys on the SAME computed `age` in evalData.
  const minor = evaluateMinorGuardianConsent(
    responses,
    typeof evalData.age === 'number' ? evalData.age : null,
  );

  const missing = [...base.missing];
  if (minor.applicable && !minor.complete) {
    for (const name of minor.missing) {
      if (!missing.includes(name)) missing.push(name);
    }
  }

  const complete = missing.length === 0;
  let missingStepIndex: number | null = null;
  if (missing.length > 0) {
    const q = form.questions.find((qq) => qq.name === missing[0]);
    if (q) {
      const idx = steps.findIndex((s) => s.sectionId === q.sectionId);
      missingStepIndex = idx >= 0 ? idx : null;
    }
  }

  return { complete, missing, missingStepIndex };
}
