/**
 * Fraud Detections Routes
 *
 * Accessible by Supervisor, Assessor, and Super Admin.
 * Supervisor scope is restricted to their assigned enumerators.
 *
 * Created in Story 4.3 (Fraud Engine Configurable Thresholds).
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import { FraudDetectionsController } from '../controllers/fraud-detections.controller.js';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(authorize(UserRole.SUPERVISOR, UserRole.VERIFICATION_ASSESSOR, UserRole.SUPER_ADMIN));

// GET /api/v1/fraud-detections — filtered list with pagination
router.get('/', FraudDetectionsController.listDetections);

// CRITICAL: Static segment routes MUST come before /:id parameterized routes.
// Express matches top-down — if /:id comes first, /clusters matches as id='clusters' and fails.

// GET /api/v1/fraud-detections/clusters — cluster summaries by GPS proximity (Story 4.5)
router.get('/clusters', FraudDetectionsController.getClusters);

// PATCH /api/v1/fraud-detections/bulk-review — bulk resolve detections (Story 4.5)
router.patch('/bulk-review', FraudDetectionsController.bulkReviewDetections);

// GET /api/v1/fraud-detections/:id — detail with enriched JOINs (Story 4.4)
router.get('/:id', FraudDetectionsController.getDetection);

// PATCH /api/v1/fraud-detections/:id/review — resolve a detection
router.patch('/:id/review', FraudDetectionsController.reviewDetection);

export default router;
