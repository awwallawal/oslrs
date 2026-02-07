/**
 * Submission Ingestion Worker
 *
 * BullMQ worker that processes form submissions from the native form system.
 * Foundation created in Story 2-5, repurposed for native forms.
 *
 * Current capabilities:
 * - Deduplication by submission_uid
 * - Save to submissions table
 * - Basic error handling
 *
 * To be added in Story 3.4:
 * - Extract respondent data
 * - Link to enumerator
 *
 * To be added in Story 4.3:
 * - Trigger fraud detection
 * - Update fraud_score and fraud_flags
 */

import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { db } from '../db/index.js';
import { submissions } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { WebhookIngestionJobData } from '../queues/webhook-ingestion.queue.js';

const logger = pino({ name: 'webhook-ingestion-worker' });

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

/**
 * Result of processing a submission
 */
interface IngestionResult {
  success: boolean;
  submissionId?: string;
  action: 'created' | 'skipped' | 'failed';
  submissionUid: string;
  error?: string;
}

/**
 * Process a single submission job
 */
async function processSubmission(job: Job<WebhookIngestionJobData>): Promise<IngestionResult> {
  const { submissionUid, formXmlId, source, submittedAt, submitterId, rawData } = job.data;

  logger.info({
    event: 'webhook_ingestion.processing',
    jobId: job.id,
    submissionUid,
    formXmlId,
    source,
  });

  // Check if submission already exists (idempotency)
  const existing = await db.query.submissions.findFirst({
    where: eq(submissions.submissionUid, submissionUid),
    columns: { id: true },
  });

  if (existing) {
    logger.info({
      event: 'webhook_ingestion.skipped',
      jobId: job.id,
      submissionUid,
      reason: 'already_exists',
      existingId: existing.id,
    });

    return {
      success: true,
      submissionId: existing.id,
      action: 'skipped',
      submissionUid,
    };
  }

  // Create new submission record
  const submissionId = uuidv7();

  await db.insert(submissions).values({
    id: submissionId,
    submissionUid,
    formXmlId,
    submitterId: submitterId ?? null,
    rawData: rawData ?? null,
    submittedAt: new Date(submittedAt),
    source,
    processed: false, // Will be set to true after Story 3.4 processing
  });

  logger.info({
    event: 'webhook_ingestion.created',
    jobId: job.id,
    submissionId,
    submissionUid,
    formXmlId,
    source,
  });

  return {
    success: true,
    submissionId,
    action: 'created',
    submissionUid,
  };
}

/**
 * Webhook Ingestion Worker
 */
export const webhookIngestionWorker = new Worker<WebhookIngestionJobData, IngestionResult>(
  'webhook-ingestion',
  async (job: Job<WebhookIngestionJobData>) => {
    try {
      return await processSubmission(job);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({
        event: 'webhook_ingestion.failed',
        jobId: job.id,
        submissionUid: job.data.submissionUid,
        error: errorMessage,
        attempt: job.attemptsMade + 1,
      });

      throw error;
    }
  },
  {
    connection,
    concurrency: 10, // Process up to 10 submissions concurrently
  }
);

// Worker event handlers
webhookIngestionWorker.on('completed', (job, result) => {
  logger.debug({
    event: 'webhook_ingestion.job_completed',
    jobId: job.id,
    action: result.action,
    submissionUid: result.submissionUid,
  });
});

webhookIngestionWorker.on('failed', (job, error) => {
  logger.error({
    event: 'webhook_ingestion.job_failed',
    jobId: job?.id,
    submissionUid: job?.data.submissionUid,
    error: error.message,
    attempts: job?.attemptsMade,
  });
});

webhookIngestionWorker.on('error', (error) => {
  logger.error({
    event: 'webhook_ingestion.worker_error',
    error: error.message,
  });
});

logger.info({ event: 'webhook_ingestion.worker_started' });

export default webhookIngestionWorker;
