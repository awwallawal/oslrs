# Story 12.7: Registry table upgrade (data_status + reference_code)

Status: ready-for-dev

> 🔗 **Consumes the [Registry Data-Status Taxonomy](../planning-artifacts/registry-data-status-taxonomy.md)** (anchored 2026-07-01; **12-4** is the derivation MODEL). The per-row **`data_status` badge** = the 12-4 model (flat status + the 3 axes: source / completeness / verification) + **source filter chips** (13-2). _Amendment only — ACs unchanged._

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-16 by Bob (SM) via *create-story for Epic 12 "Dashboard System Refresh" (Tier 1, analytics-redesign track). Grounded against the real registry list path (RespondentService.listRespondents — raw SQL `DISTINCT ON`), the canonical 9-59 data-status module, and the existing hand-rolled `<table>` in RespondentRegistryTable.tsx. POST-LAUNCH, NON-GATING. CONSUMES 9-59's deriveDataStatus + the real `reference_code` column; MIGRATES the table to the 12-1 DataTable primitive — so it HARD-depends on 12-1 landing first. -->

## Story

As a **super-admin / verification assessor / government official browsing the Respondent Registry**,
I want **the registry table to show each respondent's data state (`data_status`) and their human-quotable Reference ID, and to let me filter by data state**,
so that **I can tell at a glance which rows actually have questionnaire answers vs. which are data-lost / no-submission / pending-NIN, and read back a respondent's reference code without opening the detail page — the same legibility 9-59 brought to the export, now in the live table.**

## Context & Why

**POST-LAUNCH, NON-GATING — no FRC item depends on it; must not block the field survey or re-engagement blasts.** This is part of Epic 12 (Dashboard System Refresh), the analytics-redesign / design-system track. It is a quality-of-life + design-system-conformance upgrade to an existing screen, not a launch gate.

The Respondent Registry table (`apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx`) is a **hand-rolled raw `<table>`** [Source: apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx:267] driving TanStack-Table in manual (server) mode. It shows name / NIN / phone / gender / LGA / channel / enumerator / form / verification-status / registration-status — but it does **not** surface two things the operator already has on the export and the detail page:

1. **`data_status`** — the canonical per-respondent data-completeness state (`completed` / `data_lost` / `pending_nin` / `nin_unavailable` / `imported` / `no_submission`). 9-59 made the **export** legible by adding this column; the live table still can't distinguish "139 rows, only 76 with answers" from "all 139 complete." This is the same core legibility bug 9-59 calls out [Source: apps/api/src/services/registry-data-status.ts:1-20].
2. **`reference_code`** — the human-friendly `OSL-YYYY-XXXXXX` code added in 9-58 and backfilled on prod (139/139). It is a real, nullable column on `respondents` [Source: apps/api/src/db/schema/respondents.ts:145] and is already searchable [Source: apps/api/src/services/respondent.service.ts:453], but it is not displayed in the table.

In the **same** story we also **migrate the table off its bespoke `<table>` markup onto the shared 12-1 `DataTable` primitive** (`apps/web/src/components/ui/data-table.tsx`) — the Tier-0 design-system foundation — preserving all existing behaviour (server-pagination, server-sort, role-based column visibility, row-click navigation, the quick-view actions column, the SkeletonTable loading state). This is the design-system-enforcement half of the Epic 12 mandate: compose the shared primitive, don't keep rebuilding raw tables.

Per-row `data_status` is **derived on the API side by consuming 9-59's `deriveDataStatus()`** — it is NOT a new definition. The list query already builds the `DISTINCT ON (r.id)` latest-submission view per respondent; this story computes `hasSubmissionData` (latest non-empty `raw_data`) + reads `status` / `source` / `metadata` and passes them to `deriveDataStatus()` to label each row, exactly as 9-59 specified for consumers [Source: apps/api/src/services/registry-data-status.ts:61-69].

### Dependencies, sequencing & effort

