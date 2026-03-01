/**
 * View-As Routes — Super Admin View-As session management
 *
 * Story 6-7: Start/end/query View-As sessions for role previewing.
 * All routes require authentication + Super Admin role.
 *
 * POST /api/v1/view-as/start   — Start View-As session
 * POST /api/v1/view-as/end     — End View-As session
 * GET  /api/v1/view-as/current — Get current View-As state
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import { ViewAsController } from '../controllers/view-as.controller.js';

const router = Router();

// All view-as routes require authentication + Super Admin
router.use(authenticate);
router.use(authorize(UserRole.SUPER_ADMIN));

router.post('/start', ViewAsController.startViewAs as any);
router.post('/end', ViewAsController.endViewAs as any);
router.get('/current', ViewAsController.getCurrentState as any);

export default router;
