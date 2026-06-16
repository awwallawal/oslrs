# Story 12.4: registryTotals aggregate model

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-16 by Bob (SM) via the create-story workflow as Epic 12 "Dashboard System Refresh" Tier-0 / Track-A foundation. POST-LAUNCH, NON-GATING. This story OWNS THE AGGREGATE over 9-59's row-level data_status atom (registry-data-status.ts, MERGED on main). It does NOT define a new taxonomy — the inversion: 9-59 defines the row-level atom; 12-4 aggregates over it and becomes the single source of truth every analytics surface (12-5/12-6/12-7/12-8) calls. Cite registry-data-status.ts by path+signature; never redefine the statuses. -->

## Story

As a **super-admin / government official viewing the registry dashboard**,
I want **one authoritative count of ALL distinct respondents, split by their data_status (139 = 76 completed + 55 data_lost + 7 no_submission + 1 pending_nin), with the 139→76 "answers present" funnel exposed**,
so that **the dashboard stops mislabeling "76 with answers" as "Total Respondents" and every analytics surface counts the registry the same way from a single source of truth.**

## Context & Why (the counting root cause this resolves)

The registry is not a single clean number, and the dashboard counts it wrong. `SurveyAnalyticsService.getRegistrySummary()` returns `totalRespondents` as `COUNT(*)` over **submissions filtered to `s.raw_data IS NOT NULL`** — i.e. it counts only respondents whose latest submission carries answers, then labels that the registry total [Source: apps/api/src/services/survey-analytics.service.ts:668 (`COUNT(*) AS total`); the filter at apps/api/src/services/survey-analytics.service.ts:201 (`sql\`s.raw_data IS NOT NULL\``) inside `buildWhereFragments`; consumed by `getRegistrySummary` at apps/api/src/services/survey-analytics.service.ts:663-699].

Prod reality (2026-06-15): **139 distinct respondents = 76 completed + 55 data_lost + 7 no_submission + 1 pending_nin.** The current dashboard headline shows **76** and calls it "Total Respondents" — the 55 data_lost (pre-2026-05-20 hemorrhage; row exists, answers gone), 7 no_submission, and 1 pending_nin are invisible. The "76 with answers" number is a legitimate *funnel stage*, not the registry total.

**This story OWNS THE AGGREGATE.** 9-59 (MERGED on main) defines the canonical row-level atom in `apps/api/src/services/registry-data-status.ts`: `deriveDataStatus(input)` returns ONE `RegistryDataStatus` per respondent, and `hasNonEmptyRawData(rawData)` is the shared emptiness test. 12-4 calls `deriveDataStatus(...)` **per respondent** over ALL respondents (not over the submissions-with-answers subset) and tallies the results into distinct-respondent counts. **There is NO new taxonomy here** — 12-4 consumes `REGISTRY_DATA_STATUSES` and `deriveDataStatus`/`hasNonEmptyRawData` unmodified; it adds only the aggregation layer 9-59 deliberately left out (9-59 Dev Notes: "the aggregate … belongs to 12-4").

**POST-LAUNCH, NON-GATING — no FRC item depends on it; must not block the field survey or re-engagement blasts.** The operational counts are already obtainable from the unified export (9-59); this makes the correct aggregate first-class so the dashboard and every analytics surface agree.

### Dependencies, sequencing & effort (SM, 2026-06-16)

- **Dependency spine:** `9-59 (row-level data_status taxonomy + key-normalization) → 12-4 (this story: the aggregate) → { 12-5, 12-6, 12-7, 12-8 }`. 12-5/12-6/12-7/12-8 consume **THIS** `getRegistryTotals()` model, **NOT** `survey-analytics.service`'s old `raw_data IS NOT NULL` count.
- **Hard dependency (DONE, on main):** `apps/api/src/services/registry-data-status.ts` — `REGISTRY_DATA_STATUSES`, `deriveDataStatus`, `hasNonEmptyRawData` (9-59, merged commit `e6ff75e`). 12-4 imports these; do not re-derive.
- **Reference pattern to mirror (do NOT fork):** `ExportQueryService.getUnifiedExportData()` [Source: apps/api/src/services/export-query.service.ts:283-346] already performs the per-respondent consumption: a `LEFT JOIN respondents → latest NON-EMPTY submission (LATERAL)`, then `deriveDataStatus({ hasSubmissionData: hasNonEmptyRawData(row.raw_data), status, source, metadata })`. 12-4 does the same derivation but **tallies** instead of emitting rows.
- **Where it slots:** a new aggregate method (`getRegistryTotals()`) beside `getRegistrySummary()` in `survey-analytics.service.ts` (reuse the existing DB plumbing + scope/filter shape), exposed via the existing `/api/v1/analytics` router with the same RBAC.
- **Effort:** ~1 dev-day.