- **HARD dep — 12-1 (DataTable primitive) MUST land first.** This story migrates the registry table onto `apps/web/src/components/ui/data-table.tsx` (TanStack-Table recipe, server-pagination + client-sort). That file **does not exist yet** (confirmed — `apps/web/src/components/ui/` has no `data-table.tsx`). If 12-1 has not merged, this story is blocked: do NOT re-create the primitive here, consume it. **Dependency spine: 12-1 (DataTable) → 12-7; 9-59 (taxonomy) → 12-7.**
- **HARD dep — 9-59 (MERGED).** Consume `deriveDataStatus()` / `REGISTRY_DATA_STATUSES` from `apps/api/src/services/registry-data-status.ts` for the per-row `data_status`. Do NOT re-define the taxonomy or fork a parallel `CASE`.
- **Benefits from / coheres with 12-4 (registryTotals).** 12-4 aggregates `data_status` counts; this story surfaces the same per-row atom in the table. Both consume 9-59 — they must agree on what `completed`/`data_lost` mean. No code dependency on 12-4, but the `data_status` values MUST be identical (same module).
- **Reuses (do NOT fork):** the existing `GET /api/v1/respondents` endpoint, `RespondentService.listRespondents` raw-SQL query, RBAC (`authorize(...AUTHORIZED_ROLES)`), cursor pagination, the `RespondentListItem` / `RespondentFilterParams` shared types, `SkeletonTable`, and the registry filter UI (`RegistryFilters.tsx`).
- **Effort:** ~1–2 dev-days.

## Acceptance Criteria

### AC1 — API: per-row `data_status` (consuming 9-59)
1. `RespondentService.listRespondents` returns a `dataStatus` field on every `RespondentListItem`, computed by calling 9-59's `deriveDataStatus(input)` per row — NOT a new SQL `CASE` or a re-defined taxonomy. The query supplies the inputs `deriveDataStatus` needs: `hasSubmissionData` (whether the latest submission carries non-empty `raw_data`, via `hasNonEmptyRawData` / the same emptiness test 9-59 centralises), plus `respondents.status`, `respondents.source`, and `respondents.metadata` (`questionnaire_data_lost`). [Source: apps/api/src/services/registry-data-status.ts:38-79]
2. The value is always one of `REGISTRY_DATA_STATUSES`; precedence and meaning are 9-59's (`completed > data_lost > pending_nin > nin_unavailable > imported > no_submission`) — this story does not redefine them.

### AC2 — API: `reference_code` on each row
1. Each `RespondentListItem` carries `referenceCode: string | null`, selected from the existing `respondents.reference_code` column [Source: apps/api/src/db/schema/respondents.ts:145]. Null rows (not yet backfilled) render blank, never as a crash or `"null"`.

