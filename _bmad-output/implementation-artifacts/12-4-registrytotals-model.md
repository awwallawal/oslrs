# Story 12.4: registryTotals aggregate model

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
> 🔒 **Taxonomy RESOLUTIONS 2026-07-04 (must implement):** (R1/NIN) Axis-3 top tier from a captured NIN is **`nin_on_file`, NOT `verified`** — there is no offline checksum (see Story 13-15; NINs have no check digit). "Verified" = NIMC-online/member-side only. (R2/DISTINCT) the headline `COUNT(DISTINCT)` key precedence is **NIN → E.164 phone → respondent.id**, with an explicit **`identity_ambiguous`** bucket (no-NIN + no/shared phone); the importer (11-2) must resolve to the SAME key. See taxonomy §Resolutions.
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

- **Dependency spine:** `9-59 (row-level data_status taxonomy + key-normalization) → 12-4 (this story: the aggregate) → { 12-5, 12-6, 12-7, 12-8, PUBLIC /insights (public-insights.service.ts) }`. 12-5/12-6/12-7/12-8 consume **THIS** `getRegistryTotals()` model, **NOT** `survey-analytics.service`'s old `raw_data IS NOT NULL` count.
- **⚠️ CONSUMER OMISSION corrected 2026-07-10 (per Awwal):** the PUBLIC, unauthenticated `public-insights.service.ts` (oyoskills.com/insights) has the IDENTICAL `COUNT(*) FROM submissions` mislabel (`totalRegistered` = 79 submissions, should be ~139 registered people) and every breakdown is submission-scoped — but it was never enumerated as a consumer here, so Epic 12's "every analytics surface, one source of truth" excluded the one surface the LAUNCH BLAST drives traffic to. Unlike the internal dashboards, the public surface is **launch-relevant**. **Reconciliation:** Story **13-25** pulls forward JUST 12-4's minimal count-core (AC1 respondent-scoped total + AC3 funnel head) as a shared function the public page consumes pre-launch; the full 12-4 model (AC5 endpoint / AC7 3-axis / AC8 drafts / AC9 verification) stays POST-LAUNCH, and when it lands the public page refactors to consume the full `getRegistryTotals()` (no second count, no throwaway — 13-25's count-core IS the seed of this model).
- **Hard dependency (DONE, on main):** `apps/api/src/services/registry-data-status.ts` — `REGISTRY_DATA_STATUSES`, `deriveDataStatus`, `hasNonEmptyRawData` (9-59, merged commit `e6ff75e`). 12-4 imports these; do not re-derive.
- **Reference pattern to mirror (do NOT fork):** `ExportQueryService.getUnifiedExportData()` [Source: apps/api/src/services/export-query.service.ts:283-346] already performs the per-respondent consumption: a `LEFT JOIN respondents → latest NON-EMPTY submission (LATERAL)`, then `deriveDataStatus({ hasSubmissionData: hasNonEmptyRawData(row.raw_data), status, source, metadata })`. 12-4 does the same derivation but **tallies** instead of emitting rows.
- **Where it slots:** a new aggregate method (`getRegistryTotals()`) beside `getRegistrySummary()` in `survey-analytics.service.ts` (reuse the existing DB plumbing + scope/filter shape), exposed via the existing `/api/v1/analytics` router with the same RBAC.
- **Effort:** ~1 dev-day.

## Acceptance Criteria

### AC1 — `getRegistryTotals()` aggregate over ALL respondents
1. A new service method `SurveyAnalyticsService.getRegistryTotals(scope, params)` (or a standalone `registry-totals.service.ts` if cleaner — dev's call, state in File List) queries **respondents** (one row per distinct respondent, `DISTINCT ON (r.id)` / equivalent) joined to their **latest NON-EMPTY submission** (mirroring the `LEFT JOIN LATERAL` in `getUnifiedExportData`), so EVERY respondent is counted once — not only those with answers.
2. For each respondent row it calls the canonical atom `deriveDataStatus({ hasSubmissionData: hasNonEmptyRawData(row.raw_data), status: row.status, source: row.source, metadata: row.metadata })` and tallies the result. It does **NOT** redefine any status, precedence, or emptiness test — `REGISTRY_DATA_STATUSES`, `deriveDataStatus`, and `hasNonEmptyRawData` are imported from `registry-data-status.ts` and used as-is.

### AC2 — Return shape: total + per-status count map (camelCase)
1. The method returns `{ totalRespondents: number; byDataStatus: Record<RegistryDataStatus, number> }` where `totalRespondents` is the count of **distinct PEOPLE** — resolved via the R2 identity key **NIN → E.164 phone → respondent.id** (reusing `registry-key-normalization.ts`), with shared/duplicate-phone collisions that would wrongly merge distinct people routed to a separate **`identityAmbiguous`** count rather than merged. (139 in prod today, where row-id-distinct ≈ identity-distinct; the key makes the count robust to cross-channel duplicates.) See PM Validation below for the ruling. and `byDataStatus` is keyed by EVERY member of `REGISTRY_DATA_STATUSES` (`completed`, `data_lost`, `pending_nin`, `nin_unavailable`, `imported`, `no_submission`), zero-filled for absent statuses so the shape is stable. The sum of `byDataStatus` values MUST equal `totalRespondents`.
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

### AC7 — Orthogonal 3-axis decomposition (RE-ANCHOR 2026-07-01: this is now THE taxonomy model)
1. In ADDITION to `byDataStatus` (the flat status, KEPT as the row-level primary badge), `getRegistryTotals` returns the THREE orthogonal axis breakdowns the taxonomy mandates: **`bySource`** (`respondents.source`), **`byCompleteness`** `{full, core, partial}`, **`byVerification`** `{nin_on_file, self_declared, pending_nin, unverified_import}`. Each is a zero-filled count map that sums to `totalRespondents`. The flat `byDataStatus` and the axes COEXIST (the flat enum is derivable from the axes; do NOT remove it — it stays the badge). **⚠️ The axes MUST be derived from the RAW respondent fields, NOT from the flat `deriveDataStatus()` output (which is lossy) — see Dev Notes "CRITICAL: derive the 3 axes from RAW FIELDS".** [Source: `_bmad-output/planning-artifacts/registry-data-status-taxonomy.md`]
2. **COMPLETENESS is DERIVED from present fields, form-agnostic** (NOT from which form): a designated **deep-field marker set** present ⇒ `full`; the core set present but not deep ⇒ `core`; no non-empty submission ⇒ `partial`. Define the marker sets ONCE (Axis-2 config), reusing `hasNonEmptyRawData` semantics. This is what lets a Public-Core (13-14) row and a full enumerator row classify by what they CONTAIN.

### AC8 — Drafts are a FUNNEL metric, NEVER in the total
1. The return adds **`inProgressDrafts`** = count of non-expired `wizard_drafts` (started, not completed) exposed SEPARATELY, so 12-5/12-6 render "N registered **+ M in progress**" and never fold drafts into `totalRespondents`. [Source: taxonomy §Pre-registry]

### AC9 — Verification honesty: `nin_on_file` ≠ `verified` (GROUNDED 2026-07-01)
1. There is **NO NIMC/NIN-validation path** in the codebase — NIN is **CAPTURED, not validated** [Source: grep 2026-07-01 — no `verify_nin`/`nimc` service exists]. So Axis-3's top tier is **`nin_on_file`** (NIN present, unvalidated), NOT `verified`. A `verifiedRegistry` figure EXCLUDES `unverified_import` and does NOT claim NIN-holders are "verified" until a real check exists (NIMC validation OR the 13-2 member-side confirmation). **Do not overstate.** *(This was John's PM Open-Question 1 — resolved: nin_on_file.)*
2. **`imported_association`** (added by 13-2) classifies as `source=imported_association / completeness=core / verification=unverified_import`; the derivation must handle it via the existing `imported` branch + the axis maps WITHOUT a 12-4 edit once the enum lands.

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

### ⚠️ CRITICAL (added 2026-07-04, Bob/SM per Awwal): derive the 3 axes from RAW FIELDS — NOT from the flat atom
**The single most likely implementation mistake in this story:** seeing `deriveDataStatus()` return a clean `RegistryDataStatus` and trying to MAP that flat value into the three axes (AC7). **Do NOT.** The 9-59 flat status is a **lossy projection** — it CANNOT reconstruct the axes, for two structural reasons:
1. **It has no full/core distinction.** A `completed` row could be a deep enumerator submission (`full`) or a thin Public-Core one (`core`); the flat enum calls both `completed`. Completeness MUST be re-derived from the **fields present in `raw_data`**.
2. **It force-collapses orthogonal facts via precedence.** `deriveDataStatus` picks ONE label by precedence (`completed > data_lost > pending_nin > nin_unavailable > imported > no_submission`). So a respondent who **has answers AND deferred their NIN** is labeled ONLY `completed` — the `pending_nin` fact is discarded. In the taxonomy those are **orthogonal** (completeness=full/core AND verification=pending_nin *coexist*). Deriving Axis-3 from the flat status would inherit that precedence loss.

**Therefore, in the SAME per-respondent pass, compute EACH axis independently from the RAW columns (`r.source`, `r.status`, NIN presence, and the `raw_data` field-set) — not from the `deriveDataStatus()` return:**
- **Axis-1 `source`** ← `respondents.source` directly.
- **Axis-2 `completeness`** ← inspect the `raw_data` field-set: a designated **deep-field marker set** present ⇒ `full`; the **core set** present but not deep ⇒ `core`; no non-empty submission ⇒ `partial`. Define BOTH marker sets ONCE as an Axis-2 config constant (form-agnostic — so a 13-14 Public-Core row and a full enumerator row classify by what they CONTAIN, not which form).
- **Axis-3 `verification`** ← `status` + `source` + NIN presence: `pending_nin` (status=pending_nin_capture) · `unverified_import` (source `imported_*` / status=imported_unverified) · **`nin_on_file`** (NIN present — R1: NIN is CAPTURED not validated, there is NO offline checksum and NO NIMC path, so this is the TOP tier, never `verified`) · `self_declared` (no NIN). There is **no `verified` value** until a NIMC-online or 13-2 member-side check exists.

Keep the flat `byDataStatus` (from `deriveDataStatus`, unchanged) as the row **badge** — but the axes are a SUPERSET computed alongside it, not downstream of it. Correct direction: the flat enum is derivable FROM the axes; the axes are NOT derivable from the flat enum.

### ⚠️ OPEN for John/PM (AC2 ↔ R2 reconciliation — flag, do not silently pick)
AC2/Task-1 currently count distinct respondents via `DISTINCT ON (r.id)` (distinct **rows**). But **R2** (taxonomy §Resolutions) requires the headline to count distinct **people** via the shared identity key **NIN → E.164 phone → respondent.id + `identity_ambiguous` bucket**, because one person can hold multiple respondent rows across channels (self-register + association import + field). Row-id-distinct ≠ identity-distinct. **Resolution needed before dev:** either (a) the 11-2 importer's dedup guarantees one-row-per-person so row-id-distinct suffices at the dashboard (then R2's key is enforced UPSTREAM, and 12-4 documents that assumption), or (b) 12-4 applies the R2 identity key itself, reusing **`registry-key-normalization.ts`** (9-59) so it matches the importer. **John to confirm which, and whether AC2 needs amending.** Do NOT ship a bare `DISTINCT ON (r.id)` while claiming R2 is satisfied.

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

