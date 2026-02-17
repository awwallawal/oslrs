/**
 * Team Assignments Schema
 *
 * Maps supervisors to enumerators for team-based field oversight.
 * Created in prep-8 (Supervisor Team Assignment Schema).
 * Used by Story 4.1 (Supervisor Team Dashboard), Story 4.2 (In-App Team Messaging).
 *
 * Design:
 * - Soft delete via `unassigned_at` (NULL = active assignment)
 * - Partial unique index prevents double-assignment of active enumerators
 * - Denormalized `lga_id` avoids join for geographic queries
 * - LGA fallback in resolution service provides backward compatibility
 */

import { pgTable, uuid, timestamp, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { users } from './users.js';
import { lgas } from './lgas.js';

export const teamAssignments = pgTable('team_assignments', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // Supervisor reference (must be a user with supervisor role)
  supervisorId: uuid('supervisor_id').notNull().references(() => users.id),

  // Enumerator reference (must be a user with enumerator role)
  enumeratorId: uuid('enumerator_id').notNull().references(() => users.id),

  // Denormalized LGA for geographic query performance
  lgaId: uuid('lga_id').notNull().references(() => lgas.id),

  // Assignment lifecycle
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  unassignedAt: timestamp('unassigned_at', { withTimezone: true }), // NULL = active

  // Seed data identification (ADR-017)
  isSeeded: boolean('is_seeded').default(false).notNull(),

  // Standard timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // FK lookup indexes
  supervisorIdIdx: index('idx_team_assignments_supervisor_id').on(table.supervisorId),
  enumeratorIdIdx: index('idx_team_assignments_enumerator_id').on(table.enumeratorId),
  lgaIdIdx: index('idx_team_assignments_lga_id').on(table.lgaId),

  // Partial unique: one enumerator can have only one *active* supervisor
  // Soft-deleted rows (unassigned_at IS NOT NULL) don't block new assignments
  activeEnumeratorIdx: uniqueIndex('idx_team_assignments_active_enumerator')
    .on(table.enumeratorId)
    .where(sql`unassigned_at IS NULL`),
}));

export type TeamAssignment = typeof teamAssignments.$inferSelect;
export type NewTeamAssignment = typeof teamAssignments.$inferInsert;