### AC3 — API: `dataStatus` filter (server-side)
1. `RespondentFilterParams` gains an optional `dataStatus` filter; when present, the list query restricts results to respondents whose derived `data_status` matches one (or a comma-separated set) of `REGISTRY_DATA_STATUSES`. An unknown value is rejected with a `VALIDATION_ERROR` `AppError` (consistent with the controller's existing zod-validation pattern), not silently ignored.
2. The filter composes with all existing filters (lgaId / gender / source / dateFrom / dateTo / verificationStatus / severity / formId / enumeratorId / search) and with the `COUNT(DISTINCT r.id)` total so pagination totals stay correct. The derivation that drives the filter MUST use the same 9-59 logic as AC1 (no drift between the displayed status and the filtered status).

### AC4 — Web: new columns in the table
1. The registry table renders a **Data Status** column (a labelled badge, reusing the existing badge styling convention — sentence-case label + color-coded class, like `VerificationStatusBadge`) and a **Reference ID** column (monospace-ish text, blank when null). Both respect the existing role-based column visibility model (PII columns stay hidden for `supervisor`; `data_status` + `reference_code` are operational, non-PII — show for all roles incl. supervisor).
2. The skeleton column-count and the empty-state `colSpan` are updated to account for the two new columns so loading + empty states still span the full width.

### AC5 — Web: `data_status` filter control
1. `RegistryFilters` gains a **Data Status** dropdown (single or multi-select, matching the existing select/checkbox idioms in the component) whose options are the `REGISTRY_DATA_STATUSES` with human labels (e.g. `completed` → "Completed (has answers)", `data_lost` → "Data lost", `no_submission` → "No submission"). Selecting wires `filters.dataStatus` through the existing `onFilterChange` → query-param flow; "All" clears it. It participates in the existing "Clear Filters" reset and `hasActiveFilters` logic.

### AC6 — Web: migrate to the 12-1 DataTable primitive
1. `RespondentRegistryTable` is re-implemented on top of the 12-1 `DataTable` primitive (`apps/web/src/components/ui/data-table.tsx`) instead of the hand-rolled `<table>` at [Source: apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx:267]. The bespoke `<thead>`/`<tbody>`/`<table>` markup and the local sort-header plumbing are removed in favour of the primitive.
2. **Behaviour is preserved 1:1:** server-side pagination (cursor next/prev + page-size select), server-side sort on the existing sortable columns (`lgaName`, `verificationStatus`, plus `registeredAt` via presets), role-based column visibility, row-click navigation to the respondent detail page, the quick-view (Eye) actions column, and the "No respondents found" empty state. The component's external props contract (consumed by `RespondentRegistryPage`) stays compatible OR the page is updated in lockstep — no behavioural regression visible to the four registry roles.
3. Loading uses the **shared `SkeletonTable`** (skeletons, not spinners), with the column count updated for the two new columns.

### AC7 — Tests
1. **API:** `listRespondents` returns the correct `dataStatus` per respondent for each of the six states (mirroring 9-59's documented 139 = 76 completed + 55 data_lost + 1 pending_nin + 7 no_submission shape); returns `referenceCode` (and `null` where absent); the `dataStatus` filter narrows results + keeps the count correct; an invalid `dataStatus` value 400s. Controller test covers the new query param parse/validation.
2. **Web:** the table renders the Data Status badge + Reference ID columns; the `RegistryFilters` Data Status control renders its options and fires `onFilterChange` with `dataStatus`; the table is driven by the `DataTable` primitive (assert via the primitive's test hooks/role, not the removed raw `<table>` markup) with pagination/sort/row-click/quick-view still working; supervisor role still hides PII columns but shows the two new ones.
3. **Raw-SQL drift guard:** because the list query is raw SQL (`db.execute(sql\`...\`)`), extend/add a **real-DB smoke** (sibling to `respondent-search-db-smoke.integration.test.ts`) asserting the augmented query selects `reference_code` + the `data_status` derivation inputs against the live schema (column-existence guard) and returns the right `dataStatus` for a few structurally-distinct seeded rows. [Source: apps/api/src/services/__tests__/respondent-search-db-smoke.integration.test.ts:155]

## Tasks / Subtasks

- [ ] Task 1 — API: derive `dataStatus` + select `referenceCode` in the list query (AC: #1, #2)
  - [ ] Add `r.reference_code`, `r.status`, `r.source`, `r.metadata` (and the latest-submission `raw_data` emptiness signal) to the `DISTINCT ON (r.id)` SELECT in `RespondentService.listRespondents` [Source: apps/api/src/services/respondent.service.ts:593-679]. `source` is already selected; add the rest.
  - [ ] In the row-mapping (`dataRows.map`) [Source: apps/api/src/services/respondent.service.ts:689-710], compute `hasSubmissionData` via 9-59's emptiness test and call `deriveDataStatus({ hasSubmissionData, status, source, metadata })`; set `dataStatus` + `referenceCode` on each `RespondentListItem`. Import from `apps/api/src/services/registry-data-status.ts` (relative import with `.js`).
  - [ ] Add `dataStatus: RegistryDataStatus` and `referenceCode: string | null` to `RespondentListItem` in `packages/types/src/respondent.ts` [Source: packages/types/src/respondent.ts:54-84].
- [ ] Task 2 — API: `dataStatus` server-side filter (AC: #3)
  - [ ] Add `dataStatus?: string` to `RespondentFilterParams` [Source: packages/types/src/respondent.ts:86-101] and to the controller's `respondentListSchema` zod parse [Source: apps/api/src/controllers/respondent.controller.ts:71], validating against `REGISTRY_DATA_STATUSES` (reject unknown → `VALIDATION_ERROR` `AppError`).
  - [ ] Apply the filter in `buildFilterConditions` [Source: apps/api/src/services/respondent.service.ts:480-544] using the SAME 9-59-driven derivation as AC1 so the filtered set == the displayed set (no SQL `CASE` re-implementation — derive in SQL via the same precedence the module defines, or filter on the inputs that map to the requested status; document the chosen approach). Ensure it composes into both the data query and the `COUNT(DISTINCT r.id)` query.
- [ ] Task 3 — Web: render the two new columns (AC: #4)
  - [ ] Add a Data Status badge column + Reference ID column to `buildColumns()` in `RespondentRegistryTable.tsx` [Source: apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx:64-149]; add a `DataStatusBadge` analogous to `VerificationStatusBadge` (sentence-case label + color class per status). Both columns non-sortable unless trivially server-sortable.
  - [ ] Mark `data_status` + `reference_code` as visible for ALL roles in `getColumnVisibility` [Source: apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx:151-159] (they are operational, not PII); update the supervisor/non-supervisor skeleton `colCount` [Source: apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx:259-262].
- [ ] Task 4 — Web: Data Status filter control (AC: #5)
  - [ ] Add a Data Status select to `RegistryFilters.tsx` [Source: apps/web/src/features/dashboard/components/RegistryFilters.tsx:132-325] with `REGISTRY_DATA_STATUSES` labelled options; wire to `filters.dataStatus` via `updateFilter`; include in `hasActiveFilters` + `clearAllFilters` [Source: apps/web/src/features/dashboard/components/RegistryFilters.tsx:104-126].
- [ ] Task 5 — Web: migrate the table to the 12-1 `DataTable` primitive (AC: #6)
  - [ ] Replace the raw `<table>`/`<thead>`/`<tbody>` block + local `SortIcon` plumbing [Source: apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx:264-323] with the 12-1 `DataTable` from `apps/web/src/components/ui/data-table.tsx`, passing the existing `columns`, `data`, server `sorting`/`onSortingChange`, role visibility, row-click handler, and the actions/quick-view column.
  - [ ] Preserve server pagination (cursor next/prev + page-size) and the SkeletonTable loading branch; keep the `RespondentRegistryPage` props contract intact (or update the page in lockstep). [Source: apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx:282-298]
  - [ ] BLOCKED-IF-ABSENT: if `apps/web/src/components/ui/data-table.tsx` does not yet exist, 12-1 has not landed — stop and flag; do not re-create the primitive.
- [ ] Task 6 — Tests (AC: #7)
  - [ ] API service tests: `dataStatus` per state, `referenceCode` present/null, filter narrows + count correct, invalid value 400s (`apps/api/src/services/__tests__/respondent.service.test.ts` + controller test `apps/api/src/controllers/__tests__/respondent-list.controller.test.ts`).
  - [ ] Web tests: new columns render, filter control renders + fires `onFilterChange`, DataTable-driven pagination/sort/row-click/quick-view preserved, supervisor visibility (co-located `__tests__` for the table + filters + `RespondentRegistryPage`).
  - [ ] Real-DB smoke (raw-SQL drift guard): augment/sibling `respondent-search-db-smoke.integration.test.ts` — assert the query selects `reference_code` + status/metadata and derives `dataStatus` correctly against the live schema. [Source: apps/api/src/services/__tests__/respondent-search-db-smoke.integration.test.ts:155]

## Dev Notes

### Project-bible compliance (the dev MUST follow these — project-context.md)
- **Errors:** throw `AppError` (code/message/status), never raw `Error` — the invalid-`dataStatus` rejection is an `AppError('VALIDATION_ERROR', …, 400)`.
- **Logs:** Pino structured logs (`{ event: 'respondent.…' }`), never `console.log`. The existing service already uses a Pino logger — reuse it for any new diagnostic.
- **Loading:** shadcn skeletons, not spinners — the table already uses `SkeletonTable`; keep it and update its column count.
- **Layout:** `DashboardLayout` has no padding; `RespondentRegistryPage` already adds `p-6` — don't touch.
- **Naming:** snake_case in the DB / raw SQL (`reference_code`, `data_status`); camelCase in the API/types (`referenceCode`, `dataStatus`).
- **TanStack Query keys:** `[domain, ...ids, ...filters]` — the registry list key already includes the filter object via `useRespondentList`; adding `dataStatus` to the filter params flows through automatically.
- **Tests:** backend tests in `__tests__/`; web tests co-located. The real-DB smoke is an integration test alongside the existing `*-db-smoke.integration.test.ts`.
- **ESM:** relative imports carry `.js` in `apps/api`.

### Consume, do NOT fork (the 9-59 + 12-1 contracts)
- **`data_status` is 9-59's atom.** Import `deriveDataStatus`, `REGISTRY_DATA_STATUSES`, `hasNonEmptyRawData` from `apps/api/src/services/registry-data-status.ts`. The 12-4 `registryTotals` aggregate consumes the same module; if this table and the analytics strip ever show different `data_status` for a respondent, the bug is a forked derivation here — there must be exactly one. [Source: apps/api/src/services/registry-data-status.ts:26-79]
- **`DataTable` is 12-1's primitive.** This story is a CONSUMER. The hand-rolled `<table>` is the migration target, not a thing to keep alongside the primitive. Match the primitive's server-pagination shape (manual pagination/sorting) — the current table already runs TanStack-Table in `manualPagination`/`manualSorting`/`manualFiltering` mode [Source: apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx:235-250], so the migration is largely re-housing the existing `columns`/`sorting` wiring into the primitive.

### Raw-SQL reality (read before editing the query)
- The registry list is **raw SQL**, not Drizzle query-builder: `RespondentService.listRespondents` runs `db.execute(sql\`… DISTINCT ON (r.id) … LEFT JOIN submissions …\`)` [Source: apps/api/src/services/respondent.service.ts:593-681]. Mocked-DB tests will NOT catch a renamed/removed column — hence the mandatory real-DB smoke (project "Raw SQL schema drift" pitfall: analytics endpoints 500 in prod only because raw SQL isn't type-checked).
- The query already produces ONE row per respondent via `DISTINCT ON (r.id) … ORDER BY r.id, s.submitted_at DESC NULLS LAST`. The `data_status` derivation must reflect the **latest** submission's emptiness (the `s` row chosen by that ordering). Note 9-59 sources answers from the latest NON-EMPTY submission for the export; for the table's per-row badge, deriving from the `DISTINCT ON` latest submission is acceptable, but be explicit in code about which submission's `raw_data` drives `hasSubmissionData` and keep it consistent with what 12-4 aggregates.
- `reference_code` is nullable and only lazily backfilled — render blank for null, never `"null"`.

### data_status badge labels (suggested — confirm with 12-4 / design-system)
`completed` → "Completed" (green), `data_lost` → "Data lost" (amber/red), `pending_nin` → "Pending NIN" (yellow), `nin_unavailable` → "NIN unavailable" (gray), `imported` → "Imported" (blue), `no_submission` → "No submission" (gray). Reuse the rounded-pill badge convention already in `VerificationStatusBadge` [Source: apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx:25-45] for visual consistency.

### Project Structure Notes
- **API:** edit `apps/api/src/services/respondent.service.ts` (query + row mapping + filter) and `apps/api/src/controllers/respondent.controller.ts` (zod param). Import the canonical module from `apps/api/src/services/registry-data-status.ts`. New/extended integration test under `apps/api/src/services/__tests__/`.
- **Types:** edit `packages/types/src/respondent.ts` (`RespondentListItem` + `RespondentFilterParams`) — shared by API + web.
- **Web:** edit `apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx` (columns + visibility + DataTable migration), `apps/web/src/features/dashboard/components/RegistryFilters.tsx` (filter control), possibly `apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx` (props lockstep). CONSUME `apps/web/src/components/ui/data-table.tsx` (from 12-1). Co-located tests.
- **No DB migration needed** — `reference_code` already exists (9-58); `data_status` is derived, not stored.

### References
- [Source: apps/api/src/services/registry-data-status.ts:26-79] — `REGISTRY_DATA_STATUSES`, `deriveDataStatus(input)`, `hasNonEmptyRawData` (the 9-59 atom to CONSUME).
- [Source: apps/api/src/services/respondent.service.ts:550-745] — `listRespondents` raw-SQL `DISTINCT ON (r.id)` query + row mapping (where `dataStatus`/`referenceCode` are added).
- [Source: apps/api/src/services/respondent.service.ts:480-544] — `buildFilterConditions` (where the `dataStatus` filter is applied; shared by list + count).
- [Source: apps/api/src/controllers/respondent.controller.ts:64-104] — `listRespondents` controller + zod `respondentListSchema` parse (where the `dataStatus` query param is validated).
- [Source: apps/api/src/routes/respondent.routes.ts:27] — `GET /` registry list route + RBAC (`authorize(...AUTHORIZED_ROLES)`).
- [Source: apps/api/src/db/schema/respondents.ts:145] — `referenceCode: text('reference_code')` (the real, nullable column).
- [Source: packages/types/src/respondent.ts:54-101] — `RespondentListItem` + `RespondentFilterParams` (extend both).
- [Source: apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx:64-323] — `buildColumns`, `getColumnVisibility`, `VerificationStatusBadge`, and the raw `<table>` at :267 (the migration target).
- [Source: apps/web/src/features/dashboard/components/RegistryFilters.tsx:132-325] — the existing filter controls grid (where the Data Status filter is added).
- [Source: apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx:282-298] — how the page wires data/sorting/pagination into the table.
- [Source: apps/web/src/components/ui/data-table.tsx] — the 12-1 DataTable primitive (does NOT exist yet — HARD dep; consume, don't rebuild).
- [Source: apps/api/src/services/__tests__/respondent-search-db-smoke.integration.test.ts:155] — the existing raw-SQL real-DB smoke to extend/mirror (drift guard).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|---|---|
| 2026-06-16 | Story authored by Bob (SM) via *create-story for Epic 12 (Dashboard System Refresh, Tier 1). 7 ACs: per-row `data_status` via 9-59's `deriveDataStatus`, `reference_code` column, server-side `data_status` filter, two new table columns + filter control, migration of the registry table from the hand-rolled `<table>` to the 12-1 `DataTable` primitive (behaviour-preserving), and tests incl. a raw-SQL real-DB drift smoke. HARD deps: 12-1 (DataTable) + 9-59 (taxonomy). Status → ready-for-dev. |
