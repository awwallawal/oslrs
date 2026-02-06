import { Request, Response, NextFunction } from 'express';
import { QuestionnaireService } from '../services/questionnaire.service.js';
import { AppError } from '@oslsr/utils';
import {
  updateStatusSchema,
  listQuestionnairesQuerySchema,
  uploadQuestionnaireSchema,
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
}
