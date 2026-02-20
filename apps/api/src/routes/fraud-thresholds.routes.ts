/**
 * Fraud Thresholds Routes
 *
 * Super Admin only — manage fraud detection threshold configuration.
 *
 * Created in Story 4.3 (Fraud Engine Configurable Thresholds).
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import { FraudThresholdsController } from '../controllers/fraud-thresholds.controller.js';

const router = Router();

// All routes require Super Admin authentication
router.use(authenticate);
router.use(authorize(UserRole.SUPER_ADMIN));

// GET /api/v1/fraud-thresholds — list active thresholds grouped by category
router.get('/', FraudThresholdsController.listThresholds);

// PUT /api/v1/fraud-thresholds/:ruleKey — create new threshold version
router.put('/:ruleKey', FraudThresholdsController.updateThreshold);

export default router;
