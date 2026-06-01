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
import { operationsReadRateLimit } from '../operations-rate-limit.js';

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
