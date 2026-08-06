/**
 * Client-side skip logic evaluation for native forms.
 * Ported from packages/utils/src/skip-logic.ts (pure TS, no Node deps).
 */

import type { Calculation, Condition, ConditionGroup } from '@oslsr/types';
import { withCalculatedFields } from '@oslsr/utils/src/xlsform-calculate';
import type { FlattenedQuestion } from '../api/form.api';

/**
 * ⛔ SKIP-LOGIC COMPUTES ITS OWN CALCULATED FIELDS. CALLERS MUST NOT BE TRUSTED TO.
 *
 * 13-4, 2026-08-06 — found by a prod smoke, four wrong hypotheses in.
 *
 * A gate like `age >= 15` reads a field NOBODY ANSWERS: `age` is derived from `dob` by the form's
 * `calculations`. Story 9-54 taught `FormRenderer` to evaluate those before calling in here — but
 * `FormFillerPage` (enumerator) and `ClerkDataEntryPage` (clerk) carry their own copy of the
 * navigation logic and never got the fix. They passed RAW answers, so `age` was absent,
 * `Number(undefined)` is `NaN`, and **both** `age >= 15` and `age < 15` returned false.
 *
 * Two mutually exclusive gates, both false. Every enumerator submission silently skipped
 * **Labour Force Participation** — the entire point of a labour registry — and the under-15
 * **guardian-consent** control from 9-55. The server, which computes `age` correctly, then
 * rejected the submission with a 422 the operator could not clear.
 *
 * So the derivation moved HERE, where it cannot be forgotten. Pass `calculations` and these
 * functions evaluate them; a caller that omits them gets the old raw-answer behaviour, which is
 * correct for forms that have none. **Do not reintroduce a caller-side `evalData`** — that is the
 * shape that let two of three surfaces drift for months.
 */
export interface SkipLogicOptions {
  /** The form's `calculations` (from `FlattenedForm`). Omit only when the form truly has none. */
  calculations?: Calculation[];
  /** Injectable for tests; defaults to now. */
  today?: Date;
}

/** Derive computed fields into the answer map before any gate reads it. */
function evalAnswers(
  formData: Record<string, unknown>,
  options?: SkipLogicOptions,
): Record<string, unknown> {
  if (!options?.calculations?.length) return formData;
  return withCalculatedFields(formData, options.calculations, options.today ?? new Date());
}

/**
 * Evaluates a single condition against form data.
 */
function evaluateCondition(
  condition: Condition,
  formData: Record<string, unknown>
): boolean {
  const fieldValue = formData[condition.field];
  const condValue = condition.value;

  switch (condition.operator) {
    case 'equals':
      return fieldValue == condValue;

    case 'not_equals':
      return fieldValue != condValue;

    case 'greater_than': {
      const num = Number(fieldValue);
      const target = Number(condValue);
      if (isNaN(num) || isNaN(target)) return false;
      return num > target;
    }

    case 'greater_or_equal': {
      const num = Number(fieldValue);
      const target = Number(condValue);
      if (isNaN(num) || isNaN(target)) return false;
      return num >= target;
    }

    case 'less_than': {
      const num = Number(fieldValue);
      const target = Number(condValue);
      if (isNaN(num) || isNaN(target)) return false;
      return num < target;
    }

    case 'less_or_equal': {
      const num = Number(fieldValue);
      const target = Number(condValue);
      if (isNaN(num) || isNaN(target)) return false;
      return num <= target;
    }

    case 'is_empty':
      return fieldValue == null || fieldValue === '';

    case 'is_not_empty':
      return fieldValue != null && fieldValue !== '';

    default:
      return false;
  }
}

/**
 * Evaluates a condition group (AND/OR) against form data.
 */
function evaluateConditionGroup(
  group: ConditionGroup,
  formData: Record<string, unknown>
): boolean {
  if (group.any) {
    return group.any.some((c) => evaluateCondition(c, formData));
  }
  if (group.all) {
    return group.all.every((c) => evaluateCondition(c, formData));
  }
  return false;
}

