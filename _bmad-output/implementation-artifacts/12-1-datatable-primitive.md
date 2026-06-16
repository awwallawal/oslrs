# Story 12.1: DataTable primitive (keystone)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Drafted 2026-06-16 by Bob (SM) via *create-story --yolo as the Epic 12 "Dashboard System Refresh" Tier-0 / Track-B (design-system) foundation. POST-LAUNCH, NON-GATING. Grounded against the live tree: table.tsx is MISSING from components/ui (confirmed by glob); @tanstack/react-table@^8.21.3 is ALREADY a dependency (apps/web/package.json:31) so this story does NOT add the dep. Two raw-<table> shapes verified for the dual-mode proof: RespondentRegistryTable (server pagination) + AuditLogResultsTable (client sort). -->

## Story

As a **dashboard/feature developer building Epic 12 (Registry, audit, role dashboards, raw-table sweep)**,
I want **one shared shadcn `table.tsx` primitive plus a reusable TanStack-Table `DataTable` recipe that handles BOTH server-side pagination AND client-side sort**,
so that **every table page composes one accessible, skeleton-aware, consistently-styled component instead of hand-rolling a fresh raw `<table>` (the current pattern), and the migration stories that follow (12-7, 12-10, 12-12 to 12-18) have a single keystone to build on.**

## Context & Why (the verified problem)

**POST-LAUNCH, NON-GATING — no Field Readiness Certificate (FRC) item depends on this story; it must NOT block the field survey or the re-engagement (Cohort A/B) blasts.** This is design-system foundation work in the Dashboard System Refresh epic.

Every data table in the web app is a hand-rolled raw `<table>` with its own copy of header rendering, sort icons, pagination controls, loading, and empty state. There is **no shared `table.tsx` shadcn primitive** in `components/ui` (verified: the directory has 16 primitives — accordion, alert-dialog, badge, button, card, checkbox, dropdown-menu, input, label, navigation-menu, select, sheet, skeleton, switch, tabs, textarea — but **no `table.tsx`**). The two canonical shapes prove the divergence:

- **Server-pagination shape** — `RespondentRegistryTable.tsx` builds a raw `<table>` at `apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx:267`, drives TanStack Table in `manualPagination`/`manualSorting` mode (`:235-250`), and hand-codes Prev/Next + page-size controls (`:325-365`), the sort-icon header (`:163-168`, `:272-283`), the empty state (`:289-297`), and a `SkeletonTable` loading branch (`:259-262`).
- **Client-sort shape** — `AuditLogResultsTable.tsx` builds an entirely separate raw `<table>` at `apps/web/src/features/audit-log/components/AuditLogResultsTable.tsx:162`, but does NOT use TanStack at all — it hand-rolls `useState` sort + an in-memory `useMemo` `.sort()` over the visible page (`:102-137`), its own `SortableHeader` with `aria-sort` (`:257-288`), its own `<Skeleton>` loading rows (`:139-147`), and its own empty state (`:149-158`).

So the two pages disagree on markup, sort-icon set (`ChevronUp/ChevronDown/ChevronsUpDown` vs `ArrowUp/ArrowDown/ArrowUpDown`), accessibility (`AuditLogResultsTable` has `aria-sort`; `RespondentRegistryTable` does not), loading (`SkeletonTable` vs ad-hoc `<Skeleton>` rows), and empty-state copy. Each new Epic-12 table page would otherwise add a fourth/fifth copy.

This story delivers the **keystone**: (1) the missing shadcn `table.tsx` element primitive, and (2) a `DataTable` recipe that proves BOTH shapes up front. **No page migrations happen in this story** — only the primitive, its tests, and a short usage doc. The migrations are downstream stories.

The risk to kill is "the DataTable only fits one page." The AC therefore **require** the component to demonstrate both the server-pagination contract (controlled `page`/`pageSize`/`total`/`onPageChange`) and the client-sort contract (sortable column defs + internal sort state) in its own unit tests, before any consumer adopts it.

