// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockUseOnlineStatus = vi.hoisted(() => vi.fn());
const mockUseLiveQuery = vi.hoisted(() => vi.fn());

vi.mock('../../../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: mockUseOnlineStatus,
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: mockUseLiveQuery,
}));

import { useSyncStatus } from '../useSyncStatus';

describe('useSyncStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseOnlineStatus.mockReturnValue({ isOnline: true });
    // Default: empty queue
    mockUseLiveQuery.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "empty" when queue has zero items', () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: true });
    mockUseLiveQuery.mockReturnValue([]);

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.status).toBe('empty');
    expect(result.current.totalCount).toBe(0);
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.failedCount).toBe(0);
    expect(result.current.syncingCount).toBe(0);
  });

  it('returns "synced" when online and all items are synced', () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: true });
    mockUseLiveQuery.mockReturnValue([
      { id: '1', status: 'synced' },
      { id: '2', status: 'synced' },
    ]);

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.status).toBe('synced');
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.totalCount).toBe(2);
  });

  it('returns "syncing" when any item has status "syncing"', () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: true });
    mockUseLiveQuery.mockReturnValue([
      { id: '1', status: 'syncing' },
      { id: '2', status: 'pending' },
      { id: '3', status: 'synced' },
    ]);

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.status).toBe('syncing');
    expect(result.current.syncingCount).toBe(1);
    expect(result.current.pendingCount).toBe(1);
  });

  it('returns "attention" when online, no syncing, and failed items exist', () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: true });
    mockUseLiveQuery.mockReturnValue([
      { id: '1', status: 'failed' },
      { id: '2', status: 'synced' },
    ]);

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.status).toBe('attention');
    expect(result.current.failedCount).toBe(1);
  });

  it('returns "syncing" over "attention" when both syncing and failed exist', () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: true });
    mockUseLiveQuery.mockReturnValue([
      { id: '1', status: 'syncing' },
      { id: '2', status: 'failed' },
    ]);

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.status).toBe('syncing');
  });

  it('returns "offline" when device is offline, regardless of queue state', () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: false });
    mockUseLiveQuery.mockReturnValue([
      { id: '1', status: 'synced' },
    ]);

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.status).toBe('offline');
  });

  it('returns "empty" when offline with empty queue (empty takes priority)', () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: false });
    mockUseLiveQuery.mockReturnValue([]);

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.status).toBe('empty');
  });

  it('returns "offline" when offline with syncing items (overrides syncing)', () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: false });
    mockUseLiveQuery.mockReturnValue([
      { id: '1', status: 'syncing' },
    ]);

    const { result } = renderHook(() => useSyncStatus());

    // Offline takes priority over syncing
    expect(result.current.status).toBe('offline');
    expect(result.current.syncingCount).toBe(1);
  });

  it('counts pending, failed, and syncing items correctly', () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: true });
    mockUseLiveQuery.mockReturnValue([
      { id: '1', status: 'pending' },
      { id: '2', status: 'pending' },
      { id: '3', status: 'syncing' },
      { id: '4', status: 'failed' },
      { id: '5', status: 'synced' },
    ]);

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.pendingCount).toBe(2);
    expect(result.current.syncingCount).toBe(1);
    expect(result.current.failedCount).toBe(1);
    expect(result.current.totalCount).toBe(5);
  });

  it('handles undefined useLiveQuery result gracefully', () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: true });
    mockUseLiveQuery.mockReturnValue(undefined);

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.status).toBe('empty');
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.failedCount).toBe(0);
    expect(result.current.syncingCount).toBe(0);
    expect(result.current.totalCount).toBe(0);
  });
});
