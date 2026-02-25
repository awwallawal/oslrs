# Prep 8: Backup Orchestration Research

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the development team,
I want a thoroughly researched architecture design for automated off-site backup orchestration covering pg_dump vs VPS snapshots, S3-compatible storage, encryption strategy, 7-year NDPA retention policy, and restore verification procedures,
so that Story 6-3 implementation has a proven, decision-complete blueprint that prevents rework.

## Context

**This is a RESEARCH SPIKE, not an implementation story.** The deliverable is a spike document (`_bmad-output/implementation-artifacts/prep-8-backup-orchestration-research-summary.md`) containing architecture decisions, comparison tables, cost projections, and recommendations. No production code changes.

### Current State

The OSLRS platform has partial backup infrastructure:

- **S3 client library installed**: `@aws-sdk/client-s3` (v3.964.0) and `@aws-sdk/s3-request-presigner` (v3.966.0) already in `apps/api/package.json`
- **S3 connection test script**: `scripts/test-s3-connection.ts` validates ListObjects, PutObject, DeleteObject against DigitalOcean Spaces
- **S3 env vars defined**: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` in `.env.example`
- **BullMQ scheduled job pattern**: Proven via productivity-snapshot queue (`upsertJobScheduler()` with cron pattern, 22:59 UTC = 23:59 WAT)
- **5 existing BullMQ queues/workers**: email-notification, fraud-detection, import, webhook-ingestion, productivity-snapshot
- **PostgreSQL 15 in Docker**: Data persisted in `postgres_data` named volume, health check via `pg_isready`
- **Redis 7 in Docker**: Data persisted in `redis_data` named volume, health check via `redis-cli ping`
- **EmailService**: Provider pattern (Resend for production), supports HTML/plain-text with OSLSR branding

### What's Missing

- **No backup job**: No BullMQ queue/worker for database backups
- **No pg_dump automation**: No script to dump PostgreSQL and upload to S3
- **No encryption strategy**: No decision on server-side vs application-level encryption
- **No retention management**: No lifecycle policy for 7-day rolling + monthly snapshots × 7 years
- **No restore procedure**: No automated or manual restore script
- **No restore drills**: No monthly verification process (required by NFR3.3)
- **No backup monitoring**: No success/failure tracking or alerting
- **No PITR capability**: No point-in-time recovery beyond VPS snapshots

## Acceptance Criteria

**AC1**: Given the spike is complete, when reviewed, then it contains a comparison of at least 3 backup strategies (pg_dump + S3 upload, VPS provider snapshots, PostgreSQL WAL archiving/PITR) with pros/cons/recommendation for the single-VPS pilot deployment.

**AC2**: Given the spike document, when reviewed, then it contains an encryption design with: algorithm selection (AES-256-GCM vs S3 server-side encryption), key management approach (environment variable vs KMS), key rotation policy, and disaster recovery of encryption keys.

**AC3**: Given the spike document, when reviewed, then it contains a 7-year NDPA retention policy design with: S3 directory structure, lifecycle rules (7-day daily rolling window + monthly snapshots retained 7 years), storage cost projections, and purge automation.

**AC4**: Given the spike document, when reviewed, then it contains a BullMQ backup job design with: queue definition, cron schedule (2:00 AM WAT = 1:00 UTC), worker implementation pattern (following productivity-snapshot pattern), pg_dump execution strategy (Docker exec vs direct), error handling, and retry policy.

**AC5**: Given the spike document, when reviewed, then it contains a restore procedure design with: manual restore steps, automated restore script outline, staging environment validation, integrity checks (record counts, checksum verification), and estimated restore time for projected database sizes.

**AC6**: Given the spike document, when reviewed, then it contains a monthly restore drill design with: checklist, automation level (fully automated vs semi-manual), success criteria, notification to Super Admin on completion, and compliance documentation template.

**AC7**: Given the spike document, when reviewed, then it contains backup monitoring integration with: success/failure tracking, email notification via existing EmailService on failure, dashboard integration with Story 6-2 (System Health), and alert escalation if N consecutive backups fail.

## Tasks / Subtasks

- [ ] Task 1: Research and compare backup strategies (AC: #1)
  - [ ] 1.1 Research `pg_dump` + S3 upload: execution via `docker exec postgres pg_dump`, compression (gzip/zstd), upload via `@aws-sdk/client-s3` PutObject, timing estimates for projected DB sizes
  - [ ] 1.2 Research VPS provider snapshots: Hetzner API snapshots, DigitalOcean droplet snapshots, scheduling, cost, restore procedure, limitations (full-system only, not DB-specific)
  - [ ] 1.3 Research PostgreSQL WAL archiving / PITR: `archive_command`, `wal_level=replica`, continuous archiving to S3, point-in-time recovery granularity, complexity vs benefit for single-VPS pilot
  - [ ] 1.4 Research hybrid approach: VPS snapshots (every 6 hours per NFR) + pg_dump daily to S3 (portable, verifiable)
  - [ ] 1.5 Document comparison table with: RPO, RTO, cost, complexity, portability, compliance suitability
  - [ ] 1.6 Recommend approach for pilot phase and graduation path for post-pilot
- [ ] Task 2: Design encryption strategy (AC: #2)
  - [ ] 2.1 Evaluate S3 server-side encryption (SSE-S3): automatic, no key management, DigitalOcean Spaces support
  - [ ] 2.2 Evaluate application-level encryption: AES-256-GCM via Node.js `crypto`, encrypt before upload, decrypt after download
  - [ ] 2.3 Evaluate S3 server-side with customer key (SSE-C): balance of control and simplicity
  - [ ] 2.4 Design key management: where to store encryption key (env var, Hetzner Vault, separate S3 bucket), rotation schedule (annual), disaster recovery (key escrow)
  - [ ] 2.5 Document comparison table and recommend approach
- [ ] Task 3: Design 7-year NDPA retention policy (AC: #3)
  - [ ] 3.1 Design S3 directory structure:
    ```
    backups/
    ├── daily/          # 7-day rolling window
    │   ├── 2026-02-24-app_db.sql.gz.enc
    │   └── ...
    ├── monthly/        # 7-year retention (84 snapshots)
    │   ├── 2026-02-app_db.sql.gz.enc
    │   └── ...
    └── metadata/       # Backup manifests and checksums
        ├── 2026-02-24-manifest.json
        └── ...
    ```
  - [ ] 3.2 Design lifecycle rules: auto-delete daily backups after 7 days, promote first-of-month to monthly/, auto-delete monthly after 84 months
  - [ ] 3.3 Calculate storage cost projections:
    - Estimate DB size growth: ~200 staff, ~100K respondents/year, ~15 audit records/day
    - Estimate compressed dump size at Year 1 (50MB?), Year 3 (200MB?), Year 7 (500MB?)
    - Calculate S3 storage cost: daily × 7 + monthly × 84 archives
  - [ ] 3.4 Design purge automation: BullMQ scheduled job or S3 lifecycle policy (if supported by provider)
  - [ ] 3.5 Design compliance verification: how to prove 7 years retained (manifest log, S3 object listing, auditor-friendly report)
- [ ] Task 4: Design BullMQ backup job (AC: #4)
  - [ ] 4.1 Design `backup.queue.ts`: queue name `database-backup`, cron `'00 01 * * *'` (1:00 UTC = 2:00 WAT), `upsertJobScheduler()` pattern
  - [ ] 4.2 Design `backup.worker.ts`: job processing steps:
    1. Generate backup filename: `{date}-app_db.sql.gz`
    2. Execute pg_dump: `child_process.exec('docker exec postgres pg_dump -U user -d app_db | gzip')`
    3. Encrypt backup (if application-level)
    4. Upload to S3: `PutObject` with metadata (checksum, size, timestamp)
    5. Verify upload: `HeadObject` to confirm
    6. Write manifest: `{ filename, size, checksum, duration, timestamp }`
    7. Clean old dailies: delete backups > 7 days
    8. Promote to monthly: if first day of month, copy to `monthly/`
    9. Send notification: success or failure email
  - [ ] 4.3 Design error handling: retry 3 times with exponential backoff, alert on final failure
  - [ ] 4.4 Design pg_dump execution: `docker exec` vs direct `pg_dump` (requires psql client on host), evaluate streaming vs temp file
  - [ ] 4.5 Design temp file management: write to `/tmp/`, stream upload, delete after confirmation
  - [ ] 4.6 Register in worker initialization: add to `initializeWorkers()` and `closeAllWorkers()` in `workers/index.ts`
- [ ] Task 5: Design restore procedure (AC: #5)
  - [ ] 5.1 Design manual restore script: download from S3 → decrypt → decompress → `psql` import
  - [ ] 5.2 Design automated restore script: `scripts/restore-backup.ts` with CLI args (date, target environment)
  - [ ] 5.3 Design integrity checks: record count comparison (respondents, users, audit_logs), schema version validation, checksum verification
  - [ ] 5.4 Estimate restore times: projected DB sizes at Year 1/3/7, download speed from S3, pg_restore duration
  - [ ] 5.5 Design staging restore procedure: separate Docker PostgreSQL instance, restore into fresh container, run validation queries
  - [ ] 5.6 Document recovery scenarios: single table corruption, full DB loss, VPS hardware failure, accidental data deletion
- [ ] Task 6: Design monthly restore drill procedure (AC: #6)
  - [ ] 6.1 Design drill checklist: download latest backup → restore to staging → validate record counts → verify role-based access → verify audit log integrity → report results
  - [ ] 6.2 Evaluate automation level: fully automated BullMQ job (monthly cron) vs semi-manual script triggered by Super Admin
  - [ ] 6.3 Design success criteria: all record counts match within tolerance, all 7 roles can authenticate, latest audit log hash chain validates (if Story 6-1 implemented)
  - [ ] 6.4 Design notification: email to Super Admin with drill results (pass/fail, duration, record counts, issues found)
  - [ ] 6.5 Design compliance documentation: monthly drill report template for NDPA auditors
- [ ] Task 7: Design backup monitoring and alerting (AC: #7)
  - [ ] 7.1 Design success/failure tracking: `backup_jobs` table or extend audit_logs with `backup.started`, `backup.completed`, `backup.failed` actions
  - [ ] 7.2 Design email notifications: success summary (size, duration, checksum) and failure alert (error details, retry count)
  - [ ] 7.3 Design dashboard integration: "Last Backup" widget in System Health page (Story 6-2), status badge (green/amber/red), backup history chart
  - [ ] 7.4 Design alert escalation: 1 failure → warning email, 2 consecutive → critical email, 3+ consecutive → SMS/phone (if available)
  - [ ] 7.5 Design backup health metric for prep-7 monitoring: `backup_last_success_timestamp` gauge, `backup_duration_seconds` histogram
- [ ] Task 8: Write spike summary document (all ACs)
  - [ ] 8.1 Compile all research into `_bmad-output/implementation-artifacts/prep-8-backup-orchestration-research-summary.md`
  - [ ] 8.2 Include comparison tables, S3 directory structure diagram, cost projections, and implementation roadmap
  - [ ] 8.3 Include reference code snippets for BullMQ backup queue/worker, pg_dump command, S3 upload, restore script
  - [ ] 8.4 Include Story 6-3 implementation checklist derived from spike findings
- [ ] Task 9: Update story status and dev agent record

## Dev Notes

### NFR Requirements Driving Backup Design

**NFR3.3 — Comprehensive Backup Strategy** (PRD v8.0):
- Daily encrypted dump to S3 at 2:00 AM WAT
- Retention: 7-day rolling window + monthly snapshots retained for 7 years (per NFR4.2 NDPA)
- Monthly restore drills in staging to validate backup integrity

**NFR3.4 — Disaster Recovery**:
- VPS automated snapshots every 6 hours
- 1-hour Recovery Time Objective (RTO)
- Super Admin can initiate Point-in-Time Restore (PITR) via Admin panel for up to 24 hours back

**NFR3.1 — Availability**:
- 99.5% SLA (3.65 hours/month max downtime)
- Floating IP for instant failover to new VPS instance

**NFR4.2 — Data Retention (NDPA)**:
- Raw survey data retained 7 years
- All backups must remain within Nigerian data centers (data residency)

### Existing Infrastructure to Build On

| Component | Location | Relevance |
|-----------|----------|-----------|
| S3 client | `@aws-sdk/client-s3` v3.964.0 in `apps/api/package.json` | Already installed, DigitalOcean Spaces compatible |
| S3 presigner | `@aws-sdk/s3-request-presigner` v3.966.0 | For presigned download URLs |
| S3 test script | `scripts/test-s3-connection.ts` | Connection validation pattern, `forcePathStyle: true` |
| S3 env vars | `.env.example` lines 72-92 | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` |
| BullMQ scheduled job | `apps/api/src/queues/productivity-snapshot.queue.ts` | `upsertJobScheduler()` cron pattern |
| Worker pattern | `apps/api/src/workers/productivity-snapshot.worker.ts` | Structured logging, Redis connection, graceful shutdown |
| Worker registry | `apps/api/src/workers/index.ts` | `initializeWorkers()`, `closeAllWorkers()` |
| EmailService | `apps/api/src/services/email.service.ts` | Backup notification delivery (Resend provider) |
| Email queue | `apps/api/src/queues/email.queue.ts` | BullMQ email notification delivery |
| Docker PostgreSQL | `docker/docker-compose.yml` | `postgres:15-alpine`, `postgres_data` volume, `pg_isready` health check |
| Docker Redis | `docker/docker-compose.yml` | `redis:7-alpine`, `redis_data` volume |
| Pino logger | `apps/api/src/app.ts` | Structured JSON logging for backup events |
| Audit schema | `apps/api/src/db/schema/audit.ts` | Pattern for backup event logging |

