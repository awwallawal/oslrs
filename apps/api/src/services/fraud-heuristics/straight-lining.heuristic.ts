/**
 * Straight-lining Heuristic
 *
 * Detects response pattern uniformity in scale-question batteries.
 * Max score: 20 points.
 *
 * Primary signal: PIR (Percentage Identical Responses) >= 0.80 in 2+ batteries = 20 pts
 * Secondary signals: LIS (Longest Identical String) >= 8 and Shannon entropy < 0.5 bits
 * False positive mitigation: battery-level-only analysis, cross-battery consistency
 *
 * Created in Story 4.3 (Fraud Engine Configurable Thresholds).
 * @see ADR-003 — Fraud Detection Engine Design
 */

import type { FraudHeuristic, FraudThresholdConfig, SubmissionWithContext } from '@oslsr/types';
import { getThreshold } from './utils.js';

/**
 * A battery is a group of scale questions (e.g., Likert) with the same choice list.
 */
interface Battery {
  sectionId: string;
  questionNames: string[];
}

/**
 * Identify scale-question batteries from form schema.
 * A battery = 5+ select_one/likert questions in the same section sharing similar choice lists.
 */
export function identifyBatteries(
  formSchema: Record<string, unknown> | null,
  minBatterySize: number,
): Battery[] {
  if (!formSchema) return [];

  const batteries: Battery[] = [];
  const sections = (formSchema.sections ?? formSchema.pages ?? []) as Array<Record<string, unknown>>;

  for (const section of sections) {
    const sectionId = String(section.id ?? section.name ?? '');
    const questions = (section.questions ?? section.fields ?? []) as Array<Record<string, unknown>>;

    // Group scale questions (select_one, likert, radio with numeric-like choices)
    const scaleQuestions: string[] = [];

    for (const q of questions) {
      const type = String(q.type ?? '').toLowerCase();
      if (['select_one', 'likert', 'radio'].includes(type)) {
        scaleQuestions.push(String(q.name ?? q.id ?? ''));
      }
    }

    if (scaleQuestions.length >= minBatterySize) {
      batteries.push({
        sectionId,
        questionNames: scaleQuestions,
      });
    }
  }

  return batteries;
}

/**
 * Calculate PIR (Percentage of Identical Responses) for a battery.
 * Returns the fraction of responses that are identical to the mode.
 */
export function calculatePIR(responses: unknown[]): number {
  if (responses.length === 0) return 0;

  // Count frequency of each response
  const freq = new Map<string, number>();
  for (const r of responses) {
    const key = String(r ?? '');
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }

  // Mode count
  const maxCount = Math.max(...freq.values());
  return maxCount / responses.length;
}

/**
 * Calculate LIS (Longest Identical String) — longest run of consecutive identical responses.
 */
export function calculateLIS(responses: unknown[]): number {
  if (responses.length === 0) return 0;

  let maxRun = 1;
  let currentRun = 1;

  for (let i = 1; i < responses.length; i++) {
    if (String(responses[i]) === String(responses[i - 1])) {
      currentRun++;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 1;
    }
  }

  return maxRun;
}

/**
 * Calculate Shannon entropy (in bits) for a set of responses.
 * Low entropy = low diversity = suspicious.
 */
