/**
 * ODK Health Service (Story 2-5)
 *
 * Per ADR-002: ALL ODK Central API calls MUST go through @oslsr/odk-integration.
 * Per ADR-009: Health monitoring and recovery for ODK integration.
 *
 * Features:
 * - checkOdkConnectivity(): Lightweight auth check via GET /v1/users/current
 * - getSubmissionCounts(): Aggregate per-form submission counts
 * - recordSyncFailure(): Persist failures to odk_sync_failures table
 * - getSyncFailures(): Retrieve unresolved failures
 * - retrySyncFailure(): Re-attempt failed operation
 */

import pino from 'pino';
import { AppError } from '@oslsr/utils';
import {
  type OdkConnectivityStatus,
  type OdkSubmissionSyncStatus,
  type OdkSyncFailure,
  type OdkOperation,
  type RecordSyncFailureInput,
  type RetrySyncFailureResult,
  ODK_CONFIG_ERROR,
} from '@oslsr/types';
import { isOdkFullyConfigured } from './odk-config.js';
import { getOdkConfig, odkRequest } from './odk-client.js';

const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
});

/**
 * Persistence interface for sync failures
 */
export interface OdkSyncFailurePersistence {
  createSyncFailure(input: RecordSyncFailureInput): Promise<OdkSyncFailure>;
  getSyncFailures(options?: { unresolvedOnly?: boolean }): Promise<OdkSyncFailure[]>;
  getSyncFailureById(id: string): Promise<OdkSyncFailure | null>;
  updateSyncFailure(id: string, updates: Partial<OdkSyncFailure>): Promise<void>;
  deleteSyncFailure(id: string): Promise<void>;
}

/**
 * Logger interface for health service
 */
export interface OdkHealthLogger {
  info: (obj: Record<string, unknown>) => void;
  warn: (obj: Record<string, unknown>) => void;
  error: (obj: Record<string, unknown>) => void;
  debug: (obj: Record<string, unknown>) => void;
}

/**
 * Dependencies for ODK Health Service
 */
export interface OdkHealthServiceDeps {
  persistence: OdkSyncFailurePersistence;
  logger: OdkHealthLogger;
}

/**
 * Retry handler function type
 */
export type RetryHandler = (context: Record<string, unknown>) => Promise<{ success: boolean }>;

/**
 * ODK Health Service interface
 */
export interface OdkHealthService {
  checkOdkConnectivity(): Promise<OdkConnectivityStatus>;
  getSubmissionCounts(projectId: number): Promise<OdkSubmissionSyncStatus>;
  recordSyncFailure(input: RecordSyncFailureInput): Promise<OdkSyncFailure>;
  getSyncFailures(): Promise<OdkSyncFailure[]>;
  retrySyncFailure(failureId: string): Promise<RetrySyncFailureResult>;
  setRetryHandler(operation: OdkOperation, handler: RetryHandler): void;
}

/**
 * Create ODK Health Service with dependency injection
 */
