# Prep 4: Immutable Audit Log Spike

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the development team,
I want a thoroughly researched architecture design for immutable, append-only audit logging with tamper detection, partitioning, and retention policies,
so that Story 6-1 implementation has a proven, decision-complete blueprint that prevents rework.

## Context

**This is a RESEARCH SPIKE, not an implementation story.** The deliverable is a spike document (`_bmad-output/implementation-artifacts/prep-4-immutable-audit-log-spike-summary.md`) containing architecture decisions, comparison tables, and recommendations. No production code changes.

### Current State
The lightweight `AuditService` (created in prep-epic-5/prep-2) provides:
- **Two modes**: Fire-and-forget (`logPiiAccess`) + transactional (`logPiiAccessTx`)
- **7 PII action types**: `pii.view_record`, `pii.view_list`, `pii.export_csv`, `pii.export_pdf`, `pii.search`, `pii.view_productivity`, `pii.export_productivity`
- **Used by 3 controllers**: ExportController, RespondentController, ProductivityController (across 5 Epic 5 stories)
- **13 unit tests** covering both modes
- **Schema**: `audit_logs` table with UUID (v7), actorId (FK users), action, targetResource, targetId, details (JSONB), ipAddress, userAgent, createdAt

### What's Missing (NFR8.3 / Story 6-1)
- No immutability guarantees (table allows UPDATE/DELETE)
- No hash chaining (cannot detect tampering)
- No partitioning (will degrade at 1M+ records)
- No retention policy (7-year NDPA requirement unaddressed)
- No append-only enforcement (no DB-level constraints)
- Limited action coverage (only PII access, not all data modifications)

## Acceptance Criteria

**AC1**: Given the spike is complete, when reviewed, then it contains a comparison of at least 3 write-once enforcement strategies (PostgreSQL RLS, trigger-based, application-level) with pros/cons/recommendation.

**AC2**: Given the spike document, when reviewed, then it contains a hash chaining design with: algorithm selection, chain formula, verification procedure, and performance impact estimate.

**AC3**: Given the spike document, when reviewed, then it contains a partitioning strategy with: partition scheme (time vs ID), partition granularity (monthly/quarterly), query impact analysis, and archive procedure.

**AC4**: Given the spike document, when reviewed, then it contains a 7-year NDPA retention policy with: active data window, archive strategy, purge procedure, and compliance verification.

**AC5**: Given the spike document, when reviewed, then it contains an integration plan showing how to upgrade the existing `AuditService` with minimal breaking changes to the 3 current consumers.

**AC6**: Given the spike document, when reviewed, then it contains scale projections: current volume (~15 records/day), projected full-scale volume (all endpoints audited), and the record count at which partitioning becomes critical.

**AC7**: Given the spike document, when reviewed, then it contains a schema migration plan: new columns needed (hash, previous_hash, partition_key), index strategy, and migration path from current table.

## Tasks / Subtasks

