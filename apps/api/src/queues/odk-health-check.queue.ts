import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

/**
 * ODK Health Check Job Data
 */
export interface OdkHealthCheckJobData {
  triggeredBy: 'scheduler' | 'manual';
  timestamp: string;
}

/**
 * ODK Health Check Queue
 *
 * Per Story 2-5: Scheduled health check job for ODK Central integration.
 *
 * Features:
 * - Repeatable job on configurable interval (default: 6h pilot, 24h production)
 * - Checks ODK connectivity, submission counts, detects gaps
 * - Tracks consecutive failures in Redis
 * - Triggers email alerts on gap detection or unreachability
 */
export const odkHealthCheckQueue = new Queue<OdkHealthCheckJobData>('odk-health-check', {
  connection,
  defaultJobOptions: {
    attempts: 1, // No retries for health checks - next scheduled run will try again
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 100, // Keep max 100 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days for debugging
    },
  },
});

/**
 * Get health check interval in milliseconds
 * Default: 6 hours for pilot, 24 hours for production
 */
export function getHealthCheckIntervalMs(): number {
  const hours = parseInt(process.env.ODK_HEALTH_CHECK_INTERVAL_HOURS || '6', 10);
  return hours * 60 * 60 * 1000;
}

/**
 * Get submission gap threshold
 * Default: 5 submissions
 */
export function getSubmissionGapThreshold(): number {
  return parseInt(process.env.ODK_SUBMISSION_GAP_THRESHOLD || '5', 10);
}

/**
 * Initialize the repeatable health check job
 * Call this during application startup
 */
export async function initHealthCheckScheduler(): Promise<void> {
  const intervalMs = getHealthCheckIntervalMs();

  // Remove any existing repeatable jobs to avoid duplicates
  const existingJobs = await odkHealthCheckQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await odkHealthCheckQueue.removeRepeatableByKey(job.key);
  }

  // Add new repeatable job
  await odkHealthCheckQueue.add(
    'scheduled-health-check',
    {
      triggeredBy: 'scheduler',
      timestamp: new Date().toISOString(),
    },
    {
      repeat: {
        every: intervalMs,
      },
      jobId: 'odk-health-check-repeatable',
    }
  );
}

/**
 * Trigger a manual health check (e.g., from admin dashboard)
 */
export async function triggerManualHealthCheck(): Promise<string> {
  const job = await odkHealthCheckQueue.add(
    'manual-health-check',
    {
      triggeredBy: 'manual',
      timestamp: new Date().toISOString(),
    },
    {
      jobId: `manual-${Date.now()}`,
    }
  );
  return job.id || '';
}

/**
 * Get queue statistics
 */
export async function getHealthCheckQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  repeatableJobs: number;
}> {
  const [waiting, active, completed, failed, repeatableJobs] = await Promise.all([
    odkHealthCheckQueue.getWaitingCount(),
    odkHealthCheckQueue.getActiveCount(),
    odkHealthCheckQueue.getCompletedCount(),
    odkHealthCheckQueue.getFailedCount(),
    odkHealthCheckQueue.getRepeatableJobs().then((jobs) => jobs.length),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    repeatableJobs,
  };
}

/**
 * Close the queue connection (for graceful shutdown)
 */
export async function closeHealthCheckQueue(): Promise<void> {
  await odkHealthCheckQueue.close();
  await connection.quit();
}
