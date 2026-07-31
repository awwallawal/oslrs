import { describe, it, expect } from 'vitest';
import { parseUtm, ACQUISITION_CHANNELS, toCampaignSourcePayload } from '../attribution';

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

/**
 * 2026-07-30 — `toCampaignSourcePayload`: the draft's `extras` mapped into the
 * SUBMIT body, so attribution no longer depends on the debounced draft having
 * flushed. Mirrors the API's bounded `campaignSource` schema.
 */
describe('toCampaignSourcePayload', () => {
  it('maps a channel answered on the Review step', () => {
    expect(toCampaignSourcePayload({ acquisition: { channel: 'Radio' } })).toEqual({
      channel: 'Radio',
    });
  });

  it('maps UTM captured on entry', () => {
    expect(toCampaignSourcePayload({ utm: { ref: 'fresh_fm' } })).toEqual({
      utm: { ref: 'fresh_fm' },
    });
  });

  it('carries BOTH — the per-station link plus the self-reported channel', () => {
    expect(
      toCampaignSourcePayload({ acquisition: { channel: 'Radio' }, utm: { ref: 'fresh_fm' } }),
    ).toEqual({ channel: 'Radio', utm: { ref: 'fresh_fm' } });
  });

  it('returns undefined when nothing was captured, so the key is omitted from the body', () => {
    expect(toCampaignSourcePayload(undefined)).toBeUndefined();
    expect(toCampaignSourcePayload({})).toBeUndefined();
    // "Prefer not to say" leaves acquisition undefined — that is NOT an answer.
    expect(toCampaignSourcePayload({ acquisition: undefined })).toBeUndefined();
  });

  it('treats an empty utm object as no UTM (never send a hollow payload)', () => {
    expect(toCampaignSourcePayload({ utm: {} })).toBeUndefined();
  });

  it('ignores unrelated keys in the forward-compat extras slot', () => {
    expect(toCampaignSourcePayload({ somethingElse: 1, acquisition: { channel: 'TV' } })).toEqual({
      channel: 'TV',
    });
  });

  /**
   * Adjudication 2026-07-31 — attribution must NEVER block a submit (AC2.2/AC6).
   *
   * `extras` is `z.record(z.unknown())` server-side, so the draft can hold anything;
   * the submit field it feeds is `.strict()` and bounded. A cast here (the original
   * implementation) would forward a non-conforming value and the server would reject
   * the WHOLE registration — measured against the real schema:
   *   5th utm key → campaignSource.utm:unrecognized_keys
   *   >120 chars  → campaignSource.utm.source:too_big
   *   >64 channel → campaignSource.channel:too_big
   *   non-string  → campaignSource.utm.source:invalid_type
   * Dropping a bad value costs one attribution row; sending it costs the registration.
   */
  describe('sanitises hostile/legacy extras so a bad draft cannot 400 the submit', () => {
    it('drops utm keys outside the server allow-list', () => {
      expect(
        toCampaignSourcePayload({ utm: { source: 'radio', content: 'x', term: 'y' } }),
      ).toEqual({ utm: { source: 'radio' } });
    });

    it('clamps an over-long utm value to the server bound (120)', () => {
      const out = toCampaignSourcePayload({ utm: { source: 'x'.repeat(500) } });
      expect(out?.utm?.source).toHaveLength(120);
    });

    it('clamps an over-long channel to the server bound (64)', () => {
      const out = toCampaignSourcePayload({ acquisition: { channel: 'y'.repeat(200) } });
      expect(out?.channel).toHaveLength(64);
    });

    it('drops non-string values instead of forwarding them', () => {
      expect(
        toCampaignSourcePayload({ utm: { source: 42, medium: null, campaign: 'ok' } }),
      ).toEqual({ utm: { campaign: 'ok' } });
      expect(toCampaignSourcePayload({ acquisition: { channel: { nested: true } } })).toBeUndefined();
    });

    it('treats a non-object utm as no UTM rather than throwing', () => {
      expect(toCampaignSourcePayload({ utm: 'not-an-object' })).toBeUndefined();
      expect(toCampaignSourcePayload({ utm: 7 })).toBeUndefined();
    });

    it('drops a utm whose only keys are unrecognised, rather than sending a hollow object', () => {
      expect(toCampaignSourcePayload({ utm: { content: 'x' } })).toBeUndefined();
    });
  });
});
