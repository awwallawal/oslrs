import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Use vi.hoisted() for mock functions referenced inside vi.mock factory
const {
  mockDraftsWhere,
  mockDraftsFirst,
  mockDraftsUpdate,
  mockDraftsAdd,
  mockSubmissionQueueAdd,
} = vi.hoisted(() => ({
  mockDraftsWhere: vi.fn(),
  mockDraftsFirst: vi.fn(),
  mockDraftsUpdate: vi.fn(),
  mockDraftsAdd: vi.fn(),
  mockSubmissionQueueAdd: vi.fn(),
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
    },
    submissionQueue: {
      add: mockSubmissionQueueAdd,
    },
  },
}));

vi.mock('uuidv7', () => ({
  uuidv7: () => 'mock-uuid-v7',
}));

import { useDraftPersistence } from '../useDraftPersistence';

describe('useDraftPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDraftsFirst.mockResolvedValue(null);
    mockDraftsUpdate.mockResolvedValue(undefined);
    mockDraftsAdd.mockResolvedValue(undefined);
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
});
