import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { users } from './users.js';
import { apiConsumers } from './api-consumers.js';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  // Nullable. Set when the principal is a human user; NULL for consumer or system events.
  actorId: uuid('actor_id').references(() => users.id),
  // Story 9-11 (Schema Down Payment) — adds consumer principal type per
  // Architecture Decision 5.4 (audit-log principal dualism). Set when the
  // principal is a machine consumer (third-party MDA partner); NULL for user
  // or system events. The principal-exclusive CHECK
  // ((actor_id IS NULL) OR (consumer_id IS NULL)) is enforced by
  // migrate-audit-principal-dualism-init.ts (Drizzle 0.45 cannot express CHECK
  // constraints inline). ON DELETE SET NULL preserves the audit record if a
  // consumer is hard-deleted (rare; soft-delete via status='terminated' is
  // the canonical path).
  consumerId: uuid('consumer_id').references(() => apiConsumers.id, {
    onDelete: 'set null',
  }),
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
