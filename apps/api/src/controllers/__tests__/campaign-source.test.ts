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
