import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ── Hoisted mocks ────────────────────────────────────────────────────

const mockGetAuditQueue = vi.fn();
const mockGetCompletedReviews = vi.fn();
const mockGetQueueStats = vi.fn();
const mockGetRecentActivity = vi.fn();
const mockReviewDetection = vi.fn();

vi.mock('../../services/assessor.service.js', () => ({
  AssessorService: {
    getAuditQueue: (...args: unknown[]) => mockGetAuditQueue(...args),
    getCompletedReviews: (...args: unknown[]) => mockGetCompletedReviews(...args),
    getQueueStats: (...args: unknown[]) => mockGetQueueStats(...args),
    getRecentActivity: (...args: unknown[]) => mockGetRecentActivity(...args),
    reviewDetection: (...args: unknown[]) => mockReviewDetection(...args),
  },
}));

vi.mock('pino', () => ({ default: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

// Import after mocks
const { AssessorController } = await import('../assessor.controller.js');

// ── Test Helpers ─────────────────────────────────────────────────────

const TEST_DET_ID = '00000000-0000-4000-8000-000000000001';

function makeMocks() {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnThis();
  const mockRes: Partial<Response> = { json: jsonMock, status: statusMock };
  const mockNext: NextFunction = vi.fn();
  return { jsonMock, statusMock, mockRes, mockNext };
}

function makeReq(overrides: Partial<Request> & Record<string, unknown> = {}): Request {
  return {
    query: {},
    params: {},
    body: {},
    headers: { 'user-agent': 'test-agent' },
    ip: '127.0.0.1',
    user: { sub: 'assessor-uuid-001', role: 'verification_assessor' },
    get: (h: string) => h === 'user-agent' ? 'test-agent' : undefined,
    ...overrides,
  } as unknown as Request;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('AssessorController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getAuditQueue', () => {
    it('should return paginated queue data', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      const queueData = { data: [], page: 1, pageSize: 20, totalPages: 0, totalItems: 0 };
      mockGetAuditQueue.mockResolvedValue(queueData);

      await AssessorController.getAuditQueue(makeReq(), mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith(queueData);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should pass filter parameters to service', async () => {
      const { mockRes, mockNext } = makeMocks();
      mockGetAuditQueue.mockResolvedValue({ data: [], page: 1, pageSize: 20, totalPages: 0, totalItems: 0 });

      await AssessorController.getAuditQueue(
        makeReq({ query: { lgaId: 'ibadan_north', severity: 'high,critical', page: '2', pageSize: '10' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockGetAuditQueue).toHaveBeenCalledWith(expect.objectContaining({
        lgaId: 'ibadan_north',
        severity: ['high', 'critical'],
        page: 2,
        pageSize: 10,
      }));
    });

    it('should reject invalid severity value', async () => {
      const { mockRes, mockNext } = makeMocks();

      await AssessorController.getAuditQueue(
        makeReq({ query: { severity: 'invalid_severity' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 }),
      );
    });
  });

  describe('getCompletedReviews', () => {
    it('should return completed reviews', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      const completedData = { data: [], page: 1, pageSize: 20, totalPages: 0, totalItems: 0 };
      mockGetCompletedReviews.mockResolvedValue(completedData);

      await AssessorController.getCompletedReviews(makeReq(), mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith(completedData);
    });
  });

  describe('getQueueStats', () => {
    it('should return queue stats', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      const stats = { totalPending: 15, severityBreakdown: { high: 10, critical: 5 }, reviewedToday: 3 };
      mockGetQueueStats.mockResolvedValue(stats);

      await AssessorController.getQueueStats(makeReq(), mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({ data: stats });
    });
  });

  describe('getRecentActivity', () => {
    it('should return last 5 activity entries', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      const activity = [{ id: '1', action: 'assessor.final_review' }];
      mockGetRecentActivity.mockResolvedValue(activity);

      await AssessorController.getRecentActivity(makeReq(), mockRes as Response, mockNext);

      expect(mockGetRecentActivity).toHaveBeenCalledWith(5);
      expect(jsonMock).toHaveBeenCalledWith({ data: activity });
    });
  });

  describe('reviewDetection', () => {
    it('should approve a detection successfully', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      const updated = { data: { id: TEST_DET_ID, assessorResolution: 'final_approved' } };
      mockReviewDetection.mockResolvedValue(updated);

      await AssessorController.reviewDetection(
        makeReq({
          params: { detectionId: TEST_DET_ID },
          body: { assessorResolution: 'final_approved' },
        }),
        mockRes as Response,
        mockNext,
      );

      expect(mockReviewDetection).toHaveBeenCalledWith(expect.objectContaining({
        detectionId: TEST_DET_ID,
        assessorResolution: 'final_approved',
        actorId: 'assessor-uuid-001',
      }));
      expect(jsonMock).toHaveBeenCalledWith(updated);
    });

    it('should reject with notes successfully', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      mockReviewDetection.mockResolvedValue({ data: { id: TEST_DET_ID, assessorResolution: 'final_rejected' } });

      await AssessorController.reviewDetection(
        makeReq({
          params: { detectionId: TEST_DET_ID },
          body: { assessorResolution: 'final_rejected', assessorNotes: 'Data quality issues found' },
        }),
        mockRes as Response,
        mockNext,
      );

      expect(mockReviewDetection).toHaveBeenCalledWith(expect.objectContaining({
        assessorResolution: 'final_rejected',
        assessorNotes: 'Data quality issues found',
      }));
    });

    it('should fail validation when rejection has no notes', async () => {
      const { mockRes, mockNext } = makeMocks();

      await AssessorController.reviewDetection(
        makeReq({
          params: { detectionId: TEST_DET_ID },
          body: { assessorResolution: 'final_rejected' },
        }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 }),
      );
    });

    it('should fail validation when rejection notes are too short', async () => {
      const { mockRes, mockNext } = makeMocks();

      await AssessorController.reviewDetection(
        makeReq({
          params: { detectionId: TEST_DET_ID },
          body: { assessorResolution: 'final_rejected', assessorNotes: 'short' },
        }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 }),
      );
    });

    it('should reject invalid UUID format', async () => {
      const { mockRes, mockNext } = makeMocks();

      await AssessorController.reviewDetection(
        makeReq({
          params: { detectionId: 'not-a-uuid' },
          body: { assessorResolution: 'final_approved' },
        }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 }),
      );
    });

    it('should return 401 when not authenticated', async () => {
      const { mockRes, mockNext } = makeMocks();

      await AssessorController.reviewDetection(
        makeReq({
          user: undefined,
          params: { detectionId: TEST_DET_ID },
          body: { assessorResolution: 'final_approved' },
        }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 }),
      );
    });

    it('should pass NOT_FOUND error from service to next()', async () => {
      const { mockRes, mockNext } = makeMocks();
      const notFoundError = new Error('Fraud detection not found');
      (notFoundError as any).code = 'NOT_FOUND';
      (notFoundError as any).statusCode = 404;
      mockReviewDetection.mockRejectedValue(notFoundError);

      await AssessorController.reviewDetection(
        makeReq({
          params: { detectionId: TEST_DET_ID },
          body: { assessorResolution: 'final_approved' },
        }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 }),
      );
    });

    it('should pass ALREADY_REVIEWED error from service to next()', async () => {
      const { mockRes, mockNext } = makeMocks();
      const alreadyReviewedError = new Error('Already reviewed');
      (alreadyReviewedError as any).code = 'ALREADY_REVIEWED';
      (alreadyReviewedError as any).statusCode = 409;
      mockReviewDetection.mockRejectedValue(alreadyReviewedError);

      await AssessorController.reviewDetection(
        makeReq({
          params: { detectionId: TEST_DET_ID },
          body: { assessorResolution: 'final_approved' },
        }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 409 }),
      );
    });
  });
});
