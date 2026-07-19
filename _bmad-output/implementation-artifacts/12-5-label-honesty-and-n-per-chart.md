# Story 12.5: Label honesty + N-per-chart

Status: ready-for-dev

> 🔗 **Consumes the [Registry Data-Status Taxonomy](../planning-artifacts/registry-data-status-taxonomy.md)** (anchored 2026-07-01; **12-4** is the derivation MODEL). This story RENDERS it: no surface labels a submissions-count as "Total Respondents"; deep-field charts (labour-force participation, household) carry a **"(field-collected sample, N=…)"** label so `core`/`unverified` rows are excluded and said so. _Amendment only — ACs unchanged._
>
> 🔒 **RESOLUTION R4 2026-07-04 (Awwal-approved): PULL 12-5 FORWARD to PRE-LAUNCH.** Ship label-honesty before/early in the campaign so the Ministry never sees a mislabeled "Total Respondents" during the launch window. Pair with the minimal 12-4 model shape (12-5 depends on it); the rest of Epic 12 (12-6/12-7) stays post-launch. Also render `nin_on_file` (not "verified") per R1.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-16 by Bob (SM) via the create-story workflow as Epic 12 "Dashboard System Refresh" Tier-1 (Track A: counting/legibility). POST-LAUNCH, NON-GATING. This story is LABELS + DENOMINATORS ONLY — it CONSUMES 12-4's getRegistryTotals() aggregate and 9-59's row-level data_status atom. It does NOT define data_status, does NOT build a new aggregate, and adds NO new charts or stat methods. Track A is counting/legibility, not analysis volume. Reuse the ~41 existing chart components + shadcn primitives — compose, do not rebuild. -->

## Story

As a **super-admin / government official reading the Survey Analytics dashboard and the Respondent Registry summary**,
I want **the headline count to show the honest registry total (139 distinct respondents) clearly distinguished from "submissions with answers" (76), and every chart to show its own N denominator**,
so that **I stop being told "76 = Total Respondents" (which looks broken and hides 63 real registrants), and I can trust what each chart is actually counted over.**

## Context & Why (the mislabel root cause this resolves)

The Survey Analytics page renders the registry headline stat-card labelled **"Total Respondents"** bound to `registry.totalRespondents` [Source: apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:117]. That value comes from `SurveyAnalyticsService.getRegistrySummary()`, whose `total` is `COUNT(*)` over **submissions filtered to `s.raw_data IS NOT NULL`** [Source: apps/api/src/services/survey-analytics.service.ts:668 (`COUNT(*) AS total`); filter at apps/api/src/services/survey-analytics.service.ts:201 (`sql\`s.raw_data IS NOT NULL\``) inside `buildWhereFragments`, consumed by `getRegistrySummary` at apps/api/src/services/survey-analytics.service.ts:663-699]. So the headline counts only respondents whose latest submission carries answers — and labels that subset the registry total.

Prod reality (2026-06-15): **139 distinct respondents = 76 completed + 55 data_lost + 7 no_submission + 1 pending_nin.** The dashboard shows **76** and calls it "Total Respondents." The 55 data_lost (pre-2026-05-20 hemorrhage; row exists, answers gone), 7 no_submission, and 1 pending_nin are invisible — the number looks both wrong and broken. The same divergence appears on the Respondent Registry page: the header shows `{totalItems} records` from the paginated respondent list (~139) [Source: apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx:199-201], while the `RegistrySummaryStrip` immediately below shows the SAME mislabelled "Total Respondents" = 76 from `getRegistrySummary` [Source: apps/web/src/features/dashboard/components/charts/RegistrySummaryStrip.tsx:155-162; data wired at apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx:61,241-246] — two numbers that should reconcile but don't.

