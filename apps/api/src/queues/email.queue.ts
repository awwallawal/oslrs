import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import type {
  EmailJob,
  EmailJobType,
  StaffInvitationEmailData,
  VerificationEmailData,
  PasswordResetEmailData,
  PaymentNotificationEmailData,
  DisputeNotificationEmailData,
  DisputeResolutionEmailData,
  BackupNotificationEmailData,
} from '@oslsr/types';
import { EMAIL_TYPE_PRIORITY } from '@oslsr/types';

const queueLogger = pino({ name: 'email-queue' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// Check if we're in test mode
const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

// Lazy-initialized connection and queue to avoid Redis connection during test imports
let connection: Redis | null = null;
let emailQueueInstance: Queue<EmailJob> | null = null;

function getConnection(): Redis {
  if (!connection) {
    connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

/**
 * Custom backoff delays per AC3: 30s, 2min, 10min
 */
const BACKOFF_DELAYS = [30000, 120000, 600000]; // 30s, 2min, 10min

/**
 * Get the email queue instance (lazy-initialized)
 */
function getEmailQueue(): Queue<EmailJob> {
  if (!emailQueueInstance) {
    emailQueueInstance = new Queue<EmailJob>('email-notification', {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'custom',
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 1000, // Keep max 1000 completed jobs
        },
        removeOnFail: {
          age: 24 * 3600, // Keep failed jobs for 24 hours
        },
      },
    });
  }
  return emailQueueInstance;
}

/**
 * Email notification queue
 *
 * Handles asynchronous email delivery with:
 * - Custom backoff retry (3 attempts: 30s, 2min, 10min per AC3)
 * - Job completion cleanup (keep for 1 hour)
 * - Failed job retention (24 hours for debugging)
 *
 * Job types:
 * - staff-invitation: Staff provisioning invitation emails
 * - verification: Public user email verification (Magic Link + OTP)
 * - password-reset: Password reset emails
 *
 * @deprecated Use getEmailQueue() for lazy initialization. This export is kept for backwards compatibility.
 */
export const emailQueue = {
  get add() {
    return getEmailQueue().add.bind(getEmailQueue());
  },
  get getWaitingCount() {
    return getEmailQueue().getWaitingCount.bind(getEmailQueue());
  },
  get getActiveCount() {
    return getEmailQueue().getActiveCount.bind(getEmailQueue());
  },
  get getCompletedCount() {
    return getEmailQueue().getCompletedCount.bind(getEmailQueue());
  },
  get getFailedCount() {
    return getEmailQueue().getFailedCount.bind(getEmailQueue());
  },
  get getDelayedCount() {
    return getEmailQueue().getDelayedCount.bind(getEmailQueue());
  },
  get isPaused() {
    return getEmailQueue().isPaused.bind(getEmailQueue());
  },
  get pause() {
    return getEmailQueue().pause.bind(getEmailQueue());
  },
  get resume() {
    return getEmailQueue().resume.bind(getEmailQueue());
  },
  get close() {
    return getEmailQueue().close.bind(getEmailQueue());
  },
};

/**
 * Get backoff delay for a given attempt number (0-indexed)
 * Returns delay in milliseconds: 30s, 2min, 10min
 */
export function getBackoffDelay(attemptsMade: number): number {
  return BACKOFF_DELAYS[Math.min(attemptsMade, BACKOFF_DELAYS.length - 1)];
}

// ============================================================================
// Deduplication (Task 2) — prevent duplicate emails within a time window
// ============================================================================

/** Default dedup window in seconds (5 minutes) */
export const DEDUP_TTL_SECONDS = 5 * 60;

/**
 * Build the Redis dedup key for a recipient + job type combination.
 */
export function buildDedupKey(recipientEmail: string, jobType: EmailJobType): string {
  return `email:dedup:${recipientEmail}:${jobType}`;
}

/**
 * Check if an email should be deduplicated.
 * Returns true if a duplicate exists (email should be skipped).
 * Critical emails always return false (bypass dedup).
 */
async function checkDedup(
  recipientEmail: string,
  jobType: EmailJobType,
): Promise<boolean> {
  const priority = EMAIL_TYPE_PRIORITY[jobType];

  // Critical emails bypass deduplication (Task 2.4)
  if (priority === 'critical') {
    return false;
  }

  const conn = getConnection();
  const key = buildDedupKey(recipientEmail, jobType);
  const exists = await conn.exists(key);

  if (exists) {
    queueLogger.info({
      event: 'email.dedup.skipped',
      recipientEmail,
      jobType,
      reason: 'duplicate_within_window',
    });
    return true;
  }

  // Set the dedup key with TTL
  await conn.set(key, '1', 'EX', DEDUP_TTL_SECONDS);
  return false;
}

// ============================================================================
// Deferred email storage (Task 3/4) — Redis sorted set for batch digests
// ============================================================================

/** Build the Redis key for a recipient's deferred email set */
export function buildDeferredKey(recipientEmail: string): string {
  return `email:deferred:${recipientEmail}`;
}

/** Redis set tracking which recipients have deferred emails */
export const DEFERRED_RECIPIENTS_KEY = 'email:deferred:recipients';

/**
 * Defer a standard email to be sent later as part of a batch digest.
 * Stores a summary in a Redis sorted set keyed by recipient.
 */
export async function deferEmail(
  recipientEmail: string,
  jobType: EmailJobType,
  summary: string,
): Promise<void> {
  const conn = getConnection();
  const key = buildDeferredKey(recipientEmail);
  const now = Date.now();

  // Dedup: skip if same type already deferred for this recipient (M3)
  const existing = await conn.zrange(key, 0, -1);
  for (const m of existing) {
    try {
      const entry = JSON.parse(m);
      if (entry.type === jobType) {
        queueLogger.info({
          event: 'email.deferred.dedup_skipped',
          recipientEmail,
          jobType,
          reason: 'same_type_already_deferred',
        });
        return;
      }
    } catch {
      // Corrupt entry — ignore during dedup check
    }
  }

  const member = JSON.stringify({ type: jobType, summary, timestamp: now });
  await conn.zadd(key, now, member);
  // Track this recipient for the digest flush job
  await conn.sadd(DEFERRED_RECIPIENTS_KEY, recipientEmail);
  // Set TTL on deferred set to auto-expire if flush fails (24 hours)
  await conn.expire(key, 24 * 60 * 60);

  queueLogger.info({
    event: 'email.deferred',
    recipientEmail,
    jobType,
    summary,
  });
}

/**
 * Get all recipients with deferred emails.
 */
export async function getDeferredRecipients(): Promise<string[]> {
  if (isTestMode()) return [];
  const conn = getConnection();
  return conn.smembers(DEFERRED_RECIPIENTS_KEY);
}

/**
 * Get all deferred emails for a recipient.
 */
export async function getDeferredEmails(
  recipientEmail: string,
): Promise<Array<{ type: EmailJobType; summary: string; timestamp: number }>> {
  if (isTestMode()) return [];
  const conn = getConnection();
  const key = buildDeferredKey(recipientEmail);
  const members = await conn.zrange(key, 0, -1);
  const results: Array<{ type: EmailJobType; summary: string; timestamp: number }> = [];
  for (const m of members) {
    try {
      results.push(JSON.parse(m));
    } catch {
      queueLogger.warn({ event: 'email.deferred.corrupt_entry', recipientEmail, raw: m });
    }
  }
  return results;
}

/**
 * Clear deferred emails for a recipient after digest delivery.
 */
export async function clearDeferredEmails(recipientEmail: string): Promise<void> {
  const conn = getConnection();
  const key = buildDeferredKey(recipientEmail);
  await conn.del(key);
  await conn.srem(DEFERRED_RECIPIENTS_KEY, recipientEmail);
}

/**
 * Get total count of deferred emails across all recipients.
 */
export async function getDeferredCount(): Promise<number> {
  if (isTestMode()) return 0;
  const conn = getConnection();
  const recipients = await conn.smembers(DEFERRED_RECIPIENTS_KEY);
  if (recipients.length === 0) return 0;

  let total = 0;
  for (const email of recipients) {
    total += await conn.zcard(buildDeferredKey(email));
  }
  return total;
}

// ============================================================================
// Queue functions
// ============================================================================

/**
 * Add a staff invitation email to the queue
 */
export async function queueStaffInvitationEmail(
  data: StaffInvitationEmailData,
  userId: string,
  options?: {
    scheduledFor?: Date;
    priority?: number;
  }
): Promise<string> {
  // In test mode, return a mock job ID
  if (isTestMode()) {
    return 'test-job-id';
  }

  const job = await getEmailQueue().add(
    'staff-invitation',
    {
      type: 'staff-invitation',
      data,
      userId,
      priority: EMAIL_TYPE_PRIORITY['staff-invitation'],
      scheduledFor: options?.scheduledFor?.toISOString(),
    } as EmailJob,
    {
      delay: options?.scheduledFor
        ? options.scheduledFor.getTime() - Date.now()
        : undefined,
      priority: options?.priority,
    }
  );
  return job.id || '';
}

/**
 * Add a verification email to the queue
 */
export async function queueVerificationEmail(
  data: VerificationEmailData,
  userId: string
): Promise<string> {
  // In test mode, return a mock job ID
  if (isTestMode()) {
    return 'test-job-id';
  }

  const job = await getEmailQueue().add('verification', {
    type: 'verification',
    data,
    userId,
    priority: EMAIL_TYPE_PRIORITY['verification'],
  } as EmailJob);
  return job.id || '';
}

/**
 * Add a password reset email to the queue
 */
export async function queuePasswordResetEmail(
  data: PasswordResetEmailData,
  userId: string
): Promise<string> {
  // In test mode, return a mock job ID
  if (isTestMode()) {
    return 'test-job-id';
  }

  const job = await getEmailQueue().add('password-reset', {
    type: 'password-reset',
    data,
    userId,
    priority: EMAIL_TYPE_PRIORITY['password-reset'],
  } as EmailJob);
  return job.id || '';
}

/**
 * Add a payment notification email to the queue.
 * Queues one personalized email per affected staff member.
 * Subject to per-recipient deduplication (standard priority).
 */
export async function queuePaymentNotificationEmail(
  data: PaymentNotificationEmailData,
  userId: string,
): Promise<string> {
  if (isTestMode()) {
    return 'test-job-id';
  }

  if (await checkDedup(data.email, 'payment-notification')) {
    return 'dedup-skipped';
  }

  const job = await getEmailQueue().add('payment-notification', {
    type: 'payment-notification',
    data,
    userId,
    priority: EMAIL_TYPE_PRIORITY['payment-notification'],
  } as EmailJob);
  return job.id || '';
}

/**
 * Add a dispute notification email to the queue.
 * Story 6.5: Notifies Super Admin(s) when staff raises a payment dispute.
 * Subject to per-recipient deduplication (standard priority).
 */
export async function queueDisputeNotificationEmail(
  data: DisputeNotificationEmailData,
  userId?: string,
): Promise<string> {
  if (isTestMode()) {
    return 'test-job-id';
  }

  if (await checkDedup(data.to, 'dispute-notification')) {
    return 'dedup-skipped';
  }

  const job = await getEmailQueue().add('dispute-notification', {
    type: 'dispute-notification',
    data,
    userId: userId ?? 'system',
    priority: EMAIL_TYPE_PRIORITY['dispute-notification'],
  } as EmailJob);
  return job.id || '';
}

/**
 * Add a dispute resolution email to the queue.
 * Story 6.6: Notifies staff when admin acknowledges/resolves their dispute.
 * Subject to per-recipient deduplication (standard priority).
 */
export async function queueDisputeResolutionEmail(
  data: DisputeResolutionEmailData,
  userId: string,
): Promise<string> {
  if (isTestMode()) {
    return 'test-job-id';
  }

  if (await checkDedup(data.staffEmail, 'dispute-resolution')) {
    return 'dedup-skipped';
  }

  const job = await getEmailQueue().add('dispute-resolution', {
    type: 'dispute-resolution',
    data,
    userId,
    priority: EMAIL_TYPE_PRIORITY['dispute-resolution'],
  } as EmailJob);
  return job.id || '';
}

/**
 * Add a backup notification email to the queue.
 * Queues one job per recipient email address.
 * Subject to per-recipient deduplication (standard priority).
 */
export async function queueBackupNotificationEmail(
  data: BackupNotificationEmailData,
): Promise<string> {
  if (isTestMode()) {
    return 'test-job-id';
  }

  if (await checkDedup(data.to, 'backup-notification')) {
    return 'dedup-skipped';
  }

  const job = await getEmailQueue().add('backup-notification', {
    type: 'backup-notification',
    data,
    userId: 'system',
    priority: EMAIL_TYPE_PRIORITY['backup-notification'],
  } as EmailJob);
  return job.id || '';
}

/**
 * Get queue statistics
 */
export async function getEmailQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}> {
  // In test mode, return mock stats
  if (isTestMode()) {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: false,
    };
  }

  const queue = getEmailQueue();
  const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.isPaused(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused: isPaused,
  };
}

/**
 * Pause the email queue (used when budget is exhausted)
 */
export async function pauseEmailQueue(): Promise<void> {
  if (isTestMode()) return;
  await getEmailQueue().pause();
}

/**
 * Resume the email queue
 */
export async function resumeEmailQueue(): Promise<void> {
  if (isTestMode()) return;
  await getEmailQueue().resume();
}

/**
 * Drain the email queue — removes all waiting and delayed jobs.
 * Used by admin to clear backed-up messages (e.g., during alert storms).
 * Active jobs (currently being processed) are NOT affected.
 */
export async function drainEmailQueue(): Promise<{ removed: number }> {
  if (isTestMode()) return { removed: 0 };

  const queue = getEmailQueue();
  const [waitingCount, delayedCount] = await Promise.all([
    queue.getWaitingCount(),
    queue.getDelayedCount(),
  ]);

  await queue.drain();

  return { removed: waitingCount + delayedCount };
}

/**
 * Close the queue connection (for graceful shutdown)
 */
export async function closeEmailQueue(): Promise<void> {
  if (emailQueueInstance) {
    await emailQueueInstance.close();
    emailQueueInstance = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
