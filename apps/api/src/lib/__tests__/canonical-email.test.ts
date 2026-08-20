/**
 * Story 13-51 (AC3.3) — the unwrap, and the invariant it must not break.
 *
 * ⛔ This half is GATED on bounce severity (AC3.4). See the SEQUENCING blockquote on the story:
 * making the suppression key match is what turns an inert row into a working permanent exclusion
 * of a registered citizen. These tests describe the unwrap; they do not license shipping it alone.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { toCanonicalEmail, isBareEmail } from '../canonical-email.js';
import { signUnsubscribeToken, verifyUnsubscribeToken } from '../../services/unsubscribe-token.js';

describe('toCanonicalEmail (13-51 AC3.3 — unwrap Name <addr>)', () => {
  it('RED-VERIFY: unwraps the exact prod value that could never match its own lookup', () => {
    // Measured on prod 2026-08-11: `email_suppressions` held the wrapped string while the send
    // path looked up the bare address, so `SELECT count(*) WHERE email='aqeemakolade@gmail.com'`
    // returned 0 with the wrapped row sitting beside it.
    expect(toCanonicalEmail('wahab akeem olaide <aqeemakolade@gmail.com>')).toBe('aqeemakolade@gmail.com');
  });

  it('unwraps the story blockquote form', () => {
    expect(toCanonicalEmail('A B <x@y.com>')).toBe('x@y.com');
  });

  it('leaves a bare address BYTE-IDENTICAL — the property every live token depends on', () => {
    // ⚠️ This is the compatibility assertion. `toCanonicalEmail` is also the unsubscribe-token
    // signing key; if bare addresses moved even slightly, every token in the wild would recover
    // a string that no longer matches its own suppression row.
    for (const e of ['aqeemakolade@gmail.com', 'a.b+tag@sub.domain.co.uk', 'x@y.com']) {
      expect(toCanonicalEmail(e)).toBe(e);
    }
  });

  it('still trims and lower-cases, as it always did', () => {
    expect(toCanonicalEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    expect(toCanonicalEmail('Display Name <Foo@BAR.com>')).toBe('foo@bar.com');
  });

  it('does not maul a value that merely contains angle brackets mid-string', () => {
    // Only an RFC 5322 name-addr — anchored at the END — is unwrapped.
    expect(toCanonicalEmail('a<b>c@d.com')).toBe('a<b>c@d.com');
  });

  it('null / undefined / empty stay empty', () => {
    expect(toCanonicalEmail(null)).toBe('');
    expect(toCanonicalEmail(undefined)).toBe('');
    expect(toCanonicalEmail('   ')).toBe('');
  });
});

describe('unsubscribe-token round-trip survives the unwrap (13-51 AC3.3)', () => {
  const OLD = process.env.UNSUBSCRIBE_SECRET;
  beforeAll(() => {
    process.env.UNSUBSCRIBE_SECRET ??= 'test-secret-for-13-51-round-trip-check';
  });
  afterAll(() => {
    if (OLD === undefined) delete process.env.UNSUBSCRIBE_SECRET;
    else process.env.UNSUBSCRIBE_SECRET = OLD;
  });

  it('a bare address signs and recovers unchanged', () => {
    const email = 'aqeemakolade@gmail.com';
    expect(verifyUnsubscribeToken(signUnsubscribeToken(email))?.email).toBe(email);
  });

  it('a WRAPPED input now signs the bare address — so the token and the suppression row agree', () => {
    // Before the unwrap these two disagreed by construction: the token would carry the wrapped
    // string and the suppression it triggered could never be matched by the reader.
    const recovered = verifyUnsubscribeToken(signUnsubscribeToken('A B <x@y.com>'))?.email;
    expect(recovered).toBe('x@y.com');
    expect(recovered).toBe(toCanonicalEmail('x@y.com'));
  });
});

describe('isBareEmail (13-51 AC3.6 — guard the class)', () => {
  it('accepts the only form a suppression key can match on', () => {
    expect(isBareEmail('x@y.com')).toBe(true);
  });

  it.each([
    ['wrapped', 'A B <x@y.com>'],
    ['uppercase', 'X@Y.com'],
    ['leading space', ' x@y.com'],
    ['internal space', 'a b@y.com'],
    ['angle brackets only', '<x@y.com>'],
    ['empty', ''],
  ])('rejects %s', (_label, value) => {
    expect(isBareEmail(value)).toBe(false);
  });
});
