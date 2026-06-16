# Story 12.9: Analysis gaps — gender earnings gap + LGA equity comparison + field-missingness

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Drafted 2026-06-16 via SM *create-story (Bob), Epic 12 "Dashboard System Refresh", Track A, Tier-2. This is the EXPLICIT, BOUNDED exception to Track A's "no new chart types or stat methods" non-goal: three real analysis gaps the Survey Analytics page does not yet surface, each composed from EXISTING stat/equity/chart components — no new stat library, no new charting primitive. POST-LAUNCH, NON-GATING. -->

## Story

As a **super-admin / government official reading the Survey Analytics dashboard**,
I want **three analyses the dashboard doesn't yet surface — the gender earnings gap, a cross-LGA equity comparison of a key metric, and a field-missingness view of which questionnaire fields are least-answered**,
so that **I can answer the obvious "is there a pay gap by gender?", "which LGAs are under-served?", and "which questions are we failing to capture?" questions directly, instead of eyeballing existing marginal charts that can't show them.**

## Context & Why

**POST-LAUNCH, NON-GATING — no FRC item depends on it; it must not block the field survey or the re-engagement blasts.** This is a pure analytics quality-of-life addition that lands after launch and after the rest of Epic 12's foundation.

Epic 12 ("Dashboard System Refresh") Track A's non-goal is **"no new chart types or stat methods"** — the refresh composes and reuses the ~41 existing chart components rather than inventing new ones. **Story 12-9 is the one explicit, BOUNDED exception**: there are three concrete analyses that the existing Survey Analytics page genuinely cannot show today, and each can be built from components and aggregation patterns that ALREADY exist:

1. **Gender earnings gap** — the page shows an income-band distribution (`incomeDistribution`) and an income-by-LGA bucket, but nothing partitions income *by gender*. The inferential layer already computes `partitionGroups(rows, 'gender', 'monthly_income')` and runs `runGroupComparisonTest('Monthly income by gender', …)` [Source: apps/api/src/services/survey-analytics.service.ts:1326-1332], but that group result is buried in the Insights tab's bundle and isn't surfaced as a first-class earnings-gap view. We expose it as a dedicated view reusing the existing **`GroupComparisonCard`** (median bars + significance badge).
2. **LGA equity comparison** — the Geographic tab renders an `LgaChoroplethMap` of *registration counts* only [Source: apps/web/.../pages/SurveyAnalyticsPage.tsx:206-211]; the Equity tab shows a state-level Gini in `ExtendedEquityMetrics` but no cross-LGA comparison of a chosen metric. We reuse the **same `LgaChoroplethMap`** plus the existing equity stat-card pattern to compare a key metric (e.g. income-reporting / employment proxy) across LGAs, driven by the existing `incomeByLga` aggregate.
3. **Field-missingness** — nobody surfaces "which questionnaire fields are most-missing". **This overlaps 12-6's per-field response-rate aggregate by design** — see the boundary note below — so 12-9 must **reuse 12-6's `getDataHealth`/per-field aggregate and its rendered view, not duplicate the computation**; 12-9's contribution is the "most-missing fields first" framing/sort if 12-6 has not already shipped it.

The hard rule for this story: **compose, do not rebuild. No new stat method, no new stat library, no new charting primitive.** Every analysis is wired from an existing component cited by path in the ACs.

### Dependencies, sequencing & effort (SM, 2026-06-16)

