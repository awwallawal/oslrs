/**
 * Story 9-19 Part C — Operations Dashboard Telegram digest queue.
 *
 * Twice-daily cron-driven repeatable job. Payload is empty: the worker gathers
 * a fresh snapshot at tick time and pushes a condensed digest to the operator's
 * Telegram via Story 9-15's TelegramChannel infra.
 *
 * Cron `0 6,18 * * *` (UTC) = 07:00 + 19:00 Africa/Lagos (UTC+1).
 *
 * Follows the reminder.queue.ts lazy-init pattern.
 */
import { Queue } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import type { Redis } from 'ioredis';

const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

const QUEUE_NAME = 'ops-digest';

let connection: Redis | null = null;
let queueInstance: Queue | null = null;

function getConnection(): Redis {
  if (!connection) {
    connection = createRedisConnection();
  }
  return connection;
}

export function getOpsDigestQueue(): Queue {
  if (!queueInstance) {
    queueInstance = new Queue(QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 2,
        removeOnComplete: { age: 7 * 86400, count: 30 },
        removeOnFail: { age: 7 * 86400 },
      },
    });
  }
  return queueInstance;
}

/**
 * Schedule the twice-daily ops digest. Idempotent — `upsertJobScheduler` won't
 * duplicate the job across restarts.
 */
export async function scheduleOpsDigest(): Promise<void> {
  if (isTestMode()) return;

  const queue = getOpsDigestQueue();
  await queue.upsertJobScheduler(
    'twice-daily-ops-digest',
    { pattern: '0 6,18 * * *' }, // 06:00 + 18:00 UTC = 07:00 + 19:00 WAT
    { name: 'ops-digest', data: {} },
  );
}

export async function closeOpsDigestQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
  if (connection) {
    // Match lib/redis.ts:closeAllConnections safe-quit pattern (Story 9-10 AC#2).
    await connection.quit().catch(() => { /* already closed — safe */ });
    connection = null;
  }
}
