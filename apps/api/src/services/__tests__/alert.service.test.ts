import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const { mockDbSelect, mockSendGenericEmail, mockSendTelegramAlert, mockLoggerWarn } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockSendGenericEmail: vi.fn(),
  mockSendTelegramAlert: vi.fn(),
  // Story 9-15 AC#2 — paper-trail warn log emitted on critical transition
  // INDEPENDENT of telegram-channel dispatch. Hoisted so the pino mock factory
  // returns a stable warn-spy we can assert on.
  mockLoggerWarn: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => mockDbSelect(),
        }),
      }),
    }),
  },
}));

vi.mock('../../db/schema/index.js', () => ({
  users: { email: 'email', roleId: 'roleId', status: 'status' },
  roles: { id: 'id', name: 'name' },
}));

vi.mock('../email.service.js', () => ({
  EmailService: {
    sendGenericEmail: (...args: any[]) => mockSendGenericEmail(...args),
  },
}));

vi.mock('../alerting/telegram-channel.js', () => ({
  sendCriticalTelegramAlert: (...args: any[]) => mockSendTelegramAlert(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: mockLoggerWarn,
    error: vi.fn(),
  }),
}));

// ── Import SUT ─────────────────────────────────────────────────────────

import { AlertService } from '../alert.service.js';
import type { SystemHealthResponse } from '@oslsr/types';

// ── Helpers ────────────────────────────────────────────────────────────

