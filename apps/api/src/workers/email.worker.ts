import { Worker, Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import type { EmailJob, StaffInvitationEmailData, VerificationEmailData, PasswordResetEmailData, PaymentNotificationEmailData, DisputeNotificationEmailData, DisputeResolutionEmailData, BackupNotificationEmailData, EmailTier, EmailJobType } from '@oslsr/types';
import { EMAIL_TYPE_PRIORITY } from '@oslsr/types';
import { EmailService } from '../services/email.service.js';
import { EmailBudgetService } from '../services/email-budget.service.js';
import { AuditService } from '../services/audit.service.js';
import { getBackoffDelay, pauseEmailQueue, deferEmail, getDeferredRecipients, getDeferredEmails, clearDeferredEmails } from '../queues/email.queue.js';

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

// Adaptive throttling thresholds (Task 3)
export const BUDGET_THRESHOLD_DEFER = 0.8;   // 80% — defer standard emails
export const BUDGET_THRESHOLD_WARNING = 0.95; // 95% — defer standard + log warning

/**
 * Extract recipient email from job data for deferral purposes.
 */
function getRecipientEmail(job: EmailJob): string {
  switch (job.type) {
    case 'staff-invitation': return job.data.email;
    case 'verification': return job.data.email;
    case 'password-reset': return job.data.email;
    case 'payment-notification': return job.data.email;
    case 'dispute-notification': return job.data.to;
    case 'dispute-resolution': return job.data.staffEmail;
    case 'backup-notification': return job.data.to;
  }
}

/**
 * Build a short summary for deferred email digest display.
 */
function buildDeferralSummary(job: EmailJob): string {
  switch (job.type) {
    case 'payment-notification': return `Payment recorded: ${job.data.trancheName}`;
    case 'dispute-notification': return `Dispute raised by ${job.data.staffName}`;
    case 'dispute-resolution': return `Dispute ${job.data.action}: ${job.data.trancheName}`;
    case 'backup-notification': return job.data.subject;
    default: return `${job.type} notification`;
  }
}

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
    // Handle digest-flush repeatable job (Task 4)
    if (job.name === 'digest-flush') {
      return processDigestFlush();
    }

    const { type, data } = job.data;
    const userId = 'userId' in job.data ? job.data.userId : null;

    logger.info({
      event: 'email.job.started',
      jobId: job.id,
      type,
      userId,
      attempt: job.attemptsMade + 1,
    });

    // Adaptive throttling: graduated budget check (Task 3)
    const budgetCheck = await budgetService.checkBudget();
    const emailPriority = job.data.priority ?? EMAIL_TYPE_PRIORITY[type as EmailJobType] ?? 'standard';

    if (!budgetCheck.allowed) {
      // Budget fully exhausted — pause queue, single alert via log (not email)
      // Use Redis key to ensure only one exhaustion alert per hour (L2)
      const alertKey = 'email:budget:exhaustion_alert';
      const alreadyAlerted = await connection.exists(alertKey);

      if (!alreadyAlerted) {
        await connection.set(alertKey, '1', 'EX', 3600); // 1-hour dedup
        logger.warn({
          event: 'email.job.budget_exhausted',
          jobId: job.id,
          type,
          userId,
          reason: budgetCheck.reason,
          tier: budgetCheck.tier,
        });
      }

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

      throw new Error(`Budget exhausted: ${budgetCheck.reason}. Daily email limit reached - emails queued for tomorrow.`);
    }

    // Calculate budget usage percentage for graduated throttling
    const { usage } = budgetCheck;
    const dailyPct = usage.dailyLimit > 0 ? usage.dailyCount / usage.dailyLimit : 0;
    const monthlyPct = usage.monthlyCount / usage.monthlyLimit;
    const budgetUsage = Math.max(dailyPct, monthlyPct);

    // Defer standard emails when budget is constrained (80%+)
    if (budgetUsage >= BUDGET_THRESHOLD_DEFER && emailPriority === 'standard') {
      const recipientEmail = getRecipientEmail(job.data);
      const summary = buildDeferralSummary(job.data);

      if (budgetUsage >= BUDGET_THRESHOLD_WARNING) {
        logger.warn({
          event: 'email.job.deferred_high',
          jobId: job.id,
          type,
          recipientEmail,
          budgetUsage: Math.round(budgetUsage * 100),
        });
      } else {
        logger.info({
          event: 'email.job.deferred',
          jobId: job.id,
          type,
          recipientEmail,
          budgetUsage: Math.round(budgetUsage * 100),
        });
      }

      await deferEmail(recipientEmail, type as EmailJobType, summary);

      return {
        success: true,
        deferred: true,
        type,
        userId,
        reason: 'budget_constrained',
      };
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

        case 'payment-notification':
          result = await EmailService.sendPaymentNotificationEmail(data as PaymentNotificationEmailData);
          break;

        case 'dispute-notification':
          result = await EmailService.sendDisputeNotificationEmail(data as DisputeNotificationEmailData);
          break;

        case 'dispute-resolution':
          result = await EmailService.sendDisputeResolutionEmail(data as DisputeResolutionEmailData);
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

// ============================================================================
// Digest Flush (Task 4) — consolidate deferred emails into batch digests
// ============================================================================

/** Digest flush cron interval: every 30 minutes */
const DIGEST_CRON = '*/30 * * * *';

/**
 * Process deferred emails: consolidate per-recipient into a single digest.
 * Called by the 'digest-flush' repeatable job.
 */
async function processDigestFlush(): Promise<{ recipients: number; sent: number; skipped: number }> {
  logger.info({ event: 'email.digest.flush_started' });

  // Check budget before sending digests (Task 4.5)
  const budgetCheck = await budgetService.checkBudget();
  if (!budgetCheck.allowed) {
    logger.warn({
      event: 'email.digest.flush_skipped',
      reason: 'budget_exhausted',
    });
    return { recipients: 0, sent: 0, skipped: 0 };
  }

  const recipients = await getDeferredRecipients();
  if (recipients.length === 0) {
    logger.info({ event: 'email.digest.flush_empty' });
    return { recipients: 0, sent: 0, skipped: 0 };
  }

  let sent = 0;
  let skipped = 0;

  for (const recipientEmail of recipients) {
    const items = await getDeferredEmails(recipientEmail);
    if (items.length === 0) {
      await clearDeferredEmails(recipientEmail);
      skipped++;
      continue;
    }

    // Re-check budget for each recipient (might exhaust mid-flush)
    const midCheck = await budgetService.checkBudget();
    if (!midCheck.allowed) {
      logger.warn({
        event: 'email.digest.flush_budget_hit',
        remaining: recipients.length - sent - skipped,
      });
      break;
    }

    // Build and send the digest email
    const summaryLines = items.map((item) => `- ${item.summary} (${item.type})`);
    const html = buildDigestHtml(recipientEmail, items.length, summaryLines);
    const text = buildDigestText(recipientEmail, items.length, summaryLines);

    const result = await EmailService.sendGenericEmail({
      to: recipientEmail,
      subject: `[OSLRS] You have ${items.length} notification${items.length > 1 ? 's' : ''}`,
      html,
      text,
    });

    if (result.success) {
      await budgetService.recordSend();
      await clearDeferredEmails(recipientEmail);
      sent++;
      logger.info({
        event: 'email.digest.sent',
        recipientEmail,
        itemCount: items.length,
      });
    } else {
      logger.error({
        event: 'email.digest.send_failed',
        recipientEmail,
        error: result.error,
      });
      skipped++;
    }
  }

  logger.info({
    event: 'email.digest.flush_complete',
    recipients: recipients.length,
    sent,
    skipped,
  });

  return { recipients: recipients.length, sent, skipped };
}

/** Escape HTML special characters to prevent injection in digest emails. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildDigestHtml(recipientEmail: string, count: number, summaryLines: string[]): string {
  const listItems = summaryLines.map((line) => `<li style="margin: 5px 0;">${escapeHtml(line.slice(2))}</li>`).join('\n');
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Notification Digest - OSLSR</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #9C1E23; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">OSLSR</h1>
    <p style="color: #f0f0f0; margin: 5px 0 0 0;">Oyo State Labour & Skills Registry</p>
  </div>
  <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    <h2 style="color: #333; margin-top: 0;">You have ${count} notification${count > 1 ? 's' : ''}</h2>
    <p>Here is a summary of your recent notifications:</p>
    <ul style="padding-left: 20px;">${listItems}</ul>
    <p>Log in to the OSLSR dashboard for full details.</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="font-size: 12px; color: #999;">
      This is an automated digest from the OSLSR system. Do not reply to this email.
    </p>
  </div>
</body>
</html>`.trim();
}

function buildDigestText(recipientEmail: string, count: number, summaryLines: string[]): string {
  return `You have ${count} notification${count > 1 ? 's' : ''}\n\n${summaryLines.join('\n')}\n\nLog in to the OSLSR dashboard for full details.`;
}

/**
 * Schedule the digest flush repeatable job (every 30 minutes).
 * Call this during worker initialization.
 */
export async function scheduleDigestFlush(): Promise<void> {
  const queue = new Queue('email-notification', { connection });

  await queue.add(
    'digest-flush',
    // Digest-flush jobs carry no payload — they process deferred items from Redis.
    // The type assertion is intentional: job.name === 'digest-flush' is checked
    // before accessing job.data fields (see worker handler at line 75).
    {} as EmailJob,
    {
      repeat: { pattern: DIGEST_CRON },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  await queue.close();

  logger.info({ event: 'email.digest.scheduled', cron: DIGEST_CRON });
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
