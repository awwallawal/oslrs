import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { StaffService } from '../services/staff.service.js';
import { EmailBudgetService } from '../services/email-budget.service.js';
import { EmailService } from '../services/email.service.js';
import { queueStaffInvitationEmail } from '../queues/email.queue.js';
import type { EmailTier } from '@oslsr/types';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const logger = pino({ name: 'import-worker' });

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Email budget service for tracking limits
const emailTier = (process.env.EMAIL_TIER || 'free') as EmailTier;
const overageBudget = parseInt(process.env.EMAIL_MONTHLY_OVERAGE_BUDGET || '3000', 10);
const budgetService = new EmailBudgetService(connection, emailTier, overageBudget);

/**
 * Calculate the next available date for sending deferred emails
 * For free tier, this is tomorrow; for pro/scale, emails are not deferred
 */
function calculateEstimatedDeliveryDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.toISOString();
}

export const importWorker = new Worker(
  'staff-import',
  async (job: Job) => {
    const { rows, actorId } = job.data;

    const results = {
      total: rows.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [] as Array<{ row: number; error: string; data: unknown }>,
      // Email tracking (AC7)
      emailsQueued: 0,
      emailsDeferred: 0,
      estimatedDeliveryDate: undefined as string | undefined,
    };

    await job.updateProgress(0);

    for (const [index, row] of rows.entries()) {
      try {
        // Process the row and create user
        const user = await StaffService.processImportRow(row, actorId);
        results.succeeded++;

        // Try to queue invitation email (AC7)
        try {
          const budgetCheck = await budgetService.checkBudget();

          if (budgetCheck.allowed) {
            // Queue the email immediately
            const activationUrl = EmailService.generateStaffActivationUrl(user.invitationToken);

            await queueStaffInvitationEmail(
              {
                email: user.email,
                fullName: user.fullName,
                roleName: row.role_name,
                lgaName: row.lga_name,
                activationUrl,
                expiresInHours: 24,
              },
              user.id
            );

            results.emailsQueued++;

            logger.info({
              event: 'import.email.queued',
              jobId: job.id,
              userId: user.id,
              email: user.email,
            });
          } else {
            // Daily/monthly limit reached - defer email
            const deliveryDate = calculateEstimatedDeliveryDate();
            const activationUrl = EmailService.generateStaffActivationUrl(user.invitationToken);

            // Queue with scheduled delivery for tomorrow
            await queueStaffInvitationEmail(
              {
                email: user.email,
                fullName: user.fullName,
                roleName: row.role_name,
                lgaName: row.lga_name,
                activationUrl,
                expiresInHours: 24,
              },
              user.id,
              {
                scheduledFor: new Date(deliveryDate),
              }
            );

            results.emailsDeferred++;
            results.estimatedDeliveryDate = deliveryDate;

            logger.info({
              event: 'import.email.deferred',
              jobId: job.id,
              userId: user.id,
              email: user.email,
              reason: budgetCheck.reason,
              estimatedDeliveryDate: deliveryDate,
            });
          }
        } catch (emailErr: unknown) {
          // Email queuing failure should NOT block user creation (AC7, AC8)
          logger.warn({
            event: 'import.email.queue_failed',
            jobId: job.id,
            userId: user.id,
            error: emailErr instanceof Error ? emailErr.message : 'Unknown error',
          });
          // User was created successfully, just log the email failure
        }
      } catch (err: unknown) {
        results.failed++;
        results.errors.push({
          row: index + 1,
          error: err instanceof Error ? err.message : 'Unknown error',
          data: row,
        });
      }
      results.processed++;

      // Update progress periodically
      if (results.processed % 5 === 0 || results.processed === results.total) {
         await job.updateProgress(Math.round((results.processed / results.total) * 100));
      }
    }

    logger.info({
      event: 'import.completed',
      jobId: job.id,
      total: results.total,
      succeeded: results.succeeded,
      failed: results.failed,
      emailsQueued: results.emailsQueued,
      emailsDeferred: results.emailsDeferred,
    });

    return results;
  },
  {
    connection,
    concurrency: 2,
  }
);

importWorker.on('completed', (job) => {
  logger.info({
    event: 'import.job.completed',
    jobId: job.id,
  });
});

importWorker.on('failed', (job, err) => {
  logger.error({
    event: 'import.job.failed',
    jobId: job?.id,
    error: err.message,
  });
});
