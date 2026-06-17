import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import { modulus11Check } from '@oslsr/utils/src/validation';
import { db } from '../db/index.js';
import { respondents, submissions, wizardDrafts, type WizardDraftData } from '../db/schema/index.js';
import { uuidv7 } from 'uuidv7';
import { AuthService } from '../services/auth.service.js';
import { buildRegistrantFullName } from '../utils/registrant-name.js';
import { MagicLinkService } from '../services/magic-link.service.js';
import { NativeFormService } from '../services/native-form.service.js';
import {
  validateSubmissionCompleteness,
  validateMinorGuardianConsent,
} from '../services/form-submission-validation.service.js';
import type { MinorGuardianResult } from '@oslsr/utils';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from '../services/audit.service.js';
import { ReferenceCodeService } from '../services/reference-code.service.js';
import pino from 'pino';

const logger = pino({ name: 'registration-controller' });

/**
 * Story 9-12 Tasks 3.2 + 3.3 — pending-NIN respondent endpoints.
 *
 * Endpoints share a common shape: client presents the magic-link plaintext
 * token (`pending_nin_complete` purpose) plus the action they want to take.
 * Magic-link validation is idempotent in the "peek" phase — only the success
 * branch of `complete-nin` consumes the token. `defer-reminder` never
 * consumes; the user can defer multiple times against the same link.
 *
 * The token is the auth credential — there is no JWT layer because the
 * pending-NIN respondent is, by definition, not yet a logged-in account.
 * Single-use enforcement on the success path mitigates token replay.
 */

const completeNinSchema = z.object({
  token: z.string().min(8, 'Magic-link token is missing or too short'),
  nin: z.string().regex(/^\d{11}$/, 'NIN must be 11 digits'),
});

const deferReminderSchema = z.object({
  token: z.string().min(8, 'Magic-link token is missing or too short'),
});

// Story 9-12 Task 4.4 — server-side draft auto-save shape. Fields all
// optional; merge-on-write at application layer. Email is the natural
// identifier (no account yet).
// Code review H2 (2026-05-11) — `.passthrough()` removed. The explicit
// `extras: z.record(z.unknown())` slot is the canonical forward-compat
// surface; unknown top-level keys silently dropped by `.strict()` discipline
// (no JSONB poisoning vector). `formHasNinQuestion` + `questionnaireFormId`
// + `questionnaireFormVersionId` added explicitly (Step 4 introspection).
const saveDraftSchema = z.object({
  email: z.string().email('Valid email is required').max(255),
  currentStep: z.number().int().min(1).max(5).optional(),
  formData: z
    .object({
      // Story 9-18 Part F: given/family are canonical; fullName kept optional
      // for legacy pre-9-18 drafts (migrated client-side on resume).
      fullName: z.string().max(200).optional(),
      givenName: z.string().max(80).optional(),
      familyName: z.string().max(80).optional(),
      dateOfBirth: z.string().max(64).optional(),
      gender: z.string().max(32).optional(),
      phone: z.string().max(32).optional(),
      email: z.string().max(255).optional(),
      lgaId: z.string().max(64).optional(),
      consentMarketplace: z.boolean().optional(),
      consentEnriched: z.boolean().optional(),
      questionnaireResponses: z.record(z.unknown()).optional(),
      nin: z.string().max(16).optional(),
      pendingNinToggle: z.boolean().optional(),
      authChoice: z.enum(['magic-link', 'password', 'skip']).optional(),
      formHasNinQuestion: z.boolean().optional(),
      questionnaireFormId: z.string().max(64).optional(),
      questionnaireFormVersionId: z.string().max(64).optional(),
      extras: z.record(z.unknown()).optional(),
    })
    .strict()
    .optional(),
});

// Story 9-12 Task 5 — final wizard submission. The wizard is the SOLE
// owner of identity capture for public respondents (replacing the legacy
// /public/register POST). Email is required; NIN is optional (pending-NIN
// path); questionnaire responses optional (Step 4 may be empty when no
// public form is configured).
const submitWizardSchema = z.object({
  // Story 9-18 Part F (AC#F2): explicit given/family name — no first-token parse.
  // familyName is OPTIONAL (mononym-inclusive, AI-Review M3); when present it
  // must be ≥2 chars. A mononym registrant stores first_name only / last_name NULL.
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
    // AI-Review L1: enforce the Modulus-11 checksum server-side too — parity with
    // the enumerator/clerk path (form.controller.ts) and the Step-1 client gate,
    // so a checksum-invalid 11-digit NIN (e.g. from a resumed draft) can't slip in.
    .refine(modulus11Check, 'NIN failed the Modulus 11 checksum')
    .optional(),
  pendingNin: z.boolean().optional(),
  deferReasonNin: z.string().max(500).optional(),
  questionnaireResponses: z.record(z.unknown()).optional(),
  authChoice: z.enum(['magic-link', 'password', 'skip']).default('magic-link'),
});

