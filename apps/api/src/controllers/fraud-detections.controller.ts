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
import { fraudDetections, submissions, users, questionnaireForms, fraudThresholds } from '../db/schema/index.js';
import { AuditService } from '../services/audit.service.js';
import { eq, and, gte, lte, inArray, isNull, isNotNull, desc, sql, not, gt } from 'drizzle-orm';
import { reviewFraudDetectionSchema, bulkReviewFraudDetectionsSchema, fraudSeverities } from '@oslsr/types';
import type { GpsDetails } from '@oslsr/types';
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

  /**
   * GET /api/v1/fraud-detections/clusters
   * Returns cluster summaries grouped by GPS proximity from gpsDetails.clusterMembers.
   * Story 4.5 Task 2: Cluster grouping via union-find on clusterMembers overlap.
   */
  static async getClusters(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string } }).user;
      if (!user?.sub) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

      // Build scope-restricted conditions
      const conditions = [
        isNull(fraudDetections.resolution),       // unreviewed only
        isNotNull(fraudDetections.gpsDetails),     // has GPS data
        gt(fraudDetections.gpsScore, '0'),         // flagged by GPS heuristic
      ];

      // Supervisor scope: only their team's detections
      if (user.role === 'supervisor') {
        const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(user.sub);
        if (enumeratorIds.length === 0) {
          res.json({ data: [] });
          return;
        }
        conditions.push(inArray(fraudDetections.enumeratorId, enumeratorIds));
      }

      // Query GPS cluster radius from threshold config (M4 fix)
      const [radiusConfig] = await db
        .select({ thresholdValue: fraudThresholds.thresholdValue })
        .from(fraudThresholds)
        .where(and(
          eq(fraudThresholds.ruleKey, 'gps_cluster_radius_m'),
          eq(fraudThresholds.isActive, true),
        ))
        .limit(1);
      const clusterRadiusMeters = radiusConfig?.thresholdValue ?? 50;

      const rows = await db
        .select({
          id: fraudDetections.id,
          submissionId: fraudDetections.submissionId,
          enumeratorId: fraudDetections.enumeratorId,
          computedAt: fraudDetections.computedAt,
          totalScore: fraudDetections.totalScore,
          severity: fraudDetections.severity,
          gpsDetails: fraudDetections.gpsDetails,
          enumeratorName: users.fullName,
          submittedAt: submissions.submittedAt,
          gpsLatitude: submissions.gpsLatitude,
          gpsLongitude: submissions.gpsLongitude,
        })
        .from(fraudDetections)
        .innerJoin(submissions, eq(fraudDetections.submissionId, submissions.id))
        .innerJoin(users, eq(fraudDetections.enumeratorId, users.id))
        .where(and(...conditions));

      // Build union-find graph from clusterMembers overlap
      // Two detections belong to the same cluster if they share submission IDs in clusterMembers
      const submissionToDetectionId = new Map<string, string>();
      for (const row of rows) {
        submissionToDetectionId.set(row.submissionId, row.id);
      }

      // Union-Find data structure
      const parent = new Map<string, string>();
      const rank = new Map<string, number>();

      function find(x: string): string {
        if (!parent.has(x)) {
          parent.set(x, x);
          rank.set(x, 0);
        }
        if (parent.get(x) !== x) {
          parent.set(x, find(parent.get(x)!));
        }
        return parent.get(x)!;
      }

      function union(a: string, b: string) {
        const ra = find(a);
        const rb = find(b);
        if (ra === rb) return;
        const rankA = rank.get(ra) ?? 0;
        const rankB = rank.get(rb) ?? 0;
        if (rankA < rankB) { parent.set(ra, rb); }
        else if (rankA > rankB) { parent.set(rb, ra); }
        else { parent.set(rb, ra); rank.set(ra, rankA + 1); }
      }

      // Build adjacency from clusterMembers
      for (const row of rows) {
        const gps = row.gpsDetails as GpsDetails | null;
        const members = gps?.clusterMembers ?? [];
        for (const member of members) {
          const neighborDetectionId = submissionToDetectionId.get(member.submissionId);
          if (neighborDetectionId && neighborDetectionId !== row.id) {
            union(row.id, neighborDetectionId);
          }
        }
      }

      // Group detections by connected component
      const components = new Map<string, string[]>();
      for (const row of rows) {
        const root = find(row.id);
        if (!components.has(root)) components.set(root, []);
        components.get(root)!.push(row.id);
      }

      // Only return groups with 2+ members (single detections are not clusters)
      const rowById = new Map(rows.map(r => [r.id, r]));
      const clusters = [];

      for (const [, memberIds] of components) {
        if (memberIds.length < 2) continue;

        const members = memberIds.map(id => rowById.get(id)!);
        const lats: number[] = [];
        const lngs: number[] = [];
        const scores: number[] = [];
        const timestamps: Date[] = [];
        const enumeratorMap = new Map<string, string>();
        const severities: string[] = [];

        for (const m of members) {
          if (m.gpsLatitude != null) lats.push(m.gpsLatitude);
          if (m.gpsLongitude != null) lngs.push(m.gpsLongitude);
          scores.push(parseFloat(m.totalScore));
          if (m.computedAt) timestamps.push(new Date(m.computedAt));
          enumeratorMap.set(m.enumeratorId, m.enumeratorName);
          severities.push(m.severity);
        }

        // Compute cluster center (average lat/lng)
        const avgLat = lats.length > 0 ? lats.reduce((a, b) => a + b, 0) / lats.length : 0;
        const avgLng = lngs.length > 0 ? lngs.reduce((a, b) => a + b, 0) / lngs.length : 0;

        const radiusMeters = clusterRadiusMeters;

        // Sort timestamps for time range
        timestamps.sort((a, b) => a.getTime() - b.getTime());

        // Severity ordering for range
        const severityOrder = ['clean', 'low', 'medium', 'high', 'critical'];
        const sortedSeverities = [...new Set(severities)].sort(
          (a, b) => severityOrder.indexOf(a) - severityOrder.indexOf(b),
        );

        // Generate stable cluster ID from sorted detection IDs
        const sortedIds = [...memberIds].sort();
        const clusterId = sortedIds[0]; // Use first sorted detection ID as cluster ID

        clusters.push({
          clusterId,
          center: { lat: avgLat, lng: avgLng },
          radiusMeters,
          detectionCount: members.length,
          detectionIds: sortedIds,
          timeRange: {
            earliest: timestamps[0]?.toISOString() ?? null,
            latest: timestamps[timestamps.length - 1]?.toISOString() ?? null,
          },
          severityRange: {
            min: sortedSeverities[0] ?? 'clean',
            max: sortedSeverities[sortedSeverities.length - 1] ?? 'clean',
          },
          enumerators: Array.from(enumeratorMap.entries()).map(([id, name]) => ({ id, name })),
          totalScoreAvg: scores.length > 0
            ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
            : 0,
          members: members.map(m => ({
            id: m.id,
            submissionId: m.submissionId,
            enumeratorId: m.enumeratorId,
            enumeratorName: m.enumeratorName,
            computedAt: m.computedAt instanceof Date ? m.computedAt.toISOString() : m.computedAt,
            submittedAt: m.submittedAt instanceof Date ? m.submittedAt.toISOString() : m.submittedAt,
            totalScore: parseFloat(m.totalScore),
            severity: m.severity,
            resolution: null,
            gpsLatitude: m.gpsLatitude,
            gpsLongitude: m.gpsLongitude,
          })),
        });
      }

      // Sort clusters by detection count descending (largest first)
      clusters.sort((a, b) => b.detectionCount - a.detectionCount);

      res.json({ data: clusters });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/fraud-detections/bulk-review
   * Bulk resolve detections in a single transaction.
   * Story 4.5 Task 3: Transactional bulk review with LGA scope enforcement.
   */
  static async bulkReviewDetections(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string } }).user;
      if (!user?.sub) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

      const parsed = bulkReviewFraudDetectionsSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          parsed.error.issues.map((i) => i.message).join(', '),
          400,
        );
      }

      const { ids, resolution, resolutionNotes } = parsed.data;

      // Supervisor scope pre-check
      let allowedEnumeratorIds: string[] | null = null;
      if (user.role === 'supervisor') {
        allowedEnumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(user.sub);
        if (allowedEnumeratorIds.length === 0) {
          throw new AppError('SCOPE_VIOLATION', 'No enumerators assigned to your team', 403);
        }
      }

      await db.transaction(async (tx) => {
        // 1. Verify all IDs exist
        const detections = await tx
          .select({
            id: fraudDetections.id,
            enumeratorId: fraudDetections.enumeratorId,
          })
          .from(fraudDetections)
          .where(inArray(fraudDetections.id, ids));

        if (detections.length !== ids.length) {
          throw new AppError('DETECTION_NOT_FOUND', 'One or more detection IDs not found', 404);
        }

        // 2. Supervisor scope enforcement (all-or-nothing)
        if (allowedEnumeratorIds !== null) {
          const outOfScope = detections.filter(d => !allowedEnumeratorIds!.includes(d.enumeratorId));
          if (outOfScope.length > 0) {
            throw new AppError('SCOPE_VIOLATION', 'Cannot review detections outside your team', 403);
          }
        }

        // 3. Bulk update
        await tx
          .update(fraudDetections)
          .set({
            resolution,
            resolutionNotes,
            reviewedBy: user.sub,
            reviewedAt: new Date(),
          })
          .where(inArray(fraudDetections.id, ids));

        // 4. DB audit log entry (targetId null for bulk — IDs in details JSONB)
        await AuditService.logActionTx(tx, {
          actorId: user.sub,
          action: 'fraud.bulk_verification',
          targetResource: 'fraud_detections',
          targetId: null,
          details: {
            detectionIds: ids,
            count: ids.length,
            resolution,
            resolutionNotes,
          },
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('user-agent') || 'unknown',
        });
      });

      // 5. Structured Pino log (outside transaction)
      logger.info({
        event: 'fraud.bulk_verification',
        actorId: user.sub,
        count: ids.length,
        resolution,
        detectionIds: ids,
      });

      res.json({ data: { count: ids.length, resolution } });
    } catch (err) {
      next(err);
    }
  }
}
