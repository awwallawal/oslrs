import { Request, Response, NextFunction } from 'express';
import { QuestionnaireService } from '../services/questionnaire.service.js';
import { NativeFormService } from '../services/native-form.service.js';
import { AppError } from '@oslsr/utils';
import {
  updateStatusSchema,
  listQuestionnairesQuerySchema,
  uploadQuestionnaireSchema,
  createNativeFormRequestSchema,
  nativeFormSchema,
} from '@oslsr/types';

export class QuestionnaireController {
  /**
   * POST /api/v1/questionnaires/upload
   * Upload a new XLSForm file
   */
  static async upload(req: Request, res: Response, next: NextFunction) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userId = (req as any).user?.sub;
      if (!userId) throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);

      if (!req.file) {
        throw new AppError('FILE_REQUIRED', 'No file uploaded', 400);
      }

      const bodyParsed = uploadQuestionnaireSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        throw new AppError('VALIDATION_ERROR', bodyParsed.error.issues[0].message, 400);
      }
      const changeNotes = bodyParsed.data.changeNotes;

      const result = await QuestionnaireService.uploadForm(
        {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        },
        userId,
        changeNotes
      );

      res.status(201).json({
        data: {
          id: result.id,
          formId: result.formId,
          version: result.version,
          title: result.title,
          status: result.status,
        },
        validation: result.validation,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/questionnaires
   * List all questionnaire forms with pagination
   */
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listQuestionnairesQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
      }

      const result = await QuestionnaireService.listForms(parsed.data);

      res.json({
        data: result.data,
        meta: result.meta,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/questionnaires/:id
   * Get a specific questionnaire form with its versions
   */
  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const form = await QuestionnaireService.getFormById(id);

      if (!form) {
        throw new AppError('FORM_NOT_FOUND', 'Questionnaire form not found', 404);
      }

      res.json({
        data: form,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/questionnaires/form/:formId/versions
   * Get version history for a logical form_id
   */
  static async getVersions(req: Request, res: Response, next: NextFunction) {
    try {
      const { formId } = req.params;

      const versions = await QuestionnaireService.getFormVersions(formId);

      if (versions.length === 0) {
        throw new AppError('FORM_NOT_FOUND', 'No forms found with this form_id', 404);
      }

      res.json({
        data: versions,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/questionnaires/:id/status
   * Update questionnaire status
   */
  static async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userId = (req as any).user?.sub;
      if (!userId) throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);

      const { id } = req.params;

      const parsed = updateStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
      }

      await QuestionnaireService.updateFormStatus(id, parsed.data.status, userId);

      const updatedForm = await QuestionnaireService.getFormById(id);

      res.json({
        data: updatedForm,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/questionnaires/:id
   * Delete a draft questionnaire
   */
  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userId = (req as any).user?.sub;
      if (!userId) throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);

      const { id } = req.params;

      await QuestionnaireService.deleteForm(id, userId);

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/questionnaires/:id/download
   * Download the original XLSForm file
   */
  static async download(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const file = await QuestionnaireService.downloadForm(id);

      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.send(file.buffer);
    } catch (err) {
      next(err);
    }
  }

  // ── Native Form Endpoints ────────────────────────────────────────────────

  /**
   * POST /api/v1/questionnaires/native
   * Create a new native form
   */
  static async createNativeForm(req: Request, res: Response, next: NextFunction) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userId = (req as any).user?.sub;
      if (!userId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

      const parsed = createNativeFormRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
      }

      const result = await NativeFormService.createForm(parsed.data, userId);

      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/questionnaires/:id/schema
   * Get native form schema
   */
  static async getFormSchema(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const schema = await NativeFormService.getFormSchema(id);
      res.json({ data: schema });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/v1/questionnaires/:id/schema
   * Update native form schema
   */
  static async updateFormSchema(req: Request, res: Response, next: NextFunction) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userId = (req as any).user?.sub;
      if (!userId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

      const { id } = req.params;

      const parsed = nativeFormSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', parsed.error.issues[0].message, 400, {
          issues: parsed.error.issues,
        });
      }

      await NativeFormService.updateFormSchema(id, parsed.data, userId);

      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/questionnaires/:id/publish
   * Publish a native form
   */
  static async publishNativeForm(req: Request, res: Response, next: NextFunction) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userId = (req as any).user?.sub;
      if (!userId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

      const { id } = req.params;
      const result = await NativeFormService.publishForm(id, userId);

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/questionnaires/:id/preview
   * Get flattened form for preview/rendering
   */
  static async getFormPreview(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const schema = await NativeFormService.getFormSchema(id);
      const flattened = NativeFormService.flattenForRender(schema);

      res.json({ data: flattened });
    } catch (err) {
      next(err);
    }
  }
}
