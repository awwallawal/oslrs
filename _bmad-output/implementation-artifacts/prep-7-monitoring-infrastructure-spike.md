# Prep 7: Monitoring Infrastructure Spike

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the development team,
I want a thoroughly researched architecture design for lightweight system health monitoring covering prom-client integration, metric definitions, dashboard design, alerting thresholds, and enhanced health endpoint,
so that Story 6-2 implementation has a proven, decision-complete blueprint that prevents rework.

## Context

**This is a RESEARCH SPIKE, not an implementation story.** The deliverable is a spike document (`_bmad-output/implementation-artifacts/prep-7-monitoring-infrastructure-spike-summary.md`) containing architecture decisions, metric schemas, comparison tables, and recommendations. No production code changes.

### Current State

The OSLRS platform has minimal monitoring infrastructure:

- **Basic health endpoint**: `GET /health` returns `{ status: 'ok', timestamp }` — no CPU, RAM, disk, DB, or queue health
- **Pino logging**: Structured JSON logging via Pino 9.1 (fastest Node.js logger) — but no metrics collection
- **5 BullMQ queues**: email-notification, fraud-detection, import, webhook-ingestion, productivity-snapshot — only email queue exposes stats via `getEmailQueueStats()`
- **No metrics library**: `prom-client` is NOT installed — no Prometheus-compatible metric collection
- **No dashboard**: No System Health page in Super Admin dashboard
- **No alerting**: No automated threshold breach notifications
- **Portainer**: Visual container management available at port 9443 (Docker health checks for PostgreSQL and Redis)

### Architecture Decision Already Made (Decision 5.3)

From `architecture.md` lines 1543-1659:

> **Lightweight metrics using `prom-client` + simple HTML dashboard (NOT full Prometheus/Grafana)**
>
> Rationale: Full Prometheus + Grafana stack is too heavy for single VPS during pilot phase. `prom-client` exports Prometheus-compatible metrics (future-proof for Grafana upgrade). Simple dashboard with charts sufficient for Super Admin visibility. Can graduate to full Grafana post-pilot.

### NFR Performance Targets

| NFR | Target | Measurement |
|-----|--------|-------------|
| NFR1 — Performance | 250ms p95 API response time | API receipt to response completion |
| NFR2 — Scalability | 200 staff baseline, alert at 60%/90% capacity | Active user count |
| NFR3 — Availability | 99.5% SLA (3.65h/month max downtime) | Health endpoint uptime |
| Submission Ingestion | <5 seconds p95 | Form submit to dashboard visible |

### What Needs Designing (Story 6-2)

- **No prom-client integration** — library not installed, no middleware for HTTP request timing
- **No custom metrics** — no fraud detection counter, queue lag gauge, or DB pool gauge
- **No metrics endpoint** — no `/api/v1/metrics` route for Prometheus-compatible scraping
- **No dashboard components** — no System Health page in Super Admin area
- **No alerting system** — no threshold breach detection or email notification
- **No enhanced health endpoint** — no CPU/RAM/disk/queue data in `/health`
- **No uptime tracking** — no SLA monitoring or historical availability data

## Acceptance Criteria

**AC1**: Given the spike is complete, when reviewed, then it contains a `prom-client` integration design with: installation plan, middleware for automatic HTTP request timing (`http_request_duration_ms` histogram), and at least 4 custom metric definitions (queue lag, fraud detections, DB pool, submission ingestion lag) with type, labels, and units.

**AC2**: Given the spike document, when reviewed, then it contains an enhanced health endpoint design with: CPU usage (`os.cpus()`), RAM usage (`os.totalmem()`/`os.freemem()`), disk space, PostgreSQL connectivity check, Redis connectivity check, and aggregated BullMQ queue health across all 5 queues.

**AC3**: Given the spike document, when reviewed, then it contains a Super Admin dashboard design with: layout mockup (ASCII), chart types per metric (gauge, line chart, status badge), polling strategy (interval, WebSocket, or SSE), and integration with existing Super Admin sidebar routing.

