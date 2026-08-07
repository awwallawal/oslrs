import { describe, it, expect } from 'vitest';
import { buildRegistrationEmailRateLimitKey } from '../registration-rate-limit.js';

/**
 * 2026-08-07 — the IPv6 bypass in the per-email registration limiter.
 *
 * The limiter shipped keying its IP fallback on the RAW address. express-rate-limit flagged it
 * (`ERR_ERL_KEY_GEN_IPV6`, 9 times in the prod error log, once per boot) and the flag was right: an
 * IPv6 subscriber normally holds a whole prefix, so rotating the low bits of their own address mints
 * a fresh bucket on every request and the limit never binds.
 *
 * ⚠️ **These tests deliberately do NOT assert that the library stops warning.** That warning is a
 * `toString()` grep over the keyGenerator source for `req.ip` — it can be silenced by renaming a
 * variable while the bypass stays wide open. A test written against it would be green over a hole
 * ([[pattern-test-that-passes-over-a-hole]]). The property that matters is the one below: **two
 * different addresses inside one /56 must produce ONE key.**
 */
describe('buildRegistrationEmailRateLimitKey', () => {
  describe('the email key — the control that actually matches the threat', () => {
    it('keys on the email when present', () => {
      expect(buildRegistrationEmailRateLimitKey('a@x.com', '1.2.3.4')).toBe('e:a@x.com');
    });

    it('lowercases and trims, so a capital or a stray space is not a fresh bucket', () => {
      const canonical = buildRegistrationEmailRateLimitKey('a@x.com', '1.2.3.4');
      expect(buildRegistrationEmailRateLimitKey('A@X.com', '1.2.3.4')).toBe(canonical);
      expect(buildRegistrationEmailRateLimitKey('  a@x.com  ', '1.2.3.4')).toBe(canonical);
    });

    it('ignores the IP entirely when an email is present — CGNAT must not merge two people', () => {
      expect(buildRegistrationEmailRateLimitKey('a@x.com', '102.88.1.1')).toBe(
        buildRegistrationEmailRateLimitKey('a@x.com', '197.211.9.9'),
      );
    });

    it('falls back to IP for a non-string, empty, or whitespace-only email', () => {
      for (const bad of [undefined, null, '', '   ', 42, {}, []]) {
        expect(buildRegistrationEmailRateLimitKey(bad, '1.2.3.4')).toBe('ip:1.2.3.4');
      }
    });
  });

  describe('the IPv6 fallback — THIS is the fix; deleting ipKeyGenerator must fail here', () => {
    it('collapses two addresses in the SAME /56 to ONE key', () => {
      const a = buildRegistrationEmailRateLimitKey(undefined, '2001:db8:abcd:0000::1');
      const b = buildRegistrationEmailRateLimitKey(undefined, '2001:db8:abcd:0000::9999');
      expect(a).toBe(b);
    });

    it('collapses across the whole /56, not merely the /64 — the low 8 bits of the 4th group', () => {
      const a = buildRegistrationEmailRateLimitKey(undefined, '2001:db8:abcd:0000::1');
      const b = buildRegistrationEmailRateLimitKey(undefined, '2001:db8:abcd:00ff::1');
      expect(a).toBe(b);
    });

    it('still SEPARATES genuinely different prefixes — the fix must not collapse everyone into one bucket', () => {
      const a = buildRegistrationEmailRateLimitKey(undefined, '2001:db8:abcd:0000::1');
      const b = buildRegistrationEmailRateLimitKey(undefined, '2001:db8:ffff:0000::1');
      expect(a).not.toBe(b);
    });

    it('emits a subnet-shaped key, not a bare address', () => {
      expect(buildRegistrationEmailRateLimitKey(undefined, '2001:db8:abcd:0000::1')).toMatch(
        /^ip:.+\/56$/,
      );
    });
  });

  describe('the IPv4 and degenerate paths must be untouched by the fix', () => {
    it('passes IPv4 through unchanged — Nigerian mobile is overwhelmingly IPv4 CGNAT', () => {
      expect(buildRegistrationEmailRateLimitKey(undefined, '102.88.1.1')).toBe('ip:102.88.1.1');
    });

    it('keeps IPv4 addresses distinct from one another', () => {
      expect(buildRegistrationEmailRateLimitKey(undefined, '102.88.1.1')).not.toBe(
        buildRegistrationEmailRateLimitKey(undefined, '102.88.1.2'),
      );
    });

    it('survives an undefined ip without throwing — Express can omit it behind a proxy', () => {
      expect(buildRegistrationEmailRateLimitKey(undefined, undefined)).toBe('ip:unknown');
    });

    it('normalises an IPv4-mapped IPv6 address rather than treating it as a separate person', () => {
      expect(buildRegistrationEmailRateLimitKey(undefined, '::ffff:102.88.1.1')).toBe(
        'ip:102.88.1.1',
      );
    });
  });
});
