import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  type OdkHealthCheckJobData,
  getSubmissionGapThreshold,
} from '../queues/odk-health-check.queue.js';
import { queueOdkSyncAlertEmail } from '../queues/email.queue.js';
import {
  createOdkHealthService,
  getOdkConfig,
  isOdkFullyConfigured,
} from '@oslsr/odk-integration';
import { db } from '../db/index.js';
import { odkSyncFailures } from '../db/schema/index.js';
import { eq, isNull } from 'drizzle-orm';
import { createAlertRateLimiter } from '../services/odk-alert-rate-limiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const logger = pino({ name: 'odk-health-check-worker' });

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Redis keys for tracking
const CONSECUTIVE_FAILURES_KEY = 'odk:health:consecutive_failures';
const CONSECUTIVE_FAILURES_TTL = 24 * 60 * 60; // 24 hours

// Create alert rate limiter instance
const alertRateLimiter = createAlertRateLimiter({ redis: connection });

// Threshold for "unreachable" status (configurable via env var)
const UNREACHABLE_THRESHOLD = parseInt(process.env.ODK_UNREACHABLE_THRESHOLD || '3', 10);

/**
 * Create persistence adapter for the health service
 */
function createPersistenceAdapter() {
  return {
    createSyncFailure: async (input: {
      operation: string;
      errorMessage: string;
      errorCode: string;
      context?: Record<string, unknown>;
    }) => {
      const { uuidv7 } = await import('uuidv7');
      const id = uuidv7();
      const now = new Date();

      await db.insert(odkSyncFailures).values({
        id,
        operation: input.operation as 'form_deploy' | 'form_unpublish' | 'app_user_create' | 'submission_fetch',
        errorMessage: input.errorMessage,
        errorCode: input.errorCode,
        context: input.context,
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      });

      return {
        id,
        operation: input.operation as 'form_deploy' | 'form_unpublish' | 'app_user_create' | 'submission_fetch',
        errorMessage: input.errorMessage,
        errorCode: input.errorCode,
        context: input.context,
        retryCount: 0,
        resolvedAt: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
    },

    getSyncFailures: async (options?: { unresolvedOnly?: boolean }) => {
      const result = await db.query.odkSyncFailures.findMany({
        where: options?.unresolvedOnly ? isNull(odkSyncFailures.resolvedAt) : undefined,
        orderBy: (table, { desc }) => [desc(table.createdAt)],
      });

      return result.map((row) => ({
        id: row.id,
        operation: row.operation as 'form_deploy' | 'form_unpublish' | 'app_user_create' | 'submission_fetch',
        errorMessage: row.errorMessage,
        errorCode: row.errorCode,
        context: row.context as Record<string, unknown> | undefined,
        retryCount: row.retryCount,
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }));
    },

    getSyncFailureById: async (id: string) => {
      const row = await db.query.odkSyncFailures.findFirst({
        where: eq(odkSyncFailures.id, id),
      });

      if (!row) return null;

      return {
        id: row.id,
        operation: row.operation as 'form_deploy' | 'form_unpublish' | 'app_user_create' | 'submission_fetch',
        errorMessage: row.errorMessage,
        errorCode: row.errorCode,
        context: row.context as Record<string, unknown> | undefined,
        retryCount: row.retryCount,
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    },

    updateSyncFailure: async (id: string, updates: Record<string, unknown>) => {
      await db
        .update(odkSyncFailures)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(odkSyncFailures.id, id));
    },

    deleteSyncFailure: async (id: string) => {
      await db.delete(odkSyncFailures).where(eq(odkSyncFailures.id, id));
    },
  };
}

/**
 * ODK Health Check Worker
 *
 * Per Story 2-5: Processes scheduled and manual health check jobs.
 *
 * Checks:
 * 1. ODK connectivity via GET /v1/users/current
 * 2. Submission count comparison (ODK vs app_db)
 * 3. Tracks consecutive failures in Redis
 *
 * Actions:
 * - Logs health status
 * - Records sync failures to database
 * - Sends email alerts on gap detection or unreachability (rate-limited)
 */
export const odkHealthCheckWorker = new Worker<OdkHealthCheckJobData>(
  'odk-health-check',
  async (job: Job<OdkHealthCheckJobData>) => {
    const { triggeredBy, timestamp } = job.data;

    logger.info({
      event: 'odk.health.check_started',
      jobId: job.id,
      triggeredBy,
      timestamp,
    });

    // Check if ODK is configured
    if (!isOdkFullyConfigured()) {
      logger.warn({
        event: 'odk.health.check_skipped',
        jobId: job.id,
        reason: 'ODK not configured',
      });
      return {
        success: false,
        reason: 'ODK_NOT_CONFIGURED',
        skipped: true,
      };
    }

    const config = getOdkConfig();
    if (!config) {
      logger.warn({
        event: 'odk.health.check_skipped',
        jobId: job.id,
        reason: 'ODK config unavailable',
      });
      return {
        success: false,
        reason: 'ODK_CONFIG_UNAVAILABLE',
        skipped: true,
      };
    }

    const persistence = createPersistenceAdapter();
    const healthService = createOdkHealthService({
      persistence,
      logger: {
        info: (obj) => logger.info(obj),
        warn: (obj) => logger.warn(obj),
        error: (obj) => logger.error(obj),
        debug: (obj) => logger.debug(obj),
      },
    });

    try {
      // Step 1: Check connectivity
      const connectivity = await healthService.checkOdkConnectivity();

      if (!connectivity.reachable) {
        // Increment consecutive failures
        const failures = await incrementConsecutiveFailures();

        logger.error({
          event: 'odk.health.connectivity_failed',
          jobId: job.id,
          latencyMs: connectivity.latencyMs,
          consecutiveFailures: failures,
        });

        // Check if we've hit the unreachable threshold
        if (failures >= UNREACHABLE_THRESHOLD) {
          logger.fatal({
            event: 'odk.health.central_unreachable',
            consecutiveFailures: failures,
            threshold: UNREACHABLE_THRESHOLD,
          });

          // Send alert if not rate-limited (AC6)
          await sendAlertIfAllowed('unreachable', {
            consecutiveFailures: failures,
            lastError: 'ODK Central connectivity check failed',
          });
        }

        return {
          success: false,
          connectivity,
          consecutiveFailures: failures,
        };
      }

      // Reset consecutive failures on success
      const previousFailures = await getConsecutiveFailures();
      if (previousFailures > 0) {
        await resetConsecutiveFailures();
        logger.info({
          event: 'odk.health.central_recovered',
          previousFailures,
        });
      }

      // Step 2: Check submission counts
      const submissionCounts = await healthService.getSubmissionCounts(config.ODK_PROJECT_ID);
      // Threshold for gap detection - used in Story 3.4 when submissions table is populated
      const _threshold = getSubmissionGapThreshold();

      // TODO(Story-3.4): Wire up submission gap comparison and alerts
      // Story 3.4 "Idempotent Webhook Ingestion" will populate the submissions table.
      // Once populated, add logic here to:
      // 1. Query app_db submission counts per form
      // 2. Compare with submissionCounts.byForm
      // 3. Calculate gap per form and total
      // 4. If gap > threshold, call: sendAlertIfAllowed('submission_gap', { gap, threshold, byForm })
      // 5. Log event: 'odk.health.submission_gap_detected'
      // Reference: AC4 in Story 2-5
      logger.info({
        event: 'odk.health.submission_counts',
        jobId: job.id,
        odkCount: submissionCounts.odkCount,
        formCount: submissionCounts.byForm.length,
        note: 'Gap comparison deferred to Story 3.4',
      });

      // Step 3: Get unresolved sync failures
      const syncFailures = await healthService.getSyncFailures();

      logger.info({
        event: 'odk.health.check_completed',
        jobId: job.id,
        triggeredBy,
        connectivity: {
          reachable: connectivity.reachable,
          latencyMs: connectivity.latencyMs,
        },
        odkSubmissionCount: submissionCounts.odkCount,
        unresolvedFailures: syncFailures.length,
      });

      return {
        success: true,
        connectivity,
        submissionCounts,
        unresolvedFailures: syncFailures.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Increment consecutive failures
      const failures = await incrementConsecutiveFailures();

      logger.error({
        event: 'odk.health.check_error',
        jobId: job.id,
        error: errorMessage,
        consecutiveFailures: failures,
      });

      // Send alert if at threshold (AC6)
      if (failures >= UNREACHABLE_THRESHOLD) {
        await sendAlertIfAllowed('unreachable', {
          consecutiveFailures: failures,
          lastError: errorMessage,
        });
      }

      throw error;
    }
  },
  {
    connection,
    concurrency: 1, // Only one health check at a time
  }
);

/**
 * Get consecutive failures count from Redis
 */
async function getConsecutiveFailures(): Promise<number> {
  const value = await connection.get(CONSECUTIVE_FAILURES_KEY);
  return value ? parseInt(value, 10) : 0;
}

/**
 * Increment consecutive failures in Redis
 */
async function incrementConsecutiveFailures(): Promise<number> {
  const newValue = await connection.incr(CONSECUTIVE_FAILURES_KEY);
  await connection.expire(CONSECUTIVE_FAILURES_KEY, CONSECUTIVE_FAILURES_TTL);
  return newValue;
}

/**
 * Reset consecutive failures in Redis
 */
async function resetConsecutiveFailures(): Promise<void> {
  await connection.del(CONSECUTIVE_FAILURES_KEY);
}

/**
 * Send alert if not rate-limited (6 hours between alerts)
 * Per AC4/AC6: Sends email alert to Super Admin
 */
async function sendAlertIfAllowed(
  alertType: 'submission_gap' | 'unreachable',
  details: {
    consecutiveFailures?: number;
    lastError?: string;
  }
): Promise<boolean> {
  // Check if we've sent an alert recently (using extracted rate limiter)
  const canSend = await alertRateLimiter.canSendAlert();
  if (!canSend) {
    const lastSent = await alertRateLimiter.getLastSentTimestamp();
    logger.info({
      event: 'odk.health.alert_rate_limited',
      alertType,
      lastSent,
    });
    return false;
  }

  // Get Super Admin email from environment
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  if (!superAdminEmail) {
    logger.warn({
      event: 'odk.health.alert_skipped',
      reason: 'SUPER_ADMIN_EMAIL not configured',
      alertType,
    });
    return false;
  }

  // Set rate limit key before sending to prevent duplicate sends
  await alertRateLimiter.markAlertSent();

  // Queue email alert job (Task 8)
  const dashboardUrl = `${process.env.APP_URL || 'https://app.oslsr.gov.ng'}/admin/odk-health`;
  const checkedAt = new Date().toISOString();

  try {
    await queueOdkSyncAlertEmail({
      email: superAdminEmail,
      alertType,
      unreachableDetails: alertType === 'unreachable' ? {
        consecutiveFailures: details.consecutiveFailures || UNREACHABLE_THRESHOLD,
        lastSuccessful: null,
        lastError: details.lastError || 'ODK Central unreachable',
      } : undefined,
      dashboardUrl,
      checkedAt,
    });

    logger.warn({
      event: 'odk.health.alert_queued',
      alertType,
      email: superAdminEmail,
    });

    return true;
  } catch (error) {
    logger.error({
      event: 'odk.health.alert_queue_failed',
      alertType,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

// Worker event handlers
odkHealthCheckWorker.on('completed', (job) => {
  logger.info({
    event: 'odk.health.worker.job_completed',
    jobId: job.id,
  });
});

odkHealthCheckWorker.on('failed', (job, err) => {
  logger.error({
    event: 'odk.health.worker.job_failed',
    jobId: job?.id,
    error: err.message,
  });
});

odkHealthCheckWorker.on('error', (err) => {
  logger.error({
    event: 'odk.health.worker.error',
    error: err.message,
  });
});

/**
 * Close the worker connection (for graceful shutdown)
 */
export async function closeHealthCheckWorker(): Promise<void> {
  await odkHealthCheckWorker.close();
  await connection.quit();
}
