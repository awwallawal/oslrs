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
 * Currently records input-normalisation warnings, back-fill failure flags,
 * and the pending-NIN reminder state (Story 9-12). Extend as new metadata
 * categories are added; treat as merge-on-write.
 */
export interface RespondentMetadata {
  normalisation_warnings?: string[];
  backfill_failed?: true;
  /**
   * Story 9-12 — reminder cadence bookkeeping for `pending_nin_capture`
   * respondents. The keys are ISO timestamps; the worker uses them to
   * de-dupe milestone fan-out and to recompute schedule offsets after a
   * deferral. Kept open-shape (Record<string, unknown>) so the worker can
   * stash adapter-specific metadata (last destination, etc.) without
   * forcing schema churn.
   */
  reminder_state?: Record<string, unknown>;
  /**
   * Story 9-12 D5 — optional free-text reason captured at deferral time.
   * Auto-set to a sentinel for the public wizard (`public_wizard_user_self_deferred`);
   * collected via the enumerator/clerk inline NIN-help-hint when those surfaces ship.
   * Persisted on the respondent row so the anti-abuse aggregate (D6) can flag
   * enumerators with a high "no reason provided" rate.
   */
  defer_reason_nin?: string;
  /**
   * Story 9-26 Part B — marks the 43 wizard respondents created in the
   * 2026-05-14 → 2026-05-19 data-loss window, whose Step 4 `questionnaireResponses`
   * (+ `gender`, `authChoice`) were silently dropped by the pre-9-26 wizard
   * handler. The data is unrecoverable (request bodies were never logged); this
   * marker is an NDPA-clean record of what we know we don't have, set by the
   * one-shot `_backfill-wizard-questionnaire-loss.ts` script.
   */
  questionnaire_data_lost?: boolean;
  /** ISO timestamp the data-loss marker was applied (Story 9-26 Part B). */
  lost_at?: string;
  /**
   * Whether this lost-data respondent is eligible for a recovery outreach.
   * Seeded `false` by Part B (their answers can't be recovered — only future
   * re-submission would help; Cohort A recovery is handled separately by
   * Story 9-28 Path B). Kept on the row for any later disposition pass.
   */
  recovery_email_eligible?: boolean;
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
