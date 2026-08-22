import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';

// `setRedisForTesting(null)` only clears the OVERRIDE — the meter then falls through to the real
// `getRedisClient()`, which resolves fine under vitest. To exercise the genuinely-no-Redis branch
// (`resolveRedis()` returning null) the module itself has to throw, as it does on a misconfigured box.
const { mockGetRedisClient } = vi.hoisted(() => ({ mockGetRedisClient: vi.fn() }));
vi.mock('../../lib/redis.js', () => ({
  getRedisClient: () => mockGetRedisClient(),
  createRedisConnection: vi.fn(),
  checkRedisHealth: vi.fn(),
  closeAllConnections: vi.fn(),
}));

import {
  NotificationMeter,
  METER_KEYS,
  MARKETING_DAILY_CAP,
  MARKETING_MONTHLY_CAP,
  resolveMarketingCaps,
} from '../notification-meter.service.js';

/**
 * Story 13-46 (AC1 / AC8) — the meter must ENFORCE a ceiling for MARKETING categories.
 *
 * ⚠️ RED-VERIFY BOTH DIRECTIONS. Every cap here is asserted twice: once that it REFUSES at the
 * ceiling, and once that it ALLOWS below it. A guard test that only proves "blocked at N+1"
 * licenses a fix that blocks everyone — which for this cap would mean silently dropping every
 * thank-you the jingle earns.
 */
