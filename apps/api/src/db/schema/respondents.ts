/**
 * Respondents Schema
 *
 * Stores extracted respondent identity from processed submissions.
 * Created in Story 3.4 (Idempotent Submission Ingestion).
 *
 * Key design:
 * - NIN is UNIQUE for deduplication across multiple submissions
 * - source tracks how the respondent was first registered
 * - submitterId tracks who first submitted data for this respondent
 */

import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

export const respondentSourceTypes = ['enumerator', 'public', 'clerk'] as const;
export type RespondentSource = typeof respondentSourceTypes[number];

export const respondents = pgTable('respondents', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // Identity — NIN is the unique key for deduplication
  nin: text('nin').unique().notNull(),
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

  // Standard timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // NIN unique constraint (via .unique()) already creates an implicit index — no additional index needed
  idxRespondentsLgaId: index('idx_respondents_lga_id').on(table.lgaId),
  idxRespondentsCreatedAt: index('idx_respondents_created_at').on(table.createdAt),
}));

export type Respondent = typeof respondents.$inferSelect;
export type NewRespondent = typeof respondents.$inferInsert;
