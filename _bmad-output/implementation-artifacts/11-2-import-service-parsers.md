# Story 11.2: Import Service + PDF/CSV/XLSX Parsers + Endpoints

Status: ready-for-dev

<!--
Created 2026-04-25 by impostor-SM agent per SCP-2026-04-22 §A.5.

Backend import service with three parsers (PDF tabular, CSV, XLSX) + dry-run preview / confirm / 14-day rollback endpoints. ITF-SUPA Oyo public-artisan PDF (~4,200 records) is the reference implementation.

Sources:
  • PRD V8.3 FR21 (scoped) + FR25 (secondary-data ingestion)
  • Architecture Decision 1.5 (multi-source registry schema), Decision 3.4 (`/api/v1/admin/imports/*` namespace per Rule 8 import batch lifecycle), ADR-018
  • Epics.md §Story 11.2

Depends on Story 11-1 (schema foundation) + prep-input-sanitisation-layer (parser-output normalisation).

Validation pass 2026-04-30 (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`): rebuilt to canonical template; 1 path correction (routes file moved from fictional `apps/api/src/routes/admin/imports.routes.ts` subdir to `apps/api/src/routes/imports.routes.ts` flat file matching existing convention at `routes/<name>.routes.ts`); migration directory ambiguity resolved (only `apps/api/drizzle/` exists; `apps/api/src/db/migrations/` is fictional); existing `apps/api/src/workers/import.worker.ts` stub flagged for population.
-->

## Story

As the **Super Admin / Ministry data operator**,
I want **a backend service that parses PDF/CSV/XLSX files, runs a dry-run preview, commits inside a transaction with mandatory lawful-basis capture, and supports 14-day rollback via soft-delete**,
so that **secondary-data ingestion (ITF-SUPA Oyo public-artisan PDF and similar future MDA exports) is auditable, reversible, and cannot accidentally pollute the canonical respondent registry with low-trust data masquerading as field-verified**.

## Acceptance Criteria

1. **AC#1 — `ImportService` with three parsers:** New service `apps/api/src/services/import.service.ts` with three parser implementations:
   - `pdf_tabular` — reference implementation against ITF-SUPA Oyo public-artisan PDF; uses `pdf-parse` or `pdfjs-dist` for text extraction + tabular layout detection
   - `csv` — uses `csv-parse` (verify in stack; add if not)
   - `xlsx` — uses `exceljs` or `xlsx` library
   - Each parser returns `{ rows: ParsedRow[], failures: ParseFailure[], detectedColumns: ColumnMapping }` shape
   - Parser selection is explicit (admin chooses on upload, not auto-detected — fewer surprises)

2. **AC#2 — Per-source config:** New file `apps/api/src/config/import-sources.ts` defines per-source column mapping + parser hints:
   - `imported_itf_supa` reference config: maps PDF columns (`ADM NO`, `Trade`, `Name`, `LGA`, `Phone`, `Email`) to canonical respondent fields
   - `imported_other` accepts admin-supplied column mapping at upload time
   - Future sources (NBS, NIMC) extend this file without code changes elsewhere

3. **AC#3 — Endpoint: `POST /api/v1/admin/imports/dry-run`** (multipart upload, super-admin only, rate-limited 10/hour):
   - Accepts: `file` (binary, ≤10MB), `source` (enum), `parser_used` (enum), `column_mapping` (optional JSON for `imported_other`), `source_description` (optional text)
   - Computes SHA-256 hash of file bytes; rejects with `409 DUPLICATE_FILE_HASH` if hash matches an existing `import_batches` row (per Architecture Rule 8); response includes link to existing batch
   - Parses file → returns `{ batch_preview: { ... stats ... }, rows_preview: ParsedRow[] (first 50), failure_report: ParseFailure[], lawful_basis_required: true }`
   - **Does NOT write to DB** — dry-run is read-only preview
   - Server-side timeout 30 seconds (PDF parsing of 4K rows can take 5-15s)

4. **AC#4 — Endpoint: `POST /api/v1/admin/imports/confirm`** (super-admin only, rate-limited 5/hour):
   - Accepts: `dry_run_token` (returned by /dry-run; binds to file hash + parsed result), `lawful_basis` (enum, required), `lawful_basis_note` (text, required for `g` legitimate-interest and `data_sharing_agreement`)
   - Wraps the actual ingest in a `db.transaction`:
     - INSERT into `import_batches` (file_hash UNIQUE, lawful_basis, parser_used, rows_*, uploaded_by, etc.)
     - INSERT into `respondents` with `source = 'imported_*'`, `status = 'imported_unverified'`, `external_reference_id`, `import_batch_id`, `imported_at`, `nin = NULL` or value
   - **Auto-skip policy on email/phone match:** for each parsed row, query `respondents WHERE email = $1 OR phone = $2` (per AC#5 below); if match, skip with `match_reason: 'email_match' | 'phone_match'` and increment `import_batches.rows_matched_existing` counter; do NOT insert
   - On NIN-bearing row: route through FR21 partial-UNIQUE pathway (fails the row but does not abort the batch — captured in `rows_failed`)
   - Audit-logged: via `AuditService.logActionTx(tx, { action: 'import_batch.created', ... })` (`apps/api/src/services/audit.service.ts:267`) within the same transaction; `meta: { batch_id, source, lawful_basis, rows_inserted, rows_matched_existing, rows_skipped, rows_failed }`. Add `IMPORT_BATCH_CREATED: 'import_batch.created'` to `AUDIT_ACTIONS` const at `audit.service.ts:35-64`.

5. **AC#5 — Auto-skip on email/phone match (per Awwal's decision, SCP §4.1):** When a parsed row's email OR phone matches an existing respondent (any source, any status), skip insertion. Log the skip in the batch's `failure_report` JSONB with `{ row_index, match_reason, matched_respondent_id_hash }` (hash of matched ID to avoid PII cross-link in audit). Do not over-write the existing respondent.

6. **AC#6 — Status-gating for fraud + marketplace pipelines:** Per Story 11-1 AC#7 + FR28 downstream-exclusion clause, `imported_unverified` rows are excluded from:
   - Fraud-detection NIN dedupe (`apps/api/src/workers/fraud-detection.worker.ts` query predicate must include `WHERE status = 'active'`)
   - Marketplace enrichment requiring NIN (`apps/api/src/workers/marketplace-extraction.worker.ts` similarly)
   - Partner-API `registry:verify_nin` scope (Story 10-1 enforcement)
   - This story adds the status filter to the pipeline workers if not already present (cross-check with Story 11-1 AC#7 — likely landed there, this story validates)

7. **AC#7 — Endpoint: `POST /api/v1/admin/imports/:id/rollback`** (super-admin only, rate-limited 5/hour):
   - Accepts: `reason` (text, required, min 20 chars per Sally's Journey 5)
   - Validates: batch is `status = 'active'`; batch is within 14-day window (`uploaded_at > now() - 14 days`)
   - On valid: `db.transaction`:
     - UPDATE `import_batches` SET `status = 'rolled_back'`
     - UPDATE all `respondents WHERE import_batch_id = $1` SET `status = 'rolled_back'` (soft-delete via status flip — rows preserved for audit; audit-log policy NEVER allows true row delete on respondents)
   - Audit-logged: `AuditService.logActionTx(tx, { action: 'import_batch.rolled_back', ... })`; `meta: { batch_id, reason, rows_affected }`. Add `IMPORT_BATCH_ROLLED_BACK: 'import_batch.rolled_back'` to `AUDIT_ACTIONS` const.
   - Beyond 14-day window: returns `403 ROLLBACK_WINDOW_EXPIRED` with helpful message
   - Note: `rolled_back` is a **new status enum value** added to `respondents.status` CHECK constraint in this story's migration (extends Story 11-1's enum: `active | pending_nin_capture | nin_unavailable | imported_unverified | rolled_back`)

8. **AC#8 — Endpoints: `GET /api/v1/admin/imports`** (list, super-admin only, paginated 50/page) **+ `GET /api/v1/admin/imports/:id`** (detail, super-admin only):
   - List: returns batches with metadata + counts; sortable by `uploaded_at DESC` default; filterable by `source`, `status`, `uploaded_by`
   - Detail: full batch metadata + lawful basis + lawful basis note + parser-failure report download as CSV

9. **AC#9 — Excluded from NIN-keyed downstream pipelines:** Verify (via integration tests) that creating an `imported_itf_supa` batch produces respondents that do NOT appear in:
   - Fraud-detection worker queue (no fraud score generated)
   - Marketplace profile extraction (no marketplace_profile row)
   - Partner-API `registry:verify_nin` response (when Story 10-1 lands; placeholder test pinned to fail until 10-1 implements)

10. **AC#10 — Tests:**
    - Parser unit tests: PDF tabular extraction (ITF-SUPA reference fixture in `apps/api/test-fixtures/itf-supa-sample.pdf`); CSV; XLSX edge cases (Unicode, multi-sheet, blank rows)
    - Service tests: dry-run is read-only; confirm uses transaction; rollback is transactional + idempotent; auto-skip on email/phone match; lawful-basis required
    - Route integration tests: auth guard, file upload, dry-run/confirm/rollback flow, file-hash dedupe, rate limits
    - End-to-end test: ingest the ITF-SUPA reference PDF (sample subset, 50 rows) → dry-run → confirm → verify rows in DB with correct source + status + provenance + audit log
    - Existing 4,191-test baseline maintained or grown
    - Reuse Story 11-1 seeder (`apps/api/src/db/seed-projected-scale.ts`) for projected-scale test of import performance: import 10K rows → measure transaction time (<60s acceptable)

## Tasks / Subtasks

- [ ] **Task 1 — Schema migration: `rolled_back` status + drafts table** (AC: #7, #4)
  - [ ] 1.1 Drizzle migration: extend `respondents.status` CHECK constraint to include `rolled_back` (extends Story 11-1's enum)
  - [ ] 1.2 Drizzle migration: extend `respondentStatusTypes` array in `apps/api/src/db/schema/respondents.ts`
  - [ ] 1.3 Verify pipeline workers (`apps/api/src/workers/fraud-detection.worker.ts` + `apps/api/src/workers/marketplace-extraction.worker.ts` — both verified to exist 2026-04-29) status-filters include `rolled_back` exclusion (cross-check with Story 11-1 AC#7 result)
  - [ ] 1.4 Drizzle migration: create `import_batch_drafts` table (dry-run token storage per AC#4 implementation note in Dev Notes)
  - [ ] 1.5 Migration file location: `apps/api/drizzle/<NNNN>_<descriptive_name>.sql` — sequential 4-digit prefix; confirm next number at impl time via `ls apps/api/drizzle/`. Latest as of 2026-04-30 is `0007_audit_logs_immutable.sql`. Multiple stories in flight (9-13, 11-1, prep-input-sanitisation-layer, prep-settings-landing, 9-11, this story) may claim the same number; coordinate at impl time. **Path `apps/api/src/db/migrations/` does NOT exist** — do not be confused.

- [ ] **Task 2 — Per-source config** (AC: #2)
  - [ ] 2.1 Create `apps/api/src/config/import-sources.ts` with ITF-SUPA reference config + `imported_other` accept-mapping shape
  - [ ] 2.2 Type definitions for `ColumnMapping`

- [ ] **Task 3 — Parsers** (AC: #1)
  - [ ] 3.1 Create `apps/api/src/services/import/parsers/pdf-tabular.parser.ts` — extract text from ITF-SUPA-style tabular PDF using `pdfjs-dist`; layout detection via x-coordinate clustering
  - [ ] 3.2 Create `apps/api/src/services/import/parsers/csv.parser.ts` using `csv-parse`
  - [ ] 3.3 Create `apps/api/src/services/import/parsers/xlsx.parser.ts` using `exceljs`
  - [ ] 3.4 Each parser returns the unified shape per AC#1
  - [ ] 3.5 Apply prep-input-sanitisation normalisers (from `prep-input-sanitisation-layer` Wave 1 prep) to parser output: `apps/api/src/lib/normalise/{email,phone,name,date,trade}.ts`
  - [ ] 3.6 Unit tests per parser

- [ ] **Task 4 — Import Service** (AC: #3, #4, #5, #7, #8)
  - [ ] 4.1 Create `apps/api/src/services/import.service.ts` with methods: `dryRun`, `confirm`, `rollback`, `list`, `get`
  - [ ] 4.2 `dryRun` returns dry-run token (signed JWT or DB-row in `import_batch_drafts` table) bound to file hash + parsed result; expires in 1 hour
  - [ ] 4.3 `confirm` validates token, runs auto-skip logic + transactional ingest using `db.transaction`
  - [ ] 4.4 `rollback` validates 14-day window + transactional soft-delete
  - [ ] 4.5 Auto-skip query: `respondents WHERE email = $1 OR phone = $2 LIMIT 1` per parsed row (batched in chunks of 100 to avoid N+1; use UNION ALL or VALUES list pattern)

- [ ] **Task 5 — Routes + audit logging** (AC: #3, #4, #7, #8)
  - [ ] 5.1 Create `apps/api/src/routes/imports.routes.ts` (flat file under `routes/` matching existing convention; **NOT** `apps/api/src/routes/admin/imports.routes.ts` — that subdirectory does NOT exist; existing pattern is one flat file per resource: `audit.routes.ts`, `respondent.routes.ts`, `marketplace.routes.ts`, `admin.routes.ts`, etc.)
  - [ ] 5.2 5 endpoints mounted under `/api/v1/admin/imports/*`: dry-run, confirm, rollback, list, detail
  - [ ] 5.3 Auth guard: super-admin only via existing `authenticate` + `authorize(UserRole.SUPER_ADMIN)` pattern (clone from `apps/api/src/routes/admin.routes.ts:24-27`)
  - [ ] 5.4 Rate limits per AC: clone `apps/api/src/middleware/login-rate-limit.ts:25-110` pattern with `prefix: 'rl:imports:dry-run'` (10/hr), `prefix: 'rl:imports:confirm'` (5/hr), `prefix: 'rl:imports:rollback'` (5/hr)
  - [ ] 5.5 Multipart file upload via `multer` (verify in stack; add if not); 10MB cap
  - [ ] 5.6 Mount routes in `apps/api/src/routes/index.ts`
  - [ ] 5.7 Add new audit actions to `AUDIT_ACTIONS` const at `apps/api/src/services/audit.service.ts:35-64`: `IMPORT_BATCH_CREATED: 'import_batch.created'` + `IMPORT_BATCH_ROLLED_BACK: 'import_batch.rolled_back'`
  - [ ] 5.8 Wire `import_batch.created` audit log on confirm success via `AuditService.logActionTx(tx, ...)` (transactional within the confirm transaction)
  - [ ] 5.9 Wire `import_batch.rolled_back` audit log on rollback success (transactional within rollback transaction)

- [ ] **Task 6 — Worker stub population** (AC: #1, integration)
  - [ ] 6.1 Existing stub at `apps/api/src/workers/import.worker.ts` (verified to exist 2026-04-29) — populate with the import-processing logic if BullMQ-async-style processing is needed for large imports; OR leave as stub if all import work is synchronous within request handling. **Decision at impl time:** synchronous handling is acceptable for ITF-SUPA's ~4,200 rows (well under 30s timeout). BullMQ async only needed if future imports exceed ~10K rows. Document decision in Dev Notes.

- [ ] **Task 7 — Tests** (AC: #10)
  - [ ] 7.1 Add ITF-SUPA reference fixture: `apps/api/test-fixtures/itf-supa-sample.pdf` (50-row sample subset of the 4,200-row production PDF; Awwal supplies the trim)
  - [ ] 7.2 Parser unit tests
  - [ ] 7.3 Service tests (mock DB transactions for unit, integration tests with real DB for transactional behaviour; per MEMORY.md "Key Patterns" integration tests use `beforeAll`/`afterAll` not `beforeEach`/`afterEach`)
  - [ ] 7.4 Route integration tests
  - [ ] 7.5 End-to-end test
  - [ ] 7.6 Performance test: 10K-row import via Story 11-1 seeder (`apps/api/src/db/seed-projected-scale.ts`)

- [ ] **Task 8 — Sprint status** (cross-cutting AC: all)
  - [ ] 8.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `11-2-import-service-parsers: in-progress` → `review` → `done`

- [ ] **Task 9 — Code review** (cross-cutting AC: all)
  - [ ] 9.1 Run `/bmad:bmm:workflows:code-review` on the uncommitted working tree (per the existing "code review before commit" project pattern in MEMORY.md `feedback_review_before_commit.md`)
  - [ ] 9.2 Auto-fix all High/Medium severity findings; document Low-severity deferrals in Review Follow-ups (AI)
  - [ ] 9.3 Only after code review passes, commit and mark status `review`

## Dev Notes

### Dependencies

- **Story 11-1 (HARD)** — schema foundation: `import_batches` table, `respondents.status` enum, `respondents.source` extended enum, provenance columns
- **`prep-input-sanitisation-layer` (HARD per AC#5/AC#6 of prep)** — email/phone normalisation is the basis for the auto-skip match logic; cannot ship this story before normalisation is canonical
- **Architecture Decision 1.5 + Decision 3.4 + ADR-018** — design baseline
- **Sally's `LawfulBasisSelector` component** — backend AC#4 enforces lawful_basis required; frontend Story 11-3 surfaces the UI

**Unblocks:**
- **Story 11-3 Admin Import UI** — consumes these endpoints
- **Story 11-4 Source Badges** — depends on `imported_itf_supa` / `imported_other` rows existing in DB to test against

### Field Readiness Certificate Impact

**Tier B per FRC §5.3.1** — does NOT block field-survey start. Can ship during the first weeks of field operation.

### Why explicit parser selection (not auto-detect)

File extension can lie (CSV file with `.txt` extension; Excel-saved-as-CSV with broken UTF-8). Magic-byte detection works for some formats but not all (CSV has no magic bytes). Forcing the admin to choose parser at upload time is one extra dropdown but eliminates a class of "weird import behaviour" support tickets.

### Dry-run token semantics

The dry-run returns a token that confirm consumes. Two purposes:
1. **Idempotency:** if admin double-clicks Confirm, the token is single-use (rejected on 2nd attempt with `409 DRY_RUN_TOKEN_EXHAUSTED`)
2. **Result binding:** confirm uses the dry-run's parsed result, not re-parsing from scratch (fast + guarantees confirm matches what admin reviewed)

Implementation: dry-run inserts the parsed result into a temp table `import_batch_drafts (id, file_hash, parsed_result_json, expires_at, used_at)` (created in Task 1.4); token is just the row ID + signed HMAC. Confirm validates HMAC + queries the row + marks `used_at`.

### Auto-skip threshold semantics

Match on email OR phone — not name or NIN. Reasons:
- **Email:** unique-per-person in nearly all cases; high-confidence signal
- **Phone:** same as email
- **Name:** highly ambiguous (multiple `John Adeyemi` plausible); too noisy
- **NIN:** if NIN is present, FR21 partial-UNIQUE catches it at DB layer; auto-skip would double-handle

The auto-skip is a probabilistic dedupe (not perfect) — it prevents the most-common case of "same person already registered with same email." Edge cases (same person with different email per registration) fall through and become duplicate respondent records — out of scope for MVP, addressed by future merge tooling.

### Why 14-day rollback window (not longer / unlimited)

14 days is a balance between operator-confidence (long enough to discover most errors) and downstream-impact (short enough that downstream stories like marketplace and analytics don't have to handle indefinite-rollback semantics). Per Architecture Rule 8: "Admin reviews batch in Story 11-3 UI; can trigger rollback within 14 days." Beyond 14 days, individual respondent records can still be deactivated/deleted via existing right-to-erasure procedures — but batch-level rollback is no longer available.

### Schema-level prep-input-sanitisation dependency

Per AC#5, the auto-skip match logic compares `email` and `phone`. If parser output is `gmail.vom` and existing respondent's email is `gmail.com`, the match fails — a false negative. Prep-input-sanitisation-layer normalises both sides to canonical, eliminating the false-negative. **This is why prep-input-sanitisation-layer is a HARD dependency**, not a nice-to-have.

### PDF tabular extraction is the riskiest parser

ITF-SUPA PDF has merged cells, multi-line cell content, footer-on-every-page noise. The `pdfjs-dist` text extraction is text + position; layout detection via x-coordinate clustering is heuristic (works for the reference PDF but may misalign on slight format changes). Mitigation:
- Document the heuristic + known limitations in Dev Notes
- The dry-run preview surfaces parsing errors per row (admin can see + decide)
- Failures are non-blocking (rows in `failure_report` are not inserted but batch still processes the rest)

### Why `rolled_back` is a new status (not a separate `is_active` boolean)

Status enum already exists (Story 11-1: `active | pending_nin_capture | nin_unavailable | imported_unverified`). Adding `rolled_back` keeps the model coherent — one status field, exhaustive enum, CHECK-enforced. A boolean would be a parallel data model; a future change adding `merged` or `transferred` would have to extend either the boolean (multi-flag) or migrate to the enum anyway.

### Routes file naming — flat file convention

Project convention is one flat file per resource at `apps/api/src/routes/<name>.routes.ts`. There is **no `apps/api/src/routes/admin/` subdirectory** in the codebase. Story v1's reference to `apps/api/src/routes/admin/imports.routes.ts` was a plausible-but-incorrect heuristic. Existing `apps/api/src/routes/admin.routes.ts` (which currently handles `/api/v1/admin/email-budget` endpoints) is a peer flat file, not a parent directory. New routes file lands at `apps/api/src/routes/imports.routes.ts` mounted under `/api/v1/admin/imports/*` — URL prefix matches AC#3-#8 specs; file location matches existing convention.

### Risks

1. **PDF parser fragility.** ITF-SUPA may publish a slightly different PDF format next quarter. Mitigation: per-source config + unit tests cover the reference PDF; if format changes, parser adjustments are localised; admin can fall back to CSV/XLSX upload.
2. **Auto-skip false negatives at scale.** With 100K+ existing respondents, the OR-match query may slow. Mitigation: per Story 11-1 AC#11 indexes on `respondents(email)` + `respondents(phone)` should already exist or be added; performance test in AC#10 catches regressions.
3. **14-day rollback window edge cases.** What if admin rolls back at day 13.5 of one batch but downstream analytics already aggregated those rows? Mitigation: rolled-back rows have status `rolled_back` — downstream queries should always include status filter; analytics jobs that don't include the filter will need updating (cross-Epic concern, flagged for Story 5.6 follow-up).
4. **Lawful-basis-note minimum length too lenient.** 20 chars is "yes I have legitimate interest" which is meaningless. Mitigation: this is a frontend UX pattern (Story 11-3 + Sally's LawfulBasisSelector enforces minimum); backend enforces presence + length but not semantic quality.
5. **Multipart upload ≤10MB cap may be too small for some sources.** ITF-SUPA reference is 759KB so well under; future sources could be larger. Mitigation: 10MB is a sane MVP default; raising it requires nginx + Express body-parser config update; tracked as future-enhancement note.
6. **Migration sequential-number conflict.** Multiple stories (9-13, 11-1, prep-input-sanitisation-layer, prep-settings-landing, 9-11, this story) all queue migrations. Whichever lands first claims `0008`; subsequent stories slot at `0009`/`0010`/etc. Mitigation: confirm at impl time via `ls apps/api/drizzle/`; rebase if intervening commits land between draft and merge.

### Project Structure Notes

- **Service layer** at `apps/api/src/services/import.service.ts` (NEW file). Sub-modules at `apps/api/src/services/import/parsers/{pdf-tabular,csv,xlsx}.parser.ts` (NEW subdirectory — acceptable; mirrors precedents like `apps/api/src/services/auth/` if needed). Each parser is its own file for testability.
- **Routes file** at `apps/api/src/routes/imports.routes.ts` — flat file under `routes/`, NOT under a `admin/` subdirectory. Convention reference: every existing route file is `<name>.routes.ts` flat (audit, respondent, marketplace, staff, admin, fraud-thresholds, fraud-detections, etc. — see full list at `apps/api/src/routes/`).
- **Config layer** at `apps/api/src/config/import-sources.ts` (NEW file). Existing config files at `apps/api/src/config/` (verify directory at impl time; create if not present).
- **Workers** at `apps/api/src/workers/<name>.worker.ts`. Existing `import.worker.ts` STUB exists (verified 2026-04-29 — listed in `apps/api/src/workers/` alongside fraud-detection, marketplace-extraction, productivity-snapshot, dispute-autoclose, backup, webhook-ingestion, email). Task 6 decides whether to populate it (BullMQ async) or leave stub (synchronous handling within request).
- **Drizzle schema barrel** at `apps/api/src/db/schema/index.ts:1-17` — re-exports all 17 tables. This story modifies `respondents.ts` (extend status enum) + creates `import-batch-drafts.ts` (new table for dry-run tokens) — barrel updated accordingly.
- **Drizzle constraint:** schema files MUST NOT import from `@oslsr/types` (drizzle-kit runs compiled JS; `@oslsr/types` has no `dist/`). Per MEMORY.md key pattern.
- **Drizzle migrations** at `apps/api/drizzle/<NNNN>_<name>.sql` — sequential 4-digit prefix. Multiple in-flight stories may collide; coordinate at impl time. **Path `apps/api/src/db/migrations/` does NOT exist.**
- **Audit logging** via `AuditService.logActionTx(tx, ...)` (`apps/api/src/services/audit.service.ts:267`) for transactional emission within the confirm/rollback transactions; `AuditService.logAction(...)` (line 226) for non-transactional. New audit actions added to `AUDIT_ACTIONS` const at `audit.service.ts:35-64`.
- **Rate-limit middleware pattern** clone from `apps/api/src/middleware/login-rate-limit.ts:25-110` (express-rate-limit + RedisStore + `prefix:` namespacing + `isTestMode()` skip). New per-endpoint prefixes: `rl:imports:dry-run`, `rl:imports:confirm`, `rl:imports:rollback`.
- **Multer** (file upload) — verify in stack; if not, add to `apps/api/package.json` devDependencies. Current routes don't use multer (verify at impl time).
- **Test fixtures directory** at `apps/api/test-fixtures/` — verify directory exists; create if not. Test PDF lands here.
- **NEW directories created by this story:**
  - `apps/api/src/services/import/parsers/` (parser modules subdirectory)
  - `apps/api/test-fixtures/` (if not yet existing)

### References

- Architecture Decision 1.5 (multi-source registry schema — extended source/status enums): [Source: _bmad-output/planning-artifacts/architecture.md Decision 1.5]
- Architecture Decision 3.4 (`/api/v1/admin/imports/*` namespace per Rule 8 import batch lifecycle): [Source: _bmad-output/planning-artifacts/architecture.md Decision 3.4]
- Architecture ADR-018 (multi-source registry / pending-NIN status model): [Source: _bmad-output/planning-artifacts/architecture.md:3137]
- Epics — Story 11.2 entry: [Source: _bmad-output/planning-artifacts/epics.md Epic 11 §11.2]
- Story 11-1 (HARD dependency — schema foundation): [Source: _bmad-output/implementation-artifacts/11-1-multi-source-registry-schema-foundation.md]
- prep-input-sanitisation-layer (HARD dependency — parser-output normalisation): [Source: _bmad-output/implementation-artifacts/prep-input-sanitisation-layer.md]
- Respondents schema (extended in this story): [Source: apps/api/src/db/schema/respondents.ts]
- Schema barrel: [Source: apps/api/src/db/schema/index.ts:1-17]
- Workers directory — fraud detection (status filter cross-check per AC#6): [Source: apps/api/src/workers/fraud-detection.worker.ts]
- Workers directory — marketplace extraction (status filter cross-check per AC#6): [Source: apps/api/src/workers/marketplace-extraction.worker.ts]
- Workers directory — import worker STUB (Task 6 decides population): [Source: apps/api/src/workers/import.worker.ts]
- Audit service `logActionTx` API (transactional audit emission): [Source: apps/api/src/services/audit.service.ts:267]
- Audit service `AUDIT_ACTIONS` const (extend with import-batch actions): [Source: apps/api/src/services/audit.service.ts:35-64]
- Admin routes auth pattern (super-admin gate clone): [Source: apps/api/src/routes/admin.routes.ts:24-27]
- Existing routes file convention (flat file precedent): [Source: apps/api/src/routes/audit.routes.ts, respondent.routes.ts, marketplace.routes.ts]
- Rate-limit middleware canonical pattern (clone for AC#3/#4/#7): [Source: apps/api/src/middleware/login-rate-limit.ts:25-110]
- Drizzle migration directory + naming convention: [Source: apps/api/drizzle/0007_audit_logs_immutable.sql]
- Story 11-1 seeder dependency for performance test: [Source: _bmad-output/implementation-artifacts/11-1-multi-source-registry-schema-foundation.md Task 2.5]
- prep-input-sanitisation-layer normaliser library: [Source: _bmad-output/implementation-artifacts/prep-input-sanitisation-layer.md AC#1, Task 1]
- MEMORY.md key pattern: drizzle schema cannot import `@oslsr/types`: [Source: MEMORY.md "Key Patterns"]
- MEMORY.md key pattern: integration tests use beforeAll/afterAll: [Source: MEMORY.md "Key Patterns"]
- MEMORY.md key pattern: code review before commit: [Source: MEMORY.md "Process Patterns" + `feedback_review_before_commit.md`]

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation. Implementer must include:)_

- Sequential migration number claimed (one of `0008` through `0013` depending on commit ordering relative to 9-13 + 11-1 + prep-input-sanitisation-layer + prep-settings-landing + 9-11 + this story)
- ITF-SUPA reference fixture: row count of subset committed, source PDF page count + total row count of original
- Decision on `import.worker.ts` population (synchronous handling vs BullMQ async — Task 6 outcome)
- Auto-skip query performance numbers at 100K respondents (verify AC#5 doesn't degrade)
- Code review findings + fixes (cross-reference Review Follow-ups (AI) below)

### File List

**Created:**
- `apps/api/src/services/import.service.ts`
- `apps/api/src/services/import/parsers/pdf-tabular.parser.ts`
- `apps/api/src/services/import/parsers/csv.parser.ts`
- `apps/api/src/services/import/parsers/xlsx.parser.ts`
- `apps/api/src/config/import-sources.ts`
- `apps/api/src/routes/imports.routes.ts` (flat file under `routes/`; NOT under `admin/` subdir)
- `apps/api/src/db/schema/import-batch-drafts.ts` (dry-run token storage)
- `apps/api/test-fixtures/itf-supa-sample.pdf` (50-row reference subset; Awwal supplies)
- Tests for all of the above
- Drizzle migration for `respondents.status` enum extension + `import_batch_drafts` table

**Modified:**
- `apps/api/src/db/schema/respondents.ts` — extend `respondentStatusTypes` with `rolled_back`
- `apps/api/src/db/schema/index.ts` — export `import-batch-drafts`
- `apps/api/src/services/audit.service.ts` — extend `AUDIT_ACTIONS` const with `IMPORT_BATCH_CREATED` + `IMPORT_BATCH_ROLLED_BACK`
- `apps/api/src/workers/fraud-detection.worker.ts` — verify status filter excludes `imported_unverified` + `rolled_back` (likely already done by Story 11-1 AC#7)
- `apps/api/src/workers/marketplace-extraction.worker.ts` — same
- `apps/api/src/workers/import.worker.ts` — populate or leave stub per Task 6 decision
- `apps/api/src/routes/index.ts` — register imports routes
- `apps/api/package.json` — add `multer`, `pdfjs-dist`, `exceljs`, `csv-parse` if not present
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

**Out of scope (explicitly NOT modified — happens in downstream stories):**
- Frontend Admin Import UI — Story 11-3
- Source badges on imported rows — Story 11-4
- Partner-API `registry:verify_nin` exclusion — Story 10-1

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story drafted by impostor-SM agent per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 10 ACs covering 3 parsers + dry-run/confirm/rollback endpoints + auto-skip on email/phone match + status-gating for fraud/marketplace pipelines + transactional ingest + audit logging + tests. Depends on Story 11-1 schema + prep-input-sanitisation-layer normalisation. ITF-SUPA Oyo public-artisan PDF reference implementation. | Backbone of Epic 11 secondary-data ingestion. Tier B per FRC — post-field. |
| 2026-04-30 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level "Dependencies", "Field Readiness Certificate Impact", "Technical Notes" (preserving all 7 subsections — Why explicit parser selection / Dry-run token semantics / Auto-skip threshold semantics / Why 14-day rollback window / Schema-level prep-input-sanitisation dependency / PDF tabular extraction risk / Why `rolled_back` is a new status), "Risks" under Dev Notes; converted task-as-headings (`### Task N — Title` + `1.1.` numbered subitems) to canonical `[ ] Task N (AC: #X)` checkbox format with `[ ] N.M` subtasks; added `### Project Structure Notes` subsection covering routes file convention (flat-file-not-subdir; story v1's `routes/admin/imports.routes.ts` was fictional), existing `import.worker.ts` stub flag (Task 6 decision), parser subdirectory pattern, audit logging triad, rate-limit clone pattern, multer dependency check; added `### References` subsection with 19 verified `[Source: file:line]` cites; moved top-level `## Change Log` under `## Dev Agent Record` as `### Change Log`; added `### Review Follow-ups (AI)` placeholder; added Task 9 (code review) per `feedback_review_before_commit.md`. **One factual path correction:** AC#3-#8 + Task 5 + File List corrected — routes file moves from `apps/api/src/routes/admin/imports.routes.ts` (subdir; doesn't exist) to `apps/api/src/routes/imports.routes.ts` (flat file; matches convention). URL prefix `/api/v1/admin/imports/*` unchanged (route mounting is independent of file location). **One audit-API correction:** Task 5.7-5.9 specify `AuditService.logActionTx(tx, ...)` (transactional) over generic "auditLog.create()" reference — `AuditService.logActionTx` is the canonical transactional API at `audit.service.ts:267`; new `AUDIT_ACTIONS` const entries documented. **Workers cross-check explicit:** Task 1.3 + Risk #6 + Project Structure Notes flag the existing `fraud-detection.worker.ts` + `marketplace-extraction.worker.ts` files (verified to exist 2026-04-29) for status-filter audit per AC#6. All 10 ACs preserved verbatim. Status `ready-for-dev` preserved. | Story v1 was authored by impostor-SM agent without canonical workflow load — same drift pattern as Stories 9-13 / prep-tsc / prep-build-off-vps / 11-1 / prep-input-sanitisation-layer / 10-5 / 9-11. One novel factual path bug found this pass (routes subdirectory vs flat file convention); audit-API reference tightened to canonical method names. |

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution per Task 9.)_
