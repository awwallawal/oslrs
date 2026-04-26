# Story 11.2: Import Service + PDF/CSV/XLSX Parsers + Endpoints

Status: ready-for-dev

<!--
Created 2026-04-25 by Bob (SM) per SCP-2026-04-22 §A.5.

Backend import service with three parsers (PDF tabular, CSV, XLSX) + dry-run preview / confirm / 14-day rollback endpoints. ITF-SUPA Oyo public-artisan PDF (~4,200 records) is the reference implementation.

Sources:
  • PRD V8.3 FR21 (scoped) + FR25 (secondary-data ingestion)
  • Architecture Decision 1.5 (multi-source registry schema), Decision 3.4 (`/api/v1/admin/imports/*` namespace per Rule 8 import batch lifecycle), ADR-018
  • Epics.md §Story 11.2

Depends on Story 11-1 (schema foundation) + prep-input-sanitisation-layer (parser-output normalisation).
-->

## Story

As the **Super Admin / Ministry data operator**,
I want **a backend service that parses PDF/CSV/XLSX files, runs a dry-run preview, commits inside a transaction with mandatory lawful-basis capture, and supports 14-day rollback via soft-delete**,
so that **secondary-data ingestion (ITF-SUPA Oyo public-artisan PDF and similar future MDA exports) is auditable, reversible, and cannot accidentally pollute the canonical respondent registry with low-trust data masquerading as field-verified**.

## Acceptance Criteria

1. **AC#1 — `ImportService` with three parsers:** New service `apps/api/src/services/import.service.ts` with three parser implementations:
   - `pdf_tabular` — reference implementation against ITF-SUPA Oyo public-artisan PDF; uses `pdf-parse` or `pdfjs-dist` for text extraction + tabular layout detection
   - `csv` — uses `csv-parse` (already in stack? add if not)
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
   - Audit-logged: `action: 'import_batch.created'`, `meta: { batch_id, source, lawful_basis, rows_inserted, rows_matched_existing, rows_skipped, rows_failed }`

5. **AC#5 — Auto-skip on email/phone match (per Awwal's decision, SCP §4.1):** When a parsed row's email OR phone matches an existing respondent (any source, any status), skip insertion. Log the skip in the batch's `failure_report` JSONB with `{ row_index, match_reason, matched_respondent_id_hash }` (hash of matched ID to avoid PII cross-link in audit). Do not over-write the existing respondent.

