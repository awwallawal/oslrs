/**
 * Productivity Routes
 *
 * Created in Story 5.6a (Supervisor Team Productivity Table).
 */

import { Router } from 'express';
import { ProductivityController } from '../controllers/productivity.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { exportRateLimit } from '../middleware/export-rate-limit.js';
import { UserRole } from '@oslsr/types';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Team productivity data — supervisor sees own team, super_admin sees all
router.get(
  '/team',
  authorize(UserRole.SUPERVISOR, UserRole.SUPER_ADMIN),
  ProductivityController.getTeamProductivity,
);

// Get active targets — supervisor and super_admin
router.get(
  '/targets',
  authorize(UserRole.SUPERVISOR, UserRole.SUPER_ADMIN),
  ProductivityController.getTargets,
);

// Update targets — super_admin only
router.put(
  '/targets',
  authorize(UserRole.SUPER_ADMIN),
  ProductivityController.updateTargets,
);

// Export productivity data — supervisor and super_admin, rate-limited
router.post(
  '/export',
  authorize(UserRole.SUPERVISOR, UserRole.SUPER_ADMIN),
  exportRateLimit,
  ProductivityController.exportTeamProductivity,
);

export default router;
