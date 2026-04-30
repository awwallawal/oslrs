# Story 11.1: Multi-Source Registry Schema Foundation

Status: ready-for-dev

<!--
Foundational migration for Epic 11 (Multi-Source Registry) AND prerequisite for
Story 9-12 (Public Wizard + Pending-NIN UX). Relaxes the NIN hard constraint,
adds provenance + status columns, introduces the import_batches tracking table,
and extends the respondent source enum.

Decisions driving scope:
  • Path A — pending_nin_capture status model adopted over blanket NIN relaxation (Awwal 2026-04-22)
  • B2 — extend respondents table, not a separate external_beneficiaries table (Awwal 2026-04-22)
  • Auto-skip on import email/phone match (Awwal 2026-04-22)

NO business logic or UI work lives in this story. This is schema + enum + type
migration ONLY. Downstream stories (11-2 import service, 11-3 import UI, 11-4
source badges, 9-12 public wizard) consume what this story ships.

Validation pass 2026-04-29 (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`): rebuilt to canonical template structure; all 11 ACs preserved verbatim including the AC#5 import_batches DDL and AC#11 composite-index audit at projected scale (Akintola-risk Move 1); all 10 canonical queries in Query Plan Audit preserved verbatim; codebase claims verified and pinned to exact file:line refs; migration directory ambiguity resolved (apps/api/drizzle/ — apps/api/src/db/migrations/ does not exist); existing partial-unique-index pattern at drizzle/0005_create_team_assignments.sql:21 referenced for clone.
-->

## Story

As the **platform operator**,
I want **the `respondents` table to accept records from multiple sources with nullable NIN, explicit status tracking, and a dedicated `import_batches` table for provenance**,
so that **the system can (a) onboard respondents mid-field without blocking on a forgotten NIN, (b) ingest secondary data (e.g. ITF-SUPA Oyo shortlist) without creating a parallel canonical registry, (c) preserve FR21's dedupe guarantee for records that do carry NIN, and (d) expose a unified registry with per-record source labelling to downstream UI and analytics**.

## Acceptance Criteria

1. **AC#1 — NIN becomes nullable on `respondents`:** The `nin` column on `respondents` is altered from `NOT NULL` to nullable. The pre-existing `UNIQUE` constraint on `nin` is dropped and replaced with a **partial unique index** `respondents_nin_unique_when_present ON respondents (nin) WHERE nin IS NOT NULL`. Rows without NIN do not collide; rows with NIN retain FR21's uniqueness. Verified via migration up/down test and SQL introspection.

2. **AC#2 — `status` column added with enumerated values:** A new `status` column (`TEXT NOT NULL DEFAULT 'active'`) is added to `respondents`. Valid values: `'active'`, `'pending_nin_capture'`, `'nin_unavailable'`, `'imported_unverified'`. Validation enforced at the application layer via Drizzle enum (`respondentStatusTypes`) AND at the database layer via a CHECK constraint. Existing rows back-fill to `'active'` in the migration.

3. **AC#3 — Source enum extended:** `respondentSourceTypes` in `apps/api/src/db/schema/respondents.ts:16` is extended from `['enumerator', 'public', 'clerk']` to `['enumerator', 'public', 'clerk', 'imported_itf_supa', 'imported_other']`. All existing `respondents.source` values are preserved; no data migration needed on existing rows beyond the enum extension itself (Drizzle + Postgres TEXT column with app-side enum, so no DB enum type change is required).

4. **AC#4 — Provenance columns added:** Three new columns on `respondents`:
   - `external_reference_id TEXT` (nullable) — stores the source system's identifier, e.g. SUPA `ADM NO`
   - `import_batch_id UUID` (nullable, FK to `import_batches.id` `ON DELETE SET NULL`) — links imported rows to their ingest batch
   - `imported_at TIMESTAMPTZ` (nullable) — when the row was ingested; NULL for field-surveyed rows
   Indexes: `idx_respondents_status ON respondents(status)`, `idx_respondents_source ON respondents(source)`, `idx_respondents_import_batch ON respondents(import_batch_id) WHERE import_batch_id IS NOT NULL`. All existing indexes preserved (`idx_respondents_lga_id`, `idx_respondents_created_at` at `respondents.ts:43-44`).

5. **AC#5 — `import_batches` table created:** New table with the full column set below. Created via Drizzle schema file `apps/api/src/db/schema/import-batches.ts` (no imports from `@oslsr/types` per the existing Drizzle-kit constraint documented in MEMORY.md):
   ```sql
   CREATE TABLE import_batches (
     id UUID PRIMARY KEY,
     source TEXT NOT NULL,                    -- matches respondents.source enum
     source_description TEXT,
     original_filename TEXT NOT NULL,
     file_hash TEXT NOT NULL UNIQUE,          -- SHA-256 hex, prevents duplicate uploads
     file_size_bytes INTEGER NOT NULL,
     parser_used TEXT NOT NULL,               -- 'pdf_tabular', 'csv', 'xlsx'
     rows_parsed INTEGER NOT NULL DEFAULT 0,
     rows_inserted INTEGER NOT NULL DEFAULT 0,
     rows_matched_existing INTEGER NOT NULL DEFAULT 0,
     rows_skipped INTEGER NOT NULL DEFAULT 0,
     rows_failed INTEGER NOT NULL DEFAULT 0,
     failure_report JSONB,
     lawful_basis TEXT NOT NULL,              -- 'ndpa_6_1_e', 'ndpa_6_1_f', etc.
     lawful_basis_note TEXT,
     uploaded_by UUID NOT NULL REFERENCES users(id),
     uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     status TEXT NOT NULL DEFAULT 'active'    -- 'active', 'rolled_back'
   );
   CREATE INDEX idx_import_batches_source ON import_batches(source);
   CREATE INDEX idx_import_batches_status ON import_batches(status);
   CREATE INDEX idx_import_batches_uploaded_by ON import_batches(uploaded_by);
   ```

6. **AC#6 — Drizzle types regenerated and exported:** `Respondent`, `NewRespondent`, `ImportBatch`, `NewImportBatch` types exported from `apps/api/src/db/schema/index.ts`. `respondentSourceTypes`, `respondentStatusTypes`, `RespondentSource`, `RespondentStatus` exported from respondents schema. Type surface verified by successful `pnpm --filter @oslsr/api tsc --noEmit`.

7. **AC#7 — Service layer NIN-dedupe logic updated but FR21-preserving:** `SubmissionProcessingService.findOrCreateRespondent` in `apps/api/src/services/submission-processing.service.ts` (method starts at line 310; NIN duplicate check at line 317; users cross-check at line 328) is modified so that the `respondents.nin` NIN-duplicate check applies **only when the incoming submission has a non-empty NIN**. Submissions without NIN are allowed to create a `respondent` row with `status='pending_nin_capture'` and `nin=NULL`. The NIN-against-users cross-check is likewise conditional on NIN presence. **No other behaviour changes** in the service — fraud queueing, marketplace extraction, enumerator linking all remain identical. FR21 is still enforced for all NIN-carrying submissions.

8. **AC#8 — Existing tests all pass unchanged:** Full test suite (`pnpm test`) passes. Baseline: 4,191 tests (1,814 API + 2,377 web). No regressions. Pre-existing tests for `SubmissionProcessingService.findOrCreateRespondent` (in `apps/api/src/services/__tests__/submission-processing.service.test.ts`) continue to pass; any NIN-required assertions are updated to scope their expectation to the NIN-present branch.

9. **AC#9 — New tests for the pending-NIN branch:** Minimum 4 new tests added to `submission-processing.service.test.ts`:
   - Creates a `pending_nin_capture` respondent when submission has no NIN
   - Does NOT invoke FR21 reject path when NIN is absent
   - Does NOT invoke staff NIN cross-check when NIN is absent
   - Populates `submissions.respondentId` correctly for pending-NIN submission
   Plus minimum 3 new DB-constraint tests covering: partial unique index allows multiple NIN-null rows; partial unique index rejects duplicate NIN-present rows; status CHECK constraint rejects invalid values.

10. **AC#10 — Sprint status updated:** `_bmad-output/implementation-artifacts/sprint-status.yaml` gains an `epic-11` entry AND an `11-1-multi-source-registry-schema-foundation` entry. Epic 11 is created at this line. Sprint-status comment block at file top gets an `updated: 2026-04-22 - Epic 11 added: Multi-Source Registry` entry. (Verify current sprint-status comment-block format at impl time — format may have evolved since 2026-04-22.)

11. **AC#11 — Composite index audit at projected-scale (Akintola-risk mitigation):** Before merge, seed a scratch Postgres DB with **500,000 respondents**, **1,000,000 submissions**, **100,000 audit_logs**, **100,000 marketplace_profiles** (use the scripts added in this story — see Task 2.5). Run `EXPLAIN (ANALYZE, BUFFERS)` on each of the 10 queries listed in Dev Notes "Query Plan Audit — the 10 queries". For every query:
    - Plan MUST NOT show `Seq Scan` on any table >100K rows
    - Total cost MUST be below 10,000
    - Execution time MUST be below 500ms at p95
    - If any query fails these thresholds, either (a) add the required composite index in this story's migration, or (b) document the failure explicitly in Dev Notes and flag the affected endpoint for remediation in its owning story (9-11 for audit queries, Epic 8 stories for analytics, etc.).
    Composite indexes added in this story's migration as a result of the audit:
    - `respondents(source, created_at)`
    - `respondents(lga_id, source)`
    - `respondents(status, source)`
    - `respondents(status, created_at)`
    - `import_batches(source, uploaded_at)` (covered in the `import_batches` CREATE above; no extra migration needed)
    Indexes intentionally NOT added in this story (belong downstream):
    - `audit_logs(actor_id, created_at)` — added in Story 9-11 (Admin Audit Log Viewer) which needs it
    - `audit_logs(target_resource, target_id, created_at)` — added in Story 9-11
    - `marketplace_profiles(lga_id, profession)` — re-evaluate in Story 11-4 after source-filter chip query shape is finalised
    `EXPLAIN (ANALYZE, BUFFERS)` output for each of the 10 queries is captured as a new file `apps/api/src/db/explain-reports/11-1-projected-scale.md` and committed with this story. This file is the canonical evidence for Dev Notes AC coverage.

## Tasks / Subtasks

- [ ] **Task 1 — Drizzle schema updates** (AC: #1, #2, #3, #4, #6)
  - [ ] 1.1 Edit `apps/api/src/db/schema/respondents.ts`:
        - Extend `respondentSourceTypes` array (AC#3) — currently at line 16: `['enumerator', 'public', 'clerk']`
        - Add `respondentStatusTypes = ['active', 'pending_nin_capture', 'nin_unavailable', 'imported_unverified'] as const` and export `RespondentStatus`
        - Change `nin: text('nin').unique().notNull()` to `nin: text('nin')` (AC#1 — currently line 23)
        - Add `status`, `externalReferenceId`, `importBatchId`, `importedAt` columns (AC#2, AC#4)
        - Add `idxRespondentsStatus`, `idxRespondentsSource`, `idxRespondentsImportBatch` index declarations (consistent with existing `idx_respondents_X` naming pattern at lines 43-44)
        - Remove the `.unique()` from `nin` — partial unique index is applied via raw SQL in the migration, NOT declared on the Drizzle column
  - [ ] 1.2 Create `apps/api/src/db/schema/import-batches.ts` per AC#5. **MUST NOT import from `@oslsr/types`** (drizzle-kit runs compiled JS; `@oslsr/types` has no `dist/` — see MEMORY.md key pattern).
  - [ ] 1.3 Update `apps/api/src/db/schema/index.ts` (currently 17 table re-exports at lines 1-17) to export the new `import-batches` schema + types.
  - [ ] 1.4 Update `apps/api/src/db/schema/relations.ts` with the `respondents.importBatch → import_batches` relation for ORM joins.
  - [ ] 1.5 Run `pnpm --filter @oslsr/api tsc --noEmit` — must succeed.

- [ ] **Task 2 — Migration authoring** (AC: #1, #2, #4, #5, #11)
  - [ ] 2.1 Generate the Drizzle migration: `pnpm --filter @oslsr/api db:generate` (script at `apps/api/package.json:16`). Migration file lands at `apps/api/drizzle/<NNNN>_<descriptive_name>.sql` — sequential 4-digit prefix; confirm next number at impl time via `ls apps/api/drizzle/` (latest as of 2026-04-29 is `0007_audit_logs_immutable.sql`; this story may be `0008_*` or `0009_*` depending on whether Story 9-13 commits first). **Path `apps/api/src/db/migrations/` does NOT exist** — do not be confused by the historical reference.
  - [ ] 2.2 **Manually inspect the generated migration** — Drizzle's codegen does not always produce the exact SQL we need for the partial unique index dance. Replace auto-generated statements for the NIN constraint with the explicit SQL per Dev Notes "Migration order matters". Reference the existing partial-unique-index pattern at `apps/api/drizzle/0005_create_team_assignments.sql:21` (`CREATE UNIQUE INDEX IF NOT EXISTS "idx_team_assignments_active_enumerator"` with WHERE clause) for the canonical syntax.
  - [ ] 2.3 Add the `CHECK (status IN (...))` constraint to the migration manually if Drizzle does not emit it.
  - [ ] 2.4 Test the migration up-and-down on a scratch Postgres instance (docker-compose DB, NOT production) before merge.
  - [ ] 2.5 **Query plan audit seeding and verification (AC#11 — Akintola-risk mitigation):**
        - Create `apps/api/src/db/seed-projected-scale.ts` — script that populates a scratch Postgres with 500K respondents, 1M submissions, 100K audit_logs, 100K marketplace_profiles using faker + Oyo LGA references. Script idempotent; reports row counts on completion. **Operational note:** scratch DB will need ~4-8GB disk; verify dev box has capacity before running.
        - Create directory `apps/api/src/db/explain-reports/` (does not exist yet) and create file `11-1-projected-scale.md`.
        - Run the 10 queries from Dev Notes "Query Plan Audit — the 10 queries" against the seeded DB post-migration.
        - Capture `EXPLAIN (ANALYZE, BUFFERS)` output for each into `apps/api/src/db/explain-reports/11-1-projected-scale.md`.
        - For each query, verify thresholds per AC#11 (no Seq Scan on >100K tables; cost <10,000; p95 <500ms).
        - For any failing query: either add the required composite index here and re-run, OR document in Dev Notes with explicit hand-off to the owning story.
        - Seed script is DEV-ONLY — add `seed:projected-scale` to `apps/api/package.json` scripts; guard with environment-name check (refuses to run against production `DATABASE_URL`).

- [ ] **Task 3 — Service layer update** (AC: #7)
  - [ ] 3.1 Edit `apps/api/src/services/submission-processing.service.ts`:
        - `findOrCreateRespondent` (line 310): wrap the `respondents.nin` existence check (line 317) in `if (data.nin) { ... }`
        - Wrap the `users.nin` cross-check (line 328) similarly
        - When creating a respondent without NIN, set `status: 'pending_nin_capture'`
        - When creating a respondent with NIN (the normal path), set `status: 'active'` (explicit, not relying on DB default, to document intent)
        - The `extractRespondentData` method (line 256) currently throws `PermanentProcessingError` if NIN is missing (line 283) — this behaviour MUST BE PRESERVED for enumerator/clerk submissions via the form schema validation (AC 3.4.8). The relaxation applies at `findOrCreateRespondent`, NOT at extraction. Story 9-12 will introduce a separate code path for the public wizard that bypasses the extract-time NIN check.
  - [ ] 3.2 The `respondents.source` enum now includes `imported_itf_supa` and `imported_other`. No behaviour change for existing `enumerator`/`public`/`clerk` values — but the `ROLE_TO_SOURCE` map (line 52) stays as-is; new values come only from the import service (Story 11-2), never from submission processing.

- [ ] **Task 4 — Tests** (AC: #8, #9)
  - [ ] 4.1 Update existing tests in `apps/api/src/services/__tests__/submission-processing.service.test.ts` — any test that passes a NIN-less fixture should either (a) still pass unchanged if it was testing extraction-time rejection, or (b) be updated if it was testing findOrCreate-time rejection.
  - [ ] 4.2 Add new tests per AC#9:
        - Pending-NIN respondent creation
        - FR21 NOT invoked without NIN
        - Staff-NIN cross-check NOT invoked without NIN
        - `submissions.respondentId` still linked correctly
        - Partial unique index allows multiple null-NIN rows (DB-level test — create new file `apps/api/src/db/schema/__tests__/respondents.constraints.test.ts`; directory does not exist yet)
        - Partial unique index rejects duplicate NIN (DB-level test, same file)
        - Status CHECK rejects invalid values (DB-level test, same file)
  - [ ] 4.3 Run full suite: `pnpm test`. Baseline 4,191 tests. Expected new count: ~4,198 (AC#9 minimum + any extraction-path tests that split).

- [ ] **Task 5 — Sprint status + memory update** (AC: #10)
  - [ ] 5.1 Edit `_bmad-output/implementation-artifacts/sprint-status.yaml`:
        - Add `# updated: 2026-04-22 - Epic 11 added: Multi-Source Registry. Story 11-1 schema foundation.` comment line (verify current comment-block format at impl time — format may have evolved)
        - Add `epic-11: in-progress` key
        - Add `11-1-multi-source-registry-schema-foundation: in-progress` during work; flip to `review` at PR time, `done` at merge
        - Add `epic-11-retrospective: optional` placeholder
  - [ ] 5.2 Do NOT update MEMORY.md until story is `done` — Memory captures stable state, not in-flight work.

- [ ] **Task 6 — Code review** (cross-cutting AC: all)
  - [ ] 6.1 Run `/bmad:bmm:workflows:code-review` on the uncommitted working tree (per the existing "code review before commit" project pattern in MEMORY.md `feedback_review_before_commit.md`).
  - [ ] 6.2 Auto-fix all High/Medium severity findings. Document Low-severity deferrals in Dev Notes / Review Follow-ups (AI).
  - [ ] 6.3 Only after code review passes, commit and mark status `review`.

## Dev Notes

### Prerequisites

- **Story 9-7** (done) — baseline security posture
- **Story 9-11** (Admin Audit Log Viewer) — NOT a prerequisite for 11-1 itself, but Epic 11 stories 11-2 and 11-3 will rely on 9-11's viewer to inspect `import_batches` activity. 11-1 only ships the *tables*; visibility comes in 9-11.

### Migration order matters

Apply in this order in a single Drizzle migration (or multiple sequential ones if tooling prefers):

1. `CREATE TABLE import_batches (...)` — no dependencies
2. `ALTER TABLE respondents ADD COLUMN status ...` with default `'active'` — backfills all existing rows
3. `ALTER TABLE respondents ADD CONSTRAINT respondents_status_check CHECK (status IN (...))`
4. `ALTER TABLE respondents ADD COLUMN external_reference_id ...`
5. `ALTER TABLE respondents ADD COLUMN import_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL`
6. `ALTER TABLE respondents ADD COLUMN imported_at TIMESTAMPTZ`
7. **Drop then re-create the NIN uniqueness constraint** (the tricky step):
   ```sql
   ALTER TABLE respondents DROP CONSTRAINT respondents_nin_unique;
   ALTER TABLE respondents ALTER COLUMN nin DROP NOT NULL;
   CREATE UNIQUE INDEX respondents_nin_unique_when_present ON respondents(nin) WHERE nin IS NOT NULL;
   ```
   The exact pre-existing constraint name may differ — check with `\d respondents` in psql on a staging copy first. The Drizzle migration should reflect the actual name. Reference clone pattern: `apps/api/drizzle/0005_create_team_assignments.sql:21` already uses `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE` syntax for the team-assignments table.
8. `CREATE INDEX idx_respondents_status ...`
9. `CREATE INDEX idx_respondents_source ...`
10. `CREATE INDEX idx_respondents_import_batch ...`

### Drizzle schema constraints

- `apps/api/src/db/schema/respondents.ts` will gain: `status` column typed via `respondentStatusTypes` array; extended `respondentSourceTypes`; three new nullable columns.
- `apps/api/src/db/schema/import-batches.ts` is a new file. **Must NOT import from `@oslsr/types`** (drizzle-kit compiles JS and `@oslsr/types` has no `dist/`).
- `apps/api/src/db/schema/index.ts` re-exports the new schema and types (currently re-exports 17 tables at lines 1-17).
- `apps/api/src/db/schema/relations.ts` adds: `respondents.importBatch → import_batches` relation for ORM joins.

### Query Plan Audit — the 10 queries (AC#11)

These queries represent the hottest paths that will hit `respondents`, `submissions`, `marketplace_profiles`, `audit_logs`, and `import_batches` at projected post-field-survey scale. Each MUST be captured via `EXPLAIN (ANALYZE, BUFFERS)` in `apps/api/src/db/explain-reports/11-1-projected-scale.md`.

1. **Registry filter by source + time window** (Story 11-4 use case)
   ```sql
   SELECT id, first_name, last_name, nin, lga_id, status, source, created_at
   FROM respondents
   WHERE source = $1 AND created_at >= $2 AND created_at < $3
   ORDER BY created_at DESC LIMIT 50 OFFSET $4;
   ```

2. **Registry filter by LGA scoped by source** (supervisor / assessor use case)
   ```sql
   SELECT id, first_name, last_name, lga_id, status, source
   FROM respondents
   WHERE lga_id = $1 AND source = ANY($2)
   ORDER BY created_at DESC LIMIT 50;
   ```

3. **Pending-NIN respondent list** (Story 9-12 enumerator follow-up use case)
   ```sql
   SELECT id, first_name, last_name, phone_number, lga_id, created_at
   FROM respondents
   WHERE status = 'pending_nin_capture' AND source = 'enumerator'
   ORDER BY created_at ASC LIMIT 100;
   ```

4. **Staff productivity aggregation by enumerator over time** (Epic 5.6a use case)
   ```sql
   SELECT enumerator_id, DATE(submitted_at) as day, COUNT(*) as count
   FROM submissions
   WHERE enumerator_id = $1 AND submitted_at >= $2 AND submitted_at < $3
   GROUP BY enumerator_id, DATE(submitted_at)
   ORDER BY day;
   ```

5. **Respondent submission lineage** (Story 5.3 individual-record view)
   ```sql
   SELECT id, submission_uid, submitted_at, fraud_score, verification_status
   FROM submissions
   WHERE respondent_id = $1
   ORDER BY ingested_at DESC;
   ```

6. **Respondent dedupe check by NIN** (Story 3.7 + 11-1 FR21)
   ```sql
   SELECT id, source, created_at
   FROM respondents
   WHERE nin = $1;
   ```

7. **Marketplace search: profession + LGA** (Epic 7 use case)
   ```sql
   SELECT id, profession, skills, lga_name, experience_level, verified_badge
   FROM marketplace_profiles
   WHERE lga_id = $1 AND profession = $2 AND verified_badge = true
   ORDER BY created_at DESC LIMIT 50;
   ```

8. **Audit log by target resource** (Story 9-11 use case — canonical composite-index test)
   ```sql
   SELECT id, actor_id, action, details, created_at
   FROM audit_logs
   WHERE target_resource = $1 AND target_id = $2
   ORDER BY created_at DESC LIMIT 100;
   ```

9. **Audit log by actor over time window** (Story 9-11 use case)
   ```sql
   SELECT id, action, target_resource, target_id, created_at
   FROM audit_logs
   WHERE actor_id = $1 AND created_at >= $2 AND created_at < $3
   ORDER BY created_at DESC LIMIT 100;
   ```

10. **Import batch history by source** (Story 11-3 admin UI use case)
    ```sql
    SELECT id, original_filename, rows_inserted, rows_failed, uploaded_at, uploaded_by
    FROM import_batches
    WHERE source = $1
    ORDER BY uploaded_at DESC LIMIT 50;
    ```

For each, capture: plan output, execution time, planning time, buffer hits/reads, and confirmation of index usage.

### Why partial unique index instead of `UNIQUE NULLS NOT DISTINCT`

PostgreSQL 15+ supports `UNIQUE NULLS NOT DISTINCT`. We don't use it because:
1. Production Postgres version is not confirmed as 15+ (check before relying)
2. Partial unique index is the more portable, better-supported pattern
3. It's also the more explicit choice — the intent `UNIQUE (nin) WHERE nin IS NOT NULL` is self-documenting

### FR21 is NOT relaxed

Critical: the *policy* 'reject duplicate NIN' (FR21) remains in force. The *scope* shifts from 'every submission must have unique NIN' to 'every submission with NIN must have unique NIN'. Submissions without NIN are in a different class (`pending_nin_capture`) and are not subject to FR21 until a NIN is later attached. When NIN is later attached via Story 9-12's 'Complete Registration' flow, FR21 runs at that moment.

### Rollback

If this migration is ever rolled back:
1. Any rows with `nin = NULL` must first be handled (either deleted, assigned a NIN, or documented) — the reverse migration cannot restore NOT NULL with null values present
2. The partial unique index is dropped and `UNIQUE (nin)` re-added — this will fail if any `NULL` rows remain
3. The new columns and `import_batches` table are dropped
Document these steps in the Drizzle `migrations/down/*.sql` file (if Drizzle ever supports down migrations) or in Dev Notes.

### Performance

- Index on `status` is important: registry UI will filter by status frequently (Story 11-4)
- Index on `source` is important: the same UI will filter by source
- Partial index on `import_batch_id` keeps the index small (most rows won't have a batch ID)
- `import_batches.file_hash` is UNIQUE and indexed via that constraint; lookups for duplicate uploads are O(log n)

### Out of Scope (explicitly)

- Import service / parser / admin UI — Stories 11-2, 11-3
- Source badges and registry filter chips — Story 11-4
- Public wizard + pending-NIN UX — Story 9-12
- Admin audit log viewer — Story 9-11
- API consumer auth + scoping — Story 10-1
- NinHelpHint shared component — Story 9-12
- Magic-link email authentication — Story 9-12
- Input sanitisation normalisation utilities — covered by `prep-input-sanitisation-layer` prep task (Wave 1, separate retrofit)
- Any frontend changes at all — 11-1 is schema + service only

### Risks

1. **Migration on production Postgres blocks writes briefly.** The `ALTER TABLE ... ALTER COLUMN nin DROP NOT NULL` and the `CREATE UNIQUE INDEX` on an existing populated table will hold a lock. Mitigate by scheduling the migration during a low-traffic window. Production DB is small (based on current 2026-04-21 backup table counts: 3 users, 1 respondent, 85 audit logs, 1 submission — MEMORY.md evidence), so the lock window is negligible. This risk balloons at larger scale — revisit before a 10K+ respondent state.

2. **Existing fraud detection or marketplace pipelines may implicitly assume NIN presence.** Audit these before enabling pending-NIN writes in production: `apps/api/src/workers/fraud-detection.worker.ts`, `apps/api/src/workers/marketplace-extraction.worker.ts` (both files verified to exist 2026-04-29). If they dereference `respondent.nin` without null-check, they'll crash on the new pending rows. Story 9-12 will also cover this — for 11-1, confirm that `status='pending_nin_capture'` respondents are NEVER queued for fraud or marketplace extraction (the existing conditions `if (submission.gpsLatitude != null)` and `if (respondentData.consentMarketplace)` should naturally exclude them since pending-NIN submissions go through a separate 9-12 code path, not through the existing `SubmissionProcessingService.processSubmission` — confirm at impl time).

3. **FR21 dilution perception.** Stakeholders may perceive 'NIN nullable' as weakening the registry. Document clearly in Dev Notes (and surface to Iris for D1 DPIA drafting) that FR21 is *scoped*, not *removed*. Same policy, different surface.

4. **Drizzle `db:push` vs `db:generate` semantics on production.** Production deploy currently uses `db:push:force` per MEMORY.md (to avoid the drizzle-kit 0.21 interactive prompt). Partial unique indexes in `push` mode sometimes behave unexpectedly. Use `db:generate` (script at `apps/api/package.json:16`) to produce a migration file, and add the partial unique index as an explicit SQL statement within that migration. CI should run the migration file, not `push`.

5. **The `respondents.nin` NOT NULL back-fill policy was working correctly.** Relaxing it is a deliberate policy change. If a future audit ever questions 'why are some respondents missing NIN?' — the answer chain is: `status` column → `source` column → `import_batches` row → `lawful_basis`. Every pending or imported row is traceable to a documented decision. Ensure the DPIA (D1) explicitly covers this.

### Project Structure Notes

- **API services** at `apps/api/src/services/<name>.service.ts`. The service this story touches is `submission-processing.service.ts`.
- **Drizzle schema files** at `apps/api/src/db/schema/<name>.ts` — one file per table. Schema barrel at `apps/api/src/db/schema/index.ts:1-17` re-exports all 17 tables; this story appends `user-backup-codes`-style export for the new `import-batches` (canonical pattern: `export * from './import-batches.js';`).
- **Drizzle constraint**: schema files MUST NOT import from `@oslsr/types`. drizzle-kit runs compiled JS and `@oslsr/types` exports `src/index.ts` directly with no `dist/` build. Inline any enum constants locally with a comment noting the canonical source. (Per MEMORY.md key pattern.)
- **Drizzle migrations** at `apps/api/drizzle/<NNNN>_<name>.sql` with sequential 4-digit prefix. Latest as of 2026-04-29 is `0007_audit_logs_immutable.sql`. This story may claim `0008_*` or `0009_*` depending on Story 9-13 commit ordering; confirm at impl time via `ls apps/api/drizzle/`. **Path `apps/api/src/db/migrations/` does NOT exist.**
- **Existing partial-unique-index pattern** for cloning: `apps/api/drizzle/0005_create_team_assignments.sql:21` — `CREATE UNIQUE INDEX IF NOT EXISTS "idx_team_assignments_active_enumerator" ... WHERE` syntax.
- **Index naming convention** on respondents table: `idx_respondents_<column>` (existing: `idx_respondents_lga_id`, `idx_respondents_created_at` at `respondents.ts:43-44`). New indexes (`idx_respondents_status`, `idx_respondents_source`, `idx_respondents_import_batch`) follow the same pattern.
- **CI db-push**: project uses `pnpm --filter @oslsr/api db:push:force` (not `db:push`) to avoid drizzle-kit 0.21.x interactive prompt hangs. For this story, use `db:generate` (script at `apps/api/package.json:16`) to produce a migration file; CI runs the file via `db:push:force` semantics.
- **Workers directory** at `apps/api/src/workers/<name>.worker.ts` — 9 worker files exist as of 2026-04-29 (`fraud-detection.worker.ts`, `marketplace-extraction.worker.ts`, `import.worker.ts`, etc.). The `import.worker.ts` file already exists as a stub; Story 11-2 will populate it. Story 11-1 does NOT touch any worker.
- **Test directories**:
  - Service tests: `apps/api/src/services/__tests__/<service>.test.ts` — existing `submission-processing.service.test.ts` to extend
  - **NEW** DB-constraint tests: `apps/api/src/db/schema/__tests__/respondents.constraints.test.ts` — directory `apps/api/src/db/schema/__tests__/` does NOT exist yet; create alongside the test file
- **NEW directories created by this story**:
  - `apps/api/src/db/explain-reports/` (for AC#11 evidence)
  - `apps/api/src/db/schema/__tests__/` (for AC#9 DB-constraint tests)
- **Seed-script DEV-only guard** is a new pattern (no existing precedent in the codebase). Recommend `if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('prod')) { throw new Error('seed:projected-scale refuses to run against production'); }` at top of `seed-projected-scale.ts`.
- **AC#11 scratch DB scale**: 500K + 1M + 100K + 100K rows → ~4-8GB disk on scratch Postgres. Verify dev box capacity before running.

### References

- Architecture Decision 1.5 (multi-source registry schema spec — nullable `nin` + partial UNIQUE + status CHECK + extended `source` enum + provenance + composite indexes): [Source: _bmad-output/planning-artifacts/architecture.md Decision 1.5]
- ADR-018 (multi-source registry / pending-NIN status model): [Source: _bmad-output/planning-artifacts/architecture.md:3137]
- Epics — Epic 11 entry: [Source: _bmad-output/planning-artifacts/epics.md:2696]
- Respondents schema current state (`respondentSourceTypes` definition + nin NOT NULL UNIQUE + existing indexes): [Source: apps/api/src/db/schema/respondents.ts:16-17,23,43-44]
- Schema barrel (append `import-batches` export): [Source: apps/api/src/db/schema/index.ts:1-17]
- Drizzle migration directory + naming + 4-digit prefix: [Source: apps/api/drizzle/0007_audit_logs_immutable.sql]
- Partial unique index canonical pattern (clone for AC#1 NIN constraint dance): [Source: apps/api/drizzle/0005_create_team_assignments.sql:21]
- API package db-generate script: [Source: apps/api/package.json:16]
- Submission processing service — `findOrCreateRespondent` (modify per AC#7): [Source: apps/api/src/services/submission-processing.service.ts:310]
- Submission processing service — NIN duplicate check (wrap in `if (data.nin)`): [Source: apps/api/src/services/submission-processing.service.ts:317]
- Submission processing service — `users.nin` cross-check (wrap similarly): [Source: apps/api/src/services/submission-processing.service.ts:328]
- Submission processing service — `extractRespondentData` (preserves NIN-required throw at line 283 — DO NOT touch): [Source: apps/api/src/services/submission-processing.service.ts:256,283]
- Submission processing service — `ROLE_TO_SOURCE` map (no behaviour change): [Source: apps/api/src/services/submission-processing.service.ts:52]
- Service test file (extend per AC#9): [Source: apps/api/src/services/__tests__/submission-processing.service.test.ts]
- Workers directory — fraud detection (audit per Risk #2): [Source: apps/api/src/workers/fraud-detection.worker.ts]
- Workers directory — marketplace extraction (audit per Risk #2): [Source: apps/api/src/workers/marketplace-extraction.worker.ts]
- MEMORY.md key pattern: drizzle schema files cannot import from `@oslsr/types`: [Source: MEMORY.md "Key Patterns"]
- MEMORY.md key pattern: integration tests use `beforeAll`/`afterAll`: [Source: MEMORY.md "Key Patterns"]
- MEMORY.md key pattern: `db:push:force` data-loss risk: [Source: MEMORY.md "Key Patterns" + `feedback_db_push_force.md`]
- MEMORY.md key pattern: code review before commit: [Source: MEMORY.md "Process Patterns" + `feedback_review_before_commit.md`]

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation. Implementer must include:)_

- Confirmation of production Postgres major version
- Actual name of the pre-existing NIN unique constraint (from `\d respondents`)
- Dry-run output of the migration against a scratch DB
- Results of fraud/marketplace worker code-audit for NIN dereferences (Risk #2)
- Sequential migration number claimed (`0008` or `0009` depending on Story 9-13 commit ordering)
- Code review findings + fixes (cross-reference Review Follow-ups (AI) below)

### File List

_(Populated during implementation. Expected files:)_

- `apps/api/src/db/schema/respondents.ts` (modified)
- `apps/api/src/db/schema/import-batches.ts` (new)
- `apps/api/src/db/schema/index.ts` (modified — append `import-batches` export)
- `apps/api/src/db/schema/relations.ts` (modified)
- `apps/api/drizzle/<NNNN>_*.sql` (new — migration file; `<NNNN>` = next sequential 4-digit prefix at impl time)
- `apps/api/src/services/submission-processing.service.ts` (modified)
- `apps/api/src/services/__tests__/submission-processing.service.test.ts` (modified + new cases)
- `apps/api/src/db/schema/__tests__/respondents.constraints.test.ts` (new — DB constraint tests; directory `apps/api/src/db/schema/__tests__/` also new)
- `apps/api/src/db/seed-projected-scale.ts` (new — AC#11 seed script)
- `apps/api/src/db/explain-reports/11-1-projected-scale.md` (new — AC#11 EXPLAIN ANALYZE evidence; directory `apps/api/src/db/explain-reports/` also new)
- `apps/api/package.json` (modified — new `seed:projected-scale` script)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-22 | Story drafted from decisions locked over four turns: B2 schema approach (extend `respondents`, not separate table), Path A pending-NIN status model, auto-skip on import email/phone match, SUPA design improvements banked as downstream backlog. 11 ACs including AC#11 composite-index audit at projected scale (Akintola-risk Move 1). | Foundational migration for Epic 11 (Multi-Source Registry) AND prerequisite for Story 9-12 (Public Wizard + Pending-NIN status enum). Unblocks Stories 11-2, 11-3, 11-4, and 9-12. |
| 2026-04-25 | Story content-validated by impostor-SM agent per SCP-2026-04-22 §A.5. All 11 ACs preserved verbatim — esp. AC#11 composite-index audit at projected scale (the Akintola-risk lessons are load-bearing). All 10 canonical queries in Technical Notes "Query Plan Audit" preserved verbatim. Tasks 2.1-2.5 (migration + seeding + EXPLAIN ANALYZE workflow) preserved verbatim. File List preserved verbatim. Cross-validated against epics.md §Epic 11 (post-John A.4 pass) — content aligns; no drift between story summary in epics.md and AC details here. Cross-validated against architecture Decision 1.5 (post-Winston A.2 pass) — schema spec aligns. Cross-validated against UX Form Patterns + Story 9-12 (pending-NIN consumer) — `pending_nin_capture` status enum value matches. Status remained `ready-for-dev`. **NOTE 2026-04-29:** This validation pass confirmed content fidelity but did NOT apply canonical template structure (top-level non-canonical sections preserved, tasks-as-headings format kept, no Project Structure Notes, no References inside Dev Notes, no Dev Agent Record section). Drift surfaced and remediated in 2026-04-29 retrofit pass below. | A.5 special-handling instruction: do NOT delete the AC#11 + Technical Notes section. Validation pass confirmed the original draft survives the post-A.4 documentation reconciliation. |
| 2026-04-29 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level "Prerequisites", "Technical Notes" (preserving all 7 subsections — Migration order matters / Drizzle schema constraints / Query Plan Audit — the 10 queries / Why partial unique index / FR21 not relaxed / Rollback / Performance), "Out of Scope (explicitly)", "Risks" under Dev Notes; created `## Dev Agent Record` section with all 6 canonical subsections (Agent Model Used / Debug Log References / Completion Notes List / File List / Change Log / Review Follow-ups (AI)) and migrated top-level "File List" + "Completion Notes" + "Change Log" into it; converted task-as-headings (`### Task N — Title` + `1.1.` numbered subitems) to canonical `[ ] Task N (AC: #X)` checkbox format with `[ ] N.M` subtasks; renamed `## Tasks` → `## Tasks / Subtasks`; added `### Project Structure Notes` subsection covering schema/migration/index naming/workers/test-directory conventions and 2 new directories that need creation; added `### References` subsection inside Dev Notes with `[Source: file:line]` cites for all 18 verified codebase claims. Resolved migration directory ambiguity: pinned to `apps/api/drizzle/<NNNN>_<name>.sql` (next sequential after 0007); flagged that `apps/api/src/db/migrations/` does NOT exist; cited existing partial-unique-index clone pattern at `apps/api/drizzle/0005_create_team_assignments.sql:21`. Tightened service-file line refs from "~316-336" / "~327" to verified `findOrCreateRespondent` line 310 / NIN check line 317 / users cross-check line 328 / `extractRespondentData` line 256 / NIN-required throw line 283 / `ROLE_TO_SOURCE` map line 52. Verified Risk #2 worker files exist (`apps/api/src/workers/fraud-detection.worker.ts` + `marketplace-extraction.worker.ts`). Added operational note that AC#11 scratch DB needs ~4-8GB disk. Added explicit "create directory" steps for `apps/api/src/db/explain-reports/` and `apps/api/src/db/schema/__tests__/` (both new). Added migration sequential-number conflict awareness with Story 9-13 (whichever ships first claims #0008). Status `ready-for-dev` preserved. All 11 ACs preserved verbatim (no content removed); AC#11 composite-index audit + 10 canonical queries preserved verbatim. | Story v1 (drafted 2026-04-22) and v2 (validated 2026-04-25 by impostor-SM) had high-quality content but identical structural drift to Story 9-13 / prep-tsc / prep-build-off-vps (top-level non-canonical sections, narrative tasks instead of checkboxes, no `## Dev Agent Record`, no Project Structure Notes, no References inside Dev Notes). Drift root cause: agents authored story files directly without loading the BMAD `_bmad/bmm/workflows/4-implementation/create-story/workflow.yaml` workflow files. Remediation pattern: same 4-stage canonical retrofit applied across all impostor-authored stories in Wave 0 + Wave 1. |

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution per Task 6.)_
