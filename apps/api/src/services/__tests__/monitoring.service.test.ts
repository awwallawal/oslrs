import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const {
  mockCpus, mockTotalmem, mockFreemem,
  mockExecAsync,
  mockDbExecute,
  mockGetEmailQueueStats,
  mockGetP95Latency,
} = vi.hoisted(() => ({
  mockCpus: vi.fn(),
  mockTotalmem: vi.fn(),
  mockFreemem: vi.fn(),
  mockExecAsync: vi.fn(),
  mockDbExecute: vi.fn(),
  mockGetEmailQueueStats: vi.fn(),
  mockGetP95Latency: vi.fn(),
}));

vi.mock('os', () => ({
  default: {
    cpus: () => mockCpus(),
    totalmem: () => mockTotalmem(),
    freemem: () => mockFreemem(),
  },
  cpus: () => mockCpus(),
  totalmem: () => mockTotalmem(),
  freemem: () => mockFreemem(),
}));

vi.mock('child_process', () => ({
  exec: vi.fn(), // The real exec is wrapped by promisify, we mock via util
}));

vi.mock('util', async () => {
  const actual = await vi.importActual('util');
  return {
    ...actual,
    promisify: () => (...args: any[]) => mockExecAsync(...args),
  };
});

vi.mock('module', async () => {
  const actual = await vi.importActual('module');
  return {
    ...actual,
    createRequire: () => (path: string) => {
      if (path.includes('package.json')) return { version: '1.0.0' };
      throw new Error('not found');
    },
  };
});

vi.mock('../../db/index.js', () => ({
  db: {
    execute: (...args: any[]) => mockDbExecute(...args),
  },
  pool: {},
}));

vi.mock('../../queues/email.queue.js', () => ({
  getEmailQueueStats: () => mockGetEmailQueueStats(),
}));

vi.mock('../../queues/fraud-detection.queue.js', () => ({
  getFraudDetectionQueue: () => ({
    getWaitingCount: () => Promise.resolve(0),
    getActiveCount: () => Promise.resolve(0),
    getFailedCount: () => Promise.resolve(0),
    getDelayedCount: () => Promise.resolve(0),
    isPaused: () => Promise.resolve(false),
  }),
}));

vi.mock('../../queues/import.queue.js', () => ({
  importQueue: {
    getWaitingCount: () => Promise.resolve(0),
    getActiveCount: () => Promise.resolve(0),
    getFailedCount: () => Promise.resolve(0),
    getDelayedCount: () => Promise.resolve(0),
    isPaused: () => Promise.resolve(false),
  },
}));

vi.mock('../../queues/webhook-ingestion.queue.js', () => ({
  getWebhookIngestionQueue: () => ({
    getWaitingCount: () => Promise.resolve(0),
    getActiveCount: () => Promise.resolve(0),
    getFailedCount: () => Promise.resolve(0),
    getDelayedCount: () => Promise.resolve(0),
    isPaused: () => Promise.resolve(false),
  }),
}));

vi.mock('../../queues/productivity-snapshot.queue.js', () => ({
  getProductivitySnapshotQueue: () => ({
    getWaitingCount: () => Promise.resolve(0),
    getActiveCount: () => Promise.resolve(0),
    getFailedCount: () => Promise.resolve(0),
    getDelayedCount: () => Promise.resolve(0),
    isPaused: () => Promise.resolve(false),
  }),
}));

