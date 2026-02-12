// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePersistentStorage } from '../usePersistentStorage';

describe('usePersistentStorage', () => {
  const mockPersist = vi.fn();
  const mockEstimate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('navigator', {
      ...window.navigator,
      storage: {
        persist: mockPersist,
        estimate: mockEstimate,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns isPersisted=true and showWarning=false when storage is granted', async () => {
    mockPersist.mockResolvedValue(true);
    mockEstimate.mockResolvedValue({ usage: 1000, quota: 1000000 });

    const { result } = renderHook(() => usePersistentStorage());

    await waitFor(() => {
      expect(result.current.isPersisted).toBe(true);
    });
    expect(result.current.showWarning).toBe(false);
    expect(result.current.storageQuota).toEqual({ usage: 1000, quota: 1000000 });
    expect(result.current.isSupported).toBe(true);
  });

  it('returns isPersisted=false and showWarning=true when storage is denied', async () => {
    mockPersist.mockResolvedValue(false);
    mockEstimate.mockResolvedValue({ usage: 500, quota: 500000 });

    const { result } = renderHook(() => usePersistentStorage());

    await waitFor(() => {
      expect(result.current.isPersisted).toBe(false);
    });
    expect(result.current.showWarning).toBe(true);
  });

  it('returns isSupported=false when navigator.storage.persist is unavailable', () => {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      storage: undefined,
    });

    const { result } = renderHook(() => usePersistentStorage());
    expect(result.current.isSupported).toBe(false);
    expect(result.current.showWarning).toBe(false);
    expect(result.current.isPersisted).toBeNull();
  });

  it('handles persist() rejection gracefully', async () => {
    mockPersist.mockRejectedValue(new Error('Not allowed'));

    const { result } = renderHook(() => usePersistentStorage());

    await waitFor(() => {
      expect(result.current.isPersisted).toBe(false);
    });
    expect(result.current.showWarning).toBe(true);
  });
});
