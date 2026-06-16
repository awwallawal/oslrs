# Story 9.59: Unified Registry Export — all respondents + questionnaire answers + data_status

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Drafted 2026-06-15 (emergent from the export-CSV session); VALIDATED + reconciled to canonical by Bob (SM) 2026-06-16 against the create-story checklist + project-context.md. EMERGENT: the operator needed FULL respondent data and the existing export couldn't give it; the one-off CSVs were the stopgap, THIS is the durable fix. ROADMAP post-launch ops/hygiene — NOT a launch gate. BELONGS to the "Dashboard System Refresh" epic (analytics-redesign track): consumes that epic's shared data_status / key-normalization model (see Dependencies) and sequences AFTER the epic foundation. -->

## Story

As a **super-admin / government official exporting the registry**,
I want **one export that contains ALL respondents with their questionnaire answers where present, plus a column explaining each row's data state**,
so that **I get the complete registry picture in a single readable file — instead of choosing between "all respondents but identity-only" or "answers but only the subset who completed a questionnaire."**

## Context & Why (the root-cause this resolves)

The dashboard's `GET /api/v1/exports/respondents` has two modes, and neither gives the full picture [Source: apps/api/src/services/export-query.service.ts]:
- **Summary** (default): 14 respondent columns, one row per respondent (all of them) — but **no questionnaire answers** (it never reads `submissions.raw_data`).
- **Full Response**: flattens `submissions.raw_data` into per-question columns — but **one row per submission**, so it only covers respondents who completed a questionnaire (prod 2026-06-15: **76 of 139**), and it emits **raw codes** with **inconsistent keys across form versions**.

Prod reality (2026-06-15 export): 139 respondents = **76 completed** + **55 data_lost** (pre-2026-05-20 hemorrhage; row exists, answers gone) + **7 no-submission** + **1 pending-NIN**. The Summary export hides the 76's answers; the Full export hides the other 63 entirely. The operator had to be told "use Full Response" and still got an incomplete, code-y, key-inconsistent file. A one-off script produced the correct unified CSV (the **reference implementation** for this story); this makes it a first-class export mode.

This is **post-launch ops/hygiene — NOT a launch gate** (the operational need was met by the one-off CSVs). It is a self-serve quality-of-life feature for support + reporting.

### Dependencies, sequencing & effort (SM, 2026-06-16)
- **Depends on:** Epic 5 export (5-4 `export-query.service` / 5.5 `ExportButton`) **+ the "Dashboard System Refresh" epic foundation.** AC2 (`data_status`) and AC3 (key-normalization) **MUST consume that epic's shared `registryTotals` / data-completeness model — do NOT define a private one** (else the export and the analytics pages diverge on what "completed/data_lost" means). **Sequence 9-59 AFTER the foundation story lands** (soft-blocked on it).
- **Reuses (do NOT fork):** `export-query.service.ts` `getSubmissionExportData()` + `flattenRawDataRow()` + `SUBMISSION_METADATA_COLUMNS`; the existing `/api/v1/exports/respondents` endpoint, RBAC, filters, and CSV/PDF plumbing.
- **Effort:** ~1–2 dev-days.

## Acceptance Criteria

### AC1 — Unified export mode (all respondents + answers-where-present)
1. A new export mode (e.g. `exportType='unified'`) `LEFT JOIN`s `respondents → latest submission per respondent` so **every respondent row exports** (all 139), with questionnaire columns populated where a submission exists and **blank** where not. One row per respondent (use `DISTINCT ON (r.id)` / latest `submitted_at`, mirroring the Summary dedup).
2. The mode is added to the existing endpoint + reuses the existing RBAC, filters (lgaId/source/dateFrom/dateTo/severity/verificationStatus), and CSV/PDF plumbing — no new endpoint.

### AC2 — `data_status` column (the legibility fix)
1. Each row carries a `data_status` column: `completed` (latest submission has non-empty `raw_data`) / `data_lost` (`metadata.questionnaire_data_lost = true`) / `pending_nin` / `nin_unavailable` / `imported` / `no_submission`. This is what makes "139 rows, 76 with answers" legible instead of looking broken.

### AC3 — Key normalization across form versions
1. The union of `raw_data` keys spans multiple form versions with duplicate concepts (prod-observed: `dob`↔`date_of_birth`; `firstname`↔`first_name`↔`surname`↔`last_name`; `gps_location`↔`_gpsLatitude`/`_gpsLongitude`). Map each concept to ONE canonical column so the CSV has no confusing half-empty duplicate columns. The mapping is documented + table-driven (easy to extend as the form evolves).

### AC4 — Human-readable answers (label-mapping)
1. `select_one` / `select_multiple` answers are mapped from raw codes to human labels by **reusing the existing `flattenRawDataRow()`** (the Full Response mode already does this) — the unified export must NOT emit raw codes.

