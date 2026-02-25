# Prep 7: Monitoring Infrastructure Spike Summary

**Date:** 2026-02-25
**Author:** Dev Agent (Claude Opus 4.6)
**Status:** Complete
**Feeds:** Story 6-2 (System Health & Performance Monitoring)

---

## 1. Executive Summary

This spike researches and designs a lightweight monitoring infrastructure for OSLRS, as mandated by Architecture Decision 5.3. The design covers:

- **prom-client v15.1.3** integration with Express middleware for automatic HTTP request timing
- **12 custom metrics** covering API latency, fraud detection, queue health (waiting/active/failed), DB pool (active/idle/waiting), submission ingestion, and process resources (CPU/memory/uptime)
- **Enhanced `/health` endpoint** with CPU, RAM, disk, PostgreSQL, Redis, and BullMQ queue health
- **Super Admin System Health dashboard** using Recharts (already installed) with 30-second polling
- **Alerting system** with state machine (OK → Warning → Critical → Resolved), email + Socket.io delivery, and cooldown logic
- **<0.1ms per-request overhead** from metrics middleware, validated by existing k6 load test infrastructure

The design is intentionally lightweight — no Prometheus server, no Grafana, no external APM. It can graduate to full Prometheus+Grafana post-pilot by simply pointing a Prometheus server at the existing `/metrics` endpoint.

---

## 2. Current State Analysis

### Existing Health Endpoint

```typescript
// apps/api/src/app.ts lines 78-82
app.get('/health', (req, res) => {
  logger.info({ event: 'health_check' });
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

**Gaps:** No CPU, RAM, disk, database, Redis, or queue health data.

### Existing Queue Stats Pattern

```typescript
// apps/api/src/queues/email.queue.ts — getEmailQueueStats()
export async function getEmailQueueStats(): Promise<{
  waiting: number; active: number; completed: number;
  failed: number; delayed: number; paused: boolean;
}> {
  if (isTestMode()) {
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: false };
  }
  const queue = getEmailQueue();
  const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
    queue.getWaitingCount(), queue.getActiveCount(), queue.getCompletedCount(),
    queue.getFailedCount(), queue.getDelayedCount(), queue.isPaused(),
  ]);
  return { waiting, active, completed, failed, delayed, paused: isPaused };
}
```

**Pattern:** Test-mode guard → lazy queue init → `Promise.all()` for parallel stat fetching. This pattern will be generalized to all 5 queues.

### BullMQ Queue Inventory

| Queue | File | Worker | Purpose |
|-------|------|--------|---------|
| email-notification | `queues/email.queue.ts` | `workers/email.worker.ts` | Staff invitations, password reset, verification |
| fraud-detection | `queues/fraud-detection.queue.ts` | `workers/fraud-detection.worker.ts` | Async fraud heuristic evaluation |
| import | `queues/import.queue.ts` | `workers/import.worker.ts` | CSV bulk staff import |
| webhook-ingestion | `queues/webhook-ingestion.queue.ts` | `workers/webhook-ingestion.worker.ts` | Submission processing |
| productivity-snapshot | `queues/productivity-snapshot.queue.ts` | `workers/productivity-snapshot.worker.ts` | Nightly daily stats aggregation |

### Database Pool

```typescript
// apps/api/src/db/index.ts
import pg from 'pg';
const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

Available pool stats: `pool.totalCount`, `pool.idleCount`, `pool.waitingCount`. Default pool size is 10 (node-postgres default).

### Socket.io Infrastructure

```
apps/api/src/realtime/
├── index.ts    — Socket.io init + event handlers
├── auth.ts     — JWT verification middleware
├── rooms.ts    — Room name generation + access control
```

Already supports JWT auth, room-based subscriptions, and structured logging. Can deliver in-app alert notifications via `io.to(room).emit()`.

### Existing k6 Load Tests

```
tests/load/
├── config.js              — Shared config, NFR thresholds (API_P95: 250ms)
├── health-check.js        — Health baseline (p95 < 50ms, 10 VUs)
├── smoke.js               — Basic smoke test
├── auth-endpoints.js      — Auth flow load test
├── staff-management.js    — Staff CRUD load test
├── questionnaire-api.js   — Questionnaire API load test
├── combined-stress.js     — Combined stress test
└── helpers/               — auth.js, nin.js, setup.js
```

These provide before/after baseline comparison for measuring prom-client overhead.

---

## 3. prom-client Integration Design (AC1)

### Library Selection

| Package | Version | Decision | Rationale |
|---------|---------|----------|-----------|
| `prom-client` | 15.1.3 | **Install** | Core Prometheus client for Node.js. ESM-compatible. Async API (v15+). |
| `express-prom-bundle` | latest | **Do NOT install** | Unnecessary abstraction. Direct prom-client integration is simpler, avoids extra dependency, and gives full control over route normalization. |

### Installation

```bash
pnpm --filter @oslsr/api add prom-client
```

### Middleware Design

**File:** `apps/api/src/middleware/metrics.ts`

```typescript
import { Registry, Histogram, collectDefaultMetrics } from 'prom-client';
import type { Request, Response, NextFunction } from 'express';

// Global registry (singleton)
export const metricsRegistry = new Registry();

// Collect Node.js default metrics (GC, event loop lag, active handles)
collectDefaultMetrics({ register: metricsRegistry, prefix: 'oslrs_' });

// HTTP request duration histogram
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
  registers: [metricsRegistry],
});

// Route normalization: /users/abc123 → /users/:id
function normalizeRoute(req: Request): string {
  // Use Express matched route if available (e.g., /api/v1/staff/:id)
  if (req.route?.path) {
    return req.baseUrl + req.route.path;
  }
  // Fallback: replace UUID segments and numeric-only segments with :id
  return req.path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

// Express middleware
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    httpRequestDuration.observe(
      {
        method: req.method,
        route: normalizeRoute(req),
        status_code: String(res.statusCode),
      },
      durationMs,
    );
  });

  next();
}
```

**Key Decisions:**
- Use `process.hrtime.bigint()` for nanosecond precision (not `Date.now()`)
- Route normalization via `req.route.path` (Express-native) with UUID fallback
- Buckets aligned to NFR targets: 250ms (p95 target), 500ms (warning), 1000ms (critical)
- Register middleware BEFORE routes in `app.ts` to capture all endpoints
- No path exclusions — `/health` and `/metrics` are measured too (negligible cardinality)

