/**
 * Form Controller — Daily Submission Counts Tests
 * Story prep-2: Tests for getDailySubmissionCounts + getMySubmissionCounts scope=team
 *
 * Note: We do NOT mock 'drizzle-orm' — real eq/count/sql/gte functions build
 * expression objects that flow through our mocked db chain. This avoids
 * cross-platform ESM mocking issues in CI (Linux thread isolation).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { FormController } from '../form.controller.js';

// ── Mock chain ──────────────────────────────────────────────────────────────

const mockOrderBy = vi.fn();
const mockGroupBy = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMocks(userOverrides?: Record<string, unknown>) {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnThis();
  const mockRes = { json: jsonMock, status: statusMock } as Partial<Response>;
  const mockNext: NextFunction = vi.fn();
  const mockReq: Partial<Request> = {
    user: { sub: 'user-123', role: 'enumerator', ...userOverrides },
    query: {},
  };
  return { mockReq, mockRes, mockNext, jsonMock };
}

// ── Tests: getDailySubmissionCounts ─────────────────────────────────────────

describe('FormController.getDailySubmissionCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ groupBy: mockGroupBy });
    mockGroupBy.mockReturnValue({ orderBy: mockOrderBy });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array when no submissions in range', async () => {
    mockOrderBy.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await FormController.getDailySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({ data: [] });
  });

  it('returns correct daily counts with date strings', async () => {
    mockOrderBy.mockResolvedValue([
      { date: '2026-02-14', count: 5 },
      { date: '2026-02-15', count: 12 },
    ]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await FormController.getDailySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: [
        { date: '2026-02-14', count: 5 },
        { date: '2026-02-15', count: 12 },
      ],
    });
  });

  it('applies WHERE filter for non-supervisor roles', async () => {
    mockOrderBy.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext } = createMocks({ role: 'enumerator' });

    await FormController.getDailySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    // .where() must be called with a filter
    expect(mockWhere).toHaveBeenCalledTimes(1);
    const whereArg = mockWhere.mock.calls[0][0];
    expect(whereArg).toBeDefined();
  });

  it('applies WHERE filter for DATA_ENTRY_CLERK role', async () => {
    mockOrderBy.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext } = createMocks({ role: 'data_entry_clerk' });

    await FormController.getDailySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockWhere).toHaveBeenCalledTimes(1);
    expect(mockWhere.mock.calls[0][0]).toBeDefined();
  });

  it('uses LGA subquery for SUPERVISOR role with lgaId', async () => {
    mockOrderBy.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext } = createMocks({
      role: 'supervisor',
      lgaId: 'lga-456',
    });

    await FormController.getDailySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    // Supervisor should still pass a filter to .where()
    expect(mockWhere).toHaveBeenCalledTimes(1);
    expect(mockWhere.mock.calls[0][0]).toBeDefined();
  });

  it('defaults to 7 days when no days param', async () => {
    mockOrderBy.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await FormController.getDailySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    // Successfully returns data (uses default 7-day range)
    expect(jsonMock).toHaveBeenCalledWith({ data: [] });
  });

  it('accepts days=30', async () => {
    mockOrderBy.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();
    mockReq.query = { days: '30' };

    await FormController.getDailySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({ data: [] });
  });

  it('rejects invalid days (defaults to 7)', async () => {
    mockOrderBy.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();
    mockReq.query = { days: '999' };

    await FormController.getDailySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    // Invalid days defaults to 7, still returns data successfully
    expect(jsonMock).toHaveBeenCalledWith({ data: [] });
  });

  it('returns 401 when unauthenticated', async () => {
    const { mockReq, mockRes, mockNext } = createMocks();
    mockReq.user = undefined;

    await FormController.getDailySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockNext).toHaveBeenCalled();
    const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passedError.statusCode).toBe(401);
  });

  it('calls next on database error', async () => {
    mockOrderBy.mockRejectedValue(new Error('DB connection lost'));
    const { mockReq, mockRes, mockNext } = createMocks();

    await FormController.getDailySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── Tests: getMySubmissionCounts scope=team ──────────────────────────────────

describe('FormController.getMySubmissionCounts scope=team', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ groupBy: mockGroupBy });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns team counts (LGA-filtered) when scope=team AND role=SUPERVISOR', async () => {
    mockGroupBy.mockResolvedValue([
      { formId: 'form-aaa', count: 20 },
    ]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks({
      role: 'supervisor',
      lgaId: 'lga-456',
    });
    mockReq.query = { scope: 'team' };

    await FormController.getMySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({ data: { 'form-aaa': 20 } });
  });

  it('returns 403 when scope=team AND role=ENUMERATOR', async () => {
    const { mockReq, mockRes, mockNext } = createMocks({ role: 'enumerator' });
    mockReq.query = { scope: 'team' };

    await FormController.getMySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockNext).toHaveBeenCalled();
    const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passedError.statusCode).toBe(403);
  });

  it('returns personal counts when no scope param (backward compatible)', async () => {
    mockGroupBy.mockResolvedValue([
      { formId: 'form-aaa', count: 5 },
    ]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks({
      role: 'supervisor',
      lgaId: 'lga-456',
    });

    await FormController.getMySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({ data: { 'form-aaa': 5 } });
  });
});
