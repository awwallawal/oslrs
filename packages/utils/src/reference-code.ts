/**
 * Story 9-58 (Deliverable B) — human-friendly per-respondent reference code.
 *
 * Format: `OSL-<YYYY>-<6 chars>` (e.g. `OSL-2026-7F3K9Q`). The 6 random chars
 * use the Crockford base32 alphabet, which deliberately EXCLUDES the ambiguous
 * characters `I`, `L`, `O`, `U` so a registrant can read the code aloud / a
 * field officer can read it back without transcription errors.
 *
 * This is a CONVENIENCE reference to quote (support, the public status check) —
 * NOT an auth secret. It is generated at the uniform respondent-creation
 * chokepoint (so every channel produces one) and stored per-respondent on
 * `respondents.reference_code` (UNIQUE). Collision handling (retry against the
 * unique constraint) is the CALLER's responsibility — this module only mints a
 * single random candidate of the correct shape.
 *
 * Shared (FE + BE): uses the Web Crypto API (`globalThis.crypto.getRandomValues`,
 * available in Node 20 + browsers) so it carries no Node-only imports.
 */

/**
 * Crockford base32 alphabet — digits + 22 letters, excluding I, L, O, U.
 * 32 symbols, so `byte % 32` is unbiased (256 is an exact multiple of 32).
 */
export const REFERENCE_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Number of random characters in the suffix. 32^6 ≈ 1.07e9 keyspace. */
export const REFERENCE_CODE_SUFFIX_LENGTH = 6;

/**
 * Validates the canonical reference-code shape. The character class mirrors
 * {@link REFERENCE_CODE_ALPHABET} exactly (no I/L/O/U). Year is any 4 digits.
 */
export const REFERENCE_CODE_REGEX = /^OSL-\d{4}-[0-9A-HJKMNP-TV-Z]{6}$/;

/**
 * Generate one random reference code for the given (4-digit) year.
 *
 * Does NOT guarantee global uniqueness — the caller must insert against the
 * `respondents.reference_code` UNIQUE index and retry on a collision (23505).
 * Collisions are astronomically rare at our scale, so a small retry budget at
 * the call site is sufficient.
 */
export function generateReferenceCode(year: number): string {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new Error(`generateReferenceCode: year must be a 4-digit integer, got ${year}`);
  }
  const bytes = new Uint8Array(REFERENCE_CODE_SUFFIX_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let suffix = '';
  for (let i = 0; i < REFERENCE_CODE_SUFFIX_LENGTH; i++) {
    suffix += REFERENCE_CODE_ALPHABET[bytes[i] % REFERENCE_CODE_ALPHABET.length];
  }
  return `OSL-${year}-${suffix}`;
}

/** True when `value` is a syntactically valid reference code. */
export function isValidReferenceCode(value: string): boolean {
  return REFERENCE_CODE_REGEX.test(value);
}
