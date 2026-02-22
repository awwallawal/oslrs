/**
 * Assessor Routes
 *
 * All routes require authentication and are restricted to
 * verification_assessor and super_admin roles only.
 *
 * Created in Story 5.2 (Verification Assessor Audit Queue).
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import { AssessorController } from '../controllers/assessor.controller.js';

const router = Router();

// All routes require authentication + assessor/admin authorization
router.use(authenticate);
router.use(authorize(UserRole.VERIFICATION_ASSESSOR, UserRole.SUPER_ADMIN));

// Static routes first (before parameterized routes)
// GET /api/v1/assessor/audit-queue — paginated queue with filters
router.get('/audit-queue', AssessorController.getAuditQueue);

// GET /api/v1/assessor/completed — completed reviews
router.get('/completed', AssessorController.getCompletedReviews);

// GET /api/v1/assessor/stats — queue counts
router.get('/stats', AssessorController.getQueueStats);

// GET /api/v1/assessor/recent-activity — last 5 reviews
router.get('/recent-activity', AssessorController.getRecentActivity);

// PATCH /api/v1/assessor/review/:detectionId — final approve/reject
router.patch('/review/:detectionId', AssessorController.reviewDetection);

export default router;
