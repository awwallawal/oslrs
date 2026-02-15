import { Router } from 'express';
import { FormController } from '../controllers/form.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { ninCheckRateLimit } from '../middleware/rate-limit.js';
import { UserRole } from '@oslsr/types';
import { AppError } from '@oslsr/utils';

const router = Router();

// Validate UUID format for :id param before hitting database
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.param('id', (req, _res, next, value) => {
  if (!UUID_REGEX.test(value)) {
    return next(new AppError('INVALID_ID', 'Invalid form ID format', 400));
  }
  next();
});

// All routes require authentication (no role restriction — any authenticated user can access published forms)
router.use(authenticate);

// List all published forms available for data collection
router.get('/published', FormController.listPublishedForms);

// Get flattened form for one-question-per-screen rendering
router.get('/:id/render', FormController.getFormForRender);

// Super Admin preview — renders any form regardless of status
router.get('/:id/preview', authorize(UserRole.SUPER_ADMIN), FormController.previewForm);

// Submit a completed form (any authenticated user)
router.post('/submissions', FormController.submitForm);

// Pre-submission NIN availability check (AC 3.7.3)
router.post('/check-nin', ninCheckRateLimit, FormController.checkNin);

// Per-form submission counts for the authenticated user (optional ?scope=team for supervisors)
router.get('/submissions/my-counts', FormController.getMySubmissionCounts);

// Daily submission counts for chart (optional ?days=7|30)
router.get('/submissions/daily-counts', FormController.getDailySubmissionCounts);

// Poll submission processing status (AC 3.7.6)
router.get('/submissions/status', FormController.getSubmissionStatuses);

export default router;
