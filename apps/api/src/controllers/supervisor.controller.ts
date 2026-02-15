import { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { UserRole } from '@oslsr/types';
import { db } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { roles } from '../db/schema/roles.js';
import { submissions } from '../db/schema/submissions.js';
import { eq, and, sql, count } from 'drizzle-orm';

export class SupervisorController {
  /**
   * GET /api/v1/supervisor/team-overview
   * Returns enumerator counts (total, active, inactive) for the supervisor's LGA.
   */
  static async getTeamOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string; lgaId?: string } }).user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }
      if (!user.lgaId) {
        throw new AppError('LGA_REQUIRED', 'Supervisor must be assigned to an LGA', 403);
      }

      // Find the enumerator role ID
      const enumeratorRole = await db.query.roles.findFirst({
        where: eq(roles.name, UserRole.ENUMERATOR),
        columns: { id: true },
      });

      if (!enumeratorRole) {
        return res.json({ data: { total: 0, active: 0, inactive: 0 } });
      }

      // Count enumerators in this LGA grouped by status
      const rows = await db
        .select({
          status: users.status,
          count: count(),
        })
        .from(users)
        .where(
          and(
            eq(users.roleId, enumeratorRole.id),
            eq(users.lgaId, user.lgaId),
          ),
        )
        .groupBy(users.status);

      let total = 0;
      let active = 0;
      for (const row of rows) {
        const c = Number(row.count);
        total += c;
        if (row.status === 'active' || row.status === 'verified') {
          active += c;
        }
      }

      res.json({ data: { total, active, inactive: total - active } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/supervisor/pending-alerts
   * Returns unprocessed and failed submission counts for the supervisor's LGA.
   */
  static async getPendingAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { sub: string; role?: string; lgaId?: string } }).user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }
      if (!user.lgaId) {
        throw new AppError('LGA_REQUIRED', 'Supervisor must be assigned to an LGA', 403);
      }

      const rows = await db
        .select({
          unprocessedCount: sql<number>`COUNT(*) FILTER (WHERE ${submissions.processed} = false)`,
          failedCount: sql<number>`COUNT(*) FILTER (WHERE ${submissions.processingError} IS NOT NULL AND ${submissions.processed} = true)`,
        })
        .from(submissions)
        .where(
          sql`${submissions.submitterId}::uuid IN (SELECT id FROM users WHERE lga_id = ${user.lgaId})`,
        );

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
