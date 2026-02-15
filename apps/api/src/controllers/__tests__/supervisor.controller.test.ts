/**
 * Supervisor Controller Tests
 * Story prep-2: Tests for getTeamOverview + getPendingAlerts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { SupervisorController } from '../supervisor.controller.js';

// ── Mock chain ──────────────────────────────────────────────────────────────

const mockGroupBy = vi.fn();
const mockWhere = vi.fn().mockReturnValue({ groupBy: mockGroupBy });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
const mockFindFirst = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    query: {
      roles: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
    },
  },
}));
vi.mock('../../services/native-form.service.js');
vi.mock('../../queues/webhook-ingestion.queue.js');

// Mock drizzle-orm operators
const mockEq = vi.fn((...args: unknown[]) => ({ _type: 'eq', args }));
const mockAnd = vi.fn((...args: unknown[]) => ({ _type: 'and', args }));
const mockCountFn = vi.fn(() => 'count_agg');
const mockSql = vi.fn((...args: unknown[]) => ({ _type: 'sql', args }));

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
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMocks(userOverrides?: Record<string, unknown>) {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnThis();
  const mockRes = { json: jsonMock, status: statusMock } as Partial<Response>;
  const mockNext: NextFunction = vi.fn();
  const mockReq: Partial<Request> = {
    user: { sub: 'sup-123', role: 'supervisor', lgaId: 'lga-456', ...userOverrides },
  };
  return { mockReq, mockRes, mockNext, jsonMock };
}

// ── Tests: getTeamOverview ──────────────────────────────────────────────────

describe('SupervisorController.getTeamOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ groupBy: mockGroupBy });
    mockFindFirst.mockResolvedValue({ id: 'role-enum-id' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns correct active/inactive split', async () => {
    mockGroupBy.mockResolvedValue([
      { status: 'active', count: 5 },
      { status: 'verified', count: 3 },
      { status: 'suspended', count: 2 },
    ]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await SupervisorController.getTeamOverview(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: { total: 10, active: 8, inactive: 2 },
    });
  });

  it('filters by enumerator roleId and supervisor lgaId in WHERE clause', async () => {
    mockGroupBy.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext } = createMocks();

    await SupervisorController.getTeamOverview(
      mockReq as Request, mockRes as Response, mockNext,
    );

    // eq should be called with roleId = 'role-enum-id' (from findFirst mock)
    const roleIdCall = mockEq.mock.calls.find(
      (call) => call[1] === 'role-enum-id',
    );
    expect(roleIdCall).toBeDefined();

    // eq should be called with lgaId = 'lga-456' (from req.user)
    const lgaIdCall = mockEq.mock.calls.find(
      (call) => call[1] === 'lga-456',
    );
    expect(lgaIdCall).toBeDefined();

    // and() combines both filters
    expect(mockAnd).toHaveBeenCalled();
  });

  it('returns zeros when no enumerators in LGA', async () => {
    mockGroupBy.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await SupervisorController.getTeamOverview(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: { total: 0, active: 0, inactive: 0 },
    });
  });

  it('returns zeros when enumerator role not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await SupervisorController.getTeamOverview(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: { total: 0, active: 0, inactive: 0 },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const { mockReq, mockRes, mockNext } = createMocks();
    mockReq.user = undefined;

    await SupervisorController.getTeamOverview(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockNext).toHaveBeenCalled();
    const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passedError.statusCode).toBe(401);
  });

  it('returns 403 when supervisor has no lgaId', async () => {
    const { mockReq, mockRes, mockNext } = createMocks({ lgaId: undefined });

    await SupervisorController.getTeamOverview(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockNext).toHaveBeenCalled();
    const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passedError.statusCode).toBe(403);
  });

  it('calls next on database error', async () => {
    mockGroupBy.mockRejectedValue(new Error('DB error'));
    const { mockReq, mockRes, mockNext } = createMocks();

    await SupervisorController.getTeamOverview(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── Tests: getPendingAlerts ─────────────────────────────────────────────────

describe('SupervisorController.getPendingAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ where: mockWhere });
    // getPendingAlerts doesn't use groupBy — the where resolves directly
    mockWhere.mockResolvedValue([{ unprocessedCount: 0, failedCount: 0 }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns correct unprocessed and failed counts', async () => {
    mockWhere.mockResolvedValue([{ unprocessedCount: 5, failedCount: 3 }]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await SupervisorController.getPendingAlerts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: { unprocessedCount: 5, failedCount: 3, totalAlerts: 8 },
    });
  });

  it('filters by supervisor lgaId in WHERE clause via sql template', async () => {
    mockWhere.mockResolvedValue([{ unprocessedCount: 0, failedCount: 0 }]);
    const { mockReq, mockRes, mockNext } = createMocks();

    await SupervisorController.getPendingAlerts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    // sql tagged template should receive lgaId='lga-456' as an interpolated value
    expect(mockSql).toHaveBeenCalled();
    const sqlCall = mockSql.mock.calls.find(
      (call) => Array.isArray(call[0]) && call.includes('lga-456'),
    );
    expect(sqlCall).toBeDefined();
  });

  it('returns zeros when no issues', async () => {
    mockWhere.mockResolvedValue([{ unprocessedCount: 0, failedCount: 0 }]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await SupervisorController.getPendingAlerts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: { unprocessedCount: 0, failedCount: 0, totalAlerts: 0 },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const { mockReq, mockRes, mockNext } = createMocks();
    mockReq.user = undefined;

    await SupervisorController.getPendingAlerts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockNext).toHaveBeenCalled();
    const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passedError.statusCode).toBe(401);
  });

  it('returns 403 when supervisor has no lgaId', async () => {
    const { mockReq, mockRes, mockNext } = createMocks({ lgaId: undefined });

    await SupervisorController.getPendingAlerts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockNext).toHaveBeenCalled();
    const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passedError.statusCode).toBe(403);
  });

  it('calls next on database error', async () => {
    mockWhere.mockRejectedValue(new Error('DB error'));
    const { mockReq, mockRes, mockNext } = createMocks();

    await SupervisorController.getPendingAlerts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});