/**
 * Unified entry point: evaluates either a single Condition or a ConditionGroup.
 * Discriminates by checking for the `field` property (Condition) vs `any`/`all` (ConditionGroup).
 */
export function evaluateShowWhen(
  showWhen: Condition | ConditionGroup,
  formData: Record<string, unknown>
): boolean {
  if ('field' in showWhen) {
    return evaluateCondition(showWhen as Condition, formData);
  }
  return evaluateConditionGroup(showWhen as ConditionGroup, formData);
}

/**
 * Returns visible questions filtered by showWhen conditions and section visibility.
 * A question is visible if:
 * 1. Its name is NOT in `hideQuestionNames` (Story 9-18 AC#B3 — Pattern C dedup;
 *    wizard-prefilled questions are skipped from the user-visible flow)
 * 2. No showWhen → always visible
 * 3. showWhen evaluates to true
 * 4. Parent section is visible (sectionShowWhen passes or doesn't exist)
 */
export function getVisibleQuestions(
  questions: FlattenedQuestion[],
  rawFormData: Record<string, unknown>,
  sectionShowWhen?: Record<string, Condition | ConditionGroup>,
  hideQuestionNames?: ReadonlySet<string>,
  options?: SkipLogicOptions,
): FlattenedQuestion[] {
  const formData = evalAnswers(rawFormData, options);
  return questions.filter((q) => {
    // Story 9-18 AC#B3: hidden (wizard-prefilled) questions are never visible.
    if (hideQuestionNames?.has(q.name)) {
      return false;
    }

    // Check section-level visibility
    if (sectionShowWhen && sectionShowWhen[q.sectionId]) {
      if (!evaluateShowWhen(sectionShowWhen[q.sectionId], formData)) {
        return false;
      }
    }

    // Check question-level visibility
    if (q.showWhen) {
      return evaluateShowWhen(q.showWhen, formData);
    }

    return true;
  });
}

/**
 * Find the next visible question index after currentIndex.
 * Returns -1 if no more visible questions exist.
 */
export function getNextVisibleIndex(
  questions: FlattenedQuestion[],
  currentIndex: number,
  rawFormData: Record<string, unknown>,
  sectionShowWhen?: Record<string, Condition | ConditionGroup>,
  hideQuestionNames?: ReadonlySet<string>,
  options?: SkipLogicOptions,
): number {
  const formData = evalAnswers(rawFormData, options);
  for (let i = currentIndex + 1; i < questions.length; i++) {
    const q = questions[i];

    // Story 9-18 AC#B3: skip wizard-prefilled (hidden) questions.
    if (hideQuestionNames?.has(q.name)) {
      continue;
    }

    // Check section visibility
    if (sectionShowWhen && sectionShowWhen[q.sectionId]) {
      if (!evaluateShowWhen(sectionShowWhen[q.sectionId], formData)) {
        continue;
      }
    }

    // Check question visibility
    if (q.showWhen && !evaluateShowWhen(q.showWhen, formData)) {
      continue;
    }

    return i;
  }
  return -1;
}

/**
 * Find the previous visible question index before currentIndex.
 * Returns -1 if no previous visible questions exist.
 */
export function getPrevVisibleIndex(
  questions: FlattenedQuestion[],
  currentIndex: number,
  rawFormData: Record<string, unknown>,
  sectionShowWhen?: Record<string, Condition | ConditionGroup>,
  hideQuestionNames?: ReadonlySet<string>,
  options?: SkipLogicOptions,
): number {
  const formData = evalAnswers(rawFormData, options);
  for (let i = currentIndex - 1; i >= 0; i--) {
    const q = questions[i];

    // Story 9-18 AC#B3: skip wizard-prefilled (hidden) questions.
    if (hideQuestionNames?.has(q.name)) {
      continue;
    }

    // Check section visibility
    if (sectionShowWhen && sectionShowWhen[q.sectionId]) {
      if (!evaluateShowWhen(sectionShowWhen[q.sectionId], formData)) {
        continue;
      }
    }

    // Check question visibility
    if (q.showWhen && !evaluateShowWhen(q.showWhen, formData)) {
      continue;
    }

    return i;
  }
  return -1;
}
