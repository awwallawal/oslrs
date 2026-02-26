import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const { mockGetSystemHealth, mockMetrics, mockContentType } = vi.hoisted(() => ({
  mockGetSystemHealth: vi.fn(),
  mockMetrics: vi.fn(),
  mockContentType: 'text/plain; version=0.0.4; charset=utf-8',
}));

vi.mock('../../services/monitoring.service.js', () => ({
  MonitoringService: {
    getSystemHealth: (...args: any[]) => mockGetSystemHealth(...args),
  },
}));

vi.mock('../../middleware/metrics.js', () => ({
  metricsRegistry: {
    metrics: () => mockMetrics(),
    contentType: mockContentType,
  },
}));

// ── Import SUT ─────────────────────────────────────────────────────────

import { SystemController } from '../system.controller.js';

// ── Helpers ────────────────────────────────────────────────────────────

function createMockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.set = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

const MOCK_HEALTH = {
  status: 'ok',
  timestamp: '2026-02-26T10:00:00.000Z',
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
    { name: 'fraud-detection', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
    { name: 'staff-import', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
    { name: 'webhook-ingestion', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
    { name: 'productivity-snapshot', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
  ],
};

// ── Tests ──────────────────────────────────────────────────────────────

describe('SystemController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getHealth', () => {
    it('should return 200 with full health object shape', async () => {
      mockGetSystemHealth.mockResolvedValue(MOCK_HEALTH);

      const req = {} as any;
      const res = createMockRes();
      const next = vi.fn();

      await SystemController.getHealth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.status).toBe('ok');
      expect(body.data.cpu).toHaveProperty('usagePercent');
      expect(body.data.cpu).toHaveProperty('cores');
      expect(body.data.memory).toHaveProperty('totalMB');
      expect(body.data.memory).toHaveProperty('usedMB');
      expect(body.data.memory).toHaveProperty('usagePercent');
      expect(body.data.disk).toHaveProperty('totalGB');
      expect(body.data.disk).toHaveProperty('usedGB');
      expect(body.data.database).toHaveProperty('status');
      expect(body.data.database).toHaveProperty('latencyMs');
      expect(body.data.redis).toHaveProperty('status');
      expect(body.data.redis).toHaveProperty('latencyMs');
      expect(body.data.apiLatency).toHaveProperty('p95Ms');
      expect(body.data.version).toBeDefined();
      expect(body.data.queues).toHaveLength(5);
      expect(body.data.queues[0]).toHaveProperty('name');
      expect(body.data.queues[0]).toHaveProperty('waiting');
      expect(body.data.queues[0]).toHaveProperty('active');
      expect(body.data.queues[0]).toHaveProperty('failed');
    });

    it('should call next with error when service throws', async () => {
      const error = new Error('Service failure');
      mockGetSystemHealth.mockRejectedValue(error);

      const req = {} as any;
      const res = createMockRes();
      const next = vi.fn();

      await SystemController.getHealth(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('getMetrics', () => {
    it('should return 200 with Prometheus text format', async () => {
      const metricsText = '# HELP http_request_duration_ms Duration\n# TYPE http_request_duration_ms histogram\n';
      mockMetrics.mockResolvedValue(metricsText);

      const req = {} as any;
      const res = createMockRes();
      const next = vi.fn();

      await SystemController.getMetrics(req, res, next);

      expect(res.set).toHaveBeenCalledWith('Content-Type', mockContentType);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(metricsText);
    });

    it('should call next with error when metrics registry fails', async () => {
      const error = new Error('Registry failure');
      mockMetrics.mockRejectedValue(error);

      const req = {} as any;
      const res = createMockRes();
      const next = vi.fn();

      await SystemController.getMetrics(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
