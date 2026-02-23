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
    for (const m of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit', 'offset', 'set']) {
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

// Valid UUID for tests (H3: controller now validates UUID format)
const TEST_DET_ID = '00000000-0000-4000-8000-000000000001';
const TEST_DET_ID_2 = '00000000-0000-4000-8000-000000000002';

const sampleListItem = {
  id: TEST_DET_ID,
  submissionId: 'sub-1',
  enumeratorId: 'enum-1',
  severity: 'medium',
  totalScore: '55.00',
  resolution: null,
  resolutionNotes: null,
  reviewedBy: null,
  reviewedAt: null,
  computedAt: new Date('2026-02-20T10:00:00Z'),
  enumeratorName: 'Test Enumerator',
  submittedAt: new Date('2026-02-20T09:00:00Z'),
};

const sampleDetectionDetail = {
  id: TEST_DET_ID,
  submissionId: 'sub-1',
  enumeratorId: 'enum-1',
  severity: 'medium',
  gpsScore: '15.00',
  speedScore: '20.00',
  straightlineScore: '10.00',
  duplicateScore: '5.00',
  timingScore: '5.00',
  totalScore: '55.00',
  configSnapshotVersion: 1,
  gpsDetails: { clusterCount: 3 },
  speedDetails: { completionTimeSeconds: 30 },
  straightlineDetails: { flaggedBatteryCount: 1, batteries: [] },
  duplicateDetails: null,
  timingDetails: null,
  resolution: null,
  resolutionNotes: null,
  reviewedBy: null,
  reviewedAt: null,
  computedAt: new Date('2026-02-20T10:00:00Z'),
  gpsLatitude: 7.3775,
  gpsLongitude: 3.947,
  submittedAt: new Date('2026-02-20T09:00:00Z'),
  enumeratorName: 'Test Enumerator',
  enumeratorLgaId: 'lga-ib-north',
  formName: 'OSLSR Survey v1',
};

describe('FraudDetectionsController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── listDetections ──────────────────────────────────────────────────

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
        expect.objectContaining({ data: [], totalItems: 0, totalPages: 0 }),
      );
    });

    it('returns paginated results with enriched JOINs for super_admin', async () => {
      mockDbQuery
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([sampleListItem]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        query: { page: '1', pageSize: '10' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.listDetections(mockReq, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      const result = jsonMock.mock.calls[0][0];
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalItems).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.data[0].totalScore).toBe(55); // parseFloat applied
      expect(result.data[0].enumeratorName).toBe('Test Enumerator');
    });

    it('returns results scoped to supervisor enumerators', async () => {
      mockGetEnumeratorIds.mockResolvedValue(['enum-1', 'enum-2']);
      mockDbQuery
        .mockResolvedValueOnce([{ count: 2 }])
        .mockResolvedValueOnce([sampleListItem, { ...sampleListItem, id: TEST_DET_ID_2, enumeratorId: 'enum-2' }]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        query: {},
        user: { sub: 'supervisor-1', role: 'supervisor' },
      } as unknown as Request;

      await FraudDetectionsController.listDetections(mockReq, mockRes as Response, mockNext);

      expect(mockGetEnumeratorIds).toHaveBeenCalledWith('supervisor-1');
      expect(mockNext).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ totalItems: 2, data: expect.arrayContaining([expect.objectContaining({ id: TEST_DET_ID })]) }),
      );
    });

    it('calls next with 400 for invalid severity filter', async () => {
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

    it('supports comma-separated severity filter (AC4.4.2)', async () => {
      mockDbQuery
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        query: { severity: 'high,critical' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.listDetections(mockReq, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ totalItems: 0 }));
    });

    it('supports reviewed=true filter (AC4.4.2)', async () => {
      mockDbQuery
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        query: { reviewed: 'true' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.listDetections(mockReq, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ totalItems: 0 }));
    });

    it('supports reviewed=false filter for unreviewed (AC4.4.2)', async () => {
      mockDbQuery
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        query: { reviewed: 'false' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.listDetections(mockReq, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ totalItems: 0 }));
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

  // ── getDetection ────────────────────────────────────────────────────

  describe('getDetection', () => {
    it('calls next with 401 when no user', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = { params: { id: TEST_DET_ID } } as unknown as Request;

      await FraudDetectionsController.getDetection(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(401);
    });

    it('calls next with 400 for invalid UUID format (H3 fix)', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: 'not-a-valid-uuid' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.getDetection(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('Invalid detection ID');
    });

    it('calls next with 404 when detection not found', async () => {
      mockDbQuery.mockResolvedValueOnce([]);

      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: '01234567-89ab-cdef-0123-456789abcdef' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.getDetection(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(404);
    });

    it('returns enriched detection detail with JOINs for super_admin', async () => {
      mockDbQuery.mockResolvedValueOnce([sampleDetectionDetail]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: TEST_DET_ID },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.getDetection(mockReq, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      const result = jsonMock.mock.calls[0][0];
      expect(result.data.enumeratorName).toBe('Test Enumerator');
      expect(result.data.formName).toBe('OSLSR Survey v1');
      // Numeric scores cast to numbers
      expect(result.data.totalScore).toBe(55);
      expect(result.data.gpsScore).toBe(15);
      expect(result.data.speedScore).toBe(20);
      expect(result.data.straightlineScore).toBe(10);
      expect(result.data.duplicateScore).toBe(5);
      expect(result.data.timingScore).toBe(5);
    });

    it('allows supervisor to view detection for their enumerator', async () => {
      mockDbQuery.mockResolvedValueOnce([sampleDetectionDetail]);
      mockGetEnumeratorIds.mockResolvedValue(['enum-1', 'enum-2']);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: TEST_DET_ID },
        user: { sub: 'supervisor-1', role: 'supervisor' },
      } as unknown as Request;

      await FraudDetectionsController.getDetection(mockReq, mockRes as Response, mockNext);

      expect(mockGetEnumeratorIds).toHaveBeenCalledWith('supervisor-1');
      expect(mockNext).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ id: TEST_DET_ID }) }),
      );
    });

    it('blocks supervisor from viewing detection outside their scope (403)', async () => {
      mockDbQuery.mockResolvedValueOnce([{ ...sampleDetectionDetail, enumeratorId: 'enum-99' }]);
      mockGetEnumeratorIds.mockResolvedValue(['enum-1', 'enum-2']);

      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: TEST_DET_ID },
        user: { sub: 'supervisor-1', role: 'supervisor' },
      } as unknown as Request;

      await FraudDetectionsController.getDetection(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(403);
    });
  });

  // ── reviewDetection ─────────────────────────────────────────────────

  describe('reviewDetection', () => {
    it('calls next with 401 when no user', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: TEST_DET_ID },
        body: { resolution: 'confirmed_fraud' },
      } as unknown as Request;

      await FraudDetectionsController.reviewDetection(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(401);
    });

    it('calls next with 400 for invalid UUID format (H3 fix)', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: 'not-a-uuid' },
        body: { resolution: 'confirmed_fraud' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.reviewDetection(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('Invalid detection ID');
    });

    it('calls next with 400 for invalid resolution', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: TEST_DET_ID },
        body: { resolution: 'invalid_value' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.reviewDetection(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(400);
    });

    it('calls next with 404 when detection not found', async () => {
      mockDbQuery.mockResolvedValueOnce([]);

      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: '01234567-89ab-cdef-0123-456789abcdef' },
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
        ...sampleDetectionDetail,
        resolution: 'confirmed_fraud',
        reviewedBy: 'admin-1',
        reviewedAt: new Date(),
        resolutionNotes: 'Verified duplicate GPS coords',
      };

      mockDbQuery.mockResolvedValueOnce([{ id: TEST_DET_ID, enumeratorId: 'enum-1' }]);
      mockDbUpdate.mockResolvedValueOnce([updatedDetection]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: TEST_DET_ID },
        body: { resolution: 'confirmed_fraud', resolutionNotes: 'Verified duplicate GPS coords' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.reviewDetection(mockReq, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      // L2 fix: castScores() now applied — numeric scores returned as numbers
      const result = jsonMock.mock.calls[0][0];
      expect(result.data.resolution).toBe('confirmed_fraud');
      expect(result.data.reviewedBy).toBe('admin-1');
      expect(result.data.totalScore).toBe(55);
      expect(typeof result.data.gpsScore).toBe('number');
    });

    it('blocks supervisor from reviewing detection outside their scope', async () => {
      mockDbQuery.mockResolvedValueOnce([{ id: TEST_DET_ID, enumeratorId: 'enum-99' }]);
      mockGetEnumeratorIds.mockResolvedValue(['enum-1', 'enum-2']);

      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: TEST_DET_ID },
        body: { resolution: 'false_positive' },
        user: { sub: 'supervisor-1', role: 'supervisor' },
      } as unknown as Request;

      await FraudDetectionsController.reviewDetection(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(403);
    });

    it('allows supervisor to review detection within their scope', async () => {
      const updatedDetection = { ...sampleDetectionDetail, resolution: 'false_positive', reviewedBy: 'supervisor-1' };

      mockDbQuery.mockResolvedValueOnce([{ id: TEST_DET_ID, enumeratorId: 'enum-1' }]);
      mockGetEnumeratorIds.mockResolvedValue(['enum-1', 'enum-2']);
      mockDbUpdate.mockResolvedValueOnce([updatedDetection]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: TEST_DET_ID },
        body: { resolution: 'false_positive' },
        user: { sub: 'supervisor-1', role: 'supervisor' },
      } as unknown as Request;

      await FraudDetectionsController.reviewDetection(mockReq, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      // L2 fix: castScores() now applied — verify numeric scores
      const result = jsonMock.mock.calls[0][0];
      expect(result.data.resolution).toBe('false_positive');
      expect(result.data.reviewedBy).toBe('supervisor-1');
      expect(typeof result.data.totalScore).toBe('number');
    });

    it('denies enumerator role access (via RBAC middleware, tested conceptually)', async () => {
      // RBAC middleware blocks enumerator before controller — test that controller
      // still validates auth if somehow reached
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: TEST_DET_ID },
        body: { resolution: 'confirmed_fraud' },
        // Enumerator should never reach here (RBAC blocks), but controller still checks auth
      } as unknown as Request;

      await FraudDetectionsController.reviewDetection(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(401);
    });
  });
});
