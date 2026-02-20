import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ── Hoisted mocks ──────────────────────────────────────────────────────
const mockDbQuery = vi.fn();
const mockDbUpdate = vi.fn();
const mockGetEnumeratorIds = vi.fn();

vi.mock('../../db/index.js', () => {
  // Each chain step is both chainable and thenable.
  // When awaited, resolves via mockDbQuery(). The returning() terminal uses mockDbUpdate().
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy', 'limit', 'offset', 'set']) {
      chain[m] = () => makeChain();
    }
    chain.returning = () => mockDbUpdate();
    chain.then = (
      resolve?: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(mockDbQuery()).then(resolve, reject);
    return chain;
  }

  return {
    db: {
      select: () => makeChain(),
      update: () => makeChain(),
    },
  };
});

vi.mock('../../services/team-assignment.service.js', () => ({
  TeamAssignmentService: {
    getEnumeratorIdsForSupervisor: (...args: unknown[]) => mockGetEnumeratorIds(...args),
  },
}));

vi.mock('pino', () => ({ default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

// Import after mocks
const { FraudDetectionsController } = await import('../fraud-detections.controller.js');

// ── Test Helpers ───────────────────────────────────────────────────────

function makeMocks() {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnThis();
  const mockRes: Partial<Response> = { json: jsonMock, status: statusMock };
  const mockNext: NextFunction = vi.fn();
  return { jsonMock, statusMock, mockRes, mockNext };
}

const sampleDetection = {
  id: 'det-1',
  submissionId: 'sub-1',
  enumeratorId: 'enum-1',
  severity: 'medium',
  totalScore: 55,
  componentScores: { gps: 15, speed: 20, straightline: 10, duplicate: 5, timing: 5 },
  details: {},
  resolution: null,
  reviewedBy: null,
  reviewedAt: null,
  resolutionNotes: null,
  configVersion: 1,
  computedAt: new Date('2026-02-20T10:00:00Z'),
};

describe('FraudDetectionsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listDetections', () => {
    it('calls next with 401 when no user', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = { query: {} } as unknown as Request;

      await FraudDetectionsController.listDetections(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(401);
    });

    it('returns empty for supervisor with no assigned enumerators', async () => {
      mockGetEnumeratorIds.mockResolvedValue([]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        query: {},
        user: { sub: 'supervisor-1', role: 'supervisor' },
      } as unknown as Request;

      await FraudDetectionsController.listDetections(mockReq, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: [], total: 0 }),
      );
    });

    it('returns paginated results for super_admin', async () => {
      // First await = count query, second await = rows query
      mockDbQuery
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([sampleDetection]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        query: { page: '1', pageSize: '10' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.listDetections(mockReq, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({
        data: [sampleDetection],
        total: 1,
        page: 1,
        pageSize: 10,
      });
    });

    it('returns results scoped to supervisor enumerators', async () => {
      mockGetEnumeratorIds.mockResolvedValue(['enum-1', 'enum-2']);
      mockDbQuery
        .mockResolvedValueOnce([{ count: 2 }])
        .mockResolvedValueOnce([sampleDetection, { ...sampleDetection, id: 'det-2', enumeratorId: 'enum-2' }]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        query: {},
        user: { sub: 'supervisor-1', role: 'supervisor' },
      } as unknown as Request;

      await FraudDetectionsController.listDetections(mockReq, mockRes as Response, mockNext);

      expect(mockGetEnumeratorIds).toHaveBeenCalledWith('supervisor-1');
      expect(mockNext).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ total: 2, data: expect.arrayContaining([expect.objectContaining({ id: 'det-1' })]) }),
      );
    });

    it('calls next with 400 for invalid severity filter (M3)', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        query: { severity: 'bogus_severity' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.listDetections(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('Invalid severity');
    });

    it('calls next with 400 for invalid resolution filter (M3)', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        query: { resolution: 'bogus_resolution' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.listDetections(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('Invalid resolution');
    });

    it('accepts valid severity and resolution filters', async () => {
      mockDbQuery
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        query: { severity: 'high', resolution: 'confirmed_fraud' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.listDetections(mockReq, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: [], total: 0 }),
      );
    });

    it('accepts "unreviewed" resolution filter', async () => {
      mockDbQuery
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        query: { resolution: 'unreviewed' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.listDetections(mockReq, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: [], total: 0 }),
      );
    });

    it('clamps pageSize to max 100', async () => {
      mockDbQuery
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        query: { pageSize: '500' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.listDetections(mockReq, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ pageSize: 100 }),
      );
    });
  });

  describe('reviewDetection', () => {
    it('calls next with 401 when no user', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: 'det-1' },
        body: { resolution: 'confirmed_fraud' },
      } as unknown as Request;

      await FraudDetectionsController.reviewDetection(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(401);
    });

    it('calls next with 400 for invalid resolution', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: 'det-1' },
        body: { resolution: 'invalid_value' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.reviewDetection(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(400);
    });

    it('calls next with 404 when detection not found', async () => {
      mockDbQuery.mockResolvedValueOnce([]); // Empty lookup

      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: 'det-nonexistent' },
        body: { resolution: 'confirmed_fraud' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.reviewDetection(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('not found');
    });

    it('successfully reviews a detection', async () => {
      const updatedDetection = {
        ...sampleDetection,
        resolution: 'confirmed_fraud',
        reviewedBy: 'admin-1',
        reviewedAt: new Date(),
        resolutionNotes: 'Verified duplicate GPS coords',
      };

      mockDbQuery.mockResolvedValueOnce([{ id: 'det-1', enumeratorId: 'enum-1' }]); // lookup
      mockDbUpdate.mockResolvedValueOnce([updatedDetection]); // update returning

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: 'det-1' },
        body: { resolution: 'confirmed_fraud', resolutionNotes: 'Verified duplicate GPS coords' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.reviewDetection(mockReq, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ data: updatedDetection });
    });

    it('blocks supervisor from reviewing detection outside their scope', async () => {
      mockDbQuery.mockResolvedValueOnce([{ id: 'det-1', enumeratorId: 'enum-99' }]); // lookup
      mockGetEnumeratorIds.mockResolvedValue(['enum-1', 'enum-2']); // supervisor's enumerators

      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: 'det-1' },
        body: { resolution: 'false_positive' },
        user: { sub: 'supervisor-1', role: 'supervisor' },
      } as unknown as Request;

      await FraudDetectionsController.reviewDetection(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(403);
    });

    it('allows supervisor to review detection within their scope', async () => {
      const updatedDetection = { ...sampleDetection, resolution: 'false_positive', reviewedBy: 'supervisor-1' };

      mockDbQuery.mockResolvedValueOnce([{ id: 'det-1', enumeratorId: 'enum-1' }]); // lookup
      mockGetEnumeratorIds.mockResolvedValue(['enum-1', 'enum-2']); // supervisor's enumerators
      mockDbUpdate.mockResolvedValueOnce([updatedDetection]); // update returning

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: 'det-1' },
        body: { resolution: 'false_positive' },
        user: { sub: 'supervisor-1', role: 'supervisor' },
      } as unknown as Request;

      await FraudDetectionsController.reviewDetection(mockReq, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ data: updatedDetection });
    });
  });
});