6. **AC#6 — Status-gating for fraud + marketplace pipelines:** Per Story 11-1 AC#7 + FR28 downstream-exclusion clause, `imported_unverified` rows are excluded from:
   - Fraud-detection NIN dedupe (`fraud-detection.worker.ts` query predicate must include `WHERE status = 'active'`)
   - Marketplace enrichment requiring NIN (marketplace-extraction worker similarly)
   - Partner-API `registry:verify_nin` scope (Story 10-1 enforcement)
   - This story adds the status filter to the pipeline workers if not already present (cross-check with Story 11-1 AC#7 — likely landed there, this story validates)

7. **AC#7 — Endpoint: `POST /api/v1/admin/imports/:id/rollback`** (super-admin only, rate-limited 5/hour):
   - Accepts: `reason` (text, required, min 20 chars per Sally's Journey 5)
   - Validates: batch is `status = 'active'`; batch is within 14-day window (`uploaded_at > now() - 14 days`)
   - On valid: `db.transaction`:
     - UPDATE `import_batches` SET `status = 'rolled_back'`
     - UPDATE all `respondents WHERE import_batch_id = $1` SET `status = 'rolled_back'` (soft-delete via status flip — rows preserved for audit; audit-log policy NEVER allows true row delete on respondents)
   - Audit-logged: `action: 'import_batch.rolled_back'`, `meta: { batch_id, reason, rows_affected }`
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
    - Reuse Story 11-1 seeder for projected-scale test of import performance: import 10K rows → measure transaction time (<60s acceptable)

## Dependencies

- **Story 11-1 (HARD)** — schema foundation: `import_batches` table, `respondents.status` enum, `respondents.source` extended enum, provenance columns
- **prep-input-sanitisation-layer (HARD per AC#5/AC#6 of prep)** — email/phone normalisation is the basis for the auto-skip match logic; cannot ship this story before normalisation is canonical
- **Architecture Decision 1.5 + Decision 3.4 + ADR-018** — design baseline
- **Sally's `LawfulBasisSelector` component** — backend AC#4 enforces lawful_basis required; frontend Story 11-3 surfaces the UI

**Unblocks:**
- **Story 11-3 Admin Import UI** — consumes these endpoints
- **Story 11-4 Source Badges** — depends on `imported_itf_supa` / `imported_other` rows existing in DB to test against

## Field Readiness Certificate Impact

**Tier B per FRC §5.3.1** — does NOT block field-survey start. Can ship during the first weeks of field operation.

## Tasks / Subtasks

### Task 1 — Schema migration: `rolled_back` status + audit log policy (AC#7)

1.1. Drizzle migration: extend `respondents.status` CHECK to include `rolled_back`
1.2. Drizzle migration: extend `respondentStatusTypes` array in schema file
1.3. Verify pipeline workers (fraud + marketplace) status-filters include `rolled_back` exclusion

### Task 2 — Per-source config (AC#2)

2.1. Create `apps/api/src/config/import-sources.ts` with ITF-SUPA reference config + `imported_other` accept-mapping shape
2.2. Type definitions for `ColumnMapping`

### Task 3 — Parsers (AC#1)

3.1. Create `apps/api/src/services/import/parsers/pdf-tabular.parser.ts` — extract text from ITF-SUPA-style tabular PDF using `pdfjs-dist`; layout detection via x-coordinate clustering
3.2. Create `apps/api/src/services/import/parsers/csv.parser.ts` using `csv-parse`
3.3. Create `apps/api/src/services/import/parsers/xlsx.parser.ts` using `exceljs`
3.4. Each parser returns the unified shape per AC#1
3.5. Apply prep-input-sanitisation normalisers to parser output (email, phone, name, date, trade)
3.6. Unit tests per parser

### Task 4 — Import Service (AC#3, AC#4, AC#5, AC#7, AC#8)

4.1. Create `apps/api/src/services/import.service.ts` with methods: `dryRun`, `confirm`, `rollback`, `list`, `get`
4.2. `dryRun` returns dry-run token (signed JWT or DB-row) bound to file hash + parsed result; expires in 1 hour
4.3. `confirm` validates token, runs auto-skip logic + transactional ingest
4.4. `rollback` validates 14-day window + transactional soft-delete
4.5. Auto-skip query: `respondents WHERE email = $1 OR phone = $2 LIMIT 1` per parsed row (batched in chunks of 100 to avoid N+1; use UNION ALL or VALUES list pattern)

### Task 5 — Routes (AC#3, AC#4, AC#7, AC#8)

5.1. Create `apps/api/src/routes/admin/imports.routes.ts`
5.2. 5 endpoints: dry-run, confirm, rollback, list, detail
5.3. Auth guard: super-admin only
5.4. Rate limits per AC
5.5. Multipart file upload via `multer` (already in stack? add if not); 10MB cap

### Task 6 — Audit logging integration (AC#4, AC#7)

6.1. Wire `import_batch.created` audit log on confirm success
6.2. Wire `import_batch.rolled_back` audit log on rollback success
6.3. Use the discriminated-union `auditLog.create()` helper (per Pattern Category 5)

### Task 7 — Tests (AC#10)

7.1. Add ITF-SUPA reference fixture: `apps/api/test-fixtures/itf-supa-sample.pdf` (50-row sample subset of the 4,200-row production PDF; Awwal supplies the trim)
7.2. Parser unit tests
7.3. Service tests (mock DB transactions for unit, integration tests with real DB for transactional behaviour)
7.4. Route integration tests
7.5. End-to-end test
7.6. Performance test: 10K-row import via Story 11-1 seeder

### Task 8 — Sprint status (AC implicit)

8.1. Update `sprint-status.yaml`: `11-2-import-service-parsers: in-progress` → `review` → `done`

## Technical Notes

### Why explicit parser selection (not auto-detect)

File extension can lie (CSV file with `.txt` extension; Excel-saved-as-CSV with broken UTF-8). Magic-byte detection works for some formats but not all (CSV has no magic bytes). Forcing the admin to choose parser at upload time is one extra dropdown but eliminates a class of "weird import behaviour" support tickets.

### Dry-run token semantics

The dry-run returns a token that confirm consumes. Two purposes:
1. **Idempotency:** if admin double-clicks Confirm, the token is single-use (rejected on 2nd attempt with `409 DRY_RUN_TOKEN_EXHAUSTED`)
2. **Result binding:** confirm uses the dry-run's parsed result, not re-parsing from scratch (fast + guarantees confirm matches what admin reviewed)

Implementation: dry-run inserts the parsed result into a temp table `import_batch_drafts (id, file_hash, parsed_result_json, expires_at, used_at)`; token is just the row ID + signed HMAC. Confirm validates HMAC + queries the row + marks `used_at`.

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

## Risks

1. **PDF parser fragility.** ITF-SUPA may publish a slightly different PDF format next quarter. Mitigation: per-source config + unit tests cover the reference PDF; if format changes, parser adjustments are localised; admin can fall back to CSV/XLSX upload.
2. **Auto-skip false negatives at scale.** With 100K+ existing respondents, the OR-match query may slow. Mitigation: per Story 11-1 AC#11 indexes on `respondents(email)` + `respondents(phone)` should already exist or be added; performance test in AC#10 catches regressions.
3. **14-day rollback window edge cases.** What if admin rolls back at day 13.5 of one batch but downstream analytics already aggregated those rows? Mitigation: rolled-back rows have status `rolled_back` — downstream queries should always include status filter; analytics jobs that don't include the filter will need updating (cross-Epic concern, flagged for Story 5.6 follow-up).
4. **Lawful-basis-note minimum length too lenient.** 20 chars is "yes I have legitimate interest" which is meaningless. Mitigation: this is a frontend UX pattern (Story 11-3 + Sally's LawfulBasisSelector enforces minimum); backend enforces presence + length but not semantic quality.
5. **Multipart upload ≤10MB cap may be too small for some sources.** ITF-SUPA reference is 759KB so well under; future sources could be larger. Mitigation: 10MB is a sane MVP default; raising it requires nginx + Express body-parser config update; tracked as future-enhancement note.

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation.)_

### File List

**Created:**
- `apps/api/src/services/import.service.ts`
- `apps/api/src/services/import/parsers/pdf-tabular.parser.ts`
- `apps/api/src/services/import/parsers/csv.parser.ts`
- `apps/api/src/services/import/parsers/xlsx.parser.ts`
- `apps/api/src/config/import-sources.ts`
- `apps/api/src/routes/admin/imports.routes.ts`
- `apps/api/src/db/schema/import-batch-drafts.ts` (dry-run token storage)
- `apps/api/test-fixtures/itf-supa-sample.pdf` (50-row reference subset; Awwal supplies)
- Tests for all of the above
- Drizzle migration for `respondents.status` enum extension + `import_batch_drafts` table

**Modified:**
- `apps/api/src/db/schema/respondents.ts` — extend `respondentStatusTypes` with `rolled_back`
- `apps/api/src/workers/fraud-detection.worker.ts` — verify status filter excludes `imported_unverified` + `rolled_back`
- `apps/api/src/workers/marketplace-extraction.worker.ts` — same
- `apps/api/src/routes/index.ts` — register imports routes
- `apps/api/package.json` — add `multer`, `pdfjs-dist`, `exceljs`, `csv-parse` if not present
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story created by Bob (SM) per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 10 ACs covering 3 parsers + dry-run/confirm/rollback endpoints + auto-skip on email/phone match + status-gating for fraud/marketplace pipelines + transactional ingest + audit logging + tests. Depends on Story 11-1 schema + prep-input-sanitisation-layer normalisation. ITF-SUPA Oyo public-artisan PDF reference implementation. | Backbone of Epic 11 secondary-data ingestion. Tier B per FRC — post-field. |
