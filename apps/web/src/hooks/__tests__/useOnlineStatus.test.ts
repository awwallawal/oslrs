// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from '../useOnlineStatus';

describe('useOnlineStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', {
      ...window.navigator,
      onLine: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns isOnline=true when navigator.onLine is true', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);
  });

  it('returns isOnline=false when navigator.onLine is false', () => {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      onLine: false,
    });

    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(false);
  });

  it('updates to false on "offline" event after debounce', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);

    // Simulate going offline
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    // Before debounce: still true
    expect(result.current.isOnline).toBe(true);

    // After debounce (100ms)
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.isOnline).toBe(false);
  });

  it('updates to true on "online" event after debounce', () => {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      onLine: false,
    });

    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(false);

    // Simulate coming back online
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    // After debounce
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.isOnline).toBe(true);
  });

  it('debounces rapid connectivity changes', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);

    // Rapid toggle: offline -> online -> offline within 100ms
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    act(() => {
      vi.advanceTimersByTime(50);
    });

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    act(() => {
      vi.advanceTimersByTime(50);
    });

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    // After debounce settles, should reflect last state
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.isOnline).toBe(false);
  });

  it('cleans up event listeners on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useOnlineStatus());

    expect(addSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('offline', expect.any(Function));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
