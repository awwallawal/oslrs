import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { NativeFormService } from '../services/native-form.service.js';
import {
  validateSubmissionCompleteness,
  validateMinorGuardianConsent,
} from '../services/form-submission-validation.service.js';
import { queueSubmissionForIngestion } from '../queues/webhook-ingestion.queue.js';
import { ReferenceCodeService } from '../services/reference-code.service.js';
import { AppError } from '@oslsr/utils';
import { db } from '../db/index.js';
import { respondents } from '../db/schema/respondents.js';
import { users } from '../db/schema/users.js';
import { submissions } from '../db/schema/submissions.js';
import { eq, and, inArray, count, sql, gte } from 'drizzle-orm';
import { UserRole } from '@oslsr/types';

const checkNinBodySchema = z.object({
  nin: z.string().length(11).regex(/^\d{11}$/, 'NIN must be 11 digits'),
});

const submitFormSchema = z.object({
  submissionId: z.string().uuid(),
  formId: z.string().uuid(),
  formVersion: z.string(),
  responses: z.record(z.unknown()),
  gpsLatitude: z.number().optional(),
  gpsLongitude: z.number().optional(),
  submittedAt: z.string().datetime(),
  completionTimeSeconds: z.number().int().nonnegative().optional(),
});

export class FormController {
  /**
   * Derive submission source from user role.
   */
  static getSubmissionSource(role?: string): 'public' | 'enumerator' | 'clerk' | 'webapp' {
    if (role === 'public_user') return 'public';
    if (role === 'enumerator') return 'enumerator';
    if (role === 'data_entry_clerk') return 'clerk';
    return 'webapp';
  }

