/**
 * Story 13-75 AC4/AC5 — the single source of remediation copy.
 * Story 13-76 AC2/AC6/AC7 — the dismissed prompt, the timeout's second cause, and
 * platform-labelled settings steps.
 */
import { describe, it, expect } from 'vitest';
import { gpsUnavailableReasons } from '@oslsr/types';
import { gpsRemediation, type GpsRemediation } from '../gps-remediation';

/** Everything a reader of this entry can see, in one string. */
function allText(copy: GpsRemediation): string {
  return [copy.action, copy.secondary ?? '', ...(copy.platformSteps ?? []).map((s) => `${s.platform}: ${s.step}`)].join(' ');
}

describe('13-75 gpsRemediation', () => {
  it('has copy for EVERY reason in the shared vocabulary — a new reason cannot render blank', () => {
    for (const reason of gpsUnavailableReasons) {
      expect(gpsRemediation(reason).action.length).toBeGreaterThan(0);
    }
  });

  it('position_unavailable names the phone’s Location toggle — the gate nobody is prompted about', () => {
    expect(gpsRemediation('position_unavailable').action).toBe(
      'Your phone’s location may be switched off. Swipe down, tap the Location icon, then tap Capture. If it is already on, step outside or near a window and tap Capture again.',
    );
  });

  it('⛔ AC5 — permission_denied names the site permission AND the OS toggle, on both platforms', () => {
    const copy = gpsRemediation('permission_denied');
    const text = allText(copy);
    expect(copy.action).toMatch(/Allow/);
    // iOS Safari reports code 1 when Location Services is off system-wide; four
    // trial enumerators are on it.
    expect(text).toMatch(/Location Services/);
    // Review M3 — the per-app gate between the site and the phone, on both platforms.
    expect(text).toMatch(/Safari Websites/);
    expect(text).toMatch(/Apps → Chrome → Permissions/);
    expect(text).toMatch(/aA → Website Settings/);
  });

  it('null (no attempt on record) reads as `other`, as the waiver files it', () => {
    expect(gpsRemediation(null)).toEqual(gpsRemediation('other'));
  });

  it('⛔ no copy sends the enumerator "back to the location question" — the action that dismissed the panel', () => {
    for (const reason of gpsUnavailableReasons) {
      expect(allText(gpsRemediation(reason))).not.toMatch(/go back/i);
      expect(allText(gpsRemediation(reason, { promptDismissed: true }))).not.toMatch(/go back/i);
    }
  });
});

describe('13-76 AC2 — a dismissed prompt gets the cheap fix first', () => {
  it('⭐ leads with re-raising the prompt: tap Capture, choose Allow', () => {
    const copy = gpsRemediation('permission_denied', { promptDismissed: true });
    expect(copy.action).toMatch(/tap Capture/i);
    expect(copy.action).toMatch(/choose Allow/i);
  });

  it('⛔ and sends nobody into settings — no Website Settings, no Location Services, no per-platform surgery', () => {
    const text = allText(gpsRemediation('permission_denied', { promptDismissed: true }));
    expect(text).not.toMatch(/Website Settings/);
    expect(text).not.toMatch(/Location Services/);
    expect(text).not.toMatch(/Settings →/);
    expect(gpsRemediation('permission_denied', { promptDismissed: true }).platformSteps).toBeUndefined();
  });

  it('the denied case keeps its settings guidance — there it is the only route', () => {
    const copy = gpsRemediation('permission_denied', { promptDismissed: false });
    expect(copy).toEqual(gpsRemediation('permission_denied'));
    expect(allText(copy)).toMatch(/Website Settings/);
  });

  it('the flag means nothing for any other reason — it cannot swap their copy', () => {
    for (const reason of gpsUnavailableReasons.filter((r) => r !== 'permission_denied')) {
      expect(gpsRemediation(reason, { promptDismissed: true })).toEqual(gpsRemediation(reason));
    }
  });
});

describe('13-76 AC6 — the timeout copy names both causes (13-75 R5)', () => {
  it('⛔ names the Location toggle — a window changes nothing on a phone whose Location is off', () => {
    expect(allText(gpsRemediation('timeout'))).toMatch(/Location icon/);
  });

  it('and still says to move, for the phone whose Location is on', () => {
    expect(allText(gpsRemediation('timeout'))).toMatch(/window/);
  });

  it('⛔ no copy offers a window as the ONLY remedy — every "window" also names the toggle', () => {
    for (const reason of gpsUnavailableReasons) {
      for (const promptDismissed of [false, true]) {
        const text = allText(gpsRemediation(reason, { promptDismissed }));
        if (/window/i.test(text)) expect(text).toMatch(/Location icon/);
      }
    }
  });
});

describe('13-76 AC7 — each platform’s own step, reachable without reading the other’s', () => {
  it('⭐ the denied case carries LABELLED per-platform steps, one per platform', () => {
    const steps = gpsRemediation('permission_denied').platformSteps ?? [];
    expect(steps.map((s) => s.platform)).toEqual(['Android', 'iPhone']);
  });

  it('⛔ the shared lead names no platform — nobody reads iPhone guidance to reach an Android step', () => {
    const { action, secondary } = gpsRemediation('permission_denied');
    expect(`${action} ${secondary ?? ''}`).not.toMatch(/iPhone|Android|aA|Safari|Chrome/);
  });

  it('⛔ each step stays on its own platform — no iPhone path inside the Android line, and vice versa', () => {
    const steps = gpsRemediation('permission_denied').platformSteps ?? [];
    const android = steps.find((s) => s.platform === 'Android')!.step;
    const iphone = steps.find((s) => s.platform === 'iPhone')!.step;
    expect(android).toMatch(/Chrome/);
    expect(android).not.toMatch(/aA|Safari|Location Services/);
    expect(iphone).toMatch(/aA → Website Settings/);
    expect(iphone).toMatch(/Location Services/);
    expect(iphone).not.toMatch(/Chrome|swipe down/i);
  });
});
