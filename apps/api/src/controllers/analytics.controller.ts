/**
 * Analytics Controller
 *
 * Story 8.1: Analytics Backend Foundation & Descriptive Statistics API
 * Authenticated endpoints with scope chain middleware.
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SurveyAnalyticsService } from '../services/survey-analytics.service.js';
import { PolicyBriefService } from '../services/policy-brief.service.js';
import type { AnalyticsScope } from '../middleware/analytics-scope.js';
import type { AnalyticsQueryParams } from '@oslsr/types';
import { CrossTabDimension, CrossTabMeasure } from '@oslsr/types';
import { AppError } from '@oslsr/utils';

const dateParam = z.string().refine(
  (val) => /^\d{4}-\d{2}-\d{2}/.test(val) && !isNaN(Date.parse(val)),
  { message: 'Invalid date format. Use YYYY-MM-DD or ISO 8601.' },
).optional();

const analyticsQuerySchema = z.object({
  lgaId: z.string().min(1).optional(),
  dateFrom: dateParam,
  dateTo: dateParam,
  source: z.enum(['enumerator', 'public', 'clerk']).optional(),
});

const skillsQuerySchema = analyticsQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const trendsQuerySchema = analyticsQuerySchema.extend({
  granularity: z.enum(['day', 'week', 'month']).default('day'),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const crossTabQuerySchema = analyticsQuerySchema.extend({
  rowDim: z.nativeEnum(CrossTabDimension),
  colDim: z.nativeEnum(CrossTabDimension),
  measure: z.nativeEnum(CrossTabMeasure).default(CrossTabMeasure.COUNT),
}).refine((data) => data.rowDim !== data.colDim, {
  message: 'rowDim and colDim must be different dimensions',
  path: ['colDim'],
});

function getScope(req: Request): AnalyticsScope {
  return req.analyticsScope!;
}

function getParams(parsed: z.infer<typeof analyticsQuerySchema>): AnalyticsQueryParams {
  return {
    lgaId: parsed.lgaId,
    dateFrom: parsed.dateFrom,
    dateTo: parsed.dateTo,
    source: parsed.source,
  };
}

export class AnalyticsController {
  static async getDemographics(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = analyticsQuerySchema.parse(req.query);
      const data = await SurveyAnalyticsService.getDemographics(getScope(req), getParams(parsed));
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async getEmployment(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = analyticsQuerySchema.parse(req.query);
      const data = await SurveyAnalyticsService.getEmployment(getScope(req), getParams(parsed));
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async getHousehold(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = analyticsQuerySchema.parse(req.query);
      const data = await SurveyAnalyticsService.getHousehold(getScope(req), getParams(parsed));
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async getSkillsFrequency(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = skillsQuerySchema.parse(req.query);
      const data = await SurveyAnalyticsService.getSkillsFrequency(
        getScope(req),
        getParams(parsed),
        parsed.limit,
      );
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async getTrends(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = trendsQuerySchema.parse(req.query);
      const data = await SurveyAnalyticsService.getTrends(
        getScope(req),
        getParams(parsed),
        parsed.granularity,
        parsed.days,
      );
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async getRegistrySummary(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = analyticsQuerySchema.parse(req.query);
      const data = await SurveyAnalyticsService.getRegistrySummary(getScope(req), getParams(parsed));
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async getPipelineSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = analyticsQuerySchema.parse(req.query);
      const data = await SurveyAnalyticsService.getPipelineSummary(getScope(req), getParams(parsed));
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async getCrossTab(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = crossTabQuerySchema.parse(req.query);
      const data = await SurveyAnalyticsService.getCrossTab(
        parsed.rowDim,
        parsed.colDim,
        parsed.measure,
        getScope(req),
        getParams(parsed),
      );
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async getSkillsInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = analyticsQuerySchema.parse(req.query);
      const data = await SurveyAnalyticsService.getSkillsInventory(getScope(req), getParams(parsed));
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }

  // Story 8.7: Inferential insights
  static async getInsights(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = analyticsQuerySchema.parse(req.query);
      const data = await SurveyAnalyticsService.getInferentialInsights(getScope(req), getParams(parsed));
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }

  // Story 8.7: Extended equity metrics
  static async getEquity(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = analyticsQuerySchema.parse(req.query);
      const data = await SurveyAnalyticsService.getExtendedEquity(getScope(req), getParams(parsed));
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }

  // Story 8.7: Activation status (lightweight — all roles)
  static async getActivationStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await SurveyAnalyticsService.getActivationStatus(getScope(req));
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }

  // Story 8.7: Policy brief PDF export
  /** Rate tracking: Map<userId, timestamp[]> for in-memory rate limiting (5/hr) */
  private static pdfRateMap = new Map<string, number[]>();

  static async getPolicyBrief(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = analyticsQuerySchema.parse(req.query);
      const userId = req.user?.sub || 'anonymous';

      // Per-user rate limit: 5 per hour
      const now = Date.now();
      const oneHourAgo = now - 3600_000;
      const userRequests = (AnalyticsController.pdfRateMap.get(userId) || []).filter(t => t > oneHourAgo);
      if (userRequests.length >= 5) {
        throw new AppError(429, 'Rate limit exceeded. Maximum 5 policy brief exports per hour.');
      }

      // Periodic cleanup: evict stale entries (no requests in last hour)
      if (AnalyticsController.pdfRateMap.size > 100) {
        for (const [key, timestamps] of AnalyticsController.pdfRateMap) {
          if (timestamps.every(t => t <= oneHourAgo)) {
            AnalyticsController.pdfRateMap.delete(key);
          }
        }
      }

      // Threshold guard
      const activationStatus = await SurveyAnalyticsService.getActivationStatus(getScope(req));
      if (activationStatus.totalSubmissions < 100) {
        throw new AppError(400, 'Insufficient data for policy brief (need >= 100 submissions)');
      }

      const pdfBuffer = await PolicyBriefService.generatePolicyBrief(getScope(req), getParams(parsed));

      // Increment rate counter AFTER successful generation (M-1 fix)
      userRequests.push(now);
      AnalyticsController.pdfRateMap.set(userId, userRequests);

      const date = new Date().toISOString().split('T')[0];
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="oslrs-policy-brief-${date}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
}
