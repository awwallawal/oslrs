/**
 * Story 9-38 (AC#10) — route-level coverage for `GET /me/registration-status`.
 * Mocks the authenticate middleware (inject req.user) + MeService; the
 * controller runs for real so the auth-guard + response shape are exercised.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { mockAuthenticate, mockGetRegistrationStatus } = vi.hoisted(() => ({
  mockAuthenticate: vi.fn(),
  mockGetRegistrationStatus: vi.fn(),
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticate: (req: express.Request, res: express.Response, next: express.NextFunction) =>
    mockAuthenticate(req, res, next),
}));

vi.mock('../../services/me.service.js', () => ({
  MeService: { getRegistrationStatus: mockGetRegistrationStatus },
}));

const { default: router } = await import('../me.routes.js');

interface AppErrorLike { code: string; statusCode: number; message: string }
function isAppErrorLike(e: unknown): e is AppErrorLike {
  return !!e && typeof e === 'object' && 'code' in e && 'statusCode' in e;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/me', router);
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
  vi.resetAllMocks();
});

describe('GET /me/registration-status', () => {
  it('returns 200 with the caller-own registration state when authenticated', async () => {
    mockAuthenticate.mockImplementation((req: express.Request, _res: unknown, next: () => void) => {
      (req as unknown as { user: unknown }).user = { sub: 'user-1', email: 'me@example.com', role: 'public_user' };
      next();
    });
    mockGetRegistrationStatus.mockResolvedValueOnce({
      state: 'complete',
      respondent: { id: 'resp-1', status: 'active', lgaId: 'lga-egbeda', ninStatus: 'provided', consentMarketplace: true, referenceCode: 'OSL-2026-AAA111' },
    });

    const res = await request(buildApp()).get('/me/registration-status');
    expect(res.status).toBe(200);
    expect(res.body.data.state).toBe('complete');
    expect(mockGetRegistrationStatus).toHaveBeenCalledWith({ userId: 'user-1', email: 'me@example.com' });
  });

  it('returns 401 when the request is unauthenticated', async () => {
    mockAuthenticate.mockImplementation((_req: unknown, _res: unknown, next: (e?: unknown) => void) => {
      next({ code: 'AUTH_REQUIRED', statusCode: 401, message: 'Authentication required' });
    });
    const res = await request(buildApp()).get('/me/registration-status');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
    expect(mockGetRegistrationStatus).not.toHaveBeenCalled();
  });
});
