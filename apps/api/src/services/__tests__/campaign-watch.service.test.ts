import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.hoisted(() => vi.fn());
vi.mock('../../db/index.js', () => ({
  db: { execute: (...a: unknown[]) => mockExecute(...a) },
}));

import {
  CampaignWatchService,
  BASELINE_AT_AUTHORING,
  PRE_CAMPAIGN_FLAT_COUNT,
} from '../campaign-watch.service.js';

const rows = (r: unknown[]) => ({ rows: r });

beforeEach(() => mockExecute.mockReset());

/** totals, channels, days, lgas — consumed IN ORDER by one Promise.all. */
function stub(totals: Record<string, string>, channels: unknown[] = [], days: unknown[] = [], lgas: unknown[] = []) {
  mockExecute
    .mockResolvedValueOnce(rows([totals]))
    .mockResolvedValueOnce(rows(channels))
    .mockResolvedValueOnce(rows(days))
    .mockResolvedValueOnce(rows(lgas));
}

describe('CampaignWatchService', () => {
  it('computes the lift and the attribution split', async () => {
    stub(
      { baseline: '328', total_now: '364', since_start: '36', attributed: '28' },
      [{ channel: 'Radio', count: '15' }, { channel: null, count: '8' }],
      [{ day: '2026-08-26', registrations: '19', attributed: '14', radio: '7' }],
      [{ lga_id: 'ibadan_north', count: '6' }],
    );
    const s = await CampaignWatchService.getSnapshot();
    expect(s.baseline).toBe(328);
    expect(s.totalNow).toBe(364);
    expect(s.sinceCampaignStart).toBe(36);
    expect(s.attributedCount).toBe(28);
    expect(s.unattributedCount).toBe(8);
    expect(s.attributionCoveragePct).toBe(77.8);
    expect(s.byChannel).toEqual([{ channel: 'Radio', count: 15 }, { channel: null, count: 8 }]);
  });

  /*
   * ⭐ 0% COVERAGE MUST PRINT AS 0, NEVER AS null/unknown.
   * A window with registrations but no attribution is a REAL and alarming reading —
   * collapsing it to "unknown" is [[pattern-numeric-gate-fails-open-on-undefined]],
   * where a guard approves on data it cannot read. null is reserved for the ONE case
   * where the percentage genuinely does not exist: an empty window.
   */
  it('⭐ reports 0% coverage as 0, and null ONLY for an empty window', async () => {
    stub({ baseline: '328', total_now: '338', since_start: '10', attributed: '0' });
    expect((await CampaignWatchService.getSnapshot()).attributionCoveragePct).toBe(0);

    mockExecute.mockReset();
    stub({ baseline: '328', total_now: '328', since_start: '0', attributed: '0' });
    const empty = await CampaignWatchService.getSnapshot();
    expect(empty.attributionCoveragePct).toBeNull();
    expect(empty.unattributedCount).toBe(0);
  });

  /*
   * The baseline is DERIVED from created_at every call, so a backfill or import silently
   * moves it. `baselineDrifted` is the tell — without it every comparison on the page
   * would quietly re-anchor and nobody would know the control had moved.
   */
  it('⭐ flags baseline drift when the register history moves', async () => {
    stub({ baseline: '340', total_now: '400', since_start: '60', attributed: '60' });
    const s = await CampaignWatchService.getSnapshot();
    expect(s.baseline).toBe(340);
    expect(s.baselineAtAuthoring).toBe(BASELINE_AT_AUTHORING);
    expect(s.baselineDrifted).toBe(true);
  });

  it('does not flag drift when the baseline holds', async () => {
    stub({ baseline: String(BASELINE_AT_AUTHORING), total_now: '364', since_start: '36', attributed: '28' });
    expect((await CampaignWatchService.getSnapshot()).baselineDrifted).toBe(false);
  });

  /*
   * ⚠️ 328, not 327. 327 is the FLAT-PERIOD count (2026-08-17 → 21); one person
   * registered on 22 Aug before any spot aired, so the campaign-eve baseline is 328.
   * Pinned because seeding the constant with the memorable number would have raised a
   * false drift alarm on the first run — verified against prod before shipping.
   */
  it('pins the campaign-eve baseline at 328, distinct from the 327 flat-period count', () => {
    expect(BASELINE_AT_AUTHORING).toBe(328);
    expect(PRE_CAMPAIGN_FLAT_COUNT).toBe(327);
    expect(BASELINE_AT_AUTHORING).toBeGreaterThan(PRE_CAMPAIGN_FLAT_COUNT);
  });
});
