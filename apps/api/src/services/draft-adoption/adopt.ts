/**
 * Story 13-49 Tasks 5 + 6 — the two write paths.
 *
 *   adoptDraft (D1 + D3)          → a NEW registry record, via the canonical ingestion path
 *   enrichExistingRespondent (D2) → an UPDATE to one of the Story 9-28 bare records
 *
 * D4/D5/D6 write nothing at all and therefore live in the script, not here.
 *
 * ⚠️ THE DESIGN RULE FOR THIS FILE: *reuse the spine, do not fork it*. An adoption is a
 * submission that arrived late, so it is written as a `submissions` row and handed to
 * `SubmissionProcessingService.processSubmission`. That path already owns NIN dedupe (FR21),
 * the 9-12 race-resolution merge, reference-code minting with its 23505 retry, LGA
 * canonicalisation, the audit emission, the 9-58 confirmation email, the 13-12 thank-you and
 * consent-gated marketplace extraction. Every one of those is a thing this story would
 * otherwise have to re-implement and get subtly wrong on 162 real people.
 */
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { respondents } from '../../db/schema/respondents.js';
import { submissions } from '../../db/schema/submissions.js';
import { SubmissionProcessingService } from '../submission-processing.service.js';
import {
  ADOPTION_MARKER,
  assertConsentActionable,
  buildAdoptionRawData,
  DraftRowError,
  resolveDraftIdentity,
  type DraftIdentity,
  type DraftRow,
} from './payload.js';
import type { DraftDecision } from './decisions.js';

export interface AdoptResult {
  respondentId: string;
  submissionId: string;
  submissionUid: string;
  /** Minted by the canonical path — the number AC9's confirmation leads with. */
  referenceCode: string | null;
  /** Where the AC9 message set goes. Re-attached to the submission before this returns. */
  email: string;
}

export interface AdoptArgs {
  draft: DraftRow;
  decision: Extract<DraftDecision, 'PUSH_TO_REGISTRY' | 'PUSH_PENDING_NIN'>;
  /** The pinned public form (`wizard.public_form_id`) — resolved once per run by the script. */
  questionnaireFormId: string;
  adoptedAt: Date;
}

/** AC11 — the marker every touched row carries, and the ONLY handle a rollback needs. */
const marker = (draft: DraftRow, adoptedAt: Date) => ({
  adopted_by: ADOPTION_MARKER,
  adopted_at: adoptedAt.toISOString(),
  adopted_from_draft_id: draft.id,
});

/**
 * D1 / D3 — adopt a draft into the registry.
 *
 * Throws `DraftRowError` for a row the operator must look at, and re-throws whatever the
 * canonical processor throws (e.g. `NIN_DUPLICATE`) so the runner can record it per-row.
 * Either way the marker UPDATE is never reached, so a failed adoption leaves no half-marked
 * record behind for a rollback to trip over.
 */
