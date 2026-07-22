/**
 * Story 13-34 AC2 — canonical geopoint-suppression primitive.
 *
 * The public respondent path never renders a `geopoint` question (the captured
 * value is discarded server-side — `registration.controller` hardcodes
 * `gpsLatitude/Longitude = null` — so a `navigator.geolocation` permission
 * prompt mid-registration is pure conversion tax). Suppression is expressed as
 * a set of question NAMES so it can be unioned into every place that already
 * reasons about "questions the user can never reach":
 *
 *   - `FormRenderer.buildEffectiveHidden` (render/iterate/validate/progress)
 *   - `WizardPage.isStepSkippable` (a section left with no reachable question
 *     must auto-skip, not strand the user on "No questions available")
 *   - `deriveReviewCompleteness` (a suppressed question can never be answered,
 *     so it must not be demanded at Review)
 *
 * Keeping ONE derivation is the point: 13-29 showed that when the renderer's
 * hide-set and the wizard's skip/completeness sets disagree, the user lands in
 * a two-pass "go back and fill the survey" loop pointing at an empty step.
 * The server-side counterpart is `CompletenessOptions.excludeGeopoint`
 * (`apps/api/src/services/form-submission-validation.service.ts`) — the client
 * hiding a REQUIRED question is only safe if the authoritative gate agrees.
 */

/** Minimal shape both `forms/api/form.api` and `registration/api/wizard.api` questions satisfy. */
interface GeopointCandidate {
  name: string;
  type: string;
}

export const GEOPOINT_QUESTION_TYPE = 'geopoint';

/** Does this question list contain at least one geopoint question? */
export function hasGeopointQuestion(questions: readonly GeopointCandidate[]): boolean {
  return questions.some((q) => q.type === GEOPOINT_QUESTION_TYPE);
}

/**
 * Names of every geopoint question in `questions` (empty set when there are
 * none, so callers can union unconditionally).
 */
export function geopointQuestionNames(questions: readonly GeopointCandidate[]): Set<string> {
  const names = new Set<string>();
  for (const q of questions) {
    if (q.type === GEOPOINT_QUESTION_TYPE) names.add(q.name);
  }
  return names;
}

/**
 * Union `base` with the geopoint question names in `questions`. Returns `base`
 * verbatim (same identity, may be undefined) when there is nothing to add, so
 * callers that memoise on set identity are unaffected.
 */
export function unionGeopointNames(
  questions: readonly GeopointCandidate[],
  base: ReadonlySet<string> | undefined,
): ReadonlySet<string> | undefined {
  if (!hasGeopointQuestion(questions)) return base;
  const set = new Set(base ?? []);
  for (const name of geopointQuestionNames(questions)) set.add(name);
  return set;
}