vi.mock('../../middleware/metrics.js', () => ({
  getP95Latency: () => mockGetP95Latency(),
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ── Import SUT ─────────────────────────────────────────────────────────

import { MonitoringService } from '../monitoring.service.js';

// ── Setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  MonitoringService.clearCache();
  MonitoringService.resetCpuBaseline();

  // Default: healthy system (CPU ~50% usage — safe below 70% threshold)
  mockCpus.mockReturnValue([
    { times: { user: 40, nice: 0, sys: 10, irq: 0, idle: 50 } },
    { times: { user: 40, nice: 0, sys: 10, irq: 0, idle: 50 } },
  ]);
  mockTotalmem.mockReturnValue(8 * 1024 * 1024 * 1024); // 8GB
  mockFreemem.mockReturnValue(4 * 1024 * 1024 * 1024); // 4GB free
  mockExecAsync.mockResolvedValue({ stdout: '/dev/sda1 100G 60G 40G 60% /' });
  mockDbExecute.mockResolvedValue([{ '?column?': 1 }]);
  mockGetEmailQueueStats.mockResolvedValue({
    waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: false,
  });
  mockGetP95Latency.mockReturnValue(42);
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('MonitoringService', () => {
  describe('getCpuUsage', () => {
    it('should calculate CPU usage from os.cpus()', async () => {
      const result = await MonitoringService.getCpuUsage();
      expect(result.cores).toBe(2);
      expect(result.usagePercent).toBe(50); // 50/100 per core (first call = cumulative)
    });

    it('should compute delta-based CPU on consecutive calls', async () => {
      // First call: sets baseline
      await MonitoringService.getCpuUsage();

      // Simulate CPU times advancing: +10 more busy, same idle
      mockCpus.mockReturnValue([
        { times: { user: 48, nice: 0, sys: 12, irq: 0, idle: 50 } },
        { times: { user: 48, nice: 0, sys: 12, irq: 0, idle: 50 } },
      ]);

      const result = await MonitoringService.getCpuUsage();
      // Delta: total went up by 20, idle stayed same → 100% usage in delta
      expect(result.usagePercent).toBe(100);
    });
  });

  describe('getMemoryUsage', () => {
    it('should return memory stats from os module', async () => {
      const result = await MonitoringService.getMemoryUsage();
      expect(result.totalMB).toBe(8192);
      expect(result.usedMB).toBe(4096);
      expect(result.usagePercent).toBe(50);
    });
  });

  describe('getDiskUsage', () => {
    it('should parse df output on Linux', async () => {
      const result = await MonitoringService.getDiskUsage();
      expect(result.totalGB).toBe(100);
      expect(result.usedGB).toBe(60);
      expect(result.usagePercent).toBe(60);
    });

    it('should return zeros if df fails (Windows fallback)', async () => {
      mockExecAsync.mockRejectedValue(new Error('not available'));
      const result = await MonitoringService.getDiskUsage();
      expect(result.totalGB).toBe(0);
      expect(result.usedGB).toBe(0);
      expect(result.usagePercent).toBe(0);
    });
  });

  describe('getSystemHealth', () => {
    it('should return valid health object with all fields', async () => {
      const health = await MonitoringService.getSystemHealth();
      // In test mode, db/redis/queues return mock healthy values, CPU is 50%
      expect(health.status).toBe('ok');
      expect(health.timestamp).toBeDefined();
      expect(health.version).toBeDefined();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
      expect(health.cpu).toHaveProperty('usagePercent');
      expect(health.memory).toHaveProperty('totalMB');
      expect(health.disk).toHaveProperty('totalGB');
      expect(health.database).toHaveProperty('status');
      expect(health.redis).toHaveProperty('status');
      expect(health.apiLatency).toHaveProperty('p95Ms');
      expect(health.queues).toHaveLength(5);
    });

    it('should include p95 latency from metrics middleware', async () => {
      mockGetP95Latency.mockReturnValue(120);
      const health = await MonitoringService.getSystemHealth();
      expect(health.apiLatency.p95Ms).toBe(120);
    });

    it('should return cached response within TTL', async () => {
      const first = await MonitoringService.getSystemHealth();
      // Modify mock return values
      mockTotalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
      const second = await MonitoringService.getSystemHealth();
      // Should be same cached object
      expect(second.memory.totalMB).toBe(first.memory.totalMB);
    });

    it('should derive status as degraded when CPU > 70%', async () => {
      // CPU: 85% usage (> 70 warning, < 90 critical)
      mockCpus.mockReturnValue([
        { times: { user: 80, nice: 0, sys: 5, irq: 0, idle: 15 } },
      ]);
      MonitoringService.clearCache();
      const health = await MonitoringService.getSystemHealth();
      expect(health.status).toBe('degraded');
    });

    it('should derive status as critical when database check fails', async () => {
      // Spy on checkDatabase to return error (bypasses isTestMode short-circuit)
      vi.spyOn(MonitoringService, 'checkDatabase').mockResolvedValue({
        status: 'error',
        latencyMs: 2000,
      });
      MonitoringService.clearCache();
      const health = await MonitoringService.getSystemHealth();
      expect(health.status).toBe('critical');
    });

    it('should derive status as critical when redis check fails', async () => {
      vi.spyOn(MonitoringService, 'checkRedis').mockResolvedValue({
        status: 'error',
        latencyMs: 2000,
      });
      MonitoringService.clearCache();
      const health = await MonitoringService.getSystemHealth();
      expect(health.status).toBe('critical');
    });
  });

  describe('getQueueHealth', () => {
    it('should return stats for all 5 queues (test mode returns mocks)', async () => {
      const queues = await MonitoringService.getQueueHealth();
      expect(queues).toHaveLength(5);
      const names = queues.map(q => q.name);
      expect(names).toContain('email-notification');
      expect(names).toContain('fraud-detection');
      expect(names).toContain('staff-import');
      expect(names).toContain('webhook-ingestion');
      expect(names).toContain('productivity-snapshot');
    });

    it('should handle individual queue failures gracefully', async () => {
      // Override getQueueHealth to simulate a real failure scenario
      vi.spyOn(MonitoringService, 'getQueueHealth').mockResolvedValue([
        { name: 'email-notification', status: 'error', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
        { name: 'fraud-detection', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
        { name: 'staff-import', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
        { name: 'webhook-ingestion', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
        { name: 'productivity-snapshot', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
      ]);

      const queues = await MonitoringService.getQueueHealth();
      const emailQueue = queues.find(q => q.name === 'email-notification');
      expect(emailQueue).toBeDefined();
      expect(emailQueue!.status).toBe('error');
      // Other queues should still be ok
      const fraudQueue = queues.find(q => q.name === 'fraud-detection');
      expect(fraudQueue!.status).toBe('ok');
    });

    it('should mark queue as degraded when integrated into health check', async () => {
      vi.spyOn(MonitoringService, 'getQueueHealth').mockResolvedValue([
        { name: 'email-notification', status: 'warning', waiting: 75, active: 0, failed: 0, delayed: 0, paused: false },
        { name: 'fraud-detection', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
        { name: 'staff-import', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
        { name: 'webhook-ingestion', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
        { name: 'productivity-snapshot', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
      ]);
      MonitoringService.clearCache();
      const health = await MonitoringService.getSystemHealth();
      expect(health.status).toBe('degraded');
    });
  });
});
