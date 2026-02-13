// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock offline-db
const mockUpdate = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn());

vi.mock('../../lib/offline-db', () => ({
  db: {
    submissionQueue: {
      where: mockWhere,
      update: mockUpdate,
    },
  },
}));

// Mock submission API
const mockSubmitSurvey = vi.hoisted(() => vi.fn());
vi.mock('../../features/forms/api/submission.api', () => ({
  submitSurvey: mockSubmitSurvey,
}));

import { SyncManager } from '../sync-manager';

/** Helper: setup where mock to return specific items for pending/failed */
function setupWhereMock(
  pending: Record<string, unknown>[] = [],
  failed: Record<string, unknown>[] = [],
) {
  mockWhere.mockImplementation(({ status }: { status: string }) => {
    if (status === 'pending') return { toArray: vi.fn().mockResolvedValue(pending) };
    if (status === 'failed') return { toArray: vi.fn().mockResolvedValue(failed) };
    return { toArray: vi.fn().mockResolvedValue([]) };
  });
}

describe('SyncManager', () => {
  let manager: SyncManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    manager = new SyncManager();

    // Default: empty queues
    setupWhereMock();
    mockUpdate.mockResolvedValue(1);

    vi.stubGlobal('navigator', {
      ...window.navigator,
      onLine: true,
    });
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('syncAll processes pending items and extracts enriched payload', async () => {
    setupWhereMock([
      {
        id: 'item-1',
        formId: 'form-1',
        payload: {
          responses: { q1: 'answer1' },
          formVersion: '2.0.0',
          submittedAt: '2026-01-01T12:00:00.000Z',
          gpsLatitude: 7.3775,
          gpsLongitude: 3.947,
        },
        status: 'pending',
        retryCount: 0,
        lastAttempt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        error: null,
      },
    ]);
    mockSubmitSurvey.mockResolvedValue({ data: { id: 'job-1', status: 'queued' } });

    await manager.syncAll();

    expect(mockUpdate).toHaveBeenCalledWith('item-1', expect.objectContaining({ status: 'syncing' }));
    expect(mockUpdate).toHaveBeenCalledWith('item-1', expect.objectContaining({ status: 'synced', error: null }));
    expect(mockSubmitSurvey).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: 'item-1',
      formId: 'form-1',
      formVersion: '2.0.0',
      responses: { q1: 'answer1' },
      submittedAt: '2026-01-01T12:00:00.000Z',
      gpsLatitude: 7.3775,
      gpsLongitude: 3.947,
    }));
  });

  it('syncAll falls back gracefully for non-enriched payloads', async () => {
    setupWhereMock([
      {
        id: 'item-1',
        formId: 'form-1',
        payload: { q1: 'answer1' },
        status: 'pending',
        retryCount: 0,
        lastAttempt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        error: null,
      },
    ]);
    mockSubmitSurvey.mockResolvedValue({ data: { id: 'job-1', status: 'queued' } });

    await manager.syncAll();

    // Falls back: responses = payload, formVersion = '1.0.0', submittedAt = now
    expect(mockSubmitSurvey).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: 'item-1',
      formId: 'form-1',
      formVersion: '1.0.0',
      responses: { q1: 'answer1' },
    }));
    // GPS omitted when not present
    const callArgs = mockSubmitSurvey.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('gpsLatitude');
    expect(callArgs).not.toHaveProperty('gpsLongitude');
  });

  it('syncAll marks item as failed on API error', async () => {
    setupWhereMock([
      {
        id: 'item-1',
        formId: 'form-1',
        payload: { responses: { q1: 'answer1' }, formVersion: '1.0.0', submittedAt: '2026-01-01T00:00:00.000Z' },
        status: 'pending',
        retryCount: 0,
        lastAttempt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        error: null,
      },
    ]);
    mockSubmitSurvey.mockRejectedValue(new Error('Network error'));

    await manager.syncAll();

    expect(mockUpdate).toHaveBeenCalledWith('item-1', expect.objectContaining({ status: 'syncing' }));
    expect(mockUpdate).toHaveBeenCalledWith('item-1', expect.objectContaining({
      status: 'failed',
      error: 'Network error',
      retryCount: 1,
    }));
  });

  it('syncAll handles duplicate response by marking as synced', async () => {
    setupWhereMock([
      {
        id: 'item-1',
        formId: 'form-1',
        payload: { responses: { q1: 'answer1' }, formVersion: '1.0.0', submittedAt: '2026-01-01T00:00:00.000Z' },
        status: 'pending',
        retryCount: 0,
        lastAttempt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        error: null,
      },
    ]);
    mockSubmitSurvey.mockResolvedValue({ data: { id: null, status: 'duplicate' } });

    await manager.syncAll();

    expect(mockUpdate).toHaveBeenCalledWith('item-1', expect.objectContaining({ status: 'synced' }));
  });

  it('syncAll skips items that have exceeded max retries', async () => {
    setupWhereMock([
      {
        id: 'item-1',
        formId: 'form-1',
        payload: { responses: { q1: 'answer1' }, formVersion: '1.0.0', submittedAt: '2026-01-01T00:00:00.000Z' },
        status: 'pending',
        retryCount: 3,
        lastAttempt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        error: 'Previous error',
      },
    ]);

    await manager.syncAll();

    expect(mockSubmitSurvey).not.toHaveBeenCalled();
  });

  it('syncAll also processes failed items under max retries', async () => {
    setupWhereMock([], [
      {
        id: 'item-2',
        formId: 'form-1',
        payload: { responses: { q1: 'retry' }, formVersion: '1.0.0', submittedAt: '2026-01-01T00:00:00.000Z' },
        status: 'failed',
        retryCount: 1,
        lastAttempt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        error: 'Previous error',
      },
    ]);
    mockSubmitSurvey.mockResolvedValue({ data: { id: 'job-2', status: 'queued' } });

    await manager.syncAll();

    expect(mockSubmitSurvey).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('item-2', expect.objectContaining({ status: 'synced' }));
  });

  it('prevents concurrent syncs', async () => {
    setupWhereMock([
      {
        id: 'item-1',
        formId: 'form-1',
        payload: { responses: {}, formVersion: '1.0.0', submittedAt: '2026-01-01T00:00:00.000Z' },
        status: 'pending',
        retryCount: 0,
        lastAttempt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        error: null,
      },
    ]);

    let resolveSubmit!: (v: unknown) => void;
    mockSubmitSurvey.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
    );

    const firstSync = manager.syncAll();
    const secondSync = manager.syncAll();

    resolveSubmit({ data: { id: 'job-1', status: 'queued' } });

    await firstSync;
    await secondSync;

    expect(mockSubmitSurvey).toHaveBeenCalledTimes(1);
  });

  it('does not sync when offline', async () => {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      onLine: false,
    });

    setupWhereMock([
      {
        id: 'item-1',
        formId: 'form-1',
        payload: { responses: {}, formVersion: '1.0.0', submittedAt: '2026-01-01T00:00:00.000Z' },
        status: 'pending',
        retryCount: 0,
        lastAttempt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        error: null,
      },
    ]);

    await manager.syncAll();

    expect(mockSubmitSurvey).not.toHaveBeenCalled();
  });

  it('syncNow calls syncAll', async () => {
    const syncAllSpy = vi.spyOn(manager, 'syncAll').mockResolvedValue();

    await manager.syncNow();

    expect(syncAllSpy).toHaveBeenCalledTimes(1);
  });

  it('retryFailed resets failed items to pending and triggers sync', async () => {
    const failedItems = [
      { id: 'fail-1', status: 'failed', retryCount: 3, error: 'timeout' },
      { id: 'fail-2', status: 'failed', retryCount: 2, error: 'network' },
    ];

    // First call (retryFailed fetches failed) returns failed items
    // Then syncAll is called which fetches pending + failed
    let retryFailedCallCount = 0;
    mockWhere.mockImplementation(({ status }: { status: string }) => {
      if (status === 'failed') {
        retryFailedCallCount++;
        if (retryFailedCallCount === 1) {
          // retryFailed() fetching failed items to reset
          return { toArray: vi.fn().mockResolvedValue(failedItems) };
        }
        // syncAll() fetching failed items (already reset, so empty)
        return { toArray: vi.fn().mockResolvedValue([]) };
      }
      if (status === 'pending') return { toArray: vi.fn().mockResolvedValue([]) };
      return { toArray: vi.fn().mockResolvedValue([]) };
    });

    await manager.retryFailed();

    // Verify failed items were reset
    expect(mockUpdate).toHaveBeenCalledWith('fail-1', {
      status: 'pending',
      retryCount: 0,
      error: null,
    });
    expect(mockUpdate).toHaveBeenCalledWith('fail-2', {
      status: 'pending',
      retryCount: 0,
      error: null,
    });
  });

  it('auto-syncs on online event with debounce', async () => {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      onLine: false,
    });

    manager.init();

    vi.stubGlobal('navigator', {
      ...window.navigator,
      onLine: true,
    });

    const syncAllSpy = vi.spyOn(manager, 'syncAll').mockResolvedValue();

    window.dispatchEvent(new Event('online'));

    expect(syncAllSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(syncAllSpy).toHaveBeenCalledTimes(1);
  });

  it('cleans up event listeners on destroy', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    manager.init();
    manager.destroy();

    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));

    removeSpy.mockRestore();
  });
});
