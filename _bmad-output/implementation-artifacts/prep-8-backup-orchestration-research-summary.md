# Prep 8: Backup Orchestration Research — Spike Summary

**Date:** 2026-02-25
**Author:** Dev Agent (Claude Opus 4.6)
**Status:** Complete
**Feeds:** Story 6-3 (Automated Off-Site Backup Orchestration)

---

## 1. Executive Summary

This spike designs an automated off-site backup system for OSLRS, meeting NFR3.3 (daily encrypted backups), NFR3.4 (disaster recovery), and NFR4.2 (7-year NDPA data retention). The recommended architecture is:

- **Primary strategy**: `pg_dump --format=custom --compress=zstd:3` via `docker exec`, uploaded to DigitalOcean Spaces (S3-compatible)
- **Encryption**: Application-level AES-256-GCM before upload (DO Spaces does not support SSE-S3)
- **Scheduling**: BullMQ cron job at 01:00 UTC (02:00 WAT) with 600s lock duration
- **Retention**: 7-day rolling daily + monthly snapshots for 7 years (84 monthly archives max)
- **Restore**: Automated script with integrity checks (record counts, hash chain if Story 6-1 deployed)
- **Monthly drills**: Semi-automated restore to staging Docker container with compliance report
- **Monitoring**: Integration with Story 6-2 System Health dashboard, email alerts on failure
- **Cost**: Well within $5/month DO Spaces base tier through Year 7

The design builds on existing infrastructure: `@aws-sdk/client-s3` (already installed), BullMQ 5-queue pattern, EmailService (Resend provider), and Docker Compose PostgreSQL 15.

---

## 2. Current State Analysis

### Existing Infrastructure

| Component | Location | Status |
|-----------|----------|--------|
| `@aws-sdk/client-s3` v3.964.0 | `apps/api/package.json` | Installed |
| `@aws-sdk/s3-request-presigner` v3.966.0 | `apps/api/package.json` | Installed |
| S3 env vars | `.env.example` lines 79-92 | Defined (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) |
| BullMQ scheduled job | `productivity-snapshot.queue.ts` | `upsertJobScheduler()` with cron pattern |
| 5 BullMQ queues/workers | `queues/`, `workers/` | email, fraud-detection, import, webhook-ingestion, productivity-snapshot |
| Worker registry | `workers/index.ts` | `initializeWorkers()` + `closeAllWorkers()` pattern |
| EmailService | `services/email.service.ts` | Resend provider, HTML + plain-text |
| Docker PostgreSQL 15 | `docker/docker-compose.yml` | `postgres:15-alpine`, `postgres_data` volume |
| Docker Redis 7 | `docker/docker-compose.yml` | `redis:7-alpine`, `redis_data` volume |
| Health endpoint | `apps/api/src/app.ts:79` | Basic `{ status: 'ok' }` only |

### Gaps to Address

- No backup job (queue/worker)
- No pg_dump automation or S3 upload pipeline
- No encryption strategy for backups at rest
- No retention lifecycle management
- No restore procedure (manual or automated)
- No monthly restore drill process
- No backup monitoring or alerting

---

## 3. Backup Strategy Comparison (AC1)

### Strategy Matrix

| Strategy | RPO | RTO | Cost/month | Portability | Complexity | NDPA Compliance |
|----------|-----|-----|-----------|-------------|------------|-----------------|
| **pg_dump + S3** | 24h | 15-30min | ~$5 (Spaces base) | High (standard SQL) | Low | Full (encrypted, off-site, 7yr retention) |
| **VPS snapshots (Hetzner)** | 6h | 3-5min (Floating IP) | ~$3-5 (20% of VPS) | None (provider-locked) | Very Low | Partial (no granular DB restore, provider-dependent) |
| **WAL archiving / PITR** | Minutes | 10-20min | ~$5-15 (WAL storage) | Medium (PG-specific) | High | Full (continuous, point-in-time) |
| **Hybrid: VPS snapshots + pg_dump** | 6h system / 24h DB | 3-5min | ~$8-10 | Partial | Medium | Full |

### Detailed Analysis

#### pg_dump + S3 Upload (Recommended Primary)

**Mechanism:** `docker exec postgres pg_dump -Fc --compress=zstd:3 -U user app_db > /tmp/backup.dump`, then encrypt and upload to DigitalOcean Spaces.

**Advantages:**
- PostgreSQL 15 supports zstd natively in custom format — faster and smaller than gzip
- Custom format (`-Fc`) enables selective table restore via `pg_restore --table=X`
- Standard SQL-based, portable to any PostgreSQL instance (no provider lock-in)
- `docker exec` ensures pg_dump version matches server version exactly
- S3 upload provides geographic redundancy (off-site from VPS)
- Verifiable: can restore to staging and run integrity checks

**Disadvantages:**
- 24-hour RPO (acceptable for registry workload — mostly daytime data entry)
- Requires temporary disk space (~2x compressed dump size)

**pg_dump flag recommendations:**
```bash
docker exec -t postgres pg_dump \
  -Fc \                        # Custom format (selective restore, built-in compression)
  --compress=zstd:3 \          # zstd level 3 (faster+smaller than gzip)
  --no-password \              # Non-interactive (PGPASSWORD in env)
  --lock-wait-timeout=30000 \  # Fail if locks not acquired in 30s
  -U user \
  app_db
```

**Supplementary:** Run `pg_dumpall --globals-only` separately to capture roles/tablespaces (not included in `pg_dump` of a single database).

#### VPS Provider Snapshots

**Mechanism:** Hetzner/DigitalOcean automated snapshots every 6 hours.

**Advantages:**
- Instant failover via Floating IP remap to new VPS from snapshot
- Full-system recovery (OS, app, data) in one operation
- Zero implementation effort (provider manages automation)

