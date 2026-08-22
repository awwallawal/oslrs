import { describe, it, expect } from 'vitest';
import {
  buildWizardDraftRateLimitKey,
  WIZARD_DRAFT_IP_MAX,
  WIZARD_DRAFT_EMAIL_MAX,
  WIZARD_DRAFT_WINDOW_MS,
} from '../wizard-draft-rate-limit.js';

/**
 * Story 13-46 (AC4) — the draft limiter re-sized and re-keyed for a CGNAT audience.
 *
 * WHY IT MATTERS MORE THAN THE SUBMIT LIMITER: this one fails FIRST and SILENTLY. A refused submit
 * shows the citizen an error they can report (and one did). A refused autosave just loses the
 * draft, and a lost draft is indistinguishable from a user who "just didn't finish".
 */
describe('buildWizardDraftRateLimitKey (13-46 AC4)', () => {
  it('keys on the normalised email from the PUT body', () => {
    expect(buildWizardDraftRateLimitKey({ email: 'A@Example.COM ' }, undefined, '1.2.3.4')).toBe(
      'e:a@example.com',
    );
  });

  it('keys on the email from the GET query too — hydration takes the same limiter', () => {
    expect(buildWizardDraftRateLimitKey(undefined, { email: 'B@Example.com' }, '1.2.3.4')).toBe(
      'e:b@example.com',
    );
  });

  it('falls back to the IP when no email is present, so an omitted field cannot bypass it', () => {
    expect(buildWizardDraftRateLimitKey({}, {}, '1.2.3.4')).toBe('ip:1.2.3.4');
  });

  it('COLLAPSES an IPv6 subscriber prefix to ONE bucket', () => {
    // ⚠️ The property that matters. An IPv6 subscriber is handed a whole prefix; rotating the low
    // bits would otherwise mint a fresh bucket per request. Delete the `ipKeyGenerator` call in the
    // builder and THIS test fails — which is the only proof worth having, because the library's own
    // ERR_ERL_KEY_GEN_IPV6 check is a `toString()` grep over the source and can be silenced without
    // changing behaviour ([[pattern-test-that-passes-over-a-hole]]).
    const a = buildWizardDraftRateLimitKey({}, {}, '2001:db8:1234:5600::1');
    const b = buildWizardDraftRateLimitKey({}, {}, '2001:db8:1234:5600::dead:beef');

    expect(a).toBe(b);
  });

  it('does not collapse two DIFFERENT /56 prefixes into one bucket', () => {
    const a = buildWizardDraftRateLimitKey({}, {}, '2001:db8:1234:5600::1');
    const b = buildWizardDraftRateLimitKey({}, {}, '2001:db8:9999:5600::1');

    expect(a).not.toBe(b);
  });
});

describe('draft limiter sizing (13-46 AC4)', () => {
  it('gives one person room for a full debounced session', () => {
    // 2-second-debounced autosave over a 10-15 minute wizard: typical 20-60 saves, theoretical
    // worst case ~450 for someone typing continuously for the whole window. The per-email ceiling
    // must sit above the typical band by a wide margin — a citizen must never lose a draft.
    expect(WIZARD_DRAFT_EMAIL_MAX).toBeGreaterThanOrEqual(300);
  });

  it('raises the per-IP ceiling well past the retired "~5 wizards per shared NAT" assumption', () => {
    // The old 120/IP/15min was exhausted by roughly 2-6 concurrent wizards behind ONE carrier IP
    // (120 ÷ 20-60 saves). A state-wide jingle invalidates that by construction.
    expect(WIZARD_DRAFT_IP_MAX).toBeGreaterThanOrEqual(1_000);
  });

  it('keeps the 15-minute window (the limiters are compared against each other by operators)', () => {
    expect(WIZARD_DRAFT_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});
