/**
 * Story 9-54 AC5 — shared required-answer completeness rule.
 *
 * ONE definition consumed by BOTH the client (Step-5 Review guard, AC6) and the
 * server (synchronous submit gate in submitWizard / submitForm). A question must
 * be answered iff it is `required` AND currently relevant (its section gate and
 * its own `showWhen` both pass against the answer map — including computed
 * `calculate` fields). Hidden questions and explicitly-excluded fields
 * (wizard-prefilled / pending-NIN) are never required.
 */

import type { Condition, ConditionGroup } from '@oslsr/types';
import { evaluateShowWhen } from './skip-logic.js';

/** Minimal question shape the rule needs (satisfied by FlattenedQuestion). */
export interface CompletenessQuestion {
  name: string;
  required: boolean;
  sectionId?: string;
  showWhen?: Condition | ConditionGroup;
}

export interface CompletenessInput {
  questions: CompletenessQuestion[];
  /** Section-id → section gate. A question whose section gate fails is hidden. */
  sectionShowWhen?: Record<string, Condition | ConditionGroup | undefined>;
  /**
   * Field names treated as already-satisfied / excluded: wizard-prefilled
   * identity fields and (on the pending-NIN path) the NIN question. Matching is
   * exact on `question.name` — callers normalise.
   */
  excludeNames?: ReadonlySet<string>;
}

export interface CompletenessResult {
  complete: boolean;
  /** Names of required + relevant questions with no answer. */
  missing: string[];
}

function isEmptyAnswer(value: unknown): boolean {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

/**
 * Returns the required-and-relevant questions that have no answer.
 *
 * This rule is PURE GATING — it does not evaluate calculations. Callers resolve
 * computed (`calculate`) fields ONCE via `withCalculatedFields` and pass the
 * merged map as `evalData`, so a section/question gated on `${age}` etc. resolves
 * the same way it does in the renderer. Keeping calc-evaluation in the caller
 * means it happens exactly once per submit/render (no double evaluation) and
 * this module has no dependency on the calculate engine.
 *
 * @param input     the form's questions + section gates + excludes
 * @param evalData  the answer map ALREADY merged with computed fields (user
 *   answers + `withCalculatedFields` output). Required-question emptiness is read
 *   from here; computed field names never collide with question names, so a
 *   required question's value is its raw user answer.
 */
export function findMissingRequiredAnswers(
  input: CompletenessInput,
  evalData: Record<string, unknown>,
): CompletenessResult {
  const exclude = input.excludeNames;
  const missing: string[] = [];

  for (const q of input.questions) {
    if (!q.required) continue;
    if (exclude?.has(q.name)) continue;

    // Section-level gate — a hidden section's questions are not required.
    if (q.sectionId && input.sectionShowWhen) {
      const sectionGate = input.sectionShowWhen[q.sectionId];
      if (sectionGate && !evaluateShowWhen(sectionGate, evalData)) continue;
    }

    // Question-level gate.
    if (q.showWhen && !evaluateShowWhen(q.showWhen, evalData)) continue;

    if (isEmptyAnswer(evalData[q.name])) missing.push(q.name);
  }

  return { complete: missing.length === 0, missing };
}
