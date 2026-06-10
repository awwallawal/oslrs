/**
 * Unit tests for the pure aggregation helpers in cloudflare-analytics.ts.
 *
 * Network functions (fetchRum/fetchZoneDays) are not exercised here — only the
 * I/O-free summarizers + the no-token degradation of the orchestrator.
 */
import { describe, it, expect } from 'vitest';
import {
  summarizeRum,
  summarizeZone,
  getCloudflareDashboardSummary,
} from '../cloudflare-analytics.js';

describe('summarizeZone — daily-rollup aggregation', () => {
  const days = [
    {
      dimensions: { date: '2026-06-08' },
      uniq: { uniques: 100 },
      sum: {
        requests: 1000,
        bytes: 5_000_000,
        cachedRequests: 200,
        threats: 10,
        pageViews: 400,
        responseStatusMap: [
          { edgeResponseStatus: 200, requests: 800 },
          { edgeResponseStatus: 404, requests: 200 },
        ],
        countryMap: [
          { clientCountryName: 'NG', requests: 600, threats: 2 },
          { clientCountryName: 'US', requests: 400, threats: 8 },
        ],
      },
    },
    {
      dimensions: { date: '2026-06-09' },
      uniq: { uniques: 50 },
      sum: {
        requests: 1000,
        bytes: 5_000_000,
        cachedRequests: 600,
        threats: 0,
        pageViews: 300,
        responseStatusMap: [
          { edgeResponseStatus: 200, requests: 700 },
          { edgeResponseStatus: 500, requests: 300 },
        ],
        countryMap: [
          { clientCountryName: 'NG', requests: 900, threats: 0 },
          { clientCountryName: 'NL', requests: 100, threats: 0 },
        ],
      },
    },
  ];

  it('sums requests, bytes, threats, uniques, pageViews across days', () => {
    const z = summarizeZone(days, 'win')!;
    expect(z.requests).toBe(2000);
    expect(z.bytes).toBe(10_000_000);
    expect(z.threats).toBe(10);
    expect(z.uniques).toBe(150);
    expect(z.pageViews).toBe(700);
    expect(z.windowLabel).toBe('win');
  });

  it('computes cache hit ratio as cachedRequests/requests to 1 decimal', () => {
    const z = summarizeZone(days, 'win')!;
    // (200 + 600) / 2000 = 40%
    expect(z.cacheHitPct).toBe(40);
  });

  it('merges + sorts status map descending, surfacing 5xx', () => {
    const z = summarizeZone(days, 'win')!;
    expect(z.status[0]).toEqual({ code: 200, count: 1500 });
    expect(z.status.find((s) => s.code === 500)).toEqual({ code: 500, count: 300 });
  });

  it('merges + sorts country map descending', () => {
    const z = summarizeZone(days, 'win')!;
    expect(z.countries[0]).toEqual({ country: 'NG', count: 1500 });
    expect(z.countries.map((x) => x.country)).toContain('NL');
  });

  it('preserves per-day series for trend display', () => {
    const z = summarizeZone(days, 'win')!;
    expect(z.byDay).toEqual([
      { date: '2026-06-08', requests: 1000, threats: 10 },
      { date: '2026-06-09', requests: 1000, threats: 0 },
    ]);
  });

  it('returns null on empty input', () => {
    expect(summarizeZone([], 'win')).toBeNull();
    expect(summarizeZone(undefined, 'win')).toBeNull();
  });
});

describe('summarizeRum — page-view mapping', () => {
  it('maps totals, hosts, pages, countries', () => {
    const account = {
      total: [{ count: 630, sum: { visits: 460 } }],
      byHost: [{ count: 580, sum: { visits: 430 }, dimensions: { requestHost: 'oyoskills.com' } }],
      byPath: [{ count: 220, dimensions: { requestHost: 'oyoskills.com', requestPath: '/register' } }],
      byCountry: [{ count: 470, dimensions: { countryName: 'NG' } }],
    };
    const r = summarizeRum(account)!;
    expect(r.pageViews).toBe(630);
    expect(r.visits).toBe(460);
    expect(r.byHost[0]).toEqual({ host: 'oyoskills.com', views: 580, visits: 430 });
    expect(r.topPages[0]).toEqual({ page: 'oyoskills.com/register', views: 220 });
    expect(r.topCountries[0]).toEqual({ country: 'NG', count: 470 });
  });

  it('returns null when account node is null', () => {
    expect(summarizeRum(null)).toBeNull();
  });
});

describe('getCloudflareDashboardSummary — graceful degradation', () => {
  it('returns null when CLOUDFLARE_API_TOKEN is unset (no network call)', async () => {
    const prev = process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_API_TOKEN;
    try {
      await expect(getCloudflareDashboardSummary(7)).resolves.toBeNull();
    } finally {
      if (prev !== undefined) process.env.CLOUDFLARE_API_TOKEN = prev;
    }
  });
});
