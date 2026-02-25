# Immutable Audit Log Spike Summary

**Date:** 2026-02-24
**Story:** prep-4-immutable-audit-log-spike
**Feeds:** Story 6-1 (Immutable Append-Only Audit Logs)

---

## 1. Executive Summary

This spike researches the architecture for upgrading OSLRS's existing lightweight `AuditService` to a tamper-evident, immutable, append-only audit logging system that meets NDPA 7-year retention requirements and NFR8.3 specifications.

**Key decisions:**

| Area | Recommendation | Rationale |
|------|---------------|-----------|
| Write-once enforcement | Trigger-based `BEFORE UPDATE/DELETE` | Simplest, works with existing Drizzle single-role setup |
| Hash algorithm | SHA-256 via Node.js `crypto` | Built-in, fast (~0.01ms/hash), no extension needed |
| Concurrent insert handling | `SELECT ... FOR UPDATE` serialization | Sufficient for 15–200 inserts/day |
| Partitioning | Deferred — document design, implement when approaching 500K records | 1M threshold is ~5+ years away at projected volume |
| Partition granularity (when needed) | Monthly RANGE on `created_at` | Best match for audit query patterns |
| Retention period | 7 years (84 months) | Conservative interpretation of CITA 6-year + 1-year buffer |
| Storage tiers | Single tier sufficient at OSLRS scale | 7 years of data ≈ 500MB total |

---

## 2. Current State Analysis

### Existing AuditService

**File:** `apps/api/src/services/audit.service.ts` (99 lines)
**Tests:** `apps/api/src/services/__tests__/audit.service.test.ts` (13 tests, all passing)

**Two modes:**
- `logPiiAccess(req, action, ...)` — Fire-and-forget with `.catch()` warning pattern
- `logPiiAccessTx(tx, actorId, action, ...)` — Transactional, awaited within `db.transaction()`

**7 PII action types:**
```
pii.view_record, pii.view_list, pii.export_csv, pii.export_pdf,
pii.search, pii.view_productivity, pii.export_productivity
```

**9 audit points across 3 controllers (verified via grep 2026-02-25):**
- `ExportController` (1 call) — `export.controller.ts:88` CSV/PDF export logging
- `RespondentController` (2 calls) — `respondent.controller.ts:75` individual record view, `:108` list view access
- `ProductivityController` (6 calls) — `productivity.controller.ts:184`, `:276`, `:369`, `:415`, `:454`, `:525`

### Current Schema (`apps/api/src/db/schema/audit.ts`)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID (v7) | PK |
| actorId | UUID | FK → users.id, nullable |
| action | TEXT | NOT NULL |
| targetResource | TEXT | optional |
| targetId | UUID | optional |
| details | JSONB | optional metadata |
| ipAddress | TEXT | optional |
| userAgent | TEXT | optional |
| createdAt | TIMESTAMP WITH TZ | NOT NULL, DEFAULT NOW() |

### What's Missing (NFR8.3 / Story 6-1)

- No immutability guarantees (table allows UPDATE/DELETE)
- No hash chaining (cannot detect tampering)
- No partitioning (will degrade at 1M+ records)
- No retention policy (7-year NDPA requirement unaddressed)
- No append-only enforcement (no DB-level constraints)
- Limited action coverage (only PII access, not all data modifications)

---

## 3. Write-Once Enforcement (AC1)

### Strategy Comparison

| Strategy | Mechanism | Pros | Cons |
|----------|-----------|------|------|
| **A. Trigger-based** ✅ | `BEFORE UPDATE/DELETE → RAISE EXCEPTION` | Simple single migration; works with any DB role; fires for ALL access paths (Drizzle, raw SQL, pgAdmin); compatible with `db:push:force` | Superuser can bypass via `DISABLE TRIGGER` |
| **B. Row-Level Security (RLS)** | `CREATE POLICY ... FOR DELETE USING (false)` | Native PostgreSQL; enforced even for table owner with `FORCE RLS` | Requires separate DB role; Drizzle connection changes; complex setup and testing |
| **C. Role separation** | INSERT-only `GRANT`, no UPDATE/DELETE | Strongest guarantee at permission level | Requires dual connection pools; significant architecture change; operational complexity |
| **D. Application-only** | No DB enforcement, trust the app | Easiest | Zero protection against direct DB access; fails NFR8.3 |

### Recommendation: Trigger-Based (Strategy A)

