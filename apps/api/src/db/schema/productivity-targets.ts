/**
 * Productivity Targets Schema
 *
 * Configurable daily submission targets with temporal versioning.
 * System-wide default (lgaId = NULL) plus optional per-LGA overrides.
 *
 * Created in Story 5.6a (Supervisor Team Productivity Table).
 * Temporal versioning pattern: never update rows; close old (effectiveUntil)
 * and insert new (effectiveFrom) for full audit trail.
 *
 * @see fraud-thresholds.ts for similar temporal versioning pattern
 */

import { pgTable, uuid, text, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

export const productivityTargets = pgTable('productivity_targets', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // NULL = system-wide default; non-NULL = per-LGA override
  lgaId: text('lga_id'),

  // Daily submission target
  dailyTarget: integer('daily_target').notNull(),

  // Temporal versioning
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }), // NULL = currently active

  // Who created this target version
  createdBy: uuid('created_by'),

  // Standard timestamp
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Partial unique: only one active target per LGA (or system-wide default)
  // effectiveUntil IS NULL means "currently active"
  activeLgaTargetIdx: uniqueIndex('uq_productivity_targets_active_lga')
    .on(table.lgaId)
    .where(sql`effective_until IS NULL`),
}));

export type ProductivityTarget = typeof productivityTargets.$inferSelect;
export type NewProductivityTarget = typeof productivityTargets.$inferInsert;
