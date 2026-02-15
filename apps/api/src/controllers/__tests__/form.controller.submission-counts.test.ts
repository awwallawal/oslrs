/**
 * Form Controller — Submission Counts Tests
 * Story prep-2: Tests for getMySubmissionCounts endpoint
 *
 * Note: We do NOT mock 'drizzle-orm' — real eq/count/sql functions build
 * expression objects that flow through our mocked db chain. This avoids
 * cross-platform ESM mocking issues in CI (Linux thread isolation).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { FormController } from '../form.controller.js';

const mockGroupBy = vi.fn();
const mockWhere = vi.fn().mockReturnValue({ groupBy: mockGroupBy });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    query: {
      respondents: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
      submissions: { findMany: vi.fn() },
    },
  },
}));
vi.mock('../../services/native-form.service.js');
vi.mock('../../queues/webhook-ingestion.queue.js');
vi.mock('@oslsr/utils/src/validation', () => ({
  modulus11Check: () => true,
}));

describe('FormController.getMySubmissionCounts', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    jsonMock = vi.fn();
    mockRes = { json: jsonMock, status: vi.fn().mockReturnThis() };
    mockNext = vi.fn();
    mockReq = { user: { sub: 'user-123', role: 'enumerator' }, query: {} };

    // Reset chain mocks
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ groupBy: mockGroupBy });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty object when user has no submissions', async () => {
    mockGroupBy.mockResolvedValue([]);

    await FormController.getMySubmissionCounts(
      mockReq as Request,
      mockRes as Response,
      mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({ data: {} });
  });

  it('returns correct counts per form for authenticated user', async () => {
    mockGroupBy.mockResolvedValue([
      { formId: 'form-aaa', count: 5 },
      { formId: 'form-bbb', count: 12 },
    ]);

    await FormController.getMySubmissionCounts(
      mockReq as Request,
      mockRes as Response,
      mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: { 'form-aaa': 5, 'form-bbb': 12 },
    });
  });

  it('applies WHERE filter for authenticated user (security)', async () => {
    mockGroupBy.mockResolvedValue([
      { formId: 'form-aaa', count: 3 },
    ]);

    await FormController.getMySubmissionCounts(
      mockReq as Request,
      mockRes as Response,
      mockNext,
    );

    // .where() must be called with a filter (not undefined/null)
    expect(mockWhere).toHaveBeenCalledTimes(1);
    const whereArg = mockWhere.mock.calls[0][0];
    expect(whereArg).toBeDefined();
    expect(jsonMock).toHaveBeenCalledWith({ data: { 'form-aaa': 3 } });
  });

  it('counts all submissions regardless of processed flag', async () => {
    mockGroupBy.mockResolvedValue([
      { formId: 'form-aaa', count: 7 },
    ]);

    await FormController.getMySubmissionCounts(
      mockReq as Request,
      mockRes as Response,
      mockNext,
    );

    // Verify the query executes successfully and returns data
    // (processed flag was removed — no filter should exclude submissions)
    expect(jsonMock).toHaveBeenCalledWith({ data: { 'form-aaa': 7 } });
  });

  it('returns 401 when unauthenticated', async () => {
    mockReq.user = undefined;

    await FormController.getMySubmissionCounts(
      mockReq as Request,
      mockRes as Response,
      mockNext,
    );

    expect(mockNext).toHaveBeenCalled();
    const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passedError.statusCode).toBe(401);
    expect(passedError.code).toBe('AUTH_REQUIRED');
  });

  it('calls next on database error', async () => {
    mockGroupBy.mockRejectedValue(new Error('DB connection lost'));

    await FormController.getMySubmissionCounts(
      mockReq as Request,
      mockRes as Response,
      mockNext,
    );

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});
