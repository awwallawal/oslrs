/**
 * Story 13-57 AC5 — THE FORM IS A CONTRACT, AND A RE-UPLOAD CAN BREAK IT SILENTLY.
 *
 * Ingestion reads form answers BY NAME. A re-uploaded workbook that renames or
 * drops one of those names changes behaviour with **no error anywhere**: the
 * answer simply stops arriving, `extractRespondentData` finds nothing under the
 * key it expects, and the field is quietly absent from every respondent created
 * from that day forward. Nobody is told. It is the same shape as the phone
 * failure this story exists for — input the boundary cannot interpret, absorbed
 * in silence — one layer earlier.
 *
 * Re-upload is ROUTINE here, not exotic: it mints a NEW `questionnaire_forms`
 * row and requires re-pinning `wizard.public_form_id`
 * ([[project_public_wizard_form_update]]). Pitfall #46 tells the operator to
 * check afterwards by hand. This makes that check mechanical (AC5.3).
 *
 * ── The guard asserts against the MAP, not against a list ───────────────────
 * The required set is DERIVED by inverting `RESPONDENT_FIELD_MAP`. That is the
 * whole design: a hand-written list of field names is a copy, and a copy drifts
 * from the consumer it is supposed to protect the first time someone edits one
 * and not the other ([[pattern-census-counts-sites-not-callers]]). Add a
 * consumer field to the map and this guard starts requiring it, with no second
 * edit and no chance of disagreement.
 *
 * Pure (no DB) so it is trivially unit-testable and safe to call from both the
 * publish path and the settings-write path. Modelled on the sibling
 * `form-fidelity-validator.ts` (Story 9-54 AC3), including its finding shape.
 */

import type { NativeFormSchema, Question, Section } from '@oslsr/types';
import { RESPONDENT_FIELD_MAP } from './respondent-field-map.js';

export interface IngestionContractFinding {
  kind: 'missing_field' | 'bad_value_shape';
  /** The consumer field (or question name) the finding is about. */
  target: string;
  /** Every question name that would have satisfied this consumer. */
  acceptedNames: string[];
  message: string;
}

/**
 * The consumer fields a registration form MUST be able to supply.
 *
 * ⚠️ NOT every value in `RESPONDENT_FIELD_MAP` — this is the subset that is
 * load-bearing, and each entry is here for a stated reason rather than because
 * it happened to be in the map:
 *
 *   nin                — `extractRespondentData` THROWS a PermanentProcessingError
 *                        if the schema carries no NIN question. Already fatal;
 *                        this just moves the discovery to publish time.
 *   firstName/lastName — the identity guard matches on
 *                        lower(first)+lower(last)+phone. Without them a
 *                        returning citizen mints a second record (13-49: 7
 *                        people, two numbers each).
 *   phoneNumber        — same guard, and the only way the register reaches
 *                        someone who has no email.
 *   lgaId              — every LGA analytic and the whole coverage map.
 *   consentMarketplace — decides whether a marketplace profile is ever created.
 *                        Absent, it silently defaults to `false` for everyone
 *                        (the 13-27 shape: 124 opted in → 0 profiles).
 *
 * `dateOfBirth` and `consentEnriched` are deliberately NOT required. The age
 * gate derives from a `calculate`, and enriched consent is genuinely optional
 * for a form that does not offer enrichment — requiring them would block valid
 * forms, and a guard that blocks valid work is a guard that gets disabled.
 */
export const REQUIRED_CONSUMER_FIELDS = [
  'nin',
  'firstName',
  'lastName',
  'phoneNumber',
  'lgaId',
  'consentMarketplace',
] as const;

/** Why each required field matters — quoted verbatim into the blocking message. */
const CONSUMER_PURPOSE: Record<string, string> = {
  nin: 'respondent extraction refuses a form with no NIN question',
  firstName: 'the duplicate-registration identity guard (first + last + phone)',
  lastName: 'the duplicate-registration identity guard (first + last + phone)',
  phoneNumber: 'the identity guard, and the only contact route for a citizen with no email',
  lgaId: 'every LGA analytic and the coverage map',
  consentMarketplace: 'decides whether a marketplace profile is created at all',
};

