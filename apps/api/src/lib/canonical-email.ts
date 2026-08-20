/**
 * Story 13-13 (code-review AI-7) — the ONE canonical email normalisation shared by the unsubscribe
 * token (sign side, which encrypts this exact string) and the suppression write/read (suppress side,
 * which stores + matches on it). These two MUST agree byte-for-byte: a divergence yields a signed
 * token whose recovered address can never match its own suppression row. A single helper makes that
 * invariant structural rather than coincidental.
 *
 * This is deliberately a pure, side-effect free, lossless lower-casing (NOT `lib/normalise/email.ts`,
 * which returns a `{ value, warnings }` object + does typo detection): suppression keys must map the
 * same address to the same key every time.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * Story 13-51 (AC3.3) — IT NOW UNWRAPS `Display Name <addr@dom>`, AND THAT IS THE POINT.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * The webhook inlet stored the provider's RAW recipient while this reader looked up the bare
 * address, so the two could never meet. Measured on prod 2026-08-11:
 *
 *   `email_suppressions` held  'wahab akeem olaide <aqeemakolade@gmail.com>'
 *   the send path looked up    'aqeemakolade@gmail.com'
 *   SELECT count(*) WHERE email = 'aqeemakolade@gmail.com'  →  **0**
 *
 * A suppression row that is not a bare address is a row that cannot function. It sat inert for
 * months while appearing, to anyone reading the table, to be doing its job.
 *
 * ⚠️ NOBODY TYPED THAT STRING. It is not a capture defect and no operator should ever be asked to
 * retype it: across `users` ∪ `wizard_drafts` ∪ `magic_link_tokens` ∪ `campaign_sends`, ZERO values
 * contain an angle bracket, a space or an uppercase character, and `campaign_sends` holds the clean
 * address. It arrives in the PROVIDER'S bounce payload — the same `message_id` carries the bare
 * address on `sent`/`delivered` and the wrapped form on `bounced` (2 of 25 bounces, 8%; 0 of 1,949
 * sent/delivered). So it is fixed HERE, at the inlet, and never by hand.
 *
 * ⛔ THIS CHANGE MUST NOT SHIP WITHOUT THE BOUNCE-SEVERITY WORK (AC3.4, `lib/bounce-severity.ts`).
 * Read the SEQUENCING blockquote on story 13-51. Making the key match converts that inert row into
 * a WORKING, PERMANENT exclusion of a registered citizen on the strength of one SOFT bounce —
 * `aqeemakolade@gmail.com` is reachable today only because this bug masks that one. Severity first,
 * or in the same commit; if only one can ship, ship neither.
 *
 * ⚠️ IT IS ALSO THE UNSUBSCRIBE-TOKEN SIGNING KEY. Round-trip re-verified for 13-51:
 * `verifyUnsubscribeToken` DECRYPTS the plaintext and returns it as-is — it never re-canonicalises
 * — so every token already in the wild recovers exactly what it was signed with. A bare address is
 * byte-identical before and after this change, and the send path has never produced a wrapped one,
 * so no live token's meaning moves.
 */

/**
 * `Display Name <addr@dom>` → `addr@dom`. Anchored at the END of the string, and the captured span
 * may not itself contain angle brackets, so this takes the address of an RFC 5322 name-addr and
 * leaves anything else alone.
 */
const NAME_ADDR = /<([^<>]+)>\s*$/;

export function toCanonicalEmail(email: string | null | undefined): string {
  const raw = (email ?? '').trim();
  const wrapped = NAME_ADDR.exec(raw);
  return (wrapped ? wrapped[1]! : raw).trim().toLowerCase();
}

/**
 * Story 13-51 (AC3.6) — is this value in BARE form, i.e. the only form a suppression key can
 * actually match on?
 *
 * 🔒 GUARD THE CLASS, NOT THE ROW. The 8% non-bare rate is a property of the PROVIDER'S payloads
 * and can change without notice, so backfilling the one wrapped row is the smaller half of the
 * fix — this predicate is the half that makes the next one fail loudly instead of sitting inert
 * for months. A value is bare when canonicalising it is a no-op.
 */
export function isBareEmail(value: string | null | undefined): boolean {
  const raw = value ?? '';
  if (!raw) return false;
  // ⚠️ COMPARED UNTRIMMED, DELIBERATELY. "Bare" means canonicalising it is a NO-OP, so a value
  // that only becomes bare after trimming is not bare — it is a key that would be stored in one
  // form and looked up in another, which is the entire defect this predicate exists to catch.
  // ⚠️ BOTH CONDITIONS ARE LOAD-BEARING.
  //  - `raw === toCanonicalEmail(raw)` catches everything canonicalisation WOULD change
  //    (uppercase, a display-name wrapper, surrounding whitespace).
  //  - the character test catches what it would NOT change, and that is the more dangerous
  //    class: an INTERNAL space survives trim+lowercase untouched, so canonicalising is a no-op
  //    and the value still cannot be an address. A key that normalisation cannot repair is
  //    exactly the one that must never reach the table.
  return raw === toCanonicalEmail(raw) && !/[\s<>]/.test(raw);
}
