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
  evaluateMinorGuardianConsent,
  MINOR_AGE_FLOOR,
  type CompletenessInput,
  type MinorGuardianResult,
} from '@oslsr/utils';
import { RESPONDENT_FIELD_MAP } from './submission-processing.service.js';
import type { FlattenedForm } from './native-form.service.js';
import pino from 'pino';

const logger = pino({ name: 'form-submission-validation' });

/** Story 13-34 — question type suppressed on the public respondent path. */
const GEOPOINT_QUESTION_TYPE = 'geopoint';

/**
 * Story 13-71 AC3 (adversarial review R7) — the instant the geopoint requirement
 * begins to apply, keyed on the submission's OWN `submittedAt`.
 *
 * ⛔ A DATE AND NOT A FEATURE FLAG, because the question this answers is not "is
 * the requirement on?" but "could this particular interview possibly have
 * satisfied it?". A survey captured offline on 2026-09-19 and synced on
 * 2026-09-21 was conducted by an enumerator whose app had no auto-capture; there
 * is no position to be had, and refusing it destroys the interview rather than
 * improving the data.
 *
 * Set to midnight UTC on the deploy date. ⚠️ If the deploy slips past this date,
 * MOVE IT — a fence set earlier than the code ships refuses exactly the rows it
 * was written to protect. That is the one way to get this wrong.
 *
 * ⛔ AND IT DID SLIP, WHICH IS WHY THIS COMMENT IS NOT ENOUGH. Written as
 * `2026-09-21T00:00:00Z` on 2026-09-21; adjudication opened on the 21st and
 * resumed on the 23rd, by which point the fence sat ~2.5 days in the PAST and
 * would have refused every old-client row submitted in that window. Moved to
 * `2026-09-24T00:00:00Z` — RULED by Awwal 2026-09-23 (two-part attribution,
 * handoff §2al: exposure measured and moved proposed by adjudication, ruling by
 * Awwal).
 *
 * THE ASYMMETRY THAT DECIDES THE VALUE, and it is not symmetric at all:
 *   • Too LATE costs almost nothing — rows from the new client carry coordinates
 *     anyway, so exempting them changes no outcome.
 *   • Too EARLY refuses genuine field work that no operator can recover, because
 *     the device holding it is by definition offline.
 * So round the fence FORWARD, never back.
 *
 * ⚠️ THE EXPOSURE IS REAL, NOT THEORETICAL — measured read-only on prod
 * 2026-09-23: the offline path IS used, with 2 enumerator rows showing >5 min
 * sync lag, one over an hour, and a MAX OBSERVED LAG OF 22h 35m. A row created
 * on the 22nd can still arrive on the 23rd.
 *
 * ⛔ A DATE IN SOURCE IS A PROXY FOR "WHEN THIS CODE STARTED RUNNING", and it
 * goes stale silently every time a deploy slips. Residual R9 carries the
 * structural fix (fail loudly at boot when this date is already past); until it
 * lands, CONFIRM THIS VALUE IS STILL IN THE FUTURE IMMEDIATELY BEFORE PUSHING.
 */
export const GEOPOINT_REQUIREMENT_EFFECTIVE_FROM = new Date('2026-09-24T00:00:00.000Z');

