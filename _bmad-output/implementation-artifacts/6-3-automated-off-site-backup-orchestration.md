# Story 6.3: Automated Off-site Backup Orchestration

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the System,
I want to automatically back up all data to off-site storage,
so that the registry is resilient against catastrophic hardware failure.

## Context

### Business Value
The OSLRS registry holds PII for potentially hundreds of thousands of respondents across Oyo State. A single VPS failure, accidental `DROP TABLE`, or ransomware attack could permanently destroy the only copy of this government data. The Nigeria Data Protection Act (NDPA) mandates 7-year data retention — without automated off-site backups, a hardware failure could create legal liability and destroy years of field work.

### Current State
The platform has partial backup infrastructure but no automated backup job:

- **S3 client installed**: `@aws-sdk/client-s3` (v3.964.0) and `@aws-sdk/s3-request-presigner` (v3.966.0) already in `apps/api/package.json`
- **S3 connection validated**: `scripts/test-s3-connection.ts` tests ListObjects, PutObject, DeleteObject against DigitalOcean Spaces
- **S3 env vars defined**: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` in `.env.example`
- **Existing S3 usage**: `PhotoProcessingService` uses `S3Client` with `forcePathStyle: true` for DO Spaces — proven pattern
- **BullMQ scheduled job pattern**: `productivity-snapshot.queue.ts` uses `upsertJobScheduler()` with cron — exact pattern to reuse
- **5 existing BullMQ queues/workers**: All follow lazy-init connection pattern, registered in `workers/index.ts`
- **PostgreSQL 15 in Docker**: Container `oslsr_postgres`, `app_db` database, `user` credentials, `postgres_data` volume
- **EmailService ready**: Resend provider, BullMQ email queue for notification delivery

### What's Missing
- **No backup job**: No BullMQ queue/worker for database backups
- **No pg_dump automation**: No script to dump PostgreSQL and upload to S3
- **No retention management**: No lifecycle policy for daily/monthly retention
- **No restore procedure**: No automated or manual restore script
- **No backup monitoring**: No success/failure tracking or alerting

### Architecture Decisions (Already Made)

**NFR3.3 — Comprehensive Backup Strategy**:
- Daily encrypted dump to S3 at 2:00 AM WAT (1:00 UTC)
- Retention: 7-day rolling window + monthly snapshots retained 7 years
- Monthly restore drills in staging to validate backup integrity

**NFR3.4 — Disaster Recovery**:
- VPS automated snapshots every 6 hours (Hetzner)
- 1-hour Recovery Time Objective (RTO)
- Floating IP for instant failover to new VPS instance

**NFR4.2 — Data Retention (NDPA)**:
- Raw survey data retained 7 years
- All backups must remain within Nigerian data centers (data residency)

### Dependency
- **prep-8-backup-orchestration-research** (ready-for-dev) — Contains detailed architecture research with comparison tables, cost projections, and implementation patterns. If the spike has been executed and produced a summary document, use those findings. Otherwise, the spike story file itself contains sufficient guidance.
- **Story 6-2** (System Health & Performance Monitoring) — Backup status widget planned for System Health dashboard. This story should expose backup health data that Story 6-2's dashboard can consume.

## Acceptance Criteria

**AC1**: Given the daily backup schedule (2:00 AM WAT = 1:00 UTC), when the backup job triggers via BullMQ cron, then the system generates a compressed SQL dump of `app_db` using `pg_dump`, uploads it to S3-compatible storage (DigitalOcean Spaces) with the key format `backups/daily/{date}-app_db.sql.gz`, and logs the result.

**AC2**: Given a backup upload completes, when the upload is verified, then the system stores a manifest containing: filename, compressed size, SHA-256 checksum, duration, timestamp, and record counts for key tables (users, respondents, audit_logs).

**AC3**: Given the S3 bucket, when the retention policy executes, then daily backups older than 7 days are automatically deleted, the first backup of each month is promoted to `backups/monthly/` with 7-year retention (84 monthly snapshots max), and old monthly backups beyond 84 months are deleted.

**AC4**: Given a backup job completes (success or failure), when the result is processed, then the system sends an email notification to all active Super Admins via the existing EmailService — success emails include size/duration/checksum, failure emails include error details and retry count.

**AC5**: Given a failed backup job, when the BullMQ worker detects the failure, then the job retries up to 3 times with exponential backoff (1min, 5min, 15min), and if all retries fail, sends a critical failure alert email.

**AC6**: Given a restore script `scripts/restore-backup.ts`, when executed with a date argument, then it downloads the specified backup from S3, decompresses it, and restores it to a target PostgreSQL database, with integrity checks (record counts comparison) and clear console output.

**AC7**: Given the backup infrastructure, when the full test suite runs, then all existing tests pass with zero regressions AND new tests cover: backup worker execution (mocked pg_dump + S3), retention cleanup logic, manifest generation, restore script logic, and notification delivery.

## Tasks / Subtasks

- [ ] Task 1: Create backup queue with BullMQ scheduler (AC: #1, #5)
  - [ ] 1.1 Create `apps/api/src/queues/backup.queue.ts` following `productivity-snapshot.queue.ts` pattern:
    - Lazy-init Redis connection (same `isTestMode()` guard)
    - Queue name: `database-backup`
    - Default job options: 24h completion cleanup, 7-day failure retention
  - [ ] 1.2 Add `scheduleDailyBackup()` function using `upsertJobScheduler()`:
    - Scheduler ID: `daily-backup`
    - Cron pattern: `'00 01 * * *'` (1:00 UTC = 2:00 WAT)
    - Job name: `database-backup`
  - [ ] 1.3 Add `getBackupQueue()` export for monitoring integration (Story 6-2)
  - [ ] 1.4 Add `closeBackupQueue()` for graceful shutdown
- [ ] Task 2: Create backup worker with pg_dump + S3 upload (AC: #1, #2)
  - [ ] 2.1 Create `apps/api/src/workers/backup.worker.ts` following `productivity-snapshot.worker.ts` pattern:
    - Worker concurrency: 1 (single backup at a time)
    - Structured Pino logging at each step
  - [ ] 2.2 Implement `processBackup()` job handler with steps:
    1. Generate filename: `{YYYY-MM-DD}-app_db.sql.gz`
    2. Execute pg_dump: `child_process.execSync('pg_dump -h ${host} -p ${port} -U ${user} -d ${db} | gzip > /tmp/${filename}')` — parse DATABASE_URL for connection params
    3. Read compressed file and compute SHA-256 checksum
    4. Upload to S3 via `PutObjectCommand` with key `backups/daily/${filename}` and metadata (checksum, timestamp)
    5. Verify upload via `HeadObjectCommand` to confirm size matches
    6. Build manifest: `{ filename, sizeBytes, checksum, durationMs, timestamp, tableCounts: { users, respondents, auditLogs } }`
    7. Upload manifest to `backups/manifests/{date}-manifest.json`
    8. Clean temp file from `/tmp/`
  - [ ] 2.3 Implement table count collection: `SELECT COUNT(*) FROM users`, `respondents`, `audit_logs` — for manifest integrity reference
  - [ ] 2.4 Create S3 client helper: reuse `PhotoProcessingService` S3 config pattern (endpoint, forcePathStyle, credentials from env)
  - [ ] 2.5 Handle pg_dump execution:
    - Production (PM2 on VPS): Direct `pg_dump` via `child_process` — requires `postgresql-client` on host (already documented in playbook: `apt install -y postgresql-client`)
    - Development (Docker): `docker exec oslsr_postgres pg_dump -U user app_db`
    - Parse `DATABASE_URL` to extract host, port, user, database for direct mode
    - Set `PGPASSWORD` env var for non-interactive auth
  - [ ] 2.6 Configure retry: 3 attempts, backoff delays [60000, 300000, 900000] (1min, 5min, 15min)
- [ ] Task 3: Implement retention management (AC: #3)
  - [ ] 3.1 Add `cleanupOldDailies()` method in backup worker:
    - List objects with prefix `backups/daily/` via `ListObjectsV2Command`
    - Parse date from filename, delete any older than 7 days via `DeleteObjectCommand`
  - [ ] 3.2 Add `promoteToMonthly()` method:
    - If today is the 1st of the month, copy today's backup to `backups/monthly/{YYYY-MM}-app_db.sql.gz` via `CopyObjectCommand`
    - Also copy manifest to `backups/manifests/monthly/{YYYY-MM}-manifest.json`
  - [ ] 3.3 Add `cleanupOldMonthlies()` method:
    - List objects with prefix `backups/monthly/`
    - Delete any older than 84 months (7 years)
  - [ ] 3.4 Run retention cleanup AFTER successful backup upload (not as separate job — reduces complexity)
  - [ ] 3.5 S3 directory structure:
    ```
    backups/
    ├── daily/              # 7-day rolling window
    │   └── 2026-02-24-app_db.sql.gz
    ├── monthly/            # 7-year retention (84 max)
    │   └── 2026-02-app_db.sql.gz
    └── manifests/
        ├── 2026-02-24-manifest.json
        └── monthly/
            └── 2026-02-manifest.json
    ```
- [ ] Task 4: Implement backup notifications (AC: #4, #5)
  - [ ] 4.1 Add backup notification methods to BackupService or inline in worker:
    - `sendBackupSuccessEmail(manifest)`: queue email via a new `queueBackupNotificationEmail()` function (see 4.5) to all active Super Admins
    - `sendBackupFailureEmail(error, retryCount)`: queue critical failure alert
  - [ ] 4.2 Query active Super Admins: `SELECT email FROM users u JOIN roles r ON u.roleId = r.id WHERE r.name = 'super_admin' AND u.status NOT IN ('deactivated', 'suspended')`
  - [ ] 4.3 Email content — success:
    - Subject: `[OSLRS] Daily Backup Completed Successfully`
    - Body: filename, compressed size, checksum, duration, table counts
  - [ ] 4.4 Email content — failure:
    - Subject: `[OSLRS] CRITICAL: Daily Backup Failed`
    - Body: error message, retry count, last successful backup date, action required
  - [ ] 4.5 Create a new `queueBackupNotificationEmail()` export in `email.queue.ts` following the existing `queueStaffInvitationEmail()` pattern (L123). There is **no generic `queueEmail()`** — the file exports specialized functions per email type: `queueStaffInvitationEmail` (L123), `queueVerificationEmail` (L157), `queuePasswordResetEmail` (L177). Add `backup-notification` to the `EmailJob` union type.
- [ ] Task 5: Register backup worker in worker lifecycle (AC: #1)
  - [ ] 5.1 Add import in `apps/api/src/workers/index.ts`:
    - Import `backupWorker` and `closeBackupWorker`
    - Import `scheduleDailyBackup` from `backup.queue.ts`
  - [ ] 5.2 Add to `initializeWorkers()`:
    - Log backup worker status: `backupWorkerRunning: backupWorker.isRunning()`
    - Call `await scheduleDailyBackup()` (alongside existing `scheduleNightlySnapshot()`)
  - [ ] 5.3 Add to `closeAllWorkers()`: `backupWorker.close()` in Promise.all
  - [ ] 5.4 Re-export: `export { backupWorker } from './backup.worker.js'`
- [ ] Task 6: Create restore script (AC: #6)
  - [ ] 6.1 Create `apps/api/scripts/restore-backup.ts` (alongside existing `test-s3-connection.ts`):
    - CLI args: `--date 2026-02-24` (specific daily) or `--monthly 2026-02` (monthly) or `--latest` (most recent)
    - `--target-db` optional (defaults to DATABASE_URL)
    - `--dry-run` flag for validation without restore
  - [ ] 6.2 Implement restore flow:
    1. Download backup from S3 (`GetObjectCommand`)
    2. Download manifest (`GetObjectCommand`)
    3. Decompress: `gunzip` via `child_process` or `zlib.createGunzip()`
    4. Restore: `psql -h host -p port -U user -d target_db < dump.sql`
    5. Validate: compare restored table counts against manifest counts
    6. Report: print success/failure with counts comparison table
  - [ ] 6.3 Add `--list` flag: list all available backups (daily + monthly) with sizes and dates
  - [ ] 6.4 Safety guard: require `--confirm` flag for production DATABASE_URL (prevent accidental production restore)
- [ ] Task 7: Add backend tests (AC: #7)
  - [ ] 7.1 Create `apps/api/src/workers/__tests__/backup.worker.test.ts`:
    - Test: backup worker executes pg_dump, compresses, uploads to S3 (all mocked)
    - Test: backup worker generates correct filename format
    - Test: backup worker computes SHA-256 checksum
    - Test: backup worker builds manifest with table counts
    - Test: backup worker sends success email on completion
    - Test: backup worker sends failure email after all retries exhausted
  - [ ] 7.2 Create `apps/api/src/queues/__tests__/backup.queue.test.ts`:
    - Test: `scheduleDailyBackup()` creates scheduler with correct cron pattern
    - Test: `scheduleDailyBackup()` is no-op in test mode
    - Test: queue has correct default job options
  - [ ] 7.3 Create retention tests in backup worker test file:
    - Test: daily cleanup deletes backups older than 7 days
    - Test: daily cleanup preserves backups within 7 days
    - Test: monthly promotion copies backup on 1st of month
    - Test: monthly promotion does NOT copy on other days
    - Test: monthly cleanup deletes backups older than 84 months
  - [ ] 7.4 Create `apps/api/scripts/__tests__/restore-backup.test.ts` (or colocate):
    - Test: restore script downloads correct S3 key for given date
    - Test: restore script validates manifest counts after restore
    - Test: restore script rejects production target without --confirm flag
    - Test: `--list` flag lists available backups
- [ ] Task 8: Run full test suites and verify zero regressions (AC: #7)
  - [ ] 8.1 Run API tests: `pnpm vitest run apps/api/src/`
  - [ ] 8.2 Run web tests: `cd apps/web && pnpm vitest run`
- [ ] Task 9: Update story status and dev agent record

## Dev Notes

### pg_dump Execution Strategy

**Recommended: Direct `pg_dump` via `child_process`** (not Docker exec):

On the production VPS, the API runs via PM2 (not inside Docker), so `docker exec` may not be available or appropriate. Use direct `pg_dump`:

```typescript
import { execSync } from 'node:child_process';
import { URL } from 'node:url';