export async function adoptDraft({
  draft,
  decision,
  questionnaireFormId,
  adoptedAt,
}: AdoptArgs): Promise<AdoptResult> {
  // Consent + decision-vs-data contradictions are settled here, before anything is written.
  const rawData = buildAdoptionRawData({ draft, decision, adoptedAt });

  /**
   * ⚠️ THE EMAIL IS WITHHELD FOR EXACTLY ONE STEP, AND BOTH HALVES MATTER.
   *
   * `runPostSubmissionSideEffects` fires the 9-58 registration confirmation whenever
   * `rawData.email` is present (`submission-processing.service.ts:299`). That email is a
   * GENERIC "your registration is complete" — correct for someone who pressed submit, wrong
   * and confusing for someone who never did, and it would arrive alongside AC9's
   * adoption-specific copy as a near-duplicate. Inserting without the key makes the
   * fire-and-forget auto-send a deterministic no-op (`if (!args.email) return;`) instead of
   * a race we would lose.
   *
   * But the key cannot simply be dropped: `/check-registration` — the amend affordance AC9
   * now points at — resolves people by `lower(s.raw_data->>'email')`
   * (`registration-status.service.ts:159`). Omitting it permanently would make every adopted
   * person unfindable by the very link we send them.
   *
   * So: insert without it, then re-attach immediately after processing.
   */
  const { email: contactEmail, ...rawDataForInsert } = rawData as { email: string } & Record<string, unknown>;

  const submissionId = uuidv7();
  const submissionUid = uuidv7();

  await db.insert(submissions).values({
    id: submissionId,
    submissionUid,
    questionnaireFormId,
    submitterId: null,
    respondentId: null,
    enumeratorId: null,
    rawData: rawDataForInsert,
    gpsLatitude: null,
    gpsLongitude: null,
    submittedAt: adoptedAt,
    // Honest provenance: these people DID come through the public wizard — they simply
    // never pressed submit. `source: 'public'` is also what the 13-12 evergreen thank-you
    // self-gates on, and what the analytics source filters expect.
    source: 'public',
    // ⚠️ UNPROCESSED, deliberately. The wizard writes `processed: true` because it creates
    // its own respondent inline; if adoption copied that, `processSubmission` would take its
    // "already processed" early return and create NOTHING, while every row still reported
    // success. Writing it false is what makes the canonical path actually run.
    processed: false,
  });

  const result = (await SubmissionProcessingService.processSubmission(submissionId)) as {
    action?: string;
    respondentId?: string;
  };

  const respondentId = result?.respondentId;
  if (!respondentId) {
    throw new DraftRowError(
      draft.id,
      `submission ${submissionId} produced no respondent (action: ${result?.action ?? 'unknown'})`,
    );
  }

  // Re-attach the contact email now that the generic auto-send can no longer pick it up, so
  // `/check-registration` can resolve this person by the address we are about to write to.
  await db
    .update(submissions)
    .set({ rawData: { ...rawDataForInsert, email: contactEmail }, updatedAt: new Date() })
    .where(eq(submissions.id, submissionId));

  // The marker is a separate UPDATE because `findOrCreateRespondent` composes `metadata`
  // itself (normalisation warnings + guardian consent) — there is no seam to thread ours
  // through rawData. Merged, never replaced: clobbering that metadata would destroy the
  // normalisation record for a row we just created.
  const referenceCode = await stampRespondentMarker(respondentId, marker(draft, adoptedAt));

  return { respondentId, submissionId, submissionUid, referenceCode, email: contactEmail };
}

/**
 * Merge the AC11 marker into `respondents.metadata` without disturbing what is there, and
 * return the reference code the canonical path minted (the number AC9's confirmation leads
 * with — `processSubmission` does not hand it back).
 */
async function stampRespondentMarker(
  respondentId: string,
  fields: Record<string, unknown>,
): Promise<string | null> {
  const existing = await db.query.respondents.findFirst({
    where: eq(respondents.id, respondentId),
    columns: { metadata: true, referenceCode: true },
  });
  await db
    .update(respondents)
    .set({
      metadata: { ...((existing?.metadata as Record<string, unknown>) ?? {}), ...fields },
      updatedAt: new Date(),
    })
    .where(eq(respondents.id, respondentId));
  return (existing?.referenceCode as string | undefined) ?? null;
}

export interface EnrichArgs {
  draft: DraftRow;
  /** The already-existing respondent this draft resolved to — one of the 63. */
  respondentId: string;
  adoptedAt: Date;
}

export interface EnrichResult {
  respondentId: string;
  /**
   * True when this record was ALREADY enriched by the programme and was left untouched.
   *
   * D2 was not idempotent before 2026-08-03: nothing checked the marker, so re-running a sheet
   * re-ran the UPDATE **and re-sent the confirmation**. The 13-12 thank-you self-gates on its
   * own send-once marker, but the adoption confirmation goes out as `registration-status` —
   * transactional, no marker, no ledger row — so a second run put a duplicate in the person's
   * inbox with nothing recording that it happened. Found while sequencing the D2 ramp: the
   * completed row had to be excluded from the sheet BY HAND to avoid exactly that.
   */
  alreadyDone?: boolean;
  /** Which columns were actually filled — reported in the dry-run so "enriched" is not a claim. */
  filled: string[];
  /**
   * The reference code this person has ALREADY held since Story 9-28. Returned, never re-minted
   * (AC4) — the AC9 confirmation needs a number to lead with, and theirs is this one.
   */
  referenceCode: string | null;
}

/** The respondent columns a draft may fill, in the order the dry-run reports them. */
const ENRICHABLE: ReadonlyArray<[column: string, from: keyof DraftIdentity]> = [
  ['firstName', 'firstName'],
  ['lastName', 'surname'],
  ['nin', 'nin'],
  ['dateOfBirth', 'dob'],
  ['phoneNumber', 'phone'],
  ['lgaId', 'lgaId'],
];

