/**
 * Authorization-gate coverage for `imports.routes.ts` (Story 11-2, code-review
 * M3). Unlike `imports.routes.test.ts` — which stubs `authorize` to a
 * pass-through to test wiring — this file exercises the REAL rbac `authorize`
 * middleware so the super-admin gate is actually proven: a non-super-admin is
 * rejected with 403 and never reaches the service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { AppError } from '@oslsr/utils';
import { UserRole } from '@oslsr/types';

// Mutable actor role, set per test before the request.
const state = vi.hoisted(() => ({ role: 'super_admin' as string }));

vi.mock('../../middleware/auth.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = { sub: 'u1', role: state.role };
    next();
  },
}));

// rbac is INTENTIONALLY NOT mocked — the real authorize(SUPER_ADMIN) gate runs.

vi.mock('../../middleware/import-rate-limit.js', () => ({
  importDryRunRateLimit: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  importConfirmRateLimit: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  importRollbackRateLimit: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

const { mockList } = vi.hoisted(() => ({ mockList: vi.fn() }));

vi.mock('../../services/import.service.js', () => ({
  ImportService: {
    list: mockList,
    dryRun: vi.fn(),
    confirm: vi.fn(),
    rollback: vi.fn(),
    get: vi.fn(),
    getFailureReportCsv: vi.fn(),
  },
}));

const importsRoutes = (await import('../imports.routes.js')).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin/imports', importsRoutes);
  app.use((err: Error & { statusCode?: number; code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ status: 'error', code: err.code, message: err.message });
    }
    return res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: err.message });
  });
  return app;
}

describe('imports.routes — super-admin authorization gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ batches: [], page: 1, pageSize: 50, total: 0 });
  });

  it('rejects a non-super-admin with 403 and never reaches the service', async () => {
    state.role = UserRole.ENUMERATOR;
    const res = await request(buildApp()).get('/admin/imports');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(mockList).not.toHaveBeenCalled();
  });

  it('rejects a government official (privileged but not super-admin) with 403', async () => {
    state.role = UserRole.GOVERNMENT_OFFICIAL;
    const res = await request(buildApp()).get('/admin/imports');
    expect(res.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('allows a super-admin through to the service', async () => {
    state.role = UserRole.SUPER_ADMIN;
    const res = await request(buildApp()).get('/admin/imports');
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledOnce();
  });
});
