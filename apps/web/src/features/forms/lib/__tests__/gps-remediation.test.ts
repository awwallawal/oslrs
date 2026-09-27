/**
 * Story 13-75 AC4/AC5 — the single source of remediation copy.
 */
import { describe, it, expect } from 'vitest';
import { gpsUnavailableReasons } from '@oslsr/types';
import { gpsRemediation } from '../gps-remediation';

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
    expect(copy.action).toMatch(/Allow/);
    // iOS Safari reports code 1 when Location Services is off system-wide; four
    // trial enumerators are on it.
    expect(copy.secondary).toMatch(/Location Services/);
    expect(copy.secondary).toMatch(/Android/);
    // Review M3 — the per-app gate between the site and the phone, on both platforms.
    expect(copy.secondary).toMatch(/Safari Websites/);
    expect(copy.secondary).toMatch(/Apps → Chrome → Permissions/);
    expect(copy.action).toMatch(/aA → Website Settings/);
  });

  it('timeout says to move, not to change a setting', () => {
    expect(gpsRemediation('timeout').action).toBe('Step outside or near a window, then tap Capture again.');
  });

  it('null (no attempt on record) reads as `other`, as the waiver files it', () => {
    expect(gpsRemediation(null)).toEqual(gpsRemediation('other'));
  });

  it('⛔ no copy sends the enumerator "back to the location question" — the action that dismissed the panel', () => {
    for (const reason of gpsUnavailableReasons) {
      const { action, secondary } = gpsRemediation(reason);
      expect(`${action} ${secondary ?? ''}`).not.toMatch(/go back/i);
    }
  });
});
