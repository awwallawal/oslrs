/**
 * Story 13-49 Tasks 3 + 4 — turn a `wizard_drafts` row into the `submissions.raw_data`
 * the canonical ingestion path already knows how to process, and guard consent while
 * doing it.
 *
 * WHY THIS SHAPE AND NOT A DIRECT INSERT
 * --------------------------------------
 * The adopt script does NOT hand-roll respondent rows. It writes a `submissions` row and
 * lets `SubmissionProcessingService.processSubmission` do the rest, because that path
 * already owns NIN dedupe, the race-resolution merge, reference-code minting with its
 * retry loop, LGA canonicalisation, the audit emission, the 9-58 confirmation, the 13-12
 * thank-you and marketplace extraction. Re-implementing any of that here would fork the
 * ingestion spine ([[feedback_unified_ingestion_pipeline]]) and inherit none of its fixes.
 *
 * So this module's whole job is to produce a `rawData` object whose keys the existing
 * `RESPONDENT_FIELD_MAP` already understands — `firstname`, `surname`, `nin`, `dob`,
 * `lga_id`, `phone_number`, `consent_marketplace`, `consent_enriched` — which is, happily,
 * exactly the vocabulary the old drafts were captured in.
 *
 * ⚠️ THE ONE THING TO GET RIGHT: identity lives in `formData.questionnaireResponses`
 * (`firstname` in 208 of 292 drafts), NOT in the head-step fields (`givenName` in 8).
 * These drafts were filled when identity was asked inside the form; today's wizard asks
 * in dedicated Basics/Contact steps. A builder that reads the head step first "works",
 * writes 200 near-empty records, and reports success.
 */
import type { WizardDraftData } from '../../db/schema/wizard-drafts.js';
import type { DraftDecision } from './decisions.js';

/** AC11 — the rollback key. One string, stamped on every row this programme touches. */
export const ADOPTION_MARKER = '13-49';

/**
 * The NIN shape. DEFINED in `decisions.ts` (the module with no runtime imports) and re-exported
 * here, so the recommender that ROUTES on it and the builder that ENFORCES it are literally the
 * same regex — see the note there, including why it is format-only and must never become a
 * checksum. [[nin-validation-mod11-invalid]]
 *
 * ⚠️ Nothing on this path validated NIN shape before the 2026-08-02 code review:
 * `buildAdoptionRawData` checked only `!== ''`, and `extractRespondentData` passes the value
 * through as `String()`. Measured on the live snapshot, **2 of the 190 NIN-carrying drafts
 * resolve to a 4- and a 6-character value** — both would have been written to a citizen record
 * as `active` and, carrying a NIN, would never have entered the 9-12 ladder.
 */
export { NIN_PATTERN } from './decisions.js';
import { NIN_PATTERN } from './decisions.js';

/** The subset of a `wizard_drafts` row this module needs. */
export interface DraftRow {
  id: string;
  /** The natural key of the table — always present, and the destination for AC9's messages. */
  email: string;
  formData: WizardDraftData;
}

/**
 * A per-ROW failure. Distinct from a programme-level error: one bad draft must not abort a
 * batch of 162, but it must be reported and it must not be silently skipped — the runner
 * collects these, prints them, and refuses to `--apply` while any remain unresolved.
 */
export class DraftRowError extends Error {
  constructor(
    readonly draftId: string,
    message: string,
  ) {
    super(`draft ${draftId}: ${message}`);
    this.name = 'DraftRowError';
  }
}

const str = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
};

/** Head-step booleans → the yes/no `extractRespondentData` compares against. */
const yesNo = (v: unknown): string | null => {
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  const s = str(v).toLowerCase();
  return s === 'yes' || s === 'no' ? s : null;
};

/** First non-empty of the candidates. The ORDER of the arguments is the policy. */
const firstOf = (...candidates: unknown[]): string => {
  for (const c of candidates) {
    const s = str(c);
    if (s !== '') return s;
  }
  return '';
};

export interface DraftIdentity {
  firstName: string;
  surname: string;
  nin: string;
  dob: string;
  lgaId: string;
  phone: string;
  email: string;
  /** Raw `consent_basic`, lower-cased. '' when unanswered. */
  consentBasic: string;
  /** 'yes' | 'no' | '' — already in the extractor's vocabulary. */
  consentMarketplace: string;
  consentEnriched: string;
  /** Number of questionnaire keys carried, for the EXCLUDE_EMPTY / thin-row distinction. */
  answerCount: number;
}

/**
 * Resolve a person out of a draft.
 *
 * QUESTIONNAIRE FIRST, head step as fallback — see the module note. The legacy `fullName`
 * head field is the last resort (pre-9-18 drafts), split on the first space exactly as
 * `migrateLegacyName` does on the client.
 */
