# Story 12.10: Raw-table migration sweep

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Drafted 2026-06-16 by Bob (SM) via create-story for Epic 12 "Dashboard System Refresh", Tier-1 / Track-A consumer. Grounded against the live web tree: grepped `<table` across apps/web/src and confirmed each surface still hand-rolls a raw <table> + its current path + line. SCOPE: migrate the remaining ~8 raw-table surfaces to the 12-1 DataTable primitive (behavior-preserving) and RETIRE the orphaned RegistryTestPage. RespondentRegistryTable is OUT OF SCOPE (owned by 12-7). POST-LAUNCH, NON-GATING — must not block the field survey or the re-engagement blasts. -->

## Story

As a **maintainer of the OSLRS dashboard**,
I want **every remaining hand-rolled `<table>` surface migrated onto the shared `DataTable` primitive (behavior-preserving), and the orphaned `RegistryTestPage` retired**,
so that **the dashboard has one consistent, accessible, skeleton-loading table implementation instead of ~8 divergent bespoke tables, and we stop carrying a debug-only test page in the bundle.**

## Context & Why

**POST-LAUNCH, NON-GATING — no FRC item depends on this story; it must not block the field survey or the re-engagement (Cohort A/B) blasts.** This is a design-system consolidation sweep inside Epic 12 (Dashboard System Refresh), Track A. It pays down the table-divergence debt catalogued in the epic brief §3c: every dashboard table is hand-rolled with its own `<thead>`/`<tbody>`, its own sort-header component (`SortHeader`, `SortableHeader`), its own loading state (some use `SkeletonTable`, some use a "Loading…" `<td>`, some use bare `<Skeleton>` rows), and its own empty state. The proof case is `AuditLogResultsTable` (the headline client-sort surface). 12-1 ships the canonical `DataTable` primitive; this story is the bulk consumer that moves the long tail onto it.

The migration is strictly **behavior-preserving**: same columns, same sort semantics (server-sort vs client-sort per surface), same pagination, same row actions/click handlers, same empty/loading states (now expressed via the primitive's `SkeletonTable` integration), same `data-testid`s where tests assert them. No new columns, no new endpoints, no UX redesign — that belongs to the analytics-redesign Track-B stories.

`RegistryTestPage` is a **debug-only** page (its own header comment says "Minimal test page to verify respondents API works. Remove this file after debugging."). It is **orphaned** — a repo-wide grep finds no import or route reference to it anywhere except its own definition. It is **retired** (file deleted, any stray route removed, grep guard added), **not migrated**.

### Dependencies, sequencing & effort

- **Dependency spine:** `12-1 (DataTable primitive)` → **12-10**. Also `12-2 / 12-3` are the Track-B design-system foundation. **12-10 depends on 12-1** — it cannot start until the `DataTable` primitive lands at `apps/web/src/components/ui/data-table.tsx` (verified ABSENT at draft time, confirming the hard dependency). 12-10 has no dependency on the Track-B foundation stories.
- **Hard scope boundary — OUT OF SCOPE here:**
  - `RespondentRegistryTable` (`apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx`) is migrated by **Story 12-7** (registry `data_status` / `reference_code` surfacing) — do **NOT** touch it in this story.
  - `RegistryTestPage` is **retired**, not migrated (see retire task).
  - The many small chart/sub-tables that are NOT in the §3c raw-table list (e.g. `CrossTabTable`, `SkillsConcentrationTable`, `LgaComparisonTable`, `ProductivityTable`, `FraudDetectionTable`, `StaffTable`, `DisputeQueueTable`, etc.) are out of scope unless a later story pulls them in — this sweep is bounded to the §3c surfaces enumerated below.
- **Mode per surface (DataTable mode the dev must pick):**
  - **Client-sort (visible page only):** `AuditLogResultsTable` (server returns stable cursor order; Principal/Action headers do client-sort over the page).
  - **Server-sort:** `OfficialProductivityPage`, `AssessorCompletedPage`, `SupervisorTeamPage` (header click → `handleSort` → query param).
  - **No-sort / display-only or expandable:** `RespondentDetailPage` submission-history table, `SystemHealthPage`, `RevealAnalyticsPage` (two tables), `StaffPaymentHistoryPage` (expandable rows). Verify each at implementation time and pick the matching `DataTable` configuration; do not introduce sort where none exists today.
- **Effort:** ~2–3 dev-days (8 surfaces + retire + test updates; each surface is a contained, mechanical-but-careful behavior-preserving swap).

## Acceptance Criteria

### AC1 — `AuditLogResultsTable` migrated (the proof case)
1. `AuditLogResultsTable` renders via the 12-1 `DataTable` primitive instead of its hand-rolled `<table>`. The **client-side sort** over the visible page (Timestamp / Principal / Action) is preserved; the server's stable `created_at DESC, id DESC` order is still the default. Row click still invokes `onRowClick(row)`. Loading renders a skeleton (the primitive's `SkeletonTable`, replacing the bare `<Skeleton>` rows); empty renders "No audit events match the current filters." The `data-testid="audit-log-results-table"` (or the equivalent the migrated test asserts) is preserved.

