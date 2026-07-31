import { describe, it, expect } from 'vitest';
import { buildCampaignSource } from '../registration.controller.js';

/**
 * Story 13-1 (AC3 / AC5.1) — the SCP gate assertion: a wizard draft's `extras.{acquisition,utm}`
 * must surface under `submissions.raw_data.campaign_source` at submit, and the key must be OMITTED
 * (never null-blocking) when nothing was captured (AC3.4 degenerate path).
 */
describe('buildCampaignSource (Story 13-1)', () => {
  it('lifts channel + utm into a campaign_source key', () => {
    const out = buildCampaignSource({
      acquisition: { channel: 'Radio' },
      utm: { source: 'facebook', campaign: 'launch_2026_06' },
    });
    expect(out).toEqual({
      campaign_source: { channel: 'Radio', utm: { source: 'facebook', campaign: 'launch_2026_06' } },
    });
  });

  it('keeps utm with a null channel when only UTM was captured', () => {
    expect(buildCampaignSource({ utm: { source: 'instagram' } })).toEqual({
      campaign_source: { channel: null, utm: { source: 'instagram' } },
    });
  });

  it('OMITS the key entirely when nothing was captured (AC3.4 — never blocks a submit)', () => {
    expect(buildCampaignSource(undefined)).toEqual({});
    expect(buildCampaignSource({})).toEqual({});
    expect(buildCampaignSource({ someOtherExtra: true })).toEqual({});
  });

  it('is spreadable — {} adds no key, populated adds exactly one', () => {
    expect({ a: 1, ...buildCampaignSource(undefined) }).toEqual({ a: 1 });
    expect({ a: 1, ...buildCampaignSource({ acquisition: { channel: 'TV' } }) }).toEqual({
      a: 1,
      campaign_source: { channel: 'TV', utm: {} },
    });
  });
});

/**
 * 2026-07-30 — payload → draft precedence.
 *
 * 13-1 sole-sourced attribution from the wizard draft. That was undeliverable in
 * production: the draft-step cap rejected every autosave past step 5 so `extras`
 * never persisted at all, and even uncapped, the acquisition answer is chosen on
 * the Review step with Submit directly beneath it — anyone submitting inside the
 * 2s autosave debounce lost it. The payload now carries it; the draft is a
 * fallback for clients that predate the field, never the sole source.
 */
describe('buildCampaignSource — payload → draft precedence', () => {
  it('PAYLOAD WINS over a draft that disagrees', () => {
    const out = buildCampaignSource(
      { acquisition: { channel: 'TV' }, utm: { ref: 'stale' } },
      { channel: 'Radio', utm: { ref: 'fresh_fm' } },
    );
    expect(out).toEqual({ campaign_source: { channel: 'Radio', utm: { ref: 'fresh_fm' } } });
  });

  it('works with NO draft at all — the whole point of the fix', () => {
    // The production case: the draft never flushed, so `extras` is undefined.
    expect(buildCampaignSource(undefined, { channel: 'Association / cooperative' })).toEqual({
      campaign_source: { channel: 'Association / cooperative', utm: {} },
    });
  });

  it('falls back to the draft when the payload omits the field (older client)', () => {
    expect(buildCampaignSource({ acquisition: { channel: 'Word of mouth' } }, undefined)).toEqual({
      campaign_source: { channel: 'Word of mouth', utm: {} },
    });
  });

  it('merges per field — payload channel, draft UTM captured on entry', () => {
    // Real shape: UTM captured at wizard entry (draft), channel answered at review
    // (payload). Both must survive.
    expect(buildCampaignSource({ utm: { ref: 'fresh_fm' } }, { channel: 'Radio' })).toEqual({
      campaign_source: { channel: 'Radio', utm: { ref: 'fresh_fm' } },
    });
  });

  it('treats an EMPTY utm object as no UTM (a hollow row would inflate the attributed count)', () => {
    expect(buildCampaignSource({}, { utm: {} })).toEqual({});
    expect(buildCampaignSource({ utm: {} }, undefined)).toEqual({});
  });

  it('still omits the key when neither source captured anything', () => {
    expect(buildCampaignSource(undefined, undefined)).toEqual({});
    expect(buildCampaignSource({}, {})).toEqual({});
  });
});
