/**
 * Operations Dashboard admin routes — super-admin-only (Story 9-19 Part B).
 *
 * Mounted under `/api/v1/admin/operations` via admin.routes.ts (sub-router
 * pattern matches audit-log-viewer + settings).
 *
 * Endpoints:
 *   - GET /dashboard         — full ops snapshot (60/min/user, 30s cache)
 *   - GET /dashboard?force=1 — bypass the 30s cache (UI manual-refresh button)
 *
 * Returns the same data the `pnpm dashboard` CLI renders, as JSON. All
 * endpoints require `authenticate` + `authorize(UserRole.SUPER_ADMIN)`.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { UserRole } from '@oslsr/types';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { operationsReadRateLimit } from '../middleware/operations-rate-limit.js';
import { OperationsService } from '../services/operations.service.js';

const router = Router();

/**
 * GET /api/v1/admin/operations/dashboard — full operations snapshot.
 *
 * `?force=true|1` skips the 30s server cache so the operator's manual-refresh
 * button always gets fresh data (AC#B4).
 */
router.get(
  '/dashboard',
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  operationsReadRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const force = req.query.force === 'true' || req.query.force === '1';
      const snapshot = await OperationsService.getDashboardSnapshot({ force });
      res.json({ data: snapshot });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