function executePgDump(databaseUrl: string, outputPath: string): void {
  const url = new URL(databaseUrl);
  const env = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(url.password),
  };

  const cmd = `pg_dump -h ${url.hostname} -p ${url.port || 5432} -U ${url.username} -d ${url.pathname.slice(1)} --no-owner --no-acl | gzip > ${outputPath}`;

  execSync(cmd, {
    env,
    timeout: 300000, // 5 minute timeout
    maxBuffer: 1024 * 1024 * 10, // 10MB stderr buffer
  });
}
```

**Development fallback**: If `pg_dump` is not available on host, fall back to `docker exec oslsr_postgres pg_dump -U user app_db | gzip`. Detect via `which pg_dump` check.

**Requirement**: `postgresql-client` must be installed on VPS (`apt install -y postgresql-client`). Already documented in `docs/infrastructure-cicd-playbook.md`.

### S3 Upload Pattern (Reuse from PhotoProcessingService)

```typescript
import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand, CopyObjectCommand, GetObjectCommand, S3ClientConfig } from '@aws-sdk/client-s3';

// Reuse exact S3 config pattern from photo-processing.service.ts:15-33
function createS3Client(): S3Client {
  const region = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
  const config: S3ClientConfig = { region };
  if (process.env.S3_ENDPOINT) {
    config.endpoint = process.env.S3_ENDPOINT;
    config.forcePathStyle = true; // Required for DO Spaces
  }
  if (process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
    config.credentials = {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    };
  }
  return new S3Client(config);
}
```

### Backup Manifest Format

```typescript
interface BackupManifest {
  filename: string;           // "2026-02-24-app_db.sql.gz"
  s3Key: string;              // "backups/daily/2026-02-24-app_db.sql.gz"
  sizeBytes: number;          // Compressed file size
  checksumSha256: string;     // SHA-256 of compressed file
  durationMs: number;         // Total backup + upload time
  timestamp: string;          // ISO 8601
  databaseUrl: string;        // Redacted (host only, no password)
  tableCounts: {
    users: number;
    respondents: number;
    auditLogs: number;
    submissions: number;
  };
  retentionTier: 'daily' | 'monthly';
}
```

### BullMQ Backup Queue Pattern

Following `productivity-snapshot.queue.ts` exactly:

```typescript
// apps/api/src/queues/backup.queue.ts
const QUEUE_NAME = 'database-backup';

