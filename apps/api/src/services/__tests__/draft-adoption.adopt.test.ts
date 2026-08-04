import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Story 13-49 Tasks 5 + 6 — the executors.
 *
 * These are mocked-DB unit tests: what they pin down is the CONTRACT with the canonical
 * ingestion path, which is where every one of this story's hazards lives —
 *   • an adoption must go through `processSubmission`, not a hand-rolled insert;
 *   • a D2 enrich must never INSERT a respondent, and must never re-mint a reference code;
 *   • every touched row must carry the AC11 marker, because that marker is the only handle
 *     a rollback has.
 * The real-DB behaviour is exercised by the AC10 dry-run and the single-record live apply.
 */

const { mocks } = vi.hoisted(() => ({
  mocks: {
    insertedSubmissions: [] as Record<string, unknown>[],
    submissionUpdates: [] as Record<string, unknown>[],
    processSubmission: vi.fn(),
    respondentUpdates: [] as Record<string, unknown>[],
    respondentInserts: [] as Record<string, unknown>[],
    existingRespondent: null as Record<string, unknown> | null,
    priorAdoption: null as Record<string, unknown> | null,
  },
}));

vi.mock('../../db/index.js', () => {
  const nameOf = (t: unknown): string => {
    // drizzle stashes the table name behind a symbol; fall back to shape-sniffing so the
    // mock keeps working if that internal changes.
    const sym = Object.getOwnPropertySymbols(t as object).find((s) =>
      String(s).includes('Name'),
    );
    return sym ? String((t as Record<symbol, unknown>)[sym]) : '';
  };
  const insert = (table: unknown) => ({
    values: async (v: Record<string, unknown>) => {
      if (nameOf(table) === 'respondents') mocks.respondentInserts.push(v);
      else mocks.insertedSubmissions.push(v);
    },
  });
  const update = (table: unknown) => ({
    set: (v: Record<string, unknown>) => ({
      where: async () => {
        if (nameOf(table) === 'respondents') mocks.respondentUpdates.push(v);
        else mocks.submissionUpdates.push(v);
      },
    }),
  });
  return {
    db: {
      insert,
      update,
      query: {
        // TWO different lookups hit this mock and they must not be conflated:
        //   adoptDraft's prior-adoption guard  → columns { id, referenceCode }
        //   stampRespondentMarker's re-read     → columns { metadata, referenceCode }
        //   enrichExistingRespondent's lookup   → no columns at all
        // `metadata` is the discriminator: only the marker re-read asks for it.
        // Answering both with the same object made every adoptDraft test short-circuit as
        // "already adopted" the moment the guard landed.
        respondents: {
          findFirst: async (args?: { columns?: Record<string, boolean> }) =>
            args?.columns && !args.columns.metadata
              ? mocks.priorAdoption
              : mocks.existingRespondent,
        },
      },
    },
  };
});

vi.mock('../submission-processing.service.js', () => ({
  SubmissionProcessingService: { processSubmission: mocks.processSubmission },
}));

const { adoptDraft, computeEnrichmentFill, enrichExistingRespondent } = await import(
  '../draft-adoption/adopt.js'
);
const { ADOPTION_MARKER, resolveDraftIdentity } = await import('../draft-adoption/payload.js');

const draft = {
  id: 'draft-1',
  email: 'adebayo@example.com',
  formData: {
    questionnaireResponses: {
      firstname: 'Adebayo',
      surname: 'Ogunlade',
      nin: '12345678901',
      lga_id: 'ibadan-north',
      phone_number: '+2348012345678',
      consent_basic: 'yes',
      main_occupation: 'Tailor',
      household_size: '6',
    },
  },
};

const ADOPTED_AT = new Date('2026-08-01T12:00:00.000Z');
const FORM_ID = '019f8ed3-form';

beforeEach(() => {
  mocks.insertedSubmissions.length = 0;
  mocks.submissionUpdates.length = 0;
  mocks.respondentUpdates.length = 0;
  mocks.respondentInserts.length = 0;
  mocks.existingRespondent = { id: 'resp-1', referenceCode: 'OSLRS-2026-ABC123', metadata: {} };
  mocks.priorAdoption = null;
  mocks.processSubmission.mockReset();
  mocks.processSubmission.mockResolvedValue({ action: 'processed', respondentId: 'resp-1' });
});

