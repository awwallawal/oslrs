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

// Story 6.6: Evidence upload config (same as receipt — memory storage, 10MB, PNG/JPEG/PDF)
const evidenceUpload = multer({
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

// Story 6.6: Admin dispute queue routes (Super Admin only)
// GET /api/v1/remuneration/disputes/stats — dispute queue statistics
router.get(
  '/disputes/stats',
  superAdminOnly,
  RemunerationController.getDisputeStats,
);

// GET /api/v1/remuneration/disputes — list dispute queue (Super Admin)
router.get(
  '/disputes',
  superAdminOnly,
  RemunerationController.getDisputeQueue,
);

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

// PATCH /api/v1/remuneration/disputes/:disputeId/acknowledge — Super Admin acknowledges
router.patch(
  '/disputes/:disputeId/acknowledge',
  superAdminOnly,
  RemunerationController.acknowledgeDispute,
);

// PATCH /api/v1/remuneration/disputes/:disputeId/resolve — Super Admin resolves (with optional evidence)
router.patch(
  '/disputes/:disputeId/resolve',
  superAdminOnly,
  evidenceUpload.single('evidence'),
  RemunerationController.resolveDispute,
);

// PATCH /api/v1/remuneration/disputes/:disputeId/reopen — Staff reopens (owner only)
router.patch(
  '/disputes/:disputeId/reopen',
  staffOnly,
  RemunerationController.reopenDispute,
);

// GET /api/v1/remuneration/disputes/:disputeId — dispute detail (Super Admin only)
router.get(
  '/disputes/:disputeId',
  superAdminOnly,
  RemunerationController.getDisputeDetail,
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
