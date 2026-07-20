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
import { users } from './users.js';

export const respondentSourceTypes = [
  'enumerator',
  'public',
  'clerk',
  'imported_itf_supa',
  'imported_other',
  // Story 13-2 / Registry Data-Status Taxonomy (2026-07-01) — association-head proxy import. Rows
  // classify source=imported_association / completeness=core / verification=unverified_import, held
  // in an honest unverified stratum until a member-side check. Added foundationally (backward-compat,
  // no DDL — `source` is a plain-text drizzle enum) so provenance is honest from the first import.
  'imported_association',
] as const;
export type RespondentSource = typeof respondentSourceTypes[number];

export const respondentStatusTypes = [
  'active',
  'pending_nin_capture',
  'nin_unavailable',
  'imported_unverified',
  // Story 11-2 — batch-level soft-delete. A 14-day rollback of an import_batch
  // flips every one of its respondents to `rolled_back` (rows preserved for
  // audit; never truly deleted). Excluded from every downstream pipeline like
  // `imported_unverified`. CHECK constraint updated in lockstep by
  // `scripts/migrate-import-service-init.ts`.
  'rolled_back',
] as const;
export type RespondentStatus = typeof respondentStatusTypes[number];

/**
 * Story 11-2 — statuses excluded from NIN-keyed downstream pipelines
 * (fraud-detection, marketplace-extraction, partner-API `verify_nin`).
 *
 * `imported_unverified` rows are low-trust secondary-data imports that must not
 * masquerade as field-verified; `rolled_back` rows are soft-deleted batches.
 * Both are held out of the pipelines. The PRIMARY gate is by-construction — the
 * importer never enqueues those workers — but the workers also consult this set
 * defensively so a stray enqueue can never leak an import into fraud/marketplace.
 *
 * NOTE: `pending_nin_capture` / `nin_unavailable` are NOT excluded — those are
 * legitimate field respondents who merely lack a NIN and still earn marketplace
 * profiles once consented.
 */
export const PIPELINE_EXCLUDED_STATUSES: readonly RespondentStatus[] = [
  'imported_unverified',
  'rolled_back',
];

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
  /**
   * Story 9-55 — captured parent/guardian consent for an under-15 (minor)
   * registrant, with the ILO C138 Art.6 supervised-apprentice attestation.
   * Present ONLY when the registrant's computed age is < 15 (data minimisation,
   * AC6.1) — never set for adults. The respondent withdrawal/erasure path clears
   * the whole `metadata` object, so this PII is covered by existing erasure.
   *
   * Shape mirrors `GuardianData` in `@oslsr/utils/minor-guardian` (the canonical
   * source). Inlined here rather than imported: drizzle-kit runs compiled JS and
   * the workspace packages have no `dist/`, so schema files must stay
   * import-free of `@oslsr/types`/`@oslsr/utils` (project memory key pattern).
   */
  guardian?: {
    name: string;
    relationship: string;
    phone: string;
    consent: string;
    isSupervisedApprentice: string;
    apprenticeshipDetails?: string;
  };
  /**
   * Story 9-58 (review L1) — ISO timestamp the proactive registration-
   * confirmation email was dispatched for an enumerator/clerk-entered
   * respondent who supplied an email. Set after dispatch; the processor only
   * sends when it is ABSENT, making the idempotency guarantee explicit rather
   * than emergent from the `_isNew` flag.
   */
  confirmation_email_sent_at?: string;
  /**
   * Story 13-12 — ISO timestamp the evergreen thank-you/referral email was dispatched (or the
   * one-off 13-11 blast stamped it). Send-once guard: the auto-send in submission-processing only
   * fires when this is ABSENT. Mirrors `confirmation_email_sent_at`. Set via JSONB merge after a
   * confirmed dispatch; covered by the metadata-clearing erasure path.
   */
  thankyou_referral_sent_at?: string;
  /**
   * Story 9-38 — set `true` when the post-submit passwordless `public_user`
   * provisioning threw (non-fatal to the wizard submit, per AC#4). Marks the
   * row for the operator-gated `_backfill-wizard-public-users.ts` recovery so
   * the registrant still gets an account + reachable magic-link login. Cleared
   * implicitly once `respondents.user_id` is set by the backfill.
   */
  account_provision_failed?: boolean;
  /**
   * Story 9-38 — set `true` when the passwordless `public_user` WAS created but
   * the subsequent `respondents.user_id` link-write threw (distinct from
   * `account_provision_failed`, where no account exists). The account is fine,
   * only unlinked; the same backfill (candidate set `user_id IS NULL`) re-links
   * it idempotently. Kept separate so an operator triaging the flag isn't
   * misled about which step failed.
   */
  account_link_failed?: boolean;
  /**
   * Story 11-2 — secondary-data import provenance for fields the imported source
   * carried but `respondents` has no column for (email, trade/profession,
   * gender, town, age, experience, the source's original full-name string).
   * Preserved here so nothing is lost at ingest; a later promotion path
   * (Story 13-2's submission-write contract) can surface them. Covered by the
   * metadata-clearing erasure path. Never a dedup key — dedup is phone/NIN only.
   */
  imported_email?: string;
  import_extra?: Record<string, string>;
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

  // Story 9-38 — durable respondent↔account link. Set when the public wizard
  // provisions a passwordless `public_user` at submit time (and by the
  // operator-gated backfill for pre-9-38 respondents). Nullable: enumerator /
  // clerk / imported rows have no account, and provisioning is non-fatal so a
  // wizard row can briefly exist unlinked if account creation throws.
  // `ON DELETE SET NULL` — erasing an account must NOT cascade-delete the
  // respondent's survey data (9-26 unified-ingestion data-integrity lesson).
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

  // Lifecycle status (Story 11-1)
  status: text('status', { enum: respondentStatusTypes }).notNull().default('active'),

  // Story 9-58 (Deliverable B) — human-friendly per-respondent reference code
  // (`OSL-<YYYY>-<6 base32, no I/L/O/U>`). Generated at the uniform
  // respondent-creation chokepoint on EVERY channel (wizard sync path +
  // `findOrCreateRespondent` async path) so field-registered respondents also
  // get something quotable. Per-respondent (stable per person, survives
  // supplemental submissions) — NOT per-submission. Nullable because existing
  // rows are populated lazily by the one-shot backfill runner
  // (`scripts/_backfill-reference-code.ts`). Uniqueness is enforced by a UNIQUE
  // index created in `scripts/migrate-reference-code-init.ts` (Drizzle/db:push
  // creates the column; the unique index lives in the init-runner alongside the
  // other special indexes — see the GIN-trigram note below).
  referenceCode: text('reference_code'),

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
  // Story 9-38 — fast respondent-by-account lookup (read-model + 9-32 consumers).
  idxRespondentsUserId: index('idx_respondents_user_id').on(table.userId),
  // Story 9-56: GIN trigram indexes on first_name / last_name / phone_number / nin
  // (idx_respondents_*_trgm) power the scale-safe registry search Phase-1
  // resolution (ILIKE/LIKE → BitmapOr index scans). Drizzle cannot express GIN
  // trigram indexes inline, so they live in scripts/migrate-registry-search-indexes-init.ts.
}));

export type Respondent = typeof respondents.$inferSelect;
export type NewRespondent = typeof respondents.$inferInsert;
