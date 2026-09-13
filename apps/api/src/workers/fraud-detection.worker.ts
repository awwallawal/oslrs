/**
 * Fraud Detection Worker
 *
 * BullMQ worker that processes fraud detection jobs.
 * Calls FraudEngine.evaluate() to run all active heuristics and store results.
 *
 * Created in Story 3.4 (stub), implemented in Story 4.3.
 * @see ADR-003 — Fraud Detection Engine Design
 */

import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import pino from 'pino';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { fraudDetections, respondents } from '../db/schema/index.js';
import { PIPELINE_EXCLUDED_STATUSES } from '../db/schema/respondents.js';
import type { FraudDetectionJobData } from '../queues/fraud-detection.queue.js';
import { FraudEngine } from '../services/fraud-engine.service.js';
import type { FraudDetectionResult } from '@oslsr/types';

const logger = pino({ name: 'fraud-detection-worker' });

const connection = createRedisConnection();

interface WorkerResult {
  processed: boolean;
  submissionId: string;
  totalScore?: number;
  severity?: string;
}

/**
 * Fraud Detection Worker
 */
export const fraudDetectionWorker = new Worker<FraudDetectionJobData, WorkerResult>(
  'fraud-detection',
  async (job: Job<FraudDetectionJobData>) => {
    const { submissionId } = job.data;

    logger.info({
      event: 'fraud_detection.processing',
      jobId: job.id,
      submissionId,
      respondentId: job.data.respondentId,
    });

    /*
     * Status gate (Story 11-2 AC#6, REOPENED BY 13-2 R-A2).
     *
     * ⚠️ This no longer excludes `imported_unverified`. R-A2 removed it from
     * `PIPELINE_EXCLUDED_STATUSES` so association imports ARE scored — on the
     * roll-padding heuristic, which is the fraud an imported roll can actually
     * evidence (see `fraud-engine.service.ts`, the two heuristic registries).
     *
     * What remains excluded is `rolled_back`: a 14-day soft-delete, not a trust
     * tier. Scoring a retracted batch would resurrect it onto the review surfaces.
     */
    if (job.data.respondentId) {
      const respondent = await db.query.respondents.findFirst({
        where: eq(respondents.id, job.data.respondentId),
        columns: { status: true },
      });
      if (respondent && PIPELINE_EXCLUDED_STATUSES.includes(respondent.status)) {
        logger.info({
          event: 'fraud_detection.status_excluded',
          jobId: job.id,
          submissionId,
          respondentId: job.data.respondentId,
          status: respondent.status,
        });
        return { processed: false, submissionId };
      }
    }

    // Run the full fraud engine evaluation
    let result: FraudDetectionResult;
    try {
      result = await FraudEngine.evaluate(submissionId);
    } catch (err) {
      logger.error({
        event: 'fraud_detection.evaluate_error',
        jobId: job.id,
        submissionId,
        error: String(err),
      });
      throw err; // Let BullMQ retry
    }

    // Store result in fraud_detections table
    /*
     * 13-2 R-A2 — `enumeratorId` may legitimately be null (an imported row has no
     * field worker), and `importBatchId` carries accountability in its place. Before
     * this story the engine coerced a missing enumerator to `''`, which is not a
     * uuid, so this insert threw `invalid input syntax for type uuid: ""` and every
     * imported job dead-lettered after three retries.
     */
    await db.insert(fraudDetections).values({
      submissionId: result.submissionId,
      enumeratorId: result.enumeratorId,
      importBatchId: result.importBatchId,
      configSnapshotVersion: result.configVersion,
      gpsScore: String(result.componentScores.gps),
      speedScore: String(result.componentScores.speed),
      straightlineScore: String(result.componentScores.straightline),
      duplicateScore: String(result.componentScores.duplicate),
      timingScore: String(result.componentScores.timing),
      totalScore: String(result.totalScore),
      severity: result.severity,
      gpsDetails: result.details.gps,
      speedDetails: result.details.speed,
      straightlineDetails: result.details.straightline,
      duplicateDetails: result.details.duplicate,
      timingDetails: result.details.timing,
    });

    // Log severity-based warnings
    if (result.severity === 'high' || result.severity === 'critical') {
      logger.warn({
        event: 'fraud_detection.high_severity',
        submissionId,
        enumeratorId: result.enumeratorId,
        totalScore: result.totalScore,
        severity: result.severity,
        componentScores: result.componentScores,
      });

      // TODO(AC4.3.8): Push supervisor notification via Socket.IO
      // Story 4.2 Socket.IO infrastructure is available. Implementation path:
      // 1. Import getIO() from the Socket.IO server module (apps/api/src/lib/socket.ts or similar)
      // 2. Resolve supervisor(s) for this enumerator via TeamAssignmentService.getSupervisorForEnumerator()
      // 3. Emit to supervisor room: io.to(`user:${supervisorId}`).emit('fraud:alert', { submissionId, severity, enumeratorId })
      // 4. Frontend: listen for 'fraud:alert' event in SupervisorFraudPage and show toast/badge
      // Blocked on: confirming Socket.IO room naming convention from Story 4.2 implementation
    }

    logger.info({
      event: 'fraud_detection.completed',
      jobId: job.id,
      submissionId,
      totalScore: result.totalScore,
      severity: result.severity,
    });

    return {
      processed: true,
      submissionId,
      totalScore: result.totalScore,
      severity: result.severity,
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
    severity: result.severity,
  });
});

fraudDetectionWorker.on('failed', (job, error) => {
  logger.error({
    event: 'fraud_detection.job_failed',
    jobId: job?.id,
    submissionId: job?.data.submissionId,
    error: error.message,
    attempt: job?.attemptsMade,
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
