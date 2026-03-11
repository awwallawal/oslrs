/**
 * Public Insights Controller
 *
 * Story 8.1: Analytics Backend Foundation & Descriptive Statistics API (AC#4)
 * Unauthenticated endpoint for anonymized public aggregates.
 */

import type { Request, Response, NextFunction } from 'express';
import { PublicInsightsService } from '../services/public-insights.service.js';

export class PublicInsightsController {
  static async getInsights(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await PublicInsightsService.getPublicInsights();
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
}
