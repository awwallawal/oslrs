# Story 9.59: Unified Registry Export — all respondents + questionnaire answers + data_status

Status: review

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

### Dependencies, sequencing & effort (SM, 2026-06-16; ⚠️ INVERTED 2026-06-16 — see below)
- **⚠️ SEQUENCING INVERTED (operator/PM, 2026-06-16; supersedes the SM note that follows).** 9-59 was picked up for dev *ahead of* the Dashboard System Refresh epic, so **9-59 now DEFINES the canonical `data_status` taxonomy + key-normalization map** rather than consuming a foundation built first. It is reclassified as an **Epic 12 (Dashboard System Refresh) Tier-0 / Track-A foundation** item. The analytics `registryTotals` aggregate model (Epic 12 story 12-4) and the analytics pages will **consume 9-59's module**, not the other way around. _[Source: `epic-12-dashboard-system-refresh-brief.md` §6; `sprint-status.yaml:420`]_
  - **Therefore (corrective requirements for this story):**
    1. **Extract the taxonomy into a SHARED, consumer-agnostic module** — NOT export-local. A standalone `data_status` derivation (`deriveDataStatus(respondent, latestSubmission)`) + the table-driven key-normalization map, importable by BOTH `export-query.service.ts` AND `survey-analytics.service.ts`. Do not bury it in export code.
    2. **Right altitude:** 9-59 owns the **row-level atom** (per-respondent `data_status` + the key-map). The **aggregate** (distinct-respondent counts, the 139→76 funnel, per-field response rates) belongs to 12-4 — do not build it here, but design the atom so 12-4 can aggregate over it without modification.
    3. **Foundation-reuse review gate:** the 9-59 code review must explicitly verify "can the analytics layer consume this module unmodified?" — treat the taxonomy as a load-bearing cross-cutting contract, not export-private code.
    4. Reconcile this story's `Status:` header (currently `ready-for-dev`) with the board (`in-progress`) on next update.
- **(Original SM note, NOW SUPERSEDED by the inversion above — kept for history):** ~~Depends on the epic foundation; AC2/AC3 MUST consume the epic's shared model; sequence 9-59 AFTER the foundation story lands.~~ The dependency direction is reversed per the operator decision; 9-59 *is* that foundation module.
- **Still depends on:** Epic 5 export (5-4 `export-query.service` / 5.5 `ExportButton`).
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