Separately, **every chart on the page has its own, unshown denominator.** Each demographic/employment/household chart is counted over its own non-suppressed bucket total (e.g. `bucketTotal()` in `DemographicCharts.tsx` [Source: apps/web/src/features/dashboard/components/charts/DemographicCharts.tsx:66-69,120]) — which can differ chart-to-chart (gender answered ≠ age answered ≠ employment answered) and differs again from the 76 and the 139. A reader has no way to know what N a given chart represents.

**This story fixes labels + shows denominators. It builds NO new aggregate and NO new chart.** It CONSUMES 12-4's `getRegistryTotals()` (the authoritative 139 total + the `byDataStatus` split + the `withAnswers`=76 funnel head) and 9-59's `data_status` taxonomy. It re-labels the headline, reconciles the registry strip, and threads an N subtitle through the existing shared chart-card header.

**POST-LAUNCH, NON-GATING — no FRC item depends on it; must not block the field survey or re-engagement blasts.** The honest counts are already obtainable from the unified export (9-59) and the 12-4 aggregate; this makes the dashboard tell the truth.

### Dependencies, sequencing & effort (SM, 2026-06-16)

- **Dependency spine:** `9-59 (row-level data_status taxonomy + key-normalization, MERGED) → 12-4 (the getRegistryTotals aggregate) → { 12-5 (THIS), 12-6, 12-7, 12-8 }`. **12-5 depends on 12-4** for the honest denominator: it MUST read `getRegistryTotals().totalRespondents` (139) + `withAnswers` (76), **NOT** `getRegistrySummary().totalRespondents` (which is the 76 mislabelled as the total). If 12-4 is not yet merged when this is picked up, 12-5 is blocked on it (it has no honest 139 to display otherwise).
- **Consumes (do NOT redefine):**
  - 12-4 `SurveyAnalyticsService.getRegistryTotals(scope, params)` → `{ totalRespondents, byDataStatus: Record<RegistryDataStatus, number>, withAnswers }` and its endpoint `GET /api/v1/analytics/registry-totals` [Source: _bmad-output/implementation-artifacts/12-4-registrytotals-model.md AC1-AC3, AC5].
  - 9-59 `REGISTRY_DATA_STATUSES` (only for labelling the split, if shown) [Source: apps/api/src/services/registry-data-status.ts:26-33]. Do NOT re-derive or re-aggregate.
- **Reuses (do NOT fork):** the existing `RegistrySummaryStrip`, the existing `StatCard`/`ChartCard` shadcn-card headers, and all ~41 existing chart components. The N denominator is threaded via an **additive optional prop** on the existing chart-card header (a subtitle), not a new chart wrapper.
- **Explicitly NOT in scope:** no new chart types, no new stat methods, no per-field response-rate aggregate (that is 12-6), no `data_status` definition (that is 9-59), no aggregate query (that is 12-4). Labels + denominators only.
- **Effort:** ~1 dev-day.

## Acceptance Criteria

### AC1 — Honest headline total (139, not the mislabelled 76)
1. The Survey Analytics headline stat-card at [Source: apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:117] no longer labels the 76 as "Total Respondents." It reads the authoritative **`totalRespondents` (139)** from 12-4's `getRegistryTotals()` (consumed via a new `useRegistryTotals` TanStack Query hook, key `['analytics','registry-totals', ...filters]`), and is labelled **"Total Respondents"** showing 139.
2. The "submissions with answers" number (76, = `getRegistryTotals().withAnswers`, equivalently the existing `getRegistrySummary().totalRespondents`) is still shown but **clearly labelled as a distinct concept** — e.g. a second card "With Answers" = 76, or the headline rendered as **"76 with answers / 139 total respondents"** with explicit copy. The reader must be able to tell the two apart at a glance; "Total Respondents" must never bind to the 76 again.

### AC2 — Respondents vs submissions-with-answers distinction is explicit everywhere counts appear
1. Wherever a respondent/submission count is shown on these surfaces, copy distinguishes **"respondents"** (distinct people in the registry, 139) from **"submissions with answers"** (76). The percentage stat cards that are computed over the 76 (Employed/Female/Business Owners/consent — all from `getRegistrySummary`, denominator = the 76 [Source: apps/api/src/services/survey-analytics.service.ts:690-697]) are sub-captioned to make clear they are **% of the 76 with answers**, not % of all 139 — so a reader doesn't divide by the wrong denominator.
2. No surface presents two counts that silently disagree without explanation (the Registry page header `records` vs the summary strip total — AC3).

