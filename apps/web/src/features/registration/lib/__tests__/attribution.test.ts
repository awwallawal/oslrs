import { describe, it, expect } from 'vitest';
import { parseUtm, ACQUISITION_CHANNELS } from '../attribution';

describe('parseUtm (Story 13-1 AC1)', () => {
  it('parses the bounded utm/?ref allow-list', () => {
    const p = new URLSearchParams('utm_source=facebook&utm_medium=cpc&utm_campaign=launch&ref=assoc_tailors');
    expect(parseUtm(p)).toEqual({ source: 'facebook', medium: 'cpc', campaign: 'launch', ref: 'assoc_tailors' });
  });

  it('returns null when no utm/ref params are present (best-effort, AC1.2)', () => {
    expect(parseUtm(new URLSearchParams('step=2&token=abc'))).toBeNull();
  });

  it('captures ONLY the allow-listed keys — arbitrary params are ignored (AC1.4)', () => {
    const p = new URLSearchParams('utm_source=x&evil=DROP&fbclid=123');
    expect(parseUtm(p)).toEqual({ source: 'x' });
  });

  it('caps each value length so a crafted URL cannot bloat the draft', () => {
    const long = 'a'.repeat(500);
    expect(parseUtm(new URLSearchParams(`utm_source=${long}`))!.source!.length).toBe(120);
  });

  it('exposes the single 9-channel list (no per-station picker, AC2.4)', () => {
    expect(ACQUISITION_CHANNELS).toContain('Radio');
    expect(ACQUISITION_CHANNELS).toHaveLength(9);
  });
});
