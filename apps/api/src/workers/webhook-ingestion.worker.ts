/**
 * Submission Ingestion Worker
 *
 * BullMQ worker that processes form submissions from the native form system.
 * Foundation created in Story 2-5, enhanced in Story 3.4.
 *
 * Current capabilities:
 * - Deduplication by submission_uid
 * - Save to submissions table
 * - Extract respondent data and link to submission
 * - Enumerator linking (source='enumerator')
 * - Fraud detection queue trigger (if GPS present)
 * - Permanent vs transient error handling
 */

import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { db } from '../db/index.js';
import { submissions } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { WebhookIngestionJobData } from '../queues/webhook-ingestion.queue.js';
import {
  SubmissionProcessingService,
  PermanentProcessingError,
} from '../services/submission-processing.service.js';

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
async function processSubmissionJob(job: Job<WebhookIngestionJobData>): Promise<IngestionResult> {
  const { submissionUid, questionnaireFormId, source, submittedAt, submitterId, rawData } = job.data;

  logger.info({
    event: 'webhook_ingestion.processing',
    jobId: job.id,
    submissionUid,
    questionnaireFormId,
    source,
  });

  // Check if submission already exists (idempotency)
  const existing = await db.query.submissions.findFirst({
    where: eq(submissions.submissionUid, submissionUid),
    columns: { id: true, processed: true },
  });

  if (existing) {
    // Already exists AND already processed → skip entirely (AC 3.4.2)
    if (existing.processed) {
      logger.info({
        event: 'webhook_ingestion.skipped',
        jobId: job.id,
        submissionUid,
        reason: 'already_processed',
        existingId: existing.id,
      });

      return {
        success: true,
        submissionId: existing.id,
        action: 'skipped',
        submissionUid,
      };
    }

    // Exists but NOT processed → retry processing only (re-run case)
    logger.info({
      event: 'webhook_ingestion.reprocessing',
      jobId: job.id,
      submissionUid,
      existingId: existing.id,
    });

    await runProcessing(existing.id, submissionUid, job);

    return {
      success: true,
      submissionId: existing.id,
      action: 'skipped',
      submissionUid,
    };
  }

  // Create new submission record
  const submissionId = uuidv7();

  // Extract GPS coordinates from rawData (controller stores as _gpsLatitude/_gpsLongitude)
  const gpsLatitude = rawData?._gpsLatitude != null ? Number(rawData._gpsLatitude) : null;
  const gpsLongitude = rawData?._gpsLongitude != null ? Number(rawData._gpsLongitude) : null;

  await db.insert(submissions).values({
    id: submissionId,
    submissionUid,
    questionnaireFormId,
    submitterId: submitterId ?? null,
    rawData: rawData ?? null,
    gpsLatitude: gpsLatitude != null && !isNaN(gpsLatitude) ? gpsLatitude : null,
    gpsLongitude: gpsLongitude != null && !isNaN(gpsLongitude) ? gpsLongitude : null,
    submittedAt: new Date(submittedAt),
    source,
    processed: false,
  });

  logger.info({
    event: 'webhook_ingestion.created',
    jobId: job.id,
    submissionId,
    submissionUid,
    questionnaireFormId,
    source,
  });

  // Run respondent extraction + linking
  const processingError = await runProcessing(submissionId, submissionUid, job);

  if (processingError) {
    return {
      success: false,
      submissionId,
      action: 'failed',
      submissionUid,
      error: processingError,
    };
  }

  return {
    success: true,
    submissionId,
    action: 'created',
    submissionUid,
  };
}

/**
 * Run submission processing (respondent extraction, linking, fraud queue).
 * Returns null on success, or error message string for permanent failures.
 * Transient errors are re-thrown for BullMQ retry.
 */
async function runProcessing(
  submissionId: string,
  submissionUid: string,
  job: Job<WebhookIngestionJobData>
): Promise<string | null> {
  try {
    const result = await SubmissionProcessingService.processSubmission(submissionId);

    logger.info({
      event: 'webhook_ingestion.processed',
      jobId: job.id,
      submissionId,
      submissionUid,
      respondentId: result.respondentId,
      action: result.action,
    });

    return null;
  } catch (error: unknown) {
    if (error instanceof PermanentProcessingError) {
      // Permanent error — store and do NOT re-throw (prevent BullMQ retry)
      const errorMessage = error.message;

      logger.error({
        event: 'webhook_ingestion.permanent_error',
        jobId: job.id,
        submissionId,
        submissionUid,
        error: errorMessage,
      });

      await db.update(submissions).set({
        processed: true,
        processedAt: new Date(),
        processingError: errorMessage,
        updatedAt: new Date(),
      }).where(eq(submissions.id, submissionId));

      return errorMessage;
    }

    // Transient error — re-throw for BullMQ retry
    throw error;
  }
}

/**
 * Webhook Ingestion Worker
 */
export const webhookIngestionWorker = new Worker<WebhookIngestionJobData, IngestionResult>(
  'webhook-ingestion',
  async (job: Job<WebhookIngestionJobData>) => {
    try {
      return await processSubmissionJob(job);
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
