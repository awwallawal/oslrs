/**
 * Submissions Schema
 *
 * Stores survey submissions ingested from ODK Central.
 * Foundation created in Story 2-5 (backfill), enhanced in Story 3.4 (webhook ingestion).
 *
 * Data flow:
 * 1. ODK Central receives submission from Enketo
 * 2. Webhook (Story 3.4) or Backfill (Story 2-5) queues for ingestion
 * 3. Worker saves to this table
 * 4. Fraud engine processes (Story 4.3)
 */

import { pgTable, uuid, text, timestamp, jsonb, index, boolean, doublePrecision } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/**
 * Ingestion source type
 */
export const ingestionSourceTypes = ['webhook', 'backfill', 'manual'] as const;
export type IngestionSource = typeof ingestionSourceTypes[number];

/**
 * Submissions table
 *
 * Core fields (Story 2-5):
 * - odk_submission_id: Unique ID from ODK Central (for deduplication)
 * - form_xml_id: Links to questionnaire form
 * - raw_data: Full submission JSON from ODK
 * - submitted_at: When submitted to ODK Central
 * - ingested_at: When processed by our system
 * - source: How it was ingested (webhook/backfill)
 *
 * Fields to be added by Story 3.4/4.3:
 * - respondent_id: Extracted respondent FK
 * - enumerator_id: Who submitted (from ODK submitter)
 * - fraud_score: Calculated by fraud engine
 * - fraud_flags: Array of triggered rules
 * - verification_status: pending/verified/rejected
 */
export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // ODK Central reference (CRITICAL for deduplication)
  odkSubmissionId: text('odk_submission_id').notNull().unique(),

  // Form reference
  formXmlId: text('form_xml_id').notNull(),

  // Submitter info from ODK (numeric ID from ODK Central)
  odkSubmitterId: text('odk_submitter_id'),

  // Raw submission data from ODK Central
  rawData: jsonb('raw_data'),

  // GPS coordinates (for fraud detection - cluster analysis)
  gpsLatitude: doublePrecision('gps_latitude'),
  gpsLongitude: doublePrecision('gps_longitude'),

  // Timestamps
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),

  // Ingestion metadata
  source: text('source', { enum: ingestionSourceTypes }).notNull().default('webhook'),

  // Processing status (for Story 3.4 worker)
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