### AC3 — Registry summary strip reconciles with the registry count
1. On `RespondentRegistryPage`, the `RegistrySummaryStrip` "Total Respondents" stat [Source: apps/web/src/features/dashboard/components/charts/RegistrySummaryStrip.tsx:155-162] is reconciled with the page header's `{totalItems} records` [Source: apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx:199-201]: the strip's total reads the honest 139 from `getRegistryTotals` (not the 76 from `getRegistrySummary`), so the two numbers agree (both ~139, subject to the same active filters). The strip's "with answers" (76) is shown as its own labelled item, NOT as the total.
2. The strip keeps using the same active-filter `AnalyticsQueryParams` it already passes [Source: apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx:55-61] so the reconciled total still reflects the filtered view.

### AC4 — N denominator on EVERY chart
1. Every chart on the Survey Analytics tabs (Demographics, Employment, Household, Skills, Trends, Equity, Geographic, Skills-Inventory, plus any chart rendered through the shared `ChartCard`/card-header pattern) displays its own N denominator in the chart header/subtitle, with a **consistent presentation** decided once and applied uniformly — e.g. **"N = 76"** rendered under the chart title.
2. The N shown is the **denominator that chart was actually counted over** (its own non-suppressed total, e.g. `bucketTotal()` [Source: apps/web/src/features/dashboard/components/charts/DemographicCharts.tsx:66-69]), NOT a blanket 139 or a blanket 76 — because per-chart Ns legitimately differ (a chart over a question only 70 people answered shows N = 70). The chart already computes this total internally; this AC surfaces it in the header rather than computing anything new.
3. The N is threaded via an **additive, optional** prop on the existing shared chart-card header (e.g. `ChartCard` gains an optional `n?: number` / `subtitle?: string` that renders under `CardTitle` [Source: apps/web/src/features/dashboard/components/charts/DemographicCharts.tsx:97-114]). Charts that don't pass it render exactly as before (no regression). Do NOT fork or rebuild any chart.

### AC5 — Copy is plain and consistent
1. A single shared phrasing/helper is used for the respondents-vs-answers distinction and the N label (e.g. a small `formatN(n)` → `"N = 76"` and a one-line explainer string), so the wording is identical across the headline, the strip, and the charts. Tooltips/sub-captions use plain language ("counted over the 76 respondents with questionnaire answers").

### AC6 — Tests
1. Component test (`SurveyAnalyticsPage`): the headline renders **139** as the labelled "Total Respondents" and **76** as a clearly-distinct "with answers" figure; asserts the 76 is NOT bound to a "Total Respondents" label.
2. Component test (`RegistrySummaryStrip` and/or `RespondentRegistryPage`): the strip's total reconciles to the 139 honest total and shows 76 as a separate "with answers" item.
3. Component test (a representative chart via the shared header): the N denominator renders in the chart header (e.g. "N = …") for the value the chart was counted over; and a chart that omits the prop renders without an N (no regression).
4. Tests use the project's vitest + mocked-hook pattern (mock `useRegistryTotals`/`useRegistrySummary` via `vi.hoisted()`+`vi.mock()`); web tests are co-located.

## Tasks / Subtasks