### Dependencies, sequencing & effort

- **Epic:** 12 — Dashboard System Refresh (Track B — design-system foundation).
- **Tier:** Tier 0 — keystone. This is the foundation the table-bearing stories build on.
- **Depends on:** nothing in-epic — it is a leaf foundation. `@tanstack/react-table@^8.21.3` is **already installed** (`apps/web/package.json:31`), so there is no dependency-add gate. (NOTE: 12-1 is independent of the 9-59 canonical data-status/key-normalization modules — those are an API-side foundation consumed by 12-4/12-7, not by this UI primitive.)
- **Unblocks (this is the keystone for):** 12-7 (Registry refresh), 12-10 (raw-`<table>` sweep), and the role dashboards 12-12 to 12-18. Per the epic spine: `12-1(DataTable) -> {12-7, 12-10, 12-12 to 12-18}`.
- **Explicitly OUT of scope here:** migrating `RespondentRegistryTable` or `AuditLogResultsTable` (or any other page) onto `DataTable` — those are 12-7 / 12-10. This story ships the primitive + tests + usage doc only.
- **Effort:** ~1 dev-day (primitive + recipe + dual-mode tests + doc; no API work, no migrations).

## Acceptance Criteria

### AC1 — shadcn `table.tsx` element primitive (the missing base)
1. A new `apps/web/src/components/ui/table.tsx` is added following the project's shadcn "new-york" house style (verified `components.json:3`): named exports `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption`, each a thin `React.forwardRef` wrapper over the native element (`table`/`thead`/`tbody`/`tfoot`/`tr`/`th`/`td`/`caption`) composing classes via `cn(...)` from `../../lib/utils` (matching how `button.tsx` imports `cn`).
2. `Table` renders inside an `overflow-x-auto` wrapper (horizontal scroll for wide tables, mirroring the existing pages). Semantics are correct: `TableHeader` -> `<thead>`, `TableBody` -> `<tbody>`, `TableHead` -> `<th>`, `TableCell` -> `<td>`.
3. The primitive is presentational only — no TanStack coupling, no data props — so it can back the `DataTable` recipe AND be used standalone.

### AC2 — `DataTable` recipe: shared column-def contract
1. A new `DataTable<TData, TValue>` component (e.g. `apps/web/src/components/ui/data-table.tsx` or `components/data-table/DataTable.tsx`) accepts `columns: ColumnDef<TData, TValue>[]` (TanStack `ColumnDef`) and `data: TData[]`, and renders them via `useReactTable` + `flexRender` into the AC1 `table.tsx` primitives.
2. Column behaviour is driven entirely by the standard TanStack `ColumnDef` fields already used in the codebase — `accessorKey`/`id`, `header`, `cell`, and `enableSorting` (consistent with `RespondentRegistryTable.tsx:64-149`) — so existing column builders can be reused by future consumers without rewriting them.
3. Optional `onRowClick?: (row: TData) => void`; when provided, rows are keyboard-activatable (`role="button"`, `tabIndex={0}`, Enter/Space) mirroring the audit-table pattern (`AuditLogResultsTable.tsx:198-211`). When absent, rows are plain non-interactive `<tr>`s.

### AC3 — Server-pagination mode (the Registry shape)
1. When a `pagination` prop is supplied as `{ mode: 'server', page, pageSize, total, onPageChange, onPageSizeChange? }`, the table runs in `manualPagination: true` / `manualSorting: true` and renders the page of `data` as-is (no client re-sort, no client slicing) — the parent owns fetching, exactly like `RespondentRegistryTable` (`:239-241`).
2. A pagination footer renders Prev/Next controls (using the existing `Button` `variant="outline" size="sm"`) plus a "Rows per page" select when `onPageSizeChange` is provided; Prev is disabled on the first page and Next is disabled when `page * pageSize >= total` (derive `hasNext`/`hasPrev` from `page`/`pageSize`/`total`). `onPageChange` is invoked with the next/previous page index.
3. Sorting in server mode is controlled: `sorting`/`onSortingChange` are passed through to the parent (no in-memory sort); sortable headers show the sort indicator and call the parent handler.

