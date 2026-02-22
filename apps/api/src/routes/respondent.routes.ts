/**
 * Respondent Routes
 *
 * Story 5.3: Individual Record PII View (Authorized Roles).
 * Routes for respondent detail access.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import { RespondentController } from '../controllers/respondent.controller.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/v1/respondents/:id — respondent detail
// Accessible to: super_admin, verification_assessor, government_official, supervisor
router.get(
  '/:id',
  authorize(
    UserRole.SUPER_ADMIN,
    UserRole.VERIFICATION_ASSESSOR,
    UserRole.GOVERNMENT_OFFICIAL,
    UserRole.SUPERVISOR,
  ),
  RespondentController.getRespondentDetail,
);

export default router;
