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

// ── Story 5.6b Tests ───────────────────────────────────────────────────────

// Helper: mock data for three staff members (enumerator, clerk, supervisor)
const threeStaffUsers = [
  { id: 'user-1', fullName: 'Enumerator One', status: 'active', lastLoginAt: null, lgaId: 'lga-1', roleId: 'role-1', role: { name: 'enumerator' }, lga: { id: 'lga-1', name: 'Ibadan North' } },
  { id: 'user-2', fullName: 'Clerk One', status: 'active', lastLoginAt: null, lgaId: 'lga-1', roleId: 'role-2', role: { name: 'data_entry_clerk' }, lga: { id: 'lga-1', name: 'Ibadan North' } },
  { id: 'user-3', fullName: 'Supervisor One', status: 'active', lastLoginAt: null, lgaId: 'lga-1', roleId: 'role-3', role: { name: 'supervisor' }, lga: { id: 'lga-1', name: 'Ibadan North' } },
];

describe('ProductivityService.getAllStaffProductivity', () => {
  const baseFilters = { period: 'today' as const, page: 1, pageSize: 50 };

  it('returns all field staff (enumerators, clerks, supervisors)', async () => {
    mockFindMany.mockResolvedValue(threeStaffUsers);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });
    mockGetEnumeratorIds.mockResolvedValue(['user-1', 'user-2']);

    // db.select() calls in order for getAllStaffProductivity:
    // 1: liveCounts, 2: snapshotAggs, 3: todayFraudCounts,
    // 4: reviewCounts (supervisors), 5: prevSnapshotAggs,
    // 6: activeAssignments, 7: supNames, 8: lgaRecords
    selectResults = [
      [], // liveCounts
      [], // snapshotAggs
      [], // todayFraudCounts
      [], // reviewCounts
      [], // prevSnapshotAggs
      [{ enumeratorId: 'user-1', supervisorId: 'user-3' }, { enumeratorId: 'user-2', supervisorId: 'user-3' }], // activeAssignments
      [{ id: 'user-3', fullName: 'Supervisor One' }], // supNames
      [{ id: 'lga-1', name: 'Ibadan North' }], // lgaRecords
    ];

    const result = await ProductivityService.getAllStaffProductivity(baseFilters);

    expect(result.rows).toHaveLength(3);
    const roles = result.rows.map((r) => r.role);
    expect(roles).toContain('enumerator');
    expect(roles).toContain('data_entry_clerk');
    expect(roles).toContain('supervisor');
    expect(result.totalItems).toBe(3);
    expect(result.summary).toBeDefined();
  });

  it('applies LGA filter to restrict staff', async () => {
    const staffAcrossLgas = [
      ...threeStaffUsers,
      { id: 'user-4', fullName: 'Enumerator Two', status: 'active', lastLoginAt: null, lgaId: 'lga-2', roleId: 'role-1', role: { name: 'enumerator' }, lga: { id: 'lga-2', name: 'Ibadan South' } },
    ];
    mockFindMany.mockResolvedValue(staffAcrossLgas);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });
    mockGetEnumeratorIds.mockResolvedValue(['user-1', 'user-2']);

    // Only LGA-1 staff should pass the filter; supervisor has 2 team members only from LGA-1
    selectResults = [
      [], // liveCounts
      [], // snapshotAggs
      [], // todayFraudCounts
      [], // reviewCounts
      [], // prevSnapshotAggs
      [], // activeAssignments (no supervisor assignments found)
      // supNames not called because supIds is empty
      [{ id: 'lga-1', name: 'Ibadan North' }], // lgaRecords
    ];

    const result = await ProductivityService.getAllStaffProductivity({
      ...baseFilters,
      lgaIds: ['lga-1'],
    });

    // user-4 (lga-2) should be excluded
    expect(result.rows.every((r) => r.lgaId === 'lga-1')).toBe(true);
    expect(result.rows).toHaveLength(3);
  });

  it('applies role filter to restrict by role', async () => {
    mockFindMany.mockResolvedValue(threeStaffUsers);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    // When roleId is 'enumerator', only enumerator rows should remain
    // No supervisors in filtered list, so reviewCounts query is skipped
    selectResults = [
      [], // liveCounts
      [], // snapshotAggs
      [], // todayFraudCounts
      // reviewCounts skipped (no supervisors after role filter)
      [], // prevSnapshotAggs
      [], // activeAssignments
      // supNames skipped (no supIds)
      [{ id: 'lga-1', name: 'Ibadan North' }], // lgaRecords
    ];

    const result = await ProductivityService.getAllStaffProductivity({
      ...baseFilters,
      roleId: 'enumerator',
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].role).toBe('enumerator');
    expect(result.rows[0].fullName).toBe('Enumerator One');
  });

  it('uses review throughput for supervisors instead of submissions', async () => {
    mockFindMany.mockResolvedValue(threeStaffUsers);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });
    mockGetEnumeratorIds.mockResolvedValue(['user-1', 'user-2']);

    selectResults = [
      [], // liveCounts (enumerators/clerks)
      [], // snapshotAggs
      [], // todayFraudCounts
      // reviewCounts: supervisor reviewed 10 today
      [{ reviewedBy: 'user-3', todayReviews: '10', weekReviews: '40', monthReviews: '100', approved: '90', rejected: '10' }],
      [], // prevSnapshotAggs
      [], // activeAssignments
      // supNames skipped (no supIds from empty activeAssignments)
      [{ id: 'lga-1', name: 'Ibadan North' }], // lgaRecords
    ];

    const result = await ProductivityService.getAllStaffProductivity(baseFilters);

    const supRow = result.rows.find((r) => r.role === 'supervisor');
    expect(supRow).toBeDefined();
    expect(supRow!.todayCount).toBe(10);
    expect(supRow!.weekCount).toBe(40);
    expect(supRow!.monthCount).toBe(100);
    // Supervisor's target = teamSize * perPersonTarget = 2 * 25 = 50
    expect(supRow!.target).toBe(50);
  });

  it('returns empty result when no staff match filters', async () => {
    // Return users that have no field roles (e.g., only super_admin)
    mockFindMany.mockResolvedValue([
      { id: 'admin-1', fullName: 'Admin', status: 'active', lastLoginAt: null, lgaId: null, roleId: 'role-4', role: { name: 'super_admin' }, lga: null },
    ]);

    const result = await ProductivityService.getAllStaffProductivity(baseFilters);

    expect(result.rows).toEqual([]);
    expect(result.totalItems).toBe(0);
    expect(result.summary.totalSubmissions).toBe(0);
    expect(result.summary.supervisorlessLgaCount).toBe(0);
  });

  it('detects supervisorless LGAs in summary', async () => {
    // Two LGAs: lga-1 has a supervisor, lga-2 does not
    const mixedStaff = [
      { id: 'user-1', fullName: 'Enum A', status: 'active', lastLoginAt: null, lgaId: 'lga-1', roleId: 'role-1', role: { name: 'enumerator' }, lga: { id: 'lga-1', name: 'Ibadan North' } },
      { id: 'user-3', fullName: 'Sup A', status: 'active', lastLoginAt: null, lgaId: 'lga-1', roleId: 'role-3', role: { name: 'supervisor' }, lga: { id: 'lga-1', name: 'Ibadan North' } },
      { id: 'user-4', fullName: 'Enum B', status: 'active', lastLoginAt: null, lgaId: 'lga-2', roleId: 'role-1', role: { name: 'enumerator' }, lga: { id: 'lga-2', name: 'Ibadan South' } },
    ];
    mockFindMany.mockResolvedValue(mixedStaff);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });
    mockGetEnumeratorIds.mockResolvedValue(['user-1']);

    selectResults = [
      [], // liveCounts
      [], // snapshotAggs
      [], // todayFraudCounts
      [], // reviewCounts (for user-3 supervisor)
      [], // prevSnapshotAggs
      [], // activeAssignments
      // supNames skipped (empty supIds)
      [{ id: 'lga-1', name: 'Ibadan North' }, { id: 'lga-2', name: 'Ibadan South' }], // lgaRecords
    ];

    const result = await ProductivityService.getAllStaffProductivity(baseFilters);

    // lga-2 has no supervisor => supervisorlessLgaCount = 1
    expect(result.summary.supervisorlessLgaCount).toBe(1);
  });
});