## PM Validation (John, 2026-07-04)

**Validated the Bob/SM 2026-07-04 note against the taxonomy — both points confirmed:**

1. **"Derive the 3 axes from raw fields, not the flat atom" — ✅ CORRECT and taxonomy-faithful.** The taxonomy's Axis-2 rule derives completeness from a *deep-field marker set* (fields present), explicitly "NOT from which form was used"; Axis-3 derives from status+source+NIN. The note's lossy-projection reasoning is right: `deriveDataStatus`'s precedence (`completed > … > pending_nin`) deliberately picks ONE label, so a `completed`+`pending_nin` respondent loses the NIN-deferral fact — which Axis-3 must preserve. A dev who maps axes *from* the flat enum would silently under-report `pending_nin`/`core`. Keep the note prominent.

2. **AC2 ↔ R2 (row-id-distinct vs identity-key-distinct) — RULING: option (b).** 12-4 **applies the R2 identity key itself** (NIN→phone→id via `registry-key-normalization.ts`), not a bare `DISTINCT ON (r.id)`. Rationale: (i) the taxonomy names identity-key `COUNT(DISTINCT)` as the *structural* loophole-block, not merely an upstream-importer promise; (ii) the NIN unique index blocks same-NIN dups, but **phone-only cross-channel dups are possible** (e.g. a phone-only self-registration + an enumerator re-survey of the same person, no NIN) and the importer skip only guards the *import* path; (iii) making the dashboard honest independent of ingest-path discipline is the whole point. **AC2 amended accordingly** (distinct PEOPLE + `identityAmbiguous` bucket for shared-phone collisions — a household sharing one phone must NOT be merged). This is a small increase over `DISTINCT ON (r.id)` and stays within 12-4's ~1-day estimate since `registry-key-normalization.ts` already exists (9-59).

