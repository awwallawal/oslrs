/**
 * Remuneration Routes — Payment Recording & Management
 *
 * Story 6.4: Super Admin bulk payment recording endpoints.
 * All routes require authentication. Most require Super Admin role.
 * Staff history is accessible by Super Admin or the staff member themselves.
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import { RemunerationController } from '../controllers/remuneration.controller.js';

const router = Router();

// Receipt upload config: memory storage, 10MB limit, images + PDF
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPEG, and PDF files are allowed'));
    }
  },
});

// All routes require authentication
router.use(authenticate);

const superAdminOnly = authorize(UserRole.SUPER_ADMIN);

// POST /api/v1/remuneration — create payment batch (with optional receipt upload)
router.post(
  '/',
  superAdminOnly,
  receiptUpload.single('receipt'),
  RemunerationController.createBatch,
);

// GET /api/v1/remuneration — list payment batches
router.get(
  '/',
  superAdminOnly,
  RemunerationController.listBatches,
);

// Story 6.5: Dispute routes (staff: enumerator + supervisor)
const staffOnly = authorize(UserRole.ENUMERATOR, UserRole.SUPERVISOR);

// POST /api/v1/remuneration/disputes — open a dispute (staff only)
router.post(
  '/disputes',
  staffOnly,
  RemunerationController.openDispute,
);

// GET /api/v1/remuneration/disputes/mine — list own disputes (staff only)
router.get(
  '/disputes/mine',
  staffOnly,
  RemunerationController.getMyDisputes,
);

// GET /api/v1/remuneration/eligible-staff — get eligible staff for selection
router.get(
  '/eligible-staff',
  superAdminOnly,
  RemunerationController.getEligibleStaff,
);

// GET /api/v1/remuneration/staff/:userId/history — staff payment history
// Super Admin can view any staff's history; staff can view their own
router.get(
  '/staff/:userId/history',
  RemunerationController.getStaffHistory,
);

// GET /api/v1/remuneration/files/:fileId — download receipt file
router.get(
  '/files/:fileId',
  superAdminOnly,
  RemunerationController.downloadFile,
);

// GET /api/v1/remuneration/:batchId — batch detail with records
router.get(
  '/:batchId',
  superAdminOnly,
  RemunerationController.getBatchDetail,
);

// PATCH /api/v1/remuneration/records/:recordId — correct a payment record
router.patch(
  '/records/:recordId',
  superAdminOnly,
  RemunerationController.correctRecord,
);

export default router;
