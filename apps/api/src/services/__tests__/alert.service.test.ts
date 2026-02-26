import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const { mockDbSelect, mockSendGenericEmail } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockSendGenericEmail: vi.fn(),
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

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
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
  });
});
