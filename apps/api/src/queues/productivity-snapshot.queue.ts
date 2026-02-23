/**
 * Productivity Snapshot Queue
 *
 * BullMQ queue for nightly daily productivity snapshots.
 * Runs at 22:59 UTC (23:59 WAT) to capture end-of-day totals.
 *
 * Created in Story 5.6a (Supervisor Team Productivity Table).
 * Follows email.queue.ts lazy-init pattern.
 */

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

const QUEUE_NAME = 'productivity-snapshot';

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

export function getProductivitySnapshotQueue(): Queue {
  if (!queueInstance) {
    queueInstance = new Queue(QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: { age: 86400, count: 100 }, // Keep 24h or 100 jobs
        removeOnFail: { age: 7 * 86400 }, // Keep failed for 7 days
      },
    });
  }
  return queueInstance;
}

/**
 * Schedule the nightly snapshot repeatable job.
 * Uses BullMQ upsertJobScheduler for idempotent scheduling.
 */
export async function scheduleNightlySnapshot(): Promise<void> {
  if (isTestMode()) return;

  const queue = getProductivitySnapshotQueue();
  await queue.upsertJobScheduler(
    'nightly-snapshot',
    { pattern: '59 22 * * *' }, // 22:59 UTC = 23:59 WAT
    { name: 'daily-snapshot', data: {} },
  );
}

export async function closeProductivitySnapshotQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
