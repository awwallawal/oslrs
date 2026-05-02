/**
 * Nigerian phone number normaliser.
 *
 * Accepts inputs in common Nigerian formats and returns a canonical E.164
 * representation: `+234XXXXXXXXXX` (13 chars total). Strips spaces, dashes,
 * and parentheses before parsing.
 *
 * Recognised inputs (last 10 digits = NSN):
 *   - `0801234567X`        local trunk-prefixed (drops leading 0)
 *   - `+234801234567X`     E.164 already
 *   - `234801234567X`      E.164 without `+`
 *   - `234 801 234 567X`   space-separated (any of the above)
 *
 * Recognised mobile prefixes (NSN first two digits): 70, 80, 81, 90, 91.
 * Inputs that don't match a known prefix are NOT rejected — the canonical
 * value is still returned so the row is not lost — but a warning is emitted
 * so the audit-log viewer can surface the row for review.
 *
 * Warning codes:
 *   - empty_input
 *   - non_numeric                   (after strip, contains non-digits)
 *   - unknown_format                (cannot derive a 10-digit NSN)
 *   - wrong_length:expected_10_got_N
 *   - unknown_mobile_prefix:<NN>    (NSN[0..2] not in known mobile prefixes)
 */

import type { NormaliseResult } from './types.js';

const KNOWN_MOBILE_PREFIXES = new Set(['70', '80', '81', '90', '91']);

export function normaliseNigerianPhone(input: unknown): NormaliseResult {
  if (typeof input !== 'string' || input.trim() === '') {
    return { value: '', warnings: ['empty_input'] };
  }

  // Strip cosmetic characters (spaces, dashes, parens, dots).
  // Preserve leading `+` so the country-code branch can detect it.
  const stripped = input.trim().replace(/[\s\-().]/g, '');
  if (stripped === '') {
    return { value: '', warnings: ['empty_input'] };
  }

  // Derive the 10-digit National Significant Number (NSN).
  let nsn: string;
  if (stripped.startsWith('+234')) {
    nsn = stripped.slice(4);
  } else if (stripped.startsWith('234')) {
    nsn = stripped.slice(3);
  } else if (stripped.startsWith('0')) {
    nsn = stripped.slice(1);
  } else {
    return { value: stripped, warnings: ['unknown_format'] };
  }

  if (!/^\d+$/.test(nsn)) {
    return { value: stripped, warnings: ['non_numeric'] };
  }

  const warnings: string[] = [];

  if (nsn.length !== 10) {
    warnings.push(`wrong_length:expected_10_got_${nsn.length}`);
    // Return the canonical-attempt anyway so back-fill can flag the row.
    return { value: stripped, warnings };
  }

  const prefix = nsn.slice(0, 2);
  if (!KNOWN_MOBILE_PREFIXES.has(prefix)) {
    warnings.push(`unknown_mobile_prefix:${prefix}`);
  }

  return { value: `+234${nsn}`, warnings };
}
