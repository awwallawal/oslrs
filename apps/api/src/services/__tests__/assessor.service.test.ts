import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────
const {
  mockSelect,
  mockFrom,
  mockInnerJoin,
  mockLeftJoin,
  mockWhere,
  mockOrderBy,
  mockLimit,
  mockOffset,
  mockGroupBy,
  mockUpdate,
  mockSet,
  mockReturning,
  mockInsertValues,
  mockTransaction,
  mockInfo,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockInnerJoin: vi.fn(),
  mockLeftJoin: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
  mockLimit: vi.fn(),
  mockOffset: vi.fn(),
  mockGroupBy: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockReturning: vi.fn(),
  mockInsertValues: vi.fn(),
  mockTransaction: vi.fn(),
  mockInfo: vi.fn(),
}));

// Chain builder that resolves to a configurable result
let queryResult: any[] = [];

function createChain() {
  const chain: any = {
    from: (...args: any[]) => { mockFrom(...args); return chain; },
    innerJoin: (...args: any[]) => { mockInnerJoin(...args); return chain; },
    leftJoin: (...args: any[]) => { mockLeftJoin(...args); return chain; },
    where: (...args: any[]) => { mockWhere(...args); return chain; },
    orderBy: (...args: any[]) => { mockOrderBy(...args); return chain; },
    limit: (...args: any[]) => { mockLimit(...args); return chain; },
    offset: (...args: any[]) => { mockOffset(...args); return chain; },
    groupBy: (...args: any[]) => { mockGroupBy(...args); return chain; },
    then: (resolve: any) => resolve(queryResult),
    [Symbol.asyncIterator]: undefined,
  };
  // Make chain thenable (awaitable)
  chain[Symbol.toStringTag] = 'Promise';
  return chain;
}

vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: any[]) => {
      mockSelect(...args);
      return createChain();
    },
    update: (...args: any[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: any[]) => {
          mockSet(...sArgs);
          return {
            where: (...wArgs: any[]) => {
              mockWhere(...wArgs);
              return {
                returning: () => {
                  mockReturning();
                  return Promise.resolve(queryResult);
                },
              };
            },
          };
        },
      };
    },
    insert: () => ({
      values: (vals: any) => {
        mockInsertValues(vals);
        return Promise.resolve();
      },
    }),
    transaction: (fn: any) => {
      mockTransaction();
      const tx = {
        update: (...args: any[]) => {
          mockUpdate(...args);
          return {
            set: (...sArgs: any[]) => {
              mockSet(...sArgs);
              return {
                where: (...wArgs: any[]) => {
                  mockWhere(...wArgs);
                  return {
                    returning: () => {
                      mockReturning();
                      return Promise.resolve(queryResult);
                    },
                  };
                },
              };
            },
          };
        },
        insert: () => ({
          values: (vals: any) => {
            mockInsertValues(vals);
            return Promise.resolve();
          },
        }),
      };
      return fn(tx);
    },
  },
}));

vi.mock('../../db/schema/index.js', () => ({
  fraudDetections: {
    id: 'fd.id',
    submissionId: 'fd.submissionId',
    enumeratorId: 'fd.enumeratorId',
    computedAt: 'fd.computedAt',
    totalScore: 'fd.totalScore',
    severity: { enumValues: ['clean', 'low', 'medium', 'high', 'critical'] },
    resolution: { enumValues: ['confirmed_fraud', 'false_positive', 'needs_investigation', 'dismissed', 'enumerator_warned', 'enumerator_suspended'] },
    resolutionNotes: 'fd.resolutionNotes',
    reviewedAt: 'fd.reviewedAt',
    assessorResolution: { enumValues: ['final_approved', 'final_rejected'] },
    assessorNotes: 'fd.assessorNotes',
    assessorReviewedAt: 'fd.assessorReviewedAt',
    assessorReviewedBy: 'fd.assessorReviewedBy',
  },
  submissions: { id: 's.id', submittedAt: 's.submittedAt', respondentId: 's.respondentId', questionnaireFormId: 's.questionnaireFormId' },
  users: { id: 'u.id', fullName: 'u.fullName' },
  respondents: { id: 'r.id', lgaId: 'r.lgaId' },
  auditLogs: { id: 'al.id', action: 'al.action', targetId: 'al.targetId', details: 'al.details', createdAt: 'al.createdAt' },
}));

