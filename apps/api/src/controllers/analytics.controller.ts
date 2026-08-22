/**
 * Analytics Controller
 *
 * Story 8.1: Analytics Backend Foundation & Descriptive Statistics API
 * Authenticated endpoints with scope chain middleware.
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SurveyAnalyticsService } from '../services/survey-analytics.service.js';
import { getRegistryTotals } from '../services/registry-totals.service.js';
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

/**
 * Story 12-6 — Data Health. Extends the shared analytics filter with the form
 * whose schema defines the per-field axis, plus an explicit page bound on the
 * `data_lost` drill (AC4.3: the recovery list is never unbounded, and the bound
 * is the caller's to state rather than a hidden constant).
 */
const dataHealthQuerySchema = analyticsQuerySchema.extend({
  formId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
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
      // Story 12-5: `data` is now `{ skills, respondentsAnswering }` — the rates
      // and the denominator they divide by, published together.
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

  /**
   * Story 12-4 — the authoritative registry aggregate.
   *
   * ⚠️ NOT interchangeable with `getRegistrySummary` above. That one counts
   * SUBMISSIONS carrying answers and labels the result "Total Respondents"
   * (the 76-for-139 mislabel this story exists to end). This counts PEOPLE.
   * New analytics surfaces read THIS one.
   */
  static async getRegistryTotals(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = analyticsQuerySchema.parse(req.query);
      const data = await getRegistryTotals(getScope(req), getParams(parsed));
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Story 12-6 — the Data-Health view: per-field response rates + the
   * `data_lost` recovery cohort.
   *
   * ⚠️ PII-bearing (the recovery drill carries name / reference code / phone),
   * so unlike the counting endpoints beside it this one is restricted at the
   * ROUTE to super-admin + government official — the same pair `/insights` and
   * `/equity` use. Read the route, not just this method.
   */
  static async getDataHealth(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = dataHealthQuerySchema.parse(req.query);
      const data = await SurveyAnalyticsService.getDataHealth(
        getScope(req),
        getParams(parsed),
        { formId: parsed.formId, limit: parsed.limit, offset: parsed.offset },
      );
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

  // Story 8.8: Inter-enumerator reliability (SA + Supervisor + Assessor)
  static async getEnumeratorReliability(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = analyticsQuerySchema.parse(req.query);
      const data = await SurveyAnalyticsService.getEnumeratorReliability(getScope(req), getParams(parsed));
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
        throw new AppError('RATE_LIMIT_EXCEEDED', 'Rate limit exceeded. Maximum 5 policy brief exports per hour.', 429);
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
      // Story 12-6: the gate — and the message — now count RESPONDENTS. The
      // brief's own statistics are computed over people, so refusing on a
      // submission count would refuse (or allow) on a number the document
      // itself never uses.
      //
      // ⚠️ FAILS CLOSED, and the explicit finite check is the point. Written as
      // a bare `x < 100`, a missing or non-numeric value compares FALSE and the
      // brief GENERATES — a data-sufficiency gate silently passing on absent
      // data, on a document that goes to a Ministry. Renaming the field surfaced
      // exactly that: a stale caller shape made the gate wave the request
      // through. An unknown count is not a large count.
      if (!Number.isFinite(activationStatus.totalRespondents) || activationStatus.totalRespondents < 100) {
        throw new AppError('INSUFFICIENT_DATA', 'Insufficient data for policy brief (need >= 100 respondents with answers)', 400);
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