- [x] Task 1 — Unified query in `export-query.service.ts` (AC: #1, #2) — LEFT JOIN respondents→latest submission + `data_status` derived in TS via the shared `deriveDataStatus()` (not a SQL `CASE` — keeps the taxonomy in one consumer-agnostic module; review L2).
- [x] Task 2 — Key-normalization map + apply it (AC: #3).
- [x] Task 3 — Reuse `flattenRawDataRow()` label-mapping (AC: #4); optional metadata columns (AC: #5).
- [x] Task 4 — Wire the mode into the controller + `ExportPage` toggle (AC: #1, #6.1).
- [x] Task 5 — Tests incl. real-DB smoke (AC: #6.2).

### Review Follow-ups (AI) — adversarial code review 2026-06-16

Reviewer found 1 High / 4 Medium / 4 Low. The four Epic-12 course-correction criteria (shared/consumer-agnostic module, row-level altitude, foundation-reuse gate, taxonomy completeness) all **PASS**. All High + Medium fixed in this pass; Lows fixed or accepted with rationale. Targeted suites green (109 unit + real-DB smoke), api tsc + eslint clean.

- [x] [AI-Review][High] GPS silently dropped — query selected + row carried + key-map normalized `gpsLatitude`/`gpsLongitude`, but no output column emitted them. Added GPS columns to `UNIFIED_METADATA_COLUMNS` (parity with Full mode). [export-query.service.ts:UNIFIED_METADATA_COLUMNS]
- [x] [AI-Review][Med] Cross-form-version answers dropped without notice — answer columns come from the selected schema; keys absent from it (older form versions) are omitted. Added `canonicalGroupFor()` + a structured `export.unified_unmapped_answer_keys` Pino warn listing dropped keys + affected row count. Full pre-download preview deferred to Epic 12 / 12-8. [export.controller.ts unified branch; registry-key-normalization.ts]
- [x] [AI-Review][Med] `data_status` inspected only the latest submission — a later empty/correction submission masked an earlier completed one. Answers now sourced from a `LEFT JOIN LATERAL` for the latest NON-EMPTY submission (mirrors the Summary name-fallback). [export-query.service.ts:getUnifiedExportData]
- [x] [AI-Review][Med] No row ceiling — CSV-only mode skipped the PDF cap and built every respondent + full `raw_data` in memory unbounded. Added `UNIFIED_MAX_ROWS = 50000` guard → filterable 400. [export.controller.ts]
- [x] [AI-Review][Med] `severity`/`verificationStatus` filters quietly scope to respondents with a fraud detection (LEFT JOIN → effective inner join). Intentional + consistent with Summary (count parity); now documented in `buildWhereClause`. [export-query.service.ts]
- [x] [AI-Review][Low] Task 1 said "data_status CASE" — reworded (derived in TS via `deriveDataStatus`).
- [x] [AI-Review][Low] Additive (not rename-to-one) normalization could duplicate columns for a degenerate schema carrying two variant question names — documented the caveat on `canonicalGroupFor`/module.
- [x] [AI-Review][Low] File List drift — `sprint-status.yaml` is already committed at `review` (no uncommitted change); File List note clarified. Stray untracked `test-fixtures/oslsr_master_v3_email.xlsx` belongs to the pending 9-58 email re-pin task, **not** 9-59 — left untouched (out of this story's scope); flagged so it isn't lost before the next deploy `git pull`.
- [x] [AI-Review][Low][RESOLVED — by design, 2026-06-16 PM/John] Unified mode is blocked when no form is published (answer columns + label mapping require a schema). **Closed, not deferred.** Rationale: (1) the zero-published-forms state is **unreachable in production** — the master form must be published for registration to function at all, so the gate never fires; (2) the pure identity dump is **already served by Summary mode** (one row per respondent, no form required); (3) building a no-form "identity-only unified" path would be a separate feature that **overlaps Epic 12 (12-6 Data Health + 12-7 Registry `data_status`/`reference_code`)** and would be throwaway. The form-required coupling is correct, consistent with Full Response mode. **The genuine enhancement underneath** — surfacing `data_status` + `reference_code` on the lightweight/Summary export so the legibility columns don't require answers — is routed to Epic 12 (see brief §4, 12-7/12-8) so it is tracked properly rather than left floating here.

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

### Canonical Module Contract (Epic 12 foundation — consume, do NOT fork)

This is the load-bearing cross-cutting contract the Epic 12 analytics stories (12-4 `registryTotals`, 12-5/12-6/12-7, 12-8 export-health preview) consume. Both modules are pure (no DB/I/O), so any service can import them directly.

**`apps/api/src/services/registry-data-status.ts`** — the row-level data-completeness atom:
```ts
export const REGISTRY_DATA_STATUSES = [
  'completed', 'data_lost', 'pending_nin', 'nin_unavailable', 'imported', 'no_submission',
] as const;
export type RegistryDataStatus = typeof REGISTRY_DATA_STATUSES[number];

export interface DataStatusInput {
  hasSubmissionData: boolean;          // caller computes (latest NON-EMPTY submission has raw_data)
  status?: string | null;              // respondents.status
  source?: string | null;              // respondents.source
  metadata?: { questionnaire_data_lost?: boolean } | null;
}
export function deriveDataStatus(input: DataStatusInput): RegistryDataStatus; // precedence: completed > data_lost > pending_nin > nin_unavailable > imported > no_submission
export function hasNonEmptyRawData(rawData: unknown): boolean;                // shared emptiness test
```
*Altitude:* row-level only — **no aggregates**. 12-4 aggregates by calling `deriveDataStatus` per respondent and tallying (the 139→76 funnel, per-status counts, response rates live in 12-4, not here). Verified the atom is shaped so 12-4 can consume it **unmodified** to count distinct respondents by `data_status`.

**`apps/api/src/services/registry-key-normalization.ts`** — cross-form-version key map:
```ts
export const CANONICAL_KEY_GROUPS: Record<string, readonly string[]>; // concept → variant spellings (first-non-empty wins)
export function normalizeRawDataKeys(rawData: Record<string, unknown>): Record<string, unknown>; // ADDITIVE: fills every variant from the first non-empty one; input not mutated
export function canonicalGroupFor(key: string): readonly string[] | undefined; // which group a raw key belongs to (for unmapped-key detection)
```

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

claude-opus-4-8[1m] (dev-story workflow, 2026-06-16)

### Completion Notes List

**Sequencing decision (operator, 2026-06-16):** 9-59 was picked up ahead of the
Dashboard System Refresh epic, so it now **defines the canonical model** the
analytics epic will consume (the dependency was inverted — see the story's
Dependencies note). Implemented accordingly: the `data_status` taxonomy and the
key-normalization map live in **standalone, consumer-agnostic modules**, not
buried in export code, so `survey-analytics.service.ts` (Epic 12 story 12-4)
can import them unmodified.

- **Canonical modules (the foundation atom):**
  - `registry-data-status.ts` — `REGISTRY_DATA_STATUSES` taxonomy +
    `deriveDataStatus()` (per-respondent, precedence completed > data_lost >
    pending_nin > nin_unavailable > imported > no_submission) + `hasNonEmptyRawData()`.
    Row-level atom only; the aggregate (139→76 funnel, per-field response rates)
    is deliberately left to Epic 12 story 12-4 so it can aggregate over this atom.
  - `registry-key-normalization.ts` — table-driven `CANONICAL_KEY_GROUPS` +
    `normalizeRawDataKeys()`. **Additive** normalization (fills every variant
    spelling from the first non-empty one) rather than rename-to-one-canonical,
    so the answer column resolves regardless of whether the active form schema's
    question is named `dob` or `date_of_birth` — robust to either form version.
- **Unified query (AC1/AC2):** `ExportQueryService.getUnifiedExportData()` —
  `DISTINCT ON (r.id)` + `LEFT JOIN submissions` (latest by `submitted_at`) so
  EVERY respondent exports once; answer-less rows kept with `rawData = {}`.
  Uses `SELECT r.*` introspection so it can't break on schema drift (9-58
  `reference_code` column). Row count == `getFilteredCount` (distinct respondents).
- **AC3+AC4 pipeline (controller):** for each row, `normalizeRawDataKeys()` →
  then the EXISTING `flattenRawDataRow()` (reused, not forked) maps codes→labels.
  Answer columns come from `buildColumnsFromFormSchema()` (deduped, labeled),
  exactly like Full mode — so variant keys collapse into one schema column (no
  half-empty duplicates).
- **AC5:** `UNIFIED_METADATA_COLUMNS` explodes `reference_code`, `data_status`,
  lifecycle `status`, guardian-presence, `questionnaire_data_lost`, and
  `defer_reason_nin` into columns (no PII beyond what the row already carries).
- **AC6.1 (UI):** `ExportPage` gains a third mode "Full registry (everyone +
  answers)" — requires a form + CSV-only (like Full Response), with a plain-
  language explainer that answer-less rows are expected. Count labels as
  "respondents".
- **AC6.2 (tests):** unit tests for both canonical modules (incl. the documented
  139=76+55+1+7 split), `getUnifiedExportData` mocked-DB tests, controller
  unified-branch tests (format/formId/404/audit/all-rows-pass-through), web UI
  tests, and a **real-DB smoke** (`unified-export-db-smoke.integration.test.ts`)
  that runs the raw SQL against the live schema with the three structurally-
  distinct rows + a schema-column-existence guard (raw-SQL drift gate).
- RBAC unchanged (reuses the endpoint's `exportAuthorize`). `pnpm audit`/new deps: none.

**Validation:** API suite 2544 passed / 7 skipped (export.scale + export.performance
pre-existing infra-gated skips); web suite 2637 passed / 2 todo; both packages
`tsc --noEmit` clean; both packages lint clean (0/0); real-DB smoke green against
the local `oslsr_postgres`. Zero regressions.

### File List

**Added (apps/api):**
- `apps/api/src/services/registry-data-status.ts` — canonical data-status taxonomy + `deriveDataStatus`
- `apps/api/src/services/registry-key-normalization.ts` — canonical cross-form-version key map
- `apps/api/src/services/__tests__/registry-data-status.test.ts`
- `apps/api/src/services/__tests__/registry-key-normalization.test.ts`
- `apps/api/src/services/__tests__/unified-export-db-smoke.integration.test.ts` — real-DB smoke (AC6.2)

**Modified (apps/api):**
- `apps/api/src/services/export-query.service.ts` — `getUnifiedExportData`, `UnifiedExportRow`, `UNIFIED_METADATA_COLUMNS`
- `apps/api/src/controllers/export.controller.ts` — `unified` exportType branch + schema enum
- `apps/api/src/services/__tests__/export-query.service.test.ts` — `getUnifiedExportData` tests
- `apps/api/src/controllers/__tests__/export.controller.test.ts` — Unified Export Mode tests

**Modified (apps/web):**
- `apps/web/src/features/dashboard/pages/ExportPage.tsx` — third "Full registry" mode
- `apps/web/src/features/dashboard/api/export.api.ts` — `exportType` union adds `'unified'`
- `apps/web/src/features/dashboard/pages/__tests__/ExportPage.test.tsx` — unified-mode UI tests

**Tracking:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 9-59 status

## Change Log

| Date | Change |
|---|---|
| 2026-06-16 | dev-story implementation: added the unified export mode (all respondents + answers-where-present + `data_status`). Extracted the canonical `data_status` taxonomy + cross-form-version key-normalization map into standalone, consumer-agnostic modules (the Epic 12 foundation atom) per the inverted-sequencing decision. All 6 ACs met; API + web suites green; real-DB smoke added. Status → review. |
| 2026-06-16 | adversarial code-review (1 High / 4 Med / 4 Low; all Epic-12 course-correction criteria PASS). Fixed all High+Medium: H1 GPS columns restored to output; M1 dropped-answer-key structured warning + `canonicalGroupFor`; M2 answers sourced from latest NON-EMPTY submission (LATERAL); M3 `UNIFIED_MAX_ROWS` ceiling; M4 fraud-filter join semantics documented. Lows fixed/accepted. Added the Canonical Module Contract to Dev Notes. +6 tests (2 service, 2 controller M1, 1 controller M3, 1 smoke M2 case); api tsc + eslint clean; targeted suites green. Status stays `review` (pending human UAT + operator form re-pin). |
