/**
 * Database Backup Queue
 *
 * BullMQ queue for daily PostgreSQL backup to S3-compatible storage.
 * Runs at 01:00 UTC (02:00 WAT) to perform off-site backup.
 *
 * Created in Story 6-3 (Automated Off-site Backup Orchestration).
 * Follows productivity-snapshot.queue.ts lazy-init pattern.
 */

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

const QUEUE_NAME = 'database-backup';

let connection: Redis | null = null;
let queueInstance: Queue | null = null;

function getConnection(): Redis {
  if (!connection) {
    connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

export function getBackupQueue(): Queue {
  if (!queueInstance) {
    queueInstance = new Queue(QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'custom' },
        removeOnComplete: { age: 86400, count: 10 }, // Keep 24h or 10 jobs
        removeOnFail: { age: 7 * 86400 }, // Keep failed for 7 days
      },
    });
  }
  return queueInstance;
}

/**
 * Schedule the daily backup repeatable job.
 * Uses BullMQ upsertJobScheduler for idempotent scheduling.
 * Runs at 01:00 UTC = 02:00 WAT.
 */
export async function scheduleDailyBackup(): Promise<void> {
  if (isTestMode()) return;

  const queue = getBackupQueue();
  await queue.upsertJobScheduler(
    'daily-backup',
    { pattern: '00 01 * * *' }, // 01:00 UTC = 02:00 WAT
    { name: 'database-backup', data: {} },
  );
}

export async function closeBackupQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