### Key Design Decisions to Research

**1. Backup Strategy Comparison:**

| Strategy | RPO | RTO | Cost | Portability | Complexity |
|----------|-----|-----|------|-------------|------------|
| pg_dump + S3 | 24h | 15-30min | Low (S3 storage only) | High (standard SQL) | Low |
| VPS snapshots | 6h | 3-5min (Floating IP) | Medium ($0.05/GB/mo) | None (provider-locked) | Very Low |
| WAL archiving / PITR | Minutes | 10-20min | Medium (continuous WAL) | Medium (PG-specific) | High |
| Hybrid (snapshots + pg_dump) | 6h system / 24h DB | 3-5min | Medium | Partial | Medium |

**2. Encryption Approach:**

| Approach | Key Management | Complexity | Recovery |
|----------|---------------|------------|----------|
| S3 server-side (SSE-S3) | Managed by provider | None | Transparent |
| S3 customer key (SSE-C) | Env var / secrets | Low | Must preserve key |
| Application-level (AES-256-GCM) | Full control | Medium | Must preserve key + IV |

**3. pg_dump Execution Strategy:**

| Method | Mechanism | Pros | Cons |
|--------|-----------|------|------|
| `docker exec` | `docker exec postgres pg_dump -U user app_db` | No host-level psql needed | Requires Docker socket access |
| Direct `pg_dump` | `pg_dump -h localhost -U user app_db` | Standard, no Docker dependency | Requires `postgresql-client` on host |
| Streaming to S3 | Pipe pg_dump output directly to S3 multipart upload | No temp file, memory-efficient | Complex error handling mid-stream |

