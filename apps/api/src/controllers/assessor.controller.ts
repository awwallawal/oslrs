/**
 * Assessor Controller
 *
 * Handles assessor audit queue operations: listing, filtering, reviewing.
 * Accessible by verification_assessor and super_admin only.
 *
 * Created in Story 5.2 (Verification Assessor Audit Queue).
 */

import type { Request, Response, NextFunction } from 'express';
import { AssessorService } from '../services/assessor.service.js';
import { assessorReviewSchema, fraudSeverities, Lga } from '@oslsr/types';
import { AppError } from '@oslsr/utils';

const VALID_LGA_VALUES = new Set(Object.values(Lga) as string[]);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AssessorController {
  /**
   * GET /api/v1/assessor/audit-queue
   * Paginated queue with filters.
   */
  static async getAuditQueue(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        lgaId,
        severity,
        supervisorResolution,
        dateFrom,
        dateTo,
        enumeratorName,
        page = '1',
        pageSize = '20',
      } = req.query as Record<string, string | undefined>;

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

      const result = await AssessorService.getAuditQueue({
        lgaId,
        severity: severityValues,
        supervisorResolution,
        dateFrom,
        dateTo,
        enumeratorName,
        page: parseInt(page ?? '1', 10),
        pageSize: parseInt(pageSize ?? '20', 10),
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/assessor/completed
   * Completed reviews with filters.
   */
  static async getCompletedReviews(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        assessorDecision,
        dateFrom,
        dateTo,
        severity,
        page = '1',
        pageSize = '20',
      } = req.query as Record<string, string | undefined>;

      let severityValues: string[] | undefined;
      if (severity) {
        severityValues = severity.split(',').map(s => s.trim()).filter(Boolean);
        for (const sv of severityValues) {
          if (!(fraudSeverities as readonly string[]).includes(sv)) {
            throw new AppError('VALIDATION_ERROR', `Invalid severity: ${sv}`, 400);
          }
        }
      }

      const result = await AssessorService.getCompletedReviews({
        assessorDecision,
        dateFrom,
        dateTo,
        severity: severityValues,
        page: parseInt(page ?? '1', 10),
        pageSize: parseInt(pageSize ?? '20', 10),
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/assessor/stats
   * Queue counts and severity breakdown.
   */
  static async getQueueStats(_req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await AssessorService.getQueueStats();
      res.json({ data: stats });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/assessor/recent-activity
   * Last 5 assessor review actions.
   */
  static async getRecentActivity(_req: Request, res: Response, next: NextFunction) {
    try {
      const activity = await AssessorService.getRecentActivity(5);
      res.json({ data: activity });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/assessor/review/:detectionId
   * Final approve or reject a fraud detection.
   */
  static async reviewDetection(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string } }).user;
      if (!user?.sub) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

      const { detectionId } = req.params;
      if (!UUID_REGEX.test(detectionId)) {
        throw new AppError('VALIDATION_ERROR', 'Invalid detection ID format', 400);
      }

      const parsed = assessorReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          parsed.error.issues.map((i) => i.message).join(', '),
          400,
        );
      }

      const { assessorResolution, assessorNotes } = parsed.data;

      const result = await AssessorService.reviewDetection({
        detectionId,
        assessorResolution,
        assessorNotes,
        actorId: user.sub,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