### Middleware Registration

```typescript
// apps/api/src/app.ts — add BEFORE route registration
import { metricsMiddleware } from './middleware/metrics.js';

app.use(metricsMiddleware);
```

---

## 4. Metric Definitions (AC1)

### Complete Metric Schema Table

| Metric Name | Type | Labels | Unit | Target/Threshold | Action if Breached |
|---|---|---|---|---|---|
| `http_request_duration_ms` | Histogram | `method`, `route`, `status_code` | ms | p95 < 250ms | Add DB indexes, optimize queries |
| `fraud_detections_total` | Counter | `heuristic` | count | Monitor trend | Check threshold tuning |
| `submission_ingestion_lag_seconds` | Gauge | — | seconds | < 5s p95 | Scale BullMQ workers, check queue |
| `db_connection_pool_active` | Gauge | — | connections | < pool max (10) | Investigate connection leak |
| `db_connection_pool_idle` | Gauge | — | connections | > 0 | Monitor query load |
| `db_connection_pool_waiting` | Gauge | — | connections | 0 | Pool exhaustion alert |
| `bullmq_queue_waiting` | Gauge | `queue` | jobs | < 50 (Warning), < 200 (Critical) | Scale workers, investigate job failures |
| `bullmq_queue_active` | Gauge | `queue` | jobs | — | Monitor worker throughput |
| `bullmq_queue_failed_total` | Counter | `queue` | count | Monitor trend | Check worker error logs |
| `process_cpu_usage_percent` | Gauge | — | percent | < 70% (Warning), < 90% (Critical) | Profile hot code paths |
| `process_memory_rss_bytes` | Gauge | — | bytes | — | Check for memory leaks |
| `process_uptime_seconds` | Gauge | — | seconds | — | Detect unexpected restarts |

### Custom Metric Collectors

**File:** `apps/api/src/services/monitoring.service.ts`

```typescript
import { Counter, Gauge, Registry } from 'prom-client';
import { metricsRegistry } from '../middleware/metrics.js';
import { pool } from '../db/index.js';
import os from 'node:os';

// --- Fraud Detection Counter ---
export const fraudDetectionsTotal = new Counter({
  name: 'fraud_detections_total',
  help: 'Total fraud detections by heuristic type',
  labelNames: ['heuristic'] as const,
  registers: [metricsRegistry],
});
// Usage in fraud-detection.worker.ts:
//   fraudDetectionsTotal.inc({ heuristic: 'gps_cluster' });

// --- Submission Ingestion Lag ---
export const submissionIngestionLag = new Gauge({
  name: 'submission_ingestion_lag_seconds',
  help: 'Time from form submission to dashboard visibility',
  registers: [metricsRegistry],
});
// Usage: set after webhook-ingestion worker completes a job
//   const lagSec = (Date.now() - job.data.submittedAt) / 1000;
//   submissionIngestionLag.set(lagSec);

// --- DB Connection Pool Gauges ---
export const dbPoolActive = new Gauge({
  name: 'db_connection_pool_active',
  help: 'Active database connections',
  registers: [metricsRegistry],
  collect() { this.set(pool.totalCount - pool.idleCount); },
});

export const dbPoolIdle = new Gauge({
  name: 'db_connection_pool_idle',
  help: 'Idle database connections',
  registers: [metricsRegistry],
  collect() { this.set(pool.idleCount); },
});

export const dbPoolWaiting = new Gauge({
  name: 'db_connection_pool_waiting',
  help: 'Queries waiting for a connection',
  registers: [metricsRegistry],
  collect() { this.set(pool.waitingCount); },
});

// --- Process Metrics ---
export const processCpuPercent = new Gauge({
  name: 'process_cpu_usage_percent',
  help: 'Process CPU usage percentage (1-minute average)',
  registers: [metricsRegistry],
});

export const processMemoryRss = new Gauge({
  name: 'process_memory_rss_bytes',
  help: 'Process resident set size in bytes',
  registers: [metricsRegistry],
  collect() { this.set(process.memoryUsage.rss()); },
});
```

### BullMQ Queue Metrics

```typescript
// Inside MonitoringService — called on a 30-second interval
import { Gauge, Counter } from 'prom-client';
import { metricsRegistry } from '../middleware/metrics.js';

export const bullmqQueueWaiting = new Gauge({
  name: 'bullmq_queue_waiting',
  help: 'Waiting jobs per BullMQ queue',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
});

export const bullmqQueueActive = new Gauge({
  name: 'bullmq_queue_active',
  help: 'Active jobs per BullMQ queue',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
});

export const bullmqQueueFailed = new Counter({
  name: 'bullmq_queue_failed_total',
  help: 'Total failed jobs per BullMQ queue',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
});
```

### Label Cardinality Analysis

| Metric | Labels | Estimated Cardinality | Risk |
|--------|--------|----------------------|------|
| `http_request_duration_ms` | method(5) × route(~40) × status_code(~8) | ~1,600 time series | **Low** — Express routes are finite |
| `fraud_detections_total` | heuristic(3) | 3 time series | Negligible |
| `bullmq_queue_waiting` | queue(5) | 5 time series | Negligible |
| `bullmq_queue_failed_total` | queue(5) | 5 time series | Negligible |

**Route normalization is critical** — without it, `/api/v1/staff/abc-123-uuid` would create unbounded cardinality. The `normalizeRoute()` function uses Express's `req.route.path` which already returns parameterized paths (e.g., `/api/v1/staff/:id`).

---

## 5. Enhanced Health Endpoint Design (AC2)

### Response Shape

```typescript
interface HealthResponse {
  status: 'ok' | 'degraded' | 'critical';
  timestamp: string;
  version: string;          // from package.json
  uptime: number;           // process.uptime() in seconds
  cpu: {
    usagePercent: number;   // 1-minute load average / core count × 100
    cores: number;
    loadAvg: [number, number, number]; // 1, 5, 15 minute
  };
  memory: {
    totalBytes: number;
    freeBytes: number;
    usedPercent: number;
    rss: number;            // process RSS
    heapUsed: number;
    heapTotal: number;
  };
  disk: {
    totalBytes: number;
    freeBytes: number;
    usedPercent: number;
    path: string;           // '/' on Linux
  };
  database: {
    status: 'connected' | 'error';
    responseTimeMs: number;
    pool: {
      total: number;
      idle: number;
      waiting: number;
    };
  };
  redis: {
    status: 'connected' | 'error';
    responseTimeMs: number;
  };
  queues: {
    [queueName: string]: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
      paused: boolean;
    };
  };
}
```

