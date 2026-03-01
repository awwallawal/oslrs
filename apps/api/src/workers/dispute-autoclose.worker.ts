/**
 * Dispute Auto-Close Worker
 *
 * Processes auto-close jobs: closes resolved disputes older than 30 days.
 * Runs daily via BullMQ scheduler. Concurrency: 1.
 *
 * Created in Story 6.6 (Payment Dispute Resolution Queue).
 * Follows productivity-snapshot.worker.ts pattern.
 */

import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { RemunerationService } from '../services/remuneration.service.js';

const logger = pino({ name: 'dispute-autoclose-worker' });
const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

async function processDisputeAutoClose(job: Job): Promise<{ closedCount: number; duration: number }> {
  const startTime = Date.now();

  logger.info({ event: 'dispute_autoclose.start', jobId: job.id });

  const result = await RemunerationService.autoCloseResolvedDisputes();

  const duration = Date.now() - startTime;
  logger.info({
    event: 'dispute_autoclose.complete',
    closedCount: result.closedCount,
    duration,
  });

  return { closedCount: result.closedCount, duration };
}

let disputeAutoCloseWorker: Worker | null = null;

if (!isTestMode()) {
  const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  disputeAutoCloseWorker = new Worker(
    'dispute-autoclose',
    processDisputeAutoClose,
    {
      connection,
      concurrency: 1,
    },
  );

  disputeAutoCloseWorker.on('completed', (job) => {
    logger.info({ event: 'dispute_autoclose.job_completed', jobId: job.id });
  });

  disputeAutoCloseWorker.on('failed', (job, error) => {
    logger.error({ event: 'dispute_autoclose.job_failed', jobId: job?.id, error: error.message });
  });
}

export { disputeAutoCloseWorker };

export async function closeDisputeAutoCloseWorker(): Promise<void> {
  if (disputeAutoCloseWorker) {
    await disputeAutoCloseWorker.close();
    disputeAutoCloseWorker = null;
  }
}
