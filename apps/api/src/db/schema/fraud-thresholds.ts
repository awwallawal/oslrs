/**
 * Fraud Thresholds Schema
 *
 * Stores configurable fraud detection thresholds with temporal versioning.
 * Thresholds are NEVER updated — new versions are always INSERTed.
 * This enables full audit trail and historical score auditing.
 *
 * Created in prep-7 (Fraud Detection Domain Research).
 * Used by Story 4.3 (Fraud Engine Configurable Thresholds).
 *
 * @see ADR-003 — Fraud Detection Engine Design
 */

import { pgTable, uuid, varchar, text, timestamp, numeric, integer, boolean, index, unique } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { users } from './users.js';

/**
 * Heuristic rule categories — must match @oslsr/types heuristicCategories.
 * Defined locally because drizzle-kit runs compiled JS and cannot resolve
 * workspace TS packages (@oslsr/types has no dist/).
 */
export const ruleCategoryTypes = ['gps', 'speed', 'straightline', 'duplicate', 'timing', 'composite'] as const;
export type RuleCategory = typeof ruleCategoryTypes[number];

/**
 * Fraud thresholds table — temporal versioning
 *
 * Each row represents one version of a threshold rule.
 * To change a threshold: close the current version (set effective_until)
 * and INSERT a new row with incremented version.
 */
export const fraudThresholds = pgTable('fraud_thresholds', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // Rule identification
  ruleKey: varchar('rule_key', { length: 100 }).notNull(),
  displayName: text('display_name').notNull(),
  ruleCategory: text('rule_category', { enum: ruleCategoryTypes }).notNull(),

  // Threshold configuration
  thresholdValue: numeric('threshold_value', { precision: 12, scale: 4 }).notNull(),
  weight: numeric('weight', { precision: 5, scale: 2 }),
  severityFloor: text('severity_floor'),

  // Activation
  isActive: boolean('is_active').notNull().default(true),

  // Temporal versioning
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }),
  version: integer('version').notNull(),

  // Audit
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  notes: text('notes'),
}, (table) => ({
  // Unique constraint: one version per rule_key
  ruleKeyVersionUnique: unique('uq_fraud_thresholds_rule_key_version').on(table.ruleKey, table.version),
  // Fast lookup of current active thresholds
  activeThresholdsIdx: index('idx_fraud_thresholds_active').on(table.isActive, table.effectiveUntil),
  // Category-based filtering
  ruleCategoryIdx: index('idx_fraud_thresholds_category').on(table.ruleCategory),
}));

export type FraudThreshold = typeof fraudThresholds.$inferSelect;
export type NewFraudThreshold = typeof fraudThresholds.$inferInsert;