**Disadvantages:**
- Not database-aware — snapshot taken during writes may have inconsistencies (though PostgreSQL's WAL recovery handles this on startup)
- Not portable — locked to provider's snapshot format
- Cannot restore individual tables or time windows
- Provider-dependent retention policies may not meet 7-year NDPA requirement
- Cost: ~20% of VPS monthly cost

**Verdict:** Excellent for fast disaster recovery, but insufficient alone for NDPA compliance.

#### WAL Archiving / PITR

**Mechanism:** Continuous WAL segment archiving to S3 via `archive_command` or WAL-G.

**Advantages:**
- Minute-level RPO (recover to any point in time)
- Enables recovery from accidental data corruption

**Disadvantages:**
- Significant operational complexity for a single Docker VPS
- Requires Docker `postgresql.conf` modifications
- WAL segments generated continuously (16MB each) — disk overhead of 1-5GB/day even on light workload
- If S3 upload lags behind WAL generation, `pg_wal` fills up and PostgreSQL stops accepting writes
- Requires base backup + WAL chain for restore — more fragile than standalone pg_dump

**Verdict:** Over-engineered for ~200 users with mostly daytime data entry. Current RPO of 24h is acceptable. Reserve as graduation path if RPO requirement tightens.

### Recommendation

**Pilot phase:** Hybrid approach — **pg_dump + S3** (primary, daily) + **VPS snapshots** (secondary, every 6 hours)

- pg_dump for NDPA-compliant, portable, verifiable off-site backups
- VPS snapshots for fast disaster recovery (3-5 min via Floating IP)
- Combined RPO: 6 hours (VPS snapshot) for system-level, 24 hours (pg_dump) for database-specific

**Post-pilot graduation path:** If RPO must tighten to <1 hour, add WAL-G continuous archiving to S3. The pg_dump pipeline remains for daily verification and 7-year retention.

---

## 4. Encryption Design (AC2)

### Encryption Strategy Comparison

| Approach | Key Management | DO Spaces Support | Complexity | Recovery | Recommendation |
|----------|---------------|-------------------|------------|----------|----------------|
| **S3 server-side (SSE-S3)** | Managed by provider | NOT supported by DO Spaces | None | Transparent | Not available |
| **S3 customer key (SSE-C)** | Env var per request | Supported | Low | Must preserve key | Available but adds header complexity |
| **Application-level AES-256-GCM** | Full control (env var) | N/A (encrypted before upload) | Medium | Must preserve key + know IV format | **Recommended** |

### Recommendation: Application-Level AES-256-GCM

**Why:** DigitalOcean Spaces does NOT support SSE-S3 (bucket-level managed encryption). SSE-C is supported but requires passing the key in every request header and complicates download tooling. Application-level encryption provides full control and works with any S3-compatible provider.

> Note: DigitalOcean does encrypt all Spaces data at rest using AES-256 at the infrastructure level. Application-level encryption adds a second layer — the "defense-in-depth" approach aligned with ADR-006.

### Encryption Design

**Algorithm:** AES-256-GCM (authenticated encryption — detects tampering)

**Key management:**
- 256-bit (32-byte) encryption key stored as `BACKUP_ENCRYPTION_KEY` environment variable (hex-encoded, 64 chars)
- Generate once: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Key MUST NOT change between backups — old backups become undecryptable
- Store key in `.env` on VPS + separately in a secure password manager (key escrow)

**IV (Initialization Vector):**
- 96-bit (12-byte) random IV generated per file via `crypto.randomBytes(12)`
- IV is NOT secret — prepended to ciphertext in output file
- **CRITICAL:** Never reuse IV with the same key (GCM security guarantee)

**File format:**
```
[12 bytes IV] [ciphertext...] [16 bytes auth tag]
```

**Auth tag:** 16-byte GCM authentication tag, appended after ciphertext. Decryption verifies tag — any corruption or tampering throws an error.

**Implementation pattern (streaming):**
```typescript
// Encrypt: Read → Cipher → Write
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';

async function encryptFile(inputPath: string, outputPath: string, key: Buffer): Promise<{ iv: Buffer; authTag: Buffer }> {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const output = createWriteStream(outputPath);
  output.write(iv); // Prepend IV

  await pipeline(createReadStream(inputPath), cipher, output);

  const authTag = cipher.getAuthTag();
  // Append auth tag to file
  const fd = await open(outputPath, 'a');
  await fd.write(authTag);
  await fd.close();

  return { iv, authTag };
}

// Decrypt: Read IV → Read ciphertext → Decipher → Write
async function decryptFile(inputPath: string, outputPath: string, key: Buffer): Promise<void> {
  const fileStat = await stat(inputPath);
  const fileSize = fileStat.size;

  // Read IV (first 12 bytes) and auth tag (last 16 bytes)
  const fd = await open(inputPath, 'r');
  const ivBuf = Buffer.alloc(12);
  await fd.read(ivBuf, 0, 12, 0);
  const tagBuf = Buffer.alloc(16);
  await fd.read(tagBuf, 0, 16, fileSize - 16);
  await fd.close();

  const decipher = createDecipheriv('aes-256-gcm', key, ivBuf);
  decipher.setAuthTag(tagBuf);

  // Read ciphertext (skip IV, stop before auth tag)
  const input = createReadStream(inputPath, { start: 12, end: fileSize - 17 });
  await pipeline(input, decipher, createWriteStream(outputPath));
}
```

**Key rotation policy:**
- Annual rotation recommended
- Rotation procedure: generate new key, re-encrypt all retained backups with new key (run as one-time migration), update `BACKUP_ENCRYPTION_KEY` env var
- Old key must be retained in escrow until all backups encrypted with it have expired (7 years for monthly archives)

**Disaster recovery of encryption key:**
- Primary: `.env` on VPS (read by BullMQ worker)
- Secondary: Team password manager (1Password, Bitwarden, etc.)
- Tertiary: Printed and stored in secure physical location (safe/lockbox)
- Without the key, all encrypted backups are permanently unrecoverable

---

## 5. 7-Year NDPA Retention Policy (AC3)

### S3 Directory Structure

```
oslrs-backups/
├── daily/                              # 7-day rolling window
│   ├── 2026-02-25-app_db.dump.enc     # Encrypted pg_dump custom format
│   ├── 2026-02-25-globals.sql.enc     # Encrypted pg_dumpall --globals-only
│   ├── 2026-02-25-manifest.json       # Unencrypted metadata
│   └── ...
├── monthly/                            # 7-year retention (max 84 archives)
│   ├── 2026-02-app_db.dump.enc
│   ├── 2026-02-globals.sql.enc
│   ├── 2026-02-manifest.json
│   └── ...
└── drills/                             # Monthly restore drill reports
    ├── 2026-02-drill-report.json
    └── ...
```

### Manifest File Format

Each backup produces a `manifest.json`:
```json
{
  "version": 1,
  "timestamp": "2026-02-25T01:00:05.123Z",
  "type": "daily",
  "database": "app_db",
  "files": {
    "dump": {
      "key": "daily/2026-02-25-app_db.dump.enc",
      "sizeBytes": 52428800,
      "checksumSha256": "a1b2c3...",
      "encryptionIvHex": "d4e5f6...",  // Secondary lookup only — IV is also embedded as first 12 bytes of .enc file. Manifest copy aids disaster recovery if file header is corrupted.
      "format": "custom",
      "compression": "zstd:3"
    },
    "globals": {
      "key": "daily/2026-02-25-globals.sql.enc",
      "sizeBytes": 4096,
      "checksumSha256": "f6e5d4..."
    }
  },
  "stats": {
    "durationMs": 45200,
    "pgDumpDurationMs": 12300,
    "encryptDurationMs": 8500,
    "uploadDurationMs": 24400,
    "recordCounts": {
      "users": 205,
      "respondents": 45230,
      "submissions": 78400,
      "audit_logs": 5512
    }
  }
}
```

### Lifecycle Rules

| Tier | Retention | Trigger | Automation |
|------|-----------|---------|------------|
| **Daily** | 7 days | Auto-delete via S3 lifecycle rule | S3 lifecycle policy on `daily/` prefix (expiry: 7 days). **Primary mechanism** — worker does NOT delete old dailies (single responsibility). |
| **Monthly** | 7 years (84 months) | Promote 1st-of-month daily to `monthly/` | BullMQ worker logic: `if (startDate.getUTCDate() === 1)` copy to `monthly/` via `CopyObjectCommand` |
| **Monthly purge** | After 84 months | S3 lifecycle on prefix | Set S3 lifecycle on `monthly/` prefix (expiry: 2555 days ≈ 7 years) |

**DigitalOcean Spaces lifecycle support:** DO Spaces supports time-based expiration rules via the S3-compatible API (`PutBucketLifecycleConfiguration`). Rules are set per prefix. The web control panel does NOT expose lifecycle configuration — must be set programmatically.

**Lifecycle rule setup (one-time, via AWS CLI or application code):**
```typescript
// Set via @aws-sdk/client-s3 PutBucketLifecycleConfigurationCommand
const rules = [
  {
    ID: 'daily-cleanup',
    Filter: { Prefix: 'daily/' },
    Status: 'Enabled',
    Expiration: { Days: 7 },
  },
  {
    ID: 'monthly-retention',
    Filter: { Prefix: 'monthly/' },
    Status: 'Enabled',
    Expiration: { Days: 2555 }, // ~7 years
  },
  {
    ID: 'drill-cleanup',
    Filter: { Prefix: 'drills/' },
    Status: 'Enabled',
    Expiration: { Days: 365 }, // Keep drill reports 1 year
  },
];
```

### Data Residency Note (NFR4.2)

NFR4.2 states "All backups must remain within Nigerian data centers (data residency)." However, the current infrastructure uses **Hetzner CX43 (Germany)** for the VPS and **DigitalOcean Spaces** for S3-compatible storage — neither provider has Nigerian data center regions. DO Spaces is available in NYC, SFO, AMS, SGP, FRA, BLR only.

**Current decision for pilot phase:** Accept EU-based storage with application-level AES-256-GCM encryption as a mitigating control. Encrypted backups are unintelligible without the decryption key, which remains under project control. This satisfies the *spirit* of NDPA data protection even though the *letter* of data residency is not met.

**Post-pilot evaluation:** If NDPA auditors require strict Nigerian residency:
1. Evaluate Nigerian S3-compatible providers (e.g., MainOne Cloud, Rack Centre)
2. The S3 client interface is provider-agnostic — migrating requires only changing `S3_ENDPOINT`, `S3_REGION`, and credentials
3. All backup code remains unchanged due to S3 API compatibility

**Risk level:** Low for pilot (government project in procurement phase; NDPA enforcement is not yet targeting infrastructure location for encrypted data). Document this decision in ADR for traceability.

### Storage Cost Projections

**Database size estimates** (based on architecture capacity analysis):

| Year | Staff | Respondents | Audit Records | Estimated Compressed Dump |
|------|-------|-------------|---------------|---------------------------|
| 1 | ~200 | ~100K | ~5.5K | ~50-100 MB |
| 3 | ~200 | ~300K | ~16K | ~150-300 MB |
| 7 | ~200 | ~700K | ~38K | ~300-600 MB |

**S3 storage projections:**

| Year | Daily Tier (7 files) | Monthly Tier (cumulative) | Total Storage | Cost |
|------|---------------------|--------------------------|---------------|------|
| 1 | 7 × 100MB = 0.7 GB | 12 × 100MB = 1.2 GB | ~1.9 GB | $5/mo (base) |
| 3 | 7 × 300MB = 2.1 GB | 36 × ~200MB = 7.2 GB | ~9.3 GB | $5/mo (base) |
| 7 | 7 × 600MB = 4.2 GB | 84 × ~350MB = 29.4 GB | ~33.6 GB | $5/mo (base) |

**Conclusion:** All projections fit within DO Spaces base tier ($5/month for 250 GB). Storage cost is negligible.

### Compliance Verification

To prove 7-year retention for NDPA auditors:
1. **Manifest log**: Each backup's `manifest.json` stored alongside data in S3 (immutable record of backup events)
2. **S3 object listing**: Programmatic listing of `monthly/` prefix shows all retained backups with creation dates
3. **Audit log entries**: `system.backup_completed` and `system.backup_failed` actions in `audit_logs` table (leveraging Story 6-1's expanded action types)
4. **Monthly drill reports**: `drills/` prefix contains verification evidence
5. **Auditor-friendly report**: Script to generate CSV/PDF of all backup events, sizes, and drill results

---

## 6. BullMQ Backup Job Design (AC4)

### Queue Definition

```typescript
// apps/api/src/queues/backup.queue.ts
// Follows productivity-snapshot.queue.ts pattern

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
const QUEUE_NAME = 'database-backup';

let connection: Redis | null = null;
let queueInstance: Queue | null = null;

function getConnection(): Redis {
  if (!connection) {
    connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

export function getBackupQueue(): Queue {
  if (!queueInstance) {
    queueInstance = new Queue(QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: { age: 7 * 86400, count: 30 }, // Keep 7 days or 30 jobs
        removeOnFail: { age: 30 * 86400 }, // Keep failed for 30 days (debugging)
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 }, // 1min, 2min, 4min
      },
    });
  }
  return queueInstance;
}

export async function scheduleDailyBackup(): Promise<void> {
  if (isTestMode()) return;
  const queue = getBackupQueue();
  await queue.upsertJobScheduler(
    'daily-backup',
    { pattern: '00 01 * * *' }, // 01:00 UTC = 02:00 WAT
    { name: 'database-backup', data: {} },
  );
}

export async function closeBackupQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
```

### Worker Implementation Design

```typescript
// apps/api/src/workers/backup.worker.ts

import { Worker, Job, UnrecoverableError } from 'bullmq';
import { Redis } from 'ioredis';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createReadStream, createWriteStream } from 'node:fs';
import { unlink, stat, writeFile } from 'node:fs/promises';
import { createHash, createCipheriv, randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import pino from 'pino';

const execAsync = promisify(exec);
const logger = pino({ name: 'backup-worker' });
const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

interface BackupResult {
  filename: string;
  sizeBytes: number;
  checksumSha256: string;
  durationMs: number;
  promotedToMonthly: boolean;
}

async function processBackup(job: Job): Promise<BackupResult> {
  const startTime = Date.now();
  const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const dumpFilename = `${dateStr}-app_db.dump`;
  const encFilename = `${dumpFilename}.enc`;
  const tmpDumpPath = `/tmp/${dumpFilename}`;
  const tmpEncPath = `/tmp/${encFilename}`;

  try {
    // Step 0: Validate env vars (defense-in-depth against shell injection)
    const pgUser = process.env.POSTGRES_USER || 'user';
    const pgDb = process.env.POSTGRES_DB || 'app_db';
    if (!/^[a-zA-Z0-9_]+$/.test(pgUser) || !/^[a-zA-Z0-9_]+$/.test(pgDb)) {
      throw new UnrecoverableError(`Invalid POSTGRES_USER or POSTGRES_DB: must be alphanumeric/underscore only`);
    }

    // Docker mode is ON by default (version alignment with PG15 in container).
    // Set BACKUP_USE_DOCKER=false explicitly to use host-installed pg_dump instead.
    const useDocker = process.env.BACKUP_USE_DOCKER !== 'false';

    // Step 1: Execute pg_dump (database data + schema)
    logger.info({ event: 'backup.pg_dump.start', date: dateStr });
    await job.updateProgress(10);

    const pgDumpCmd = useDocker
      ? `docker exec -t postgres pg_dump -Fc --compress=zstd:3 --no-password --lock-wait-timeout=30000 -U "${pgUser}" "${pgDb}" > "${tmpDumpPath}"`
      : `PGPASSWORD="${process.env.PGPASSWORD}" pg_dump -Fc --compress=zstd:3 --no-password --lock-wait-timeout=30000 -h localhost -U "${pgUser}" "${pgDb}" -f "${tmpDumpPath}"`;

    const { stderr } = await execAsync(pgDumpCmd, { timeout: 300000 }); // 5min timeout
    if (stderr && !stderr.includes('WARNING')) {
      throw new UnrecoverableError(`pg_dump failed: ${stderr}`);
    }

    const dumpStat = await stat(tmpDumpPath);
    logger.info({ event: 'backup.pg_dump.complete', sizeBytes: dumpStat.size, date: dateStr });

    // Step 1b: Execute pg_dumpall --globals-only (roles, tablespaces — not included in pg_dump)
    const globalsFilename = `${dateStr}-globals.sql`;
    const tmpGlobalsPath = `/tmp/${globalsFilename}`;
    const globalsDumpCmd = useDocker
      ? `docker exec -t postgres pg_dumpall --globals-only --no-password -U "${pgUser}" > "${tmpGlobalsPath}"`
      : `PGPASSWORD="${process.env.PGPASSWORD}" pg_dumpall --globals-only --no-password -h localhost -U "${pgUser}" > "${tmpGlobalsPath}"`;

    const { stderr: globalsStderr } = await execAsync(globalsDumpCmd, { timeout: 60000 }); // 1min timeout
    if (globalsStderr && !globalsStderr.includes('WARNING')) {
      logger.warn({ event: 'backup.globals_dump.warning', stderr: globalsStderr });
      // Non-fatal: globals backup is supplementary. Continue with main dump.
    }
    const globalsStat = await stat(tmpGlobalsPath).catch(() => null);
    logger.info({ event: 'backup.globals_dump.complete', sizeBytes: globalsStat?.size ?? 0 });

    await job.updateProgress(40);

    // Step 2: Compute checksum of unencrypted dump
    const checksum = await computeFileChecksum(tmpDumpPath);

    // Step 3: Encrypt
    logger.info({ event: 'backup.encrypt.start', date: dateStr });
    const encryptionKey = getEncryptionKey();
    await encryptFile(tmpDumpPath, tmpEncPath, encryptionKey);
    const encStat = await stat(tmpEncPath);
    logger.info({ event: 'backup.encrypt.complete', encSizeBytes: encStat.size });
    await job.updateProgress(60);

    // Step 4: Upload dump to S3
    logger.info({ event: 'backup.upload.start', date: dateStr });
    const s3Key = `daily/${encFilename}`;
    await uploadToS3(tmpEncPath, s3Key, {
      checksum,
      originalSize: dumpStat.size.toString(),
      date: dateStr,
    });

    // Step 4b: Encrypt and upload globals (if available)
    let globalsS3Key: string | undefined;
    if (globalsStat && globalsStat.size > 0) {
      const tmpGlobalsEncPath = `${tmpGlobalsPath}.enc`;
      await encryptFile(tmpGlobalsPath, tmpGlobalsEncPath, encryptionKey);
      const globalsChecksum = await computeFileChecksum(tmpGlobalsPath);
      globalsS3Key = `daily/${dateStr}-globals.sql.enc`;
      await uploadToS3(tmpGlobalsEncPath, globalsS3Key, {
        checksum: globalsChecksum,
        date: dateStr,
      });
      await unlink(tmpGlobalsEncPath).catch(() => {});
    }
    await job.updateProgress(80);

    // Step 5: Verify upload(s)
    await verifyS3Upload(s3Key, encStat.size);
    if (globalsS3Key) await verifyS3Upload(globalsS3Key);
    logger.info({ event: 'backup.upload.verified', s3Key });

    // Step 6: Write manifest
    const recordCounts = await getRecordCounts();
    const manifest = {
      version: 1,
      timestamp: new Date().toISOString(),
      type: 'daily',
      database: pgDb,
      files: {
        dump: {
          key: s3Key,
          sizeBytes: encStat.size,
          originalSizeBytes: dumpStat.size,
          checksumSha256: checksum,
          format: 'custom',
          compression: 'zstd:3',
        },
        ...(globalsS3Key && globalsStat ? {
          globals: {
            key: globalsS3Key,
            sizeBytes: globalsStat.size,
          },
        } : {}),
      },
      stats: {
        durationMs: Date.now() - startTime,
        recordCounts,
      },
    };
    const manifestKey = `daily/${dateStr}-manifest.json`;
    await uploadManifest(manifestKey, manifest);

    // Step 7: Promote to monthly (if 1st of month)
    // Use startDate captured at job start to avoid timing drift on long-running jobs
    const startDate = new Date(dateStr); // derived from dateStr for consistency
    const promotedToMonthly = startDate.getUTCDate() === 1;
    if (promotedToMonthly) {
      const monthStr = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}`;
      await copyToMonthly(s3Key, `monthly/${monthStr}-app_db.dump.enc`);
      if (globalsS3Key) await copyToMonthly(globalsS3Key, `monthly/${monthStr}-globals.sql.enc`);
      await copyToMonthly(manifestKey, `monthly/${monthStr}-manifest.json`);
      logger.info({ event: 'backup.promoted_to_monthly', month: monthStr });
    }

    // Note: Daily cleanup is handled by S3 lifecycle rules (7-day expiry on daily/ prefix).
    // No application-level cleanup needed — see Section 5 lifecycle rules.

    await job.updateProgress(90);

    // Step 8: Send success notification
    await sendBackupNotification('success', {
      date: dateStr,
      sizeBytes: encStat.size,
      durationMs: Date.now() - startTime,
      checksum,
      promotedToMonthly,
    });

    const result: BackupResult = {
      filename: encFilename,
      sizeBytes: encStat.size,
      checksumSha256: checksum,
      durationMs: Date.now() - startTime,
      promotedToMonthly,
    };

    logger.info({ event: 'backup.complete', ...result });
    await job.updateProgress(100);
    return result;
  } catch (error) {
    logger.error({ event: 'backup.failed', error: (error as Error).message, date: dateStr });

    // Send failure notification (best-effort)
    await sendBackupNotification('failure', {
      date: dateStr,
      error: (error as Error).message,
      attempt: job.attemptsMade + 1,
      maxAttempts: (job.opts?.attempts ?? 3),
    }).catch(() => {}); // Don't let notification failure mask the real error

    throw error;
  } finally {
    // Cleanup temp files (globals paths defined in outer scope)
    await unlink(tmpDumpPath).catch(() => {});
    await unlink(tmpEncPath).catch(() => {});
    await unlink(`/tmp/${dateStr}-globals.sql`).catch(() => {});
    await unlink(`/tmp/${dateStr}-globals.sql.enc`).catch(() => {});
  }
}
```

### pg_dump Execution Strategy

| Method | Recommendation | Notes |
|--------|---------------|-------|
| **`docker exec`** | **Primary (production)** | Guarantees pg_dump version matches server. Requires Docker socket access. |
| **Direct `pg_dump`** | Fallback (dev/CI) | Requires `postgresql-client-15` on host. Use when Docker unavailable. |
| **Streaming to S3** | Not recommended | Complex mid-stream error handling. Temp file is simpler and retry-safe. |

**Decision:** Use `docker exec` by default (`BACKUP_USE_DOCKER=true`), with direct `pg_dump` as a configurable fallback. Always write to temp file first — retry-safe and enables checksum computation before upload.

### Error Handling and Retry Policy

| Error Type | Action | Retryable? |
|-----------|--------|------------|
| pg_dump auth failure | `UnrecoverableError` — skip retries | No |
| pg_dump lock timeout | Retry with backoff | Yes |
| S3 upload network error | Retry with backoff | Yes |
| S3 auth failure | `UnrecoverableError` | No |
| Encryption key missing | `UnrecoverableError` | No |
| Temp disk full | Retry after cleanup | Yes |
| 3 consecutive failures | Alert via email | — |

**BullMQ configuration:**
- `attempts: 3` (total, including first try)
- `backoff: { type: 'exponential', delay: 60000 }` → 1min, 2min, 4min delays
- `lockDuration: 600000` (10 minutes) — critical for long-running backup jobs
- Lock auto-renews at 5-minute intervals (half of lockDuration)
- `job.updateProgress()` called at checkpoints to track progress in BullMQ dashboard

### Worker Registration

Add to `workers/index.ts`:
```typescript
import { backupWorker } from './backup.worker.js';
import { scheduleDailyBackup } from '../queues/backup.queue.js';

