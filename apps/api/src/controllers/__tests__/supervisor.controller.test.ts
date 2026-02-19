/**
 * Supervisor Controller Tests
 * All 4 endpoints use TeamAssignmentService for assignment boundary enforcement.
 * Story prep-2 (original), Story 4.1 (team-metrics, team-gps, migration of overview/alerts).
 *
 * Mock drizzle-orm with static factory (no importOriginal) to avoid
 * cross-platform ESM thread-isolation issues in CI (Linux).
 * Schema files import from 'drizzle-orm/pg-core' (unaffected by this mock).
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
const mockFindMany = vi.fn();
const mockExecute = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    query: {
      roles: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
      users: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    },
  },
}));
vi.mock('../../services/native-form.service.js');
vi.mock('../../queues/webhook-ingestion.queue.js');

// Mock TeamAssignmentService
const mockGetEnumeratorIds = vi.fn();
vi.mock('../../services/team-assignment.service.js', () => ({
  TeamAssignmentService: {
    getEnumeratorIdsForSupervisor: (...args: unknown[]) => mockGetEnumeratorIds(...args),
  },
}));

// Mock drizzle-orm operators
const mockEq = vi.fn((...args: unknown[]) => ({ _type: 'eq', args }));
const mockAnd = vi.fn((...args: unknown[]) => ({ _type: 'and', args }));
const mockCountFn = vi.fn(() => 'count_agg');
const mockSql = vi.fn((...args: unknown[]) => ({ _type: 'sql', args }));
const mockInArray = vi.fn((...args: unknown[]) => ({ _type: 'inArray', args }));

vi.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => mockEq(...args),
  and: (...args: unknown[]) => mockAnd(...args),
  count: (...args: unknown[]) => mockCountFn(...args),
  sql: Object.assign(
    (...args: unknown[]) => mockSql(...args),
    { raw: (s: string) => s, join: vi.fn((...a: unknown[]) => a) },
  ),
  gte: vi.fn(),
  inArray: (...args: unknown[]) => mockInArray(...args),
  relations: (...args: unknown[]) => args,
}));

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

// ── Tests: getTeamOverview (migrated to TeamAssignmentService) ──────────────

describe('SupervisorController.getTeamOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns correct counts from assigned enumerators', async () => {
    mockGetEnumeratorIds.mockResolvedValue(['enum-1', 'enum-2', 'enum-3']);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await SupervisorController.getTeamOverview(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: { total: 3, active: 3, inactive: 0 },
    });
  });

  it('uses TeamAssignmentService for assignment boundary', async () => {
    mockGetEnumeratorIds.mockResolvedValue(['enum-1']);
    const { mockReq, mockRes, mockNext } = createMocks();

    await SupervisorController.getTeamOverview(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockGetEnumeratorIds).toHaveBeenCalledWith('sup-123');
  });

  it('returns zeros when no assignments', async () => {
    mockGetEnumeratorIds.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await SupervisorController.getTeamOverview(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: { total: 0, active: 0, inactive: 0 },
    });
  });

  it('works without lgaId — assignment service handles fallback', async () => {
    mockGetEnumeratorIds.mockResolvedValue(['enum-1']);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks({ lgaId: undefined });

    await SupervisorController.getTeamOverview(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: { total: 1, active: 1, inactive: 0 },
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

  it('calls next on database error', async () => {
    mockGetEnumeratorIds.mockRejectedValue(new Error('DB error'));
    const { mockReq, mockRes, mockNext } = createMocks();

    await SupervisorController.getTeamOverview(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── Tests: getPendingAlerts (migrated to TeamAssignmentService) ─────────────

describe('SupervisorController.getPendingAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns correct unprocessed and failed counts', async () => {
    mockGetEnumeratorIds.mockResolvedValue(['enum-1', 'enum-2']);
    mockWhere.mockResolvedValue([{ unprocessedCount: 5, failedCount: 3 }]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await SupervisorController.getPendingAlerts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: { unprocessedCount: 5, failedCount: 3, totalAlerts: 8 },
    });
  });

  it('uses TeamAssignmentService for assignment boundary', async () => {
    mockGetEnumeratorIds.mockResolvedValue(['enum-1']);
    mockWhere.mockResolvedValue([{ unprocessedCount: 0, failedCount: 0 }]);
    const { mockReq, mockRes, mockNext } = createMocks();

    await SupervisorController.getPendingAlerts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockGetEnumeratorIds).toHaveBeenCalledWith('sup-123');
  });

  it('uses inArray filter on submitterId (not LGA subquery)', async () => {
    mockGetEnumeratorIds.mockResolvedValue(['enum-1', 'enum-2']);
    mockWhere.mockResolvedValue([{ unprocessedCount: 0, failedCount: 0 }]);
    const { mockReq, mockRes, mockNext } = createMocks();

    await SupervisorController.getPendingAlerts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockInArray).toHaveBeenCalled();
  });

  it('returns zeros when no assignments', async () => {
    mockGetEnumeratorIds.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await SupervisorController.getPendingAlerts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: { unprocessedCount: 0, failedCount: 0, totalAlerts: 0 },
    });
  });

  it('works without lgaId — assignment service handles fallback', async () => {
    mockGetEnumeratorIds.mockResolvedValue(['enum-1']);
    mockWhere.mockResolvedValue([{ unprocessedCount: 2, failedCount: 1 }]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks({ lgaId: undefined });

    await SupervisorController.getPendingAlerts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: { unprocessedCount: 2, failedCount: 1, totalAlerts: 3 },
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

  it('calls next on database error', async () => {
    mockGetEnumeratorIds.mockRejectedValue(new Error('DB error'));
    const { mockReq, mockRes, mockNext } = createMocks();

    await SupervisorController.getPendingAlerts(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── Tests: getTeamMetrics (Story 4.1) ────────────────────────────────────────

describe('SupervisorController.getTeamMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ groupBy: mockGroupBy });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty enumerators array when no assignments', async () => {
    mockGetEnumeratorIds.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await SupervisorController.getTeamMetrics(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockGetEnumeratorIds).toHaveBeenCalledWith('sup-123');
    expect(jsonMock).toHaveBeenCalledWith({
      data: { enumerators: [] },
    });
  });

  it('returns enumerator roster with counts', async () => {
    mockGetEnumeratorIds.mockResolvedValue(['enum-1', 'enum-2']);
    mockFindMany.mockResolvedValue([
      { id: 'enum-1', fullName: 'Alice Enum', status: 'active', lastLoginAt: null },
      { id: 'enum-2', fullName: 'Bob Enum', status: 'verified', lastLoginAt: '2026-02-18T10:00:00Z' },
    ]);
    mockGroupBy.mockResolvedValue([
      { submitterId: 'enum-1', dailyCount: 5, weeklyCount: 20, lastSubmittedAt: '2026-02-18T09:00:00Z' },
      { submitterId: 'enum-2', dailyCount: 3, weeklyCount: 15, lastSubmittedAt: '2026-02-18T08:00:00Z' },
    ]);

    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await SupervisorController.getTeamMetrics(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: {
        enumerators: [
          {
            id: 'enum-1', fullName: 'Alice Enum', status: 'active', lastLoginAt: null,
            dailyCount: 5, weeklyCount: 20, lastSubmittedAt: '2026-02-18T09:00:00Z',
          },
          {
            id: 'enum-2', fullName: 'Bob Enum', status: 'verified', lastLoginAt: '2026-02-18T10:00:00Z',
            dailyCount: 3, weeklyCount: 15, lastSubmittedAt: '2026-02-18T08:00:00Z',
          },
        ],
      },
    });
  });

  it('returns zero counts for enumerators with no submissions', async () => {
    mockGetEnumeratorIds.mockResolvedValue(['enum-1']);
    mockFindMany.mockResolvedValue([
      { id: 'enum-1', fullName: 'Alice Enum', status: 'active', lastLoginAt: null },
    ]);
    // No submission rows for this enumerator
    mockGroupBy.mockResolvedValue([]);

    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await SupervisorController.getTeamMetrics(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: {
        enumerators: [
          {
            id: 'enum-1', fullName: 'Alice Enum', status: 'active', lastLoginAt: null,
            dailyCount: 0, weeklyCount: 0, lastSubmittedAt: null,
          },
        ],
      },
    });
  });

  it('uses TeamAssignmentService for assignment boundary', async () => {
    mockGetEnumeratorIds.mockResolvedValue(['enum-1']);
    mockFindMany.mockResolvedValue([{ id: 'enum-1', fullName: 'A', status: 'active', lastLoginAt: null }]);
    mockGroupBy.mockResolvedValue([]);

    const { mockReq, mockRes, mockNext } = createMocks();

    await SupervisorController.getTeamMetrics(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockGetEnumeratorIds).toHaveBeenCalledWith('sup-123');
  });

  it('returns 401 when unauthenticated', async () => {
    const { mockReq, mockRes, mockNext } = createMocks();
    mockReq.user = undefined;

    await SupervisorController.getTeamMetrics(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockNext).toHaveBeenCalled();
    const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passedError.statusCode).toBe(401);
  });

  it('calls next on database error', async () => {
    mockGetEnumeratorIds.mockRejectedValue(new Error('DB error'));
    const { mockReq, mockRes, mockNext } = createMocks();

    await SupervisorController.getTeamMetrics(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── Tests: getTeamGps (Story 4.1) ───────────────────────────────────────────

describe('SupervisorController.getTeamGps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty points when no assignments', async () => {
    mockGetEnumeratorIds.mockResolvedValue([]);
    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await SupervisorController.getTeamGps(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: { points: [] },
    });
  });

  it('returns GPS points for assigned enumerators', async () => {
    const gpsRows = [
      { enumeratorId: 'enum-1', enumeratorName: 'Alice', latitude: 7.3775, longitude: 3.947, submittedAt: '2026-02-18T09:00:00Z' },
    ];
    mockGetEnumeratorIds.mockResolvedValue(['enum-1']);
    mockExecute.mockResolvedValue({ rows: gpsRows });

    const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

    await SupervisorController.getTeamGps(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith({
      data: { points: gpsRows },
    });
  });

  it('uses TeamAssignmentService for assignment boundary', async () => {
    mockGetEnumeratorIds.mockResolvedValue(['enum-1']);
    mockExecute.mockResolvedValue({ rows: [] });

    const { mockReq, mockRes, mockNext } = createMocks();

    await SupervisorController.getTeamGps(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockGetEnumeratorIds).toHaveBeenCalledWith('sup-123');
  });

  it('returns 401 when unauthenticated', async () => {
    const { mockReq, mockRes, mockNext } = createMocks();
    mockReq.user = undefined;

    await SupervisorController.getTeamGps(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockNext).toHaveBeenCalled();
    const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passedError.statusCode).toBe(401);
  });

  it('calls next on database error', async () => {
    mockGetEnumeratorIds.mockRejectedValue(new Error('DB error'));
    const { mockReq, mockRes, mockNext } = createMocks();

    await SupervisorController.getTeamGps(
      mockReq as Request, mockRes as Response, mockNext,
    );

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});
