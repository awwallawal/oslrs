import { pgTable, uuid, text, timestamp, integer, index, unique, customType } from 'drizzle-orm/pg-core';

/**
 * Custom bytea column type for storing binary data (e.g., file blobs).
 * Uses hex encoding for the pg driver; returns Buffer on read.
 */
const bytea = customType<{ data: Buffer; driverData: string }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value: Buffer): string {
    // pg driver needs hex-escaped string for bytea insertion
    return '\\x' + value.toString('hex');
  },
  fromDriver(value: string | Buffer): Buffer {
    if (Buffer.isBuffer(value)) return value;
    // pg returns bytea as hex string prefixed with \x
    if (typeof value === 'string' && value.startsWith('\\x')) {
      return Buffer.from(value.slice(2), 'hex');
    }
    return Buffer.from(value as string);
  },
});
import { uuidv7 } from 'uuidv7';
import { users } from './users.js';

/**
 * Form status lifecycle:
 * - draft: Initial upload, not deployed to ODK
 * - published: Pushed to ODK Central (Story 2.2), accepting submissions (ODK state: 'open')
 * - closing: Unpublished - no new submissions, data accessible (ODK state: 'closing')
 * - deprecated: Replaced by newer version, still visible
 * - archived: Hidden from active views (ODK state: 'closed')
 */
export const questionnaireFormStatus = ['draft', 'published', 'closing', 'deprecated', 'archived'] as const;
export type QuestionnaireFormStatus = typeof questionnaireFormStatus[number];

/**
 * Questionnaire Forms table
 * Stores form metadata including version and status.
 * Each upload creates a new record - form_id + version must be unique.
 */
export const questionnaireForms = pgTable('questionnaire_forms', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // Form identification - form_id is the logical identifier, version differentiates iterations
  formId: text('form_id').notNull(), // e.g., "oslsr_master_v3"
  version: text('version').notNull(), // semver: "1.0.0", "1.0.1", etc.
  title: text('title').notNull(), // e.g., "OSLSR Labour & Skills Registry Survey"

  // Status lifecycle
  status: text('status', { enum: questionnaireFormStatus }).notNull().default('draft'),

  // File integrity
  fileHash: text('file_hash').notNull(), // SHA-256 hash for duplicate detection
  fileName: text('file_name').notNull(), // Original filename
  fileSize: integer('file_size').notNull(), // File size in bytes
  mimeType: text('mime_type').notNull(), // application/vnd.openxmlformats-officedocument.spreadsheetml.sheet or application/xml

  // Validation results stored as JSON
  validationWarnings: text('validation_warnings'), // JSON array of warning objects

  // ODK Central deployment fields (Story 2.2)
  odkXmlFormId: text('odk_xml_form_id'), // ODK Central's xmlFormId after deployment
  odkPublishedAt: timestamp('odk_published_at', { withTimezone: true }), // Timestamp when published to ODK Central

  // Audit fields
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Indexes for common queries
  formIdIdx: index('idx_forms_form_id').on(table.formId),
  statusIdx: index('idx_forms_status').on(table.status),
  fileHashIdx: index('idx_forms_file_hash').on(table.fileHash),

  // Unique constraint: form_id + version must be unique
  formIdVersionUnique: unique('uq_forms_form_id_version').on(table.formId, table.version),
}));

/**
 * Questionnaire Files table
 * Stores the raw file blob for each form version.
 * Separate table to keep form metadata queries fast.
 */
export const questionnaireFiles = pgTable('questionnaire_files', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // Foreign key to form
  formId: uuid('form_id').notNull().references(() => questionnaireForms.id, { onDelete: 'cascade' }),

  // File content stored as bytea (PostgreSQL binary) — no base64 overhead
  fileBlob: bytea('file_blob').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Questionnaire Versions table
 * Tracks version history with change notes for audit purposes.
 * Links to the form record for detailed history view.
 */
export const questionnaireVersions = pgTable('questionnaire_versions', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // Logical form identifier (not FK - tracks history across form records)
  formIdLogical: text('form_id_logical').notNull(), // e.g., "oslsr_master_v3"
  version: text('version').notNull(), // semver version

  // Reference to the actual form record
  questionnaireFormId: uuid('questionnaire_form_id').notNull().references(() => questionnaireForms.id, { onDelete: 'cascade' }),

  // Change tracking
  changeNotes: text('change_notes'), // Optional notes about what changed

  // Audit fields
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  formIdLogicalIdx: index('idx_versions_form_id_logical').on(table.formIdLogical),
}));
