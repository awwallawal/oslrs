/**
 * Form Controller — Daily Submission Counts Tests
 * Story prep-2: Tests for getDailySubmissionCounts + getMySubmissionCounts scope=team
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

// Mock drizzle-orm operators
const mockEq = vi.fn((...args: unknown[]) => ({ _type: 'eq', args }));
const mockAnd = vi.fn((...args: unknown[]) => ({ _type: 'and', args }));
const mockCountFn = vi.fn(() => 'count_agg');
const mockSql = vi.fn((...args: unknown[]) => ({ _type: 'sql', args, as: vi.fn() }));
const mockGte = vi.fn((...args: unknown[]) => ({ _type: 'gte', args }));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: (...args: unknown[]) => mockEq(...args),
    and: (...args: unknown[]) => mockAnd(...args),
    count: (...args: unknown[]) => mockCountFn(...args),
    sql: Object.assign(
      (...args: unknown[]) => mockSql(...args),
      { raw: (s: string) => s },
    ),
    gte: (...args: unknown[]) => mockGte(...args),
  };
});

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

  it('filters by submitterId for ENUMERATOR role', async () => {
    mockOrderBy.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext } = createMocks({ role: 'enumerator' });

    await FormController.getDailySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    // eq is called with submitterId = user.sub (not SQL subquery)
    expect(mockEq).toHaveBeenCalledWith(expect.anything(), 'user-123');
  });

  it('filters by submitterId for DATA_ENTRY_CLERK role', async () => {
    mockOrderBy.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext } = createMocks({ role: 'data_entry_clerk' });

    await FormController.getDailySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockEq).toHaveBeenCalledWith(expect.anything(), 'user-123');
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

    // Supervisor should use sql template (not eq with user.sub)
    const eqCalls = mockEq.mock.calls;
    const submitterEqCall = eqCalls.find(
      (call) => call[1] === 'user-123',
    );
    expect(submitterEqCall).toBeUndefined();

    // Should NOT filter by processed — counts all submissions
    const processedCall = eqCalls.find(
      (call) => call[1] === true,
    );
    expect(processedCall).toBeUndefined();

    // gte date filter must still be applied for supervisors
    expect(mockGte).toHaveBeenCalled();
    const gteDate = mockGte.mock.calls[0][1] as Date;
    expect(gteDate).toBeInstanceOf(Date);

    // and() combines submitter + gte filters
    expect(mockAnd).toHaveBeenCalled();
  });

  it('defaults to 7 days when no days param', async () => {
    mockOrderBy.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext } = createMocks();

    await FormController.getDailySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    // gte should be called with a date ~7 days ago (allow ±1 for midnight boundary)
    expect(mockGte).toHaveBeenCalled();
    const gteDate = mockGte.mock.calls[0][1] as Date;
    const daysDiff = (Date.now() - gteDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThanOrEqual(6.9);
    expect(daysDiff).toBeLessThanOrEqual(8);
  });

  it('accepts days=30', async () => {
    mockOrderBy.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext } = createMocks();
    mockReq.query = { days: '30' };

    await FormController.getDailySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockGte).toHaveBeenCalled();
    const gteDate = mockGte.mock.calls[0][1] as Date;
    const daysDiff = (Date.now() - gteDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThanOrEqual(29.9);
    expect(daysDiff).toBeLessThanOrEqual(31);
  });

  it('rejects invalid days (defaults to 7)', async () => {
    mockOrderBy.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext } = createMocks();
    mockReq.query = { days: '999' };

    await FormController.getDailySubmissionCounts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockGte).toHaveBeenCalled();
    const gteDate = mockGte.mock.calls[0][1] as Date;
    const daysDiff = (Date.now() - gteDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThanOrEqual(6.9);
    expect(daysDiff).toBeLessThanOrEqual(8);
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
    // Supervisor with scope=team should NOT use eq with user.sub
    const eqCalls = mockEq.mock.calls;
    const submitterEqCall = eqCalls.find(
      (call) => call[1] === 'user-123',
    );
    expect(submitterEqCall).toBeUndefined();
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
    // Without scope=team, even supervisor gets personal eq filter
    expect(mockEq).toHaveBeenCalledWith(expect.anything(), 'user-123');
  });
});
