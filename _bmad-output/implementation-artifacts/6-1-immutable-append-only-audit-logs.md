# Story 6.1: Immutable Append-Only Audit Logs

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the System,
I want to record every user action in a tamper-proof log,
so that the state has an absolute forensic trail of system activity.

## Context

### Business Value
The Nigeria Data Protection Act (NDPA) mandates 7-year retention of all audit data. A compromised admin account currently has the ability to DELETE or UPDATE audit records, destroying forensic evidence. This story hardens the existing `audit_logs` table to be truly immutable and tamper-detectable.

### Current State
The lightweight `AuditService` (created in prep-epic-5/prep-2) provides:
- **Two modes**: Fire-and-forget (`logPiiAccess`) + transactional (`logPiiAccessTx`)
- **7 PII action types**: `pii.view_record`, `pii.view_list`, `pii.export_csv`, `pii.export_pdf`, `pii.search`, `pii.view_productivity`, `pii.export_productivity`
- **Used by 3 controllers**: ExportController (1 call), RespondentController (2 calls), ProductivityController (6 calls) — 9 total audit points
- **13 unit tests** covering both modes, all passing
- **Schema**: `audit_logs` table with UUID (v7), actorId, action, targetResource, targetId, details (JSONB), ipAddress, userAgent, createdAt

### Architecture Decisions (Already Made)
- **NFR8.3**: Append-only via DB permissions or triggers
- **ADR-006**: Defense-in-Depth — Layer 4 is immutable audit logging
- **Prep-4 spike**: Architecture research completed with comparison tables and recommendations (see Dev Notes)

### Dependency
- **prep-4-immutable-audit-log-spike** (ready-for-dev) — Contains detailed architecture research. If the spike has been executed and produced a summary document, use those findings. Otherwise, the spike story file itself contains sufficient architectural guidance in its Dev Notes section.

## Acceptance Criteria

**AC1**: Given any API request that modifies data or accesses PII, when the action is performed, then the system inserts a record into the `audit_logs` table AND the table is configured as append-only via database triggers to prevent any UPDATE or DELETE.

**AC2**: Given the append-only enforcement, when any attempt is made to UPDATE or DELETE a record in `audit_logs` (via direct SQL, Drizzle ORM, or any other mechanism), then the database raises an exception and the operation is rejected.

**AC3**: Given a new audit log record is inserted, when the insertion completes, then the record includes a SHA-256 hash computed from `(id + action + actorId + createdAt + JSON(details) + previous_hash)` — forming a tamper-detectable hash chain.

**AC4**: Given the hash chain, when a verification procedure is run, then it walks the chain from genesis hash, recomputes each record's hash, compares against stored hashes, and reports any tamper-detected gaps.

**AC5**: Given the schema migration, when applied to the existing `audit_logs` table, then new columns `hash` (TEXT NOT NULL) and `previous_hash` (TEXT) are added, with existing records receiving a backfill hash and the genesis record receiving `previous_hash = SHA256("OSLRS-AUDIT-GENESIS-2026")`.

**AC6**: Given the existing 9 audit call sites across 3 controllers, when the upgrade is applied, then all existing consumers continue to work without code changes (backward compatibility preserved).

**AC7**: Given the expanded action types, when new audit actions are logged (beyond PII), then the `AUDIT_ACTIONS` constant includes categories for: `data_modify`, `auth`, `system`, and `admin` actions.

**AC8**: Given the existing 13 audit service tests, when the full test suite runs, then all existing tests pass with zero regressions AND new tests cover: append-only enforcement, hash computation, hash chain verification, and backward compatibility.

## Tasks / Subtasks

