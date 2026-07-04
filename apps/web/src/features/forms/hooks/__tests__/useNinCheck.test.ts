// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Story 13-15: no modulus11Check mock — the hook is FORMAT-ONLY (^\d{11}$);
// the Mod-11 checksum gate is retired (real NINs have no check digit).

// Mock checkNinAvailability API
const mockCheckNinAvailability = vi.hoisted(() => vi.fn());
vi.mock('../../api/nin-check.api', () => ({
  checkNinAvailability: mockCheckNinAvailability,
}));

import { useNinCheck } from '../useNinCheck';

describe('useNinCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { ...window.navigator, onLine: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns initial state: not checking, not duplicate', () => {
    const { result } = renderHook(() => useNinCheck());

    expect(result.current.isChecking).toBe(false);
    expect(result.current.isDuplicate).toBe(false);
    expect(result.current.duplicateInfo).toBeNull();
  });

  it('calls API after 500ms debounce for valid NIN', async () => {
    mockCheckNinAvailability.mockResolvedValue({ available: true });

    const { result } = renderHook(() => useNinCheck());

    act(() => {
      result.current.checkNin('61961438053');
    });

    // Should be checking immediately
    expect(result.current.isChecking).toBe(true);

    // API not called yet (debounced)
    expect(mockCheckNinAvailability).not.toHaveBeenCalled();

    // Advance past debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mockCheckNinAvailability).toHaveBeenCalledWith('61961438053');
    expect(result.current.isChecking).toBe(false);
    expect(result.current.isDuplicate).toBe(false);
  });

  it('sets isDuplicate=true when NIN is found in respondents', async () => {
    mockCheckNinAvailability.mockResolvedValue({
      available: false,
      reason: 'respondent',
      registeredAt: '2026-02-10T14:30:00.000Z',
    });

    const { result } = renderHook(() => useNinCheck());

    act(() => {
      result.current.checkNin('61961438053');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.isDuplicate).toBe(true);
    expect(result.current.duplicateInfo).toEqual({
      reason: 'respondent',
      registeredAt: '2026-02-10T14:30:00.000Z',
    });
  });

  it('sets isDuplicate=true when NIN is found in users (staff)', async () => {
    mockCheckNinAvailability.mockResolvedValue({
      available: false,
      reason: 'staff',
    });

    const { result } = renderHook(() => useNinCheck());

    act(() => {
      result.current.checkNin('61961438053');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.isDuplicate).toBe(true);
    expect(result.current.duplicateInfo).toEqual({
      reason: 'staff',
      registeredAt: undefined,
    });
  });

  it('skips API call when offline', async () => {
    vi.stubGlobal('navigator', { ...window.navigator, onLine: false });

    const { result } = renderHook(() => useNinCheck());

    act(() => {
      result.current.checkNin('61961438053');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mockCheckNinAvailability).not.toHaveBeenCalled();
    expect(result.current.isChecking).toBe(false);
  });

  it('skips API call when NIN format is invalid (not 11 digits)', async () => {
    const { result } = renderHook(() => useNinCheck());

    act(() => {
      result.current.checkNin('12345'); // too short
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mockCheckNinAvailability).not.toHaveBeenCalled();
  });

  it('Story 13-15 — runs the dup-check for a well-formed NIN that fails Mod-11 (AC4)', async () => {
    mockCheckNinAvailability.mockResolvedValue({ available: true });

    const { result } = renderHook(() => useNinCheck());

    act(() => {
      // 12345678901 fails the RETIRED Modulus-11 checksum — the availability
      // check must still fire for any ^\d{11}$ input.
      result.current.checkNin('12345678901');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mockCheckNinAvailability).toHaveBeenCalledWith('12345678901');
  });

  it('clears duplicate state on API error (non-blocking)', async () => {
    mockCheckNinAvailability.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useNinCheck());

    act(() => {
      result.current.checkNin('61961438053');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.isChecking).toBe(false);
    expect(result.current.isDuplicate).toBe(false);
    expect(result.current.duplicateInfo).toBeNull();
  });

  it('reset() clears all state', async () => {
    mockCheckNinAvailability.mockResolvedValue({
      available: false,
      reason: 'respondent',
      registeredAt: '2026-02-10T14:30:00.000Z',
    });

    const { result } = renderHook(() => useNinCheck());

    act(() => {
      result.current.checkNin('61961438053');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.isDuplicate).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.isChecking).toBe(false);
    expect(result.current.isDuplicate).toBe(false);
    expect(result.current.duplicateInfo).toBeNull();
  });

  it('debounces multiple rapid calls (only last fires)', async () => {
    mockCheckNinAvailability.mockResolvedValue({ available: true });

    const { result } = renderHook(() => useNinCheck());

    act(() => {
      result.current.checkNin('11111111111');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    act(() => {
      result.current.checkNin('22222222222');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    act(() => {
      result.current.checkNin('61961438053');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // Only the last call should have fired
    expect(mockCheckNinAvailability).toHaveBeenCalledTimes(1);
    expect(mockCheckNinAvailability).toHaveBeenCalledWith('61961438053');
  });
});
