import { pgTable, uuid, text, timestamp, integer, index, jsonb } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/**
 * ODK operation types that can fail and need tracking.
 * Per Story 2-5: Health monitoring for ODK Central integration.
 */
export const odkOperationTypes = [
  'form_deploy',
  'form_unpublish',
  'app_user_create',
  'submission_fetch',
] as const;
export type OdkOperationType = typeof odkOperationTypes[number];

/**
 * ODK Sync Failures table
 *
 * Stores failed ODK operations for retry and monitoring.
 * Per AC1: Displays failures in "ODK Sync Failures" widget with timestamp, error type, and affected operation.
 *
 * Pattern follows audit_logs table structure.
 */
export const odkSyncFailures = pgTable('odk_sync_failures', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // Operation that failed
  operation: text('operation', { enum: odkOperationTypes }).notNull(),

  // Error details
  errorMessage: text('error_message').notNull(),
  errorCode: text('error_code').notNull(), // e.g., 'ODK_AUTH_FAILED', 'ODK_TIMEOUT'

  // Operation-specific context (JSONB for flexibility)
  // e.g., { formId, questionnaireId, staffId, xmlFormId }
  context: jsonb('context'),

  // Retry tracking
  retryCount: integer('retry_count').notNull().default(0),

  // Resolution tracking (NULL until resolved)
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),

  // Audit timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Index for querying unresolved failures (most common query)
  unresolvedIdx: index('idx_odk_sync_failures_unresolved').on(table.resolvedAt),

  // Index for filtering by operation type
  operationIdx: index('idx_odk_sync_failures_operation').on(table.operation),

  // Index for ordering by creation time
  createdAtIdx: index('idx_odk_sync_failures_created_at').on(table.createdAt),
}));