describe('13-49 adopt — adoptDraft (D1/D3)', () => {
  const run = (decision: 'PUSH_TO_REGISTRY' | 'PUSH_PENDING_NIN' = 'PUSH_TO_REGISTRY') =>
    adoptDraft({ draft, decision, questionnaireFormId: FORM_ID, adoptedAt: ADOPTED_AT });

  it('writes ONE submission and hands it to the canonical processor', async () => {
    await run();
    expect(mocks.insertedSubmissions).toHaveLength(1);
    expect(mocks.processSubmission).toHaveBeenCalledTimes(1);
    // The processor is called with the id we generated — not a uid, not a returning() round-trip.
    expect(mocks.processSubmission).toHaveBeenCalledWith(mocks.insertedSubmissions[0]!.id);
  });

  it('NEVER inserts a respondent directly — that is processSubmission\'s job', async () => {
    // A hand-rolled respondent insert here would skip NIN dedupe, the race-resolution merge,
    // reference-code minting, LGA canonicalisation and the audit emission.
    await run();
    expect(mocks.respondentInserts).toHaveLength(0);
  });

  it('writes the submission UNPROCESSED so the canonical path actually runs', async () => {
    // The wizard writes processed:true and creates its own respondent. If adoption copied
    // that, processSubmission would early-return "already processed" and NOTHING would be
    // created — a batch that reports 142 successes and writes nothing.
    await run();
    expect(mocks.insertedSubmissions[0]!.processed).toBe(false);
  });

  it('binds to the pinned public form and records honest provenance', async () => {
    await run();
    const s = mocks.insertedSubmissions[0]!;
    expect(s.questionnaireFormId).toBe(FORM_ID);
    expect(s.source).toBe('public');
    expect(s.submitterId).toBeNull();
  });

  it('carries the full answer payload including the Master-only orphans', async () => {
    await run();
    const raw = mocks.insertedSubmissions[0]!.rawData as Record<string, unknown>;
    expect(raw.main_occupation).toBe('Tailor');
    expect(raw.household_size).toBe('6');
    expect(raw.firstname).toBe('Adebayo');
  });

  /**
   * The subtlest sequencing in the story, and it has a failure mode on BOTH sides.
   *
   * Insert WITH the email → `runPostSubmissionSideEffects` fires the generic 9-58
   * "your registration is complete" confirmation at someone who never submitted, arriving
   * as a near-duplicate of AC9's adoption copy.
   * Leave it off PERMANENTLY → `/check-registration` resolves people by
   * `lower(s.raw_data->>'email')`, so every adopted person is unfindable by the exact link
   * the confirmation sends them to.
   */
  it('inserts WITHOUT the email so the generic 9-58 auto-confirmation cannot fire', async () => {
    await run();
    const raw = mocks.insertedSubmissions[0]!.rawData as Record<string, unknown>;
    expect('email' in raw).toBe(false);
  });

  it('re-attaches the email immediately after processing, so /check-registration finds them', async () => {
    const result = await run();
    expect(mocks.submissionUpdates).toHaveLength(1);
    const raw = mocks.submissionUpdates[0]!.rawData as Record<string, unknown>;
    expect(raw.email).toBe('adebayo@example.com');
    // …and the rest of the payload survives the re-attach.
    expect(raw.main_occupation).toBe('Tailor');
    expect(raw._adopted_by).toBe(ADOPTION_MARKER);
    expect(result.email).toBe('adebayo@example.com');
  });

  it('returns the minted reference code — processSubmission does not hand it back', async () => {
    // AC9's confirmation leads with this number; without it the message has no content.
    expect((await run()).referenceCode).toBe('OSLRS-2026-ABC123');
  });

  it('stamps the AC11 marker on the submission AND the respondent', async () => {
    const result = await run();
    const raw = mocks.insertedSubmissions[0]!.rawData as Record<string, unknown>;
    expect(raw._adopted_by).toBe(ADOPTION_MARKER);

    // The respondent marker is a separate UPDATE because the canonical path builds
    // `metadata` itself — there is no way to thread it through rawData.
    expect(mocks.respondentUpdates).toHaveLength(1);
    const meta = (mocks.respondentUpdates[0]!.metadata ?? {}) as Record<string, unknown>;
    expect(meta.adopted_by).toBe(ADOPTION_MARKER);
    expect(meta.adopted_at).toBe(ADOPTED_AT.toISOString());
    expect(meta.adopted_from_draft_id).toBe('draft-1');
    expect(result.respondentId).toBe('resp-1');
  });

  it('D3 writes no NIN, so the row lands in pending_nin_capture and enters the ladder', async () => {
    const pendingDraft = {
      ...draft,
      formData: {
        questionnaireResponses: { ...draft.formData.questionnaireResponses, nin: '' },
      },
    };
    await adoptDraft({
      draft: pendingDraft,
      decision: 'PUSH_PENDING_NIN',
      questionnaireFormId: FORM_ID,
      adoptedAt: ADOPTED_AT,
    });
    const raw = mocks.insertedSubmissions[0]!.rawData as Record<string, unknown>;
    expect('nin' in raw).toBe(false);
    expect(raw._pendingNin).toBe(true);
  });

  it('surfaces a NIN duplicate as a handled row failure, never a crashed batch', async () => {
    mocks.processSubmission.mockRejectedValue(new Error('NIN_DUPLICATE: already registered'));
    await expect(run()).rejects.toThrow(/NIN_DUPLICATE/);
    // …and it did not leave a marker update behind for a respondent that was never created.
    expect(mocks.respondentUpdates).toHaveLength(0);
  });

  it('does not stamp a marker when the processor creates nothing', async () => {
    mocks.processSubmission.mockResolvedValue({ action: 'skipped' });
    await expect(run()).rejects.toThrow(/respondent/i);
    expect(mocks.respondentUpdates).toHaveLength(0);
  });
});

