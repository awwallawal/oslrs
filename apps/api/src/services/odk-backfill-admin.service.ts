/**
 * ODK Backfill Admin Service
 *
 * Per Story 2-5, AC5: Bridges the backfill service from @oslsr/odk-integration
 * with the API layer, providing persistence and lock implementations.
 *
 * Features:
 * - Redis-based distributed lock to prevent concurrent backfills
 * - Database-backed persistence for submission existence checks
 * - BullMQ integration for queueing submissions
 *
 * NOTE: The submissions table is expected to be created in a future story.
 * Until then, persistence methods return defaults that queue all ODK submissions.
 */

import { db } from '../db/index.js';
import { auditLogs } from '../db/schema/index.js';
import { Redis } from 'ioredis';
import { uuidv7 } from 'uuidv7';
import pino from 'pino';
import type { OdkSubmissionInfo } from '@oslsr/types';
import {
  createOdkBackfillService,
  type OdkBackfillPersistence,
  type OdkBackfillLock,
  type SubmissionGapResult,
  type BackfillResult,
} from '@oslsr/odk-integration';
import { queueSubmissionForIngestion } from '../queues/webhook-ingestion.queue.js';
import { submissions } from '../db/schema/index.js';
import { eq, count } from 'drizzle-orm';

const logger = pino({ name: 'odk-backfill-admin-service' });

// Redis lock key pattern
const BACKFILL_LOCK_KEY = (projectId: number) => `odk:backfill:lock:${projectId}`;

/**
 * ODK Backfill Admin Service
 *
 * Per AC5: Provides admin-level backfill operations with proper
 * persistence, locking, and audit logging.
 */
export class OdkBackfillAdminService {
  private static redis: Redis | null = null;

  private static getRedis(): Redis {
    if (!this.redis) {
      this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
      });
    }
    return this.redis;
  }

  /**
   * Create persistence implementation for backfill service
   *
   * Uses the submissions table and webhook-ingestion queue.
   */
  private static createPersistence(): OdkBackfillPersistence {
    return {
      /**
       * Get submission count in app_db for a specific form
       */
      async getAppDbSubmissionCount(xmlFormId: string): Promise<number> {
        const result = await db
          .select({ count: count() })
          .from(submissions)
          .where(eq(submissions.formXmlId, xmlFormId));

        return result[0]?.count ?? 0;
      },

      /**
       * Check if a submission already exists in app_db by ODK submission ID
       */
      async submissionExists(odkSubmissionId: string): Promise<boolean> {
        const result = await db.query.submissions.findFirst({
          where: eq(submissions.odkSubmissionId, odkSubmissionId),
          columns: { id: true },
        });

        return !!result;
      },

      /**
       * Queue a submission for ingestion via webhook-ingestion queue
       */
      async queueSubmissionForIngestion(
        submission: OdkSubmissionInfo,
        xmlFormId: string
      ): Promise<void> {
        await queueSubmissionForIngestion({
          source: 'backfill',
          odkSubmissionId: submission.instanceId,
          formXmlId: xmlFormId,
          odkSubmitterId: submission.submitterId?.toString(),
          submittedAt: submission.createdAt,
        });

        logger.debug({
          event: 'odk.backfill.submission_queued',
          odkSubmissionId: submission.instanceId,
          xmlFormId,
        });
      },

      /**
       * Get the last synced submission date for a form
       */
      async getLastSyncedDate(xmlFormId: string): Promise<string | null> {
        const result = await db.query.submissions.findFirst({
          where: eq(submissions.formXmlId, xmlFormId),
          orderBy: (table, { desc }) => [desc(table.submittedAt)],
          columns: { submittedAt: true },
        });

        return result?.submittedAt?.toISOString() ?? null;
      },
    };
  }

  /**
   * Create lock implementation for backfill service
   */
  private static createLock(): OdkBackfillLock {
    const redis = this.getRedis();

    return {
      /**
       * Acquire lock for a project (returns false if already locked)
       * Uses Redis SETNX with TTL for distributed locking
       */
      async acquireLock(projectId: number, ttlSeconds: number): Promise<boolean> {
        const key = BACKFILL_LOCK_KEY(projectId);
        const lockValue = `lock:${Date.now()}`;

        // Use SET with NX (only set if not exists) and EX (expire in seconds)
        const result = await redis.set(key, lockValue, 'EX', ttlSeconds, 'NX');

        return result === 'OK';
      },

      /**
       * Release lock for a project
       */
      async releaseLock(projectId: number): Promise<void> {
        const key = BACKFILL_LOCK_KEY(projectId);
        await redis.del(key);
      },

      /**
       * Check if project is locked
       */
      async isLocked(projectId: number): Promise<boolean> {
        const key = BACKFILL_LOCK_KEY(projectId);
        const exists = await redis.exists(key);
        return exists === 1;
      },
    };
  }

  /**
   * Get submission gap between ODK Central and app_db
   */
  static async getSubmissionGap(projectId: number): Promise<SubmissionGapResult> {
    const service = createOdkBackfillService({
      persistence: this.createPersistence(),
      lock: this.createLock(),
    });

    return service.getSubmissionGap(projectId);
  }

  /**
   * Backfill missing submissions from ODK Central
   *
   * Per AC5: Acquires lock, queries ODK for missing submissions,
   * and ingests them through the standard BullMQ pipeline.
   */
  static async backfillMissingSubmissions(
    projectId: number,
    actorId: string
  ): Promise<BackfillResult> {
    logger.info({
      event: 'odk.backfill.admin.started',
      projectId,
      actorId,
    });

    const service = createOdkBackfillService({
      persistence: this.createPersistence(),
      lock: this.createLock(),
    });

    const result = await service.backfillMissingSubmissions(projectId);

    // Create audit log
    await db.insert(auditLogs).values({
      id: uuidv7(),
      actorId,
      action: 'odk.backfill.executed',
      targetResource: 'odk_submissions',
      targetId: projectId.toString(),
      details: {
        submissionsQueued: result.submissionsQueued,
        submissionsSkipped: result.submissionsSkipped,
        byForm: result.byForm,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
      },
    });

    logger.info({
      event: 'odk.backfill.admin.completed',
      projectId,
      actorId,
      submissionsQueued: result.submissionsQueued,
      submissionsSkipped: result.submissionsSkipped,
    });

    return result;
  }

  /**
   * Check if backfill is in progress for a project
   */
  static async isBackfillInProgress(projectId: number): Promise<boolean> {
    const service = createOdkBackfillService({
      persistence: this.createPersistence(),
      lock: this.createLock(),
    });

    return service.isBackfillInProgress(projectId);
  }

  /**
   * Close Redis connection (for graceful shutdown)
   */
  static async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}
