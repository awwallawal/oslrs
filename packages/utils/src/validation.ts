/**
 * Verhoeff algorithm implementation
 * Used for validating and generating checksums for NIN.
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
