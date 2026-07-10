import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import {
  recordAutoSendFailure,
  setRedisForTesting,
  AUTOSEND_KEYS,
} from '../email-autosend-monitor.js';

/**
 * Story 13-21 (AC4 — the keystone). The monitor turns a swallowed auto-send
 * failure into a counted metric + a threshold-gated Telegram page. Telegram is
 * env-gated off in tests (returns false), so we assert the ALERT DECISION
 * (`alerted`) — the thing that would have paged on day one of the 140 silent fails.
 */
describe('email-autosend-monitor (Story 13-21 AC4)', () => {
  let redis: InstanceType<typeof RedisMock>;

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushall();
    setRedisForTesting(redis as unknown as Redis);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T12:00:00Z'));
    delete process.env.AUTOSEND_FAILURE_ALERT_THRESHOLD;
  });

  afterEach(async () => {
    vi.useRealTimers();
    setRedisForTesting(null);
    await redis.flushall();
    delete process.env.AUTOSEND_FAILURE_ALERT_THRESHOLD;
  });

  async function fail(n: number) {
    let last = { failuresToday: 0, alerted: false };
    for (let i = 0; i < n; i++) {
      last = await recordAutoSendFailure({ kind: 'thankyou', respondentId: `r-${i}` });
    }
    return last;
  }

  it('increments a daily counter and does NOT alert below the threshold', async () => {
    const r = await fail(4); // default threshold is 5
    expect(r.failuresToday).toBe(4);
    expect(r.alerted).toBe(false);
    const stored = await redis.get(AUTOSEND_KEYS.fail('2026-07-10'));
    expect(stored).toBe('4');
  });

  it('alerts exactly once when the daily failures cross the threshold', async () => {
    // 5th failure crosses the default threshold of 5 → pages.
    const fifth = await fail(5);
    expect(fifth.failuresToday).toBe(5);
    expect(fifth.alerted).toBe(true);

    // 6th failure the SAME day must NOT re-page (once-a-day cooldown).
    const sixth = await recordAutoSendFailure({ kind: 'confirmation', respondentId: 'r-6' });
    expect(sixth.failuresToday).toBe(6);
    expect(sixth.alerted).toBe(false);
  });

  it('honours an env-configured threshold', async () => {
    process.env.AUTOSEND_FAILURE_ALERT_THRESHOLD = '2';
    const first = await recordAutoSendFailure({ kind: 'thankyou', respondentId: 'a' });
    expect(first.alerted).toBe(false);
    const second = await recordAutoSendFailure({ kind: 'thankyou', respondentId: 'b' });
    expect(second.alerted).toBe(true);
  });

  it('fail-open: never throws and does not alert when the Redis op fails', async () => {
    // A down/erroring Redis must not change send behaviour: the counter op is
    // swallowed and the call returns cleanly (the ERROR log still fired).
    const broken = { incr: () => Promise.reject(new Error('redis down')) } as unknown as Redis;
    setRedisForTesting(broken);
    const r = await recordAutoSendFailure({ kind: 'confirmation', respondentId: 'no-redis' });
    expect(r).toEqual({ failuresToday: 0, alerted: false });
  });

  it('the cooldown key is scoped per-day (a new day re-arms the alert)', async () => {
    await fail(5); // day 1 alerts + sets the cooldown
    vi.setSystemTime(new Date('2026-07-11T12:00:00Z')); // next day
    const nextDay = await fail(5); // fresh counter + fresh cooldown key
    expect(nextDay.failuresToday).toBe(5);
    expect(nextDay.alerted).toBe(true);
  });
});
