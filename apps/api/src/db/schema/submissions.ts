/**
 * Submissions Schema
 *
 * Stores survey submissions from the native form system.
 * Foundation created in Story 2-5, enhanced in Story 3.4.
 *
 * Data flow:
 * 1. Enumerator submits form via native form system
 * 2. Submission saved to this table
 * 3. Fraud engine processes (Story 4.3)
 */

import { pgTable, uuid, text, timestamp, jsonb, index, boolean, doublePrecision } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/**
 * Ingestion source type
 */
export const ingestionSourceTypes = ['webapp', 'mobile', 'webhook', 'backfill', 'manual'] as const;
export type IngestionSource = typeof ingestionSourceTypes[number];

/**
 * Submissions table
 *
 * Core fields:
 * - submission_id: Unique submission identifier (for deduplication)
 * - form_xml_id: Links to questionnaire form
 * - raw_data: Full submission JSON
 * - submitted_at: When submitted
 * - ingested_at: When processed by our system
 * - source: How it was submitted (webapp/mobile/manual)
 *
 * Fields to be added by Story 3.4/4.3:
 * - respondent_id: Extracted respondent FK
 * - enumerator_id: Who submitted
 * - fraud_score: Calculated by fraud engine
 * - fraud_flags: Array of triggered rules
 * - verification_status: pending/verified/rejected
 */
export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // Submission reference (CRITICAL for deduplication)
  // Note: Column name kept as odk_submission_id for migration compatibility
  odkSubmissionId: text('odk_submission_id').notNull().unique(),

  // Form reference
  formXmlId: text('form_xml_id').notNull(),

  // Submitter info
  // Note: Column name kept as odk_submitter_id for migration compatibility
  odkSubmitterId: text('odk_submitter_id'),

  // Raw submission data
  rawData: jsonb('raw_data'),

  // GPS coordinates (for fraud detection - cluster analysis)
  gpsLatitude: doublePrecision('gps_latitude'),
  gpsLongitude: doublePrecision('gps_longitude'),

  // Timestamps
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),

  // Ingestion metadata
  source: text('source', { enum: ingestionSourceTypes }).notNull().default('webapp'),

  // Processing status
  processed: boolean('processed').notNull().default(false),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  processingError: text('processing_error'),

  // Standard timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Index for deduplication lookups
  odkSubmissionIdIdx: index('submissions_odk_submission_id_idx').on(table.odkSubmissionId),
  // Index for form-based queries
  formXmlIdIdx: index('submissions_form_xml_id_idx').on(table.formXmlId),
  // Index for processing queue
  processedIdx: index('submissions_processed_idx').on(table.processed),
  // Index for time-based queries
  submittedAtIdx: index('submissions_submitted_at_idx').on(table.submittedAt),
}));

export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
