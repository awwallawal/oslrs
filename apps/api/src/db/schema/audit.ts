import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { users } from './users.js';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  actorId: uuid('actor_id').references(() => users.id), // Nullable if system action
  action: text('action').notNull(),
  targetResource: text('target_resource'), // e.g. 'users'
  targetId: uuid('target_id'),
  details: jsonb('details'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  // SHA-256 hash chain for tamper detection (Story 6-1)
  // Nullable in Drizzle schema to support migration (existing records backfilled via migrate-audit-immutable.ts).
  // Application code always provides a hash on insert; NOT NULL enforced after backfill.
  hash: text('hash'),
  previousHash: text('previous_hash'), // NULL for genesis record
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index('idx_audit_logs_created_at').on(table.createdAt),
}));
