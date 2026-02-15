/**
 * Supervisor Controller Tests
 * Story prep-2: Tests for getTeamOverview + getPendingAlerts
 *
 * Note: We do NOT mock 'drizzle-orm' — real eq/and/count/sql functions build
 * expression objects that flow through our mocked db chain. This avoids
 * cross-platform ESM mocking issues in CI (Linux thread isolation).
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

  it('applies WHERE filter with roleId and lgaId', async () => {
    mockGroupBy.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext } = createMocks();

    await SupervisorController.getTeamOverview(
      mockReq as Request, mockRes as Response, mockNext,
    );

    // .where() must be called with a filter
    expect(mockWhere).toHaveBeenCalledTimes(1);
    const whereArg = mockWhere.mock.calls[0][0];
    expect(whereArg).toBeDefined();
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

  it('applies WHERE filter with lgaId', async () => {
    mockWhere.mockResolvedValue([{ unprocessedCount: 0, failedCount: 0 }]);
    const { mockReq, mockRes, mockNext } = createMocks();

    await SupervisorController.getPendingAlerts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    // .where() must be called with an LGA filter
    expect(mockWhere).toHaveBeenCalledTimes(1);
    const whereArg = mockWhere.mock.calls[0][0];
    expect(whereArg).toBeDefined();
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
