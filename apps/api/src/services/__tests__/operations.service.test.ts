/**
 * Story 9-19 AC#D2 — OperationsService unit tests.
 *
 * Mocks the data sources (pg pool, email queue stats, child_process) so the
 * snapshot orchestration, recommendation derivation, and 30s cache behaviour
 * are deterministic without a live VPS/DB/Redis.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  OpsSystemHealth,
  OpsTrafficSnapshot,
  OpsResendStatus,
  OpsQueueHealth,
  NotificationUsage,
  NotificationChannelUsage,
} from '@oslsr/types';

/** Minimal meter channel fixture — only `total` drives the quota maths. */
const chan = (total: number): NotificationChannelUsage =>
  ({ total, bounced: 0, complained: 0, byCategory: [] }) as NotificationChannelUsage;

const { mockQuery, mockQueueStats, mockFailedSamples } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueueStats: vi.fn(),
  mockFailedSamples: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  pool: { query: mockQuery },
  db: {},
}));

vi.mock('../../queues/email.queue.js', () => ({
  getEmailQueueStats: mockQueueStats,
  getEmailFailedSamples: mockFailedSamples,
}));

// Story 9-63 (AC3) — keep this unit test hermetic: the meter's read helpers
// touch Redis. Stub them to a deterministic empty-usage shape.
vi.mock('../notification-meter.service.js', () => ({
  NotificationMeter: {
    readUsage: vi.fn().mockResolvedValue({ total: 0, byCategory: [], bounced: 0, complained: 0 }),
  },
}));

// Story 9-50 — getDashboardSnapshot now calls getExpiries(); stub it deterministically so the unit
// test never makes a live RDAP network call (the story mandates: tests never use live RDAP). A plain
// async fn (not vi.fn) survives mockReset:true, and proves the snapshot threads expiries through.
vi.mock('../expiry-monitor.service.js', () => ({
  getExpiries: async () => [
    { name: 'cert:fixture', kind: 'cert', expiresAt: '2099-01-01T00:00:00Z', daysUntilExpiry: 9999, status: 'ok', detail: 'test-fixture' },
  ],
}));

// `pm2 jlist` etc. are unavailable in the test sandbox — force getSystemHealth
// down its graceful-degradation path deterministically. Uses async `exec`
// (callback style) now that getSystemHealth no longer blocks the event loop.
vi.mock('node:child_process', () => ({
  exec: (_cmd: string, _opts: unknown, cb: (err: Error | null, stdout: string) => void) =>
    cb(new Error('exec disabled in tests'), ''),
}));

import {
  OperationsService,
  buildRecommendations,
  getTraffic,
  getQueueHealth,
  getSystemHealth,
} from '../operations.service.js';
import { NotificationMeter } from '../notification-meter.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  OperationsService._clearCache();
  delete process.env.RESEND_API_KEY; // getResendStatus → null without a key
  mockQueueStats.mockResolvedValue({
    waiting: 0,
    active: 0,
    completed: 10,
    failed: 0,
    delayed: 0,
    paused: false,
  });
  mockFailedSamples.mockResolvedValue([]);
  // vitest.base sets mockReset:true → the vi.mock factory's mockResolvedValue is
  // wiped before each test, so re-establish it here (mirrors the queue mocks above).
  vi.mocked(NotificationMeter.readUsage).mockResolvedValue({
    total: 0,
    byCategory: [],
    bounced: 0,
    complained: 0,
  });
});

function trafficRows() {
  // Order matches the Promise.all in getTraffic: resp, drafts, drafts24h, funnel, ml, audit
  return [
    { rows: [{ total: '20', active: '12', pending: '3' }] },
    { rows: [{ total: '100' }] },
    { rows: [{ total: '5' }] },
    { rows: [{ step: 4, drafts: 63 }, { step: 1, drafts: 20 }] },
    { rows: [{ issued: '40', consumed: '30' }] },
    { rows: [{ action: 'auth.login', events: 50 }] },
  ];
}

describe('getSystemHealth — graceful degradation', () => {
  it('returns null when system probes are unavailable', async () => {
    expect(await getSystemHealth()).toBeNull();
  });
});

describe('getTraffic', () => {
  it('shapes the funnel + computes step-4 stall %', async () => {
    const rows = trafficRows();
    mockQuery.mockImplementation(() => Promise.resolve(rows.shift()));
    const traffic = await getTraffic();
    expect(traffic).not.toBeNull();
    expect(traffic!.totalDrafts).toBe(100);
    expect(traffic!.step4StallPct).toBe(63); // 63 / 100
    expect(traffic!.totalRespondents).toBe(20);
    expect(traffic!.magicLinksIssued).toBe(40);
  });

  it('returns null if a query throws', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));
    expect(await getTraffic()).toBeNull();
  });
});