### Scale Projections for Storage

**Database size estimates** (based on architecture capacity analysis):
- **Year 1**: ~200 staff, ~100K respondents, ~5.5K audit records → estimated ~50-100MB compressed dump
- **Year 3**: ~200 staff, ~300K respondents, ~16K audit records → estimated ~150-300MB compressed dump
- **Year 7**: ~200 staff, ~700K respondents, ~38K audit records → estimated ~300-600MB compressed dump

**S3 storage projections** (7-day daily + monthly × 7 years):
- Year 1: 7 dailies × 100MB + 12 monthlies × 100MB = 1.9GB
- Year 3: 7 dailies × 300MB + 36 monthlies × avg 200MB = 9.3GB
- Year 7: 7 dailies × 600MB + 84 monthlies × avg 350MB = 33.6GB

**Cost estimate** (DigitalOcean Spaces: $5/250GB/month):
- Year 7 worst case: ~34GB → well within $5/month tier
- Conclusion: Storage cost is negligible for this project's scale

### BullMQ Backup Job Pattern (Following Existing)

```typescript
// apps/api/src/queues/backup.queue.ts (pattern from productivity-snapshot.queue.ts)
export async function scheduleDailyBackup(): Promise<void> {
  if (isTestMode()) return;
  const queue = getBackupQueue();
  await queue.upsertJobScheduler(
    'daily-backup',
    { pattern: '00 01 * * *' }, // 1:00 UTC = 2:00 WAT
    { name: 'database-backup', data: {} },
  );
}

// apps/api/src/workers/backup.worker.ts (pattern from productivity-snapshot.worker.ts)
async function processBackup(_job: Job): Promise<BackupResult> {
  const startTime = Date.now();
  // 1. Execute pg_dump (docker exec or direct)
  // 2. Compress (gzip/zstd)
  // 3. Encrypt (if app-level)
  // 4. Upload to S3
  // 5. Verify upload
  // 6. Write manifest
  // 7. Clean old dailies
  // 8. Promote to monthly (if 1st of month)
  // 9. Send notification
  return { filename, size, checksum, duration: Date.now() - startTime };
}
```

