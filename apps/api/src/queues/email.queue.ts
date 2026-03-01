import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import type {
  EmailJob,
  StaffInvitationEmailData,
  VerificationEmailData,
  PasswordResetEmailData,
  PaymentNotificationEmailData,
  DisputeNotificationEmailData,
  DisputeResolutionEmailData,
  BackupNotificationEmailData,
} from '@oslsr/types';

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
  } as EmailJob);
  return job.id || '';
}

/**
 * Add a payment notification email to the queue.
 * Queues one personalized email per affected staff member.
 */
export async function queuePaymentNotificationEmail(
  data: PaymentNotificationEmailData,
  userId: string,
): Promise<string> {
  if (isTestMode()) {
    return 'test-job-id';
  }

  const job = await getEmailQueue().add('payment-notification', {
    type: 'payment-notification',
    data,
    userId,
  } as EmailJob);
  return job.id || '';
}

/**
 * Add a dispute notification email to the queue.
 * Story 6.5: Notifies Super Admin(s) when staff raises a payment dispute.
 */
export async function queueDisputeNotificationEmail(
  data: DisputeNotificationEmailData,
  userId?: string,
): Promise<string> {
  if (isTestMode()) {
    return 'test-job-id';
  }

  const job = await getEmailQueue().add('dispute-notification', {
    type: 'dispute-notification',
    data,
    userId: userId ?? 'system',
  } as EmailJob);
  return job.id || '';
}

/**
 * Add a dispute resolution email to the queue.
 * Story 6.6: Notifies staff when admin acknowledges/resolves their dispute.
 */
export async function queueDisputeResolutionEmail(
  data: DisputeResolutionEmailData,
  userId: string,
): Promise<string> {
  if (isTestMode()) {
    return 'test-job-id';
  }

  const job = await getEmailQueue().add('dispute-resolution', {
    type: 'dispute-resolution',
    data,
    userId,
  } as EmailJob);
  return job.id || '';
}

/**
 * Add a backup notification email to the queue.
 * Queues one job per recipient email address.
 */
export async function queueBackupNotificationEmail(
  data: BackupNotificationEmailData,
): Promise<string> {
  if (isTestMode()) {
    return 'test-job-id';
  }

  const job = await getEmailQueue().add('backup-notification', {
    type: 'backup-notification',
    data,
    userId: 'system',
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
