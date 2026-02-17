/**
 * Fraud Detections Schema
 *
 * Stores per-submission fraud detection results with component score breakdowns.
 * Each row represents the result of running all active heuristics against a submission.
 *
 * Created in prep-7 (Fraud Detection Domain Research).
 * Used by Story 4.3 (Fraud Engine), Story 4.4 (Flagged Submission Review).
 *
 * @see ADR-003 — Fraud Detection Engine Design
 */

import { pgTable, uuid, text, timestamp, numeric, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { submissions } from './submissions.js';
import { users } from './users.js';

/**
 * Resolution outcome values — must match @oslsr/types fraudResolutions.
 * Defined locally because drizzle-kit runs compiled JS and cannot resolve
 * workspace TS packages (@oslsr/types has no dist/).
 */
export const fraudResolutionTypes = ['confirmed_fraud', 'false_positive', 'needs_investigation', 'dismissed', 'enumerator_warned', 'enumerator_suspended'] as const;
export type FraudResolution = typeof fraudResolutionTypes[number];

/**
 * Severity levels — must match @oslsr/types fraudSeverities.
 */
export const fraudSeverityTypes = ['clean', 'low', 'medium', 'high', 'critical'] as const;
export type FraudSeverityLevel = typeof fraudSeverityTypes[number];

/**
 * Fraud detections table — per-submission scoring results
 *
 * Stores the composite score and all component breakdowns.
 * config_snapshot_version pins which threshold version was used,
 * enabling historical auditing and re-evaluation.
 */
export const fraudDetections = pgTable('fraud_detections', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // Submission + enumerator references
  submissionId: uuid('submission_id').notNull().references(() => submissions.id),
  enumeratorId: uuid('enumerator_id').notNull().references(() => users.id),

  // When computed and which config version
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  configSnapshotVersion: integer('config_snapshot_version').notNull(),

  // Component scores (0-25 for GPS/Speed, 0-20 for Straightline/Duplicate, 0-10 for Timing)
  gpsScore: numeric('gps_score', { precision: 5, scale: 2 }).notNull().default('0'),
  speedScore: numeric('speed_score', { precision: 5, scale: 2 }).notNull().default('0'),
  straightlineScore: numeric('straightline_score', { precision: 5, scale: 2 }).notNull().default('0'),
  duplicateScore: numeric('duplicate_score', { precision: 5, scale: 2 }).notNull().default('0'),
  timingScore: numeric('timing_score', { precision: 5, scale: 2 }).notNull().default('0'),

  // Composite
  totalScore: numeric('total_score', { precision: 5, scale: 2 }).notNull(),
  severity: text('severity', { enum: fraudSeverityTypes }).notNull(),

  // Detail breakdowns (JSONB for heuristic-specific data)
  gpsDetails: jsonb('gps_details'),
  speedDetails: jsonb('speed_details'),
  straightlineDetails: jsonb('straightline_details'),
  duplicateDetails: jsonb('duplicate_details'),
  timingDetails: jsonb('timing_details'),

  // Resolution workflow
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  resolution: text('resolution', { enum: fraudResolutionTypes }),
  resolutionNotes: text('resolution_notes'),
}, (table) => ({
  // Supervisor queue: filter by severity + unreviewed
  severityResolutionIdx: index('idx_fraud_detections_severity_resolution').on(table.severity, table.resolution),
  // Per-enumerator fraud history
  enumeratorIdIdx: index('idx_fraud_detections_enumerator_id').on(table.enumeratorId),
  // Submission → fraud lookup
  submissionIdIdx: index('idx_fraud_detections_submission_id').on(table.submissionId),
}));

export type FraudDetection = typeof fraudDetections.$inferSelect;
export type NewFraudDetection = typeof fraudDetections.$inferInsert;
