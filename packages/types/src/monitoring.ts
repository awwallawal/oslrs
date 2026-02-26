/**
 * System Health Monitoring Types
 *
 * Shared between API and Web to prevent response shape drift.
 * Canonical source for SystemHealthResponse and QueueStats interfaces.
 *
 * Created in Story 6-2 code review.
 */

export interface QueueHealthStats {
  name: string;
  status: 'ok' | 'warning' | 'error';
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export interface SystemHealthResponse {
  status: 'ok' | 'degraded' | 'critical';
  timestamp: string;
  version: string;
  uptime: number;
  cpu: {
    usagePercent: number;
    cores: number;
  };
  memory: {
    totalMB: number;
    usedMB: number;
    usagePercent: number;
  };
  disk: {
    totalGB: number;
    usedGB: number;
    usagePercent: number;
  };
  database: {
    status: 'ok' | 'error';
    latencyMs: number;
  };
  redis: {
    status: 'ok' | 'error';
    latencyMs: number;
  };
  apiLatency: {
    p95Ms: number;
  };
  queues: QueueHealthStats[];
}
