import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { ipKeyGenerator } from 'express-rate-limit';
import {
  buildLoginRateLimitKey,
  LOGIN_RATE_LIMIT_PREFIX,
  LOGIN_IP_FLOOD_PREFIX,
  STRICT_LOGIN_RATE_LIMIT_PREFIX,
} from '../login-rate-limit.js';

/**
 * Story 13-68 — login rate limiting by person, not by proxy.
 *
 * `loginRateLimit` was 5 failed attempts / 15 min **per IP**. Opera Mini proxies every user
 * through a handful of servers (the activation limiter logged 244 refusals from SIX of them,
 * 2026-09-07/08) and carrier CGNAT does the same, so that budget was shared between strangers:
 * one enumerator typing the wrong address five times locked out everyone behind their proxy.
 *
 * The key is now the submitted email. The first two cases below ARE the defect — restore the
 * old IP key and both fail. The IP fallback stays for requests that carry no email (the MFA
 * step-2 routes, whose body is `{ mfaChallengeToken, code }`).
 */
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('buildLoginRateLimitKey', () => {
  it('⛔ gives two people behind ONE proxy IP separate budgets (the Opera Mini case)', () => {
    const operaMiniIp = '141.0.12.87';
    const a = buildLoginRateLimitKey('enumerator.a@gmail.com', operaMiniIp);
    const b = buildLoginRateLimitKey('enumerator.b@gmail.com', operaMiniIp);
    expect(a).not.toBe(b);
  });

  it('⛔ gives one email ONE budget from two different IPs (a phone changing network, or an attacker rotating IPs)', () => {
    const a = buildLoginRateLimitKey('enumerator.a@gmail.com', '41.58.1.1');
    const b = buildLoginRateLimitKey('enumerator.a@gmail.com', '105.119.15.131');
    expect(a).toBe(b);
  });

  it('keys on the email — as a sha256 of the normalised address', () => {
    expect(buildLoginRateLimitKey('user@example.com', '1.2.3.4')).toBe(`e:${sha256('user@example.com')}`);
  });

  it('normalises case and surrounding whitespace so A@X.com, a@x.com and "  a@x.com  " are ONE bucket', () => {
    const keys = ['A@X.com', 'a@x.com', '  a@x.com  '].map((e) => buildLoginRateLimitKey(e, '1.2.3.4'));
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe(`e:${sha256('a@x.com')}`);
  });

  /**
   * Adversarial review 2026-09-16, H2. The body limit is 1 MB and this key is written before the controller
   * validates anything, so a raw-email key let one IP park megabyte-sized keys in the Redis that BullMQ and the
   * sessions share — and put every login address in Redis in plaintext. The key is a fixed-size digest.
   */
  it('⛔ a megabyte "email" still yields a fixed-size key, and no address is ever stored in plaintext', () => {
    const huge = `${'a'.repeat(1024 * 1024)}@x.com`;
    const hugeKey = buildLoginRateLimitKey(huge, '1.2.3.4');
    const normalKey = buildLoginRateLimitKey('enumerator.a@gmail.com', '1.2.3.4');
    expect(hugeKey).toHaveLength(2 + 64);
    expect(normalKey).toHaveLength(2 + 64);
    expect(normalKey).not.toContain('enumerator');
    expect(normalKey).not.toContain('@');
  });

  it('falls back to the IP when there is no email (the MFA step-2 body)', () => {
    expect(buildLoginRateLimitKey(undefined, '1.2.3.4')).toBe('ip:1.2.3.4');
  });

  it('falls back to the IP for a blank or non-string email, so a malformed body cannot bypass the limiter', () => {
    expect(buildLoginRateLimitKey('', '1.2.3.4')).toBe('ip:1.2.3.4');
    expect(buildLoginRateLimitKey('   ', '1.2.3.4')).toBe('ip:1.2.3.4');
    expect(buildLoginRateLimitKey(12345, '1.2.3.4')).toBe('ip:1.2.3.4');
    expect(buildLoginRateLimitKey(null, '1.2.3.4')).toBe('ip:1.2.3.4');
    expect(buildLoginRateLimitKey(['a@x.com'], '1.2.3.4')).toBe('ip:1.2.3.4');
  });

  /**
   * An IPv6 subscriber is handed a whole prefix; keying the raw address would let them mint a
   * fresh bucket per request by rotating the low bits. `ipKeyGenerator` collapses to the /56.
   * The library's ERR_ERL_KEY_GEN_IPV6 warning is a toString() grep — this test is the proof.
   */
  it('collapses two IPv6 addresses in ONE /56 to one key on the fallback', () => {
    const a = buildLoginRateLimitKey(undefined, '2001:db8:abcd:1200::1');
    const b = buildLoginRateLimitKey(undefined, '2001:db8:abcd:12ff:ffff:ffff:ffff:fffe');
    expect(a).toBe(b);
  });

  it('keeps two DIFFERENT IPv6 prefixes apart on the fallback', () => {
    const a = buildLoginRateLimitKey(undefined, '2001:db8:abcd:1200::1');
    const b = buildLoginRateLimitKey(undefined, '2001:db8:abcd:1300::1');
    expect(a).not.toBe(b);
  });

  it('does not throw when the IP is missing', () => {
    expect(() => buildLoginRateLimitKey(undefined, undefined)).not.toThrow();
    expect(buildLoginRateLimitKey(undefined, undefined)).toMatch(/^ip:/);
  });
});

