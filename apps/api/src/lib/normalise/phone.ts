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
 *   - `+2340801234567X`    country code AND local trunk zero (Story 13-57 AC1.2)
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

/**
 * Story 13-57 AC1.1 — THE SHAPE THE DATABASE ACTUALLY ENFORCES.
 *
 * `respondents.phone_number` carries
 * `CHECK (phone_number IS NULL OR phone_number ~ '^\+234\d{10}$')`
 * (`scripts/migrate-input-sanitisation-init.ts:58`). This constant is that
 * constraint, restated where the writers can consult it BEFORE the insert.
 *
 * ⚠️ Callers must test the OUTPUT SHAPE, never enumerate warning codes. The
 * normaliser deliberately returns the raw input on `wrong_length` so a back-fill
 * can flag the row (see the module docblock), and `unknown_mobile_prefix`
 * returns a value that is perfectly storable. A warning is not a verdict about
 * storability; the regex is.
 */
export const RESPONDENT_PHONE_E164 = /^\+234\d{10}$/;

/**
 * The constraint's own name, so a failure can be reported with the thing that
 * would have refused it (Story 13-57 AC2.2) even when the guard fires BEFORE
 * the insert and Postgres therefore never gets to name it itself.
 */
export const RESPONDENT_PHONE_CONSTRAINT = 'chk_respondents_phone_number_e164';

/**
 * True when `value` may be written to `respondents.phone_number` without
 * tripping its CHECK constraint.
 *
 * `null`/`undefined` are storable — the column is nullable. **The EMPTY STRING
 * IS NOT**, and the difference is not pedantry: it was a demonstrated hole in
 * this very guard (code review 2026-08-14, H3).
 *
 * `submitWizardSchema` accepts `phone: z.string().min(10)`, so ten spaces is a
 * valid request body. `normaliseNigerianPhone('          ')` returns
 * `{ value: '', warnings: ['empty_input'] }`, and the wizard wrote that `''`
 * straight into the column — because this function had said it was storable on
 * the grounds that the column is nullable, while the caller was writing `''`
 * rather than `null`. Probed against the real database, the insert returned
 * `23514 chk_respondents_phone_number_e164`: the incident this story exists to
 * end, arriving through the guard installed to end it.
 *
 * ⚠️ A CALLER THAT WANTS "no phone" MUST PASS `null`. Coercing `''` to `null`
 * in here would hide the difference between "they left it blank" and "we could
 * not read what they typed" — the second needs a message, and this story is
 * about not swallowing the second.
 */
export function isStorableNigerianPhone(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  return RESPONDENT_PHONE_E164.test(value);
}

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
  let fromCountryCode = false;
  if (stripped.startsWith('+234')) {
    nsn = stripped.slice(4);
    fromCountryCode = true;
  } else if (stripped.startsWith('234')) {
    nsn = stripped.slice(3);
    fromCountryCode = true;
  } else if (stripped.startsWith('0')) {
    nsn = stripped.slice(1);
  } else {
    return { value: stripped, warnings: ['unknown_format'] };
  }

  if (!/^\d+$/.test(nsn)) {
    return { value: stripped, warnings: ['non_numeric'] };
  }

  /**
   * Story 13-57 AC1.2 — the country code AND the local trunk zero, together.
   *
   * People write their number the way they dial it, and `+234 08120004038` is
   * how a Nigerian writes a number they are also giving to a foreigner. Before
   * this branch that derived an ELEVEN-digit NSN, fell into `wrong_length`, and
   * returned the raw string — which the caller then wrote into a column
   * carrying `CHECK (phone_number ~ '^\+234\d{10}$')`. The insert threw, the
   * submission died silently, and the digits had never been ambiguous.
   *
   * ⚠️ COUNTRY-CODE BRANCHES ONLY. A leading `00` is the international dialling
   * prefix, not a Nigerian local format, so `008120004038` must keep falling
   * through to `wrong_length` rather than being quietly "corrected" into a
   * number the person never wrote.
   */
  if (fromCountryCode && nsn.length === 11 && nsn.startsWith('0')) {
    nsn = nsn.slice(1);
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