**Rationale:**
- Aligns with NFR8.3 ("DB permissions/triggers")
- Zero disruption to existing Drizzle single-role connection (`apps/api/src/db/index.ts`)
- Compatible with `db:push:force` CI workflow
- No new DB roles, connection pools, or configuration
- Fires for every UPDATE/DELETE attempt regardless of access path

**Superuser caveat:** PostgreSQL superuser can `ALTER TABLE ... DISABLE TRIGGER`. This is acceptable because:
1. Superuser access to production should be restricted to emergency maintenance
2. PostgreSQL's native `log_statement` can log all superuser activity independently
3. Defense-in-depth: hash chaining (Section 4) provides a secondary tamper detection layer

### PoC SQL: Trigger-Based Write-Once Enforcement

```sql
-- ============================================================
-- IMMUTABLE AUDIT LOG: Write-Once Trigger
-- Prevents UPDATE and DELETE on audit_logs table.
-- Only superuser can disable (logged separately by PostgreSQL).
-- ============================================================

CREATE OR REPLACE FUNCTION audit_logs_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'audit_logs table is append-only: % operations are forbidden (attempted on row id=%)',
    TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

CREATE TRIGGER trg_audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

-- Also block TRUNCATE (DDL-level protection).
-- Requires a separate function because TRUNCATE is statement-level (no OLD/NEW row).
CREATE OR REPLACE FUNCTION audit_logs_no_truncate()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs table is append-only: TRUNCATE is forbidden';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_no_truncate();
```

**Drizzle migration approach:** Add this as a custom SQL migration file outside Drizzle's schema management. The `audit_logs` Drizzle schema definition stays unchanged — triggers are DB-level and invisible to the ORM.

---

## 4. Hash Chaining Design (AC2)

### Algorithm: SHA-256 via Node.js `crypto`

- **Built-in:** `crypto.createHash('sha256')` — no extensions needed
- **Performance:** ~0.01–0.05ms per hash. At 200 records/day → ~10ms total daily
- **Output:** 64-character hex string, stored in `TEXT` column
- **No pgcrypto dependency:** Keeps crypto logic in application layer where it's testable

### Chain Formula

```
hash_n = SHA256(id_n + "|" + action_n + "|" + (actorId_n ?? "SYSTEM") + "|" + createdAt_n.toISOString() + "|" + canonicalJson(details_n ?? {}) + "|" + hash_{n-1})
```

**Design decisions:**
- **Pipe separator (`|`)** prevents field concatenation ambiguity
- **`toISOString()`** for deterministic timestamp serialization
- **Deterministic JSON serialization (CRITICAL):** `JSON.stringify()` preserves V8 insertion order, but PostgreSQL JSONB normalizes keys alphabetically. A hash computed at INSERT time (insertion order) will **not match** a hash re-computed at VERIFY time (JSONB-normalized order). **Story 6-1 MUST use sorted-key serialization:**
  ```typescript
  // WRONG: JSON.stringify(details) — non-deterministic across round-trips
  // RIGHT: deterministic canonical form with sorted keys
  function canonicalJson(obj: unknown): string {
    return JSON.stringify(obj, (_key, value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
        : value
    );
  }
  ```
  Alternatively, use a library like `json-stable-stringify`. The key requirement is that `canonicalJson(obj) === canonicalJson(JSON.parse(JSON.stringify(obj)))` for any input.
- **Null actorId** → `"SYSTEM"` string
- **Genesis:** `hash_0 = SHA256("OSLRS-AUDIT-GENESIS-2026")`, `previous_hash = null`

### TypeScript Implementation

```typescript
import { createHash } from 'node:crypto';

const GENESIS_SEED = 'OSLRS-AUDIT-GENESIS-2026';
export const GENESIS_HASH = createHash('sha256').update(GENESIS_SEED).digest('hex');

/**
 * Deterministic JSON serialization — sorts object keys recursively.
 * Required because PostgreSQL JSONB normalizes key order (alphabetical),
 * which differs from V8's insertion-order JSON.stringify.
 */
export function canonicalJson(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value
  );
}

export function computeAuditHash(
  id: string,
  action: string,
  actorId: string | null,
  createdAt: Date,
  details: unknown,
  previousHash: string,
): string {
  const payload = [
    id,
    action,
    actorId ?? 'SYSTEM',
    createdAt.toISOString(),
    canonicalJson(details ?? {}),
    previousHash,
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}
```

### Concurrent Insert Handling

Hash chains are inherently sequential. Two concurrent inserts reading the same "previous hash" would fork the chain.

