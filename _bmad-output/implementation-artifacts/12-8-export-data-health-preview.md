# Story 12.8: Export data-health preview

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-16 by Bob (SM) via the create-story workflow as an Epic 12 "Dashboard System Refresh" Tier-1 story. POST-LAUNCH, NON-GATING. This is the WIRE-IN surface for 9-59's unified export (which currently downloads blind) + the home of the deferred 9-59 Low finding (unified mode blocked when no form is published). It consumes 12-4's `getRegistryTotals()` for the data-health summary numbers and reuses the existing count plumbing for the column/row counts — it does NOT build a second dataset path. Cite registry-data-status.ts / 12-4 by path; never redefine the taxonomy. -->

## Story

As a **super-admin / government official about to export the registry**,
I want **a data-health preview on the Export page that shows what I'm about to download — the 139→76 funnel by `data_status`, plus the column/row counts for the selected mode — before I click download**,
so that **I understand the file before I open it (why "139 rows, 76 with answers" is correct, not broken), and I'm told up-front when a mode can't run (e.g. Full registry needs a published form) instead of getting a blind download or an opaque error.**

## Context & Why (the blind-download gap this resolves)

9-59 (MERGED) shipped the **unified export mode** (`exportType='unified'`): all 139 respondents + answers-where-present + a `data_status` column [Source: apps/api/src/controllers/export.controller.ts:168-283; apps/api/src/services/export-query.service.ts:283-382]. But it downloads **blind** — the operator clicks "Export CSV" and only discovers the shape of the file (139 rows, only 76 with answers, a `Data Status` column they didn't expect) *after* opening it. The 9-59 review even acknowledged this gap and explicitly deferred the fix here: *"Surface that to the operator via a structured warning rather than silently losing data (a full pre-download preview is Epic 12 / 12-8)."* [Source: apps/api/src/controllers/export.controller.ts:222-227].

12-4 (`getRegistryTotals()`, ready-for-dev) produces the authoritative data-health numbers — `{ totalRespondents: 139, byDataStatus: { completed: 76, data_lost: 55, no_submission: 7, pending_nin: 1, ... }, withAnswers: 76 }` [Source: _bmad-output/implementation-artifacts/12-4-registrytotals-model.md AC2/AC3]. 12-8 is the surface that **renders those numbers as a pre-download preview** on the Export page, alongside the column/row counts for the selected mode. The Export page already has a live record-count preview (`useExportPreviewCount`) and an explainer paragraph for unified mode [Source: apps/web/src/features/dashboard/pages/ExportPage.tsx:85,157-164]; this story upgrades that thin count into a real data-health summary.

**POST-LAUNCH, NON-GATING — no FRC item depends on it; must not block the field survey or re-engagement blasts.** The export already works (9-59); this is a quality-of-life legibility layer so the operator isn't surprised by the file. It is also where the deferred 9-59 "no published form" finding is formally resolved (see AC4 + the Dev Notes "Deferred 9-59 finding" subsection).

### Dependencies, sequencing & effort (SM, 2026-06-16)

- **Dependency spine:** `9-59 (unified mode + row-level data_status atom) + 12-4 (getRegistryTotals aggregate) → 12-8 (this story: the pre-download preview)`. 12-8 is the wire-in point that surfaces 9-59's unified mode with a data-health preview, reading 12-4's aggregate for the summary numbers.
- **Hard dependency (DONE, on main):** 9-59 unified mode + `registry-data-status.ts` (`REGISTRY_DATA_STATUSES`, `RegistryDataStatus`) [Source: apps/api/src/services/registry-data-status.ts:26-35].
- **Hard dependency (ready-for-dev; 12-8 consumes its output):** 12-4 `GET /api/v1/analytics/registry-totals` returning `{ totalRespondents, byDataStatus, withAnswers }` [Source: _bmad-output/implementation-artifacts/12-4-registrytotals-model.md AC5]. **If 12-4 has not landed when 12-8 is picked up, sequence 12-4 first** — do NOT re-implement the aggregate here (it owns it). 12-8 only reads it.
- **Reuses (do NOT fork):** the existing count plumbing `ExportQueryService.getFilteredCount` / `getSubmissionFilteredCount` [Source: apps/api/src/services/export-query.service.ts:162-176,249-265] and `GET /api/v1/exports/respondents/count` [Source: apps/api/src/controllers/export.controller.ts:348-380]; the published-forms affordance `usePublishedForms()` / `GET /api/v1/exports/forms` [Source: apps/web/src/features/dashboard/hooks/useExport.ts:36-43; apps/api/src/controllers/export.controller.ts:386-406]; `buildColumnsFromFormSchema` + `UNIFIED_METADATA_COLUMNS` / `SUBMISSION_METADATA_COLUMNS` for column counts [Source: apps/api/src/services/export-query.service.ts:495-561]; shadcn `Card`/`Skeleton`/`Badge`.
- **Decision required in this story (see AC4 + Dev Notes):** the deferred 9-59 "unified mode blocked when no form published" finding. **Recommended default: Option B** — document Summary mode as the accepted no-published-form answer and have the preview detect the no-published-form state and direct the operator to Summary mode. Rationale grounded below.
- **Effort:** ~1–1.5 dev-days (mostly web; one small read-only backend addition).

## Acceptance Criteria

### AC1 — Data-health preview panel on the Export page (the legibility surface)
1. The Export page gains a **data-health preview** panel (compose shadcn `Card`; no custom widget) that, for the current filters/mode, shows the registry summary by `data_status` sourced from 12-4's `getRegistryTotals()` — at minimum `totalRespondents` (139) and a per-`data_status` breakdown (completed 76 / data_lost 55 / no_submission 7 / pending_nin 1, plus any non-zero others), rendered as labeled counts (e.g. small badges or a compact list), with `withAnswers` (76) called out as "with questionnaire answers".
2. The breakdown iterates the canonical `REGISTRY_DATA_STATUSES` order with human labels (e.g. `data_lost` → "Data lost") so a future taxonomy member flows through without a hardcoded list; statuses with a zero count may be hidden or shown muted (dev's call — state in File List).
3. The preview is shown for the **unified** mode (its primary purpose — explaining "139 rows, 76 with answers"); for Summary/Full modes it MAY show the same registry health context but MUST NOT misrepresent the Full-mode row meaning (Full = one row per submission). State the per-mode behavior in Dev Notes.

### AC2 — Column & row counts for the selected mode (what the file will contain)
1. The preview shows the **row count** for the selected mode using the EXISTING count plumbing — `getFilteredCount` (Summary/unified = distinct respondents) or `getSubmissionFilteredCount` (Full = submissions) — NOT a full dataset build. Reuse `useExportPreviewCount` / `GET /api/v1/exports/respondents/count`; do not add a second count path.
2. The preview shows the **column count** for the selected mode when a form is selected: unified = `UNIFIED_METADATA_COLUMNS.length + buildColumnsFromFormSchema(schema).length`; Full = `SUBMISSION_METADATA_COLUMNS.length + form columns`; Summary = the fixed `EXPORT_COLUMNS` count. The column count comes from a **lightweight schema/metadata-column calc, never a row build** (respect the existing PDF 1000-row cap at `export.controller.ts:40` and the unified `UNIFIED_MAX_ROWS = 50000` cap at `export.controller.ts:50` — the preview must not materialize the dataset).
3. The preview communicates the active caps where relevant (e.g. for unified, "up to 50,000 respondents"; for PDF, the 1,000-row limit already surfaced) so the counts are read in context.

### AC3 — Lightweight preview data (no full dataset materialization; caps respected)
1. The summary counts come from 12-4's `getRegistryTotals` (an aggregate, not a row dump) and the row count from the existing COUNT query — neither builds the export payload. Adding a thin backend helper is allowed ONLY if it is a pure aggregate/count (e.g. a tiny `/exports/respondents/preview` that returns `{ totalRespondents, byDataStatus, withAnswers, rowCount, columnCount }` by composing `getRegistryTotals` + the existing COUNT + a schema column count) — it MUST NOT call `getUnifiedExportData`/`getSubmissionExportData`. Dev's call whether to add this composite endpoint or compose client-side from the two existing endpoints (12-4 totals + export count); record the choice in File List with rationale.
2. The preview re-fetches on filter/mode/form change using the existing 300 ms debounce already wired in `ExportPage` [Source: apps/web/src/features/dashboard/pages/ExportPage.tsx:74-80]; TanStack Query keys follow the existing `exportKeys`/analytics-key conventions (e.g. `['analytics','registry-totals',...]` for the 12-4 read).

### AC4 — No-published-form decision (the deferred 9-59 finding) — Option B (documented default)
1. **Decision (this story formally records it): Option B.** Summary mode is the accepted export path for the no-published-form case. The unified (and Full) mode require a published form for answer columns + label mapping [Source: apps/api/src/controllers/export.controller.ts:177-188; 104-123], and the pure identity dump is already served by Summary mode [Source: apps/api/src/services/export-query.service.ts:60-156]. 12-8 does NOT add an identity-only unified path (that would be throwaway and overlaps Epic 12 registry work — consistent with the 9-59 review's [RESOLVED — by design] closure [Source: _bmad-output/implementation-artifacts/9-59-unified-registry-export.md "Review Follow-ups" last item]).
2. When NO form is published (`publishedForms.length === 0`, the existing affordance [Source: apps/web/src/features/dashboard/pages/ExportPage.tsx:171-175]) and the operator has unified or Full selected, the preview MUST detect this and render a clear, non-error informational state (compose shadcn — NOT a spinner/error toast) that: (a) explains the mode needs a published form; (b) directs the operator to **Summary mode** for an everyone-identity export now; and (c) optionally offers a one-click switch to Summary. The download button stays disabled (existing `isFormRequired` behavior is preserved/extended, not replaced).
3. The no-published-form case is documented as a deliberate, accepted state — the preview communicates it rather than the operator hitting the 400 (`formId is required for Unified export`) blind [Source: apps/api/src/controllers/export.controller.ts:177-183].

### AC5 — Loading & empty states (skeletons, not spinners)
1. While the preview data is loading, render shadcn `Skeleton` placeholders (matching the existing count-preview skeleton pattern [Source: apps/web/src/features/dashboard/pages/ExportPage.tsx:345-346]) — NOT spinners.
2. When a count is zero, the existing zero-state behavior is preserved (export button disabled when `recordCount === 0` [Source: apps/web/src/features/dashboard/pages/ExportPage.tsx:413]); the preview shows the breakdown without implying an error.
3. If the 12-4 totals fetch errors, the preview degrades gracefully (show the row/column counts that DID load + a muted "registry health unavailable" note) — it must not crash the page or block a download the operator is entitled to.

### AC6 — Tests
1. **Web (co-located):** `ExportPage` (or a new `ExportPreview` component) test asserting: the data-health breakdown renders the per-`data_status` counts from a mocked 12-4 totals response (incl. the documented 139=76+55+7+1 shape); the column/row counts render for unified/Full/Summary; the no-published-form Option-B state renders with the Summary-mode direction and the download button stays disabled; the loading state shows skeletons not spinners; the totals-error degraded state renders without crashing.
2. **API (only IF a composite preview endpoint is added — `__tests__/`):** controller test that the endpoint composes `getRegistryTotals` + the existing COUNT + the column count and returns the camelCase `{ totalRespondents, byDataStatus, withAnswers, rowCount, columnCount }` shape, under the existing RBAC, WITHOUT invoking `getUnifiedExportData`/`getSubmissionExportData` (assert those services are not called). If the dev composes client-side instead, this sub-AC is N/A — record that decision in File List.

## Tasks / Subtasks

- [ ] Task 1 — Preview data source (AC: #1, #2, #3)
  - [ ] Decide composite-endpoint vs client-side composition (record in File List with rationale). If composite: add a read-only `GET /api/v1/exports/respondents/preview` (or `/analytics/...`) controller method that returns `{ totalRespondents, byDataStatus, withAnswers, rowCount, columnCount }` by composing 12-4's `getRegistryTotals` + the existing `getFilteredCount`/`getSubmissionFilteredCount` + a schema/metadata column-count calc — NEVER calling `getUnifiedExportData`/`getSubmissionExportData`. Inherit the existing export RBAC.
  - [ ] If client-side: add a hook (e.g. `useRegistryTotals`) reading 12-4's `/analytics/registry-totals`, and compute the column count from the selected form schema + the metadata-column constants (expose the constants' lengths to web if needed, or hardcode-with-a-comment-citing-the-constant).
- [ ] Task 2 — Data-health preview panel on `ExportPage` (AC: #1, #2, #5)
  - [ ] Compose a shadcn `Card` preview (new `ExportPreview` component under `features/dashboard/components/` recommended) showing: total respondents, per-`data_status` breakdown (iterate `REGISTRY_DATA_STATUSES` with human labels), `withAnswers` callout, row count + column count for the selected mode, and the relevant cap note.
  - [ ] Skeleton loading (not spinners); graceful degraded state if totals error (AC5.3).
  - [ ] Re-fetch on filter/mode/form change via the existing 300 ms debounce + TanStack Query keys.
- [ ] Task 3 — No-published-form Option-B handling (AC: #4)
  - [ ] When `publishedForms.length === 0` and unified/Full is selected, render the informational state directing to Summary mode (compose shadcn; optional one-click switch to Summary); keep the download button disabled. Document the decision inline + in Dev Notes.
- [ ] Task 4 — Tests (AC: #6)
  - [ ] Web co-located tests (breakdown render, column/row counts per mode, Option-B no-form state, skeleton loading, totals-error degraded state).
  - [ ] API `__tests__/` controller test ONLY if a composite endpoint was added (assert composition + no dataset-build calls + RBAC); else mark N/A in File List.
- [ ] Task 5 — Validate: web suite green (`cd apps/web && pnpm vitest run` — never root vitest for web); if backend touched, api targeted suite + `tsc --noEmit` + eslint clean.

## Dev Notes

### Project-bible compliance (the dev MUST follow these — project-context.md)
- **Reuse shadcn primitives — compose, don't rebuild.** The preview is a composed `Card` + `Badge`/`Skeleton`, not a bespoke chart. No new widget library.
- **Skeletons, not spinners** for loading (AC5) — mirror the existing `Skeleton` count-preview at `ExportPage.tsx:345-346`.
- If a backend endpoint is added: throw `AppError` (never raw `Error`); Pino structured logs (`{ event: 'export.preview_…' }`), never `console.log`; ESM relative imports carry `.js`; backend tests in `__tests__/`; inherit the existing export RBAC (do not add a new authorize chain).
- **Respect the caps — the preview must NOT materialize the dataset.** PDF 1,000-row cap [Source: apps/api/src/controllers/export.controller.ts:40], unified `UNIFIED_MAX_ROWS = 50000` [Source: apps/api/src/controllers/export.controller.ts:50]. The summary is an aggregate (12-4), the row count is a COUNT, the column count is a schema/constant calc — none build rows.
- **TanStack Query keys** follow `exportKeys` (web) [Source: apps/web/src/features/dashboard/hooks/useExport.ts:13-18] and the analytics key convention for the 12-4 read.

### Consume — do NOT redefine — the taxonomy & the aggregate
- The per-`data_status` labels iterate `REGISTRY_DATA_STATUSES` from `registry-data-status.ts` (9-59, on main) [Source: apps/api/src/services/registry-data-status.ts:26-35] — do NOT hand-type a status list (drift-proof; a 9-59 taxonomy addition flows through).
- The summary numbers come from **12-4's `getRegistryTotals()`** — 12-8 reads it, never re-derives the aggregate. 12-4 owns the aggregate; 9-59 owns the row atom; 12-8 owns the presentation. If 12-4 isn't merged yet, land it first (see Dependencies).
- The column counts reuse `UNIFIED_METADATA_COLUMNS` / `SUBMISSION_METADATA_COLUMNS` / `EXPORT_COLUMNS` lengths + `buildColumnsFromFormSchema` [Source: apps/api/src/services/export-query.service.ts:495-561; apps/api/src/controllers/export.controller.ts:53-72] — the same column builders the real export uses, so the preview count matches the file.

### Deferred 9-59 finding — the no-published-form decision (Option A vs B)
This story is the formal home of the deferred 9-59 Low finding: **unified mode is blocked when no form is published** (answer columns + label-mapping require a schema; the unified branch returns a 400 [Source: apps/api/src/controllers/export.controller.ts:177-188]). The 9-59 review closed it [RESOLVED — by design] and routed the genuine enhancement to Epic 12 [Source: _bmad-output/implementation-artifacts/9-59-unified-registry-export.md "Review Follow-ups" last item].

- **Option A (rejected):** 12-8 absorbs an identity-only unified export path so a "full registry" download works even with no published form.
- **Option B (CHOSEN — default):** document Summary mode as the accepted answer for the no-published-form case; the preview detects the no-form state and directs the operator to Summary mode.

**Decision: Option B.** Grounded in what `export.controller.ts` shows: (1) the unified branch's whole purpose is answer columns + code→label mapping, which the controller derives from the selected `formSchema` via `buildColumnsFromFormSchema` + `flattenRawDataRow` [Source: apps/api/src/controllers/export.controller.ts:185-219] — with no schema there are literally no answer columns to add, so unified collapses to exactly what Summary already produces (`getRespondentExportData`: one row per respondent, all identity columns, no answers [Source: apps/api/src/services/export-query.service.ts:60-156]); (2) an identity-only unified path would be a throwaway duplicate of Summary and overlaps Epic 12 registry work, so building it fails the "compose, don't rebuild" guardrail; (3) the no-published-form state is effectively unreachable in production anyway (the master form must be published for registration to function), so this is purely defensive UX. Option B turns a blind 400 into a clear "use Summary mode" signpost — the right altitude for a presentation story. If, during dev, the codebase reveals that an identity-only unified path is genuinely trivial AND adds operator value beyond Summary, escalate to the SM before switching to Option A (do not silently expand scope).

### Per-mode preview behavior
- **Unified:** primary surface — show the full data-health breakdown ("139 rows, 76 with answers, 55 data lost, …") + the unified column/row counts + the 50,000 cap note. This is the explanation the operator needs.
- **Summary:** may show the same registry-health context (it IS the all-respondents view); row count = distinct respondents.
- **Full:** show the registry-health context for awareness but clearly label the row count as **submissions** (Full = one row per submission, not per respondent [Source: apps/api/src/services/export-query.service.ts:182-244]) so the breakdown's "respondents" denominator isn't conflated with the Full row count.

### Project Structure Notes
- Web: new `ExportPreview` component under `apps/web/src/features/dashboard/components/` (recommended) consumed by `ExportPage.tsx`; a `useRegistryTotals` hook (reading 12-4's endpoint) in `apps/web/src/features/dashboard/hooks/`; co-located tests under `apps/web/src/features/dashboard/.../__tests__/` (or alongside, matching the existing `ExportPage.test.tsx` location).
- API (only if composite endpoint chosen): controller method on `ExportController` + a route beside the existing `/exports/respondents/count` [Source: apps/api/src/controllers/export.controller.ts:344-406]; test in `apps/api/src/controllers/__tests__/export.controller.test.ts`.
- No source-module changes to `registry-data-status.ts`, `export-query.service.ts` query methods, or the 9-59 unified branch — 12-8 is additive (a preview surface + optional read-only composite).

### References
- [Source: apps/web/src/features/dashboard/pages/ExportPage.tsx:35-200] — the mode toggle, the existing record-count preview (`record-count`), the unified explainer, the no-forms message, and `isFormRequired` (the surfaces 12-8 extends).
- [Source: apps/web/src/features/dashboard/pages/ExportPage.tsx:74-80] — the 300 ms debounce 12-8 re-uses for the preview re-fetch.
- [Source: apps/web/src/features/dashboard/pages/ExportPage.tsx:343-363] — existing count-preview block + Skeleton pattern to mirror.
- [Source: apps/web/src/features/dashboard/hooks/useExport.ts:13-43] — `exportKeys`, `useExportPreviewCount`, `usePublishedForms` (reuse; no-form detection).
- [Source: apps/web/src/features/dashboard/api/export.api.ts:62-67] — `fetchExportPreviewCount` (the existing count path; do not fork).
- [Source: apps/api/src/controllers/export.controller.ts:40,50] — PDF 1,000-row cap + `UNIFIED_MAX_ROWS = 50000` (caps the preview must respect, never materialize).
- [Source: apps/api/src/controllers/export.controller.ts:168-283] — the 9-59 unified branch (no-form 400, the deferred-preview note at 222-227).
- [Source: apps/api/src/controllers/export.controller.ts:344-406] — `getExportPreviewCount` + `getPublishedForms` (the count + published-forms plumbing to reuse).
- [Source: apps/api/src/services/export-query.service.ts:60-156] — `getRespondentExportData` (Summary = the Option-B no-form answer).
- [Source: apps/api/src/services/export-query.service.ts:162-176,249-265] — `getFilteredCount` / `getSubmissionFilteredCount` (the row-count source).
- [Source: apps/api/src/services/export-query.service.ts:495-561] — `UNIFIED_METADATA_COLUMNS` / `SUBMISSION_METADATA_COLUMNS` + `buildColumnsFromFormSchema` (column-count source).
- [Source: apps/api/src/services/registry-data-status.ts:26-35] — `REGISTRY_DATA_STATUSES` / `RegistryDataStatus` (iterate for labels; do not redefine).
- [Source: _bmad-output/implementation-artifacts/12-4-registrytotals-model.md] — `getRegistryTotals()` return shape `{ totalRespondents, byDataStatus, withAnswers }` + `GET /api/v1/analytics/registry-totals` (the summary-number source 12-8 reads).
- [Source: _bmad-output/implementation-artifacts/9-59-unified-registry-export.md] — "Review Follow-ups" last item ([RESOLVED — by design] no-published-form finding) + the "(a full pre-download preview is Epic 12 / 12-8)" hand-off.

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List

## Change Log

| Date | Change |
|---|---|
| 2026-06-16 | Story authored (SM, Bob) via create-story workflow. Epic 12 "Dashboard System Refresh" Tier-1: pre-download data-health preview on the Export page — the wire-in surface for 9-59's blind unified export, consuming 12-4's `getRegistryTotals()` for the summary + reusing the existing count/column plumbing (no dataset materialization; caps respected). 6 ACs: data-health preview panel, column/row counts per mode, lightweight preview data, the deferred 9-59 no-published-form decision (Option B — document Summary as the answer + signpost it), skeleton loading + degraded states, tests. POST-LAUNCH, NON-GATING. Status → ready-for-dev. |
