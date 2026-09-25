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

import { pgTable, uuid, text, timestamp, jsonb, index, boolean, doublePrecision, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { respondents } from './respondents.js';

/**
 * Ingestion source type
 */
export const ingestionSourceTypes = ['webapp', 'mobile', 'webhook', 'backfill', 'manual', 'public', 'enumerator', 'clerk'] as const;
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

  // Story 13-73 AC5 — THE FORM IDENTITY, SNAPSHOT AT INSERT.
  // `questionnaire_forms.form_id` + `.version` of the form this submission was
  // answered against, copied when the row is written. Until now the form row was
  // the ONLY record of what a submission was answered against, and deleting it
  // (283 rows across 5 form ids, measured 2026-09-18) made them uninterpretable.
  // With the logical id + version, the schema can be matched to a backup or a
  // re-upload even if the row id is gone — 13-34's standing lesson: pin to
  // form_id + version, never a row id.
  // Nullable and NOT back-filled: legacy rows' schemas are what is missing, and a
  // sentinel `questionnaire_form_id` (`self-edit`, `import:<source>`, …) names a
  // channel rather than a form, so it has no identity to snapshot.
  formIdLogical: text('form_id_logical'),
  formVersion: text('form_version'),

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

  // Story 13-71 AC5: GPS accuracy radius in METRES, as the browser reported it
  // (`GeolocationCoordinates.accuracy`). `GeopointInput` has always captured and
  // displayed this and then thrown it away at the payload boundary.
  // Nullable: legacy rows have none, and a row satisfying the requirement with a
  // reason instead of coordinates has none either.
  // Without it a 2 km network fix and a 5 m satellite fix are indistinguishable,
  // so base-mapping cannot tell a base from a neighbourhood — and the
  // "accuracy > 50 m" secondary signal that gps-clustering.heuristic.ts
  // documents as blocked is blocked on precisely this column.
  gpsAccuracy: doublePrecision('gps_accuracy'),

  // Story 13-71 AC6: WHY a submission carries no coordinates, derived from
  // GeolocationPositionError.code on the client.
  // A COLUMN and not just a raw_data key, because the entire point is to COUNT
  // it per enumerator in the weekly ops read, and a reason buried in jsonb
  // cannot be grouped without a scan.
  // Canonical vocabulary: `gpsUnavailableReasons` in @oslsr/types
  // (packages/types/src/native-form.ts). Stored as free text here because a
  // drizzle schema file must NOT import @oslsr/types; the API validates the
  // value against that enum before it ever reaches this column.
  gpsUnavailableReason: text('gps_unavailable_reason'),

  // Story 4.3: Completion time for speed-run fraud detection
  // Computed as (submittedAt - formStartedAt) in seconds on the client
  // Nullable — legacy submissions won't have this; heuristic uses bootstrap fallback
  completionTimeSeconds: integer('completion_time_seconds'),

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
  // Submitter index — supports getMySubmissionCounts and getSubmissionStatuses queries
  submitterIdIdx: index('idx_submissions_submitter_id').on(table.submitterId),
  // Story 3.4: Respondent + Enumerator indexes
  respondentIdIdx: index('idx_submissions_respondent_id').on(table.respondentId),
  enumeratorIdIdx: index('idx_submissions_enumerator_id').on(table.enumeratorId),
  // Story 11-1: composite for productivity aggregations + lineage queries.
  // Story 11-1 AC#11 EXPLAIN audit found Q4 (Epic 5.6a productivity grouping)
  // tripped the cost-<10K threshold at 1M submissions; this composite collapses
  // scan + sort + group into a streaming aggregate. Declared here so `db:push`
  // preserves it across local-dev re-runs (the migrate-multi-source-registry-init
  // runner also creates it idempotently as defense-in-depth for first-deploy
  // ordering).
  enumeratorSubmittedAtIdx: index('idx_submissions_enumerator_submitted_at').on(table.enumeratorId, table.submittedAt),
  /**
   * Story 13-57 AC3 (added by code review 2026-08-14, L2) — the unprocessable
   * scan, which now runs on every ops-snapshot cache miss and twice a day for
   * the digest.
   *
   * PARTIAL, matching `getIngestionHealth`'s own WHERE clause exactly
   * (`processing_error IS NOT NULL OR processed = false`), so the index holds
   * only the handful of rows that are ever findings rather than a copy of the
   * whole table. Ordered on `ingested_at` because that is both the age filter
   * and the `min()` the query takes. Free today at 284 rows — declared now
   * because this story's own premise is that the jingle multiplies the traffic
   * this seq-scans.
   */
  unprocessableIdx: index('idx_submissions_unprocessable')
    .on(table.ingestedAt)
    .where(sql`${table.processingError} IS NOT NULL OR ${table.processed} = false`),
  // Story 9-56: expression index idx_submissions_lower_email on
  // lower(raw_data->>'email') powers the registry-search email resolution
  // (exact case-insensitive). Drizzle cannot express expression indexes inline,
  // so it lives in scripts/migrate-registry-search-indexes-init.ts.
}));

export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