## Acceptance Criteria

### AC1 — `getRegistryTotals()` aggregate over ALL respondents
1. A new service method `SurveyAnalyticsService.getRegistryTotals(scope, params)` (or a standalone `registry-totals.service.ts` if cleaner — dev's call, state in File List) queries **respondents** (one row per distinct respondent, `DISTINCT ON (r.id)` / equivalent) joined to their **latest NON-EMPTY submission** (mirroring the `LEFT JOIN LATERAL` in `getUnifiedExportData`), so EVERY respondent is counted once — not only those with answers.
2. For each respondent row it calls the canonical atom `deriveDataStatus({ hasSubmissionData: hasNonEmptyRawData(row.raw_data), status: row.status, source: row.source, metadata: row.metadata })` and tallies the result. It does **NOT** redefine any status, precedence, or emptiness test — `REGISTRY_DATA_STATUSES`, `deriveDataStatus`, and `hasNonEmptyRawData` are imported from `registry-data-status.ts` and used as-is.

### AC2 — Return shape: total + per-status count map (camelCase)
1. The method returns `{ totalRespondents: number; byDataStatus: Record<RegistryDataStatus, number> }` where `totalRespondents` is the count of **distinct respondents** (139 in prod) and `byDataStatus` is keyed by EVERY member of `REGISTRY_DATA_STATUSES` (`completed`, `data_lost`, `pending_nin`, `nin_unavailable`, `imported`, `no_submission`), zero-filled for absent statuses so the shape is stable. The sum of `byDataStatus` values MUST equal `totalRespondents`.
2. The map is built by initializing all `REGISTRY_DATA_STATUSES` keys to `0` then incrementing — so a future taxonomy addition in 9-59's module flows through without a 12-4 edit (drift-proof).

### AC3 — Funnel shape for 12-6 (the 139→76 answers funnel)
1. The return value exposes the funnel `12-6` needs: at minimum `withAnswers` (= `byDataStatus.completed`, the 76) and `total` (the 139), so 12-6 can render "76 of 139 have questionnaire answers" without re-querying. State explicitly in Dev Notes that this is the funnel head; intermediate funnel stages (e.g. has-submission-but-empty) are 12-6's to layer on if needed.
2. **Per-field response rates are OUT OF SCOPE for 12-4** and belong to 12-6 (they require flattening `raw_data` per question, which is a different aggregation altitude). 12-4 exposes the distinct-respondent denominator (139) + the answers-present numerator (76) that 12-6's per-field rates divide by. State this boundary in Dev Notes.

### AC4 — Reproduces the documented prod split (139 = 76 + 55 + 7 + 1)
1. A test (mocked-DB with the three structurally-distinct respondent shapes, or assertions over a fixture) proves the tally reproduces the documented split: `completed=76, data_lost=55, no_submission=7, pending_nin=1` summing to `totalRespondents=139` (test may use scaled-down representative counts that still exercise each branch, but MUST include at least one of each: completed, data_lost, pending_nin, no_submission, and assert the sum invariant).

### AC5 — API endpoint + RBAC consistent with existing analytics
1. A new route (e.g. `GET /api/v1/analytics/registry-totals`) is added to `analytics.routes.ts` and a controller method `AnalyticsController.getRegistryTotals` mirroring the existing `getRegistrySummary` controller (parse `analyticsQuerySchema`, `getScope(req)`, `getParams(parsed)`, `res.json({ data })`).
2. RBAC + scope are UNCHANGED from the existing analytics surface — it inherits the router-level `authenticate` + `authorize(all dashboard roles)` + `resolveAnalyticsScope` chain [Source: apps/api/src/routes/analytics.routes.ts:23-32]. Response JSON is camelCase.

### AC6 — Tests incl. real-DB smoke (raw-SQL drift guard)
1. Mocked-DB unit tests for `getRegistryTotals` cover: all six statuses tallied correctly; the zero-fill of absent statuses; the `sum(byDataStatus) === totalRespondents` invariant; the AC4 documented-split reproduction; and that `deriveDataStatus`/`hasNonEmptyRawData` are the derivation path (not an inline re-derivation).
2. A **real-DB smoke** (integration test in `__tests__/`, `beforeAll`/`afterAll`) runs the new raw SQL against the live schema with at least three structurally-distinct respondent rows (one completed, one data_lost via `metadata.questionnaire_data_lost`, one no_submission) + a schema-column-existence guard, so a renamed/removed column (e.g. `respondents.status`/`source`/`metadata`, `submissions.raw_data`) fails the test instead of silently 500-ing in prod. (Project raw-SQL drift Pitfall — bitten twice: `users.role→role_id` and a hotfix.)
3. Controller/route test: `getRegistryTotals` is wired and reachable under the existing RBAC chain (mirror the existing `analytics.routes.test.ts` registration assertion).

## Tasks / Subtasks

- [ ] Task 1 — `getRegistryTotals()` aggregate method (AC: #1, #2, #3)
  - [ ] Add the method beside `getRegistrySummary` in `survey-analytics.service.ts` (or a new `registry-totals.service.ts` — record the choice in File List). Reuse the existing scope/filter shape (`buildWhereFragments`-style) but scope the FROM to **respondents** (all of them), NOT submissions-with-answers.
  - [ ] Query: `SELECT DISTINCT ON (r.id) r.status, r.source, r.metadata, answers.raw_data` with a `LEFT JOIN LATERAL` for the latest NON-EMPTY submission — copy the LATERAL shape from `getUnifiedExportData` [Source: apps/api/src/services/export-query.service.ts:321-329] (do not fork the helper; mirror the pattern). Use `SELECT`-of-named-columns (or `r.*`) introspection-safe form.
  - [ ] For each row call `deriveDataStatus({ hasSubmissionData: hasNonEmptyRawData(row.raw_data), status, source, metadata })`; increment a `Record<RegistryDataStatus, number>` initialized from `REGISTRY_DATA_STATUSES` (all zero).
  - [ ] Return `{ totalRespondents, byDataStatus, withAnswers: byDataStatus.completed }` (camelCase). Assert `sum(byDataStatus) === totalRespondents` defensively (throw `AppError` on mismatch — invariant breach = a derivation bug).
- [ ] Task 2 — API endpoint + controller (AC: #5)
  - [ ] Add `AnalyticsController.getRegistryTotals` mirroring `getRegistrySummary` [Source: apps/api/src/controllers/analytics.controller.ts:120-128].
  - [ ] Register `router.get('/registry-totals', AnalyticsController.getRegistryTotals)` in `analytics.routes.ts` beside `/registry-summary` [Source: apps/api/src/routes/analytics.routes.ts:92] — inherits the existing RBAC + scope chain (no new authorize call needed).
- [ ] Task 3 — Mocked-DB unit tests (AC: #4, #6.1)
  - [ ] Tests in `apps/api/src/services/__tests__/`: all six statuses, zero-fill, sum invariant, the documented 139=76+55+7+1 reproduction (or scaled representative with one of each branch).
- [ ] Task 4 — Real-DB smoke + route registration test (AC: #6.2, #6.3)
  - [ ] Integration test in `__tests__/` (`beforeAll`/`afterAll`, real DB) inserting ≥3 structurally-distinct respondents (completed / data_lost / no_submission), running the actual SQL, asserting the tally + a schema-column-existence guard.
  - [ ] Add the route-registration assertion to the analytics routes test (mirror existing pattern in `analytics.routes.test.ts`).
- [ ] Task 5 — Validate: targeted suites green; api `tsc --noEmit` + eslint clean; real-DB smoke green against local `oslsr_postgres`.

## Dev Notes

### Project-bible compliance (the dev MUST follow these — project-context.md)
- Errors: throw `AppError` (code/message/status), **never** raw `Error` (note the existing `getRegistrySummary` throws plain `Error` in `buildWhereFragments` for an internal-invariant guard — the new public-path failures should be `AppError`).
- Logs: Pino structured `{ event: 'analytics.registry_totals_…' }`, never `console.log`/string-concat.
- ESM: api relative imports carry `.js` (`import { deriveDataStatus, hasNonEmptyRawData, REGISTRY_DATA_STATUSES } from './registry-data-status.js'`).
- Tests: backend tests in `__tests__/`; the real-DB smoke is an integration test using `beforeAll`/`afterAll` (NOT `beforeEach`/`afterEach`).
- DB/JSON convention: snake_case DB columns (`raw_data`, `questionnaire_data_lost`) → camelCase API JSON (`totalRespondents`, `byDataStatus`, `withAnswers`).
- TanStack Query (for the eventual web consumer in 12-5/12-6, not built here): key `['analytics', 'registry-totals', ...filters]`.

### CONSUME — do NOT redefine — the taxonomy (the inversion)
- **9-59 owns the row-level atom; 12-4 owns the aggregate.** The canonical taxonomy lives ONLY in `apps/api/src/services/registry-data-status.ts`:
  - `export const REGISTRY_DATA_STATUSES = ['completed','data_lost','pending_nin','nin_unavailable','imported','no_submission'] as const;` [Source: apps/api/src/services/registry-data-status.ts:26-33]
  - `export function deriveDataStatus(input: DataStatusInput): RegistryDataStatus;` — precedence `completed > data_lost > pending_nin > nin_unavailable > imported > no_submission` [Source: apps/api/src/services/registry-data-status.ts:61-69]
  - `export function hasNonEmptyRawData(rawData: unknown): boolean;` [Source: apps/api/src/services/registry-data-status.ts:76-79]
  - `export interface DataStatusInput { hasSubmissionData: boolean; status?: string|null; source?: string|null; metadata?: { questionnaire_data_lost?: boolean }|null; }` [Source: apps/api/src/services/registry-data-status.ts:38-47]
- **DO NOT** add a SQL `CASE` for data_status, a second status list, or a re-implemented emptiness test. Derive in TS via the imported functions (exactly how `getUnifiedExportData` does it [Source: apps/api/src/services/export-query.service.ts:341-346]). Initializing `byDataStatus` from `REGISTRY_DATA_STATUSES` (not a hand-typed key list) keeps 12-4 in lockstep if 9-59 adds a status.
- **Reuse `hasNonEmptyRawData`** for the "has answers" test — this is the shared emptiness contract that keeps the export, the count, and analytics agreeing on what "completed" means.

### Why count respondents, not submissions (the fix)
`getRegistrySummary` counts `submissions WHERE raw_data IS NOT NULL` [Source: apps/api/src/services/survey-analytics.service.ts:201,668] → that's the 76, not the 139. 12-4 must FROM **respondents** (every row) and LEFT-JOIN the latest non-empty submission, so `no_submission`/`data_lost`/`pending_nin` respondents (who have no answer-bearing submission) are still counted. The `LEFT JOIN LATERAL ... raw_data IS NOT NULL AND raw_data <> '{}'::jsonb ORDER BY submitted_at DESC LIMIT 1` shape in `getUnifiedExportData` is the proven way to get "the latest submission that actually has answers" without a later empty/correction submission masking an earlier completed one [Source: apps/api/src/services/export-query.service.ts:321-329].

### Raw-SQL drift guard
The new aggregate is raw `db.execute(sql\`...\`)` — NOT type-checked, and mocked-DB tests hide renamed/removed columns. The columns it depends on: `respondents.status` [Source: apps/api/src/db/schema/respondents.ts:132], `respondents.source` [Source: apps/api/src/db/schema/respondents.ts:128], `respondents.metadata` (JSONB, reads `questionnaire_data_lost`) [Source: apps/api/src/db/schema/respondents.ts:155], and `submissions.raw_data`. The real-DB smoke (Task 4) is the mandatory guard — it has bitten the project twice (`users.role→role_id`, and a separate hotfix). Do not ship this story without it.

### Funnel & per-field response-rate boundary
- 12-4 exposes the funnel HEAD: `total` (139) and `withAnswers` (76 = `byDataStatus.completed`). That is the denominator + numerator 12-6's "X of Y have answers" needs.
- **Per-field response rates live in 12-6, NOT here.** They require per-question `raw_data` flattening (a different altitude); 12-4 stays at distinct-respondent granularity. 12-5/12-6/12-7/12-8 all call `getRegistryTotals()` for the authoritative denominator instead of `getRegistrySummary().totalRespondents`.

### Project Structure Notes
- New aggregate method beside `getRegistrySummary` in `apps/api/src/services/survey-analytics.service.ts` (or standalone `apps/api/src/services/registry-totals.service.ts` — dev's call; if standalone, it still imports the 9-59 atom and reuses the LATERAL shape, not a forked query helper).
- New controller method in `apps/api/src/controllers/analytics.controller.ts`; new route in `apps/api/src/routes/analytics.routes.ts`.
- Tests: `apps/api/src/services/__tests__/registry-totals*.test.ts` (unit) + `*registry-totals*.integration.test.ts` (real-DB smoke); route test addition in `apps/api/src/routes/__tests__/analytics.routes.test.ts`.
- No web work in this story — the dashboard consumers (12-5/12-6) wire the UI. No new deps.

### References
- [Source: apps/api/src/services/registry-data-status.ts:26-33] — `REGISTRY_DATA_STATUSES` (the canonical taxonomy — consume, do not redefine).
- [Source: apps/api/src/services/registry-data-status.ts:61-69] — `deriveDataStatus` (per-respondent precedence; the atom 12-4 tallies).
- [Source: apps/api/src/services/registry-data-status.ts:76-79] — `hasNonEmptyRawData` (shared emptiness test).
- [Source: apps/api/src/services/registry-data-status.ts:38-47] — `DataStatusInput` shape (what 12-4 passes per row).
- [Source: apps/api/src/services/survey-analytics.service.ts:663-699] — `getRegistrySummary` (the mislabel root cause + the controller/return-shape pattern to mirror).
- [Source: apps/api/src/services/survey-analytics.service.ts:201] — `sql\`s.raw_data IS NOT NULL\`` in `buildWhereFragments` (the 139→76 narrowing filter).
- [Source: apps/api/src/services/survey-analytics.service.ts:668] — `COUNT(*) AS total` over the filtered submissions (counts 76, labeled "Total Respondents").
- [Source: apps/api/src/services/export-query.service.ts:283-346] — `getUnifiedExportData` (the proven per-respondent consumption pattern: LATERAL latest-non-empty submission + `deriveDataStatus`/`hasNonEmptyRawData` per row).
- [Source: apps/api/src/services/export-query.service.ts:321-329] — the `LEFT JOIN LATERAL` latest-non-empty-submission shape to mirror.
- [Source: apps/api/src/controllers/analytics.controller.ts:120-128] — `getRegistrySummary` controller (mirror for the new endpoint).
- [Source: apps/api/src/routes/analytics.routes.ts:23-32] — router-level RBAC + scope chain (inherited unchanged).
- [Source: apps/api/src/routes/analytics.routes.ts:92] — `/registry-summary` route (add `/registry-totals` beside it).
- [Source: apps/api/src/db/schema/respondents.ts:128,132,155] — `source` / `status` / `metadata` columns the derivation reads.
- [Source: _bmad-output/implementation-artifacts/9-59-unified-registry-export.md] — Canonical Module Contract; "the aggregate … belongs to 12-4."

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List

## Change Log

| Date | Change |
|---|---|
| 2026-06-16 | Story authored (SM, Bob) via create-story workflow. Epic 12 Tier-0 / Track-A foundation: `registryTotals` aggregate model. OWNS THE AGGREGATE over 9-59's row-level `data_status` atom (consumes `deriveDataStatus`/`hasNonEmptyRawData`/`REGISTRY_DATA_STATUSES` unmodified; no new taxonomy). 6 ACs: respondent-scoped aggregate, total + per-status count map, 139→76 funnel head for 12-6, documented-split reproduction, analytics endpoint+RBAC, real-DB smoke (raw-SQL drift guard) + mocked unit tests. POST-LAUNCH, NON-GATING. Status → ready-for-dev. |
