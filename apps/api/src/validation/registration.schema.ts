import { z } from 'zod';

/**
 * Canonical wizard-submission payload schema.
 *
 * Single source of truth for BOTH the public wizard submit
 * (`RegistrationController.submitWizard`) and the authenticated in-session edit
 * (`MeController.editRegistrationWizard`, Story 9-61 AC#5 — no parallel
 * validation surface). Lives in a db-free module so importing it never pulls in
 * the database layer (the controllers do, the schema must not).
 *
 * NIN: FORMAT-ONLY (`^\d{11}$`). NINs are "11 randomly generated, non-intelligible
 * digits" (NIMC) — no check digit exists, so no offline checksum is possible
 * (Story 13-15: the Mod-11 gate rejected 74% of real NINs on prod).
 * `familyName` optional (mononym-inclusive). `questionnaireResponses` optional
 * (Step 4 may be empty when no public form is configured).
 */
export const submitWizardSchema = z.object({
  // Story 9-18 Part F — explicit given/family name (no first-token parse).
  givenName: z.string().min(2).max(80),
  familyName: z.string().min(2).max(80).optional(),
  dateOfBirth: z.string().min(4).max(64).optional(),
  gender: z.string().max(32).optional(),
  phone: z.string().min(10).max(32),
  email: z.string().email().max(255),
  lgaId: z.string().min(1).max(64),
  consentMarketplace: z.boolean(),
  consentEnriched: z.boolean().optional(),
  nin: z
    .string()
    .regex(/^\d{11}$/, 'NIN must be 11 digits')
    .optional(),
  pendingNin: z.boolean().optional(),
  deferReasonNin: z.string().max(500).optional(),
  questionnaireResponses: z.record(z.unknown()).optional(),
  // Story 13-23 (AC2) — the UUID of the pinned form the wizard actually
  // rendered (`FlattenedForm.formId`, which is the questionnaire_forms row PK
  // per Story 9-33). Carried in the payload so the submission binds to its form
  // WITHOUT depending on the debounced best-effort wizard draft (AC1: a
  // .strict() draft schema silently 400'd every post-Step-4 autosave since 9-18
  // Part B, dropping the stamp for the whole public channel). UUID-validated so
  // a non-joinable value can never be trusted; server precedence is
  // payload → server-resolved pin → draft → sentinel.
  //
  // NOTE (AC2 "plus questionnaireFormVersionId where applicable"): `submissions`
  // has NO form-version column (see db/schema/submissions.ts) — attribution is
  // to the form ROW only — so there is nothing to carry the version id into. It
  // is therefore intentionally not part of the submit payload; if a version
  // column is ever added, mirror this field with a UUID-validated version id.
  questionnaireFormId: z.string().uuid().optional(),
  /**
   * Story 13-1 attribution, carried in the PAYLOAD (added 2026-07-30).
   *
   * WHY THIS EXISTS — the same lesson as `questionnaireFormId` above, applied to
   * the field beside it. 13-1 sole-sourced attribution from the wizard draft
   * (`buildCampaignSource(draftFormData.extras)`), but the draft is a debounced
   * best-effort copy the browser may never have flushed — the exact reason 13-23
   * moved the form-id stamp into the payload. Two independent failures followed:
   *   1. the draft-step cap froze every autosave past step 5, so `extras` could
   *      NEVER persist (fixed same day in `registration.controller.ts`); and
   *   2. even uncapped, the acquisition answer is chosen on the REVIEW step and
   *      the Submit button sits directly beneath it — anyone submitting inside
   *      the 2s autosave debounce loses their answer with no trace.
   * Carrying it in the payload makes attribution independent of the draft
   * entirely. Server precedence is payload → draft (never draft-only).
   *
   * BOUNDED, not a free-form blob: the client's `extras` slot is deliberately
   * `Record<string, unknown>`, and spreading that into `raw_data` would let a
   * crafted submit write arbitrary keys into the analytics substrate. Only these
   * validated fields cross the boundary, mirroring `parseUtm`'s allow-list and
   * its 120-char cap (`apps/web/.../lib/attribution.ts:36-53`).
   */
  campaignSource: z
    .object({
      channel: z.string().max(64).optional(),
      utm: z
        .object({
          source: z.string().max(120).optional(),
          medium: z.string().max(120).optional(),
          campaign: z.string().max(120).optional(),
          ref: z.string().max(120).optional(),
        })
        .strict()
        .optional(),
    })
    .strict()
    .optional()
    // ⚠️ `.catch(undefined)` ENFORCES THE INVARIANT — do not remove it.
    //
    // AC2.2/AC6 state an ABSOLUTE rule: attribution is best-effort and must NEVER
    // block a submit. `buildCampaignSource` upholds that server-side (total, never
    // throws) — but validation runs BEFORE it, so a `.strict()` field without a
    // catch made a malformed attribution value reject the ENTIRE registration.
    // Measured on zod 3.23.8:
    //     .strict()          → REJECTS WHOLE SUBMIT (unrecognized_keys)
    //     .strict().catch()  → SUBMIT OK, attribution dropped
    //
    // The client sanitises before sending (`lib/attribution.ts` → `boundedUtm`),
    // but that fixes the CALLER, not the invariant — and this schema is the single
    // source of truth for the 9-61 authenticated-edit path too (see the module
    // docblock), so "never" must not depend on every present and future caller
    // behaving. Strictness is still doing its job: a malformed value is DISCARDED,
    // never written, so a crafted submit still cannot put arbitrary keys into
    // `raw_data`. We simply drop the attribution instead of the registration.
    //
    // Not silent: `submitWizard` logs `registration.campaign_source_dropped` when a
    // value was supplied and did not survive, mirroring `registration.draft_rejected`
    // — a client/schema contract drift stays visible rather than vanishing.
    .catch(undefined),
  authChoice: z.enum(['magic-link', 'password', 'skip']).default('magic-link'),
});

export type SubmitWizardInput = z.infer<typeof submitWizardSchema>;