// Story 9-28 Path B — supplemental-survey submission. Token redemption
// authorizes a Step 4-only data write for an already-registered respondent
// whose original wizard submit dropped the questionnaire answers (Cohort A).
const submitSupplementalSurveySchema = z.object({
  token: z.string().min(8, 'Magic-link token is missing or too short'),
  questionnaireResponses: z.record(z.unknown()),
});

// Story 9-28 Path B — sentinel value for `submissions.questionnaireFormId` on
// the supplemental-survey path. Distinguishes Cohort A recovery submissions
// from canonical wizard submissions (which carry the real `wizardDraft
// .questionnaireFormId`) in audit + analytics queries.
const SUPPLEMENTAL_SURVEY_FORM_ID = 'supplemental-survey';

export class RegistrationController {
  /**
   * POST /api/v1/registration/complete-nin
   *
   * Validates the magic-link token (purpose=pending_nin_complete), checks the
   * supplied NIN against FR21 dedupe rules, then atomically promotes the
   * pending respondent row to active and consumes the token. On FR21
   * duplicate, the token is left untouched so the user can retry with a
   * different NIN — they only burn the link when the promotion succeeds.
   */
  static async completeNin(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = completeNinSchema.safeParse(req.body);
      if (!validation.success) {
        // Code review L4 (2026-05-11) — generic 400 to match the anti-enumeration
        // discipline used by `requestMagicLink`. Field-level structure is not
        // surfaced to callers; the frontend already validates client-side.
        throw new AppError('COMPLETE_NIN_INVALID_INPUT', 'Invalid input', 400);
      }

      const { token, nin } = validation.data;

      // Phase 1 — peek. Validates token, throws on missing / used / expired.
      const peeked = await MagicLinkService.peekToken({
        plaintext: token,
        purpose: 'pending_nin_complete',
      });

      if (!peeked.respondentId) {
        throw new AppError(
          'COMPLETE_NIN_NO_RESPONDENT',
          'Magic link is not associated with a respondent',
          400,
        );
      }

      // FR21 dedupe — must run BEFORE token consume so the user can retry.
      // Code review M7 (2026-05-11) — DO NOT include the prior registration
      // timestamp / source in the 409 response. An attacker fishing with a
      // known NIN would otherwise learn "user X registered via enumerator at
      // time T", useful for social engineering.
      const ninCollision = await db.query.respondents.findFirst({
        where: eq(respondents.nin, nin),
        columns: { id: true },
      });
      if (ninCollision && ninCollision.id !== peeked.respondentId) {
        throw new AppError(
          'NIN_DUPLICATE',
          'This NIN is already registered. If you believe this is an error, please contact support.',
          409,
        );
      }

      // Code review H5 (2026-05-11) — wrap consume + status UPDATE in one
      // transaction so a DB hiccup between them rolls both back. Without
      // this, a UPDATE failure after consume would permanently burn the
      // user's only magic link with no status promotion.
      const result = await db.transaction(async (tx) => {
        // Phase 2 — consume the token inside the transaction.
        await MagicLinkService.consumeTokenTx(tx, {
          plaintext: token,
          purpose: 'pending_nin_complete',
        });

        // Phase 3 — promote the respondent row. UPDATE filters on the
        // pending-NIN status so a concurrent promotion (e.g., race-resolution
        // merge) cannot double-promote.
        const updatedRows = await tx
          .update(respondents)
          .set({
            nin,
            status: 'active',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(respondents.id, peeked.respondentId!),
              eq(respondents.status, 'pending_nin_capture'),
            ),
          )
          .returning({ id: respondents.id, source: respondents.source });

        return { updatedRows };
      });

      if (result.updatedRows.length === 0) {
        // Either the respondent row was already promoted by a race-resolution
        // merge, or the row no longer exists. Either way, treat as already-
        // completed for the user's perspective.
        logger.info({
          event: 'registration.complete_nin.already_promoted',
          respondentId: peeked.respondentId,
        });
        return res.status(200).json({
          status: 'ok',
          data: { respondentId: peeked.respondentId, alreadyPromoted: true },
        });
      }

      AuditService.logAction({
        actorId: peeked.userId ?? null,
        action: AUDIT_ACTIONS.PENDING_NIN_PROMOTED,
        targetResource: AUDIT_TARGETS.RESPONDENT,
        targetId: peeked.respondentId,
        details: {
          trigger: 'magic_link_complete_nin',
          tokenId: peeked.id,
          email: peeked.email,
        },
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
      });

      return res.status(200).json({
        status: 'ok',
        data: {
          respondentId: peeked.respondentId,
          source: result.updatedRows[0].source,
          alreadyPromoted: false,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/registration/defer-reminder
   *
   * Stamps `metadata.reminder_deferred_at = now()` on the respondent row so
   * the BullMQ reminder worker treats this timestamp as the new T0 for its
   * +2/+7/+14d offsets. Token is validated but NOT consumed — the user can
   * still complete-nin against the same link, and can defer multiple times.
   */
  static async deferReminder(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = deferReminderSchema.safeParse(req.body);
      if (!validation.success) {
        // Code review L4 (2026-05-11) — generic 400, no Zod field structure.
        throw new AppError('DEFER_REMINDER_INVALID_INPUT', 'Invalid input', 400);
      }

      const { token } = validation.data;

      const peeked = await MagicLinkService.peekToken({
        plaintext: token,
        purpose: 'pending_nin_complete',
      });

      if (!peeked.respondentId) {
        throw new AppError(
          'DEFER_REMINDER_NO_RESPONDENT',
          'Magic link is not associated with a respondent',
          400,
        );
      }

      const existing = await db.query.respondents.findFirst({
        where: eq(respondents.id, peeked.respondentId),
        columns: { id: true, status: true, metadata: true },
      });

      if (!existing || existing.status !== 'pending_nin_capture') {
        // Already promoted (or transitioned to nin_unavailable) — silent
        // no-op. The reminder worker will already skip this row.
        return res.status(200).json({
          status: 'ok',
          data: { respondentId: peeked.respondentId, deferred: false, reason: 'not_pending' },
        });
      }

      const now = new Date();
      const newMetadata = {
        ...(existing.metadata ?? {}),
        reminder_deferred_at: now.toISOString(),
      };

      await db
        .update(respondents)
        .set({ metadata: newMetadata, updatedAt: now })
        .where(eq(respondents.id, peeked.respondentId));

      AuditService.logAction({
        actorId: peeked.userId ?? null,
        action: AUDIT_ACTIONS.PENDING_NIN_DEFERRED,
        targetResource: AUDIT_TARGETS.RESPONDENT,
        targetId: peeked.respondentId,
        details: {
          tokenId: peeked.id,
          email: peeked.email,
          deferredAt: now.toISOString(),
        },
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
      });

      return res.status(200).json({
        status: 'ok',
        data: { respondentId: peeked.respondentId, deferred: true, deferredAt: now.toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/registration/draft
   *
   * Story 9-12 Task 4.4 — server-side wizard draft auto-save. Upsert by email.
   * UNAUTHENTICATED: the wizard is pre-account, so the natural identifier is
   * the email entered on Step 2. Drafts expire 30 days after creation (cleanup
   * sweep on the `idx_wizard_drafts_expires_at` index).
   *
   * Returns 200 always (no enumeration leak). If the input fails Zod
   * validation, returns 400 with structured issues. Rate limiting deferred
   * to a follow-up — abuse is bounded by the UNIQUE constraint on email and
   * the 30-day expiry sweep.
   */
  static async saveDraft(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = saveDraftSchema.safeParse(req.body);
      if (!validation.success) {
        // Code review L4 (2026-05-11) — generic 400, no Zod field structure.
        throw new AppError('WIZARD_DRAFT_INVALID_INPUT', 'Invalid draft payload', 400);
      }

      const { email, currentStep, formData } = validation.data;
      const normalisedEmail = email.toLowerCase().trim();

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Pull existing draft to merge `formData` (autosave is incremental — the
      // client only sends the slice it changed). Avoids clobbering prior step
      // data on later-step writes.
      const existing = await db.query.wizardDrafts.findFirst({
        where: eq(wizardDrafts.email, normalisedEmail),
      });

      const mergedFormData: WizardDraftData = {
        ...(existing?.formData ?? {}),
        ...(formData ?? {}),
      };

      const insertValues: typeof wizardDrafts.$inferInsert = {
        email: normalisedEmail,
        currentStep: currentStep ?? existing?.currentStep ?? 1,
        formData: mergedFormData,
        lastUpdatedAt: now,
        expiresAt,
      };

      const [row] = await db
        .insert(wizardDrafts)
        .values(insertValues)
        .onConflictDoUpdate({
          target: wizardDrafts.email,
          set: {
            currentStep: insertValues.currentStep,
            formData: mergedFormData,
            lastUpdatedAt: now,
            expiresAt,
          },
        })
        .returning({
          id: wizardDrafts.id,
          currentStep: wizardDrafts.currentStep,
          lastUpdatedAt: wizardDrafts.lastUpdatedAt,
          expiresAt: wizardDrafts.expiresAt,
        });

      return res.status(200).json({
        status: 'ok',
        data: {
          id: row.id,
          currentStep: row.currentStep,
          lastUpdatedAt: row.lastUpdatedAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/registration/draft?token=<plaintext>
   *
   * Story 9-12 Task 4.4 — server-side wizard draft hydration via magic-link
   * `wizard_resume` token. The token is PEEKED (not consumed) — the wizard
   * may need multiple hydrate cycles across the session.
   *
   * Code review H3 (2026-05-11) — `?email=` branch removed. It allowed
   * anyone who knows or guesses an email to read the full draft (phone, DOB,
   * NIN if entered, all questionnaire responses). Same-session hydration is
   * now exclusively in-memory until a `wizard_resume` token is requested by
   * the user. Cross-device resume continues to work via the magic-link
   * channel which proves possession of the email inbox.
   */
  static async getDraft(req: Request, res: Response, next: NextFunction) {
    try {
      const token = typeof req.query.token === 'string' ? req.query.token : undefined;

      if (!token) {
        throw new AppError(
          'WIZARD_DRAFT_LOOKUP_REQUIRED',
          'A magic-link token is required to hydrate a draft.',
          400,
        );
      }

      // Cross-device resume — magic-link token holds the canonical email.
      const peeked = await MagicLinkService.peekToken({
        plaintext: token,
        purpose: 'wizard_resume',
      });
      const email = peeked.email.toLowerCase().trim();

      const draft = await db.query.wizardDrafts.findFirst({
        where: eq(wizardDrafts.email, email),
      });

      if (!draft || draft.expiresAt.getTime() < Date.now()) {
        return res.status(200).json({ status: 'ok', data: { draft: null } });
      }

      return res.status(200).json({
        status: 'ok',
        data: {
          draft: {
            email: draft.email,
            currentStep: draft.currentStep,
            formData: draft.formData,
            lastUpdatedAt: draft.lastUpdatedAt.toISOString(),
            expiresAt: draft.expiresAt.toISOString(),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/registration/wizard
   *
   * Story 9-12 Task 5 — final wizard submit. Creates a `respondents` row
   * directly (no submission ingestion pipeline — the wizard is its own
   * transactional unit). Status is derived:
   *   - pendingNin=true OR nin missing → 'pending_nin_capture'
   *   - nin provided → 'active' + FR21 dedupe rejects duplicates
   * Returns the respondent ID. Magic-link delivery (login or
   * pending_nin_complete) happens via a separate request from the frontend
   * so this endpoint stays narrowly scoped to identity creation.
   *
   * Deletes the server-side draft on success so the wizard cannot re-submit
   * the same email twice. Idempotency at the data layer is enforced by the
   * NIN partial UNIQUE index.
   */
  static async submitWizard(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = submitWizardSchema.safeParse(req.body);
      if (!validation.success) {
        // Code review L4 (2026-05-11) — generic 400, no Zod field structure.
        throw new AppError('WIZARD_SUBMIT_INVALID_INPUT', 'Invalid wizard submission', 400);
      }

      const data = validation.data;
      const normalisedEmail = data.email.toLowerCase().trim();
      const pendingNin = data.pendingNin === true || !data.nin;
      const ninValue = pendingNin ? null : data.nin ?? null;
      const responses = (data.questionnaireResponses ?? {}) as Record<string, unknown>;

      // Story 9-54 AC5 — enforce required-answer completeness SYNCHRONOUSLY,
      // before persisting the respondent + submission. A magic-link resume that
      // jumps past the questionnaire (GAP 4) lands here with an incomplete
      // `responses` and is rejected. Also recomputes `calculate` fields (e.g.
      // age) authoritatively (AC1.3) for persistence.
      //
      // Review fix H1 (2026-06-12): resolve the CANONICAL pinned form server-side
      // via the same `wizard.public_form_id` setting the renderer uses
      // (getPublicActiveForm), NOT the client-stamped `draft.questionnaireFormId`.
      // The draft field is written by the browser during autosave, so trusting
      // it let the "authoritative" backstop be skipped by submitting without a
      // draft / with a forged or absent form id. The gate is now independent of
      // client state. When no form is pinned/published, Step 4 was empty
      // (PUBLIC_FORM_NOT_CONFIGURED) — no questionnaire gate applies.
      let computedFields: Record<string, number> = {};
      try {
        const flattened = await NativeFormService.getPublicActiveForm();
        const { computed } = validateSubmissionCompleteness(flattened, responses, {
          pendingNin,
          today: new Date(),
        });
        computedFields = computed;
      } catch (err) {
        // INCOMPLETE_SUBMISSION is the authoritative rejection — re-throw it.
        if (err instanceof AppError && err.code === 'INCOMPLETE_SUBMISSION') throw err;
        // PUBLIC_FORM_NOT_CONFIGURED (no form pinned/published) → Step 4 empty.
        logger.warn({
          event: 'wizard.completeness_skipped',
          email: normalisedEmail,
          reason: err instanceof AppError ? err.code : 'unknown',
        });
      }

      // Story 9-55 — minor age-gate. Keys on the SERVER-recomputed age
      // (computedFields.age, authoritative — a client cannot forge it). An
      // under-15 registrant is NOT rejected for being young; they are required
      // to carry a complete guardian-consent + ILO Art.6 apprenticeship
      // attestation. Throws MINOR_GUARDIAN_CONSENT_REQUIRED (422) on an
      // incomplete/declined guardian path. `minorResult.guardian` (when present)
      // is persisted to respondents.metadata.guardian + audited below.
      const minorResult: MinorGuardianResult = validateMinorGuardianConsent(
        responses,
        typeof computedFields.age === 'number' ? computedFields.age : null,
      );

      // FR21 dedupe — NIN-provided path only. Pending rows are not bound by
      // NIN uniqueness (multiple pending rows can coexist; race-resolution
      // merge in submission-processing.service handles cross-source collapse).
      // Code review M7 (2026-05-11) — DO NOT leak the prior-registration
      // timestamp / source. Generic message only.
      if (ninValue) {
        const collision = await db.query.respondents.findFirst({
          where: eq(respondents.nin, ninValue),
          columns: { id: true },
        });
        if (collision) {
          throw new AppError(
            'NIN_DUPLICATE',
            'This NIN is already registered. If you believe this is an error, please contact support.',
            409,
          );
        }
      }

      // Story 9-18 Part F (AC#F2) — explicit given/family columns; no parsing.
      // Step 1 collects them separately (Yoruba/Nigerian surname-first safe), so
      // `first_name` canonically means the given/personal name and `last_name`
      // the family/surname. The race-resolution merge keyed on
      // `lower(first_name)+lower(last_name)+phone` is unchanged.
      const firstName = data.givenName.trim().replace(/\s+/g, ' ');
      // AI-Review M3 (mononym-inclusive): family name optional — store NULL when
      // absent so the race-resolution merge keyed on lower(first)+lower(last)+
      // phone keeps the pre-9-18 single-token behaviour (2026-05-11 H4 fix).
      const lastName = data.familyName?.trim().replace(/\s+/g, ' ') || null;

      const status = pendingNin ? 'pending_nin_capture' : 'active';
      const metadata: Record<string, unknown> = {};
      if (pendingNin) {
        metadata.defer_reason_nin = data.deferReasonNin ?? 'public_wizard_user_self_deferred';
      }
      // Story 9-55 AC4 — guardian PII persisted ONLY for an under-15 registrant
      // (data minimisation, AC6.1). The gate above guarantees completeness when
      // `minorResult.guardian` is set.
      if (minorResult.guardian) {
        metadata.guardian = minorResult.guardian;
      }

      // Story 9-58 (Deliverable B) — mint the human-friendly reference code
      // BEFORE the transaction (so a generation failure surfaces cleanly rather
      // than mid-write) and persist it on the respondent row + echo it on the
      // success screen. Every wizard registrant — active or pending-NIN — gets
      // a stable, quotable code.
      const referenceCode = await ReferenceCodeService.generateUnique();

      // Code review M6 (2026-05-11) — wrap insert + audit + draft delete in
      // one transaction so an audit-write failure rolls back the row,
      // preserving the audit chain integrity.
      //
      // Story 9-26 (2026-05-20) — UNIFIED INGESTION PIPELINE. The wizard now
      // also writes a `submissions` row in the same transaction so wizard
      // respondents are visible to the analytics service (which queries
      // `submissions` table) and so `questionnaireResponses` + `gender` +
      // `authChoice` + `email` are persisted to `submissions.raw_data` rather
      // than silently dropped (the pre-9-26 bug surfaced 2026-05-19).
      const { respondent, submissionUid } = await db.transaction(async (tx) => {
        // Story 9-26 Part A — fetch the draft BEFORE we delete it, so we can
        // pull `questionnaireFormId` (Step 4 introspection-stamped) and
        // `createdAt` (for completion_time_seconds — fraud-engine signal).
        const draft = await tx.query.wizardDrafts.findFirst({
          where: eq(wizardDrafts.email, normalisedEmail),
          columns: { createdAt: true, formData: true },
        });
        const draftFormData = (draft?.formData ?? {}) as WizardDraftData;
        const questionnaireFormId =
          draftFormData.questionnaireFormId ?? 'no-form-pinned-at-submit';
        const completionTimeSeconds = draft?.createdAt
          ? Math.floor((Date.now() - draft.createdAt.getTime()) / 1000)
          : null;

        const insertRows = await tx
          .insert(respondents)
          .values({
            nin: ninValue,
            firstName,
            lastName,
            dateOfBirth: data.dateOfBirth ?? null,
            phoneNumber: data.phone,
            lgaId: data.lgaId,
            consentMarketplace: data.consentMarketplace,
            consentEnriched: data.consentEnriched ?? false,
            source: 'public',
            submitterId: null,
            status,
            referenceCode,
            metadata: Object.keys(metadata).length > 0 ? (metadata as never) : null,
          })
          .returning({
            id: respondents.id,
            status: respondents.status,
          });
        const row = insertRows[0];

        // Story 9-26 Part A — write the canonical submissions row alongside.
        // `processed: true` + `processedAt: now()` because wizard data is
        // self-attested + canonical; bypass the submission-processing queue
        // (no fraud-detection / normalisation enrichment needed). Source
        // `'public'` matches the wizard's identity provenance + the
        // analytics service's source filter.
        const newSubmissionUid = uuidv7();
        const now = new Date();
        await tx.insert(submissions).values({
          submissionUid: newSubmissionUid,
          questionnaireFormId,
          submitterId: null,
          respondentId: row.id,
          enumeratorId: null,
          rawData: {
            // Identity (also in respondents — duplicated here for analytics-
            // query convenience; the `s.raw_data->>'X'` accessors used by
            // every analytics query expect snake_case keys).
            first_name: firstName,
            last_name: lastName,
            date_of_birth: data.dateOfBirth ?? null,
            phone_number: data.phone,
            lga_id: data.lgaId,
            nin: ninValue,
            consent_marketplace: data.consentMarketplace,
            consent_enriched: data.consentEnriched ?? false,
            // Wizard-collected fields NOT on respondents row — preserved here
            // (closes the 2026-05-14 → 2026-05-19 data-loss window for 60
            // pre-fix wizard respondents per Story 9-12 § L7).
            email: normalisedEmail,
            gender: data.gender ?? null,
            auth_choice: data.authChoice,
            // Questionnaire answers from Step 4 — formerly dropped; now
            // canonical. Spread last so they cannot accidentally overwrite
            // identity fields with the same key.
            ...responses,
            // Story 9-54 AC1.3 — server-recomputed calculate fields (e.g. age)
            // are authoritative: spread AFTER responses so a client cannot forge
            // them.
            ...computedFields,
          } as Record<string, unknown>,
          gpsLatitude: null,
          gpsLongitude: null,
          completionTimeSeconds,
          submittedAt: now,
          source: 'public',
          processed: true,
          processedAt: now,
        });

        await AuditService.logActionTx(tx, {
          actorId: null,
          action: pendingNin
            ? AUDIT_ACTIONS.PENDING_NIN_CREATED
            : AUDIT_ACTIONS.DATA_CREATE,
          targetResource: AUDIT_TARGETS.RESPONDENT,
          targetId: row.id,
          details: {
            trigger: 'public_wizard_submit',
            email: normalisedEmail,
            lgaId: data.lgaId,
            ninProvided: !!ninValue,
            pendingNin,
            // Story 9-26 — submissionUid for cross-table forensic trace.
            submissionUid: newSubmissionUid,
          },
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('user-agent') || 'unknown',
        });

        // Story 9-55 AC5 — NDPA evidentiary record of the captured guardian
        // consent, written inside the SAME transaction (hash-chain integrity:
        // an audit-write failure rolls back the respondent). No raw child PII
        // beyond what the respondent row already holds.
        if (minorResult.guardian) {
          await AuditService.logActionTx(tx, {
            actorId: null,
            action: AUDIT_ACTIONS.MINOR_GUARDIAN_CONSENT_CAPTURED,
            targetResource: AUDIT_TARGETS.RESPONDENT,
            targetId: row.id,
            details: {
              trigger: 'public_wizard_submit',
              guardianName: minorResult.guardian.name,
              guardianRelationship: minorResult.guardian.relationship,
              guardianPhone: minorResult.guardian.phone,
              isSupervisedApprentice: minorResult.guardian.isSupervisedApprentice,
              submissionUid: newSubmissionUid,
            },
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('user-agent') || 'unknown',
          });
        }

        // Burn the server-side draft — submission is final. Inside the
        // transaction so a draft-delete failure rolls everything back; cleaner
        // than the prior fire-and-forget approach that left a stale row on
        // partial failure.
        await tx.delete(wizardDrafts).where(eq(wizardDrafts.email, normalisedEmail));

        return { respondent: row, submissionUid: newSubmissionUid };
      });

      // Story 9-26 — log the unified pipeline write at info-level for the
      // first 30 days post-deploy so we can confirm via pino logs that wizard
      // submissions are landing correctly. Remove after 2026-06-20.
      logger.info({
        event: 'wizard.submission_written',
        respondentId: respondent.id,
        submissionUid,
        pendingNin,
      });

      // Story 9-38 — provision a passwordless `public_user` account so the new
      // registrant can sign in later via magic-link (Story 9-16) or password
      // (Story 9-32). Runs AFTER the respondent + submission are durably
      // committed and is NON-FATAL (AC#4): a provisioning error must never sink
      // the survey submission (9-26 unified-ingestion data-integrity lesson).
      // Email-presence-driven (AC#1) — guarded defensively even though the
      // wizard schema makes email required. Idempotent-no-clobber on an
      // existing email (AC#2).
      if (normalisedEmail) {
        // Non-fatally merge a recovery flag onto the respondent so the
        // operator-gated backfill (AC#6) can find rows whose account/link did
        // not complete. JSONB `||` merge never clobbers sibling keys (guardian /
        // defer_reason_nin / reference bookkeeping); the flag name is a
        // controlled literal bound as a parameter (injection-safe).
        const flagRespondentForBackfill = async (
          flag: 'account_provision_failed' | 'account_link_failed',
        ) => {
          try {
            await db
              .update(respondents)
              .set({
                metadata: sql`COALESCE(${respondents.metadata}, '{}'::jsonb) || ${JSON.stringify({ [flag]: true })}::jsonb`,
                updatedAt: new Date(),
              })
              .where(eq(respondents.id, respondent.id));
          } catch (metaErr) {
            logger.warn({
              event: 'wizard.account_provision_flag_failed',
              respondentId: respondent.id,
              flag,
              err: metaErr,
            });
          }
        };

        let provisionedUserId: string | undefined;
        try {
          const { userId } = await AuthService.provisionPublicUserForWizard({
            email: normalisedEmail,
            fullName: buildRegistrantFullName(firstName, lastName),
            ipAddress: req.ip,
            userAgent: req.get('user-agent') ?? undefined,
          });
          provisionedUserId = userId;
        } catch (provisionErr) {
          logger.warn({
            event: 'wizard.account_provision_failed',
            respondentId: respondent.id,
            err: provisionErr,
          });
        }

        if (provisionedUserId) {
          // AC#3 — stamp the durable respondent↔account link. The account now
          // EXISTS; if only THIS write fails, flag it distinctly
          // (account_link_failed) so an operator isn't misled into thinking
          // provisioning failed — the account is fine, just unlinked. Either
          // flag routes the row to the backfill, whose candidate set is
          // `user_id IS NULL` (so a link-only failure is still recovered).
          try {
            await db
              .update(respondents)
              .set({ userId: provisionedUserId, updatedAt: new Date() })
              .where(eq(respondents.id, respondent.id));
          } catch (linkErr) {
            logger.warn({
              event: 'wizard.account_link_failed',
              respondentId: respondent.id,
              userId: provisionedUserId,
              err: linkErr,
            });
            await flagRespondentForBackfill('account_link_failed');
          }
        } else {
          // Provisioning itself threw — no account, no link. Flag for backfill.
          await flagRespondentForBackfill('account_provision_failed');
        }
      }

      // If pending-NIN path, issue the pending_nin_complete magic-link now so
      // the user has the resume link AND the reminder worker has a token to
      // reference. Magic-link delivery is fire-and-forget — failure here does
      // NOT fail the registration (the reminder worker re-issues at T+2d).
      if (pendingNin) {
        try {
          const issued = await MagicLinkService.issueToken({
            email: normalisedEmail,
            purpose: 'pending_nin_complete',
            respondentId: respondent.id,
            requestedIp: req.ip,
            userAgent: req.get('user-agent') ?? undefined,
          });
          // Best-effort send.
          MagicLinkService.sendMagicLinkEmail({
            email: normalisedEmail,
            tokenPlaintext: issued.tokenPlaintext,
            purpose: 'pending_nin_complete',
            expiresAt: issued.expiresAt,
          }).catch((emailErr) => {
            logger.warn({
              event: 'wizard.pending_nin_email_failed',
              respondentId: respondent.id,
              err: emailErr,
            });
          });
          AuditService.logAction({
            actorId: null,
            action: AUDIT_ACTIONS.MAGIC_LINK_ISSUED,
            targetResource: 'magic_link_token',
            targetId: issued.id,
            details: {
              trigger: 'public_wizard_submit_pending_nin',
              email: normalisedEmail,
              purpose: 'pending_nin_complete',
              respondentId: respondent.id,
            },
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('user-agent') || 'unknown',
          });
        } catch (err) {
          logger.warn({
            event: 'wizard.pending_nin_token_failed',
            respondentId: respondent.id,
            err,
          });
        }
      }

      return res.status(201).json({
        status: 'ok',
        data: {
          respondentId: respondent.id,
          // Public-facing reference shown on the success screen (Story 9-54
          // review). The submissions UID — NOT the internal respondent PK — is
          // the sanctioned public reference: unique, non-enumerable, and the
          // cross-table forensic trace key support resolves a respondent by.
          submissionUid,
          // Story 9-58 — human-friendly application reference (OSL-YYYY-XXXXXX),
          // shown on the success screen + accepted by the public status check
          // and the 9-56 staff search.
          referenceCode,
          status: respondent.status,
          pendingNin,
          // Frontend uses this to decide next step:
          //   pending_nin_capture → "pending preview" screen
          //   active + authChoice=magic-link → request login magic-link
          //   active + authChoice=skip → request login magic-link (same path)
          //   active + authChoice=password → password-setup (Task 8 scope)
          authChoice: data.authChoice,
        },
      });
    } catch (error) {
      // Drizzle wraps Postgres uniqueness violations into the AppError flow
      // via the global error middleware. We just need to surface NIN_DUPLICATE
      // when a race slips past the read-then-write check above.
      if (error instanceof Error && /respondents_nin_unique_when_present/.test(error.message)) {
        return next(new AppError(
          'NIN_DUPLICATE',
          'This NIN was registered while you were submitting.',
          409,
        ));
      }
      next(error);
    }
  }

  /**
   * POST /api/v1/registration/supplemental
   *
   * Story 9-28 Path B — Cohort A supplemental-survey submission. Validates a
   * magic-link token (purpose=supplemental_survey), checks the respondent has
   * no existing submission (idempotency), then atomically consumes the token
   * and writes a `submissions` row whose `raw_data` is the union of identity
   * (sourced from `respondents`, not from input — operator can't modify
   * identity here) and the questionnaire responses (flat-spread to match the
   * wizard handler's storage shape, so analytics queries hit the same keys).
   */
  static async submitSupplementalSurvey(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = submitSupplementalSurveySchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('SUPPLEMENTAL_INVALID_INPUT', 'Invalid input', 400);
      }
      const { token, questionnaireResponses } = validation.data;

      const peeked = await MagicLinkService.peekToken({
        plaintext: token,
        purpose: 'supplemental_survey',
      });

      if (!peeked.respondentId) {
        throw new AppError(
          'SUPPLEMENTAL_TOKEN_NO_RESPONDENT',
          'Magic link is not associated with a respondent',
          400,
        );
      }

      const respondent = await db.query.respondents.findFirst({
        where: eq(respondents.id, peeked.respondentId),
      });
      if (!respondent) {
        throw new AppError('RESPONDENT_NOT_FOUND', 'Respondent not found', 404);
      }

      // Idempotency check BEFORE consume so user can retry harmlessly if they
      // already submitted (e.g., double-tap). Token is NOT burned on this
      // path — matches the complete-nin handler's "dedup-before-consume"
      // discipline.
      //
      // Scope-tightened (Awwal directive 2026-05-22): the check filters by
      // `questionnaireFormId = SUPPLEMENTAL_SURVEY_FORM_ID` so unrelated
      // submission rows (enumerator door-to-door, clerk-data-entry update)
      // for the same respondent DO NOT block a supplemental submission.
      // Without this scope, a respondent who got an enumerator visit between
      // their wizard-completion and their supplemental-email-click would be
      // permanently locked out of recovery (worst-case scenario: zero
      // supplemental data when we wanted a recovery path).
      //
      // M3 fix: return the existing submissionUid so the frontend can show
      // "you're already done" with a real reference instead of an error toast.
      const existing = await db.query.submissions.findFirst({
        where: and(
          eq(submissions.respondentId, peeked.respondentId),
          eq(submissions.questionnaireFormId, SUPPLEMENTAL_SURVEY_FORM_ID),
        ),
        columns: { id: true, submissionUid: true },
      });
      if (existing) {
        return res.status(409).json({
          status: 'error',
          error: {
            code: 'SUPPLEMENTAL_ALREADY_SUBMITTED',
            message: 'A supplemental-survey submission already exists for this respondent.',
          },
          data: { existingSubmissionUid: existing.submissionUid },
        });
      }

      const newSubmissionUid = uuidv7();
      const now = new Date();

      await db.transaction(async (tx) => {
        await MagicLinkService.consumeTokenTx(tx, {
          plaintext: token,
          purpose: 'supplemental_survey',
        });

        await tx.insert(submissions).values({
          submissionUid: newSubmissionUid,
          questionnaireFormId: SUPPLEMENTAL_SURVEY_FORM_ID,
          submitterId: null,
          respondentId: peeked.respondentId!,
          enumeratorId: null,
          rawData: {
            // Identity sourced from respondents (immutable in this endpoint).
            // L8 fix — consent fields default to false if the legacy
            // respondents row lacks them (defensive; Cohort A respondents
            // should have these per 9-12 schema, but the schema allows null).
            first_name: respondent.firstName,
            last_name: respondent.lastName,
            date_of_birth: respondent.dateOfBirth,
            phone_number: respondent.phoneNumber,
            lga_id: respondent.lgaId,
            nin: respondent.nin,
            consent_marketplace: respondent.consentMarketplace ?? false,
            consent_enriched: respondent.consentEnriched ?? false,
            email: peeked.email,
            // L9 fix — campaign tag so analytics can split supplemental
            // submissions from canonical wizard submissions when needed
            // (both share source='public' otherwise).
            campaign: 'cohort_a_supplemental_survey',
            // Step 4 questionnaire answers — flat-spread to match wizard
            // handler's storage shape; analytics queries already key off these.
            ...questionnaireResponses,
          } as Record<string, unknown>,
          gpsLatitude: null,
          gpsLongitude: null,
          completionTimeSeconds: null,
          submittedAt: now,
          source: 'public',
          processed: true,
          processedAt: now,
        });

        await AuditService.logActionTx(tx, {
          actorId: peeked.userId ?? null,
          action: AUDIT_ACTIONS.DATA_CREATE,
          targetResource: AUDIT_TARGETS.RESPONDENT,
          targetId: peeked.respondentId!,
          details: {
            trigger: 'supplemental_survey_submit',
            campaign: 'cohort_a_supplemental_survey',
            submissionUid: newSubmissionUid,
          },
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('user-agent') || 'unknown',
        });
      });

      logger.info({
        event: 'supplemental_survey.submission_written',
        respondentId: peeked.respondentId,
        submissionUid: newSubmissionUid,
      });

      return res.status(201).json({
        status: 'ok',
        data: { submissionUid: newSubmissionUid, respondentId: peeked.respondentId },
      });
    } catch (error) {
      next(error);
    }
  }
}
