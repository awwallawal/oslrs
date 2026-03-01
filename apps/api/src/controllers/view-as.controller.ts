/**
 * View-As Controller — Super Admin View-As session management
 *
 * Story 6-7: HTTP handler layer for starting/ending/querying View-As sessions.
 */

import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@oslsr/utils';
import { ViewAsService } from '../services/view-as.service.js';
import type { AuthenticatedRequest } from '../types.js';

const VIEWABLE_ROLES = [
  'supervisor',
  'enumerator',
  'data_entry_clerk',
  'verification_assessor',
  'government_official',
] as const;

const FIELD_ROLES = ['enumerator', 'supervisor'] as const;

/** Zod schema for starting a View-As session */
const startViewAsSchema = z
  .object({
    targetRole: z.enum(VIEWABLE_ROLES),
    targetLgaId: z.string().uuid('Target LGA must be a valid UUID').optional(),
    reason: z.string().max(500, 'Reason must be 500 characters or fewer').optional(),
  })
  .refine(
    (data) => {
      if (FIELD_ROLES.includes(data.targetRole as (typeof FIELD_ROLES)[number])) {
        return !!data.targetLgaId;
      }
      return true;
    },
    { message: 'LGA selection is required for field roles', path: ['targetLgaId'] },
  );

export class ViewAsController {
  /**
   * POST /view-as/start — Start a View-As session
   */
  static async startViewAs(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parseResult = startViewAsSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid View-As request', 400, {
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const { targetRole, targetLgaId, reason } = parseResult.data;

      const session = await ViewAsService.startViewAs({
        adminId: req.user.sub,
        targetRole,
        targetLgaId,
        reason,
        req,
      });

      res.status(200).json({
        success: true,
        data: {
          active: true,
          targetRole: session.targetRole,
          targetLgaId: session.targetLgaId,
          startedAt: session.startedAt,
          expiresAt: session.expiresAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /view-as/end — End the current View-As session
   */
  static async endViewAs(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ViewAsService.endViewAs(req.user.sub, req);

      res.status(200).json({
        success: true,
        data: {
          active: false,
          duration: result.duration,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /view-as/current — Get current View-As state
   */
  static async getCurrentState(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const state = await ViewAsService.getViewAsState(req.user.sub);

      if (!state) {
        res.status(200).json({
          success: true,
          data: { active: false },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          active: true,
          targetRole: state.targetRole,
          targetLgaId: state.targetLgaId,
          startedAt: state.startedAt,
          expiresAt: state.expiresAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