export function calculateShannonEntropy(responses: unknown[]): number {
  if (responses.length === 0) return 0;

  const freq = new Map<string, number>();
  for (const r of responses) {
    const key = String(r ?? '');
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / responses.length;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  return Math.round(entropy * 100) / 100;
}

export const straightLiningHeuristic: FraudHeuristic = {
  key: 'straight_lining',
  category: 'straightline',

  async evaluate(
    submission: SubmissionWithContext,
    config: FraudThresholdConfig[],
  ): Promise<{ score: number; details: Record<string, unknown> }> {
    const { rawData, formSchema } = submission;

    // Load configurable thresholds
    const pirThreshold = getThreshold(config, 'straightline_pir_threshold', 0.8);
    const minBatterySize = getThreshold(config, 'straightline_min_battery_size', 5);
    const entropyThreshold = getThreshold(config, 'straightline_entropy_threshold', 0.5);
    const minFlaggedBatteries = getThreshold(config, 'straightline_min_flagged_batteries', 2);
    const weight = getThreshold(config, 'straightline_weight', 20);

    // Identify batteries from form schema
    const batteries = identifyBatteries(formSchema, minBatterySize);

    if (batteries.length === 0) {
      return {
        score: 0,
        details: { reason: 'no_batteries_found', batteryCount: 0 },
      };
    }

    // Analyze each battery
    const batteryResults: Array<{
      sectionId: string;
      questionCount: number;
      pir: number;
      lis: number;
      entropy: number;
      flagged: boolean;
    }> = [];

    /*
     * Story 13-73 AC1 (13-69 R5) — A DROPPED BATTERY IS NAMED, WITH THE COUNTS.
     *
     * An under-answered battery used to `continue` with no trace, so
     * `analyzedBatteries: 0` could not be told from a clean measurement — and on the
     * master form the labour battery is dropped on every submission, because its
     * skip logic caps a respondent at 4 answered against a minimum of 5. That is the
     * battery a real straight-liner would trip.
     *
     * `reason` is set whenever ANY battery was dropped, not only when all were: the
     * prod case that proved R5 analysed 1 of 2, and a reason present only on total
     * loss would hide exactly that row from a `GROUP BY details->>'reason'`. ⚠️ So
     * here `reason` does NOT mean "the score is void" — batteries that WERE analysed
     * still score. It means "part of this form was not measured, and here is why".
     * Invariant: batteryCount === analyzedBatteries + skippedBatteries.length.
     */
    const skippedBatteries: Array<{ sectionId: string; questionCount: number; answered: number }> = [];

    let flaggedCount = 0;

    for (const battery of batteries) {
      // Extract responses for this battery
      const responses: unknown[] = [];
      for (const name of battery.questionNames) {
        const value = (rawData as Record<string, unknown>)?.[name];
        if (value != null && value !== '') {
          responses.push(value);
        }
      }

      if (responses.length < minBatterySize) {
        // Not enough answered questions to measure this battery — recorded, not dropped.
        skippedBatteries.push({
          sectionId: battery.sectionId,
          questionCount: battery.questionNames.length,
          answered: responses.length,
        });
        continue;
      }

      const pir = calculatePIR(responses);
      const lis = calculateLIS(responses);
      const entropy = calculateShannonEntropy(responses);

      const flagged = pir >= pirThreshold;
      if (flagged) flaggedCount++;

      batteryResults.push({
        sectionId: battery.sectionId,
        questionCount: responses.length,
        pir: Math.round(pir * 100) / 100,
        lis,
        entropy,
        flagged,
      });
    }

    // Score based on cross-battery aggregation
    let score = 0;
    const flags: string[] = [];

    if (flaggedCount >= minFlaggedBatteries) {
      score = weight; // Full score: 2+ batteries flagged
      flags.push('multi_battery_straight_lining');
    } else if (flaggedCount === 1) {
      score = weight * 0.5; // Half score: only 1 battery
      flags.push('single_battery_straight_lining');
    }

    // Secondary signal: LIS >= 8 consecutive identical (bonus)
    const maxLIS = Math.max(0, ...batteryResults.map((b) => b.lis));
    if (maxLIS >= 8 && score < weight) {
      score = Math.min(score + weight * 0.25, weight);
      flags.push('long_identical_string');
    }

    // Secondary signal: very low entropy
    const minEntropy = batteryResults.length > 0
      ? Math.min(...batteryResults.map((b) => b.entropy))
      : Infinity;
    if (minEntropy < entropyThreshold && score < weight) {
      score = Math.min(score + weight * 0.25, weight);
      flags.push('low_entropy');
    }

    score = Math.min(score, weight);
    score = Math.round(score * 100) / 100;

    return {
      score,
      details: {
        ...(skippedBatteries.length > 0 ? { reason: 'battery_below_min_answered' } : {}),
        batteryCount: batteries.length,
        analyzedBatteries: batteryResults.length,
        skippedBatteries,
        flaggedBatteries: flaggedCount,
        maxLIS,
        minEntropy: minEntropy === Infinity ? null : minEntropy,
        batteryResults,
        flags,
        thresholds: { pirThreshold, minBatterySize, entropyThreshold, minFlaggedBatteries },
      },
    };
  },
};