### Disaster Recovery Procedure (from Architecture)

1. **Detect VPS failure** — monitoring alerts after 2 missed health checks (Story 6-2 integration)
2. Create new instance from most recent VPS snapshot (6-hour window)
3. Remap Floating IP to new instance (instant DNS-free failover)
4. Verify health endpoint responds (`/health` returning 200 OK)
5. If VPS snapshot is stale, restore latest S3 pg_dump backup
6. Notify Super Admin of recovery completion

### Spike Document Template

The output document should follow this structure:
1. Executive Summary
2. Current State Analysis (existing S3 client, BullMQ patterns, Docker setup)
3. Backup Strategy Comparison (pg_dump vs snapshots vs WAL vs hybrid)
4. Encryption Design (comparison + recommendation)
5. 7-Year NDPA Retention Policy (S3 structure, lifecycle rules, cost projections)
6. BullMQ Backup Job Design (queue, worker, scheduling)
7. pg_dump Execution Strategy (Docker exec vs direct vs streaming)
8. Restore Procedure Design (manual, automated, integrity checks)
9. Monthly Restore Drill Design (checklist, automation, compliance reporting)
10. Backup Monitoring & Alerting (tracking, dashboard, escalation)
11. Storage Cost Projections (Year 1 through Year 7)
12. Story 6-3 Implementation Checklist

