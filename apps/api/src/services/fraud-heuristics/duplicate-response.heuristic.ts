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
 * Story 13-71 AC12 — HOW MANY DECIMAL PLACES OF A COORDINATE ARE "THE SAME PLACE".
 *
 * FOUR, and the figure is stated rather than left implicit because it is a
 * judgement about the ground, not about floating point.
 *
 * At Oyo State's latitude (~7.4 degrees N):
 *   - 0.0001 degrees of LATITUDE  ~ 11.1 m  (1 degree ~ 110,900 m)
 *   - 0.0001 degrees of LONGITUDE ~ 11.0 m  (1 degree ~ 111,320 * cos(7.4) ~ 110,394 m)
 *
 * So the grid cell is roughly 11 m square. That is deliberately the scale that
 * separates two households from one: two interviews in the same compound should
 * compare equal, two in adjacent buildings should not. Finer (6 dp, ~0.1 m) would
 * make two captures of the SAME doorway differ, because a phone GPS fix has a
 * radius of metres to tens of metres and never repeats exactly. Coarser (3 dp,
 * ~110 m) would merge a whole street.
 *
 * ⚠️ INHERENT TO GRID ROUNDING, and accepted: two points 1 m apart can still land
 * either side of a cell boundary and compare unequal. This makes the heuristic
 * conservative in that case (a missed match, not an invented one), which is the
 * right direction for a detector whose thresholds R-A8 is about to calibrate.
 */
const GEOPOINT_DECIMAL_PLACES = 4;

function roundCoordinate(value: number): string {
  const factor = 10 ** GEOPOINT_DECIMAL_PLACES;
  const rounded = Math.round(value * factor) / factor;
  // `-0` and `0` are the same place on the ground but stringify differently.
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(GEOPOINT_DECIMAL_PLACES);
}

/**
 * Key-order-independent serialisation for a non-geopoint structured answer.
 *
 * Safe against cycles by construction: every value reaching here came out of the
 * `raw_data` jsonb column, and JSON cannot express one.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/**
 * Story 13-71 AC12 — render ONE answer into something two answers can be compared by.
 *
 * ⛔ WHAT WAS WRONG. This comparison was `String(a[key] ?? '')`. Every object
 * answer renders as the literal `"[object Object]"`, so **two DIFFERENT locations
 * compared EQUAL** — every geopoint matched every other geopoint, always.
 *
 * ⭐ WHY IT IS 13-71'S DEFECT AND NOT 13-73'S. Measured 2026-09-20, only 4 of 35
 * enumerator submissions carried coordinates, so few pairs both held a geopoint
 * and the bias was small. 13-71 requires a position on every enumerator
 * submission — the moment that lands, EVERY enumerator pair gains one free
 * matching field and `maxMatchRatio` is biased upward on the exact channel R-A8
 * is about to calibrate against. The story that creates the exposure closes it.
 * (Evidence and recommendation by adjudication 2026-09-20; RULED IN by Awwal,
 * 2026-09-20 — "fix it once with 13-71".)
 *
 * ⛔ AND IT IS NOT FIXED BY DROPPING THE KEY. Two interviews at genuinely
 * identical coordinates is REAL duplicate evidence — the strongest this detector
 * can see. `String()` destroyed that too, by making it indistinguishable from two
 * interviews a kilometre apart. Skipping geopoints would destroy it a second
 * time, more quietly.
 *
 * ⚠️ ACCURACY IS DELIBERATELY EXCLUDED from the comparison. It qualifies a
 * position, it is not part of one: the same doorway captured twice yields the
 * same rounded coordinate with different accuracy radii, and those two are the
 * same place.
 *
 * ⛔ GEOPOINT IS NOT THE ONLY OBJECT, which is why this is a general fix rather
 * than a geopoint special case. Measured against the two shipped forms on
 * 2026-09-20: `oslsr_master_v3` serves 1 geopoint (`gps_location`) AND 2
 * `select_multiple` questions (`skills_possessed`, `training_interest`), and
 * `oslsr_public_core_v1` serves NO geopoint but 1 `select_multiple`
 * (`skills_possessed`). A `select_multiple` answer is an ARRAY, and arrays hit the
 * same `String()` path with a live false match of their own: `String([])` is `''`,
 * which is exactly what an UNANSWERED question renders as — so an empty
 * multi-select matched every respondent who skipped the question. That affects
 * the PUBLIC channel too, which has no geopoint at all.
 *
 * ⚠️ ARRAY ORDER IS PRESERVED, NOT SORTED, and that is a decision. `SelectMultipleInput`
 * appends in TAP order, so `['a','b']` and `['b','a']` are arguably the same answer
 * and sorting would make them match. Sorting is left undone because it would
 * INCREASE match ratios on the very channel R-A8 is about to calibrate, and AC12's
 * mandate is to remove a bias rather than to trade it for a new one in the other
 * direction. Non-empty arrays of DISTINCT scalar choices therefore compare as they
 * did before this change; only the `[]`-vs-unanswered collision is closed, and
 * that one biases DOWN. Recorded as a separate open question, not silently decided.
 *
 * ⚠️ "EXACTLY AS BEFORE" WAS AN OVERSTATEMENT AND IS CORRECTED HERE (review R11).
 * Two comparisons genuinely change for non-empty arrays, both of them tightenings
 * and both asserted in the suite: `['a,b']` no longer matches `['a','b']` (the old
 * `String()` rendered both as `a,b`), and `['a']` no longer matches the scalar
 * `'a'`. Measured on the shipped forms — 0 choice values on either form contain a
 * comma, and no question changes between scalar and multi-select across the two
 * versions — so neither is a live behaviour change today. They are hardening, not
 * fixes, and calling them "no change at all" was the kind of claim this story
 * exists to stop making.
 */
export function canonicaliseAnswer(value: unknown): string {
  // Matches the previous `?? ''`: an absent answer and an explicit null are "".
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);

  if (!Array.isArray(value)) {
    const { latitude, longitude } = value as { latitude?: unknown; longitude?: unknown };
    if (
      typeof latitude === 'number' && Number.isFinite(latitude) &&
      typeof longitude === 'number' && Number.isFinite(longitude)
    ) {
      return `geo:${roundCoordinate(latitude)},${roundCoordinate(longitude)}`;
    }
  }

  return stableStringify(value);
}

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
    // Story 13-71 AC12 — was `String(a[key] ?? '')`, which flattened every object
    // answer to "[object Object]" and made two DIFFERENT locations compare equal.
    if (canonicaliseAnswer(a[key]) === canonicaliseAnswer(b[key])) {
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