/**
 * The three login limiters share ONE Redis, and rate-limit-redis stores each count at
 * `${prefix}${key}`. Two limiters that can produce the same string are one counter, counted twice.
 *
 * That is not hypothetical: with the flood ceiling at prefix `rl:login:ip:` (raw IP key) and
 * `loginRateLimit` at (then) `rl:login:` falling back to `ip:<addr>`, both write `rl:login:ip:<addr>` — on
 * EVERY request to the MFA step-2 routes, which carry no email. The burst limiter's
 * skipSuccessfulRequests decrement would then subtract from the flood counter, and the flood's
 * every-request increment would push the burst limiter toward counting successes again.
 * The in-memory store used by the binding test gives each limiter its own map, so only this test
 * can see it.
 */
describe('login limiter Redis keyspaces never overlap', () => {
  const ips = ['141.0.12.87', '2001:db8:abcd:1200::1', 'unknown'];

  function fullKeys(ip: string) {
    return {
      loginByEmail: LOGIN_RATE_LIMIT_PREFIX + buildLoginRateLimitKey('person@example.com', ip),
      loginByIp: LOGIN_RATE_LIMIT_PREFIX + buildLoginRateLimitKey(undefined, ip),
      // Flood and strict use the library's default keyGenerator: ipKeyGenerator(req.ip, 56).
      flood: LOGIN_IP_FLOOD_PREFIX + ipKeyGenerator(ip),
      strict: STRICT_LOGIN_RATE_LIMIT_PREFIX + ipKeyGenerator(ip),
    };
  }

  it.each(ips)('no two limiters produce the same Redis key for %s', (ip) => {
    const keys = Object.values(fullKeys(ip));
    expect(new Set(keys).size).toBe(keys.length);
  });

  /**
   * ⛔ REWRITTEN BY STORY 13-70 FR2, and the rewrite is the point.
   *
   * This used to read `if (b.startsWith(a)) { ...assert the remainder is not a key shape... }` — it
   * TOLERATED `rl:login:` being nested inside `rl:login:strict:`, and asserted the nesting was
   * harmless because `loginRateLimit`'s keys always begin `e:` or `ip:`. That was true, and it was a
   * safety that depended on another limiter's key SHAPE: one refactor of the key builder away from
   * being untrue, silently. The same shape HAD already gone wrong twice in this family
   * (`rl:activation:`, `rl:password-reset-complete:`), both of them LIVE collisions.
   *
   * `rl:login:burst:` and `rl:login:strict:` are now siblings, so the property is structural and the
   * conditional body is gone. ⚠️ Note what the OLD form would do today: with no nested pair left to
   * match, `if (b.startsWith(a))` never fires and the test passes having asserted nothing at all
   * [[pattern-a-clean-result-must-prove-it-measured]]. An unconditional assertion cannot do that.
   *
   * The repo-wide version of this property — over all 30 limiter prefixes, not these three — is
   * `rate-limit-prefix-disjointness.test.ts`.
   */
  it('no prefix is nested inside another limiter\'s prefix (so no future key shape can collide)', () => {
    const prefixes = [LOGIN_RATE_LIMIT_PREFIX, LOGIN_IP_FLOOD_PREFIX, STRICT_LOGIN_RATE_LIMIT_PREFIX];
    const nested: string[] = [];
    for (const a of prefixes) {
      for (const b of prefixes) {
        if (a === b) continue;
        if (b.startsWith(a)) nested.push(`${a} is a proper prefix of ${b}`);
      }
    }
    expect(nested).toEqual([]);
  });
});
