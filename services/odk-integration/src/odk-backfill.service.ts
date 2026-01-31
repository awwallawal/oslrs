/**
 * ODK Backfill Service (Story 2-5, AC: 5)
 *
 * Per ADR-002: ALL ODK Central API calls MUST go through @oslsr/odk-integration.
 * Per ADR-009: Manual backfill to prevent unexpected load on both systems.
 *
 * Features:
 * - getSubmissionGap(): Compare ODK vs app_db submission counts per form
 * - backfillMissingSubmissions(): Fetch and queue missing submissions
 * - Lock mechanism to prevent concurrent backfill operations
 *
 * Idempotency: Checks odk_submission_id before queueing to skip duplicates.
 */

import pino from 'pino';
import { AppError } from '@oslsr/utils';
import type { OdkConfig, OdkSubmissionInfo } from '@oslsr/types';
import { getOdkConfig, getProjectForms, getSubmissionsAfter, getFormSubmissionCount } from './odk-client.js';
import { isOdkFullyConfigured } from './odk-config.js';

const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
});

/**
 * Submission gap info for a single form
 */
export interface FormSubmissionGap {
  formId: string;
  xmlFormId: string;
  odkCount: number;
  appDbCount: number;
  gap: number;
}

/**
 * Result of gap detection
 */
export interface SubmissionGapResult {
  projectId: number;
  totalOdkCount: number;
  totalAppDbCount: number;
  totalGap: number;
  byForm: FormSubmissionGap[];
  checkedAt: string;
}

/**
 * Result of backfill operation
 */
export interface BackfillResult {
  projectId: number;
  submissionsQueued: number;
  submissionsSkipped: number;
  byForm: Array<{
    xmlFormId: string;
    queued: number;
    skipped: number;
  }>;
  startedAt: string;
  completedAt: string;
}

/**
 * Persistence interface for backfill operations
 */
export interface OdkBackfillPersistence {
  /** Get submission count in app_db for a specific form */
  getAppDbSubmissionCount(xmlFormId: string): Promise<number>;
  /** Check if a submission already exists in app_db */
  submissionExists(odkSubmissionId: string): Promise<boolean>;
  /** Queue a submission for ingestion via BullMQ */
  queueSubmissionForIngestion(submission: OdkSubmissionInfo, xmlFormId: string): Promise<void>;
  /** Get the last synced submission date for a form */
  getLastSyncedDate(xmlFormId: string): Promise<string | null>;
}

/**
 * Lock service interface for preventing concurrent backfill
 */
export interface OdkBackfillLock {
  /** Acquire lock for a project (returns false if already locked) */
  acquireLock(projectId: number, ttlSeconds: number): Promise<boolean>;
  /** Release lock for a project */
  releaseLock(projectId: number): Promise<void>;
  /** Check if project is locked */
  isLocked(projectId: number): Promise<boolean>;
}

/**
 * Dependencies for ODK Backfill Service
 */
export interface OdkBackfillServiceDeps {
  persistence: OdkBackfillPersistence;
  lock: OdkBackfillLock;
  logger?: typeof logger;
}

/**
 * ODK Backfill Service interface
 */
export interface OdkBackfillService {
  getSubmissionGap(projectId: number): Promise<SubmissionGapResult>;
  backfillMissingSubmissions(projectId: number): Promise<BackfillResult>;
  isBackfillInProgress(projectId: number): Promise<boolean>;
}

// Lock TTL: 10 minutes
const BACKFILL_LOCK_TTL_SECONDS = 10 * 60;

/**
 * Create ODK Backfill Service with dependency injection
 */
