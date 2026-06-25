import { describe, it, expect, vi } from 'vitest';
import type { CloudflareDashboardSummary, CloudflareZoneSummary } from '../cloudflare-analytics.js';
import {
  evaluateCfWatch,
  formatCfWatchMessage,
  runCfTrafficWatch,
  CF_WATCH_THRESHOLDS,
  type CfWatchDeps,
} from '../cf-watch.js';

function summary(zoneOver: Partial<CloudflareZoneSummary> = {}, rumPageViews = 500): CloudflareDashboardSummary {
  return {
    rum: { pageViews: rumPageViews, visits: 100, byHost: [], topPages: [], topCountries: [] },
    zone: {
      windowLabel: '7d',
      requests: 3000,
      bytes: 0,
      cachedRequests: 0,
      cacheHitPct: 80,
      threats: 30,
      uniques: 100,
      pageViews: rumPageViews,
      status: [
        { code: 200, count: 900 },
        { code: 404, count: 100 },
      ],
      countries: [],
      byDay: [
        { date: '2026-06-18', requests: 1000, threats: 10 },
        { date: '2026-06-19', requests: 1000, threats: 10 },
        { date: '2026-06-20', requests: 1000, threats: 10 },
      ],
      ...zoneOver,
    },
  };
}

const kinds = (fs: ReturnType<typeof evaluateCfWatch>) => fs.map((f) => f.kind);

describe('evaluateCfWatch (Story 9-52)', () => {
  it('returns [] for a healthy summary', () => {
    expect(evaluateCfWatch(summary())).toEqual([]);
  });

  it('degrades to [] when the summary or zone is null (AC#5)', () => {
    expect(evaluateCfWatch(null)).toEqual([]);
    expect(evaluateCfWatch({ rum: null, zone: null })).toEqual([]);
  });

  describe('requests_spike_low_pageviews', () => {
    const spikeDays = [
      { date: 'd1', requests: 1000, threats: 5 },
      { date: 'd2', requests: 1000, threats: 5 },
      { date: 'd3', requests: 5000, threats: 5 }, // 5× the 1000 baseline
    ];

    it('fires when requests spike ≥ N× baseline AND page-views are below the floor', () => {
      const f = evaluateCfWatch(summary({ byDay: spikeDays }, 10)); // pageViews 10 < 50
      expect(kinds(f)).toContain('requests_spike_low_pageviews');
    });

    it('does NOT fire when page-views are healthy (real virality, not bots)', () => {
      const f = evaluateCfWatch(summary({ byDay: spikeDays }, 500)); // pageViews 500 ≥ floor
      expect(kinds(f)).not.toContain('requests_spike_low_pageviews');
    });

    it('does NOT fire on a tiny baseline (noise guard)', () => {
      const tiny = [
        { date: 'd1', requests: 50, threats: 0 },
        { date: 'd2', requests: 50, threats: 0 },
        { date: 'd3', requests: 500, threats: 0 }, // 10× but baseline 50 < minBaselineRequests
      ];
      expect(kinds(evaluateCfWatch(summary({ byDay: tiny }, 1)))).not.toContain('requests_spike_low_pageviews');
    });

    it('does NOT fire just under the multiplier (boundary)', () => {
      const justUnder = [
        { date: 'd1', requests: 1000, threats: 0 },
        { date: 'd2', requests: 1000, threats: 0 },
        { date: 'd3', requests: 2900, threats: 0 }, // 2.9× < 3×
      ];
      expect(kinds(evaluateCfWatch(summary({ byDay: justUnder }, 1)))).not.toContain('requests_spike_low_pageviews');
    });
  });

  describe('threats_spike', () => {
    it('fires when latest-day threats ≥ threshold', () => {
      const byDay = [
        { date: 'd1', requests: 1000, threats: 10 },
        { date: 'd2', requests: 1000, threats: 10 },
        { date: 'd3', requests: 1000, threats: CF_WATCH_THRESHOLDS.threatsPerDay },
      ];
      expect(kinds(evaluateCfWatch(summary({ byDay })))).toContain('threats_spike');
    });

    it('does NOT fire just under the threshold', () => {
      const byDay = [
        { date: 'd1', requests: 1000, threats: 10 },
        { date: 'd2', requests: 1000, threats: 10 },
        { date: 'd3', requests: 1000, threats: CF_WATCH_THRESHOLDS.threatsPerDay - 1 },
      ];
      expect(kinds(evaluateCfWatch(summary({ byDay })))).not.toContain('threats_spike');
    });

    it('M2: does NOT fall back to the window total when byDay is empty (unit-mismatch guard)', () => {
      // window threats 500 ≥ 150, but that's a 7-day TOTAL, not per-day → must NOT fire.
      expect(kinds(evaluateCfWatch(summary({ byDay: [], threats: 500 })))).not.toContain('threats_spike');
    });

    it('L3: escalates to critical at ≥ 2× the threshold', () => {
      const byDay = [
        { date: 'd1', requests: 1000, threats: 10 },
        { date: 'd2', requests: 1000, threats: 10 },
        { date: 'd3', requests: 1000, threats: CF_WATCH_THRESHOLDS.threatsPerDay * 2 },
      ];
      const f = evaluateCfWatch(summary({ byDay })).find((x) => x.kind === 'threats_spike');
      expect(f?.severity).toBe('critical');
    });
  });

  describe('error_ratio', () => {
    it('fires when 4xx+5xx share ≥ threshold', () => {
      const f = evaluateCfWatch(
        summary({
          status: [
            { code: 200, count: 600 },
            { code: 404, count: 300 },
            { code: 500, count: 100 }, // 400/1000 = 40% ≥ 30%
          ],
        }),
      );
      expect(kinds(f)).toContain('error_ratio');
    });

    it('does NOT fire below the threshold', () => {
      const f = evaluateCfWatch(
        summary({
          status: [
            { code: 200, count: 800 },
            { code: 404, count: 200 }, // 20% < 30%
          ],
        }),
      );
      expect(kinds(f)).not.toContain('error_ratio');
    });

    it('does NOT fire on a tiny status sample', () => {
      const f = evaluateCfWatch(
        summary({
          status: [
            { code: 200, count: 5 },
            { code: 404, count: 5 }, // 50% but only 10 samples < minStatusSamples
          ],
        }),
      );
      expect(kinds(f)).not.toContain('error_ratio');
    });
  });

  it('formatCfWatchMessage composes a labelled message with severity', () => {
    const msg = formatCfWatchMessage({ kind: 'threats_spike', severity: 'critical', detail: 'WAF threats spiked to 300.' });
    expect(msg).toContain('WAF threats spike');
    expect(msg).toContain('CRITICAL');
    expect(msg).toContain('300');
  });
});

