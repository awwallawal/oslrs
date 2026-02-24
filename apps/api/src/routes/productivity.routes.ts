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

// Get active targets — all field roles + admin (targets are not sensitive)
router.get(
  '/targets',
  authorize(UserRole.ENUMERATOR, UserRole.DATA_ENTRY_CLERK, UserRole.SUPERVISOR, UserRole.SUPER_ADMIN),
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

// Story 5.6b: Cross-LGA endpoints

// Super Admin: all staff across all LGAs
router.get(
  '/staff',
  authorize(UserRole.SUPER_ADMIN),
  ProductivityController.getAllStaffProductivity,
);

// Super Admin: LGA comparison data
router.get(
  '/lga-comparison',
  authorize(UserRole.SUPER_ADMIN),
  ProductivityController.getLgaComparison,
);

// Government Official + Super Admin: aggregate-only LGA summary (no staff names)
router.get(
  '/lga-summary',
  authorize(UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPER_ADMIN),
  ProductivityController.getLgaSummary,
);

// Super Admin only: export cross-LGA data as CSV/PDF
router.post(
  '/cross-lga-export',
  authorize(UserRole.SUPER_ADMIN),
  exportRateLimit,
  ProductivityController.exportCrossLgaData,
);

export default router;
