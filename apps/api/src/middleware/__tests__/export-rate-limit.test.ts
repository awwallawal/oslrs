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

function makeReq(userId: string = 'user-1', role?: string): Request {
  return {
    ip: '127.0.0.1',
    user: { sub: userId, role },
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
        message: expect.stringContaining('Maximum 5 exports per hour'),
      }),
    );
  });

  it('super_admin gets 20 requests before block', async () => {
    const userId = `user-${Date.now()}-admin20`;

    // Super admin should get 20 requests
    for (let i = 0; i < 20; i++) {
      const req = makeReq(userId, 'super_admin');
      const { res, jsonMock } = makeRes();
      const result = await runMiddleware(req, res, jsonMock);
      expect(result.nextCalled).toBe(true);
    }

    // 21st should be blocked
    const req = makeReq(userId, 'super_admin');
    const { res, statusMock, jsonMock } = makeRes();
    const result = await runMiddleware(req, res, jsonMock);
    expect(result.nextCalled).toBe(false);
    expect(statusMock).toHaveBeenCalledWith(429);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Maximum 20 exports per hour'),
      }),
    );
  });

  it('government_official gets 10 requests before block', async () => {
    const userId = `user-${Date.now()}-official10`;

    for (let i = 0; i < 10; i++) {
      const req = makeReq(userId, 'government_official');
      const { res, jsonMock } = makeRes();
      const result = await runMiddleware(req, res, jsonMock);
      expect(result.nextCalled).toBe(true);
    }

    // 11th should be blocked
    const req = makeReq(userId, 'government_official');
    const { res, statusMock, jsonMock } = makeRes();
    const result = await runMiddleware(req, res, jsonMock);
    expect(result.nextCalled).toBe(false);
    expect(statusMock).toHaveBeenCalledWith(429);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Maximum 10 exports per hour'),
      }),
    );
  });

  it('verification_assessor gets 5 requests before block', async () => {
    const userId = `user-${Date.now()}-assessor5`;

    for (let i = 0; i < 5; i++) {
      const req = makeReq(userId, 'verification_assessor');
      const { res, jsonMock } = makeRes();
      const result = await runMiddleware(req, res, jsonMock);
      expect(result.nextCalled).toBe(true);
    }

    // 6th should be blocked
    const req = makeReq(userId, 'verification_assessor');
    const { res, statusMock, jsonMock } = makeRes();
    const result = await runMiddleware(req, res, jsonMock);
    expect(result.nextCalled).toBe(false);
    expect(statusMock).toHaveBeenCalledWith(429);
  });

  it('unknown role falls back to 5 request limit', async () => {
    const userId = `user-${Date.now()}-unknown5`;

    for (let i = 0; i < 5; i++) {
      const req = makeReq(userId, 'some_unknown_role');
      const { res, jsonMock } = makeRes();
      const result = await runMiddleware(req, res, jsonMock);
      expect(result.nextCalled).toBe(true);
    }

    // 6th should be blocked
    const req = makeReq(userId, 'some_unknown_role');
    const { res, statusMock, jsonMock } = makeRes();
    const result = await runMiddleware(req, res, jsonMock);
    expect(result.nextCalled).toBe(false);
    expect(statusMock).toHaveBeenCalledWith(429);
  });

  it('skips rate limit in test mode (uses in-memory store)', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(exportRateLimit).toBeDefined();
    expect(typeof exportRateLimit).toBe('function');
  });
});
