// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock offline-db
const mockUpdate = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn());

// 13-4 AC4.3b — restoreToDraft moves a row between TWO tables, so both are stubbed.
const mockQueueGet = vi.hoisted(() => vi.fn());
const mockQueueDelete = vi.hoisted(() => vi.fn());
const mockDraftsPut = vi.hoisted(() => vi.fn());
const mockDraftsGet = vi.hoisted(() => vi.fn());
vi.mock('../../lib/offline-db', () => ({
  db: {
    submissionQueue: {
      where: mockWhere,
      update: mockUpdate,
      get: mockQueueGet,
      delete: mockQueueDelete,
    },
    drafts: {
      put: mockDraftsPut,
      get: mockDraftsGet,
    },
  },
}));

// Mock submission API
const mockSubmitSurvey = vi.hoisted(() => vi.fn());
const mockFetchSubmissionStatuses = vi.hoisted(() => vi.fn());
vi.mock('../../features/forms/api/submission.api', () => ({
  submitSurvey: mockSubmitSurvey,
  fetchSubmissionStatuses: mockFetchSubmissionStatuses,
}));

import { SyncManager } from '../sync-manager';

/** Helper: setup where mock to return specific items for pending/failed (with optional userId) */
function setupWhereMock(
  pending: Record<string, unknown>[] = [],
  failed: Record<string, unknown>[] = [],
) {
  mockWhere.mockImplementation((query: { status: string; userId?: string }) => {
    if (query.status === 'pending') return { toArray: vi.fn().mockResolvedValue(pending) };
    if (query.status === 'failed') return { toArray: vi.fn().mockResolvedValue(failed) };
    return { toArray: vi.fn().mockResolvedValue([]) };
  });
}

import { isPermanentFailure } from '../sync-manager';
import { ApiError } from '../../lib/api-client';

/**
 * 13-4 (2026-08-06) — found by a REAL prod smoke, not by review.
 *
 * An enumerator submitted a form missing `employment_status`. The server returned a 422 that could
 * never succeed on resend. The queue treated it as retryable, because the ONLY error classed as
 * permanent was the string `NIN_DUPLICATE` — and `retryFailed()` resets `retryCount` to 0, so every
 * press of the operator's own "Retry Failed" button re-armed it. The banner never cleared, and the
 * only escape was the browser console. **A field enumerator does not have one.**
 *
 * Classify on the HTTP STATUS, not the message: a message is prose that changes when someone edits
 * a string; the status is the contract.
 */
describe('isPermanentFailure — 13-4', () => {
  it('treats a 4xx the server will always reject as PERMANENT', () => {
    // The exact shape that stuck: 422 INCOMPLETE_SUBMISSION.
    expect(isPermanentFailure(new ApiError('Submission is missing required answer(s): employment_status', 422)).permanent).toBe(true);
    expect(isPermanentFailure(new ApiError('bad request', 400)).permanent).toBe(true);
    expect(isPermanentFailure(new ApiError('gone', 404)).permanent).toBe(true);
    expect(isPermanentFailure(new ApiError('duplicate', 409)).permanent).toBe(true);
  });

  it('keeps genuinely retryable client errors retryable', () => {
    // 408/429 explicitly mean "try again"; 401/403 can change after a token refresh or re-login.
    for (const status of [408, 429, 401, 403]) {
      expect(isPermanentFailure(new ApiError('x', status)).permanent).toBe(false);
    }
  });

  it('keeps network/offline failures retryable — the condition this queue exists for', () => {
    expect(isPermanentFailure(new Error('Failed to fetch')).permanent).toBe(false);
    expect(isPermanentFailure(new ApiError('server exploded', 500)).permanent).toBe(false);
    expect(isPermanentFailure(undefined).permanent).toBe(false);
  });

  it('still honours the legacy NIN_DUPLICATE string (discovered by polling, carries no status)', () => {
    expect(isPermanentFailure(new Error('NIN_DUPLICATE')).permanent).toBe(true);
  });

  it('reports the status so the UI can explain WHY retry is not offered', () => {
    expect(isPermanentFailure(new ApiError('x', 422)).status).toBe(422);
  });
});

/**
 * 13-4 AC4.3b — restore-to-draft. Corrects the Discard-only design shipped hours earlier.
 *
 * `useDraftPersistence` DELETES the draft at submit ("the queue item has all data needed for
 * sync") — true only while the queue item exists. So Discard destroyed the ONLY remaining copy of
 * an interview, confirmed empirically: after the first failed row was removed, the drafts store
 * returned NO DRAFTS. Nobody should re-interview a citizen because a form was one answer short.
 */
