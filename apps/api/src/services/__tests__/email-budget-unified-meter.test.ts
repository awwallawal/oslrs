import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { EmailBudgetService } from '../email-budget.service.js';
import { NotificationMeter, METER_KEYS } from '../notification-meter.service.js';

/**
 * Story 9-63 Task 4 / AC2 — the budget guard must now SEE the high-volume direct
 * sends that previously bypassed `EmailBudgetService.recordSend()` (magic-link,
 * reminder, status, backup, blasts). Those paths increment ONLY the
 * NotificationMeter per-category counters; this proves the budget reconciles them.
 */
describe('EmailBudgetService × NotificationMeter unified counter (AC2)', () => {
  let redis: InstanceType<typeof RedisMock>;
  let service: EmailBudgetService;

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushall();
    NotificationMeter.setRedisForTesting(redis as unknown as Redis);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-22T12:00:00Z'));
    service = new EmailBudgetService(redis as unknown as Redis, 'free');
  });

  afterEach(async () => {
    vi.useRealTimers();
    NotificationMeter.setRedisForTesting(null);
    await redis.flushall();
  });

  it('counts meter-only (previously bypassed) sends toward the daily budget', async () => {
    // 95 sends recorded ONLY via the meter (e.g. magic-link path) — the legacy
    // worker total key is never touched.
    for (let i = 0; i < 95; i++) {
      await NotificationMeter.recordEmailSend({
        subject: 'Sign in to your Oyo State Skills Registry account',
        recipient: `u${i}@b.com`,
      });
    }

    const result = await service.checkBudget();
    expect(result.allowed).toBe(true); // 95 < 100
    expect(result.usage.dailyCount).toBe(95);
  });

  it('auto-pauses (blocks) when meter-only volume hits the free daily limit', async () => {
    for (let i = 0; i < 100; i++) {
      await NotificationMeter.recordEmailSend({
        subject: 'Add your NIN to complete your registration',
        recipient: `u${i}@b.com`,
      });
    }

    const result = await service.checkBudget();
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('daily_limit');
  });

  it('sums ACROSS categories for the effective daily total', async () => {
    // 60 magic-link + 50 status = 110 > 100 → blocked, even though no single
    // category key exceeds the limit.
    for (let i = 0; i < 60; i++) {
      await NotificationMeter.recordEmailSend({
        subject: 'Sign in to your account',
        recipient: `a${i}@b.com`,
      });
    }
    for (let i = 0; i < 50; i++) {
      await NotificationMeter.recordEmailSend({
        subject: 'Your Oyo State Skills Registry status',
        recipient: `b${i}@b.com`,
      });
    }

    const result = await service.checkBudget();
    expect(result.usage.dailyCount).toBe(110);
    expect(result.allowed).toBe(false);
  });

  it('takes MAX(legacy, meter) — no double-count of the worker path', async () => {
    // Worker path increments BOTH legacy total AND a meter category key.
    await redis.set('email:daily:count:2026-06-22', '40');
    await redis.set(METER_KEYS.daily('email', 'staff-invitation', '2026-06-22'), '40');

    const status = await service.getBudgetStatus();
    // MAX(40, 40) = 40, NOT 80.
    expect(status.dailyUsage.count).toBe(40);
  });

  it('excludes bounce/complaint event keys from the budget total', async () => {
    await NotificationMeter.recordEmailSend({
      subject: 'Sign in to your account',
      recipient: 'a@b.com',
      event: 'bounced',
    });
    await NotificationMeter.recordEmailSend({
      subject: 'Sign in to your account',
      recipient: 'a@b.com',
    });

    const status = await service.getBudgetStatus();
    // Only the 1 real send counts; the bounced event key is excluded.
    expect(status.dailyUsage.count).toBe(1);
  });

  it('reflects meter volume in monthly usage too', async () => {
    await redis.set(METER_KEYS.monthly('email', 'reengagement-blast', '2026-06'), '2900');
    const status = await service.getBudgetStatus();
    expect(status.monthlyUsage.count).toBe(2900);
    expect(status.monthlyUsage.percentage).toBe(97);
  });
});
