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
  /*
   * Story 13-59 (review H2) — "has this person taken their artefacts?", asked
   * on the dashboard's hot path.
   *
   * Until this index, `audit_logs` was indexed on `created_at` ALONE, and every
   * read of it was either a whole-table report or the chain verifier. 13-59 is
   * the first code to query it by PRINCIPAL at request time: the first-login
   * modal is mounted on `DashboardLayout` (the only dashboard layout, which
   * hosts the citizen routes as well), and the operator's `?missingArtefacts`
   * filter runs two correlated NOT EXISTS against these same two columns per
   * candidate row. Unindexed, both are sequential scans of an append-only table
   * that grows for the life of the platform — on a 2GB box, days before a
   * public blast.
   *
   * Column order is (actor_id, action, created_at DESC) so it serves all three
   * shapes: the equality on both keys, the `MAX(created_at) GROUP BY action`
   * aggregate, and the `IN (…)` over the two download actions.
   *
   * ⚠️ DEPLOY NOTE: `db:push` creates this NON-concurrently, which takes a
   * SHARE lock on `audit_logs` for the duration of the build — blocking audit
   * WRITES, and every audited action with them. Sized for the current table it
   * is seconds, but if the table has grown, build it by hand first:
   *   CREATE INDEX CONCURRENTLY idx_audit_logs_actor_action
   *     ON audit_logs (actor_id, action, created_at DESC);
   * then let `db:push` find it already present and do nothing.
   */
  actorActionIdx: index('idx_audit_logs_actor_action').on(
    table.actorId,
    table.action,
    table.createdAt.desc(),
  ),
}));
