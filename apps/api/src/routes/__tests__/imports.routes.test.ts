/**
 * Route-level supertest coverage for `imports.routes.ts` (Story 11-2).
 *
 * Mocks the auth middleware (inject a super-admin), the rate limiters
 * (pass-through), and ImportService (so we assert wiring, not DB). Exercises
 * multipart upload, request validation, response shapes, and AppError → HTTP
 * mapping through a real Express app + the project's error handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { AppError } from '@oslsr/utils';

const { mockDryRun, mockConfirm, mockRollback, mockList, mockGet, mockGetFailureReportCsv } = vi.hoisted(() => ({
  mockDryRun: vi.fn(),
  mockConfirm: vi.fn(),
  mockRollback: vi.fn(),
  mockList: vi.fn(),
  mockGet: vi.fn(),
  mockGetFailureReportCsv: vi.fn(),
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = { sub: 'admin-1', role: 'super_admin' };
    next();
  },
}));

vi.mock('../../middleware/rbac.js', () => ({
  authorize: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../../middleware/import-rate-limit.js', () => ({
  importDryRunRateLimit: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  importConfirmRateLimit: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  importRollbackRateLimit: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../../services/import.service.js', () => ({
  ImportService: {
    dryRun: mockDryRun,
    confirm: mockConfirm,
    rollback: mockRollback,
    list: mockList,
    get: mockGet,
    getFailureReportCsv: mockGetFailureReportCsv,
  },
}));

const importsRoutes = (await import('../imports.routes.js')).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin/imports', importsRoutes);
  // Minimal mirror of the app.ts error handler (AppError → status).
  app.use((err: Error & { statusCode?: number; code?: string; details?: unknown }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ status: 'error', code: err.code, message: err.message, details: err.details });
    }
    return res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: err.message });
  });
  return app;
}

describe('imports.routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /dry-run requires a file', async () => {
    const res = await request(buildApp())
      .post('/admin/imports/dry-run')
      .field('source', 'imported_other')
      .field('parser_used', 'csv');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockDryRun).not.toHaveBeenCalled();
  });

  it('POST /dry-run uploads a file and returns the preview', async () => {
    mockDryRun.mockResolvedValue({ dryRunToken: 'draft.mac', batchPreview: { rowsParsed: 3 }, lawfulBasisRequired: true });
    const res = await request(buildApp())
      .post('/admin/imports/dry-run')
      .field('source', 'imported_other')
      .field('parser_used', 'csv')
      .field('column_mapping', JSON.stringify({ Name: 'fullName', Phone: 'phoneNumber' }))
      .attach('file', Buffer.from('Name,Phone\nAda,08012345678'), 'members.csv');

    expect(res.status).toBe(200);
    expect(res.body.data.dryRunToken).toBe('draft.mac');
    expect(mockDryRun).toHaveBeenCalledOnce();
    const arg = mockDryRun.mock.calls[0][0];
    expect(arg.source).toBe('imported_other');
    expect(arg.parserUsed).toBe('csv');
    expect(arg.columnMapping).toEqual({ Name: 'fullName', Phone: 'phoneNumber' });
    expect(Buffer.isBuffer(arg.buffer)).toBe(true);
  });

  it('POST /dry-run rejects invalid column_mapping JSON', async () => {
    const res = await request(buildApp())
      .post('/admin/imports/dry-run')
      .field('source', 'imported_other')
      .field('parser_used', 'csv')
      .field('column_mapping', '{not json')
      .attach('file', Buffer.from('x'), 'x.csv');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /confirm requires a dry_run_token', async () => {
    const res = await request(buildApp()).post('/admin/imports/confirm').send({ lawful_basis: 'ndpa_6_1_e' });
    expect(res.status).toBe(400);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('POST /confirm forwards to the service and returns 201', async () => {
    mockConfirm.mockResolvedValue({ batchId: 'b1', rowsInserted: 2 });
    const res = await request(buildApp())
      .post('/admin/imports/confirm')
      .send({ dry_run_token: 'draft.mac', lawful_basis: 'ndpa_6_1_e' });
    expect(res.status).toBe(201);
    expect(res.body.data.batchId).toBe('b1');
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ dryRunToken: 'draft.mac', lawfulBasis: 'ndpa_6_1_e' }));
  });

  it('maps a service AppError to its HTTP status (DUPLICATE_FILE_HASH → 409)', async () => {
    mockDryRun.mockRejectedValue(new AppError('DUPLICATE_FILE_HASH', 'dup', 409, { existingBatchId: 'b0' }));
    const res = await request(buildApp())
      .post('/admin/imports/dry-run')
      .field('source', 'imported_other')
      .field('parser_used', 'csv')
      .attach('file', Buffer.from('x'), 'x.csv');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_FILE_HASH');
    expect(res.body.details.existingBatchId).toBe('b0');
  });

  it('POST /:id/rollback forwards batchId + reason', async () => {
    mockRollback.mockResolvedValue({ batchId: 'b1', rowsAffected: 5 });
    const res = await request(buildApp())
      .post('/admin/imports/b1/rollback')
      .send({ reason: 'Wrong file uploaded — rolling back per operator review.' });
    expect(res.status).toBe(200);
    expect(res.body.data.rowsAffected).toBe(5);
    expect(mockRollback).toHaveBeenCalledWith(expect.objectContaining({ batchId: 'b1' }));
  });

  it('GET / lists batches with pagination', async () => {
    mockList.mockResolvedValue({ batches: [{ id: 'b1' }], page: 1, pageSize: 50, total: 1 });
    const res = await request(buildApp()).get('/admin/imports?source=imported_other');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ source: 'imported_other' }));
  });

  it('GET /:id returns a batch', async () => {
    mockGet.mockResolvedValue({ id: 'b1', source: 'imported_other' });
    const res = await request(buildApp()).get('/admin/imports/b1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('b1');
  });

  it('GET /:id/failure-report.csv streams a CSV attachment (AC#8)', async () => {
    mockGetFailureReportCsv.mockResolvedValue({
      filename: 'import-batch-b1-failures.csv',
      csv: 'row_index,category,reason,matched_respondent_id_hash\r\n2,failed,missing_or_invalid_phone,',
    });
    const res = await request(buildApp()).get('/admin/imports/b1/failure-report.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment; filename="import-batch-b1-failures.csv"');
    expect(res.text).toContain('missing_or_invalid_phone');
    expect(mockGetFailureReportCsv).toHaveBeenCalledWith('b1');
  });
});
