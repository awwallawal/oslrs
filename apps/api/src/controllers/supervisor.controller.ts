import { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { db } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { submissions } from '../db/schema/submissions.js';
import { sql, inArray } from 'drizzle-orm';
import { TeamAssignmentService } from '../services/team-assignment.service.js';

export class SupervisorController {
  /**
   * GET /api/v1/supervisor/team-overview
   * Returns enumerator counts (total, active, inactive) for the supervisor's assigned team.
   * Uses TeamAssignmentService for assignment boundary enforcement.
   */
  static async getTeamOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string; lgaId?: string } }).user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(user.sub);

      if (enumeratorIds.length === 0) {
        return res.json({ data: { total: 0, active: 0, inactive: 0 } });
      }

      // The assignment service returns only active/verified enumerators,
      // so total = active and inactive = 0. This is correct: inactive
      // enumerators are excluded from the supervisor's operational team.
      const total = enumeratorIds.length;
      res.json({ data: { total, active: total, inactive: 0 } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/supervisor/team-metrics
   * Returns per-enumerator roster with daily/weekly counts and last activity.
   * Uses TeamAssignmentService for assignment boundary enforcement (AC 4.1.2).
   */
  static async getTeamMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string; lgaId?: string } }).user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(user.sub);

      if (enumeratorIds.length === 0) {
        return res.json({ data: { enumerators: [] } });
      }

      // Get enumerator details
      const enumeratorDetails = await db.query.users.findMany({
        where: inArray(users.id, enumeratorIds),
        columns: { id: true, fullName: true, status: true, lastLoginAt: true },
      });

      // Get daily + weekly counts and last submission per enumerator.
      // Use WAT (UTC+1) boundary so "today" aligns with Nigeria local time.
      const WAT_OFFSET_MS = 1 * 60 * 60 * 1000; // UTC+1
      const now = new Date();
      const watNow = new Date(now.getTime() + WAT_OFFSET_MS);
      const todayStart = new Date(Date.UTC(watNow.getUTCFullYear(), watNow.getUTCMonth(), watNow.getUTCDate()));
      todayStart.setTime(todayStart.getTime() - WAT_OFFSET_MS); // Convert back to UTC
      const weekStart = new Date(todayStart);
      weekStart.setUTCDate(weekStart.getUTCDate() - 7);

      const countRows = await db
        .select({
          submitterId: submissions.submitterId,
          dailyCount: sql<number>`COUNT(*) FILTER (WHERE ${submissions.submittedAt} >= ${todayStart})`,
          weeklyCount: sql<number>`COUNT(*) FILTER (WHERE ${submissions.submittedAt} >= ${weekStart})`,
          lastSubmittedAt: sql<string>`MAX(${submissions.submittedAt})`,
        })
        .from(submissions)
        .where(inArray(submissions.submitterId, enumeratorIds))
        .groupBy(submissions.submitterId);

      // Build counts map for O(1) lookup
      const countsMap = new Map(
        countRows.map((r) => [
          r.submitterId,
          {
            dailyCount: Number(r.dailyCount),
            weeklyCount: Number(r.weeklyCount),
            lastSubmittedAt: r.lastSubmittedAt,
          },
        ]),
      );

      // Merge enumerator details with counts
      const enumerators = enumeratorDetails.map((e) => ({
        id: e.id,
        fullName: e.fullName,
        status: e.status,
        lastLoginAt: e.lastLoginAt,
        dailyCount: countsMap.get(e.id)?.dailyCount ?? 0,
        weeklyCount: countsMap.get(e.id)?.weeklyCount ?? 0,
        lastSubmittedAt: countsMap.get(e.id)?.lastSubmittedAt ?? null,
      }));

      res.json({ data: { enumerators } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/supervisor/team-gps
   * Returns latest GPS point per assigned enumerator.
   * Uses DISTINCT ON for efficient "latest per group" query (AC 4.1.3).
   */
  static async getTeamGps(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string; lgaId?: string } }).user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(user.sub);

      if (enumeratorIds.length === 0) {
        return res.json({ data: { points: [] } });
      }

      // DISTINCT ON to get latest GPS per enumerator — no N+1 queries
      const idList = sql.join(
        enumeratorIds.map((id) => sql`${id}`),
        sql`, `,
      );

      const points = await db.execute(sql`
        SELECT DISTINCT ON (s.submitter_id)
          s.submitter_id AS "enumeratorId",
          u.full_name AS "enumeratorName",
          s.gps_latitude AS "latitude",
          s.gps_longitude AS "longitude",
          s.submitted_at AS "submittedAt"
        FROM submissions s
        JOIN users u ON s.submitter_id::uuid = u.id
        WHERE s.submitter_id IN (${idList})
          AND s.gps_latitude IS NOT NULL
          AND s.gps_longitude IS NOT NULL
        ORDER BY s.submitter_id, s.submitted_at DESC
      `);

      res.json({ data: { points: points.rows } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/supervisor/pending-alerts
   * Returns unprocessed and failed submission counts for the supervisor's assigned team.
   * Uses TeamAssignmentService for assignment boundary enforcement.
   */
  static async getPendingAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string; lgaId?: string } }).user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(user.sub);

      if (enumeratorIds.length === 0) {
        return res.json({
          data: { unprocessedCount: 0, failedCount: 0, totalAlerts: 0 },
        });
      }

      const rows = await db
        .select({
          unprocessedCount: sql<number>`COUNT(*) FILTER (WHERE ${submissions.processed} = false)`,
          failedCount: sql<number>`COUNT(*) FILTER (WHERE ${submissions.processingError} IS NOT NULL AND ${submissions.processed} = true)`,
        })
        .from(submissions)
        .where(inArray(submissions.submitterId, enumeratorIds));

      const result = rows[0] ?? { unprocessedCount: 0, failedCount: 0 };
      const unprocessedCount = Number(result.unprocessedCount);
      const failedCount = Number(result.failedCount);

      res.json({
        data: {
          unprocessedCount,
          failedCount,
          totalAlerts: unprocessedCount + failedCount,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
