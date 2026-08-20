/**
 * Story 13-51 (AC1.2 / AC1.4) — WHICH KIND OF BROKEN IS THIS ADDRESS?
 *
 * A suppression list that shows eleven addresses in one column invites one response to all of
 * them, and they need three different ones. This is a PURE, EXPORTED, TESTED function and not a
 * judgement rendered in JSX, because a rule that lives inside a component cannot be RED-verified
 * and cannot be reused by 13-42's digest line.
 *
 *   `provider_artefact`  NOBODY TYPED THIS AND IT NEVER PASSED THROUGH A CAPTURE FORM.
 *                        `'wahab akeem olaide <aqeemakolade@gmail.com>'` arrives in the PROVIDER'S
 *                        bounce payload: the same `message_id` carries the bare address on `sent`
 *                        and `delivered` and the wrapped form on `bounced` (2 of 25 bounces, 8%;
 *                        0 of 1,949 sent/delivered). Across `users` ∪ `wizard_drafts` ∪
 *                        `magic_link_tokens` ∪ `campaign_sends`, ZERO values contain an angle
 *                        bracket, a space or an uppercase character. It is fixed at the inlet
 *                        (AC3.3) and NEVER by asking an operator to retype it.
 *
 *   `capture_typo`       OUR data problem. `asirusakirat@gmail.come` — someone typed it, and a
 *                        human can still fix it. This is the only bucket a correction UI applies
 *                        to.
 *
 *   `plausibly_dead`     THEIR mailbox. A well-formed address at a real domain that bounces is
 *                        not ours to retype.
 *
 * ⚠️ ORDER IS LOAD-BEARING: `provider_artefact` IS TESTED FIRST.
 * A wrapped address is ALSO a "malformed-looking" string, so a rule ordered the other way
 * silently reclassifies AC1.2's third bucket back into the first — and the first bucket's whole
 * purpose is to put an address in front of an operator to retype. Reorder these branches and you
 * ask a human to hand-fix a string the provider invented.
 *
 * ⚠️ THE DEFAULT IS "THEIRS", NOT "OURS". `plausibly_dead` is what an unrecognised domain gets.
 * Guessing "ours" invites an operator to retype an address that was never wrong, and the cost of
 * that mistake is a citizen's contact record.
 */
import { isBareEmail } from './canonical-email.js';
import { isKnownTypoDomain, correctionForTypoDomain } from './normalise/email.js';

export type SuppressedAddressBucket = 'provider_artefact' | 'capture_typo' | 'plausibly_dead';

export function classifySuppressedAddress(email: string | null | undefined): SuppressedAddressBucket {
  // ⚠️ NOT pre-trimmed: stray whitespace is itself an artefact signature, and trimming it here
  // would launder a non-bare key into the "our typo" bucket an operator is asked to retype.
  const raw = email ?? '';

  // 1. PROVIDER ARTEFACT — FIRST, ALWAYS. See the ordering note above.
  if (!isBareEmail(raw)) return 'provider_artefact';

  // 2. CAPTURE TYPO — bare, but the domain is one the dictionary already calls wrong.
  const at = raw.lastIndexOf('@');
  if (at > 0 && at < raw.length - 1) {
    const domain = raw.slice(at + 1).toLowerCase();
    if (isKnownTypoDomain(domain)) return 'capture_typo';
  }

  // 3. Everything else is THEIRS.
  return 'plausibly_dead';
}

/**
 * The address we would SUGGEST for a `capture_typo`, or null. A suggestion, never an application:
 * "never auto-correct a citizen's contact details without showing them."
 */
export function suggestCorrectionFor(email: string | null | undefined): string | null {
  const raw = (email ?? '').trim().toLowerCase();
  if (classifySuppressedAddress(raw) !== 'capture_typo') return null;
  const at = raw.lastIndexOf('@');
  const corrected = correctionForTypoDomain(raw.slice(at + 1));
  return corrected ? `${raw.slice(0, at)}@${corrected}` : null;
}