// In initializeWorkers():
workers: ['import', 'email', 'webhook-ingestion', 'fraud-detection', 'productivity-snapshot', 'database-backup'],
backupWorkerRunning: backupWorker?.isRunning() ?? false,
await scheduleDailyBackup();

// In closeAllWorkers():
backupWorker?.close(),
```

### S3 Helper: `copyToMonthly()`

S3 does not support rename/move — monthly promotion requires `CopyObjectCommand` followed by no delete (the daily copy is cleaned by lifecycle rules independently):

```typescript
import { CopyObjectCommand } from '@aws-sdk/client-s3';

async function copyToMonthly(sourceKey: string, destKey: string): Promise<void> {
  const bucket = process.env.S3_BUCKET_NAME!;
  await s3Client.send(new CopyObjectCommand({
    Bucket: bucket,
    CopySource: `${bucket}/${sourceKey}`,
    Key: destKey,
  }));
  logger.info({ event: 'backup.s3_copy', from: sourceKey, to: destKey });
}
```

**Note:** The daily source object is NOT deleted after copy — S3 lifecycle rules on `daily/` handle expiry independently. This avoids race conditions between promotion and lifecycle deletion.

---

## 7. Restore Procedure Design (AC5)

### Manual Restore Steps

1. **Identify backup** — List S3 `daily/` or `monthly/` prefix, choose target date
2. **Download** — `aws s3 cp s3://bucket/daily/2026-02-25-app_db.dump.enc /tmp/`
3. **Decrypt** — Run decrypt function with `BACKUP_ENCRYPTION_KEY`
4. **Restore** — `pg_restore -Fc --clean --if-exists -U user -d app_db /tmp/2026-02-25-app_db.dump`
5. **Validate** — Run integrity checks (record counts, schema version, hash chain)
6. **Cleanup** — Delete temp files

