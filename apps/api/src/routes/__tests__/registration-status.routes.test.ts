/**
 * Story 9-58 (Deliverable A) — route-level supertest coverage for
 * `registration-status.routes.ts`. Rate-limit middleware mocked pass-through;
 * the REAL `verifyCaptcha` runs (test-mode: bypass token = 'test-captcha-bypass',
 * missing token = 400). `RegistrationStatusService.handleRequest` is mocked so
 * the fire-and-forget async work doesn't hit the DB.
 *
 * Covers AC2 (constant neutral response, no existence signal), AC2.3 (captcha
 * failure is the only non-uniform response), and AC9.2a-c.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockHandleRequest = vi.fn();

vi.mock('../../middleware/registration-status-rate-limit.js', () => ({
  registrationStatusRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../services/registration-status.service.js', () => ({
  RegistrationStatusService: {
    handleRequest: (...args: unknown[]) => mockHandleRequest(...args),
  },
  // The controller also imports classifyIdentifier for class-only logging.
  classifyIdentifier: (id: string) => (id.includes('@') ? 'email' : 'phone'),
}));

const { default: router } = await import('../registration-status.routes.js');

interface AppErrorLike { code: string; message: string; statusCode: number }
function isAppErrorLike(e: unknown): e is AppErrorLike {
  return !!e && typeof e === 'object' && 'code' in e && 'statusCode' in e;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/registration-status', router);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (isAppErrorLike(err)) {
      res.status(err.statusCode).json({ status: 'error', code: err.code, message: err.message });
      return;
    }
    res.status(500).json({ status: 'error', code: 'INTERNAL', message: (err as Error).message });
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHandleRequest.mockResolvedValue(undefined);
});

describe('POST /registration-status/request', () => {
  it('returns a 200 neutral response and fires handleRequest on a valid captcha', async () => {
    const res = await request(buildApp())
      .post('/registration-status/request')
      .send({ identifier: 'jane@example.com', captchaToken: 'test-captcha-bypass' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.message).toMatch(/registry/i);
    expect(mockHandleRequest).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'jane@example.com' }),
    );
  });

  it('returns the IDENTICAL neutral response for a non-matching identifier (no existence signal)', async () => {
    const match = await request(buildApp())
      .post('/registration-status/request')
      .send({ identifier: 'jane@example.com', captchaToken: 'test-captcha-bypass' });
    const noMatch = await request(buildApp())
      .post('/registration-status/request')
      .send({ identifier: 'definitely-not-registered@nowhere.test', captchaToken: 'test-captcha-bypass' });

    expect(noMatch.status).toBe(match.status);
    expect(noMatch.body).toEqual(match.body);
  });

  it('rejects a missing captcha with 400 (the only non-uniform response) and does NOT resolve the registry', async () => {
    const res = await request(buildApp())
      .post('/registration-status/request')
      .send({ identifier: 'jane@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('AUTH_CAPTCHA_FAILED');
    expect(mockHandleRequest).not.toHaveBeenCalled();
  });

  it('rejects a too-short identifier with a generic 400 (after captcha passes)', async () => {
    const res = await request(buildApp())
      .post('/registration-status/request')
      .send({ identifier: 'ab', captchaToken: 'test-captcha-bypass' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REGISTRATION_STATUS_INVALID_INPUT');
    expect(mockHandleRequest).not.toHaveBeenCalled();
  });
});
