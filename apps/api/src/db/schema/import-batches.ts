/**
 * Import Batches Schema (Story 11-1)
 *
 * Tracks every secondary-data ingestion batch (PDF / CSV / XLSX).
 * Records provenance (file hash, parser, lawful basis), counts (parsed / inserted /
 * matched / skipped / failed), and lifecycle status (active / rolled_back).
 *
 * Per MEMORY.md key pattern: this file MUST NOT import from `@oslsr/types`
 * (drizzle-kit runs compiled JS and `@oslsr/types` has no `dist/`). Inline any
 * enum constants locally with a comment noting the canonical source.
 *
 * Source enum (`source` column) intentionally mirrors `respondentSourceTypes`
 * from `./respondents.ts` — duplicated here as a string literal union since
 * we cannot cross-import in this file. Canonical source: `respondents.ts`.
 *
 * ⚠️ M2 (code-review 2026-05-03) — RAW SQL INSERT WARNING:
 * The `id` column uses Drizzle's `.$defaultFn(() => uuidv7())` which ONLY fires
 * on Drizzle-typed inserts (`db.insert(importBatches).values({...})`). Raw SQL
 * inserts via `db.execute(sql\`INSERT INTO import_batches ...\`)` or `psql`
 * MUST provide an explicit `id` UUID, otherwise the insert fails with
 * `23502 not_null_violation` on the PRIMARY KEY column. Same applies to
 * `created_at` / `updated_at` style columns across the codebase — the project
 * pattern is app-side defaults via `$defaultFn`, not DB-side defaults via
 * `gen_random_uuid()`. If you need DB-side defaults (admin tooling, future
 * migrations), add `default(sql\`gen_random_uuid()\`)` explicitly per column.
 *
 * Status CHECK constraint:
 * The `status` column's `text('status', { enum: importBatchStatusTypes })` is
 * a Drizzle TypeScript hint only — it does NOT generate a Postgres CHECK. The
 * runtime CHECK constraint (`import_batches_status_check`) lives in
 * `apps/api/scripts/migrate-multi-source-registry-init.ts` and runs idempotently
 * on every deploy. M1 (code-review 2026-05-03) added the CHECK to close the
 * inconsistency with `respondents_status_check`.
 */

import { pgTable, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { users } from './users.js';

// Status lifecycle for an import batch — append-only on rollback.
export const importBatchStatusTypes = ['active', 'rolled_back'] as const;
export type ImportBatchStatus = typeof importBatchStatusTypes[number];

/**
 * Lawful basis under NDPA Article 6 — populated at ingest time by the operator.
 * Common values: `ndpa_6_1_e` (public interest), `ndpa_6_1_f` (legitimate interest),
 * `ndpa_6_1_a` (consent), etc. Free-text TEXT column rather than enum so that
 * legal/compliance can extend without a migration; the operator-facing UI
 * (Story 11-3) presents a curated dropdown.
 */
export const importBatches = pgTable('import_batches', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // Source tracking — must match a value from `respondentSourceTypes`
  // (canonical source: ./respondents.ts)
  source: text('source').notNull(),
  sourceDescription: text('source_description'),

  // File identity + integrity
  originalFilename: text('original_filename').notNull(),
  fileHash: text('file_hash').notNull().unique(), // SHA-256 hex; prevents duplicate uploads
  fileSizeBytes: integer('file_size_bytes').notNull(),
  parserUsed: text('parser_used').notNull(), // 'pdf_tabular' | 'csv' | 'xlsx'

  // Ingest counters (populated by Story 11-2 import service)
  rowsParsed: integer('rows_parsed').notNull().default(0),
  rowsInserted: integer('rows_inserted').notNull().default(0),
  rowsMatchedExisting: integer('rows_matched_existing').notNull().default(0),
  rowsSkipped: integer('rows_skipped').notNull().default(0),
  rowsFailed: integer('rows_failed').notNull().default(0),
  failureReport: jsonb('failure_report'),

  // Compliance trail
  lawfulBasis: text('lawful_basis').notNull(),
  lawfulBasisNote: text('lawful_basis_note'),

  // Operator
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),

  // Lifecycle (active or rolled_back via Story 11-2's rollback flow)
  status: text('status', { enum: importBatchStatusTypes }).notNull().default('active'),
}, (table) => ({
  idxImportBatchesSource: index('idx_import_batches_source').on(table.source),
  idxImportBatchesStatus: index('idx_import_batches_status').on(table.status),
  idxImportBatchesUploadedBy: index('idx_import_batches_uploaded_by').on(table.uploadedBy),
}));

export type ImportBatch = typeof importBatches.$inferSelect;
export type NewImportBatch = typeof importBatches.$inferInsert;
