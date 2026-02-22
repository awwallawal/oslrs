/**
 * Report Routes
 *
 * Government Official Policy Dashboard API endpoints.
 * Story 5.1: High-Level Policy Dashboard
 *
 * Authorization: government_official, super_admin only
 */

import { Router } from 'express';
import { ReportController } from '../controllers/report.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';

const router = Router();

router.use(authenticate);
router.use(authorize(UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPER_ADMIN));

// Overview stats — total respondents, today's count, LGAs covered, source channels
router.get('/overview', ReportController.getOverviewStats);

// Skills distribution — occupation/skill breakdown from form data
router.get('/skills-distribution', ReportController.getSkillsDistribution);

// LGA breakdown — respondent count per LGA
router.get('/lga-breakdown', ReportController.getLgaBreakdown);

// Registration trends — daily counts for 7/30 days
router.get('/registration-trends', ReportController.getRegistrationTrends);

export default router;
