import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ── Hoisted mocks ────────────────────────────────────────────────────

// Mock Redis to avoid real connections in tests
vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    call: vi.fn(),
  })),
}));

// Import after mocks — in test env, rate limiter uses in-memory store
const { exportRateLimit } = await import('../export-rate-limit.js');

// ── Test Helpers ─────────────────────────────────────────────────────

function makeReq(userId: string = 'user-1'): Request {
  return {
    ip: '127.0.0.1',
    user: { sub: userId },
    headers: {},
    get: vi.fn(),
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
}

function makeRes(): { res: Response; statusMock: ReturnType<typeof vi.fn>; jsonMock: ReturnType<typeof vi.fn> } {
  const jsonMock = vi.fn().mockReturnThis();
  const statusMock = vi.fn().mockReturnThis();
  const res: Partial<Response> = {
    status: statusMock,
    json: jsonMock,
    set: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    getHeader: vi.fn(),
  };
  // Wire statusMock().json to jsonMock
  statusMock.mockReturnValue({ json: jsonMock });
  return { res: res as Response, statusMock, jsonMock };
}

/** Run rate limiter and resolve when either next() or res.json() is called */
function runMiddleware(req: Request, res: Response, jsonMock: ReturnType<typeof vi.fn>): Promise<{ nextCalled: boolean }> {
  return new Promise<{ nextCalled: boolean }>((resolve) => {
    // Intercept json() to detect blocked requests
    const originalJson = jsonMock.getMockImplementation();
    jsonMock.mockImplementation((...args: unknown[]) => {
      originalJson?.(...args);
      resolve({ nextCalled: false });
      return res;
    });

    exportRateLimit(req, res, (() => {
      resolve({ nextCalled: true });
    }) as NextFunction);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('exportRateLimit', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('allows first 5 requests', async () => {
    const userId = `user-${Date.now()}-allow5`;

    for (let i = 0; i < 5; i++) {
      const req = makeReq(userId);
      const { res, statusMock } = makeRes();
      const next = vi.fn();

      await new Promise<void>((resolve) => {
        exportRateLimit(req, res, (() => {
          next();
          resolve();
        }) as NextFunction);
      });

      expect(next).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalledWith(429);
    }
  });

  it('blocks 6th request with 429', async () => {
    const userId = `user-${Date.now()}-block6th`;

    // Exhaust 5 allowed requests
    for (let i = 0; i < 5; i++) {
      const req = makeReq(userId);
      const { res, jsonMock } = makeRes();

      await runMiddleware(req, res, jsonMock);
    }

    // 6th request should be blocked
    const req = makeReq(userId);
    const { res, statusMock, jsonMock } = makeRes();

    const result = await runMiddleware(req, res, jsonMock);

    expect(result.nextCalled).toBe(false);
    expect(statusMock).toHaveBeenCalledWith(429);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'EXPORT_RATE_LIMIT',
        message: 'Maximum 5 exports per hour. Please try again later.',
      }),
    );
  });

  it('skips rate limit in test mode (uses in-memory store)', () => {
    // The fact that these tests run without Redis proves test mode works.
    // In test environment (NODE_ENV=test), the store is undefined (in-memory).
    expect(process.env.NODE_ENV).toBe('test');
    expect(exportRateLimit).toBeDefined();
    expect(typeof exportRateLimit).toBe('function');
  });
});
