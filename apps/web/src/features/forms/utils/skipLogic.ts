/**
 * Client-side skip logic evaluation for native forms.
 * Ported from packages/utils/src/skip-logic.ts (pure TS, no Node deps).
 */

import type { Condition, ConditionGroup } from '@oslsr/types';
import type { FlattenedQuestion } from '../api/form.api';

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
 * 1. No showWhen → always visible
 * 2. showWhen evaluates to true
 * 3. Parent section is visible (sectionShowWhen passes or doesn't exist)
 */
export function getVisibleQuestions(
  questions: FlattenedQuestion[],
  formData: Record<string, unknown>,
  sectionShowWhen?: Record<string, Condition | ConditionGroup>
): FlattenedQuestion[] {
  return questions.filter((q) => {
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
  formData: Record<string, unknown>,
  sectionShowWhen?: Record<string, Condition | ConditionGroup>
): number {
  for (let i = currentIndex + 1; i < questions.length; i++) {
    const q = questions[i];

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
  formData: Record<string, unknown>,
  sectionShowWhen?: Record<string, Condition | ConditionGroup>
): number {
  for (let i = currentIndex - 1; i >= 0; i--) {
    const q = questions[i];

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
