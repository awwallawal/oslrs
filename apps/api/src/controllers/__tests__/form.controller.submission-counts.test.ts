/**
 * Form Controller — Submission Counts Tests
 * Story prep-2: Tests for getMySubmissionCounts endpoint
 *
 * Mock drizzle-orm with static factory (no importOriginal) to avoid
 * cross-platform ESM thread-isolation issues in CI (Linux).
 * Schema files import from 'drizzle-orm/pg-core' (unaffected by this mock).
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

// Mock drizzle-orm operators to verify WHERE clause arguments
const mockEq = vi.fn((...args: unknown[]) => ({ _type: 'eq', args }));
const mockAnd = vi.fn((...args: unknown[]) => ({ _type: 'and', args }));
const mockCountFn = vi.fn(() => 'count_agg');

vi.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => mockEq(...args),
  and: (...args: unknown[]) => mockAnd(...args),
  count: (...args: unknown[]) => mockCountFn(...args),
  inArray: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: (s: string) => s }),
  gte: vi.fn(),
  relations: (...args: unknown[]) => args,
}));

describe('FormController.getMySubmissionCounts', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    jsonMock = vi.fn();
    mockRes = { json: jsonMock, status: vi.fn().mockReturnThis() };
    mockNext = vi.fn();
    mockReq = { user: { sub: 'user-123', role: 'enumerator' }, query: {} };

    // Re-establish full chain (mockReset:true in config clears implementations)
    mockSelect.mockReturnValue({ from: mockFrom });
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

  it('does NOT include other users\' submissions (security)', async () => {
    mockGroupBy.mockResolvedValue([
      { formId: 'form-aaa', count: 3 },
    ]);

    await FormController.getMySubmissionCounts(
      mockReq as Request,
      mockRes as Response,
      mockNext,
    );

    // Verify WHERE clause filters by the authenticated user's ID
    expect(mockEq).toHaveBeenCalledWith(expect.anything(), 'user-123');
    expect(jsonMock).toHaveBeenCalledWith({ data: { 'form-aaa': 3 } });
  });

  it('counts all submissions regardless of processed flag', async () => {
    // processed flag tracks respondent-extraction pipeline status,
    // not submission validity — all submissions should be counted
    mockGroupBy.mockResolvedValue([
      { formId: 'form-aaa', count: 7 },
    ]);

    await FormController.getMySubmissionCounts(
      mockReq as Request,
      mockRes as Response,
      mockNext,
    );

    // Should NOT filter by processed = true
    const processedCall = mockEq.mock.calls.find(
      (call) => call[1] === true,
    );
    expect(processedCall).toBeUndefined();
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