**AC4**: Given the spike document, when reviewed, then it contains an alerting design with: threshold definitions per metric (from NFRs), delivery channels (email via existing EmailService/BullMQ, in-app via Socket.io), alert state machine (OK → Warning → Critical → Resolved), and suppression/cooldown logic to prevent alert storms.

**AC5**: Given the spike document, when reviewed, then it contains a performance impact analysis with: overhead estimate of prom-client middleware on p95 API latency, memory footprint of metric collectors, and benchmark methodology to validate <1ms overhead per request.

**AC6**: Given the spike document, when reviewed, then it contains a metrics endpoint security design with: authentication requirement (Super Admin only vs. internal-only), rate limiting, CORS policy, and future Prometheus/Grafana scraping compatibility.

**AC7**: Given the spike document, when reviewed, then it contains an integration plan showing how monitoring connects to: existing Pino logging, BullMQ queue stats, PostgreSQL connection pool, disaster recovery health checks (2 missed checks → failover), and Story 6-3 backup health status.

## Tasks / Subtasks

- [x] Task 1: Design prom-client integration and metric definitions (AC: #1)
  - [x] 1.1 Research `prom-client` latest stable version, API surface, Express middleware patterns
  - [x] 1.2 Design HTTP request duration metric: `http_request_duration_ms` histogram with labels `[method, route, status_code]`, target p95 < 250ms
  - [x] 1.3 Design fraud detection metric: `fraud_detections_total` counter with label `[heuristic]` (GPS Cluster, Speed Run, Straight-lining)
  - [x] 1.4 Design submission ingestion lag metric: `submission_ingestion_lag_seconds` gauge, target < 5s p95
  - [x] 1.5 Design DB connection pool metric: `db_connection_pool_active` gauge (current active connections vs pool max)
  - [x] 1.6 Design BullMQ queue metrics: `bullmq_queue_waiting` gauge per queue, `bullmq_queue_failed_total` counter per queue
  - [x] 1.7 Design process metrics: `process_cpu_usage_percent` gauge, `process_memory_usage_bytes` gauge (from `os` module)
  - [x] 1.8 Document all metrics in a schema table: name, type, labels, unit, target threshold, action if breached
- [x] Task 2: Design enhanced health endpoint (AC: #2)
  - [x] 2.1 Design extended `/health` response shape: `{ status, timestamp, version, uptime, cpu, memory, disk, database, redis, queues }`
  - [x] 2.2 Design CPU/RAM collection: `os.cpus()`, `os.totalmem()`, `os.freemem()`, `process.memoryUsage()`
  - [x] 2.3 Design disk space check: `child_process` exec `df -h /` or `statvfs` equivalent on Linux VPS
  - [x] 2.4 Design PostgreSQL health check: `SELECT 1` query with timeout (e.g., 2 seconds)
  - [x] 2.5 Design Redis health check: `redis.ping()` with timeout
  - [x] 2.6 Design BullMQ queue aggregation: generalize `getEmailQueueStats()` pattern to all 5 queues, return waiting/active/failed counts
  - [x] 2.7 Design health status derivation: OK (all green), DEGRADED (non-critical component unhealthy), CRITICAL (database/Redis down)
  - [x] 2.8 Evaluate response caching: cache health response for 5-10 seconds to prevent excessive system calls under polling
- [x] Task 3: Design Super Admin monitoring dashboard (AC: #3)
  - [x] 3.1 Design page layout: 6-panel grid (API Latency p95, Queue Health, CPU/RAM, Disk, Database, Uptime)
  - [x] 3.2 Evaluate chart library: use existing Recharts (already installed for dashboards) vs Chart.js (architecture suggested) — recommend Recharts for consistency
  - [x] 3.3 Design polling strategy: 30-second interval via `useQuery` with `refetchInterval`, compare vs WebSocket/SSE push
  - [x] 3.4 Design status badges: green (OK), amber (Warning), red (Critical) per metric panel
  - [x] 3.5 Design historical trend storage: in-memory rolling window (last 1 hour) vs database-backed (last 7 days) vs both
  - [x] 3.6 Design sidebar integration: add "System Health" item to Super Admin nav in `sidebarConfig.ts` (already defined at `/dashboard/super-admin/system`)
  - [x] 3.7 Design responsive layout: desktop 3×2 grid, tablet 2×3, mobile stacked cards
- [x] Task 4: Design alerting system (AC: #4)
  - [x] 4.1 Define alert thresholds per metric from NFRs:
    - API p95 > 250ms → Warning; > 500ms → Critical
    - Queue waiting > 50 → Warning; > 200 → Critical
    - CPU > 70% → Warning; > 90% → Critical
    - RAM > 75% → Warning; > 90% → Critical
    - Disk < 20% free → Warning; < 10% → Critical
    - DB query timeout → Critical
    - Redis ping timeout → Critical
  - [x] 4.2 Design alert state machine: OK → Warning → Critical → Resolved, with hysteresis (must stay below threshold for N checks before resolving)
  - [x] 4.3 Design alert delivery: email via existing EmailService + `email-notification` BullMQ queue, in-app notification via Socket.io
  - [x] 4.4 Design suppression/cooldown: minimum 5 minutes between repeat alerts for same metric, max 3 alerts per hour per metric
  - [x] 4.5 Design alert log storage: `system_alerts` table or extend `audit_logs` with system action types?
  - [x] 4.6 Evaluate external uptime monitoring: UptimeRobot, Hetzner API health checks, or custom cron — for detecting when the entire VPS is down (can't self-alert)
- [x] Task 5: Analyze performance impact of metrics collection (AC: #5)
  - [x] 5.1 Research prom-client middleware overhead: typical <0.1ms per request based on library benchmarks
  - [x] 5.2 Estimate memory footprint: histogram buckets, counter storage, label cardinality impact
  - [x] 5.3 Design benchmark methodology: before/after load test with k6 (from prep-epic-3/prep-6 baseline), compare p95 with and without metrics middleware
  - [x] 5.4 Evaluate label cardinality limits: route normalization to prevent metric explosion (e.g., `/users/:id` not `/users/abc123`)
  - [x] 5.5 Design metric collection intervals: process metrics every 10 seconds, queue metrics every 30 seconds
- [x] Task 6: Design metrics endpoint security (AC: #6)
  - [x] 6.1 Evaluate access patterns: Super Admin dashboard polling vs external Prometheus scraper vs both
  - [x] 6.2 Design authentication: `authenticate + authorize(SUPER_ADMIN)` for dashboard API, separate internal-only `/metrics` for future Prometheus
  - [x] 6.3 Design rate limiting: max 1 request per 5 seconds per client for health/metrics endpoints
  - [x] 6.4 Design CORS policy: same-origin only for dashboard, restrictable for metrics endpoint
  - [x] 6.5 Evaluate `/api/v1/system/health` vs `/api/v1/metrics` vs both — separate endpoints for dashboard consumption vs Prometheus scraping
- [x] Task 7: Design integration plan with existing infrastructure (AC: #7)
  - [x] 7.1 Map Pino log events to metric collection: error rate counter from logged errors, request timing from middleware
  - [x] 7.2 Design BullMQ stats generalization: create `QueueHealthService` that polls all 5 queues (email, fraud, import, webhook, productivity-snapshot)
  - [x] 7.3 Design PostgreSQL monitoring: connection pool stats from Drizzle/node-postgres, `pg_stat_statements` for slow query detection
  - [x] 7.4 Design disaster recovery integration: health endpoint used for 2-missed-check failover trigger, must include response time SLA
  - [x] 7.5 Design Story 6-3 integration: backup job status from BullMQ (success/failure, last run timestamp), appear in System Health dashboard
  - [x] 7.6 Design PM2 integration: process restart count, uptime, CPU/memory from PM2 API or ecosystem config
- [x] Task 8: Write spike summary document (all ACs)
  - [x] 8.1 Compile all research into `_bmad-output/implementation-artifacts/prep-7-monitoring-infrastructure-spike-summary.md`
  - [x] 8.2 Include metric schema table, dashboard layout mockup (ASCII), alert threshold matrix, and integration diagram
  - [x] 8.3 Include reference code snippets for prom-client middleware, health endpoint handler, and dashboard component
  - [x] 8.4 Include Story 6-2 implementation checklist derived from spike findings
- [x] Task 9: Update story status and dev agent record

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: Spike references non-existent `getRedisConnection` from `queues/connection.js` — no shared Redis connection module exists. Each queue uses independent connections. Add prerequisite note and fix code references. [spike-summary.md:469,488]
- [x] [AI-Review][HIGH] H2: Alert delivery assumes `io.to('role:super_admin')` role-based Socket.io rooms — but only LGA rooms exist and `super_admin` not in `REALTIME_ROLES`. Document Socket.io extension prerequisite. [spike-summary.md:785-786]
- [x] [AI-Review][HIGH] H3: Alert cooldown `alertCount` has no hourly reset — causes permanent suppression after 3 alerts. Replace with sliding window tracking alert timestamps. [spike-summary.md:819]
- [x] [AI-Review][MEDIUM] M1: Executive summary says "8 custom metrics" but Section 4 table defines 12 metrics. Fix count to 12. [spike-summary.md:15]
- [x] [AI-Review][MEDIUM] M2: `/metrics` endpoint path inconsistency — prose says root `GET /metrics` but code puts it in system router (`/api/v1/system/metrics`). Clarify root-level mounting. [spike-summary.md:949 vs 982]
- [x] [AI-Review][MEDIUM] M3: `getDiskInfo()` uses `execSync` blocking the event loop. Replace with async `exec` from `node:child_process/promises`. [spike-summary.md:414-428]
- [x] [AI-Review][MEDIUM] M4: Duration-based alert thresholds (e.g., "> 0 for 60s") don't map cleanly to uniform 3-check hysteresis (90s). Add per-metric hysteresis configuration. [spike-summary.md:743 vs 761]
- [x] [AI-Review][MEDIUM] M5: Architecture deviation (Chart.js → Recharts) not flagged as needing ADR update in architecture.md. Add explicit note. [spike-summary.md:634-639]
- [x] [AI-Review][LOW] L1: Story File List labels `prep-7-monitoring-infrastructure-spike.md` as MODIFIED but git shows untracked (NEW). Fix label. [story:363]
- [x] [AI-Review][LOW] L2: `normalizeRoute()` UUID-only regex won't catch numeric ID segments. Add numeric fallback for future-proofing. [spike-summary.md:156-159]

## Dev Notes

### Architecture Decision 5.3: Lightweight Monitoring

From `architecture.md` — the monitoring approach is already decided:

**DO use:**
- `prom-client` for Prometheus-compatible metric collection
- Simple dashboard with charts in Super Admin area
- Email alerts for critical thresholds via existing EmailService + BullMQ

**DO NOT use:**
- Full Prometheus server (too heavy for single VPS pilot)
- Grafana (can graduate post-pilot if needed)
- External APM services (DataDog, New Relic — cost and data residency concerns)

### Key Metrics Defined in Architecture

| Metric | Type | Labels | Target | Action if Breached |
|--------|------|--------|--------|-------------------|
| `http_request_duration_ms` | Histogram | method, route, status_code | p95 < 250ms | Add DB indexes, optimize queries |
| `fraud_detections_total` | Counter | heuristic | Monitor trend | Check threshold tuning |
| `submission_ingestion_lag_seconds` | Gauge | — | < 5s p95 | Scale BullMQ workers, check queue |
| `db_connection_pool_active` | Gauge | — | < max pool | Investigate connection leak |

### Existing Infrastructure to Build On

| Component | Location | Relevance |
|-----------|----------|-----------|
| Health endpoint | `apps/api/src/app.ts` lines 78-82 | Enhance with detailed metrics |
| Health test | `apps/api/src/__tests__/health.test.ts` | Extend for new response shape |
| Pino logger | `apps/api/src/app.ts` | Structured JSON logs, configurable level |
| BullMQ queues | `apps/api/src/queues/` (5 queue files) | Queue health stats collection |
| BullMQ workers | `apps/api/src/workers/` (5 worker files) | Worker processing metrics |
| Email queue stats | `apps/api/src/queues/email.queue.ts` `getEmailQueueStats()` | Pattern to generalize to all queues |
| EmailService | `apps/api/src/services/email.service.ts` | Alert delivery channel |
| Socket.io | `apps/api/src/realtime/` | In-app notification delivery |
| Recharts | `apps/web/package.json` (already installed) | Dashboard chart library |
| Docker health | `docker-compose.dev.yml` | PostgreSQL/Redis health check patterns |
| PM2 | Production process manager | Process metrics, restart tracking |
| Portainer | Port 9443 | Visual container health (operations team) |
| k6 load tests | `tests/load/` (from prep-epic-3/prep-6) | Baseline performance benchmarks |

### BullMQ Queue Inventory

| Queue | File | Worker | Purpose |
|-------|------|--------|---------|
| email-notification | `queues/email.queue.ts` | `workers/email.worker.ts` | Staff invitations, password reset, verification |
| fraud-detection | `queues/fraud-detection.queue.ts` | `workers/fraud-detection.worker.ts` | Async fraud heuristic evaluation |
| import | `queues/import.queue.ts` | `workers/import.worker.ts` | CSV bulk staff import |
| webhook-ingestion | `queues/webhook-ingestion.queue.ts` | `workers/webhook-ingestion.worker.ts` | Submission processing |
| productivity-snapshot | `queues/productivity-snapshot.queue.ts` | `workers/productivity-snapshot.worker.ts` | Nightly daily stats aggregation |

### Capacity Headroom (from Architecture)

| Component | Capacity | Peak Load | Headroom |
|-----------|----------|-----------|----------|
| Express API | 10,000 req/sec | 0.55 req/sec | 18,182× |
| PostgreSQL | 5,000 writes/sec | 0.55 writes/sec | 9,091× |
| Redis/BullMQ | 100,000 ops/sec | 0.55 ops/sec | 181,818× |
| **Fraud Detection** | **40 checks/sec** | **0.55 checks/sec** | **73×** (bottleneck) |

### Disaster Recovery Health Check Requirements

From `architecture.md` lines 1783-1790:
1. Monitoring alerts after **2 missed health checks** → trigger failover
2. **RTO**: 3-5 minutes for instance failover via Floating IP
3. Health endpoint must respond within timeout to count as "alive"
4. External monitoring needed — app can't self-detect when VPS is completely down

### Dashboard Route (Already Defined)

From `sidebarConfig.ts`, Super Admin already has:
- System Health → `/dashboard/super-admin/system` (sidebar item exists, page not yet implemented)

From `architecture.md` line 3721, planned file structure:
```
apps/web/src/features/admin/pages/
├── SystemHealth.tsx          ← System Health metrics (Story 6-2)
├── MetricsDashboard.tsx      ← Lightweight metrics dashboard
├── BackupStatus.tsx          ← Backup health (Story 6-3)
```

### Package Dependencies

**Currently installed (relevant):**
- `pino`: 9.1.0 (structured logging)
- `bullmq`: 5.7.10 (job queues)
- `ioredis`: 5.4.1 (Redis client)
- `recharts`: installed in `apps/web` (chart library for dashboards)

**Needs installation for Story 6-2:**
- `prom-client`: NOT yet installed (this spike must validate version and integration)

### Spike Document Template

The output document should follow this structure:
1. Executive Summary
2. Current State Analysis (existing health endpoint, logging, queues)
3. prom-client Integration Design (middleware, custom collectors)
4. Metric Definitions (schema table with all metrics)
5. Enhanced Health Endpoint Design (response shape, checks)
6. Dashboard Design (layout mockup, chart types, polling strategy)
7. Alerting System Design (thresholds, state machine, delivery, suppression)
8. Performance Impact Analysis (overhead estimates, benchmark plan)
9. Metrics Endpoint Security (auth, rate limiting, CORS)
10. Integration Plan (Pino, BullMQ, PostgreSQL, DR, backups)
11. Future Graduation Path (Prometheus server, Grafana, post-pilot)
12. Story 6-2 Implementation Checklist

### Project Structure Notes

- Spike output: `_bmad-output/implementation-artifacts/prep-7-monitoring-infrastructure-spike-summary.md`
- No frontend changes needed for this spike
- No production code changes — research only
- Future middleware location: `apps/api/src/middleware/metrics.ts` (prom-client HTTP middleware)
- Future service location: `apps/api/src/services/monitoring.service.ts` (health checks, queue stats)
- Future route location: `apps/api/src/routes/system.routes.ts` (metrics + health endpoints)
- Future dashboard location: `apps/web/src/features/admin/pages/SystemHealth.tsx`

### Testing Standards

- This is a research spike — no production code tests needed
- Reference code snippets should be syntactically valid TypeScript
- Performance impact analysis should include testable benchmark methodology
- Alert threshold definitions should include testable assertions for Story 6-2
- Run existing health test to confirm baseline: `pnpm vitest run apps/api/src/__tests__/health.test.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#L1837-1848] — Story 6-2 acceptance criteria
- [Source: _bmad-output/planning-artifacts/prd.md#L785] — System health dashboard requirements
- [Source: _bmad-output/planning-artifacts/architecture.md#L52-63] — NFR1 (250ms p95), NFR2 (scalability), NFR3 (99.5% SLA)
- [Source: _bmad-output/planning-artifacts/architecture.md#L1543-1659] — Decision 5.3: Lightweight monitoring (prom-client + simple dashboard)
- [Source: _bmad-output/planning-artifacts/architecture.md#L1670-1738] — Capacity headroom analysis (73× over-provisioned)
- [Source: _bmad-output/planning-artifacts/architecture.md#L1783-1790] — Disaster recovery health check requirements
- [Source: _bmad-output/planning-artifacts/architecture.md#L1370-1377] — Pino 9.x logging decision
- [Source: _bmad-output/planning-artifacts/architecture.md#L3721] — Planned SystemHealth.tsx file location
- [Source: _bmad-output/implementation-artifacts/epic-5-retro-2026-02-24.md#L246] — prep-7 task definition
- [Source: apps/api/src/app.ts#L78-82] — Current health endpoint (basic status only)
- [Source: apps/api/src/__tests__/health.test.ts] — Existing health endpoint test
- [Source: apps/api/src/queues/email.queue.ts] — getEmailQueueStats() pattern
- [Source: apps/api/src/queues/] — All 5 BullMQ queue definitions
- [Source: apps/api/src/workers/] — All 5 BullMQ worker implementations
- [Source: apps/api/src/services/email.service.ts] — EmailService for alert delivery
- [Source: apps/api/src/realtime/] — Socket.io infrastructure for in-app notifications
- [Source: docs/infrastructure-cicd-playbook.md] — PM2, NGINX, Docker, Portainer deployment patterns
- [Source: _bmad-output/planning-artifacts/epics.md#L1850-1861] — Story 6-3 (backup orchestration) — monitoring integration

### Previous Story Intelligence

**From prep-6-view-as-authentication-spike (previous prep task):**
- Research spike pattern well-established — comparison tables, security analysis, API endpoint designs
- No direct overlap with monitoring, but View-As audit trail logs will appear in monitoring metrics

**From prep-5-remuneration-domain-modeling (earlier prep task):**
- BullMQ notification queue pattern applicable to alert delivery
- EmailService integration pattern (provider pattern, queue via BullMQ) directly applicable to alert emails

**From prep-4-immutable-audit-log-spike (earlier prep task):**
- Audit log ingestion rate is a candidate monitoring metric
- Hash chain verification could be a scheduled health check
- Story 6-1 (audit logs) may need monitoring for table growth / partitioning alerts

**From prep-epic-3/prep-6 (Load Test Baseline):**
- k6 load test scripts exist for baseline performance benchmarks
- Can reuse for before/after comparison of prom-client overhead
- Baseline p95 numbers available for threshold calibration

**From Epic 5 Retrospective (Three-Layer Quality Model):**
- "Automated tests catch code bugs, adversarial review catches architectural gaps, UAT catches integration and UX issues"
- Monitoring is the fourth layer: catches infrastructure/performance issues before users are affected
- System Health dashboard serves as continuous post-deployment verification

### Git Intelligence

Recent commits are Epic 5 completions and prep fixes:
- `ab03648 fix(web,api): fix CI build errors` — latest
- `328ad63 fix(web): fix ExportPage LGA race condition + code review fixes (prep-1)` — bug fix pattern
- `bd5a443 docs: complete Epic 5 retrospective and define Epic 6 prep phase` — retro defining this spike
- `92f8a2b fix(api,web): use dynamic productivity targets across all dashboards` — shows dashboard data polling patterns
- `3e0e1c9 feat(api,web): add super admin cross-LGA analytics and government official view (Story 5.6b)` — shows cross-role dashboard analytics

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — research spike, no production code changes.

### Completion Notes List

- Researched prom-client v15.1.3 (latest stable) — ESM-compatible, async API, ~0.1ms overhead per request
- Decided against express-prom-bundle — direct prom-client integration gives better control over route normalization
- Designed 12 custom metrics covering HTTP latency, fraud detections, submission ingestion lag, DB pool, BullMQ queues, and process resources
- Designed enhanced health endpoint with CPU (os.loadavg), RAM (os.totalmem/freemem), disk (df -B1), PostgreSQL (SELECT 1), Redis (ping), and 5 BullMQ queues
- Health status derivation: OK/DEGRADED/CRITICAL based on component health and resource thresholds
- 5-second response cache to prevent excessive system calls under dashboard polling
- Recommended Recharts (already installed ^3.7.0) over Chart.js for dashboard consistency
- 30-second polling via TanStack Query refetchInterval — simpler than WebSocket/SSE push for admin dashboard
- In-memory rolling window (120 entries = 1 hour) for trend charts — database-backed history deferred to post-pilot
- Alert state machine with 3-check hysteresis to prevent flapping, 5-minute cooldown, 3-per-hour cap
- Alert delivery via existing EmailService + BullMQ (email) and Socket.io (in-app)
- Alert logs stored in existing audit_logs table with system.alert.* action prefix
- Recommended UptimeRobot (free tier) for external monitoring — detects full VPS outages
- Designed 4 endpoints: /health (public, enhanced), /api/v1/system/health (Super Admin), /api/v1/system/health/history (Super Admin), /metrics (internal Prometheus)
- QueueHealthService generalizes getEmailQueueStats() pattern to all 5 queues
- PM2 integration deferred — process.uptime() + process.memoryUsage() sufficient for pilot
- Label cardinality bounded at ~1,600 time series (40 routes × 5 methods × 8 status codes)
- Total memory footprint ~305 KB (0.03% of 1GB heap budget)
- k6 load test baseline available for before/after overhead validation
- Story 6-2 implementation checklist with 22 backend + 7 frontend + 3 infrastructure items
- Code review (2026-02-25): 10 findings (3H, 5M, 2L) all fixed. Key fixes: shared Redis module prerequisite, Socket.io Super Admin room extension, sliding-window alert cooldown, async disk check, per-metric hysteresis, /metrics root mounting, Recharts ADR update note.

### Change Log

- 2026-02-25: Spike complete — all 9 tasks done, all 7 ACs satisfied. Spike summary document created.
- 2026-02-25: Code review passed — 10 findings (3H, 5M, 2L), all 10 fixed in spike summary. H1 shared Redis module prerequisite, H2 Socket.io role room extension documented, H3 sliding-window cooldown replacing counter, M1 metric count 8→12, M2 /metrics root mounting clarified, M3 execSync→async exec, M4 per-metric hysteresis table, M5 ADR update note for Recharts, L1 file list label fix, L2 numeric ID route normalization added.

### File List

- `_bmad-output/implementation-artifacts/prep-7-monitoring-infrastructure-spike-summary.md` (NEW — spike deliverable)
- `_bmad-output/implementation-artifacts/prep-7-monitoring-infrastructure-spike.md` (NEW — story file with task checkboxes, status, dev agent record)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFIED — prep-7 status: ready-for-dev → review)
