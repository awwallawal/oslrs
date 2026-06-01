/**
 * Story 9-19 AC#D2 — integration tests for `operations.routes.ts`.
 *
 * Mirrors settings.routes.test.ts: `authenticate` mocked through a controllable
 * `mockUser`; the REAL `authorize(UserRole.SUPER_ADMIN)` runs (so a non-super-
 * admin genuinely 403s); rate-limit middleware stubbed pass-through;
 * OperationsService mocked so each branch is deterministic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { mockGetSnapshot, mockUserHolder } = vi.hoisted(() => ({
  mockGetSnapshot: vi.fn(),
  mockUserHolder: { current: { sub: 'mock-super-admin-id', role: 'super_admin' as string } },
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = mockUserHolder.current;
    next();
  }),
}));

// rbac.js deliberately NOT mocked — real authorize() runs.

vi.mock('../../middleware/operations-rate-limit.js', () => ({
  operationsReadRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../services/operations.service.js', () => ({
  OperationsService: { getDashboardSnapshot: mockGetSnapshot },
}));

const { default: router } = await import('../operations.routes.js');

interface AppErrorLike { code: string; message: string; statusCode: number }
function isAppErrorLike(e: unknown): e is AppErrorLike {
  return !!e && typeof e === 'object' && 'code' in e && 'statusCode' in e;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin/operations', router);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (isAppErrorLike(err)) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL', message: (err as Error).message } });
  });
  return app;
}

const sampleSnapshot = {
  generatedAt: '2026-06-01T08:00:00.000Z',
  system: null,
  traffic: { totalDrafts: 100, step4StallPct: 63 },
  resend: null,
  queue: { waiting: 0, active: 0, completed: 1, failed: 0, delayed: 0, failedSamples: [] },
  recommendations: [{ severity: 'red', key: 'step4-stall', text: 'Step-4 stall 63% — Story 9-17 …' }],
};

beforeEach(() => {
  mockGetSnapshot.mockReset();
  mockUserHolder.current = { sub: 'mock-super-admin-id', role: 'super_admin' };
});

describe('GET /admin/operations/dashboard', () => {
  it('returns the snapshot wrapped in { data }', async () => {
    mockGetSnapshot.mockResolvedValue(sampleSnapshot);
    const res = await request(buildApp()).get('/admin/operations/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: sampleSnapshot });
    expect(mockGetSnapshot).toHaveBeenCalledWith({ force: false });
  });

  it('passes force=true through when ?force=1', async () => {
    mockGetSnapshot.mockResolvedValue(sampleSnapshot);
    await request(buildApp()).get('/admin/operations/dashboard?force=1').expect(200);
    expect(mockGetSnapshot).toHaveBeenCalledWith({ force: true });
  });

  it('passes force=true through when ?force=true', async () => {
    mockGetSnapshot.mockResolvedValue(sampleSnapshot);
    await request(buildApp()).get('/admin/operations/dashboard?force=true').expect(200);
    expect(mockGetSnapshot).toHaveBeenCalledWith({ force: true });
  });

  it('surfaces service errors via the error handler (500)', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('boom'));
    const res = await request(buildApp()).get('/admin/operations/dashboard');
    expect(res.status).toBe(500);
  });
});

describe('Auth gate (real authorize middleware)', () => {
  beforeEach(() => {
    mockUserHolder.current = { sub: 'enumerator-id', role: 'enumerator' };
  });

  it('returns 403 for a non-super-admin', async () => {
    const res = await request(buildApp()).get('/admin/operations/dashboard');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockGetSnapshot).not.toHaveBeenCalled();
  });
});
