/**
 * Story 9-19 AC#D2 (code-review M3) — operations rate-limit middleware.
 *
 * The route-level test stubs this limiter pass-through and the limiter itself
 * self-bypasses in test mode, so before this file the 60/min limiter had ZERO
 * coverage despite AC#D2 listing it. These tests pin the module's wiring + the
 * intentional test-mode skip so a regression (e.g. accidentally limiting in CI,
 * or dropping the export) is caught.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { operationsReadRateLimit, operationsRateLimitKeyGenerator } from '../operations-rate-limit.js';

describe('operationsReadRateLimit', () => {
  it('is a mountable express middleware', () => {
    expect(typeof operationsReadRateLimit).toBe('function');
  });

  it('skips (calls next, no 429) in test mode', async () => {
    const next = vi.fn();
    const req = { ip: '1.2.3.4', path: '/dashboard', user: { sub: 'admin-1' } } as unknown as Request;
    const status = vi.fn().mockReturnThis();
    const res = { setHeader: vi.fn(), status, json: vi.fn() } as unknown as Response;

    // express-rate-limit v7 middleware is async — next() fires on a later tick.
    await (operationsReadRateLimit as unknown as (q: Request, s: Response, n: () => void) => Promise<void>)(
      req,
      res,
      next,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalledWith(429);
  });
});

/**
 * OPS-RL-1 (Story 9-42 AC#9) — the custom keyGenerator must bucket IPv6 clients
 * by subnet (via express-rate-limit@8's `ipKeyGenerator`), not by raw address.
 * Raw-address keying let an IPv6 client rotate within its subnet to bypass the
 * limit; these tests regression-lock the fix.
 */
describe('operationsRateLimitKeyGenerator (OPS-RL-1)', () => {
  it('keys by the authenticated super-admin sub when present', () => {
    const req = { ip: '2001:db8:abcd:1234::1', user: { sub: 'admin-1' } } as unknown as Request;
    expect(operationsRateLimitKeyGenerator(req)).toBe('admin-1');
  });

  it('buckets two IPv6 addresses in the same subnet to the SAME key (no bypass)', () => {
    // Same /56 prefix (2001:db8:abcd:12..), differing only in low-order bits.
    const a = { ip: '2001:db8:abcd:1200::1' } as unknown as Request;
    const b = { ip: '2001:db8:abcd:12ff::abcd' } as unknown as Request;

    const keyA = operationsRateLimitKeyGenerator(a);
    const keyB = operationsRateLimitKeyGenerator(b);

    // The bucket key must NOT be the raw address (that was the bypass)…
    expect(keyA).not.toBe('2001:db8:abcd:1200::1');
    // …and both addresses in the subnet share one bucket.
    expect(keyA).toBe(keyB);
  });

  it('distinguishes IPv4 clients by address', () => {
    const a = { ip: '203.0.113.5' } as unknown as Request;
    const b = { ip: '203.0.113.6' } as unknown as Request;
    expect(operationsRateLimitKeyGenerator(a)).not.toBe(operationsRateLimitKeyGenerator(b));
  });

  it('falls back to a stable sentinel when neither sub nor ip is present', () => {
    const req = {} as unknown as Request;
    expect(operationsRateLimitKeyGenerator(req)).toBe('unknown');
  });
});
