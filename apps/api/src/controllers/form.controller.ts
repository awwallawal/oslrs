import { Request, Response, NextFunction } from 'express';
import { NativeFormService } from '../services/native-form.service.js';

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
}
