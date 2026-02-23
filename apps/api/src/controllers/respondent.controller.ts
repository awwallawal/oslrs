/**
 * Respondent Controller — Detail + Registry List
 *
 * Story 5.3: Individual Record PII View (Authorized Roles).
 * Story 5.5: Respondent Data Registry Table — paginated list with filters.
 *
 * GET /api/v1/respondents — paginated respondent list with filters
 * GET /api/v1/respondents/:id — full respondent detail
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@oslsr/utils';
import { RespondentService } from '../services/respondent.service.js';
import { AuditService, PII_ACTIONS } from '../services/audit.service.js';
import type { AuthenticatedRequest } from '../types.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Roles that see PII and trigger audit logging */
const PII_AUTHORIZED_ROLES = ['super_admin', 'verification_assessor', 'government_official'];

/** Zod validation for list query params */
const respondentListSchema = z.object({
  lgaId: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  source: z.enum(['enumerator', 'public', 'clerk']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  verificationStatus: z.enum(['pending', 'verified', 'rejected', 'quarantined']).optional(),
  severity: z.string().optional(),
  formId: z.string().optional(),
  enumeratorId: z.string().optional(),
  search: z.string().min(3).max(100).optional(),
  cursor: z.string().optional(),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(['registeredAt', 'fraudScore', 'lgaName', 'verificationStatus']).default('registeredAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class RespondentController {
  /**
   * GET /api/v1/respondents — paginated respondent registry list
   */
  static async listRespondents(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const parsed = respondentListSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid query parameters', 400, {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const filters = parsed.data;

      // Validate UUID format for optional UUID filter params
      if (filters.lgaId && filters.lgaId.length > 0 && !filters.lgaId.includes('-')) {
        // LGA IDs can be codes (e.g., 'ibadan-north') — allow non-UUID
      }
      if (filters.formId && !UUID_REGEX.test(filters.formId)) {
        throw new AppError('VALIDATION_ERROR', 'Invalid formId format', 400);
      }
      if (filters.enumeratorId && !UUID_REGEX.test(filters.enumeratorId)) {
        throw new AppError('VALIDATION_ERROR', 'Invalid enumeratorId format', 400);
      }

      const result = await RespondentService.listRespondents(filters, user.role, user.sub);

      // Audit log for ALL roles (supervisors see operational data that should be tracked)
      AuditService.logPiiAccess(
        req as AuthenticatedRequest,
        PII_ACTIONS.VIEW_LIST,
        'respondents',
        null,
        { filters: parsed.data, resultCount: result.data.length },
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/respondents/:id — full respondent detail
   */
  static async getRespondentDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const { id } = req.params;
      if (!UUID_REGEX.test(id)) {
        throw new AppError('VALIDATION_ERROR', 'Invalid respondent ID format', 400);
      }

      const detail = await RespondentService.getRespondentDetail(id, user.role, user.sub);

      // Audit log PII access for authorized roles (fire-and-forget, non-blocking)
      if (PII_AUTHORIZED_ROLES.includes(user.role)) {
        AuditService.logPiiAccess(
          req as AuthenticatedRequest,
          PII_ACTIONS.VIEW_RECORD,
          'respondents',
          id,
          { lgaId: detail.lgaId, source: detail.source },
        );
      }

      res.json({ data: detail });
    } catch (err) {
      next(err);
    }
  }
}
