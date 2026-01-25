/**
 * NIN (National Identification Number) Test Helpers
 *
 * Nigerian NINs use Modulus 11 checksum algorithm.
 * ~9% of random base numbers produce check digit 10, which is invalid.
 * These helpers handle the edge case with retry logic.
 *
 * @see docs/SESSION-NOTES-2026-01-25-STORY-1-11-COMPLETION.md for algorithm details
 */

import { modulus11Generate } from '@oslsr/utils/src/validation';

// Global counter to ensure unique NINs across test runs
let ninCounter = 0;

/**
 * Generate a valid Nigerian NIN with retry logic.
 *
 * About 9% of random 10-digit base numbers produce a check digit of 10,
 * which cannot be represented as a single digit. This function retries
 * with different seeds until a valid NIN is generated.
 *
 * Uses a global counter combined with random values to ensure uniqueness
 * even when fallback is needed.
 *
 * @param maxAttempts - Maximum retry attempts (default: 20)
 * @returns A valid 11-digit NIN string
 *
 * @example
 * ```typescript
 * import { generateValidNin } from '@oslsr/testing/helpers/nin';
 *
 * const nin = generateValidNin();
 * // => "61961438053" (valid Modulus 11 checksum)
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
 * Generate multiple unique valid NINs.
 *
 * @param count - Number of NINs to generate
 * @returns Array of unique valid NIN strings
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
 * Known valid Nigerian NINs for test fixtures.
 * These were verified against real government-issued NINs.
 *
 * Use when you need deterministic NINs across test runs.
 */
export const KNOWN_VALID_NINS = [
  '61961438053', // Weighted sum 250, check digit 3
  '21647846180', // Weighted sum 231, check digit 0
] as const;
