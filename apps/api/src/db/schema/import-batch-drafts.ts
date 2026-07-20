/**
 * Import Batch Drafts Schema (Story 11-2)
 *
 * Ephemeral storage for the dry-run → confirm handshake. A `POST /imports/dry-run`
 * parses the uploaded file, stores the parsed result here, and returns a token
 * (`<draft_id>.<hmac>`). `POST /imports/confirm` validates the HMAC, loads the
 * stored parsed result (so confirm never re-parses and always matches exactly
 * what the operator reviewed), then commits the batch.
 *
 * Two guarantees this table provides:
 *  1. **Idempotency** — `used_at` makes a draft single-use; a double-clicked
 *     Confirm is rejected on the 2nd attempt.
 *  2. **Result binding** — `parsed_result` is the authoritative payload confirm
 *     ingests, guaranteeing confirm == the reviewed dry-run.
 *
 * Rows are short-lived (`expires_at` = created + 1h) and carry a hash of file
 * bytes (`file_hash`), not the bytes themselves — no PII-bearing file is
 * persisted at the draft stage. The parsed rows DO contain PII, so drafts are
 * pruned by `ImportService.pruneStaleDrafts()` — deleting any draft that is
 * past its TTL or already consumed (`used_at IS NOT NULL`) — which runs
 * opportunistically at the start of every dry-run. Drafts are also
 * super-admin-write-only. (`idx_import_batch_drafts_expires_at` keeps the prune
 * delete index-backed.)
 *
 * Per MEMORY.md key pattern: this file MUST NOT import from `@oslsr/types`
 * (drizzle-kit runs compiled JS and `@oslsr/types` has no `dist/`). The `source`
 * value mirrors `respondentSourceTypes` (canonical source: `./respondents.ts`).
 *
 * ⚠️ RAW SQL INSERT WARNING (same as import-batches.ts): `id` uses Drizzle's
 * `.$defaultFn(() => uuidv7())` which only fires on Drizzle-typed inserts.
 */

import { pgTable, uuid, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { users } from './users.js';

/**
 * Shape of the `parsed_result` JSONB payload — the full dry-run output the
 * confirm step replays. Mirrors `ParseResult` from the parser layer
 * (`apps/api/src/services/import/parsers/types.ts`); inlined here (no
 * cross-import into `@oslsr/types`) so drizzle-kit stays import-clean.
 */
export interface ImportDraftParsedResult {
  rows: Array<Record<string, unknown>>;
  failures: Array<{ rowIndex: number; reason: string; raw?: unknown }>;
  stats: {
    rowsParsed: number;
    rowsFailed: number;
  };
  detectedColumns: Record<string, string>;
}

export const importBatchDrafts = pgTable('import_batch_drafts', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // File identity — the dry-run token binds to this so confirm cannot be
  // replayed against a different file. SHA-256 hex of the uploaded bytes.
  fileHash: text('file_hash').notNull(),
  originalFilename: text('original_filename').notNull(),
  // Byte size carried from dry-run so confirm (which has no file buffer) can
  // populate import_batches.file_size_bytes without re-reading the file.
  fileSizeBytes: integer('file_size_bytes').notNull(),

  // Source + parser the operator chose at upload time.
  source: text('source').notNull(),
  parserUsed: text('parser_used').notNull(),
  sourceDescription: text('source_description'),

  // Optional admin-supplied column mapping (for `imported_other`).
  columnMapping: jsonb('column_mapping'),

  // The authoritative parsed payload confirm replays.
  parsedResult: jsonb('parsed_result').$type<ImportDraftParsedResult>().notNull(),

  // Single-use + TTL bookkeeping.
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),

  // Operator who created the draft (must equal the confirm caller).
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  idxImportDraftsFileHash: index('idx_import_batch_drafts_file_hash').on(table.fileHash),
  idxImportDraftsExpiresAt: index('idx_import_batch_drafts_expires_at').on(table.expiresAt),
}));

export type ImportBatchDraft = typeof importBatchDrafts.$inferSelect;
export type NewImportBatchDraft = typeof importBatchDrafts.$inferInsert;
