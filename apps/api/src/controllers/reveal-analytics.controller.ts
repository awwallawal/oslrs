import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { RevealAnalyticsService } from '../services/reveal-analytics.service.js';

const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export class RevealAnalyticsController {
  static async getStats(_req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await RevealAnalyticsService.getRevealStats();
      res.json({ data: stats });
    } catch (error) {
      next(error);
    }
  }

  static async getTopViewers(req: Request, res: Response, next: NextFunction) {
    try {
      const { days, limit } = analyticsQuerySchema.parse(req.query);
      const viewers = await RevealAnalyticsService.getTopViewers(days, limit);
      res.json({ data: viewers });
    } catch (error) {
      next(error);
    }
  }

  static async getTopProfiles(req: Request, res: Response, next: NextFunction) {
    try {
      const { days, limit } = analyticsQuerySchema.parse(req.query);
      const profiles = await RevealAnalyticsService.getTopProfiles(days, limit);
      res.json({ data: profiles });
    } catch (error) {
      next(error);
    }
  }

  static async getSuspiciousDevices(req: Request, res: Response, next: NextFunction) {
    try {
      const { days, limit } = analyticsQuerySchema.parse(req.query);
      const devices = await RevealAnalyticsService.getSuspiciousDevices(days, limit);
      res.json({ data: devices });
    } catch (error) {
      next(error);
    }
  }
}