export function createOdkHealthService(deps: OdkHealthServiceDeps): OdkHealthService {
  const { persistence, logger: log } = deps;

  // Retry handlers for each operation type
  const retryHandlers = new Map<OdkOperation, RetryHandler>();

  /**
   * Check ODK Central connectivity via GET /v1/users/current
   * This is a lightweight auth check per ADR-009.
   */
  async function checkOdkConnectivity(): Promise<OdkConnectivityStatus> {
    // REQUIRED: Check ODK config first (Story 2-4 pattern)
    if (!isOdkFullyConfigured()) {
      throw new AppError(
        ODK_CONFIG_ERROR,
        'ODK integration is not fully configured',
        503
      );
    }

    const config = getOdkConfig();
    if (!config) {
      throw new AppError(
        ODK_CONFIG_ERROR,
        'ODK integration is not fully configured',
        503
      );
    }

    const startTime = Date.now();

    try {
      const response = await odkRequest(config, 'GET', '/v1/users/current');

      if (!response.ok) {
        const latencyMs = Date.now() - startTime;
        log.warn({
          event: 'odk.health.connectivity_failed',
          status: response.status,
          latencyMs,
        });

        return {
          reachable: false,
          latencyMs,
          lastChecked: new Date().toISOString(),
          consecutiveFailures: 1,
        };
      }

      const latencyMs = Date.now() - startTime;
      log.info({
        event: 'odk.health.connectivity_ok',
        latencyMs,
      });

      return {
        reachable: true,
        latencyMs,
        lastChecked: new Date().toISOString(),
        consecutiveFailures: 0,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      log.error({
        event: 'odk.health.connectivity_error',
        error: error instanceof Error ? error.message : String(error),
        latencyMs,
      });

      return {
        reachable: false,
        latencyMs,
        lastChecked: new Date().toISOString(),
        consecutiveFailures: 1,
      };
    }
  }

  /**
   * Get submission counts from ODK Central.
   * ODK Central does NOT have project-level submission count endpoint.
   * Must iterate forms and sum per-form counts.
   */
  async function getSubmissionCounts(projectId: number): Promise<OdkSubmissionSyncStatus> {
    // REQUIRED: Check ODK config first (Story 2-4 pattern)
    if (!isOdkFullyConfigured()) {
      throw new AppError(
        ODK_CONFIG_ERROR,
        'ODK integration is not fully configured',
        503
      );
    }

    const config = getOdkConfig();
    if (!config) {
      throw new AppError(
        ODK_CONFIG_ERROR,
        'ODK integration is not fully configured',
        503
      );
    }

    // Get all forms in the project
    const formsResponse = await odkRequest(config, 'GET', `/v1/projects/${projectId}/forms`);

    if (!formsResponse.ok) {
      throw new AppError(
        'ODK_HEALTH_CHECK_FAILED',
        `Failed to get forms: ${formsResponse.status}`,
        502
      );
    }

    const forms = await formsResponse.json() as Array<{ xmlFormId: string; name: string }>;

    const byForm: OdkSubmissionSyncStatus['byForm'] = [];
    let totalOdkCount = 0;

    // Get submission count for each form
    for (const form of forms) {
      const countResponse = await odkRequest(
        config,
        'GET',
        `/v1/projects/${projectId}/forms/${encodeURIComponent(form.xmlFormId)}/submissions?$top=0&$count=true`
      );

      if (countResponse.ok) {
        // ODK returns count in @odata.count field
        const data = await countResponse.json() as { '@odata.count'?: number };
        const count = data['@odata.count'] ?? 0;
        totalOdkCount += count;

        byForm.push({
          formId: form.name,
          xmlFormId: form.xmlFormId,
          odkCount: count,
          appDbCount: 0, // Will be filled by the caller with app_db counts
        });
      }
    }

    log.info({
      event: 'odk.health.submission_counts',
      projectId,
      totalOdkCount,
      formCount: forms.length,
    });

    return {
      odkCount: totalOdkCount,
      appDbCount: 0, // Will be filled by the caller
      delta: totalOdkCount, // Will be recalculated with app_db counts
      byForm,
      lastSynced: new Date().toISOString(),
    };
  }

  /**
   * Record a sync failure to the database
   */
  async function recordSyncFailure(input: RecordSyncFailureInput): Promise<OdkSyncFailure> {
    log.warn({
      event: 'odk.health.sync_failure_recorded',
      operation: input.operation,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    });

    return persistence.createSyncFailure(input);
  }

  /**
   * Get unresolved sync failures
   */
  async function getSyncFailures(): Promise<OdkSyncFailure[]> {
    return persistence.getSyncFailures({ unresolvedOnly: true });
  }

  /**
   * Retry a failed sync operation
   */
  async function retrySyncFailure(failureId: string): Promise<RetrySyncFailureResult> {
    const failure = await persistence.getSyncFailureById(failureId);

    if (!failure) {
      throw new AppError(
        'SYNC_FAILURE_NOT_FOUND',
        `Sync failure with id ${failureId} not found`,
        404
      );
    }

    const handler = retryHandlers.get(failure.operation);

    if (!handler) {
      log.warn({
        event: 'odk.health.retry_no_handler',
        failureId,
        operation: failure.operation,
      });

      return {
        success: false,
        failureId,
        message: `No retry handler registered for operation: ${failure.operation}`,
      };
    }

    try {
      const result = await handler(failure.context || {});

      if (result.success) {
        // Mark as resolved
        await persistence.updateSyncFailure(failureId, {
          resolvedAt: new Date().toISOString(),
        });

        log.info({
          event: 'odk.health.retry_success',
          failureId,
          operation: failure.operation,
        });

        return {
          success: true,
          failureId,
          message: 'Operation completed successfully',
        };
      } else {
        // Increment retry count
        await persistence.updateSyncFailure(failureId, {
          retryCount: failure.retryCount + 1,
          updatedAt: new Date().toISOString(),
        });

        return {
          success: false,
          failureId,
          message: 'Retry failed',
        };
      }
    } catch (error) {
      // Increment retry count and update error message
      await persistence.updateSyncFailure(failureId, {
        retryCount: failure.retryCount + 1,
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      });

      log.error({
        event: 'odk.health.retry_error',
        failureId,
        operation: failure.operation,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        failureId,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Register a retry handler for an operation type
   */
  function setRetryHandler(operation: OdkOperation, handler: RetryHandler): void {
    retryHandlers.set(operation, handler);
  }

  return {
    checkOdkConnectivity,
    getSubmissionCounts,
    recordSyncFailure,
    getSyncFailures,
    retrySyncFailure,
    setRetryHandler,
  };
}