/**
 * AC5.1 — value SHAPES, not just field presence.
 *
 * ⚠️ THIS SURVIVES ON ITS OWN MERITS. The story originally justified shape
 * checking with an `lga_id` "slug vs UUID" anomaly that was measured and found
 * FALSE on 2026-08-11 (all 325 respondents carry a slug; there is no second
 * shape). The evidence was withdrawn; the instruction was not, because
 * `consent_marketplace` genuinely is read as an exact `yes`/`no` string —
 * `extractRespondentData` coerces everything else to `false`, which is
 * indistinguishable from a real decline (AC4).
 */
const VALUE_SHAPE_EXPECTATIONS: ReadonlyArray<{
  consumerField: string;
  requiredChoiceValues: string[];
  reason: string;
}> = [
  {
    consumerField: 'consentMarketplace',
    requiredChoiceValues: ['yes', 'no'],
    reason:
      'ingestion reads this answer as the exact string `yes`; anything else becomes `false`, ' +
      'which cannot be told apart from a genuine decline',
  },
];

/** consumerField → every question name that maps to it. Derived, never written by hand. */
export function acceptedNamesFor(consumerField: string): string[] {
  return Object.entries(RESPONDENT_FIELD_MAP)
    .filter(([, field]) => field === consumerField)
    .map(([name]) => name);
}

/**
 * Check a form schema against the by-name ingestion contract.
 *
 * @returns findings, each naming the field AND the consumer that reads it
 *   (AC5.2). Empty means the form can feed the register.
 */
export function checkIngestionContract(schema: NativeFormSchema): IngestionContractFinding[] {
  const findings: IngestionContractFinding[] = [];

  const questions: Question[] = (schema.sections ?? []).flatMap(
    (s: Section) => s.questions ?? [],
  );
  // Match on the RAW name, exactly as `extractRespondentData` does when it walks
  // `rawData`. Case-normalising here would make the guard accept a form the
  // consumer then fails to read — a guard that passes over the hole it guards.
  const presentNames = new Set(questions.map((q) => q.name));

  for (const consumerField of REQUIRED_CONSUMER_FIELDS) {
    const acceptedNames = acceptedNamesFor(consumerField);
    if (acceptedNames.some((name) => presentNames.has(name))) continue;
    findings.push({
      kind: 'missing_field',
      target: consumerField,
      acceptedNames,
      message:
        `This form carries no question named ${acceptedNames.map((n) => `\`${n}\``).join(' or ')}, ` +
        `so ingestion cannot fill \`${consumerField}\` — needed by ${CONSUMER_PURPOSE[consumerField]}. ` +
        'A registration submitted against this form would lose that field silently.',
    });
  }

  for (const expectation of VALUE_SHAPE_EXPECTATIONS) {
    const acceptedNames = acceptedNamesFor(expectation.consumerField);
    const question = questions.find((q) => acceptedNames.includes(q.name));
    // Absence is already reported above (when required); do not report it twice.
    if (!question) continue;

    const choices = question.choices ? schema.choiceLists?.[question.choices] : undefined;
    const values = new Set((choices ?? []).map((c) => c.value));
    const missing = expectation.requiredChoiceValues.filter((v) => !values.has(v));
    if (missing.length === 0) continue;

    findings.push({
      kind: 'bad_value_shape',
      target: question.name,
      acceptedNames,
      message:
        `Question \`${question.name}\` must offer the choice value(s) [${missing.join(', ')}] — ` +
        `${expectation.reason}.`,
    });
  }

  return findings;
}

/** One operator-readable paragraph, for an AppError message or a log line. */
export function describeIngestionContractFindings(
  findings: IngestionContractFinding[],
): string {
  return findings.map((f) => f.message).join(' ');
}
