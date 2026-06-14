/**
 * Story 9-55 — minor age-gate + guardian-consent rule (shared, pure).
 *
 * ONE definition consumed by BOTH the client (Step-5 Review guard) and the
 * server (synchronous submit gate in submitWizard / submitForm + the async
 * enumerator/clerk ingestion path). It encodes the policy decision (Awwal,
 * 2026-06-10 "Option A"):
 *
 *   Floor = 15 (ILO C138 general minimum working age), WITH the ILO C138 Art.6
 *   apprenticeship carve-out. An under-15 registrant is NEVER hard-blocked —
 *   they are routed to a guardian-consent + apprenticeship-attestation path
 *   (capture-don't-exclude). A supervised under-15 apprentice learning a trade
 *   is legitimate; NDPA requires a guardian (a minor cannot give valid
 *   processing consent), so we capture verifiable guardian consent.
 *
 * This rule is PURE GATING — it does NOT compute `age`. Following the 9-54 L2
 * separation-of-concerns lesson, the caller resolves the computed `age`
 * (`@oslsr/utils` xlsform-calculate) exactly once and passes it in. That keeps
 * calc-evaluation in one place and leaves this module dependency-free.
 *
 * Beyond the generic required-answer completeness rule (9-54 AC5), this rule
 * adds the value-level checks completeness can't express: guardian consent must
 * be an AFFIRMATIVE `yes` (not merely answered), and the apprenticeship
 * attestation must be answered. Those are why the minor gate is not redundant
 * with `findMissingRequiredAnswers`.
 */

/** ILO C138 general minimum working age. Registrants below this need a guardian. */
export const MINOR_AGE_FLOOR = 15;

/**
 * Canonical questionnaire question names for the guardian group. These MUST
 * match the `name` column of the master XLSForm `grp_guardian` group
 * (`relevant=${age} < 15`) so the answers extract uniformly across every
 * channel (wizard / enumerator / clerk / supervisor).
 */
export const GUARDIAN_QUESTION_NAMES = {
  name: 'guardian_name',
  relationship: 'guardian_relationship',
  phone: 'guardian_phone',
  consent: 'guardian_consent',
  isApprentice: 'is_supervised_apprentice',
  apprenticeshipDetails: 'apprenticeship_details',
} as const;

/** The captured guardian consent record (persisted to respondents.metadata.guardian). */
export interface GuardianData {
  name: string;
  relationship: string;
  phone: string;
  /** Always 'yes' when captured — an affirmative guardian consent is the gate. */
  consent: string;
  /** 'yes' | 'no' — ILO Art.6 supervised-apprentice attestation. */
  isSupervisedApprentice: string;
  /** Optional free-text apprenticeship description (trade / supervisor). */
  apprenticeshipDetails?: string;
}

export interface MinorGuardianResult {
  /** age is known AND below the floor → the guardian path applies. */
  applicable: boolean;
  /** When applicable: all guardian fields present + consent 'yes' + attestation answered. */
  complete: boolean;
  /** Question names missing or invalid (e.g. consent not affirmative). */
  missing: string[];
  /** Populated only when `applicable && complete`; ready to persist. */
  guardian: GuardianData | null;
}

/**
 * True when `age` is a known finite number strictly below the floor. An unknown
 * age (no `dob`, or an incomputable calculation) is NOT a minor here — that is
 * data-minimisation by default (no guardian PII requested) and the missing
 * `dob` is caught by the generic required-answer gate, not this one.
 */
export function isMinorAge(age: number | null | undefined): boolean {
  return typeof age === 'number' && Number.isFinite(age) && age < MINOR_AGE_FLOOR;
}

function asTrimmedString(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

/**
 * Evaluate the minor guardian-consent rule over an answer map + the (already
 * computed, server-authoritative) age.
 *
 * @param answers questionnaire responses (raw user answers, keyed by question name)
 * @param age     the computed `age` for this submission, or null/undefined if unknown
 */
export function evaluateMinorGuardianConsent(
  answers: Record<string, unknown>,
  age: number | null | undefined,
): MinorGuardianResult {
  if (!isMinorAge(age)) {
    return { applicable: false, complete: true, missing: [], guardian: null };
  }

  const G = GUARDIAN_QUESTION_NAMES;
  const missing: string[] = [];

  const name = asTrimmedString(answers[G.name]);
  if (!name) missing.push(G.name);

  const relationship = asTrimmedString(answers[G.relationship]);
  if (!relationship) missing.push(G.relationship);

  const phone = asTrimmedString(answers[G.phone]);
  if (!phone) missing.push(G.phone);

  // Affirmative consent only — "no" / blank is NOT consent.
  const consent = asTrimmedString(answers[G.consent]).toLowerCase();
  if (consent !== 'yes') missing.push(G.consent);

  // Apprenticeship attestation must be answered (yes or no); the carve-out is
  // about capture, not exclusion — "no" is a valid, recorded answer.
  const isApprentice = asTrimmedString(answers[G.isApprentice]).toLowerCase();
  if (isApprentice !== 'yes' && isApprentice !== 'no') missing.push(G.isApprentice);

  const complete = missing.length === 0;
  const apprenticeshipDetails = asTrimmedString(answers[G.apprenticeshipDetails]);

  return {
    applicable: true,
    complete,
    missing,
    guardian: complete
      ? {
          name,
          relationship,
          phone,
          consent: 'yes',
          isSupervisedApprentice: isApprentice,
          ...(apprenticeshipDetails ? { apprenticeshipDetails } : {}),
        }
      : null,
  };
}
