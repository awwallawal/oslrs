/**
 * Fraud Detections Controller
 *
 * Handles fraud detection queries and review workflow.
 * Accessible by Supervisor (scope-restricted), Assessor, and Super Admin.
 *
 * Supervisor scope restriction: Only see detections for their assigned enumerators
 * (via team assignments or LGA fallback from prep-8).
 *
 * Created in Story 4.3 (Fraud Engine Configurable Thresholds).
 * @see ADR-003 — Fraud Detection Engine Design
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { fraudDetections, submissions } from '../db/schema/index.js';
import { eq, and, gte, lte, inArray, isNull, desc, sql } from 'drizzle-orm';
import { reviewFraudDetectionSchema, fraudSeverities, fraudResolutions } from '@oslsr/types';
import { AppError } from '@oslsr/utils';
import { TeamAssignmentService } from '../services/team-assignment.service.js';
import pino from 'pino';

const logger = pino({ name: 'fraud-detections-controller' });

export class FraudDetectionsController {
  /**
   * GET /api/v1/fraud-detections
   * Filtered list with pagination. Supervisor scope restricted.
   *
   * Query params: severity, resolution, enumeratorId, dateFrom, dateTo, page, pageSize
   */
  static async listDetections(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string } }).user;
      if (!user?.sub) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

      const {
        severity,
        resolution,
        enumeratorId,
        dateFrom,
        dateTo,
        page = '1',
        pageSize = '20',
      } = req.query as Record<string, string | undefined>;

      const pageNum = Math.max(1, parseInt(page ?? '1', 10));
      const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize ?? '20', 10)));
      const offset = (pageNum - 1) * pageSizeNum;

      // Build conditions array
      const conditions = [];

      // Supervisor scope restriction
      if (user.role === 'supervisor') {
        const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(user.sub);
        if (enumeratorIds.length === 0) {
          // Supervisor has no assigned enumerators — return empty
          res.json({ data: [], total: 0, page: pageNum, pageSize: pageSizeNum });
          return;
        }
        conditions.push(inArray(fraudDetections.enumeratorId, enumeratorIds));
      }

      // Filters (validate enum values to prevent DB errors)
      if (severity) {
        if (!(fraudSeverities as readonly string[]).includes(severity)) {
          throw new AppError('VALIDATION_ERROR', `Invalid severity: ${severity}. Must be one of: ${fraudSeverities.join(', ')}`, 400);
        }
        conditions.push(eq(fraudDetections.severity, severity as typeof fraudDetections.severity.enumValues[number]));
      }

      if (resolution === 'unreviewed') {
        conditions.push(isNull(fraudDetections.resolution));
      } else if (resolution) {
        if (!(fraudResolutions as readonly string[]).includes(resolution)) {
          throw new AppError('VALIDATION_ERROR', `Invalid resolution: ${resolution}. Must be one of: unreviewed, ${fraudResolutions.join(', ')}`, 400);
        }
        conditions.push(eq(fraudDetections.resolution, resolution as typeof fraudDetections.resolution.enumValues[number]));
      }

      if (enumeratorId) {
        conditions.push(eq(fraudDetections.enumeratorId, enumeratorId));
      }

      if (dateFrom) {
        conditions.push(gte(fraudDetections.computedAt, new Date(dateFrom)));
      }

      if (dateTo) {
        conditions.push(lte(fraudDetections.computedAt, new Date(dateTo)));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Count total
      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(fraudDetections)
        .where(whereClause);

      // Fetch page
      const rows = await db
        .select()
        .from(fraudDetections)
        .where(whereClause)
        .orderBy(desc(fraudDetections.computedAt))
        .limit(pageSizeNum)
        .offset(offset);

      res.json({
        data: rows,
        total: countResult?.count ?? 0,
        page: pageNum,
        pageSize: pageSizeNum,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/fraud-detections/:id/review
   * Resolve a fraud detection (set resolution, notes, reviewer).
   */
  static async reviewDetection(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string } }).user;
      if (!user?.sub) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

      const { id } = req.params;

      const parsed = reviewFraudDetectionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          parsed.error.issues.map((i) => i.message).join(', '),
          400,
        );
      }

      const { resolution, resolutionNotes } = parsed.data;

      // Verify detection exists
      const [existing] = await db
        .select({ id: fraudDetections.id, enumeratorId: fraudDetections.enumeratorId })
        .from(fraudDetections)
        .where(eq(fraudDetections.id, id))
        .limit(1);

      if (!existing) {
        throw new AppError('NOT_FOUND', 'Fraud detection not found', 404);
      }

      // Supervisor scope check
      if (user.role === 'supervisor') {
        const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(user.sub);
        if (!enumeratorIds.includes(existing.enumeratorId)) {
          throw new AppError('FORBIDDEN', 'Not authorized to review this detection', 403);
        }
      }

      const [updated] = await db
        .update(fraudDetections)
        .set({
          reviewedBy: user.sub,
          reviewedAt: new Date(),
          resolution,
          resolutionNotes: resolutionNotes ?? null,
        })
        .where(eq(fraudDetections.id, id))
        .returning();

      logger.info({
        event: 'fraud.detection.reviewed',
        detectionId: id,
        reviewerId: user.sub,
        resolution,
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  }
}
