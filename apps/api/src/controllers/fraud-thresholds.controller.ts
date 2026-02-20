/**
 * Fraud Thresholds Controller
 *
 * Handles Super Admin CRUD for fraud detection threshold configuration.
 * Thresholds use temporal versioning (INSERT new, never UPDATE).
 *
 * Created in Story 4.3 (Fraud Engine Configurable Thresholds).
 * @see ADR-003 — Fraud Detection Engine Design
 */

import type { Request, Response, NextFunction } from 'express';
import { FraudConfigService } from '../services/fraud-config.service.js';
import { updateThresholdSchema } from '@oslsr/types';
import { AppError } from '@oslsr/utils';

export class FraudThresholdsController {
  /**
   * GET /api/v1/fraud-thresholds
   * List all active thresholds, grouped by category.
   */
  static async listThresholds(_req: Request, res: Response, next: NextFunction) {
    try {
      const grouped = await FraudConfigService.getThresholdsByCategory();
      res.json({ data: grouped });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/v1/fraud-thresholds/:ruleKey
   * Create a new threshold version (temporal versioning — never UPDATE).
   */
  static async updateThreshold(req: Request, res: Response, next: NextFunction) {
    try {
      const { ruleKey } = req.params;
      const user = (req as Request & { user?: { sub: string } }).user;
      const adminId = user?.sub;

      if (!adminId) {
        throw new AppError('UNAUTHORIZED', 'Admin user ID required', 401);
      }

      if (!ruleKey) {
        throw new AppError('VALIDATION_ERROR', 'Rule key is required', 400);
      }

      const parsed = updateThresholdSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          parsed.error.issues.map((i) => i.message).join(', '),
          400,
        );
      }

      const { thresholdValue, weight, severityFloor, isActive, notes } = parsed.data;

      const updated = await FraudConfigService.updateThreshold(
        ruleKey,
        thresholdValue,
        adminId,
        { weight, severityFloor, isActive, notes },
      );

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  }
}