- [x] Task 1: Research write-once enforcement strategies (AC: #1)
  - [x] 1.1 Research PostgreSQL Row-Level Security (RLS) for append-only enforcement
  - [x] 1.2 Research trigger-based approach (BEFORE UPDATE/DELETE → RAISE EXCEPTION)
  - [x] 1.3 Research database role separation (audit writer role with INSERT only, no UPDATE/DELETE grants)
  - [x] 1.4 Document pros/cons comparison table and recommend approach
  - [x] 1.5 Write a proof-of-concept SQL snippet for the recommended approach
- [x] Task 2: Design hash chaining for tamper detection (AC: #2)
  - [x] 2.1 Select hash algorithm (SHA-256 standard, evaluate performance)
  - [x] 2.2 Define chain formula: `hash = SHA256(id || action || actorId || createdAt || details || previous_hash)`
  - [x] 2.3 Design verification procedure (full chain validation, spot checks, gap detection)
  - [x] 2.4 Estimate performance impact of hash computation per INSERT
  - [x] 2.5 Document edge cases: first record (genesis hash), concurrent inserts, partition boundaries
- [x] Task 3: Design partitioning strategy (AC: #3)
  - [x] 3.1 Evaluate time-based partitioning (by month) vs range-based (by ID)
  - [x] 3.2 Define partition creation strategy (auto-create vs manual)
  - [x] 3.3 Analyze query patterns for partition pruning effectiveness
  - [x] 3.4 Design archive procedure for old partitions (detach → read-only tablespace)
  - [x] 3.5 Estimate partition sizes at projected volume
- [x] Task 4: Design 7-year NDPA retention policy (AC: #4)
  - [x] 4.1 Define active data window (e.g., last 12 months in hot partitions)
  - [x] 4.2 Define archive tier (13-84 months in cold storage/detached partitions)
  - [x] 4.3 Define purge procedure (after 84 months, with final hash chain verification)
  - [x] 4.4 Document compliance verification method (how to prove 7 years retained)
- [x] Task 5: Design integration plan with current AuditService (AC: #5)
  - [x] 5.1 Map current AuditService API to upgraded version
  - [x] 5.2 Define new action types beyond PII (data_modify, auth, system, admin)
  - [x] 5.3 Plan backward compatibility for 3 current consumers (ExportController, RespondentController, ProductivityController)
  - [x] 5.4 Design the expanded middleware/decorator pattern for automatic audit logging
- [x] Task 6: Scale projections and schema migration (AC: #6, #7)
  - [x] 6.1 Calculate current volume (~15 records/day from 9 audit points)
  - [x] 6.2 Project full-scale volume (all API endpoints audited, ~200 staff users)
  - [x] 6.3 Identify record count threshold for mandatory partitioning
  - [x] 6.4 Define new schema columns: `hash TEXT NOT NULL`, `previousHash TEXT` (partitionKey removed — redundant with created_at per review)
  - [x] 6.5 Design index strategy for new columns (5 indexes; partitionKey index removed per review)
  - [x] 6.6 Write migration plan from current `audit_logs` table to new structure
- [x] Task 7: Write spike summary document (all ACs)
  - [x] 7.1 Compile all research into `_bmad-output/implementation-artifacts/prep-4-immutable-audit-log-spike-summary.md`
  - [x] 7.2 Include comparison tables, decision rationale, and implementation roadmap
  - [x] 7.3 Include PoC SQL for write-once enforcement and hash chaining
- [x] Task 8: Update story status and dev agent record

### Review Follow-ups (AI) — Code Review 2026-02-25
- [x] [AI-Review][HIGH] H1: JSON.stringify non-determinism breaks hash verification — PostgreSQL JSONB normalizes key order but V8 preserves insertion order. Added `canonicalJson()` with sorted-key serialization to spike Section 4 formula + TypeScript impl + verification.
- [x] [AI-Review][MEDIUM] M1: `SELECT ... FOR UPDATE` doesn't prevent hash chain forks — row-level locks don't block new inserts. Replaced with `pg_advisory_xact_lock(hashtext('audit_logs_chain'))` in spike Section 4.
- [x] [AI-Review][MEDIUM] M2: TRUNCATE trigger PoC SQL buggy — `OLD.id` fails at statement level. Added separate `audit_logs_no_truncate()` function with `FOR EACH STATEMENT` in Sections 3 and 10.
- [x] [AI-Review][MEDIUM] M3: `partitionKey DATE` column redundant — Section 5 partitions on `created_at`. Removed from Section 8 migration SQL, Drizzle schema, and index strategy. Task 6.4/6.5 notes updated.
- [x] [AI-Review][MEDIUM] M4: Migration window lacks immutability — no triggers during backfill. Added Migration Safety section to Section 8: recommend API-offline for OSLRS VPS, document zero-downtime alternative.
- [x] [AI-Review][LOW] L1: Verified 9 audit call sites via grep — ExportController:1 (line 88), RespondentController:2 (lines 75, 108), ProductivityController:6 (lines 184, 276, 369, 415, 454, 525). Updated spike Section 2 with file:line references.

## Dev Notes

### Current AuditService Architecture

**File:** `apps/api/src/services/audit.service.ts` (99 lines)

```typescript
// Fire-and-forget mode — non-blocking, logs warnings on failure
logPiiAccess(req, action, targetResource, targetId, details?): void

// Transactional mode — awaited, for critical operations within DB transactions
logPiiAccessTx(tx, actorId, action, targetResource, targetId, details?, ipAddress?, userAgent?, actorRole?): Promise<void>
```

**Current Schema:** `apps/api/src/db/schema/audit.ts`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (v7) | PK |
| actorId | UUID | FK → users.id, nullable |
| action | TEXT | NOT NULL |
| targetResource | TEXT | optional |
| targetId | UUID | optional |
| details | JSONB | optional metadata |
| ipAddress | TEXT | optional |
| userAgent | TEXT | optional |
| createdAt | TIMESTAMP WITH TZ | NOT NULL, DEFAULT NOW() |

**Current Consumers (9 audit points across 3 controllers):**
- `ExportController` — logs CSV/PDF exports
- `RespondentController` — logs individual record + list view access
- `ProductivityController` — logs all productivity data access (6 calls)

### Architecture Requirements

**NFR8.3** (architecture.md): "Append-only audit logs with DB permissions/triggers"

**ADR-006** (Defense-in-Depth): Layer 4 — Audit: Comprehensive logging (immutable append-only)

**NDPA Compliance**: 7-year retention minimum for all audit data

**Scale Target**: 1M records threshold for partitioning (architecture.md line 4320)

### Key Research Areas

**Write-Once Enforcement Options:**

| Strategy | Mechanism | Pros | Cons |
|----------|-----------|------|------|
| PostgreSQL RLS | `CREATE POLICY ... FOR DELETE USING (false)` | Native, no trigger overhead | Requires separate DB role, complex setup |
| Trigger-based | `BEFORE UPDATE/DELETE → RAISE EXCEPTION` | Simple, in-schema, works with any role | Superuser can bypass |
| Role separation | INSERT-only grants, no UPDATE/DELETE | Strongest guarantee | Requires Drizzle to connect as restricted role |
| Application-only | No DB enforcement, trust the app | Easiest | Zero protection against direct DB access |

**Hash Chaining:**
- Algorithm: SHA-256 (standard, Node.js `crypto` built-in)
- Chain: `hash_n = SHA256(id_n + action_n + actorId_n + createdAt_n + JSON(details_n) + hash_{n-1})`
- Genesis: `hash_0 = SHA256("OSLRS-AUDIT-GENESIS-2026")`
- Verification: Walk chain from genesis, recompute each hash, compare

**Partitioning:**
- PostgreSQL 12+ native RANGE partitioning on `createdAt`
- Monthly partitions for active data
- Quarterly archives after 12 months
- Detach + compress for cold storage

### Spike Document Template

The output document should follow this structure:
1. Executive Summary
2. Current State Analysis
3. Write-Once Enforcement (comparison + recommendation)
4. Hash Chaining Design
5. Partitioning Strategy
6. Retention Policy (NDPA 7-year)
7. Scale Projections
8. Schema Migration Plan
9. Integration Roadmap (AuditService upgrade)
10. PoC SQL Snippets
11. Story 6-1 Implementation Checklist

### Project Structure Notes

- Audit schema: `apps/api/src/db/schema/audit.ts`
- Audit service: `apps/api/src/services/audit.service.ts`
- Audit tests: `apps/api/src/services/__tests__/audit.service.test.ts`
- Spike output: `_bmad-output/implementation-artifacts/prep-4-immutable-audit-log-spike-summary.md`
- No frontend changes needed for this spike
- No production code changes — research only

### Testing Standards

- This is a research spike — no production code tests needed
- PoC SQL snippets should be tested manually against local PostgreSQL
- Spike document should include testable assertions for Story 6-1 implementation
- Run existing audit tests to confirm current baseline: `pnpm vitest run apps/api/src/services/__tests__/audit.service.test.ts`

### References

- [Source: apps/api/src/services/audit.service.ts] — Current AuditService implementation
- [Source: apps/api/src/db/schema/audit.ts] — Current audit_logs schema
- [Source: apps/api/src/services/__tests__/audit.service.test.ts] — 13 existing tests
- [Source: apps/api/src/controllers/export.controller.ts] — ExportController audit usage
- [Source: apps/api/src/controllers/respondent.controller.ts] — RespondentController audit usage
- [Source: apps/api/src/controllers/productivity.controller.ts] — ProductivityController audit usage
- [Source: _bmad-output/planning-artifacts/architecture.md#NFR8.3] — Immutable audit log requirement
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-006] — Defense-in-depth security layers
- [Source: _bmad-output/planning-artifacts/architecture.md#Line-4320] — Partitioning at 1M records
- [Source: _bmad-output/planning-artifacts/architecture.md#Line-4087] — NDPA 7-year retention
- [Source: _bmad-output/planning-artifacts/epics.md#Story-6.1] — Story 6-1 acceptance criteria
- [Source: _bmad-output/implementation-artifacts/epic-5-retro-2026-02-24.md#Line-185] — AuditService needs durability upgrade
- [Source: _bmad-output/implementation-artifacts/prep-2-lightweight-audit-logging-pii-access.md] — Original AuditService story (prep-epic-5/prep-2)

### Previous Story Intelligence

**From prep-3-fix-fraud-thresholds-sidebar-data (previous prep task):**
- Bug fix (sidebar + seed data), no overlap with audit log design
- Confirms seed data patterns in `apps/api/src/db/seeds/index.ts` — relevant if audit log seeds are needed

**From prep-epic-5/prep-2 (Lightweight Audit Logging):**
- AuditService created with intentional "lightweight" scope — PII access logging only
- Two-mode design (fire-and-forget + transactional) proved reliable across 5 stories
- Code review: 7 findings (2H, 3M, 2L), all fixed. 13 tests pass.
- Key learning: fire-and-forget with `.catch()` warning pattern prevents audit failures from breaking user operations

**From Story 6-1 specification (epics.md):**
- Requires append-only via database permissions
- Must cover "every user action that modifies data or accesses PII"
- Scope expansion from current PII-only to ALL data modifications

### Git Intelligence

Recent commits are Epic 5 completions and prep-1 fix:
- `328ad63 fix(web): fix ExportPage LGA race condition + code review fixes (prep-1)` — latest, bug fix
- `bd5a443 docs: complete Epic 5 retrospective and define Epic 6 prep phase` — retro defining this spike
- `92f8a2b fix(api,web): use dynamic productivity targets across all dashboards` — shows ProductivityController pattern (one of the 3 audit consumers)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Verified existing audit service tests pass (13/13) as baseline before research

### Completion Notes List

- **Task 1 (Write-Once Enforcement):** Researched 4 strategies — RLS, trigger-based, role separation, application-only. Recommended trigger-based (`BEFORE UPDATE/DELETE → RAISE EXCEPTION`) for simplicity and compatibility with Drizzle single-role setup. PoC SQL included in spike doc Section 10.
- **Task 2 (Hash Chaining):** Selected SHA-256 via Node.js `crypto` (~0.01ms/hash). Defined chain formula with pipe-separated fields, `GENESIS_HASH = SHA256("OSLRS-AUDIT-GENESIS-2026")`. Designed `SELECT ... FOR UPDATE` serialization for concurrent inserts. Documented verification procedure (full chain walk, spot checks).
- **Task 3 (Partitioning):** Recommended monthly RANGE partitioning on `created_at`. Deferred implementation — 1M threshold is ~13.7 years away at 200 records/day. Documented pg_partman vs manual cron, Drizzle ORM gotchas (no first-class partition support, `db:push` data loss risk), and PK change requirement (`id + created_at`).
- **Task 4 (NDPA Retention):** 7-year retention validated against CITA §63 (6-year) + 1-year buffer. Designed 3-tier storage (hot/warm/cold) — but noted all 7 years fit in ~500MB, single tier likely sufficient. Purge procedure with hash chain verification, meta-audit logging, and fraud-exception safeguard.
- **Task 5 (Integration Plan):** Mapped `logPiiAccess` → `logAction` rename with backward-compatible aliases. Expanded from 7 PII actions to ~30 across 4 categories (pii, data, auth, system/admin). Designed `auditMiddleware` factory for route-level automatic logging. 3 current consumers (ExportController, RespondentController, ProductivityController) unchanged.
- **Task 6 (Scale Projections):** Current ~15 records/day → projected ~200/day at full scale. 1M records at ~13.7 years. New columns: `hash TEXT NOT NULL`, `previousHash TEXT`, `partitionKey DATE NOT NULL DEFAULT CURRENT_DATE`. 6 indexes designed. Migration plan: add columns → backfill hashes → add triggers → make hash NOT NULL.
- **Task 7 (Spike Document):** Compiled 11-section document at `_bmad-output/implementation-artifacts/prep-4-immutable-audit-log-spike-summary.md`. Includes comparison tables, PoC SQL, TypeScript implementations, Story 6-1 checklist.

### Change Log

- 2026-02-24: Created spike summary document with complete architecture design for immutable audit logging. Research covers write-once enforcement (trigger-based recommendation), SHA-256 hash chaining, monthly RANGE partitioning, 7-year NDPA retention, AuditService upgrade plan, scale projections, and schema migration path.
- 2026-02-25: **Code Review** — 6 findings (1H, 4M, 1L), all fixed in spike doc:
  - H1: Added `canonicalJson()` for deterministic JSONB serialization (prevents hash verification false positives)
  - M1: Replaced `SELECT ... FOR UPDATE` with `pg_advisory_xact_lock` (prevents hash chain forks)
  - M2: Fixed TRUNCATE trigger — separate statement-level function, no `OLD.id` reference
  - M3: Removed redundant `partitionKey DATE` column (Section 5 uses `created_at` directly)
  - M4: Added Migration Safety section — document API-offline during backfill window
  - L1: Verified 9 audit call sites with file:line references

### File List

- `_bmad-output/implementation-artifacts/prep-4-immutable-audit-log-spike-summary.md` (NEW) — Complete spike document, 11 sections
- `_bmad-output/implementation-artifacts/prep-4-immutable-audit-log-spike.md` (MODIFIED) — Story file updated with task completion, dev agent record, status → review
