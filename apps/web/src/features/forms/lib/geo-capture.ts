/**
 * Story 13-71 — taking a position, and saying why when you cannot.
 *
 * Extracted into its own module rather than living inside `FormFillerPage`
 * because the branch that matters most here is the one a page test is WORST at
 * reaching: whether `navigator.permissions` exists. A jsdom test mocks it into
 * existence without anyone noticing, and four real trial enumerators are on iOS
 * Safari, which does not have it.
 */

import { geolocationErrorCodeToReason, type GpsUnavailableReason } from '@oslsr/types';

/** What `GeopointInput` has always written under the question name. */
export interface CapturedPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export type CaptureResult =
  | { ok: true; position: CapturedPosition }
  | { ok: false; reason: GpsUnavailableReason };

/**
 * Open-time capture (AC1). Identical to the options `GeopointInput`'s manual
 * button has always used, so an auto-captured value and a tapped one are the
 * same kind of value and not two subtly different ones.
 *
 * `maximumAge: 60000` is what makes repeat opens cheap — the first open of the
 * day is the slow one (risk R-b). Nothing waits on this either way: the first
 * question renders while it is in flight.
 */
export const OPEN_CAPTURE_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 60000,
};

/**
 * Submit-time refresh (AC2). SHORTER deadline than the open-time capture, and
 * deliberately so: this one runs with the enumerator waiting on a "Complete
 * Survey" tap they have already made. A refresh is an improvement to the stored
 * value, never a precondition for submitting — if it does not arrive in five
 * seconds the open-time position stands and the submission proceeds.
 */
export const SUBMIT_REFRESH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 5000,
  maximumAge: 60000,
};

/** Is this value a real captured position, as opposed to an empty answer? */
export function isCapturedPosition(value: unknown): value is CapturedPosition {
  if (!value || typeof value !== 'object') return false;
  const { latitude, longitude } = value as Record<string, unknown>;
  return (
    typeof latitude === 'number' && Number.isFinite(latitude) &&
    typeof longitude === 'number' && Number.isFinite(longitude)
  );
}

/**
 * Take one position, resolving to a REASON rather than rejecting.
 *
 * ⭐ Never rejects. Every caller here treats "could not capture" as an outcome
 * to record, not an exception to handle — that is the whole of AC4. A rejected
 * promise invites a bare `.catch(() => {})` and a bare catch is how "did not
 * tap" and "tapped and was refused" became the same absent value in the first
 * place.
 */
export function capturePosition(
  options: PositionOptions = OPEN_CAPTURE_OPTIONS,
): Promise<CaptureResult> {
  return new Promise((resolve) => {
    // No geolocation at all — the one reason the browser cannot tell us itself,
    // because there is no error object and therefore no error code.
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ ok: false, reason: 'unsupported' });
      return;
    }

    let settled = false;
    const settle = (result: CaptureResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          settle({
            ok: true,
            position: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            },
          }),
        (err: GeolocationPositionError) =>
          settle({ ok: false, reason: geolocationErrorCodeToReason(err?.code) }),
        options,
      );
    } catch {
      // A browser that throws synchronously out of getCurrentPosition (rather
      // than calling the error callback) would otherwise leave this promise
      // pending forever, and the submit awaiting it.
      settle({ ok: false, reason: 'other' });
    }
  });
}

/**
 * ⛔ MAY WE TAKE A SECOND POSITION WITHOUT PROMPTING ANYONE? (AC2, Task 3.3)
 *
 * ⚠️ THIS IS THE MEASURED DEFECT RISK IN THIS STORY, and it is why the function
 * is shaped as "may we" rather than "is permission granted".
 *
 * `navigator.permissions.query({ name: 'geolocation' })` is NOT supported on iOS
 * Safari. Measured from `audit_logs.user_agent` over the 30 days to 2026-09-20,
 * real field accounts only: Safari iOS accounts for 30 events across 4 of the
 * trial enumerators. Gating the refresh on a truthy permissions result would
 * mean AC2 silently never fires for those four — while a jsdom test that mocks
 * `navigator.permissions` stays green, because the condition the branch depends
 * on is never actually met in the test.
 * [[pattern-test-that-passes-over-a-hole]] with a known victim count.
 *
 * So the ABSENCE of the API returns `true`, not `false`: iOS takes the same
 * branch as a granted desktop and we find out by asking for the position, with
 * `SUBMIT_REFRESH_OPTIONS`' short deadline as the bound. That is safe because a
 * refusal there is fast and is simply "no refresh" — the open-time value stands.
 *
 * A browser that DOES support the API and reports `prompt` or `denied` returns
 * `false`, because putting an OS permission dialog in front of someone who has
 * just tapped "Complete Survey" is the thing this most wants to avoid.
 *
 * ⚠️ AND IT IS AVOIDED WHEREVER IT CAN BE DETECTED, WHICH IS NOT EVERYWHERE —
 * stated plainly because the first draft of this comment claimed it was "the one
 * thing this must never do", which the iOS branch directly above cannot honour
 * (adversarial review R10). On iOS Safari there is no Permissions API to ask, so
 * a permission still in the `prompt` state — the enumerator dismissed the
 * open-time dialog rather than answering it — WILL raise that dialog again at
 * submit. The trade is deliberate: the alternative is skipping the refresh for
 * every iOS user, which is the measured 4-enumerator hole this function exists to
 * close. It is bounded by `SUBMIT_REFRESH_OPTIONS`' 5 s deadline and costs at
 * most one prompt, and it is recorded as an open residual rather than left as an
 * absolute claim the code does not keep.
 */
export async function permissionAllowsSilentRefresh(): Promise<boolean> {
  const permissions =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { permissions?: Permissions }).permissions;

  // iOS Safari and anything else without the Permissions API: attempt anyway.
  if (!permissions || typeof permissions.query !== 'function') return true;

  try {
    const status = await permissions.query({ name: 'geolocation' as PermissionName });
    return status.state === 'granted';
  } catch {
    // The API exists but rejects this descriptor (some browsers do not know the
    // 'geolocation' name). Same reasoning as its absence: attempt, do not skip.
    return true;
  }
}