### Automated Restore Script

```typescript
// scripts/restore-backup.ts
// Usage: pnpm tsx scripts/restore-backup.ts --date 2026-02-25 [--tier daily|monthly] [--target-db restore_test]

import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

interface RestoreOptions {
  date: string;           // YYYY-MM-DD or YYYY-MM (for monthly)
  tier: 'daily' | 'monthly';
  targetDb: string;       // Default: app_db (or staging DB name)
  skipIntegrityChecks: boolean;
}

async function restoreBackup(options: RestoreOptions): Promise<RestoreReport> {
  // 1. Download encrypted backup from S3
  // 2. Download manifest for checksum verification
  // 3. Verify downloaded file checksum matches manifest
  // 4. Decrypt backup file
  // 5. Verify decrypted dump with pg_restore --list (dry-run)
  // 6. Restore to target database: pg_restore -Fc --clean --if-exists
  // 7. Run integrity checks if not skipped
  // 8. Generate and return restore report
}

async function runIntegrityChecks(targetDb: string, manifest: Manifest): Promise<IntegrityReport> {
  return {
    recordCountMatch: await validateRecordCounts(targetDb, manifest.stats.recordCounts),
    schemaVersionValid: await validateSchemaVersion(targetDb),
    auditHashChainValid: await validateAuditHashChain(targetDb), // If Story 6-1 deployed
    allRolesPresent: await validateRolesExist(targetDb),
  };
}
```