describe('NotificationMeter.checkCap (Story 13-46 AC1 — cap the SEND)', () => {
  let redis: InstanceType<typeof RedisMock>;

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushall();
    NotificationMeter.setRedisForTesting(redis as unknown as Redis);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00Z'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    NotificationMeter.setRedisForTesting(null);
    await redis.flushall();
    delete process.env.MARKETING_DAILY_CAP;
    delete process.env.MARKETING_MONTHLY_CAP;
  });

  /** Seed the daily counter for a category to an exact value. */
  async function seedDaily(category: string, count: number): Promise<void> {
    await redis.set(METER_KEYS.daily('email', category, '2026-08-20'), String(count));
  }
  async function seedMonthly(category: string, count: number): Promise<void> {
    await redis.set(METER_KEYS.monthly('email', category, '2026-08'), String(count));
  }

  describe('the marketing ceiling binds', () => {
    it('ALLOWS a marketing send one below the daily cap (the allowed direction)', async () => {
      await seedDaily('thankyou-referral', MARKETING_DAILY_CAP - 1);

      const decision = await NotificationMeter.checkCap('thankyou-referral');

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('within-cap');
    });

    it('REFUSES a marketing send AT the daily cap, naming category + window + count', async () => {
      await seedDaily('thankyou-referral', MARKETING_DAILY_CAP);

      const decision = await NotificationMeter.checkCap('thankyou-referral');

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('daily-cap-exceeded');
      expect(decision.window).toBe('daily');
      expect(decision.count).toBe(MARKETING_DAILY_CAP);
      expect(decision.cap).toBe(MARKETING_DAILY_CAP);
      expect(decision.category).toBe('thankyou-referral');
    });

    it('sums the WHOLE marketing bucket, not one category — three categories share one ceiling', async () => {
      // The domain burns from all marketing traffic combined; a per-category cap would let three
      // categories each spend the full ceiling. Split the cap across the categories and it binds.
      const each = Math.floor(MARKETING_DAILY_CAP / 3) + 1;
      await seedDaily('thankyou-referral', each);
      await seedDaily('reengagement-blast', each);
      await seedDaily('supplemental-survey', each);

      const decision = await NotificationMeter.checkCap('thankyou-referral');

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('daily-cap-exceeded');
    });

    it('REFUSES on the MONTHLY ceiling independently of a quiet day', async () => {
      await seedDaily('reengagement-blast', 1);
      await seedMonthly('reengagement-blast', MARKETING_MONTHLY_CAP);

      const decision = await NotificationMeter.checkCap('reengagement-blast');

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('monthly-cap-exceeded');
      expect(decision.window).toBe('monthly');
    });

    it('ALLOWS below the monthly ceiling (the allowed direction)', async () => {
      await seedMonthly('reengagement-blast', MARKETING_MONTHLY_CAP - 1);

      const decision = await NotificationMeter.checkCap('reengagement-blast');

      expect(decision.allowed).toBe(true);
    });
  });

  describe('TRANSACTIONAL mail is untouched — fail-open is CORRECT for it', () => {
    it.each([
      'magiclink-login',
      'password-reset',
      'staff-activation-complete',
      'health-alert-digest',
      'registration-status',
    ] as const)('still allows %s with the marketing cap fully exhausted', async (category) => {
      await seedDaily('thankyou-referral', MARKETING_DAILY_CAP * 10);
      await seedMonthly('thankyou-referral', MARKETING_MONTHLY_CAP * 10);
      await seedDaily(category, MARKETING_DAILY_CAP * 10);

      const decision = await NotificationMeter.checkCap(category);

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('not-marketing');
    });

    it('allows an UNCATEGORISED send (no category) — it cannot be marketing', async () => {
      await seedDaily('thankyou-referral', MARKETING_DAILY_CAP * 10);

      const decision = await NotificationMeter.checkCap(undefined);

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('not-marketing');
    });
  });

  describe('fail-OPEN on infrastructure, fail-CLOSED on the limit', () => {
    it('ALLOWS marketing when Redis is NOT CONFIGURED — a hiccup must never block mail', async () => {
      NotificationMeter.setRedisForTesting(null);
      mockGetRedisClient.mockImplementation(() => {
        throw new Error('Redis not configured');
      });

      const decision = await NotificationMeter.checkCap('thankyou-referral');

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('meter-unavailable');
    });

    it('ALLOWS marketing when the Redis read THROWS — same fail-open principle', async () => {
      const exploding = {
        mget: vi.fn().mockRejectedValue(new Error('READONLY replica')),
      } as unknown as Redis;
      NotificationMeter.setRedisForTesting(exploding);

      const decision = await NotificationMeter.checkCap('thankyou-referral');

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('meter-unavailable');
    });
  });

  describe('caps are configurable with committed defaults', () => {
    it('reads an operator override from the environment', () => {
      process.env.MARKETING_DAILY_CAP = '11';
      process.env.MARKETING_MONTHLY_CAP = '222';

      expect(resolveMarketingCaps()).toEqual({ daily: 11, monthly: 222 });
    });

    it('IGNORES a zero / negative / junk override — never silently disables the cap', () => {
      for (const bad of ['0', '-5', 'lots', '']) {
        process.env.MARKETING_DAILY_CAP = bad;
        expect(resolveMarketingCaps().daily).toBe(MARKETING_DAILY_CAP);
      }
    });

    it('keeps the committed defaults well under the Resend Pro 50,000/month ceiling', () => {
      // Context §6 — the quota was never the control. If the monthly cap ever exceeds the plan
      // ceiling, the QUOTA binds first and this whole story's protection is inert.
      expect(MARKETING_MONTHLY_CAP).toBeLessThan(50_000);
      expect(MARKETING_DAILY_CAP).toBeLessThan(MARKETING_MONTHLY_CAP);
    });
  });

  describe('headroom read (AC3 composes this into the burst alert)', () => {
    it('reports remaining daily + monthly headroom', async () => {
      await seedDaily('thankyou-referral', 10);
      await seedMonthly('thankyou-referral', 40);

      const headroom = await NotificationMeter.marketingHeadroom();

      expect(headroom.dailyUsed).toBe(10);
      expect(headroom.dailyRemaining).toBe(MARKETING_DAILY_CAP - 10);
      expect(headroom.monthlyUsed).toBe(40);
      expect(headroom.monthlyRemaining).toBe(MARKETING_MONTHLY_CAP - 40);
    });

    it('never reports NEGATIVE headroom once the cap is blown', async () => {
      await seedDaily('thankyou-referral', MARKETING_DAILY_CAP + 500);

      const headroom = await NotificationMeter.marketingHeadroom();

      expect(headroom.dailyRemaining).toBe(0);
    });
  });
});
