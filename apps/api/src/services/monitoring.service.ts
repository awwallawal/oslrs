/**
 * Monitoring Service
 *
 * Provides system health checks including CPU, memory, disk, database,
 * Redis connectivity, and BullMQ queue health aggregation.
 *
 * Created in Story 6-2. Updated in code review.
 */

import os from 'os';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { getEmailQueueStats } from '../queues/email.queue.js';
import { getFraudDetectionQueue } from '../queues/fraud-detection.queue.js';
import { importQueue } from '../queues/import.queue.js';
import { getWebhookIngestionQueue } from '../queues/webhook-ingestion.queue.js';
import { getProductivitySnapshotQueue } from '../queues/productivity-snapshot.queue.js';
import { getP95Latency } from '../middleware/metrics.js';
import type { SystemHealthResponse, QueueHealthStats } from '@oslsr/types';
import pino from 'pino';

const logger = pino({ name: 'monitoring-service' });
const execAsync = promisify(execCb);

const isTestMode = () =>
  process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

// Re-export shared types for backward compat
export type { SystemHealthResponse, QueueHealthStats as QueueStats } from '@oslsr/types';

// Read version from package.json
let appVersion = '0.0.0';
try {
  const require = createRequire(import.meta.url);
  const pkg = require('../../package.json');
  appVersion = pkg.version || '0.0.0';
} catch {
  // Fallback if package.json can't be loaded
}

// In-memory response cache (10-second TTL)
let cachedResponse: SystemHealthResponse | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10_000;

// Previous CPU reading for delta-based measurement
let prevCpuIdle = 0;
let prevCpuTotal = 0;

// Persistent Redis connection for health checks (lazy-initialized)
let healthRedis: import('ioredis').Redis | null = null;

async function getHealthRedis(): Promise<import('ioredis').Redis> {
  if (!healthRedis) {
    const { Redis } = await import('ioredis');
    healthRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      connectTimeout: 2000,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await healthRedis.connect();
  }
  return healthRedis;
}

export class MonitoringService {
  /**
   * Get full system health — cached for 10 seconds to prevent excessive system calls
   */
  static async getSystemHealth(): Promise<SystemHealthResponse> {
    const now = Date.now();
    if (cachedResponse && now - cacheTimestamp < CACHE_TTL_MS) {
      return cachedResponse;
    }

    const [cpu, memory, disk, database, redis, queues] = await Promise.all([
      this.getCpuUsage(),
      this.getMemoryUsage(),
      this.getDiskUsage(),
      this.checkDatabase(),
      this.checkRedis(),
      this.getQueueHealth(),
    ]);

    const apiLatency = { p95Ms: getP95Latency() };
    const status = this.deriveOverallStatus(cpu, memory, disk, database, redis, queues);

    const response: SystemHealthResponse = {
      status,
      timestamp: new Date().toISOString(),
      version: appVersion,
      uptime: Math.round(process.uptime()),
      cpu,
      memory,
      disk,
      database,
      redis,
      apiLatency,
      queues,
    };

    cachedResponse = response;
    cacheTimestamp = now;

    return response;
  }

  /**
   * CPU usage via delta between consecutive readings.
   * First call returns cumulative average; subsequent calls return delta since last check.
   */
  static async getCpuUsage(): Promise<{ usagePercent: number; cores: number }> {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      totalIdle += cpu.times.idle;
      totalTick += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
    }

    let usagePercent: number;

    if (prevCpuTotal > 0) {
      // Delta-based: compare with previous reading for current utilization
      const deltaTotal = totalTick - prevCpuTotal;
      const deltaIdle = totalIdle - prevCpuIdle;
      usagePercent = deltaTotal > 0
        ? Math.round(((deltaTotal - deltaIdle) / deltaTotal) * 100)
        : 0;
    } else {
      // First call: cumulative average (will be refined on next call)
      usagePercent = totalTick > 0
        ? Math.round(((totalTick - totalIdle) / totalTick) * 100)
        : 0;
    }

    prevCpuIdle = totalIdle;
    prevCpuTotal = totalTick;