describe('SyncManager.restoreToDraft — 13-4 AC4.3b', () => {
  beforeEach(() => {
    mockQueueGet.mockReset();
    mockQueueDelete.mockReset().mockResolvedValue(undefined);
    mockDraftsPut.mockReset().mockResolvedValue(undefined);
  });

  it('rehydrates the payload into drafts, keeping the SAME id so the reference code survives', async () => {
    mockQueueGet.mockResolvedValue({
      id: 'sub-1', formId: 'form-1', userId: 'u1', createdAt: '2026-08-07T09:00:00.000Z',
      status: 'failed', retryCount: 3, error: 'missing employment_status', permanentFailure: true,
      payload: { rawData: { _referenceCode: 'OSL-2026-KEEPME', surname: 'Bello', firstname: 'Fatima' } },
    });

    await expect(new SyncManager().restoreToDraft('sub-1')).resolves.toBe(true);

    const draft = mockDraftsPut.mock.calls[0]![0];
    expect(draft.id).toBe('sub-1');                       // same id => same identity
    expect(draft.status).toBe('in-progress');
    expect(draft.responses._referenceCode).toBe('OSL-2026-KEEPME'); // the code survives
    expect(draft.responses.surname).toBe('Bello');
    expect(draft.questionPosition).toBe(0);
    // Queue row dropped LAST, and only after the draft is written.
    expect(mockQueueDelete).toHaveBeenCalledWith('sub-1');
  });

  it('returns false for an unknown id rather than creating an empty draft', async () => {
    mockQueueGet.mockResolvedValue(undefined);
    await expect(new SyncManager().restoreToDraft('nope')).resolves.toBe(false);
    expect(mockDraftsPut).not.toHaveBeenCalled();
    expect(mockQueueDelete).not.toHaveBeenCalled();
  });

  /** Order is load-bearing: a throw on put must leave the entry QUEUED, not lost between tables. */
  it('does NOT drop the queue row if writing the draft fails', async () => {
    mockQueueGet.mockResolvedValue({ id: 'sub-2', formId: 'f', userId: 'u', createdAt: 'x', payload: {} });
    mockDraftsPut.mockRejectedValue(new Error('quota exceeded'));
    await expect(new SyncManager().restoreToDraft('sub-2')).rejects.toThrow('quota exceeded');
    expect(mockQueueDelete).not.toHaveBeenCalled();
  });
});