### AC2 — Server-sorted page tables migrated
1. `OfficialProductivityPage`, `AssessorCompletedPage`, and `SupervisorTeamPage` each render via `DataTable` with **server-side sort** preserved (header click still drives the existing `handleSort`/sort query param; current default sort unchanged). Columns, row content, progress-bar / trend / status cell renderers, empty state, and `SkeletonTable` loading are preserved. Existing `data-testid`s (e.g. `official-productivity-table`, `lga-summary-row`) are preserved.

### AC3 — Display-only / expandable tables migrated
1. `RespondentDetailPage` submission-history table, `SystemHealthPage`, `RevealAnalyticsPage` (**both** the top-viewers and top-profiles tables), and `StaffPaymentHistoryPage` (with its **expandable row** behavior) each render via `DataTable`, preserving exact current behavior: no sort is introduced where none exists; the `StaffPaymentHistoryPage` row expand/collapse + dispute/reopen actions still work; all current empty/loading/error states are preserved; existing `data-testid`s (`submissions-table`, `top-viewers-table`, `top-profiles-table`, `payment-history-table`, etc.) are preserved.

### AC4 — `RegistryTestPage` retired
1. `apps/web/src/features/dashboard/pages/RegistryTestPage.tsx` is deleted. Any route/import referencing it is removed (a repo-wide grep at draft time found it is orphaned — no route wires it — so this is expected to be a file delete plus a guard; if a lazy import/route is discovered at implementation time, remove it too). After retirement, a repo-wide grep for `RegistryTestPage` returns no hits.

### AC5 — No raw `<table>` left on migrated surfaces + scope guard
1. After migration, none of the 8 migrated surfaces contains a hand-rolled `<table>` element (verified by grepping `<table` across those files — they should resolve into the `DataTable` primitive). `RespondentRegistryTable` is explicitly **untouched** (owned by 12-7). A follow-up note records that `<table` still legitimately appears in out-of-scope chart/sub-table components.

### AC6 — Tests + green gate
1. Each migrated surface's existing co-located test (`AuditLogResultsTable.test.tsx`, `OfficialProductivityPage.test.tsx`, `AssessorCompletedPage.test.tsx`, `SupervisorTeamPage.test.tsx`, `SystemHealthPage.test.tsx`, `RevealAnalyticsPage.test.tsx`, `RespondentDetailPage.test.tsx`, `StaffPaymentHistoryPage.test.tsx`) is updated to pass against the migrated component, asserting preserved behavior (columns/sort/pagination/actions/empty/loading). Where a surface lacks coverage for a behavior being relied on (e.g. client-sort, row expand), add a focused test.
2. `lint + tsc + build + test` all green (the pre-push gate runs all four; web tests run via `pnpm --filter @oslsr/web test`, never `pnpm vitest run` from root).

## Tasks / Subtasks

