import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signUnsubscribeToken, verifyUnsubscribeToken } from '../unsubscribe-token.js';

const SECRET = 'test-unsubscribe-secret-13-13';

describe('unsubscribe-token (Story 13-13 AC6) — AES-256-GCM encrypted sign/verify', () => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.UNSUBSCRIBE_SECRET;
    process.env.UNSUBSCRIBE_SECRET = SECRET;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.UNSUBSCRIBE_SECRET;
    else process.env.UNSUBSCRIBE_SECRET = prev;
  });

  it('round-trips an email (lower-cased, trimmed)', () => {
    const token = signUnsubscribeToken('  Person@Example.NG ');
    expect(verifyUnsubscribeToken(token)).toEqual({ email: 'person@example.ng' });
  });

  it('the token does NOT carry the address in cleartext (code-review AI-4 — no PII in logs)', () => {
    const token = signUnsubscribeToken('person@example.ng');
    // base64url-decoding the token (what a log reader can do without the key) must NOT reveal the email.
    expect(Buffer.from(token, 'base64url').toString('utf8')).not.toContain('person@example.ng');
    // ...and two signings of the same address differ (random IV) — not a static, replay-recognisable blob.
    expect(signUnsubscribeToken('person@example.ng')).not.toBe(signUnsubscribeToken('person@example.ng'));
  });

  it('a tampered ciphertext byte → invalid (GCM authentication fails)', () => {
    const token = signUnsubscribeToken('victim@b.ng');
    const buf = Buffer.from(token, 'base64url');
    buf[12] = buf[12] ^ 0xff; // flip the first ciphertext byte (after the 12-byte IV)
    expect(verifyUnsubscribeToken(buf.toString('base64url'))).toBeNull();
  });

  it('a token encrypted with a DIFFERENT secret → invalid', () => {
    const token = signUnsubscribeToken('a@b.ng');
    process.env.UNSUBSCRIBE_SECRET = 'a-completely-different-secret';
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it('missing / malformed tokens → null, never throws', () => {
    expect(verifyUnsubscribeToken(undefined)).toBeNull();
    expect(verifyUnsubscribeToken(null)).toBeNull();
    expect(verifyUnsubscribeToken('')).toBeNull();
    expect(verifyUnsubscribeToken('too-short')).toBeNull();
    expect(verifyUnsubscribeToken('!!notbase64!!')).toBeNull();
    expect(verifyUnsubscribeToken('a'.repeat(80))).toBeNull(); // right length, garbage bytes → auth fails
  });

  it('verify fails closed when the secret is absent', () => {
    const token = signUnsubscribeToken('a@b.ng');
    delete process.env.UNSUBSCRIBE_SECRET;
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it('sign throws when the secret is absent (caller must configure it)', () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    expect(() => signUnsubscribeToken('a@b.ng')).toThrow(/UNSUBSCRIBE_SECRET/);
  });
});
