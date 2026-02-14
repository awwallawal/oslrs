import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { NativeFormService } from '../services/native-form.service.js';
import { queueSubmissionForIngestion } from '../queues/webhook-ingestion.queue.js';
import { AppError } from '@oslsr/utils';
import { modulus11Check } from '@oslsr/utils/src/validation';
import { db } from '../db/index.js';
import { respondents } from '../db/schema/respondents.js';
import { users } from '../db/schema/users.js';
import { submissions } from '../db/schema/submissions.js';
import { eq, and, inArray } from 'drizzle-orm';

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
      const flattened = NativeFormService.flattenForRender(schema);

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
      const flattened = NativeFormService.flattenForRender(schema);

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

      const { submissionId, formId, responses, submittedAt, gpsLatitude, gpsLongitude } = parsed.data;
      const user = (req as Request & { user?: { sub: string; role?: string } }).user;
      const submitterId = user?.sub;

      const rawData: Record<string, unknown> = { ...responses };
      if (gpsLatitude != null) rawData._gpsLatitude = gpsLatitude;
      if (gpsLongitude != null) rawData._gpsLongitude = gpsLongitude;

      const jobId = await queueSubmissionForIngestion({
        source: FormController.getSubmissionSource(user?.role),
        submissionUid: submissionId,
        questionnaireFormId: formId,
        submitterId,
        submittedAt,
        rawData,
      });

      if (jobId) {
        res.status(201).json({ data: { id: jobId, status: 'queued' } });
      } else {
        res.status(200).json({ data: { id: null, status: 'duplicate' } });
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

      // Validate Modulus 11 checksum
      if (!modulus11Check(nin)) {
        return res.status(422).json({
          error: { code: 'INVALID_NIN_FORMAT', message: 'NIN failed Modulus 11 checksum validation' },
        });
      }

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