### AC4 — Client-sort mode (the Audit shape)
1. When `pagination` is omitted (or `{ mode: 'client' }`), the table sorts **in memory over the provided rows** using TanStack's `getSortedRowModel()` with internal `sorting` state — no parent sort handler required, mirroring the audit table's "sort the visible page only" contract (`AuditLogResultsTable.tsx:105-137`; cross-page sort is explicitly out of scope, same as v1 audit).
2. Columns with `enableSorting !== false` render a clickable, accessible sortable header: a `<button>` inside `<TableHead>` with `aria-sort` reflecting `none`/`ascending`/`descending`, toggling asc -> desc -> (clear) on click, and a visible sort icon.
3. No pagination footer renders in client mode (the parent passes the full set it wants shown).

### AC5 — Loading, empty state, accessibility
1. A `isLoading` prop renders the existing `SkeletonTable` (`apps/web/src/components/skeletons/SkeletonTable.tsx`) sized to the column count — skeleton screens, **not spinners** (project rule). No raw `<Skeleton>` row hand-rolling.
2. When `data` is empty and not loading, an empty state renders inside the table body as a single full-width row (`colSpan` = visible column count), with caller-overridable copy via an `emptyMessage?: string` prop (default e.g. "No results found.").
3. Accessible semantics throughout: real `<thead>/<th>` headers via the primitive, `scope="col"` on header cells, `aria-sort` on sortable headers (AC4.2), and `aria-busy`/`aria-label` on the loading state (inherited from `SkeletonTable`, which already sets `aria-busy`/`aria-label`). Keyboard activation for clickable rows (AC2.3).

### AC6 — Usage doc + dual-mode tests (the keystone proof)
1. A short usage doc is delivered co-located with the component (e.g. `apps/web/src/components/ui/data-table.README.md` or a `docs/` design-system note) showing BOTH a server-pagination example (Registry shape) AND a client-sort example (Audit shape), with the column-def contract and the prop table. It must explicitly state that page migrations are tracked separately (12-7 / 12-10).
2. Co-located unit tests (`*.test.tsx`, web convention) cover BOTH modes against the SAME `DataTable`, proving the "fits one page only" risk is killed:
   - **Server mode:** renders the provided page rows; Prev disabled on page 1; Next disabled at last page; clicking Next/Prev calls `onPageChange` with the right index; page-size change calls `onPageSizeChange`; no client re-sort occurs (rows render in the order given).
   - **Client mode:** clicking a sortable header reorders rows in the DOM; `aria-sort` updates none -> ascending -> descending; a non-sortable column header has no sort button.
   - **Shared:** `isLoading` shows the skeleton (and no data rows); empty data shows the empty message with correct `colSpan`; `onRowClick` fires on click and on Enter/Space; header cells carry `scope="col"`.
   - A render test for the `table.tsx` primitive (AC1) asserting correct element tags.

## Tasks / Subtasks