**No other AC changes.** 12-4 remains POST-LAUNCH / NON-GATING; the pre-launch slice is the *minimal* model shape (`totalRespondents` + `byDataStatus` + `withAnswers`) that 12-5 needs (R4) — the full axis + identity-key work can land with the rest of Epic 12 if 12-5's pre-launch pass only needs the corrected headline.

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List

## Change Log

| Date | Change |
|---|---|
| 2026-06-16 | Story authored (SM, Bob) via create-story workflow. Epic 12 Tier-0 / Track-A foundation: `registryTotals` aggregate model. OWNS THE AGGREGATE over 9-59's row-level `data_status` atom (consumes `deriveDataStatus`/`hasNonEmptyRawData`/`REGISTRY_DATA_STATUSES` unmodified; no new taxonomy). 6 ACs: respondent-scoped aggregate, total + per-status count map, 139→76 funnel head for 12-6, documented-split reproduction, analytics endpoint+RBAC, real-DB smoke (raw-SQL drift guard) + mocked unit tests. POST-LAUNCH, NON-GATING. Status → ready-for-dev. |
| 2026-07-01 | Taxonomy RE-ANCHOR (John PM): added AC7 (3-axis decomposition — bySource/byCompleteness/byVerification), AC8 (inProgressDrafts funnel-only), AC9 (nin_on_file ≠ verified). 12-4 is now THE derivation MODEL for the Registry Data-Status Taxonomy. |
| 2026-07-10 | **Consumer-omission correction (per Awwal).** The PUBLIC `public-insights.service.ts` (oyoskills.com/insights) was never listed as a 12-4 consumer despite carrying the identical `COUNT(*) FROM submissions` mislabel — the one analytics surface the launch blast drives traffic to. Added it to the dependency spine + a reconciliation note: Story 13-25 pulls forward the minimal count-core (AC1/AC3) for the public page pre-launch; the full model (AC5/AC7/AC8/AC9) stays post-launch, and the public page later refactors onto the full `getRegistryTotals()`. No second count / no throwaway. |
| 2026-07-04 | **Bob/SM (per Awwal) + John/PM validated.** Added the CRITICAL Dev Note: the 3 axes MUST be derived from RAW respondent fields (`source`/`status`/NIN/`raw_data` field-set), NOT from the flat `deriveDataStatus()` output — the flat atom is a lossy projection (no full/core distinction; precedence collapses orthogonal facts like `completed`+`pending_nin`). Sharpened AC7.1 with the pointer. Flagged the AC2↔R2 reconciliation (row-id-distinct vs identity-key-distinct via `registry-key-normalization.ts`) as an explicit John/PM decision before dev. Emerged from the 2026-07-04 dashboard-implementation deep-dive. |