export async function scheduleDailyBackup(): Promise<void> {
  if (isTestMode()) return;
  const queue = getBackupQueue();
  await queue.upsertJobScheduler(
    'daily-backup',
    { pattern: '00 01 * * *' }, // 1:00 UTC = 2:00 WAT
    { name: 'database-backup', data: {} },
  );
}
```

### Worker Registration Pattern

Add to `apps/api/src/workers/index.ts` following the existing 5-worker pattern:

```typescript
import { backupWorker } from './backup.worker.js';
import { scheduleDailyBackup } from '../queues/backup.queue.js';

// In initializeWorkers():
logger.info({ ..., backupWorkerRunning: backupWorker.isRunning() });
await scheduleDailyBackup();

// In closeAllWorkers():
backupWorker.close(),
```

### Retention Policy

| Tier | Directory | Max Age | Max Count | Cleanup Trigger |
|------|-----------|---------|-----------|-----------------|
| Daily | `backups/daily/` | 7 days | ~7 | After each backup |
| Monthly | `backups/monthly/` | 84 months (7 years) | ~84 | After each backup |
| Manifest | `backups/manifests/` | Same as parent | Same | Alongside parent |

**Monthly promotion**: On the 1st of each month, the daily backup is copied (not moved) to `backups/monthly/`. This means the 1st's backup exists in both daily/ (deleted after 7 days) and monthly/ (retained 7 years).

### Storage Cost Projections

| Year | Est. Dump Size | Daily Storage (7×) | Monthly Storage (cumulative) | Total | Cost/Month |
|------|---------------|-------------------|------------------------------|-------|------------|
| 1 | ~100MB | 700MB | 1.2GB | 1.9GB | ~$5 (min tier) |
| 3 | ~300MB | 2.1GB | 7.2GB | 9.3GB | ~$5 (min tier) |
| 7 | ~600MB | 4.2GB | 29.4GB | 33.6GB | ~$5 (min tier) |

DigitalOcean Spaces: $5/month for 250GB — backup storage is negligible at this project's scale.

### Email Notification Pattern

There is **no generic `queueEmail()` function**. The `email.queue.ts` file exports specialized functions per email type: `queueStaffInvitationEmail()` (L123), `queueVerificationEmail()` (L157), `queuePasswordResetEmail()` (L177). Create a new `queueBackupNotificationEmail()` following the same pattern:

```typescript
import { queueBackupNotificationEmail } from '../queues/email.queue.js';