describe('runCfTrafficWatch (Story 9-52 — orchestration, AC#3/#4/#5/#6)', () => {
  function makeDeps(over: Partial<CfWatchDeps> = {}): CfWatchDeps {
    return {
      hasToken: () => true,
      fetchSummary: vi.fn(async () => summary()), // healthy → no findings
      winCooldown: vi.fn(async () => true),
      dispatch: vi.fn(async () => true),
      dryRun: false,
      logger: { info: vi.fn(), warn: vi.fn() },
      ...over,
    };
  }

  const threatsSummary = () =>
    summary({
      byDay: [
        { date: 'd1', requests: 1000, threats: 10 },
        { date: 'd2', requests: 1000, threats: 10 },
        { date: 'd3', requests: 1000, threats: 200 },
      ],
    });

  it('AC#5: skips (no fetch/dispatch) when the CF token is absent', async () => {
    const deps = makeDeps({ hasToken: () => false });
    const res = await runCfTrafficWatch(deps);
    expect(res.status).toBe('skipped_no_token');
    expect(deps.fetchSummary).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it('AC#5: degrades (no dispatch) when the fetch throws', async () => {
    const deps = makeDeps({
      fetchSummary: vi.fn(async () => {
        throw new Error('CF 500');
      }),
    });
    const res = await runCfTrafficWatch(deps);
    expect(res.status).toBe('fetch_failed');
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it('AC#3: dispatches a finding when the cooldown slot is won', async () => {
    const deps = makeDeps({ fetchSummary: vi.fn(async () => threatsSummary()) });
    const res = await runCfTrafficWatch(deps);
    expect(res.dispatched).toBe(1);
    expect(deps.dispatch).toHaveBeenCalledTimes(1);
  });

  it('AC#4: suppresses (no dispatch) when the cooldown is active', async () => {
    const deps = makeDeps({
      fetchSummary: vi.fn(async () => threatsSummary()),
      winCooldown: vi.fn(async () => false),
    });
    const res = await runCfTrafficWatch(deps);
    expect(res.suppressed).toBe(1);
    expect(res.dispatched).toBe(0);
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it('AC#6: --dry-run returns findings but dispatches nothing', async () => {
    const deps = makeDeps({ fetchSummary: vi.fn(async () => threatsSummary()), dryRun: true });
    const res = await runCfTrafficWatch(deps);
    expect(res.findings.length).toBe(1);
    expect(res.dispatched).toBe(0);
    expect(deps.dispatch).not.toHaveBeenCalled();
  });
});