### Integrity Checks

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Record counts | Compare `SELECT count(*)` on key tables vs manifest | Within 0.1% tolerance (accounts for concurrent writes) |
| Schema version | Check Drizzle migration table (`__drizzle_migrations`) | Latest migration ID matches production |
| Audit hash chain | Run `AuditService.verifyHashChain()` (Story 6-1) | All hashes valid, no gaps |
| Roles present | Query `roles` table | All 7 system roles exist |
| Admin access | Attempt test auth with admin credentials | Login succeeds |

### Estimated Restore Times

| Year | Compressed Size | Download (100Mbps) | Decrypt | pg_restore | Total |
|------|----------------|--------------------|---------|-----------:|------:|
| 1 | ~100 MB | ~8s | ~3s | ~15s | ~30s |
| 3 | ~300 MB | ~24s | ~8s | ~45s | ~1.5min |
| 7 | ~600 MB | ~48s | ~15s | ~90s | ~3min |

All scenarios well within the 1-hour RTO (NFR3.4). Even with network variability and overhead, worst case is ~10 minutes.

### Recovery Scenarios

| Scenario | Recovery Path | Estimated Time |
|----------|-------------|---------------|
| **Single table corruption** | `pg_restore --table=X` from latest backup | 1-5 min |
| **Full DB loss** | Restore latest pg_dump from S3 | 3-10 min |
| **VPS hardware failure** | 1) Spin up new VPS from snapshot 2) Remap Floating IP 3) If snapshot stale, restore S3 backup | 5-30 min |
| **Accidental data deletion** | Restore from pre-deletion backup (up to 24h data loss) | 3-10 min |
| **Ransomware/compromise** | Fresh VPS + restore from off-site S3 backup | 15-45 min |