describe('ProductivityService.getAllStaffProductivity — additional coverage', () => {
  const baseFilters = { period: 'today' as const, page: 1, pageSize: 50 };

  it('sorts rows by fullName ascending by default', async () => {
    const staffUsers = [
      { id: 'u-z', fullName: 'Zara Last', status: 'active', lastLoginAt: null, lgaId: 'lga-1', roleId: 'r1', role: { name: 'enumerator' }, lga: { id: 'lga-1', name: 'Ibadan North' } },
      { id: 'u-a', fullName: 'Adamu First', status: 'active', lastLoginAt: null, lgaId: 'lga-1', roleId: 'r1', role: { name: 'enumerator' }, lga: { id: 'lga-1', name: 'Ibadan North' } },
    ];
    mockFindMany.mockResolvedValue(staffUsers);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    selectResults = [[], [], [], [], [], [], [{ id: 'lga-1', name: 'Ibadan North' }]];

    const result = await ProductivityService.getAllStaffProductivity({
      ...baseFilters,
      sortBy: 'fullName',
      sortOrder: 'asc',
    });

    expect(result.rows[0].fullName).toBe('Adamu First');
    expect(result.rows[1].fullName).toBe('Zara Last');
  });

  it('sorts rows descending when sortOrder=desc', async () => {
    const staffUsers = [
      { id: 'u-a', fullName: 'Adamu First', status: 'active', lastLoginAt: null, lgaId: 'lga-1', roleId: 'r1', role: { name: 'enumerator' }, lga: { id: 'lga-1', name: 'Ibadan North' } },
      { id: 'u-z', fullName: 'Zara Last', status: 'active', lastLoginAt: null, lgaId: 'lga-1', roleId: 'r1', role: { name: 'enumerator' }, lga: { id: 'lga-1', name: 'Ibadan North' } },
    ];
    mockFindMany.mockResolvedValue(staffUsers);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    selectResults = [[], [], [], [], [], [], [{ id: 'lga-1', name: 'Ibadan North' }]];

    const result = await ProductivityService.getAllStaffProductivity({
      ...baseFilters,
      sortBy: 'fullName',
      sortOrder: 'desc',
    });

    expect(result.rows[0].fullName).toBe('Zara Last');
    expect(result.rows[1].fullName).toBe('Adamu First');
  });

  it('paginates correctly (page 2 with pageSize 1)', async () => {
    const staffUsers = [
      { id: 'u-1', fullName: 'First', status: 'active', lastLoginAt: null, lgaId: 'lga-1', roleId: 'r1', role: { name: 'enumerator' }, lga: { id: 'lga-1', name: 'LGA 1' } },
      { id: 'u-2', fullName: 'Second', status: 'active', lastLoginAt: null, lgaId: 'lga-1', roleId: 'r1', role: { name: 'enumerator' }, lga: { id: 'lga-1', name: 'LGA 1' } },
      { id: 'u-3', fullName: 'Third', status: 'active', lastLoginAt: null, lgaId: 'lga-1', roleId: 'r1', role: { name: 'enumerator' }, lga: { id: 'lga-1', name: 'LGA 1' } },
    ];
    mockFindMany.mockResolvedValue(staffUsers);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    selectResults = [[], [], [], [], [], [], [{ id: 'lga-1', name: 'LGA 1' }]];

    const result = await ProductivityService.getAllStaffProductivity({
      ...baseFilters,
      page: 2,
      pageSize: 1,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.totalItems).toBe(3);
  });

  it('applies supervisorId filter to restrict by supervisor', async () => {
    // Staff: two enumerators, one assigned to sup-1, one to sup-2
    const staffUsers = [
      { id: 'u-1', fullName: 'Enum A', status: 'active', lastLoginAt: null, lgaId: 'lga-1', roleId: 'r1', role: { name: 'enumerator' }, lga: { id: 'lga-1', name: 'LGA 1' } },
      { id: 'u-2', fullName: 'Enum B', status: 'active', lastLoginAt: null, lgaId: 'lga-1', roleId: 'r1', role: { name: 'enumerator' }, lga: { id: 'lga-1', name: 'LGA 1' } },
    ];
    mockFindMany.mockResolvedValue(staffUsers);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });
    // getEnumeratorIdsForSupervisor returns only u-1 for sup-1
    mockGetEnumeratorIds.mockResolvedValue(['u-1']);

    selectResults = [
      [], // liveCounts
      [], // snapshotAggs
      [], // todayFraudCounts
      [], // prevSnapshotAggs
      // activeAssignments
      [{ enumeratorId: 'u-1', supervisorId: 'sup-1' }],
      [{ id: 'sup-1', fullName: 'Supervisor One' }], // supNames
      [{ id: 'lga-1', name: 'LGA 1' }], // lgaRecords
    ];

    const result = await ProductivityService.getAllStaffProductivity({
      ...baseFilters,
      supervisorId: 'sup-1',
    });

    // Only u-1 should match (assigned to sup-1)
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].fullName).toBe('Enum A');
  });
});

