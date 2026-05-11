/**
 * Story 9-12 AC#10 / Task 1.9 — Pending-NIN reminder queue.
 *
 * Daily cron-driven repeatable job. Payload is empty: the worker fetches all
 * pending-NIN respondents at tick time and decides who to remind / transition.
 *
 * Cron 09:00 UTC = 10:00 WAT — late enough that Lagos commuters are at desks,
 * early enough to leave the rest of the day to act on the reminder.
 *
 * Follows the backup.queue.ts lazy-init pattern.
 */
import { Queue } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import type { Redis } from 'ioredis';

const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

const QUEUE_NAME = 'pending-nin-reminders';

let connection: Redis | null = null;
let queueInstance: Queue | null = null;

function getConnection(): Redis {
  if (!connection) {
    connection = createRedisConnection();
  }
  return connection;
}

export function getReminderQueue(): Queue {
  if (!queueInstance) {
    queueInstance = new Queue(QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        removeOnComplete: { age: 86400, count: 30 },
        removeOnFail: { age: 7 * 86400 },
      },
    });
  }
  return queueInstance;
}

/**
 * Schedule the daily reminder sweep. Idempotent — `upsertJobScheduler` won't
 * duplicate the job across restarts.
 */
export async function scheduleDailyReminders(): Promise<void> {
  if (isTestMode()) return;

  const queue = getReminderQueue();
  await queue.upsertJobScheduler(
    'daily-pending-nin-reminders',
    { pattern: '0 9 * * *' }, // 09:00 UTC = 10:00 WAT
    { name: 'pending-nin-reminders', data: {} },
  );
}

export async function closeReminderQueue(): Promise<void> {
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
