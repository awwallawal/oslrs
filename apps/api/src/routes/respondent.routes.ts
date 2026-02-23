/**
 * Respondent Routes
 *
 * Story 5.3: Individual Record PII View (Authorized Roles).
 * Story 5.5: Respondent Data Registry Table — paginated list with filters.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import { RespondentController } from '../controllers/respondent.controller.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

const AUTHORIZED_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.VERIFICATION_ASSESSOR,
  UserRole.GOVERNMENT_OFFICIAL,
  UserRole.SUPERVISOR,
];

// GET /api/v1/respondents — paginated respondent registry list (Story 5.5)
router.get('/', authorize(...AUTHORIZED_ROLES), RespondentController.listRespondents);

// GET /api/v1/respondents/:id — respondent detail (Story 5.3)
router.get('/:id', authorize(...AUTHORIZED_ROLES), RespondentController.getRespondentDetail);

export default router;
