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
  OPEN_CAPTURE_WATCHDOG_MS,
  isRetryableCaptureFailure,
  SUBMIT_REFRESH_OPTIONS,
  geolocationPermissionState,
  classifyBlockFailure,
  PERMISSION_PROBE_TIMEOUT_MS,
  readPromptDismissals,
  recordPromptDismissal,
  isPromptStateUnreliable,
  notePermissionStateAfterSuccess,
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

/**
 * ⛔ ULTRA REVIEW U3 — THE CASE WHERE THE PLATFORM NEVER ANSWERS.
 *
 * `PositionOptions.timeout` reads like a deadline and is not one: per the W3C
 * spec its clock does not run while the permission prompt is open. A prompt left
 * unanswered — the phone pocketed mid-interview — means neither callback ever
 * fires. Before the watchdog this promise simply never settled, and because the
 * submit path awaits it, the enumerator tapped "Complete Survey" and NOTHING
 * HAPPENED: no completion screen, no error, no escape hatch, answers still only
 * in memory.
 */
describe('13-71 U3 — capturePosition always settles, even when the browser never calls back', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('⛔ a getCurrentPosition that NEVER calls back resolves as `timeout`', async () => {
    // Neither callback is ever invoked — the unanswered-prompt case exactly.
    setNavigatorProp('geolocation', { getCurrentPosition: vi.fn() });

    const pending = capturePosition(SUBMIT_REFRESH_OPTIONS);
    await vi.advanceTimersByTimeAsync(60000);

    await expect(pending).resolves.toEqual({ ok: false, reason: 'timeout' });
  });

  /*
   * ⛔ FIELD DEFECT 2026-09-26 — the watchdog was racing the permission prompt.
   * A real capture reported "I had to click the gps after allowing": the survey's
   * 15 s budget expired while the "Allow location?" dialog was still on screen, so
   * auto-capture settled as `timeout` and never took a position.
   */
  it('a transient failure is RETRYABLE; a settled one is not (field defect 2026-09-26)', () => {
    // ⭐ The half of the fix a page test cannot reach: the caller latches its
    // once-guard on this answer, so getting it wrong retires auto-capture for the
    // whole survey. Both directions, because latching too little is a wasted
    // request and latching too much is a lost position.
    expect(isRetryableCaptureFailure({ ok: false, reason: 'timeout' })).toBe(true);
    expect(isRetryableCaptureFailure({ ok: false, reason: 'position_unavailable' })).toBe(true);
    expect(isRetryableCaptureFailure({ ok: false, reason: 'permission_denied' })).toBe(false);
    expect(isRetryableCaptureFailure({ ok: false, reason: 'unsupported' })).toBe(false);
    expect(
      isRetryableCaptureFailure({ ok: true, position: { latitude: 1, longitude: 2, accuracy: 3 } }),
    ).toBe(false);
  });

  it('⛔ the OPEN-time budget does NOT expire while a permission prompt is unanswered for 15s', async () => {
    let fire: ((p: unknown) => void) | undefined;
    setNavigatorProp('geolocation', {
      getCurrentPosition: vi.fn((ok: (p: unknown) => void) => { fire = ok; }),
    });

    const pending = capturePosition(OPEN_CAPTURE_OPTIONS, OPEN_CAPTURE_WATCHDOG_MS);

    // The enumerator reads the dialog and taps Allow after 15s — longer than the
    // OLD budget (timeout 10s + 5s grace), which is precisely the reported case.
    await vi.advanceTimersByTimeAsync(15_000);
    fire?.({ coords: { latitude: 7.3775, longitude: 3.947, accuracy: 12 } });

    await expect(pending).resolves.toEqual({
      ok: true,
      position: { latitude: 7.3775, longitude: 3.947, accuracy: 12 },
    });
  });

  it('but the OPEN-time budget is still BOUNDED, so an in-flight guard cannot latch forever', async () => {
    setNavigatorProp('geolocation', { getCurrentPosition: vi.fn() });

    const pending = capturePosition(OPEN_CAPTURE_OPTIONS, OPEN_CAPTURE_WATCHDOG_MS);
    await vi.advanceTimersByTimeAsync(OPEN_CAPTURE_WATCHDOG_MS + 1_000);

    await expect(pending).resolves.toEqual({ ok: false, reason: 'timeout' });
  });

  it('and the SUBMIT refresh keeps its TIGHT deadline — an await must never hang', async () => {
    setNavigatorProp('geolocation', { getCurrentPosition: vi.fn() });

    const pending = capturePosition(SUBMIT_REFRESH_OPTIONS);
    // 5s timeout + 5s grace: settled well before the open-time budget would.
    await vi.advanceTimersByTimeAsync(11_000);

    await expect(pending).resolves.toEqual({ ok: false, reason: 'timeout' });
  });

  it('does NOT pre-empt a browser that answers within its own deadline', async () => {
    // The platform reports first and reports BETTER, because it knows why.
    setNavigatorProp('geolocation', {
      getCurrentPosition: (_ok: PositionCallback, onErr: PositionErrorCallback) =>
        setTimeout(() => onErr({ code: 1 } as GeolocationPositionError), 100),
    });

    const pending = capturePosition(SUBMIT_REFRESH_OPTIONS);
    await vi.advanceTimersByTimeAsync(60000);

    // `permission_denied`, not the watchdog's blunter `timeout`.
    await expect(pending).resolves.toEqual({ ok: false, reason: 'permission_denied' });
  });

  it('a late browser callback after the watchdog cannot change the answer', async () => {
    setNavigatorProp('geolocation', {
      getCurrentPosition: (onOk: PositionCallback) =>
        setTimeout(
          () => onOk({ coords: { latitude: 1, longitude: 2, accuracy: 3 } } as GeolocationPosition),
          120000,
        ),
    });

    const pending = capturePosition(SUBMIT_REFRESH_OPTIONS);
    await vi.advanceTimersByTimeAsync(300000);

    // `settle` is idempotent, so the race is safe in both directions.
    await expect(pending).resolves.toEqual({ ok: false, reason: 'timeout' });
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

/*
 * Story 13-76 — a DISMISSED prompt is not a blocked site.
 *
 * Code 1 arrives identically for "the enumerator tapped Block" and "the enumerator
 * tapped past the dialog". Only the Permissions API can tell them apart, and only
 * where it exists — so absence must read as the SETTLED case, never the hopeful one.
 */
describe('13-76 geolocationPermissionState — the probe never throws', () => {
  it.each(['granted', 'denied', 'prompt'] as const)('reports %s as given', async (state) => {
    setNavigatorProp('permissions', { query: async () => ({ state }) });
    await expect(geolocationPermissionState()).resolves.toBe(state);
  });

  it('⛔ no navigator.permissions (iOS Safari) → unknown, NOT prompt', async () => {
    setNavigatorProp('permissions', undefined);
    await expect(geolocationPermissionState()).resolves.toBe('unknown');
  });

  it('a permissions object with no usable query() → unknown', async () => {
    setNavigatorProp('permissions', {});
    await expect(geolocationPermissionState()).resolves.toBe('unknown');
  });

  it('query() that REJECTS → unknown, and the probe itself resolves', async () => {
    setNavigatorProp('permissions', {
      query: async () => {
        throw new TypeError("'geolocation' is not a valid permission name");
      },
    });
    await expect(geolocationPermissionState()).resolves.toBe('unknown');
  });

  it('a state outside the spec vocabulary → unknown', async () => {
    setNavigatorProp('permissions', { query: async () => ({ state: 'something-new' }) });
    await expect(geolocationPermissionState()).resolves.toBe('unknown');
  });
});

describe('13-76 classifyBlockFailure — decided at the call site, from (reason, permission state)', () => {
  it('⭐ code 1 with the prompt still UNANSWERED → dismissed (retryable at the block)', () => {
    expect(classifyBlockFailure('permission_denied', 'prompt', 1)).toBe('dismissed');
  });

  it.each(['denied', 'granted', 'unknown'] as const)(
    '⛔ code 1 with state %s → settled, today’s behaviour',
    (state) => {
      expect(classifyBlockFailure('permission_denied', state, 1)).toBe('settled');
    },
  );

  it('code 1 with no probe answer yet → settled (unknown is never the hopeful case)', () => {
    expect(classifyBlockFailure('permission_denied', null, 0)).toBe('settled');
  });

  it('⛔ AC4 — a SECOND dismissal settles: Chrome hardens repeats into a block and may stop asking', () => {
    expect(classifyBlockFailure('permission_denied', 'prompt', 2)).toBe('settled');
    expect(classifyBlockFailure('permission_denied', 'prompt', 5)).toBe('settled');
  });

  it('timeout / position_unavailable stay retryable whatever the permission says', () => {
    expect(classifyBlockFailure('timeout', 'prompt', 3)).toBe('retryable');
    expect(classifyBlockFailure('position_unavailable', 'denied', 0)).toBe('retryable');
  });

  it('unsupported / other stay settled', () => {
    expect(classifyBlockFailure('unsupported', 'prompt', 1)).toBe('settled');
    expect(classifyBlockFailure('other', 'prompt', 1)).toBe('settled');
  });

  it('⛔ AC8 / R-a — the LATCH predicate is NOT widened: code 1 is still not retryable there', () => {
    // `isRetryableCaptureFailure` drives the open-time latch and AC11's silent retry.
    // A dismissed prompt must change neither; only the block's waiver gate and copy.
    expect(isRetryableCaptureFailure({ ok: false, reason: 'permission_denied' })).toBe(false);
  });
});

describe('13-76 review L2 — the probe is BOUNDED (the page withholds copy until it answers)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a query() that never settles reads unknown after PERMISSION_PROBE_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    setNavigatorProp('permissions', { query: () => new Promise(() => {}) });
    const probe = geolocationPermissionState();
    await vi.advanceTimersByTimeAsync(PERMISSION_PROBE_TIMEOUT_MS);
    await expect(probe).resolves.toBe('unknown');
  });

  it('an answer inside the deadline wins', async () => {
    vi.useFakeTimers();
    setNavigatorProp('permissions', {
      query: () => new Promise((resolve) => setTimeout(() => resolve({ state: 'prompt' }), PERMISSION_PROBE_TIMEOUT_MS / 2)),
    });
    const probe = geolocationPermissionState();
    await vi.advanceTimersByTimeAsync(PERMISSION_PROBE_TIMEOUT_MS);
    await expect(probe).resolves.toBe('prompt');
  });
});

