/**
 * Story 9-11 — Tests for audit-log-viewer.routes.ts.
 *
 * Coverage strategy:
 *   - Stub the auth + rate-limit middleware (always-pass) to isolate route
 *     behavior from JWT/Redis setup.
 *   - Mock the service layer so we control responses + assert the route
 *     wires inputs/outputs correctly.
 *   - Use supertest to exercise the actual express handlers end-to-end.
 *   - Wire a small AppError → JSON envelope handler so error-path assertions
 *     can verify status codes + error codes.
 *
 * What this file does NOT test:
 *   - Auth gate behavior (authenticate / authorize) — covered indirectly by
 *     the project's existing route-test pattern; these middlewares are stubbed.
 *   - SQL composition correctness — covered in service tests (real DB).
 *   - Rate limit enforcement — middleware is stubbed; rate-limit unit tests
 *     live in `audit-log-rate-limit.test.ts` (TBD if we add).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Hoisted mocks ───────────────────────────────────────────────────────

const {
  mockListAuditLogs,
  mockGetAuditLogById,
  mockGetDistinctValues,
  mockSearchPrincipals,
  mockExportAuditLogsCsv,
  mockLogAction,
  mockDbExecute,
} = vi.hoisted(() => ({
  mockListAuditLogs: vi.fn(),
  mockGetAuditLogById: vi.fn(),
  mockGetDistinctValues: vi.fn(),
  mockSearchPrincipals: vi.fn(),
  mockExportAuditLogsCsv: vi.fn(),
  mockLogAction: vi.fn(),
  mockDbExecute: vi.fn(),
}));

class MockExportTooLargeError extends Error {
  constructor(public count: number) {
    super(`mock too large (${count})`);
    this.name = 'ExportTooLargeError';
  }
}

vi.mock('../../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { sub: 'mock-super-admin-id', role: 'super_admin' };
    next();
  }),
}));
vi.mock('../../middleware/rbac.js', () => ({
  authorize: () => vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../middleware/audit-log-rate-limit.js', () => ({
  auditLogReadRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  auditLogExportRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../services/audit-log-viewer.service.js', () => ({
  listAuditLogs: mockListAuditLogs,
  getAuditLogById: mockGetAuditLogById,
  getDistinctValues: mockGetDistinctValues,
  searchPrincipals: mockSearchPrincipals,
  exportAuditLogsCsv: mockExportAuditLogsCsv,
  ExportTooLargeError: MockExportTooLargeError,
}));
vi.mock('../../services/audit.service.js', () => ({
  AuditService: { logAction: mockLogAction },
  AUDIT_ACTIONS: { AUDIT_LOG_EXPORTED: 'audit_log.exported' },
}));
vi.mock('../../db/index.js', () => ({
  db: { execute: mockDbExecute },
}));

// ── Import SUT ──────────────────────────────────────────────────────────

const { default: router } = await import('../audit-log-viewer.routes.js');

// Minimal AppError-aware error handler so we can assert status codes.
interface AppErrorLike { code: string; message: string; statusCode: number }
function isAppErrorLike(e: unknown): e is AppErrorLike {
  return !!e && typeof e === 'object' && 'code' in e && 'statusCode' in e;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin/audit-logs', router);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (isAppErrorLike(err)) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL', message: (err as Error).message } });
  });
  return app;
}

describe('audit-log-viewer routes — registration', () => {
  it('registers all 5 endpoints', () => {
    const paths = router.stack
      .filter((layer: { route?: { path: string } }) => layer.route)
      .map((layer: { route: { path: string; methods: Record<string, boolean> } }) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));
    const get = (p: string) => paths.find((r) => r.path === p && r.methods.includes('get'));
    const post = (p: string) => paths.find((r) => r.path === p && r.methods.includes('post'));
    expect(get('/')).toBeDefined();
    expect(get('/distinct/:field')).toBeDefined();
    expect(get('/principals/search')).toBeDefined();
    expect(post('/export')).toBeDefined();
    expect(get('/:id')).toBeDefined();
  });

  it('parameterized /:id is registered LAST (specific routes match first)', () => {
    const paths = router.stack
      .filter((layer: { route?: { path: string } }) => layer.route)
      .map((layer: { route: { path: string } }) => layer.route.path);
    const idIndex = paths.indexOf('/:id');
    const distinctIndex = paths.indexOf('/distinct/:field');
    const exportIndex = paths.indexOf('/export');
    const principalsIndex = paths.indexOf('/principals/search');
    expect(idIndex).toBeGreaterThan(distinctIndex);
    expect(idIndex).toBeGreaterThan(exportIndex);
    expect(idIndex).toBeGreaterThan(principalsIndex);
  });
});

describe('GET /admin/audit-logs (list)', () => {
  beforeEach(() => {
    mockListAuditLogs.mockReset();
  });

  it('returns 200 + service result with default 24h filter when no params', async () => {
    mockListAuditLogs.mockResolvedValue({ rows: [], nextCursor: null });
    const res = await request(buildApp()).get('/admin/audit-logs');
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toEqual([]);
    expect(mockListAuditLogs).toHaveBeenCalledOnce();
    const filter = mockListAuditLogs.mock.calls[0][0];
    expect(filter.principalTypes).toEqual(['user', 'consumer', 'system']);
    expect(filter.from).toBeDefined(); // default last-24h applied
  });

  it('parses principal as comma-separated query param', async () => {
    mockListAuditLogs.mockResolvedValue({ rows: [], nextCursor: null });
    await request(buildApp()).get('/admin/audit-logs?principal=user,consumer');
    const filter = mockListAuditLogs.mock.calls[0][0];
    expect(filter.principalTypes).toEqual(['user', 'consumer']);
  });

  it('returns 400 on invalid principal type', async () => {
    const res = await request(buildApp()).get('/admin/audit-logs?principal=spaceship');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_QUERY');
  });

  it('returns 400 on invalid date format', async () => {
    const res = await request(buildApp()).get('/admin/audit-logs?from=not-a-date');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_QUERY');
  });

  it('returns 400 on invalid cursor (passed through to service which decodes/ignores)', async () => {
    mockListAuditLogs.mockResolvedValue({ rows: [], nextCursor: null });
    // Cursor is opaque; service handles malformed by treating as first page.
    // The route just bounds the length.
    const res = await request(buildApp()).get(`/admin/audit-logs?cursor=${'a'.repeat(3000)}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /admin/audit-logs/distinct/:field', () => {
  beforeEach(() => mockGetDistinctValues.mockReset());

  it('returns 200 + values for action', async () => {
    mockGetDistinctValues.mockResolvedValue(['auth.login', 'pii.view_record']);
    const res = await request(buildApp()).get('/admin/audit-logs/distinct/action');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(['auth.login', 'pii.view_record']);
  });

  it('returns 200 + values for target_resource', async () => {
    mockGetDistinctValues.mockResolvedValue(['users', 'respondents']);
    const res = await request(buildApp()).get('/admin/audit-logs/distinct/target_resource');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(['users', 'respondents']);
  });

  it('returns 400 for invalid field name', async () => {
    const res = await request(buildApp()).get('/admin/audit-logs/distinct/some_unknown_column');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FIELD');
    expect(mockGetDistinctValues).not.toHaveBeenCalled();
  });
});

describe('GET /admin/audit-logs/principals/search', () => {
  beforeEach(() => mockSearchPrincipals.mockReset());

  it('returns empty array for empty query without hitting the service', async () => {
    const res = await request(buildApp()).get('/admin/audit-logs/principals/search?q=');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(mockSearchPrincipals).not.toHaveBeenCalled();
  });

  it('forwards non-empty query to the service', async () => {
    mockSearchPrincipals.mockResolvedValue([
      { id: 'u1', name: 'Awwal', type: 'user' },
    ]);
    const res = await request(buildApp()).get('/admin/audit-logs/principals/search?q=awwa');
    expect(res.status).toBe(200);
    expect(mockSearchPrincipals).toHaveBeenCalledWith('awwa');
    expect(res.body.data[0].name).toBe('Awwal');
  });
});

describe('POST /admin/audit-logs/export', () => {
  beforeEach(() => {
    mockExportAuditLogsCsv.mockReset();
    mockLogAction.mockReset();
    mockDbExecute.mockReset();
    mockDbExecute.mockResolvedValue({ rows: [{ full_name: 'Test Super Admin' }] });
  });

  it('returns text/csv with the service-provided filename in Content-Disposition', async () => {
    mockExportAuditLogsCsv.mockResolvedValue({
      csv: '# header\nid,timestamp\nrow1,2026-05-03',
      filename: 'audit_log_user_users_2026-05-01--2026-05-03.csv',
      rowCount: 1,
      filterSignature: 'audit_log_user_users_2026-05-01--2026-05-03',
    });
    const res = await request(buildApp())
      .post('/admin/audit-logs/export')
      .send({ principal: ['user'], from: '2026-05-01T00:00:00Z', to: '2026-05-03T00:00:00Z' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain('audit_log_user_users');
    expect(res.headers['x-audit-log-row-count']).toBe('1');
  });

  it('audit-logs the export action with filter_signature + row_count', async () => {
    mockExportAuditLogsCsv.mockResolvedValue({
      csv: '',
      filename: 'audit_log_all_all_all-dates.csv',
      rowCount: 5,
      filterSignature: 'audit_log_all_all_all-dates',
    });
    await request(buildApp()).post('/admin/audit-logs/export').send({});
    expect(mockLogAction).toHaveBeenCalledOnce();
    const auditPayload = mockLogAction.mock.calls[0][0];
    expect(auditPayload.action).toBe('audit_log.exported');
    expect(auditPayload.targetResource).toBe('audit_logs');
    expect(auditPayload.actorId).toBe('mock-super-admin-id');
    expect(auditPayload.details.filter_signature).toBe('audit_log_all_all_all-dates');
    expect(auditPayload.details.row_count).toBe(5);
  });

  it('returns 413 EXPORT_TOO_LARGE when service throws ExportTooLargeError', async () => {
    mockExportAuditLogsCsv.mockRejectedValue(new MockExportTooLargeError(50_000));
    const res = await request(buildApp()).post('/admin/audit-logs/export').send({});
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('EXPORT_TOO_LARGE');
    expect(res.body.error.message).toContain('50000');
    expect(mockLogAction).not.toHaveBeenCalled(); // no audit log on failure
  });

  it('returns 400 on invalid body schema', async () => {
    const res = await request(buildApp())
      .post('/admin/audit-logs/export')
      .send({ from: 'not-a-date' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
  });
});

describe('GET /admin/audit-logs/:id (detail)', () => {
  beforeEach(() => mockGetAuditLogById.mockReset());

  it('returns 200 + row when found', async () => {
    mockGetAuditLogById.mockResolvedValue({
      id: '019dee76-1234-7000-9000-abcdef012345',
      action: 'auth.login',
      principalName: 'Test User',
      principalType: 'user',
    });
    const res = await request(buildApp()).get(
      '/admin/audit-logs/019dee76-1234-7000-9000-abcdef012345'
    );
    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe('auth.login');
  });

  it('returns 404 when service returns null', async () => {
    mockGetAuditLogById.mockResolvedValue(null);
    const res = await request(buildApp()).get(
      '/admin/audit-logs/019dee76-1234-7000-9000-abcdef012345'
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('AUDIT_LOG_NOT_FOUND');
  });

  it('returns 400 on non-UUID id', async () => {
    const res = await request(buildApp()).get('/admin/audit-logs/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
    expect(mockGetAuditLogById).not.toHaveBeenCalled();
  });
});