  /**
   * GET /api/v1/forms/public-active
   *
   * Story 9-12 Task 5.4.2 — Public-wizard form discovery (Option B).
   * UNAUTHENTICATED: the public registration wizard renders this form before
   * the respondent has an account. Returns the flattened render schema for
   * the form pinned by the `wizard.public_form_id` setting. 404
   * (PUBLIC_FORM_NOT_CONFIGURED) when the setting is null or the pinned form
   * isn't published — the frontend treats that as an empty-state and skips
   * Step 4.
   */
  static async getPublicActiveForm(_req: Request, res: Response, next: NextFunction) {
    try {
      const form = await NativeFormService.getPublicActiveForm();
      res.json({ data: form });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/forms/published
   * List all published questionnaire forms available for data collection.
   */
  static async listPublishedForms(req: Request, res: Response, next: NextFunction) {
    try {
      const forms = await NativeFormService.listPublished();

      res.json({ data: forms });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/forms/:id/render
   * Get flattened form for one-question-per-screen rendering.
   */
  static async getFormForRender(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const schema = await NativeFormService.getPublishedFormSchema(id);
      // Story 9-33 Bug #1: the `:id` URL param IS the questionnaire_forms row PK
      // (getPublishedFormSchema looks up by id). Pass it through so the rendered
      // formId matches what submission-ingestion expects — no second DB query needed.
      const flattened = NativeFormService.flattenForRender(schema, id);

      res.json({ data: flattened });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/forms/:id/preview
   * Super Admin preview — returns flattened form regardless of status.
   */
  static async previewForm(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const schema = await NativeFormService.getFormSchema(id);
      // Story 9-33 Bug #1: `:id` URL param IS the questionnaire_forms row PK.
      const flattened = NativeFormService.flattenForRender(schema, id);

      res.json({ data: flattened });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/forms/submissions
   * Accept a form submission from the mobile/web client and queue for ingestion.
   */
  static async submitForm(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = submitFormSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          parsed.error.issues.map((i) => i.message).join(', '),
          400,
        );
      }

      const { submissionId, formId, responses, submittedAt, gpsLatitude, gpsLongitude, completionTimeSeconds } = parsed.data;
      const user = (req as Request & { user?: { sub: string; role?: string } }).user;
      const submitterId = user?.sub;

      // Story 9-54 AC5 — enforce required-answer completeness SYNCHRONOUSLY,
      // BEFORE queueing for async ingestion (post-HTTP-200 is too late). Also
      // recompute `calculate` fields (AC1.3) authoritatively for persistence.
      const schema = await NativeFormService.getFormSchema(formId);
      const flattened = NativeFormService.flattenForRender(schema, formId);
      const pendingNin = responses['_pendingNin'] === true;
      const { computed } = validateSubmissionCompleteness(flattened, responses, {
        pendingNin,
        today: new Date(),
      });

      // Story 9-55 — minor age-gate, enforced SYNCHRONOUSLY before queueing
      // (post-HTTP-200 ingestion is too late to reject). Keys on the
      // server-recomputed `computed.age`. Guardian persistence + audit happen
      // in the async ingestion worker (submission-processing.service) where the
      // already-validated guardian answers land via the queued rawData.
      validateMinorGuardianConsent(
        responses,
        typeof computed.age === 'number' ? computed.age : null,
      );

      const rawData: Record<string, unknown> = { ...responses, ...computed };
      if (gpsLatitude != null) rawData._gpsLatitude = gpsLatitude;
      if (gpsLongitude != null) rawData._gpsLongitude = gpsLongitude;
      if (completionTimeSeconds != null) rawData._completionTimeSeconds = completionTimeSeconds;

      // Story 9-58 (AC5.2) — the enumerator/clerk path is async (queued). The
      // SERVER is authoritative for the persisted reference code (review M2,
      // operator-approved 2026-06-15): we ALWAYS mint server-side here and
      // OVERWRITE any client-supplied `_referenceCode`. A client may mint a
      // provisional code for instant/offline DISPLAY, but it is never trusted
      // for the persisted value. The server code is threaded into the queued
      // rawData so the ingestion worker assigns this EXACT code to the NEW
      // respondent, and echoed below so the client can reconcile its
      // provisional with the canonical value.
      // (NIN-completion merges keep the existing pending row's code — a rare
      // edge where the echoed code differs; the dominant field case is a new
      // active respondent. Documented in 9-58 Dev Notes.)
      const referenceCode = await ReferenceCodeService.generateUnique(db);
      rawData._referenceCode = referenceCode;

      const jobId = await queueSubmissionForIngestion({
        source: FormController.getSubmissionSource(user?.role),
        submissionUid: submissionId,
        questionnaireFormId: formId,
        submitterId,
        submittedAt,
        rawData,
      });

      if (jobId) {
        res.status(201).json({ data: { id: jobId, status: 'queued', referenceCode } });
      } else {
        // Duplicate submissionUid — no NEW respondent created, so don't echo a
        // (now-unused) code; the original submission already owns one.
        res.status(200).json({ data: { id: null, status: 'duplicate', referenceCode: null } });
      }
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/forms/check-nin
   * Pre-submission NIN availability check (AC 3.7.3).
   */
  static async checkNin(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = checkNinBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          parsed.error.issues.map((i) => i.message).join(', '),
          400,
        );
      }

      const { nin } = parsed.data;

      // Format-only validation (schema above). No checksum exists for NINs —
      // "11 randomly generated, non-intelligible digits" (NIMC, Story 13-15).

      // Check respondents table first (AC 3.7.2 — respondents takes priority)
      const respondent = await db.query.respondents.findFirst({
        where: eq(respondents.nin, nin),
        columns: { createdAt: true },
      });
      if (respondent) {
        return res.json({
          data: {
            available: false,
            reason: 'respondent',
            registeredAt: respondent.createdAt.toISOString(),
          },
        });
      }

      // Check users table
      const user = await db.query.users.findFirst({
        where: eq(users.nin, nin),
        columns: { id: true },
      });
      if (user) {
        return res.json({
          data: { available: false, reason: 'staff' },
        });
      }

      res.json({ data: { available: true } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/forms/submissions/my-counts
   * Return per-form submission counts for the authenticated user.
   * Optional ?scope=team for supervisors — returns LGA-filtered team totals.
   */
  static async getMySubmissionCounts(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string; lgaId?: string } }).user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const scope = req.query.scope as string | undefined;

      // scope=team requires SUPERVISOR role with lgaId
      if (scope === 'team') {
        if (user.role !== UserRole.SUPERVISOR) {
          throw new AppError('FORBIDDEN', 'Team scope requires supervisor role', 403);
        }
        if (!user.lgaId) {
          throw new AppError('LGA_REQUIRED', 'Supervisor must be assigned to an LGA', 403);
        }
      }

      const isTeamScope = scope === 'team' && user.role === UserRole.SUPERVISOR && user.lgaId;

      const submitterFilter = isTeamScope
        ? sql`${submissions.submitterId}::uuid IN (SELECT id FROM users WHERE lga_id = ${user.lgaId})`
        : eq(submissions.submitterId, user.sub);

      // Count all submissions — processed flag tracks respondent-extraction
      // pipeline status, not submission validity (deduped by submissionUid)
      const rows = await db
        .select({
          formId: submissions.questionnaireFormId,
          count: count(),
        })
        .from(submissions)
        .where(submitterFilter)
        .groupBy(submissions.questionnaireFormId);

      const countsMap: Record<string, number> = {};
      for (const row of rows) {
        countsMap[row.formId] = Number(row.count);
      }

      res.json({ data: countsMap });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/forms/submissions/daily-counts
   * Return daily submission counts for the last N days.
   * Supervisor role gets LGA-filtered team aggregates; others get personal counts.
   */
  static async getDailySubmissionCounts(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string; lgaId?: string } }).user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      // Whitelist days param to 7 or 30
      const daysParam = parseInt(req.query.days as string, 10);
      const days = daysParam === 30 ? 30 : 7;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setUTCHours(0, 0, 0, 0);

      // Supervisor with lgaId gets team-level data
      const isSupervisor = user.role === UserRole.SUPERVISOR && user.lgaId;

      const submitterFilter = isSupervisor
        ? sql`${submissions.submitterId}::uuid IN (SELECT id FROM users WHERE lga_id = ${user.lgaId})`
        : eq(submissions.submitterId, user.sub);

      // Count all submissions in range — processed flag tracks pipeline
      // status, not validity (deduped by submissionUid)
      const rows = await db
        .select({
          date: sql<string>`DATE(${submissions.submittedAt})`.as('date'),
          count: count(),
        })
        .from(submissions)
        .where(
          and(
            submitterFilter,
            gte(submissions.submittedAt, startDate),
          ),
        )
        .groupBy(sql`DATE(${submissions.submittedAt})`)
        .orderBy(sql`DATE(${submissions.submittedAt})`);

      const data = rows.map((row) => ({
        date: String(row.date),
        count: Number(row.count),
      }));

      res.json({ data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/forms/submissions/status
   * Poll submission processing status (AC 3.7.6).
   */
  static async getSubmissionStatuses(req: Request, res: Response, next: NextFunction) {
    try {
      const uids = (req.query.uids as string)?.split(',').filter(Boolean) ?? [];
      if (uids.length === 0 || uids.length > 50) {
        throw new AppError(
          'INVALID_UIDS',
          'Provide 1-50 submission UIDs',
          400,
        );
      }

      const reqUser = (req as Request & { user?: { sub: string } }).user;
      if (!reqUser?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      // Only return statuses for the requesting user's submissions
      const results = await db.query.submissions.findMany({
        where: and(
          inArray(submissions.submissionUid, uids),
          eq(submissions.submitterId, reqUser.sub),
        ),
        columns: { submissionUid: true, processed: true, processingError: true },
      });

      const statusMap = Object.fromEntries(
        results.map((s) => [s.submissionUid, {
          processed: s.processed,
          processingError: s.processingError,
        }])
      );

      res.json({ data: statusMap });
    } catch (err) {
      next(err);
    }
  }
}
