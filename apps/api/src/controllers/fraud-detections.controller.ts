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
import { fraudDetections, submissions, users, questionnaireForms } from '../db/schema/index.js';
import { eq, and, gte, lte, inArray, isNull, isNotNull, desc, sql, not } from 'drizzle-orm';
import { reviewFraudDetectionSchema, fraudSeverities, fraudResolutions } from '@oslsr/types';
import { AppError } from '@oslsr/utils';
import { TeamAssignmentService } from '../services/team-assignment.service.js';
import pino from 'pino';

const logger = pino({ name: 'fraud-detections-controller' });

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Helper to cast numeric(5,2) string values to numbers.
 * Drizzle returns numeric columns as strings — we must parseFloat before sending to frontend.
 */
function castScores<T extends Record<string, unknown>>(row: T): T {
  const scoreKeys = ['gpsScore', 'speedScore', 'straightlineScore', 'duplicateScore', 'timingScore', 'totalScore'] as const;
  const result = { ...row };
  for (const key of scoreKeys) {
    if (key in result && typeof result[key] === 'string') {
      (result as Record<string, unknown>)[key] = parseFloat(result[key] as string);
    }
  }
  return result;
}

export class FraudDetectionsController {
  /**
   * GET /api/v1/fraud-detections
   * Filtered list with pagination and enriched JOINs. Supervisor scope restricted.
   *
   * Story 4.4: Extended to include enumerator name, submission timestamp, form title.
   * Query params: severity (comma-separated), reviewed (boolean), page, pageSize
   */
  static async listDetections(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string } }).user;
      if (!user?.sub) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

      const {
        severity,
        reviewed,
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
          res.json({ data: [], page: pageNum, pageSize: pageSizeNum, totalPages: 0, totalItems: 0 });
          return;
        }
        conditions.push(inArray(fraudDetections.enumeratorId, enumeratorIds));
      }

      // Severity filter — supports comma-separated multi-select (e.g., "high,critical")
      if (severity) {
        const severityValues = severity.split(',').map(s => s.trim()).filter(Boolean);
        for (const sv of severityValues) {
          if (!(fraudSeverities as readonly string[]).includes(sv)) {
            throw new AppError('VALIDATION_ERROR', `Invalid severity: ${sv}. Must be one of: ${fraudSeverities.join(', ')}`, 400);
          }
        }
        type SeverityEnum = typeof fraudDetections.severity.enumValues[number];
        if (severityValues.length === 1) {
          conditions.push(eq(fraudDetections.severity, severityValues[0] as SeverityEnum));
        } else if (severityValues.length > 1) {
          conditions.push(inArray(fraudDetections.severity, severityValues as SeverityEnum[]));
        }
      } else {
        // Default: exclude 'clean' severity (AC4.4.2)
        conditions.push(not(eq(fraudDetections.severity, 'clean')));
      }

      // Resolution filter — "true" = reviewed (any resolution), "false" = unreviewed (null)
      if (reviewed === 'true') {
        conditions.push(isNotNull(fraudDetections.resolution));
      } else if (reviewed === 'false') {
        conditions.push(isNull(fraudDetections.resolution));
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

      // Count total (with JOINs for scope filtering)
      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(fraudDetections)
        .innerJoin(submissions, eq(fraudDetections.submissionId, submissions.id))
        .innerJoin(users, eq(fraudDetections.enumeratorId, users.id))
        .where(whereClause);

      const totalItems = countResult?.count ?? 0;

      // Fetch enriched page with JOINs (Story 4.4: enumerator name, submission timestamp, form title)
      const rows = await db
        .select({
          id: fraudDetections.id,
          submissionId: fraudDetections.submissionId,
          enumeratorId: fraudDetections.enumeratorId,
          computedAt: fraudDetections.computedAt,
          totalScore: fraudDetections.totalScore,
          severity: fraudDetections.severity,
          resolution: fraudDetections.resolution,
          resolutionNotes: fraudDetections.resolutionNotes,
          reviewedAt: fraudDetections.reviewedAt,
          reviewedBy: fraudDetections.reviewedBy,
          enumeratorName: users.fullName,
          submittedAt: submissions.submittedAt,
        })
        .from(fraudDetections)
        .innerJoin(submissions, eq(fraudDetections.submissionId, submissions.id))
        .innerJoin(users, eq(fraudDetections.enumeratorId, users.id))
        .where(whereClause)
        .orderBy(desc(fraudDetections.computedAt))
        .limit(pageSizeNum)
        .offset(offset);

      // Cast numeric scores to numbers
      const data = rows.map(row => ({
        ...row,
        totalScore: parseFloat(row.totalScore),
      }));

      res.json({
        data,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.ceil(totalItems / pageSizeNum),
        totalItems,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/fraud-detections/:id
   * Detail endpoint with enriched JOINs for evidence panel.
   * Story 4.4 Task 1: Returns full detection with submission GPS, enumerator info, form title.
   */
  static async getDetection(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string } }).user;
      if (!user?.sub) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

      const { id } = req.params;
      if (!UUID_REGEX.test(id)) {
        throw new AppError('VALIDATION_ERROR', 'Invalid detection ID format', 400);
      }

      const [detection] = await db
        .select({
          // fraud_detections fields
          id: fraudDetections.id,
          submissionId: fraudDetections.submissionId,
          enumeratorId: fraudDetections.enumeratorId,
          computedAt: fraudDetections.computedAt,
          configSnapshotVersion: fraudDetections.configSnapshotVersion,
          // Component scores
          gpsScore: fraudDetections.gpsScore,
          speedScore: fraudDetections.speedScore,
          straightlineScore: fraudDetections.straightlineScore,
          duplicateScore: fraudDetections.duplicateScore,
          timingScore: fraudDetections.timingScore,
          totalScore: fraudDetections.totalScore,
          severity: fraudDetections.severity,
          // Detail breakdowns
          gpsDetails: fraudDetections.gpsDetails,
          speedDetails: fraudDetections.speedDetails,
          straightlineDetails: fraudDetections.straightlineDetails,
          duplicateDetails: fraudDetections.duplicateDetails,
          timingDetails: fraudDetections.timingDetails,
          // Resolution
          resolution: fraudDetections.resolution,
          resolutionNotes: fraudDetections.resolutionNotes,
          reviewedAt: fraudDetections.reviewedAt,
          reviewedBy: fraudDetections.reviewedBy,
          // JOINed submission data
          gpsLatitude: submissions.gpsLatitude,
          gpsLongitude: submissions.gpsLongitude,
          submittedAt: submissions.submittedAt,
          // JOINed enumerator data
          enumeratorName: users.fullName,
          enumeratorLgaId: users.lgaId,
          // JOINed form data
          formName: questionnaireForms.title,
        })
        .from(fraudDetections)
        .innerJoin(submissions, eq(fraudDetections.submissionId, submissions.id))
        .innerJoin(users, eq(fraudDetections.enumeratorId, users.id))
        .leftJoin(questionnaireForms, sql`${submissions.questionnaireFormId}::uuid = ${questionnaireForms.id}`)
        .where(eq(fraudDetections.id, id))
        .limit(1);

      if (!detection) {
        throw new AppError('NOT_FOUND', 'Fraud detection not found', 404);
      }

      // Supervisor scope check
      if (user.role === 'supervisor') {
        const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(user.sub);
        if (!enumeratorIds.includes(detection.enumeratorId)) {
          throw new AppError('FORBIDDEN', 'Not authorized to view this detection', 403);
        }
      }

      // Cast numeric scores to numbers
      res.json({ data: castScores(detection) });
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
      if (!UUID_REGEX.test(id)) {
        throw new AppError('VALIDATION_ERROR', 'Invalid detection ID format', 400);
      }

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

      res.json({ data: castScores(updated) });
    } catch (err) {
      next(err);
    }
  }
}
