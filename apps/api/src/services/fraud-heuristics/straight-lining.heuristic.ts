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
        continue; // Not enough answered questions in this battery
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
        batteryCount: batteries.length,
        analyzedBatteries: batteryResults.length,
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