vi.mock('pino', () => ({
  default: () => ({
    info: mockInfo,
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('uuidv7', () => ({
  uuidv7: () => 'mock-uuid-v7',
}));

// ── Import SUT ────────────────────────────────────────────────────────
import { AssessorService } from '../assessor.service.js';

// ── Tests ─────────────────────────────────────────────────────────────
describe('AssessorService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    queryResult = [];
  });

  describe('getAuditQueue', () => {
    it('should return paginated queue with default pagination', async () => {
      queryResult = [{ count: 5 }]; // first call: count
      const result = await AssessorService.getAuditQueue({});
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(mockSelect).toHaveBeenCalled();
    });

    it('should apply pagination parameters', async () => {
      queryResult = [{ count: 0 }];
      const result = await AssessorService.getAuditQueue({ page: 3, pageSize: 10 });
      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(10);
    });

    it('should clamp pageSize to max 100', async () => {
      queryResult = [{ count: 0 }];
      const result = await AssessorService.getAuditQueue({ pageSize: 200 });
      expect(result.pageSize).toBe(100);
    });

    it('should apply enumerator name filter', async () => {
      queryResult = [{ count: 0 }];
      await AssessorService.getAuditQueue({ enumeratorName: 'John' });
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe('getCompletedReviews', () => {
    it('should return completed reviews with default pagination', async () => {
      queryResult = [{ count: 2 }];
      const result = await AssessorService.getCompletedReviews({});
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('should filter by assessor decision', async () => {
      queryResult = [{ count: 0 }];
      await AssessorService.getCompletedReviews({ assessorDecision: 'final_approved' });
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      // Mock: count query returns 10 pending, severity breakdown, today's reviews
      queryResult = [{ count: 10 }];
      const result = await AssessorService.getQueueStats();
      expect(result).toHaveProperty('totalPending');
      expect(result).toHaveProperty('severityBreakdown');
      expect(result).toHaveProperty('reviewedToday');
    });
  });

  describe('getRecentActivity', () => {
    it('should return recent activity with default limit of 5', async () => {
      queryResult = [];
      const result = await AssessorService.getRecentActivity();
      expect(result).toEqual([]);
      expect(mockLimit).toHaveBeenCalledWith(5);
    });

    it('should respect custom limit', async () => {
      queryResult = [];
      await AssessorService.getRecentActivity(10);
      expect(mockLimit).toHaveBeenCalledWith(10);
    });
  });

  describe('reviewDetection', () => {
    it('should throw NOT_FOUND when detection does not exist', async () => {
      queryResult = [];
      await expect(AssessorService.reviewDetection({
        detectionId: 'nonexistent-id',
        assessorResolution: 'final_approved',
        actorId: 'assessor-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      })).rejects.toThrow('Fraud detection not found');
    });

    it('should throw ALREADY_REVIEWED when already assessed', async () => {
      queryResult = [{
        id: 'det-1',
        resolution: 'confirmed_fraud',
        severity: 'high',
        assessorResolution: 'final_approved',
      }];
      await expect(AssessorService.reviewDetection({
        detectionId: 'det-1',
        assessorResolution: 'final_rejected',
        actorId: 'assessor-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      })).rejects.toThrow('This detection has already been reviewed by an assessor');
    });

    it('should throw NOT_ELIGIBLE when detection does not qualify', async () => {
      queryResult = [{
        id: 'det-1',
        resolution: null,
        severity: 'low',
        assessorResolution: null,
      }];
      await expect(AssessorService.reviewDetection({
        detectionId: 'det-1',
        assessorResolution: 'final_approved',
        actorId: 'assessor-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      })).rejects.toThrow('This detection is not eligible for assessor review');
    });

    it('should perform transactional review and write audit log for final_approved', async () => {
      // First call: existence check
      queryResult = [{
        id: 'det-1',
        resolution: 'confirmed_fraud',
        severity: 'high',
        assessorResolution: null,
      }];

      const result = await AssessorService.reviewDetection({
        detectionId: 'det-1',
        assessorResolution: 'final_approved',
        actorId: 'assessor-1',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      // Transaction should have been called
      expect(mockTransaction).toHaveBeenCalled();
      // Audit log should have been inserted
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'assessor.final_review',
          targetResource: 'fraud_detection',
          targetId: 'det-1',
          details: expect.objectContaining({
            assessorResolution: 'final_approved',
            previousSupervisorResolution: 'confirmed_fraud',
          }),
        }),
      );
      // Logger called
      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'assessor.final_review',
          detectionId: 'det-1',
        }),
      );
    });

    it('should include assessor notes in rejection audit log', async () => {
      queryResult = [{
        id: 'det-2',
        resolution: 'false_positive',
        severity: 'medium',
        assessorResolution: null,
      }];

      await AssessorService.reviewDetection({
        detectionId: 'det-2',
        assessorResolution: 'final_rejected',
        assessorNotes: 'Data quality issues found during review',
        actorId: 'assessor-1',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            assessorResolution: 'final_rejected',
            assessorNotes: 'Data quality issues found during review',
          }),
        }),
      );
    });
  });
});
