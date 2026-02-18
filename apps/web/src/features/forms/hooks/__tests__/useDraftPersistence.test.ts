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
  mockSubmissionQueueAdd,
  mockUseAuth,
} = vi.hoisted(() => ({
  mockDraftsWhere: vi.fn(),
  mockDraftsFirst: vi.fn(),
  mockDraftsUpdate: vi.fn(),
  mockDraftsAdd: vi.fn(),
  mockDraftsDelete: vi.fn(),
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

    expect(mockSubmissionQueueAdd).toHaveBeenCalledWith(
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

  it('includes GPS coordinates in enriched payload when present', async () => {
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

    expect(mockSubmissionQueueAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          responses: { q1: 'answer', gps_latitude: 7.3775, gps_longitude: 3.947 },
          formVersion: '2.0.0',
          submittedAt: expect.any(String),
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

    const addedItem = mockSubmissionQueueAdd.mock.calls[0][0];
    expect(addedItem.payload).not.toHaveProperty('gpsLatitude');
    expect(addedItem.payload).not.toHaveProperty('gpsLongitude');
  });

  it('completeDraft() queues submission BEFORE deleting draft (correct order)', async () => {
    const callOrder: string[] = [];
    mockSubmissionQueueAdd.mockImplementation(async () => { callOrder.push('queue-add'); });
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
    expect(mockSubmissionQueueAdd).toHaveBeenCalled();
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

    expect(mockSubmissionQueueAdd).toHaveBeenCalledWith(
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
    expect(mockSubmissionQueueAdd).toHaveBeenCalled();
    // Then deleted
    expect(mockDraftsDelete).toHaveBeenCalledWith('mock-uuid-v7');
  });
});
