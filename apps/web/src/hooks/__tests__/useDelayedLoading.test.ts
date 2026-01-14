// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useDelayedLoading, MIN_LOADING_DISPLAY_MS } from '../useDelayedLoading';

describe('useDelayedLoading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when isLoading is true', () => {
    const { result } = renderHook(() => useDelayedLoading(true));
    expect(result.current).toBe(true);
  });

  it('returns false when isLoading is false and never was true', () => {
    const { result } = renderHook(() => useDelayedLoading(false));
    expect(result.current).toBe(false);
  });

  it('keeps loading true for minimum time after loading finishes quickly', () => {
    const { result, rerender } = renderHook(
      ({ isLoading }) => useDelayedLoading(isLoading),
      { initialProps: { isLoading: true } }
    );

    expect(result.current).toBe(true);

    // Simulate fast loading (50ms)
    act(() => {
      vi.advanceTimersByTime(50);
    });

    // Loading finishes
    rerender({ isLoading: false });

    // Should still be loading (200ms minimum not reached)
    expect(result.current).toBe(true);

    // Advance remaining time (150ms)
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Now should be false (200ms total elapsed)
    expect(result.current).toBe(false);
  });

  it('immediately hides loading when minimum time already elapsed', () => {
    const { result, rerender } = renderHook(
      ({ isLoading }) => useDelayedLoading(isLoading),
      { initialProps: { isLoading: true } }
    );

    expect(result.current).toBe(true);

    // Simulate slow loading (300ms)
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Loading finishes
    rerender({ isLoading: false });

    // Should immediately be false (300ms > 200ms minimum)
    expect(result.current).toBe(false);
  });

  it('resets timer when loading starts again', () => {
    const { result, rerender } = renderHook(
      ({ isLoading }) => useDelayedLoading(isLoading),
      { initialProps: { isLoading: true } }
    );

    // First loading cycle
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ isLoading: false });

    // Still loading due to minimum time
    expect(result.current).toBe(true);

    // Start loading again before timeout completes
    rerender({ isLoading: true });
    expect(result.current).toBe(true);

    // New loading finishes after another 50ms
    act(() => {
      vi.advanceTimersByTime(50);
    });
    rerender({ isLoading: false });

    // Should still be loading (new cycle started)
    expect(result.current).toBe(true);

    // Wait for new minimum time
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current).toBe(false);
  });

  it(`enforces ${MIN_LOADING_DISPLAY_MS}ms minimum display time`, () => {
    expect(MIN_LOADING_DISPLAY_MS).toBe(200);
  });
});
