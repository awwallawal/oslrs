/**
 * Assessor Service
 *
 * Backend service for the Verification Assessor audit queue.
 * Assessors are SECOND-TIER auditors who perform final review after supervisors.
 *
 * Queue composition: fraud_detections WHERE
 *   (resolution IS NOT NULL OR severity IN ('high','critical'))
 *   AND assessor_resolution IS NULL
 *
 * Created in Story 5.2 (Verification Assessor Audit Queue).
 */

import { db } from '../db/index.js';
import {
  fraudDetections,
  submissions,
  users,
  respondents,
  auditLogs,
} from '../db/schema/index.js';
import {
  eq,
  and,
  or,
  gte,
  lte,
  sql,
  desc,
  isNull,
  isNotNull,
  inArray,
  like,
} from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { AppError } from '@oslsr/utils';
import pino from 'pino';

const logger = pino({ name: 'assessor-service' });

/** Escape LIKE pattern special characters to prevent wildcard injection. */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

/**
 * Helper to cast numeric(5,2) string values to numbers.
 * Drizzle returns numeric columns as strings — must parseFloat before sending to frontend.
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

export interface AuditQueueFilters {
  lgaId?: string;
  severity?: string[];
  supervisorResolution?: string;
  dateFrom?: string;
  dateTo?: string;
  enumeratorName?: string;
  page?: number;
  pageSize?: number;
}

export interface CompletedFilters {
  assessorDecision?: string;
  dateFrom?: string;
  dateTo?: string;
  severity?: string[];
  page?: number;
  pageSize?: number;
}

export class AssessorService {
  /**
   * Get the audit queue: items pending assessor review.
   * Queue = (supervisor reviewed OR high/critical severity) AND assessor_resolution IS NULL
   */
  static async getAuditQueue(filters: AuditQueueFilters) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    // Base queue conditions
    const conditions = [
      // Items that qualify for assessor review
      or(
        isNotNull(fraudDetections.resolution),
        inArray(fraudDetections.severity, ['high', 'critical']),
      ),
      // Not yet assessed
      isNull(fraudDetections.assessorResolution),
    ];

    // Optional filters
    if (filters.lgaId) {
      conditions.push(eq(respondents.lgaId, filters.lgaId));
    }

    if (filters.severity && filters.severity.length > 0) {
      type SeverityEnum = typeof fraudDetections.severity.enumValues[number];
      conditions.push(inArray(fraudDetections.severity, filters.severity as SeverityEnum[]));
    }

    if (filters.supervisorResolution) {
      type ResolutionEnum = typeof fraudDetections.resolution.enumValues[number];
      conditions.push(eq(fraudDetections.resolution, filters.supervisorResolution as ResolutionEnum));
    }

    if (filters.dateFrom) {
      conditions.push(gte(fraudDetections.computedAt, new Date(filters.dateFrom)));
    }

    if (filters.dateTo) {
      conditions.push(lte(fraudDetections.computedAt, new Date(filters.dateTo)));
    }

    if (filters.enumeratorName) {
      conditions.push(like(users.fullName, `%${escapeLike(filters.enumeratorName)}%`));
    }

    const whereClause = and(...conditions);

    // Count total
    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(fraudDetections)
      .innerJoin(submissions, eq(fraudDetections.submissionId, submissions.id))
      .leftJoin(respondents, eq(submissions.respondentId, respondents.id))
      .innerJoin(users, eq(fraudDetections.enumeratorId, users.id))
      .where(whereClause);

    const totalItems = countResult?.count ?? 0;

    // Fetch page
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
        enumeratorName: users.fullName,
        submittedAt: submissions.submittedAt,
        lgaId: respondents.lgaId,
      })
      .from(fraudDetections)
      .innerJoin(submissions, eq(fraudDetections.submissionId, submissions.id))
      .leftJoin(respondents, eq(submissions.respondentId, respondents.id))
      .innerJoin(users, eq(fraudDetections.enumeratorId, users.id))
      .where(whereClause)
      .orderBy(desc(fraudDetections.computedAt))
      .limit(pageSize)
      .offset(offset);

    const data = rows.map(row => castScores(row));

    return {
      data,
      page,
      pageSize,
      totalPages: Math.ceil(totalItems / pageSize),
      totalItems,
    };
  }

  /**
   * Get completed assessor reviews (assessorResolution IS NOT NULL).
   */
  static async getCompletedReviews(filters: CompletedFilters) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const conditions = [
      isNotNull(fraudDetections.assessorResolution),
    ];

    if (filters.assessorDecision) {
      type AssessorEnum = NonNullable<typeof fraudDetections.assessorResolution.enumValues>[number];
      conditions.push(eq(fraudDetections.assessorResolution, filters.assessorDecision as AssessorEnum));
    }

    if (filters.severity && filters.severity.length > 0) {
      type SeverityEnum = typeof fraudDetections.severity.enumValues[number];
      conditions.push(inArray(fraudDetections.severity, filters.severity as SeverityEnum[]));
    }

    if (filters.dateFrom) {
      conditions.push(gte(fraudDetections.assessorReviewedAt, new Date(filters.dateFrom)));
    }

    if (filters.dateTo) {
      conditions.push(lte(fraudDetections.assessorReviewedAt, new Date(filters.dateTo)));
    }

    const whereClause = and(...conditions);

    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(fraudDetections)
      .innerJoin(submissions, eq(fraudDetections.submissionId, submissions.id))
      .leftJoin(respondents, eq(submissions.respondentId, respondents.id))
      .innerJoin(users, eq(fraudDetections.enumeratorId, users.id))
      .where(whereClause);

    const totalItems = countResult?.count ?? 0;

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
        assessorResolution: fraudDetections.assessorResolution,
        assessorNotes: fraudDetections.assessorNotes,
        assessorReviewedAt: fraudDetections.assessorReviewedAt,
        enumeratorName: users.fullName,
        submittedAt: submissions.submittedAt,
        lgaId: respondents.lgaId,
      })
      .from(fraudDetections)
      .innerJoin(submissions, eq(fraudDetections.submissionId, submissions.id))
      .leftJoin(respondents, eq(submissions.respondentId, respondents.id))
      .innerJoin(users, eq(fraudDetections.enumeratorId, users.id))
      .where(whereClause)
      .orderBy(desc(fraudDetections.assessorReviewedAt))
      .limit(pageSize)
      .offset(offset);

    const data = rows.map(row => castScores(row));

    return {
      data,
      page,
      pageSize,
      totalPages: Math.ceil(totalItems / pageSize),
      totalItems,
    };
  }

  /**
   * Get queue stats: total pending, by severity, today's reviews.
   */
  static async getQueueStats() {
    // Total pending assessor review
    const [pendingResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(fraudDetections)
      .where(and(
        or(
          isNotNull(fraudDetections.resolution),
          inArray(fraudDetections.severity, ['high', 'critical']),
        ),
        isNull(fraudDetections.assessorResolution),
      ));

    // Severity breakdown of pending items
    const severityBreakdown = await db
      .select({
        severity: fraudDetections.severity,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(fraudDetections)
      .where(and(
        or(
          isNotNull(fraudDetections.resolution),
          inArray(fraudDetections.severity, ['high', 'critical']),
        ),
        isNull(fraudDetections.assessorResolution),
      ))
      .groupBy(fraudDetections.severity);

    // Today's reviews
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(fraudDetections)
      .where(and(
        isNotNull(fraudDetections.assessorResolution),
        gte(fraudDetections.assessorReviewedAt, todayStart),
      ));

    return {
      totalPending: pendingResult?.count ?? 0,
      severityBreakdown: severityBreakdown.reduce((acc, row) => {
        acc[row.severity] = row.count;
        return acc;
      }, {} as Record<string, number>),
      reviewedToday: todayResult?.count ?? 0,
    };
  }

  /**
   * Get recent assessor activity from audit logs.
   */
  static async getRecentActivity(limit = 5) {
    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        targetId: auditLogs.targetId,
        details: auditLogs.details,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(eq(auditLogs.action, 'assessor.final_review'))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return rows;
  }

  /**
   * Submit an assessor final review (approve or reject).
   * Updates fraud_detection row and writes audit log in a single transaction.
   */
  static async reviewDetection(params: {
    detectionId: string;
    assessorResolution: 'final_approved' | 'final_rejected';
    assessorNotes?: string;
    actorId: string;
    ipAddress: string;
    userAgent: string;
  }) {
    const { detectionId, assessorResolution, assessorNotes, actorId, ipAddress, userAgent } = params;

    // Verify detection exists and is eligible for assessor review
    const [existing] = await db
      .select({
        id: fraudDetections.id,
        resolution: fraudDetections.resolution,
        severity: fraudDetections.severity,
        assessorResolution: fraudDetections.assessorResolution,
      })
      .from(fraudDetections)
      .where(eq(fraudDetections.id, detectionId))
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Fraud detection not found', 404);
    }

    if (existing.assessorResolution !== null) {
      throw new AppError('ALREADY_REVIEWED', 'This detection has already been reviewed by an assessor', 409);
    }

    // Verify the detection qualifies for the assessor queue
    const isEligible =
      existing.resolution !== null ||
      existing.severity === 'high' ||
      existing.severity === 'critical';

    if (!isEligible) {
      throw new AppError('NOT_ELIGIBLE', 'This detection is not eligible for assessor review', 400);
    }

    // Transactional update + audit log
    const [updated] = await db.transaction(async (tx) => {
      const [result] = await tx
        .update(fraudDetections)
        .set({
          assessorReviewedBy: actorId,
          assessorReviewedAt: new Date(),
          assessorResolution,
          assessorNotes: assessorNotes ?? null,
        })
        .where(eq(fraudDetections.id, detectionId))
        .returning();

      await tx.insert(auditLogs).values({
        id: uuidv7(),
        actorId,
        action: 'assessor.final_review',
        targetResource: 'fraud_detection',
        targetId: detectionId,
        details: {
          assessorResolution,
          assessorNotes: assessorNotes ?? null,
          previousSupervisorResolution: existing.resolution,
        },
        ipAddress,
        userAgent,
      });

      return [result];
    });

    logger.info({
      event: 'assessor.final_review',
      detectionId,
      actorId,
      assessorResolution,
    });

    return { data: castScores(updated) };
  }
}
