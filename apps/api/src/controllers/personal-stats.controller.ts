/**
 * Personal Stats Controller
 *
 * Story 8.3: Field Team Analytics — Enumerator/Clerk personal endpoints
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PersonalStatsService } from '../services/personal-stats.service.js';

const dateParam = z.string().refine(
  (val) => /^\d{4}-\d{2}-\d{2}/.test(val) && !isNaN(Date.parse(val)),
  { message: 'Invalid date format. Use YYYY-MM-DD or ISO 8601.' },
).optional();

const personalStatsQuerySchema = z.object({
  dateFrom: dateParam,
  dateTo: dateParam,
});

export class PersonalStatsController {
  /**
   * GET /analytics/my-stats
   * Enumerator or Clerk sees their own stats
   */
  static async getPersonalStats(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = personalStatsQuerySchema.parse(req.query);
      const userId = req.user!.sub;
      const isClerk = req.user!.role === 'data_entry_clerk';

      const data = await PersonalStatsService.getPersonalStats(
        userId,
        {
          dateFrom: parsed.dateFrom,
          dateTo: parsed.dateTo,
        },
        isClerk,
      );

      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
}
