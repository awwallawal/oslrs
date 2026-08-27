/**
 * Campaign Watch admin routes — super-admin-only.
 *
 * Mounted under `/api/v1/admin/campaign-watch` via admin.routes.ts (same
 * sub-router pattern as operations / audit-log-viewer / settings).
 *
 * Endpoints:
 *   - GET /  — the radio-vs-register snapshot
 *
 * ⚠️ SUPER-ADMIN ONLY, ON PURPOSE. This is the composition the public /insights page
 * deliberately does NOT publish (ruling 2026-08-26): channel attribution, unattributed
 * counts, per-LGA radio reach. It is exactly the material that is useful in a room and
 * dangerous on a screenshot, so it lives behind auth.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { UserRole } from '@oslsr/types';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { operationsReadRateLimit } from '../middleware/operations-rate-limit.js';
import { CampaignWatchService } from '../services/campaign-watch.service.js';

const router = Router();

router.get(
  '/',
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  operationsReadRateLimit,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await CampaignWatchService.getSnapshot() });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
