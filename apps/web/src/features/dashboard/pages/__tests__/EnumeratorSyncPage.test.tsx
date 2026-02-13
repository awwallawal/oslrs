// @vitest-environment jsdom
/**
 * EnumeratorSyncPage Tests
 *
 * Story 2.5-5 AC4: Sync Status sidebar target
 * Story 3.3 AC1, AC4, AC8, AC9: Full queue UI with live submission status
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

expect.extend(matchers);

// Mock useLiveQuery
const mockUseLiveQuery = vi.hoisted(() => vi.fn());
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: mockUseLiveQuery,
}));

// Mock useSyncStatus
const mockUseSyncStatus = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    status: 'synced',
    pendingCount: 0,
    failedCount: 0,
    syncingCount: 0,
    totalCount: 0,
  }),
);
vi.mock('../../../forms/hooks/useSyncStatus', () => ({
  useSyncStatus: mockUseSyncStatus,
}));

// Mock syncManager
const mockSyncNow = vi.hoisted(() => vi.fn());
const mockRetryFailed = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/sync-manager', () => ({
  syncManager: { syncNow: mockSyncNow, retryFailed: mockRetryFailed },
}));

// Mock offline-db
vi.mock('../../../../lib/offline-db', () => ({
  db: {
    submissionQueue: {
      orderBy: vi.fn().mockReturnValue({
        reverse: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
    },
    formSchemaCache: {
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}));

import EnumeratorSyncPage from '../EnumeratorSyncPage';

describe('EnumeratorSyncPage', () => {
  let liveQueryCallIndex: number;

  beforeEach(() => {
    vi.clearAllMocks();
    liveQueryCallIndex = 0;
    // Default: empty queue, empty form cache
    mockUseLiveQuery.mockImplementation(() => {
      liveQueryCallIndex++;
      if (liveQueryCallIndex === 1) return []; // submissionQueue
      return []; // formSchemaCache
    });
    mockUseSyncStatus.mockReturnValue({
      status: 'synced',
      pendingCount: 0,
      failedCount: 0,
      syncingCount: 0,
      totalCount: 0,
    });
  });

  it('renders page heading', () => {
    render(<EnumeratorSyncPage />);
    expect(screen.getByText('Sync Status')).toBeInTheDocument();
    expect(screen.getByText('Data synchronization and upload status')).toBeInTheDocument();
  });

  it('renders sync status badge', () => {
    render(<EnumeratorSyncPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });

  it('renders empty state when no submissions', () => {
    render(<EnumeratorSyncPage />);
    expect(screen.getByText('No submissions yet. Start a survey to see sync status here.')).toBeInTheDocument();
  });

  it('renders submission queue items with form name from cache', () => {
    mockUseLiveQuery.mockImplementation(() => {
      liveQueryCallIndex++;
      if (liveQueryCallIndex === 1) {
        return [
          {
            id: 'sub-1',
            formId: 'form-1',
            payload: {},
            status: 'synced',
            retryCount: 0,
            lastAttempt: null,
            createdAt: '2026-02-13T09:00:00.000Z',
            error: null,
          },
          {
            id: 'sub-2',
            formId: 'form-2',
            payload: {},
            status: 'pending',
            retryCount: 0,
            lastAttempt: null,
            createdAt: '2026-02-13T10:00:00.000Z',
            error: null,
          },
        ];
      }
      // formSchemaCache
      return [
        { formId: 'form-1', version: '1.0.0', schema: { title: 'Labour Survey' }, cachedAt: '', etag: null },
      ];
    });

    render(<EnumeratorSyncPage />);

    expect(screen.getAllByTestId('queue-item')).toHaveLength(2);
    // form-1 has a cached name
    expect(screen.getByText('Labour Survey')).toBeInTheDocument();
    // form-2 falls back to truncated ID
    expect(screen.getByText(/Form form-2/)).toBeInTheDocument();
  });

  it('shows status labels on queue items', () => {
    mockUseLiveQuery.mockImplementation(() => {
      liveQueryCallIndex++;
      if (liveQueryCallIndex === 1) {
        return [
          {
            id: 'sub-1',
            formId: 'form-1',
            payload: {},
            status: 'pending',
            retryCount: 0,
            lastAttempt: null,
            createdAt: '2026-02-13T09:00:00.000Z',
            error: null,
          },
          {
            id: 'sub-2',
            formId: 'form-2',
            payload: {},
            status: 'failed',
            retryCount: 2,
            lastAttempt: '2026-02-13T09:30:00.000Z',
            createdAt: '2026-02-13T08:00:00.000Z',
            error: 'Network error',
          },
        ];
      }
      return [];
    });

    render(<EnumeratorSyncPage />);

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('renders "Upload Now" button', () => {
    render(<EnumeratorSyncPage />);
    expect(screen.getByRole('button', { name: /upload now/i })).toBeInTheDocument();
  });

  it('calls syncManager.syncNow on Upload Now click', () => {
    render(<EnumeratorSyncPage />);
    fireEvent.click(screen.getByRole('button', { name: /upload now/i }));
    expect(mockSyncNow).toHaveBeenCalledTimes(1);
  });

  it('disables Upload Now button while syncing', () => {
    mockUseSyncStatus.mockReturnValue({
      status: 'syncing',
      pendingCount: 1,
      failedCount: 0,
      syncingCount: 1,
      totalCount: 2,
    });
    render(<EnumeratorSyncPage />);
    expect(screen.getByRole('button', { name: /upload now/i })).toBeDisabled();
  });

  it('shows Retry Failed button when failedCount > 0', () => {
    mockUseSyncStatus.mockReturnValue({
      status: 'attention',
      pendingCount: 0,
      failedCount: 2,
      syncingCount: 0,
      totalCount: 3,
    });
    render(<EnumeratorSyncPage />);
    expect(screen.getByTestId('retry-failed-button')).toBeInTheDocument();
    expect(screen.getByText('Retry Failed')).toBeInTheDocument();
  });

  it('calls syncManager.retryFailed on Retry Failed click', () => {
    mockUseSyncStatus.mockReturnValue({
      status: 'attention',
      pendingCount: 0,
      failedCount: 1,
      syncingCount: 0,
      totalCount: 2,
    });
    render(<EnumeratorSyncPage />);
    fireEvent.click(screen.getByTestId('retry-failed-button'));
    expect(mockRetryFailed).toHaveBeenCalledTimes(1);
  });

  it('does not show Retry Failed button when failedCount is 0', () => {
    render(<EnumeratorSyncPage />);
    expect(screen.queryByTestId('retry-failed-button')).not.toBeInTheDocument();
  });
});
