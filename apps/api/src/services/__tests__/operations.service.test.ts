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
} from '@oslsr/types';

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
    expect(buildRecommendations({ system: baseSys, traffic: null, resend: null, queue: null })).toEqual([]);
  });

  it('flags Story 9-17 critical-path at red Step-4 stall', () => {
    const traffic = { step4StallPct: 63, totalDrafts: 100 } as OpsTrafficSnapshot;
    const recs = buildRecommendations({ system: null, traffic, resend: null, queue: null });
    const stall = recs.find((r) => r.key === 'step4-stall');
    expect(stall?.severity).toBe('red');
    expect(stall?.text).toContain('9-17');
  });

  it('uses yellow advisory wording at mid Step-4 stall', () => {
    const traffic = { step4StallPct: 35, totalDrafts: 100 } as OpsTrafficSnapshot;
    const stall = buildRecommendations({ system: null, traffic, resend: null, queue: null })
      .find((r) => r.key === 'step4-stall');
    expect(stall?.severity).toBe('yellow');
  });

  it('flags Resend Pro upgrade at red daily usage', () => {
    const resend = { todayCount: 85 } as OpsResendStatus;
    const rec = buildRecommendations({ system: null, traffic: null, resend, queue: null })
      .find((r) => r.key === 'resend-usage');
    expect(rec?.severity).toBe('red');
    expect(rec?.text).toContain('Pro tier');
  });

  it('flags queue failures', () => {
    const queue = { failed: 7 } as OpsQueueHealth;
    const rec = buildRecommendations({ system: null, traffic: null, resend: null, queue })
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
