import { Worker, Job, Queue } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import pino from 'pino';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
// Story 9-12 Task 10.3 (2026-05-11 session 8) — `VerificationEmailData`
// removed from imports alongside the retired hybrid Magic-Link/OTP flow.
import type { EmailJob, StaffInvitationEmailData, PasswordResetEmailData, PaymentNotificationEmailData, DisputeNotificationEmailData, DisputeResolutionEmailData, BackupNotificationEmailData, EmailJobType, RegistrationMagicLinkEmailData, RegistrationConfirmationEmailData, RegistrationThankYouEmailData } from '@oslsr/types';
import { resolveEmailTier } from '@oslsr/types';
import { EMAIL_TYPE_PRIORITY, isCitizenRegistrationEmailType } from '@oslsr/types';
import { EmailService } from '../services/email.service.js';
import { EmailBudgetService } from '../services/email-budget.service.js';
import { AuditService } from '../services/audit.service.js';
import { getBackoffDelay, deferEmail, getDeferredRecipients, getDeferredEmails, clearDeferredEmails } from '../queues/email.queue.js';
// Story 13-65 — the three registration sends execute HERE, in their own module (never reached back
// into `SubmissionProcessingService`: that would close an ESM cycle worker -> service -> queues).
import {
  handleRegistrationMagicLinkJob,
  handleRegistrationConfirmationJob,
  handleRegistrationThankYouJob,
  type RegistrationJobContext,
} from '../services/registration-email-jobs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const logger = pino({ name: 'email-worker' });

const connection = createRedisConnection();

// Budget service for tracking email sends
const emailTier = resolveEmailTier(); // canonical; defaults to `pro`, never silently to `free`
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
    // 'verification' job type retired — Story 9-12 Task 10.3.
    case 'password-reset': return job.data.email;
    case 'payment-notification': return job.data.email;
    case 'dispute-notification': return job.data.to;
    case 'dispute-resolution': return job.data.staffEmail;
    case 'backup-notification': return job.data.to;
    // Story 13-65 — this switch has NO `default`, so the compiler enforced these three.
    case 'registration-magic-link': return job.data.email;
    case 'registration-confirmation': return job.data.email;
    case 'registration-thankyou': return job.data.email;
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
    // Story 13-65 (AC1/AC4) — added EXPLICITLY. Unlike `getRecipientEmail` above, this switch HAS a
    // `default`, so an omission here compiles fine and silently ships a generic digest line. Only
    // `registration-thankyou` can ever reach the deferral path (the other two are `critical`), but
    // all three are listed so the next person does not have to work that out.
    case 'registration-magic-link': return 'Your registration resume link';
    case 'registration-confirmation': return 'Your registration reference code';
    case 'registration-thankyou': return 'Thank you for registering — refer someone';
    default: return `${job.type} notification`;
  }
}

