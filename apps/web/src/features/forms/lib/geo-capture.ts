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

/**
 * Story 13-71 (ultra review U3) — how long past the browser's own deadline we wait
 * before declaring the platform silent.
 *
 * Generous on purpose: the goal is to bound the wait, never to pre-empt a browser
 * that is about to answer. A real `getCurrentPosition` that honours its `timeout`
 * always reports first and reports better, because it knows WHY.
 */
const WATCHDOG_GRACE_MS = 5000;

/**
 * The OPEN-time watchdog, and it is deliberately far longer than the browser's own
 * deadline (field defect 2026-09-26 — see the note at the timer).
 *
 * ⛔ It must not race a human. This clock starts when the survey opens, and on a
 * first-ever open the "Allow location?" dialog is sitting in front of the
 * enumerator for part of it — `PositionOptions.timeout` does not run during the
 * prompt. Two minutes is longer than anyone takes to read one sentence and tap a
 * button, and nothing waits on this capture, so a generous bound costs nothing.
 *
 * ⚠️ It is still BOUNDED on purpose. An unbounded promise would leave
 * `autoCaptureInFlightRef` latched for the life of the page, which is the retry
 * lockout U9 exists to prevent, arriving from the other direction.
 */
export const OPEN_CAPTURE_WATCHDOG_MS = 120_000;

/**
 * Is this failure worth trying again, or is it a settled fact about the phone?
 *
 * ⛔ FIELD DEFECT 2026-09-26 — the caller used to latch its once-guard on ANY
 * outcome, so a transient miss retired auto-capture for the rest of the survey and
 * the enumerator had to tap the button the briefing says they will not need.
 *
 * ⭐ THE VOCABULARY ALREADY MAKES THE DISTINCTION; nothing was reading it.
 *   • `permission_denied` — the phone has been told no. Asking again changes
 *     nothing until someone edits browser settings, and AC4 exists to record it.
 *   • `unsupported`       — there is no Geolocation API. It will not appear.
 *   • `timeout`           — we did not get one YET. Indoors, mid-prompt, cold GPS.
 *   • `position_unavailable` — the platform could not fix a position THIS time.
 *
 * The last two are the ones a second attempt can win, and treating them as final
 * is how a coverage number comes to describe the software rather than the field.
 *
 * ⚠️ Lives here, beside the vocabulary, rather than inline in the page — a two-line
 * conditional buried in an effect is a decision nothing can test, and this one was
 * wrong once already.
 */
export function isRetryableCaptureFailure(result: CaptureResult): boolean {
  if (result.ok) return false;
  return result.reason === 'timeout' || result.reason === 'position_unavailable';
}

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
  watchdogMs?: number,
): Promise<CaptureResult> {
  return new Promise((resolve) => {
    // No geolocation at all — the one reason the browser cannot tell us itself,
    // because there is no error object and therefore no error code.
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ ok: false, reason: 'unsupported' });
      return;
    }

    let settled = false;
    // A holder rather than a `let`: the watchdog callback closes over `settle`, and
    // `settle` must be able to clear the watchdog, so neither can be declared after
    // the other. A const array breaks the cycle without a forward `let`.
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const settle = (result: CaptureResult) => {
      if (settled) return;
      settled = true;
      for (const timer of timers) clearTimeout(timer);
      resolve(result);
    };

    /*
     * ⛔ ULTRA REVIEW U3 — A WATCHDOG, BECAUSE `PositionOptions.timeout` IS NOT ONE.
     *
     * This promise had no timer of its own. `PositionOptions.timeout` looks like a
     * deadline and is not: per the W3C Geolocation spec it starts only once the
     * user has ANSWERED the permission prompt, and the clock does not run while
     * that dialog is open. A prompt left sitting — the phone put in a pocket
     * mid-interview, the dialog behind another app — means neither callback ever
     * fires, and this promise never settles.
     *
     * ⭐ THAT IS NOT A HANGING PROMISE, IT IS A LOST INTERVIEW. The submit path
     * awaits `refreshPositionForSubmit`, which awaits this. The enumerator taps
     * "Complete Survey" and NOTHING HAPPENS — no completion screen, no error, no
     * escape hatch, and the answers still only in memory.
     *
     * The watchdog is deliberately longer than the browser's own deadline, so a
     * browser that does honour `timeout` still reports its own richer reason
     * (`timeout` vs `permission_denied`) and this only fires when the platform has
     * genuinely gone silent. `settle` was already idempotent, so racing it is safe
     * and a late browser callback after the watchdog is simply ignored.
     */
    /*
     * ⛔ FIELD DEFECT 2026-09-26 — THE WATCHDOG WAS RACING A HUMAN, AND THE HUMAN LOST.
     *
     * Reported from a real prod capture: "I had to click the gps after allowing."
     * Auto-capture (AC1) had not populated, so the enumerator tapped the button the
     * briefing promises they will not need.
     *
     * The cause is this timer meeting U9's once-guard. The budget was
     * `timeout + grace` = 10 s + 5 s, and it starts when the SURVEY OPENS — which
     * includes the time the "Allow location?" dialog sits waiting for an answer,
     * because `PositionOptions.timeout` does not run during the prompt (that is
     * exactly what U3 established). A first-ever open where the enumerator takes
     * more than 15 s to read and tap Allow therefore settled as
     * `{ ok: false, reason: 'timeout' }`, `autoCaptureDoneRef` latched on that
     * settlement, and auto-capture never tried again for that survey.
     *
     * ⭐ TWO CORRECT FIXES COMBINED INTO A DEFECT, which is the thing to notice: U3
     * was right that a never-settling promise loses an interview, and U9 was right
     * that a once-guard must latch on settlement. Neither is wrong alone.
     *
     * ⛔ AND THE WATCHDOG WAS NEVER NEEDED HERE. U3's harm is a HANGING AWAIT: the
     * submit path does `await capturePosition(SUBMIT_REFRESH_OPTIONS)` and a promise
     * that never settles means the enumerator taps "Complete Survey" and nothing
     * happens. The OPEN-time capture is `void capturePosition(...).then(...)` —
     * nothing awaits it, so a late answer is simply a late answer.
     *
     * So the deadline is now PER CALL SITE: tight where an await can hang, and
     * generous where it cannot. Still bounded, so `autoCaptureInFlightRef` can
     * never latch forever — U3's guarantee is kept, it is just not pointed at a
     * person's reaction time.
     */
    const budget = watchdogMs ?? ((options.timeout ?? OPEN_CAPTURE_OPTIONS.timeout ?? 10000) + WATCHDOG_GRACE_MS);
    timers.push(setTimeout(() => settle({ ok: false, reason: 'timeout' }), budget));

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
