/**
 * Report Controller
 *
 * Handles Government Official Policy Dashboard endpoints.
 * Story 5.1: High-Level Policy Dashboard
 *
 * All endpoints return aggregated read-only data.
 * Authorized for: government_official, super_admin
 */

import { Request, Response, NextFunction } from 'express';
import { ReportService } from '../services/report.service.js';

export class ReportController {
  /**
   * GET /api/v1/reports/overview
   * Returns overview stats: total respondents, today's count, LGAs covered, source breakdown.
   */
  static async getOverviewStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await ReportService.getOverviewStats();
      res.json({ data: stats });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/reports/skills-distribution
   * Returns skills/occupation distribution from submission data.
   */
  static async getSkillsDistribution(req: Request, res: Response, next: NextFunction) {
    try {
      const distribution = await ReportService.getSkillsDistribution();
      res.json({ data: distribution });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/reports/lga-breakdown
   * Returns respondent count per LGA.
   */
  static async getLgaBreakdown(req: Request, res: Response, next: NextFunction) {
    try {
      const breakdown = await ReportService.getLgaBreakdown();
      res.json({ data: breakdown });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/reports/registration-trends?days=7
   * Returns daily registration counts for the specified period.
   */
  static async getRegistrationTrends(req: Request, res: Response, next: NextFunction) {
    try {
      const daysParam = Number(req.query.days) || 7;
      const days = daysParam === 30 ? 30 : 7;
      const trends = await ReportService.getRegistrationTrends(days);
      res.json({ data: trends });
    } catch (err) {
      next(err);
    }
  }
}