describe('ProductivityService.getLgaComparison', () => {
  const baseFilters = { period: 'today' as const };

  it('returns all LGAs with their aggregated data', async () => {
    // findMany returns staff for grouping
    mockFindMany.mockResolvedValue([
      { id: 'user-1', fullName: 'Enum A', lgaId: 'lga-1', roleId: 'role-1', status: 'active', role: { name: 'enumerator' } },
      { id: 'user-2', fullName: 'Enum B', lgaId: 'lga-2', roleId: 'role-1', status: 'active', role: { name: 'enumerator' } },
      { id: 'user-3', fullName: 'Sup A', lgaId: 'lga-1', roleId: 'role-3', status: 'active', role: { name: 'supervisor' } },
    ]);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    selectResults = [
      // 1: allLgas
      [{ id: 'lga-1', name: 'Ibadan North' }, { id: 'lga-2', name: 'Ibadan South' }],
      // 2: liveCounts
      [{ submitterId: 'user-1', todayCount: '12' }, { submitterId: 'user-2', todayCount: '8' }],
      // 3: weekSnaps
      [],
      // 4: prevSnaps
      [],
      // 5: fraudCounts
      [],
    ];

    const result = await ProductivityService.getLgaComparison(baseFilters);

    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.lgaName).sort()).toEqual(['Ibadan North', 'Ibadan South']);
    expect(result.summary.totalLgas).toBe(2);

    const lga1 = result.rows.find((r) => r.lgaId === 'lga-1')!;
    expect(lga1.todayTotal).toBe(12);
    expect(lga1.enumeratorCount).toBe(1);
    expect(lga1.hasSupervisor).toBe(true);
    expect(lga1.supervisorName).toBe('Sup A');

    const lga2 = result.rows.find((r) => r.lgaId === 'lga-2')!;
    expect(lga2.todayTotal).toBe(8);
    expect(lga2.hasSupervisor).toBe(false);
  });

  it('filters by staffing model', async () => {
    // lga-1: supervisor + 3 enumerators = Full
    // lga-2: 1 enumerator, no supervisor = No Supervisor
    mockFindMany.mockResolvedValue([
      { id: 'u1', fullName: 'E1', lgaId: 'lga-1', roleId: 'r1', status: 'active', role: { name: 'enumerator' } },
      { id: 'u2', fullName: 'E2', lgaId: 'lga-1', roleId: 'r1', status: 'active', role: { name: 'enumerator' } },
      { id: 'u3', fullName: 'E3', lgaId: 'lga-1', roleId: 'r1', status: 'active', role: { name: 'enumerator' } },
      { id: 'u4', fullName: 'S1', lgaId: 'lga-1', roleId: 'r3', status: 'active', role: { name: 'supervisor' } },
      { id: 'u5', fullName: 'E4', lgaId: 'lga-2', roleId: 'r1', status: 'active', role: { name: 'enumerator' } },
    ]);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    selectResults = [
      [{ id: 'lga-1', name: 'Ibadan North' }, { id: 'lga-2', name: 'Ibadan South' }], // allLgas
      [], // liveCounts
      [], // weekSnaps
      [], // prevSnaps
      [], // fraudCounts
    ];

    const result = await ProductivityService.getLgaComparison({
      ...baseFilters,
      staffingModel: 'no_supervisor',
    });

    // Only lga-2 matches no_supervisor filter
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].lgaId).toBe('lga-2');
    expect(result.rows[0].hasSupervisor).toBe(false);
    expect(result.rows[0].staffingModel).toContain('No Supervisor');
  });

  it('detects supervisorless LGAs in summary', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'u1', fullName: 'E1', lgaId: 'lga-1', roleId: 'r1', status: 'active', role: { name: 'enumerator' } },
      { id: 'u2', fullName: 'S1', lgaId: 'lga-1', roleId: 'r3', status: 'active', role: { name: 'supervisor' } },
      { id: 'u3', fullName: 'E2', lgaId: 'lga-2', roleId: 'r1', status: 'active', role: { name: 'enumerator' } },
      { id: 'u4', fullName: 'E3', lgaId: 'lga-3', roleId: 'r1', status: 'active', role: { name: 'enumerator' } },
    ]);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    selectResults = [
      [{ id: 'lga-1', name: 'LGA 1' }, { id: 'lga-2', name: 'LGA 2' }, { id: 'lga-3', name: 'LGA 3' }], // allLgas
      [], // liveCounts
      [], // weekSnaps
      [], // prevSnaps
      [], // fraudCounts
    ];

    const result = await ProductivityService.getLgaComparison(baseFilters);

    // lga-2 and lga-3 have no supervisor
    expect(result.summary.supervisorlessCount).toBe(2);
    expect(result.rows).toHaveLength(3);
  });

  it('returns empty when no LGAs have staff', async () => {
    mockFindMany.mockResolvedValue([]); // No staff at all
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    selectResults = [
      [{ id: 'lga-1', name: 'Ibadan North' }], // allLgas (LGA exists but no staff)
      // No further select calls because enumeratorClerkIds is empty
    ];

    const result = await ProductivityService.getLgaComparison(baseFilters);

    expect(result.rows).toEqual([]);
    expect(result.summary.totalLgas).toBe(0);
    expect(result.summary.totalSubmissions).toBe(0);
    expect(result.summary.supervisorlessCount).toBe(0);
  });
});

