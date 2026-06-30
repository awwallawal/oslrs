import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { toCanonicalEmail } from '../lib/canonical-email.js';

/**
 * Story 13-13 (AC6) — stateless, ENCRYPTED unsubscribe tokens.
 *
 * The token carries the recipient address (so the endpoint knows whom to suppress) AES-256-GCM
 * encrypted under a key derived from a server secret. There is NO token table: an unsubscribe is
 * idempotent and low-stakes, so a stateless token is sufficient and avoids storing yet another
 * per-recipient row.
 *
 * Why ENCRYPT, not just sign (code-review AI-4): a signed-but-cleartext token (`base64url(email).hmac`)
 * leaks the recipient's address into every `?token=` that lands in nginx / Cloudflare access logs and
 * Referer headers — decodable by anyone, with no key. For an NDPA-governed registry that puts PII into
 * long-lived log retention. AES-256-GCM makes the address opaque to a log reader while the GCM auth tag
 * provides the same integrity (a forged/tampered/wrong-key token fails authentication → null).
 *
 * Format:  base64url( iv(12) || ciphertext || authTag(16) )    plaintext = canonical email
 *
 * Security properties:
 *   - The address is recoverable ONLY with the secret; a log reader sees opaque bytes.
 *   - GCM authentication means a forged / tampered / wrong-secret / malformed token decrypts to
 *     nothing → verify returns null (the controller maps that to a 4xx and writes nothing).
 *   - Stateless: residual replay of a captured token (forwarded mail / logged URL) only re-suppresses
 *     an opaque address the holder can't read — idempotent, low-stakes, and the passive GET-prefetch
 *     vector is closed separately (controller: only POST mutates).
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGO = 'aes-256-gcm';

/** Lazily read so tests / processes that set the env after import still see it. */
function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) {
    throw new Error(
      'UNSUBSCRIBE_SECRET is not set — required to encrypt/verify one-click unsubscribe tokens (Story 13-13). ' +
        'Set it on the box BEFORE deploy (SEC-3 env-var deploy-safety).',
    );
  }
  return secret;
}

/** Derive a stable 32-byte AES key from the secret (the secret itself is an arbitrary-length string). */
function key(): Buffer {
  return createHash('sha256').update(getSecret()).digest();
}

/**
 * Encrypt an unsubscribe token for `email`. The plaintext is the canonical (lower-cased, trimmed)
 * address so verification recovers exactly the string the suppression row is keyed on.
 */
export function signUnsubscribeToken(email: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(toCanonicalEmail(email), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString('base64url');
}

export interface VerifiedUnsubscribe {
  email: string;
}

/**
 * Verify a token. Returns the encoded `{ email }` on success, or null for any
 * missing / malformed / tampered / wrong-secret token. Never throws on bad input.
 */
export function verifyUnsubscribeToken(token: string | undefined | null): VerifiedUnsubscribe | null {
  if (!token || typeof token !== 'string') return null;

  const buf = Buffer.from(token, 'base64url');
  // Need at least iv + tag + 1 byte of ciphertext (an email is never empty).
  if (buf.length <= IV_BYTES + TAG_BYTES) return null;

  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);

  try {
    const decipher = createDecipheriv(ALGO, key(), iv);
    decipher.setAuthTag(tag);
    const email = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    if (!email) return null;
    return { email };
  } catch {
    // Auth failure (tampered / wrong secret), missing secret, or malformed bytes — fail closed.
    return null;
  }
}