describe('getQueueHealth', () => {
  it('uses email queue stats and skips failed-sample fetch when none failed', async () => {
    const q = await getQueueHealth();
    expect(q).toEqual({
      waiting: 0,
      active: 0,
      completed: 10,
      failed: 0,
      delayed: 0,
      failedSamples: [],
    });
    expect(mockFailedSamples).not.toHaveBeenCalled();
  });

  it('fetches failed samples when failed > 0', async () => {
    mockQueueStats.mockResolvedValue({
      waiting: 1,
      active: 0,
      completed: 5,
      failed: 2,
      delayed: 0,
      paused: false,
    });
    mockFailedSamples.mockResolvedValue([{ id: '1', name: 'email-notification', reason: 'rate-limit' }]);
    const q = await getQueueHealth();
    expect(q!.failed).toBe(2);
    expect(q!.failedSamples).toHaveLength(1);
    expect(mockFailedSamples).toHaveBeenCalledOnce();
  });
});

describe('buildRecommendations — metric → story binding', () => {
  const baseSys: OpsSystemHealth = {
    pm2Uptime: '1d', pm2RestartCount: 0, pm2Memory: '200 MB', pm2CpuPct: 5,
    osUptime: '1d', loadAvg1m: 0.1, loadAvg5m: 0.1, loadAvg15m: 0.1,
    ramUsedMb: 800, ramTotalMb: 2000, ramUsedPct: 40,
    diskUsedGb: 10, diskTotalGb: 50, diskUsedPct: 20,
  };

  it('returns empty array when everything is healthy', () => {
    expect(buildRecommendations({ system: baseSys, traffic: null, resend: null, queue: null, notificationUsage: null })).toEqual([]);
  });

  it('flags Story 9-17 critical-path at red Step-4 stall', () => {
    const traffic = { step4StallPct: 63, totalDrafts: 100 } as OpsTrafficSnapshot;
    const recs = buildRecommendations({ system: null, traffic, resend: null, queue: null, notificationUsage: null });
    const stall = recs.find((r) => r.key === 'step4-stall');
    expect(stall?.severity).toBe('red');
    expect(stall?.text).toContain('9-17');
  });

  it('uses yellow advisory wording at mid Step-4 stall', () => {
    const traffic = { step4StallPct: 35, totalDrafts: 100 } as OpsTrafficSnapshot;
    const stall = buildRecommendations({ system: null, traffic, resend: null, queue: null, notificationUsage: null })
      .find((r) => r.key === 'step4-stall');
    expect(stall?.severity).toBe('yellow');
  });

  /**
   * These four replace a test that asserted `todayCount: 85 -> red`. That test was
   * GREEN for months and was encoding the defect: `resend.todayCount` is filtered out
   * of ONE 100-row API page and cannot exceed 100, so the alarm it drove pinned itself
   * at its own red threshold on every busy day. The quota now comes from the meter.
   */
  const usage = (todayEmail: number, monthEmail: number): NotificationUsage => ({
    date: '2026-08-05',
    month: '2026-08',
    today: { email: chan(todayEmail), sms: chan(0) },
    thisMonth: { email: chan(monthEmail), sms: chan(0) },
  });

  it('reds on MONTHLY quota, read from the meter', () => {
    const rec = buildRecommendations({
      system: null, traffic: null, resend: null, queue: null,
      notificationUsage: usage(10, 46_000), // 92% of 50k
    }).find((r) => r.key === 'resend-usage');
    expect(rec?.severity).toBe('red');
    expect(rec?.text).toContain('46000/50000');
  });

  it('yellows with headroom left, and never recommends a plan we already pay for', () => {
    const rec = buildRecommendations({
      system: null, traffic: null, resend: null, queue: null,
      notificationUsage: usage(10, 37_000), // 74%
    }).find((r) => r.key === 'resend-usage');
    expect(rec?.severity).toBe('yellow');
    // The old text told the operator to "UPGRADE Resend to Pro tier" — which we are
    // already on. An alarm that recommends a purchase already made is noise.
    expect(rec?.text).not.toMatch(/upgrade/i);
  });

  /**
   * ⛔ THE REGRESSION THIS FILE EXISTS FOR. A saturated, truncated page must produce
   * NO quota alarm when real usage is low. If `resend.todayCount` is ever wired back
   * into the alarm, this is the test that fails.
   */
  it('does NOT alarm on a saturated 100-row page when real usage is tiny', () => {
    const resend = { todayCount: 100, truncated: true, bounced: 0, complained: 0 } as OpsResendStatus;
    const recs = buildRecommendations({
      system: null, traffic: null, resend, queue: null,
      notificationUsage: usage(132, 900), // the real 2026-08-05 numbers: 1.8% of quota
    });
    expect(recs.find((r) => r.key === 'resend-usage')).toBeUndefined();
    expect(recs.find((r) => r.key === 'resend-daily-rate')).toBeUndefined();
  });

  it('flags a daily RATE anomaly — a pace that would eat the month', () => {
    const rec = buildRecommendations({
      system: null, traffic: null, resend: null, queue: null,
      notificationUsage: usage(5_200, 6_000), // > 3x the ~1666/day sustainable rate
    }).find((r) => r.key === 'resend-daily-rate');
    expect(rec?.severity).toBe('red');
    expect(rec?.text).toContain('runaway');
  });

  /**
   * Awwal's ladder, 2026-08-05: 500 yellow / 1500 red. Boundaries are pinned because
   * the whole point is firing EARLY enough to triage — a first cut used 1x/3x the
   * sustainable rate (1666/5000) and 5000/day means the month is gone in ten days.
   */
  it.each([
    [499, undefined],
    [500, 'yellow'],
    [1499, 'yellow'],
    [1500, 'red'],
    [4000, 'red'],
  ])('daily volume %i -> %s', (todayEmail, severity) => {
    const rec = buildRecommendations({
      system: null, traffic: null, resend: null, queue: null,
      notificationUsage: usage(todayEmail as number, 1000),
    }).find((r) => r.key === 'resend-daily-rate');
    expect(rec?.severity).toBe(severity);
  });

  it('stays silent when the meter is unavailable — no meter, no false red', () => {
    const resend = { todayCount: 100, truncated: true } as OpsResendStatus;
    const recs = buildRecommendations({ system: null, traffic: null, resend, queue: null, notificationUsage: null });
    expect(recs.find((r) => r.key === 'resend-usage')).toBeUndefined();
  });

  it('flags queue failures', () => {
    const queue = { failed: 7 } as OpsQueueHealth;
    const rec = buildRecommendations({ system: null, traffic: null, resend: null, queue, notificationUsage: null })
      .find((r) => r.key === 'queue-failed');
    expect(rec?.severity).toBe('red');
  });
});

