import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import type { CreateOdkAppUserPayload } from '@oslsr/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

/**
 * ODK App User Provisioning Queue
 *
 * Handles asynchronous App User creation in ODK Central when staff are activated.
 * Per AC1: Triggers on staff activation for field roles (Enumerator, Supervisor).
 * Per AC6: Retries with exponential backoff (5 attempts: 5s, 10s, 20s, 40s, 80s).
 *
 * Job Payload:
 * - userId: Staff member's user ID
 * - fullName: Staff member's full name (for display in ODK)
 * - role: Staff member's role (for display and filtering)
 */
export const odkAppUserQueue = new Queue<CreateOdkAppUserPayload>('odk-app-user-provision', {
  connection,
  defaultJobOptions: {
    attempts: 5, // AC6: 5 retry attempts
    backoff: {
      type: 'exponential',
      delay: 5000, // AC6: Base delay 5s → 10s → 20s → 40s → 80s
    },
    removeOnComplete: {
      age: 7 * 24 * 3600, // Keep completed jobs for 7 days
      count: 5000, // Keep max 5000 completed jobs
    },
    removeOnFail: {
      age: 30 * 24 * 3600, // Keep failed jobs for 30 days for debugging
    },
  },
});

/**
 * Add an ODK App User provisioning job to the queue.
 * Called from user.service.ts when a staff member with field role is activated.
 *
 * @param payload Job payload containing userId, fullName, role
 * @returns Job ID for tracking
 */
export async function queueOdkAppUserProvision(
  payload: CreateOdkAppUserPayload
): Promise<string> {
  const job = await odkAppUserQueue.add('odk-app-user-provision', payload);
  return job.id || '';
}

/**
 * Get queue statistics for monitoring.
 */
export async function getOdkAppUserQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    odkAppUserQueue.getWaitingCount(),
    odkAppUserQueue.getActiveCount(),
    odkAppUserQueue.getCompletedCount(),
    odkAppUserQueue.getFailedCount(),
    odkAppUserQueue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Close the queue connection (for graceful shutdown).
 */
export async function closeOdkAppUserQueue(): Promise<void> {
  await odkAppUserQueue.close();
  await connection.quit();
}