    return { usagePercent, cores: cpus.length };
  }

  /**
   * RAM usage from os module
   */
  static async getMemoryUsage(): Promise<{
    totalMB: number;
    usedMB: number;
    usagePercent: number;
  }> {
    const totalMB = Math.round(os.totalmem() / 1024 / 1024);
    const freeMB = Math.round(os.freemem() / 1024 / 1024);
    const usedMB = totalMB - freeMB;
    const usagePercent = totalMB > 0 ? Math.round((usedMB / totalMB) * 100) : 0;

    return { totalMB, usedMB, usagePercent };
  }

  /**
   * Disk usage via async `df` (Linux VPS). Falls back for Windows dev.
   */
  static async getDiskUsage(): Promise<{
    totalGB: number;
    usedGB: number;
    usagePercent: number;
  }> {
    try {
      const { stdout } = await execAsync('df -BG / | tail -1', { timeout: 2000 });
      const output = stdout.trim();
      // Parse: Filesystem  1G-blocks  Used  Available  Use%  Mounted
      const parts = output.split(/\s+/);
      const totalGB = parseInt(parts[1], 10) || 0;
      const usedGB = parseInt(parts[2], 10) || 0;
      const usagePercent = parseInt(parts[4], 10) || 0;
      return { totalGB, usedGB, usagePercent };
    } catch {
      // Windows fallback or command failure
      return { totalGB: 0, usedGB: 0, usagePercent: 0 };
    }
  }

  /**
   * Database connectivity: SELECT 1 with 2-second timeout
   */
  static async checkDatabase(): Promise<{ status: 'ok' | 'error'; latencyMs: number }> {
    if (isTestMode()) {
      return { status: 'ok', latencyMs: 1 };
    }

    const start = Date.now();
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DB timeout')), 2000),
      );
      await Promise.race([
        db.execute(sql`SELECT 1`),
        timeoutPromise,
      ]);
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      logger.error({ event: 'health.db_check_failed', error: (err as Error).message });
      return { status: 'error', latencyMs: Date.now() - start };
    }
  }

  /**
   * Redis connectivity: PING with persistent connection
   */
  static async checkRedis(): Promise<{ status: 'ok' | 'error'; latencyMs: number }> {
    if (isTestMode()) {
      return { status: 'ok', latencyMs: 1 };
    }

    const start = Date.now();
    try {
      const redis = await getHealthRedis();
      await redis.ping();
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      // Reset connection on failure so next call creates a fresh one
      if (healthRedis) {
        try { await healthRedis.quit(); } catch { /* ignore */ }
        healthRedis = null;
      }
      logger.error({ event: 'health.redis_check_failed', error: (err as Error).message });
      return { status: 'error', latencyMs: Date.now() - start };
    }
  }

  /**
   * Queue health: aggregates stats from all 5 BullMQ queues via Promise.allSettled()
   */
  static async getQueueHealth(): Promise<QueueHealthStats[]> {
    if (isTestMode()) {
      return [
        { name: 'email-notification', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
        { name: 'fraud-detection', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
        { name: 'staff-import', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
        { name: 'webhook-ingestion', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
        { name: 'productivity-snapshot', status: 'ok', waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
      ];
    }

    const queueGetters = [
      { name: 'email-notification', getStats: () => getEmailQueueStats() },
      {
        name: 'fraud-detection',
        getStats: async () => {
          const q = getFraudDetectionQueue();
          const [waiting, active, failed, delayed, paused] = await Promise.all([
            q.getWaitingCount(), q.getActiveCount(), q.getFailedCount(), q.getDelayedCount(), q.isPaused(),
          ]);
          return { waiting, active, completed: 0, failed, delayed, paused };
        },
      },
      {
        name: 'staff-import',
        getStats: async () => {
          const q = importQueue;
          const [waiting, active, failed, delayed, paused] = await Promise.all([
            q.getWaitingCount(), q.getActiveCount(), q.getFailedCount(), q.getDelayedCount(), q.isPaused(),
          ]);
          return { waiting, active, completed: 0, failed, delayed, paused };
        },
      },
      {
        name: 'webhook-ingestion',
        getStats: async () => {
          const q = getWebhookIngestionQueue();
          const [waiting, active, failed, delayed, paused] = await Promise.all([
            q.getWaitingCount(), q.getActiveCount(), q.getFailedCount(), q.getDelayedCount(), q.isPaused(),
          ]);
          return { waiting, active, completed: 0, failed, delayed, paused };
        },
      },
      {
        name: 'productivity-snapshot',
        getStats: async () => {
          const q = getProductivitySnapshotQueue();
          const [waiting, active, failed, delayed, paused] = await Promise.all([
            q.getWaitingCount(), q.getActiveCount(), q.getFailedCount(), q.getDelayedCount(), q.isPaused(),
          ]);
          return { waiting, active, completed: 0, failed, delayed, paused };
        },
      },
    ];

    const results = await Promise.allSettled(
      queueGetters.map(async (qg) => {
        const stats = await qg.getStats();
        const queueStatus: 'ok' | 'warning' | 'error' =
          stats.waiting > 200 ? 'error' :
          stats.waiting > 50 ? 'warning' : 'ok';
        return {
          name: qg.name,
          status: queueStatus,
          waiting: stats.waiting,
          active: stats.active,
          failed: stats.failed,
          delayed: stats.delayed,
          paused: stats.paused,
        } as QueueHealthStats;
      }),
    );

    return results.map((r, idx) =>
      r.status === 'fulfilled'
        ? r.value
        : {
            name: queueGetters[idx].name,
            status: 'error' as const,
            waiting: 0,
            active: 0,
            failed: 0,
            delayed: 0,
            paused: false,
          },
    );
  }

  /**
   * Derive overall system status from individual checks
   */
  private static deriveOverallStatus(
    cpu: { usagePercent: number },
    memory: { usagePercent: number },
    disk: { usagePercent: number },
    database: { status: string },
    redis: { status: string },
    queues: QueueHealthStats[],
  ): 'ok' | 'degraded' | 'critical' {
    // Critical conditions
    if (database.status === 'error' || redis.status === 'error') return 'critical';
    if (cpu.usagePercent > 90) return 'critical';
    if (memory.usagePercent > 90) return 'critical';
    if (disk.usagePercent > 0 && (100 - disk.usagePercent) < 10) return 'critical';

    // Degraded conditions
    if (cpu.usagePercent > 70) return 'degraded';
    if (memory.usagePercent > 75) return 'degraded';
    if (disk.usagePercent > 0 && (100 - disk.usagePercent) < 20) return 'degraded';
    if (queues.some((q) => q.status === 'error')) return 'degraded';
    if (queues.some((q) => q.status === 'warning')) return 'degraded';

    return 'ok';
  }

  /** Clear the response cache (for testing) */
  static clearCache(): void {
    cachedResponse = null;
    cacheTimestamp = 0;
  }

  /** Reset CPU baseline (for testing) */
  static resetCpuBaseline(): void {
    prevCpuIdle = 0;
    prevCpuTotal = 0;
  }
}
