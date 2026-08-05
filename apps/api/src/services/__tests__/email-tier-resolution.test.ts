import { describe, it, expect } from 'vitest';
import { resolveEmailTier, getEmailTierLimits, EMAIL_TIER_LIMITS } from '@oslsr/types';

/**
 * 2026-08-05 incident. `EMAIL_TIER` was never set on prod, the old
 * `process.env.EMAIL_TIER || 'free'` resolved to the FREE tier, and
 * `EmailBudgetService` began refusing sends at 100/day while the account was on Pro:
 *
 *   email.budget.daily_limit_reached tier:"free" dailyCount:140 dailyLimit:100
 *   email.digest.flush_skipped       reason:"budget_exhausted"
 *
 * The direction of the default is the whole lesson: an unset variable must not
 * silently become the MOST RESTRICTIVE setting, because under-sending is invisible
 * while over-sending is caught by the provider's own quota.
 */
describe('resolveEmailTier — the 2026-08-05 default-direction incident', () => {
  it('defaults to `pro` when EMAIL_TIER is unset — NOT `free`', () => {
    expect(resolveEmailTier({})).toBe('pro');
    expect(resolveEmailTier({ EMAIL_TIER: undefined })).toBe('pro');
    expect(resolveEmailTier({ EMAIL_TIER: '' })).toBe('pro');
  });

  it('honours an explicit tier, including a deliberate downgrade', () => {
    expect(resolveEmailTier({ EMAIL_TIER: 'free' })).toBe('free');
    expect(resolveEmailTier({ EMAIL_TIER: ' PRO ' })).toBe('pro');
    expect(resolveEmailTier({ EMAIL_TIER: 'scale' })).toBe('scale');
  });

  it('falls back to `pro` on an unrecognised value rather than the restrictive tier', () => {
    expect(resolveEmailTier({ EMAIL_TIER: 'enterprise' })).toBe('pro');
  });

  /** Only `free` has a real daily cliff — this is what made the bug bite. */
  it('gives free a finite daily cap and pro/scale none', () => {
    expect(getEmailTierLimits('free').dailyLimit).toBe(100);
    expect(Number.isFinite(getEmailTierLimits('pro').dailyLimit)).toBe(false);
    expect(getEmailTierLimits('pro').monthlyLimit).toBe(50_000);
  });

  /** Guards against a fifth copy drifting back in. */
  it('is the single source: every tier is present and self-consistent', () => {
    for (const tier of ['free', 'pro', 'scale'] as const) {
      const l = EMAIL_TIER_LIMITS[tier];
      expect(l.monthlyLimit).toBeGreaterThan(0);
      expect(l.dailyLimit).toBeGreaterThan(0);
      expect(l.hasOverage).toBe(tier !== 'free');
    }
  });
});
