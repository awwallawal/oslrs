/**
 * Dev Routes Guard Tests
 * Story SEC2-4: Positive allowlist guard (AC3)
 *
 * Verifies dev routes are only accessible in 'development' and 'test' environments.
 * All other NODE_ENV values (undefined, 'staging', 'production') must return 404.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock EmailService to prevent import side effects
vi.mock('../../services/email.service.js', () => ({
  EmailService: {
    getStaffInvitationHtml: vi.fn(() => '<html>mock</html>'),
    getStaffInvitationText: vi.fn(() => 'mock text'),
    getVerificationHtml: vi.fn(() => '<html>mock</html>'),
  },
}));

describe('Dev routes guard', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  it.each([
    ['production', 404],
    ['staging', 404],
    [undefined, 404],
    ['', 404],
  ])('returns 404 when NODE_ENV is %s', async (envVal, expectedStatus) => {
    if (envVal === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = envVal;
    }

    const { default: router } = await import('../dev.routes.js');

    // Extract the middleware from the router stack
    const middleware = router.stack.find(
      (layer: { name: string }) => layer.name === 'devOnlyMiddleware'
    );
    expect(middleware).toBeDefined();

    const mockReq = {};
    let statusCode: number | undefined;
    let jsonBody: unknown;
    const mockRes = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (body: unknown) => {
        jsonBody = body;
      },
    };
    const mockNext = vi.fn();

    middleware!.handle(mockReq, mockRes, mockNext);

    expect(statusCode).toBe(expectedStatus);
    expect(jsonBody).toEqual({ error: 'Not found' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it.each([
    ['development'],
    ['test'],
  ])('allows access when NODE_ENV is %s', async (envVal) => {
    process.env.NODE_ENV = envVal;

    const { default: router } = await import('../dev.routes.js');

    const middleware = router.stack.find(
      (layer: { name: string }) => layer.name === 'devOnlyMiddleware'
    );
    expect(middleware).toBeDefined();

    const mockReq = {};
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const mockNext = vi.fn();

    middleware!.handle(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});
