import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const { mockVerifyHashChain, mockGetRecordCount } = vi.hoisted(() => ({
  mockVerifyHashChain: vi.fn(),
  mockGetRecordCount: vi.fn(),
}));

vi.mock('../../services/audit.service.js', () => ({
  AuditService: {
    verifyHashChain: (...args: any[]) => mockVerifyHashChain(...args),
    getRecordCount: () => mockGetRecordCount(),
  },
}));

// ── Import SUT ─────────────────────────────────────────────────────────

import { AuditController } from '../audit.controller.js';

// ── Helpers ────────────────────────────────────────────────────────────

function createMockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('AuditController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('verifyHashChain', () => {
    it('should return spot-check verification result by default', async () => {
      const result = { valid: true, totalRecords: 50, verified: 50 };
      mockVerifyHashChain.mockResolvedValue(result);

      const req = { query: {} } as any;
      const res = createMockRes();
      const next = vi.fn();

      await AuditController.verifyHashChain(req, res, next);

      expect(mockVerifyHashChain).toHaveBeenCalledWith({ limit: 100 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: result });
    });

    it('should use custom limit for spot-check mode', async () => {
      const result = { valid: true, totalRecords: 200, verified: 50 };
      mockVerifyHashChain.mockResolvedValue(result);

      const req = { query: { mode: 'spot', limit: '50' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await AuditController.verifyHashChain(req, res, next);

      expect(mockVerifyHashChain).toHaveBeenCalledWith({ limit: 50 });
      expect(res.json).toHaveBeenCalledWith({ data: result });
    });

    it('should run full verification when mode=full and under threshold', async () => {
      const result = { valid: true, totalRecords: 500, verified: 500 };
      mockGetRecordCount.mockResolvedValue(500);
      mockVerifyHashChain.mockResolvedValue(result);

      const req = { query: { mode: 'full' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await AuditController.verifyHashChain(req, res, next);

      expect(mockGetRecordCount).toHaveBeenCalled();
      expect(mockVerifyHashChain).toHaveBeenCalledWith();
      expect(res.json).toHaveBeenCalledWith({ data: result });
    });

    it('should defer full verification when records exceed 10k threshold', async () => {
      mockGetRecordCount.mockResolvedValue(15000);

      const req = { query: { mode: 'full' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await AuditController.verifyHashChain(req, res, next);

      expect(mockVerifyHashChain).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        data: expect.objectContaining({
          valid: null,
          totalRecords: 15000,
          verified: 0,
        }),
      });
    });

    it('should call next on error', async () => {
      mockVerifyHashChain.mockRejectedValue(new Error('DB error'));

      const req = { query: {} } as any;
      const res = createMockRes();
      const next = vi.fn();

      await AuditController.verifyHashChain(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject invalid mode parameter with 400 VALIDATION_ERROR', async () => {
      const req = { query: { mode: 'invalid' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await AuditController.verifyHashChain(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('should reject limit=0 (below minimum) with 400 VALIDATION_ERROR', async () => {
      const req = { query: { mode: 'spot', limit: '0' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await AuditController.verifyHashChain(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('should reject negative limit with 400 VALIDATION_ERROR', async () => {
      const req = { query: { mode: 'spot', limit: '-5' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await AuditController.verifyHashChain(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('should reject limit exceeding maximum (10000) with 400 VALIDATION_ERROR', async () => {
      const req = { query: { mode: 'spot', limit: '10001' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await AuditController.verifyHashChain(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });
  });
});
