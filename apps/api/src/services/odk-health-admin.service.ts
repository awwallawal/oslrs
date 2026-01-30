import { db } from '../db/index.js';
import { odkSyncFailures, auditLogs } from '../db/schema/index.js';
import { eq, isNull, count } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { Redis } from 'ioredis';
import pino from 'pino';
import { AppError } from '@oslsr/utils';
import type { OdkHealthResponse, OdkSyncFailure, OdkConnectivityStatus } from '@oslsr/types';
import { triggerManualHealthCheck } from '../queues/odk-health-check.queue.js';

const logger = pino({ name: 'odk-health-admin-service' });

// Redis keys for cached health data
const LAST_CONNECTIVITY_KEY = 'odk:health:last_connectivity';
const CONSECUTIVE_FAILURES_KEY = 'odk:health:consecutive_failures';
const BACKFILL_IN_PROGRESS_KEY = 'odk:backfill:lock:*';

/**
 * ODK Health Admin Service
 *
 * Per Story 2-5: Provides admin dashboard data and failure management.
 *
 * Features:
 * - Get health dashboard data (cached, not live)
 * - Retry sync failures
 * - Dismiss/resolve sync failures
 */
export class OdkHealthAdminService {
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
   * Get health dashboard data
   *
   * Per Task 7.3: Uses cached data from last health check, doesn't call ODK API live.
   */
  static async getHealthDashboard(): Promise<OdkHealthResponse> {
    const redis = this.getRedis();

    // Get cached connectivity status
    const connectivityStr = await redis.get(LAST_CONNECTIVITY_KEY);
    const connectivity: OdkConnectivityStatus = connectivityStr
      ? JSON.parse(connectivityStr)
      : {
          reachable: false,
          latencyMs: 0,
          lastChecked: 'never',
          consecutiveFailures: 0,
        };

    // Get consecutive failures from Redis
    const consecutiveFailures = await redis.get(CONSECUTIVE_FAILURES_KEY);
    connectivity.consecutiveFailures = consecutiveFailures ? parseInt(consecutiveFailures, 10) : 0;

    // Get unresolved sync failures from DB
    const failures = await this.getUnresolvedFailures();

    // Check if backfill is in progress
    const backfillKeys = await redis.keys(BACKFILL_IN_PROGRESS_KEY);
    const backfillInProgress = backfillKeys.length > 0;

    return {
      connectivity,
      submissions: {
        odkCount: 0, // TODO: Store from last health check
        appDbCount: 0,
        delta: 0,
        byForm: [],
        lastSynced: 'never', // TODO: Store from last health check
      },
      failures,
      backfillInProgress,
    };
  }

  /**
   * Trigger a manual health check job
   */
  static async triggerHealthCheck(): Promise<string> {
    return triggerManualHealthCheck();
  }

  /**
   * Get all unresolved sync failures
   */
  static async getUnresolvedFailures(): Promise<OdkSyncFailure[]> {
    const rows = await db.query.odkSyncFailures.findMany({
      where: isNull(odkSyncFailures.resolvedAt),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    return rows.map((row) => ({
      id: row.id,
      operation: row.operation as OdkSyncFailure['operation'],
      errorMessage: row.errorMessage,
      errorCode: row.errorCode,
      context: row.context as Record<string, unknown> | undefined,
      retryCount: row.retryCount,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  /**
   * Retry a specific sync failure
   *
   * Per AC2: Re-attempts the operation and updates the widget status.
   */
  static async retryFailure(failureId: string, actorId: string): Promise<{
    success: boolean;
    failureId: string;
    message: string;
  }> {
    // Get the failure record
    const failure = await db.query.odkSyncFailures.findFirst({
      where: eq(odkSyncFailures.id, failureId),
    });

    if (!failure) {
      throw new AppError(
        'SYNC_FAILURE_NOT_FOUND',
        `Sync failure with id ${failureId} not found`,
        404
      );
    }

    logger.info({
      event: 'odk.health.admin.retry_started',
      failureId,
      operation: failure.operation,
      actorId,
    });

    // For now, just increment retry count and mark as attempted
    // TODO: Implement actual retry logic based on operation type
    const newRetryCount = failure.retryCount + 1;

    await db
      .update(odkSyncFailures)
      .set({
        retryCount: newRetryCount,
        updatedAt: new Date(),
      })
      .where(eq(odkSyncFailures.id, failureId));

    // Create audit log
    await db.insert(auditLogs).values({
      id: uuidv7(),
      actorId,
      action: 'odk.sync_failure.retry',
      targetResource: 'odk_sync_failures',
      targetId: failureId,
      details: {
        operation: failure.operation,
        errorCode: failure.errorCode,
        retryCount: newRetryCount,
      },
    });

    logger.info({
      event: 'odk.health.admin.retry_recorded',
      failureId,
      operation: failure.operation,
      retryCount: newRetryCount,
    });

    return {
      success: true,
      failureId,
      message: `Retry attempt ${newRetryCount} recorded for ${failure.operation} operation`,
    };
  }

  /**
   * Dismiss/resolve a sync failure without retry
   *
   * Marks the failure as resolved and creates an audit log entry.
   */
  static async dismissFailure(failureId: string, actorId: string): Promise<void> {
    // Get the failure record
    const failure = await db.query.odkSyncFailures.findFirst({
      where: eq(odkSyncFailures.id, failureId),
    });

    if (!failure) {
      throw new AppError(
        'SYNC_FAILURE_NOT_FOUND',
        `Sync failure with id ${failureId} not found`,
        404
      );
    }

    logger.info({
      event: 'odk.health.admin.dismiss_started',
      failureId,
      operation: failure.operation,
      actorId,
    });

    // Mark as resolved
    await db
      .update(odkSyncFailures)
      .set({
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(odkSyncFailures.id, failureId));

    // Create audit log
    await db.insert(auditLogs).values({
      id: uuidv7(),
      actorId,
      action: 'odk.sync_failure.dismissed',
      targetResource: 'odk_sync_failures',
      targetId: failureId,
      details: {
        operation: failure.operation,
        errorCode: failure.errorCode,
        errorMessage: failure.errorMessage,
        retryCount: failure.retryCount,
      },
    });

    logger.info({
      event: 'odk.health.admin.dismiss_completed',
      failureId,
      operation: failure.operation,
    });
  }

  /**
   * Get count of unresolved failures
   */
  static async getUnresolvedFailureCount(): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(odkSyncFailures)
      .where(isNull(odkSyncFailures.resolvedAt));

    return result[0]?.count ?? 0;
  }

  /**
   * Store connectivity status in Redis cache
   * Called by the health check worker after each check.
   */
  static async cacheConnectivityStatus(status: OdkConnectivityStatus): Promise<void> {
    const redis = this.getRedis();
    await redis.set(LAST_CONNECTIVITY_KEY, JSON.stringify(status), 'EX', 24 * 60 * 60);
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
