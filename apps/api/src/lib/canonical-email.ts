/**
 * Story 13-13 (code-review AI-7) — the ONE canonical email normalisation shared by the unsubscribe
 * token (sign side, which encrypts this exact string) and the suppression write/read (suppress side,
 * which stores + matches on it). These two MUST agree byte-for-byte: a divergence yields a signed
 * token whose recovered address can never match its own suppression row. A single helper makes that
 * invariant structural rather than coincidental.
 *
 * This is deliberately the bare `.trim().toLowerCase()` (NOT `lib/normalise/email.ts`, which returns
 * a `{ value, warnings }` object + does typo detection): suppression keys must be a pure, side-effect
 * free, lossless lower-case so the same address always maps to the same key.
 */
export function toCanonicalEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}
