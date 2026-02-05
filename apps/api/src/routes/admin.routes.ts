import { Router, Request, Response } from 'express';
import { Redis } from 'ioredis';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import { EmailBudgetService } from '../services/email-budget.service.js';
import { getEmailConfigFromEnv } from '../providers/index.js';
import { getEmailQueueStats } from '../queues/email.queue.js';
import { db } from '../db/index.js';
import pino from 'pino';

const logger = pino({ name: 'admin-routes' });
const router = Router();

// Redis connection for budget service
let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }
  return redis;
}

/**
 * GET /api/v1/admin/email-budget
 *
 * Get email budget status for Super Admin dashboard.
 * Includes tier info, daily/monthly usage, overage costs, and queue status.
 *
 * AC4: Expose budget status via GET /api/v1/admin/email-budget endpoint
 */
router.get(
  '/email-budget',
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  async (_req: Request, res: Response) => {
    try {
      const config = getEmailConfigFromEnv();
      const budgetService = new EmailBudgetService(
        getRedis(),
        config.tier,
        config.monthlyOverageBudgetCents
      );

      const [budgetStatus, queueStats] = await Promise.all([
        budgetService.getBudgetStatus(),
        getEmailQueueStats().catch(() => null),
      ]);

      // Check and log warnings if approaching limits
      await budgetService.checkAndWarn();

      res.json({
        data: {
          budget: budgetStatus,
          queue: queueStats
            ? {
                waiting: queueStats.waiting,
                active: queueStats.active,
                completed: queueStats.completed,
                failed: queueStats.failed,
                delayed: queueStats.delayed,
                paused: queueStats.paused,
              }
            : null,
          config: {
            provider: config.provider,
            enabled: config.enabled,
            tier: config.tier,
            fromAddress: config.fromAddress,
          },
        },
      });
    } catch (error: unknown) {
      logger.error({
        event: 'admin.email_budget.error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve email budget status',
      });
    }
  }
);

/**
 * POST /api/v1/admin/email-queue/pause
 *
 * Pause the email queue. Used when budget is exhausted or for maintenance.
 */
router.post(
  '/email-queue/pause',
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  async (_req: Request, res: Response) => {
    try {
      const { pauseEmailQueue } = await import('../queues/email.queue.js');
      await pauseEmailQueue();

      // Mark as paused in Redis
      await getRedis().set('email:queue:paused', 'true');

      logger.info({ event: 'admin.email_queue.paused' });

      res.json({
        data: { paused: true, message: 'Email queue paused successfully' },
      });
    } catch (error: unknown) {
      logger.error({
        event: 'admin.email_queue.pause_error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Failed to pause email queue',
      });
    }
  }
);

/**
 * POST /api/v1/admin/email-queue/resume
 *
 * Resume the email queue.
 */
router.post(
  '/email-queue/resume',
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  async (_req: Request, res: Response) => {
    try {
      const { resumeEmailQueue } = await import('../queues/email.queue.js');
      await resumeEmailQueue();

      // Clear paused flag in Redis
      await getRedis().del('email:queue:paused');

      logger.info({ event: 'admin.email_queue.resumed' });

      res.json({
        data: { paused: false, message: 'Email queue resumed successfully' },
      });
    } catch (error: unknown) {
      logger.error({
        event: 'admin.email_queue.resume_error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Failed to resume email queue',
      });
    }
  }
);


/**
 * GET /api/v1/admin/lgas
 *
 * Get list of all LGAs for dropdowns and filters.
 * Used in staff management for assigning enumerators/supervisors to LGAs.
 */
router.get(
  '/lgas',
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  async (_req: Request, res: Response) => {
    try {
      const lgasList = await db.query.lgas.findMany({
        columns: { id: true, name: true, code: true },
        orderBy: (lgas, { asc }) => [asc(lgas.name)],
      });

      res.json({
        status: 'success',
        data: lgasList,
      });
    } catch (error: unknown) {
      logger.error({
        event: 'admin.lgas.list_error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve LGAs list',
      });
    }
  }
);

export default router;
