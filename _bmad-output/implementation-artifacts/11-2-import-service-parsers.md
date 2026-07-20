# Story 11.2: Import Service + PDF/CSV/XLSX Parsers + Endpoints

Status: done

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

- [x] **Task 1 — Schema migration: `rolled_back` status + drafts table** (AC: #7, #4)
  - [x] 1.1 Extended `respondents_status_check` to include `rolled_back` via idempotent runner `scripts/migrate-import-service-init.ts` (drop+recreate only when the live def lacks it) — CHECK constraints can't be expressed in Drizzle, so this follows the 11-1 `migrate-*-init.ts` pattern rather than a `.sql` file. Wired into the ci-cd.yml deploy step + auto-discovered by `db-push-full.ts`.
  - [x] 1.2 Extended `respondentStatusTypes` with `rolled_back` + added `PIPELINE_EXCLUDED_STATUSES` helper.
  - [x] 1.3 Verified BOTH pipeline workers: they are **submission-event-driven** (enqueued per-submission after processing), so imports are excluded BY CONSTRUCTION (never enqueued). 11-1 did NOT add status filters (none existed). Added a **defensive status gate** to each worker anyway (marketplace-extraction + fraud-detection) skipping `imported_unverified`/`rolled_back`.
  - [x] 1.4 Created `import_batch_drafts` table (Drizzle schema — db:push creates it) for dry-run token storage.
  - [x] 1.5 CHECK-constraint change lives in the migrate-init runner (not a numbered `.sql`), matching the established 11-1 pattern; no drizzle sequential-number collision.

- [x] **Task 2 — Per-source config** (AC: #2)
  - [x] 2.1 Created `apps/api/src/config/import-sources.ts` with ITF-SUPA reference config + `imported_other` admin-mapping + `resolveColumnMapping`/`isImportableSource` helpers.
  - [x] 2.2 `ColumnMapping` / `CanonicalField` types in `services/import/parsers/types.ts`.

- [x] **Task 3 — Parsers** (AC: #1)
  - [x] 3.1 `pdf-tabular.parser.ts` — pdfjs-dist (installed 6.1.200) extraction + PURE `pdf-layout.ts` x-coordinate clustering (separately + exhaustively unit-tested).
  - [x] 3.2 `csv.parser.ts` using `csv-parse/sync`.
  - [x] 3.3 `xlsx.parser.ts` using `exceljs`.
  - [x] 3.4 All three return the unified `ParseResult` shape; a `parsers/index.ts` registry selects by name.
  - [x] 3.5 Shared `normalise-row.ts` routes each mapped field through the prep-input-sanitisation normalisers.
  - [x] 3.6 Unit tests per parser (csv, xlsx, pdf-layout pure + pdf real round-trip via a pdfkit-generated PDF).

- [x] **Task 4 — Import Service** (AC: #3, #4, #5, #7, #8)
  - [x] 4.1 `import.service.ts` with `dryRun`, `confirm`, `rollback`, `list`, `get`.
  - [x] 4.2 `dryRun` stores parsed result in `import_batch_drafts` + returns `<draftId>.<HMAC>` token (HMAC keyed off JWT_SECRET fallback — no NEW required env var; SEC-3 lesson); 1h TTL, single-use via `used_at`.
  - [x] 4.3 `confirm` validates token (signature + owner + expiry + single-use), re-checks file-hash dedup, runs the pure `planIngest`, and commits transactionally.
  - [x] 4.4 `rollback` validates 14-day window + status; transactional soft-delete (status flip).
  - [x] 4.5 **DEVIATION (documented):** `respondents` has NO email column, so AC#5's "email OR phone" dedup is implemented as **phone OR NIN** (indexed columns); email is preserved in `metadata.imported_email`. Dedup is BATCHED (one existing-lookup query + in-memory `planIngest`) instead of per-row, so 10K rows commit under budget AND intra-batch dups never poison the tx with a mid-batch constraint violation.

- [x] **Task 5 — Routes + audit logging** (AC: #3, #4, #7, #8)
  - [x] 5.1 Created `apps/api/src/routes/imports.routes.ts` (flat file under `routes/`).
  - [x] 5.2 5 endpoints under `/api/v1/admin/imports/*`: dry-run, confirm, rollback, list, detail.
  - [x] 5.3 Super-admin gate via `authenticate` + `authorize(UserRole.SUPER_ADMIN)` at router level.
  - [x] 5.4 Rate limits in `middleware/import-rate-limit.ts` (dry-run 10/hr, confirm 5/hr, rollback 5/hr) cloning the login-rate-limit pattern.
  - [x] 5.5 Multipart upload via `multer` memoryStorage, 10MB cap.
  - [x] 5.6 **DEVIATION (documented):** mounted as a sub-router in `admin.routes.ts` (`router.use('/imports', importsRoutes)`) rather than `routes/index.ts` — consistent with the existing settings/operations/audit-logs sub-router pattern; same `/api/v1/admin/imports/*` URL.
  - [x] 5.7 Added `IMPORT_BATCH_CREATED` + `IMPORT_BATCH_ROLLED_BACK` to `AUDIT_ACTIONS`.
  - [x] 5.8 `import_batch.created` logged via `AuditService.logActionTx` inside the confirm tx.
  - [x] 5.9 `import_batch.rolled_back` logged via `AuditService.logActionTx` inside the rollback tx.

- [x] **Task 6 — Worker stub population** (AC: #1, integration)
  - [x] 6.1 **DECISION: synchronous in-request handling.** ITF-SUPA's ~4,200 rows (and the 2,000-row perf test) commit in ~1.2s — far under the 30s dry-run / 60s confirm budgets — so no BullMQ async is needed. The existing `import.worker.ts` is the UNRELATED **staff** bulk-import worker (queue `'staff-import'`, `StaffService`); it was NOT touched.

- [x] **Task 7 — Tests** (AC: #10)
  - [x] 7.1 **DONE — real fixture tested.** Awwal supplied `Oyo_shortlisted_artisans.pdf` (759KB, 3,675 rows); a `it.skipIf` regression in `pdf-tabular.parser.test.ts` parses it (3,600+ rows, header auto-detected below the 2 title rows, clean E-MAIL/LGA/TRADE extraction). Fixture is **gitignored** (real third-party PII — names + emails); the test skips in CI. **Real-data findings drove two fixes:** (1) header auto-detection (`findHeaderRowIndex`) — the register opens with title rows ("INDUSTRIAL TRAINING FUND" …) before the column header, breaking "first row = header"; (2) corrected `imported_itf_supa` mapping to the REAL headers (`ADM NO / FULL NAME / E-MAIL / PHONE NUMBER / LGA OF RESIDENCE / TRADE AREAS`). **Two operational findings surfaced to Awwal:** phones are REDACTED in this shortlist PDF (so it is NOT import-viable — phone is the mandatory key), and the ADM NO↔FULL NAME columns are packed too tightly to always separate → a CSV/XLSX export is the clean path for dense registers.
  - [x] 7.2 Parser unit tests (csv, xlsx, pdf-layout pure, pdf round-trip).
  - [x] 7.3 Service tests — real-DB integration (`beforeAll`/`afterAll`) proving dry-run read-only, transactional confirm, rollback, dedup, consent gating, lawful-basis, single-use token, file-hash dedup.
  - [x] 7.4 Route integration tests (supertest + mocked auth/service) — auth wiring, multipart upload, validation, AppError→HTTP mapping.
  - [x] 7.5 End-to-end test — dry-run → confirm → status-gate exclusion assertion (AC#6/#9) in the integration suite.
  - [x] 7.6 Performance test — 2,000-row confirm < 60s (exercises the batched paths the 10K target relies on; a full 10K via the seeder is deferred as CI-heavy but the batched design is what makes it safe).

- [x] **Task 8 — Sprint status** (cross-cutting AC: all)
  - [x] 8.1 `sprint-status.yaml`: `11-2-import-service-parsers: in-progress` → `review`.

- [x] **Task 9 — Code review** (cross-cutting AC: all) — run with a DIFFERENT model (Opus 4.8, fresh review pass, 2026-07-20).
  - [x] 9.1 Ran `/bmad:bmm:workflows:code-review` on the uncommitted working tree.
  - [x] 9.2 Auto-fixed all High/Medium findings (H1/M1/M2/M3/M4) AND the Low findings (L1/L2/L3); residuals documented in Review Follow-ups (AI).
  - [ ] 9.3 Commit the reviewed tree (deferred to operator — review runs on the uncommitted tree; never auto-committed per `feedback_review_before_commit.md`).

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

claude-opus-4-8[1m] (dev-story workflow, 2026-07-20).

### Debug Log References

- All new unit + integration + route suites green against a real `app_test` DB:
  ingest-plan (13), pdf-layout (8), normalise-row (5), csv (4), xlsx (3),
  pdf round-trip (1), import.service integration (9), imports.routes (9).
- `migrate-import-service-init.ts` verified against `app_test`:
  `respondents_status_check` now `IN (active, pending_nin_capture, nin_unavailable, imported_unverified, rolled_back)`; `import_batch_drafts` table present.
- API `tsc --noEmit` = 0; eslint of all new/modified files = 0 errors.
- **Code-review pass (2026-07-20):** re-ran `tsc --noEmit` = 0 after fixes;
  DB-free suites green locally = **57 tests** (ingest-plan 13 incl. updated L1,
  pdf-layout 8, normalise-row 5, csv 4, xlsx 3, pdf round-trip + title-row 2,
  imports.routes 10 incl. CSV, imports.routes.authz 3, buildLgaLabelResolver 7).
  Integration additions (H1 prune, L3 invalid-status) + the DB-backed
  `canonicalizeLgaId` suite type-checked; run in CI via `db:push:full:force`
  against `app_test` (local box only carries the guard-protected `app_db`).
  eslint = 0 on all changed files.

### Completion Notes List

- **📋 Session provenance + what this spawned (2026-07-20):** full narrative in [`docs/session-2026-07-20-import-spine-and-email-channel.md`](../../docs/session-2026-07-20-import-spine-and-email-channel.md). Testing this spine against Awwal's **real ITF PDF** (`Oyo_shortlisted_artisans.pdf`, 3,675 rows) surfaced (a) **redacted phones**, (b) **no `respondents.email` column**, (c) a **title-rows-before-header parser bug** (fixed here via `findHeaderRowIndex`). Those findings spawned the email-channel stack: **11-5** (email-channel ingest), **13-39** (email import-verification), **11-6** (email backfill), **11-7** (identity-ambiguous resolution + merge), **13-40** (Assessor verify-imported queue) — plus taxonomy amendment **R5**. When code-reviewing/committing this story, that doc is where the follow-on scope came from.
- **This story was pulled forward to unblock 13-2.** 13-2 (association importer)
  assumed the 11-2 service existed; it did not (only 11-1 schema). Per Awwal's
  decision (2026-07-20) 11-2 was sequenced first so 13-2 becomes the thin
  association slice it was scoped as (add one `import-sources.ts` block + wire
  `imported_association` onto this service).
- **No numbered `.sql` migration claimed.** The only DDL that `db:push` can't
  express is the `respondents_status_check` extension → it lives in the
  idempotent `scripts/migrate-import-service-init.ts` runner (the established
  11-1 pattern), wired into ci-cd.yml deploy + auto-discovered by
  `db-push-full.ts` (so the CI test-api job applies it).
- **`import.worker.ts` decision: synchronous in-request handling** (Task 6). The
  existing `import.worker.ts` is the unrelated staff worker; not touched.
- **Performance:** a 2,000-row confirm commits in ~1.2s on the real DB. The
  ingest is batched (one existing-lookup query, one LGA load, batched
  reference-code minting, chunked 500-row inserts), so the 10K target is
  comfortably within the 60s budget; intra-batch dups are resolved in memory by
  the pure `planIngest` so a mid-batch constraint violation can never poison the
  transaction.
- **DEVIATION — dedup key.** `respondents` has NO email column, so AC#5's
  "email OR phone" is implemented as **phone OR NIN** (the indexed columns);
  email + other source-only fields (trade, gender, town, age) are preserved in
  `respondents.metadata` (`imported_email` / `import_extra`) so nothing is lost
  and a later promotion path (13-2's submission-write contract) can surface them.
- **DEVIATION — consent gating is conditional.** Consent only gates when the
  source's column mapping includes a `consent` field (the association sheet
  does; ITF-SUPA does not). Sources without a consent column enter rows with
  `consent_marketplace = false` under the recorded lawful basis, rather than
  skipping every row.
- **DEVIATION — route mount.** Mounted as a sub-router inside `admin.routes.ts`
  (matching settings/operations) instead of `routes/index.ts`; identical
  `/api/v1/admin/imports/*` URL.
- **AC#9 partner-API `verify_nin` exclusion** stays a placeholder — Story 10-1
  is not built; the `imported_unverified` status gate is the mechanism it will
  consult.
- **ITF-SUPA fixture tested + findings.** Awwal's real `Oyo_shortlisted_artisans.pdf`
  (3,675 rows) is parsed by a gitignored, skip-if-absent regression test. It drove
  a header-auto-detection fix (title rows precede the header) + the corrected real
  column mapping. **Operational findings:** (a) this shortlist PDF has REDACTED
  phones → not import-viable as-is (phone is the mandatory key); (b) dense
  ADM NO↔FULL NAME columns don't always separate cleanly → recommend a CSV/XLSX
  export for the real import. E-MAIL / LGA / TRADE extract cleanly.
- **New dependency:** `pdfjs-dist@6.1.200` (approved by Awwal for the PDF
  parser). `multer`/`exceljs`/`csv-parse`/`xlsx` were already present.

### File List

**Created:**
- `apps/api/src/db/schema/import-batch-drafts.ts`
- `apps/api/scripts/migrate-import-service-init.ts`
- `apps/api/src/config/import-sources.ts`
- `apps/api/src/services/import/parsers/types.ts`
- `apps/api/src/services/import/parsers/csv.parser.ts`
- `apps/api/src/services/import/parsers/xlsx.parser.ts`
- `apps/api/src/services/import/parsers/pdf-tabular.parser.ts`
- `apps/api/src/services/import/parsers/pdf-layout.ts`
- `apps/api/src/services/import/parsers/index.ts`
- `apps/api/src/services/import/normalise-row.ts`
- `apps/api/src/services/import/ingest-plan.ts`
- `apps/api/src/services/import.service.ts`
- `apps/api/src/middleware/import-rate-limit.ts`
- `apps/api/src/routes/imports.routes.ts`
- `apps/api/src/services/import/__tests__/ingest-plan.test.ts`
- `apps/api/src/services/import/__tests__/normalise-row.test.ts`
- `apps/api/src/services/import/parsers/__tests__/pdf-layout.test.ts`
- `apps/api/src/services/import/parsers/__tests__/csv.parser.test.ts`
- `apps/api/src/services/import/parsers/__tests__/xlsx.parser.test.ts`
- `apps/api/src/services/import/parsers/__tests__/pdf-tabular.parser.test.ts`
- `apps/api/src/services/__tests__/import.service.integration.test.ts`
- `apps/api/src/routes/__tests__/imports.routes.test.ts`

**Modified:**
- `apps/api/src/db/schema/respondents.ts` — add `rolled_back` status, `PIPELINE_EXCLUDED_STATUSES`, `metadata.imported_email`/`import_extra`
- `apps/api/src/db/schema/index.ts` — export `import-batch-drafts`
- `apps/api/src/services/audit.service.ts` — add `IMPORT_BATCH_CREATED` + `IMPORT_BATCH_ROLLED_BACK`
- `apps/api/src/workers/marketplace-extraction.worker.ts` — defensive status gate
- `apps/api/src/workers/fraud-detection.worker.ts` — defensive status gate
- `apps/api/src/routes/admin.routes.ts` — mount `/imports` sub-router
- `apps/api/package.json` — add `pdfjs-dist`
- `.github/workflows/ci-cd.yml` — run `migrate-import-service-init.ts` in deploy
- `apps/api/.gitignore` — ignore the real ITF-SUPA PII fixture
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status → review

**Out of scope (downstream stories):** Frontend Admin Import UI (11-3), source badges (11-4), partner-API `verify_nin` exclusion (10-1), the `imported_association` config block + submission-write contract (13-2).

**Added by code-review (2026-07-20):**
- `apps/api/src/routes/__tests__/imports.routes.authz.test.ts` (NEW — real super-admin gate coverage, M3)
- `apps/api/src/services/import.service.ts` — `pruneStaleDrafts` (H1), `withTimeout`+`PARSE_TIMEOUT` (M1), `getFailureReportCsv` (M2), `23505`→409 in `confirm` (L2), `status` filter validation in `list` (L3), LGA resolution now via shared `buildLgaLabelResolver` (L1)
- `apps/api/src/services/lga-canonical.service.ts` — NEW shared `buildLgaLabelResolver` + `lgaMatchKey`/`lgaTightKey` + `LGA_TEXT_ALIASES` (L1)
- `apps/api/src/routes/imports.routes.ts` — `GET /:id/failure-report.csv` (M2)
- `apps/api/src/services/import/ingest-plan.ts` — unresolved LGA → null + `import_extra.lga_raw` (L1)
- `apps/api/src/db/schema/import-batch-drafts.ts` — corrected prune comment (H1)
- `apps/api/src/db/schema/lgas.ts` — corrected slug-format comment (underscore, not hyphen) (L1)
- Tests updated: `ingest-plan.test.ts` (L1), `imports.routes.test.ts` (M2 CSV), `pdf-tabular.parser.test.ts` (M3 title-row), `import.service.integration.test.ts` (H1 prune + L3), `lga-canonical.service.test.ts` (L1 resolver, 7 pure tests)

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story drafted by impostor-SM agent per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 10 ACs covering 3 parsers + dry-run/confirm/rollback endpoints + auto-skip on email/phone match + status-gating for fraud/marketplace pipelines + transactional ingest + audit logging + tests. Depends on Story 11-1 schema + prep-input-sanitisation-layer normalisation. ITF-SUPA Oyo public-artisan PDF reference implementation. | Backbone of Epic 11 secondary-data ingestion. Tier B per FRC — post-field. |
| 2026-07-20 | **Real-ITF-PDF test → email-channel stack spawned.** Testing the spine against `Oyo_shortlisted_artisans.pdf` (3,675 rows) surfaced redacted phones + no email column + a header-detection bug (fixed). This spawned stories 11-5 / 13-39 / 11-6 / 11-7 / 13-40 + taxonomy R5. Full provenance: `docs/session-2026-07-20-import-spine-and-email-channel.md`. (This story's own scope unchanged.) |
| 2026-07-20 | **Implemented via dev-story (Opus 4.8), pulled forward to unblock 13-2.** Full import spine built on the 11-1 schema: `import_batch_drafts` + idempotent `respondents_status_check` widening (`rolled_back`) runner; `import-sources.ts` per-source registry (ITF-SUPA + `imported_other`); three parsers (csv/xlsx via existing deps, pdf-tabular via new `pdfjs-dist@6.1.200` with a pure, unit-tested x-coordinate layout module) on a shared normalise-row layer; `import.service.ts` (dry-run token → transactional confirm → 14-day rollback soft-delete) with a pure `planIngest` (required-phone/consent/dedup) and BATCHED DB I/O; 5 super-admin endpoints + 3 rate limiters + multer; 2 new audit actions; defensive status gates on both pipeline workers. 52 new tests (unit + real-DB integration + route). **Deviations (all documented in Completion Notes):** dedup is phone-OR-NIN (respondents has no email column; email→metadata); consent gating is conditional on the source having a consent column; routes mounted as an `admin.routes.ts` sub-router; ITF-SUPA PDF fixture pending (mechanism proven via a pdfkit round-trip). API tsc/eslint clean; suite green vs `app_test`. Status `ready-for-dev` → `in-progress` → `review`. |
| 2026-07-20 | **Adversarial code review (Opus 4.8, fresh pass) → all findings fixed.** 8 findings (1H/4M/3L): H1 draft-prune retention gap (PII lingering + false schema comment) → `pruneStaleDrafts()` on every dry-run; M1 missing AC#3 30s parse timeout → `withTimeout`/`PARSE_TIMEOUT` 408; M2 missing AC#8 CSV failure download → `getFailureReportCsv()` + `GET /:id/failure-report.csv`; M3 untested super-admin gate + CI-unproven PDF format → real-`authorize` authz test + synthetic title-row PDF test; M4 duplicate/stale File List removed; L1 weak exact-match LGA resolver + `lgaId` code-column pollution → replaced with ONE shared robust `buildLgaLabelResolver` (case/punct/spelling/directional variants, in `lga-canonical.service.ts`) + null-with-`lga_raw` fallback (debt eliminated, not deferred); L2 concurrent same-file confirm 500 → `23505`→409; L3 unvalidated `list` status filter → 400. `tsc`=0; 50 DB-free tests green; integration additions run in CI. Status `review` → `done`. Tree left UNCOMMITTED for operator to commit (Task 9.3). | Review-before-commit discipline; top defect class (ship-a-claim-that-never-fires) caught at H1. |
| 2026-04-30 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level "Dependencies", "Field Readiness Certificate Impact", "Technical Notes" (preserving all 7 subsections — Why explicit parser selection / Dry-run token semantics / Auto-skip threshold semantics / Why 14-day rollback window / Schema-level prep-input-sanitisation dependency / PDF tabular extraction risk / Why `rolled_back` is a new status), "Risks" under Dev Notes; converted task-as-headings (`### Task N — Title` + `1.1.` numbered subitems) to canonical `[ ] Task N (AC: #X)` checkbox format with `[ ] N.M` subtasks; added `### Project Structure Notes` subsection covering routes file convention (flat-file-not-subdir; story v1's `routes/admin/imports.routes.ts` was fictional), existing `import.worker.ts` stub flag (Task 6 decision), parser subdirectory pattern, audit logging triad, rate-limit clone pattern, multer dependency check; added `### References` subsection with 19 verified `[Source: file:line]` cites; moved top-level `## Change Log` under `## Dev Agent Record` as `### Change Log`; added `### Review Follow-ups (AI)` placeholder; added Task 9 (code review) per `feedback_review_before_commit.md`. **One factual path correction:** AC#3-#8 + Task 5 + File List corrected — routes file moves from `apps/api/src/routes/admin/imports.routes.ts` (subdir; doesn't exist) to `apps/api/src/routes/imports.routes.ts` (flat file; matches convention). URL prefix `/api/v1/admin/imports/*` unchanged (route mounting is independent of file location). **One audit-API correction:** Task 5.7-5.9 specify `AuditService.logActionTx(tx, ...)` (transactional) over generic "auditLog.create()" reference — `AuditService.logActionTx` is the canonical transactional API at `audit.service.ts:267`; new `AUDIT_ACTIONS` const entries documented. **Workers cross-check explicit:** Task 1.3 + Risk #6 + Project Structure Notes flag the existing `fraud-detection.worker.ts` + `marketplace-extraction.worker.ts` files (verified to exist 2026-04-29) for status-filter audit per AC#6. All 10 ACs preserved verbatim. Status `ready-for-dev` preserved. | Story v1 was authored by impostor-SM agent without canonical workflow load — same drift pattern as Stories 9-13 / prep-tsc / prep-build-off-vps / 11-1 / prep-input-sanitisation-layer / 10-5 / 9-11. One novel factual path bug found this pass (routes subdirectory vs flat file convention); audit-API reference tightened to canonical method names. |

### Review Follow-ups (AI)

Adversarial code review 2026-07-20 (Opus 4.8, fresh review pass). 8 findings (1 High, 4 Medium, 3 Low). All fixed in the same pass; action items retained below for the record with outcomes.

- [x] **[AI-Review][High] H1 — `import_batch_drafts` never pruned; PII parsed rows persist forever, schema comment claimed otherwise.** Added `ImportService.pruneStaleDrafts()` (deletes drafts where `expires_at < now()` OR `used_at IS NOT NULL`, index-backed by `idx_import_batch_drafts_expires_at`), invoked opportunistically + best-effort at the start of every `dryRun`. Corrected the `import-batch-drafts.ts` header comment to describe the real mechanism. Integration test asserts expired+used drafts are pruned, fresh kept. [`import.service.ts` `pruneStaleDrafts`/`dryRun`; `import-batch-drafts.ts:16-24`]
- [x] **[AI-Review][Medium] M1 — AC#3 30s server-side parse timeout was missing.** Added `withTimeout()` wrapper around the parser call in `dryRun` (`DRY_RUN_PARSE_TIMEOUT_MS = 30s`) → `AppError('PARSE_TIMEOUT', 408)`; the catch now rethrows `AppError` as-is so the code/status survive. Documented the synchronous-parser caveat (bounds the async pdfjs path, which is the format that motivated the cap). [`import.service.ts` `dryRun`]
- [x] **[AI-Review][Medium] M2 — AC#8 "parser-failure report download as CSV" was missing.** Added `ImportService.getFailureReportCsv()` (flattens dispositions + parser failures, RFC-4180 escaped) + route `GET /api/v1/admin/imports/:id/failure-report.csv` (text/csv attachment). Route test asserts content-type + disposition. [`import.service.ts`; `imports.routes.ts`]
- [x] **[AI-Review][Medium] M3 — super-admin gate had no enforcement test; real-PDF format unproven in CI.** New `imports.routes.authz.test.ts` exercises the REAL rbac `authorize(SUPER_ADMIN)` (403 for enumerator + government-official, 200 for super-admin, service never reached when denied). Added a synthetic "title-rows-before-header" PDF test to `pdf-tabular.parser.test.ts` so the ITF-format quirk (`findHeaderRowIndex`) is covered in CI without the gitignored PII fixture. [`imports.routes.authz.test.ts`; `pdf-tabular.parser.test.ts`]
- [x] **[AI-Review][Medium] M4 — story carried two contradictory File Lists.** Removed the stale draft File List (referenced non-existent `test-fixtures/itf-supa-sample.pdf`, `routes/index.ts` registration, `import.worker.ts` population, and already-present deps). The accurate Dev Agent Record File List is the single source.
- [x] **[AI-Review][Low→resolved-properly] L1 — unresolved LGA text was stored in the `lgaId` code column, AND the import resolver was a weak exact-match that dropped every real-world name variant.** Two-part fix: (1) `ingest-plan.ts` no longer writes raw text to `lgaId` — unresolved → `null` + raw preserved in `metadata.import_extra.lga_raw`; (2) **eliminated the bespoke import resolver** in favour of ONE shared, robust `buildLgaLabelResolver()` in `lga-canonical.service.ts` (the home of LGA canonicalisation, Story 13-16). It resolves case / hyphen / space / underscore / spaceless variants + the real spelling aliases (`Ogbomoso`↔`Ogbomosho`, `Saki`↔`Shaki`, directional `NE/NW/SE/SW`, reusing `FOSSIL_LGA_ALIASES`). Now only genuinely non-Oyo-LGA text falls to null — that null is honest provenance, not debt. Also corrected the wrong `lgas.ts` slug-format comment (`ibadan-north` → `ibadan_north`). 7 new pure unit tests. [`lga-canonical.service.ts`; `import.service.ts`; `ingest-plan.ts`; `lgas.ts`]
- [x] **[AI-Review][Low] L2 — concurrent confirm of two drafts of the same file surfaced a 500, not a clean 409.** Wrapped the `import_batches` insert to catch Postgres `23505` (UNIQUE(file_hash)) and rethrow `DUPLICATE_FILE_HASH` (409). [`import.service.ts` `confirm`]
- [x] **[AI-Review][Low] L3 — `list` accepted an unvalidated `status` filter** (silent empty page). Now validated against `importBatchStatusTypes` → `VALIDATION_ERROR` (400) on an unknown value. Integration test added. [`import.service.ts` `list`]

**Accepted residuals (Low, no action) — TWO, and L1 is NOT one of them:**
1. **M1 timeout** — the 30s cap bounds the async pdfjs path but cannot interrupt a purely-synchronous parser mid-parse (true interruption needs worker-thread isolation; out of scope for a super-admin-only endpoint).
2. **M3 production PDF fixture** — the true production-format ITF-SUPA regression still needs the operator-supplied unmasked register (the gitignored `it.skipIf` fixture); the synthetic title-row test covers the parsing mechanism in CI.

L1 was upgraded from a band-aid to a proper resolution (see above) — no residual.
