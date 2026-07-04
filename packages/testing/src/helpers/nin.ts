/**
 * NIN (National Identification Number) Test Helpers — TEST-NIN GENERATION ONLY.
 *
 * Real Nigerian NINs have NO check digit — NIMC: "11 randomly generated,
 * non-intelligible digits" (Story 13-15, 2026-07-04; verified against prod
 * n=105 where 74% of real NINs fail Mod-11). Every production validation path
 * is format-only (`^\d{11}$`).
 *
 * These helpers still derive synthetic NINs via `modulus11Generate` — that is
 * merely a convenient deterministic way to build unique 11-digit strings; it
 * is harmless that they happen to be Mod-11-consistent. ~9% of base numbers
 * produce check digit 10 (not representable), hence the retry logic.
 *
 * @see docs/SESSION-NOTES-2026-01-25-STORY-1-11-COMPLETION.md — HISTORICAL:
 *   that session inferred "NINs use Modulus 11" from n=2 real NINs; Story
 *   13-15 disproved it. Never infer a national-ID algorithm from 2 samples.
 */

import { modulus11Generate } from '@oslsr/utils/src/validation';

// Global counter to ensure unique NINs across test runs
let ninCounter = 0;

/**
 * Generate a well-formed 11-digit test NIN with retry logic.
 *
 * About 9% of random 10-digit base numbers produce a Mod-11 check digit of 10,
 * which cannot be represented as a single digit. This function retries
 * with different seeds until generation succeeds.
 *
 * Uses a global counter combined with random values to ensure uniqueness
 * even when fallback is needed.
 *
 * @param maxAttempts - Maximum retry attempts (default: 20)
 * @returns A well-formed 11-digit NIN string
 *
 * @example
 * ```typescript
 * import { generateValidNin } from '@oslsr/testing/helpers/nin';
 *
 * const nin = generateValidNin();
 * // => "61961438053" (well-formed 11 digits)
 * ```
 */
export function generateValidNin(maxAttempts = 20): string {
  // Use counter + timestamp for unique base each call
  const baseOffset = ninCounter++ * 1000 + Date.now() % 1000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = ((baseOffset + Math.floor(Math.random() * 100000000) + attempt) % 10000000000)
      .toString()
      .padStart(10, '0');
    try {
      return modulus11Generate(seed);
    } catch {
      // Retry with next seed - this base produces check digit 10
    }
  }

  // Fallback: use counter-based seed to guarantee uniqueness
  // Try sequential seeds starting from counter value until one works
  for (let i = 0; i < 100; i++) {
    const fallbackSeed = ((ninCounter * 1000 + i) % 10000000000)
      .toString()
      .padStart(10, '0');
    try {
      return modulus11Generate(fallbackSeed);
    } catch {
      // Continue to next seed
    }
  }

  // This should never happen - statistically impossible
  throw new Error('Failed to generate valid NIN after exhaustive attempts');
}

/**
 * Generate multiple unique well-formed test NINs.
 *
 * @param count - Number of NINs to generate
 * @returns Array of unique 11-digit NIN strings
 *
 * @example
 * ```typescript
 * const nins = generateMultipleNins(5);
 * // => ["61961438053", "21647846180", ...]
 * ```
 */
export function generateMultipleNins(count: number): string[] {
  const nins = new Set<string>();

  while (nins.size < count) {
    nins.add(generateValidNin());
  }

  return Array.from(nins);
}

/**
 * Deterministic 11-digit NIN fixtures for tests that need stable values.
 *
 * These two real NINs pass Mod-11 by COINCIDENCE (n=2) — that coincidence is
 * how the retired checksum gate was wrongly inferred in Story 1-11. They are
 * kept only as stable well-formed fixtures; nothing may treat Mod-11
 * consistency as meaningful (Story 13-15).
 */
export const KNOWN_VALID_NINS = [
  '61961438053', // stable fixture (weighted sum 250 — Mod-11-consistent by chance)
  '21647846180', // stable fixture (weighted sum 231 — Mod-11-consistent by chance)
] as const;
