/**
 * NIN (National Identification Number) generation for k6 load tests.
 *
 * Nigerian NINs use Modulus 11 checksum:
 *  1. First 10 digits weighted by [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
 *  2. Check digit = 11 - (sum % 11), or 0 if remainder is 0
 *  3. ~9% of random bases produce check digit 10 (invalid), so we retry
 *
 * k6 runs in Go runtime, NOT Node.js — no npm packages available.
 */

const WEIGHTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

/**
 * Generate a valid 11-digit NIN with correct Modulus 11 check digit.
 * Retries automatically if check digit would be 10 (invalid).
 */
export function generateValidNin() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const digits = [];
    for (let i = 0; i < 10; i++) {
      digits.push(Math.floor(Math.random() * 10));
    }

    let sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += digits[i] * WEIGHTS[i];
    }

    const remainder = sum % 11;
    const checkDigit = remainder === 0 ? 0 : 11 - remainder;

    // Check digit 10 is invalid (can't be single digit), retry
    if (checkDigit === 10) {
      continue;
    }

    digits.push(checkDigit);
    return digits.join('');
  }

  // Fallback: known valid NIN (astronomically unlikely to reach here)
  return '61961438053';
}

/**
 * Generate a unique email for registration tests.
 * Uses VU ID and iteration to ensure uniqueness across concurrent VUs.
 */
export function generateUniqueEmail(vuId, iteration) {
  return `loadtest+${vuId}_${iteration}_${Date.now()}@test.local`;
}

/**
 * Generate a Nigerian phone number for registration tests.
 */
export function generatePhone() {
  const suffix = Math.floor(Math.random() * 10000000000)
    .toString()
    .padStart(10, '0');
  return `+234${suffix}`;
}