describe('SyncManager', () => {
  let manager: SyncManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    manager = new SyncManager();
    manager.setUserId('test-user-A'); // prep-11: userId required for sync

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
    mockWhere.mockImplementation((query: { status: string; userId?: string }) => {
      if (query.status === 'failed') {
        retryFailedCallCount++;
        if (retryFailedCallCount === 1) {
          // retryFailed() fetching failed items to reset
          return { toArray: vi.fn().mockResolvedValue(failedItems) };
        }
        // syncAll() fetching failed items (already reset, so empty)
        return { toArray: vi.fn().mockResolvedValue([]) };
      }
      if (query.status === 'pending') return { toArray: vi.fn().mockResolvedValue([]) };
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

  // ── AC 3.7.6: Submission status polling & NIN_DUPLICATE handling ──────

  it('polls submission status after successful sync and marks NIN_DUPLICATE as permanently failed', async () => {
    setupWhereMock([
      {
        id: 'item-1',
        formId: 'form-1',
        payload: { responses: { nin: '61961438053' }, formVersion: '1.0.0', submittedAt: '2026-01-01T00:00:00.000Z' },
        status: 'pending',
        retryCount: 0,
        lastAttempt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        error: null,
      },
    ]);
    mockSubmitSurvey.mockResolvedValue({ data: { id: 'job-1', status: 'queued' } });
    mockFetchSubmissionStatuses.mockResolvedValue({
      'item-1': {
        processed: true,
        processingError: 'NIN_DUPLICATE: This individual was already registered on 2026-02-10T14:30:00.000Z via enumerator',
      },
    });

    await manager.syncAll();

    // Advance past the first poll delay (5s)
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockFetchSubmissionStatuses).toHaveBeenCalledWith(['item-1']);
    expect(mockUpdate).toHaveBeenCalledWith('item-1', expect.objectContaining({
      status: 'failed',
      error: expect.stringContaining('NIN_DUPLICATE'),
      retryCount: 3, // MAX_RETRIES — prevents retry
    }));
  });

  it('retryFailed skips permanently failed NIN_DUPLICATE items', async () => {
    const failedItems = [
      { id: 'fail-1', status: 'failed', retryCount: 3, error: 'NIN_DUPLICATE: already registered' },
      { id: 'fail-2', status: 'failed', retryCount: 1, error: 'Network error' },
    ];

    let retryFailedCallCount = 0;
    mockWhere.mockImplementation((query: { status: string; userId?: string }) => {
      if (query.status === 'failed') {
        retryFailedCallCount++;
        if (retryFailedCallCount === 1) {
          return { toArray: vi.fn().mockResolvedValue(failedItems) };
        }
        return { toArray: vi.fn().mockResolvedValue([]) };
      }
      if (query.status === 'pending') return { toArray: vi.fn().mockResolvedValue([]) };
      return { toArray: vi.fn().mockResolvedValue([]) };
    });

    await manager.retryFailed();

    // NIN_DUPLICATE item should NOT be reset
    expect(mockUpdate).not.toHaveBeenCalledWith('fail-1', expect.objectContaining({
      status: 'pending',
    }));
    // Regular failure should be reset
    expect(mockUpdate).toHaveBeenCalledWith('fail-2', {
      status: 'pending',
      retryCount: 0,
      error: null,
    });
  });

  it('syncAll skips NIN_DUPLICATE failed items from retry', async () => {
    setupWhereMock([], [
      {
        id: 'item-nin',
        formId: 'form-1',
        payload: { responses: {}, formVersion: '1.0.0', submittedAt: '2026-01-01T00:00:00.000Z' },
        status: 'failed',
        retryCount: 1, // Under MAX_RETRIES but NIN_DUPLICATE error
        lastAttempt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        error: 'NIN_DUPLICATE: already registered',
      },
    ]);

    await manager.syncAll();

    // Should NOT attempt to sync NIN_DUPLICATE items
    expect(mockSubmitSurvey).not.toHaveBeenCalled();
  });

  it('polling stops when all UIDs are processed', async () => {
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
    mockSubmitSurvey.mockResolvedValue({ data: { id: 'job-1', status: 'queued' } });
    mockFetchSubmissionStatuses.mockResolvedValue({
      'item-1': { processed: true, processingError: null },
    });

    await manager.syncAll();

    // Advance past first poll delay
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockFetchSubmissionStatuses).toHaveBeenCalledTimes(1);

    // Advance past second poll delay — should NOT poll again since item was processed
    await vi.advanceTimersByTimeAsync(15000);

    expect(mockFetchSubmissionStatuses).toHaveBeenCalledTimes(1);
  });

  it('marks NIN_DUPLICATE_STAFF as permanently failed (AC 3.7.6)', async () => {
    setupWhereMock([
      {
        id: 'item-staff',
        formId: 'form-1',
        payload: { responses: { nin: '61961438053' }, formVersion: '1.0.0', submittedAt: '2026-01-01T00:00:00.000Z' },
        status: 'pending',
        retryCount: 0,
        lastAttempt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        error: null,
      },
    ]);
    mockSubmitSurvey.mockResolvedValue({ data: { id: 'job-staff', status: 'queued' } });
    mockFetchSubmissionStatuses.mockResolvedValue({
      'item-staff': {
        processed: true,
        processingError: 'NIN_DUPLICATE_STAFF: This NIN belongs to a registered staff member',
      },
    });

    await manager.syncAll();

    // Advance past the first poll delay (5s)
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockFetchSubmissionStatuses).toHaveBeenCalledWith(['item-staff']);
    expect(mockUpdate).toHaveBeenCalledWith('item-staff', expect.objectContaining({
      status: 'failed',
      error: expect.stringContaining('NIN_DUPLICATE_STAFF'),
      retryCount: 3, // MAX_RETRIES — prevents retry
    }));
  });

  // ── prep-11: User isolation tests ──────────────────────────────────────

  it('syncAll does nothing when userId is not set', async () => {
    manager.setUserId(null);

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
    expect(mockWhere).not.toHaveBeenCalled();
  });

  it('retryFailed does nothing when userId is not set', async () => {
    manager.setUserId(null);

    await manager.retryFailed();

    expect(mockWhere).not.toHaveBeenCalled();
  });

  it('syncAll passes userId in where queries', async () => {
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
    mockSubmitSurvey.mockResolvedValue({ data: { id: 'job-1', status: 'queued' } });

    await manager.syncAll();

    // Verify that where was called with userId
    expect(mockWhere).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'test-user-A', status: 'pending' })
    );
    expect(mockWhere).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'test-user-A', status: 'failed' })
    );
  });

  it('polling skips when offline mid-poll', async () => {
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
    mockSubmitSurvey.mockResolvedValue({ data: { id: 'job-1', status: 'queued' } });

    await manager.syncAll();

    // Go offline before poll fires
    vi.stubGlobal('navigator', { ...window.navigator, onLine: false });

    await vi.advanceTimersByTimeAsync(5000);

    expect(mockFetchSubmissionStatuses).not.toHaveBeenCalled();
  });
});