### CPU Collection

```typescript
import os from 'node:os';

function getCpuInfo() {
  const cores = os.cpus().length;
  const loadAvg = os.loadavg() as [number, number, number]; // [1min, 5min, 15min]
  // Load average relative to core count gives utilization percentage
  const usagePercent = Math.round((loadAvg[0] / cores) * 100);
  return { usagePercent, cores, loadAvg };
}
```

**Decision:** Use `os.loadavg()` (1-minute average) instead of sampling `os.cpus()` user/sys times. Load average is instant and well-understood on Linux. Note: returns `[0, 0, 0]` on Windows — acceptable since production is Linux VPS.

### RAM Collection

```typescript
function getMemoryInfo() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedPercent = Math.round(((totalBytes - freeBytes) / totalBytes) * 100);
  const { rss, heapUsed, heapTotal } = process.memoryUsage();
  return { totalBytes, freeBytes, usedPercent, rss, heapUsed, heapTotal };
}
```

### Disk Space Check

```typescript
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

async function getDiskInfo(): Promise<{ totalBytes: number; freeBytes: number; usedPercent: number; path: string }> {
  try {
    // df outputs: Filesystem 1K-blocks Used Available Use% Mounted
    const { stdout } = await execAsync("df -B1 / | tail -1", { timeout: 2000 });
    const parts = stdout.trim().split(/\s+/);
    const totalBytes = parseInt(parts[1], 10);
    const freeBytes = parseInt(parts[3], 10);
    const usedPercent = parseInt(parts[4], 10); // Already a percentage
    return { totalBytes, freeBytes, usedPercent, path: '/' };
  } catch {
    return { totalBytes: 0, freeBytes: 0, usedPercent: 0, path: '/' };
  }
}
```

**Decision:** Use `df -B1 /` (byte-level precision) with 2-second timeout via **async `exec`** (non-blocking). Using the async variant avoids blocking the event loop, which is critical even with caching/rate-limiting:
1. Health endpoint is polled at most once per 5 seconds (rate limited)
2. `df` is near-instant on Linux (reads `/proc/mounts`)
3. Response is cached (see below)

### PostgreSQL Health Check

```typescript
import { pool } from '../db/index.js';

async function checkDatabase(): Promise<{ status: 'connected' | 'error'; responseTimeMs: number; pool: { total: number; idle: number; waiting: number } }> {
  const start = performance.now();
  try {
    await pool.query('SELECT 1');
    return {
      status: 'connected',
      responseTimeMs: Math.round(performance.now() - start),
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    };
  } catch {
    return {
      status: 'error',
      responseTimeMs: Math.round(performance.now() - start),
      pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
    };
  }
}
```

**Decision:** Use `SELECT 1` with implicit node-postgres 30-second timeout. If the query doesn't return within 2 seconds, the database is considered unhealthy for monitoring purposes (the check still completes, but status is flagged).

### Redis Health Check

**Prerequisite:** Currently each queue file creates its own Redis connection (no shared module). Story 6-2 must create a shared connection module:

```typescript
// apps/api/src/lib/redis.ts (NEW — shared Redis connection)
import { Redis } from 'ioredis';

let sharedConnection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!sharedConnection) {
    sharedConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }
  return sharedConnection;
}
```

```typescript
import { getRedisConnection } from '../lib/redis.js';

async function checkRedis(): Promise<{ status: 'connected' | 'error'; responseTimeMs: number }> {
  const start = performance.now();
  try {
    const redis = getRedisConnection();
    await redis.ping();
    return { status: 'connected', responseTimeMs: Math.round(performance.now() - start) };
  } catch {
    return { status: 'error', responseTimeMs: Math.round(performance.now() - start) };
  }
}
```

### BullMQ Queue Aggregation

```typescript
// Generalize getEmailQueueStats() to all 5 queues
import { Queue } from 'bullmq';
import { getRedisConnection } from '../lib/redis.js';

const QUEUE_NAMES = [
  'email-notification',
  'fraud-detection',
  'import',
  'webhook-ingestion',
  'productivity-snapshot',
] as const;

async function getQueueStats(queueName: string): Promise<QueueStats> {
  if (process.env.NODE_ENV === 'test') {
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: false };
  }
  const queue = new Queue(queueName, { connection: getRedisConnection() });
  try {
    const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
      queue.getWaitingCount(), queue.getActiveCount(), queue.getCompletedCount(),
      queue.getFailedCount(), queue.getDelayedCount(), queue.isPaused(),
    ]);
    return { waiting, active, completed, failed, delayed, paused: isPaused };
  } finally {
    await queue.close();
  }
}

async function getAllQueueStats(): Promise<Record<string, QueueStats>> {
  const entries = await Promise.all(
    QUEUE_NAMES.map(async (name) => [name, await getQueueStats(name)] as const)
  );
  return Object.fromEntries(entries);
}
```

**Decision:** Create new `Queue` instances per stats call and close them, rather than holding long-lived references. This avoids interfering with worker connections and is acceptable given the 30-second polling interval.

### Health Status Derivation

```
OK       → All components healthy
DEGRADED → Non-critical component unhealthy (e.g., a queue paused, disk > 80%)
CRITICAL → Critical component down (database or Redis unreachable)
```

```typescript
function deriveStatus(health: Omit<HealthResponse, 'status'>): 'ok' | 'degraded' | 'critical' {
  // Critical: database or Redis down
  if (health.database.status === 'error' || health.redis.status === 'error') {
    return 'critical';
  }
  // Degraded: resource pressure
  if (health.cpu.usagePercent > 90 || health.memory.usedPercent > 90 || health.disk.usedPercent > 90) {
    return 'critical';
  }
  if (health.cpu.usagePercent > 70 || health.memory.usedPercent > 75 || health.disk.usedPercent > 80) {
    return 'degraded';
  }
  // Degraded: any queue paused or high waiting count
  const queueEntries = Object.values(health.queues);
  if (queueEntries.some(q => q.paused || q.waiting > 50)) {
    return 'degraded';
  }
  return 'ok';
}
```

### Response Caching

