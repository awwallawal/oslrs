# Story 12.5: Label honesty + N-per-chart

Status: done

> ✅ **CLOSED ON PROD 2026-08-20 — deploy SHA `836d1c7`.** The dashboard now divides
> `businessOwnershipRate` by the people who ANSWERED the question: **31.8% → 45.5% at n=198**,
> verified by executing `getHousehold()` on the VPS through the deployed build. R1 discharged, R2
> ACCEPTED and handed to 12-6, R3/R4 closed at adjudication. §2a0 satisfied: a real deploy SHA and
> no OPEN or DISCHARGE-ON-DEPLOY row.
>
> ⚖️ **STATUS HISTORY — `done` → `review` (adjudication) → `done` (deploy).** The code is accepted; the STATUS was wrong.
> The story carried an explicit `⛔ PRE-DEPLOY RESIDUAL` in its own body with **no `## Residuals`
> ledger and no `## Closing verdict`**, and §2a0 does not permit `done` while an item is unresolved.
> This is the **second** consecutive story to arrive this way (12-4, 2026-08-18), which makes it the
> workflow's step 5 rather than a slip. `review` already means "code-complete, not yet on prod".
> See `## Residuals` and `## Closing verdict` below.

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

⛔ **SUPERSEDED 2026-08-11 BY RULING R-F — THIS STORY NOW GATES THE BLAST.** ~~POST-LAUNCH, NON-GATING — no FRC item depends on it; must not block the field survey or re-engagement blasts.~~

> **R-F (Awwal, SCP §10.14):** 12-4, 12-5 and 12-6 **MUST SHIP BEFORE THE BLAST**, so the published figures are genuine when volume and attention arrive. The line struck above was written 2026-06-16, three months before the defect that changed the ruling was found.
>
> **What changed:** ruling **R-E** established that two published rates on the PUBLIC /insights page are wrong TODAY — `answersWhere = ru.raw_data IS NOT NULL` means "has ANY answers", not "answered THIS question", so people never asked a question sit in its denominator and *not asked* silently becomes *not employed*. The unemployment estimate reads ~18.4% where the answered set gives ~23.9%.
>
> ⭐ **The disparity is not what makes it urgent — the AUDIENCE is.** A number that is wrong in a quiet week is a defect; the same number in front of a radio audience, an assessor and a Ministry is a *published* error that must later be *restated*. Fixing before the blast costs a sprint; fixing after costs a correction notice.
>
> ⚠️ **Reading the struck line and deprioritising this story is the exact failure F3 named** — *"the title was doing the deprioritising"*, here done by the header. The honest counts are already obtainable from the unified export (9-59) and the 12-4 aggregate; this makes the dashboard tell the truth.

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

