/**
 * Verification Analytics Controller
 *
 * Story 8.4: Assessor Verification Analytics & Quality Dashboard
 * Accessible by: Super Admin, Verification Assessor, Government Official (read-only)
 */

import type { Request, Response, NextFunction } from 'express';
import { VerificationAnalyticsService } from '../services/verification-analytics.service.js';
import { fraudSeverities, Lga } from '@oslsr/types';
import { AppError } from '@oslsr/utils';

const VALID_LGA_VALUES = new Set(Object.values(Lga) as string[]);

export class VerificationAnalyticsController {
  static async getVerificationPipeline(req: Request, res: Response, next: NextFunction) {
    try {
      const { lgaId, severity, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

      // Validate lgaId
      if (lgaId && !VALID_LGA_VALUES.has(lgaId)) {
        throw new AppError('VALIDATION_ERROR', `Invalid LGA: ${lgaId}`, 400);
      }

      // Parse severity as comma-separated multi-select
      let severityValues: string[] | undefined;
      if (severity) {
        severityValues = severity.split(',').map(s => s.trim()).filter(Boolean);
        for (const sv of severityValues) {
          if (!(fraudSeverities as readonly string[]).includes(sv)) {
            throw new AppError('VALIDATION_ERROR', `Invalid severity: ${sv}`, 400);
          }
        }
      }

      // Validate date format (basic ISO check)
      if (dateFrom && isNaN(Date.parse(dateFrom))) {
        throw new AppError('VALIDATION_ERROR', 'Invalid dateFrom format', 400);
      }
      if (dateTo && isNaN(Date.parse(dateTo))) {
        throw new AppError('VALIDATION_ERROR', 'Invalid dateTo format', 400);
      }

      const data = await VerificationAnalyticsService.getFullPipelineData({
        lgaId,
        severity: severityValues,
        dateFrom,
        dateTo,
      });

      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
}