// Queue backup notification (new function to create)
await queueBackupNotificationEmail({
  to: superAdminEmails,
  subject: '[OSLRS] Daily Backup Completed Successfully',
  html: buildBackupSuccessHtml(manifest),
  text: buildBackupSuccessText(manifest),
});
```

Add `backup-notification` to the `EmailJob` union type and create the `queueBackupNotificationEmail()` export following `queueStaffInvitationEmail()` as a template.

### Temp File Management

Backup dumps are written to `/tmp/` and cleaned up after S3 upload:

```typescript
const tmpPath = `/tmp/${filename}`;
try {
  executePgDump(databaseUrl, tmpPath);
  await uploadToS3(tmpPath, s3Key);
} finally {
  // Always clean up
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
}
```

### File Change Scope

**New files (backend):**
- `apps/api/src/queues/backup.queue.ts` — BullMQ queue + cron scheduler
- `apps/api/src/workers/backup.worker.ts` — Backup execution worker (pg_dump, compress, upload, manifest, retention, notify)
- `apps/api/src/workers/__tests__/backup.worker.test.ts` — Worker unit tests
- `apps/api/src/queues/__tests__/backup.queue.test.ts` — Queue unit tests

**New files (scripts):**
- `apps/api/scripts/restore-backup.ts` — CLI restore tool (download, decompress, psql restore, validate)

**Modified files:**
- `apps/api/src/workers/index.ts` — Register backup worker + scheduler (import, initializeWorkers, closeAllWorkers)
- `apps/api/src/queues/email.queue.ts` — Add `queueBackupNotificationEmail()` export + `backup-notification` EmailJob type

**No frontend changes. No schema changes. No Drizzle migrations. No new npm dependencies** (S3 client already installed).

### Project Structure Notes

- Queue: `apps/api/src/queues/backup.queue.ts` (alongside 5 existing queues)
- Worker: `apps/api/src/workers/backup.worker.ts` (alongside 5 existing workers)
- Worker registry: `apps/api/src/workers/index.ts` (modify to add backup worker)
- Restore script: `apps/api/scripts/restore-backup.ts` (alongside existing `test-s3-connection.ts`)
- S3 config pattern: reuse from `apps/api/src/services/photo-processing.service.ts:15-33`
- Email delivery: via new `queueBackupNotificationEmail()` in `apps/api/src/queues/email.queue.ts` (following `queueStaffInvitationEmail()` pattern at L123)

### Testing Standards

- Use `vi.hoisted()` + `vi.mock()` pattern for worker/queue tests
- Mock `child_process.execSync` for pg_dump calls
- Mock `@aws-sdk/client-s3` commands (PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand, CopyObjectCommand)
- Mock `fs` for temp file operations
- Mock `email.queue.ts` `queueEmail()` for notification tests
- Test retention cleanup with mock S3 listings at various dates
- Use `beforeAll`/`afterAll` for setup/teardown
- Run web tests: `cd apps/web && pnpm vitest run`
- Run API tests: `pnpm vitest run apps/api/src/`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#L1850-1861] — Story 6-3 acceptance criteria
- [Source: _bmad-output/planning-artifacts/prd.md#L151-157] — NFR3.3 backup strategy, NFR3.4 disaster recovery
- [Source: _bmad-output/planning-artifacts/architecture.md#L52-63] — NFR3 availability (99.5% SLA)
- [Source: _bmad-output/planning-artifacts/architecture.md#L155-167] — ADR-005: Degraded mode, 6-hour snapshots
- [Source: _bmad-output/planning-artifacts/architecture.md#L1701-1791] — Infrastructure, Floating IP, disaster recovery
- [Source: _bmad-output/planning-artifacts/architecture.md#NFR4.2] — NDPA 7-year data retention
- [Source: _bmad-output/implementation-artifacts/prep-8-backup-orchestration-research.md] — Architecture spike (full research)
- [Source: apps/api/package.json#L29-30] — @aws-sdk/client-s3 v3.964.0, @aws-sdk/s3-request-presigner v3.966.0
- [Source: apps/api/src/services/photo-processing.service.ts#L15-43] — S3Client config pattern (DO Spaces, forcePathStyle)
- [Source: apps/api/src/services/photo-processing.service.ts#L145-155] — uploadToS3() PutObjectCommand pattern
- [Source: apps/api/scripts/test-s3-connection.ts] — S3 connection validation (ListObjects, PutObject, DeleteObject)
- [Source: .env.example#L72-92] — S3 environment variable definitions
- [Source: apps/api/src/queues/productivity-snapshot.queue.ts] — BullMQ scheduled job pattern (upsertJobScheduler, lazy-init)
- [Source: apps/api/src/workers/productivity-snapshot.worker.ts] — Worker pattern (structured logging, concurrency: 1, graceful shutdown)
- [Source: apps/api/src/workers/index.ts] — Worker registry (initializeWorkers, closeAllWorkers, 5 workers)
- [Source: apps/api/src/queues/email.queue.ts#L123-152] — queueStaffInvitationEmail() pattern (template for new queueBackupNotificationEmail())
- [Source: apps/api/src/services/email.service.ts] — EmailService (Resend provider, HTML/text)
- [Source: apps/api/src/db/index.ts] — Database connection (Pool, DATABASE_URL)
- [Source: docker/docker-compose.dev.yml] — PostgreSQL 15 Alpine, app_db, user/password
- [Source: docker/docker-compose.yml] — Production PostgreSQL config
- [Source: docs/infrastructure-cicd-playbook.md] — PM2, NGINX, Docker, postgresql-client on VPS

### Previous Story Intelligence

**From Story 6-2 (System Health & Performance Monitoring):**
- System Health dashboard planned with backup status widget integration
- MonitoringService `getQueueHealth()` will include the new `database-backup` queue
- Alert service state machine (OK → Warning → Critical → Resolved) applicable to backup failures
- Backup health metric: `backup_last_success_timestamp` gauge, `backup_duration_seconds` histogram

**From Story 6-1 (Immutable Audit Logs):**
- Audit log hash chain verification is a candidate integrity check for restore drills
- `AUDIT_ACTIONS.SYSTEM_BACKUP` and `SYSTEM_RESTORE` action types defined — use for backup event logging
- 7-year NDPA retention requirement applies to BOTH audit logs AND backups

**From prep-8-backup-orchestration-research (direct feeder):**
- Detailed comparison: pg_dump+S3 (recommended for pilot), VPS snapshots (complementary), WAL archiving (deferred)
- Encryption recommendation: S3 server-side encryption (SSE-S3) for simplicity — DO Spaces handles it transparently
- Storage cost: negligible at $5/month tier through Year 7
- pg_dump execution: direct `pg_dump` recommended over `docker exec` for production VPS

**From productivity-snapshot queue/worker (pattern template):**
- Exact BullMQ pattern to follow: lazy-init, `upsertJobScheduler()`, `concurrency: 1`
- Worker structure: `processJob()` → structured logging → return result metrics
- Registration in `workers/index.ts`: import, log status, schedule, close

### Git Intelligence

Recent commits are Epic 5 completions and prep fixes:
- `c240b19 fix(web): add consistent p-6 padding to 3 dashboard pages (prep-2)` — latest
- `ab03648 fix(web,api): fix CI build errors`
- `328ad63 fix(web): fix ExportPage LGA race condition + code review fixes (prep-1)`
- `bd5a443 docs: complete Epic 5 retrospective and define Epic 6 prep phase`
- `92f8a2b fix(api,web): use dynamic productivity targets across all dashboards`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### Change Log

### File List
