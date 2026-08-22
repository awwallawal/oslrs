# Story 12.6: Data Health view

Status: done

> ✅ **CLOSED ON PROD 2026-08-22 — deploy SHA `9039ab3`.** CI 32568214669, all 10 jobs green, health
> 200. **R1 discharged against the prediction table, by EXECUTING the deployed code** on the VPS, not
> by re-deriving the number: `getHousehold()` returns `businessOwnershipRate = 45.5` with
> `denominators.businessOwnership = 191` — the population moved **198 → 191 exactly as predicted**
> and the rate **held at 45.5**, which is the fix landing rather than failing to land.
>
> ⭐ **AND THE TWO SURFACES HAVE CONVERGED.** Dashboard **45.5 @ n=191**; public page **45.5 @
> n=191** — the SAME population, verified through the public API. 12-5's ledger recorded that these
> were different grains and would diverge permanently; **fixing the grain is what ended it.** They now
> agree because they read the same thing, not because they round to the same figure.

> 🔗 **Consumes the [Registry Data-Status Taxonomy](../planning-artifacts/registry-data-status-taxonomy.md)** (anchored 2026-07-01; **12-4** is the derivation MODEL). This story RENDERS the honest breakdowns from the 12-4 model: **by-completeness** (139 → 76 `full` / 63 `partial`) + **by-verification** + **by-source**, and the **"+N in progress (drafts)"** funnel line. _Amendment only — ACs unchanged._

