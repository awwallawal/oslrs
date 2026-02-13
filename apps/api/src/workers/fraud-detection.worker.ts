/**
 * Fraud Detection Worker (Stub)
 *
 * BullMQ worker for processing fraud detection jobs.
 * Created in Story 3.4 — actual heuristics are Epic 4 scope.
 *
 * Currently: logs job received and returns stub result.
 */

import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import type { FraudDetectionJobData } from '../queues/fraud-detection.queue.js';

const logger = pino({ name: 'fraud-detection-worker' });

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

interface FraudDetectionResult {
  processed: boolean;
  reason: string;
  submissionId: string;
}

/**
 * Fraud Detection Worker
 */
export const fraudDetectionWorker = new Worker<FraudDetectionJobData, FraudDetectionResult>(
  'fraud-detection',
  async (job: Job<FraudDetectionJobData>) => {
    logger.info({
      event: 'fraud_detection.received',
      jobId: job.id,
      submissionId: job.data.submissionId,
      respondentId: job.data.respondentId,
      gpsLatitude: job.data.gpsLatitude,
      gpsLongitude: job.data.gpsLongitude,
    });

    // Stub — actual heuristics are Epic 4 scope
    return {
      processed: false,
      reason: 'stub — Epic 4 scope',
      submissionId: job.data.submissionId,
    };
  },
  {
    connection,
    concurrency: 4,
  }
);

// Worker event handlers
fraudDetectionWorker.on('completed', (job, result) => {
  logger.debug({
    event: 'fraud_detection.job_completed',
    jobId: job.id,
    submissionId: result.submissionId,
    reason: result.reason,
  });
});

fraudDetectionWorker.on('failed', (job, error) => {
  logger.error({
    event: 'fraud_detection.job_failed',
    jobId: job?.id,
    submissionId: job?.data.submissionId,
    error: error.message,
  });
});

fraudDetectionWorker.on('error', (error) => {
  logger.error({
    event: 'fraud_detection.worker_error',
    error: error.message,
  });
});

logger.info({ event: 'fraud_detection.worker_started' });

export default fraudDetectionWorker;
