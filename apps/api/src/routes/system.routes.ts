/**
 * System Routes
 *
 * Endpoints for system health monitoring and Prometheus metrics.
 * All endpoints require Super Admin authentication.
 *
 * Created in Story 6-2.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import { SystemController } from '../controllers/system.controller.js';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limit: max 12 requests per minute (one every 5 seconds)
const systemRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many system health requests, please try again later',
  },
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply auth + Super Admin authorization to all system routes
router.use(authenticate);
router.use(authorize(UserRole.SUPER_ADMIN));
router.use(systemRateLimit);

router.get('/health', SystemController.getHealth);
router.get('/metrics', SystemController.getMetrics);

export default router;
