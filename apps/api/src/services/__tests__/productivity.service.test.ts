/**
 * Productivity Service Tests
 *
 * Story 5.6a: Unit tests for computeStatus, computeTrend, and
 * ProductivityService.getTeamProductivity.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const {
  mockFindMany,
  mockSelect,
  mockFrom,
  mockWhere,
  mockGroupBy,
  mockInnerJoin,
  mockGetEnumeratorIds,
  mockGetActiveTargets,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockGroupBy: vi.fn(),
  mockInnerJoin: vi.fn(),
  mockGetEnumeratorIds: vi.fn(),
  mockGetActiveTargets: vi.fn(),
}));

// Track which select call we're on to return different results
let selectCallCount = 0;
let selectResults: unknown[][] = [];

function createChain() {
  const chain: Record<string, unknown> = {};
  chain.from = (...args: unknown[]) => { mockFrom(...args); return chain; };
  chain.where = (...args: unknown[]) => { mockWhere(...args); return chain; };
  chain.groupBy = (...args: unknown[]) => { mockGroupBy(...args); return chain; };
  chain.innerJoin = (...args: unknown[]) => { mockInnerJoin(...args); return chain; };
  chain.then = (resolve: (v: unknown) => void) => resolve(selectResults[selectCallCount++] ?? []);
  chain[Symbol.toStringTag] = 'Promise';
  (chain as Record<string | symbol, unknown>)[Symbol.asyncIterator] = undefined;
  return chain;
}

vi.mock('../../db/index.js', () => ({
  db: {
    query: {
      users: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return createChain();
    },
  },
}));

vi.mock('../team-assignment.service.js', () => ({
  TeamAssignmentService: {
    getEnumeratorIdsForSupervisor: (...args: unknown[]) => mockGetEnumeratorIds(...args),
  },
}));

vi.mock('../productivity-target.service.js', () => ({
  ProductivityTargetService: {
    getActiveTargets: (...args: unknown[]) => mockGetActiveTargets(...args),
  },
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { computeStatus, computeTrend, ProductivityService } from '../productivity.service.js';

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  selectCallCount = 0;
  selectResults = [];
});

describe('computeStatus', () => {
  it('returns "complete" when todayCount >= target', () => {
    expect(computeStatus(25, 25, null)).toBe('complete');
    expect(computeStatus(30, 25, null)).toBe('complete');
  });

  it('returns "inactive" when todayCount is 0 and no lastActiveAt', () => {
    expect(computeStatus(0, 25, null)).toBe('inactive');
  });

  it('returns "inactive" when todayCount is 0 and last active > 24h ago', () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    expect(computeStatus(0, 25, twoDaysAgo)).toBe('inactive');
  });

  it('returns non-inactive when todayCount is 0 but last active < 24h ago', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const result = computeStatus(0, 25, oneHourAgo);
    expect(result).not.toBe('inactive');
  });

  it('returns "on_track" at start of work day (8am WAT) with some progress', () => {
    // 8am WAT = 7am UTC
    const ref = new Date('2026-02-23T07:00:00Z');
    expect(computeStatus(5, 25, new Date().toISOString(), ref)).toBe('on_track');
  });

  it('returns "behind" outside work hours with partial progress', () => {
    // 6pm WAT = 5pm UTC (watHour = 18, >= 17)
    const ref = new Date('2026-02-23T17:00:00Z');
    expect(computeStatus(10, 25, new Date().toISOString(), ref)).toBe('behind');
  });

  it('returns "behind" when pace projection is insufficient', () => {
    // 4pm WAT = 3pm UTC (watHour = 16, hoursElapsed = 8, hoursRemaining = 1)
    // 3 done in 8 hours, projected additional = (3/8)*1 = 0.375, total = 3.375 < 25
    const ref = new Date('2026-02-23T15:00:00Z');
    expect(computeStatus(3, 25, new Date().toISOString(), ref)).toBe('behind');
  });

  it('returns "on_track" when pace projection meets target', () => {
    // 12pm WAT = 11am UTC (watHour = 12, hoursElapsed = 4, hoursRemaining = 5)
    // 15 done in 4 hours, projected additional = (15/4)*5 = 18.75, total = 33.75 >= 25
    const ref = new Date('2026-02-23T11:00:00Z');
    expect(computeStatus(15, 25, new Date().toISOString(), ref)).toBe('on_track');
  });
});

describe('computeTrend', () => {
  it('returns "up" when current > previous by more than 5%', () => {
    expect(computeTrend(20, 10)).toBe('up');
  });

  it('returns "down" when current < previous by more than 5%', () => {
    expect(computeTrend(10, 20)).toBe('down');
  });

  it('returns "flat" when within 5% threshold', () => {
    expect(computeTrend(10, 10)).toBe('flat');
    expect(computeTrend(10.4, 10)).toBe('flat');
  });

  it('returns "up" when previousAvg is 0 and current > 0', () => {
    expect(computeTrend(5, 0)).toBe('up');
  });

  it('returns "flat" when both are 0', () => {
    expect(computeTrend(0, 0)).toBe('flat');
  });
});

describe('ProductivityService.getTeamProductivity', () => {
  it('returns empty result when supervisor has no enumerators', async () => {
    mockGetEnumeratorIds.mockResolvedValue([]);

    const result = await ProductivityService.getTeamProductivity('sup-1', {
      period: 'today',
      page: 1,
      pageSize: 20,
    });

    expect(result.rows).toEqual([]);
    expect(result.totalItems).toBe(0);
    expect(result.summary.totalSubmissions).toBe(0);
  });

  it('fetches enumerator IDs for supervisor via TeamAssignmentService', async () => {
    mockGetEnumeratorIds.mockResolvedValue(['enum-1']);
    mockFindMany.mockResolvedValue([{
      id: 'enum-1',
      fullName: 'Test User',
      status: 'active',
      lastLoginAt: null,
      lgaId: 'lga-1',
    }]);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    // 4 DB queries: liveCounts, snapshotAggs, todayFraudCounts, prevSnapshotAggs
    selectResults = [[], [], [], []];

    const result = await ProductivityService.getTeamProductivity('sup-1', {
      period: 'today',
      page: 1,
      pageSize: 20,
    });

    expect(mockGetEnumeratorIds).toHaveBeenCalledWith('sup-1');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].fullName).toBe('Test User');
  });

  it('fetches all staff for super_admin (supervisorId = null)', async () => {
    mockFindMany
      .mockResolvedValueOnce([
        { id: 'enum-1', role: { name: 'enumerator' } },
        { id: 'admin-1', role: { name: 'super_admin' } },
      ])
      .mockResolvedValueOnce([{
        id: 'enum-1',
        fullName: 'Enum One',
        status: 'active',
        lastLoginAt: null,
        lgaId: null,
      }]);

    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });
    selectResults = [[], [], [], []];

    const result = await ProductivityService.getTeamProductivity(null, {
      period: 'today',
      page: 1,
      pageSize: 20,
    });

    expect(mockGetEnumeratorIds).not.toHaveBeenCalled();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe('enum-1');
  });

  it('filters rows by status when filter is set', async () => {
    mockGetEnumeratorIds.mockResolvedValue(['enum-1', 'enum-2']);
    mockFindMany.mockResolvedValue([
      { id: 'enum-1', fullName: 'User A', status: 'active', lastLoginAt: null, lgaId: null },
      { id: 'enum-2', fullName: 'User B', status: 'active', lastLoginAt: null, lgaId: null },
    ]);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    // User A: 0 submissions (inactive), User B: 30 submissions (complete)
    selectResults = [
      [{ submitterId: 'enum-2', todayCount: '30', lastSubmittedAt: new Date().toISOString() }],
      [], [], [],
    ];

    const result = await ProductivityService.getTeamProductivity('sup-1', {
      period: 'today',
      status: 'complete',
      page: 1,
      pageSize: 20,
    });

    expect(result.rows.every((r) => r.status === 'complete')).toBe(true);
  });

  it('filters rows by search (case-insensitive name match)', async () => {
    mockGetEnumeratorIds.mockResolvedValue(['enum-1', 'enum-2']);
    mockFindMany.mockResolvedValue([
      { id: 'enum-1', fullName: 'Alice Johnson', status: 'active', lastLoginAt: null, lgaId: null },
      { id: 'enum-2', fullName: 'Bob Smith', status: 'active', lastLoginAt: null, lgaId: null },
    ]);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });
    selectResults = [[], [], [], []];

    const result = await ProductivityService.getTeamProductivity('sup-1', {
      period: 'today',
      search: 'alice',
      page: 1,
      pageSize: 20,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].fullName).toBe('Alice Johnson');
  });

  it('paginates results correctly', async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `enum-${i}`);
    mockGetEnumeratorIds.mockResolvedValue(ids);
    mockFindMany.mockResolvedValue(
      ids.map((id, i) => ({
        id,
        fullName: `User ${i}`,
        status: 'active',
        lastLoginAt: null,
        lgaId: null,
      })),
    );
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });
    selectResults = [[], [], [], []];

    const result = await ProductivityService.getTeamProductivity('sup-1', {
      period: 'today',
      page: 2,
      pageSize: 2,
    });

    expect(result.rows).toHaveLength(2);
    expect(result.totalItems).toBe(5);
  });

  it('computes summary across all rows before pagination', async () => {
    mockGetEnumeratorIds.mockResolvedValue(['enum-1', 'enum-2']);
    mockFindMany.mockResolvedValue([
      { id: 'enum-1', fullName: 'User A', status: 'active', lastLoginAt: null, lgaId: null },
      { id: 'enum-2', fullName: 'User B', status: 'active', lastLoginAt: null, lgaId: null },
    ]);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 10, lgaOverrides: [] });

    selectResults = [
      [
        { submitterId: 'enum-1', todayCount: '10', lastSubmittedAt: new Date().toISOString() },
        { submitterId: 'enum-2', todayCount: '5', lastSubmittedAt: new Date().toISOString() },
      ],
      [], [], [],
    ];

    const result = await ProductivityService.getTeamProductivity('sup-1', {
      period: 'today',
      page: 1,
      pageSize: 1, // Only 1 per page, but summary should cover all
    });

    expect(result.summary.totalSubmissions).toBe(15);
    expect(result.summary.totalTarget).toBe(20); // 2 × 10
    expect(result.totalItems).toBe(2);
  });
});
