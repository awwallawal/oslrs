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
import { createRedisConnection } from '../lib/redis.js';
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
import {
  markSubmissionUnprocessable,
  isNonRetryablePostgresError,
  constraintOf,
} from '../services/submission-terminal-state.js'; // Story 13-57 (AC2)

const logger = pino({ name: 'webhook-ingestion-worker' });

const connection = createRedisConnection();

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
  // Story 4.3: Extract completion time for speed-run fraud detection
  const completionTimeSeconds = rawData?._completionTimeSeconds != null ? Number(rawData._completionTimeSeconds) : null;

  await db.insert(submissions).values({
    id: submissionId,
    submissionUid,
    questionnaireFormId,
    submitterId: submitterId ?? null,
    rawData: rawData ?? null,
    gpsLatitude: gpsLatitude != null && !isNaN(gpsLatitude) ? gpsLatitude : null,
    gpsLongitude: gpsLongitude != null && !isNaN(gpsLongitude) ? gpsLongitude : null,
    completionTimeSeconds: completionTimeSeconds != null && !isNaN(completionTimeSeconds) ? completionTimeSeconds : null,
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
    /**
     * Story 13-57 AC2 — TWO ways a submission can be permanently dead, and only
     * one of them used to be recognised.
     *
     * `PermanentProcessingError` was always handled. Everything else was
     * re-thrown as transient, retried three times, and then abandoned at
     * `processed = false` with no reason — which is precisely how a
     * CHECK-constraint violation on a phone number became two rows that looked
     * like they were still queued for five days. A rejection of the DATA is not
     * a transient condition; classify it and record it.
     */
    const nonRetryableDbError = isNonRetryablePostgresError(error);
    if (error instanceof PermanentProcessingError || nonRetryableDbError) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error({
        event: 'webhook_ingestion.permanent_error',
        jobId: job.id,
        submissionId,
        submissionUid,
        error: errorMessage,
      });

      // Shared writer — the webhook and human channels must not drift on what
      // "dead" looks like (services/submission-terminal-state.ts).
      await markSubmissionUnprocessable({
        submissionId,
        submissionUid,
        reason: errorMessage,
        constraint: constraintOf(error),
        cause: nonRetryableDbError ? 'non_retryable_db_error' : 'permanent_error',
      });

      return errorMessage;
    }

    // Transient error — re-throw for BullMQ retry. If the retries run out, the
    // worker's `failed` handler below marks the row terminal; a job that has
    // stopped being retried must never leave a submission looking queued.
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

/**
 * Story 13-57 AC2.3 — WHEN THE RETRIES RUN OUT, THE ROW MUST STOP LOOKING QUEUED.
 *
 * A transient error is re-thrown so BullMQ can retry it, which is right. But
 * after the last attempt BullMQ simply gives up, and before this story the
 * submission was left at `processed = false` with a NULL reason — visually
 * identical to a row whose turn has not come yet. That is the state the two
 * 2026-08-04 orphans were found in, and it is the state that made them
 * invisible: `processed = false` meant both "waiting" and "abandoned".
 *
 * Exported for direct testing. Returns `true` when it marked the row, so a test
 * can assert the branch was TAKEN rather than merely available — a green run of
 * a handler that no-ops is indistinguishable from one that works
 * ([[pattern-test-that-passes-over-a-hole]]).
 */
export async function handleExhaustedRetries(
  job: Job<WebhookIngestionJobData> | undefined,
  error: Error,
): Promise<boolean> {
  if (!job) return false;
  const maxAttempts = job.opts?.attempts ?? 1;
  if (job.attemptsMade < maxAttempts) return false;

  const submissionUid = job.data?.submissionUid;
  if (!submissionUid) return false;

  const row = await db.query.submissions.findFirst({
    where: eq(submissions.submissionUid, submissionUid),
    columns: { id: true, processed: true },
  });
  // No row (the insert itself was what failed) or already terminal — nothing to
  // say. A submission that never existed is not a silently-dead submission.
  if (!row || row.processed) return false;

  await markSubmissionUnprocessable({
    submissionId: row.id,
    submissionUid,
    reason: `RETRIES_EXHAUSTED after ${job.attemptsMade} attempt(s): ${error.message}`,
    constraint: constraintOf(error),
    cause: 'retries_exhausted',
  });
  return true;
}

webhookIngestionWorker.on('failed', (job, error) => {
  logger.error({
    event: 'webhook_ingestion.job_failed',
    jobId: job?.id,
    submissionUid: job?.data.submissionUid,
    error: error.message,
    attempts: job?.attemptsMade,
  });

  // Fire-and-forget with an explicit catch: this handler is an event listener,
  // so a rejection here would be unhandled. A failure to record the failure is
  // logged rather than swallowed.
  void handleExhaustedRetries(job, error).catch((err: unknown) => {
    logger.error({
      event: 'webhook_ingestion.terminal_mark_failed',
      jobId: job?.id,
      submissionUid: job?.data.submissionUid,
      error: err instanceof Error ? err.message : String(err),
    });
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