- **Dependency spine — Tier 2 (lowest urgency, phaseable):** consumes Tier-0/1 outputs. Specifically:
  - **9-59** (Tier-0 foundation) — `registry-data-status.ts` (`deriveDataStatus`, `hasNonEmptyRawData`, `REGISTRY_DATA_STATUSES`) + `registry-key-normalization.ts` (`normalizeRawDataKeys`, `canonicalGroupFor`). The field-missingness analysis MUST `normalizeRawDataKeys()` before counting per-field answers (so a variant-spelled field isn't undercounted) and MUST use the shared emptiness contract. _[Source: apps/api/src/services/registry-data-status.ts; apps/api/src/services/registry-key-normalization.ts]_
  - **12-4** `getRegistryTotals()` — the 139→76 funnel / `withAnswers` denominator used by the field-missingness rates (call it; do not re-count).
  - **12-6** Data-Health view — **OWNS the per-field response-rate aggregate** (`getDataHealth`/`getFieldResponseRates`) [Source: _bmad-output/implementation-artifacts/12-6-data-health-view.md AC3 + Task 1]. **12-9's field-missingness MUST reuse 12-6's aggregate + rendered per-field view rather than building a parallel one.** If 12-6 already presents fields sorted ascending by response rate (it specifies "most-under-answered fields surface first"), 12-9's third analysis is **satisfied by 12-6** and reduces to a cross-link/label rather than new code — record that finding at dev time. Only build new code here if 12-6's surface does not already answer "which fields are most-missing".
  - **Existing stat/equity/chart components** — `GroupComparisonCard`, `LgaChoroplethMap`, `EquityMetrics`/`ExtendedEquityMetrics`, `SignificanceBadge`, `SkeletonCard`, `ErrorBoundary`, and the lazy `enabled`-per-tab hook pattern.
- **Sequence:** AFTER 9-59 (done), 12-4, and 12-6. 12-9 is the lowest-urgency Tier-2 item and can be phased (e.g. ship the gender earnings gap + LGA equity first; let field-missingness collapse into a cross-link once 12-6 lands).
- **Reuses (do NOT fork):** the existing `partitionGroups`/`runGroupComparisonTest` inferential pipeline, the `incomeByLga` aggregate, `LgaChoroplethMap`, `GroupComparisonCard`, 12-6's `getDataHealth`, the analytics RBAC chain, and the `SurveyAnalyticsPage` tab + lazy-hook plumbing.
- **Effort:** ~1.5–2 dev-days (mostly composition + one small server selector if the gender×income result isn't already independently fetchable; potentially less if field-missingness folds into 12-6).

## Acceptance Criteria

### AC1 — Gender earnings gap (reuse GroupComparisonCard)
1. The Survey Analytics page surfaces a **gender earnings gap** analysis: monthly income partitioned by gender, rendered via the EXISTING **`GroupComparisonCard`** component [Source: apps/web/src/features/dashboard/components/charts/GroupComparisonCard.tsx] showing per-gender median income bars + the `SignificanceBadge` p-bracket — NOT a new chart.
2. The underlying group result reuses the EXISTING `SurveyAnalyticsService.partitionGroups(rows, 'gender', 'monthly_income')` + `runGroupComparisonTest('Monthly income by gender', …)` pipeline [Source: apps/api/src/services/survey-analytics.service.ts:1326, 1332] — no new stat method. It is exposed so the view can render it independently of the full Insights bundle (either via a small selector over the existing insights payload, or a thin endpoint that returns just this group comparison — record the choice in the File List).
3. The analysis respects the existing small-cell suppression / minimum-N behaviour already applied in the inferential layer (the `>= 2` group + `>= 10`-pair gating); it renders an "insufficient data" state rather than a misleading gap when N is below the existing threshold.

### AC2 — LGA equity comparison (reuse LgaChoropleth + equity components)
1. The page surfaces a **cross-LGA equity comparison** of a key metric (e.g. income-reporting rate / employment proxy per LGA), rendered by REUSING the EXISTING **`LgaChoroplethMap`** [Source: apps/web/src/features/dashboard/components/charts/LgaChoroplethMap.tsx] — passing the chosen metric per LGA via its existing `data: { lgaName; value }[]` prop (mapped through the existing `lgaDistributionToMapData` transform) — alongside the existing equity stat-card pattern (`EquityMetrics`/`ExtendedEquityMetrics`-style cards) to summarise dispersion.
2. The per-LGA metric reuses an EXISTING aggregate where possible (e.g. the `incomeByLga` bucket from `getEmployment` [Source: apps/api/src/services/survey-analytics.service.ts:452-462, 472] or the `giniCoefficient`/`lgaCount` already in `ExtendedEquityData`); no new stat library is added. `LgaChoroplethMap`'s existing `suppressionMinN` prop is used so low-N LGAs show "Insufficient data" rather than a misleading value.

### AC3 — Field-missingness view (reuse 12-6, do NOT duplicate)
1. The page surfaces a **field-missingness** view: for each questionnaire field, the share of answer-bearing respondents who actually answered it, ordered so the **most-missing fields surface first**.
2. This **reuses 12-6's per-field response-rate aggregate** (`getDataHealth`/`getFieldResponseRates`) and its rendered per-field bar/table view [Source: _bmad-output/implementation-artifacts/12-6-data-health-view.md AC3]; it MUST NOT add a parallel per-field aggregation. If 12-6 already presents fields ascending by response rate, AC3 is satisfied by a label/cross-link to that view (recorded in Completion Notes). The "missingness" framing = `1 − responseRate`, derived in the view from 12-6's existing `responseRate`, not recomputed server-side.
3. Field-key normalization is handled by 12-6's existing application of `normalizeRawDataKeys()` from 9-59 — 12-9 does not re-implement key normalization.

### AC4 — Bounded scope (no new stat library / chart type)
1. No new statistics library is added to `package.json`; `pnpm audit` surface is unchanged. The only stat methods used are the EXISTING ones (`runGroupComparisonTest` Mann-Whitney/Kruskal-Wallis, the existing Gini/response-rate math). No new charting primitive is introduced — all three analyses render through named existing components.

### AC5 — Server aggregation reuse + raw-SQL drift guard (only if new SQL is added)
1. If any new server selector/aggregation is added (e.g. a thin "gender income gap" endpoint or an LGA-metric selector), it reuses the existing scope/filter shape (`AnalyticsScope` + `buildWhereFragments`) and the existing query patterns from `survey-analytics.service.ts` — it does NOT fork a new query style.
2. If new raw SQL touching `submissions.raw_data` / `respondents` is introduced, a real-DB smoke test (raw-SQL drift guard) covers it, per the project's raw-SQL drift pattern. If the story is implemented purely by composing existing aggregates (no new SQL), this AC is satisfied by a note in Completion Notes that no new raw SQL was added.

### AC6 — UI integration, loading, RBAC
1. The three analyses slot into `SurveyAnalyticsPage` consistent with the existing tab + lazy-hook pattern (a new tab and/or sections within Equity/Geographic), each fetched via a hook that only fires when its tab is active (the existing `enabled = activeTab === '…'` pattern) [Source: apps/web/.../pages/SurveyAnalyticsPage.tsx:66-73].
2. Loading uses **shadcn `SkeletonCard`** (not spinners); errors use the existing `ErrorBoundary` + retry pattern; the page keeps the `p-6` padding convention (DashboardLayout has none).
3. Any new analytics endpoint reuses the EXISTING analytics RBAC chain — Super-Admin + Government-Official (mirroring `/insights` and `/equity`) [Source: apps/api/src/routes/analytics.routes.ts:55-67] — not a new auth scheme. The base `resolveAnalyticsScope` role-scoping is preserved.

### AC7 — Tests
1. **API** (backend `__tests__/`): if a new selector/endpoint is added, unit tests assert the gender earnings-gap result is the existing `partitionGroups('gender','monthly_income')` output (median per gender + p-bracket), the insufficient-data path below the existing threshold, the LGA-metric selector returns per-LGA values from the existing aggregate, route-registration + RBAC (SA + Official) mirroring `analytics.routes.test.ts`, and a real-DB smoke if new raw SQL was added.
2. **Web** (co-located): the gender earnings-gap renders via `GroupComparisonCard` from mocked data; the LGA equity comparison renders `LgaChoroplethMap` from a mocked per-LGA metric with `suppressionMinN` honoured; the field-missingness view renders 12-6's data sorted most-missing-first (or asserts the cross-link if folded into 12-6); each shows `SkeletonCard` while loading and the `ErrorBoundary` fallback on error, and only fires its query when its tab is active.

## Tasks / Subtasks

- [ ] Task 1 — Gender earnings gap analysis (AC: #1, #3, #5)
  - [ ] Determine the leanest reuse: prefer a small selector over the EXISTING insights payload (which already carries the `'Monthly income by gender'` group comparison) so no new SQL is needed; only if it's not independently fetchable, add a thin `getGenderEarningsGap`-style selector beside the existing inferential method, reusing `partitionGroups(rows, 'gender', 'monthly_income')` + `runGroupComparisonTest` and the `AnalyticsScope`/`buildWhereFragments` filter shape [Source: apps/api/src/services/survey-analytics.service.ts:1231, 1326, 1332]. Record the choice in the File List.
  - [ ] Front-end: render the group result with the EXISTING `GroupComparisonCard` (+ `SignificanceBadge`); respect the existing min-N / insufficient-data state.
- [ ] Task 2 — LGA equity comparison (AC: #2, #5)
  - [ ] Pick the key metric from an EXISTING aggregate (`incomeByLga` from `getEmployment`, or `giniCoefficient`/`lgaCount` from `getEquity`) — no new stat library. If a per-LGA metric selector is needed, reuse the existing `incomeByLga` query pattern + scope/filter shape.
  - [ ] Front-end: feed the per-LGA metric into the EXISTING `LgaChoroplethMap` via its `data`/`suppressionMinN` props (map through `lgaDistributionToMapData`); add the equity stat-card summary using the EXISTING `EquityMetrics`/`ExtendedEquityMetrics` card pattern.
- [ ] Task 3 — Field-missingness view (AC: #3) — REUSE 12-6, do not duplicate
  - [ ] Confirm 12-6's `getDataHealth`/per-field aggregate + rendered per-field view; derive "missingness" = `1 − responseRate` in the view from 12-6's existing data, sorted most-missing-first. If 12-6 already sorts ascending by response rate, reduce this to a cross-link/label and record that in Completion Notes (no new aggregate).
  - [ ] Do NOT re-implement key normalization or per-field counting — those live in 12-6 (which uses 9-59's `normalizeRawDataKeys`/`hasNonEmptyRawData`).
- [ ] Task 4 — UI integration + loading + RBAC (AC: #6)
  - [ ] Slot the three analyses into `SurveyAnalyticsPage` using the existing tab + lazy `enabled`-per-tab hook pattern; add hook(s) in `useAnalytics.ts` with TanStack keys shaped `[...analyticsKeys.all, '<domain>', params]`.
  - [ ] `SkeletonCard` loading (no spinners), `ErrorBoundary` + retry, `p-6` preserved. Any new endpoint uses the SA + Government-Official `authorize(...)` chain mirroring `/insights` + `/equity`; keep `resolveAnalyticsScope`.
- [ ] Task 5 — Tests (AC: #7)
  - [ ] API unit tests + route-registration/RBAC (only for any new selector/endpoint) + real-DB smoke if new raw SQL; web co-located tests for all three analyses (render via the named existing components, skeleton, error, lazy-fire).

## Dev Notes

### Project-bible compliance (project-context.md — the dev MUST follow these)
- **Errors:** throw `AppError` (code/message/status), never raw `Error`. **Logs:** Pino structured (`{ event: 'analytics.…' }`), never `console.log`.
- **Loading:** shadcn **`SkeletonCard`**, never spinners. Errors via the existing `ErrorBoundary` + retry.
- **Tests:** backend in `__tests__/`; web co-located. New raw SQL → real-DB smoke (raw-SQL drift guard) — mocked-DB tests hide renamed/removed columns (the `users.role`→`role_id` class of prod-only 500s).
- **TanStack Query keys:** `[domain, ...ids, ...filters]` — mirror the existing `analyticsKeys`/`[...analyticsKeys.all, '<name>', params]` shape in `useAnalytics.ts`.
- **Layout:** `DashboardLayout` has no padding; the page already adds `p-6` — keep it.
- **ESM:** relative imports carry `.js` on the backend.

### Reuse-don't-fork (the core constraint of this story)
- **Gender earnings gap →** `GroupComparisonCard` + `SignificanceBadge` (web) over the EXISTING `partitionGroups('gender','monthly_income')` + `runGroupComparisonTest` (api). The inferential layer ALREADY computes `'Monthly income by gender'` — prefer surfacing it over recomputing.
- **LGA equity comparison →** `LgaChoroplethMap` (already used for registration counts; just pass a different metric via `data`/`suppressionMinN`) + `EquityMetrics`/`ExtendedEquityMetrics` card pattern, over the EXISTING `incomeByLga`/`giniCoefficient` aggregates.
- **Field-missingness →** 12-6's `getDataHealth` per-field aggregate + rendered view. **Strictly reuse** — 12-6 OWNS per-field rates and it already applies 9-59's `normalizeRawDataKeys`/`hasNonEmptyRawData`. 12-9 only reframes/sorts for "most-missing first" if 12-6 hasn't.
- **No new stat method / library / chart type.** This is the bounded exception, and "bounded" means the new value is the *composition*, not new primitives.

### Boundary with 12-6 (avoid duplication)
12-6 (Data-Health view) OWNS the per-field response-rate computation and renders a per-field bar/table sorted so under-answered fields surface first. 12-9's field-missingness is **the same aggregate viewed as "missingness"** — therefore 12-9 consumes 12-6 and, in the likely case 12-6 already sorts ascending, AC3 degrades to a cross-link. Build new code for AC3 ONLY if 12-6's shipped surface does not already answer "which fields are most-missing." Record the determination in Completion Notes.

### Project Structure Notes
- API analytics live in `apps/api/src/services/survey-analytics.service.ts` (aggregations), `apps/api/src/controllers/analytics.controller.ts`, `apps/api/src/routes/analytics.routes.ts`; backend tests in `apps/api/src/**/__tests__/`.
- Web analytics live in `apps/web/src/features/dashboard/` — `pages/SurveyAnalyticsPage.tsx`, `components/charts/*`, `hooks/useAnalytics.ts`, `utils/analytics-transforms.ts`; tests co-located.
- The page already wires tabs with lazy `enabled` hooks per tab (`activeTab === '…'`) and composes shared tabs through `AnalyticsTabsContent` — slot new analyses there or as new `TabsContent` blocks following the existing `ErrorBoundary` + `SkeletonCard` pattern.

### References
- [Source: apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:57-73] — tab state + lazy `enabled`-per-tab hooks (the integration pattern).
- [Source: apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx:192-213] — Geographic tab using `LgaChoroplethMap` + `lgaDistributionToMapData` (reuse for AC2).
- [Source: apps/web/src/features/dashboard/components/charts/GroupComparisonCard.tsx:1-50] — median-bars + significance card (reuse for AC1).
- [Source: apps/web/src/features/dashboard/components/charts/LgaChoroplethMap.tsx:12-24] — `data`/`suppressionMinN`/`onLgaClick` props (reuse for AC2).
- [Source: apps/web/src/features/dashboard/components/charts/EquityMetrics.tsx:122-193] — equity stat-card pattern + skeleton/error states (reuse for AC2 summary).
- [Source: apps/web/src/features/dashboard/components/charts/ExtendedEquityMetrics.tsx:84-104] — Gini / per-LGA-count equity card (reuse/source metric for AC2).
- [Source: apps/api/src/services/survey-analytics.service.ts:1231-1333] — `partitionGroups` + `runGroupComparisonTest` incl. `'Monthly income by gender'` (reuse for AC1).
- [Source: apps/api/src/services/survey-analytics.service.ts:433-472] — `incomeDistribution` + `incomeByLga` aggregates (source metric for AC2; gap = no gender partition surfaced).
- [Source: apps/api/src/routes/analytics.routes.ts:55-67] — `/insights` + `/equity` RBAC (SA + Government-Official) to mirror for any new endpoint.
- [Source: apps/web/src/features/dashboard/hooks/useAnalytics.ts:158-170] — `[...analyticsKeys.all, '<name>', params]` query-key shape to mirror.
- [Source: _bmad-output/implementation-artifacts/12-6-data-health-view.md AC3 + Task 1] — 12-6 OWNS per-field response rates; 12-9 reuses, does not duplicate.
- [Source: apps/api/src/services/registry-data-status.ts; apps/api/src/services/registry-key-normalization.ts] — 9-59 foundation atoms (consumed via 12-6 for AC3).

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List

## Change Log

| Date | Change |
|---|---|
| 2026-06-16 | Story drafted via SM *create-story (Epic 12 Tier-2). |
