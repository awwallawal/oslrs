import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@oslsr/types';
import { AppError } from '@oslsr/utils';
import { db } from '../db/index.js';
import { teamAssignments } from '../db/schema/team-assignments.js';
import { lgas } from '../db/schema/lgas.js';
import { and, eq, isNull } from 'drizzle-orm';

export interface AnalyticsScope {
  type: 'system' | 'lga' | 'personal';
  lgaId?: string;
  lgaCode?: string;
  userId?: string;
}

/**
 * Middleware that resolves analytics scope based on user role.
 * Must be used after authenticate middleware.
 *
 * - Super Admin / Government Official / Assessor → system-wide
 * - Supervisor → LGA-scoped (from team_assignments)
 * - Enumerator / Clerk → personal (own submissions only)
 */
export async function resolveAnalyticsScope(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = req.user;

    if (!user) {
      return next(new AppError('AUTH_REQUIRED', 'Authentication required', 401));
    }

    switch (user.role) {
      case UserRole.SUPER_ADMIN:
      case UserRole.GOVERNMENT_OFFICIAL:
        req.analyticsScope = { type: 'system' };
        break;

      case UserRole.VERIFICATION_ASSESSOR:
        req.analyticsScope = { type: 'system' };
        break;

      case UserRole.SUPERVISOR: {
        const assignment = await db
          .select({ lgaId: teamAssignments.lgaId, lgaCode: lgas.code })
          .from(teamAssignments)
          .innerJoin(lgas, eq(teamAssignments.lgaId, lgas.id))
          .where(and(
            eq(teamAssignments.supervisorId, user.sub),
            isNull(teamAssignments.unassignedAt),
          ))
          .limit(1);

        if (!assignment.length) {
          return next(new AppError('FORBIDDEN', 'Supervisor has no active LGA assignment', 403));
        }

        req.analyticsScope = { type: 'lga', lgaId: assignment[0].lgaId, lgaCode: assignment[0].lgaCode };
        break;
      }

      case UserRole.ENUMERATOR:
      case UserRole.DATA_ENTRY_CLERK:
        req.analyticsScope = { type: 'personal', userId: user.sub };
        break;

      default:
        return next(new AppError('FORBIDDEN', 'Role not authorized for analytics', 403));
    }

    next();
  } catch (err) {
    next(err);
  }
}
