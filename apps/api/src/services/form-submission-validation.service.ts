/**
 * Story 9-54 AC5 — server-side required-answer completeness gate.
 *
 * Runs SYNCHRONOUSLY in the submit controllers (submitWizard / submitForm)
 * BEFORE a submission is persisted or queued for async ingestion — the client
 * `FormRenderer.goNext` gate is defence-in-depth, NOT the authority. Uses the
 * SAME shared rule (`@oslsr/utils` findMissingRequiredAnswers) and the SAME
 * runtime calculate evaluator the renderer uses, so a field hidden by
 * section/question skip-logic (incl. computed `${age}` gates) is not required.
 */

import { AppError } from '@oslsr/utils';
import {
  findMissingRequiredAnswers,
  evaluateCalculations,
  type CompletenessInput,
} from '@oslsr/utils';
import { RESPONDENT_FIELD_MAP } from './submission-processing.service.js';
import type { FlattenedForm } from './native-form.service.js';
import pino from 'pino';

const logger = pino({ name: 'form-submission-validation' });

export interface CompletenessOptions {
  /** When true (explicit pending-NIN defer), the NIN question is not required. */
  pendingNin?: boolean;
  /** Additional field names to exclude (e.g. wizard-prefilled identity). */
  extraExcludeNames?: Iterable<string>;
  /**
   * Injected clock for `today()` in calculations (AC1.4). Controllers pass the
   * real `new Date()`; tests pass a fixed date so the authoritative server
   * recompute (e.g. `age=42` for `dob=1984-06-06` / `today=2026-06-12`) is
   * deterministically assertable at THIS layer, not only in the utils unit test.
   */
  today?: Date;
}

/** Question names in this form that map to the respondent NIN field. */
function ninQuestionNames(form: FlattenedForm): string[] {
  return form.questions
    .filter((q) => RESPONDENT_FIELD_MAP[q.name] === 'nin')
    .map((q) => q.name);
}

/** Translate a FlattenedForm + options into the shared rule's input shape. */
export function buildCompletenessInput(
  form: FlattenedForm,
  options: CompletenessOptions = {},
): CompletenessInput {
  const exclude = new Set<string>(options.extraExcludeNames ?? []);
  if (options.pendingNin) {
    for (const name of ninQuestionNames(form)) exclude.add(name);
  }
  return {
    questions: form.questions.map((q) => ({
      name: q.name,
      required: q.required,
      sectionId: q.sectionId,
      showWhen: q.showWhen,
    })),
    sectionShowWhen: form.sectionShowWhen,
    excludeNames: exclude,
  };
}

/**
 * Recompute calculations authoritatively + assert required-answer completeness.
 *
 * @returns `{ computed }` — the server-computed calculation values (e.g. age) so
 *   the caller can persist them; a client cannot forge these.
 * @throws {AppError} INCOMPLETE_SUBMISSION (422) naming the missing field(s).
 */
export function validateSubmissionCompleteness(
  form: FlattenedForm,
  answers: Record<string, unknown>,
  options: CompletenessOptions = {},
): { computed: Record<string, number> } {
  const today = options.today ?? new Date();

  const computed = evaluateCalculations(form.calculations, answers, today, {
    onUnsupported: (calc, err) =>
      logger.warn({
        event: 'forms.calculate.unsupported',
        name: calc.name,
        expression: calc.expression,
        error: err.message,
      }),
  });

  // Single evaluation: reuse the `computed` map above for gating instead of
  // re-deriving it inside the rule (the rule is now pure gating, calc-free).
  const input = buildCompletenessInput(form, options);
  const result = findMissingRequiredAnswers(input, { ...answers, ...computed });

  if (!result.complete) {
    logger.warn({
      event: 'submission.incomplete',
      formId: form.formId,
      missing: result.missing,
    });
    throw new AppError(
      'INCOMPLETE_SUBMISSION',
      `Submission is missing required answer(s): ${result.missing.join(', ')}`,
      422,
      { fields: result.missing },
    );
  }

  return { computed };
}
