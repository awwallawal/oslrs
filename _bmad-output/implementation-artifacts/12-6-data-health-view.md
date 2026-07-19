# Story 12.6: Data Health view

Status: ready-for-dev

> 🔗 **Consumes the [Registry Data-Status Taxonomy](../planning-artifacts/registry-data-status-taxonomy.md)** (anchored 2026-07-01; **12-4** is the derivation MODEL). This story RENDERS the honest breakdowns from the 12-4 model: **by-completeness** (139 → 76 `full` / 63 `partial`) + **by-verification** + **by-source**, and the **"+N in progress (drafts)"** funnel line. _Amendment only — ACs unchanged._

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-16 by Bob (SM) via the create-story workflow as Epic 12 "Dashboard System Refresh" Tier-1 (analytics-redesign / Track-A legibility). POST-LAUNCH, NON-GATING. This story CONSUMES 12-4's getRegistryTotals() aggregate + 9-59's row-level data_status taxonomy (registry-data-status.ts, MERGED on main). It does NOT define data_status and does NOT re-count the registry — it renders the 139→76 funnel + per-data_status breakdown from 12-4, and OWNS the per-field response-rate computation (which 12-4 deliberately placed here). Reuse the ~41 existing chart components + shadcn primitives — compose, don't rebuild. No new stat methods. -->

## Story

As a **super-admin / government official auditing registry completeness**,
I want **a Data-Health view that makes the registry's real shape visible — the 139→76 "answers present" funnel, the per-`data_status` breakdown, per-field response rates, and the recoverable `data_lost` cohort**,
so that **"139 rows, 76 with answers" reads as a healthy, explainable registry instead of looking broken, and I can see exactly which fields are under-answered and which respondents are recoverable for the re-engagement campaign.**

## Context & Why (the legibility root cause this resolves)

The registry is not a single clean number, and the dashboard has been hiding that. Until 12-4, `SurveyAnalyticsService.getRegistrySummary()` returned `totalRespondents` as `COUNT(*)` over **submissions filtered to `raw_data IS NOT NULL`** — the **76 with answers** — yet labeled it "Total Respondents" [Source: apps/api/src/services/survey-analytics.service.ts:201,668]. The other 63 respondents (55 `data_lost`, 7 `no_submission`, 1 `pending_nin`) were invisible, so the registry looked both wrong and unexplainable.

Prod reality (2026-06-15): **139 distinct respondents = 76 completed + 55 data_lost + 7 no_submission + 1 pending_nin.** The **55 `data_lost`** are the pre-2026-05-20 hemorrhage — the respondent row exists but the questionnaire answers are gone (`metadata.questionnaire_data_lost = true`); there is a recovery / re-engagement campaign built around re-collecting from exactly this cohort [Source: docs/runbooks/re-engagement-campaign-launch.md]. The "76 with answers" is a legitimate *funnel stage*, not a defect.

This story builds the **Data-Health view** — a new tab on the Survey Analytics page — that renders the truth: the 139→76 funnel, the per-`data_status` breakdown, **per-field response rates** (for each questionnaire field, what % of answer-bearing respondents actually answered it), and the **`data_lost` recovery cohort** as a count + drill-down so support/reporting can see who is recoverable. It is the human-facing surface over 12-4's authoritative aggregate.

**POST-LAUNCH, NON-GATING — no FRC item depends on it; must not block the field survey or re-engagement blasts.** The operational counts are already obtainable from the unified export (9-59) and the 12-4 aggregate; this makes the picture first-class and self-serve.

### Dependencies, sequencing & effort (SM, 2026-06-16)

- **Dependency spine:** `9-59 (row-level data_status taxonomy + key-normalization) → 12-4 (the registryTotals aggregate + 139→76 funnel head) → 12-6 (THIS: the Data-Health view + per-field response rates)`. **12-6 depends on 12-4.**
- **Hard dependency (must land first):** `SurveyAnalyticsService.getRegistryTotals()` from 12-4 [Source: _bmad-output/implementation-artifacts/12-4-registrytotals-model.md] returning `{ totalRespondents, byDataStatus: Record<RegistryDataStatus, number>, withAnswers }`. 12-6 renders this; it does **NOT** re-count distinct respondents and does **NOT** re-derive `data_status`. If 12-4 is not yet merged when this is picked up, surface it — do not fork a second aggregate.
- **Consumes (do NOT fork or redefine):**
  - `apps/api/src/services/registry-data-status.ts` — `REGISTRY_DATA_STATUSES`, `RegistryDataStatus` (9-59, merged `e6ff75e`). The per-status breakdown iterates `REGISTRY_DATA_STATUSES` so a future status flows through without a 12-6 edit.
  - `apps/api/src/services/registry-key-normalization.ts` — `normalizeRawDataKeys()` / `canonicalGroupFor()` — apply BEFORE counting per-field answers so cross-form-version variant keys (`dob`↔`date_of_birth`, etc.) collapse onto the canonical field and a field isn't undercounted because older submissions used a different spelling.
  - 12-4's `getRegistryTotals()` for the funnel + per-status counts (the denominator/numerator). The per-field rates layer divides by `withAnswers` (the 76).
