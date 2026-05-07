/**
 * prep-settings-landing-and-feature-flags — generic key-value system settings.
 *
 * Per AC#1: NO indexes beyond primary key (table holds ~10-50 rows; PK lookup
 * is the only access pattern). NO @oslsr/types import (drizzle-kit constraint
 * — see MEMORY.md "Key Patterns").
 *
 * Storage shape: key (text PK) + value (jsonb) + description + updated_by FK
 * to users(id). Read path is `lib/settings.ts:getSetting<T>(key)` Redis-cached
 * for 60s; write path is `services/settings.service.ts:setSetting(...)`
 * audit-logged via SETTINGS_FLIPPED action.
 */
import { pgTable, text, jsonb, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedBy: uuid('updated_by').notNull().references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type NewSystemSetting = typeof systemSettings.$inferInsert;