### AC5 — Metadata + completeness (optional columns)
1. Optionally explode useful `respondents.metadata` keys into columns (e.g. `guardian` presence, `questionnaire_data_lost`, `defer_reason_nin`) rather than one opaque JSON blob — operator-useful, no PII beyond what the row already carries.

### AC6 — UI + tests
1. The Export Data page exposes the new mode (clear label, e.g. "Full registry (everyone + answers)") alongside Summary / Full Response.
2. Tests: the unified query returns all respondents (not just those with submissions); `data_status` is correct per state; normalized columns dedup the variant keys; label-mapping renders labels not codes; RBAC unchanged; a real-DB smoke against the live schema (raw-SQL drift guard).

## Tasks / Subtasks

- [ ] Task 1 — Unified query in `export-query.service.ts` (AC: #1, #2) — LEFT JOIN respondents→latest submission + `data_status` CASE.
- [ ] Task 2 — Key-normalization map + apply it (AC: #3).
- [ ] Task 3 — Reuse `flattenRawDataRow()` label-mapping (AC: #4); optional metadata columns (AC: #5).
- [ ] Task 4 — Wire the mode into the controller + `ExportPage` toggle (AC: #1, #6.1).
- [ ] Task 5 — Tests incl. real-DB smoke (AC: #6.2).

> **Carved out (SM, 2026-06-16):** the `@oslsr/utils` barrel-split / lint-enforcement hygiene that briefly lived here as "Task 6" is **NOT part of this export feature** — it's a design-system/build-hygiene concern (split `@oslsr/utils` into a client-safe entry + `@oslsr/utils/server`, or an eslint rule banning web→bare-`@oslsr/utils`-barrel imports; verify with `vite build`). It belongs in the **"Dashboard System Refresh" epic, Track B (design-system foundation)** as its own small story. Removed from 9-59 to keep this story single-purpose. _Tracked separately so it is not lost._

## Dev Notes

### Project-bible compliance (the dev MUST follow these — project-context.md)
- Errors: throw `AppError` (code/message/status), **never** raw `Error`. Logs: Pino structured `{ event: 'export.unified_…' }`, never `console.log`/string-concat.
- Loading: the new ExportPage mode toggle uses **skeleton screens, not spinners**; respect the existing **PDF 1000-row cap** (`export.controller.ts:36`).
- Reuse the export endpoint's existing **RBAC** (`authorize(...)`) + filters; ESM relative imports carry `.js`; backend tests in `__tests__/` (the real-DB smoke is an integration test).

- **Reference implementation:** the 2026-06-15 one-off script (`_tmp-export-full-respondents.ts`) produced exactly this unified CSV (all respondents + `data_status` + union of `q_*` answer columns). NOTE: it was created + **deleted in the working tree — never committed**, so it is NOT in git history; reconstruct from the documented query shape below + the session handoff (`docs/session-2026-06-15-9-58-and-followups.md`). Query shape: `SELECT * FROM respondents` LEFT JOIN `DISTINCT ON (respondent_id) … raw_data ORDER BY submitted_at DESC`, union of `raw_data` keys → columns, `data_status` derived from submission-presence + `metadata.questionnaire_data_lost`.
- **Reuse, don't fork:** the existing `getSubmissionExportData()` already has `flattenRawDataRow()` (code→label) and `SUBMISSION_METADATA_COLUMNS` — the unified mode should share these, not duplicate them.
- **Raw-SQL drift:** use `SELECT *` / introspection so the export can't break on schema drift (e.g. the 9-58 `reference_code` column) — mocked-DB tests hide renamed/removed columns; add a real-DB smoke (project Pitfall).
- **PII:** this exports full contact PII for all respondents — same RBAC + NDPA handling as the existing exports.

### References
- [Source: apps/api/src/services/export-query.service.ts:58-154] — `getRespondentExportData()` (Summary: respondent columns, `DISTINCT ON`, no raw_data).
- [Source: apps/api/src/services/export-query.service.ts:180-242] — `getSubmissionExportData()` (Full: per-submission, includes raw_data).
- [Source: apps/api/src/services/export-query.service.ts:390-437] — `flattenRawDataRow()` (code→label; REUSE for AC4).
- [Source: apps/api/src/services/export-query.service.ts:324-338] — `SUBMISSION_METADATA_COLUMNS`.
- [Source: apps/api/src/controllers/export.controller.ts:36] — PDF 1000-row cap; `EXPORT_COLUMNS`.
- [Source: apps/web/src/features/dashboard/pages/ExportPage.tsx] — the Summary/Full mode toggle UI to extend.
- [Source: docs/session-2026-06-15-9-58-and-followups.md §5] — prod 139=76+55+7+1 breakdown + the one-off reference impl.

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
