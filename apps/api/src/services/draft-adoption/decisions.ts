/**
 * Story 13-49 — the draft-adoption DECISION vocabulary, in one place.
 *
 * WHY THIS IS A MODULE AND NOT TWO CONSTANTS
 * ------------------------------------------
 * Two programs share this vocabulary and they sit on opposite sides of an
 * operator: `scripts/build-draft-triage-workbook.ts` WRITES it into an Excel
 * dropdown, and the adopt script READS back whatever the operator picked. A
 * second copy in the reader would drift the moment either side gains a value —
 * and drift here is not a lint problem, it silently mis-routes a real person
 * between "adopt them into the register" and "email them an invitation".
 *
 * AC2 is the reason the reader is strict: *a recommendation is not a decision*.
 * The workbook seeds `DECISION` with `recommendDecision`'s output so the operator
 * has somewhere to start, but the script acts only on the value in the sheet, and
 * refuses anything it does not recognise (see `isDraftDecision`).
 */

/**
 * The seven dispositions, in cohort order.
 *
 * `PUSH_PENDING_NIN` was added 2026-08-01 (Story 13-49 Task 1). Without it the 20
 * D3 rows — name + phone + LGA, no NIN — were indistinguishable from D4's 7 thin
 * rows inside a single `INVITE_TO_RESUME` bucket of 27, which meant the only way
 * to adopt them was for the SCRIPT to infer the split. AC2 forbids exactly that,
 * so the split moved into the sheet where an operator can see and override it.
 */
export const DRAFT_DECISIONS = [
  /** D1 — adopt: create respondent + submission, mint the OSLRS number, send the message set. */
  'PUSH_TO_REGISTRY',
  /** D3 — adopt without a NIN: `pending_nin_capture`, enrolled in the 9-12 ladder at day 0. */
  'PUSH_PENDING_NIN',
  /** D2 — matches one of the Story 9-28 bare records: UPDATE it, never create a second. */
  'BACKFILL_THE_63',
  /** D4 — not adoptable: invitation only, no OSLRS number (there is no record to number). */
  'INVITE_TO_RESUME',
  /** D4 — nothing usable at all: the 67 with no name. Counted, contacted as an invite cohort. */
  'EXCLUDE_EMPTY',
  /** D5 — said no. Hard-guarded in code (AC7); the sheet cannot override it. */
  'EXCLUDE_CONSENT_NO',
  /** D6 — already a full respondent. No action, no message, no duplicate. */
  'ALREADY_REGISTERED',
] as const;

export type DraftDecision = (typeof DRAFT_DECISIONS)[number];

/**
 * The NIN shape — AC14 states it (`^\d{11}$`) and every path that reads or writes a NIN must
 * hold itself to the same one. It lives HERE, in the module with no runtime imports, so both
 * `recommendDecision` (which routes on it) and `buildAdoptionRawData` (which enforces it) can
 * share it without an import cycle. `payload.ts` re-exports it for its own callers.
 *
 * ⛔ FORMAT ONLY — never add a checksum. Story 13-15 retired `modulus11Check` from every prod
 * gate after measuring it against 105 real stored NINs: **78 of 105 (74%) genuine government
 * NINs FAIL Mod-11**, because NIMC specifies a NIN as "11 randomly generated, non-intelligible
 * digits" — there is no deterministic check digit. Offline validation can only ever check
 * shape; real validation is a NIMC lookup. [[nin-validation-mod11-invalid]]
 */
export const NIN_PATTERN = /^\d{11}$/;

/** The six programme cohorts. D4 is reached by two decisions (thin rows + nameless rows). */
export type DraftCohort = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6';

const COHORT_OF: Record<DraftDecision, DraftCohort> = {
  PUSH_TO_REGISTRY: 'D1',
  BACKFILL_THE_63: 'D2',
  PUSH_PENDING_NIN: 'D3',
  INVITE_TO_RESUME: 'D4',
  EXCLUDE_EMPTY: 'D4',
  EXCLUDE_CONSENT_NO: 'D5',
  ALREADY_REGISTERED: 'D6',
};

export const cohortOf = (d: DraftDecision): DraftCohort => COHORT_OF[d];

/**
 * AC2's gate. Deliberately EXACT — no trimming, no case-folding, no aliases.
 *
 * A value that needs normalising to be understood is a value someone typed by
 * hand over the dropdown, and on a write path against citizen records the right
 * response to "nearly right" is to stop and show the operator the row, not to
 * guess which of seven dispositions they meant.
 */
