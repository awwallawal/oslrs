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
} from '@oslsr/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

/**
 * Custom backoff delays per AC3: 30s, 2min, 10min
 */
const BACKOFF_DELAYS = [30000, 120000, 600000]; // 30s, 2min, 10min

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
 */
export const emailQueue = new Queue<EmailJob>('email-notification', {
  connection,
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
  const job = await emailQueue.add(
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
  const job = await emailQueue.add('verification', {
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
  const job = await emailQueue.add('password-reset', {
    type: 'password-reset',
    data,
    userId,
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
  const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
    emailQueue.getWaitingCount(),
    emailQueue.getActiveCount(),
    emailQueue.getCompletedCount(),
    emailQueue.getFailedCount(),
    emailQueue.getDelayedCount(),
    emailQueue.isPaused(),
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
  await emailQueue.pause();
}

/**
 * Resume the email queue
 */
export async function resumeEmailQueue(): Promise<void> {
  await emailQueue.resume();
}

/**
 * Close the queue connection (for graceful shutdown)
 */
export async function closeEmailQueue(): Promise<void> {
  await emailQueue.close();
  await connection.quit();
}
