/**
 * Duplicate Response Heuristic
 *
 * Detects exact and partial duplicate submissions by comparing response fields.
 * Max score: 20 points.
 *
 * - Exact duplicate (100% field match): 20 points
 * - Partial duplicate (>70% field match): 10 points
 *
 * Created in Story 4.3 (Fraud Engine Configurable Thresholds).
 * @see ADR-003 — Fraud Detection Engine Design
 */

import type { FraudHeuristic, FraudThresholdConfig, SubmissionWithContext } from '@oslsr/types';
import { getThreshold } from './utils.js';

/**
 * Calculate field match ratio between two response objects.
 * Ignores metadata fields (prefixed with _).
 */
export function calculateFieldMatchRatio(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): number {
  // Get response keys (excluding internal metadata like _gpsLatitude)
  const keysA = Object.keys(a).filter((k) => !k.startsWith('_'));
  const keysB = Object.keys(b).filter((k) => !k.startsWith('_'));

  if (keysA.length === 0 && keysB.length === 0) return 0;

  const allKeys = new Set([...keysA, ...keysB]);
  let matchCount = 0;

  for (const key of allKeys) {
    if (String(a[key] ?? '') === String(b[key] ?? '')) {
      matchCount++;
    }
  }

  return matchCount / allKeys.size;
}

export const duplicateResponseHeuristic: FraudHeuristic = {
  key: 'duplicate_response',
  category: 'duplicate',

  async evaluate(
    submission: SubmissionWithContext,
    config: FraudThresholdConfig[],
  ): Promise<{ score: number; details: Record<string, unknown> }> {
    const { rawData, recentSubmissions } = submission;

    if (!rawData || recentSubmissions.length === 0) {
      return { score: 0, details: { reason: 'no_data_or_history' } };
    }

    // Load configurable thresholds
    const exactThreshold = getThreshold(config, 'duplicate_exact_threshold', 1.0);
    const partialThreshold = getThreshold(config, 'duplicate_partial_threshold', 0.7);
    const weight = getThreshold(config, 'duplicate_weight', 20);

    let maxMatchRatio = 0;
    let bestMatchId: string | null = null;
    const matches: Array<{ submissionId: string; matchRatio: number }> = [];

    for (const recent of recentSubmissions) {
      if (!recent.rawData) continue;

      const ratio = calculateFieldMatchRatio(
        rawData as Record<string, unknown>,
        recent.rawData as Record<string, unknown>,
      );

      if (ratio > maxMatchRatio) {
        maxMatchRatio = ratio;
        bestMatchId = recent.id;
      }

      if (ratio >= partialThreshold) {
        matches.push({
          submissionId: recent.id,
          matchRatio: Math.round(ratio * 100) / 100,
        });
      }
    }

    let score = 0;
    let matchType: 'exact' | 'partial' | 'none' = 'none';

    if (maxMatchRatio >= exactThreshold) {
      score = weight; // 20 points for exact duplicate
      matchType = 'exact';
    } else if (maxMatchRatio >= partialThreshold) {
      score = weight * 0.5; // 10 points for partial match
      matchType = 'partial';
    }

    score = Math.round(score * 100) / 100;

    return {
      score,
      details: {
        maxMatchRatio: Math.round(maxMatchRatio * 100) / 100,
        bestMatchSubmissionId: bestMatchId,
        matchType,
        matchCount: matches.length,
        matches: matches.slice(0, 5), // Limit detail output
        comparedSubmissions: recentSubmissions.length,
        thresholds: { exactThreshold, partialThreshold },
      },
    };
  },
};