describe('13-76 review L3 — the dismissal count lives for the TAB', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('starts at 0 and counts up, readable by a later survey', () => {
    expect(readPromptDismissals()).toBe(0);
    expect(recordPromptDismissal()).toBe(1);
    expect(recordPromptDismissal()).toBe(2);
    expect(readPromptDismissals()).toBe(2);
  });

  it('garbage in storage reads as 0, never NaN', () => {
    sessionStorage.setItem('oslsr.gps.promptDismissals', 'not-a-number');
    expect(readPromptDismissals()).toBe(0);
  });

  it('⛔ storage that THROWS (private mode, blocked site data) still counts — and never throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const before = readPromptDismissals();
    expect(recordPromptDismissal()).toBe(before + 1);
    expect(readPromptDismissals()).toBe(before + 1);
  });
});

/*
 * Story 13-76 R5 — ruled (a) by Awwal, 2026-09-29. Safari (16+) HAS the Permissions
 * API and is reported to answer `prompt` whatever the user chose. A success while it
 * says `prompt` is the tell; after it, `prompt` reads `unknown` (settled) for the tab.
 * ⚠️ Keep the storage-THROWS test LAST: its module-level fallback outlives the test.
 */
describe('13-76 R5(a) — distrust `prompt` once a success proves it lies', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('a fresh tab takes `prompt` at its word', async () => {
    setNavigatorProp('permissions', { query: async () => ({ state: 'prompt' }) });
    expect(isPromptStateUnreliable()).toBe(false);
    await expect(geolocationPermissionState()).resolves.toBe('prompt');
  });

  it('⭐ a success while the probe reads `prompt` marks the tab — `prompt` then reads unknown', async () => {
    setNavigatorProp('permissions', { query: async () => ({ state: 'prompt' }) });
    await expect(notePermissionStateAfterSuccess()).resolves.toBe(true);
    expect(isPromptStateUnreliable()).toBe(true);
    await expect(geolocationPermissionState()).resolves.toBe('unknown');
  });

  it('⛔ Chrome shape — a success reads `granted`, nothing is marked, and a later `prompt` is still believed', async () => {
    setNavigatorProp('permissions', { query: async () => ({ state: 'granted' }) });
    await expect(notePermissionStateAfterSuccess()).resolves.toBe(false);
    expect(isPromptStateUnreliable()).toBe(false);
    setNavigatorProp('permissions', { query: async () => ({ state: 'prompt' }) });
    await expect(geolocationPermissionState()).resolves.toBe('prompt');
  });

  it('only `prompt` is distrusted — `denied` and `granted` still pass through once marked', async () => {
    setNavigatorProp('permissions', { query: async () => ({ state: 'prompt' }) });
    await notePermissionStateAfterSuccess();
    for (const state of ['denied', 'granted'] as const) {
      setNavigatorProp('permissions', { query: async () => ({ state }) });
      await expect(geolocationPermissionState()).resolves.toBe(state);
    }
  });

  it('an absent API after a success is not a lie — nothing is marked', async () => {
    setNavigatorProp('permissions', undefined);
    await expect(notePermissionStateAfterSuccess()).resolves.toBe(false);
    expect(isPromptStateUnreliable()).toBe(false);
  });

  it('⛔ storage that THROWS still marks the tab, and nothing throws (keep LAST)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    setNavigatorProp('permissions', { query: async () => ({ state: 'prompt' }) });
    await expect(notePermissionStateAfterSuccess()).resolves.toBe(true);
    expect(isPromptStateUnreliable()).toBe(true);
    await expect(geolocationPermissionState()).resolves.toBe('unknown');
  });
});
