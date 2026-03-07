/**
 * Contact Reveals Schema
 *
 * Audit log for marketplace contact reveal operations. Each row represents one
 * authenticated user viewing a worker's PII (name, phone) via CAPTCHA-protected reveal.
 * Used for 50/user/24h rate-limit enforcement and analytics.
 *
 * Created in Story 7.4 (Authenticated Contact Reveal & CAPTCHA).
 *
 * NOTE: Do NOT import from @oslsr/types — drizzle-kit constraint.
 * NOTE: No FK references to marketplace_profiles or users — orphaned log entries
 *       are acceptable for audit purposes if the profile/user is later deleted.
 */

import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

export const contactReveals = pgTable('contact_reveals', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  viewerId: uuid('viewer_id').notNull(),
  profileId: uuid('profile_id').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  deviceFingerprint: text('device_fingerprint'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Btree index for rate limit query: COUNT WHERE viewer_id = $1 AND created_at > NOW() - 24h
  idxContactRevealsViewerCreated: index('idx_contact_reveals_viewer_created').on(table.viewerId, table.createdAt),
  // Index for "same device, multiple accounts" detection (Story 7-6)
  idxContactRevealsDeviceCreatedAt: index('idx_contact_reveals_device_created_at').on(table.deviceFingerprint, table.createdAt),
}));

export type ContactReveal = typeof contactReveals.$inferSelect;
export type NewContactReveal = typeof contactReveals.$inferInsert;