> **⚠ Why `SELECT ... FOR UPDATE` is insufficient:** Row-level locks only block concurrent access to the **same existing row**. If Transaction A inserts a new row and commits, Transaction B (which locked the old last row) still reads the old hash — it doesn't see A's new insert. This forks the chain. Row-level locks serialize access to existing data, not new inserts.

**Solution: Advisory lock serialization**

```typescript
import { sql } from 'drizzle-orm';

// Inside a serialized transaction:
// Advisory lock ensures only one audit insert proceeds at a time.
// The lock is automatically released when the transaction commits/rolls back.
await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('audit_logs_chain'))`);

const [lastRecord] = await tx
  .select({ hash: auditLogs.hash })
  .from(auditLogs)
  .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
  .limit(1);

const previousHash = lastRecord?.hash ?? GENESIS_HASH;
const newHash = computeAuditHash(id, action, actorId, createdAt, details, previousHash);

await tx.insert(auditLogs).values({ ...record, hash: newHash, previousHash });
```

**`pg_advisory_xact_lock`** acquires a transaction-scoped advisory lock on a fixed key. The second transaction blocks at the lock call until the first commits, then reads the **updated** last row (including the first transaction's insert). This guarantees a linear chain.

**Performance impact:** ~1–5ms additional latency per insert (lock acquisition + wait). At 15–200 records/day (~1 insert every 7 minutes), contention is effectively zero.

### Verification Procedure

```typescript
async function verifyAuditHashChain(options?: { limit?: number }): Promise<{
  valid: boolean;
  totalRecords: number;
  verified: number;
  firstTampered?: { id: string; createdAt: Date };
}> {
  const records = await db
    .select()
    .from(auditLogs)
    .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id));

  let previousHash = GENESIS_HASH;
  const limit = options?.limit ?? records.length;

  for (let i = 0; i < Math.min(records.length, limit); i++) {
    const r = records[i];
    const expected = computeAuditHash(
      r.id, r.action, r.actorId, r.createdAt, r.details, previousHash,
    );
    if (r.hash !== expected) {
      return {
        valid: false,
        totalRecords: records.length,
        verified: i,
        firstTampered: { id: r.id, createdAt: r.createdAt },
      };
    }
    previousHash = r.hash;
  }

  return { valid: true, totalRecords: records.length, verified: Math.min(records.length, limit) };
}
```

**Verification modes:**
- **Full chain:** Walk all records from genesis. O(n) time. For periodic compliance audits.
- **Spot check (last N):** Verify last 100 records. For daily health checks.
- **Background job:** For chains >10,000 records, run as async BullMQ job.

### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| First record (genesis) | `previousHash = null`, hash computed with `GENESIS_HASH` as input |
| Concurrent inserts | `SELECT ... FOR UPDATE` serialization on last row |
| Partition boundaries | When partitioning is added: each partition maintains independent chain; cross-partition verification walks partitions in order |
| System actions (no actor) | `actorId = null` → hashed as `"SYSTEM"` |
| Empty details | `details = null` → `JSON.stringify({})` = `"{}"` |

---

## 5. Partitioning Strategy (AC3)

### Current Recommendation: Defer Implementation

At projected volume (~200 records/day at full scale), the 1M record threshold is reached in ~13.7 years. Even at 500 records/day, it's ~5.5 years. **Document the design now, implement when approaching 500K records.**

### Design: Monthly RANGE Partitioning on `created_at`

```sql
-- Parent table (when partitioning is activated)
CREATE TABLE audit_logs (
  id UUID NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL,
  target_resource TEXT,
  target_id UUID,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  hash TEXT NOT NULL,
  previous_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Partition key must be in PK for partitioned tables
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Monthly child partitions
CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- ... create 3 months ahead
```

### Why Monthly (Not Quarterly)

| Factor | Monthly | Quarterly |
|--------|---------|-----------|
| Partition count at 7 years | 84 | 28 |
| Per-partition size (200 recs/day) | ~6,000 rows | ~18,000 rows |
| Query precision | Better pruning for month-specific queries | Coarser pruning |
| Archive granularity | Finer (archive one month at a time) | Coarser |
| Management | More partitions to create/maintain | Fewer |

**Monthly wins** because audit queries typically filter by month, and finer archive granularity aligns with NDPA retention windows.

### Partition Creation Strategy

**Option A: pg_partman (preferred for production)**

```sql
CREATE EXTENSION pg_partman;

SELECT partman.create_parent(
  p_parent_table := 'public.audit_logs',
  p_control := 'created_at',
  p_type := 'range',
  p_interval := '1 month',
  p_premake := 3  -- Create 3 months ahead
);

-- Background worker or cron calls:
SELECT partman.run_maintenance();
```

Requires: `apt install postgresql-16-partman` on the VPS.

**Option B: BullMQ cron job (no extension)**

A monthly scheduled job creates the next partition using raw SQL. Simpler, no extension dependency, aligns with OSLRS's existing BullMQ infrastructure.

### Query Impact: Partition Pruning

PostgreSQL automatically prunes irrelevant partitions when `WHERE` includes `created_at`:

```sql
-- Only scans February 2026 partition
SELECT * FROM audit_logs
WHERE created_at >= '2026-02-01' AND created_at < '2026-03-01';
```

**Pruning does NOT work if:**
- Column is cast: `WHERE created_at::date = '2026-02-15'`
- Function applied: `WHERE date_trunc('month', created_at) = '2026-02-01'`

**Best practice:** Always include direct `created_at` range comparisons in audit queries. Default to "last 30 days" in the admin UI.

### Archive Procedure

```sql
-- 1. Detach partition (concurrent, non-blocking in PG 14+)
ALTER TABLE audit_logs DETACH PARTITION audit_logs_2026_01 CONCURRENTLY;

-- 2. Verify hash chain for the partition before archiving
SELECT verify_partition_hash_chain('audit_logs_2026_01');

-- 3. Export compressed backup
-- pg_dump -t audit_logs_2026_01 | gzip > /backups/audit_2026_01.sql.gz

-- 4. Upload to S3 (per Story 6-3 backup infrastructure)

-- 5. After confirming off-site backup, optionally drop from local DB
DROP TABLE audit_logs_2026_01;
```

### Partition Size Estimates

| Scenario | Daily Volume | Monthly Partition | Annual Total | 7-Year Total |
|----------|-------------|-------------------|--------------|--------------|
| Current (PII only) | ~15 records | ~450 rows (~0.5MB) | ~5,475 rows (~5MB) | ~38K rows (~35MB) |
| Full scale (all endpoints) | ~200 records | ~6,000 rows (~6MB) | ~73K rows (~70MB) | ~511K rows (~500MB) |
| Aggressive growth (2x) | ~400 records | ~12,000 rows (~12MB) | ~146K rows (~140MB) | ~1M rows (~1GB) |

### Drizzle ORM Compatibility

**Critical gotcha:** Drizzle has no first-class partition support (as of Feb 2026).

**What works:**
- Queries against parent table route transparently to correct partitions
- Inserts via parent table route to correct partition based on `created_at`
- Drizzle schema introspection treats partitioned tables as ordinary tables

**What does NOT work:**
- `PARTITION BY RANGE` cannot be defined in Drizzle schema
- `db:push` may try to drop/recreate partitioned table (data loss risk)

**Recommended approach:**
1. Keep Drizzle schema definition as-is (non-partitioned)
2. Create partitions via separate SQL migration script (`apps/api/src/db/migrations/partition-audit-logs.sql`)
3. When partitioning is activated, switch from `db:push` to `drizzle-kit generate` + manual migration files for the audit table
4. Add `created_at` to PK (required for partitioned tables): `PRIMARY KEY (id, created_at)`

---

## 6. 7-Year NDPA Retention Policy (AC4)

### Legal Basis

The **Nigeria Data Protection Act 2023 (NDPA)** establishes purpose-limitation for retention. Sector-specific laws set concrete minimums:

| Law | Retention Period | Applies To |
|-----|-----------------|------------|
| Companies Income Tax Act (CITA) §63 | 6 years | Tax-related financial records |
| CAMA 2020 | 6 years | Corporate records, financial statements |
| FIRS regulations | 6 years (unlimited for fraud) | Tax records, audit files |
| Cybercrimes Act 2015 | 2 years | Telecommunications traffic data |

**The 7-year requirement** = CITA 6-year minimum + 1-year buffer. This is a conservative, industry-standard interpretation for Nigerian government systems. The fraud exception (CITA §66, FIRSEA §55) has no time limit, making the buffer prudent.

### Retention Tiers

| Tier | Window | Storage | Access Pattern |
|------|--------|---------|---------------|
| **Hot** | 0–12 months | Active PostgreSQL partitions, full indexing | Day-to-day admin UI, real-time queries |
| **Warm** | 13–36 months | PostgreSQL (same DB, could be slower tablespace) | Occasional investigations, compliance queries |
| **Cold** | 37–84 months | Detached partitions, compressed pg_dump on S3 | Rare compliance audits; can re-attach when needed |

**Reality check:** At OSLRS scale (~500MB for 7 years), **all data can stay in the primary PostgreSQL database** with zero performance impact. Tiered storage is documented for completeness but may never be operationally necessary.

### Active Data Window

- **Default UI view:** Last 30 days
- **Available filters:** Last 7 days, last 30 days, last 90 days, custom date range
- **Hot tier (0–12 months):** Fully indexed, sub-100ms query response
- **Full archive access:** Available via date range filter (may be slower for old partitions)

### Purge Procedure (After 84 Months)

```
Step 1: Verify hash chain integrity on the partition
Step 2: Export to compressed archive (compliance evidence)
Step 3: Upload archive to S3 off-site backup
Step 4: Record the purge action in CURRENT audit log:
        action = "system.audit_purge"
        details = { partition, recordCount, retentionYears: 7, hashChainValid: true }
Step 5: Confirm S3 backup exists and is accessible
Step 6: DROP TABLE audit_logs_YYYY_MM;
```

**Safeguards:**
- Never purge if the partition relates to a pending audit, investigation, or legal dispute
- Log the purge itself as an audit event (meta-audit)
- Retain compressed archive for 1 additional year beyond the 7-year mark (8 years total) as buffer
- Run hash chain verification before purge to certify data integrity during retention

### Compliance Verification

To prove 7-year retention during an audit:

1. **Partition inventory:**
   ```sql
   SELECT tablename, pg_size_pretty(pg_total_relation_size('public.' || tablename))
   FROM pg_tables WHERE tablename LIKE 'audit_logs_%' ORDER BY tablename;
   ```
2. **Hash chain verification per partition** — proves data integrity
3. **S3 backup manifest** — secondary proof of off-site retention (Story 6-3)
4. **Purge log** — audit records showing when old partitions were purged with counts and hash verification

---

## 7. Scale Projections (AC6)

### Current Volume

- **9 audit points** across 3 controllers
- **~15 records/day** (estimated from current usage patterns)
- **~5,475 records/year**
- Current table size: negligible (< 1MB)

### Projected Full-Scale Volume (All Endpoints Audited)

When Story 6-1 expands audit coverage to all data modifications and system events:

| Category | Estimated Daily Volume | Example Actions |
|----------|----------------------|-----------------|
| PII access (existing) | ~15/day | view_record, view_list, export_csv/pdf, search |
| Data modifications (new) | ~80/day | create_user, update_profile, change_role, deactivate |
| Auth events (new) | ~60/day | login, logout, login_failed, password_change |
| System events (new) | ~20/day | backup_started, config_change, seed_executed |
| Admin actions (new) | ~25/day | bulk_import, form_publish, threshold_update |
| **Total projected** | **~200/day** | |

### Scale Thresholds

| Milestone | Records | Time to Reach (at 200/day) | Action Required |
|-----------|---------|---------------------------|-----------------|
| 100K | 100,000 | ~1.4 years | None — standard indexes sufficient |
| 250K | 250,000 | ~3.4 years | Monitor query performance, plan partitioning |
| 500K | 500,000 | ~6.8 years | Consider implementing partitioning |
| **1M** | **1,000,000** | **~13.7 years** | **Partitioning critical** (architecture.md threshold) |

**Conclusion:** Partitioning can be safely deferred. The 1M threshold is 13+ years away at projected volume. Even with 2x growth, it's ~7 years.

---

## 8. Schema Migration Plan (AC7)

### New Columns

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `hash` | TEXT | NOT NULL | SHA-256 hash of current record + previous hash |
| `previousHash` | TEXT | nullable (genesis record only) | Hash of the preceding record |

> **Note:** A separate `partitionKey DATE` column was considered for forward compatibility but is **not needed** — Section 5's partitioning strategy uses the existing `created_at` (TIMESTAMPTZ) column directly via `PARTITION BY RANGE (created_at)`. Adding a redundant DATE column would waste storage and risk drift.

### Migration SQL

```sql
-- Step 1: Add new columns (non-breaking, nullable initially)
ALTER TABLE audit_logs ADD COLUMN hash TEXT;
ALTER TABLE audit_logs ADD COLUMN previous_hash TEXT;

-- Step 2: Backfill existing records with hashes (one-time migration script)
-- Run as a Node.js script to use the same computeAuditHash function
-- Process in order of created_at, computing chain from genesis

-- Step 3: Make hash NOT NULL after backfill
ALTER TABLE audit_logs ALTER COLUMN hash SET NOT NULL;

-- Step 4: Add immutability triggers
CREATE OR REPLACE FUNCTION audit_logs_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'audit_logs table is append-only: % operations are forbidden (row id=%)',
    TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

CREATE TRIGGER trg_audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
```

### Index Strategy

```sql
-- Existing indexes (keep):
-- PK on id (already exists)

-- New indexes:
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);
CREATE INDEX idx_audit_logs_actor_id ON audit_logs (actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);
CREATE INDEX idx_audit_logs_target ON audit_logs (target_resource, target_id);

