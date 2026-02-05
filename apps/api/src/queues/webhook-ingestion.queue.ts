/**
 * Submission Ingestion Queue
 *
 * BullMQ queue for processing form submissions from the native form system.
 * Foundation created in Story 2-5, repurposed for native forms.
 *
 * Data flow:
 * 1. Native form renderer submits via API
 * 2. Worker deduplicates by submission_id (column named odk_submission_id for migration compatibility)
 * 3. Worker saves to submissions table
 * 4. Future: Triggers fraud detection (Story 4.3)
 */

import { Queue, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'webhook-ingestion-queue' });

/**
 * Job data for submission ingestion
 */
export interface WebhookIngestionJobData {
  /** Source of the submission (webapp, mobile, backfill, manual) */
  source: 'webapp' | 'mobile' | 'backfill' | 'manual';

  /** Unique submission ID for deduplication (column named odk_submission_id for migration compatibility) */
  odkSubmissionId: string;

  /** Form ID reference */
  formXmlId: string;

  /** Submitter user ID (column named odk_submitter_id for migration compatibility) */
  odkSubmitterId?: string;

  /** When the form was submitted */
  submittedAt: string;

  /** Raw submission data */
  rawData?: Record<string, unknown>;
}

let webhookIngestionQueue: Queue<WebhookIngestionJobData> | null = null;

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
 * Get or create the webhook ingestion queue
 */
export function getWebhookIngestionQueue(): Queue<WebhookIngestionJobData> {
  if (!webhookIngestionQueue) {
    const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });

    webhookIngestionQueue = new Queue<WebhookIngestionJobData>('webhook-ingestion', {
      connection,
      defaultJobOptions,
    });

    logger.info({ event: 'queue.webhook_ingestion.created' });
  }

  return webhookIngestionQueue;
}

/**
 * Add a submission to the ingestion queue
 *
 * Uses odkSubmissionId as jobId for automatic deduplication.
 * If a job with the same ID already exists, BullMQ will ignore it.
 */
export async function queueSubmissionForIngestion(
  data: WebhookIngestionJobData
): Promise<string | null> {
  const queue = getWebhookIngestionQueue();

  // Use odkSubmissionId as jobId for idempotent ingestion
  const jobId = `ingest-${data.odkSubmissionId}`;

  try {
    const job = await queue.add('ingest-submission', data, {
      jobId,
    });

    logger.debug({
      event: 'queue.webhook_ingestion.added',
      jobId: job.id,
      odkSubmissionId: data.odkSubmissionId,
      source: data.source,
    });

    return job.id!;
  } catch (error: unknown) {
    // BullMQ throws if job with same ID exists - this is expected for deduplication
    if (error instanceof Error && error.message.includes('Job already exists')) {
      logger.debug({
        event: 'queue.webhook_ingestion.deduplicated',
        odkSubmissionId: data.odkSubmissionId,
        source: data.source,
      });
      return null;
    }
    throw error;
  }
}

/**
 * Get queue statistics
 */
export async function getWebhookIngestionQueueStats() {
  const queue = getWebhookIngestionQueue();

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Close the queue connection
 */
export async function closeWebhookIngestionQueue(): Promise<void> {
  if (webhookIngestionQueue) {
    await webhookIngestionQueue.close();
    webhookIngestionQueue = null;
  }
}
