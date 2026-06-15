/**
 * Story 9-57 — pure wizard navigation derivation.
 *
 * Extracted from WizardPage so the URL-as-single-source-of-truth navigation
 * logic is unit-testable in isolation (precedent: `lib/review-completeness.ts`).
 *
 * The wizard's current step is DERIVED from the URL (`?step=N`). These helpers
 * own the parse + clamp rules; the page just wires them to `searchParams` and
 * the draft store. None of them read or write component state — they are
 * referentially transparent, which is what makes the old dual-effect URL↔state
 * doom-loop structurally impossible to reintroduce.
 */

/**
 * Parse the `?step` query value into a step index clamped to `[0, stepCount-1]`.
 * Returns `null` when the param is absent or non-numeric (caller decides the
 * default, normally step 0).
 */
export function parseStepParam(raw: string | null, stepCount: number): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(Math.floor(n), Math.max(0, stepCount - 1)));
}

/**
 * Story 9-54 AC6.1 — clamp the URL-derived step to the furthest step the user
 * has LEGITIMATELY reached. A deep-link / resume `?step=N` beyond `maxReached`
 * lands on `maxReached`, so the questionnaire can't be skipped to Review.
 * `null` (no `?step`) resolves to step 0.
 */
export function clampToReached(step: number | null, maxReached: number): number {
  const base = step ?? 0;
  return Math.max(0, Math.min(base, maxReached));
}

/**
 * Story 9-18 AC#E5 — the next step on Continue, auto-skipping fully-hidden
 * section steps. Never skips the final Review step (`stepCount - 1`).
 */
export function advanceStep(
  from: number,
  stepCount: number,
  isSkippable: (idx: number) => boolean,
): number {
  let next = from + 1;
  while (next < stepCount - 1 && isSkippable(next)) next += 1;
  return Math.max(0, Math.min(next, stepCount - 1));
}

/**
 * Story 9-18 AC#E5 — the previous step on Back, auto-skipping fully-hidden
 * section steps. Never skips below step 0.
 */
export function retreatStep(from: number, isSkippable: (idx: number) => boolean): number {
  let prev = from - 1;
  while (prev > 0 && isSkippable(prev)) prev -= 1;
  return Math.max(0, prev);
}