export function createOdkBackfillService(deps: OdkBackfillServiceDeps): OdkBackfillService {
  const { persistence, lock, logger: log = logger } = deps;

  /**
   * Get submission gap between ODK Central and app_db
   */
  async function getSubmissionGap(projectId: number): Promise<SubmissionGapResult> {
    // Check ODK configuration
    if (!isOdkFullyConfigured()) {
      throw new AppError(
        'ODK_CONFIG_ERROR',
        'ODK integration is not fully configured',
        503
      );
    }

    const config = getOdkConfig();
    if (!config) {
      throw new AppError(
        'ODK_CONFIG_ERROR',
        'ODK integration is not fully configured',
        503
      );
    }

    log.info({
      event: 'odk.backfill.gap_check_started',
      projectId,
    });

    // Get all forms in the project
    const forms = await getProjectForms(config, projectId);

    const byForm: FormSubmissionGap[] = [];
    let totalOdkCount = 0;
    let totalAppDbCount = 0;

    for (const form of forms) {
      // Get ODK count via OData
      const odkCount = await getFormSubmissionCount(config, projectId, form.xmlFormId);

      // Get app_db count
      const appDbCount = await persistence.getAppDbSubmissionCount(form.xmlFormId);

      const gap = odkCount - appDbCount;

      byForm.push({
        formId: form.name,
        xmlFormId: form.xmlFormId,
        odkCount,
        appDbCount,
        gap,
      });

      totalOdkCount += odkCount;
      totalAppDbCount += appDbCount;
    }

    const result: SubmissionGapResult = {
      projectId,
      totalOdkCount,
      totalAppDbCount,
      totalGap: totalOdkCount - totalAppDbCount,
      byForm,
      checkedAt: new Date().toISOString(),
    };

    log.info({
      event: 'odk.backfill.gap_check_completed',
      projectId,
      totalOdkCount,
      totalAppDbCount,
      totalGap: result.totalGap,
      formCount: forms.length,
    });

    return result;
  }

  /**
   * Backfill missing submissions from ODK Central
   *
   * Per AC5: Acquires lock, queries ODK for missing submissions,
   * ingests through standard BullMQ pipeline (idempotent via submission ID check).
   */
  async function backfillMissingSubmissions(projectId: number): Promise<BackfillResult> {
    // Check ODK configuration
    if (!isOdkFullyConfigured()) {
      throw new AppError(
        'ODK_CONFIG_ERROR',
        'ODK integration is not fully configured',
        503
      );
    }

    const config = getOdkConfig();
    if (!config) {
      throw new AppError(
        'ODK_CONFIG_ERROR',
        'ODK integration is not fully configured',
        503
      );
    }

    // Try to acquire lock
    const lockAcquired = await lock.acquireLock(projectId, BACKFILL_LOCK_TTL_SECONDS);
    if (!lockAcquired) {
      throw new AppError(
        'ODK_BACKFILL_IN_PROGRESS',
        'A backfill operation is already in progress for this project',
        409
      );
    }

    const startedAt = new Date().toISOString();

    log.info({
      event: 'odk.backfill.started',
      projectId,
      startedAt,
    });

    try {
      // Get all forms in the project
      const forms = await getProjectForms(config, projectId);

      const byForm: BackfillResult['byForm'] = [];
      let totalQueued = 0;
      let totalSkipped = 0;

      for (const form of forms) {
        // Get last synced date for this form (or use epoch if never synced)
        const lastSyncedDate = await persistence.getLastSyncedDate(form.xmlFormId);
        const afterDate = lastSyncedDate || '1970-01-01T00:00:00Z';

        log.debug({
          event: 'odk.backfill.form_processing',
          xmlFormId: form.xmlFormId,
          afterDate,
        });

        // Fetch submissions after the last synced date
        const submissions = await getSubmissionsAfter(
          config,
          projectId,
          form.xmlFormId,
          afterDate
        );

        let queued = 0;
        let skipped = 0;

        for (const submission of submissions) {
          // Idempotency check: skip if already exists
          const exists = await persistence.submissionExists(submission.instanceId);
          if (exists) {
            skipped++;
            continue;
          }

          // Queue for ingestion
          await persistence.queueSubmissionForIngestion(submission, form.xmlFormId);
          queued++;
        }

        byForm.push({
          xmlFormId: form.xmlFormId,
          queued,
          skipped,
        });

        totalQueued += queued;
        totalSkipped += skipped;

        log.info({
          event: 'odk.backfill.form_completed',
          xmlFormId: form.xmlFormId,
          queued,
          skipped,
          total: submissions.length,
        });
      }

      const completedAt = new Date().toISOString();

      const result: BackfillResult = {
        projectId,
        submissionsQueued: totalQueued,
        submissionsSkipped: totalSkipped,
        byForm,
        startedAt,
        completedAt,
      };

      log.info({
        event: 'odk.backfill.completed',
        projectId,
        submissionsQueued: totalQueued,
        submissionsSkipped: totalSkipped,
        startedAt,
        completedAt,
      });

      return result;
    } finally {
      // Always release lock
      await lock.releaseLock(projectId);
    }
  }

  /**
   * Check if backfill is in progress for a project
   */
  async function isBackfillInProgress(projectId: number): Promise<boolean> {
    return lock.isLocked(projectId);
  }

  return {
    getSubmissionGap,
    backfillMissingSubmissions,
    isBackfillInProgress,
  };
}