- [x] Task 1 — `useRegistryTotals` hook + API wiring (AC: #1, #3)
  - [x] Add a `useRegistryTotals(params, enabled?)` TanStack Query hook beside `useRegistrySummary` in `apps/web/src/features/dashboard/hooks/useAnalytics.ts`, key `['analytics','registry-totals', ...filters]` (per project key convention), calling 12-4's `GET /api/v1/analytics/registry-totals` (add the fetch fn in `apps/web/src/features/dashboard/api/analytics.api.ts` mirroring the registry-summary fetcher).
  - [x] Add the `RegistryTotals` response type to `@oslsr/types` only if 12-4 did not already export it — otherwise import it (check first; do not duplicate). **Checked: 12-4 defined it ONLY inside `apps/api/src/services/registry-totals.service.ts`, so the web could not read it.** Moved the interface to `@oslsr/types` and had the API import it back, with a **compile-time drift guard** pinning the three axis unions to the runtime arrays (RED-verified: mutating the shared union fails `tsc` on the guard line).
- [x] Task 2 — Fix the Survey Analytics headline (AC: #1, #2)
  - [x] In `SurveyAnalyticsPage.tsx`, consume `useRegistryTotals(params)`. Bind the "Total Respondents" card to `totals.totalRespondents`. Added a distinct "With Answers" card bound to `totals.withAnswers` (per the 13-33 harmonization note — sourced from the totals aggregate, NOT `getRegistrySummary().totalRespondents`). Row B is now an 8-card grid.
  - [x] Sub-caption the percentage cards (Employed/Female/Avg Age/Business Owners/Consent ×2) to state the denominator they divide by, using the shared `pctOfAnswersCaption`/`ofAnswersCaption` helpers.
- [x] Task 3 — Reconcile the Registry summary strip (AC: #3)
  - [x] Threaded the honest total into `RegistrySummaryStrip` via a new `totals` prop fed by `useRegistryTotals` in `RespondentRegistryPage.tsx`; the strip's "Total Respondents" reads the aggregate and a separate "With Answers" item carries the answers subset. Existing active-filter params reused unchanged.
  - [x] Reconciles with the header `{totalItems} records` — both count registered PEOPLE under the same filters. **No fallback to `data.totalRespondents`**: when totals are unavailable the strip shows an em-dash, because falling back would silently reinstate the bug (asserted by test).
- [x] Task 4 — N-per-chart via the shared chart-card header (AC: #4, #5)
  - [x] Created a genuinely shared `ChartCard` (`components/charts/ChartCard.tsx`) with an **additive optional `n`** — there were TWO private `ChartCard`s (Demographic, Household) plus hand-rolled copies in Employment/Trends/Skills, so there was no single place for the header change to happen. Same markup, so adopting it changes no pixels; omitting `n` renders exactly as before.
  - [x] Passed each chart's own denominator: `bucketTotal()` (promoted to `chart-utils`) for all bucket charts; range-sum for Trends; `thresholds.*.currentN` for the five Skills-Inventory charts; per-metric denominators for Equity; `respondentsAnswering` for the Skills-frequency chart.
  - [x] Added the shared `registry-copy.ts` helper (`formatN`, `pctOfAnswersCaption`, `ofAnswersCaption`, `countedOverCaption`, `basedOnCaption`, and the two labels) and used it in the headline, the strip, every chart, and the public rates.
  - [x] **Publish `n` (the 2026-08-12 PM amendment):** `rateDenominators` was required on `PublicInsightsData` since 12-4 but **read by no component**. The public /insights page now prints each rate's own n beside it (GPI, youth employment, unemployment). Kept as a bare figure — the 2026-08-18 operator ruling forbids reintroducing the answer-less-remainder prose, and a regression test pins that.
- [x] Task 5 — Tests (AC: #6)
  - [x] `SurveyAnalyticsPage` headline (honest total labelled Total Respondents; answers subset distinct; the subset is NOT labelled Total Respondents; em-dash fallback), `RegistrySummaryStrip` + `RespondentRegistryPage` reconciliation, `ChartCard` N rendering incl. the no-prop no-regression case and `N = 0`, `DemographicCharts` per-chart Ns differing, `registry-copy` wording, `derive-equity-data` denominators. Hooks mocked via `vi.hoisted()`+`vi.mock()`.
- [x] Task 6 — Validate: web suite green (run from `apps/web`); web `tsc --noEmit` + eslint clean (0/0); API suite + API `tsc`/eslint clean (this story touched the backend — see Completion Notes).

### Review Follow-ups (AI) — adversarial code-review, 2026-08-20

> Raised by the `code-review` workflow against the uncommitted tree. Verified
> independently of the dev agent's self-report: web/API `tsc` clean, eslint
> clean, 119 targeted web tests + 60 API tests green, File List matches git
> exactly (39 files + the story). No task marked `[x]` was found undone; every
> item below is a gap between what an AC asked for and what actually renders.

- [x] [AI-Review][High] **AC2.2 violated on the fixed page: two counts, same words, silently disagreeing.** The "With Answers" card reads `totals.withAnswers` (respondent-scoped) while every percentage caption reads `registry.totalRespondents` (submission-scoped) — `SurveyAnalyticsPage.tsx:94-95,177-207` and `RegistrySummaryStrip.tsx:156,215-249`. Not hypothetical: `getRegistrySummary` still reads `FROM submissions s` (`survey-analytics.service.ts:678`), so the 12-4 repoint the Dev Note conditions this on has NOT happened, and 12-4's own close recorded prod at `withAnswers=271` against ~282 submissions. The page would render "With Answers · 271" beside "44.7% of 282 with answers". **Fixed** by naming the two populations with the story's own distinct vocabulary rather than by faking the arithmetic — see Review Resolution R1.
- [x] [AI-Review][Med] **`ChartCard` extraction only half-done, and Task 4 reads as though it were complete.** The Implementation Plan names `TrendsCharts` (×2) and `SkillsCharts` among the hand-rolled headers the extraction exists to absorb; both kept their hand-rolled markup and hand-rolled N. The `chart-n` `<p>` was duplicated 12× across 8 files. [`TrendsCharts.tsx:145-149,225-231`, `SkillsCharts.tsx:107-117`]
- [x] [AI-Review][Med] **The public-page `n` has no test — delete all three call sites and every test still passes.** `PublicInsightsPage.test.tsx` untouched; `PublicEmploymentSection` has no test file. `registry-copy.test.ts` exercises `basedOnCaption` as a pure function, which proves nothing about whether a component renders it. [[pattern-test-that-passes-over-a-hole]]
- [x] [AI-Review][Med] **Unguarded `data.rateDenominators` and no zero-guard on a published figure.** `PublicInsightsPage.tsx:107,116` dereferences without optional chaining, and `public-insights.service.ts:344-347` defaults each denominator to `Number(… ?? 0)` — so a rate that clears the threshold while its `n` resolves 0 publishes "based on 0 responses" under a real percentage, on the public page.
- [x] [AI-Review][Med] **The policy brief discards the denominator the backend scope exception was taken to obtain.** `policy-brief.service.ts:89` passes `skills.skills` and drops `respondentsAnswering`; the Ministry-facing PDF still prints skills percentages with no base — the exact defect the exception was granted to fix, at the one surface that gets printed and handed over.
- [x] [AI-Review][Med] **`TrendsCharts` labels an event count with the people-denominator glyph.** `rangeTotal` sums daily registrations and renders `N = …`, against `ChartCard`'s own instruction to omit `n` for "a time series of events rather than a distribution over people". [`TrendsCharts.tsx:99-102`]
- [x] [AI-Review][Med] **AC5's plain-language explainer is built, tested, and never rendered.** `countedOverCaption` is used by nothing but its own test, and `ChartCard.subtitle` by no production call site — while their tests make both look live.
- [x] [AI-Review][Low] **Duplicate `data-testid="chart-n"` within single components** (EquityMetrics ×3, ExtendedEquityMetrics ×3, TrendsCharts ×2): `getByTestId` throws there, and the current tests only dodge it by using `getAllByTestId`.
- [x] [AI-Review][Low] **Strip error handling contradicts the documented em-dash design.** `RespondentRegistryPage.tsx:249` `error={regSummaryError ?? regTotalsError}` blanks the entire strip when only totals fail; Task 3 says an unavailable total renders an em-dash. Only the `undefined data` path was tested.
- [x] [AI-Review][Low] **The GPI's published `n` is not the base the GPI was computed over.** `derive-equity-data.ts:88` sums ALL non-suppressed gender buckets, but GPI is female/male — any "Other"/"Prefer not to say" bucket inflates the published base. Same "an n that isn't the metric's n" class this story exists to end.
- [x] [AI-Review][Low→**HIGH once opened**] **Four Household ratio stat-cards carried no N** (Dependency Ratio, Business Ownership Rate, Business Registration Rate, Apprentice Total). `HouseholdStats` did not publish the household base each was computed over. **Awwal's ruling 2026-08-20: not acceptable debt before the blast — take the API change so AC4.1 is whole.** Taken. Going after the bases surfaced two arithmetic defects underneath them — see R11.

### Review Resolution (applied 2026-08-20)

**R1 — the two "with answers" populations now have two different names.** The
tempting fixes were both wrong: re-captioning the percentages with
`totals.withAnswers` would state a denominator the arithmetic never used, and
repointing `getRegistrySummary` is 12-4/13-33 scope with published figures
attached. So neither number moved — the *words* did. `pctOfAnswersCaption` /
`ofAnswersCaption` now read **"44.7% of 282 submissions with answers"**, against
the card's "With Answers · 271 · respondents whose answers we hold". Two
populations, two phrasings, nothing left to silently reconcile. When 12-4
repoints the summary read, the two collapse and the word "submissions" can go.
Pinned by a test that feeds the page 271 people against 282 submissions.

**R2 — `ChartCard` finished the job it was extracted for.** `TrendsCharts` (×2)
and `SkillsCharts` now render through it, so every hand-rolled copy of that
header the Implementation Plan named is gone. The `chart-n` markup went from 12
duplicates to one, plus the five Skills-Inventory / Equity headers, which are
structurally different cards and keep their own.

**R3/R4 — the public rates.** Added the assertions that make the published `n`
real (GPI, youth employment, unemployment), and `basedOnCaptionIfKnown` now
withholds a denominator rather than printing **"based on 0 responses"** under a
live percentage — the service defaults an absent base to 0, so 0 means
*unknown*, not *nobody*. Reads are optional-chained, so a payload without
`rateDenominators` renders the page instead of blanking it.

**R5 — the policy brief publishes what it was handed.** The skills heading now
carries `(n = 1,234 respondents answering)`. The base rides in the heading LABEL
because a non-empty value column drops the row out of `renderTable`'s
section-heading branch and would have restyled it. `PolicyBriefService` had no
service-level test at all; it has one now, with a faked PDFKit that asserts what
the document is told to write.

**R6 — a time series stopped wearing the N glyph.** Trends renders
`rangeTotalCaption` ("1,247 registrations in the selected range") as a subtitle
instead of `N = 1,247`. It is a count of registration EVENTS, not a subset of
the registry total, and the old rendering invited a comparison that cannot be
made.

**R7 — AC5's explainer is now on screen.** `countedOverCaption` rides as the
`title` of every `ChartCard` N, so the plain-language reading exists once and
appears everywhere, without a second line on twenty cards. `ChartCard.subtitle`
became load-bearing via R6.

**R8/R9/R10 — the smaller ones.** Per-card testIds on the Equity stat cards so
`chart-n` can be scoped; a totals-only failure now leaves the strip alive with
an em-dash instead of blanking five working stats; and the GPI's published `n`
counts only the female and male buckets it is actually the ratio of.

**R11 — the four Household bases, and the two defects hiding under them.**
Awwal ruled the deferral out (2026-08-20): AC4.1 whole before the blast, no
debt. `getHousehold` now publishes `denominators` — four different bases, one
per statistic — and `HouseholdStats.denominators` is **required**, which
immediately caught a stale web fixture at `tsc`.

Writing the bases meant reading what each ratio actually divides by, and two of
them were not what the card implied:

1. 🔴 **`businessOwnershipRate` was ruling R-E's defect, still live on the
   dashboard.** It divided by `total_count` — `COUNT(*)` over
   `buildWhereFragments`, whose first condition is a hardcoded
   `s.raw_data IS NOT NULL`. That is *"has ANY answers"* verbatim: a respondent
   never ASKED about business ownership sat in the divisor, so *not asked*
   silently became *does not own a business*. **12-4 fixed exactly this in
   `public-insights.service.ts` and never touched this second code path**, so
   the dashboard and the public /insights page have been publishing different
   values for the same statistic. Repointed onto the answered set
   (`has_business_n`), which is what the public page already does.
   **RED-verified by mutation**: restoring the coarse divisor fails the new test
   with `expected 30 to be 37.5`.
2. 🟠 **The dependency ratio mixed two populations.** The divisor summed
   `household_size` over rows that gave one; the numerator summed
   `dependents_count` over *all* rows — so households absent from the
   denominator still pushed the numerator up, inflating the ratio by an amount
   nobody could state. Both sums are now restricted to the same set.

Publishing an `N` over either of those divisors would have shipped a
precise-looking wrong base into the blast — a labelled wrong denominator is
worse than an unlabelled one, and is the defect this story exists to end wearing
its most convincing disguise.

⛔ **PRE-DEPLOY RESIDUAL — `businessOwnershipRate` WILL MOVE ON THE DASHBOARD,
and it must be discharged by PREDICTION, not by movement.** The tests prove the
formula; they cannot tell you the prod figure. Before this ships, reproduce
`getHousehold`'s aggregate read-only against prod through the same
`buildWhereFragments`, confirm the control reproduces the CURRENT live dashboard
figure exactly, then predict the new one and compare after deploy. 12-4 already
measured the public-page counterpart at **45.5% with n=191 against
withAnswers≈271**, so the dashboard's ~32% should land near the public page's
45.5%. "It moved" passes for any change, including a wrong one →
[[pattern-a-record-about-the-work-is-not-the-work]], 12-4 R1 discipline.

> ⚠️ **CORRECTED AT ADJUDICATION 2026-08-20 — AND THE PREDICTION IS NOW MEASURED.**
> This paragraph originally ended *"the two surfaces agreeing IS the expected outcome, and a result
> that leaves them apart means this is not finished."* **That criterion is wrong, and left as written
> it sends the deployer hunting a bug that does not exist.**
>
> **The two surfaces read different tables at different grains.** `getHousehold` reads
> `FROM submissions` — one row per SUBMISSION. `public-insights.service` reads `registry_unified` —
> one row per RESPONDENT (13-33's canonical read). They cannot agree by construction. This is
> §2z(d), the *submissions-vs-registry-unified* substitution this project has now been caught by
> three times.
>
> **Measured read-only on prod, 2026-08-20:**
>
> | | rows | n | rate |
> |---|---|---|---|
> | dashboard **before** (`total_count` divisor) | 286 | — | **31.8%** ← control reproduces the live figure |
> | dashboard **after** (`has_business_n`) | 286 | **199** | **45.7%** |
> | public page (already shipped) | 272 | 191 | 45.5% |
>
> ⛔ **CORRECTED AGAIN 2026-08-20, AFTER DEPLOY — THIS PREDICTION WAS WRONG, AND THE DEPLOYED CODE
> WAS RIGHT.** `getHousehold()` executed on prod through the deployed build returns **45.5% at
> n=198**, not the 45.7% / n=199 predicted here. The cause is mine: `buildWhereFragments` carries
> **TWO** conditions — `s.raw_data IS NOT NULL` **and `s.respondent_id IS NOT NULL`** — and the
> prediction query reproduced only the first. Prod holds **2 orphan submissions** (13-57's known
> pair); one of them answered `has_business = 'yes'`, so including it inflated both numerator and
> denominator by exactly one row. Excluding it gives 90/198 = **45.5%**, which is what shipped.
>
> **§2z(d) a second time in one day: naming the right TABLE is not reproducing the whole PREDICATE.**
> The prediction discipline still did its job — it is precisely because a prediction can be wrong
> that this was caught at all, and what it caught was the adjudicator's query, not the code.
>
> ⚠️ **And the two surfaces DO both read 45.5 today — by ROUNDING COINCIDENCE, not by agreement.**
> Public page: 87/191 = 45.55. Dashboard: 90/198 = 45.45. Different populations, different true
> values, same rounded figure. The structural point below stands — they are different grains and
> will diverge again the moment either population shifts — so **do not read today's match as proof
> that they are the same number.**
>
> ~~➜ **Expect 45.7%, not 45.5%.**~~ A ~0.2pp gap from the public page is the CORRECT outcome. The gap
> exists because ~14 people carry more than one answer-bearing submission, so the dashboard counts
> them twice relative to the respondent-anchored page — pre-existing, out of 12-5's scope, and the
> structural reason the two can never be identical.
>
> 🔎 **This also retires an old confusion.** SCP §10.14 R-E computed **45.7%** and was corrected for
> "sizing with the wrong table". That number was wrong for the public page and **exactly right for
> the dashboard** — R-E had measured `submissions`, which is what the dashboard actually reads.

**Verification of the fixes (run in this session, not self-reported):**
`apps/web` dashboard + insights: **1,236 passed / 104 files**, 2 todo, 0 failed.
API analytics + policy-brief + routes + real-DB smoke against `app_test`:
**114 passed / 7 files**, 0 failed. web `tsc` clean · API `tsc` clean · web
eslint `--max-warnings=0` over `features/dashboard` + `features/insights` clean ·
API eslint over the six changed files clean. The R-E repoint was RED-verified by
mutation and the mutation reverted.

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

Claude Opus 5 (1M context) — `claude-opus-5[1m]`, via the `dev-story` workflow, 2026-08-19.

### Implementation Plan (technical approach + decisions)

**The shape of the fix.** Three surfaces told the same lie in three different
ways, so the fix is one honest source (12-4's aggregate) read by all three, plus
one shared vocabulary module so the wording cannot drift apart again.

1. **`RegistryTotals` had to move.** Task 1 said "add to `@oslsr/types` only if
   12-4 did not already export it." It did not — 12-4 defined the interface
   *inside* `apps/api/src/services/registry-totals.service.ts`, so the web layer
   had no type for the aggregate it was supposed to render. Moved it to
   `@oslsr/types`; the API imports it back and re-exports it, so there is still
   one definition.
2. **The taxonomy is now declared twice, so it is pinned.** The three axis unions
   exist as `typeof CONST[number]` in the API (the arrays the service actually
   tallies into) and as hand-written unions in `@oslsr/types` (the web cannot see
   those arrays). Two declarations of one taxonomy is the drift 13-33/13-37 exist
   to kill, so `registry-totals.service.ts` carries a `Pinned<A, B>` compile-time
   guard per axis. **RED-verified**: adding a bogus member to the shared union
   fails `tsc` with `Type 'true' is not assignable to type 'false'` on the guard
   line, naming the drifted axis.
3. **`ChartCard` had to become real before `n` could be additive.** AC4.3 says
   "add an optional prop to the shared `ChartCard`" — but there was no shared
   one. There were TWO private `ChartCard`s (`DemographicCharts`,
   `HouseholdCharts`) plus hand-rolled copies of the same header markup in
   `EmploymentCharts` (×4), `TrendsCharts` (×2) and `SkillsCharts`. Extracted
   `components/charts/ChartCard.tsx` with the identical markup — so adopting it
   changes no pixels — and the additive `n`.
4. **No fallback from the honest total to the old one.** Where totals are
   unavailable, both the headline card and the strip render an em-dash. Falling
   back to `getRegistrySummary().totalRespondents` would silently reinstate the
   exact bug; both fallbacks are pinned by tests.
5. **The percentage cards' caption names `getRegistrySummary`'s own count**, not
   `totals.withAnswers`. Per the 13-33 harmonization note the two are the same
   number today but are scoped differently (submission vs respondent) and can
   drift until 12-4 repoints the summary read. The standalone "With Answers"
   figure comes from the totals aggregate, as that note requires.

### Completion Notes List

**AC1–AC3 (labels + reconciliation).** Survey Analytics Row B is now an 8-card
grid: "Total Respondents" bound to `getRegistryTotals().totalRespondents` and a
distinct "With Answers" bound to `.withAnswers`. Every percentage card states the
denominator it divides by ("44.7% of 76 with answers"). `RegistrySummaryStrip`
gained a `totals` prop, fed from `RespondentRegistryPage` under the same active
filters, so the strip's total and the header's `{totalItems} records` now count
the same population.

**AC4 (N per chart).** Denominators surfaced from what each chart already held:
`bucketTotal()` (promoted from a private helper into `chart-utils`) for all
bucket charts across Demographics / Employment / Household; range-sum for Trends
(it moves with the 7d/30d/90d toggle, which is correct); `thresholds.*.currentN`
for the five Skills-Inventory charts; per-metric denominators for Equity; the
dashboard's own unbanded LGA distribution for the Geographic map.

⚠️ **ONE AC-VS-REALITY CONFLICT, RULED BY AWWAL MID-STORY.** The Skills-frequency
chart could not show an honest N: `GET /analytics/skills` returned
`SkillsFrequency[]` only, and its denominator (`total`, the submissions with a
non-empty `skills_possessed`) was computed at
`survey-analytics.service.ts:585-593` and **thrown away**. It cannot be recovered
client-side — percentages are rounded to 1dp, and the sum of the counts is a
count of *selections*, not of people (one respondent picking five skills
contributes one to the base and five to the counts). The story's Dev Notes said
"no backend files". **Ruling: return the denominator.** So this story DOES touch
the backend, deliberately and narrowly: `getSkillsFrequency` now returns
`{ skills, respondentsAnswering }`. Blast radius was two direct callers
(controller, policy-brief) plus six service tests.

**AC4 addendum — `rateDenominators` is now load-bearing.** The 2026-08-12 PM
amendment ("every rate ships with the count it was computed from... this lands on
12-5 as well as 12-4") was implemented: `rateDenominators` had been **required on
`PublicInsightsData` since 12-4 and read by no component**. The public /insights
page now prints each rate's own n beside it (GPI, youth employment,
unemployment). Rendered as a bare `based on N responses` figure — the 2026-08-18
operator ruling forbids reintroducing the MethodologyNote prose narrating the
answer-less remainder, and `registry-copy.test.ts` asserts the caption contains
none of it.

**AC5 (one vocabulary).** `utils/registry-copy.ts` holds the two labels and all
five caption/format helpers; the headline, the strip, every chart header and the
public rates import from it. `ExtendedEquityMetrics` had grown its own `n = {x}`
format — folded into `formatN`.

**Known gaps, recorded rather than papered over:**
- Four Household ratio stat-cards (Dependency Ratio, Business Ownership Rate,
  Business Registration Rate, Apprentice Total) render **without** a numeric N:
  `HouseholdStats` publishes the ratios but not the household base each was
  computed over. They keep their existing base-naming subtitles ("Of surveyed
  households"). Inferring a base from a rounded rate is the very defect this
  story exists to end, so no number was invented. Same shape as the Skills gap —
  worth a follow-up that publishes those bases.
- `assertAxesPartition` in 12-4 remains untouched; nothing here changes the
  aggregate's derivation.

**Verification run (all local, this session):**
- **`apps/web` full suite: 2963 passed / 2967**, 2 todo, 2 failed. One failure
  was mine and is fixed (`derive-equity-data` fixture missing the new
  `denominators`). The other was `a3-eslint-policy` — a 30 s-timeout test that
  lints synthetic strings, touches nothing this story changed, and passes in
  3.1 s in isolation: full-suite contention, per
  [[feedback_local_full_suite_flakiness]]. Both green on re-run.
- **API suite: 3693 passed / 3703**, 8 skipped, 1 todo, 1 failed —
  `import.service.integration` rollback. **Not this story:** the diff touches
  nothing under `apps/api/src/db` or `import.service.ts` (verified with
  `git diff --stat`), and the `respondents_status_check` constraint it
  complained about *does* permit `rolled_back` (read back live from `app_test`).
  It passes 11/11 in isolation — the same full-suite parallelism artifact as
  above. ⚠️ Recorded rather than dismissed: worth a look if it recurs on CI,
  where the pre-push gate runs `--concurrency=1`.
- web `tsc --noEmit`: clean. web `eslint --max-warnings=0` over
  `features/dashboard` + `features/insights`: clean.
- API `tsc --noEmit`: clean. API `eslint --max-warnings=0` over the four changed
  files: clean.
- Drift guard RED-verified by mutation, then reverted and re-verified clean.
- ⚠️ **`db:push:force` was NOT run.** Attempting it against `app_test` surfaced
  an unrelated pending data-loss migration (dropping `bounce_type` /
  `bounce_sub_type` from `email_events`) and prompted interactively. Left
  untouched — it is outside this story and is the operator's call
  ([[feedback_db_push_force]]).

⚠️ **Two exit-code traps hit and corrected during this run** — a full-suite run
reported `exit 0` while 2 tests failed, and an `eslint ... | tail && echo CLEAN`
printed CLEAN off `tail`'s status. Both were caught by reading the actual
counters, not the exit code. Same class as
[[feedback-never-pipe-a-push-to-tail]].

### File List

**Shared types**
- `packages/types/src/analytics.ts` — added `RegistryTotals` + its three axis
  unions, `SkillsFrequencyResult`, `EquityData.denominators`, and (review R11)
  the REQUIRED `HouseholdStats.denominators`.

**API (deliberate, narrow — see the ruling above)**
- `apps/api/src/services/registry-totals.service.ts` — import/re-export the
  shared `RegistryTotals`; added the compile-time taxonomy drift guard.
- `apps/api/src/services/survey-analytics.service.ts` — `getSkillsFrequency`
  returns `{ skills, respondentsAnswering }`; **review R11**: `getHousehold`
  publishes per-field `denominators`, repoints `businessOwnershipRate` onto the
  answered set (ruling R-E), and restricts the dependency ratio's numerator to
  the divisor's own population.
- `apps/api/src/controllers/analytics.controller.ts` — comment only (the new
  `data` shape flows through unchanged).
- `apps/api/src/services/policy-brief.service.ts` — reads `skills.skills`.
- `apps/api/src/services/__tests__/survey-analytics.service.test.ts` — updated to
  the new shape + asserts the denominator.
- `apps/api/src/services/__tests__/policy-brief.service.test.ts` — **NEW**
  (review R5). The brief had no service-level test; this one fakes PDFKit and
  pins the skills base in the heading.

**Web — data layer**
- `apps/web/src/features/dashboard/api/analytics.api.ts` — `fetchRegistryTotals`;
  `fetchSkillsFrequency` returns the result object.
- `apps/web/src/features/dashboard/hooks/useAnalytics.ts` — `useRegistryTotals` +
  `analyticsKeys.registryTotals`.

**Web — new files**
- `apps/web/src/features/dashboard/utils/registry-copy.ts`
- `apps/web/src/features/dashboard/components/charts/ChartCard.tsx`
- `apps/web/src/features/dashboard/utils/__tests__/registry-copy.test.ts`
- `apps/web/src/features/dashboard/components/charts/__tests__/ChartCard.test.tsx`

**Web — surfaces**
- `apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx`
- `apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx`
- `apps/web/src/features/dashboard/components/charts/RegistrySummaryStrip.tsx`
- `apps/web/src/features/dashboard/components/charts/DemographicCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/EmploymentCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/HouseholdCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/TrendsCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/SkillsCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/FullSkillsChart.tsx`
- `apps/web/src/features/dashboard/components/charts/SkillsCategoryChart.tsx`
- `apps/web/src/features/dashboard/components/charts/SkillsGapChart.tsx`
- `apps/web/src/features/dashboard/components/charts/SkillsConcentrationTable.tsx`
- `apps/web/src/features/dashboard/components/charts/SkillsDiversityCards.tsx`
- `apps/web/src/features/dashboard/components/charts/EquityMetrics.tsx`
- `apps/web/src/features/dashboard/components/charts/ExtendedEquityMetrics.tsx`
- `apps/web/src/features/dashboard/components/charts/chart-utils.ts` — `bucketTotal`
- `apps/web/src/features/dashboard/utils/derive-equity-data.ts`
- `apps/web/src/features/insights/pages/PublicInsightsPage.tsx`
- `apps/web/src/features/insights/components/PublicEmploymentSection.tsx`

**Web — updated tests**
- `apps/web/src/features/dashboard/pages/__tests__/SurveyAnalyticsPage.test.tsx`
- `apps/web/src/features/dashboard/pages/__tests__/RespondentRegistryPage.test.tsx`
- `apps/web/src/features/dashboard/components/charts/__tests__/RegistrySummaryStrip.test.tsx`
- `apps/web/src/features/dashboard/components/charts/__tests__/DemographicCharts.test.tsx`
- `apps/web/src/features/dashboard/components/charts/__tests__/HouseholdCharts.test.tsx` —
  review R11: the four bases, and no base under a suppressed figure.
- `apps/web/src/features/dashboard/components/charts/__tests__/EquityMetrics.test.tsx`
- `apps/web/src/features/dashboard/utils/__tests__/derive-equity-data.test.ts`
- `apps/web/src/features/dashboard/hooks/__tests__/useAnalytics.test.ts`
- `apps/web/src/features/insights/pages/__tests__/PublicInsightsPage.test.tsx` —
  added by the review (R3/R4): the published `n` had no component test.
- `apps/web/src/features/dashboard/components/charts/__tests__/ChartCard.test.tsx`

**Process**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 12-5 status.

## Residuals

Per the §2a0 three states. **`done` is not permitted while any row is OPEN or DISCHARGE-ON-DEPLOY.**

| # | Sev | Item | State | Re-runnable evidence | Owner | Reopen trigger |
|---|---|---|---|---|---|---|
| **R1** | **High** | **The corrected dashboard rate is not on prod.** R-E's defect is still live on the internal dashboard: `businessOwnershipRate` divides by everyone with ANY answers, so a respondent never *asked* about business ownership sits in the divisor and *not asked* silently reads as *does not own a business*. | ✅ **DISCHARGED ON PROD 2026-08-20, deploy `836d1c7`** — verified by EXECUTING `getHousehold()` on the VPS through the deployed build, not by re-deriving the number in SQL. It returns **`businessOwnershipRate = 45.5`, `denominators.businessOwnership = 198`**, up from the live 31.8%. The coarse denominator is gone from the dashboard. ⚠️ **The predicted figure (45.7 / n=199) was WRONG and the code was right** — see the corrected callout above; the prediction query omitted `s.respondent_id IS NOT NULL` and so counted one orphan submission. | **Predicted read-only on prod 2026-08-20, control first:** the old formula reproduces the live **31.8%** exactly, which is what makes the new figure trustworthy; the new formula gives **45.7% at n=199**. **Discharge by:** deploy, then confirm the dashboard publishes **45.7%**, not merely that it moved. ⚠️ **Do NOT expect it to equal the public page's 45.5%** — different table, different grain (see the corrected callout above). | adjudication | The dashboard reading 31.8% an hour after deploy, or landing on a value that is neither 45.7% nor explicable by new registrations. |
| **R2** | Med | **The dashboard double-counts multi-submission respondents.** 286 answer-bearing submissions against 272 answer-bearing respondents — ~14 people carry more than one, so every submissions-anchored dashboard rate weights them twice. | **ACCEPTED** | Measured 2026-08-20: `submissions` with answers = **286**; `registry_unified` with answers = **272**. Pre-existing, not introduced here, and out of 12-5's scope — 12-5 fixes the *divisor*, not the *grain*. | 12-6, or a follow-up that re-points `survey-analytics.service` onto `registryUnifiedSource` | Anyone citing the dashboard and the public page as though they were the same population. |
| **R3** | Low | The story's own success criterion said the two surfaces must agree, and that a gap means "not finished". | ✅ **CLOSED at adjudication 2026-08-20** | Corrected in place with the measurement attached, rather than deleted, so a reader can see the severity moved. §2z(d). | adjudication | — |
| **R4** | Low | `Status: done` was set while a pre-deploy residual was live and no ledger existed. | ✅ **CLOSED at adjudication 2026-08-20** | Status moved to `review` on the story and the board; this ledger written. **The CI guard did not catch it** — `lint-story-residuals` scanned table rows only, and this story had no table. Guard fixed in the same change, with this story as its regression test. | adjudication | — |

## Closing verdict

**✅ CLOSED. Deploy SHA: `836d1c7`.** CI run 32385487114, all 10 jobs green, prod health 200.
**Until that line carries a real SHA and R1 is discharged, `Status:` must not read `done`.**

| Gate | Evidence — run by adjudication, not accepted from the dev |
|---|---|
| `tsc` | API **0**, web **0** |
| `eslint` + 3 drift guards | **0 errors**, guards green at 384 files |
| Touched API suites | **120 passed** |
| Touched web suites | **1,236 passed / 104 files**, 2 todo |
| File List vs `git status` | **matches** (42 declared + the story file itself) |

### RED-verify by adjudication

Reverting the divisor to `total` (R-E's coarse denominator) reds **exactly one** test —
`getHousehold > returns household stats with aggregates`, `AssertionError: expected 30 to be 37.5`
— the same assertion the story claimed. Restored by hand (the file carries uncommitted work, so
`git checkout` would have wiped it); re-run **36/36 green**.

### ⭐ What this story found that 12-4 missed — including by me

12-4 fixed R-E in `public-insights.service.ts` and I adjudicated it closed **without asking where
else the defect lived**. It lived in `getHousehold`, so the dashboard and the public page have been
publishing different values for the same statistic. §2o is the playbook entry for exactly this —
*fix the class, not the cohort in front of you; when you fix a guard, immediately grep for its
siblings* — and it was not applied. Recorded here rather than in a commit message because the next
person to fix a shared derivation needs to see it.

## Change Log

| Date | Change |
|---|---|
| 2026-06-16 | Story authored (SM, Bob) via create-story workflow. Epic 12 Tier-1 (Track A: counting/legibility). LABEL HONESTY + N-PER-CHART: re-label the "Total Respondents"=76 mislabel to the honest 139 from 12-4's `getRegistryTotals()`, distinguish "respondents (139)" from "submissions with answers (76)" everywhere counts appear, reconcile the Registry summary strip, and surface each chart's own N denominator via an additive subtitle on the shared chart-card header. CONSUMES 12-4 (aggregate) + 9-59 (taxonomy) — no new aggregate, no new charts/stats, web-only. 6 ACs. POST-LAUNCH, NON-GATING. Status → ready-for-dev. |
| 2026-08-19 | **Implemented (dev-story, Opus 5).** Headline + strip now read 12-4's `getRegistryTotals()`; "With Answers" is its own labelled figure and the answers count is never again labelled "Total Respondents" (em-dash rather than a fallback, pinned by tests). Every percentage states the denominator it divides by. Extracted a genuinely shared `ChartCard` (there were two private ones plus hand-rolled copies) with an additive optional `n`, and surfaced each chart's own denominator — `bucketTotal` for bucket charts, range-sum for Trends, `thresholds.*.currentN` for Skills-Inventory, per-metric bases for Equity. `RegistryTotals` moved to `@oslsr/types` (12-4 had it API-only) with a RED-verified compile-time drift guard pinning the three axis unions. **`rateDenominators` made load-bearing**: the public /insights page now publishes each rate's own n as a bare figure — no reintroduction of the prose the 2026-08-18 operator ruling removed. ⚠️ **Scope exception, ruled by Awwal mid-story:** the Skills-frequency chart had no recoverable denominator (computed server-side and discarded; percentages rounded to 1dp), so `getSkillsFrequency` now returns `{ skills, respondentsAnswering }` — this story touches the backend, against the "web only" Dev Note, rather than publish an inferred N. Known gap recorded: four Household ratio stat-cards still lack a numeric N because `HouseholdStats` does not publish their base. Status → review. |
| 2026-08-20 | **AC4.1 made whole on Awwal's ruling (no deferred debt before the blast).** Took the API change: `getHousehold` publishes per-field `denominators`, so the last four cards without a base — Dependency Ratio, Business Ownership Rate, Business Registration Rate, Apprentice Total — now carry one. Reading what each ratio actually divides by surfaced **two arithmetic defects under them**: 🔴 `businessOwnershipRate` divided by `total_count` (= `buildWhereFragments`'s hardcoded `raw_data IS NOT NULL`, i.e. "has ANY answers") — **ruling R-E's defect, still live on the dashboard because 12-4 fixed only `public-insights.service.ts`**, so the dashboard and the public page have been publishing different values for the same statistic; repointed onto the answered set, RED-verified by mutation (`expected 30 to be 37.5`). 🟠 the dependency ratio summed dependents over rows absent from its own divisor; both sums now share one population. `HouseholdStats.denominators` is REQUIRED and caught a stale web fixture at `tsc`. ⛔ **Pre-deploy residual: `businessOwnershipRate` will MOVE (~32% → ~45%, toward the public page's already-corrected 45.5% at n=191) and must be discharged by PREDICTION against prod, not by movement.** Status → done. |
| 2026-08-20 | **Adversarial code review + fixes applied (code-review workflow).** 11 findings, 1 High / 6 Med / 4 Low. **The High was the page rebuilding its own defect**: the "With Answers" card counts PEOPLE while the percentage captions divide by SUBMISSIONS, and `getRegistrySummary` still reads `FROM submissions`, so both were labelled "with answers" while genuinely differing (12-4 measured 271 vs ~282 on prod) — AC2.2's "no two counts that silently disagree", broken by the fix for it. Resolved by naming the two populations differently, not by moving either number. Also: finished the `ChartCard` extraction (`TrendsCharts` ×2 + `SkillsCharts` still hand-rolled, 12 copies of the `chart-n` markup → 1); the public `n` gained its first component tests and a guard against publishing "based on 0 responses"; the policy brief now prints the skills base it was being handed and gained its first service test; the Trends event count stopped wearing the `N =` glyph; AC5's explainer went from dead export to the tooltip on every `ChartCard` N; a totals-only failure no longer blanks the strip; the GPI's `n` counts only female+male. **One Low DEFERRED** — four Household ratio cards still lack a base because `HouseholdStats` does not publish one, and inventing it is the defect this story exists to end. Status → done. |
| 2026-07-19 | **13-33 harmonization (John/PM).** Flagged that the standalone "With Answers" (76) must be sourced from `getRegistryTotals().withAnswers` (canonical, respondent-scoped), NOT `getRegistrySummary().totalRespondents` (submission-scoped, can double-count) — the two "76"s can drift until 12-4 repoints `getRegistrySummary` onto the `registry_unified` read. Dev Note added. No AC/scope change; found by the post-13-33 backlog sweep. |

## ⛔ BEFORE YOU BUILD THE DENOMINATOR FIX — read this (added 2026-08-12, John/PM)

**The defect is real and live. The numbers written down for it are not — and they are wrong in a way
that will silently corrupt an AC or a test.**

### The defect (unchanged)

`public-insights.service.ts:80` defines the shared denominator as
`answersWhere = ru.raw_data IS NOT NULL` — *"has ANY answers"* — and **two of the four published rates
divide by it**:

| metric | denominator today | |
|---|---|---|
| `businessOwnershipRate` (`:110`) | `COUNT(*) FILTER (WHERE ${answersWhere})` | ⛔ coarse |
| `unemploymentEstimate` (`:117`) | same | ⛔ coarse |
| `youthEmploymentRate` (`:124`) | per-field (`dob` band) | safe **by accident** |
| `gpi` (`:130`) | per-field (`gender`) | per-field |

A person who has answers but was **never asked** the employment question sits in its denominator, so
*not asked* silently becomes *not employed*. **Both published rates read LOWER than the truth.**
Ruling **R-E**: a rate's denominator is the set of people who **answered that question**. Source is
never the variable.

### ⛔ The trap — SCP §10.14 R-E sized this with the WRONG TABLE

R-E's table computed `52/282` and `91/282` **`FROM submissions`**. The service reads
**`registry-unified` (`ru`)** — respondent-anchored, **one row per person**, latest non-empty
submission. That is **Story 13-33 AC2**, verbatim in the source: *"everything reads the ONE canonical
respondent-anchored unified source, NOT `FROM submissions`"*.

**Live values, fetched 2026-08-12:** `unemploymentEstimate` **18.5 %** · `businessOwnershipRate`
**32.1 %** · `withAnswers` **271 respondents** — not the 282/283 submissions R-E quoted.

1. ⛔ **Do NOT use `23.9%` or `45.7%` as expected values anywhere.** They are submissions-level
   arithmetic. A test asserting them fails against the real query — or passes after somebody "fixes"
   the query to match a wrong number, which is the worse outcome.
2. **Recompute through the same `ru` LATERAL**, per field:
   `COUNT(*) FILTER (WHERE ru.raw_data->>'<field>' IS NOT NULL)`.
3. ✅ **This extends the existing design, it does not fight it.** The service already runs TWO
   denominators on purpose — density/LGAs-covered count ALL respondents, the rates filter to
   answer-bearing. R-E adds a **third, per-field** level.
4. **Make it safe BY DESIGN, not by accident.** `youthEmploymentRate` is correct today only because
   association rows carry `age_years` rather than `dob`. That is luck, and luck changes.

### RED-verify

Insert one respondent with `raw_data` present but **no `employment_status`**, and assert
`unemploymentEstimate` **does not move**. It moves today — that is the failing test, and it must fail
before it passes.

### Publish `n`

Every rate ships with the count it was computed from. That is what stops the next reader having to
work out which denominator produced a number — and it is why this lands on 12-5 as well as 12-4.

> **Why this story:** `n`-per-chart IS this work — a rate published without the count it came from is the same defect wearing a different hat. 12-4 defines the denominator; 12-5 makes it visible.