---

## 8. Monthly Restore Drill Design (AC6)

### Drill Checklist

1. Download latest daily backup from S3
2. Verify checksum against manifest
3. Decrypt backup file
4. Create fresh Docker PostgreSQL container (`docker run -d --name restore-test -e POSTGRES_DB=drill_db ...`)
5. Restore backup into fresh container via `pg_restore`
6. Validate record counts against manifest (tolerance: 0.1%)
7. Validate all 7 system roles exist in `roles` table
8. Validate latest audit log hash chain (if Story 6-1 deployed)
9. Validate Drizzle migration version matches production
10. Destroy test container
11. Generate drill report
12. Upload drill report to `drills/` prefix in S3
13. Email drill results to Super Admin

### Automation Level

**Recommendation: Semi-automated script, manually triggered.**

**Rationale:**
- Fully automated monthly BullMQ job risks creating and destroying Docker containers unattended, which could interfere with production if resource-constrained
- A script triggered by Super Admin or scheduled cron on VPS (not BullMQ) is safer
- The script itself is fully automated — one command runs all steps and produces a report
- Super Admin receives email notification regardless of trigger method

**Implementation:**
```typescript
// scripts/restore-drill.ts
// Usage: pnpm tsx scripts/restore-drill.ts [--month 2026-02]
// Triggered manually or via system cron (crontab): 0 3 1 * * cd /app && pnpm tsx scripts/restore-drill.ts

async function runRestoreDrill(month?: string): Promise<DrillReport> {
  const targetMonth = month || getCurrentMonth();

  // 1. Download latest backup
  // 2. Decrypt and restore to temp Docker container
  // 3. Run all integrity checks
  // 4. Destroy temp container
  // 5. Generate report
  // 6. Upload report to S3
  // 7. Email Super Admin

  return report;
}
```