describe('getDashboardSnapshot — orchestration + 30s cache', () => {
  beforeEach(() => {
    const rows = trafficRows();
    mockQuery.mockImplementation(() => Promise.resolve(rows.shift() ?? { rows: [] }));
  });

  it('assembles all sections + recommendations', async () => {
    const snap = await OperationsService.getDashboardSnapshot();
    expect(snap.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(snap.system).toBeNull(); // exec mocked to error → graceful null
    expect(snap.traffic?.step4StallPct).toBe(63);
    expect(snap.queue).not.toBeNull();
    // Story 9-63 (AC3) — meter usage section is gathered (empty shape from the stub).
    expect(snap.notificationUsage).toEqual({
      date: expect.any(String),
      month: expect.any(String),
      today: {
        email: { total: 0, byCategory: [], bounced: 0, complained: 0 },
        sms: { total: 0, byCategory: [], bounced: 0, complained: 0 },
      },
      thisMonth: {
        email: { total: 0, byCategory: [], bounced: 0, complained: 0 },
        sms: { total: 0, byCategory: [], bounced: 0, complained: 0 },
      },
    });
    // step-4 stall 63% → a red recommendation is present
    expect(snap.recommendations.some((r) => r.key === 'step4-stall' && r.severity === 'red')).toBe(true);
    // Story 9-50 (M1) — getExpiries result is threaded onto the snapshot
    expect(snap.expiries?.[0]).toMatchObject({ name: 'cert:fixture', kind: 'cert' });
  });

  it('serves the cached snapshot on a second call within the TTL', async () => {
    const a = await OperationsService.getDashboardSnapshot();
    const b = await OperationsService.getDashboardSnapshot();
    expect(b).toBe(a); // same object reference → cache hit
  });

  it('bypasses the cache when force=true', async () => {
    const a = await OperationsService.getDashboardSnapshot();
    const c = await OperationsService.getDashboardSnapshot({ force: true });
    expect(c).not.toBe(a);
  });
});