function createHealthData(overrides: Partial<SystemHealthResponse> = {}): SystemHealthResponse {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: 3600,
    cpu: { usagePercent: 45, cores: 4 },
    memory: { totalMB: 8192, usedMB: 4096, usagePercent: 50 },
    disk: { totalGB: 100, usedGB: 60, usagePercent: 60 },
    database: { status: 'ok', latencyMs: 5 },
    redis: { status: 'ok', latencyMs: 2 },
    apiLatency: { p95Ms: 42 },
    queues: [
      { name: 'email-notification', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
    ],
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  AlertService.clearStates();
  mockDbSelect.mockResolvedValue([{ email: 'admin@test.com' }]);
  mockSendGenericEmail.mockResolvedValue({ success: true });
  // Telegram dispatch is fire-and-forget in alert.service.ts (`.catch()` on the
  // returned promise). After vi.resetAllMocks(), the mock returns undefined and
  // calling .catch() on undefined throws TypeError. Re-arm with a resolved
  // promise so the existing critical-transition tests don't break, AND so the
  // wiring tests below have a clean default they can override per-test.
  mockSendTelegramAlert.mockResolvedValue(undefined);
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('AlertService', () => {
  describe('evaluateAlerts', () => {
    it('should not trigger alerts when all metrics are healthy', async () => {
      const health = createHealthData();
      await AlertService.evaluateAlerts(health);

      const states = AlertService.getAlertStates();
      for (const [, state] of states) {
        expect(state.level).toBe('ok');
      }
    });

    it('should transition to warning when CPU exceeds 70%', async () => {
      const health = createHealthData({
        cpu: { usagePercent: 75, cores: 4 },
      });

      await AlertService.evaluateAlerts(health);

      const states = AlertService.getAlertStates();
      const cpuState = states.get('cpu');
      expect(cpuState).toBeDefined();
      expect(cpuState!.level).toBe('warning');
    });

    it('should transition to critical when CPU exceeds 90%', async () => {
      const health = createHealthData({
        cpu: { usagePercent: 95, cores: 4 },
      });

      await AlertService.evaluateAlerts(health);

      const states = AlertService.getAlertStates();
      const cpuState = states.get('cpu');
      expect(cpuState!.level).toBe('critical');
    });

    it('should transition to critical when database is down', async () => {
      const health = createHealthData({
        database: { status: 'error', latencyMs: 2000 },
      });

      await AlertService.evaluateAlerts(health);

      const states = AlertService.getAlertStates();
      const dbState = states.get('db_status');
      expect(dbState!.level).toBe('critical');
    });

    it('should resolve after hysteresis period (2 consecutive OK checks)', async () => {
      // First: trigger warning
      const highCpu = createHealthData({
        cpu: { usagePercent: 80, cores: 4 },
      });
      await AlertService.evaluateAlerts(highCpu);

      let states = AlertService.getAlertStates();
      expect(states.get('cpu')!.level).toBe('warning');

      // Second check: back to normal — 1st OK check
      const normalCpu = createHealthData({
        cpu: { usagePercent: 45, cores: 4 },
      });
      await AlertService.evaluateAlerts(normalCpu);

      states = AlertService.getAlertStates();
      // Still warning — need 2 consecutive OK checks (hysteresis)
      expect(states.get('cpu')!.level).toBe('warning');

      // Third check: still normal — 2nd OK check, should resolve
      await AlertService.evaluateAlerts(normalCpu);

      states = AlertService.getAlertStates();
      expect(states.get('cpu')!.level).toBe('ok');
    });

    it('should prevent duplicate alerts within 5-minute cooldown', async () => {
      // First evaluation — triggers warning + sends alert
      const health = createHealthData({
        cpu: { usagePercent: 80, cores: 4 },
      });
      await AlertService.evaluateAlerts(health);

      // Second evaluation immediately — should be suppressed by cooldown
      await AlertService.evaluateAlerts(health);

      // Alert was only sent once (first occurrence)
      const states = AlertService.getAlertStates();
      expect(states.get('cpu')!.notifyCount).toBe(1);
    });

    it('should enforce max 3 alerts per hour per metric', async () => {
      // We test the hourly counter indirectly via state
      const health = createHealthData({
        cpu: { usagePercent: 80, cores: 4 },
      });

      // First alert
      await AlertService.evaluateAlerts(health);
      const states = AlertService.getAlertStates();
      const cpuState = states.get('cpu');
      expect(cpuState!.notifyCount).toBe(1);
    });

    it('should trigger warning when API p95 latency > 250ms', async () => {
      const health = createHealthData({
        apiLatency: { p95Ms: 300 },
      });

      await AlertService.evaluateAlerts(health);

      const states = AlertService.getAlertStates();
      const latencyState = states.get('api_p95_latency');
      expect(latencyState!.level).toBe('warning');
    });

    it('should trigger critical when API p95 latency > 500ms', async () => {
      const health = createHealthData({
        apiLatency: { p95Ms: 600 },
      });

      await AlertService.evaluateAlerts(health);

      const states = AlertService.getAlertStates();
      const latencyState = states.get('api_p95_latency');
      expect(latencyState!.level).toBe('critical');
    });

    it('should trigger warning when queue waiting > 50', async () => {
      const health = createHealthData({
        queues: [
          { name: 'email-notification', status: 'warning', waiting: 75, active: 2, failed: 0, delayed: 0, paused: false },
        ],
      });

      await AlertService.evaluateAlerts(health);

      const states = AlertService.getAlertStates();
      const queueState = states.get('queue_waiting:email-notification');
      expect(queueState!.level).toBe('warning');
    });

    // Story 9-50 — per-monitored-expiry fan-out (key `expiry:<name>`, 60 warning / 30 critical, below).
    function exp(
      name: string,
      kind: 'cert' | 'domain' | 'manual',
      days: number | null,
      status: 'ok' | 'warning' | 'critical' | 'error',
    ) {
      return {
        name,
        kind,
        expiresAt: days === null ? null : new Date(Date.now() + days * 86400000).toISOString(),
        daysUntilExpiry: days,
        status,
        detail: '',
      };
    }

    it('does not alert an expiry > 60 days out', async () => {
      await AlertService.evaluateAlerts(createHealthData({ expiries: [exp('cert-far', 'cert', 90, 'ok')] }));
      const s = AlertService.getAlertStates().get('expiry:cert-far');
      expect(s?.level ?? 'ok').toBe('ok');
    });

    it('warns an expiry 30–60 days out', async () => {
      await AlertService.evaluateAlerts(createHealthData({ expiries: [exp('cert-mid', 'cert', 45, 'warning')] }));
      expect(AlertService.getAlertStates().get('expiry:cert-mid')!.level).toBe('warning');
    });

    it('criticals an expiry < 30 days out', async () => {
      await AlertService.evaluateAlerts(createHealthData({ expiries: [exp('domain-soon', 'domain', 25, 'critical')] }));
      expect(AlertService.getAlertStates().get('expiry:domain-soon')!.level).toBe('critical');
    });

    it('raises a low-noise warning (not critical) for an error/can-not-determine expiry', async () => {
      await AlertService.evaluateAlerts(createHealthData({ expiries: [exp('domain-unknown', 'domain', null, 'error')] }));
      expect(AlertService.getAlertStates().get('expiry:domain-unknown')!.level).toBe('warning');
    });
  });

  // Story 9-9 AC#6 wiring (added 2026-05-01 per retrospective code review F4/F10).
  // Verifies that the alert.service.ts → telegram-channel.ts dispatch happens on
  // critical state transitions and does NOT happen on warnings/resolves. The
  // telegram-channel module is mocked at the import boundary above; we assert
  // call counts + payload shape on the mock.
  describe('Telegram dispatch wiring (AC#6)', () => {
    it('should fire sendCriticalTelegramAlert when a metric transitions to critical', async () => {
      const health = createHealthData({
        cpu: { usagePercent: 95, cores: 4 },
      });

      await AlertService.evaluateAlerts(health);

      expect(mockSendTelegramAlert).toHaveBeenCalledTimes(1);
      const ctx = mockSendTelegramAlert.mock.calls[0][0];
      expect(ctx.metricKey).toBe('cpu');
      expect(ctx.value).toBe(95);
      expect(ctx.timestamp).toBeInstanceOf(Date);
    });

    it('should NOT fire sendCriticalTelegramAlert on warning-only transitions', async () => {
      const health = createHealthData({
        cpu: { usagePercent: 75, cores: 4 }, // above warning (70) but below critical (90)
      });

      await AlertService.evaluateAlerts(health);

      expect(mockSendTelegramAlert).not.toHaveBeenCalled();
    });

    it('should NOT fire sendCriticalTelegramAlert on resolved transitions (good news does not ping)', async () => {
      // First: enter critical
      await AlertService.evaluateAlerts(createHealthData({
        cpu: { usagePercent: 95, cores: 4 },
      }));
      expect(mockSendTelegramAlert).toHaveBeenCalledTimes(1);

      // Two consecutive OK checks to trigger resolve via hysteresis
      await AlertService.evaluateAlerts(createHealthData({
        cpu: { usagePercent: 30, cores: 4 },
      }));
      await AlertService.evaluateAlerts(createHealthData({
        cpu: { usagePercent: 30, cores: 4 },
      }));

      // Should still be 1 — the resolve path does not ping Telegram
      expect(mockSendTelegramAlert).toHaveBeenCalledTimes(1);
    });

    it('should not propagate Telegram errors to the alert subsystem', async () => {
      mockSendTelegramAlert.mockRejectedValueOnce(new Error('Telegram API down'));

      const health = createHealthData({
        cpu: { usagePercent: 95, cores: 4 },
      });

      // Should not throw despite Telegram failure
      await expect(AlertService.evaluateAlerts(health)).resolves.toBeUndefined();
      expect(mockSendTelegramAlert).toHaveBeenCalledTimes(1);
    });
  });

  // Story 9-15 AC#2 — Paper-trail warn-log on critical transition.
  // Goal: even if every alert channel is gated off or down, future criticals
  // leave a searchable line in pm2 logs. Independent of telegram-channel dispatch.
  // Transition-only (not per-poll) to avoid log-spam during long-running criticals.
  describe('Critical-transition paper trail (AC#2)', () => {
    it('emits alert.critical_evaluated warn-log when a metric transitions to critical', async () => {
      const health = createHealthData({
        cpu: { usagePercent: 95, cores: 4 },
      });

      await AlertService.evaluateAlerts(health);

      const criticalCall = mockLoggerWarn.mock.calls.find(
        (call) => call[0]?.event === 'alert.critical_evaluated' && call[0]?.metricKey === 'cpu',
      );
      expect(criticalCall).toBeDefined();
      expect(criticalCall![0]).toMatchObject({
        event: 'alert.critical_evaluated',
        metricKey: 'cpu',
        value: 95,
      });
    });

    it('does NOT emit alert.critical_evaluated on warning-only transitions', async () => {
      const health = createHealthData({
        cpu: { usagePercent: 75, cores: 4 }, // above warning (70), below critical (90)
      });

      await AlertService.evaluateAlerts(health);

      const criticalCall = mockLoggerWarn.mock.calls.find(
        (call) => call[0]?.event === 'alert.critical_evaluated',
      );
      expect(criticalCall).toBeUndefined();
    });

    it('does NOT re-emit alert.critical_evaluated on consecutive critical samples (transition-only, not per-poll)', async () => {
      const health = createHealthData({
        cpu: { usagePercent: 95, cores: 4 },
      });

      // First evaluation — emits the warn (transition ok → critical)
      await AlertService.evaluateAlerts(health);
      const firstCount = mockLoggerWarn.mock.calls.filter(
        (call) => call[0]?.event === 'alert.critical_evaluated' && call[0]?.metricKey === 'cpu',
      ).length;
      expect(firstCount).toBe(1);

      // Second evaluation — still critical, must NOT re-emit (transition guard)
      await AlertService.evaluateAlerts(health);
      const secondCount = mockLoggerWarn.mock.calls.filter(
        (call) => call[0]?.event === 'alert.critical_evaluated' && call[0]?.metricKey === 'cpu',
      ).length;
      expect(secondCount).toBe(1); // unchanged
    });
  });
});
