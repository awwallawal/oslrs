/**
 * Respondent Controller — Individual Respondent Detail
 *
 * Story 5.3: Individual Record PII View (Authorized Roles).
 * GET /api/v1/respondents/:id — full respondent detail with submission history.
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { RespondentService } from '../services/respondent.service.js';
import { AuditService, PII_ACTIONS } from '../services/audit.service.js';
import type { AuthenticatedRequest } from '../types.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Roles that see PII and trigger audit logging */
const PII_AUTHORIZED_ROLES = ['super_admin', 'verification_assessor', 'government_official'];

export class RespondentController {
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