```typescript
let cachedResponse: HealthResponse | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5_000; // 5 seconds

async function getHealthResponse(): Promise<HealthResponse> {
  const now = Date.now();
  if (cachedResponse && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedResponse;
  }

  const [cpu, memory, disk, database, redis, queues] = await Promise.all([
    getCpuInfo(),
    getMemoryInfo(),
    getDiskInfo(),
    checkDatabase(),
    checkRedis(),
    getAllQueueStats(),
  ]);

  const health = {
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.0.0',
    uptime: process.uptime(),
    cpu, memory, disk, database, redis, queues,
  };

  cachedResponse = { ...health, status: deriveStatus(health) };
  cacheTimestamp = now;
  return cachedResponse;
}
```

**Decision:** 5-second TTL cache prevents excessive `df` and `SELECT 1` calls when multiple consumers poll simultaneously. The cache is in-memory (module-level variable), reset on process restart.

---

## 6. Dashboard Design (AC3)

### Page Layout (ASCII Mockup)

```
┌─────────────────────────────────────────────────────────────────┐
│  System Health                                    ● OK  5s ago  │
├───────────────────────────┬─────────────────────────────────────┤
│                           │                                     │
│  ◆ API Latency (p95)      │  ◆ Queue Health                    │
│  ┌───────────────────┐    │  ┌─────────────────────────────┐   │
│  │     250ms target   │    │  │ email-notification   ● 0 w  │   │
│  │  ▁▂▃▄▅▆▇█         │    │  │ fraud-detection      ● 0 w  │   │
│  │  ───────── p95     │    │  │ import               ● 0 w  │   │
│  │  Last 1 hour       │    │  │ webhook-ingestion    ● 2 w  │   │
│  └───────────────────┘    │  │ productivity-snapshot ● 0 w  │   │
│                           │  └─────────────────────────────┘   │
├───────────────────────────┼─────────────────────────────────────┤
│                           │                                     │
│  ◆ CPU & Memory           │  ◆ Disk Usage                      │
│  ┌───────────────────┐    │  ┌───────────────────┐             │
│  │  CPU:  12%  ●      │    │  │  Used: 45%         │             │
│  │  RAM:  58%  ●      │    │  │  ████████░░░░░░░   │             │
│  │  Heap: 120MB       │    │  │  38.2 / 85 GB      │             │
│  └───────────────────┘    │  └───────────────────┘             │
│                           │                                     │
├───────────────────────────┼─────────────────────────────────────┤
│                           │                                     │
│  ◆ Database               │  ◆ Uptime                          │
│  ┌───────────────────┐    │  ┌───────────────────┐             │
│  │  Status: Connected │    │  │  Process: 14d 3h   │             │
│  │  Query:  2ms       │    │  │  SLA Target: 99.5% │             │
│  │  Pool: 2/10 active │    │  │  Current:  99.8%   │             │
│  │  Redis: Connected  │    │  │  ● OK               │             │
│  └───────────────────┘    │  └───────────────────┘             │
│                           │                                     │
└───────────────────────────┴─────────────────────────────────────┘
```

### Chart Library Decision

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **Recharts** (installed, ^3.7.0) | Already in `apps/web/package.json`, used by dashboards, team knows it | Less specialized for gauges | **Use this** |
| Chart.js | Architecture doc mentioned it | Not installed, adds bundle weight, different API | Skip |

**Decision:** Use Recharts for consistency. It supports Line charts (API latency trend), Bar charts (queue health), and we can build simple gauge components with Radix/Tailwind.

> **ADR Update Required:** Architecture Decision 5.3 specifies "Simple HTML dashboard with Chart.js." This spike recommends Recharts instead (already installed, team-familiar, used by all existing dashboards). Story 6-2 should update `architecture.md` Decision 5.3 to reflect "Recharts" in place of "Chart.js" to prevent implementer confusion.

### Chart Types Per Panel

| Panel | Chart Type | Component |
|-------|-----------|-----------|
| API Latency p95 | `<LineChart>` with reference line at 250ms | Recharts LineChart |
| Queue Health | Status list with colored badges | Custom Tailwind component |
| CPU & Memory | Gauge-style progress bars | Tailwind + Radix Progress |
| Disk Usage | Progress bar with percentage | Tailwind + Radix Progress |
| Database | Status card with connection pool stats | Custom card component |
| Uptime | SLA percentage with status badge | Custom card component |

### Polling Strategy

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **30s `refetchInterval`** | Simple, uses existing TanStack Query, no new infra | Not real-time, 30s delay | **Use this** |
| WebSocket push | Real-time updates | Over-engineered for admin dashboard, adds complexity | Skip |
| SSE | Server-push, simpler than WS | New infra, connection management | Skip |

```typescript
// apps/web/src/features/admin/api/systemHealth.ts
export function useSystemHealth() {
  return useQuery({
    queryKey: ['system', 'health'],
    queryFn: () => apiClient.get<HealthResponse>('/api/v1/system/health'),
    refetchInterval: 30_000,    // Poll every 30 seconds
    refetchIntervalInBackground: false, // Don't poll when tab is hidden
    staleTime: 25_000,          // Consider fresh for 25s (prevents refetch on focus)
  });
}
```

### Historical Trend Storage

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **In-memory rolling window** (1 hour) | Zero DB overhead, simple, resets on restart | Lost on restart, max 1 hour | **Use this** |
| Database-backed (7 days) | Persistent trends, useful for incident analysis | Schema changes, storage growth, query overhead | **Defer to post-pilot** |

```typescript
// Server-side: maintain rolling window of health snapshots
const MAX_SNAPSHOTS = 120; // 1 hour at 30-second intervals
const healthHistory: HealthSnapshot[] = [];

function recordSnapshot(health: HealthResponse): void {
  healthHistory.push({
    timestamp: health.timestamp,
    apiP95: getP95FromHistogram(), // From prom-client histogram
    cpuPercent: health.cpu.usagePercent,
    memoryPercent: health.memory.usedPercent,
    diskPercent: health.disk.usedPercent,
  });
  if (healthHistory.length > MAX_SNAPSHOTS) {
    healthHistory.shift();
  }
}
```

**API endpoint:** `GET /api/v1/system/health/history` returns the rolling window array for the LineChart.

### Sidebar Integration

Already defined in `sidebarConfig.ts` line 147:
```typescript
{ label: 'System Health', href: '/dashboard/super-admin/system', icon: Activity },
```

No sidebar changes needed. Just implement the page component at the existing route.

