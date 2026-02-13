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
import { respondents } from './respondents.js';

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
 * - questionnaire_form_id: Links to questionnaire form
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
  submissionUid: text('submission_uid').notNull().unique(),

  // Form reference — stores questionnaire_forms.id UUID
  questionnaireFormId: text('questionnaire_form_id').notNull(),

  // Submitter info
  submitterId: text('submitter_id'),

  // Story 3.4: Respondent + Enumerator linking
  respondentId: uuid('respondent_id').references(() => respondents.id),
  enumeratorId: text('enumerator_id'),

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
  submissionUidIdx: index('submissions_submission_uid_idx').on(table.submissionUid),
  // Index for form-based queries
  questionnaireFormIdIdx: index('submissions_questionnaire_form_id_idx').on(table.questionnaireFormId),
  // Index for processing queue
  processedIdx: index('submissions_processed_idx').on(table.processed),
  // Index for time-based queries
  submittedAtIdx: index('submissions_submitted_at_idx').on(table.submittedAt),
  // Story 3.4: Respondent + Enumerator indexes
  respondentIdIdx: index('idx_submissions_respondent_id').on(table.respondentId),
  enumeratorIdIdx: index('idx_submissions_enumerator_id').on(table.enumeratorId),
}));

export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