### Success Criteria

| Criterion | Threshold | Action on Failure |
|-----------|-----------|-------------------|
| Record counts match manifest | Within 0.1% | Warning (might indicate concurrent writes during backup) |
| All 7 roles present | Exact match | FAIL — critical data missing |
| Audit hash chain valid | 100% valid | FAIL — data integrity compromised |
| Schema version matches | Exact match | Warning — may indicate migration gap |
| Restore completes without error | Zero errors | FAIL — backup may be corrupted |
| Total drill time | < 10 minutes | Warning — performance degradation |

### Drill Report Format

```json
{
  "drillId": "drill-2026-02",
  "timestamp": "2026-02-01T03:05:00.000Z",
  "backupUsed": {
    "key": "daily/2026-02-01-app_db.dump.enc",
    "date": "2026-02-01",
    "sizeBytes": 52428800
  },
  "results": {
    "overall": "PASS",
    "checksumValid": true,
    "decryptionSuccessful": true,
    "restoreSuccessful": true,
    "integrityChecks": {
      "recordCounts": { "status": "PASS", "details": { "users": 205, "respondents": 45230 } },
      "rolesPresent": { "status": "PASS", "count": 7 },
      "auditHashChain": { "status": "PASS", "verified": 5512, "tampered": 0 },
      "schemaVersion": { "status": "PASS", "migration": "0007" }
    },
    "durationMs": 125000
  }
}
```

### Compliance Documentation

Monthly drill reports serve as NDPA compliance evidence:
- Stored in S3 `drills/` prefix (1-year retention)
- Each report proves: backup exists, is decryptable, contains valid data, and can be restored
- Annual compliance summary can be generated by aggregating 12 monthly drill reports
- Template includes: drill date, backup date, record counts, integrity check results, restore time, pass/fail determination

---

## 9. Backup Monitoring & Alerting (AC7)

### Success/Failure Tracking