describe('ProductivityService.getLgaComparison — additional coverage', () => {
  const baseFilters = { period: 'today' as const };

  it('sorts by percent descending when requested', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'u1', fullName: 'E1', lgaId: 'lga-1', roleId: 'r1', status: 'active', role: { name: 'enumerator' } },
      { id: 'u2', fullName: 'E2', lgaId: 'lga-2', roleId: 'r1', status: 'active', role: { name: 'enumerator' } },
    ]);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    selectResults = [
      [{ id: 'lga-1', name: 'LGA A' }, { id: 'lga-2', name: 'LGA B' }],
      // u1 has 20 submissions, u2 has 5
      [{ submitterId: 'u1', todayCount: '20' }, { submitterId: 'u2', todayCount: '5' }],
      [], [], [],
    ];

    const result = await ProductivityService.getLgaComparison({
      ...baseFilters,
      sortBy: 'percent',
      sortOrder: 'desc',
    });

    expect(result.rows).toHaveLength(2);
    // LGA A (80%) should be first when sorting by percent desc
    expect(result.rows[0].lgaId).toBe('lga-1');
    expect(result.rows[0].percent).toBeGreaterThan(result.rows[1].percent);
  });

  it('filters by lgaIds to restrict comparison to specific LGAs', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'u1', fullName: 'E1', lgaId: 'lga-1', roleId: 'r1', status: 'active', role: { name: 'enumerator' } },
      { id: 'u2', fullName: 'E2', lgaId: 'lga-2', roleId: 'r1', status: 'active', role: { name: 'enumerator' } },
      { id: 'u3', fullName: 'E3', lgaId: 'lga-3', roleId: 'r1', status: 'active', role: { name: 'enumerator' } },
    ]);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    selectResults = [
      [{ id: 'lga-1', name: 'LGA 1' }, { id: 'lga-2', name: 'LGA 2' }, { id: 'lga-3', name: 'LGA 3' }],
      [], [], [], [],
    ];

    const result = await ProductivityService.getLgaComparison({
      ...baseFilters,
      lgaIds: ['lga-1', 'lga-2'],
    });

    // Only lga-1 and lga-2 should appear
    expect(result.rows.every((r) => ['lga-1', 'lga-2'].includes(r.lgaId))).toBe(true);
  });

  it('includes bestPerformer and lowestPerformer per LGA', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'u1', fullName: 'Top Enum', lgaId: 'lga-1', roleId: 'r1', status: 'active', role: { name: 'enumerator' } },
      { id: 'u2', fullName: 'Low Enum', lgaId: 'lga-1', roleId: 'r1', status: 'active', role: { name: 'enumerator' } },
    ]);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    selectResults = [
      [{ id: 'lga-1', name: 'Ibadan North' }],
      [{ submitterId: 'u1', todayCount: '20' }, { submitterId: 'u2', todayCount: '3' }],
      [], [], [],
    ];

    const result = await ProductivityService.getLgaComparison(baseFilters);

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.bestPerformer).toBeDefined();
    expect(row.bestPerformer.name).toBe('Top Enum');
    expect(row.bestPerformer.count).toBe(20);
    expect(row.lowestPerformer).toBeDefined();
    expect(row.lowestPerformer.name).toBe('Low Enum');
    expect(row.lowestPerformer.count).toBe(3);
  });

  it('computes summary totalSubmissions correctly', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'u1', fullName: 'E1', lgaId: 'lga-1', roleId: 'r1', status: 'active', role: { name: 'enumerator' } },
      { id: 'u2', fullName: 'E2', lgaId: 'lga-2', roleId: 'r1', status: 'active', role: { name: 'enumerator' } },
    ]);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    selectResults = [
      [{ id: 'lga-1', name: 'LGA 1' }, { id: 'lga-2', name: 'LGA 2' }],
      [{ submitterId: 'u1', todayCount: '15' }, { submitterId: 'u2', todayCount: '10' }],
      [], [], [],
    ];

    const result = await ProductivityService.getLgaComparison(baseFilters);

    expect(result.summary.totalSubmissions).toBe(25);
  });
});