export function resolveDraftIdentity(draft: DraftRow): DraftIdentity {
  const fd = draft.formData ?? {};
  const q = (fd.questionnaireResponses ?? {}) as Record<string, unknown>;

  const legacy = str(fd.fullName);
  const legacyFirst = legacy === '' ? '' : legacy.split(/\s+/)[0]!;
  const legacyLast = legacy === '' ? '' : legacy.split(/\s+/).slice(1).join(' ');

  return {
    firstName: firstOf(q.firstname, q.first_name, fd.givenName, legacyFirst),
    surname: firstOf(q.surname, q.last_name, fd.familyName, legacyLast),
    nin: firstOf(q.nin, fd.nin),
    dob: firstOf(q.dob, q.date_of_birth, fd.dateOfBirth),
    lgaId: firstOf(q.lga_id, q.lga, fd.lgaId),
    phone: firstOf(q.phone_number, q.phone, fd.phone),
    email: firstOf(fd.email, draft.email),
    consentBasic: firstOf(q.consent_basic).toLowerCase(),
    consentMarketplace: firstOf(yesNo(q.consent_marketplace), yesNo(fd.consentMarketplace)),
    consentEnriched: firstOf(yesNo(q.consent_enriched), yesNo(fd.consentEnriched)),
    answerCount: Object.keys(q).length,
  };
}

/**
 * AC7 / R3 — the consent guard, in CODE.
 *
 * Reads the LIVE draft, never the spreadsheet. "A sheet is editable, a guard is not": the
 * regression test for this sets a D5 row to `PUSH_TO_REGISTRY` in the workbook and asserts
 * the script still refuses. Only an explicit `yes` is actionable — blank is not consent,
 * and absent is not consent.
 *
 * The state itself is changeable, but through exactly one audited path: the per-respondent
 * super-admin toggle (13-44 AC-A2), which requires a free-text reason and writes an
 * `audit_logs` row. Never here, and never in bulk.
 */
export function assertConsentActionable(draft: DraftRow): void {
  const { consentBasic } = resolveDraftIdentity(draft);
  if (consentBasic === 'yes') return;
  throw new DraftRowError(
    draft.id,
    consentBasic === ''
      ? 'consent_basic is blank on the live draft — refusing to adopt or contact (AC7). ' +
          'Blank is not consent; change it only via the audited super-admin toggle.'
      : `consent_basic = "${consentBasic}" on the live draft — refusing to adopt (AC7). ` +
          'The spreadsheet cannot override this.',
  );
}

/**
 * AC7, the CONTACT half — refuse to email anyone whose live draft says `no`.
 *
 * ⚠️ ADDED BY CODE REVIEW 2026-08-02, and the distinction from `assertConsentActionable` above
 * is the whole point. AC7 says the script "adopts **and contacts** on `consent = yes` and
 * refuses on `no`", and Task 3.3 claimed the guard sat where every cohort branch inherited it —
 * but only the two WRITE paths called it. The D4 invite loop mailed 74 people without ever
 * reading `consent_basic`, so re-marking one of the 8 `consent_basic = no` drafts
 * `INVITE_TO_RESUME` in the sheet would have mailed a person who had explicitly said no. That
 * is R3's hazard exactly, one cohort over.
 *
 * WHY THIS IS THE WEAKER TEST, DELIBERATELY: adoption needs an explicit `yes` because it writes
 * a citizen into a government register. An INVITATION asks someone to finish the registration in
 * which they would give that consent, so a BLANK is the correct and expected state for a D4 row —
 * 78 of the 292 drafts carry no questionnaire at all and therefore no `consent_basic`. Requiring
 * `yes` here would refuse the entire cohort AC6 exists to contact. Only an explicit `no` is a
 * refusal to be honoured.
 */
export function assertNotConsentRefused(draft: DraftRow): void {
  const { consentBasic } = resolveDraftIdentity(draft);
  if (consentBasic !== 'no') return;
  throw new DraftRowError(
    draft.id,
    'consent_basic = "no" on the live draft — refusing to CONTACT (AC7). ' +
      'The spreadsheet cannot override this.',
  );
}

/** The two decisions that write a registry record via this builder. */
const ADOPTING: ReadonlySet<DraftDecision> = new Set<DraftDecision>([
  'PUSH_TO_REGISTRY',
  'PUSH_PENDING_NIN',
]);

export interface BuildArgs {
  draft: DraftRow;
  decision: DraftDecision;
  adoptedAt: Date;
}

/**
 * Build the `submissions.raw_data` for an adoption.
 *
 * Every questionnaire key is spread through UNFILTERED (AC3), including the 22 Master-only
 * orphans the Public Core form no longer collects — those are answers a real person gave us
 * and the shorter form is not a reason to drop them. The canonical extractor ignores keys it
 * does not map, so carrying them costs nothing and losing them is irreversible.
 *
 * Throws `DraftRowError` on any contradiction between the operator's decision and the live
 * data. A contradiction is never resolved silently: PUSH_TO_REGISTRY without a NIN is a D3
 * the operator has not marked as one, and PUSH_PENDING_NIN *with* a NIN is a D1 they have
 * not marked either. Both need a human to look, not a default.
 */
