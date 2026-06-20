import { Router, RequestHandler } from 'express';
import multer from 'multer';
import { StaffController } from '../controllers/staff.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { requireFreshReAuth } from '../middleware/sensitive-action.js';
import { UserRole } from '@oslsr/types';
import { AppError } from '@oslsr/utils';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Validate UUID format for :userId param before hitting database
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.param('userId', (req, _res, next, value) => {
  if (!UUID_REGEX.test(value)) {
    return next(new AppError('INVALID_USER_ID', 'Invalid user ID format', 400));
  }
  next();
});

// All routes require Super Admin
router.use(authenticate, authorize(UserRole.SUPER_ADMIN));

// Story 2.5-3, AC1: List staff with pagination, filtering, search
router.get('/', StaffController.list);

router.post('/manual', StaffController.createManual as RequestHandler);
router.post('/import', upload.single('file'), StaffController.importCsv as RequestHandler);
router.get('/import/:jobId', StaffController.getImportStatus);
router.post('/:userId/resend-invitation', StaffController.resendInvitation as RequestHandler);

// Story 2.5-3, AC5, AC6: Update role with session invalidation.
// F-014 — privileged mutation: UNCONDITIONAL step-up re-auth (role change).
router.patch('/:userId/role', requireFreshReAuth, StaffController.updateRole as RequestHandler);

// Story 2.5-3, AC4, AC6: Deactivate user with session invalidation.
// F-014 — privileged mutation: step-up re-auth.
router.post('/:userId/deactivate', requireFreshReAuth, StaffController.deactivate as RequestHandler);

// Reactivate a deactivated or suspended user. F-014 — step-up re-auth.
router.post('/:userId/reactivate', requireFreshReAuth, StaffController.reactivate as RequestHandler);

// Story 2.5-3, AC7: Download ID card for staff member
router.get('/:userId/id-card', StaffController.downloadIdCard);

export default router;
