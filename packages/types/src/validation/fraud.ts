/**
 * Fraud Detection Zod validation schemas.
 *
 * Used for API input validation on fraud threshold and detection endpoints.
 * Created in prep-7 (Fraud Detection Domain Research).
 *
 * @see ADR-003 — Fraud Detection Engine Design
 */

import { z } from 'zod';
import { fraudSeverities, heuristicCategories, fraudResolutions } from '../fraud.js';

// ── Threshold Schemas ──────────────────────────────────────────────────

/**
 * Full fraud threshold config schema.
 * Used to validate threshold records returned from the DB.
 */
export const fraudThresholdConfigSchema = z.object({
  id: z.string().uuid(),
  ruleKey: z.string().min(1).max(100),
  displayName: z.string().min(1),
  ruleCategory: z.enum(heuristicCategories),
  thresholdValue: z.number().finite(),
  weight: z.number().min(0).max(100).nullable(),
  severityFloor: z.string().nullable(),
  isActive: z.boolean(),
  effectiveFrom: z.string().datetime(),
  effectiveUntil: z.string().datetime().nullable(),
  version: z.number().int().positive(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  notes: z.string().nullable(),
});

/**
 * Schema for updating a threshold (PUT /api/v1/fraud-thresholds/:ruleKey).
 * Creates a new version — only accepts the mutable fields.
 */
export const updateThresholdSchema = z.object({
  thresholdValue: z.number().finite(),
  weight: z.number().min(0).max(100).optional(),
  severityFloor: z.enum(fraudSeverities).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

// ── Detection Schemas ──────────────────────────────────────────────────

/**
 * Component scores validation.
 */
export const fraudComponentScoreSchema = z.object({
  gps: z.number().min(0).max(25),
  speed: z.number().min(0).max(25),
  straightline: z.number().min(0).max(20),
  duplicate: z.number().min(0).max(20),
  timing: z.number().min(0).max(10),
});

/**
 * Full fraud detection result schema.
 * Used to validate detection records.
 */
export const fraudDetectionResultSchema = z.object({
  submissionId: z.string().uuid(),
  enumeratorId: z.string().uuid(),
  configVersion: z.number().int().positive(),
  componentScores: fraudComponentScoreSchema,
  totalScore: z.number().min(0).max(100),
  severity: z.enum(fraudSeverities),
  details: z.object({
    gps: z.record(z.unknown()).nullable(),
    speed: z.record(z.unknown()).nullable(),
    straightline: z.record(z.unknown()).nullable(),
    duplicate: z.record(z.unknown()).nullable(),
    timing: z.record(z.unknown()).nullable(),
  }),
});

/**
 * Schema for reviewing a fraud detection (PATCH /api/v1/fraud-detections/:id/review).
 */
export const reviewFraudDetectionSchema = z.object({
  resolution: z.enum(fraudResolutions),
  resolutionNotes: z.string().max(1000).optional(),
});

/**
 * Schema for bulk-reviewing fraud detections (PATCH /api/v1/fraud-detections/bulk-review).
 * Used for mass-event verification — min 2, max 50 detections per batch.
 * Story 4.5: Bulk Verification of Mass-Events.
 */
export const bulkReviewFraudDetectionsSchema = z.object({
  ids: z.array(z.string().uuid()).min(2, 'At least 2 detections required').max(50, 'Maximum 50 detections per batch'),
  resolution: z.enum(fraudResolutions),
  resolutionNotes: z.string()
    .min(10, 'Event context must be at least 10 characters')
    .max(500, 'Event context must not exceed 500 characters'),
});
