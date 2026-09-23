/**
 * Story 13-71 — the capture primitives, and the iOS Safari branch in particular.
 *
 * ⛔ THE POINT OF THIS FILE IS THE `describe` BLOCK THAT DELETES
 * `navigator.permissions`. Task 3.3 gates the submit-time refresh on the
 * Permissions API, which iOS Safari does not implement; measured from
 * `audit_logs.user_agent` over the 30 days to 2026-09-20 (real field accounts
 * only), Safari iOS is 30 events across 4 of the trial enumerators. A test suite
 * that only ever runs with `navigator.permissions` mocked into existence proves
 * the branch it never takes — so both shapes are exercised here, explicitly.
 * A conditional branch is unverified until its condition is met.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  capturePosition,
  permissionAllowsSilentRefresh,
  isCapturedPosition,
  OPEN_CAPTURE_OPTIONS,
  SUBMIT_REFRESH_OPTIONS,
} from '../geo-capture';

const originalGeolocation = navigator.geolocation;
const originalPermissions = (navigator as Navigator & { permissions?: Permissions }).permissions;

function setNavigatorProp(key: 'geolocation' | 'permissions', value: unknown) {
  Object.defineProperty(navigator, key, {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  setNavigatorProp('geolocation', originalGeolocation);
  setNavigatorProp('permissions', originalPermissions);
  vi.restoreAllMocks();
});

describe('isCapturedPosition', () => {
  it('accepts a real capture', () => {
    expect(isCapturedPosition({ latitude: 7.3775, longitude: 3.947, accuracy: 12 })).toBe(true);
  });

  it('rejects the empty answer an untouched capture button leaves behind', () => {
    expect(isCapturedPosition(undefined)).toBe(false);
    expect(isCapturedPosition(null)).toBe(false);
    expect(isCapturedPosition({})).toBe(false);
  });

  it('rejects a half-filled pair — half a capture is not a position', () => {
    expect(isCapturedPosition({ latitude: 7.3775 })).toBe(false);
    expect(isCapturedPosition({ longitude: 3.947 })).toBe(false);
  });

  it('rejects NaN and string coordinates', () => {
    expect(isCapturedPosition({ latitude: NaN, longitude: 3.947 })).toBe(false);
    expect(isCapturedPosition({ latitude: '7.3775', longitude: '3.947' })).toBe(false);
  });
});

describe('capturePosition', () => {
  it('resolves with the position AND its accuracy — accuracy is not dropped here', async () => {
    setNavigatorProp('geolocation', {
      getCurrentPosition: (onOk: PositionCallback) =>
        onOk({ coords: { latitude: 7.3775, longitude: 3.947, accuracy: 8.5 } } as GeolocationPosition),
    });

    const result = await capturePosition();
    expect(result).toEqual({
      ok: true,
      position: { latitude: 7.3775, longitude: 3.947, accuracy: 8.5 },
    });
  });

  it('passes the open-time options through — enableHighAccuracy with the 60s cache (risk R-b)', async () => {
    const getCurrentPosition = vi.fn(
      (onOk: PositionCallback, _onErr?: PositionErrorCallback, _options?: PositionOptions) =>
        onOk({ coords: { latitude: 1, longitude: 2, accuracy: 3 } } as GeolocationPosition),
    );
    setNavigatorProp('geolocation', { getCurrentPosition });

    await capturePosition(OPEN_CAPTURE_OPTIONS);
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    });
  });

  it('the submit refresh uses a SHORTER deadline than the open capture', () => {
    // An enumerator is waiting on a tap they have already made.
    expect(SUBMIT_REFRESH_OPTIONS.timeout).toBeLessThan(OPEN_CAPTURE_OPTIONS.timeout!);
  });

  it.each([
    [1, 'permission_denied'],
    [2, 'position_unavailable'],
    [3, 'timeout'],
  ])('derives the reason from GeolocationPositionError.code %i → %s', async (code, reason) => {
    setNavigatorProp('geolocation', {
      getCurrentPosition: (_ok: PositionCallback, onErr: PositionErrorCallback) =>
        onErr({ code } as GeolocationPositionError),
    });

    // ⭐ The browser knows the true cause. Nobody is asked to diagnose it (AC4).
    await expect(capturePosition()).resolves.toEqual({ ok: false, reason });
  });

  it('an unrecognised error code falls to `other` rather than guessing', async () => {
    setNavigatorProp('geolocation', {
      getCurrentPosition: (_ok: PositionCallback, onErr: PositionErrorCallback) =>
        onErr({ code: 99 } as GeolocationPositionError),
    });
    await expect(capturePosition()).resolves.toEqual({ ok: false, reason: 'other' });
  });

  it('no geolocation API at all is `unsupported` — the one reason the browser cannot report', async () => {
    setNavigatorProp('geolocation', undefined);
    await expect(capturePosition()).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });

  it('a browser that THROWS synchronously settles instead of hanging the submit forever', async () => {
    setNavigatorProp('geolocation', {
      getCurrentPosition: () => {
        throw new Error('SecurityError');
      },
    });
    await expect(capturePosition()).resolves.toEqual({ ok: false, reason: 'other' });
  });

  it('never rejects — a failure is an outcome to record, not an exception to swallow', async () => {
    setNavigatorProp('geolocation', {
      getCurrentPosition: (_ok: PositionCallback, onErr: PositionErrorCallback) =>
        onErr({ code: 1 } as GeolocationPositionError),
    });
    // If this ever rejected, callers would grow a bare `.catch(() => {})` and the
    // reason would be lost — which is the defect this story exists to close.
    const result = await capturePosition().then(
      (r) => r,
      () => 'REJECTED' as const,
    );
    expect(result).not.toBe('REJECTED');
  });
});

describe('permissionAllowsSilentRefresh — Permissions API PRESENT', () => {
  beforeEach(() => {
    setNavigatorProp('geolocation', { getCurrentPosition: vi.fn() });
  });

  it('granted → refresh', async () => {
    setNavigatorProp('permissions', { query: async () => ({ state: 'granted' }) });
    await expect(permissionAllowsSilentRefresh()).resolves.toBe(true);
  });

  it('prompt → NO refresh: never put an OS dialog in front of a completed survey', async () => {
    setNavigatorProp('permissions', { query: async () => ({ state: 'prompt' }) });
    await expect(permissionAllowsSilentRefresh()).resolves.toBe(false);
  });

  it('denied → NO refresh', async () => {
    setNavigatorProp('permissions', { query: async () => ({ state: 'denied' }) });
    await expect(permissionAllowsSilentRefresh()).resolves.toBe(false);
  });

  it('asks about geolocation specifically', async () => {
    const query = vi.fn(async () => ({ state: 'granted' }));
    setNavigatorProp('permissions', { query });
    await permissionAllowsSilentRefresh();
    expect(query).toHaveBeenCalledWith({ name: 'geolocation' });
  });
});

describe('permissionAllowsSilentRefresh — Permissions API ABSENT (iOS Safari)', () => {
  beforeEach(() => {
    setNavigatorProp('geolocation', { getCurrentPosition: vi.fn() });
  });

  it('⛔ no navigator.permissions → ATTEMPT the refresh, do NOT skip it', async () => {
    setNavigatorProp('permissions', undefined);
    // Measured 2026-09-20: 4 of the trial enumerators are on iOS Safari. If this
    // returned false, AC2 would silently never fire for them for the life of the
    // story, and every jsdom test here would still be green.
    await expect(permissionAllowsSilentRefresh()).resolves.toBe(true);
  });

  it('a permissions object with no usable query() → attempt', async () => {
    setNavigatorProp('permissions', {});
    await expect(permissionAllowsSilentRefresh()).resolves.toBe(true);
  });

  it('query() that REJECTS on the geolocation descriptor → attempt', async () => {
    setNavigatorProp('permissions', {
      query: async () => {
        throw new TypeError("'geolocation' is not a valid permission name");
      },
    });
    await expect(permissionAllowsSilentRefresh()).resolves.toBe(true);
  });

  it('and the attempt still honours a real refusal, so "attempt" is not "assume"', async () => {
    setNavigatorProp('permissions', undefined);
    setNavigatorProp('geolocation', {
      getCurrentPosition: (_ok: PositionCallback, onErr: PositionErrorCallback) =>
        onErr({ code: 1 } as GeolocationPositionError),
    });

    expect(await permissionAllowsSilentRefresh()).toBe(true);
    // The refusal arrives here instead of at the permissions gate — fast, and
    // carrying the reason the gate could never have given us.
    await expect(capturePosition(SUBMIT_REFRESH_OPTIONS)).resolves.toEqual({
      ok: false,
      reason: 'permission_denied',
    });
  });
});