describe('13-49 adopt — adoptDraft idempotence (D1/D3)', () => {
  /**
   * D3 HAD NO PROTECTION AT ALL. `submission-processing.service.ts:481` dedupes on NIN alone,
   * and :454 states that when the NIN is undefined the dedup checks are SKIPPED and a
   * `pending_nin_capture` respondent is created. D3 rows have no NIN by definition, so
   * re-processing an already-adopted D3 draft minted a SECOND respondent with a SECOND OSLRS
   * number and sent another confirmation — a duplicate citizen record, uncaught.
   *
   * D1 rows carry a NIN and are caught by that dedupe, which is exactly why this was easy to
   * miss: the cohort with 139 rows was safe and the cohort with 24 was not.
   */
  it('refuses to re-adopt a draft the programme has already adopted', async () => {
    mocks.priorAdoption = { id: 'resp-prior', referenceCode: 'OSL-2026-QQ1XK5' };

    const result = await adoptDraft({
      draft,
      decision: 'PUSH_PENDING_NIN',
      questionnaireFormId: 'form-1',
      adoptedAt: ADOPTED_AT,
    });

    expect(result.alreadyDone).toBe(true);
    expect(result.respondentId).toBe('resp-prior');
    expect(result.referenceCode).toBe('OSL-2026-QQ1XK5');
    // The load-bearing assertions: no submission inserted, no processing, so no second record.
    expect(mocks.insertedSubmissions).toHaveLength(0);
    expect(mocks.processSubmission).not.toHaveBeenCalled();
  });
});

