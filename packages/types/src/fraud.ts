/**
 * Fraud Detection types for the OSLSR Fraud Signal Engine.
 *
 * Created in prep-7 (Fraud Detection Domain Research).
 * Used by Story 4.3 (Fraud Engine), Story 4.4 (Flagged Submission Review).
 *
 * @see ADR-003 — Fraud Detection Engine Design
 */

// ── Enums / Union Types ──────────────────────────────────────────────────

/**
 * Fraud severity levels mapped to composite score ranges:
 * - clean: 0-24 (auto-accept)
 * - low: 25-49 (weekly review)
 * - medium: 50-69 (next-day callback)
 * - high: 70-84 (immediate notification, hold payment)
 * - critical: 85-100 (auto-quarantine, block enumerator)
 */
export const fraudSeverities = ['clean', 'low', 'medium', 'high', 'critical'] as const;
export type FraudSeverity = typeof fraudSeverities[number];

/**
 * Heuristic categories matching the rule_category column in fraud_thresholds.
 */
export const heuristicCategories = ['gps', 'speed', 'straightline', 'duplicate', 'timing', 'composite'] as const;
export type HeuristicCategory = typeof heuristicCategories[number];

/**
 * Resolution outcomes for fraud review workflow.
 */
export const fraudResolutions = [
  'confirmed_fraud',
  'false_positive',
  'needs_investigation',
  'dismissed',
  'enumerator_warned',
  'enumerator_suspended',
] as const;
export type FraudResolution = typeof fraudResolutions[number];

// ── Interfaces ──────────────────────────────────────────────────────────

/**
 * Threshold configuration — mirrors fraud_thresholds DB table.
 * Used by ConfigService to load active thresholds.
 */
export interface FraudThresholdConfig {
  id: string;
  ruleKey: string;
  displayName: string;
  ruleCategory: HeuristicCategory;
  thresholdValue: number;
  weight: number | null;
  severityFloor: string | null;
  isActive: boolean;
  effectiveFrom: string; // ISO 8601
  effectiveUntil: string | null; // ISO 8601, null = current version
  version: number;
  createdBy: string; // UUID
  createdAt: string; // ISO 8601
  notes: string | null;
}

/**
 * Component scores from each heuristic category.
 * All values are 0-based with category-specific maximums.
 */
export interface FraudComponentScore {
  gps: number;       // max 25
  speed: number;     // max 25
  straightline: number; // max 20
  duplicate: number;  // max 20
  timing: number;     // max 10
}

/**
 * Full fraud detection result for a submission.
 * Produced by FraudEngine.evaluate().
 */
export interface FraudDetectionResult {
  submissionId: string;
  enumeratorId: string;
  configVersion: number;
  componentScores: FraudComponentScore;
  totalScore: number; // 0-100
  severity: FraudSeverity;
  details: {
    gps: Record<string, unknown> | null;
    speed: Record<string, unknown> | null;
    straightline: Record<string, unknown> | null;
    duplicate: Record<string, unknown> | null;
    timing: Record<string, unknown> | null;
  };
}

/**
 * Pluggable heuristic contract.
 * Each heuristic implements this interface and is registered with HeuristicRegistry.
 */
export interface FraudHeuristic {
  /** Unique machine-readable key (e.g., 'gps_cluster') */
  key: string;

  /** Heuristic category */
  category: HeuristicCategory;

  /**
   * Evaluate a submission and return a score with details.
   * @param submissionId - The submission to evaluate
   * @param config - Active thresholds for this heuristic's category
   * @returns Score (0 to category max) and detail breakdown
   */
  evaluate(
    submissionId: string,
    config: FraudThresholdConfig[],
  ): Promise<{ score: number; details: Record<string, unknown> }>;
}