- **OWNS (12-4 deliberately deferred this here):** the **per-field response-rate computation** — flattening `submissions.raw_data` per question is a different aggregation altitude than 12-4's distinct-respondent tally, so 12-4 exposed the 76/139 denominators and left per-field rates to 12-6 [Source: _bmad-output/implementation-artifacts/12-4-registrytotals-model.md AC3.2 + "Funnel & per-field response-rate boundary"].
- **Reuse (compose, don't rebuild) — existing chart components + shadcn primitives:**
  - `VerificationFunnelChart` is the proven horizontal-waterfall recharts `BarChart layout="vertical"` pattern to mirror for the 139→76 funnel + the per-`data_status` bars [Source: apps/web/src/features/dashboard/components/charts/VerificationFunnelChart.tsx].
  - shadcn `Card`/`CardContent`, `Tabs`/`TabsTrigger`/`TabsContent`, `SkeletonCard`, `ErrorBoundary`, and the existing `StatCard`/`ChartExportButton` are all already in `SurveyAnalyticsPage` — reuse, don't introduce new primitives [Source: apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:11-15,45-55,129-141].
- **Effort:** ~1.5–2 dev-days (one new analytics endpoint for per-field rates + the recovery-cohort list, one new tab composed from existing primitives, tests).

## Acceptance Criteria

### AC1 — Data-Health tab on the Survey Analytics page
1. A new `Data Health` tab is added to the `<TabsList>` on `SurveyAnalyticsPage` (a new `TabsContent value="data-health"`), gated by `activeTab === 'data-health'` exactly like the other lazy-fired tabs (its hooks pass `enabled={activeTab === 'data-health'}` so it only queries when selected) [Source: apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:66-73,129-141].
2. The tab wraps its content in the existing `ErrorBoundary` (with `resetKey={activeTab}`) and uses `SkeletonCard` for loading — **shadcn skeletons, not spinners** (project convention). The page already adds `p-6`; no extra page padding.

### AC2 — 139→76 funnel + per-`data_status` breakdown (rendered from 12-4)
1. The view renders the **139→76 funnel** — `total` (139, all distinct respondents) → `withAnswers` (76, `completed`) — using 12-4's `getRegistryTotals()` return value, mirroring the `VerificationFunnelChart` horizontal-bar pattern (reused/adapted component — do NOT build a new charting primitive).
2. The view renders a **per-`data_status` breakdown** (count + bar per status) over **every** member of `REGISTRY_DATA_STATUSES` (`completed`, `data_lost`, `pending_nin`, `nin_unavailable`, `imported`, `no_submission`), driven by `byDataStatus`. Iterate `REGISTRY_DATA_STATUSES` (not a hand-typed list) so a future status renders automatically; zero-count statuses still show (the shape is stable per 12-4 AC2). Each status has a short human label/legend (e.g. "Answers lost (recoverable)" for `data_lost`).
3. This view does **NOT** re-query or re-derive the counts — it consumes 12-4's `getRegistryTotals()` model (one source of truth). State this in Dev Notes.

### AC3 — Per-field response-rate computation (this story's owned aggregate)
1. A new analytics service method (e.g. `SurveyAnalyticsService.getDataHealth(scope, params)` or `getFieldResponseRates`, dev's call — record in File List) computes, for each questionnaire field in the active/selected form schema, the **response rate = (# answer-bearing respondents who answered this field) / withAnswers (the 76)**. The denominator is the answers-present cohort (a `data_lost`/`no_submission` respondent cannot answer a field, so they are correctly excluded from the per-field denominator); state the denominator definition explicitly in Dev Notes.
2. The field list + labels come from the form schema via the existing `QuestionnaireService.getFormSchemaById(formId)` → `buildColumnsFromFormSchema(schema)` (reuse — skips `note`/`geopoint`), and **`normalizeRawDataKeys(rawData)` is applied to each submission's `raw_data` before the answered/blank test** so a field spelled differently across form versions (`dob`↔`date_of_birth`) is not undercounted [Source: apps/api/src/services/export-query.service.ts:546-561; apps/api/src/services/registry-key-normalization.ts:80-101]. "Answered" uses the shared emptiness contract (a value is present and non-empty — mirror `hasNonEmptyRawData`/`flattenRawDataRow`'s emptiness test; do not invent a third one).
3. The return shape is camelCase, e.g. `{ withAnswers: number; fields: Array<{ key: string; label: string; answeredCount: number; responseRate: number }> }`, sorted (e.g. ascending response rate so the most-under-answered fields surface first). Per-field rates are displayed as a reused **bar chart / DataTable** (e.g. the `VerificationFunnelChart`-style `BarChart` or an existing table component) with a `SkeletonCard` loading state.

### AC4 — `data_lost` recovery cohort surfaced (count + drill, campaign tie-in)
1. The view surfaces the **`data_lost` recovery cohort**: the count (55 in prod, = `byDataStatus.data_lost`) prominently, labeled as recoverable, with a one-line tie to the re-engagement campaign [Source: docs/runbooks/re-engagement-campaign-launch.md].
2. A drill-down lists the `data_lost` respondents (identified by `metadata.questionnaire_data_lost = true`, derived via the same `deriveDataStatus` atom — `status='data_lost'` — NOT a private query). The list shows only fields already exposed by the existing registry RBAC surface (e.g. reference code, name, LGA, registered-at, contact) — **no new PII beyond what the existing exports/registry already expose under the same roles**; reuse the existing respondent-list shape/columns rather than minting a new wider projection. State this PII boundary in Dev Notes.
3. The drill list is served by the same Data-Health endpoint (or a thin sibling) under the existing analytics RBAC; it is paginated/bounded (do not build the full `data_lost` list unbounded in memory — reuse an existing pagination/limit pattern).

### AC5 — API endpoint + RBAC consistent with existing analytics
1. The Data-Health data is exposed via the existing `/api/v1/analytics` router with a new route (e.g. `GET /api/v1/analytics/data-health`) + a controller method mirroring `getRegistrySummary` (parse `analyticsQuerySchema`, `getScope(req)`, `getParams(parsed)`, `res.json({ data })`) [Source: apps/api/src/controllers/analytics.controller.ts:120-128].
2. RBAC + scope are **unchanged** from the existing analytics surface — it inherits the router-level `authenticate` + `authorize(...)` + `resolveAnalyticsScope` chain. The Data-Health view is a registry-completeness/PII-bearing surface, so restrict the route to **super-admin + government official** (mirror the `authorize(UserRole.SUPER_ADMIN, UserRole.GOVERNMENT_OFFICIAL)` per-route pattern used by `/insights`, `/equity`) [Source: apps/api/src/routes/analytics.routes.ts:56-67]. Response JSON is camelCase.

### AC6 — Raw-SQL drift guard + tests (API + web)
1. **If the per-field aggregate uses raw `db.execute(sql\`...\`)`**, add a **real-DB smoke** (integration test in `__tests__/`, `beforeAll`/`afterAll`) running the actual SQL against the live schema with ≥3 structurally-distinct respondents (one `completed` with a couple of answered fields, one `data_lost`, one `no_submission`) + a schema-column-existence guard, so a renamed/removed column (`submissions.raw_data`, `respondents.metadata/status/source`) fails the test instead of silently 500-ing in prod (project raw-SQL drift Pitfall — bitten twice: `users.role→role_id` and a hotfix). If the aggregate is built purely in TS over typed Drizzle reads, state that in Dev Notes and the smoke may be lighter.
2. **API unit tests** (mocked-DB or fixture): per-field response rate is computed correctly (answered/`withAnswers`), `normalizeRawDataKeys` collapses a variant-spelled field so it is not undercounted, the emptiness test matches `hasNonEmptyRawData`, the `data_lost` cohort count/list reproduces the documented `data_lost=55` against representative fixtures, and the controller/route is reachable under the SA+Official RBAC chain (mirror `analytics.routes.test.ts` registration assertion).
3. **Web tests** (co-located): the Data-Health tab renders the funnel + per-status breakdown from mocked `getRegistryTotals`, renders per-field rates from mocked Data-Health data, shows the `data_lost` recovery count + drill, shows `SkeletonCard` while loading and the `ErrorBoundary` fallback on error, and only fires its queries when the tab is active.

## Tasks / Subtasks

- [ ] Task 1 — Per-field response-rate + recovery-cohort aggregate (AC: #3, #4.2, #4.3)
  - [ ] Add `SurveyAnalyticsService.getDataHealth(scope, params)` (or `getFieldResponseRates` + a recovery-cohort query — record the choice in File List) beside `getRegistrySummary` in `survey-analytics.service.ts`. Reuse the existing scope/filter shape.
  - [ ] Resolve the form schema via `QuestionnaireService.getFormSchemaById(formId)` and the field list via `buildColumnsFromFormSchema(schema)` (reuse — do not re-walk the schema by hand) [Source: apps/api/src/services/export-query.service.ts:546-561].
  - [ ] **Read the answer-bearing rows FROM the canonical `registryUnifiedSource('ru')` (13-33) — NOT a re-mirror of `getUnifiedExportData`'s LATERAL** (13-33 hand-off, 2026-07-19). `SELECT ... FROM ${registryUnifiedSource('ru')} WHERE ru.raw_data IS NOT NULL` — `ru.raw_data` IS each respondent's latest NON-EMPTY submission (the canonical read already resolves it), so the per-field pass reads the SAME shape count-core / 12-4 / public-insights use (no third copy, no drift). For each such row, apply `normalizeRawDataKeys(ru.raw_data)` then test each field's presence with the shared emptiness contract (mirror `hasNonEmptyRawData`); tally `answeredCount` per field; `responseRate = answeredCount / withAnswers`. Pull `withAnswers`/`total`/`byDataStatus` from 12-4's `getRegistryTotals()` (call it; do not re-count).
  - [ ] `data_lost` cohort: count = `byDataStatus.data_lost`; the drill list reuses the existing registry/respondent list projection + pagination, filtered to `data_status='data_lost'` (derived via `deriveDataStatus`, not a private SQL `CASE`). Bound the list (no unbounded in-memory build).
- [ ] Task 2 — API endpoint + controller + RBAC (AC: #5)
  - [ ] Add `AnalyticsController.getDataHealth` mirroring `getRegistrySummary` [Source: apps/api/src/controllers/analytics.controller.ts:120-128].
  - [ ] Register `router.get('/data-health', authorize(UserRole.SUPER_ADMIN, UserRole.GOVERNMENT_OFFICIAL), AnalyticsController.getDataHealth)` in `analytics.routes.ts` beside `/registry-summary`, mirroring the `/insights`/`/equity` per-route SA+Official restriction [Source: apps/api/src/routes/analytics.routes.ts:56-67,92].
- [ ] Task 3 — Web: Data-Health tab + hook + api (AC: #1, #2, #3, #4.1)
  - [ ] Add `useDataHealth(params, enabled)` to `useAnalytics.ts` (key `['analytics','data-health', params]`, `staleTime: 60_000`) + `fetchDataHealth` in `analytics.api.ts`, mirroring `useRegistrySummary`/`fetchRegistrySummary` [Source: apps/web/src/features/dashboard/hooks/useAnalytics.ts:31-49]. The funnel + per-status breakdown consume the existing `useRegistrySummary`/12-4 `getRegistryTotals` data — reuse, do not add a second count fetch.
  - [ ] Add the `Data Health` `TabsTrigger` + `TabsContent value="data-health"` to `SurveyAnalyticsPage`, gated by `activeTab === 'data-health'`, wrapped in `ErrorBoundary` + `SkeletonCard` loading [Source: apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:129-141].
  - [ ] Compose the view from a funnel component (reuse/adapt `VerificationFunnelChart`'s `BarChart layout="vertical"` pattern — do NOT build a new chart lib), a per-`data_status` bar/legend over `REGISTRY_DATA_STATUSES`, a per-field response-rate bar chart / table, and the `data_lost` recovery `StatCard` + drill list [Source: apps/web/src/features/dashboard/components/charts/VerificationFunnelChart.tsx; apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:45-55].
- [ ] Task 4 — Tests (AC: #6)
  - [ ] API: unit tests for `getDataHealth` (per-field rate math; `normalizeRawDataKeys` prevents variant-key undercount; emptiness matches `hasNonEmptyRawData`; `data_lost` cohort count/list); route-registration + RBAC assertion in `analytics.routes.test.ts`.
  - [ ] API: real-DB smoke (integration test, `beforeAll`/`afterAll`) if the aggregate uses raw SQL — ≥3 structurally-distinct respondents + schema-column-existence guard.
  - [ ] Web: co-located tests for the Data-Health tab (funnel + per-status + per-field + recovery cohort render; skeleton loading; ErrorBoundary fallback; lazy-fire on tab activation).
- [ ] Task 5 — Validate: targeted API + web suites green; api `tsc --noEmit` + eslint clean; web `tsc` + lint clean; real-DB smoke green against local `oslsr_postgres` (if added). Zero regressions.

## Dev Notes

### Project-bible compliance (the dev MUST follow these — project-context.md)
- Errors: throw `AppError` (code/message/status), **never** raw `Error`. Logs: Pino structured `{ event: 'analytics.data_health_…' }`, never `console.log`/string-concat.
- Loading: **shadcn `SkeletonCard`, not spinners**; wrap the tab in the existing `ErrorBoundary`. `DashboardLayout` has no padding — the page already adds `p-6`; do not add more.
- ESM: api relative imports carry `.js` (`import { REGISTRY_DATA_STATUSES } from './registry-data-status.js'`, `import { normalizeRawDataKeys } from './registry-key-normalization.js'`).
- Tests: backend tests in `__tests__/`; web tests co-located; the real-DB smoke is an integration test using `beforeAll`/`afterAll` (NOT `beforeEach`/`afterEach`).
- DB/JSON convention: snake_case DB columns (`raw_data`, `questionnaire_data_lost`) → camelCase API JSON (`responseRate`, `answeredCount`, `withAnswers`, `byDataStatus`).
- TanStack Query key: `['analytics', 'data-health', ...filters]` (domain, then ids/filters).

### CONSUME — do NOT redefine — the taxonomy and the aggregate
- **The dependency spine is `9-59 → 12-4 → 12-6`.** 9-59 owns the row-level atom (`registry-data-status.ts`); 12-4 owns the distinct-respondent aggregate (`getRegistryTotals()`); 12-6 (this story) renders them and owns ONLY the per-field response-rate layer.
- **Do NOT re-count the registry and do NOT re-derive `data_status`.** The funnel (139→76) + per-status breakdown come from 12-4's `getRegistryTotals()` return shape `{ totalRespondents, byDataStatus, withAnswers }`. The per-status UI iterates `REGISTRY_DATA_STATUSES` (imported from 9-59) — never a hand-typed status list — so it stays in lockstep if a status is added.
- **Per-field rates are 12-6's, by design.** 12-4 explicitly placed per-field response rates here because they need per-question `raw_data` flattening — a different altitude from 12-4's distinct-respondent tally [Source: _bmad-output/implementation-artifacts/12-4-registrytotals-model.md AC3.2]. The per-field denominator is `withAnswers` (the 76), since only answer-bearing respondents can answer a field.

### Per-field response rate — definition + the variant-key trap
- **Denominator = `withAnswers` (76), the answers-present cohort.** A `data_lost`/`no_submission`/`pending_nin` respondent has no answers, so including them would deflate every field rate uniformly and mislead. State this on the chart (e.g. "of 76 respondents with answers").
- **Apply `normalizeRawDataKeys(rawData)` BEFORE the answered/blank test.** Across form versions the same concept appears under different keys (`dob`↔`date_of_birth`, `firstname`↔`first_name`↔`surname`, `_gpsLatitude`↔`gps_latitude`) [Source: apps/api/src/services/registry-key-normalization.ts:35-43]. Without normalization a field looks under-answered purely because older submissions used a different spelling. The normalization is additive (fills every variant from the first non-empty one) so the schema's question name resolves regardless of spelling [Source: apps/api/src/services/registry-key-normalization.ts:80-101].
- **One emptiness contract.** "Answered" must use the same emptiness test as the rest of the system — `hasNonEmptyRawData` for the submission-level test and the `flattenRawDataRow` per-value emptiness (null/'' → empty) for per-field [Source: apps/api/src/services/registry-data-status.ts:76-79; apps/api/src/services/export-query.service.ts:592-599]. Do not invent a third emptiness definition.
- **Field list comes from the schema, not the data.** Use `buildColumnsFromFormSchema(schema)` (skips `note`/`geopoint`) so the field set + labels are the published form's, deduped and human-labeled — exactly how the Full/Unified exports build their answer columns [Source: apps/api/src/services/export-query.service.ts:546-561]. Requires a published form (`formId`); the zero-published-forms state is unreachable in prod (registration needs a published form) — same coupling the Full/Unified export modes already accept (9-59).

### The `data_lost` recovery cohort (campaign tie-in)
- The 55 `data_lost` are the pre-2026-05-20 hemorrhage: the row exists, the answers are gone (`metadata.questionnaire_data_lost = true`), and there is an active recovery/re-engagement campaign targeting them [Source: docs/runbooks/re-engagement-campaign-launch.md]. Surfacing the count + a recoverable list here is the analytics-side companion to that runbook — it must read as "recoverable", not "lost forever".
- Identify the cohort via the canonical atom (`deriveDataStatus` → `data_lost`), NOT a private SQL `CASE` (avoids divergence from 9-59/12-4). The drill list reuses the existing registry/respondent list projection + columns + pagination under the SA+Official RBAC — **no PII beyond what the existing registry/exports already expose under the same roles** (project NDPA discipline). Bound the list.

### Reuse the existing chart components (compose, don't rebuild)
- `VerificationFunnelChart` is the proven recharts horizontal-waterfall (`BarChart layout="vertical"` + `Cell` colors + `ChartExportButton`) — mirror it for the 139→76 funnel and the per-`data_status` bars rather than introducing a new chart primitive [Source: apps/web/src/features/dashboard/components/charts/VerificationFunnelChart.tsx:36-67]. The dashboard already has ~41 chart components under `apps/web/src/features/dashboard/components/charts/`; per-field rates can reuse the same bar pattern or an existing table component. `StatCard` (already defined inline in `SurveyAnalyticsPage`) is the right primitive for the recovery-cohort count [Source: apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:45-55].
- No new stat methods — this is a counting/legibility view (Track A). Do not add inferential statistics here.

### Raw-SQL drift guard
- If the per-field aggregate flattens `raw_data` via raw `db.execute(sql\`...\`)` (like the other analytics methods), it is NOT type-checked and mocked-DB tests hide renamed/removed columns. Columns it depends on: `submissions.raw_data`, `respondents.metadata` (`questionnaire_data_lost`), `respondents.status`/`source`. The real-DB smoke (Task 4) is the mandatory guard — the project has been bitten twice by raw-SQL schema drift (`users.role→role_id`, plus a separate hotfix). If the per-field tally is instead done in TS over typed reads + the 12-4 aggregate, note that and the smoke may be lighter.

### Project Structure Notes
- New aggregate method in `apps/api/src/services/survey-analytics.service.ts` (beside `getRegistrySummary`); new controller method in `apps/api/src/controllers/analytics.controller.ts`; new route in `apps/api/src/routes/analytics.routes.ts` (SA+Official).
- Web: new tab in `apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx`; new hook in `apps/web/src/features/dashboard/hooks/useAnalytics.ts` + fetcher in `apps/web/src/features/dashboard/api/analytics.api.ts`; new Data-Health components under `apps/web/src/features/dashboard/components/charts/` (reusing/adapting existing chart components).
- Tests: `apps/api/src/services/__tests__/*data-health*.test.ts` (unit) + `*data-health*.integration.test.ts` (real-DB smoke if raw SQL); route test addition in `apps/api/src/routes/__tests__/analytics.routes.test.ts`; web tests co-located beside the page/components.
- Shared types (`getRegistryTotals` shape from 12-4, the Data-Health response shape) belong in `packages/types`; reuse 12-4's exported types — do not duplicate the registry-totals type.

### References
- [Source: _bmad-output/implementation-artifacts/12-4-registrytotals-model.md] — `getRegistryTotals()` aggregate (`{ totalRespondents, byDataStatus, withAnswers }`); the funnel head + per-field-rate boundary (12-4 AC3.2 places per-field rates HERE).
- [Source: apps/api/src/services/registry-data-status.ts:26-33] — `REGISTRY_DATA_STATUSES` (iterate for the per-status breakdown; consume, do not redefine).
- [Source: apps/api/src/services/registry-data-status.ts:61-69] — `deriveDataStatus` (the `data_lost` cohort is derived here, not via a private CASE).
- [Source: apps/api/src/services/registry-data-status.ts:76-79] — `hasNonEmptyRawData` (shared emptiness contract for "answered").
- [Source: apps/api/src/services/registry-key-normalization.ts:35-43] — `CANONICAL_KEY_GROUPS` (cross-form-version variant spellings).
- [Source: apps/api/src/services/registry-key-normalization.ts:80-101] — `normalizeRawDataKeys` (apply before per-field counting to avoid variant-key undercount).
- [Source: apps/api/src/services/export-query.service.ts:546-561] — `buildColumnsFromFormSchema` (field list + labels; skips note/geopoint — reuse for the per-field axis).
- [Source: apps/api/src/services/export-query.service.ts:592-599] — `flattenRawDataRow` per-value emptiness test to mirror.
- [Source: apps/api/src/services/registry-unified.ts — `registryUnifiedSource('ru')` (13-33): the canonical respondent-anchored read; `ru.raw_data` = latest NON-EMPTY submission. READ the per-field data FROM this, NOT a re-mirror of `getUnifiedExportData`'s LATERAL (drift). export-query.service.ts:321-329 is the equivalent shape, now canonicalized by 13-33.]
- [Source: apps/api/src/services/survey-analytics.service.ts:120-128 (controller mirror at analytics.controller.ts:120-128); :201,668] — `getRegistrySummary` pattern + the old `raw_data IS NOT NULL` mislabel root cause.
- [Source: apps/api/src/controllers/analytics.controller.ts:120-128] — `getRegistrySummary` controller (mirror for `getDataHealth`).
- [Source: apps/api/src/routes/analytics.routes.ts:56-67,92] — per-route SA+Official `authorize` pattern (`/insights`/`/equity`) + `/registry-summary` (add `/data-health` beside it).
- [Source: apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:11-15,45-73,129-141] — tab structure, `StatCard`, lazy-fire-by-active-tab, `ErrorBoundary`/`SkeletonCard` usage to mirror.
- [Source: apps/web/src/features/dashboard/components/charts/VerificationFunnelChart.tsx:36-67] — the horizontal-bar funnel pattern to reuse for 139→76 + per-status bars.
- [Source: apps/web/src/features/dashboard/hooks/useAnalytics.ts:31-49] — `analyticsKeys` + `useRegistrySummary` hook pattern to mirror for `useDataHealth`.
- [Source: docs/runbooks/re-engagement-campaign-launch.md] — the `data_lost` recovery / re-engagement campaign the cohort drill ties into.

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List

## Change Log

| Date | Change |
|---|---|
| 2026-06-16 | Story authored (SM, Bob) via create-story workflow. Epic 12 "Dashboard System Refresh" Tier-1: Data-Health view (new Survey Analytics tab). CONSUMES 12-4's `getRegistryTotals()` (139→76 funnel + per-`data_status` breakdown) and 9-59's `registry-data-status.ts` / `registry-key-normalization.ts` (do not redefine). OWNS the per-field response-rate computation (which 12-4 deferred here) + surfaces the 55 `data_lost` recovery cohort (count + drill, no new PII) tying into the re-engagement campaign. Reuses `VerificationFunnelChart` + existing shadcn/chart primitives — compose, not rebuild; no new stat methods. 6 ACs: tab+skeleton/ErrorBoundary, funnel+per-status from 12-4, per-field rates (normalize-before-count, denominator=76), recovery cohort, analytics endpoint+SA/Official RBAC, raw-SQL drift smoke + API/web tests. POST-LAUNCH, NON-GATING. Status → ready-for-dev. |
| 2026-07-04 | **13-16 parity note (Amelia):** `respondents.lgaId` canonicalized to the `lgas.code` slug everywhere (wizard + backfill of the 139 public UUID rows; prod run = operator residual). Any per-LGA slice this view adds can join `l.code = r.lga_id` safely for ALL sources. Form `lga_list` 6-value divergence residual tracked in 13-14/13-16. |
| 2026-07-19 | **13-33 harmonization (John/PM).** Re-pointed the per-field-rates read (Task 1) to aggregate FROM the canonical `registryUnifiedSource('ru')` (13-33) — `ru.raw_data` is already the latest-non-empty submission — instead of re-mirroring `getUnifiedExportData`'s LATERAL (a third copy = the drift 13-33 killed). Updated the reference accordingly. No AC change; POST-LAUNCH / NON-GATING unchanged. Found by the post-13-33 backlog sweep. |