> ⛔ **INHERITED FROM 12-5 R2 (handed over 2026-08-20 at adjudication) — READ BEFORE TASK 1.**
> **The EXISTING dashboard rates double-count ~14 people, and this story is the right place to end
> that.** 12-5 fixed the *divisor* on `survey-analytics.service` (R-E: divide by who ANSWERED, not by
> who has any answers). It did **not** fix the *grain*: `buildWhereFragments` reads
> `FROM submissions s`, one row per SUBMISSION, so anyone with more than one answer-bearing
> submission is weighted twice.
>
> **Measured on prod 2026-08-20:** `submissions` with answers = **286**; `registry_unified` with
> answers = **272**. So **~14 people are counted twice** in every submissions-anchored dashboard
> rate. That is the structural reason the dashboard (45.5% at n=198) and the public page (45.5% at
> n=191) are **not the same number** — today they round to the same figure by coincidence
> (90/198 = 45.45 vs 87/191 = 45.55) and they will diverge again the moment either population moves.
>
> ➜ **THE FIX IS THE ONE THIS STORY ALREADY USES FOR ITS OWN READS: re-point
> `survey-analytics.service`'s aggregates onto `registryUnifiedSource('ru')`.** Task 1 below already
> mandates that canonical read for the NEW per-field rates. Doing the same for the *existing* rates
> in the same story fixes the class instead of leaving a fourth surface on the old grain — and it is
> far cheaper here, with the file already open, than as a separate story later.
>
> ⚠️ **This WILL move published dashboard figures again.** Treat it as a pre-deploy residual and
> discharge it by **PREDICTION, not by movement** — reproduce the aggregate read-only against prod,
> confirm the control reproduces the CURRENT live figure exactly, then predict and compare.
> ⚠️ **And reproduce the WHOLE predicate:** `buildWhereFragments` carries **two** conditions —
> `s.raw_data IS NOT NULL` **and `s.respondent_id IS NOT NULL`**. Adjudication missed the second on
> 12-5 and predicted 45.7% where the truth was 45.5%, because prod holds **2 orphan submissions**
> (13-57's pair) and one of them answered the question. Naming the right table is not reproducing
> the predicate.
>
> **Also inherited:** 12-4 R4 — `registry_unified` is DROPPED by `db:push` on every deploy ~27 s
> before the init runner recreates it, so 13-33-L4's "no window where the view is absent" guarantee
> is false. Impact is nil today because nothing at runtime reads the physical view (the service
> composes the SQL inline). **If this story makes anything read the VIEW rather than the inline
> source, that window stops being harmless.**

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

⛔ **SUPERSEDED 2026-08-11 BY RULING R-F — THIS STORY NOW GATES THE BLAST.** ~~POST-LAUNCH, NON-GATING — no FRC item depends on it; must not block the field survey or re-engagement blasts.~~

> **R-F (Awwal, SCP §10.14):** 12-4, 12-5 and 12-6 **MUST SHIP BEFORE THE BLAST**, so the published figures are genuine when volume and attention arrive. The line struck above was written 2026-06-16, three months before the defect that changed the ruling was found.
>
> **What changed:** ruling **R-E** established that two published rates on the PUBLIC /insights page are wrong TODAY — `answersWhere = ru.raw_data IS NOT NULL` means "has ANY answers", not "answered THIS question", so people never asked a question sit in its denominator and *not asked* silently becomes *not employed*. The unemployment estimate reads ~18.4% where the answered set gives ~23.9%.
>
> ⭐ **The disparity is not what makes it urgent — the AUDIENCE is.** A number that is wrong in a quiet week is a defect; the same number in front of a radio audience, an assessor and a Ministry is a *published* error that must later be *restated*. Fixing before the blast costs a sprint; fixing after costs a correction notice.
>
> ⚠️ **Reading the struck line and deprioritising this story is the exact failure F3 named** — *"the title was doing the deprioritising"*, here done by the header. The operational counts are already obtainable from the unified export (9-59) and the 12-4 aggregate; this makes the picture first-class and self-serve.

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

- [x] Task 0 — Re-point the rate-bearing aggregates onto the respondent grain (INHERITED 12-5 R2; ruled by Awwal 2026-08-20)
  - [x] ⚖️ **THE RULING.** Presented at dev-story start with the measurement below; Awwal chose **"full re-point of all rate-bearing aggregates"** over "narrow (published rates only)" and "defer to its own story". The option text he chose named **`getRegistrySummary` + `getHousehold` + `getEmployment` + `getDemographics`** — that enumeration IS the agreed scope. `getSkillsFrequency` is added to it here because 12-5 gave it a published denominator called `respondentsAnswering` that counts SUBMISSIONS; leaving it would publish a figure whose own label is wrong. Everything NOT re-pointed is enumerated in Dev Notes with its reason — no silent narrowing.
  - [x] **⛔ THE CALLOUT'S FIX DOES NOT COMPILE AS WRITTEN, AND THAT IS THE WHOLE DIFFICULTY.** "Re-point `survey-analytics.service`'s aggregates onto `registryUnifiedSource('ru')`" reads mechanical. It is not: `buildWhereFragments` filters on **three submission columns the canonical read does not expose** — `s.submitter_id` (`personal` scope), `s.submitted_at` (`dateFrom`/`dateTo`) and `s.source`. Re-pointing therefore REDEFINES what the dashboard's filters MEAN. Decide it once, deliberately, and write it down:
    - `personal` scope → `ru.submitter_id` ("the people I registered"), NOT "the submissions I filed". Requires adding `submitter_id` to the canonical read — see the next subtask. `productivity.service.ts` already attributes respondents to staff by `r.submitter_id`, so this adopts an existing definition rather than minting one.
    - `dateFrom`/`dateTo` → `ru.created_at` (**when the person was registered**), not `s.submitted_at` (when an answer arrived). This is what 12-4's `buildRegistryFilter` already does for `/registry-totals`, so the two endpoints stop disagreeing about what a date range selects.
    - `source` → `ru.source` (respondent provenance). Vocabularies overlap on `enumerator`/`public`/`clerk`; `ru.source` additionally carries the `imported_*` values, which is the honest superset.
  - [x] Add `r.submitter_id AS submitter_id` to `REGISTRY_UNIFIED_SQL_TEXT` under its stated column governance (raw substrate, respondent column, grain-preserving) with the WHO/WHY line the governance requires; extend `RegistryUnifiedRow`; re-run the view/inline parity smoke (rule 4 — a column change takes the DROP+CREATE path).
  - [x] Export 12-4's `buildRegistryFilter` and teach it `personal` scope, then compose the analytics filter as `buildRegistryFilter(scope, params) AND ru.raw_data IS NOT NULL`. **ONE filter definition for the respondent grain, not a second one** — a private copy in `survey-analytics.service.ts` would be the drift 13-33/13-37 exist to kill, rebuilt inside the story that fixes a drift.
    - ⚠️ **`buildRegistryFilter` ignores `personal` scope, and that is a RULING, not a hole** — 12-4 wrote it down: the register is one shared object whose total is already published unauthenticated on oyoskills.com/insights, and 403-ing enumerators would contradict AC5.2. I first read it as an oversight; re-reading the comment corrected that. The analytics aggregates DID narrow for an enumerator, so the two callers genuinely differ. Express the difference as a named `PersonalScopeMode` parameter (`'unfiltered'` for `/registry-totals`, `'submitter'` for analytics) rather than letting one caller inherit the other's decision by accident.
  - [x] Re-point `getRegistrySummary`, `getHousehold`, `getEmployment`, `getDemographics`, `getSkillsFrequency`: `FROM submissions s LEFT JOIN respondents r ON r.id = s.respondent_id` → `FROM ${registryUnifiedSource('ru')}`, `s.raw_data` → `ru.raw_data`, `r.lga_id` → `ru.lga_id`. The orphan-submission class disappears by construction (the read is anchored `FROM respondents`, so `respondent_id IS NOT NULL` stops being a condition anyone can forget — it is the grain).
  - [x] **Fix the web copy the grain change invalidates.** `pctOfAnswersCaption`/`ofAnswersCaption` render "% of N **submissions** with answers" — wording 12-5 chose *because* the two populations genuinely differed, and which becomes a lie the moment they are one population. `registry-copy.ts` says so itself: "When 12-4 repoints `getRegistrySummary` onto the canonical respondent-anchored read, the two collapse into one number and this wording can lose the word 'submissions'." Pin the new wording with a test.
  - [x] ⚠️ **PRE-DEPLOY RESIDUAL — every moved figure is discharged by PREDICTION, not by movement** (12-4 R1 / 12-5 R1 discipline, §2z(d)). Reproduce each aggregate read-only against prod, confirm the control reproduces the CURRENT live figure EXACTLY, then predict, then compare after deploy. Reproduce the WHOLE predicate — 12-5's misprediction (45.7 vs the true 45.5) came from naming the right table and dropping half the WHERE.

- [x] Task 1 — Per-field response-rate + recovery-cohort aggregate (AC: #3, #4.2, #4.3)
  - [x] Add `SurveyAnalyticsService.getDataHealth(scope, params)` (or `getFieldResponseRates` + a recovery-cohort query — record the choice in File List) beside `getRegistrySummary` in `survey-analytics.service.ts`. Reuse the existing scope/filter shape.
  - [x] Resolve the form schema via `QuestionnaireService.getFormSchemaById(formId)` and the field list via `buildColumnsFromFormSchema(schema)` (reuse — do not re-walk the schema by hand) [Source: apps/api/src/services/export-query.service.ts:546-561].
  - [x] **Read the answer-bearing rows FROM the canonical `registryUnifiedSource('ru')` (13-33) — NOT a re-mirror of `getUnifiedExportData`'s LATERAL** (13-33 hand-off, 2026-07-19). `SELECT ... FROM ${registryUnifiedSource('ru')} WHERE ru.raw_data IS NOT NULL` — `ru.raw_data` IS each respondent's latest NON-EMPTY submission (the canonical read already resolves it), so the per-field pass reads the SAME shape count-core / 12-4 / public-insights use (no third copy, no drift). For each such row, apply `normalizeRawDataKeys(ru.raw_data)` then test each field's presence with the shared emptiness contract (mirror `hasNonEmptyRawData`); tally `answeredCount` per field; `responseRate = answeredCount / withAnswers`. Pull `withAnswers`/`total`/`byDataStatus` from 12-4's `getRegistryTotals()` (call it; do not re-count).
  - [x] `data_lost` cohort: count = `byDataStatus.data_lost`; the drill list reuses the existing registry/respondent list projection + pagination, filtered to `data_status='data_lost'` (derived via `deriveDataStatus`, not a private SQL `CASE`). Bound the list (no unbounded in-memory build).
- [x] Task 2 — API endpoint + controller + RBAC (AC: #5)
  - [x] Add `AnalyticsController.getDataHealth` mirroring `getRegistrySummary` [Source: apps/api/src/controllers/analytics.controller.ts:120-128].
  - [x] Register `router.get('/data-health', authorize(UserRole.SUPER_ADMIN, UserRole.GOVERNMENT_OFFICIAL), AnalyticsController.getDataHealth)` in `analytics.routes.ts` beside `/registry-summary`, mirroring the `/insights`/`/equity` per-route SA+Official restriction [Source: apps/api/src/routes/analytics.routes.ts:56-67,92].
- [x] Task 3 — Web: Data-Health tab + hook + api (AC: #1, #2, #3, #4.1)
  - [x] Add `useDataHealth(params, enabled)` to `useAnalytics.ts` (key `['analytics','data-health', params]`, `staleTime: 60_000`) + `fetchDataHealth` in `analytics.api.ts`, mirroring `useRegistrySummary`/`fetchRegistrySummary` [Source: apps/web/src/features/dashboard/hooks/useAnalytics.ts:31-49]. The funnel + per-status breakdown consume the existing `useRegistrySummary`/12-4 `getRegistryTotals` data — reuse, do not add a second count fetch.
  - [x] Add the `Data Health` `TabsTrigger` + `TabsContent value="data-health"` to `SurveyAnalyticsPage`, gated by `activeTab === 'data-health'`, wrapped in `ErrorBoundary` + `SkeletonCard` loading [Source: apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:129-141].
  - [x] Compose the view from a funnel component (reuse/adapt `VerificationFunnelChart`'s `BarChart layout="vertical"` pattern — do NOT build a new chart lib), a per-`data_status` bar/legend over `REGISTRY_DATA_STATUSES`, a per-field response-rate bar chart / table, and the `data_lost` recovery `StatCard` + drill list [Source: apps/web/src/features/dashboard/components/charts/VerificationFunnelChart.tsx; apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:45-55].
- [x] Task 4 — Tests (AC: #6)
  - [x] API: unit tests for `getDataHealth` (per-field rate math; `normalizeRawDataKeys` prevents variant-key undercount; emptiness matches `hasNonEmptyRawData`; `data_lost` cohort count/list); route-registration + RBAC assertion in `analytics.routes.test.ts`.
  - [x] API: real-DB smoke (integration test, `beforeAll`/`afterAll`) if the aggregate uses raw SQL — ≥3 structurally-distinct respondents + schema-column-existence guard.
  - [x] Web: co-located tests for the Data-Health tab (funnel + per-status + per-field + recovery cohort render; skeleton loading; ErrorBoundary fallback; lazy-fire on tab activation).
- [x] Task 5 — Validate: targeted API + web suites green; api `tsc --noEmit` + eslint clean; web `tsc` + lint clean; real-DB smoke green against local `oslsr_postgres` (if added). Zero regressions.

### Review Follow-ups (AI)

Adversarial code review, 2026-08-21 (Opus 5, `code-review` workflow, fresh context on the
uncommitted tree). 9 findings — **all raised as action items and all fixed in the same pass**, on
Awwal's instruction. Every code fix is RED-verified by mutation (each reds exactly 1).

- [x] **[AI-Review][High] H1 — no analytics Redis cache key was versioned, so six cached payloads outlive the deploy that corrected them.** The re-point changed the VALUE of `cross-tab` (300s), `skills-inventory` (600s), `insights` (3600s), `public:key-findings` (3600s), `equity` (600s), and the SHAPE of `activation-status` (`totalSubmissions` → `totalRespondents`, 300s). Deploys never flush Redis — prod is a long-lived `unless-stopped` container and the deploy chain does not touch it. Unversioned: `/insights` publishes n=284 confidence intervals for an hour AFTER the fix that narrowed them; the public page's key findings with it; and `getActivationStatus` returns a cached object whose `totalRespondents` is `undefined`, which the (correctly fail-closed) policy-brief gate then refuses — 400ing a Ministry document on a register of 272. It also means R1's discharge-on-deploy comparison would read PRE-deploy figures and could be misread as "the fix did not land". ⭐ 12-4 had already written this rule in `public-insights.service.ts:22-34` — *"BUMP THE `:vN` SUFFIX WHENEVER THE PAYLOAD SHAPE CHANGES… a corrected FIGURE would otherwise stay hidden behind the stale entry while the correction is announced"* — but it lived in a comment beside ONE literal, so it was followed for one key. **FIXED:** new `analytics-cache-keys.ts` owns `ANALYTICS_CACHE_VERSION` (`v2`) + `analyticsCacheKey()`; all seven analytics caches compose it, and the writer/reader-shared `PUBLIC_KEY_FINDINGS_CACHE_KEY` is one exported constant so a one-sided bump is impossible. Guarded by a test that fails on any unversioned `analytics:` literal in the service. [apps/api/src/services/analytics-cache-keys.ts; survey-analytics.service.ts:1198,1318,1657,1837,1858,2029,2191; public-insights.service.ts]
- [x] **[AI-Review][High] H2 — the Data Health tab rendered completely blank when `/registry-totals` failed.** The page passed `isError={dhError}` only; `useRegistryTotals` had no error surfaced. So with registry-totals failed and data-health succeeded: not loading, not error, `totals` undefined → `if (!totals || !dataHealth) return null`. No skeleton, no error, nothing to retry. On a completeness view blank space reads as an answer. The existing error test only drove `dhError` (with `totals` undefined alongside), so it passed over exactly this state — the same shape as the holes this story caught elsewhere. **FIXED:** `totalsError` propagated into the panel, and the `return null` replaced by an explicit `data-health-unavailable` card. Both covered. [SurveyAnalyticsPage.tsx:89,470; DataHealthPanel.tsx:103]
- [x] **[AI-Review][Medium] M1 — `responseRate` divides ROWS by PEOPLE, so it can exceed 100% and is then silently clipped.** Numerator = rows from `buildUnifiedAnswersWhere` (one per `respondents.id`); denominator = `getRegistryTotals().withAnswers`, counted AFTER 12-4's identity-key collapse. Two respondent rows resolving to one person give 2 and 1. Prod measures the gap at 0 today, but it is structural, and `<XAxis domain={[0, 100]}>` would render 150% as a FULL bar with a "150%" tooltip — wrong and silent together. **FIXED:** clamped for display with a `logger.warn` naming the condition; `answeredCount` stays truthful. Deliberately NOT "fixed" by dividing by `rawRows.length` — that would publish a denominator beside a `withAnswers` caption the arithmetic never used, which is ruling R-E's defect. [survey-analytics.service.ts:430-465]
- [x] **[AI-Review][Medium] M2 — `getDataHealth` mixed two readings of `personal` scope, dividing one submitter's answers by the whole register.** The numerator passed `buildRegistryFilter(..., 'submitter')`; the denominator came from `getRegistryTotals`, whose `personal` default is `'unfiltered'` (correct for `/registry-totals`, per 12-4 ruling 2). Unreachable through `/data-health` today — SA and Official both resolve to `system` scope — which is exactly why it needed catching: it would surface only if the route were widened, and then only as plausible-looking figures. It is also precisely what the named `PersonalScopeMode` existed to prevent, one call site later. **FIXED:** `getRegistryTotals` takes an explicit `personalScope` (defaulting to `'unfiltered'`, so `/registry-totals` is byte-identical) and `getDataHealth` passes `'submitter'`. [registry-totals.service.ts:507-541; survey-analytics.service.ts:965]
- [x] **[AI-Review][Medium] M3 — `RegistrySummaryStrip.test.tsx` was modified in git but absent from the File List.** The only undocumented file in the diff, and the one the Change Log's own closing lesson is about. **FIXED:** added below.
- [x] **[AI-Review][Medium] M4 — the §2ad hand-off's falsifiable check went stale a second time.** `docs/adjudication-agent-handoff.md` still read "The falsifiable check is: 46 → 22"; the shipped tree is **6**. 22 was the phase-1 count, invalidated the same day by the phase-2 re-point, and never updated — the SAME class of error the first correction was written to fix, one iteration later. ⭐ **A falsifiable number is a LIVE artefact, not a fact recorded once: re-measure it at the END of the work.** **FIXED:** corrected to 46 → 6, with the re-correction and its lesson recorded, and the count now pinned by a test so the next drift reds instead of misleading.
- [x] **[AI-Review][Low] L1 — "46 → 7" was wrong in four places; it is 6.** The story's own survivor table enumerated 6 (pipeline 1 + trends 1 + forecast 1 + enumerator-reliability 2 + doc comment 1) while three headline sentences and the R3 ledger row said 7. **FIXED** in all four, and pinned by the new enumerated-survivors test.
- [x] **[AI-Review][Low] L2 — the recovery drill's bound caption vanished exactly when it was needed.** `deriveDataStatus` drops rows AFTER `LIMIT/OFFSET`, so a page can legitimately return empty while the cohort is not — past the offset, or because the atom rejected every row on the page. The "Showing N of total" caption only rendered inside `rows.length > 0`, leaving a bare "55" with no table and no reason, which reads as a broken table. **FIXED:** an explicit empty-page line, plus a pointer to the registry export when the cohort exceeds the page. [DataHealthPanel.tsx]
- [x] **[AI-Review][Low] L3 — the Data Health tab trigger was shown to roles the route 403s.** AC5.2 narrowed `/data-health` to SA + Official for PII reasons, but the trigger was unconditional, so a supervisor clicking it read "Failed to load data health" — a permissions boundary presented as a broken feature. (Insights and Equity share this pre-existing flaw; only the new surface is corrected here.) **FIXED:** trigger, tab body and the query's `enabled` flag all gated on role. ⚠️ Presentation only — the route is the control, and `analytics.routes.test.ts` is what keeps it closed. [SurveyAnalyticsPage.tsx:98-100,276,462]

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

### Residuals ledger

| # | item | state |
|---|---|---|
| **R1** | The grain re-point moves published dashboard figures. Discharge by PREDICTION, not by movement. | ✅ **DISCHARGED ON PROD 2026-08-22, deploy `9039ab3`.** Predicted 2026-08-21 read-only with a control that reproduced the CURRENT live figures exactly; verified after deploy by **EXECUTING `getHousehold()` on the VPS through the deployed build** — `businessOwnership` n **198 → 191 exactly as predicted**, rate **held at 45.5**. ⭐ The dashboard and the public page now both read **45.5 @ n=191, the SAME population** — confirmed through the public API. |
| **R2** | 12-4 R4 — `registry_unified` is dropped by `db:push` each deploy, harmless only while nothing runtime reads the physical VIEW. | ✅ **STILL HARMLESS.** Everything this story added composes the INLINE canonical source (`registryUnifiedSource`); verified by grep — no runtime reference to `REGISTRY_UNIFIED_VIEW_NAME` / `getRegistryUnifiedViewRows` outside tests and the view-init runner. |
| **R3** | Four rate-bearing aggregates left on the submission grain at first dev pass. | ✅ **CLOSED — all four re-pointed** on Awwal's "resolve everything" instruction (2026-08-21). `FROM submissions s` 46 → 6, every survivor attributed below. |
| **R4** | ⛔ **Cached analytics payloads outlive the deploy that corrects them** — found by the adversarial code review (H1), not by the dev pass. | ✅ **CLOSED IN CODE.** All seven analytics caches now compose `ANALYTICS_CACHE_VERSION` (`v2`) from `analytics-cache-keys.ts`, so the deploy retires every stale entry instead of serving pre-fix figures for up to an hour. ⚠️ **This one is load-bearing for R1**: unversioned, the discharge-on-deploy comparison would have read PRE-deploy numbers out of Redis and could have been recorded as "the fix did not land". Guarded by a test that reds on any unversioned `analytics:` literal. |

#### R1 — the prediction (prod, read-only, 2026-08-21)

**Control validity:** the old predicate reproduced `has_business_n = 198`, `businessOwnershipRate = 45.5` —
**exactly** the figures 12-5 closed on prod (`836d1c7`). The control is therefore reproducing the live
page, not merely something plausible, which is the only thing that makes the prediction falsifiable.
Both halves of the predicate were reproduced (`raw_data IS NOT NULL` **and**
`respondent_id IS NOT NULL`) — omitting the second is what made 12-5's own prediction wrong.

| figure (dashboard) | live now (control) | predicted after deploy |
|---|---|---|
| answer-bearing population | 284 | **272** |
| `has_business` n | 198 | **191** |
| **businessOwnershipRate** | 45.5 | **45.5 — unchanged** |
| employed count | 131 | 127 |
| employedPct | 46.1 | **46.7** |
| female count | 125 | 121 |
| femalePct | 44.0 | **44.5** |
| avgAge | 32.3 | **32.2** |
| skills `respondentsAnswering` | 253 | **242** |
| inferential `totalN` (n of every CI) | 284 | **272** |
| activation gate / policy-brief gate | 284 | **272** |

⭐ **The headline is that `businessOwnershipRate` does NOT move — and that is the fix landing, not the
fix failing.** 12-5 recorded that the dashboard (45.5 @ n=198) and the public page (45.5 @ n=191)
agreed *by rounding coincidence* across different grains, and would diverge the moment either
population moved. After this they are the same number at the same n=191, computed from the same read.
The figure that was fragile is now structural.

⚠️ **12 people were being counted twice** (284 − 272). The 2026-08-20 hand-off said "~14"; the register
has moved since, so the number to compare against on deploy is **12**, not 14.

#### The claim that needed narrowing

Dev Notes and two code comments say `getRegistrySummary` and `getRegistryTotals().withAnswers` "can
still differ" after the grain fix, because 12-4 additionally collapses rows to PEOPLE by identity key.
That is structurally true — but **measured on prod 2026-08-21 the gap is ZERO**: 272 answer-bearing
rows resolve to 272 distinct identities, both on a raw key and on a format-insensitive one
(NIN → last-10-digits of phone → row id). So the two figures should be EQUAL on today's data, and a
gap appearing after deploy is a signal worth chasing, not the expected residual difference. The
guidance stands (never point one figure at the other); the expected magnitude is 0, not "small".

⚠️ The identity approximation above is SQL-side; the real key normalises through
`normaliseNigerianPhone`. It can only collapse MORE, never fewer — so 0 is a floor, and the
conclusion holds.

### The grain re-point (Task 0) — what moved, what did NOT, and why

**Moved to the canonical respondent-anchored read** (`registryUnifiedSource('ru')`) — every aggregate
that publishes a rate, a distribution, or a THRESHOLD over people. Ten in total:

| Method | Why it had to move |
|---|---|
| `getRegistrySummary` | The registry strip's percentages. |
| `getHousehold` | Business-ownership + dependency rates and their per-field bases. |
| `getEmployment` | Work-status / income / hours distributions. |
| `getDemographics` | Gender / age / education / LGA distributions. |
| `getSkillsFrequency` | 12-5 gave it a denominator literally named `respondentsAnswering` while it counted SUBMISSIONS — a figure whose own label was wrong. |
| `getCrossTab` | Every cell is a count of people; the n≥50 suppression gate divides on it. |
| `getSkillsInventory` | Four sections (allSkills / byLga / gap / diversity) plus two suppression gates. |
| `getInferentialInsights` | ⭐ **The one where grain mattered most.** `totalN` is the n of every confidence interval and chi-square. Over-counting does not merely shift a point estimate — it NARROWS the interval around it, publishing more confidence than the data supports. |
| `getExtendedEquity` | Disability gap, education alignment, Gini — all rates over people, two with Wilson intervals. |
| `getActivationStatus` | It gates the statistics above at n≥100 / n≥30. While it counted submissions, `/activation-status` and `/insights` published **different n for the same threshold** (286 vs 272). Its field was renamed `totalSubmissions` → `totalRespondents`, because keeping the old name over the new number is the exact mislabel Epic 12 exists to remove. |

`FROM submissions s` in `survey-analytics.service.ts`: **46 → 6.**

**Deliberately NOT moved — the subject genuinely IS a submission. All 6 survivors:**

| Method | Sites | Why it stays submission-grained |
|---|---|---|
| `getPipelineSummary` | 1 | Counts submissions, completion rate, avg completion time, active enumerators. A "respondent-grained completion time" is not a quantity. |
| `getTrends` | 1 | A time series of registration EVENTS per day, keyed on `s.submitted_at` — a column the canonical read does not carry, because a respondent has ONE registration date and any number of submissions. |
| `getInferentialInsights` (forecast only) | 1 | The 90-day enrolment forecast inside an otherwise re-pointed method. It needs its OWN `buildWhereFragments` filter; feeding it the unified one would reference `ru` with no `ru` in scope. Pinned by a test that asserts this ONE query keeps the retired join while every sibling is canonical. |
| `getEnumeratorReliability` | 2 | Compares enumerators BY submission. Per-enumerator-per-submission is the grain. |
| — (doc comment) | 1 | The note on `buildWhereFragments` explaining why it double-counts. |

⚠️ **Nothing is left on the old grain for want of a decision.** The four aggregates flagged as an open
residual after the first pass (`getCrossTab`, `getSkillsInventory`, `getInferentialInsights`,
`getExtendedEquity`) were all re-pointed on Awwal's 2026-08-21 "resolve everything" instruction.

⚠️ **One trap this pass hit, worth knowing before touching the SQL again:** `getSkillsInventory`'s
byLga query aliases a CTE as `r` (`FROM ranked r`) two lines below a `LEFT JOIN respondents r`. A
mechanical `r.` → `ru.` rewrite silently corrupts it. The CTE is now aliased `rk` so the two can never
be confused. A blanket regex over this file is not safe; the transformation was done per query block.

### Two things the inherited callout's one-line fix hid

1. **The canonical read carries no `submitted_at` and no `submitter_id`.** Re-pointing therefore
   REDEFINES three filters (`personal` scope, date range, `source`) rather than relocating them.
   Resolved in Task 0; `submitter_id` was added to the canonical read under its own stated column
   governance, and the three decisions are written into `buildUnifiedAnswersWhere`.
2. **`getRegistrySummary` and `getRegistryTotals().withAnswers` are not equal BY CONSTRUCTION — but on
   today's data they are equal in FACT, and the difference between those two statements matters.**
   12-5 said the two would "collapse into one number" once the grain was fixed. Structurally that is
   not quite right: `getRegistryTotals` additionally resolves rows to PEOPLE through 12-4's identity
   key (NIN → E.164 phone), so a person holding two respondent rows would be one there and two here.
   **Measured on prod 2026-08-21, that collapse removes NOTHING: 272 answer-bearing rows → 272
   distinct identities, on both a raw key and a format-insensitive one.** So the expected gap is
   **0**, not "small" — and a gap appearing after deploy is a signal to chase, not the residual
   difference being described here. ⚠️ Either way, never close a gap by pointing one figure at the
   other; that publishes a denominator the arithmetic never used.

### `getDataHealth` — decisions worth knowing before editing it

- **It counts nothing itself.** `withAnswers` and the `data_lost` cohort size come from
  `getRegistryTotals()`. The funnel and per-status bars are rendered from that same aggregate on the
  WEB side, so the endpoint deliberately does not re-serve them — one registry, one count.
- **The field axis comes from the form SCHEMA, not from the data.** A question nobody answered is the
  single most valuable row in a data-health view, and deriving the axis from observed keys would
  delete exactly that row. Field list + labels via `buildColumnsFromFormSchema` (skips
  `note`/`geopoint`); form = most recently published unless `formId` is passed.
- **"Answered" is 12-4's `hasAnswer`** (exported by this story), the TS half of the same contract
  `answeredFieldDenominator` speaks in SQL. `'0'` and `'false'` ARE answers; `''`/`[]`/`{}` are not.
  `normalizeRawDataKeys` runs BEFORE the test, or a field reads as under-answered purely because an
  older form version spelled it differently.
- **The recovery drill: SQL narrows, the ATOM decides.** AC4.2 requires `deriveDataStatus`; AC4.3
  requires a bound. Those pull opposite ways, so the query pre-filters on the atom's own INPUTS
  (`raw_data IS NULL`, the `questionnaire_data_lost` marker) — never its precedence — and
  `deriveDataStatus` then runs over that bounded page as the authority, DROPPING and logging any row
  it disagrees with. The divergence is real, not theoretical: `->>` renders a JSONB string `"true"`
  and a boolean `true` identically while the atom requires the boolean. Covered by a test.
- **PII boundary.** The drill exposes reference code, name, LGA, registered-at and phone — all already
  visible in the existing registry table and the unified export under the same roles. NIN is on the
  canonical read and is deliberately not surfaced. The route is narrowed to super-admin + government
  official for this reason, and the test asserts the EXACT key set, because a subset assertion cannot
  see a field being ADDED.

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

Opus 5 (1M context) — dev-story workflow, 2026-08-20 → 2026-08-21.

### Completion Notes List

**Scope was RULED, not assumed.** Discovery was raised before any code: naive `ready-for-dev` order
lands on 11-3, not 12-6 (the known "sprint-status has no priority field" residual from 12-4). Took
12-6 as the blast-gate successor to 12-5. Then measured the inherited 12-5 R2 and found the callout's
one-line fix does not compile as written — presented three options with the measurement; **Awwal ruled
"full re-point of all rate-bearing aggregates"**. Task 0 was added to the story to carry it.

**What actually shipped**

- **Task 0 — the grain fix.** TEN aggregates now read `registryUnifiedSource('ru')`:
  `getRegistrySummary`, `getHousehold`, `getEmployment`, `getDemographics`, `getSkillsFrequency`,
  and — after Awwal's 2026-08-21 "resolve everything" instruction — `getCrossTab`,
  `getSkillsInventory`, `getInferentialInsights`, `getExtendedEquity`, `getActivationStatus`.
  `FROM submissions s` in `survey-analytics.service.ts`: **46 → 6**, and all 6 survivors are
  attributed in Dev Notes (pipeline 1, trends 1, the inferential 90-day forecast 1,
  enumerator-reliability 2, one doc comment — and nothing left for want of a decision). Filter is
  12-4's `buildRegistryFilter`, exported and shared rather than copied, with `personal` scope added
  as an explicit `PersonalScopeMode` so `/registry-totals` keeps its documented "register is one
  shared object" behaviour and analytics keeps its narrowing. `submitter_id` added to the canonical
  read under its stated column governance.
- **Tasks 1–3 — the view.** `SurveyAnalyticsService.getDataHealth` (per-field rates + bounded
  `data_lost` drill), `GET /api/v1/analytics/data-health` restricted to SA+Official, and a
  `Data Health` tab composed from the existing `ChartCard` / recharts vertical-bar primitives.
- **Task 4 — tests.** API + web, all green. The grain guard covers all 9 re-pointed service methods,
  with threshold-opening cases so the gated queries actually execute.

**Findings worth carrying forward**

1. ⭐ **The §2ad hand-off check was inverted.** The adjudication handoff gained a falsifiable check
   mid-development — "`FROM submissions s` = 22 at hand-off; if still 22, R2 did not land". The
   baseline had been sampled from a working tree that ALREADY CONTAINED THE FIX. The committed
   baseline is 46. As written the check would have declared "R2 did not land" on precisely the state
   where it had. Corrected in the handoff doc. **A falsifiable number only beats a judgement call if
   it is measured against the COMMITTED baseline, never the tree you are standing in.**
2. ⭐ **A numeric gate that fails OPEN.** Renaming `ActivationStatusData.totalSubmissions` →
   `totalRespondents` broke a stale test mock, and the break revealed that the policy-brief guard was
   written `if (x < 100) throw`. `undefined < 100` is **false**, so a missing count let the brief
   GENERATE — a data-sufficiency gate approving a Ministry document on data it could not read. Now
   `!Number.isFinite(x) || x < 100`, RED-verified against `undefined`/`null`/`NaN`/a string. An
   unknown count is not a large count.
3. ⚠️ **A claim of mine that needed narrowing.** I wrote that `getRegistrySummary` and
   `getRegistryTotals().withAnswers` "can still differ" via 12-4's identity key. Structurally true —
   but measured on prod the gap is **0** (272 answer-bearing rows → 272 distinct identities, raw and
   format-insensitive). So they should read EQUAL today, and a gap after deploy is a signal to chase,
   not an expected artefact. Code comment and Dev Notes corrected from "small" to "zero".
4. ⚠️ **A blanket regex over this SQL is not safe.** `getSkillsInventory`'s byLga query aliases a CTE
   as `r` (`FROM ranked r`) two lines below `LEFT JOIN respondents r`. A mechanical `r.` → `ru.`
   rewrite silently corrupts it. Caught before running; CTE renamed to `rk`. The phase-2 re-point was
   done per query block for this reason.

**RED-verified by mutation (a guard nobody has watched fire is not a guard)**

| mutation | result |
|---|---|
| `getHousehold` filter back to `buildWhereFragments` | reds exactly 1 — that method's grain guard |
| `getSkillsInventory` filter back to `buildWhereFragments` | reds exactly 1 — the gated-aggregate guard |
| drop `authorize(...)` from `/data-health` | reds exactly 2 — per-route middleware + the RBAC identity check |
| make the Data-Health tab fire eagerly | reds exactly 1 — the lazy-fire assertion |
| drop zero-count statuses from the breakdown | reds exactly 1 — the AC2.2 guard |
| policy-brief gate back to a bare `x < 100` | reds exactly 1 — the fail-closed case |

**Three of my own test errors, caught and corrected rather than worked around**

- A negative assertion `not.toContain('FROM submissions s')` passed on a PREFIX of the canonical
  read's own `FROM submissions sx` LATERAL — asserting nothing. Re-pinned to the retired JOIN text.
  ⚠️ **I then made the same prefix mistake a second time**, matching the forecast query by
  `includes('submitted_at')` when the canonical read orders by `sx.submitted_at`. Re-pinned to
  `INTERVAL '90 days'`. Substring assertions against SQL in this file are a repeat trap.
- The `/data-health` RBAC test originally matched `authorize` by ARGUMENTS, so it found `/insights`'
  identical SA+Official call and would have passed with no authorize on the route at all — a textbook
  test-that-passes-over-a-hole. Re-pinned to the identity of the middleware actually mounted.
- The `it.each` grain guard drove the four gated aggregates with an empty mock, so each returned after
  its FIRST query and the re-pointed queries never ran. It would have stayed green with the whole
  phase-2 fix reverted. Added cases that open the thresholds.

**Two premises of mine that were simply wrong, corrected on measurement**

- I recorded `buildRegistryFilter` ignoring `personal` scope as a silent hole; re-reading 12-4's
  comment showed it is a documented ruling (the register is one shared, already-public object).
  `/registry-totals` behaviour is unchanged; the difference is now a named `PersonalScopeMode`.
- A test I wrote asserted `pending_nin` outranks `data_lost` in `deriveDataStatus`. It does not —
  `data_lost` comes first. The code was right and the test premise was wrong; replaced with a REAL
  divergence (JSONB string `"true"` vs boolean `true`).

✅ **PRE-DEPLOY RESIDUAL — PREDICTED 2026-08-21 (read-only against prod), not left open.** Full table
in Dev Notes → Residuals ledger. The control reproduced the CURRENT live figures EXACTLY
(`has_business` n=198, businessOwnershipRate 45.5 — the numbers 12-5 closed on `836d1c7`), with BOTH
halves of the predicate, so the prediction is falsifiable rather than merely plausible.
**Predicted after deploy: the answer-bearing population 284 → 272 (12 people were being counted
twice), employedPct 46.1 → 46.7, femalePct 44.0 → 44.5, avgAge 32.3 → 32.2, skills n 253 → 242,
inferential/activation n 284 → 272.**
⭐ **businessOwnershipRate does NOT move — it stays 45.5, and that is the fix landing rather than
failing.** 12-5 recorded that the dashboard (45.5 @ n=198) and the public page (45.5 @ n=191) agreed
by ROUNDING COINCIDENCE across two grains and would diverge the moment either population moved. They
are now the same number at the same n=191 from the same read. The figure that was fragile is
structural. **This closes on deploy by comparing against the table, not by observing movement.**
✅ 12-4 R4 stays harmless: nothing added here reads the physical `registry_unified` view (verified by
grep); every read composes the inline source.

### Senior Developer Review (AI) — 2026-08-21

**Reviewer:** adversarial `code-review` workflow (Opus 5), fresh context, on the UNCOMMITTED tree.
**Outcome:** **Changes Requested → all applied.** 9 findings (2 High, 4 Medium, 3 Low); every one
fixed in the same pass on Awwal's instruction, each code fix RED-verified by mutation.

**What the review checked rather than accepted.** The dev record's claims were re-measured, not
read: `FROM submissions s` counted against `git show HEAD:` (46) and the working tree (**6**, not the
7 claimed); the File List diffed against `git status` (one omission); the targeted suites re-run; tsc
and eslint re-run. The grain re-point itself held up — the RBAC-by-middleware-identity test, the
threshold-opening `it.each` fix and the real-DB smoke are genuine guards, and the smoke does catch
the `dob`↔`date_of_birth` undercount through real SQL.

**Where the review disagreed with the dev pass.** Three of the nine findings are records that had
drifted from the work (M3, M4, L1) — the class this project already names. The other six are code.
⭐ **The most valuable one, H1, was invisible from inside the story:** every AC passed, every test was
green, and the fix would still not have reached a reader for up to an hour after deploy, because the
figures the dashboard serves come out of Redis and no cache key was retired. **A fix that is correct
in the source and stale at the edge is the "fix that never fires" class wearing a cache.**

⚠️ **Status deliberately left at `review`, not flipped to `done`.** All ACs are implemented and all
High/Medium findings are fixed, but R1 is an OPEN pre-deploy residual by construction: it discharges
by comparing prod against the prediction table AFTER deploy. Flipping to `done` here would close a
story on a check that has not run — the [[pattern-verification-that-cannot-run-yet]] this project
refuses. **Awwal's call, at adjudication, once the deploy comparison is in.**

### File List

**API — code review fixes (2026-08-21)**
- `apps/api/src/services/analytics-cache-keys.ts` (NEW) — `ANALYTICS_CACHE_VERSION` + `analyticsCacheKey()` + `PUBLIC_KEY_FINDINGS_CACHE_KEY` (review H1)
- `apps/api/src/services/public-insights.service.ts` (M) — reads the shared versioned key-findings constant (review H1)

**API — the grain re-point (Task 0)**
- `apps/api/src/services/registry-unified.sql.ts` (M) — `submitter_id` added to the canonical read + governance entry
- `apps/api/src/services/registry-unified.ts` (M) — `submitter_id` on `RegistryUnifiedRow`
- `apps/api/src/services/registry-totals.service.ts` (M) — export `buildRegistryFilter` + `PersonalScopeMode`; export `hasAnswer`
- `apps/api/src/services/survey-analytics.service.ts` (M) — `buildUnifiedAnswersWhere`; 5 aggregates re-pointed; `getDataHealth` + `getRecoveryCohort` + `tallyFieldResponses` + `resolveDataHealthForm`

**API — the Data-Health endpoint (Tasks 1–2)**
- `apps/api/src/controllers/analytics.controller.ts` (M) — `dataHealthQuerySchema` + `getDataHealth`
- `apps/api/src/routes/analytics.routes.ts` (M) — `GET /data-health`, SA+Official
- `packages/types/src/analytics.ts` (M) — `DataHealthData`, `DataHealthField`, `DataHealthRecoveryRow`, `DataHealthRecoveryCohort`

**Web (Task 3)**
- `apps/web/src/features/dashboard/components/charts/DataHealthPanel.tsx` (NEW)
- `apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx` (M) — Data Health tab, lazy-fired
- `apps/web/src/features/dashboard/hooks/useAnalytics.ts` (M) — `useDataHealth` + key
- `apps/web/src/features/dashboard/api/analytics.api.ts` (M) — `fetchDataHealth`
- `apps/web/src/features/dashboard/utils/registry-copy.ts` (M) — captions say "respondents", not "submissions"

**Tests (Task 4)**
- `apps/api/src/services/__tests__/data-health.service.test.ts` (NEW) — 15 → **18** (review M1 clamp ×2, M2 scope alignment)
- `apps/api/src/services/__tests__/data-health-db-smoke.integration.test.ts` (NEW) — 4, real DB
- `apps/api/src/services/__tests__/survey-analytics.service.test.ts` (M) — grain guard over 9 methods + threshold-opening cases, 36 → 52 → **56** (review H1 cache-version guards ×3, L1/M4 enumerated-survivors pin)
- `apps/api/src/routes/__tests__/analytics.routes.test.ts` (M) — route + RBAC by middleware identity
- `apps/api/src/routes/__tests__/analytics-8-7.routes.test.ts` (M) — SA+GOV census 3 → 4; the policy-brief fail-closed case
- `apps/api/src/services/__tests__/insights-integration.test.ts` (M) — activation field rename; key-findings asserted through the SHARED constant, not a literal (review H1)
- `apps/web/src/features/dashboard/components/__tests__/ActivationStatusPanel.test.tsx` (M) — activation field rename
- `apps/web/src/features/dashboard/components/charts/__tests__/DataHealthPanel.test.tsx` (NEW) — 9 → **11**, incl. the AC2.2 zero-count guard + review H2 unavailable-state and L2 empty-page
- `apps/web/src/features/dashboard/pages/__tests__/SurveyAnalyticsPage.test.tsx` (M) — tab + lazy-fire, 20 → **23** (review H2 totals-failure, L3 role gating ×2)
- `apps/web/src/features/dashboard/utils/__tests__/registry-copy.test.ts` (M) — caption population
- `apps/web/src/features/dashboard/components/charts/__tests__/RegistrySummaryStrip.test.tsx` (M) — the caption rename's population word. ⚠️ **Added by the code review (M3)** — it was modified in the working tree but missing from this list, which is the file the Change Log's own closing lesson is about.

**Docs**
- `docs/adjudication-agent-handoff.md` (M) — §2ad 12-5 R2 baseline corrected 22 → 46 (see note 1)
- `_bmad-output/implementation-artifacts/12-6-data-health-view.md` (M), `sprint-status.yaml` (M)

⚠️ `.gitignore` is modified in the working tree by a PRIOR session (side-engagement ignore rule), not
by this story.

## Change Log

| Date | Change |
|---|---|
| 2026-06-16 | Story authored (SM, Bob) via create-story workflow. Epic 12 "Dashboard System Refresh" Tier-1: Data-Health view (new Survey Analytics tab). CONSUMES 12-4's `getRegistryTotals()` (139→76 funnel + per-`data_status` breakdown) and 9-59's `registry-data-status.ts` / `registry-key-normalization.ts` (do not redefine). OWNS the per-field response-rate computation (which 12-4 deferred here) + surfaces the 55 `data_lost` recovery cohort (count + drill, no new PII) tying into the re-engagement campaign. Reuses `VerificationFunnelChart` + existing shadcn/chart primitives — compose, not rebuild; no new stat methods. 6 ACs: tab+skeleton/ErrorBoundary, funnel+per-status from 12-4, per-field rates (normalize-before-count, denominator=76), recovery cohort, analytics endpoint+SA/Official RBAC, raw-SQL drift smoke + API/web tests. POST-LAUNCH, NON-GATING. Status → ready-for-dev. |
| 2026-07-04 | **13-16 parity note (Amelia):** `respondents.lgaId` canonicalized to the `lgas.code` slug everywhere (wizard + backfill of the 139 public UUID rows; prod run = operator residual). Any per-LGA slice this view adds can join `l.code = r.lga_id` safely for ALL sources. Form `lga_list` 6-value divergence residual tracked in 13-14/13-16. |
| 2026-07-19 | **13-33 harmonization (John/PM).** Re-pointed the per-field-rates read (Task 1) to aggregate FROM the canonical `registryUnifiedSource('ru')` (13-33) — `ru.raw_data` is already the latest-non-empty submission — instead of re-mirroring `getUnifiedExportData`'s LATERAL (a third copy = the drift 13-33 killed). Updated the reference accordingly. No AC change; POST-LAUNCH / NON-GATING unchanged. Found by the post-13-33 backlog sweep. |
| 2026-08-21 | **DEV COMPLETE (Opus 5, dev-story).** Status `ready-for-dev` → `in-progress` → `review`. Built the 6 ACs — Data Health tab, funnel + per-`data_status` breakdown rendered from 12-4, per-field response rates (`getDataHealth`, normalize-before-count, denominator = `withAnswers`), bounded `data_lost` recovery drill, `GET /analytics/data-health` at SA+Official, real-DB drift smoke. **PLUS Task 0, added under Awwal's ruling: the inherited 12-5 R2 grain fix.** `getRegistrySummary` / `getHousehold` / `getEmployment` / `getDemographics` / `getSkillsFrequency` re-pointed onto `registryUnifiedSource` — `FROM submissions s` 46 → 22, the remainder attributed method-by-method in Dev Notes. ⚠️ The callout's one-line fix did NOT compile as written: the canonical read carries no `submitted_at` and no `submitter_id`, so re-pointing REDEFINED three filters (`personal` scope → `ru.submitter_id`, dates → `ru.created_at`, source → `ru.source`); `submitter_id` was added to the canonical read under its column governance, and 12-4's `buildRegistryFilter` was exported and shared rather than copied. ⭐ **CORRECTED THE §2ad HAND-OFF CHECK**: its "still 22 ⇒ R2 did not land" baseline was sampled from a tree that already contained the fix, so it would have declared failure on the state where R2 HAD landed; committed baseline is 46. 🔻 **NOT re-pointed and named as an open residual for Awwal**: `getCrossTab`, `getSkillsInventory`, `getInferentialInsights`, `getExtendedEquity` — all still submission-grained, none in the option text the ruling was given against. ⛔ **PRE-DEPLOY RESIDUAL OPEN — figures move again; discharge by PREDICTION against prod, not by movement, reproducing the WHOLE predicate.** Verified: **API 4074 pass / 290 files, 0 fail** — run from `apps/api`, NOT the repo root (root has no vitest config: it skips `mockReset` AND collected only 276 files vs 290, so a root-run green is a strictly weaker check); **web 3009 pass / 273 files, 0 fail** (FULL suite from `apps/web`). ⚠️ An earlier draft of this entry quoted ~1,187 — that was the `src/features/dashboard` SUBSET, not the suite, and quoting a subset as a total is how three caption regressions in `RegistrySummaryStrip` stayed invisible for two passes, tsc api 0 / web 0, eslint 0 both, all 3 lint guards run DIRECT/uncached. RED-verified by 3 mutations; 2 of my own weak assertions found and re-pinned (a prefix match on `FROM submissions sx`, and an RBAC check that matched `/insights`' identical authorize args). Awaiting adversarial code review. |
| 2026-08-21 | **RESOLVED THE OPEN ITEMS + DISCHARGED THE RESIDUAL (Awwal: "resolve all the things pointed out and the residue before we go to review").** ① **The four remaining rate-bearing aggregates were re-pointed**: `getCrossTab`, `getSkillsInventory`, `getInferentialInsights`, `getExtendedEquity` — plus `getActivationStatus`, which was not on the original list but gates the very statistics that now count people, so it was publishing a DIFFERENT n for the same threshold (`/activation-status` 284 vs `/insights` 272); its field was renamed `totalSubmissions` → `totalRespondents` because keeping the old name over the new number is the mislabel this epic exists to remove. `FROM submissions s` **46 → 6**, and all 6 survivors are attributed in Dev Notes (pipeline, trends, the inferential 90-day forecast, enumerator-reliability ×2, one doc comment). ⭐ **The single most consequential move was `getInferentialInsights.totalN`** — it is the n of every confidence interval, so over-counting did not merely shift estimates, it NARROWED the intervals and published more confidence than the data supports. ② **R1 DISCHARGED BY PREDICTION** against prod, read-only: the control reproduced the live figures EXACTLY (`has_business` n=198, rate 45.5 — 12-5's closing numbers) using BOTH halves of the predicate; predicted 284 → 272 (**12 people double-counted**, not the 14 recorded 2026-08-20 — the register moved), employedPct 46.1 → 46.7, femalePct 44.0 → 44.5, avgAge 32.3 → 32.2, skills n 253 → 242. **businessOwnershipRate stays 45.5 — the fix landing, not failing**: dashboard and public page now agree at the same n=191 from the same read, instead of by the rounding coincidence 12-5 flagged as fragile. ③ **Narrowed an over-broad claim of my own**: I had written that `getRegistrySummary` and `getRegistryTotals().withAnswers` "can still differ" via the identity key. Structurally true, but measured on prod the gap is **0** (272 rows → 272 distinct identities, raw and format-insensitive) — so they should read EQUAL today and a gap is a signal, not an expected artefact. Code comment + Dev Notes corrected. ④ **Two guards hardened after they caught real things**: the SA+GOV route census 3 → 4 (it fired the moment `/data-health` was added), and the policy-brief threshold now **fails CLOSED** — the rename exposed that a bare `x < 100` compares `undefined < 100` as false, so a missing count would have GENERATED the brief; `Number.isFinite` added and RED-verified against 4 bad values. ⑤ Extended the grain guard from 5 to 9 methods, and added threshold-opening cases — the `it.each` form alone returned after each method's FIRST query, so it would have stayed green with every gated query still on the old grain. RED-verified by mutation throughout. |
| 2026-08-21 | **ADVERSARIAL CODE REVIEW (Opus 5, `code-review` workflow, fresh context on the uncommitted tree) — 9 findings, ALL raised as action items AND fixed in the same pass** on Awwal's instruction ("create action items and fix them all"). Full list in Tasks → Review Follow-ups (AI). ⛔ **H1 was the one that mattered: not a single analytics Redis cache key was versioned.** Six cached payloads changed value or shape in this story, deploys never flush Redis, and 12-4 had already written the rule — *"BUMP THE `:vN` SUFFIX WHENEVER THE PAYLOAD SHAPE CHANGES"* — in a comment beside ONE literal in `public-insights.service.ts`, so it was followed for exactly one key. Unversioned, `/insights` would publish n=284 confidence intervals for an hour AFTER the fix that narrowed them, the public key-findings bridge with it, and `getActivationStatus` would hand the policy-brief gate an `undefined` count — 400ing a Ministry document on a register of 272. ⭐ **And it would have corrupted this story's own R1 discharge**: the post-deploy comparison reads the dashboard, and the dashboard would have been reading Redis. Fixed by extracting `analytics-cache-keys.ts` so the version is a shared symbol rather than a comment, with a guard that reds on any unversioned `analytics:` literal. **H2:** the Data Health tab rendered *completely blank* — no skeleton, no error — when `/registry-totals` failed, because the page passed only `dhError`; the existing error test never reached that state. **M1:** per-field `responseRate` divides ROWS by identity-collapsed PEOPLE, so it can exceed 100% and would be clipped silently by `domain={[0, 100]}` — now clamped with a warn, and deliberately NOT "fixed" by dividing by `rawRows.length`, which would publish a denominator the caption never used. **M2:** `getDataHealth` paired a `'submitter'`-narrowed numerator with `getRegistryTotals`' `'unfiltered'` denominator — the exact accident the named `PersonalScopeMode` was introduced to prevent, one call site later. **M3/M4/L1:** three records disagreed with the work — `RegistrySummaryStrip.test.tsx` missing from the File List, "46 → 7" (it is 6, and the story's own table said 6), and the §2ad hand-off check still reading "46 → 22" after phase 2 invalidated it the same day. ⭐ **A falsifiable number is a LIVE artefact, not a fact recorded once** — the count is now pinned by a test, so the next drift reds instead of misleading. **L2/L3:** the drill's bound caption vanished exactly when the page was empty; the tab was offered to roles the route 403s. **Every code fix RED-verified by mutation — each reds exactly 1.** Gates re-run after the fixes: **API 4081 pass / 290 files, 0 fail** (from `apps/api`); **web 3014 pass / 273 files, 0 fail**; tsc 0 api / 0 web; eslint 0 both. ⚠️ **The web suite's FIRST full run reported 2952/271 with one red — and it was contention, proven, not assumed.** Two worker forks died with "Timeout waiting for worker to respond" (so two files never collected at all) and `FAQPage.test.tsx` — a static page untouched by this story — timed out at 10 s. The failing file passed alone, then passed again in the identical trio on the identical tree; at `--maxWorkers=4` all 273 files collect and pass. ⭐ **Worth carrying forward: a contended local full-suite run silently COLLECTS FEWER FILES.** 271 vs 273 is not a smaller pass rate, it is two files that never ran — the same shape as quoting a subset as a total ([[feedback-quote-the-suite-total-never-a-subset]]), arriving by a different route. Compare the FILE COUNT, not just the pass count. |
| 2026-08-21 | **FULL-SUITE VERIFICATION + a lesson about how I was measuring.** Final gates: **API 4074 pass / 290 files**, **web 3009 pass / 273 files**, 0 failures; tsc 0/0; eslint 0/0; all three lint guards run DIRECT (uncached). ⚠️ **The web number I had been quoting all session (~1,187) was the `src/features/dashboard` SUBSET, not the suite** — the suite is 3,011. Running the subset is what let the caption rename ("submissions with answers" → "respondents with answers") break **`RegistrySummaryStrip.test.tsx` for two passes without my seeing it**: that file lives under `components/charts/__tests__` and WAS in the subset, but my first full run had its output truncated by my own `tail -25`, so only the last of the three failures was visible and I fixed one file believing it was one failure. **Two process corrections: (a) quote the SUITE total, never a subset total, and (b) never pipe a suite run through `tail` — redirect the whole log to a file and grep it.** Same family as [[feedback-never-pipe-a-push-to-tail]]: reading a truncated tail of a long-running command hides everything above the cut. Also re-verified after the fix that no stale `submissions with answers` string and no stale `activationStatus.totalSubmissions` reference remains anywhere in `apps/`+`packages/`. |
