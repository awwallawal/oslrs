/**
 * Analytics Routes
 *
 * Story 8.1: Analytics Backend Foundation & Descriptive Statistics API
 * Authenticated endpoints with scope chain middleware.
 * All dashboard roles can access; data is role-scoped automatically.
 */

import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { resolveAnalyticsScope } from '../middleware/analytics-scope.js';
import { UserRole } from '@oslsr/types';

const router = Router();

// Middleware chain: authenticate → authorize all dashboard roles → resolve scope
router.use(authenticate);
router.use(authorize(
  UserRole.SUPER_ADMIN,
  UserRole.GOVERNMENT_OFFICIAL,
  UserRole.SUPERVISOR,
  UserRole.ENUMERATOR,
  UserRole.DATA_ENTRY_CLERK,
  UserRole.VERIFICATION_ASSESSOR,
));
router.use(resolveAnalyticsScope);

router.get('/demographics', AnalyticsController.getDemographics);
router.get('/employment', AnalyticsController.getEmployment);
router.get('/household', AnalyticsController.getHousehold);
router.get('/skills', AnalyticsController.getSkillsFrequency);
router.get('/trends', AnalyticsController.getTrends);
router.get('/registry-summary', AnalyticsController.getRegistrySummary);
router.get('/pipeline-summary', AnalyticsController.getPipelineSummary);

export default router;
