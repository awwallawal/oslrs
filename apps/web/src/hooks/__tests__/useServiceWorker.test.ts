// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  __capturedCallbacks,
  __mockUpdateSW,
} from '../../__mocks__/virtual-pwa-register';
import { useServiceWorker } from '../useServiceWorker';

describe('useServiceWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with needRefresh=false and offlineReady=false', () => {
    const { result } = renderHook(() => useServiceWorker());
    expect(result.current.needRefresh).toBe(false);
    expect(result.current.offlineReady).toBe(false);
  });

  it('sets needRefresh=true when onNeedRefresh callback fires', () => {
    const { result } = renderHook(() => useServiceWorker());
    act(() => {
      __capturedCallbacks.onNeedRefresh?.();
    });
    expect(result.current.needRefresh).toBe(true);
  });

  it('sets offlineReady=true when onOfflineReady callback fires', () => {
    const { result } = renderHook(() => useServiceWorker());
    act(() => {
      __capturedCallbacks.onOfflineReady?.();
    });
    expect(result.current.offlineReady).toBe(true);
  });

  it('calls registerSW updater with reload=true when updateServiceWorker is called', () => {
    const { result } = renderHook(() => useServiceWorker());
    act(() => {
      result.current.updateServiceWorker();
    });
    expect(__mockUpdateSW).toHaveBeenCalledWith(true);
  });
});
