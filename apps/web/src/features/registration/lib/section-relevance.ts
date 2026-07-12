/**
 * Story 13-29 — pure section-step relevance derivation.
 *
 * Extracted from WizardPage (precedent: `lib/wizard-navigation.ts`,
 * `lib/review-completeness.ts`) so the auto-skip decision is unit-testable in
 * isolation — and, critically, so it evaluates section visibility from the SAME
 * calculated-field-augmented answer map that the Review completeness gate uses
 * (`review-completeness.ts`), not the raw responses.
 *
 * The bug this fixes (Dry-run #2): a section gated on a calculated field — e.g.
 * `grp_labor` with section relevance `${age} >= 15`, `age` computed from `dob` —
 * was evaluated for auto-skip against the RAW responses (no `age`), so it was
 * skipped in the forward pass, then Review recomputed `age` and demanded the now-
 * "required + relevant + unanswered" section → the confusing two-pass
 * "go back and fill survey" loop. Evaluating with `withCalculatedFields` keeps
 * navigation and completeness in agreement: a calc-gated section appears in the
 * one forward pass when its inputs make it relevant, and is legitimately skipped
 * (still) when they don't (e.g. an under-15 registrant → `age < 15` → hidden).
 */

import { getVisibleQuestions } from '../../forms/utils/skipLogic';
import { withCalculatedFields } from '@oslsr/utils/src/xlsform-calculate';
import type { FlattenedForm } from '../api/wizard.api';

/**
 * Is the section step for `sectionId` auto-skippable — i.e. are NONE of its
 * questions currently visible? Head/Review steps (no `sectionId`) and the
 * no-form case are never skippable.
 *
 * Visibility is evaluated against `responses` merged with the form's computed
 * (`calculate`) fields, so a section/question gated on `${age}` etc. resolves the
 * same way it does at Review. General by construction — ANY calc-gated section
 * re-evaluates as its inputs change; no age/grp_labor special-casing.
 *
 * `hideQuestionNames` mirrors FormRenderer's `effectiveHidden` — the wizard-
 * prefilled (Story 9-18 AC#B3) question names the user can never reach. A section
 * composed ENTIRELY of prefilled questions has no user-visible question, so it
 * must be skipped rather than landing the user on FormRenderer's "No questions
 * available" dead-end. Omitting this arg (the pre-13-29 behaviour) counted those
 * hidden questions as visible and stranded the user on an empty section.
 *
 * @param today injectable clock for `today()` in calculations (defaults to now;
 *   tests pass a fixed date so the age-based branch is deterministic).
 * @param hideQuestionNames wizard-prefilled question names to exclude from
 *   visibility (matches the set FormRenderer hides), defaults to none.
 */
export function isSectionStepSkippable(
  form: FlattenedForm | null | undefined,
  sectionId: string | undefined,
  responses: Record<string, unknown>,
  today: Date = new Date(),
  hideQuestionNames?: ReadonlySet<string>,
): boolean {
  if (!sectionId || !form) return false;
  const sectionQuestions = form.questions.filter((q) => q.sectionId === sectionId);
  const evalData = withCalculatedFields(responses, form.calculations, today);
  return getVisibleQuestions(sectionQuestions, evalData, form.sectionShowWhen, hideQuestionNames).length === 0;
}
