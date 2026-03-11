/**
 * Team Quality Controller
 *
 * Story 8.3: Field Team Analytics — Supervisor + Super Admin endpoints
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { TeamQualityService } from '../services/team-quality.service.js';

const dateParam = z.string().refine(
  (val) => /^\d{4}-\d{2}-\d{2}/.test(val) && !isNaN(Date.parse(val)),
  { message: 'Invalid date format. Use YYYY-MM-DD or ISO 8601.' },
).optional();

const teamQualityQuerySchema = z.object({
  dateFrom: dateParam,
  dateTo: dateParam,
  enumeratorId: z.string().uuid().optional(),
  supervisorId: z.string().uuid().optional(),
});

export class TeamQualityController {
  /**
   * GET /analytics/team-quality
   * Supervisor: sees their own team
   * Super Admin: can pass ?supervisorId= to view any team, or omit for system-wide
   */
  static async getTeamQuality(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = teamQualityQuerySchema.parse(req.query);
      const userRole = req.user!.role;
      const userId = req.user!.sub;

      // Determine whose team to view
      let supervisorId: string | undefined;
      if (userRole === 'super_admin') {
        supervisorId = parsed.supervisorId; // undefined = system-wide
      } else {
        // Supervisor viewing their own team
        supervisorId = userId;
      }

      const enumeratorIds = await TeamQualityService.resolveEnumeratorIds(supervisorId);

      const data = await TeamQualityService.getTeamQuality(enumeratorIds, {
        dateFrom: parsed.dateFrom,
        dateTo: parsed.dateTo,
        enumeratorId: parsed.enumeratorId,
      });

      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
}
