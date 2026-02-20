/**
 * Speed Run Heuristic
 *
 * Detects unusually fast survey completions using historical median comparison.
 * Max score: 25 points.
 *
 * Two-tier scoring:
 * - Tier 1 (superspeceder): completionTime < 25% of median = 25 points
 * - Tier 2 (speeder): completionTime < 50% of median = 12 points
 *
 * Bootstrap fallback: Until 30+ interviews establish an empirical median,
 * the theoretical minimum floor is used based on question types.
 *
 * Created in Story 4.3 (Fraud Engine Configurable Thresholds).
 * @see ADR-003 — Fraud Detection Engine Design
 */

import type { FraudHeuristic, FraudThresholdConfig, SubmissionWithContext } from '@oslsr/types';
import { getThreshold } from './utils.js';

/**
 * Calculate median from an array of numbers.
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate theoretical minimum completion time based on form question types.
 * Formula: (closedQ * 3s) + (openQ * 8s) + (numericQ * 4s) + 30s overhead.
 */
export function calculateTheoreticalMinimum(formSchema: Record<string, unknown> | null): number {
  if (!formSchema) return 60; // Fallback: 1 minute minimum if no schema

  let closedQ = 0;
  let openQ = 0;
  let numericQ = 0;

  // Parse form schema to count question types
  const sections = (formSchema.sections ?? formSchema.pages ?? []) as Array<Record<string, unknown>>;

  for (const section of sections) {
    const questions = (section.questions ?? section.fields ?? []) as Array<Record<string, unknown>>;
    for (const q of questions) {
      const type = String(q.type ?? '').toLowerCase();
      if (['select_one', 'select_multiple', 'radio', 'checkbox', 'boolean', 'likert'].includes(type)) {
        closedQ++;
      } else if (['text', 'textarea', 'string'].includes(type)) {
        openQ++;
      } else if (['number', 'integer', 'decimal', 'numeric'].includes(type)) {
        numericQ++;
      } else {
        // Default to closed question timing for unknown types
        closedQ++;
      }
    }
  }

  // Minimum 30s base overhead + per-question minimums
  const minimum = (closedQ * 3) + (openQ * 8) + (numericQ * 4) + 30;
  return Math.max(minimum, 30); // At least 30 seconds
}

export const speedRunHeuristic: FraudHeuristic = {
  key: 'speed_run',
  category: 'speed',

  async evaluate(
    submission: SubmissionWithContext,
    config: FraudThresholdConfig[],
  ): Promise<{ score: number; details: Record<string, unknown> }> {
    const { completionTimeSeconds, recentSubmissions, formSchema, questionnaireFormId } = submission;

    // No completion time data — can't evaluate
    if (completionTimeSeconds == null) {
      return { score: 0, details: { reason: 'no_completion_time' } };
    }

    // Load configurable thresholds
    const superspecederPct = getThreshold(config, 'speed_superspeceder_pct', 25) / 100;
    const speederPct = getThreshold(config, 'speed_speeder_pct', 50) / 100;
    const bootstrapN = getThreshold(config, 'speed_bootstrap_n', 30);
    const weight = getThreshold(config, 'speed_weight', 25);

    // Gather historical completion times for the SAME FORM by same enumerator (AC4.3.3)
    const historicalTimes = recentSubmissions
      .filter((s) =>
        s.completionTimeSeconds != null &&
        s.completionTimeSeconds > 0 &&
        s.questionnaireFormId === questionnaireFormId,
      )
      .map((s) => s.completionTimeSeconds!);

    let referenceTime: number;
    let referenceType: 'empirical_median' | 'theoretical_minimum';

    if (historicalTimes.length >= bootstrapN) {
      // Enough data — use empirical median
      referenceTime = calculateMedian(historicalTimes);
      referenceType = 'empirical_median';
    } else {
      // Bootstrap fallback — theoretical minimum
      referenceTime = calculateTheoreticalMinimum(formSchema);
      referenceType = 'theoretical_minimum';
    }

    // Prevent division by zero
    if (referenceTime <= 0) {
      return {
        score: 0,
        details: { reason: 'invalid_reference_time', referenceTime, referenceType },
      };
    }

    const ratio = completionTimeSeconds / referenceTime;
    let score = 0;
    let tier: 'superspeceder' | 'speeder' | 'normal' = 'normal';

    if (ratio < superspecederPct) {
      score = weight; // Full weight (25 pts)
      tier = 'superspeceder';
    } else if (ratio < speederPct) {
      score = Math.round(weight * 0.48); // ~12 pts
      tier = 'speeder';
    }

    return {
      score,
      details: {
        completionTimeSeconds,
        referenceTime: Math.round(referenceTime),
        referenceType,
        ratio: Math.round(ratio * 100) / 100,
        tier,
        historicalSampleSize: historicalTimes.length,
        thresholds: {
          superspecederPct: superspecederPct * 100,
          speederPct: speederPct * 100,
          bootstrapN,
        },
      },
    };
  },
};
