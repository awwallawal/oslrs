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
  /** The one thing to do next. Names no platform, so every reader starts here. */
  action: string;
  /** A second cause worth naming, when one reason has two real-world causes. */
  secondary?: string;
  /**
   * ⛔ Story 13-76 AC7 (13-75 R6) — settings steps LABELLED by platform, one line
   * each. The old `permission_denied` lead embedded "(on iPhone: aA → Website
   * Settings)" while the Android step sat in the next line, so an Android enumerator
   * read past iOS guidance to reach their own. Labelled lines, not UA sniffing:
   * each reader finds their own label, and no behaviour — and not even the ORDER —
   * depends on a user-agent guess that is wrong often enough to matter (R-c).
   */
  platformSteps?: ReadonlyArray<{ platform: 'Android' | 'iPhone'; step: string }>;
}

/*
 * ⭐ Story 13-76 AC2 — A DISMISSED PROMPT IS NOT A BLOCKED SITE.
 *
 * Code 1 arrives identically for "tapped Block" and "tapped past the dialog", and the
 * stored reason stays `permission_denied` either way (AC1 — a UI decision, not a new
 * vocabulary value). When the Permissions API says the prompt is still unanswered,
 * the fix is the cheap one: ask again and tap Allow. Awwal's Android read went the
 * wrong way round — he dismissed a prompt and was sent to Website Settings.
 *
 * No settings steps here on purpose. If the prompt does not come back, the attempt
 * fails again, the page counts a second dismissal, and the settled copy below takes
 * over (AC4).
 */
const PROMPT_DISMISSED: GpsRemediation = {
  action: 'Location was not allowed. Tap Capture and choose Allow when your phone asks.',
};

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
   * knowledge, not read on a device — 13-75 residual R2 owns that read.
   *
   * 13-76 AC7 — the same steps, regrouped per platform (see `platformSteps`); no
   * gate named above was dropped. Each line is the site gate first, then the
   * app/phone gates "if it is already allowed".
   */
  permission_denied: {
    action: 'Location is blocked for this site. Allow it using the steps for your phone, then tap Capture.',
    platformSteps: [
      {
        platform: 'Android',
        step: 'Tap the icon next to the web address, then Permissions, and set Location to Allow. If it is already allowed: swipe down and tap the Location icon, and in Settings → Apps → Chrome → Permissions, set Location to Allow.',
      },
      {
        platform: 'iPhone',
        step: 'Tap aA → Website Settings and set Location to Allow. If it is already allowed: Settings → Privacy & Security → Location Services → On, and Safari Websites → While Using the App.',
      },
    ],
  },
  /*
   * ⛔ 13-76 AC6 (13-75 R5) — TWO CAUSES, THE TOGGLE FIRST.
   *
   * This said only "step outside or near a window", and it was shown to Awwal's
   * Android with Location OFF, where a window changes nothing. A timeout with the
   * toggle off is indistinguishable from a timeout with a poor sky view, so it gets
   * the same treatment `position_unavailable` got in 13-75 L4: the cheap check
   * first, the move second.
   */
  timeout: {
    action: 'No location yet. Check your phone’s location is on: swipe down and tap the Location icon, then tap Capture again.',
    secondary: 'If it is already on, step outside or near a window and tap Capture again.',
  },
  unsupported: {
    action: 'This browser cannot give a location, so there is nothing to fix on this phone.',
  },
  other: {
    action: 'Tap Capture to try again.',
  },
};

/**
 * `null` is "no attempt on record" and reads as `other`, as the escape hatch files it.
 *
 * `promptDismissed` is the page's call (`classifyBlockFailure` → `dismissed`); it
 * only ever changes the `permission_denied` entry.
 */
export function gpsRemediation(
  reason: GpsUnavailableReason | null | undefined,
  { promptDismissed = false }: { promptDismissed?: boolean } = {},
): GpsRemediation {
  if (reason === 'permission_denied' && promptDismissed) return PROMPT_DISMISSED;
  return COPY[reason ?? 'other'] ?? COPY.other;
}