describe('13-49 adopt — enrichExistingRespondent (D2)', () => {
  beforeEach(() => {
    mocks.existingRespondent = {
      id: 'resp-63',
      referenceCode: 'OSLRS-2026-ABC123',
      firstName: null,
      lastName: null,
      nin: null,
      phoneNumber: '+2348012345678',
      lgaId: null,
      metadata: { normalisation_warnings: ['legacy'] },
    };
  });

  const run = () =>
    enrichExistingRespondent({
      draft,
      respondentId: 'resp-63',
      adoptedAt: ADOPTED_AT,
    });

  it('UPDATES the existing record and creates nothing', async () => {
    await run();
    expect(mocks.respondentInserts).toHaveLength(0);
    expect(mocks.insertedSubmissions).toHaveLength(0); // AC4: enrich, not re-register
    expect(mocks.respondentUpdates).toHaveLength(1);
  });

  it('NEVER re-issues a reference code — theirs is already in the wild', async () => {
    await run();
    expect(mocks.respondentUpdates[0]).not.toHaveProperty('referenceCode');
  });

  it('fills the blanks the bare record was created with', async () => {
    await run();
    const set = mocks.respondentUpdates[0]!;
    expect(set.firstName).toBe('Adebayo');
    expect(set.lastName).toBe('Ogunlade');
    expect(set.nin).toBe('12345678901');
    expect(set.lgaId).toBe('ibadan-north');
  });

  it('MERGES rather than clobbers — a populated field is never overwritten with draft data', async () => {
    mocks.existingRespondent = {
      ...mocks.existingRespondent,
      firstName: 'Adebayo-Official',
      nin: '99999999999',
    };
    await run();
    const set = mocks.respondentUpdates[0]!;
    expect(set).not.toHaveProperty('firstName');
    expect(set).not.toHaveProperty('nin');
    // …but the still-empty fields are filled.
    expect(set.lastName).toBe('Ogunlade');
  });

  it('preserves existing metadata while adding the AC11 marker', async () => {
    await run();
    const meta = mocks.respondentUpdates[0]!.metadata as Record<string, unknown>;
    expect(meta.normalisation_warnings).toEqual(['legacy']);
    expect(meta.adopted_by).toBe(ADOPTION_MARKER);
    expect(meta.adopted_from_draft_id).toBe('draft-1');
  });

  it('keeps the draft answers on the record so the enrichment is not lost', async () => {
    await run();
    const meta = mocks.respondentUpdates[0]!.metadata as Record<string, unknown>;
    const answers = meta.adopted_draft_answers as Record<string, unknown>;
    expect(answers.main_occupation).toBe('Tailor');
    expect(answers.household_size).toBe('6');
  });

  it('refuses to enrich when consent is not yes (AC7 applies to D2 as well)', async () => {
    const noConsent = {
      ...draft,
      formData: {
        questionnaireResponses: { ...draft.formData.questionnaireResponses, consent_basic: 'no' },
      },
    };
    await expect(
      enrichExistingRespondent({ draft: noConsent, respondentId: 'resp-63', adoptedAt: ADOPTED_AT }),
    ).rejects.toThrow(/consent/i);
    expect(mocks.respondentUpdates).toHaveLength(0);
  });

  /**
   * IDEMPOTENCE. Re-running a D2 sheet used to re-run the UPDATE **and re-send the adoption
   * confirmation**, which goes out as `registration-status` — transactional, so it carries no
   * send-once marker and writes no ledger row. The 13-12 thank-you self-gates; the confirmation
   * did not. A second run therefore put a duplicate in a real person's inbox with nothing
   * recording it, which is the double-send this system exists to prevent.
   *
   * Found on 2026-08-03 while sequencing the D2 ramp: the one already-enriched row had to be
   * excluded from the sheet BY HAND. This test is what makes the hand-exclusion unnecessary.
   */
  it('leaves an ALREADY-enriched record untouched instead of re-writing and re-sending', async () => {
    mocks.existingRespondent = {
      id: 'resp-63',
      referenceCode: 'OSLRS-2026-ABC123',
      firstName: null, lastName: null, nin: null, phoneNumber: null, lgaId: null,
      metadata: { adopted_by: '13-49', adopted_at: '2026-08-03T19:55:05.000Z' },
    };

    const result = await enrichExistingRespondent({
      draft,
      respondentId: 'resp-63',
      adoptedAt: ADOPTED_AT,
    });

    expect(result.alreadyDone).toBe(true);
    expect(result.filled).toEqual([]);
    // Their existing code still comes back — the caller needs it to report the row.
    expect(result.referenceCode).toBe('OSLRS-2026-ABC123');
    // The load-bearing assertion: NO write happened. Delete the guard and this fails.
    expect(mocks.respondentUpdates).toHaveLength(0);
  });

  it('refuses when the target respondent does not exist', async () => {
    mocks.existingRespondent = null;
    await expect(run()).rejects.toThrow(/resp-63/);
  });

  /**
   * ⚠️ ADDED BY CODE REVIEW 2026-08-02 — AC9 for D2.
   *
   * The runner used to `continue` straight after this call, so all 22 D2 people were enriched
   * in silence, though Dev Notes heads the confirmation copy "Adopted (D1/D2/D3)". The message
   * needs a number to lead with, and theirs is the one Story 9-28 already issued — returned
   * here, never re-minted (AC4).
   */
  it('returns the EXISTING reference code so AC9 has a number to send', async () => {
    const result = await run();
    expect(result.referenceCode).toBe('OSLRS-2026-ABC123');
    // …and it is emphatically not a NEW one.
    expect(mocks.respondentUpdates[0]).not.toHaveProperty('referenceCode');
  });

  it('returns a null reference code rather than inventing one when the record has none', async () => {
    mocks.existingRespondent = { ...mocks.existingRespondent, referenceCode: null };
    expect((await run()).referenceCode).toBeNull();
  });
});

