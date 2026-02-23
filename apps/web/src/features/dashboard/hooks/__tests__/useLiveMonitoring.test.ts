// @vitest-environment jsdom
/**
 * useLiveMonitoring Tests
 *
 * Story 5.5 Task 8: Auto-refresh logic for Live Feed preset.
 * Combines page visibility + preset detection + 60s auto-refresh.
 *
 * Tests:
 * - Returns 60000 refetchInterval when Live Feed active and page visible
 * - Returns false interval when different preset active
 * - Returns false interval when page hidden
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockIsVisible } = vi.hoisted(() => ({
  mockIsVisible: { value: true },
}));

vi.mock('../usePageVisibility', () => ({
  usePageVisibility: () => mockIsVisible.value,
}));

import { useLiveMonitoring } from '../useLiveMonitoring';

// ── Helpers ─────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.clearAllMocks();
});

beforeEach(() => {
  mockIsVisible.value = true;
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('useLiveMonitoring', () => {
  it('returns 60000 refetchInterval when Live Feed active and page visible', () => {
    mockIsVisible.value = true;

    const { result } = renderHook(() => useLiveMonitoring('live'));

    expect(result.current.refetchInterval).toBe(60_000);
    expect(result.current.isLiveMode).toBe(true);
  });

  it('returns false interval when different preset active', () => {
    mockIsVisible.value = true;

    const { result } = renderHook(() => useLiveMonitoring('all'));

    expect(result.current.refetchInterval).toBe(false);
    expect(result.current.isLiveMode).toBe(false);
  });

  it('returns false interval when "flagged" preset active', () => {
    mockIsVisible.value = true;

    const { result } = renderHook(() => useLiveMonitoring('flagged'));

    expect(result.current.refetchInterval).toBe(false);
    expect(result.current.isLiveMode).toBe(false);
  });

  it('returns false interval when page hidden', () => {
    mockIsVisible.value = false;

    const { result } = renderHook(() => useLiveMonitoring('live'));

    expect(result.current.refetchInterval).toBe(false);
    // isLiveMode should still be true (preset is 'live'), just not auto-refreshing
    expect(result.current.isLiveMode).toBe(true);
  });

  it('returns false interval when preset is null', () => {
    mockIsVisible.value = true;

    const { result } = renderHook(() => useLiveMonitoring(null));

    expect(result.current.refetchInterval).toBe(false);
    expect(result.current.isLiveMode).toBe(false);
  });

  it('exposes lastUpdated, newCount, and their setters', () => {
    const { result } = renderHook(() => useLiveMonitoring('live'));

    expect(result.current.lastUpdated).toBeInstanceOf(Date);
    expect(result.current.newCount).toBe(0);
    expect(typeof result.current.setLastUpdated).toBe('function');
    expect(typeof result.current.setNewCount).toBe('function');
  });
});
