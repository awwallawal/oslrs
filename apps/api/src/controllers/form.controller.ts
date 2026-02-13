import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { NativeFormService } from '../services/native-form.service.js';
import { queueSubmissionForIngestion } from '../queues/webhook-ingestion.queue.js';
import { AppError } from '@oslsr/utils';

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
      const submitterId = (req as Request & { user?: { sub: string } }).user?.sub;

      const rawData: Record<string, unknown> = { ...responses };
      if (gpsLatitude != null) rawData._gpsLatitude = gpsLatitude;
      if (gpsLongitude != null) rawData._gpsLongitude = gpsLongitude;

      const jobId = await queueSubmissionForIngestion({
        source: 'webapp',
        submissionUid: submissionId,
        formXmlId: formId,
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
}