/**
 * ⚠️ ADDED BY CODE REVIEW 2026-08-02.
 *
 * `EnrichResult.filled` was documented as "reported in the dry-run so 'enriched' is not a
 * claim" — but the dry-run's pre-flight validated only the two ADOPTING decisions, so this path
 * was never reached before a live run. Splitting the computation out is what lets AC10's
 * preview show the mutation without performing it. Pure: no DB, no writes.
 */
describe('13-49 adopt — computeEnrichmentFill (the D2 preview)', () => {
  const identity = resolveDraftIdentity(draft);

  it('names exactly the blank columns a draft would fill', () => {
    const { set, filled } = computeEnrichmentFill(
      { firstName: null, lastName: '', nin: null, dateOfBirth: null, phoneNumber: '+2348012345678', lgaId: null },
      identity,
    );
    expect(filled).toEqual(['firstName', 'lastName', 'nin', 'lgaId']);
    expect(set.firstName).toBe('Adebayo');
    // Already populated, so absent from BOTH the set and the report.
    expect(set).not.toHaveProperty('phoneNumber');
  });

  it('reports nothing when the record is already complete — an honest empty preview', () => {
    const { set, filled } = computeEnrichmentFill(
      {
        firstName: 'A', lastName: 'B', nin: '99999999999',
        dateOfBirth: '1990-01-01', phoneNumber: '+234', lgaId: 'ibadan_north',
      },
      identity,
    );
    expect(filled).toEqual([]);
    expect(Object.keys(set)).toHaveLength(0);
  });

  it('treats whitespace as blank — a record padded with " " is still bare', () => {
    const { filled } = computeEnrichmentFill({ firstName: '   ' }, identity);
    expect(filled).toContain('firstName');
  });

  it('never proposes a reference code, whatever the record looks like', () => {
    const { set } = computeEnrichmentFill({ referenceCode: null }, identity);
    expect(set).not.toHaveProperty('referenceCode');
  });

  it('agrees with what enrichExistingRespondent actually writes', async () => {
    // The preview is only worth anything if it is the SAME computation as the write.
    mocks.existingRespondent = {
      id: 'resp-63', referenceCode: 'OSLRS-2026-ABC123',
      firstName: null, lastName: null, nin: null, phoneNumber: '+2348012345678', lgaId: null,
      metadata: {},
    };
    const written = await enrichExistingRespondent({ draft, respondentId: 'resp-63', adoptedAt: ADOPTED_AT });
    const previewed = computeEnrichmentFill(mocks.existingRespondent, identity);
    expect(written.filled).toEqual(previewed.filled);
  });
});
