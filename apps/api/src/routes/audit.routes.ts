/**
 * Audit Routes — Audit Log Verification Endpoints
 *
 * Story 6-1: Super Admin access to hash chain verification.
 * GET /api/v1/audit-logs/verify-chain — verify audit log hash chain integrity
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import { AuditController } from '../controllers/audit.controller.js';

const router = Router();

// All audit-log routes require authentication + Super Admin
router.use(authenticate);
router.use(authorize(UserRole.SUPER_ADMIN));

// GET /api/v1/audit-logs/verify-chain
router.get('/verify-chain', AuditController.verifyHashChain);

export default router;
