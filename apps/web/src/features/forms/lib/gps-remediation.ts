/**
 * Story 13-75 AC4/AC5 — what to tell an enumerator whose phone would not give a
 * position, keyed on the reason the browser actually reported.
 *
 * ⛔ ONE SOURCE (Task 3.1). The amber block at submit and the location question
 * both render from this map. Two copies of this text would drift, and the one
 * that drifted would be the one telling an enumerator to fix the wrong thing.
 *
 * ⭐ THE TWO GATES. The browser's "Allow location?" dialog and the phone's own
 * Location/GPS toggle are independent, and only the first ever shows a dialog.
 * An enumerator can tap Allow, watch the dialog vanish, and still get nothing
 * because gate 2 is off. Nothing in the UI mentioned gate 2 before this module.
 *
 * | Gate                     | Enumerator sees | Code → reason            |
 * |--------------------------|-----------------|--------------------------|
 * | Site permission          | a dialog, once  | 1 → `permission_denied`  |
 * | OS Location / GPS toggle | nothing         | 2 → `position_unavailable` |
 * | Neither — no fix yet     | nothing         | 3 → `timeout`            |
 * | No Geolocation API       | nothing         | `unsupported` (caller)   |
 */

import type { GpsUnavailableReason } from '@oslsr/types';

export interface GpsRemediation {
  /** The one thing to do next. */
  action: string;
  /**
   * A second cause worth naming. Only `permission_denied` carries one (AC5): that
   * code is NOT cleanly separable from "phone Location is off" across platforms.
   */
  secondary?: string;
}

const COPY: Record<GpsUnavailableReason, GpsRemediation> = {
  /*
   * Gate 2 — the toggle nobody is ever prompted about.
   *
   * ⚠️ Review L4 — "MAY BE", NOT "IS". AC4's wording stated it as fact, but code 2
   * also comes back with Location ON and no fix yet (iOS reports a transient
   * "location unknown" the same way). The fix is still the toggle first, so the
   * sentence keeps its instruction and drops only the certainty — and, because the
   * toggle may already be ON, says what to do then. Deviation from AC4's letter,
   * RATIFIED with this addition by Awwal 2026-09-27.
   */
  position_unavailable: {
    action:
      'Your phone’s location may be switched off. Swipe down, tap the Location icon, then tap Capture. If it is already on, step outside or near a window and tap Capture again.',
  },
  /*
   * ⛔ AC5 — THIS COPY MUST NOT ASSUME THE SITE IS THE PROBLEM.
   *
   * iOS Safari can report code 1 when Location Services is off SYSTEM-WIDE, and
   * four trial enumerators are on iOS Safari (measured, see
   * `permissionAllowsSilentRefresh`). Telling them only to re-allow a site
   * permission that was never refused sends them to fix the wrong thing. So the
   * OS toggle is named as well, on both platforms.
   *
   * ⛔ Review M3 — AND THE PER-APP GATE BETWEEN THEM. There are three gates, not
   * two: the site, the BROWSER APP, and the phone. iOS `Location Services → Safari
   * Websites = Never` returns code 1 with Location Services ON, and Android has
   * Chrome's own app permission. iOS's per-site control is also a level deeper
   * than "the icon": `aA → Website Settings`. Still written from platform
   * knowledge, not read on a device — residual R2 owns that read.
   */
  permission_denied: {
    action:
      'Location is blocked for this site. Tap the icon next to the web address (on iPhone: aA → Website Settings), set Location to Allow, then tap Capture.',
    secondary:
      'If it is already allowed, the phone may be blocking it. iPhone: Settings → Privacy & Security → Location Services → On, and Safari Websites → While Using the App. Android: swipe down and tap the Location icon, and in Settings → Apps → Chrome → Permissions, set Location to Allow.',
  },
  // Both gates open, no fix yet — the retryable class the field observation hit.
  timeout: {
    action: 'Step outside or near a window, then tap Capture again.',
  },
  unsupported: {
    action: 'This browser cannot give a location, so there is nothing to fix on this phone.',
  },
  other: {
    action: 'Tap Capture to try again.',
  },
};

/** `null` is "no attempt on record" and reads as `other`, as the escape hatch files it. */
export function gpsRemediation(reason: GpsUnavailableReason | null | undefined): GpsRemediation {
  return COPY[reason ?? 'other'] ?? COPY.other;
}
