/**
 * Daily Productivity Snapshots Schema
 *
 * Stores nightly snapshots of each staff member's daily submission counts.
 * BullMQ job runs at 23:59 WAT (22:59 UTC) to capture the day's totals.
 *
 * Created in Story 5.6a (Supervisor Team Productivity Table).
 * Used for historical trend queries (This Week, This Month, Custom).
 * "Today" data uses live submission counts; snapshots serve historical periods.
 */

import { pgTable, uuid, text, date, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

export const dailyProductivitySnapshots = pgTable('daily_productivity_snapshots', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // Staff member reference (enumerator or data entry clerk)
  userId: uuid('user_id').notNull(),

  // Text LGA code (matches respondents.lgaId pattern for geographic queries)
  lgaId: text('lga_id'),

  // Role reference for filtering by role type
  roleId: uuid('role_id').notNull(),

  // WAT date YYYY-MM-DD (the day this snapshot covers)
  date: date('date').notNull(),

  // Submission counts for the day
  submissionCount: integer('submission_count').notNull().default(0),
  approvedCount: integer('approved_count').notNull().default(0),
  rejectedCount: integer('rejected_count').notNull().default(0),

  // Standard timestamp
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Composite index for fast lookups by user + date range
  userDateIdx: index('idx_daily_productivity_snapshots_user_date').on(table.userId, table.date),

  // Unique constraint: one snapshot per user per day (prevents duplicates)
  userDateUniqueIdx: uniqueIndex('uq_daily_productivity_snapshots_user_date').on(table.userId, table.date),
}));

export type DailyProductivitySnapshot = typeof dailyProductivitySnapshots.$inferSelect;
export type NewDailyProductivitySnapshot = typeof dailyProductivitySnapshots.$inferInsert;