export interface CompletenessOptions {
  /** When true (explicit pending-NIN defer), the NIN question is not required. */
  pendingNin?: boolean;
  /** Additional field names to exclude (e.g. wizard-prefilled identity). */
  extraExcludeNames?: Iterable<string>;
  /**
   * Story 13-34 AC2 (AI-Review H1) — PUBLIC respondent paths only. The public
   * wizard / supplemental survey render with `FormRenderer.suppressGeopoint`, so
   * a geopoint question is never shown and can never be answered there. Without
   * this the gate would reject a public submission (422 INCOMPLETE_SUBMISSION)
   * naming a field the respondent cannot see — a hard registration block, which
   * is precisely the regression the client guard exists to prevent. Set ONLY on
   * the public submit paths; the clerk/enumerator `submitForm` path renders
   * field GPS and keeps enforcing it.
   */
  excludeGeopoint?: boolean;
  /**
   * Story 13-71 AC3 — the ENUMERATOR path, and the exact opposite sign of
   * `excludeGeopoint` above. When set, a submission must carry EITHER a position
   * OR a derived `gpsUnavailableReason`; carrying neither is a 422
   * INCOMPLETE_SUBMISSION naming the geopoint question.
   *
   * ⛔ IT IS A NO-OP WHEN THE FORM SERVES NO GEOPOINT QUESTION, and that is not a
   * convenience — two live submissions reference forms that serve none (one on
   * Public Core, one on a form row that no longer exists). Keying this on the
   * ROLE alone rather than on "this form serves a geopoint question" would make
   * those two permanently unsubmittable.
   *
   * ⭐ Why it cannot ride on `question.required` like every other field: the
   * requirement is CODE-ENFORCED by ruling (Awwal, 2026-09-18). Flipping
   * `required` on the live form would mean editing an XLSForm and minting a new
   * `questionnaire_forms` row, and it would also hit the PUBLIC channel, which
   * 13-34 deliberately took the geopoint off.
   */
  requireGeopoint?: boolean;
  /**
   * The submission envelope own coordinates (`submitFormSchema.gpsLatitude` /
   * `gpsLongitude`), which the client derives from the geopoint ANSWER. Passed
   * so `requireGeopoint` is satisfied by either the answer or the envelope — an
   * offline replay rebuilds the envelope field-by-field and is the path most
   * likely to arrive with one and not the other.
   */
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  /** The derived reason (AC4 vocabulary) that satisfies the gate without a position. */
  gpsUnavailableReason?: string | null;
  /**
   * Review R7 — the submission's own `submittedAt` (ISO), used ONLY to decide
   * whether the geopoint requirement had taken effect when this interview was
   * conducted. Absent means "treat as current", so a caller that does not pass it
   * gets the strict behaviour rather than a silent waiver.
   */
  submittedAt?: string | null;
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
  // Story 13-34 (AI-Review H1) — mirror the public renderer's geopoint
  // suppression so client and server agree on what is answerable.
  if (options.excludeGeopoint) {
    for (const q of form.questions) {
      if (q.type === GEOPOINT_QUESTION_TYPE) exclude.add(q.name);
    }
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
 * Story 13-71 AC3 — does this ANSWER hold a real position?
 *
 * `GeopointInput` writes `{ latitude, longitude, accuracy }` under the question
 * name. Both coordinates must be finite numbers: `NaN`, `null` and a string are
 * all "no position", and a half-filled pair is not half a capture.
 */
function isAnsweredGeopoint(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const { latitude, longitude } = value as { latitude?: unknown; longitude?: unknown };
  return (
    typeof latitude === 'number' && Number.isFinite(latitude) &&
    typeof longitude === 'number' && Number.isFinite(longitude)
  );
}

/**
 * Story 13-71 AC3 — the enumerator-path geopoint gate.
 *
 * ⛔ THE FIRST LINE IS THE FENCE, NOT AN OPTIMISATION. A form that serves no
 * geopoint question cannot satisfy this requirement by any means available to
 * the person submitting it, so the gate must not exist for it. Two live
 * submissions are in exactly that position (one on Public Core, one on a
 * deleted form row) and would become permanently unsubmittable otherwise.
 *
 * Satisfied by EITHER coordinates OR a reason, never by neither. Both halves
 * matter: coordinates alone would make a refused permission a hard block in the
 * field, and a reason alone would make the reason the easy path.
 *
 * @throws {AppError} INCOMPLETE_SUBMISSION (422) — the SAME shape the
 *   required-answer gate above throws, so the client's existing error handling
 *   needs no new branch.
 */
export function assertGeopointCaptured(
  form: FlattenedForm,
  answers: Record<string, unknown>,
  options: CompletenessOptions,
): void {
  const geopointNames = form.questions
    .filter((q) => q.type === GEOPOINT_QUESTION_TYPE)
    .map((q) => q.name);

  // The form serves no geopoint question — nothing to require.
  if (geopointNames.length === 0) return;

  /*
   * ⛔ ADVERSARIAL REVIEW R7 — THE SECOND FENCE, AND IT EXISTS FOR THE SAME REASON
   * AS THE FIRST: A REQUIREMENT NOBODY CAN SATISFY IS A LOCKOUT, NOT A REQUIREMENT.
   *
   * An interview conducted BEFORE this requirement shipped cannot acquire a
   * position retroactively — the capture moment is gone. Without this fence, every
   * submission sitting in an enumerator's OFFLINE QUEUE on deploy day is refused
   * with a 422 the first time it syncs, and `sync-manager.ts` classifies a 422 as a
   * PERMANENT failure (`isPermanentFailure`: any 4xx but 408/429/401/403), parking
   * the row at MAX_RETRIES so it is never retried. Roughly 89% of enumerator
   * submissions carry no coordinates today, so that is very nearly ALL of them.
   *
   * ⭐ AND THE DOCUMENTED RECOVERY MADE IT WORSE, WHICH IS WHY A FENCE BEATS A
   * RUNBOOK NOTE. `restoreToDraft` offers "Reopen — nothing is lost"; a reopened
   * draft has no geopoint answer, so AC1's auto-capture fires and writes WHERE THE
   * ENUMERATOR IS NOW as the interview's location. An interview held in a village
   * three days ago would be filed with office coordinates — the exact base-map
   * poisoning AC7's clerk exemption exists to prevent, arriving through the back
   * door and indistinguishable from a real field capture in AC10's coverage read.
   *
   * ⚠️ `submittedAt` IS CLIENT-SUPPLIED, and that is an accepted, stated trade
   * rather than an oversight. The same field already drives `submissions.submitted_at`
   * and the off-hours and speed-run heuristics, so backdating to dodge the geopoint
   * requirement is itself a detectable fraud on signals that already exist — and the
   * fence is a FIXED PAST DATE, so it closes permanently as the queue drains rather
   * than staying open. Recorded as R8 with a reopen trigger, not left implicit.
   */
  if (options.submittedAt != null) {
    const submittedAt = new Date(options.submittedAt);
    if (
      !Number.isNaN(submittedAt.getTime()) &&
      submittedAt.getTime() < GEOPOINT_REQUIREMENT_EFFECTIVE_FROM.getTime()
    ) {
      logger.info({
        event: 'submission.geopoint_requirement_waived_pre_effective',
        formId: form.formId,
        submittedAt: options.submittedAt,
        effectiveFrom: GEOPOINT_REQUIREMENT_EFFECTIVE_FROM.toISOString(),
      });
      return;
    }
  }

  const hasReason =
    typeof options.gpsUnavailableReason === 'string' && options.gpsUnavailableReason.length > 0;
  if (hasReason) return;

  const hasEnvelopeCoords =
    typeof options.gpsLatitude === 'number' && Number.isFinite(options.gpsLatitude) &&
    typeof options.gpsLongitude === 'number' && Number.isFinite(options.gpsLongitude);
  if (hasEnvelopeCoords) return;

  if (geopointNames.some((name) => isAnsweredGeopoint(answers[name]))) return;

  logger.warn({
    event: 'submission.geopoint_missing',
    formId: form.formId,
    fields: geopointNames,
  });
  throw new AppError(
    'INCOMPLETE_SUBMISSION',
    `Submission is missing required answer(s): ${geopointNames.join(', ')}`,
    422,
    { fields: geopointNames },
  );
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

  // Story 13-71 AC3 — enumerator path only, and AFTER the required-answer gate
  // so a submission missing both a required answer and its position still reports
  // the required answer first (the message the field has always seen).
  if (options.requireGeopoint) {
    assertGeopointCaptured(form, answers, options);
  }

  return { computed };
}

/**
 * Story 9-55 — minor age-gate + guardian-consent server enforcement.
 *
 * Runs SYNCHRONOUSLY in the submit controllers (submitWizard / submitForm)
 * AFTER `validateSubmissionCompleteness` has recomputed the authoritative
 * `age` — never in the async ingestion worker (post-HTTP-200 is too late to
 * reject). The `age` MUST be the server-recomputed value so a client cannot
 * forge a ≥15 age to dodge the gate.
 *
 * Capture-don't-exclude: an under-15 registrant is NEVER rejected for being
 * young — only for an INCOMPLETE/declined guardian path. A complete guardian
 * consent (with the ILO Art.6 apprenticeship attestation) passes.
 *
 * @returns the evaluated result; `result.guardian` is populated (ready to
 *   persist to respondents.metadata.guardian) when a minor submission is valid.
 * @throws {AppError} MINOR_GUARDIAN_CONSENT_REQUIRED (422) naming the missing
 *   or invalid guardian field(s).
 */
export function validateMinorGuardianConsent(
  answers: Record<string, unknown>,
  age: number | null | undefined,
): MinorGuardianResult {
  const result = evaluateMinorGuardianConsent(answers, age);

  if (result.applicable && !result.complete) {
    logger.warn({
      event: 'submission.minor_consent_required',
      missing: result.missing,
    });
    throw new AppError(
      'MINOR_GUARDIAN_CONSENT_REQUIRED',
      `A registrant under ${MINOR_AGE_FLOOR} requires verifiable parent/guardian consent. Missing or invalid: ${result.missing.join(', ')}`,
      422,
      { fields: result.missing },
    );
  }

  return result;
}
