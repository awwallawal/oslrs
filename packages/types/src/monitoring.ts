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

/**
 * Story 9-50 — a single time-sensitive piece of infrastructure (TLS cert, domain
 * registration, or operator-declared expiry) with a server-computed days-until-expiry
 * countdown. One shape across all source adapters (cert | domain | manual) so the
 * dashboard card + alert path are kind-agnostic and adding a kind is additive.
 */
export interface MonitoredExpiry {
  name: string;
  kind: 'cert' | 'domain' | 'manual';
  /** ISO-8601 expiry instant, or null when an adapter could not determine it. */
  expiresAt: string | null;
  /** Whole days from now until expiry (server-computed), or null when unknown. */
  daysUntilExpiry: number | null;
  /** ok > 60d · warning 30–60d · critical < 30d · error = adapter could not determine. */
  status: 'ok' | 'warning' | 'critical' | 'error';
  /** Human-readable detail (path / domain / source note / error reason). */
  detail: string;
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
  /** Story 9-50 — time-sensitive infra countdowns (certs / domains / declared). */
  expiries: MonitoredExpiry[];
}