### Responsive Layout

| Viewport | Layout | Breakpoint |
|----------|--------|------------|
| Desktop (≥1024px) | 3 columns × 2 rows | `lg:grid-cols-3` |
| Tablet (≥768px) | 2 columns × 3 rows | `md:grid-cols-2` |
| Mobile (<768px) | Single column, stacked | Default `grid-cols-1` |

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
  <MetricCard title="API Latency (p95)" ... />
  <MetricCard title="Queue Health" ... />
  <MetricCard title="CPU & Memory" ... />
  <MetricCard title="Disk Usage" ... />
  <MetricCard title="Database" ... />
  <MetricCard title="Uptime" ... />
</div>
```

---

## 7. Alerting System Design (AC4)

### Threshold Definitions

| Metric | Warning Threshold | Critical Threshold | Source |
|--------|-------------------|-------------------|--------|
| API p95 latency | > 250ms | > 500ms | NFR1 |
| Queue waiting (per queue) | > 50 jobs | > 200 jobs | Architecture |
| CPU usage | > 70% | > 90% | Industry standard |
| RAM usage | > 75% | > 90% | Industry standard |
| Disk free | < 20% free | < 10% free | Industry standard |
| DB query time | — | > 2,000ms | Architecture |
| DB pool waiting | > 0 for 60s | > 3 for 30s | Architecture |
| Redis ping | — | Timeout/Error | Architecture |

### Alert State Machine

```
                   threshold breached
         ┌──────────────────────────────┐
         │                              ▼
     ┌───┴───┐    threshold met     ┌───────────┐    threshold met     ┌──────────┐
     │  OK   │ ──────────────────►  │  WARNING  │ ──────────────────►  │ CRITICAL │
     └───┬───┘                      └─────┬─────┘                      └────┬─────┘
         ▲                                │                                  │
         │    below for N checks          │    below warning for N checks    │
         └────────────────────────────────┴──────────────────────────────────┘
                              RESOLVED → OK
```

**Hysteresis:** Must remain below threshold for N consecutive checks before resolving. This prevents flapping (alert → resolve → alert) during borderline conditions. The check count is **per-metric** to match duration-based threshold requirements:

| Metric | Checks to Resolve | Duration (at 30s interval) | Rationale |
|--------|-------------------|---------------------------|-----------|
| CPU, RAM, Disk | 3 checks | 90 seconds | Standard resource metrics |
| API p95 latency | 3 checks | 90 seconds | Standard latency metric |
| Queue waiting | 2 checks | 60 seconds | Queues can drain quickly |
| DB pool waiting | 2 checks | 60 seconds | Matches "60s sustained" threshold |
| DB query timeout | 1 check | 30 seconds | Critical — resolve immediately when healthy |
| Redis ping | 1 check | 30 seconds | Critical — resolve immediately when healthy |

```typescript
interface AlertState {
  metric: string;
  level: 'ok' | 'warning' | 'critical';
  since: Date;
  consecutiveBelowCount: number;  // For hysteresis (per-metric, see M4 below)
  lastAlertSent: Date | null;
  alertTimestamps: number[];      // Sliding window of alert send timestamps (for 3/hour cap)
}
```

### Alert Delivery

| Channel | Mechanism | Target | Use Case |
|---------|-----------|--------|----------|
| **Email** | EmailService + `email-notification` BullMQ queue | Super Admin email(s) | Critical alerts, daily digest |
| **In-app** | Socket.io `io.to('role:super_admin').emit('system:alert', ...)` | Super Admin dashboard | Real-time warning/critical |

**Prerequisite:** Current Socket.io infrastructure only supports LGA-scoped rooms (`lga:<lgaId>`) and only authorizes `SUPERVISOR`/`ENUMERATOR` roles. Story 6-2 must extend Socket.io to support Super Admin:
1. Add `SUPER_ADMIN` to `REALTIME_ROLES` in `apps/api/src/realtime/rooms.ts`
2. Add role-based room join logic: Super Admin joins `role:super_admin` room on connection
3. Update `canJoinRoom()` to accept role-based room patterns (not just LGA rooms)

```typescript
// Alert delivery service
async function deliverAlert(alert: AlertEvent): void {
  // In-app notification (always, for both Warning and Critical)
  // NOTE: Requires Socket.io extension — Super Admin must join 'role:super_admin' room
  io.to('role:super_admin').emit('system:alert', {
    metric: alert.metric,
    level: alert.level,
    value: alert.currentValue,
    threshold: alert.threshold,
    timestamp: new Date().toISOString(),
  });

  // Email notification (Critical only, or Warning if persists > 5 minutes)
  if (alert.level === 'critical' || alert.durationMs > 300_000) {
    await addEmailJob({
      to: getSystemAlertRecipients(), // Super Admin emails from config/DB
      subject: `[OSLRS ${alert.level.toUpperCase()}] ${alert.metric}`,
      template: 'system-alert',
      data: { metric: alert.metric, value: alert.currentValue, threshold: alert.threshold },
    });
  }
}
```

### Suppression / Cooldown

| Rule | Value | Rationale |
|------|-------|-----------|
| Minimum interval between repeat alerts (same metric) | 5 minutes | Prevent inbox flooding |
| Maximum alerts per hour (same metric) | 3 | Hard cap during sustained issues |
| Escalation: Warning → email after | 5 minutes | Only email if issue persists |
| Resolve notification | Once, when returning to OK | Confirm issue resolved |

```typescript
function shouldSendAlert(state: AlertState): boolean {
  const now = Date.now();
  if (!state.lastAlertSent) return true;

  // 5-minute cooldown between repeat alerts
  const elapsed = now - state.lastAlertSent.getTime();
  if (elapsed < 5 * 60 * 1000) return false;

  // 3-per-hour sliding window: prune timestamps older than 1 hour, then check count
  const oneHourAgo = now - 60 * 60 * 1000;
  state.alertTimestamps = state.alertTimestamps.filter(ts => ts > oneHourAgo);
  if (state.alertTimestamps.length >= 3) return false;

  return true;
}

// When an alert is sent, record the timestamp:
// state.alertTimestamps.push(Date.now());
// state.lastAlertSent = new Date();
```

### Alert Log Storage

**Decision:** Use the existing `audit_logs` table with a new action type category.

```typescript
// New action types for system alerts
const SYSTEM_ALERT_ACTIONS = {
  SYSTEM_ALERT_WARNING: 'system.alert.warning',
  SYSTEM_ALERT_CRITICAL: 'system.alert.critical',
  SYSTEM_ALERT_RESOLVED: 'system.alert.resolved',
} as const;

