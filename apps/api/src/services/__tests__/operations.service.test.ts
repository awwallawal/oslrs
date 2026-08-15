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
  IngestionHealth,
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
    // `live` = owner not yet registered AND draft unexpired. 13-49 made this the only
    // honest stall denominator: most step-4 rows belong to people who already finished.
    { rows: [{ step: 4, drafts: 63, live: 12 }, { step: 1, drafts: 20, live: 8 }] },
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
    // 12 live at step 4 out of 20 live overall = 60%. NOT 63/100: the old denominator
    // counted adopted + expired drafts, so people who had FINISHED were reported as
    // stalled (58 of 88 real step-4 rows on prod, 2026-08-05).
    expect(traffic!.draftsLive).toBe(20);
    expect(traffic!.draftsRetained).toBe(80);
    expect(traffic!.step4LiveDrafts).toBe(12);
    expect(traffic!.step4StallPct).toBe(60);
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

  /**
   * ⭐ STORY 13-57 AC3 — THE COUNT HAS TO MAKE THE PHONE BUZZ.
   *
   * `runOpsDigest` sends SILENTLY when `recommendations.length === 0`. A digest
   * LINE alone would therefore report people missing from the register in
   * exactly the way the operator has been trained to ignore — a monitor that
   * technically reports and practically does not
   * ([[pattern-monitor-measuring-something-else]]). These tests pin that the
   * count produces a RECOMMENDATION, which is what makes the send audible.
   */
  describe('13-57 — unprocessable submissions', () => {
    const ingestion = (overrides?: Partial<IngestionHealth>): IngestionHealth => ({
      dead: 0,
      stuck: 0,
      deduplicated: 0,
      acknowledged: 0,
      stuckAfterMinutes: 60,
      oldestAt: null,
      oldestAgeHours: null,
      ...overrides,
    });

    const recs = (i: IngestionHealth | null) =>
      buildRecommendations({
        system: baseSys,
        traffic: null,
        resend: null,
        queue: null,
        notificationUsage: null,
        ingestion: i,
      });

    it('says nothing when nothing is unprocessable (silent-when-healthy, 13-42 AC4)', () => {
      expect(recs(ingestion())).toEqual([]);
      expect(recs(null)).toEqual([]);
    });

    it('raises a recommendation — not just a line — so the digest is not sent silently', () => {
      const rec = recs(ingestion({ stuck: 2, oldestAgeHours: 3 })).find(
        (r) => r.key === 'unprocessable-submissions',
      );
      expect(rec).toBeDefined();
      expect(rec?.text).toContain('NOT on the register');
      expect(rec?.text).toContain('0 with a recorded reason, 2 with none');
    });

    it('is RED once the oldest has outlived a digest cycle, YELLOW before that', () => {
      expect(
        recs(ingestion({ dead: 1, oldestAgeHours: 11 })).find((r) => r.key === 'unprocessable-submissions')
          ?.severity,
      ).toBe('yellow');
      expect(
        recs(ingestion({ dead: 1, oldestAgeHours: 12 })).find((r) => r.key === 'unprocessable-submissions')
          ?.severity,
      ).toBe('red');
    });

    /**
     * ⭐ CODE REVIEW 2026-08-14 (H1) — THE RECOMMENDATION SAYS "these people are
     * NOT on the register", AND IT HAS TO BE TRUE OF EVERY ROW IT COUNTS.
     *
     * A duplicate-NIN rejection is a terminal row with a reason whose own text
     * reads "already registered on <date> via <source>" — the person IS on the
     * register. Alarming on it under that sentence would state the opposite of
     * the truth about a real citizen: inferring IMPACT from STRUCTURE, the error
     * this story had to retract three separate times, rebuilt into its own
     * monitor. After the jingle these would have been the BULK of the count.
     *
     * ⛔ THIS TEST WOULD PASS OVER A HOLE if it only asserted the count.
     * `deduplicated` is set to a number LARGER than dead+stuck, so a regression
     * that folds it back in cannot hide inside a plausible-looking total.
     */
    it('never alarms on a duplicate-NIN rejection — that person IS on the register', () => {
      expect(recs(ingestion({ deduplicated: 9, oldestAgeHours: 400 }))).toEqual([]);

      const rec = recs(
        ingestion({ dead: 1, deduplicated: 9, oldestAgeHours: 3 }),
      ).find((r) => r.key === 'unprocessable-submissions');
      expect(rec?.text).toContain('1 submission(s)');
      expect(rec?.text).not.toContain('10 submission(s)');
    });

    /**
     * ⭐ CODE REVIEW 2026-08-14 (H2) — THE COUNT MUST BE ABLE TO GO DOWN.
     *
     * Without this the digest had no exit: the two known 2026-08-04 orphans are
     * already ten days old, so the FIRST digest after deploy is red and so is
     * every one after it, whatever the operator does. A red that can never go
     * green stops being read — which is the failure this story exists to end.
     */
    it('goes silent once an operator has acknowledged everything', () => {
      expect(recs(ingestion({ acknowledged: 4, oldestAgeHours: 400 }))).toEqual([]);
    });
  });

  const traffic = (step4StallPct: number, draftsLive: number) =>
    ({ step4StallPct, draftsLive, step4LiveDrafts: Math.round((step4StallPct / 100) * draftsLive), totalDrafts: 300 }) as OpsTrafficSnapshot;

  it('flags Step-4 stall at red, naming the story that ACTUALLY owns it', () => {
    const stall = buildRecommendations({ system: null, traffic: traffic(63, 40), resend: null, queue: null, notificationUsage: null })
      .find((r) => r.key === 'step4-stall');
    expect(stall?.severity).toBe('red');
    // 9-17 went `done` on 2026-06-10 and its Part B moved to 9-18 on 06-03. The digest
    // kept routing operators to the closed story for two months. Pin the live owner.
    expect(stall?.text).toContain('9-18');
    expect(stall?.text).not.toMatch(/9-17 Part B as next-up|while 9-17 is in dev/);
  });

  it('uses yellow advisory wording at mid Step-4 stall', () => {
    const stall = buildRecommendations({ system: null, traffic: traffic(35, 40), resend: null, queue: null, notificationUsage: null })
      .find((r) => r.key === 'step4-stall');
    expect(stall?.severity).toBe('yellow');
  });

  /**
   * A percentage over a handful of drafts is noise. Once retained drafts are excluded
   * the denominator can legitimately fall to single digits, and 2-of-3 would otherwise
   * page someone at 67%.
   */
  it('stays silent when the live denominator is too small to mean anything', () => {
    const recs = buildRecommendations({ system: null, traffic: traffic(67, 3), resend: null, queue: null, notificationUsage: null });
    expect(recs.find((r) => r.key === 'step4-stall')).toBeUndefined();
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
    expect(snap.traffic?.step4StallPct).toBe(60); // live denominator (12/20), not 63/100
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