- [ ] Task 1: Add append-only enforcement via database trigger (AC: #1, #2)
  - [ ] 1.1 Create a new Drizzle migration that adds a PostgreSQL trigger:
    ```sql
    CREATE OR REPLACE FUNCTION audit_logs_immutable()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'audit_logs table is append-only: % operations are not permitted', TG_OP;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
    ```
  - [ ] 1.2 Test trigger: attempt UPDATE on audit_logs → verify exception raised
  - [ ] 1.3 Test trigger: attempt DELETE on audit_logs → verify exception raised
  - [ ] 1.4 Test trigger: INSERT still works normally (not blocked)
  - [ ] 1.5 Document in code comments: superuser CAN bypass triggers — this is acceptable for emergency DB maintenance, and such access is itself logged by PostgreSQL's own audit mechanisms
- [ ] Task 2: Add hash and previous_hash columns to schema (AC: #5)
  - [ ] 2.1 Update `apps/api/src/db/schema/audit.ts`: add `hash: text('hash').notNull()` and `previousHash: text('previous_hash')` columns
  - [ ] 2.2 Create Drizzle migration for the new columns
  - [ ] 2.3 Handle existing records: temporarily allow NULL for `hash` during migration, then backfill all existing records with computed hashes (walk records by createdAt order, compute chain), then set NOT NULL constraint
  - [ ] 2.4 Define genesis hash constant: `SHA256("OSLRS-AUDIT-GENESIS-2026")` — store in AuditService as `GENESIS_HASH`
  - [ ] 2.5 Add index on `createdAt` for efficient hash chain verification queries (ORDER BY createdAt ASC)
- [ ] Task 3: Implement hash computation in AuditService (AC: #3)
  - [ ] 3.1 Add `computeHash(record, previousHash)` static method to AuditService:
    ```typescript
    import { createHash } from 'node:crypto';
    static computeHash(id: string, action: string, actorId: string | null, createdAt: Date, details: unknown, previousHash: string): string {
      const payload = `${id}|${action}|${actorId ?? 'SYSTEM'}|${createdAt.toISOString()}|${JSON.stringify(details ?? {})}|${previousHash}`;
      return createHash('sha256').update(payload).digest('hex');
    }
    ```
  - [ ] 3.2 Update `logPiiAccess()`: after inserting the record, compute and update hash (fire-and-forget mode — hash computed in-app, stored with record)
  - [ ] 3.3 Update `logPiiAccessTx()`: compute hash within the same transaction
  - [ ] 3.4 Handle concurrent inserts: use `SELECT previous_hash FROM audit_logs ORDER BY created_at DESC LIMIT 1 FOR UPDATE` within transaction to serialize hash chain
  - [ ] 3.5 Handle genesis case: if no previous record exists, use `GENESIS_HASH`
- [ ] Task 4: Implement hash chain verification endpoint (AC: #4)
  - [ ] 4.1 Add `verifyHashChain()` static method to AuditService:
    - Walk all records ordered by createdAt ASC
    - Recompute each hash from record fields + previous record's hash
    - Compare computed vs stored hash
    - Return: `{ valid: boolean, totalRecords: number, verified: number, firstTampered?: { id, createdAt } }`
  - [ ] 4.2 Add `GET /api/v1/audit-logs/verify-chain` route (Super Admin only)
  - [ ] 4.3 Add spot-check mode: verify last N records only (for quick health checks, default N=100)
  - [ ] 4.4 Add performance guard: for full chain verification, run as background job if records > 10,000
- [ ] Task 5: Expand audit action types (AC: #7)
  - [ ] 5.1 Extend `PII_ACTIONS` to comprehensive `AUDIT_ACTIONS` constant:
    ```typescript
    export const AUDIT_ACTIONS = {
      // PII Access (existing — backward compatible aliases)
      PII_VIEW_RECORD: 'pii.view_record',
      PII_VIEW_LIST: 'pii.view_list',
      PII_EXPORT_CSV: 'pii.export_csv',
      PII_EXPORT_PDF: 'pii.export_pdf',
      PII_SEARCH: 'pii.search',
      PII_VIEW_PRODUCTIVITY: 'pii.view_productivity',
      PII_EXPORT_PRODUCTIVITY: 'pii.export_productivity',
      // Data Modification
      DATA_CREATE: 'data.create',
      DATA_UPDATE: 'data.update',
      DATA_DELETE: 'data.delete',
      // Authentication
      AUTH_LOGIN: 'auth.login',
      AUTH_LOGOUT: 'auth.logout',
      AUTH_PASSWORD_CHANGE: 'auth.password_change',
      AUTH_TOKEN_REFRESH: 'auth.token_refresh',
      // Admin Actions
      ADMIN_USER_DEACTIVATE: 'admin.user_deactivate',
      ADMIN_USER_REACTIVATE: 'admin.user_reactivate',
      ADMIN_ROLE_CHANGE: 'admin.role_change',
      ADMIN_CONFIG_UPDATE: 'admin.config_update',
      // System Events
      SYSTEM_BACKUP: 'system.backup',
      SYSTEM_RESTORE: 'system.restore',
      SYSTEM_MIGRATION: 'system.migration',
    } as const;
    ```
  - [ ] 5.2 Keep `PII_ACTIONS` as a re-export alias for backward compatibility:
    ```typescript
    export const PII_ACTIONS = {
      VIEW_RECORD: AUDIT_ACTIONS.PII_VIEW_RECORD,
      VIEW_LIST: AUDIT_ACTIONS.PII_VIEW_LIST,
      // ... all 7 existing
    } as const;
    ```
  - [ ] 5.3 Do NOT modify the 9 existing consumer call sites — they continue using `PII_ACTIONS` unchanged
- [ ] Task 6: Ensure backward compatibility (AC: #6)
  - [ ] 6.1 Verify `logPiiAccess()` signature is unchanged — callers pass same arguments
  - [ ] 6.2 Verify `logPiiAccessTx()` signature is unchanged — callers pass same arguments
  - [ ] 6.3 Hash computation must be transparent to callers — handled internally by AuditService
  - [ ] 6.4 Run all 3 consumer controller test suites to verify no regressions:
    - `pnpm vitest run apps/api/src/controllers/__tests__/export.controller.test.ts`
    - `pnpm vitest run apps/api/src/controllers/__tests__/respondent.controller.test.ts`
    - `pnpm vitest run apps/api/src/controllers/__tests__/productivity.controller.test.ts`
- [ ] Task 7: Add comprehensive tests (AC: #8)
  - [ ] 7.1 Test: INSERT into audit_logs succeeds (trigger allows)
  - [ ] 7.2 Test: UPDATE on audit_logs throws exception (trigger blocks)
  - [ ] 7.3 Test: DELETE on audit_logs throws exception (trigger blocks)
  - [ ] 7.4 Test: `computeHash()` returns consistent SHA-256 for same inputs
  - [ ] 7.5 Test: `computeHash()` returns different hash for different inputs
  - [ ] 7.6 Test: hash chain verification succeeds on valid chain
  - [ ] 7.7 Test: hash chain verification detects tampered record
  - [ ] 7.8 Test: genesis hash is correctly computed from constant
  - [ ] 7.9 Test: concurrent inserts produce valid chain (serialization via FOR UPDATE)
  - [ ] 7.10 Test: `PII_ACTIONS` remains unchanged (backward compatibility)
  - [ ] 7.11 Test: `AUDIT_ACTIONS` contains all expected categories
  - [ ] 7.12 Verify all 13 existing audit service tests still pass
- [ ] Task 8: Run full test suites (AC: #8)
  - [ ] 8.1 Run API tests: `pnpm vitest run apps/api/src/`
  - [ ] 8.2 Run web tests: `cd apps/web && pnpm vitest run`
- [ ] Task 9: Update story status and dev agent record

## Dev Notes

### Write-Once Enforcement Strategy

**Recommended approach: Trigger-based** (from prep-4 spike comparison):

| Strategy | Mechanism | Pros | Cons |
|----------|-----------|------|------|
| **Trigger-based** ✅ | `BEFORE UPDATE/DELETE → RAISE EXCEPTION` | Simple, in-schema, works with any DB role, no Drizzle config changes | Superuser can bypass (acceptable — documented) |
| PostgreSQL RLS | `CREATE POLICY ... FOR DELETE USING (false)` | Native, no trigger overhead | Requires separate DB role, complex setup with Drizzle |
| Role separation | INSERT-only grants, no UPDATE/DELETE | Strongest guarantee | Requires Drizzle to connect as restricted role — breaking change |
| Application-only | No DB enforcement, trust the app | Easiest | Zero protection against direct DB access |

**Why trigger-based**: Simplest to implement with Drizzle, works with the existing single-role DB connection, and provides defense-in-depth against accidental/malicious modifications via any application or tool that connects to PostgreSQL.

### Hash Chaining Design

**Algorithm**: SHA-256 (Node.js built-in `crypto.createHash('sha256')`)

**Chain formula**:
```
hash_n = SHA256(id_n | action_n | actorId_n | createdAt_n | JSON(details_n) | hash_{n-1})
```

**Separator**: Pipe `|` character (clear field boundaries, unlikely to appear in data)

**Genesis hash**: `SHA256("OSLRS-AUDIT-GENESIS-2026")` — stored as constant in AuditService

**Concurrent insert handling**: Use `SELECT ... ORDER BY created_at DESC LIMIT 1 FOR UPDATE` in a transaction to serialize chain computation. This adds minimal latency (~1ms) since audit log inserts are already low-frequency (~15/day currently).

**Performance impact**: SHA-256 computation is <0.1ms per record — negligible.

### Schema Migration Plan

**New columns to add to `audit_logs`:**

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `hash` | TEXT | NOT NULL | — | SHA-256 hex string (64 chars) |
| `previous_hash` | TEXT | nullable | — | NULL for genesis record |

**Migration steps:**
1. Add columns as nullable (ALTER TABLE ADD COLUMN)
2. Backfill existing records with computed hashes (walk by createdAt ASC)
3. Set `hash` to NOT NULL (ALTER TABLE ALTER COLUMN SET NOT NULL)
4. Add trigger AFTER columns are populated

**Index strategy:**
- Keep existing PK on `id`
- Add index on `createdAt` for hash chain verification ORDER BY queries
- No index needed on `hash` or `previous_hash` (rarely queried directly)

### Existing Consumer Call Sites (9 total — DO NOT MODIFY)

| Controller | Method | Action | Fire-and-Forget |
|-----------|---------|--------|-----------------|
| ExportController | exportRespondents | `EXPORT_CSV` / `EXPORT_PDF` | Yes |
| RespondentController | listRespondents | `VIEW_LIST` | Yes |
| RespondentController | getRespondentDetail | `VIEW_RECORD` | Yes |
| ProductivityController | getTeamProductivity | `VIEW_PRODUCTIVITY` | Yes |
| ProductivityController | exportTeamProductivity | `EXPORT_PRODUCTIVITY` | Yes |
| ProductivityController | getAllStaffProductivity | `VIEW_PRODUCTIVITY` | Yes |
| ProductivityController | getLgaComparison | `VIEW_PRODUCTIVITY` | Yes |
| ProductivityController | getLgaSummary | `VIEW_PRODUCTIVITY` | Yes |
| ProductivityController | exportCrossLgaData | `EXPORT_PRODUCTIVITY` | Yes |

**All 9 use the fire-and-forget `logPiiAccess()` method.** None use `logPiiAccessTx()` currently (transactional mode was designed for future use in critical operations).

### Current AuditService API (Must Preserve)

```typescript
// Fire-and-forget — signature MUST NOT change
static logPiiAccess(
  req: AuthenticatedRequest,
  action: PiiAction,
  targetResource: string,
  targetId: string | null,
  details?: Record<string, unknown>,
): void

// Transactional — signature MUST NOT change
static async logPiiAccessTx(
  tx: DbTransaction,
  actorId: string,
  action: PiiAction,
  targetResource: string,
  targetId: string | null,
  details?: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string,
  actorRole?: string,
): Promise<void>
```

### Drizzle Migration Pattern

From existing migrations in `apps/api/drizzle/`:
- Migrations are SQL files auto-generated by `drizzle-kit generate`
- Applied via `pnpm --filter @oslsr/api db:push` (or `db:push:force` in CI)
- 7 existing migration files (0000 through 0006)

**For trigger creation**: Drizzle-kit doesn't generate trigger SQL — add a custom SQL migration file manually:
```
apps/api/drizzle/0007_audit_logs_immutable.sql
```

Or use `db:push` for schema column changes and execute trigger SQL separately via a seed/migration script.

### Partitioning (DEFERRED)

Per architecture.md: "Table partitioning only needed after 1M+ records." At current rate (~15 records/day), 1M records would take ~183 years. Even at full-scale (~200 records/day with all endpoints audited), it would take ~13 years. **Partitioning is explicitly out of scope for this story.** Revisit when monitoring (Story 6-2) shows audit_logs approaching 1M records.

### 7-Year Retention (DEFERRED)

Retention policy requires partitioning infrastructure to be efficient. Since partitioning is deferred, retention is also deferred. The hash chain and append-only enforcement prepare the table for future retention management. **Retention is out of scope for this story.**

### File Change Scope

**Modified files:**
- `apps/api/src/db/schema/audit.ts` — Add `hash` and `previousHash` columns
- `apps/api/src/services/audit.service.ts` — Add `computeHash()`, `verifyHashChain()`, update insert logic, expand action types
- `apps/api/src/services/__tests__/audit.service.test.ts` — Add 10+ new tests for immutability, hash chain, verification

**New files:**
- `apps/api/drizzle/0007_audit_logs_immutable.sql` (or next sequence number) — Migration: new columns + trigger
- `apps/api/src/routes/audit.routes.ts` — New route file for `GET /audit-logs/verify-chain`
- `apps/api/src/controllers/audit.controller.ts` — New controller for verification endpoint

**No frontend changes. No consumer controller changes.**

### Project Structure Notes

- Audit schema: `apps/api/src/db/schema/audit.ts`
- Audit service: `apps/api/src/services/audit.service.ts`
- Audit tests: `apps/api/src/services/__tests__/audit.service.test.ts`
- New routes: `apps/api/src/routes/audit.routes.ts`
- New controller: `apps/api/src/controllers/audit.controller.ts`
- Migration: `apps/api/drizzle/` (next sequence number)
- Schema exports: `apps/api/src/db/schema/index.ts` (already exports auditLogs)

### Testing Standards

- Use `vi.hoisted()` + `vi.mock()` pattern for unit tests
- Integration tests (trigger testing) must use `beforeAll`/`afterAll` with real DB
- Must verify 13 existing tests still pass (no regressions)
- Test trigger enforcement with raw SQL queries (not just Drizzle ORM)
- Run web tests: `cd apps/web && pnpm vitest run`
- Run API tests: `pnpm vitest run apps/api/src/`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#L1824-1835] — Story 6-1 acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md#NFR8.3] — Immutable audit log requirement
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-006] — Defense-in-depth security layers
- [Source: _bmad-output/planning-artifacts/architecture.md#L405] — Partitioning deferred until 1M records
- [Source: _bmad-output/planning-artifacts/prd.md#NFR4.2] — NDPA 7-year retention
- [Source: _bmad-output/implementation-artifacts/prep-4-immutable-audit-log-spike.md] — Architecture spike (full research)
- [Source: apps/api/src/services/audit.service.ts] — Current AuditService (99 lines, 2 modes)
- [Source: apps/api/src/db/schema/audit.ts] — Current audit_logs schema (9 columns)
- [Source: apps/api/src/services/__tests__/audit.service.test.ts] — 13 existing tests
- [Source: apps/api/src/controllers/export.controller.ts#L86-94] — ExportController audit call
- [Source: apps/api/src/controllers/respondent.controller.ts#L74-81,L107-114] — RespondentController audit calls (2)
- [Source: apps/api/src/controllers/productivity.controller.ts#L184-190,L276-282,L369-375,L415-421,L454-460,L525-531] — ProductivityController audit calls (6)
- [Source: apps/api/drizzle/0000_solid_odin.sql#L62-72] — Original audit_logs CREATE TABLE
- [Source: apps/api/src/db/index.ts] — Database connection (Pool + Drizzle)
- [Source: apps/api/drizzle.config.ts] — Drizzle migration configuration
- [Source: _bmad-output/implementation-artifacts/prep-2-lightweight-audit-logging-pii-access.md] — Original AuditService story

### Previous Story Intelligence

**From prep-4-immutable-audit-log-spike (direct feeder):**
- Research spike with 7 acceptance criteria covering write-once enforcement, hash chaining, partitioning, retention, integration, scale projections, schema migration
- Comparison tables for 4 enforcement strategies — trigger-based recommended
- Hash chain formula and genesis hash defined
- Scale projections: ~15 records/day current, 1M threshold for partitioning
- Integration plan: preserve existing API, expand action types

**From prep-epic-5/prep-2 (Lightweight Audit Logging):**
- Created AuditService with fire-and-forget + transactional modes
- 7 findings in code review (2H, 3M, 2L), all fixed
- 13 tests pass — established test patterns for audit service
- Key learning: fire-and-forget with `.catch()` warning pattern prevents audit failures from breaking user operations

**From Story 5-6b (Super Admin Cross-LGA Analytics):**
- Added 2 more audit call sites in ProductivityController
- Confirmed AuditService scales reliably across multiple consumers

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
