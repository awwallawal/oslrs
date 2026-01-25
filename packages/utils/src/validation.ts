/**
 * Checksum validation algorithms for NIN and other identifiers.
 */

/**
 * Modulus 11 algorithm implementation
 * Used for validating Nigerian National Identification Numbers (NIN).
 *
 * Algorithm:
 * 1. Multiply first 10 digits by weights 10, 9, 8, 7, 6, 5, 4, 3, 2, 1
 * 2. Sum all products
 * 3. Calculate remainder: sum mod 11
 * 4. Check digit = 11 - remainder (if result is 11, use 0)
 * 5. Compare with the 11th digit
 */
export function modulus11Check(input: string): boolean {
  if (!/^\d{11}$/.test(input)) {
    return false;
  }

  const digits = input.split('').map(Number);
  const weights = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

  // Calculate weighted sum of first 10 digits
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += digits[i] * weights[i];
  }

  // Calculate expected check digit
  const remainder = sum % 11;
  const expectedCheckDigit = remainder === 0 ? 0 : 11 - remainder;

  // For Modulus 11, if check digit would be 10, it's typically invalid
  // But Nigerian NIN uses 0 when remainder is 0 (11 - 0 = 11 → 0)
  if (expectedCheckDigit === 11) {
    return digits[10] === 0;
  }

  // Check digit 10 would be invalid (can't be single digit)
  if (expectedCheckDigit === 10) {
    return false;
  }

  return digits[10] === expectedCheckDigit;
}

/**
 * Generates a Modulus 11 check digit and appends it to a 10-digit input.
 */
export function modulus11Generate(input: string): string {
  if (!/^\d{10}$/.test(input)) {
    throw new Error('Input must be exactly 10 digits');
  }

  const digits = input.split('').map(Number);
  const weights = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += digits[i] * weights[i];
  }

  const remainder = sum % 11;
  const checkDigit = remainder === 0 ? 0 : 11 - remainder;

  // If check digit would be 10, this base number cannot have a valid check digit
  if (checkDigit === 10) {
    throw new Error('This base number cannot have a valid Modulus 11 check digit');
  }

  return input + checkDigit;
}

/**
 * Verhoeff algorithm implementation
 * Kept for backwards compatibility and testing purposes.
 */

const multiplicationTable = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const permutationTable = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const inverseTable = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * Validates a string using the Verhoeff algorithm.
 * @param input Numeric string (e.g. "12345678901"). Must check length separately.
 * @returns {boolean} True if checksum is valid
 */
export function verhoeffCheck(input: string): boolean {
  if (!/^\d+$/.test(input)) {
    return false;
  }

  let c = 0;
  const invertedArray = input.split('').map(Number).reverse();

  for (let i = 0; i < invertedArray.length; i++) {
    c = multiplicationTable[c][permutationTable[i % 8][invertedArray[i]]];
  }

  return c === 0;
}

/**
 * Generates a Verhoeff check digit and appends it to the input string.
 */
export function verhoeffGenerate(input: string): string {
  let c = 0;
  const invertedArray = input.split('').map(Number).reverse();

  for (let i = 0; i < invertedArray.length; i++) {
    c = multiplicationTable[c][permutationTable[(i + 1) % 8][invertedArray[i]]];
  }

  return input + inverseTable[c];
}
