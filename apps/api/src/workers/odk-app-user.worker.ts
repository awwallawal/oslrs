import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { CreateOdkAppUserPayload, OdkAppUserRecord, UserRole } from '@oslsr/types';
import { isFieldRole, createOdkAppUserPayloadSchema } from '@oslsr/types';
import {
  provisionAppUser,
  type OdkAppUserPersistence,
  type OdkAppUserAudit,
} from '@oslsr/odk-integration';
import { db } from '../db/index.js';
import { odkAppUsers, auditLogs } from '../db/schema/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const logger = pino({
  name: 'odk-app-user-worker',
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
});

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

/**
 * Database persistence implementation for OdkAppUserService.
 * Implements OdkAppUserPersistence interface.
 */
export const persistence: OdkAppUserPersistence = {
  async findByUserId(userId: string): Promise<OdkAppUserRecord | null> {
    const result = await db
      .select()
      .from(odkAppUsers)
      .where(eq(odkAppUsers.userId, userId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      id: row.id,
      userId: row.userId,
      odkAppUserId: row.odkAppUserId,
      displayName: row.displayName,
      encryptedToken: row.encryptedToken,
      tokenIv: row.tokenIv,
      odkProjectId: row.odkProjectId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  async create(record: Omit<OdkAppUserRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<OdkAppUserRecord> {
    const id = uuidv7();
    const now = new Date();

    await db.insert(odkAppUsers).values({
      id,
      userId: record.userId,
      odkAppUserId: record.odkAppUserId,
      displayName: record.displayName,
      encryptedToken: record.encryptedToken,
      tokenIv: record.tokenIv,
      odkProjectId: record.odkProjectId,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      ...record,
      createdAt: now,
      updatedAt: now,
    };
  },
};

/**
 * Audit logging implementation for OdkAppUserService.
 * Implements OdkAppUserAudit interface.
 */
export const audit: OdkAppUserAudit = {
  async logProvisioned(
    userId: string,
    odkAppUserId: number,
    odkProjectId: number,
    displayName: string
  ): Promise<void> {
    await db.insert(auditLogs).values({
      id: uuidv7(),
      action: 'user.odk_app_user_provisioned', // AC8
      targetResource: 'users',
      targetId: userId,
      actorId: null, // System action
      details: {
        odkAppUserId,
        odkProjectId,
        displayName,
      },
      createdAt: new Date(),
    });
  },
};

/**
 * Job processor result types for testing
 */
export interface ProcessorSuccessResult {
  success: true;
  userId: string;
  odkAppUserId: number;
  displayName: string;
}

export interface ProcessorSkippedResult {
  success: true;
  skipped: true;
  reason: string;
  userId: string;
  role: string;
}

export type ProcessorResult = ProcessorSuccessResult | ProcessorSkippedResult;

/**
 * Job context for processor - allows dependency injection for testing
 */
export interface JobContext {
  jobId?: string;
  attemptsMade: number;
  maxAttempts: number;
}

/**
 * Processor dependencies - injectable for testing
 */
export interface ProcessorDependencies {
  persistence: OdkAppUserPersistence;
  audit: OdkAppUserAudit;
  provisionFn: typeof provisionAppUser;
  logger: pino.Logger;
}

/**
 * Extracted processor logic for testability.
 * This function contains all the business logic for processing ODK App User provisioning jobs.
 *
 * @param payload Job payload containing userId, fullName, role
 * @param context Job context (jobId, attempts)
 * @param deps Injectable dependencies (persistence, audit, provisionFn, logger)
 * @returns ProcessorResult indicating success or skip
 * @throws Error to trigger BullMQ retry
 */
export async function processOdkAppUserJob(
  payload: CreateOdkAppUserPayload,
  context: JobContext,
  deps: ProcessorDependencies
): Promise<ProcessorResult> {
  const { userId, fullName, role } = payload;
  const { jobId, attemptsMade, maxAttempts } = context;
  const { persistence: p, audit: a, provisionFn, logger: log } = deps;

  log.info({
    event: 'odk.appuser.job_started',
    jobId,
    userId,
    fullName,
    role,
    attempt: attemptsMade + 1,
  });

  // Validate job payload
  const validation = createOdkAppUserPayloadSchema.safeParse(payload);
  if (!validation.success) {
    log.error({
      event: 'odk.appuser.job_invalid_payload',
      jobId,
      errors: validation.error.issues,
    });
    // Don't retry invalid payloads
    throw new Error(`Invalid job payload: ${validation.error.message}`);
  }

  // AC10: Filter out back-office roles
  if (!isFieldRole(role as UserRole)) {
    log.info({
      event: 'odk.appuser.skipped_backoffice',
      jobId,
      userId,
      role,
    });
    return {
      success: true,
      skipped: true,
      reason: 'back-office role',
      userId,
      role,
    };
  }

  try {
    // AC1, AC5: Provision App User (idempotent)
    const result = await provisionFn(userId, fullName, role, p, a);

    log.info({
      event: 'odk.appuser.job_completed',
      jobId,
      userId,
      odkAppUserId: result.odkAppUserId,
    });

    return {
      success: true,
      userId,
      odkAppUserId: result.odkAppUserId,
      displayName: result.displayName,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error({
      event: 'odk.appuser.create_failed', // AC6: Log failure
      jobId,
      userId,
      fullName,
      role,
      error: errorMessage,
      attempt: attemptsMade + 1,
      maxAttempts,
    });

    // If this is the final attempt, log for manual reconciliation
    if (attemptsMade + 1 >= maxAttempts) {
      log.fatal({
        event: 'odk.appuser.provision_exhausted',
        jobId,
        userId,
        fullName,
        role,
        error: errorMessage,
        action_required: 'Manual intervention needed - App User provisioning failed after all retries',
      });
    }

    throw error; // Re-throw to trigger retry
  }
}

/**
 * Default dependencies for production use
 */
const defaultDeps: ProcessorDependencies = {
  persistence,
  audit,
  provisionFn: provisionAppUser,
  logger,
};

/**
 * ODK App User Provisioning Worker
 *
 * Processes odk-app-user-provision jobs to create ODK App Users for field staff.
 *
 * AC1: Triggered when staff with field role is activated
 * AC5: Idempotent - skips if App User already exists
 * AC6: Retries with exponential backoff on ODK API failure
 * AC10: Filters out back-office roles (no ODK App User created)
 */
export const odkAppUserWorker = new Worker<CreateOdkAppUserPayload>(
  'odk-app-user-provision',
  async (job: Job<CreateOdkAppUserPayload>) => {
    const context: JobContext = {
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts || 5,
    };
    return processOdkAppUserJob(job.data, context, defaultDeps);
  },
  {
    connection,
    concurrency: 3, // Process up to 3 provisions concurrently
  }
);

// Worker event handlers
odkAppUserWorker.on('completed', (job) => {
  logger.info({
    event: 'odk.appuser.worker.job_completed',
    jobId: job.id,
    userId: job.data.userId,
  });
});

odkAppUserWorker.on('failed', (job, err) => {
  logger.error({
    event: 'odk.appuser.worker.job_failed',
    jobId: job?.id,
    userId: job?.data.userId,
    error: err.message,
    attempt: job?.attemptsMade,
  });
});

odkAppUserWorker.on('error', (err) => {
  logger.error({
    event: 'odk.appuser.worker.error',
    error: err.message,
  });
});

/**
 * Close the worker connection (for graceful shutdown).
 */
export async function closeOdkAppUserWorker(): Promise<void> {
  await odkAppUserWorker.close();
  await connection.quit();
}
