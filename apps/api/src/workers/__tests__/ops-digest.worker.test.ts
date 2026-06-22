/**
 * Story 9-19 AC#D4 — ops-digest worker tests.
 *
 * Covers the MarkdownV2 escaper, the digest formatter, and runOpsDigest's
 * send/silent/audit behaviour. Telegram + snapshot + audit are mocked so no
 * network/DB/Redis is touched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpsDashboardSnapshot } from '@oslsr/types';

const { mockGetSnapshot, mockSend, mockGateEnabled, mockLogAction, mockDetect } = vi.hoisted(() => ({
  mockGetSnapshot: vi.fn(),
  mockSend: vi.fn(),
  mockGateEnabled: vi.fn(),
  mockLogAction: vi.fn(),
  mockDetect: vi.fn(),
}));

vi.mock('../../services/operations.service.js', () => ({
  OperationsService: {
    getDashboardSnapshot: mockGetSnapshot,
    // formatDigest references OperationsService.thresholds + .statusLevel
    thresholds: {
      step4StallPctYellow: 30, step4StallPctRed: 50,
      ramUsedPctYellow: 70, ramUsedPctRed: 85,
      resendDailyPctYellow: 50, resendDailyPctRed: 80,
      queueFailedYellow: 1, queueFailedRed: 5,
    },
    statusLevel: (v: number, y: number, r: number) => (v >= r ? 'red' : v >= y ? 'yellow' : 'green'),
  },
}));

vi.mock('../../services/alerting/telegram-channel.js', () => ({
  sendTelegramMessage: mockSend,
  isAlertSendEnabled: mockGateEnabled,
}));

vi.mock('../../services/audit.service.js', () => ({
  AuditService: { logAction: mockLogAction },
  AUDIT_ACTIONS: { OPS_DIGEST_SENT: 'ops.digest_sent' },
}));

vi.mock('../../services/notification-abuse.service.js', () => ({
  NotificationAbuseService: { detect: mockDetect },
}));

import {
  escapeMarkdownV2,
  formatDigest,
  formatNotificationUsageLines,
  formatAbuseLines,
  runOpsDigest,
} from '../ops-digest.worker.js';
import type { NotificationUsage } from '@oslsr/types';

function healthySnapshot(overrides?: Partial<OpsDashboardSnapshot>): OpsDashboardSnapshot {
  return {
    generatedAt: '2026-06-01T08:00:00.000Z',
    system: {
      pm2Uptime: '2d 3h', pm2RestartCount: 0, pm2Memory: '300 MB', pm2CpuPct: 4,
      osUptime: '2d', loadAvg1m: 0.2, loadAvg5m: 0.2, loadAvg15m: 0.2,
      ramUsedMb: 800, ramTotalMb: 2000, ramUsedPct: 40,
      diskUsedGb: 10, diskTotalGb: 50, diskUsedPct: 20,
    },
    traffic: {
      totalRespondents: 20, respondentsActive: 12, respondentsPending: 3,
      totalDrafts: 100, draftsLast24h: 5, funnel: [], step4StallPct: 10,
      magicLinksIssued: 40, magicLinksConsumed: 30, topAuditActions: [],
    },
    resend: { recentCount: 10, delivered: 9, bounced: 0, complained: 0, todayCount: 5, last5: [] },
    queue: { waiting: 0, active: 0, completed: 10, failed: 0, delayed: 0, failedSamples: [] },
    recommendations: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockResolvedValue(true);
  mockGateEnabled.mockReturnValue(true);
  mockDetect.mockResolvedValue([]);
});

function usageFixture(overrides?: Partial<NotificationUsage>): NotificationUsage {
  return {
    date: '2026-06-22',
    month: '2026-06',
    today: {
      email: { total: 42, byCategory: [{ category: 'magiclink-login', count: 30 }, { category: 'pending-nin-reminder', count: 12 }], bounced: 1, complained: 0 },
      sms: { total: 3, byCategory: [{ category: 'magiclink-login', count: 3 }], bounced: 0, complained: 0 },
    },
    thisMonth: {
      email: { total: 900, byCategory: [], bounced: 4, complained: 1 },
      sms: { total: 10, byCategory: [], bounced: 0, complained: 0 },
    },
    ...overrides,
  };
}

describe('escapeMarkdownV2', () => {
  it('escapes all MarkdownV2 reserved characters', () => {
    expect(escapeMarkdownV2('a.b-c!')).toBe('a\\.b\\-c\\!');
    expect(escapeMarkdownV2('(50%)')).toBe('\\(50%\\)');
  });
});

describe('formatDigest', () => {
  it('renders one line per section + healthy recommendation note', () => {
    const msg = formatDigest(healthySnapshot());
    expect(msg).toContain('OSLRS Ops Digest');
    expect(msg).toContain('*System*');
    expect(msg).toContain('*Adoption*');
    expect(msg).toContain('*Email*');
    expect(msg).toContain('*Queue*');
    expect(msg).toContain('All metrics healthy');
  });

  it('renders section-unavailable for null sections', () => {
    const msg = formatDigest(healthySnapshot({ system: null }));
    expect(msg).toContain('*System*: section unavailable');
  });

  it('lists recommendations when present', () => {
    const msg = formatDigest(
      healthySnapshot({
        recommendations: [{ severity: 'red', key: 'step4-stall', text: 'Step-4 stall 63%' }],
      }),
    );
    expect(msg).toContain('Step\\-4 stall 63%'); // escaped hyphen + percent
    expect(msg).not.toContain('All metrics healthy');
  });

  it('never exceeds the Telegram 4096-char limit', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      severity: 'yellow' as const,
      key: `k${i}`,
      text: 'x'.repeat(60),
    }));
    const msg = formatDigest(healthySnapshot({ recommendations: many }));
    expect(msg.length).toBeLessThanOrEqual(4096);
  });
});

describe('runOpsDigest', () => {
  it('sends MarkdownV2, SILENT, and audits when healthy', async () => {
    mockGetSnapshot.mockResolvedValue(healthySnapshot());
    const result = await runOpsDigest();

    expect(mockGetSnapshot).toHaveBeenCalledWith({ force: true });
    expect(mockSend).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ parseMode: 'MarkdownV2', disableNotification: true }),
    );
    expect(result).toEqual({ sent: true, silent: true, recommendationCount: 0, abuseFindingCount: 0 });
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ops.digest_sent', actorId: null }),
    );
  });

  it('sends AUDIBLE (not silent) when recommendations exist', async () => {
    mockGetSnapshot.mockResolvedValue(
      healthySnapshot({ recommendations: [{ severity: 'red', key: 'disk', text: 'Disk 90%' }] }),
    );
    const result = await runOpsDigest();
    expect(mockSend).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ disableNotification: false }),
    );
    expect(result.silent).toBe(false);
    expect(result.recommendationCount).toBe(1);
  });

  it('records sent=false when the Telegram gate is closed', async () => {
    mockGetSnapshot.mockResolvedValue(healthySnapshot());
    mockSend.mockResolvedValue(false);
    mockGateEnabled.mockReturnValue(false);

    const result = await runOpsDigest();
    expect(result.sent).toBe(false);
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ops.digest_sent',
        details: expect.objectContaining({ sent: false, gateEnabled: false }),
      }),
    );
  });

  it('sends AUDIBLE when abuse findings exist even with no recommendations (AC5)', async () => {
    mockGetSnapshot.mockResolvedValue(healthySnapshot());
    mockDetect.mockResolvedValue([
      { key: 'undeliverable-email', text: '3 sends to example.com today' },
    ]);
    const result = await runOpsDigest();
    expect(mockSend).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ disableNotification: false }),
    );
    expect(result.silent).toBe(false);
    expect(result.abuseFindingCount).toBe(1);
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ abuseFindingCount: 1 }),
      }),
    );
  });

  it('still completes when abuse detection throws (fail-open)', async () => {
    mockGetSnapshot.mockResolvedValue(healthySnapshot());
    mockDetect.mockRejectedValue(new Error('redis down'));
    const result = await runOpsDigest();
    expect(result.sent).toBe(true);
    expect(result.abuseFindingCount).toBe(0);
  });
});

describe('formatNotificationUsageLines (AC4)', () => {
  it('renders email + sms totals and top categories', () => {
    const lines = formatNotificationUsageLines(usageFixture()).join('\n');
    expect(lines).toContain('*Notifications*');
    expect(lines).toContain('email 42 sent');
    expect(lines).toContain('sms 3 sent');
    expect(lines).toContain('magiclink\\-login 30'); // escaped hyphen
  });

  it('renders section-unavailable when usage is null', () => {
    expect(formatNotificationUsageLines(null)).toEqual(['⚪ *Notifications*: section unavailable']);
  });

  it('surfaces bounced/complained totals', () => {
    const lines = formatNotificationUsageLines(usageFixture()).join('\n');
    expect(lines).toContain('1 bounced');
  });
});

describe('formatAbuseLines (AC5)', () => {
  it('returns [] with no findings', () => {
    expect(formatAbuseLines([])).toEqual([]);
  });

  it('renders a header + a 🚨 line per finding (escaped)', () => {
    const lines = formatAbuseLines([
      { key: 'daily-ceiling-email', text: 'Email daily volume 600 >= ceiling 500.' },
    ]).join('\n');
    expect(lines).toContain('*Abuse / anomaly alerts*');
    expect(lines).toContain('🚨');
    expect(lines).toContain('600 \\>\\= ceiling 500\\.'); // escaped > = .
  });
});

describe('formatDigest with usage + abuse (AC4/AC5)', () => {
  it('includes the notification usage section', () => {
    const msg = formatDigest(healthySnapshot({ notificationUsage: usageFixture() }));
    expect(msg).toContain('*Notifications*');
    expect(msg).toContain('email 42 sent');
  });

  it('includes abuse findings when supplied', () => {
    const msg = formatDigest(healthySnapshot({ notificationUsage: usageFixture() }), [
      { key: 'recipient-hammer-email', text: 'A single email recipient received 25 sends today.' },
    ]);
    expect(msg).toContain('*Abuse / anomaly alerts*');
    expect(msg).toContain('🚨');
  });
});
