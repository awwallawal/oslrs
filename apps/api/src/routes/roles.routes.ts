import { Router } from 'express';
import { RolesController } from '../controllers/roles.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';

const router = Router();

// All routes require Super Admin
router.use(authenticate, authorize(UserRole.SUPER_ADMIN));

// Story 2.5-3, AC5: List all roles for dropdown
router.get('/', RolesController.list);

export default router;
