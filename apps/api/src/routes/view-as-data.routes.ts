/**
 * View-As Data Routes — Proxy endpoints for role-scoped dashboard data
 *
 * Story 6-7: Returns aggregated dashboard data for the target role
 * during View-As mode. All routes are GET-only (read-only by design).
 *
 * GET /api/v1/view-as/data/dashboard — Target role's dashboard summary
 * GET /api/v1/view-as/data/sidebar   — Target role's sidebar items
 */

import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import { AppError } from '@oslsr/utils';
import { ViewAsDataService } from '../services/view-as-data.service.js';
import type { AuthenticatedRequest } from '../types.js';

const router = Router();

// All data proxy routes require: authenticated + Super Admin
// View-As state is attached by authenticate middleware (auth.ts) for Super Admins
router.use(authenticate);
router.use(authorize(UserRole.SUPER_ADMIN));

/**
 * GET /view-as/data/dashboard — Returns dashboard summary for the target role
 */
router.get('/dashboard', async (req: any, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.viewAs) {
      throw new AppError('VIEW_AS_NOT_ACTIVE', 'No active View-As session', 400);
    }

    const summary = await ViewAsDataService.getDashboardSummary(
      authReq.viewAs.targetRole,
      authReq.viewAs.targetLgaId,
    );

    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /view-as/data/sidebar — Returns sidebar items for the target role
 */
router.get('/sidebar', (req: any, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.viewAs) {
      throw new AppError('VIEW_AS_NOT_ACTIVE', 'No active View-As session', 400);
    }

    const items = ViewAsDataService.getSidebarItems(authReq.viewAs.targetRole);

    res.status(200).json({ success: true, data: { role: authReq.viewAs.targetRole, items } });
  } catch (error) {
    next(error);
  }
});

export default router;
