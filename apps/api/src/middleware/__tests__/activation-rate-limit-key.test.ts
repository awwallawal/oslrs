import { describe, it, expect } from 'vitest';
import { buildActivationRateLimitKey } from '../registration-rate-limit.js';

/**
 * ⛔ REGRESSION GUARD — the prod defect of 2026-09-07/08.
 *
 * Activation was limited to 10 attempts / 15 min **per IP**. On prod that
 * produced **244 refusals from SIX addresses**, and reverse DNS named them:
 *
 *     114  185.26.181.66   →  n17-04-01-v04.opera-mini.net   (NO-OPERA-AMS-LB)
 *      85  141.0.12.87     →  n24-01-11.opera-mini.net       (NO-OPERA-AMS-MINI)
 *
 * **Opera Mini proxies every user through a handful of servers**, and it is one
 * of the most-used mobile browsers in Nigeria. So the budget was shared between
 * strangers: a few of the 17 field enumerators invited on 2026-09-06 exhausted
 * the allowance for everyone else behind that proxy.
 *
 * The property that matters is the one asserted first below: **two people behind
 * ONE proxy IP must get SEPARATE budgets.** Delete the token branch and that
 * test fails — which is the only guarantee worth having, since the library's own
 * IPv6 validator is a `toString()` grep and proves nothing about behaviour.
 */
describe('buildActivationRateLimitKey', () => {
  it('⛔ gives two people behind ONE proxy IP separate budgets (the Opera Mini case)', () => {
    const operaMiniIp = '141.0.12.87';

    const enumeratorA = buildActivationRateLimitKey('token-aaa', operaMiniIp);
    const enumeratorB = buildActivationRateLimitKey('token-bbb', operaMiniIp);

    expect(enumeratorA).not.toBe(enumeratorB);
  });

  it('keys on the invitation token when present, ignoring the IP entirely', () => {
    // Same person, two different networks (wifi -> mobile) is still ONE budget.
    expect(buildActivationRateLimitKey('tok-1', '1.2.3.4')).toBe('t:tok-1');
    expect(buildActivationRateLimitKey('tok-1', '9.9.9.9')).toBe('t:tok-1');
  });

  it('trims the token so whitespace cannot mint a second budget', () => {
    expect(buildActivationRateLimitKey('  tok-1  ', '1.2.3.4')).toBe('t:tok-1');
  });

  it('falls back to the IP when there is no usable token', () => {
    expect(buildActivationRateLimitKey(undefined, '1.2.3.4')).toBe('ip:1.2.3.4');
    expect(buildActivationRateLimitKey('', '1.2.3.4')).toBe('ip:1.2.3.4');
    expect(buildActivationRateLimitKey('   ', '1.2.3.4')).toBe('ip:1.2.3.4');
    expect(buildActivationRateLimitKey(12345, '1.2.3.4')).toBe('ip:1.2.3.4');
  });

  /**
   * An IPv6 subscriber holds a whole prefix, so keying the raw address lets one
   * person mint a fresh bucket per request simply by rotating their low bits.
   * `ipKeyGenerator` collapses to the /56. This is the behavioural proof; the
   * library's ERR_ERL_KEY_GEN_IPV6 warning is a source-text grep and is not.
   */
  it('collapses an IPv6 /56 to one key on the fallback path', () => {
    const a = buildActivationRateLimitKey(undefined, '2001:db8:abcd:0012::1');
    const b = buildActivationRateLimitKey(undefined, '2001:db8:abcd:0012::99ff');
    expect(a).toBe(b);
  });

  it('keeps genuinely different IPv6 prefixes APART (the other direction)', () => {
    // A guard that lumped everyone into one bucket would satisfy the test above
    // just as happily — one-directional guards license the opposite failure.
    const a = buildActivationRateLimitKey(undefined, '2001:db8:abcd:0012::1');
    const b = buildActivationRateLimitKey(undefined, '2001:db8:ffff:0099::1');
    expect(a).not.toBe(b);
  });
});
