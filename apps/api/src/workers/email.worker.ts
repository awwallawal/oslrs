import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import type { EmailJob, StaffInvitationEmailData, VerificationEmailData, PasswordResetEmailData, BackupNotificationEmailData, EmailTier } from '@oslsr/types';
import { EmailService } from '../services/email.service.js';
import { EmailBudgetService } from '../services/email-budget.service.js';
import { AuditService } from '../services/audit.service.js';
import { getBackoffDelay, pauseEmailQueue } from '../queues/email.queue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const logger = pino({ name: 'email-worker' });

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Budget service for tracking email sends
const emailTier = (process.env.EMAIL_TIER || 'free') as EmailTier;
const overageBudget = parseInt(process.env.EMAIL_MONTHLY_OVERAGE_BUDGET || '3000', 10);
const budgetService = new EmailBudgetService(connection, emailTier, overageBudget);

/**
 * Email notification worker
 *
 * Processes email jobs from the email-notification queue.
 * Handles different email types, tracks budget, and logs failures to audit trail.
 *
 * AC3: Exponential backoff (30s, 2min, 10min)
 * AC4: Budget tracking with automatic queue pause when exhausted
 */
export const emailWorker = new Worker<EmailJob>(
  'email-notification',
  async (job: Job<EmailJob>) => {
    const { type, data } = job.data;
    const userId = 'userId' in job.data ? job.data.userId : null;

    logger.info({
      event: 'email.job.started',
      jobId: job.id,
      type,
      userId,
      attempt: job.attemptsMade + 1,
    });

    // AC4: Check budget before sending
    const budgetCheck = await budgetService.checkBudget();
    if (!budgetCheck.allowed) {
      logger.warn({
        event: 'email.job.budget_exhausted',
        jobId: job.id,
        type,
        userId,
        reason: budgetCheck.reason,
        tier: budgetCheck.tier,
      });

      // Pause the queue to prevent further processing
      try {
        await pauseEmailQueue();
        await connection.set('email:queue:paused', 'true');
        logger.info({ event: 'email.queue.auto_paused', reason: budgetCheck.reason });
      } catch (pauseErr) {
        logger.error({
          event: 'email.queue.pause_failed',
          error: pauseErr instanceof Error ? pauseErr.message : 'Unknown error',
        });
      }

      // Throw to retry later (job will be delayed)
      throw new Error(`Budget exhausted: ${budgetCheck.reason}. Daily email limit reached - emails queued for tomorrow.`);
    }

    try {
      let result;

      switch (type) {
        case 'staff-invitation':
          result = await EmailService.sendStaffInvitationEmail(data as StaffInvitationEmailData);
          break;

        case 'verification':
          result = await EmailService.sendVerificationEmail(data as VerificationEmailData);
          break;

        case 'password-reset':
          result = await EmailService.sendPasswordResetEmail(data as PasswordResetEmailData);
          break;

        case 'backup-notification':
          result = await EmailService.sendGenericEmail(data as BackupNotificationEmailData);
          break;

        default:
          throw new Error(`Unknown email type: ${type}`);
      }

      if (!result.success) {
        throw new Error(result.error || 'Email send failed');
      }

      // AC4: Record successful send for budget tracking
      await budgetService.recordSend();

      logger.info({
        event: 'email.job.completed',
        jobId: job.id,
        type,
        userId,
        messageId: result.messageId,
      });

      return {
        success: true,
        messageId: result.messageId,
        type,
        userId,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({
        event: 'email.job.failed',
        jobId: job.id,
        type,
        userId,
        error: errorMessage,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts,
      });

      // If this is the final attempt, log to audit trail
      if (job.attemptsMade + 1 >= (job.opts.attempts || 3)) {
        await logEmailFailureToAudit(job.data, errorMessage);
      }

      throw error;
    }
  },
  {
    connection,
    concurrency: 5, // Process up to 5 emails concurrently
    settings: {
      // AC3: Custom backoff strategy (30s, 2min, 10min)
      backoffStrategy: (attemptsMade: number) => {
        return getBackoffDelay(attemptsMade);
      },
    },
  }
);

/**
 * Log email failure to audit trail
 */
async function logEmailFailureToAudit(emailJob: EmailJob, errorMessage: string): Promise<void> {
  try {
    const userId = 'userId' in emailJob ? emailJob.userId : null;

    // Sanitize data - never log full URLs (NFR4.7)
    const sanitizedData = {
      type: emailJob.type,
      userId,
      email: 'email' in emailJob.data ? emailJob.data.email : undefined,
      error: errorMessage,
      // Intentionally NOT logging: activationUrl, verificationUrl, resetUrl, otpCode
    };

    AuditService.logAction({
      action: 'email.delivery.failed',
      targetResource: 'email',
      targetId: userId ?? 'system',
      actorId: null,
      details: sanitizedData,
    });

    logger.info({
      event: 'email.failure.audited',
      type: emailJob.type,
      userId,
    });
  } catch (auditError: unknown) {
    // Don't let audit logging failure break the worker
    logger.error({
      event: 'email.audit.failed',
      error: auditError instanceof Error ? auditError.message : 'Unknown error',
    });
  }
}

// Worker event handlers
emailWorker.on('completed', (job) => {
  logger.info({
    event: 'email.worker.job_completed',
    jobId: job.id,
    type: job.data.type,
  });
});

emailWorker.on('failed', (job, err) => {
  logger.error({
    event: 'email.worker.job_failed',
    jobId: job?.id,
    type: job?.data.type,
    error: err.message,
    attempt: job?.attemptsMade,
  });
});

emailWorker.on('error', (err) => {
  logger.error({
    event: 'email.worker.error',
    error: err.message,
  });
});

/**
 * Close the worker connection (for graceful shutdown)
 */
export async function closeEmailWorker(): Promise<void> {
  await emailWorker.close();
  await connection.quit();
}
