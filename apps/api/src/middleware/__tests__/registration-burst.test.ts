import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

/**
 * Story 13-46 (AC3) — the ONE property this middleware must never lose: it does not block.
 *
 * A registration is a citizen finishing a 10-15 minute wizard. Instrumentation sitting in front of
 * that, able to delay it or 500 it, would be a strictly worse outcome than never measuring the
 * burst at all. So: `next()` synchronously, always, including when Redis is on fire.
 */
const { mockRedis, mockGetRedisClient } = vi.hoisted(() => {
  const mockRedis = {
    pipeline: vi.fn(),
    mget: vi.fn(),
    set: vi.fn(),
  };
  return { mockRedis, mockGetRedisClient: vi.fn(() => mockRedis) };
});

vi.mock('../../lib/redis.js', () => ({
  getRedisClient: () => mockGetRedisClient(),
  createRedisConnection: vi.fn(),
  checkRedisHealth: vi.fn(),
  closeAllConnections: vi.fn(),
}));

const { mockSendTelegram } = vi.hoisted(() => ({
  mockSendTelegram: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../services/alerting/telegram-channel.js', () => ({
  sendTelegramMessage: (m: string) => mockSendTelegram(m),
  isAlertSendEnabled: () => true,
}));

import {
  registrationBurstWatch,
  recordRegistration429,
  recordRegistrationAutoSend,
  recordThankYouSuppressed,
} from '../registration-burst.js';

/**
 * Let the fire-and-forget tail settle without asserting on a timer.
 *
 * ⚠️ ONE `setImmediate` IS NOT ENOUGH and quietly gives false greens on NEGATIVE assertions: the
 * refusal path awaits a counter pipeline, an eval-slot SET, an MGET, a cooldown SET and the
 * dispatch. A single tick returns before any of it, so "expect(...).not.toHaveBeenCalled()" would
 * pass because nothing had run YET — not because nothing will. Every mock here resolves
 * immediately, so a bounded flush is deterministic, not a sleep.
 */
const settle = async () => {
  for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r));
};

describe('registrationBurstWatch (Story 13-46 AC3 — alerts, never blocks)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedisClient.mockReturnValue(mockRedis);
    mockRedis.pipeline.mockReturnValue({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    });
    mockRedis.mget.mockResolvedValue([]);
    mockRedis.set.mockResolvedValue('OK');
  });

  const req = {} as Request;
  const res = {} as Response;

  it('calls next() SYNCHRONOUSLY — the registration is never made to wait on a counter', () => {
    const next = vi.fn() as unknown as NextFunction;

    registrationBurstWatch(req, res, next);

    // Not "eventually" — before this assertion runs, with no await in between.
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next() even when Redis THROWS on the counter write', async () => {
    mockGetRedisClient.mockImplementation(() => {
      throw new Error('redis unreachable');
    });
    const next = vi.fn() as unknown as NextFunction;

    expect(() => registrationBurstWatch(req, res, next)).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);

    await settle(); // and the background tail must not produce an unhandled rejection either
  });

  it('calls next() even when the WINDOW READ rejects', async () => {
    mockRedis.mget.mockRejectedValue(new Error('READONLY'));
    const next = vi.fn() as unknown as NextFunction;

    registrationBurstWatch(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    await settle();
    expect(mockSendTelegram).not.toHaveBeenCalled();
  });

  it('does not page on ordinary volume', async () => {
    mockRedis.mget.mockResolvedValue(['1', '0', '0', '0', '0']);
    const next = vi.fn() as unknown as NextFunction;

    registrationBurstWatch(req, res, next);
    await settle();

    expect(mockSendTelegram).not.toHaveBeenCalled();
  });

  it('the 429 and auto-send counters never throw at their call sites', () => {
    mockGetRedisClient.mockImplementation(() => {
      throw new Error('redis unreachable');
    });

    // These are called from inside a rate-limiter `handler` and from the auto-send path — both
    // places where an exception would surface to a citizen.
    expect(() => recordRegistration429()).not.toThrow();
    expect(() => recordRegistrationAutoSend()).not.toThrow();
  });
});

describe('a 429 WALL pages on its own (13-46 review A1 / finding H1)', () => {
  /**
   * ⚠️ THE REGRESSION THIS FILE EXISTS FOR. `recordRegistration429` used to only bump a counter,
   * while evaluation ran solely from the served-submit path — so a window containing ONLY refusals
   * (27 in one August morning, against 1-8 served submits a day) incremented a number nobody read,
   * and the buckets expired 10 minutes later. Delete the `evaluateRegistrationBurst()` call inside
   * `recordRegistration429` and the first test below fails. That is the property worth having.
   */

  // `vitest.base.ts` sets `mockReset: true`, so every implementation is stripped before each test
  // and the sibling describe's beforeEach does NOT carry over. Without this the Redis mock returns
  // undefined, every read throws, and the tests below would pass for entirely the wrong reason.
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedisClient.mockReturnValue(mockRedis);
    mockRedis.pipeline.mockReturnValue({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    });
    mockRedis.mget.mockResolvedValue([]);
    mockRedis.set.mockResolvedValue('OK');
    mockSendTelegram.mockResolvedValue(true);
  });

  /** 5 minute-offsets × 4 signals: [0-4]=submits, [5-9]=blocked429, [10-14]=draft, [15-19]=autosends. */
  const windowWith = (over: { submits?: string; blocked429?: string; draft?: string }) => {
    const v = new Array(20).fill('0');
    if (over.submits) v[0] = over.submits;
    if (over.blocked429) v[5] = over.blocked429;
    if (over.draft) v[10] = over.draft;
    return v;
  };

  it('PAGES from a window with ZERO served submits and 10 refusals', async () => {
    mockRedis.mget.mockResolvedValue(windowWith({ blocked429: '10' }));

    recordRegistration429('submit');
    await settle();

    expect(mockSendTelegram).toHaveBeenCalledTimes(1);
    expect(mockSendTelegram.mock.calls[0][0]).toMatch(/REFUSED/i);
  });

  it('does NOT page on a couple of refusals — one client hitting its own limit is the control working', async () => {
    mockRedis.mget.mockResolvedValue(windowWith({ blocked429: '2' }));

    recordRegistration429('submit');
    await settle();

    expect(mockSendTelegram).not.toHaveBeenCalled();
  });

  it('a DRAFT refusal counts on the draft dimension, not the submit one', async () => {
    // 10 draft refusals must NOT page: that is ordinary autosave volume, and the submit threshold
    // must not be reachable from the draft route.
    mockRedis.mget.mockResolvedValue(windowWith({ draft: '10' }));

    recordRegistration429('draft');
    await settle();

    expect(mockSendTelegram).not.toHaveBeenCalled();
  });

  it('still never throws at the limiter handler when Redis is down', async () => {
    mockGetRedisClient.mockImplementation(() => {
      throw new Error('redis unreachable');
    });

    expect(() => recordRegistration429('submit')).not.toThrow();
    expect(() => recordThankYouSuppressed()).not.toThrow();
    await settle();
  });

  it('the evaluation slot is bounded — a second refusal inside the window does not re-evaluate', async () => {
    // review A13/L4: one evaluation per 10s is full fidelity against a 5-minute rolling window.
    mockRedis.mget.mockResolvedValue(windowWith({ blocked429: '10' }));
    mockRedis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

    recordRegistration429('submit');
    await settle();
    recordRegistration429('submit');
    await settle();

    expect(mockSendTelegram).toHaveBeenCalledTimes(1);
  });
});
