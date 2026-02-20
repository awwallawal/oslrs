/**
 * Off-Hours Heuristic
 *
 * Flags submissions made during unusual hours (night/weekend).
 * Max score: 10 points.
 *
 * - Night hours (11PM-5AM WAT): 10 points
 * - Weekend submissions: 5 points
 *
 * Uses WAT (West Africa Time, UTC+1) for Nigeria context.
 *
 * Created in Story 4.3 (Fraud Engine Configurable Thresholds).
 * @see ADR-003 — Fraud Detection Engine Design
 */

import type { FraudHeuristic, FraudThresholdConfig, SubmissionWithContext } from '@oslsr/types';
import { getThreshold } from './utils.js';

// WAT offset from UTC in hours
const WAT_OFFSET_HOURS = 1;

/**
 * Get hour in WAT (West Africa Time, UTC+1).
 */
export function getWATHour(date: Date): number {
  const utcHour = date.getUTCHours();
  return (utcHour + WAT_OFFSET_HOURS) % 24;
}

/**
 * Check if a date falls on a weekend (Saturday or Sunday) in WAT.
 */
export function isWeekendWAT(date: Date): boolean {
  // Adjust to WAT by adding offset
  const watDate = new Date(date.getTime() + WAT_OFFSET_HOURS * 3600000);
  const day = watDate.getUTCDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

export const offHoursHeuristic: FraudHeuristic = {
  key: 'off_hours',
  category: 'timing',

  async evaluate(
    submission: SubmissionWithContext,
    config: FraudThresholdConfig[],
  ): Promise<{ score: number; details: Record<string, unknown> }> {
    const { submittedAt } = submission;
    const submissionDate = new Date(submittedAt);

    // Load configurable thresholds
    const nightStartHour = getThreshold(config, 'timing_night_start_hour', 23);
    const nightEndHour = getThreshold(config, 'timing_night_end_hour', 5);
    const weekendPenalty = getThreshold(config, 'timing_weekend_penalty', 5);
    const weight = getThreshold(config, 'timing_weight', 10);

    const watHour = getWATHour(submissionDate);
    const isWeekend = isWeekendWAT(submissionDate);

    let score = 0;
    const flags: string[] = [];

    // Night hours check (handles wrap-around: e.g., 23-5 means 23,0,1,2,3,4)
    const isNightHours = nightStartHour > nightEndHour
      ? watHour >= nightStartHour || watHour < nightEndHour
      : watHour >= nightStartHour && watHour < nightEndHour;

    if (isNightHours) {
      score += weight; // Full weight for night submissions
      flags.push('night_hours');
    }

    if (isWeekend) {
      score += weekendPenalty;
      flags.push('weekend');
    }

    // Cap at weight
    score = Math.min(score, weight);
    score = Math.round(score * 100) / 100;

    return {
      score,
      details: {
        watHour,
        isNightHours,
        isWeekend,
        dayOfWeek: submissionDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Africa/Lagos' }),
        flags,
        thresholds: { nightStartHour, nightEndHour, weekendPenalty },
      },
    };
  },
};