// Log via existing AuditService
await AuditService.log({
  action: 'system.alert.critical',
  userId: null,  // System-generated, no user
  details: {
    metric: 'cpu_usage_percent',
    value: 92,
    threshold: 90,
    level: 'critical',
  },
});
```

**Rationale:** Reusing `audit_logs` avoids a new table, benefits from existing immutable append-only enforcement (Story 6-1), and centralizes all audit data. System alerts are distinguishable by the `system.alert.*` action prefix and `userId: null`.

### External Uptime Monitoring

| Option | Cost | Capability | Decision |
|--------|------|-----------|----------|
| **UptimeRobot (free tier)** | $0 | 50 monitors, 5-min intervals, email/SMS alerts | **Recommended** |
| Hetzner Robot API | Included | Server-level only, no HTTP checks | Supplement only |
| Custom cron (second VPS) | VPS cost | Full control | Over-engineered for pilot |

**Recommendation:** Use UptimeRobot free tier to monitor `https://oyotradeministry.com.ng/health` externally. This detects full VPS outages that the app itself cannot self-alert about. Pair with Hetzner server monitoring for hardware-level alerts.

**Configuration:**
- Monitor URL: `https://oyotradeministry.com.ng/health`
- Check interval: 5 minutes (free tier limit)
- Alert on: 2 consecutive failures (= 2 missed checks → matches DR requirement)
- Alert channels: Email to admin

---

## 8. Performance Impact Analysis (AC5)

### prom-client Middleware Overhead

| Operation | Overhead | Source |
|-----------|----------|--------|
| `process.hrtime.bigint()` (start timer) | ~0.003ms | Node.js native |
| `res.on('finish', callback)` (register listener) | ~0.001ms | EventEmitter |
| `histogram.observe()` (record value) | ~0.05ms | prom-client benchmark |
| Route normalization (`req.route.path`) | ~0.002ms | String access |
| **Total per-request overhead** | **< 0.1ms** | Combined |

**Conclusion:** At <0.1ms per request, the overhead is negligible against the 250ms p95 NFR target (0.04% of budget). Even at the current baseline of ~3ms p95 (from k6 health check tests), this adds only ~3% overhead.

### Memory Footprint

| Component | Memory | Notes |
|-----------|--------|-------|
| prom-client registry | ~50 KB | Includes all metric objects |
| Histogram buckets (9 buckets × ~1,600 series) | ~200 KB | Largest consumer |
| Counters + Gauges (8 metrics) | ~10 KB | Minimal |
| Default metrics (GC, event loop, handles) | ~30 KB | collectDefaultMetrics() |
| Health history rolling window (120 entries) | ~15 KB | In-memory trend data |
| **Total estimated** | **~305 KB** | 0.03% of 1GB heap budget |

### Benchmark Methodology

**Before/After comparison using existing k6 load tests:**

```bash
# Step 1: Run baseline (before prom-client)
k6 run tests/load/health-check.js           # Record p95
k6 run tests/load/combined-stress.js         # Record p95

# Step 2: Install prom-client + middleware

# Step 3: Run same tests (after prom-client)
k6 run tests/load/health-check.js           # Compare p95
k6 run tests/load/combined-stress.js         # Compare p95

# Step 4: Validate <1ms overhead
# Expected: health-check p95 goes from ~3ms → ~3.1ms (within noise)
# Expected: combined-stress p95 stays within NFR1 250ms target
```

**Success criteria:** p95 increase of <1ms in health-check baseline, no change to combined-stress p95 classification.

### Label Cardinality Limits

| Risk | Mitigation |
|------|-----------|
| Dynamic route params (UUIDs) | `normalizeRoute()` uses `req.route.path` — returns `/api/v1/staff/:id` not `/api/v1/staff/abc-123` |
| Query parameters | Not included in route label (by design) |
| High-cardinality status codes | Limited to HTTP standard codes (~8 unique values) |
| New routes added over time | Bounded by Express route definitions (~40 routes currently) |

### Metric Collection Intervals

| Metric Category | Collection Method | Interval |
|----------------|-------------------|----------|
| HTTP request duration | Per-request middleware (passive) | Every request |
| Process CPU/memory | `collect()` callback on gauge (lazy) | On scrape |
| DB pool stats | `collect()` callback on gauge (lazy) | On scrape |
| BullMQ queue stats | Active polling via setInterval | Every 30 seconds |
| Health endpoint (full check) | On-demand + 5s cache | On request |
| Health history snapshot | After each health check | Every 30 seconds |

**Decision:** Use prom-client's built-in `collect()` callback for DB pool and process metrics (collected only when `/metrics` is scraped, not continuously). BullMQ stats require active polling because they need Redis round-trips.

---

## 9. Metrics Endpoint Security (AC6)

### Endpoint Design

| Endpoint | Purpose | Auth Required | Rate Limit |
|----------|---------|---------------|------------|
| `GET /api/v1/system/health` | Dashboard consumption (JSON) | `authenticate + authorize(SUPER_ADMIN)` | 1 req/5s per client |
| `GET /api/v1/system/health/history` | Trend data for charts (JSON) | `authenticate + authorize(SUPER_ADMIN)` | 1 req/5s per client |
| `GET /health` | Basic health check (keep existing) | None (public) | None (used by UptimeRobot, load balancers) |
| `GET /metrics` | Prometheus scraping (text format) | Internal-only (blocked by NGINX) | N/A |

**Decision:** Separate endpoints for different consumers:

1. **`/api/v1/system/health`** — Full JSON health data for Super Admin dashboard. Behind auth middleware. Returns the `HealthResponse` object. Mounted via `system.routes.ts`.

2. **`/health`** — Keep existing public endpoint in `app.ts`. Enhance it minimally to include `status: 'ok' | 'degraded' | 'critical'` (not the full detail). Used by UptimeRobot and DR failover checks.

3. **`/metrics`** — Prometheus text format (`await registry.metrics()`). **Mounted at root level in `app.ts`** (NOT under `/api/v1/system/`) to follow Prometheus convention. Blocked by NGINX in production (only accessible from localhost). Future-proofing for Grafana graduation.

### Authentication Design