describe('ProductivityService.getLgaSummary', () => {
  const baseFilters = { period: 'today' };

  it('returns aggregate data per LGA', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'u1', lgaId: 'lga-1', role: { name: 'enumerator' } },
      { id: 'u2', lgaId: 'lga-1', role: { name: 'data_entry_clerk' } },
      { id: 'u3', lgaId: 'lga-2', role: { name: 'enumerator' } },
    ]);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 20, lgaOverrides: [] });

    selectResults = [
      // 1: allLgas
      [{ id: 'lga-1', name: 'Ibadan North' }, { id: 'lga-2', name: 'Ibadan South' }],
      // 2: liveCounts
      [
        { submitterId: 'u1', todayCount: '15' },
        { submitterId: 'u2', todayCount: '10' },
        { submitterId: 'u3', todayCount: '5' },
      ],
      // 3: weekMonthSnaps
      [],
      // 4: prevWeekSnaps
      [],
    ];

    const result = await ProductivityService.getLgaSummary(baseFilters);

    expect(result.rows).toHaveLength(2);
    expect(result.summary.totalLgas).toBe(2);
    expect(result.summary.totalActiveStaff).toBe(3); // 2 in lga-1, 1 in lga-2

    const lga1 = result.rows.find((r) => r.lgaId === 'lga-1')!;
    expect(lga1.todayTotal).toBe(25); // 15 + 10
    expect(lga1.activeStaff).toBe(2);
    expect(lga1.dailyTarget).toBe(40); // 2 * 20

    const lga2 = result.rows.find((r) => r.lgaId === 'lga-2')!;
    expect(lga2.todayTotal).toBe(5);
    expect(lga2.activeStaff).toBe(1);
    expect(lga2.dailyTarget).toBe(20); // 1 * 20

    expect(result.summary.totalSubmissionsToday).toBe(30); // 25 + 5
  });

  it('does not include staff names in response rows', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'u1', lgaId: 'lga-1', role: { name: 'enumerator' } },
    ]);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    selectResults = [
      [{ id: 'lga-1', name: 'Ibadan North' }], // allLgas
      [], // liveCounts
      [], // weekMonthSnaps
      [], // prevWeekSnaps
    ];

    const result = await ProductivityService.getLgaSummary(baseFilters);

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    // LgaAggregateSummaryRow should not have any staff name fields
    expect(row).not.toHaveProperty('bestPerformer');
    expect(row).not.toHaveProperty('lowestPerformer');
    expect(row).not.toHaveProperty('supervisorName');
    expect(row).not.toHaveProperty('fullName');
    // Should have aggregate fields only
    expect(row).toHaveProperty('lgaName');
    expect(row).toHaveProperty('activeStaff');
    expect(row).toHaveProperty('todayTotal');
    expect(row).toHaveProperty('completionRate');
    expect(row).toHaveProperty('trend');
  });

  it('applies lgaId filter for single LGA', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'u1', lgaId: 'lga-1', role: { name: 'enumerator' } },
      { id: 'u2', lgaId: 'lga-2', role: { name: 'enumerator' } },
    ]);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    selectResults = [
      // allLgas returns both, but the method filters internally by lgaId
      [{ id: 'lga-1', name: 'Ibadan North' }, { id: 'lga-2', name: 'Ibadan South' }],
      // liveCounts (all field staff, including lga-2 staff — the LGA filter is applied when building rows)
      [{ submitterId: 'u1', todayCount: '10' }, { submitterId: 'u2', todayCount: '7' }],
      [], // weekMonthSnaps
      [], // prevWeekSnaps
    ];

    const result = await ProductivityService.getLgaSummary({ ...baseFilters, lgaId: 'lga-1' });

    // Only lga-1 should appear in the results
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].lgaId).toBe('lga-1');
    expect(result.rows[0].lgaName).toBe('Ibadan North');
    expect(result.summary.totalLgas).toBe(1);
  });

  it('returns empty when no staff exist', async () => {
    mockFindMany.mockResolvedValue([]);
    mockGetActiveTargets.mockResolvedValue({ defaultTarget: 25, lgaOverrides: [] });

    selectResults = [
      [{ id: 'lga-1', name: 'Ibadan North' }], // allLgas exists but no staff
    ];

    const result = await ProductivityService.getLgaSummary(baseFilters);

    expect(result.rows).toEqual([]);
    expect(result.summary.totalLgas).toBe(0);
    expect(result.summary.totalSubmissionsToday).toBe(0);
  });
});
