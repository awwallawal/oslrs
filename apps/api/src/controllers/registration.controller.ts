import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import { db } from '../db/index.js';
import { respondents, wizardDrafts, type WizardDraftData } from '../db/schema/index.js';
import { MagicLinkService } from '../services/magic-link.service.js';
import { AuditService, AUDIT_ACTIONS } from '../services/audit.service.js';
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
      fullName: z.string().max(200).optional(),
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
  fullName: z.string().min(2).max(200),
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
  authChoice: z.enum(['magic-link', 'password', 'skip']).default('magic-link'),
});

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
        targetResource: 'respondent',
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
        targetResource: 'respondent',
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

      // Code review H4 (2026-05-11) — parse fullName carefully. For
      // single-token names (e.g. "Adebayo") store firstName only and leave
      // lastName NULL — DO NOT duplicate the first token into both columns,
      // which silently corrupts the race-resolution merge keyed on
      // `lower(first_name)+lower(last_name)+phone`. Multi-token names use
      // first-chunk as firstName and the rest joined as lastName.
      const trimmed = data.fullName.trim().replace(/\s+/g, ' ');
      const firstSpace = trimmed.indexOf(' ');
      const firstName = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
      const lastName = firstSpace === -1 ? null : trimmed.slice(firstSpace + 1);

      const status = pendingNin ? 'pending_nin_capture' : 'active';
      const metadata: Record<string, unknown> = {};
      if (pendingNin) {
        metadata.defer_reason_nin = data.deferReasonNin ?? 'public_wizard_user_self_deferred';
      }

      // Code review M6 (2026-05-11) — wrap insert + audit + draft delete in
      // one transaction so an audit-write failure rolls back the row,
      // preserving the audit chain integrity.
      const { respondent } = await db.transaction(async (tx) => {
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
            metadata: Object.keys(metadata).length > 0 ? (metadata as never) : null,
          })
          .returning({
            id: respondents.id,
            status: respondents.status,
          });
        const row = insertRows[0];

        await AuditService.logActionTx(tx, {
          actorId: null,
          action: pendingNin
            ? AUDIT_ACTIONS.PENDING_NIN_CREATED
            : AUDIT_ACTIONS.DATA_CREATE,
          targetResource: 'respondent',
          targetId: row.id,
          details: {
            trigger: 'public_wizard_submit',
            email: normalisedEmail,
            lgaId: data.lgaId,
            ninProvided: !!ninValue,
            pendingNin,
          },
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('user-agent') || 'unknown',
        });

        // Burn the server-side draft — submission is final. Inside the
        // transaction so a draft-delete failure rolls everything back; cleaner
        // than the prior fire-and-forget approach that left a stale row on
        // partial failure.
        await tx.delete(wizardDrafts).where(eq(wizardDrafts.email, normalisedEmail));

        return { respondent: row };
      });

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
}