export function buildAdoptionRawData({ draft, decision, adoptedAt }: BuildArgs): Record<string, unknown> {
  if (!ADOPTING.has(decision)) {
    throw new DraftRowError(
      draft.id,
      `decision ${decision} does not create a registry record — no payload to build`,
    );
  }

  // Consent first: nothing else about this row matters if we may not act on it.
  assertConsentActionable(draft);

  const id = resolveDraftIdentity(draft);

  if (id.firstName === '' || id.surname === '') {
    throw new DraftRowError(
      draft.id,
      'no usable name in either questionnaireResponses or the head-step fields — ' +
        'there is no person to create a record for',
    );
  }
  if (id.phone === '' || id.lgaId === '') {
    throw new DraftRowError(
      draft.id,
      `adoption needs a phone and an LGA (phone: ${id.phone || 'missing'}, lga: ${id.lgaId || 'missing'})`,
    );
  }

  const wantsPendingNin = decision === 'PUSH_PENDING_NIN';
  if (!wantsPendingNin && id.nin === '') {
    throw new DraftRowError(
      draft.id,
      'marked PUSH_TO_REGISTRY but the draft carries no NIN — if this is intended, ' +
        'mark it PUSH_PENDING_NIN so it enters the 9-12 ladder instead of being adopted as active',
    );
  }
  /**
   * ⚠️ THE TEST HERE IS "USABLE", NOT "PRESENT" — and getting that wrong would have broken the
   * D3 fix on its first real run.
   *
   * The guard exists to stop a GOOD NIN being thrown away by a pending adoption. A malformed
   * one is not a NIN we hold, it is a field that needs re-asking, so a D3 row carrying `7474`
   * must be ALLOWED through (the junk is dropped below and the 9-12 ladder asks properly).
   * Testing `!== ''` instead would have made the two guards mutually exclusive: the recommender
   * routes a malformed NIN to PUSH_PENDING_NIN, and this would then refuse that exact row —
   * leaving those 2 people with no executable disposition at all.
   */
  if (wantsPendingNin && NIN_PATTERN.test(id.nin)) {
    throw new DraftRowError(
      draft.id,
      'marked PUSH_PENDING_NIN but the draft carries a VALID NIN — adopting it as pending would ' +
        'discard a NIN we already hold; mark it PUSH_TO_REGISTRY',
    );
  }
  // A NIN we are about to WRITE must be a NIN. Fail closed rather than padding or truncating:
  // a 10-digit value is most plausibly a dropped leading zero, which is a data-entry question
  // for the operator and not a guess for a script (the standard AC14 sets for its own 10 rows).
  if (!wantsPendingNin && !NIN_PATTERN.test(id.nin)) {
    throw new DraftRowError(
      draft.id,
      `NIN "${id.nin}" is not 11 digits — refusing to write it to a registry record. ` +
        'Correct the draft, or mark the row PUSH_PENDING_NIN so the person enters the 9-12 ' +
        'ladder and is asked for it properly.',
    );
  }

  const q = (draft.formData?.questionnaireResponses ?? {}) as Record<string, unknown>;

  const raw: Record<string, unknown> = {
    // 1. EVERY answer, unfiltered — orphans included (AC3).
    ...q,

    // 2. Identity on the canonical keys, so a head-step-only draft resolves too. Written
    //    after the spread because these are the RESOLVED values (questionnaire-first), and
    //    for the 8 new-style drafts the questionnaire simply has nothing to overwrite.
    firstname: id.firstName,
    surname: id.surname,
    dob: id.dob,
    lga_id: id.lgaId,
    phone_number: id.phone,

    // 3. The destination for AC9's message set. `processSubmission` reads `rawData.email`
    //    to fire the confirmation + thank-you; without it the adoption succeeds and the
    //    person is never told their number.
    email: id.email,

    // 4. AC11 — the rollback marker, carried on the submission by construction.
    _adopted_by: ADOPTION_MARKER,
    _adopted_at: adoptedAt.toISOString(),
    _adopted_from_draft_id: draft.id,
  };

  if (id.consentMarketplace !== '') raw.consent_marketplace = id.consentMarketplace;
  if (id.consentEnriched !== '') raw.consent_enriched = id.consentEnriched;

  if (wantsPendingNin) {
    // Emit NO nin key at all AND set the explicit defer flag. `extractRespondentData`
    // honours either, but the flag says *deliberately deferred* rather than *happened to
    // be absent* — and `findOrCreateRespondent` then mints `pending_nin_capture`, which is
    // the exact status `reminder.worker.ts:261` selects on. An empty-string nin here would
    // be the difference between entering the ladder and never being asked again.
    delete raw.nin;
    raw._pendingNin = true;
    // …but a malformed value is still an ANSWER THE PERSON GAVE US, and dropping it silently
    // would destroy the only evidence of what they typed. Kept under a non-canonical key so
    // `extractRespondentData` cannot mistake it for a NIN, while an operator handling the
    // ladder reply can see that "7474" was the original entry and ask about it directly.
    if (id.nin !== '') raw._rejected_nin = id.nin;
  } else {
    raw.nin = id.nin;
  }

  return raw;
}
