/**
 * LGA Routes — Permissive LGA List Endpoint
 *
 * Story 5.4 Task 2.5: Public reference data for filter dropdowns.
 * GET /api/v1/lgas — accessible to all dashboard roles (non-sensitive data).
 * Separate from /api/v1/admin/lgas which requires super_admin only.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import { AppError } from '@oslsr/utils';
import { db } from '../db/index.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/v1/lgas — LGA list for filter dropdowns
router.get(
  '/',
  authorize(
    UserRole.GOVERNMENT_OFFICIAL,
    UserRole.VERIFICATION_ASSESSOR,
    UserRole.SUPER_ADMIN,
    UserRole.SUPERVISOR,
  ),
  async (_req: Request, _res: Response, next: NextFunction) => {
    try {
      const lgasList = await db.query.lgas.findMany({
        columns: { id: true, name: true, code: true },
        orderBy: (lgas, { asc }) => [asc(lgas.name)],
      });

      _res.json({ data: lgasList });
    } catch (error: unknown) {
      next(new AppError(
        'LGA_LIST_ERROR',
        'Failed to retrieve LGAs list',
        500,
      ));
    }
  },
);

export default router;
