/**
 * Marketplace Profiles Schema
 *
 * Anonymous worker profiles extracted from survey submissions for public marketplace search.
 * One profile per respondent (UNIQUE on respondent_id). PII never stored here — lives on respondents table.
 *
 * Created in Story 7.1 (Marketplace Data Extraction Worker).
 * Design source: prep-4 (marketplace data model spike).
 *
 * NOTE: Do NOT import from @oslsr/types — drizzle-kit constraint.
 */

import { pgTable, uuid, text, timestamp, boolean, index, customType } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { respondents } from './respondents.js';

/**
 * Custom tsvector type for Drizzle — PostgreSQL full-text search vector.
 * Drizzle does not have a built-in tsvector type.
 */
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const marketplaceProfiles = pgTable('marketplace_profiles', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // One profile per respondent (UNIQUE constraint)
  // ON DELETE RESTRICT: respondent deletion must be handled explicitly (7-year retention)
  respondentId: uuid('respondent_id').notNull().unique().references(() => respondents.id, { onDelete: 'restrict' }),

  // Searchable fields (anonymous tier — always visible)
  profession: text('profession'),
  skills: text('skills'),
  // NOTE: No FK constraint — respondents.lgaId has no FK either.
  // Invalid LGA codes handled gracefully: worker validates against lgas table.
  lgaId: text('lga_id'),
  lgaName: text('lga_name'),
  experienceLevel: text('experience_level'),

  // Government verification badge
  verifiedBadge: boolean('verified_badge').notNull().default(false),

  // Self-enrichment fields (editable via edit token — Story 7-5)
  bio: text('bio'),
  portfolioUrl: text('portfolio_url'),

  // Edit token for self-service profile enrichment
  editToken: text('edit_token'),
  editTokenExpiresAt: timestamp('edit_token_expires_at', { withTimezone: true }),

  // Consent tier — controls whether PII (name, phone) is revealable
  consentEnriched: boolean('consent_enriched').notNull().default(false),

  // Full-text search vector (auto-updated by PostgreSQL trigger)
  searchVector: tsvector('search_vector'),

  // Standard timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // GIN index for full-text search — created via custom-sql/marketplace-trigger.sql
  // (Drizzle 0.30.x does not support .using('gin') on index builder)
  // Filter indexes
  idxMarketplaceLgaId: index('idx_marketplace_lga_id').on(table.lgaId),
  idxMarketplaceProfession: index('idx_marketplace_profession').on(table.profession),
  // Verified badge filter
  idxMarketplaceVerifiedBadge: index('idx_marketplace_verified_badge').on(table.verifiedBadge),
}));

export type MarketplaceProfile = typeof marketplaceProfiles.$inferSelect;
export type NewMarketplaceProfile = typeof marketplaceProfiles.$inferInsert;