/**
 * Email notification worker
 *
 * Processes email jobs from the email-notification queue.
 * Handles different email types, tracks budget, and logs failures to audit trail.
 *
 * AC3: Exponential backoff — effective 2min then 10min — BullMQ passes attemptsMade>=1, so index 0 is unreachable (13-65 D5).
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

    /**
     * Story 13-65 (AC4) — 🔴 BUDGET EXHAUSTION MUST NOT BE ABLE TO STOP A CITIZEN'S TRANSACTIONAL EMAIL.
     *
     * The block below pauses the WHOLE `email-notification` queue and throws. Before 13-65 that was
     * safe, because a registrant's magic link and reference code bypassed the queue entirely and
     * every queued type was ops/staff mail. Putting them ON the queue without this exemption would
     * create a failure mode THAT DOES NOT EXIST TODAY and is strictly worse than the one being
     * cured: an exhausted MARKETING budget silently stopping a citizen's LOGIN LINK.
     *
     * So the gate applies to `standard` work only. `critical` jobs proceed; the pause/throw path is
     * unreachable for them. 13-46's spend control is intact for everything else — a `standard`
     * thank-you under the same denial still pauses and still throws, and there is a test asserting
     * exactly that converse.
     *
     * ⚠️ This does NOT mean critical mail is free: `budgetService.recordSend()` below still counts
     * every send, so the overage stays visible and the exhaustion warning still fires once an hour.
     */
    if (!budgetCheck.allowed && emailPriority === 'critical') {
      logger.warn({
        event: 'email.job.budget_exhausted_critical_exempt',
        jobId: job.id,
        type,
        userId,
        reason: budgetCheck.reason,
        tier: budgetCheck.tier,
        note: 'critical/transactional job proceeding despite an exhausted budget — the queue is NOT paused for it (13-65 AC4)',
      });
    }

    if (!budgetCheck.allowed && emailPriority !== 'critical') {
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

      /**
       * ⚠️ Story 13-65 (review B1 / finding H1) — THE QUEUE-WIDE AUTO-PAUSE IS GONE. Do not restore it.
       *
       * It used to call `pauseEmailQueue()` here. `Queue.pause()` in BullMQ v5 is documented as
       * pausing the queue **GLOBALLY**: it RENAMEs the wait list, and jobs added afterwards go to the
       * PAUSED list instead of wait. The `critical` exemption above can therefore only ever help a
       * job the worker has ALREADY picked up — every magic link and reference confirmation enqueued
       * after the pause was silently parked and never dequeued.
       *
       * That did not matter before 13-65, because those two emails were dialled in-request and were
       * immune to queue state. It matters enormously now that they ride this queue: an exhausted
       * MARKETING budget would stop a citizen's LOGIN LINK, durably (the flag lives in Redis and
       * survives `pm2 restart` and deploy) with MANUAL-ONLY recovery — the sole `resumeEmailQueue()`
       * caller is an admin route. Silent, durable, needs a human: worse than the OOM this story cures.
       *
       * ⚠️ Gating the pause on "no critical work queued" was considered and REJECTED: it is a TOCTOU
       * (a magic link enqueued a millisecond later still lands in the paused list), so it would look
       * like a fix without being one.
       *
       * THE PER-JOB REFUSAL IS THE SPEND CONTROL, and it is sufficient. This check runs BEFORE the
       * provider call, so a denied `standard` job costs worker cycles, not money, and is bounded
       * (3 attempts, then terminal). Everything the operator relied on is unchanged: the exhaustion
       * warning above, its hourly dedup, and `recordSend()` accounting.
       *
       * An admin can still pause deliberately via `admin.routes.ts`; review B12 surfaces that state
       * in the burst alert so a paused queue no longer reads like a draining one.
       */
      // review C7 / finding R4 — the old text said "emails queued for tomorrow", which was true only
      // while the queue-wide pause HELD the job until budget rollover. Since review B1 removed that
      // pause the job simply retries its remaining attempts and is then DISCARDED, so the old wording
      // promised an operator a delivery that will never arrive.
      throw new Error(
        `Budget exhausted: ${budgetCheck.reason}. This STANDARD job will retry its remaining attempts ` +
          `and then be discarded — it is NOT held until tomorrow. Transactional mail is unaffected.`,
      );
    }

    // Calculate budget usage percentage for graduated throttling
    const { usage } = budgetCheck;
    const dailyPct = usage.dailyLimit > 0 ? usage.dailyCount / usage.dailyLimit : 0;
    const monthlyPct = usage.monthlyCount / usage.monthlyLimit;
    const budgetUsage = Math.max(dailyPct, monthlyPct);

    /**
     * ⚠️ Story 13-65 (review B2 / finding H2) — CITIZEN-FACING REGISTRATION MAIL IS NEVER DEFERRED.
     *
     * The deferral/digest mechanism was built for OPS/STAFF notifications: it swallows the job and
     * later mails a rolled-up "[OSLRS] You have N notifications" summary. Routing a citizen's
     * thank-you through it was a genuine regression, and a compliance one:
     *
     *   - it returns BEFORE the type switch, so the `source='public'` gate, the 13-9 suppression
     *     check, 13-46's 5-day per-address gap, the send-once marker and the burst counter are ALL
     *     skipped — every guard this story moved into the handler;
     *   - the digest is sent by `sendGenericEmail` with NO category, so it classifies as
     *     `notification-digest`: no List-Unsubscribe header, no marketing cap, no `campaign_sends`
     *     row — marketing mail laundered into an ops category;
     *   - it can therefore reach an address on the bounce / complaint / UNSUBSCRIBE list;
     *   - and it returns `{success: true, deferred: true}`, so nothing retries and nothing is
     *     counted lost. The real thank-you is simply never sent.
     *
     * Marketing VOLUME is already governed by 13-46's marketing cap, consulted per-send inside
     * `dispatch` — that is the correct control for this mail, and it is category-aware, loud, and
     * has its own operator page. The budget digest is not.
     */
    // review C10 — an explicit typed set, not a prefix test: adding a registration type without
    // deciding its digest behaviour must be a compile error, not a silent fall-through.
    const isCitizenRegistrationMail = isCitizenRegistrationEmailType(String(type));

    // Defer standard emails when budget is constrained (80%+)
    if (budgetUsage >= BUDGET_THRESHOLD_DEFER && emailPriority === 'standard' && !isCitizenRegistrationMail) {
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

    /**
     * Story 13-65 (AC6) — the registration handlers must know whether this is the LAST attempt, so
     * `recordAutoSendFailure` (a PAGING counter) fires only when the email is genuinely lost. Same
     * condition `logEmailFailureToAudit` already uses below.
     */
    const jobContext: RegistrationJobContext = {
      isFinalAttempt: job.attemptsMade + 1 >= (job.opts.attempts || 3),
    };

    try {
      let result: { success: boolean; messageId?: string; error?: string };

      switch (type) {
        case 'staff-invitation':
          result = await EmailService.sendStaffInvitationEmail(data as StaffInvitationEmailData);
          break;

        // Story 9-12 Task 10.3 (2026-05-11 session 8) — 'verification' job
        // type retired alongside the hybrid Magic-Link/OTP flow. Magic-link
        // emails for the wizard now flow through `MagicLinkService.sendMagicLinkEmail`
        // directly (synchronous to the issue handler, not queued).

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

        /**
         * Story 13-65 (AC1/AC2/AC9) — THE THREE REGISTRATION SENDS.
         *
         * What the queue buys here, stated exactly and no stronger: BOUNDED CONCURRENCY,
         * DURABILITY, RETRY and BACKPRESSURE. It does NOT reduce total CPU and does NOT give
         * event-loop isolation, because the workers run in the API process.
         *
         * Each handler re-runs its OWN guard block immediately before its send — send-once marker,
         * suppression, per-address gap — because a guard evaluated at enqueue and a send executed
         * minutes later is a guard that did not run. They resolve to `{ success: true }` here
         * because the handler either completed (sent, or deliberately skipped by a guard) or threw,
         * and a throw is what makes BullMQ retry.
         */
        case 'registration-magic-link':
          await handleRegistrationMagicLinkJob(data as RegistrationMagicLinkEmailData);
          result = { success: true };
          break;

        case 'registration-confirmation':
          await handleRegistrationConfirmationJob(data as RegistrationConfirmationEmailData, jobContext);
          result = { success: true };
          break;

        case 'registration-thankyou':
          await handleRegistrationThankYouJob(data as RegistrationThankYouEmailData, jobContext);
          result = { success: true };
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
      // AC3: Custom backoff strategy — effective 2min then 10min — BullMQ passes attemptsMade>=1, so index 0 is unreachable (13-65 D5)
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
  // Story 9-10 AC#5: digest cron fires every 30 minutes. flush_started + flush_empty
  // together accounted for ~46% of info-level log volume with no actionable signal
  // for the empty path. Demoted to debug; flush_skipped (budget exhaustion) stays warn.
  logger.debug({ event: 'email.digest.flush_started' });

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
    logger.debug({ event: 'email.digest.flush_empty' });
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
 * Close the worker connection (for graceful shutdown).
 *
 * Note: `connection` is also tracked by `closeAllConnections()` in lib/redis.ts which
 * does its own safe quit-with-catch. The .catch() here protects the SIGINT/SIGTERM
 * Promise.all chain in workers/index.ts:closeAllWorkers — if ioredis's reconnect
 * handler closed the connection mid-shutdown, the explicit quit() throws "Connection
 * is closed" and would crash the process. (Story 9-10 AC#2: 2026-04-27.)
 */
export async function closeEmailWorker(): Promise<void> {
  await emailWorker.close();
  // Connection may already be closed by ioredis's reconnect handler; the catch
  // matches the safe-double-quit pattern in lib/redis.ts:closeAllConnections.
  await connection.quit().catch(() => { /* already closed — safe */ });
}
