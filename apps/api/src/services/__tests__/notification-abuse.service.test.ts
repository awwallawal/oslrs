import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { NotificationMeter, METER_KEYS } from '../notification-meter.service.js';
import { NotificationAbuseService } from '../notification-abuse.service.js';

/**
 * Story 9-63 (Task 6 / AC5) — abuse / anomaly detection over the meter counters.
 * Four signals: (a) daily ceiling, (b) single-recipient hammer, (c) public
 * category spike vs trailing baseline, (d) undeliverable/reserved-domain send.
 */
describe('NotificationAbuseService (Story 9-63 Task 6 / AC5)', () => {
  let redis: InstanceType<typeof RedisMock>;
  const NOW = new Date('2026-06-22T12:00:00Z');
  const TODAY = '2026-06-22';

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushall();
    NotificationAbuseService.setRedisForTesting(redis as unknown as Redis);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    // Deterministic thresholds for the assertions below.
    process.env.NOTIFY_ABUSE_DAILY_CEILING_EMAIL = '500';
    process.env.NOTIFY_ABUSE_DAILY_CEILING_SMS = '200';
    process.env.NOTIFY_ABUSE_RECIPIENT_MAX = '20';
    process.env.NOTIFY_ABUSE_SPIKE_BASELINE_DAYS = '7';
    process.env.NOTIFY_ABUSE_SPIKE_MULTIPLIER = '5';
    process.env.NOTIFY_ABUSE_SPIKE_MIN_VOLUME = '50';
    process.env.NOTIFY_ABUSE_COOLDOWN_MINUTES = '360';
  });

  afterEach(async () => {
    vi.useRealTimers();
    NotificationAbuseService.setRedisForTesting(null);
    await redis.flushall();
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('NOTIFY_ABUSE_')) delete process.env[k];
    }
  });

  it('returns no findings on a quiet day', async () => {
    await NotificationMeter.recordEmailSend({ subject: 'Sign in to your account', recipient: 'a@b.com' });
    const findings = await NotificationAbuseService.detect(NOW);
    expect(findings).toHaveLength(0);
  });

  it('(a) flags daily email volume above the ceiling', async () => {
    // 500 sends across categories. Use the recipient override-free path with a
    // unique recipient each so no single-recipient hammer fires.
    await redis.set(METER_KEYS.daily('email', 'reengagement-blast', TODAY), '500');
    const findings = await NotificationAbuseService.detect(NOW);
    expect(findings.some((f) => f.key === 'daily-ceiling-email')).toBe(true);
  });

  it('(a) flags daily SMS volume above the ceiling', async () => {
    await redis.set(METER_KEYS.daily('sms', 'magiclink-login', TODAY), '200');
    const findings = await NotificationAbuseService.detect(NOW);
    expect(findings.some((f) => f.key === 'daily-ceiling-sms')).toBe(true);
  });

  it('(b) flags a single recipient hammered ≥ N times', async () => {
    for (let i = 0; i < 20; i++) {
      await NotificationMeter.recordEmailSend({ subject: 'Sign in to your account', recipient: 'victim@b.com' });
    }
    const findings = await NotificationAbuseService.detect(NOW);
    expect(findings.some((f) => f.key === 'recipient-hammer-email')).toBe(true);
  });

  it('(d) flags a send attempted to an undeliverable/reserved domain', async () => {
    await NotificationMeter.recordEmailSend({
      subject: 'Sign in to your account',
      recipient: 'backoffice-activate-123@example.com',
    });
    const findings = await NotificationAbuseService.detect(NOW);
    expect(findings.some((f) => f.key === 'undeliverable-email')).toBe(true);
  });

  it('(c) flags a public category spiking vs a zero trailing baseline', async () => {
    // 60 magic-link sends today (≥ min volume 50), no prior-day history → spike.
    await redis.set(METER_KEYS.daily('email', 'magiclink-login', TODAY), '60');
    const findings = await NotificationAbuseService.detect(NOW);
    expect(findings.some((f) => f.key === 'category-spike-magiclink-login')).toBe(true);
  });

  it('(c) flags a public category spiking vs a low non-zero baseline', async () => {
    // Baseline ~5/day for 7 prior days; today 60 ≥ 5×5=25 → spike.
    for (let i = 1; i <= 7; i++) {
      const d = new Date(NOW.getTime() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await redis.set(METER_KEYS.daily('email', 'magiclink-login', d), '5');
    }
    await redis.set(METER_KEYS.daily('email', 'magiclink-login', TODAY), '60');
    const findings = await NotificationAbuseService.detect(NOW);
    expect(findings.some((f) => f.key === 'category-spike-magiclink-login')).toBe(true);
  });

  it('(c) does NOT flag a category in line with its baseline', async () => {
    for (let i = 1; i <= 7; i++) {
      const d = new Date(NOW.getTime() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await redis.set(METER_KEYS.daily('email', 'magiclink-login', d), '55');
    }
    await redis.set(METER_KEYS.daily('email', 'magiclink-login', TODAY), '60'); // 60 < 5×55
    const findings = await NotificationAbuseService.detect(NOW);
    expect(findings.some((f) => f.key === 'category-spike-magiclink-login')).toBe(false);
  });

  it('(c) ignores a low-volume category even with a zero baseline', async () => {
    await redis.set(METER_KEYS.daily('email', 'magiclink-login', TODAY), '10'); // < min 50
    const findings = await NotificationAbuseService.detect(NOW);
    expect(findings.some((f) => f.key === 'category-spike-magiclink-login')).toBe(false);
  });

  it('respects the per-signal cooldown (does not re-page within the window)', async () => {
    await redis.set(METER_KEYS.daily('email', 'reengagement-blast', TODAY), '500');

    const first = await NotificationAbuseService.detect(NOW);
    expect(first.some((f) => f.key === 'daily-ceiling-email')).toBe(true);

    // Same condition still true, but within cooldown → suppressed.
    const second = await NotificationAbuseService.detect(NOW);
    expect(second.some((f) => f.key === 'daily-ceiling-email')).toBe(false);
  });

  it('honours config-driven thresholds (lower ceiling trips earlier)', async () => {
    process.env.NOTIFY_ABUSE_DAILY_CEILING_EMAIL = '10';
    await redis.set(METER_KEYS.daily('email', 'magiclink-login', TODAY), '12');
    const findings = await NotificationAbuseService.detect(NOW);
    expect(findings.some((f) => f.key === 'daily-ceiling-email')).toBe(true);
  });

  it('fails open (no throw, no findings) when Redis is unavailable', async () => {
    NotificationAbuseService.setRedisForTesting(null);
    const prev = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    const prevNode = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // makes getRedisClient throw without REDIS_URL
    try {
      await expect(NotificationAbuseService.detect(NOW)).resolves.toEqual([]);
    } finally {
      if (prev !== undefined) process.env.REDIS_URL = prev;
      if (prevNode !== undefined) process.env.NODE_ENV = prevNode;
      else delete process.env.NODE_ENV;
    }
  });
});
