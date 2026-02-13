/**
 * Fraud Detection Queue
 *
 * BullMQ queue for triggering fraud detection on processed submissions.
 * Created in Story 3.4 — stub for Epic 4 scope.
 */

import { Queue, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'fraud-detection-queue' });

export interface FraudDetectionJobData {
  submissionId: string;
  respondentId: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
}

let fraudDetectionQueue: Queue<FraudDetectionJobData> | null = null;

const defaultJobOptions: JobsOptions = {
  removeOnComplete: 100,
  removeOnFail: 500,
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
};

/**
 * Get or create the fraud detection queue
 */
export function getFraudDetectionQueue(): Queue<FraudDetectionJobData> {
  if (!fraudDetectionQueue) {
    const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });

    fraudDetectionQueue = new Queue<FraudDetectionJobData>('fraud-detection', {
      connection,
      defaultJobOptions,
    });

    logger.info({ event: 'queue.fraud_detection.created' });
  }

  return fraudDetectionQueue;
}

/**
 * Queue a submission for fraud detection processing
 */
export async function queueFraudDetection(
  data: FraudDetectionJobData
): Promise<string | null> {
  const queue = getFraudDetectionQueue();

  const jobId = `fraud-${data.submissionId}`;

  try {
    const job = await queue.add('fraud-detection', data, { jobId });

    logger.debug({
      event: 'queue.fraud_detection.added',
      jobId: job.id,
      submissionId: data.submissionId,
      respondentId: data.respondentId,
    });

    return job.id!;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Job already exists')) {
      logger.debug({
        event: 'queue.fraud_detection.deduplicated',
        submissionId: data.submissionId,
      });
      return null;
    }
    throw error;
  }
}

/**
 * Close the fraud detection queue connection
 */
export async function closeFraudDetectionQueue(): Promise<void> {
  if (fraudDetectionQueue) {
    await fraudDetectionQueue.close();
    fraudDetectionQueue = null;
  }
}
