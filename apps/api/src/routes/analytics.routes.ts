/**
 * Analytics Routes
 *
 * Story 8.1: Analytics Backend Foundation & Descriptive Statistics API
 * Story 8.3: Team Quality + Personal Stats endpoints
 * Authenticated endpoints with scope chain middleware.
 * All dashboard roles can access; data is role-scoped automatically.
 */

import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller.js';
import { TeamQualityController } from '../controllers/team-quality.controller.js';
import { PersonalStatsController } from '../controllers/personal-stats.controller.js';
import { VerificationAnalyticsController } from '../controllers/verification-analytics.controller.js';
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

// Story 8.4: Verification pipeline analytics (Assessor + Super Admin + Gov Official)
router.get(
  '/verification-pipeline',
  authorize(UserRole.SUPER_ADMIN, UserRole.VERIFICATION_ASSESSOR, UserRole.GOVERNMENT_OFFICIAL),
  VerificationAnalyticsController.getVerificationPipeline,
);

// Story 8.1: Descriptive statistics
router.get('/demographics', AnalyticsController.getDemographics);
router.get('/employment', AnalyticsController.getEmployment);
router.get('/household', AnalyticsController.getHousehold);
router.get('/skills', AnalyticsController.getSkillsFrequency);
router.get('/trends', AnalyticsController.getTrends);
router.get('/registry-summary', AnalyticsController.getRegistrySummary);
router.get('/pipeline-summary', AnalyticsController.getPipelineSummary);

// Story 8.3: Team quality (Supervisor + Super Admin)
router.get(
  '/team-quality',
  authorize(UserRole.SUPER_ADMIN, UserRole.SUPERVISOR),
  TeamQualityController.getTeamQuality,
);

// Story 8.3: Personal stats (Enumerator + Clerk)
router.get(
  '/my-stats',
  authorize(UserRole.ENUMERATOR, UserRole.DATA_ENTRY_CLERK),
  PersonalStatsController.getPersonalStats,
);

export default router;
