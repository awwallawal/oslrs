/**
 * Productivity Snapshot Worker Tests
 *
 * Story 5.6a: Tests for the nightly snapshot processor.
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
  mockInsert,
  mockValues,
  mockOnConflictDoUpdate,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockGroupBy: vi.fn(),
  mockInnerJoin: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockOnConflictDoUpdate: vi.fn(),
}));

let selectCallCount = 0;
let selectResults: unknown[][] = [];

function createSelectChain() {
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

function createInsertChain() {
  const chain: Record<string, unknown> = {};
  chain.values = (...args: unknown[]) => { mockValues(...args); return chain; };
  chain.onConflictDoUpdate = (...args: unknown[]) => { mockOnConflictDoUpdate(...args); return chain; };
  chain.then = (resolve: (v: unknown) => void) => resolve(undefined);
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
      return createSelectChain();
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return createInsertChain();
    },
  },
}));

vi.mock('bullmq', () => ({
  Worker: class MockWorker {
    on() { return this; }
    isRunning() { return true; }
    close() { return Promise.resolve(); }
  },
  Job: class MockJob {},
}));

vi.mock('ioredis', () => ({
  Redis: class MockRedis {
    get() { return Promise.resolve(null); }
    setex() { return Promise.resolve('OK'); }
    del() { return Promise.resolve(1); }
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

// Import processSnapshot after mocks are set up
import { processSnapshot } from '../productivity-snapshot.worker.js';

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  selectCallCount = 0;
  selectResults = [];
});

describe('processSnapshot', () => {
  const mockJob = { id: 'snap-job-1', data: {} } as never;

  it('returns early with staffCount 0 when no eligible staff', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await processSnapshot(mockJob);

    expect(result.staffCount).toBe(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('filters only enumerators and data_entry_clerks from active users', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'u-1', lgaId: 'lga-1', roleId: 'r-1', role: { name: 'enumerator' } },
      { id: 'u-2', lgaId: 'lga-1', roleId: 'r-2', role: { name: 'supervisor' } },
      { id: 'u-3', lgaId: 'lga-2', roleId: 'r-3', role: { name: 'data_entry_clerk' } },
    ]);

    // submissionCounts and fraudCounts queries
    selectResults = [[], []];

    const result = await processSnapshot(mockJob);

    expect(result.staffCount).toBe(2); // Only enumerator + data_entry_clerk
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('upserts snapshot with submission and fraud counts', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'u-1', lgaId: 'lga-1', roleId: 'r-1', role: { name: 'enumerator' } },
    ]);

    selectResults = [
      [{ submitterId: 'u-1', count: '15' }],  // submissionCounts
      [{ enumeratorId: 'u-1', approvedCount: '12', rejectedCount: '2' }],  // fraudCounts
    ];

    const result = await processSnapshot(mockJob);

    expect(result.staffCount).toBe(1);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        submissionCount: 15,
        approvedCount: 12,
        rejectedCount: 2,
      }),
    );
    expect(mockOnConflictDoUpdate).toHaveBeenCalled();
  });

  it('defaults counts to 0 for staff with no submissions', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'u-1', lgaId: 'lga-1', roleId: 'r-1', role: { name: 'enumerator' } },
    ]);

    selectResults = [[], []]; // No submissions, no fraud records

    await processSnapshot(mockJob);

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        submissionCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
      }),
    );
  });

  it('processes multiple staff members in a single run', async () => {
    const staff = Array.from({ length: 5 }, (_, i) => ({
      id: `u-${i}`,
      lgaId: 'lga-1',
      roleId: 'r-1',
      role: { name: 'enumerator' },
    }));

    mockFindMany.mockResolvedValue(staff);
    selectResults = [[], []];

    const result = await processSnapshot(mockJob);

    expect(result.staffCount).toBe(5);
    expect(mockInsert).toHaveBeenCalledTimes(5);
  });
});