- [ ] Task 1 — Add the shadcn `table.tsx` element primitive (AC: #1, #2, #3)
  - [ ] Subtask 1.1 — Create `apps/web/src/components/ui/table.tsx` with `Table`/`TableHeader`/`TableBody`/`TableFooter`/`TableRow`/`TableHead`/`TableCell`/`TableCaption`, each `React.forwardRef`, composing `cn(...)` from `../../lib/utils`; `Table` wrapped in an `overflow-x-auto` div. Match the "new-york" baseColor `neutral` token classes used by sibling primitives (e.g. `text-muted-foreground`, `border-b`).
  - [ ] Subtask 1.2 — Add `scope="col"` default on `TableHead` and `data-slot` attributes consistent with the other ui primitives (e.g. `button.tsx:59`).

- [ ] Task 2 — Build the `DataTable` recipe shell + column-def contract (AC: #2)
  - [ ] Subtask 2.1 — Create the `DataTable<TData, TValue>` component composing the AC1 primitives via `useReactTable` + `flexRender`; accept `columns`, `data`, optional `onRowClick`, `isLoading`, `emptyMessage`, `getRowId?`.
  - [ ] Subtask 2.2 — Render clickable rows (keyboard-activatable, `role="button"`/`tabIndex`) only when `onRowClick` is provided; otherwise plain rows.

- [ ] Task 3 — Server-pagination mode (AC: #3)
  - [ ] Subtask 3.1 — Accept `pagination={ mode:'server', page, pageSize, total, onPageChange, onPageSizeChange? }`; set `manualPagination`/`manualSorting`; pass through controlled `sorting`/`onSortingChange`.
  - [ ] Subtask 3.2 — Render the footer: Prev/Next via `Button variant="outline" size="sm"`, derive `hasPrev`/`hasNext` from `page`/`pageSize`/`total`, optional rows-per-page `select` (10/20/50/100) wired to `onPageSizeChange`.

- [ ] Task 4 — Client-sort mode (AC: #4)
  - [ ] Subtask 4.1 — When `pagination` is omitted/`mode:'client'`, use internal `sorting` state + `getSortedRowModel()`; no footer.
  - [ ] Subtask 4.2 — Sortable header `<button>` inside `TableHead` with `aria-sort`, asc -> desc -> clear toggle, visible sort icon (reuse lucide icons already in the tree).

- [ ] Task 5 — Loading, empty, accessibility (AC: #5)
  - [ ] Subtask 5.1 — `isLoading` -> render `SkeletonTable` sized to `columns.length`.
  - [ ] Subtask 5.2 — Empty (`data.length === 0 && !isLoading`) -> single full-width `TableRow`/`TableCell colSpan` with `emptyMessage`.
  - [ ] Subtask 5.3 — Confirm `scope="col"` headers, `aria-sort`, keyboard row activation.

- [ ] Task 6 — Usage doc (AC: #6.1)
  - [ ] Subtask 6.1 — Write the co-located README/MDX with a server example, a client example, the column-def contract, the prop table, and a note that migrations are 12-7 / 12-10 (this story ships the primitive only).

- [ ] Task 7 — Tests for BOTH modes + the primitive (AC: #6.2)
  - [ ] Subtask 7.1 — `data-table.test.tsx`: server-mode tests (page rows render, Prev/Next disabled states + handler calls, page-size change, no client re-sort).
  - [ ] Subtask 7.2 — `data-table.test.tsx`: client-mode tests (header click reorders DOM, `aria-sort` cycles, non-sortable header has no button).
  - [ ] Subtask 7.3 — Shared tests (`isLoading` skeleton + no rows; empty message + `colSpan`; `onRowClick` on click + Enter/Space; `scope="col"`).
  - [ ] Subtask 7.4 — `table.test.tsx`: primitive renders correct element tags.
  - [ ] Subtask 7.5 — Run `cd apps/web && pnpm vitest run` (web config) — new tests green, zero regressions; `pnpm lint` clean.

## Dev Notes

### Project-bible compliance (the dev MUST follow these — project-context.md)
- **Reuse, do NOT rebuild.** Compose the existing `SkeletonTable` (`components/skeletons/SkeletonTable.tsx`) and `Button` (`components/ui/button.tsx`) — do not hand-roll skeleton rows (the audit table's ad-hoc `<Skeleton>` loop at `AuditLogResultsTable.tsx:139-147` is the anti-pattern this primitive replaces) and do not re-implement pagination buttons. `@tanstack/react-table` is already installed (`apps/web/package.json:31`) — import it, do not add a new dep.
- **Skeletons, not spinners** for tables/data (`SkeletonTable`), per the loading-state rule.
- **shadcn house style:** `components.json` is `style: "new-york"`, `baseColor: "neutral"`, `iconLibrary: "lucide"`. The existing `components/ui` primitives use **relative** imports for `cn` (`button.tsx:5` -> `../../lib/utils`), not the `@/` alias — match that to stay consistent with siblings even though the alias exists.
- **Web test convention:** tests are **co-located** `*.test.tsx` (e.g. `PageSkeleton.test.tsx` sits beside its component), run via `cd apps/web && pnpm vitest run` (NEVER `pnpm vitest run` from repo root — wrong config). Use `@testing-library/react` + `@testing-library/user-event` (already devDeps).
- **No API / backend work, no UUIDv7, no DB** — this is a pure presentational web primitive. No AppError/Pino/raw-SQL-drift concerns apply (those are API-side rules; called out only to confirm they are N/A here).
- **TanStack Query keys / DashboardLayout `p-6`** are consumer concerns (the pages that adopt this in 12-7/12-10), not this primitive — `DataTable` itself adds no page padding and owns no query keys.

### Reuse-don't-fork map (concrete)
- Server-pagination reference (do NOT migrate it — mirror its contract): `RespondentRegistryTable.tsx` — `manualPagination`/`manualSorting` config `:235-250`, sort-icon header `:272-283`, Prev/Next + page-size footer `:325-365`, `SkeletonTable` branch `:259-262`, empty row `:289-297`.
- Client-sort reference (do NOT migrate it — mirror its contract): `AuditLogResultsTable.tsx` — in-memory sort `:105-137`, accessible `SortableHeader` with `aria-sort` `:257-288`, keyboard row activation `:198-211`, empty state `:149-158`.
- The `DataTable` should be general enough that 12-7 can pass `RespondentRegistryTable`'s existing `buildColumns()` output and 12-10 can fold the audit page in, without either having to change its column definitions.

### Project Structure Notes
- New files live under `apps/web/src/components/ui/` (the shadcn primitive home) and/or `apps/web/src/components/data-table/` for the recipe — keep the element primitive (`table.tsx`) in `ui/` and the opinionated recipe (`DataTable`) either in `ui/` (`data-table.tsx`) or its own `components/data-table/` folder; pick one and be consistent. Tests co-located. Usage doc co-located with the recipe.
- No changes to `App.tsx` routing, no new routes, no feature-folder changes (no `features/<name>/` work) — this is shared infrastructure under `components/`.
- Adds zero new dependencies; no `package.json` change expected (verify `@tanstack/react-table` import resolves — it is at `^8.21.3`).

### References
- [Source: apps/web/src/components/ui/] — 16 existing primitives; **no `table.tsx`** (the gap this story fills).
- [Source: apps/web/components.json:3-13] — shadcn `style: "new-york"`, `baseColor: "neutral"`, lucide icons, `@/` aliases (siblings use relative imports though).
- [Source: apps/web/src/lib/utils.ts:4-6] — `cn(...)` helper to compose classes.
- [Source: apps/web/src/components/ui/button.tsx:5,59] — sibling primitive house style (`cn` via `../../lib/utils`, `data-slot`, `forwardRef`).
- [Source: apps/web/package.json:31] — `@tanstack/react-table: ^8.21.3` already a dependency (no add needed).
- [Source: apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx:235-365] — server-pagination shape to mirror (manual mode + footer + skeleton + empty).
- [Source: apps/web/src/features/audit-log/components/AuditLogResultsTable.tsx:102-288] — client-sort shape to mirror (in-memory sort + `aria-sort` header + keyboard rows + empty).
- [Source: apps/web/src/components/skeletons/SkeletonTable.tsx:39-88] — `SkeletonTable` (columns/rows/withHeader; sets `aria-busy`/`aria-label`) to reuse for loading.
- [Source: apps/web/src/components/skeletons/PageSkeleton.test.tsx] — example of the co-located web test convention.

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List

## Change Log

| Date | Change |
|---|---|
| 2026-06-16 | Story drafted via SM *create-story (Epic 12 Tier-0 foundation). |