-- For hash chain verification (ordered walk):
CREATE INDEX idx_audit_logs_chain_order ON audit_logs (created_at ASC, id ASC);
```

### Drizzle Schema Changes

```typescript
// apps/api/src/db/schema/audit.ts — Updated schema
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  actorId: uuid('actor_id').references(() => users.id),
  action: text('action').notNull(),
  targetResource: text('target_resource'),
  targetId: uuid('target_id'),
  details: jsonb('details'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  hash: text('hash').notNull(),              // NEW
  previousHash: text('previous_hash'),        // NEW (null for genesis)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### Migration Safety

> **⚠ CRITICAL:** The migration creates a window where audit_logs has no immutability protection (Steps 1-3 add columns and backfill, Step 4 creates triggers). During this window, UPDATE/DELETE operations would succeed silently.
>
> **Recommended approach for OSLRS:** Take the API offline during migration (PM2 stop). The backfill for ~38K records completes in seconds. This is the simplest option for a single-VPS deployment.
>
> **Alternative (zero-downtime):** Create triggers FIRST, then run backfill as superuser with `SET session_replication_role = 'replica';` (disables triggers for that session only). Re-enable after backfill.

### Migration Path

1. **Phase 1 (Story 6-1):** Take API offline → Add columns → Backfill hashes → Add triggers → Make hash NOT NULL → Restart API. No partitioning yet.
2. **Phase 2 (future, ~500K records):** Convert to partitioned table. Requires `created_at` in PK. Switch from `db:push` to migration files for this table.

---

## 9. Integration Roadmap — AuditService Upgrade (AC5)

### Current API → Upgraded API

| Current Method | Upgraded Method | Changes |
|---------------|----------------|---------|
| `logPiiAccess(req, action, ...)` | `logAction(req, action, ...)` | Renamed; accepts any action type (not just PII); adds hash chaining internally |
| `logPiiAccessTx(tx, actorId, ...)` | `logActionTx(tx, actorId, ...)` | Renamed; accepts any action type; hash chaining in transaction |
| `PII_ACTIONS` | `AUDIT_ACTIONS` | Expanded to include all action categories |

### Expanded Action Types

```typescript
export const AUDIT_ACTIONS = {
  // PII access (existing — backward compatible)
  PII_VIEW_RECORD: 'pii.view_record',
  PII_VIEW_LIST: 'pii.view_list',
  PII_EXPORT_CSV: 'pii.export_csv',
  PII_EXPORT_PDF: 'pii.export_pdf',
  PII_SEARCH: 'pii.search',
  PII_VIEW_PRODUCTIVITY: 'pii.view_productivity',
  PII_EXPORT_PRODUCTIVITY: 'pii.export_productivity',

  // Data modifications (new)
  DATA_CREATE_USER: 'data.create_user',
  DATA_UPDATE_PROFILE: 'data.update_profile',
  DATA_CHANGE_ROLE: 'data.change_role',
  DATA_DEACTIVATE_USER: 'data.deactivate_user',
  DATA_REACTIVATE_USER: 'data.reactivate_user',
  DATA_BULK_IMPORT: 'data.bulk_import',
  DATA_FORM_PUBLISH: 'data.form_publish',
  DATA_FORM_ARCHIVE: 'data.form_archive',
  DATA_SUBMISSION_CREATE: 'data.submission_create',
  DATA_SUBMISSION_VERIFY: 'data.submission_verify',
  DATA_SUBMISSION_FLAG: 'data.submission_flag',
  DATA_THRESHOLD_UPDATE: 'data.threshold_update',

  // Authentication events (new)
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  AUTH_PASSWORD_CHANGE: 'auth.password_change',
  AUTH_TOKEN_REFRESH: 'auth.token_refresh',
  AUTH_OAUTH_LINK: 'auth.oauth_link',

  // System events (new)
  SYSTEM_BACKUP_START: 'system.backup_start',
  SYSTEM_BACKUP_COMPLETE: 'system.backup_complete',
  SYSTEM_CONFIG_CHANGE: 'system.config_change',
  SYSTEM_SEED_EXECUTED: 'system.seed_executed',
  SYSTEM_AUDIT_PURGE: 'system.audit_purge',
  SYSTEM_AUDIT_VERIFY: 'system.audit_verify',

  // Admin actions (new)
  ADMIN_VIEW_AS_START: 'admin.view_as_start',
  ADMIN_VIEW_AS_END: 'admin.view_as_end',
  ADMIN_INVITATION_SEND: 'admin.invitation_send',
} as const;
```

### Backward Compatibility Plan

The 3 current consumers use `PII_ACTIONS` and call `AuditService.logPiiAccess()` / `logPiiAccessTx()`. Minimal-disruption upgrade:

**Strategy: Re-export aliases + deprecation**

```typescript
// Backward compatibility — re-export PII_ACTIONS from AUDIT_ACTIONS
export const PII_ACTIONS = {
  VIEW_RECORD: AUDIT_ACTIONS.PII_VIEW_RECORD,
  VIEW_LIST: AUDIT_ACTIONS.PII_VIEW_LIST,
  EXPORT_CSV: AUDIT_ACTIONS.PII_EXPORT_CSV,
  EXPORT_PDF: AUDIT_ACTIONS.PII_EXPORT_PDF,
  SEARCH_PII: AUDIT_ACTIONS.PII_SEARCH,
  VIEW_PRODUCTIVITY: AUDIT_ACTIONS.PII_VIEW_PRODUCTIVITY,
  EXPORT_PRODUCTIVITY: AUDIT_ACTIONS.PII_EXPORT_PRODUCTIVITY,
} as const;

// Backward-compatible method aliases
static logPiiAccess = AuditService.logAction;  // Deprecated alias
static logPiiAccessTx = AuditService.logActionTx;  // Deprecated alias
```

**Migration plan for consumers:**
1. Story 6-1: Add new methods + aliases. Existing 9 audit points continue working unchanged.
2. Story 6-1: Add new audit points for data modifications, auth events, system events.
3. Optional future cleanup: Migrate existing consumers from `PII_ACTIONS` → `AUDIT_ACTIONS` and remove aliases.

### Middleware Pattern for Automatic Audit Logging

For new action types (auth, data modifications), use Express middleware instead of manual calls:

```typescript
// Concept: audit middleware factory
function auditMiddleware(action: AuditAction, resourceFn: (req) => { resource: string; id?: string }) {
  return (req, res, next) => {
    // After response is sent, log the audit event
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const { resource, id } = resourceFn(req);
        AuditService.logAction(req, action, resource, id);
      }
    });
    next();
  };
}

// Usage in routes:
router.post('/users/:id/deactivate',
  requireAuth, requireRole('super_admin'),
  auditMiddleware(AUDIT_ACTIONS.DATA_DEACTIVATE_USER, (req) => ({
    resource: 'users', id: req.params.id
  })),
  staffController.deactivateUser,
);
```

This pattern avoids modifying each controller and provides consistent audit coverage.

---

## 10. PoC SQL Snippets

### Complete Write-Once Enforcement

```sql
-- ============================================================
-- PoC: Immutable Audit Log with Hash Chaining
-- Target: PostgreSQL 16 on DigitalOcean VPS
-- ============================================================

-- 1. Trigger: Block UPDATE/DELETE
CREATE OR REPLACE FUNCTION audit_logs_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'audit_logs table is append-only: % operations are forbidden (row id=%)',
    TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

CREATE TRIGGER trg_audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

-- 1b. Trigger: Block TRUNCATE (statement-level, separate function — no OLD/NEW)
CREATE OR REPLACE FUNCTION audit_logs_no_truncate()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs table is append-only: TRUNCATE is forbidden';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_no_truncate();

-- 2. Test: Verify immutability
-- This should raise an exception:
-- UPDATE audit_logs SET action = 'tampered' WHERE id = (SELECT id FROM audit_logs LIMIT 1);
-- Expected: ERROR: audit_logs table is append-only: UPDATE operations are forbidden

-- DELETE FROM audit_logs WHERE id = (SELECT id FROM audit_logs LIMIT 1);
-- Expected: ERROR: audit_logs table is append-only: DELETE operations are forbidden

-- 3. Test: INSERT should still work:
-- INSERT INTO audit_logs (id, action, created_at) VALUES (gen_random_uuid(), 'test.insert', NOW());
-- Expected: success
```

### Hash Chain Backfill Script (Node.js)

```typescript
// One-time migration to backfill hashes on existing records
import { db } from '../db/index.js';
import { auditLogs } from '../db/schema/audit.js';
import { asc, sql } from 'drizzle-orm';
import { computeAuditHash, GENESIS_HASH } from '../services/audit.service.js';

async function backfillHashes() {
  const records = await db.select().from(auditLogs).orderBy(asc(auditLogs.createdAt));
  console.log(`Backfilling hashes for ${records.length} existing audit records...`);

  let previousHash = GENESIS_HASH;
  for (const record of records) {
    const hash = computeAuditHash(
      record.id, record.action, record.actorId,
      record.createdAt, record.details, previousHash,
    );

    // Temporarily disable trigger for backfill (superuser only)
    await db.execute(sql`
      UPDATE audit_logs SET hash = ${hash}, previous_hash = ${previousHash}
      WHERE id = ${record.id}
    `);

    previousHash = hash;
  }
  console.log(`Backfill complete. ${records.length} records hashed.`);
}
```

**Note:** The backfill requires temporarily disabling the immutability trigger. Execute the trigger creation AFTER the backfill.

---

## 11. Story 6-1 Implementation Checklist

Based on this spike, Story 6-1 implementation should follow this sequence:

### Phase 1: Schema & Triggers (Tasks 1-3)
- [ ] Add `hash`, `previousHash`, `partitionKey` columns to `audit_logs` schema
- [ ] Run `db:push:force` to apply column changes
- [ ] Create and run hash backfill script for existing records
- [ ] Create immutability trigger function (`audit_logs_immutable`)
- [ ] Create `BEFORE UPDATE` and `BEFORE DELETE` triggers
- [ ] Write integration tests: verify UPDATE/DELETE are blocked, INSERT succeeds

### Phase 2: Hash Chaining (Tasks 4-5)
- [ ] Implement `computeAuditHash()` with `canonicalJson()` for deterministic JSONB serialization
- [ ] Update `AuditService.logAction()` to compute and store hash chain
- [ ] Implement `pg_advisory_xact_lock` serialization for concurrent safety
- [ ] Write unit tests for hash computation (deterministic, edge cases)
- [ ] Write integration test for hash chain integrity

### Phase 3: Expanded Actions (Tasks 6-7)
- [ ] Define `AUDIT_ACTIONS` constant with all action categories
- [ ] Add backward-compatible `PII_ACTIONS` re-exports
- [ ] Rename methods: `logAction` / `logActionTx` with aliases for old names
- [ ] Add `auditMiddleware` factory for route-level automatic logging
- [ ] Wire new audit points to auth routes, staff management, form operations

### Phase 4: Verification Endpoint (Tasks 8-9)
- [ ] Implement `verifyAuditHashChain()` service method
- [ ] Create `GET /api/v1/admin/audit/verify` endpoint (super_admin only)
- [ ] Return verification result: valid/invalid, total records, first tampered record
- [ ] Write tests for verification (valid chain, tampered chain detection)

### Phase 5: Testing & Validation (Task 10)
- [ ] All 9 existing audit points still work (backward compatibility)
- [ ] New action types logged correctly
- [ ] Hash chain remains valid after concurrent inserts
- [ ] Immutability triggers block UPDATE/DELETE
- [ ] Full regression suite passes

---

## Appendix: References

- [apps/api/src/services/audit.service.ts] — Current AuditService implementation
- [apps/api/src/db/schema/audit.ts] — Current audit_logs schema
- [apps/api/src/services/__tests__/audit.service.test.ts] — 13 existing tests
- [architecture.md#NFR8.3] — Immutable audit log requirement
- [architecture.md#ADR-006] — Defense-in-depth security layers (Layer 4: Audit)
- [architecture.md#Line-4320] — Partitioning at 1M records
- [architecture.md#Line-4087] — NDPA 7-year retention
- [epics.md#Story-6.1] — Story 6-1 acceptance criteria
- [PostgreSQL 16 Documentation] — Declarative partitioning, triggers, RLS
- [Node.js crypto] — SHA-256 hash computation
- [Drizzle ORM GitHub #2093, #2854] — Partition support status
- [Nigeria Data Protection Act 2023] — Purpose-limitation principle
- [CITA Section 63] — 6-year retention for tax records
- [CAMA 2020] — 6-year retention for corporate records
