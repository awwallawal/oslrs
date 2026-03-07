import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Reset module-level cache between tests
let cachedFingerprintModule: any;

describe('useDeviceFingerprint', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns null initially before FingerprintJS loads', async () => {
    // Mock FingerprintJS to never resolve
    vi.doMock('@fingerprintjs/fingerprintjs', () => ({
      load: () => new Promise(() => {}),
    }));

    cachedFingerprintModule = await import('../useDeviceFingerprint');
    const { result } = renderHook(() => cachedFingerprintModule.useDeviceFingerprint());

    expect(result.current).toBeNull();
  });

  it('returns visitor ID after FingerprintJS loads', async () => {
    vi.doMock('@fingerprintjs/fingerprintjs', () => ({
      default: {
        load: vi.fn().mockResolvedValue({
          get: vi.fn().mockResolvedValue({ visitorId: 'fp_test_123' }),
        }),
      },
      load: vi.fn().mockResolvedValue({
        get: vi.fn().mockResolvedValue({ visitorId: 'fp_test_123' }),
      }),
    }));

    cachedFingerprintModule = await import('../useDeviceFingerprint');
    const { result } = renderHook(() => cachedFingerprintModule.useDeviceFingerprint());

    await waitFor(() => {
      expect(result.current).toBe('fp_test_123');
    });
  });

  it('returns null gracefully when FingerprintJS fails', async () => {
    vi.doMock('@fingerprintjs/fingerprintjs', () => ({
      default: {
        load: vi.fn().mockRejectedValue(new Error('Blocked by privacy extension')),
      },
      load: vi.fn().mockRejectedValue(new Error('Blocked by privacy extension')),
    }));

    cachedFingerprintModule = await import('../useDeviceFingerprint');
    const { result } = renderHook(() => cachedFingerprintModule.useDeviceFingerprint());

    // Should remain null after error
    await waitFor(() => {
      expect(result.current).toBeNull();
    });
  });
});
