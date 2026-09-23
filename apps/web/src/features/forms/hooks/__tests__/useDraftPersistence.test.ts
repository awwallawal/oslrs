// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';

// Use vi.hoisted() for mock functions referenced inside vi.mock factory
const {
  mockDraftsWhere,
  mockDraftsFirst,
  mockDraftsUpdate,
  mockDraftsAdd,
  mockDraftsDelete,
  mockSubmissionQueuePut,
  mockSubmissionQueueAdd,
  mockUseAuth,
} = vi.hoisted(() => ({
  mockDraftsWhere: vi.fn(),
  mockDraftsFirst: vi.fn(),
  mockDraftsUpdate: vi.fn(),
  mockDraftsAdd: vi.fn(),
  mockDraftsDelete: vi.fn(),
  mockSubmissionQueuePut: vi.fn(),
  mockSubmissionQueueAdd: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock('../../../../lib/offline-db', () => ({
  db: {
    drafts: {
      where: (...args: unknown[]) => {
        mockDraftsWhere(...args);
        return { first: mockDraftsFirst };
      },
      update: mockDraftsUpdate,
      add: mockDraftsAdd,
      delete: mockDraftsDelete,
    },
    submissionQueue: {
      // U6 — completeDraft uses put(), which is idempotent: a retry after a failed
      // cleanup must OVERWRITE the queue row rather than collide on its primary key
      // and strand the enumerator in a loop that re-registers a real person.
      // ⛔ `add` is a SEPARATE mock on purpose. Pointing both at one function made
      // the choice between them invisible to every assertion in this file.
      put: mockSubmissionQueuePut,
      add: mockSubmissionQueueAdd,
    },
  },
}));

vi.mock('../../../../features/auth/context/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('uuidv7', () => ({
  uuidv7: () => 'mock-uuid-v7',
}));

import { useDraftPersistence } from '../useDraftPersistence';

describe('useDraftPersistence', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'test-user-A' } });
    mockDraftsFirst.mockResolvedValue(null);
    mockDraftsUpdate.mockResolvedValue(undefined);
    mockDraftsAdd.mockResolvedValue(undefined);
    mockDraftsDelete.mockResolvedValue(undefined);
    mockSubmissionQueuePut.mockResolvedValue(undefined);
    mockSubmissionQueueAdd.mockResolvedValue(undefined);
  });

  it('creates a new draft on first save', async () => {
    const { result } = renderHook(() =>
      useDraftPersistence({
        formId: 'form-1',
        formVersion: '1.0.0',
        formData: { name: 'John' },
        currentIndex: 0,
        enabled: true,
      })
    );

    // Wait for debounce (500ms) to trigger
    await waitFor(
      () => {
        expect(mockDraftsAdd).toHaveBeenCalled();
      },
      { timeout: 1500 }
    );

    expect(result.current.draftId).toBe('mock-uuid-v7');
  });

  it('does not save when disabled (preview mode)', async () => {
    renderHook(() =>
      useDraftPersistence({
        formId: 'form-1',
        formVersion: '1.0.0',
        formData: { name: 'John' },
        currentIndex: 0,
        enabled: false,
      })
    );

    // Wait to ensure nothing happened
    await new Promise((r) => setTimeout(r, 700));

    expect(mockDraftsAdd).not.toHaveBeenCalled();
    expect(mockDraftsUpdate).not.toHaveBeenCalled();
  });

  it('does not create a draft when formData is empty (no user input)', async () => {
    renderHook(() =>
      useDraftPersistence({
        formId: 'form-1',
        formVersion: '1.0.0',
        formData: {},
        currentIndex: 0,
        enabled: true,
      })
    );

    // Wait past debounce
    await new Promise((r) => setTimeout(r, 700));

    expect(mockDraftsAdd).not.toHaveBeenCalled();
  });

  it('resumes from existing draft', async () => {
    mockDraftsFirst.mockResolvedValue({
      id: 'existing-draft-id',
      formId: 'form-1',
      responses: { name: 'Jane', age: 25 },
      questionPosition: 2,
      status: 'in-progress',
    });

    const { result } = renderHook(() =>
      useDraftPersistence({
        formId: 'form-1',
        formVersion: '1.0.0',
        formData: {},
        currentIndex: 0,
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(result.current.resumeData).toEqual({
        formData: { name: 'Jane', age: 25 },
        questionPosition: 2,
        // Review R7 — an ordinary draft is NOT a reopened rejected submission, so
        // `FormFillerPage` still auto-captures on it. This stays a deep equal on
        // purpose: a new field on `resumeData` should have to be acknowledged here.
        restored: false,
      });
    });
  });

  it('completes draft and adds to submission queue', async () => {
    mockDraftsFirst.mockResolvedValue({
      id: 'existing-draft-id',
      formId: 'form-1',
      responses: { name: 'Test' },
      questionPosition: 0,
      status: 'in-progress',
    });

    const { result } = renderHook(() =>
      useDraftPersistence({
        formId: 'form-1',
        formVersion: '1.0.0',
        formData: { name: 'Test', age: 30 },
        currentIndex: 2,
        enabled: true,
      })
    );

    // Wait for draft to load
    await waitFor(() => {
      expect(result.current.resumeData).not.toBeNull();
    });

    await act(async () => {
      await result.current.completeDraft();
    });

    expect(mockDraftsUpdate).toHaveBeenCalledWith('existing-draft-id', {
      status: 'completed',
      updatedAt: expect.any(String),
    });

    expect(mockSubmissionQueuePut).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'existing-draft-id',
        formId: 'form-1',
        status: 'pending',
        payload: expect.objectContaining({
          responses: { name: 'Test', age: 30 },
          formVersion: '1.0.0',
          submittedAt: expect.any(String),
        }),
      })
    );
  });

  it('includes GPS coordinates from GeopointInput object in enriched payload', async () => {
    mockDraftsFirst.mockResolvedValue({
      id: 'draft-gps',
      formId: 'form-1',
      responses: { q1: 'answer' },
      questionPosition: 0,
      status: 'in-progress',
    });

    const { result } = renderHook(() =>
      useDraftPersistence({
        formId: 'form-1',
        formVersion: '2.0.0',
        formData: { q1: 'answer', gps_location: { latitude: 7.3775, longitude: 3.947, accuracy: 15 } },
        currentIndex: 1,
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(result.current.resumeData).not.toBeNull();
    });

    await act(async () => {
      await result.current.completeDraft();
    });

    expect(mockSubmissionQueuePut).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          responses: { q1: 'answer', gps_location: { latitude: 7.3775, longitude: 3.947, accuracy: 15 } },
          formVersion: '2.0.0',
          submittedAt: expect.any(String),
          gpsLatitude: 7.3775,
          gpsLongitude: 3.947,
        }),
      })
    );
  });

  it('includes GPS coordinates from flat keys (backwards compat) in enriched payload', async () => {
    mockDraftsFirst.mockResolvedValue({
      id: 'draft-gps-flat',
      formId: 'form-1',
      responses: { q1: 'answer' },
      questionPosition: 0,
      status: 'in-progress',
    });

    const { result } = renderHook(() =>
      useDraftPersistence({
        formId: 'form-1',
        formVersion: '2.0.0',
        formData: { q1: 'answer', gps_latitude: 7.3775, gps_longitude: 3.947 },
        currentIndex: 1,
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(result.current.resumeData).not.toBeNull();
    });

    await act(async () => {
      await result.current.completeDraft();
    });

    expect(mockSubmissionQueuePut).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          gpsLatitude: 7.3775,
          gpsLongitude: 3.947,
        }),
      })
    );
  });

  it('omits GPS from enriched payload when not present in form data', async () => {
    mockDraftsFirst.mockResolvedValue({
      id: 'draft-no-gps',
      formId: 'form-1',
      responses: { q1: 'answer' },
      questionPosition: 0,
      status: 'in-progress',
    });

    const { result } = renderHook(() =>
      useDraftPersistence({
        formId: 'form-1',
        formVersion: '1.0.0',
        formData: { q1: 'answer' },
        currentIndex: 1,
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(result.current.resumeData).not.toBeNull();
    });

    await act(async () => {
      await result.current.completeDraft();
    });

    const addedItem = mockSubmissionQueuePut.mock.calls[0][0];
    expect(addedItem.payload).not.toHaveProperty('gpsLatitude');
    expect(addedItem.payload).not.toHaveProperty('gpsLongitude');
  });

  // ── Story 13-71 ─────────────────────────────────────────────────────────

  /**
   * Helper: drive `completeDraft` once over the given answers and return the
   * enriched payload the submission queue received.
   */
  async function payloadFor(
    formData: Record<string, unknown>,
    opts: { geopointQuestionName?: string; override?: Record<string, unknown> } = {},
  ) {
    mockDraftsFirst.mockResolvedValue({
      id: 'draft-1371',
      formId: 'form-1',
      responses: formData,
      questionPosition: 0,
      status: 'in-progress',
    });

    const { result } = renderHook(() =>
      useDraftPersistence({
        formId: 'form-1',
        formVersion: '2.0.0',
        formData,
        currentIndex: 1,
        enabled: true,
        geopointQuestionName: opts.geopointQuestionName,
      }),
    );

    await waitFor(() => expect(result.current.resumeData).not.toBeNull());
    await act(async () => {
      await result.current.completeDraft(opts.override);
    });

    return (mockSubmissionQueuePut.mock.calls.at(-1)?.[0] as { payload: Record<string, unknown> }).payload;
  }

  it('13-71 AC5: accuracy reaches the payload — GeopointInput captured it all along', async () => {
    const payload = await payloadFor(
      { q1: 'a', site_location: { latitude: 7.3775, longitude: 3.947, accuracy: 15 } },
      { geopointQuestionName: 'site_location' },
    );
    expect(payload.gpsLatitude).toBe(7.3775);
    expect(payload.gpsLongitude).toBe(3.947);
    // This is the line that used to throw it away.
    expect(payload.gpsAccuracy).toBe(15);
  });

  it('13-71 Task 1.1: reads the SCHEMA question name, not a hardcoded `gps_location`', async () => {
    // ⭐ The question is `site_location`. Before this story the hook read the
    // literal `formData.gps_location`, so this payload would have carried NO
    // coordinates at all — silently, because an absent key and an unanswered
    // question are indistinguishable downstream.
    const payload = await payloadFor(
      { q1: 'a', site_location: { latitude: 9.1, longitude: 4.2, accuracy: 30 } },
      { geopointQuestionName: 'site_location' },
    );
    expect(payload.gpsLatitude).toBe(9.1);
    expect(payload.gpsLongitude).toBe(4.2);
  });

  it('13-71 Task 1.1: finds a geopoint BY SHAPE when no name is supplied (ClerkDataEntryPage)', async () => {
    const payload = await payloadFor({
      q1: 'a',
      anything_at_all: { latitude: 6.5, longitude: 3.3, accuracy: 9 },
    });
    expect(payload.gpsLatitude).toBe(6.5);
    expect(payload.gpsAccuracy).toBe(9);
  });

  it('13-71: the open-time capture is METADATA and is never mistaken for the answer', async () => {
    // `_gpsOpenCapture` holds where the interview STARTED (AC2). If the shape scan
    // picked it up, a form with no answered geopoint would report the open-time
    // position as the submitted one.
    const payload = await payloadFor({ q1: 'a', _gpsOpenCapture: { latitude: 1.1, longitude: 2.2, accuracy: 5 } });
    expect(payload).not.toHaveProperty('gpsLatitude');
    expect(payload).not.toHaveProperty('gpsAccuracy');
  });

  it('13-71 AC4: a derived reason is lifted onto the envelope when there is no position', async () => {
    const payload = await payloadFor({ q1: 'a', _gpsUnavailableReason: 'permission_denied' });
    expect(payload.gpsUnavailableReason).toBe('permission_denied');
    expect(payload).not.toHaveProperty('gpsLatitude');
  });

  it('⛔ 13-71: a position WINS over a stale reason — never both on one row', async () => {
    // Reachable in the field: auto-capture is refused at open (stamping the
    // reason), the enumerator then taps the manual button and succeeds. Counting
    // that against them in the weekly ops read would be simply wrong.
    const payload = await payloadFor(
      {
        q1: 'a',
        site_location: { latitude: 7.1, longitude: 3.1, accuracy: 11 },
        _gpsUnavailableReason: 'permission_denied',
      },
      { geopointQuestionName: 'site_location' },
    );
    expect(payload.gpsLatitude).toBe(7.1);
    expect(payload).not.toHaveProperty('gpsUnavailableReason');
  });

  /**
   * ⛔ REVIEW R8 — THE GUARD WAS ON THE ENVELOPE AND THE COLUMN IS FED FROM THE
   * ANSWERS.
   *
   * The test above ("a position WINS over a stale reason") asserted only that
   * `payload.gpsUnavailableReason` is absent. But `payload.responses` still
   * carried `_gpsUnavailableReason`, the API spreads `responses` straight into
   * `rawData`, and the ingestion worker writes `rawData._gpsUnavailableReason`
   * into the column — so the row landed with a real position AND a reason not to
   * have one, which is the exact state the suppression exists to prevent. The
   * certifying test passed over the hole it was written to close.
   * [[pattern-test-that-passes-over-a-hole]]
   */
  it('⛔ R8: the superseded reason is stripped from the ANSWERS too, not just the envelope', async () => {
    const payload = await payloadFor(
      {
        q1: 'a',
        site_location: { latitude: 7.1, longitude: 3.1, accuracy: 11 },
        _gpsUnavailableReason: 'permission_denied',
      },
      { geopointQuestionName: 'site_location' },
    );

    expect(payload.gpsLatitude).toBe(7.1);
    expect(payload).not.toHaveProperty('gpsUnavailableReason');
    // ⭐ The half that used to leak. `responses` is what becomes `raw_data`.
    expect(payload.responses).not.toHaveProperty('_gpsUnavailableReason');
    // Nothing ELSE was dropped on the way through.
    expect((payload.responses as Record<string, unknown>).q1).toBe('a');
    expect((payload.responses as Record<string, unknown>).site_location).toEqual({
      latitude: 7.1, longitude: 3.1, accuracy: 11,
    });
  });

  it('R8: a reason with NO position is still carried in both places', async () => {
    const payload = await payloadFor({ q1: 'a', _gpsUnavailableReason: 'timeout' });
    expect(payload.gpsUnavailableReason).toBe('timeout');
    // The strip is narrow: it fires only when a position supersedes the reason.
    expect(payload.responses).toHaveProperty('_gpsUnavailableReason');
  });

  it('13-71 AC2: completeDraft(override) submits the passed answers, not a stale closure', async () => {
    // The submit-time refresh mutates the answers microseconds before calling
    // this. Reading `formData` out of the render closure would queue the PREVIOUS
    // render's coordinate and lose the refreshed one with no error.
    const stale = { q1: 'a', site_location: { latitude: 1, longitude: 1, accuracy: 50 } };
    const fresh = { q1: 'a', site_location: { latitude: 7.4001, longitude: 3.9002, accuracy: 8 } };
    const payload = await payloadFor(stale, { geopointQuestionName: 'site_location', override: fresh });

    expect(payload.gpsLatitude).toBe(7.4001);
    expect(payload.gpsAccuracy).toBe(8);
    expect(payload.responses).toEqual(fresh);
  });

  it('13-71: a non-finite accuracy is omitted rather than carried as NaN', async () => {
    const payload = await payloadFor(
      { q1: 'a', site_location: { latitude: 7.1, longitude: 3.1, accuracy: NaN } },
      { geopointQuestionName: 'site_location' },
    );
    expect(payload.gpsLatitude).toBe(7.1);
    expect(payload).not.toHaveProperty('gpsAccuracy');
  });

  /**
   * ⛔ ULTRA REVIEW U6 — THE RETRY THE UI OFFERS HAS TO BE SAFE TO TAKE.
   *
   * R9 gave the escape hatch a retry affordance ("the survey has not been
   * submitted yet") on the assumption that a failed `completeDraft` left nothing
   * behind. `submissionQueue.add` was the FIRST write and the `drafts.update`
   * after it was unguarded — so a rejection there left the queue row COMMITTED
   * while the UI said nothing had been submitted. Every retry then died on a
   * duplicate primary key, the enumerator re-entered the interview, and a real
   * citizen was registered twice.
   */
  it('13-71 U6: uses put(), not add(), so a retry overwrites instead of colliding', async () => {
    await payloadFor({ q1: 'a' });
    expect(mockSubmissionQueuePut).toHaveBeenCalledTimes(1);
    expect(mockSubmissionQueueAdd).not.toHaveBeenCalled();
  });

  it('13-71 U6: a failure to TIDY the draft is not reported as a failure to submit', async () => {
    // Once the submission is queued the interview is safe. Surfacing a cleanup
    // error as a submit error is what sent the enumerator round the loop.
    mockDraftsUpdate.mockRejectedValue(new Error('QuotaExceededError'));

    mockDraftsFirst.mockResolvedValue({
      id: 'draft-u6', formId: 'form-1', responses: { q1: 'a' },
      questionPosition: 0, status: 'in-progress',
    });
    const { result } = renderHook(() =>
      useDraftPersistence({
        formId: 'form-1', formVersion: '2.0.0', formData: { q1: 'a' },
        currentIndex: 1, enabled: true,
      }),
    );
    await waitFor(() => expect(result.current.resumeData).not.toBeNull());

    // Must RESOLVE: the queue write succeeded, which is the part that matters.
    await act(async () => {
      await expect(result.current.completeDraft()).resolves.toBeUndefined();
    });
    expect(mockSubmissionQueuePut).toHaveBeenCalled();
  });

  it('completeDraft() queues submission BEFORE deleting draft (correct order)', async () => {
    const callOrder: string[] = [];
    mockSubmissionQueuePut.mockImplementation(async () => { callOrder.push('queue-add'); });
    mockDraftsDelete.mockImplementation(async () => { callOrder.push('draft-delete'); });

    mockDraftsFirst.mockResolvedValue({
      id: 'existing-draft-id',
      formId: 'form-1',
      responses: { name: 'Test' },
      questionPosition: 0,
      status: 'in-progress',
    });

    const { result } = renderHook(() =>
      useDraftPersistence({
        formId: 'form-1',
        formVersion: '1.0.0',
        formData: { name: 'Test' },
        currentIndex: 0,
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(result.current.resumeData).not.toBeNull();
    });

    await act(async () => {
      await result.current.completeDraft();
    });

    // Verify both called
    expect(mockSubmissionQueuePut).toHaveBeenCalled();
    expect(mockDraftsDelete).toHaveBeenCalledWith('existing-draft-id');
    // Verify order: queue add must happen before draft delete
    expect(callOrder).toEqual(['queue-add', 'draft-delete']);
  });

  it('resetForNewEntry() clears draftId and resumeData', async () => {
    mockDraftsFirst.mockResolvedValue({
      id: 'existing-draft-id',
      formId: 'form-1',
      responses: { name: 'Jane' },
      questionPosition: 2,
      status: 'in-progress',
    });

    const { result } = renderHook(() =>
      useDraftPersistence({
        formId: 'form-1',
        formVersion: '1.0.0',
        formData: {},
        currentIndex: 0,
        enabled: true,
      })
    );

    // Wait for draft to load
    await waitFor(() => {
      expect(result.current.draftId).toBe('existing-draft-id');
      expect(result.current.resumeData).not.toBeNull();
    });

    // Reset
    act(() => {
      result.current.resetForNewEntry();
    });

    expect(result.current.draftId).toBeNull();
    expect(result.current.resumeData).toBeNull();
  });

  // ── prep-11: User isolation tests ──────────────────────────────────────

  it('passes userId in where query (draft isolation)', async () => {
    const { result } = renderHook(() =>
      useDraftPersistence({
        formId: 'form-1',
        formVersion: '1.0.0',
        formData: { name: 'Test' },
        currentIndex: 0,
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockDraftsWhere).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'test-user-A', formId: 'form-1', status: 'in-progress' })
    );
  });

  it('includes userId when creating new draft', async () => {
    renderHook(() =>
      useDraftPersistence({
        formId: 'form-1',
        formVersion: '1.0.0',
        formData: { name: 'John' },
        currentIndex: 0,
        enabled: true,
      })
    );

    await waitFor(
      () => {
        expect(mockDraftsAdd).toHaveBeenCalled();
      },
      { timeout: 1500 }
    );

    expect(mockDraftsAdd).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'test-user-A' })
    );
  });

  it('includes userId when creating queue item via completeDraft', async () => {
    mockDraftsFirst.mockResolvedValue({
      id: 'existing-draft-id',
      formId: 'form-1',
      responses: { name: 'Test' },
      questionPosition: 0,
      status: 'in-progress',
    });

    const { result } = renderHook(() =>
      useDraftPersistence({
        formId: 'form-1',
        formVersion: '1.0.0',
        formData: { name: 'Test' },
        currentIndex: 0,
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(result.current.resumeData).not.toBeNull();
    });

    await act(async () => {
      await result.current.completeDraft();
    });

    expect(mockSubmissionQueuePut).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'test-user-A' })
    );
  });

  it('does not save or load when userId is null', async () => {
    mockUseAuth.mockReturnValue({ user: null });

    renderHook(() =>
      useDraftPersistence({
        formId: 'form-1',
        formVersion: '1.0.0',
        formData: { name: 'John' },
        currentIndex: 0,
        enabled: true,
      })
    );

    // Wait past debounce
    await new Promise((r) => setTimeout(r, 700));

    expect(mockDraftsWhere).not.toHaveBeenCalled();
    expect(mockDraftsAdd).not.toHaveBeenCalled();
  });

  it('completeDraft() creates draft then queues+deletes when no prior draft exists (fast Ctrl+Enter)', async () => {
    mockDraftsFirst.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useDraftPersistence({
        formId: 'form-1',
        formVersion: '1.0.0',
        formData: { name: 'Quick' },
        currentIndex: 0,
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.completeDraft();
    });

    // Draft should be created first
    expect(mockDraftsAdd).toHaveBeenCalled();
    // Then queued
    expect(mockSubmissionQueuePut).toHaveBeenCalled();
    // Then deleted
    expect(mockDraftsDelete).toHaveBeenCalledWith('mock-uuid-v7');
  });
});