const isBlank = (v: unknown): boolean => v === null || v === undefined || String(v).trim() === '';

/**
 * Which columns a D2 enrich would actually fill, and with what. PURE — no DB, no writes.
 *
 * ⚠️ EXTRACTED BY CODE REVIEW 2026-08-02. `EnrichResult.filled` was documented as "reported in
 * the dry-run so 'enriched' is not a claim", but the dry-run never called this path at all: the
 * pre-flight validated only the two adopting decisions, so all 22 D2 rows went unexamined until
 * the live run. Splitting the computation out is what lets the preview show the mutation without
 * performing it — which is what AC10 asks for.
 *
 * MERGE, never clobber: a populated column always wins. The record on file may have been
 * corrected by staff since; a months-old abandoned draft does not get to overwrite that.
 */
export function computeEnrichmentFill(
  existing: Record<string, unknown>,
  identity: DraftIdentity,
): { set: Record<string, string>; filled: string[] } {
  const set: Record<string, string> = {};
  const filled: string[] = [];
  for (const [column, key] of ENRICHABLE) {
    const value = identity[key];
    if (typeof value === 'string' && value !== '' && isBlank(existing[column])) {
      set[column] = value;
      filled.push(column);
    }
  }
  // NOTE: `referenceCode` is deliberately absent from ENRICHABLE and always will be.
  // Theirs was issued by Story 9-28 and may already be on a printed ID card.
  return { set, filled };
}

/**
 * D2 — enrich one of the 63 bare records (AC4).
 *
 * UPDATE, never INSERT: these people are already in the registry with a reference code that
 * has been in the wild since Story 9-28, so creating a second row would both duplicate them
 * and hand them a second OSLRS number. That is the failure the four-source match exists to
 * prevent — matching by NIN alone resolved 28 of these drafts, all four sources resolve 48,
 * and the 20-row difference IS 10 duplicate records plus 10 missed enrichments.
 *
 * MERGE, never clobber: a populated column always wins over draft data. The record on file
 * may have been corrected by staff since; a months-old abandoned draft does not get to
 * overwrite that. Only blanks are filled.
 */
export async function enrichExistingRespondent({
  draft,
  respondentId,
  adoptedAt,
}: EnrichArgs): Promise<EnrichResult> {
  // AC7 applies to every contact-or-write branch, D2 included.
  assertConsentActionable(draft);

  const existing = await db.query.respondents.findFirst({
    where: eq(respondents.id, respondentId),
  });
  if (!existing) {
    throw new DraftRowError(draft.id, `target respondent ${respondentId} not found`);
  }

  // IDEMPOTENCE (2026-08-03). A record this programme has already enriched is left ALONE.
  // Not an error — re-running a sheet is a normal operator action, and the correct response to
  // "already done" is to do nothing and say so, not to fail the row or repeat the work.
  // Re-running previously re-sent the adoption confirmation, which carries no send-once marker.
  const priorMarker = (existing.metadata as Record<string, unknown> | null)?.adopted_by;
  if (priorMarker !== undefined && priorMarker !== null) {
    return {
      respondentId,
      filled: [],
      referenceCode: (existing as Record<string, unknown>).referenceCode as string | null,
      alreadyDone: true,
    };
  }

  const id = resolveDraftIdentity(draft);
  const row = existing as Record<string, unknown>;

  const { set, filled } = computeEnrichmentFill(row, id);

  const answers = (draft.formData?.questionnaireResponses ?? {}) as Record<string, unknown>;

  await db
    .update(respondents)
    .set({
      ...set,
      metadata: {
        ...((existing.metadata as Record<string, unknown>) ?? {}),
        ...marker(draft, adoptedAt),
        // The whole point of D2 is the ANSWERS behind a record that was created bare. The
        // respondents table has no column for occupation/skills/household, so they are kept
        // verbatim on the row where 13-44's panel and any later backfill can find them,
        // rather than being discarded at the moment we finally have them.
        adopted_draft_answers: answers,
      },
      updatedAt: new Date(),
    })
    .where(eq(respondents.id, respondentId));

  return {
    respondentId,
    filled,
    referenceCode: (row.referenceCode as string | undefined) ?? null,
  };
}