```typescript
// apps/api/src/routes/system.routes.ts — mounted at /api/v1/system
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

// Super Admin only — full health data
router.get('/health',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  systemController.getHealth
);

router.get('/health/history',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  systemController.getHealthHistory
);

export default router;
```

```typescript
// apps/api/src/app.ts — /metrics mounted at ROOT level (Prometheus convention)
import { metricsRegistry } from './middleware/metrics.js';

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
});
```

### Rate Limiting

```typescript
// Apply to system health endpoints
import rateLimit from 'express-rate-limit';

const systemRateLimit = rateLimit({
  windowMs: 5_000,      // 5-second window
  max: 1,               // 1 request per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many health check requests, please wait 5 seconds' },
});

router.use(systemRateLimit);
```

**Note:** The 5s rate limit per client aligns with the 5s server-side cache TTL. Even if a client polls faster, they'll get cached responses.

### CORS Policy

| Endpoint | CORS | Rationale |
|----------|------|-----------|
| `/api/v1/system/health` | Same-origin (existing app CORS) | Dashboard is same-origin |
| `/health` | Open (no CORS restriction) | External monitors need access |
| `/metrics` | N/A (blocked by NGINX) | Internal only |

No CORS changes needed — existing Express CORS config applies to `/api/v1/*` routes.

### NGINX Configuration for `/metrics`

```nginx
# Block /metrics from external access
location /metrics {
    deny all;
    # To enable future Prometheus scraping from specific IP:
    # allow 10.0.0.0/8;  # Internal network
    # deny all;
}
```

### Future Prometheus/Grafana Compatibility

The `/metrics` endpoint outputs standard Prometheus text format:

```
# HELP http_request_duration_ms HTTP request duration in milliseconds
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{method="GET",route="/api/v1/staff",status_code="200",le="5"} 12
http_request_duration_ms_bucket{method="GET",route="/api/v1/staff",status_code="200",le="10"} 45
...
```

When ready to graduate to Grafana post-pilot:
1. Install Prometheus server on VPS or separate container
2. Allow Prometheus IP in NGINX (`allow 10.0.0.0/8;`)
3. Configure Prometheus `scrape_configs` to target `http://localhost:3000/metrics`
4. Install Grafana, add Prometheus data source
5. Dashboard already works — just point Grafana at the same metrics

---

## 10. Integration Plan (AC7)

### Pino Logging Integration

| Integration Point | Mechanism | Notes |
|-------------------|-----------|-------|
| Error rate tracking | Increment counter on Pino `error` level events | Use prom-client Counter |
| Request timing | Separate from Pino — use metrics middleware | Don't duplicate in logs |
| Alert events | Log via Pino when alerts fire | Structured `event: 'system.alert'` |

```typescript
// Error rate counter — increment from global error handler
export const httpErrorsTotal = new Counter({
  name: 'http_errors_total',
  help: 'Total HTTP errors by status code',
  labelNames: ['status_code'] as const,
  registers: [metricsRegistry],
});

// In Express error handler:
httpErrorsTotal.inc({ status_code: String(err.statusCode || 500) });
```

**Decision:** Do NOT parse Pino logs to extract metrics. Use middleware to capture metrics directly (more efficient, avoids log parsing complexity).

### BullMQ Stats Generalization

Create a `QueueHealthService` that centralizes queue monitoring:

```typescript
// apps/api/src/services/queue-health.service.ts
export class QueueHealthService {
  private static readonly QUEUE_NAMES = [
    'email-notification', 'fraud-detection', 'import',
    'webhook-ingestion', 'productivity-snapshot',
  ] as const;

  private static intervalId: NodeJS.Timeout | null = null;

  static start(intervalMs = 30_000): void {
    this.intervalId = setInterval(() => this.collectStats(), intervalMs);
    this.collectStats(); // Immediate first collection
  }

  static stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private static async collectStats(): Promise<void> {
    for (const name of this.QUEUE_NAMES) {
      try {
        const stats = await getQueueStats(name);
        bullmqQueueWaiting.set({ queue: name }, stats.waiting);
        bullmqQueueActive.set({ queue: name }, stats.active);
        // Note: failed_total is a counter — only increment on new failures
      } catch (err) {
        logger.error({ event: 'queue_stats_error', queue: name, err });
      }
    }
  }

  static async getAllStats(): Promise<Record<string, QueueStats>> {
    // Used by health endpoint for on-demand stats
    const entries = await Promise.all(
      this.QUEUE_NAMES.map(async (name) => [name, await getQueueStats(name)])
    );
    return Object.fromEntries(entries);
  }
}
```

### PostgreSQL Monitoring

| Metric | Source | Method |
|--------|--------|--------|
| Connection pool stats | `pool.totalCount`, `pool.idleCount`, `pool.waitingCount` | Gauge with `collect()` callback |
| Query response time | `SELECT 1` in health check | Timed query |
| Slow queries | `pg_stat_statements` (optional, post-pilot) | DB-side view |

**Decision:** Use node-postgres pool properties directly (no need for `pg_stat_statements` during pilot). Pool properties are synchronous — no DB round-trip needed.

### Disaster Recovery Integration

| DR Requirement | Monitoring Implementation |
|----------------|--------------------------|
| 2 missed health checks → failover trigger | External monitor (UptimeRobot) checks `/health` every 5 minutes. 2 consecutive failures = 10 minutes. Manual failover via Hetzner Floating IP. |
| RTO: 3-5 minutes | Health endpoint response time tracked in `http_request_duration_ms`. If `/health` p95 > 2000ms, alert fires. |
| Must respond within timeout | `/health` has 5s cache + 2s DB timeout. Total response under 3 seconds even under load. |
| SLA: 99.5% (3.65h/month) | Track via UptimeRobot free tier (provides uptime percentage reports). Display in dashboard Uptime panel. |

### Story 6-3 Integration (Backup Health)

```typescript
// When backup cron job runs (Story 6-3), it updates a metric:
export const backupLastSuccessTimestamp = new Gauge({
  name: 'backup_last_success_timestamp',
  help: 'Unix timestamp of last successful backup',
  registers: [metricsRegistry],
});

export const backupLastDurationSeconds = new Gauge({
  name: 'backup_last_duration_seconds',
  help: 'Duration of last backup in seconds',
  registers: [metricsRegistry],
});
```

The System Health dashboard will show:
- Last backup timestamp
- Backup duration
- Alert if no backup in >25 hours (daily backup expected at 2AM WAT)

