/**
 * Dispute Auto-Close Queue
 *
 * BullMQ queue for auto-closing resolved disputes after 30 days.
 * Runs at 02:00 UTC (03:00 WAT) daily.
 *
 * Created in Story 6.6 (Payment Dispute Resolution Queue).
 * Follows productivity-snapshot.queue.ts lazy-init pattern.
 */

import { Queue } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import type { Redis } from 'ioredis';

const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

const QUEUE_NAME = 'dispute-autoclose';

let connection: Redis | null = null;
let queueInstance: Queue | null = null;

function getConnection(): Redis {
  if (!connection) {
    connection = createRedisConnection();
  }
  return connection;
}

export function getDisputeAutoCloseQueue(): Queue {
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
 * Schedule the daily auto-close repeatable job.
 * Uses BullMQ upsertJobScheduler for idempotent scheduling.
 */
export async function scheduleDisputeAutoClose(): Promise<void> {
  if (isTestMode()) return;

  const queue = getDisputeAutoCloseQueue();
  await queue.upsertJobScheduler(
    'dispute-auto-close',
    { pattern: '0 2 * * *' }, // 02:00 UTC = 03:00 WAT daily (Story 6.6 Task 12)
    { name: 'dispute-auto-close', data: {} },
  );
}

export async function closeDisputeAutoCloseQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
  if (connection) {
    // Story 9-10 AC#2: catch matches lib/redis.ts:closeAllConnections safe-quit pattern.
    // Connection may already be closed by ioredis's reconnect handler at shutdown.
    await connection.quit().catch(() => { /* already closed — safe */ });
    connection = null;
  }
}
