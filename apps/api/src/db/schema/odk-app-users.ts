import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { users } from './users.js';

/**
 * ODK App Users table
 * Stores ODK Central App User records linked to staff members.
 * Tokens are encrypted using AES-256-GCM (per ADR-006 defense-in-depth).
 */
export const odkAppUsers = pgTable('odk_app_users', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  userId: uuid('user_id').notNull().unique().references(() => users.id),
  odkAppUserId: integer('odk_app_user_id').notNull(), // ODK Central's internal ID
  displayName: text('display_name').notNull(),
  encryptedToken: text('encrypted_token').notNull(), // AES-256-GCM encrypted
  tokenIv: text('token_iv').notNull(), // Initialization vector for decryption
  odkProjectId: integer('odk_project_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