export const isDraftDecision = (value: unknown): value is DraftDecision =>
  typeof value === 'string' && (DRAFT_DECISIONS as readonly string[]).includes(value);

/** The facts a disposition is derived from. All strings are raw — '' means absent. */
export interface DecisionInput {
  firstName: string;
  surname: string;
  nin: string;
  lgaId: string;
  phone: string;
  /** Raw `consent_basic` answer. Only an explicit yes is actionable (AC7). */
  consentBasic: string;
  /** How many questionnaire keys this draft carries. */
  answerCount: number;
  /** Resolves to a respondent that HAS a submission row — one of the 82. */
  alreadyRegistered: boolean;
  /** Resolves to a respondent with NO submission row — one of the Story 9-28 63. */
  isOneOf63: boolean;
}

const has = (v: string): boolean => v.trim().length > 0;
const consent = (v: string): string => v.trim().toLowerCase();

/**
 * A NIN is only a NIN if it is 11 digits — the same test `buildAdoptionRawData` enforces.
 *
 * ⚠️ ADDED 2026-08-02 (code review follow-up). Without this the two halves disagreed in the
 * worst possible direction: `has(nin)` was true for a 4-character value, so the workbook
 * RECOMMENDED `PUSH_TO_REGISTRY`, and the adopt pre-flight then REFUSED that exact row. Every
 * regeneration re-seeded a decision guaranteed to abort the run, forever, and the operator's
 * only clue was an error at apply time. A recommendation that cannot be executed is a bug in
 * the recommender.
 *
 * Measured on the live 292-row snapshot: 2 rows (a 6-char and a 4-char NIN), both otherwise
 * complete — name, phone, LGA, `consent_basic = yes`, 10-11 answers, neither already
 * registered. They are textbook D3, and routing them there is what this predicate does.
 *
 * ⛔ FORMAT ONLY — never a checksum. Story 13-15 retired Mod-11 after measuring that it fails
 * 74% of REAL government NINs. [[nin-validation-mod11-invalid]]
 */
const hasUsableNin = (v: string): boolean => NIN_PATTERN.test(v.trim());

/**
 * Derive the RECOMMENDED disposition. Pure — every input is passed in, so the
 * whole rule set is testable without a database.
 *
 * ⚠️ ORDER IS THE RULE. Each branch is a claim about what outranks what:
 *
 *   1. one-of-the-63 first — enriching a record that exists is never wrong, and
 *      it is the branch that PREVENTS the duplicate a push would create;
 *   2. then already-registered — same duplicate hazard, no enrichment upside;
 *   3. then consent = no — outranks every adoption branch below it, including
 *      an otherwise perfect row. It is also re-checked in code at the adoption
 *      call site against the LIVE draft (AC7/R3), because this function's input
 *      can come from a sheet and a sheet is editable;
 *   4. then emptiness, then the two adopt branches, then invite as the residue.
 */
export function recommendDecision(i: DecisionInput): DraftDecision {
  const hasIdentity = has(i.firstName) && has(i.surname);
  const contactable = has(i.phone) && has(i.lgaId);
  const consented = consent(i.consentBasic) === 'yes';

  if (i.isOneOf63) return 'BACKFILL_THE_63';
  if (i.alreadyRegistered) return 'ALREADY_REGISTERED';
  if (consent(i.consentBasic) === 'no') return 'EXCLUDE_CONSENT_NO';
  if (i.answerCount === 0 && !hasIdentity) return 'EXCLUDE_EMPTY';

  if (hasIdentity && contactable && consented) {
    // The ONLY thing separating D1 from D3 is a USABLE NIN. Both are adoptions; D3 simply
    // enters the register in `pending_nin_capture` and inherits the 9-12 ladder's measured
    // 69% promotion rate instead of being `active` on day one.
    //
    // A malformed NIN counts as ABSENT, not as present-but-broken, and that is the whole
    // point: the person is registered today and the ladder — whose entire job is "we have
    // you, we need your NIN" — asks for the one field that is wrong. The alternative,
    // sending them back to re-register from scratch, discards 10+ answers they already gave
    // and lands them on an empty form (R2: identity does NOT prefill on resume).
    return hasUsableNin(i.nin) ? 'PUSH_TO_REGISTRY' : 'PUSH_PENDING_NIN';
  }

  return 'INVITE_TO_RESUME';
}