### Project Structure Notes

- Spike output: `_bmad-output/implementation-artifacts/prep-8-backup-orchestration-research-summary.md`
- No frontend changes needed for this spike
- No production code changes — research only
- Future queue location: `apps/api/src/queues/backup.queue.ts` (new file)
- Future worker location: `apps/api/src/workers/backup.worker.ts` (new file)
- Future restore script: `scripts/restore-backup.ts` (new file)
- Future dashboard widget: integrated into SystemHealth.tsx (Story 6-2)

### Testing Standards

- This is a research spike — no production code tests needed
- Reference code snippets should be syntactically valid TypeScript
- pg_dump commands should be tested manually against local Docker PostgreSQL
- S3 upload patterns validated using existing `scripts/test-s3-connection.ts`
- Restore procedure should include testable assertions for Story 6-3 implementation

### References

- [Source: _bmad-output/planning-artifacts/epics.md#L1850-1861] — Story 6-3 acceptance criteria
- [Source: _bmad-output/planning-artifacts/prd.md#L151-157] — NFR3.3 backup strategy, NFR3.4 disaster recovery
- [Source: _bmad-output/planning-artifacts/architecture.md#L52-63] — NFR1 performance, NFR3 availability (99.5% SLA)
- [Source: _bmad-output/planning-artifacts/architecture.md#L155-167] — ADR-005: Degraded mode strategy, 6-hour snapshots
- [Source: _bmad-output/planning-artifacts/architecture.md#L270] — VPS hardware failure mitigation
- [Source: _bmad-output/planning-artifacts/architecture.md#L1701-1791] — Infrastructure (Hetzner CX43, Floating IP, disaster recovery)
- [Source: _bmad-output/planning-artifacts/architecture.md#NFR4.2] — NDPA 7-year data retention
- [Source: _bmad-output/implementation-artifacts/epic-5-retro-2026-02-24.md#L232-248] — prep-8 task definition
- [Source: apps/api/package.json#L29-30] — @aws-sdk/client-s3, @aws-sdk/s3-request-presigner
- [Source: scripts/test-s3-connection.ts] — S3 connection validation script
- [Source: .env.example#L72-92] — S3 environment variable definitions
- [Source: apps/api/src/queues/productivity-snapshot.queue.ts#L43-56] — BullMQ scheduled job pattern
- [Source: apps/api/src/workers/productivity-snapshot.worker.ts] — Worker implementation pattern
- [Source: apps/api/src/workers/index.ts] — Worker registration pattern
- [Source: apps/api/src/services/email.service.ts] — EmailService for backup notifications
- [Source: docker/docker-compose.yml] — PostgreSQL/Redis Docker configuration
- [Source: docker/docker-compose.dev.yml] — Health check patterns
- [Source: docs/infrastructure-cicd-playbook.md] — PM2, NGINX, Docker deployment patterns
- [Source: apps/api/src/app.ts#L78-82] — Current health endpoint

### Previous Story Intelligence

**From prep-7-monitoring-infrastructure-spike (previous prep task):**
- System Health dashboard (Story 6-2) will display backup status widget
- Monitoring metrics should include `backup_last_success_timestamp` gauge and `backup_duration_seconds` histogram
- Alert escalation pattern (warning → critical → SMS) applicable to backup failures
- Dashboard polling pattern (30s interval via `useQuery`) for backup status display

**From prep-4-immutable-audit-log-spike (earlier prep task):**
- Audit log hash chain verification is a candidate integrity check for restore drills
- 7-year NDPA retention requirement applies to BOTH audit logs AND backups
- Partitioning strategy (monthly) aligns with monthly backup snapshots

**From prep-5-remuneration-domain-modeling (earlier prep task):**
- BullMQ notification queue pattern directly applicable to backup success/failure emails
- EmailService provider pattern (Resend) for notification delivery

**From prep-epic-3/prep-6 (Load Test Baseline):**
- k6 scripts can validate backup doesn't degrade API performance during execution (2 AM WAT low-traffic window)

### Git Intelligence

Recent commits are Epic 5 completions and prep fixes:
- `ab03648 fix(web,api): fix CI build errors` — latest
- `328ad63 fix(web): fix ExportPage LGA race condition + code review fixes (prep-1)` — bug fix pattern
- `bd5a443 docs: complete Epic 5 retrospective and define Epic 6 prep phase` — retro defining this spike
- `92f8a2b fix(api,web): use dynamic productivity targets across all dashboards` — shows BullMQ scheduled job patterns

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### Change Log

### File List
