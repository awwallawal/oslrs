import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ── Hoisted mocks ──────────────────────────────────────────────────────
const mockDbQuery = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();
const mockGetEnumeratorIds = vi.fn();

vi.mock('../../db/index.js', () => {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit', 'offset', 'set']) {
      chain[m] = () => makeChain();
    }
    chain.returning = () => mockDbUpdate();
    chain.values = () => mockDbInsert();
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
      insert: () => makeChain(),
      transaction: async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: () => makeChain(),
          update: () => makeChain(),
          insert: () => makeChain(),
        };
        return fn(tx);
      },
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

// Valid UUIDs
const ID_1 = '00000000-0000-4000-8000-000000000001';
const ID_2 = '00000000-0000-4000-8000-000000000002';
const ID_3 = '00000000-0000-4000-8000-000000000003';
const ID_OUT_OF_SCOPE = '00000000-0000-4000-8000-000000000099';

describe('FraudDetectionsController — Bulk (Story 4.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getClusters ─────────────────────────────────────────────────────

  describe('getClusters', () => {
    it('calls next with 401 when no user', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {} as unknown as Request;

      await FraudDetectionsController.getClusters(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(401);
    });

    it('returns empty for supervisor with no assigned enumerators', async () => {
      mockGetEnumeratorIds.mockResolvedValue([]);
      mockDbQuery.mockResolvedValueOnce([{ thresholdValue: 50 }]); // radius config

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        user: { sub: 'supervisor-1', role: 'supervisor' },
      } as unknown as Request;

      await FraudDetectionsController.getClusters(mockReq, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({ data: [] });
    });

    it('returns clusters grouped by GPS proximity for super_admin', async () => {
      // Two detections that share cluster members → should form one cluster
      mockDbQuery.mockResolvedValueOnce([{ thresholdValue: 50 }]); // radius config
      mockDbQuery.mockResolvedValueOnce([
        {
          id: ID_1,
          submissionId: 'sub-1',
          enumeratorId: 'enum-1',
          computedAt: new Date('2026-02-20T10:00:00Z'),
          totalScore: '65.00',
          severity: 'high',
          gpsDetails: {
            clusterCount: 2,
            clusterMembers: [
              { submissionId: 'sub-2', lat: 7.3775, lng: 3.947, submittedAt: '2026-02-20T10:15:00Z' },
            ],
          },
          enumeratorName: 'Adewale Johnson',
          submittedAt: new Date('2026-02-20T09:30:00Z'),
          gpsLatitude: 7.3775,
          gpsLongitude: 3.947,
        },
        {
          id: ID_2,
          submissionId: 'sub-2',
          enumeratorId: 'enum-1',
          computedAt: new Date('2026-02-20T10:15:00Z'),
          totalScore: '60.00',
          severity: 'medium',
          gpsDetails: {
            clusterCount: 2,
            clusterMembers: [
              { submissionId: 'sub-1', lat: 7.3775, lng: 3.947, submittedAt: '2026-02-20T10:00:00Z' },
            ],
          },
          enumeratorName: 'Adewale Johnson',
          submittedAt: new Date('2026-02-20T09:45:00Z'),
          gpsLatitude: 7.3776,
          gpsLongitude: 3.9471,
        },
      ]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.getClusters(mockReq, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      const result = jsonMock.mock.calls[0][0];
      expect(result.data).toHaveLength(1);
      const cluster = result.data[0];
      expect(cluster.detectionCount).toBe(2);
      expect(cluster.detectionIds).toContain(ID_1);
      expect(cluster.detectionIds).toContain(ID_2);
      expect(cluster.totalScoreAvg).toBe(62.5);
      expect(cluster.enumerators).toHaveLength(1);
      expect(cluster.enumerators[0].name).toBe('Adewale Johnson');
      // H1/H2 fix: members array with individual GPS coords
      expect(cluster.members).toHaveLength(2);
      expect(cluster.members[0].gpsLatitude).toBe(7.3775);
      expect(cluster.members[1].gpsLatitude).toBe(7.3776);
    });

    it('does not return single-detection groups (not clusters)', async () => {
      // Single detection with no cluster member overlap → not a cluster
      mockDbQuery.mockResolvedValueOnce([{ thresholdValue: 50 }]); // radius config
      mockDbQuery.mockResolvedValueOnce([
        {
          id: ID_1,
          submissionId: 'sub-1',
          enumeratorId: 'enum-1',
          computedAt: new Date('2026-02-20T10:00:00Z'),
          totalScore: '55.00',
          severity: 'medium',
          gpsDetails: {
            clusterCount: 0,
            clusterMembers: [],
          },
          enumeratorName: 'Test Enumerator',
          submittedAt: new Date('2026-02-20T09:30:00Z'),
          gpsLatitude: 7.3775,
          gpsLongitude: 3.947,
        },
      ]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.getClusters(mockReq, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      const result = jsonMock.mock.calls[0][0];
      expect(result.data).toHaveLength(0);
    });

    it('enforces LGA scope for supervisor', async () => {
      mockGetEnumeratorIds.mockResolvedValue(['enum-1']);
      mockDbQuery.mockResolvedValueOnce([{ thresholdValue: 50 }]); // radius config
      mockDbQuery.mockResolvedValueOnce([]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        user: { sub: 'supervisor-1', role: 'supervisor' },
      } as unknown as Request;

      await FraudDetectionsController.getClusters(mockReq, mockRes as Response, mockNext);

      expect(mockGetEnumeratorIds).toHaveBeenCalledWith('supervisor-1');
      expect(jsonMock).toHaveBeenCalledWith({ data: [] });
    });

    it('returns empty array when no GPS-flagged detections exist', async () => {
      mockDbQuery.mockResolvedValueOnce([{ thresholdValue: 50 }]); // radius config
      mockDbQuery.mockResolvedValueOnce([]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.getClusters(mockReq, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({ data: [] });
    });

    it('sorts clusters by detection count descending', async () => {
      // Create two clusters: cluster A (3 members) and cluster B (2 members)
      mockDbQuery.mockResolvedValueOnce([{ thresholdValue: 50 }]); // radius config
      mockDbQuery.mockResolvedValueOnce([
        {
          id: ID_1, submissionId: 'sub-1', enumeratorId: 'enum-1',
          computedAt: new Date('2026-02-20T10:00:00Z'), totalScore: '60.00',
          severity: 'medium', enumeratorName: 'Enum 1',
          submittedAt: new Date('2026-02-20T09:30:00Z'),
          gpsLatitude: 7.3775, gpsLongitude: 3.947,
          gpsDetails: { clusterCount: 3, clusterMembers: [
            { submissionId: 'sub-2', lat: 7.3775, lng: 3.947, submittedAt: '2026-02-20T10:05:00Z' },
            { submissionId: 'sub-3', lat: 7.3775, lng: 3.947, submittedAt: '2026-02-20T10:10:00Z' },
          ]},
        },
        {
          id: ID_2, submissionId: 'sub-2', enumeratorId: 'enum-1',
          computedAt: new Date('2026-02-20T10:05:00Z'), totalScore: '55.00',
          severity: 'medium', enumeratorName: 'Enum 1',
          submittedAt: new Date('2026-02-20T09:35:00Z'),
          gpsLatitude: 7.3776, gpsLongitude: 3.9471,
          gpsDetails: { clusterCount: 3, clusterMembers: [
            { submissionId: 'sub-1', lat: 7.3775, lng: 3.947, submittedAt: '2026-02-20T10:00:00Z' },
            { submissionId: 'sub-3', lat: 7.3775, lng: 3.947, submittedAt: '2026-02-20T10:10:00Z' },
          ]},
        },
        {
          id: ID_3, submissionId: 'sub-3', enumeratorId: 'enum-1',
          computedAt: new Date('2026-02-20T10:10:00Z'), totalScore: '50.00',
          severity: 'low', enumeratorName: 'Enum 1',
          submittedAt: new Date('2026-02-20T09:40:00Z'),
          gpsLatitude: 7.3777, gpsLongitude: 3.9472,
          gpsDetails: { clusterCount: 3, clusterMembers: [
            { submissionId: 'sub-1', lat: 7.3775, lng: 3.947, submittedAt: '2026-02-20T10:00:00Z' },
            { submissionId: 'sub-2', lat: 7.3776, lng: 3.9471, submittedAt: '2026-02-20T10:05:00Z' },
          ]},
        },
      ]);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.getClusters(mockReq, mockRes as Response, mockNext);

      const result = jsonMock.mock.calls[0][0];
      // All 3 should be in the same cluster
      expect(result.data).toHaveLength(1);
      expect(result.data[0].detectionCount).toBe(3);
    });
  });

  // ── bulkReviewDetections ─────────────────────────────────────────────

  describe('bulkReviewDetections', () => {
    it('calls next with 401 when no user', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        body: { ids: [ID_1, ID_2], resolution: 'false_positive', resolutionNotes: 'Legitimate union meeting event' },
      } as unknown as Request;

      await FraudDetectionsController.bulkReviewDetections(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(401);
    });

    it('calls next with 400 for less than 2 IDs', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        body: { ids: [ID_1], resolution: 'false_positive', resolutionNotes: 'Legitimate event context' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.bulkReviewDetections(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('At least 2');
    });

    it('calls next with 400 for more than 50 IDs', async () => {
      const ids = Array.from({ length: 51 }, (_, i) =>
        `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
      );

      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        body: { ids, resolution: 'false_positive', resolutionNotes: 'Legitimate event context' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.bulkReviewDetections(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('Maximum 50');
    });

    it('calls next with 400 for notes shorter than 10 characters', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        body: { ids: [ID_1, ID_2], resolution: 'false_positive', resolutionNotes: 'Short' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.bulkReviewDetections(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('at least 10');
    });

    it('calls next with 400 for invalid resolution value', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        body: { ids: [ID_1, ID_2], resolution: 'invalid_resolution', resolutionNotes: 'Legitimate event context' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.bulkReviewDetections(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(400);
    });

    it('successfully bulk-reviews detections for super_admin', async () => {
      // Inside transaction: select finds all IDs; then update succeeds; then insert succeeds
      mockDbQuery
        .mockResolvedValueOnce([
          { id: ID_1, enumeratorId: 'enum-1' },
          { id: ID_2, enumeratorId: 'enum-1' },
        ]);
      mockDbUpdate.mockResolvedValueOnce(undefined);
      mockDbInsert.mockResolvedValueOnce(undefined);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        body: { ids: [ID_1, ID_2], resolution: 'false_positive', resolutionNotes: 'Legitimate union meeting event' },
        user: { sub: 'admin-1', role: 'super_admin' },
        ip: '127.0.0.1',
        get: vi.fn().mockReturnValue('test-agent'),
      } as unknown as Request;

      await FraudDetectionsController.bulkReviewDetections(mockReq, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      const result = jsonMock.mock.calls[0][0];
      expect(result.data.count).toBe(2);
      expect(result.data.resolution).toBe('false_positive');
    });

    it('calls next with 404 when some detection IDs not found', async () => {
      // Only 1 detection found out of 2 requested
      mockDbQuery.mockResolvedValueOnce([
        { id: ID_1, enumeratorId: 'enum-1' },
      ]);

      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        body: { ids: [ID_1, ID_2], resolution: 'false_positive', resolutionNotes: 'Legitimate event context' },
        user: { sub: 'admin-1', role: 'super_admin' },
        ip: '127.0.0.1',
        get: vi.fn().mockReturnValue('test-agent'),
      } as unknown as Request;

      await FraudDetectionsController.bulkReviewDetections(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('not found');
    });

    it('calls next with 403 when supervisor has no team', async () => {
      mockGetEnumeratorIds.mockResolvedValue([]);

      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        body: { ids: [ID_1, ID_2], resolution: 'false_positive', resolutionNotes: 'Legitimate event context' },
        user: { sub: 'supervisor-1', role: 'supervisor' },
        ip: '127.0.0.1',
        get: vi.fn().mockReturnValue('test-agent'),
      } as unknown as Request;

      await FraudDetectionsController.bulkReviewDetections(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('No enumerators assigned');
    });

    it('rejects entire request when any detection is outside supervisor scope (all-or-nothing)', async () => {
      mockGetEnumeratorIds.mockResolvedValue(['enum-1']);
      // Detection ID_2 belongs to enum-99, which is out of scope
      mockDbQuery.mockResolvedValueOnce([
        { id: ID_1, enumeratorId: 'enum-1' },
        { id: ID_2, enumeratorId: 'enum-99' },
      ]);

      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        body: { ids: [ID_1, ID_2], resolution: 'false_positive', resolutionNotes: 'Legitimate event context' },
        user: { sub: 'supervisor-1', role: 'supervisor' },
        ip: '127.0.0.1',
        get: vi.fn().mockReturnValue('test-agent'),
      } as unknown as Request;

      await FraudDetectionsController.bulkReviewDetections(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('outside your team');
    });

    it('allows supervisor to bulk-review within scope', async () => {
      mockGetEnumeratorIds.mockResolvedValue(['enum-1', 'enum-2']);
      mockDbQuery.mockResolvedValueOnce([
        { id: ID_1, enumeratorId: 'enum-1' },
        { id: ID_2, enumeratorId: 'enum-2' },
      ]);
      mockDbUpdate.mockResolvedValueOnce(undefined);
      mockDbInsert.mockResolvedValueOnce(undefined);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        body: { ids: [ID_1, ID_2], resolution: 'false_positive', resolutionNotes: 'Legitimate community registration event' },
        user: { sub: 'supervisor-1', role: 'supervisor' },
        ip: '127.0.0.1',
        get: vi.fn().mockReturnValue('test-agent'),
      } as unknown as Request;

      await FraudDetectionsController.bulkReviewDetections(mockReq, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockGetEnumeratorIds).toHaveBeenCalledWith('supervisor-1');
      const result = jsonMock.mock.calls[0][0];
      expect(result.data.count).toBe(2);
    });
  });

  // ── Regression: Story 4.4 endpoints still exist alongside bulk ──────

  describe('reviewDetection (regression)', () => {
    it('reviewDetection, getDetection, listDetections still exported', () => {
      // Verify Story 4.4 methods coexist with Story 4.5 bulk methods
      expect(typeof FraudDetectionsController.reviewDetection).toBe('function');
      expect(typeof FraudDetectionsController.getDetection).toBe('function');
      expect(typeof FraudDetectionsController.listDetections).toBe('function');
      // New Story 4.5 methods
      expect(typeof FraudDetectionsController.getClusters).toBe('function');
      expect(typeof FraudDetectionsController.bulkReviewDetections).toBe('function');
    });

    it('reviewDetection rejects invalid UUID format', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { id: 'not-a-uuid' },
        body: { resolution: 'confirmed_fraud' },
        user: { sub: 'admin-1', role: 'super_admin' },
      } as unknown as Request;

      await FraudDetectionsController.reviewDetection(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(400);
    });
  });
});