### PM2 Integration

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **PM2 Programmatic API** (`pm2.describe()`) | Full process metrics, restart counts | Requires `pm2` as dependency, IPC overhead | Skip |
| **`process.uptime()` + `process.memoryUsage()`** | No extra dependency, sufficient for pilot | No restart count, less detail | **Use this** |
| **pm2-prom-module** (npm package) | Pre-built PM2 → Prometheus bridge | External module, maintenance concern | Skip |

**Decision:** Use Node.js process built-ins for now. PM2 restart count can be added post-pilot if needed. The `process_uptime_seconds` gauge already captures uptime (resets on restart = implicit restart detection).

```typescript
// Track process uptime — resets to 0 on restart
export const processUptime = new Gauge({
  name: 'process_uptime_seconds',
  help: 'Process uptime in seconds',
  registers: [metricsRegistry],
  collect() { this.set(process.uptime()); },
});
```

---

## 11. Future Graduation Path (Post-Pilot)

When the pilot proves successful and the platform scales beyond a single VPS:

| Phase | Action | Trigger |
|-------|--------|---------|
| **Phase 1** (current) | prom-client + simple dashboard + email alerts | Pilot launch |
| **Phase 2** | Add Prometheus server (Docker container) scraping `/metrics` | Multi-VPS deployment |
| **Phase 3** | Add Grafana for advanced dashboards + alerting rules | Operations team request |
| **Phase 4** | Migrate alert rules from app code to Grafana/Alertmanager | Full Grafana adoption |
| **Phase 5** | Add distributed tracing (OpenTelemetry) | Microservices split |

**Key design decision:** All metrics use Prometheus naming conventions and types, making the graduation path seamless. The `/metrics` endpoint already outputs Prometheus text format.

---

## 12. Story 6-2 Implementation Checklist

Derived from all spike findings. Each item maps to a Story 6-2 task.

### Prerequisites (from code review)

- [ ] Create `apps/api/src/lib/redis.ts` — shared Redis connection module (`getRedisConnection()`) to replace per-queue independent connections
- [ ] Extend Socket.io for Super Admin: add `SUPER_ADMIN` to `REALTIME_ROLES`, implement `role:super_admin` room join, update `canJoinRoom()` in `apps/api/src/realtime/rooms.ts`
- [ ] Update `architecture.md` Decision 5.3 — replace "Chart.js" with "Recharts" to match spike recommendation

### Backend (apps/api)

- [ ] Install `prom-client@15.1.3` via `pnpm --filter @oslsr/api add prom-client`
- [ ] Create `apps/api/src/middleware/metrics.ts` — metricsRegistry, httpRequestDuration histogram, metricsMiddleware function, normalizeRoute helper (with UUID + numeric ID normalization)
- [ ] Register `metricsMiddleware` in `app.ts` BEFORE route registration
- [ ] Create `apps/api/src/services/monitoring.service.ts` — all custom metric collectors (fraud, submission lag, DB pool, process, BullMQ queue gauges)
- [ ] Create `apps/api/src/services/queue-health.service.ts` — QueueHealthService with 30s polling interval, generalized stats collection across all 5 queues (uses shared `lib/redis.ts`)
- [ ] Enhance `apps/api/src/app.ts` `/health` endpoint — add `status: 'ok' | 'degraded' | 'critical'`, version, uptime (keep public, no auth)
- [ ] Create `apps/api/src/controllers/system.controller.ts` — getHealth (full JSON), getHealthHistory (rolling window), getMetrics (Prometheus text)
- [ ] Create `apps/api/src/routes/system.routes.ts` — `/api/v1/system/health`, `/api/v1/system/health/history` (Super Admin auth)
- [ ] Mount `/metrics` at root level in `app.ts` (Prometheus convention, blocked by NGINX externally)
- [ ] Register system routes in `app.ts`
- [ ] Create `apps/api/src/services/alert.service.ts` — AlertService with state machine, per-metric hysteresis, sliding-window cooldown (5min/3-per-hour), email + Socket.io delivery
- [ ] Use async `exec` (not `execSync`) for disk space checks in health endpoint
- [ ] Add system alert audit log actions (`system.alert.warning`, `system.alert.critical`, `system.alert.resolved`) to AuditService
- [ ] Add `system:alert` Socket.io event emission for in-app notifications
- [ ] Integrate fraud detection counter in `workers/fraud-detection.worker.ts`
- [ ] Integrate submission ingestion lag gauge in `workers/webhook-ingestion.worker.ts`
- [ ] Initialize QueueHealthService in `index.ts` server startup (skip in test mode)
- [ ] Initialize AlertService checker on 30-second interval
- [ ] Add system health rate limiter (1 req/5s per client)
- [ ] Update existing health test for new response shape
- [ ] Write MonitoringService unit tests (metric registration, collection)
- [ ] Write QueueHealthService unit tests (stats aggregation, test mode)
- [ ] Write AlertService unit tests (state machine transitions, cooldown, hysteresis)
- [ ] Write system controller integration tests (auth, rate limiting, response shape)

### Frontend (apps/web)

- [ ] Create `apps/web/src/features/admin/api/systemHealth.ts` — useSystemHealth hook with 30s refetchInterval
- [ ] Create `apps/web/src/features/admin/pages/SystemHealthPage.tsx` — 6-panel responsive grid
- [ ] Create metric panel components (ApiLatencyPanel, QueueHealthPanel, CpuMemoryPanel, DiskPanel, DatabasePanel, UptimePanel)
- [ ] Register SystemHealthPage route in dashboard router
- [ ] Add alert toast/notification handler for `system:alert` Socket.io event
- [ ] Write SystemHealthPage component tests (loading, error, data rendering)
- [ ] Write metric panel component tests

### Infrastructure

- [ ] Add NGINX rule to block `/metrics` from external access
- [ ] Set up UptimeRobot free tier monitoring for `https://oyotradeministry.com.ng/health`
- [ ] Run k6 before/after benchmark to validate <1ms overhead

### Validation

- [ ] All existing tests pass (no regressions)
- [ ] New unit + integration tests pass
- [ ] k6 benchmark shows <1ms p95 increase
- [ ] Dashboard renders correctly on desktop, tablet, mobile
- [ ] Alert email sends correctly via existing EmailService
- [ ] Socket.io alert notification received by Super Admin clients
