/**
 * Respondents Schema
 *
 * Stores extracted respondent identity from processed submissions.
 * Created in Story 3.4 (Idempotent Submission Ingestion).
 * Multi-source (Story 11-1): NIN is now nullable; provenance + status columns added.
 *
 * Key design (post 11-1):
 * - NIN is nullable; uniqueness enforced via partial unique index where NIN IS NOT NULL
 *   (FR21 "reject duplicate NIN" still applies to all NIN-carrying rows)
 * - status tracks lifecycle: active | pending_nin_capture | nin_unavailable | imported_unverified
 * - source has been extended to include imported_itf_supa, imported_other for Epic 11 ingestion
 * - import_batch_id + external_reference_id + imported_at link rows back to their ingest provenance
 */

import { pgTable, uuid, text, timestamp, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { importBatches } from './import-batches.js';

export const respondentSourceTypes = [
  'enumerator',
  'public',
  'clerk',
  'imported_itf_supa',
  'imported_other',
] as const;
export type RespondentSource = typeof respondentSourceTypes[number];

export const respondentStatusTypes = [
  'active',
  'pending_nin_capture',
  'nin_unavailable',
  'imported_unverified',
] as const;
export type RespondentStatus = typeof respondentStatusTypes[number];

/**
 * Shape of the `respondents.metadata` JSONB column.
 * Currently records input-normalisation warnings and back-fill failure flags.
 * Extend as new metadata categories are added; treat as merge-on-write.
 */
export interface RespondentMetadata {
  normalisation_warnings?: string[];
  backfill_failed?: true;
}

export const respondents = pgTable('respondents', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // Identity — NIN is nullable post Story 11-1; partial unique index in migration
  // enforces uniqueness only for non-null values (FR21 scoped, not removed).
  nin: text('nin'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  dateOfBirth: text('date_of_birth'),
  phoneNumber: text('phone_number'),
  lgaId: text('lga_id'),

  // Consent flags
  consentMarketplace: boolean('consent_marketplace').notNull().default(false),
  consentEnriched: boolean('consent_enriched').notNull().default(false),

  // Source tracking
  source: text('source', { enum: respondentSourceTypes }).notNull().default('enumerator'),
  submitterId: text('submitter_id'), // First submitter user ID

  // Lifecycle status (Story 11-1)
  status: text('status', { enum: respondentStatusTypes }).notNull().default('active'),

  // Provenance (Story 11-1) — populated for imported rows; null for field-surveyed rows
  externalReferenceId: text('external_reference_id'),
  importBatchId: uuid('import_batch_id').references(() => importBatches.id, { onDelete: 'set null' }),
  importedAt: timestamp('imported_at', { withTimezone: true }),

  // Free-form metadata — currently used to surface input-normalisation warnings
  // (`normalisation_warnings: string[]`) and back-fill failure flags
  // (`backfill_failed: true`). Pattern matches audit.ts:11, fraud-detections.ts:69-73.
  metadata: jsonb('metadata').$type<RespondentMetadata>(),

  // Standard timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Pre-existing indexes preserved
  idxRespondentsLgaId: index('idx_respondents_lga_id').on(table.lgaId),
  idxRespondentsCreatedAt: index('idx_respondents_created_at').on(table.createdAt),
  // New indexes (Story 11-1) — registry filter / pending-NIN follow-up / batch joins
  idxRespondentsStatus: index('idx_respondents_status').on(table.status),
  idxRespondentsSource: index('idx_respondents_source').on(table.source),
  idxRespondentsImportBatch: index('idx_respondents_import_batch').on(table.importBatchId),
}));

export type Respondent = typeof respondents.$inferSelect;
export type NewRespondent = typeof respondents.$inferInsert;