**Approach:** Extend audit_logs with backup-specific actions (leveraging Story 6-1's `AUDIT_ACTIONS` expansion):

| Action | When | Details |
|--------|------|---------|
| `system.backup_started` | Job begins | `{ date, scheduled_time }` |
| `system.backup_completed` | Job succeeds | `{ date, filename, sizeBytes, durationMs, checksum, promotedToMonthly }` |
| `system.backup_failed` | Job fails after all retries | `{ date, error, attempts }` |
| `system.restore_drill_completed` | Drill succeeds | `{ drillId, overall, durationMs }` |
| `system.restore_drill_failed` | Drill fails | `{ drillId, failures }` |

**Implementation:** Call `AuditService.logPiiAccess()` (fire-and-forget) with `actorId = null` (system action) at each lifecycle point.

**Alternative (if more granular tracking needed):** Create a `backup_jobs` table:
```sql
CREATE TABLE backup_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,        -- 'daily_backup', 'monthly_promotion', 'restore_drill'
  status TEXT NOT NULL,          -- 'started', 'completed', 'failed'
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  s3_key TEXT,
  size_bytes BIGINT,
  checksum TEXT,
  duration_ms INTEGER,
  error TEXT,
  metadata JSONB
);
```

**Recommendation:** Start with audit_logs approach (simpler, leverages existing infrastructure). Add dedicated `backup_jobs` table only if monitoring dashboard needs richer querying than audit_logs provides.

### Email Notifications

**Success notification (daily):**
```
Subject: [OSLRS] Daily Backup Completed - 2026-02-25

✅ Database backup completed successfully.

📊 Summary:
- Date: 2026-02-25
- File: daily/2026-02-25-app_db.dump.enc
- Size: 52.4 MB (encrypted)
- Duration: 45 seconds
- Checksum: a1b2c3...
- Monthly promotion: No

📋 Record counts:
- Users: 205
- Respondents: 45,230
- Submissions: 78,400
- Audit logs: 5,512
```

**Failure notification (critical):**
```
Subject: ⚠️ [OSLRS] Backup FAILED - 2026-02-25

❌ Database backup failed after 3 attempts.

🔴 Error: S3 upload timeout after 120 seconds
📊 Attempt 3 of 3
⏰ Last attempt: 2026-02-25T01:12:45Z

⚡ Action required: Check backup worker logs and S3 connectivity.
```

**Implementation:** Queue emails via existing `email.queue.ts` → `email.worker.ts` pipeline. Template follows existing EmailService HTML + plain-text branding pattern.

### Dashboard Integration (Story 6-2)

The System Health dashboard (designed in prep-7 monitoring spike) should display:

| Widget | Data Source | Display |
|--------|------------|---------|
| **Last Backup Status** | Latest `system.backup_completed` or `system.backup_failed` from audit_logs | Green badge = success within 26h, Amber = >26h but <48h, Red = >48h or last failed |
| **Backup History** | Last 7 `backup_jobs` or audit entries | Sparkline chart (size over time) |
| **Monthly Retention** | S3 `ListObjectsV2` on `monthly/` prefix | Count of retained monthly backups (target: grows to 84) |
| **Last Drill Result** | Latest drill report from S3 | PASS/FAIL badge with date |

### Alert Escalation

| Condition | Severity | Action |
|-----------|----------|--------|
| 1 backup failure | Warning | Email to Super Admin |
| 2 consecutive failures | Critical | Email to Super Admin + all admins with subject prefix `⚠️ CRITICAL:` |
| 3+ consecutive failures | Emergency | Email with escalation instructions (check S3, check Docker, check disk space) |
| Drill failure | Critical | Email to Super Admin with failure details |

**Implementation:** Track consecutive failure count in Redis key `backup:consecutive_failures`. Reset to 0 on success. BullMQ worker's `failed` event handler increments and checks threshold.

### Monitoring Metrics (for prep-7 prom-client integration)

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `backup_last_success_timestamp` | Gauge | — | Unix timestamp of last successful backup |
| `backup_duration_seconds` | Histogram | `{type}` | Duration of backup jobs (daily, monthly_promotion) |
| `backup_size_bytes` | Gauge | `{type}` | Size of last backup file |
| `backup_consecutive_failures` | Gauge | — | Current consecutive failure count |

---

## 10. Story 6-3 Implementation Checklist

Derived from this spike's findings, Story 6-3 should implement:

### Phase 1: Core Backup Pipeline
- [ ] Create `apps/api/src/queues/backup.queue.ts` (queue definition, cron schedule)
- [ ] Create `apps/api/src/workers/backup.worker.ts` (pg_dump + pg_dumpall --globals-only, encrypt, upload, manifest)
- [ ] Add encryption helpers: `encryptFile()`, `decryptFile()`, `computeFileChecksum()`
- [ ] Add S3 helpers: `uploadToS3()`, `verifyS3Upload()`, `uploadManifest()`, `copyToMonthly()` (uses `CopyObjectCommand`)
- [ ] Register in `workers/index.ts` (initializeWorkers, closeAllWorkers)
- [ ] Add env vars: `BACKUP_ENCRYPTION_KEY`, `BACKUP_USE_DOCKER` to `.env.example`
- [ ] Add input validation for `POSTGRES_USER` and `POSTGRES_DB` (alphanumeric + underscore only)
- [ ] Set S3 lifecycle rules programmatically (daily: 7 days, monthly: 2555 days, drills: 365 days)

### Phase 2: Monitoring & Notifications
- [ ] Add backup audit log entries (`system.backup_started`, `system.backup_completed`, `system.backup_failed`)
- [ ] Add email templates for success/failure notifications
- [ ] Add consecutive failure tracking (Redis key)
- [ ] Add alert escalation logic (1 → warning, 2 → critical, 3+ → emergency)

### Phase 3: Restore & Drills
- [ ] Create `scripts/restore-backup.ts` (download, decrypt, restore, validate)
- [ ] Create `scripts/restore-drill.ts` (end-to-end drill with Docker staging container)
- [ ] Add integrity check functions (record counts, roles, schema version, audit hash chain)
- [ ] Add drill report upload to S3 and email notification

### Phase 4: Dashboard Integration (depends on Story 6-2)
- [ ] Add backup status widget to System Health dashboard
- [ ] Add backup history sparkline
- [ ] Add monthly retention count
- [ ] Add last drill result badge

### Estimated Effort
- **New files:** 5 (queue, worker, encrypt helpers, restore script, drill script)
- **Modified files:** 3 (workers/index.ts, .env.example, possibly email templates)
- **Tests:** ~15-20 (unit tests for encryption, manifest, lifecycle logic; integration for S3 upload)
- **Estimated tasks:** 8-10 story tasks

---

## 11. Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary backup strategy | pg_dump + S3 | Portable, verifiable, NDPA-compliant |
| Secondary backup | VPS snapshots (6h) | Fast disaster recovery via Floating IP |
| pg_dump format | Custom (`-Fc`) with zstd:3 | Selective restore, native compression, smaller |
| pg_dump execution | `docker exec` (primary) | Version alignment guaranteed |
| Encryption | App-level AES-256-GCM | DO Spaces doesn't support SSE-S3 |
| Key storage | Env var + password manager escrow | Simple, recoverable |
| Scheduling | BullMQ cron 01:00 UTC | Low-traffic window, proven pattern |
| Lock duration | 600,000ms (10 min) | Prevents stall detection during long backup |
| Daily retention | 7 days (S3 lifecycle) | Per NFR3.3 |
| Monthly retention | 7 years / 84 months (S3 lifecycle) | Per NFR4.2 NDPA |
| Restore drills | Semi-automated script, monthly | Safer than unattended Docker container management |
| Tracking | Audit log entries (initial) | Leverages existing AuditService, upgrade to dedicated table if needed |
| Alert escalation | 1→warn, 2→critical, 3+→emergency | Progressive urgency |
| WAL archiving | Deferred (post-pilot graduation) | Over-engineered for current scale |
| Data residency | EU storage + AES-256-GCM encryption (pilot) | No Nigerian S3 providers; encryption mitigates NDPA risk; S3 interface is provider-agnostic for future migration |
| Daily cleanup | S3 lifecycle rules only (no worker cleanup) | Single responsibility; S3 lifecycle is reliable and zero-code |
| Globals backup | `pg_dumpall --globals-only` (separate file) | Roles/tablespaces not in `pg_dump`; non-fatal if globals fail |