- [ ] Task 1 — `useRegistryTotals` hook + API wiring (AC: #1, #3)
  - [ ] Add a `useRegistryTotals(params, enabled?)` TanStack Query hook beside `useRegistrySummary` in `apps/web/src/features/dashboard/hooks/useAnalytics.ts`, key `['analytics','registry-totals', ...filters]` (per project key convention), calling 12-4's `GET /api/v1/analytics/registry-totals` (add the fetch fn in `apps/web/src/features/dashboard/api/analytics.api.ts` mirroring the registry-summary fetcher).
  - [ ] Add the `RegistryTotals` response type to `@oslsr/types` only if 12-4 did not already export it — otherwise import it (check first; do not duplicate). Shape: `{ totalRespondents: number; byDataStatus: Record<RegistryDataStatus, number>; withAnswers: number }`.
- [ ] Task 2 — Fix the Survey Analytics headline (AC: #1, #2)
  - [ ] In `SurveyAnalyticsPage.tsx`, consume `useRegistryTotals(params)`. Bind the "Total Respondents" card [SurveyAnalyticsPage.tsx:117] to `totals.totalRespondents` (139). Add/relabel a "With Answers" card bound to `totals.withAnswers` (76) — or render the headline as "76 with answers / 139 total respondents" with the shared copy helper.
  - [ ] Sub-caption the percentage cards (Employed/Female/Business Owners/Consent — [SurveyAnalyticsPage.tsx:118-123]) to state they are % of the 76 with answers (denominator clarity), using the shared explainer.
- [ ] Task 3 — Reconcile the Registry summary strip (AC: #3)
  - [ ] Thread the honest total into `RegistrySummaryStrip`: pass `getRegistryTotals` data (via `useRegistryTotals` in `RespondentRegistryPage.tsx`) so the strip's "Total Respondents" [RegistrySummaryStrip.tsx:155-162] shows 139 and a separate item shows 76 "with answers". Keep the existing active-filter params [RespondentRegistryPage.tsx:55-61].
  - [ ] Confirm it reconciles with the header `{totalItems} records` [RespondentRegistryPage.tsx:199-201] (same filtered denominator).
- [ ] Task 4 — N-per-chart via the shared chart-card header (AC: #4, #5)
  - [ ] Add an optional `n?: number` (and/or `subtitle?: string`) prop to the shared `ChartCard` header pattern [DemographicCharts.tsx:97-114] and any sibling chart-card header used across the charts; render "N = {n}" under `CardTitle` when provided. Additive only — omitting it preserves current rendering.
  - [ ] Pass each chart's existing internal denominator (e.g. `bucketTotal(buckets)` [DemographicCharts.tsx:66-69,120]) into the header. Repeat for Employment/Household/Skills/Trends/Equity charts using each chart's own already-computed total. Do NOT compute a new aggregate; surface the one the chart already has.
  - [ ] Add the shared `formatN`/explainer helper (small util in the dashboard feature) and use it everywhere (headline, strip, charts) for identical wording.
- [ ] Task 5 — Tests (AC: #6)
  - [ ] Co-located component tests: `SurveyAnalyticsPage` headline (139 labelled Total Respondents; 76 distinct "with answers"; 76 NOT labelled Total Respondents); `RegistrySummaryStrip`/`RespondentRegistryPage` reconciliation; a representative chart renders "N = …" in its header and renders cleanly without the prop. Mock the hooks via `vi.hoisted()`+`vi.mock()`.
- [ ] Task 6 — Validate: web suite green (run from `apps/web` — `pnpm --filter @oslsr/web test`, NOT root vitest); web `tsc --noEmit` + eslint clean (0/0).

## Dev Notes

### Project-bible compliance (the dev MUST follow these — project-context.md)
- **Web only** in this story (one new API fetcher + hook that calls 12-4's already-built endpoint; no new backend aggregate, no new route). If 12-4's endpoint/type is not yet on the branch, this story is blocked on 12-4 — do not re-implement the aggregate here.
- Loading: use shadcn **skeletons, not spinners** (the strip + stat cards already use `SkeletonCard` [Source: apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:97,113; RegistrySummaryStrip.tsx:94-103]) — keep that pattern for the new totals fetch.
- TanStack Query: key `['analytics','registry-totals', ...ids, ...filters]`; default empty/`undefined`-safe data access (the codebase guards `registry?.x ?? '—'` — mirror it for `totals?.totalRespondents ?? '—'`).
- `DashboardLayout` has no padding; these pages already add `p-6` [Source: apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:83; RespondentRegistryPage.tsx:183] — do not add another wrapper.
- Tests: vitest, web tests co-located; mock deps via `vi.hoisted()`+`vi.mock()`. **Run web tests from `apps/web`** (`pnpm --filter @oslsr/web test`) — never `pnpm vitest run` from root (wrong config) [project memory].
- No new chart types/stat methods (Track A = counting/legibility). No `console.log`. Backend untouched (so AppError/Pino rules don't apply here beyond the existing API).

### CONSUME — do NOT rebuild — the honest total (the inversion the whole epic rests on)
- The 139 comes from **12-4's `getRegistryTotals()`**, which aggregates over **9-59's row-level `deriveDataStatus` atom**. 12-5 must NOT re-derive `data_status`, must NOT re-aggregate, and must NOT add another `raw_data IS NOT NULL` count. It calls the 12-4 endpoint and reads `{ totalRespondents, withAnswers, byDataStatus }`.
- The existing `getRegistrySummary().totalRespondents` is the **76** (`COUNT(*)` over `submissions WHERE raw_data IS NOT NULL` [Source: apps/api/src/services/survey-analytics.service.ts:201,668]) — it is the **"with answers" numerator, not the registry total.** The percentage cards are computed INSIDE `getRegistrySummary` over that 76 — keep them — but stop labelling the count "Total Respondents." The honest total (139) is `getRegistryTotals().totalRespondents`.
  - **⚠️ 13-33 harmonization (John/PM 2026-07-19): source the standalone "With Answers" figure (AC1.2) from `getRegistryTotals().withAnswers` — the canonical, respondent-scoped count — NOT `getRegistrySummary().totalRespondents`.** `getRegistrySummary`'s 76 is submission-scoped and can **double-count** a respondent with >1 answer-bearing submission, so the two "76"s can DRIFT. The equivalence "`withAnswers` == `getRegistrySummary().totalRespondents`" (and therefore "76 with answers / X% of 76" showing ONE consistent 76) holds **only after 12-4 repoints `getRegistrySummary` onto the canonical `registry_unified` read**. Until then, render the "With Answers" card from `getRegistryTotals().withAnswers` and treat the % cards' internal denominator as provisional. See 13-33 / 12-4 for the repoint.
- The 9-59 taxonomy (`REGISTRY_DATA_STATUSES`) is only relevant if you choose to surface the split labels; do not import/redefine the derivation in the web layer — counts come pre-aggregated from 12-4.

### Why per-chart N differs from both 139 and 76 (AC4 rationale)
Each chart is counted over the people who answered THAT question, masking suppressed (<5) buckets — `bucketTotal()` sums non-suppressed counts [Source: apps/web/src/features/dashboard/components/charts/DemographicCharts.tsx:66-69]. So gender-chart N, age-chart N, and employment-chart N can each differ from each other, from the 76 (some "completed" rows skipped a question), and from the 139. Surfacing each chart's own N is the legibility fix — do not normalize them all to one number. The denominator already exists inside each chart; AC4 only renders it in the header.

### Presentation decision (make once, apply uniformly)
- Headline: prefer **two cards** — "Total Respondents" (139) and "With Answers" (76) — over cramming both into one card, so the existing 4-/7-card grid layout [Source: apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:110-126] stays clean. Dev may instead use a single "76 with answers / 139 total respondents" headline if it reads better; either satisfies AC1 as long as 76 is never labelled "Total Respondents" alone.
- N label: **"N = {n}"** under the chart title via the additive `ChartCard` subtitle. One format, everywhere.

### Project Structure Notes
- Web changes only: `apps/web/src/features/dashboard/hooks/useAnalytics.ts` (new `useRegistryTotals`), `.../api/analytics.api.ts` (new fetcher), `.../pages/SurveyAnalyticsPage.tsx` (headline), `.../pages/RespondentRegistryPage.tsx` + `.../components/charts/RegistrySummaryStrip.tsx` (strip reconciliation), the shared chart-card header (`ChartCard` in `DemographicCharts.tsx` and sibling chart files), a small shared copy/format helper in `apps/web/src/features/dashboard/utils/`.
- Tests co-located: `apps/web/src/features/dashboard/pages/__tests__/SurveyAnalyticsPage.test.tsx`, `.../components/charts/__tests__/RegistrySummaryStrip.test.tsx` (and/or the registry page test), and a representative chart test.
- No backend files, no schema, no routes, no new deps in this story.

### References
- [Source: apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:117] — the `<StatCard label="Total Respondents" value={registry?.totalRespondents...} />` mislabel (binds the 76 to "Total Respondents"). THE headline fix.
- [Source: apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:110-126] — the registry stat-card grid (Row B) to relabel/extend.
- [Source: apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:118-123] — the % cards whose denominator is the 76 (sub-caption for denominator clarity).
- [Source: apps/api/src/services/survey-analytics.service.ts:663-699] — `getRegistrySummary` (returns the 76 as `totalRespondents`; the % cards' correct denominator).
- [Source: apps/api/src/services/survey-analytics.service.ts:201] — `sql\`s.raw_data IS NOT NULL\`` filter (the 139→76 narrowing).
- [Source: apps/api/src/services/survey-analytics.service.ts:668] — `COUNT(*) AS total` (counts 76, mislabelled).
- [Source: apps/web/src/features/dashboard/components/charts/RegistrySummaryStrip.tsx:155-162] — strip "Total Respondents" stat to reconcile to 139.
- [Source: apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx:199-201] — header `{totalItems} records` (~139) that diverges from the strip.
- [Source: apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx:55-61,241-246] — the strip's active-filter params + wiring.
- [Source: apps/web/src/features/dashboard/components/charts/DemographicCharts.tsx:97-114] — shared `ChartCard` (CardHeader/CardTitle) — the additive N-subtitle injection point.
- [Source: apps/web/src/features/dashboard/components/charts/DemographicCharts.tsx:66-69,120] — `bucketTotal()` — each chart's own denominator to surface as N.
- [Source: _bmad-output/implementation-artifacts/12-4-registrytotals-model.md] — `getRegistryTotals()` shape `{ totalRespondents, byDataStatus, withAnswers }` + endpoint `GET /api/v1/analytics/registry-totals` (the honest 139 + 76 this story consumes).
- [Source: apps/api/src/services/registry-data-status.ts:26-33] — `REGISTRY_DATA_STATUSES` (9-59 taxonomy — only for optional split labels; do not redefine).

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List

## Change Log

| Date | Change |
|---|---|
| 2026-06-16 | Story authored (SM, Bob) via create-story workflow. Epic 12 Tier-1 (Track A: counting/legibility). LABEL HONESTY + N-PER-CHART: re-label the "Total Respondents"=76 mislabel to the honest 139 from 12-4's `getRegistryTotals()`, distinguish "respondents (139)" from "submissions with answers (76)" everywhere counts appear, reconcile the Registry summary strip, and surface each chart's own N denominator via an additive subtitle on the shared chart-card header. CONSUMES 12-4 (aggregate) + 9-59 (taxonomy) — no new aggregate, no new charts/stats, web-only. 6 ACs. POST-LAUNCH, NON-GATING. Status → ready-for-dev. |
| 2026-07-19 | **13-33 harmonization (John/PM).** Flagged that the standalone "With Answers" (76) must be sourced from `getRegistryTotals().withAnswers` (canonical, respondent-scoped), NOT `getRegistrySummary().totalRespondents` (submission-scoped, can double-count) — the two "76"s can drift until 12-4 repoints `getRegistrySummary` onto the `registry_unified` read. Dev Note added. No AC/scope change; found by the post-13-33 backlog sweep. |