- [ ] Task 1 — Migrate `AuditLogResultsTable` to `DataTable` (client-sort mode) (AC: #1) — preserve client-side page sort (Timestamp/Principal/Action), `onRowClick`, the server stable-order default, skeleton loading, and the empty message; keep the asserted `data-testid`. [Source: apps/web/src/features/audit-log/components/AuditLogResultsTable.tsx:162]
- [ ] Task 2 — Migrate `OfficialProductivityPage` to `DataTable` (server-sort mode) (AC: #2) — preserve `handleSort`/`SortHeader` semantics via the primitive, the 10 columns incl. `ProgressBar`/`TrendIndicator` cell renderers, `SkeletonTable` loading, error + empty states, and `official-productivity-table` / `lga-summary-row` testids. [Source: apps/web/src/features/dashboard/pages/OfficialProductivityPage.tsx:202]
- [ ] Task 3 — Migrate `AssessorCompletedPage` to `DataTable` (server-sort mode) (AC: #2) — preserve columns, sort semantics, loading/empty states, and testids. [Source: apps/web/src/features/dashboard/pages/AssessorCompletedPage.tsx:188]
- [ ] Task 4 — Migrate `SupervisorTeamPage` to `DataTable` (server-sort mode) (AC: #2) — preserve the "Team roster" columns, sort, loading/empty, and the `aria-label`. [Source: apps/web/src/features/dashboard/pages/SupervisorTeamPage.tsx:157]
- [ ] Task 5 — Migrate `RespondentDetailPage` submission-history table to `DataTable` (display-only) (AC: #3) — preserve the 8 columns, the per-row fraud-review View link / path, the "No submissions found" empty state, and `submissions-table` testid; introduce no sort. [Source: apps/web/src/features/dashboard/pages/RespondentDetailPage.tsx:342]
- [ ] Task 6 — Migrate `SystemHealthPage` table to `DataTable` (display-only) (AC: #3) — preserve columns, loading/empty, and current behavior. [Source: apps/web/src/features/dashboard/pages/SystemHealthPage.tsx:97]
- [ ] Task 7 — Migrate `RevealAnalyticsPage` BOTH tables to `DataTable` (display-only) (AC: #3) — the top-viewers table AND the top-profiles table; preserve `top-viewers-table` / `top-profiles-table` testids and current behavior. [Source: apps/web/src/features/marketplace/pages/RevealAnalyticsPage.tsx:126] [Source: apps/web/src/features/marketplace/pages/RevealAnalyticsPage.tsx:163]
- [ ] Task 8 — Migrate `StaffPaymentHistoryPage` to `DataTable` (expandable rows) (AC: #3) — preserve the expand/collapse row (`toggleRow`/`expandedRowId`), the dispute / reopen actions, the loading row, the empty state, and `payment-history-table` testid. Confirm the 12-1 `DataTable` supports an expandable-row affordance; if not natively, compose the expansion above/around the primitive without re-hand-rolling a `<table>`. [Source: apps/web/src/features/remuneration/pages/StaffPaymentHistoryPage.tsx:71]
- [ ] Task 9 — Retire `RegistryTestPage` (AC: #4) — delete `apps/web/src/features/dashboard/pages/RegistryTestPage.tsx`; remove any lazy import/route if one is found at implementation time (none at draft time); confirm a repo-wide grep for `RegistryTestPage` returns zero hits. [Source: apps/web/src/features/dashboard/pages/RegistryTestPage.tsx:1]
- [ ] Task 10 — Tests + green gate (AC: #5, #6) — update each surface's co-located `*.test.tsx` to pass against the migrated component asserting preserved behavior; add focused tests where a relied-on behavior (client-sort, row expand) lacks coverage; grep `<table` across the 8 migrated files to confirm none remains (document the legitimate out-of-scope chart-table hits); run `lint + tsc + build + test` green via `pnpm --filter @oslsr/web test`.

## Dev Notes

### Project-bible compliance (the dev MUST follow these — project-context.md)
- **Compose the shadcn primitive, don't rebuild.** This story is the canonical consumer of the 12-1 `DataTable` — every surface must route through `apps/web/src/components/ui/data-table.tsx`, not a fresh bespoke table.
- **Skeletons, not spinners.** Loading states use the primitive's `SkeletonTable` integration (`apps/web/src/components/skeletons/SkeletonTable.tsx`), replacing ad-hoc bare `<Skeleton>` rows (AuditLogResultsTable) and "Loading payment history…" `<td>` placeholders (StaffPaymentHistoryPage). Several surfaces (e.g. OfficialProductivityPage) already use `SkeletonTable` — preserve that.
- **Behavior-preserving migration + tests.** No new columns, no new endpoints, no UX redesign. Preserve existing `data-testid`s, `aria-label`s, sort semantics (server vs client per surface), pagination, row actions/click handlers, and empty/error states. Co-located web tests (`*.test.tsx`) stay co-located and are updated in lockstep.
- **Sort semantics differ per surface — do not homogenize.** `AuditLogResultsTable` deliberately does client-side sort over the visible page only (cross-page sort needs composite cursors, out of scope — see its header comment). The server-sorted pages drive a query param. Map each surface to the matching `DataTable` mode; do not "upgrade" a display-only table to sortable.
- **Pre-push gate runs lint + tsc + build + test** — run all four locally before declaring done (`VITEST_MAX_THREADS` cap applies; web tests via the web filter, never root `pnpm vitest run`).

### Project Structure Notes
- Migrated files live under `apps/web/src/features/<name>/{pages,components}/`; the shared primitive at `apps/web/src/components/ui/data-table.tsx` (12-1); the skeleton at `apps/web/src/components/skeletons/SkeletonTable.tsx`. Tests are co-located in each feature's `__tests__/` directory (already present for all 8 surfaces).
- **Confirmed raw-table surfaces (grep `<table` 2026-06-16):** the §3c brief lists 10; this story migrates 8. The two excluded: `RespondentRegistryTable` (→ 12-7) and `RegistryTestPage` (retired). All 8 in-scope surfaces were verified to still hand-roll a raw `<table>` at the cited lines. `RevealAnalyticsPage` has **two** raw tables (both in scope, Task 7).
- **RegistryTestPage is orphaned:** a repo-wide grep for `RegistryTestPage` / `registry-test` returns only its own file — no import in `App.tsx` and no route config references it. Retirement is therefore a clean delete; the AC4 grep guard catches any hidden reference.

### References
- [Source: apps/web/src/components/ui/data-table.tsx] — the 12-1 `DataTable` primitive (server-pagination + client-sort recipe) being consumed (absent at draft time — confirms the 12-1 dependency).
- [Source: apps/web/src/components/skeletons/SkeletonTable.tsx] — shadcn skeleton table for loading states.
- [Source: apps/web/src/features/audit-log/components/AuditLogResultsTable.tsx:1-13] — header comment documenting the client-sort-over-visible-page semantics (preserve in AC1).
- [Source: apps/web/src/features/audit-log/components/AuditLogResultsTable.tsx:162] — the proof-case raw `<table>`.
- [Source: apps/web/src/features/dashboard/pages/OfficialProductivityPage.tsx:194-238] — `SkeletonTable` loading + `SortHeader` server-sort table.
- [Source: apps/web/src/features/dashboard/pages/AssessorCompletedPage.tsx:188] — server-sort raw `<table>`.
- [Source: apps/web/src/features/dashboard/pages/SupervisorTeamPage.tsx:157] — "Team roster" raw `<table>`.
- [Source: apps/web/src/features/dashboard/pages/RespondentDetailPage.tsx:341-353] — display-only submission-history `<table>` (8 columns + View link).
- [Source: apps/web/src/features/dashboard/pages/SystemHealthPage.tsx:97] — display-only raw `<table>`.
- [Source: apps/web/src/features/marketplace/pages/RevealAnalyticsPage.tsx:126] — top-viewers raw `<table>`.
- [Source: apps/web/src/features/marketplace/pages/RevealAnalyticsPage.tsx:163] — top-profiles raw `<table>`.
- [Source: apps/web/src/features/remuneration/pages/StaffPaymentHistoryPage.tsx:69-99] — expandable-row raw `<table>` (toggle + actions + loading `<td>`).
- [Source: apps/web/src/features/dashboard/pages/RegistryTestPage.tsx:1-4] — "Remove this file after debugging" debug page (retire, AC4).
- [Source: apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx] — OUT OF SCOPE (owned by 12-7); do not touch.
- Co-located tests: `apps/web/src/features/audit-log/__tests__/AuditLogResultsTable.test.tsx`; `apps/web/src/features/dashboard/pages/__tests__/{OfficialProductivityPage,AssessorCompletedPage,SupervisorTeamPage,SystemHealthPage,RespondentDetailPage}.test.tsx`; `apps/web/src/features/marketplace/__tests__/RevealAnalyticsPage.test.tsx`; `apps/web/src/features/remuneration/pages/__tests__/StaffPaymentHistoryPage.test.tsx`.

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List

## Change Log

| Date | Change |
|---|---|
| 2026-06-16 | Story drafted (ready-for-dev) by Bob (SM) via create-story for Epic 12 Track-A. Grounded against the live web tree: confirmed all 8 in-scope raw-table surfaces + their paths/lines, confirmed RevealAnalyticsPage has two tables, confirmed RegistryTestPage is orphaned (delete-only retire), and confirmed the 12-1 DataTable primitive is absent (hard dependency). RespondentRegistryTable excluded (12-7). POST-LAUNCH, NON-GATING. |
