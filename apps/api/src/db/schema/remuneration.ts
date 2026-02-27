/**
 * Remuneration Schema — Payment Batches, Records, and Files
 *
 * Story 6.4: Staff remuneration bulk recording.
 * Temporal versioning pattern: never update payment_records rows; close old
 * (effectiveUntil) and insert new (effectiveFrom) for full audit trail.
 *
 * Amount storage: all amounts in kobo (1 Naira = 100 kobo) as integers.
 *
 * @see productivity-targets.ts for similar temporal versioning pattern
 */

import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

// Inline enum values — Drizzle schema files must NOT import from @oslsr/types
// Canonical source: packages/types/src/constants.ts
const PAYMENT_BATCH_STATUS = ['active', 'corrected'] as const;
const PAYMENT_RECORD_STATUS = ['active', 'disputed', 'corrected'] as const;
const PAYMENT_FILE_ENTITY_TYPE = ['receipt', 'dispute_evidence'] as const;

/**
 * payment_batches — one per bulk recording action
 */
export const paymentBatches = pgTable('payment_batches', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  trancheNumber: integer('tranche_number').notNull(),
  trancheName: text('tranche_name').notNull(),
  description: text('description'),
  bankReference: text('bank_reference'),
  receiptFileId: uuid('receipt_file_id'), // FK → payment_files
  lgaId: uuid('lga_id'), // scope filter (NULL = all LGAs)
  roleFilter: text('role_filter'), // 'enumerator', 'supervisor', etc.
  staffCount: integer('staff_count').notNull(),
  totalAmount: integer('total_amount').notNull(), // in kobo
  recordedBy: uuid('recorded_by').notNull(), // FK → users (admin)
  status: text('status', { enum: PAYMENT_BATCH_STATUS }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  recordedByIdx: index('idx_payment_batches_recorded_by').on(table.recordedBy),
  createdAtIdx: index('idx_payment_batches_created_at').on(table.createdAt),
}));

/**
 * payment_records — one per staff member per batch (temporal versioning)
 */
export const paymentRecords = pgTable('payment_records', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  batchId: uuid('batch_id').notNull(), // FK → payment_batches
  userId: uuid('user_id').notNull(), // FK → users
  amount: integer('amount').notNull(), // in kobo
  status: text('status', { enum: PAYMENT_RECORD_STATUS }).notNull().default('active'),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }), // NULL = current version
  createdBy: uuid('created_by').notNull(), // FK → users (admin)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Partial unique: only one active record per staff per batch
  activeBatchRecordIdx: uniqueIndex('uq_payment_records_active_batch_user')
    .on(table.userId, table.batchId)
    .where(sql`effective_until IS NULL`),
  batchIdIdx: index('idx_payment_records_batch_id').on(table.batchId),
  userHistoryIdx: index('idx_payment_records_user_history').on(table.userId, table.effectiveUntil),
}));

/**
 * payment_files — receipt uploads and dispute evidence
 */
export const paymentFiles = pgTable('payment_files', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  entityType: text('entity_type', { enum: PAYMENT_FILE_ENTITY_TYPE }).notNull(),
  entityId: uuid('entity_id').notNull(), // FK → payment_batches or payment_disputes
  originalFilename: text('original_filename').notNull(),
  s3Key: text('s3_key').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  uploadedBy: uuid('uploaded_by').notNull(), // FK → users
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  entityIdIdx: index('idx_payment_files_entity_id').on(table.entityId),
}));

export type PaymentBatch = typeof paymentBatches.$inferSelect;
export type NewPaymentBatch = typeof paymentBatches.$inferInsert;
export type PaymentRecord = typeof paymentRecords.$inferSelect;
export type NewPaymentRecord = typeof paymentRecords.$inferInsert;
export type PaymentFile = typeof paymentFiles.$inferSelect;
export type NewPaymentFile = typeof paymentFiles.$inferInsert;
