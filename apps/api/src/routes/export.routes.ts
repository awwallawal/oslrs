/**
 * Export Routes — PII-Rich CSV/PDF Export Endpoints
 *
 * Story 5.4: Export filtered respondent datasets for authorized roles.
 * GET /api/v1/exports/respondents — download export (CSV or PDF)
 * GET /api/v1/exports/respondents/count — preview filtered count
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import { ExportController } from '../controllers/export.controller.js';
import { exportRateLimit } from '../middleware/export-rate-limit.js';

const router = Router();

// All export routes require authentication
router.use(authenticate);

// Authorize: government_official, super_admin, verification_assessor only
const exportAuthorize = authorize(
  UserRole.GOVERNMENT_OFFICIAL,
  UserRole.SUPER_ADMIN,
  UserRole.VERIFICATION_ASSESSOR,
);

// GET /api/v1/exports/respondents/count — preview count (no rate limit)
router.get(
  '/respondents/count',
  exportAuthorize,
  ExportController.getExportPreviewCount,
);

// GET /api/v1/exports/respondents — download export (rate limited)
router.get(
  '/respondents',
  exportAuthorize,
  exportRateLimit,
  ExportController.exportRespondents,
);

export default router;
