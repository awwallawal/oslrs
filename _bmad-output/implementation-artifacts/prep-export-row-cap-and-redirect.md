# Prep Story: PDF Export Row-Cap Tiered Enforcement (Soft Modal + Hard 413)

Status: ready-for-dev

<!--
Created 2026-05-08 by Bob (SM) via canonical *create-story --yolo per `feedback_canonical_create_story_workflow.md`.

Upstream chain (all canonical):
  - Decision memo:       docs/decisions/2026-05-08-pdf-export-row-cap.md (Awwal-ratified 2026-05-08)
  - Originating brief:   docs/follow-ups/2026-05-08-pdf-export-row-cap-product-decision.md (closed 2026-05-08)
  - PRD:                 V8.4 Story 5.2 AC#5 (John, 2026-05-08)
  - Architecture:        ADR-021 Export Row-Cap Policy (Winston, 2026-05-08)
  - UX Spec:             Custom Component #18 ExportFormatHintModal (Sally, 2026-05-08)

This story implements the tiered cap end-to-end. Scope is preventive — no real export volume has hit production yet.

Author authority: Bob (SM). Implementation shape (middleware vs per-controller) is an intentional implementer choice per Winston's ADR-021. Component name `ExportFormatHintModal` is Sally's pick (UX Spec #18); use exactly that name.
-->

## Story

As an **operator of OSLSR (current Builder; future Ministry-handover)**,
I want **PDF exports to be tiered-capped — silent below 2,000 rows, modal-warned at 2,001-5,000, and hard-rejected with HTTP 413 above 5,000 — with a per-endpoint suppression flag for domain-bounded exports**,
so that **a confused or hostile user cannot pin a request for ~75 seconds and return ~470 MB by requesting a 50K-row PDF, legitimate users in the soft band are nudged toward CSV (the better format for large datasets) without being blocked, and partner-API consumers (Story 10-3 / 10-4) integrate against a stable HTTP 413 response shape**.

## Acceptance Criteria

1. **AC#1 — Backend hard cap (HTTP 413).** `ExportService.generatePdfReport` (or its caller in `export.controller.ts`) rejects any PDF export request whose estimated row count is **5,001 or more** with `HTTP 413 Payload Too Large`. Generation must NOT begin. Response body is JSON with the exact shape from ADR-021:
   ```json
   {
     "error": "row_cap_exceeded",
     "format": "pdf",
     "limit": 5000,
     "requested": <N>,
     "alternative_format": "csv"
   }
   ```
   Response shape is **load-bearing for partner-API consumers** — copy-driven changes that break this contract are forbidden without a corresponding ADR-021 amendment.

2. **AC#2 — Frontend soft band (modal).** When a user invokes a PDF export action and the row-count estimate resolves to **2,001–5,000** rows, the host trigger surface renders the `ExportFormatHintModal` component (UX Spec #18) before generation starts. Below 2,001 rows, the modal does NOT render (silent generation). Above 5,000 rows, the modal does NOT render (the API returns HTTP 413; user sees the server-handled error response, not a UI surface).

3. **AC#3 — Per-endpoint suppression flag + inventory.** Each PDF-export-capable endpoint declares `suppressExportRowCapModal: boolean` (default `false`). Endpoints whose row count is bounded by domain logic (≤200 rows by design) set `true` and are exempt from BOTH the modal and the hard 413. The story ships with a per-endpoint inventory table in the `docs/infrastructure-cicd-playbook.md` Part 6 (or new dedicated section) listing every PDF-export endpoint and its suppression decision with a one-line rationale.

4. **AC#4 — Shared export-cap config (no hard-coding).** All numeric thresholds (soft cap = 2,000; hard cap = 5,000), the per-endpoint suppression list, and the estimate constants (`PDF_BYTES_PER_ROW = 9700`, `PDF_MS_PER_ROW = 2.4`, `PDF_BASELINE_MS = 1500`) live in a **single shared config module** that is the canonical source consumed by both backend (413 enforcement, optional row-count gate before service call) and frontend (modal trigger band, modal estimate display). Implementation MAY split the backend and frontend copies into two files for ergonomics; if it does, the two files MUST be type-checked against a shared `packages/types` type or otherwise kept-in-sync via a CI guard.

5. **AC#5 — Linear estimate engine for modal.** The `ExportFormatHintModal` displays `estimatedRows` (rounded to nearest 100), `estimatedFileSizeMB` (rounded to nearest MB), and `estimatedGenerationSeconds` (rounded to nearest second; minimum display value `1`). Computed via the AC#4 constants:
   ```
   estimatedFileSizeMB        = Math.round((rows * PDF_BYTES_PER_ROW) / 1_000_000)
   estimatedGenerationSeconds = Math.max(1, Math.round((rows * PDF_MS_PER_ROW + PDF_BASELINE_MS) / 1000))
   ```
   When the row-count query fails (modal `estimates-unavailable` state per UX Spec #18), the props `estimatedFileSizeMB` and `estimatedGenerationSeconds` are passed as `null` and the modal renders the graceful-degradation copy.

6. **AC#6 — Telemetry asymmetry (audit overrides, not compliance).** When the user clicks "Continue with PDF" in the modal, the host emits exactly **one** audit-log event via `AuditService.logAction({ action: 'export.format_chosen_after_hint', meta: { format_choice: 'pdf_after_modal_warning', estimated_rows, estimated_size_mb, estimated_seconds, endpoint } })`. When the user clicks "Switch to CSV" or closes the modal (ESC, X button, backdrop click), **no audit event** is emitted. This asymmetry mirrors UX Spec Journey 6 step 6's discipline (audit the override, not the compliance) and is explicitly called out in ADR-021's telemetry contract — the evidence stream that future-John uses to revisit the threshold over time.

7. **AC#7 — Modal copy (canonical English).** The `ExportFormatHintModal` ships with the **canonical English copy** from UX Spec #18 verbatim:
   - Headline: `Heads up — this PDF will be large` (default state) / `Heads up — this looks like a large PDF` (estimates-unavailable state)
   - Body labels: `Rows in your export:`, `Estimated file size:`, `Estimated generation:`
   - Body insight: `PDFs over 25 MB don't attach to most email systems. CSV at this size is around 2 MB and generates in under a second — Excel, Google Sheets, and your team's tools all open it cleanly.`
   - CTAs: `Continue with PDF` (left) and `Switch to CSV` (right)
   - The forbidden words from the Tone & Copy Guide (warning, alert, blocked, exceeded, error, cannot, refuse, denied, must, required) MUST NOT appear in any modal-rendered copy.

8. **AC#8 — Modal accessibility (per UX Spec #18).** The modal satisfies all of:
   - `role="dialog" aria-modal="true" aria-labelledby="export-hint-title" aria-describedby="export-hint-body"`
   - Focus trap inside the modal; on open, focus moves to **"Switch to CSV"** (default-focused recommended action); on close, focus returns to the originating Export button
   - Estimates render in a `<dl>` with `<dt>`/`<dd>` semantics
   - A `role="status" aria-live="polite"` region announces the estimate values on open
   - Headline uses standard surface colour (Neutral-900 on Surface-50) — NOT Warning-amber or Error-red
   - ESC, X button, and backdrop click all close the modal (no commit; user returns to trigger surface intact)
   - Mobile (<768px): CTAs stack vertically with "Switch to CSV" on top
   - `prefers-reduced-motion: reduce` skips entry/exit animation
   - Touch-target size ≥44×44 px on both CTAs

9. **AC#9 — Test coverage (backend + frontend + integration).** Tests added covering:
   - Backend boundary: `ExportService` returns 413 at 5,001 rows, returns 200 at 5,000 rows, returns 200 at any row count when endpoint is `suppressExportRowCapModal: true`.
   - Backend response shape: HTTP 413 body matches the AC#1 JSON exactly (deep equality test).
   - Backend telemetry: `AuditService.logAction` is called with the AC#6 shape on "Continue with PDF" path; NOT called on "Switch to CSV" or modal-dismiss paths.
   - Frontend modal lifecycle: renders at 2,001-5,000, NOT below 2,001, NOT above 5,000 (the API 413 path takes over above 5K — frontend test uses MSW or equivalent to assert the API path is taken instead of the modal path).
   - Frontend default focus: on modal open, document.activeElement is the "Switch to CSV" CTA.
   - Frontend dismissal: ESC closes modal without emitting any export action; backdrop click and X button do the same.
   - Frontend estimates: modal renders with computed values when estimates are non-null; renders graceful-degradation copy when estimates are null.
   - Estimate engine: unit tests for the linear extrapolation against the BENCHMARK constants — the rounding rules, the `Math.max(1, ...)` floor on seconds.
   - Suppression-flag inventory: a test asserts that every `format=pdf` route in `apps/api/src/routes/` either has the cap enforcement wired OR carries the `suppressExportRowCapModal: true` flag with a comment justifying the suppression. (Prevents future endpoints from silently bypassing the cap.)

10. **AC#10 — Documentation.** Three doc updates:
    - `docs/infrastructure-cicd-playbook.md` Part 6 (or new "Part 8: Export Cap Pattern") gains a section documenting the tiered-cap pattern, the per-endpoint inventory, and the shared-config seam. Cross-references ADR-021 + UX Spec #18 + this story.
    - `apps/api/src/services/export.service.ts` and the cap-config module(s) carry a 3-5 line docstring at the top pointing to ADR-021 as the canonical source.
    - The forward-reference to **Story 10-1 partner-API contract** (per ADR-021 Cross-references) is preserved: when Story 10-1 lands, its OpenAPI spec MUST document the HTTP 413 response shape from AC#1 verbatim. This story does not modify Story 10-1, but adds a TODO marker in the Story 10-1 file (or epics.md Story 10-1 entry) noting the dependency.

## Tasks / Subtasks

- [ ] **Task 1 — Build shared export-cap config module** (AC: #4, #5)
  - [ ] 1.1 Create `apps/api/src/lib/export-cap-config.ts` with the canonical constants:
        ```typescript
        export const EXPORT_CAP_CONFIG = {
          PDF_SOFT_CAP_ROWS: 2000,
          PDF_HARD_CAP_ROWS: 5000,
          PDF_BYTES_PER_ROW: 9700,
          PDF_MS_PER_ROW: 2.4,
          PDF_BASELINE_MS: 1500,
        } as const;

        export type ExportCapConfig = typeof EXPORT_CAP_CONFIG;
        ```
  - [ ] 1.2 Create `apps/web/src/features/exports/lib/cap-config.ts` mirroring the same shape.
  - [ ] 1.3 If choosing the `packages/types`-shared route instead, define the type there and import from both apps. Document the choice in the file's docstring (not both — pick one).
  - [ ] 1.4 Add unit tests for the estimate engine (`computeExportEstimate(rows): { sizeMB, seconds }` exported from the same module). Boundary tests: 0, 1, 2000, 2001, 5000, 5001, 10000.
  - [ ] 1.5 Add a CI guard test (Vitest) asserting the backend constants equal the frontend constants. Lives in either app's test suite — pick the one that already imports cross-package easiest. Failure mode if the constants drift: test name "export-cap-config: backend and frontend constants must stay in sync".

- [ ] **Task 2 — Backend HTTP 413 enforcement** (AC: #1, #9)
  - [ ] 2.1 Read current shape of `apps/api/src/services/export.service.ts` `generatePdfReport()` and `apps/api/src/controllers/export.controller.ts` to determine the cleanest enforcement seam (controller-level pre-flight vs service-method pre-flight).
  - [ ] 2.2 Add a row-count gate before generation begins: if the resolved row count > `PDF_HARD_CAP_ROWS` (5000) AND the calling endpoint is NOT in the suppression list, return HTTP 413 with the AC#1 JSON shape. Generation must NOT begin (no PDF buffer allocation, no PDFKit instantiation).
  - [ ] 2.3 Set `Content-Type: application/json` on the 413 response (do NOT default to `application/pdf`).
  - [ ] 2.4 Expose an `AppError` subclass `RowCapExceededError` (extends existing `AppError` per project convention) so the error handler middleware can convert it cleanly. Do NOT throw a raw `Error` from the service — use the project's existing error-handling pattern.
  - [ ] 2.5 Tests in `apps/api/src/services/__tests__/export.service.test.ts` and/or `apps/api/src/controllers/__tests__/export.controller.test.ts`:
        - 413 at 5,001 rows (exact response shape deep-equality test)
        - 200 at 5,000 rows (boundary)
        - 200 at any row count when endpoint is `suppressExportRowCapModal: true`
        - Generation does NOT begin on 413 path (assert no PDFKit `new PDFDocument` call via spy, OR assert no `Content-Type: application/pdf` header).

- [ ] **Task 3 — Per-endpoint inventory + suppression flag wire-through** (AC: #3, #9)
  - [ ] 3.1 Inventory every PDF-export-capable endpoint by greppping `format=pdf` and `generatePdfReport` across `apps/api/src/routes/` and `apps/api/src/controllers/`. Likely candidates from current codebase:
        - `apps/api/src/routes/export.routes.ts` — canonical multi-format export
        - `apps/api/src/routes/respondent.routes.ts` — respondent listing exports
        - `apps/api/src/routes/productivity.routes.ts` — productivity rollups (likely domain-bounded ≤200 rows)
        - `apps/api/src/routes/audit-log-viewer.routes.ts` — audit log export (CSV-only at 10K cap per Story 9-11; PDF NOT a format option here, suppression moot)
  - [ ] 3.2 For each PDF-capable endpoint, add `suppressExportRowCapModal: <true|false>` as part of the route configuration (or controller metadata — implementer's choice). Document the chosen seam in the file's docstring.
  - [ ] 3.3 Set `true` for any endpoint whose row count is bounded by domain logic (e.g., productivity rollups by LGA-and-month — never more than ~200 rows). Set `false` for any endpoint whose row count is user-filter-driven (e.g., respondent registry export).
  - [ ] 3.4 Document the inventory in `docs/infrastructure-cicd-playbook.md` Part 6 (or new section) as a table:
        | Endpoint | PDF supported? | Suppression | Rationale |
        |---|---|---|---|
        | `/api/v1/admin/exports/respondents` | Yes | `false` | User-filter-driven; row count unbounded |
        | `/api/v1/admin/exports/productivity` | Yes | `true` | Domain-bounded ≤200 rows by LGA × month |
        | `/api/v1/admin/exports/audit-log` | No (CSV only) | N/A | Story 9-11 CSV-only with separate 10K cap |
        | ... | ... | ... | ... |
  - [ ] 3.5 Add the AC#9 inventory-completeness test: parse the routes folder, find every `format=pdf`-capable route, assert each carries either the cap enforcement wired OR `suppressExportRowCapModal: true` with a comment.

- [ ] **Task 4 — Frontend ExportFormatHintModal component** (AC: #2, #5, #7, #8, #9)
  - [ ] 4.1 Create directory tree (Sally's hint, Bob's confirmation): `apps/web/src/features/exports/{components,hooks,api,lib}/`. The `lib/cap-config.ts` from Task 1.2 lives here.
  - [ ] 4.2 Create `apps/web/src/features/exports/components/ExportFormatHintModal.tsx` per UX Spec #18 — anatomy, states, behaviour, accessibility, props all match. Implementer is bound to UX Spec #18 verbatim on copy + accessibility; layout details (exact pixel margins, animation curve) are open.
  - [ ] 4.3 Wire the AC#7 canonical English copy into the component as default `i18n` keys (not hard-coded inline strings — even though localisation isn't in scope, the keys structure prevents hard-coded-copy retrofits later). Use the project's existing copy convention (likely `react-i18next` or inline-string-via-constants — match what exists).
  - [ ] 4.4 Implement the props interface from UX Spec #18 verbatim:
        ```typescript
        interface ExportFormatHintModalProps {
          estimatedRows: number;
          estimatedFileSizeMB: number | null;
          estimatedGenerationSeconds: number | null;
          endpoint: string;
          onContinuePdf: () => Promise<void> | void;
          onSwitchToCsv: () => Promise<void> | void;
          onClose: () => void;
        }
        ```
  - [ ] 4.5 Use the project's existing `Dialog` / `AlertDialog` shadcn-ui primitive as the modal foundation (per memory: "Dialog pattern: AlertDialog with color-themed confirm button (DeactivateDialog=red, ReactivateDialog=green)" — but this modal is NOT alarm-themed; use the neutral `Dialog` variant).
  - [ ] 4.6 Component-level tests in `apps/web/src/features/exports/components/__tests__/ExportFormatHintModal.test.tsx`:
        - Renders all three estimate values when props are populated
        - Renders graceful-degradation copy when `estimatedFileSizeMB` is null
        - Default focus on "Switch to CSV" on open (`expect(document.activeElement).toBe(switchCsvButton)`)
        - "Continue with PDF" click invokes `onContinuePdf`; "Switch to CSV" invokes `onSwitchToCsv`
        - ESC key invokes `onClose`; backdrop click invokes `onClose`; X button invokes `onClose`
        - The forbidden words (warning, alert, blocked, exceeded, error, cannot, refuse, denied) do NOT appear in the rendered DOM (regex assertion against `container.textContent`)
        - `aria-modal="true"`, `role="dialog"`, `<dl>` with `<dt>`/`<dd>` for estimates

- [ ] **Task 5 — Host integration on PDF export trigger surfaces** (AC: #2, #3)
  - [ ] 5.1 Identify every frontend trigger surface that can request `format=pdf`. Likely candidates from current codebase:
        - `apps/web/src/features/dashboard/components/charts/ChartExportButton.tsx` (existing chart-export button)
        - Any "Export PDF" button on respondent registry / report builder pages (Story 5.2 surfaces — search for `format: 'pdf'` and `mimeType: 'application/pdf'`)
  - [ ] 5.2 For each trigger surface:
        - Before invoking the export request, fetch the row-count estimate from the same backend filter (use existing count endpoint OR add a `?count_only=true` query param if not yet supported — implementer choice).
        - If the count is in 2,001–5,000 AND the endpoint is not suppressed AND the requested format is PDF, render `ExportFormatHintModal` with the props.
        - If the count is ≤2,000, proceed silently with PDF generation (current behaviour).
        - If the count is ≥5,001, do not render modal — the API will return HTTP 413; let the existing error toast surface the message from the AC#1 response body.
  - [ ] 5.3 The "Switch to CSV" path must trigger the same export pipeline with `format=csv` — use the existing CSV download flow without a second confirmation step.
  - [ ] 5.4 Add a host-integration test for at least ONE trigger surface (the most representative one — likely `ChartExportButton` or the respondent registry export button). Use MSW to mock the count endpoint at 3,400 rows; assert the modal renders; click "Switch to CSV"; assert the CSV download path is invoked.

- [ ] **Task 6 — Telemetry wire-through** (AC: #6, #9)
  - [ ] 6.1 In the "Continue with PDF" CTA handler (within `ExportFormatHintModal` host integration), call the existing audit-log API endpoint with the AC#6 payload. Use the project's existing audit-log-emit pattern (likely a TanStack Query mutation hook in `hooks/`).
  - [ ] 6.2 If the project's existing `AuditService.logAction` is server-side-only (per `apps/api/src/services/audit.service.ts:241`), the frontend cannot call it directly — it must go via an API endpoint. Two implementation options:
        - (a) Server-side: when the actual PDF generation happens after the modal-was-shown frontend signal (e.g., a `?via=hint_modal=continue` query param), the export service writes the audit-log event itself.
        - (b) Frontend: a thin `POST /api/v1/admin/audit-events` endpoint accepts the payload from the frontend. (Less preferred — couples frontend to audit emission.)
        - **Implementer choice; (a) is recommended** because it keeps audit emission server-side (consistent with all other audit events in the project) and is testable backend-only.
  - [ ] 6.3 Tests covering AC#6 asymmetry:
        - "Continue with PDF" → exactly one `audit_logs` row with `action: 'export.format_chosen_after_hint'` and the AC#6 meta shape.
        - "Switch to CSV" → no `audit_logs` row with action starting with `export.format_chosen_after_hint`.
        - ESC / backdrop close → no `audit_logs` row with action starting with `export.format_chosen_after_hint`.
        - Test asserts the meta shape via Zod schema match, not deep equality (so future meta-shape extensions don't break the test).

- [ ] **Task 7 — Test consolidation + regression sweep** (AC: #9)
  - [ ] 7.1 Run `pnpm test` (turbo-routed) and confirm all tests pass with no regressions.
  - [ ] 7.2 Run `pnpm lint` (both apps) — 0 errors, 0 warnings.
  - [ ] 7.3 Run `pnpm tsc --noEmit` (both apps via husky pre-commit hook from `prep-tsc-pre-commit-hook`) — 0 errors.
  - [ ] 7.4 Update test count baselines if needed: per memory current baseline is 4,191 (1,814 API + 2,377 web); this story adds ~25-35 tests across both apps.
  - [ ] 7.5 Verify the BENCHMARK lane (`.github/workflows/benchmarks.yml`) still passes — the cap thresholds shouldn't affect the benchmark suite (which runs against synthesised in-memory rows directly, not via the public API path), but confirm nothing has drifted.

- [ ] **Task 8 — Adversarial code review BEFORE commit** (cross-cutting; per `feedback_review_before_commit.md`)
  - [ ] 8.1 Run `/bmad:bmm:workflows:code-review` against the uncommitted working tree. Required findings minimum: 3-10 per workflow rules.
  - [ ] 8.2 Address all HIGH + MEDIUM findings in the same commit. LOW findings may be deferred to documented Review Follow-ups inside Dev Agent Record.
  - [ ] 8.3 Document fix locations in Task 8 sub-bullets after review pass (will be filled in by Dev agent during execution).

- [ ] **Task 9 — Documentation + sprint-status flip** (AC: #10)
  - [ ] 9.1 Update `docs/infrastructure-cicd-playbook.md` Part 6 (or new "Part 8: Export Cap Pattern") per AC#10 — pattern overview, per-endpoint inventory table from Task 3.4, shared-config seam, cross-references to ADR-021 + UX Spec #18 + this story file.
  - [ ] 9.2 Add 3-5 line docstring at top of `apps/api/src/services/export.service.ts` and the cap-config module(s) pointing to ADR-021 as canonical source.
  - [ ] 9.3 Add a forward-reference TODO marker in `_bmad-output/implementation-artifacts/10-1-consumer-auth-layer.md` (or `epics.md` Story 10-1 entry — implementer choice for cleanest discoverable location): "TODO Story 10-1: when authoring partner-API OpenAPI spec, document HTTP 413 `row_cap_exceeded` response shape verbatim from `prep-export-row-cap-and-redirect.md` AC#1." This honours ADR-021's Cross-references forward-reference.
  - [ ] 9.4 Flip `_bmad-output/implementation-artifacts/sprint-status.yaml` `prep-export-row-cap-and-redirect` from `ready-for-dev` → `in-progress` at PR open, → `review` at code-review-pass, → `done` at merge.
  - [ ] 9.5 Update `docs/decisions/2026-05-08-pdf-export-row-cap.md` Round 1 propagation log (Bob row) from "⏳ Pending Bob" → "✅ Done — Bob (SM)" with story-file pointer. (Bob does this AT story-creation time; flip to actual implementation `done` happens at merge.)

## Manual Verification Plan

After Tasks 1-9 are implementation-complete and `pnpm test` + lint + tsc all green, walk this checklist before flipping the story to `review`. Automated tests verify code correctness; this checklist verifies feature correctness in a real browser. Dev agent must explicitly mark each item `[x]` or document why skipped — partial completion is documented, not glossed.

> **Why this section exists:** per project memory rule *"For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete. Type checking and test suites verify code correctness, not feature correctness."* The forbidden-words copy regex test (AC#9) and the focus-trap a11y test cover code; only a real browser confirms the **felt experience** — does the modal actually feel like a respectful nudge, or like a paywall.

### Layer 1 — Local dev server walkthrough (golden path, ~5 min)

Start: `pnpm dev` from repo root (turbo runs API + web). Login as Government Official (Story 5.2 audience — they own the export-heavy workflows). Use a respondent registry filter or chart-export trigger surface to drive the row count.

- [ ] **MV-1.1 — Silent path (<2,000 rows):** Apply a narrow filter (~500 rows). Click Export PDF. **Expect:** PDF downloads directly, no modal renders.
- [ ] **MV-1.2 — Soft-band entry (2,001-5,000 rows):** Widen filter to ~3,000 rows. Click Export PDF. **Expect:** modal renders with headline `Heads up — this PDF will be large`, three estimates populated (rows / MB / seconds), and default focus on **Switch to CSV** (Tab once from modal open should land on "Continue with PDF" — that confirms focus order is correct).
- [ ] **MV-1.3 — Switch-to-CSV path:** From the open modal in MV-1.2, click "Switch to CSV". **Expect:** CSV download starts immediately without a second confirmation prompt; modal closes; no PDF generated.
- [ ] **MV-1.4 — Continue-with-PDF override path:** Repeat MV-1.2. This time click "Continue with PDF". **Expect:** PDF generates and downloads; modal closes.
- [ ] **MV-1.5 — Hard cap (>5,000 rows):** Widen filter to ~6,000 rows. Click Export PDF. **Expect:** NO modal appears. Instead, error toast surfaces the 413 message (e.g. "PDF supports up to 5,000 rows. Use CSV for larger exports."). User can still trigger CSV export manually.

### Layer 2 — DevTools forensics (contract verification, ~5 min)

- [ ] **MV-2.1 — HTTP 413 response shape:** During MV-1.5, open Network tab → click the failing request → inspect response body. **Must match the AC#1 JSON shape exactly:**
  ```json
  { "error": "row_cap_exceeded", "format": "pdf", "limit": 5000, "requested": 6000, "alternative_format": "csv" }
  ```
  Drift here breaks partner-API consumers (Story 10-3 / 10-4). Confirm `Content-Type: application/json` (NOT `application/pdf`).
- [ ] **MV-2.2 — Audit-log telemetry on override:** After MV-1.4 (Continue with PDF), navigate to `/dashboard/admin/audit-log` (Story 9-11). Filter by action `export.format_chosen_after_hint`. **Expect exactly ONE event** with meta payload containing `format_choice: 'pdf_after_modal_warning'`, `estimated_rows`, `estimated_size_mb`, `estimated_seconds`, `endpoint`.
- [ ] **MV-2.3 — Telemetry asymmetry (no event on Switch to CSV):** After MV-1.3 (Switch to CSV path), refresh the audit log filter from MV-2.2. **Expect ZERO new events** with that action — we audit overrides, not compliance.
- [ ] **MV-2.4 — Telemetry asymmetry (no event on dismiss):** Open modal (MV-1.2 setup), hit ESC. Refresh audit log filter. **Expect ZERO new events.** Repeat with backdrop click and X button. Same expectation.
- [ ] **MV-2.5 — Console clean:** During all of Layer 1, watch DevTools Console. **Expect zero errors, zero warnings.** Any new warnings introduced by this story must be triaged before flipping to `review`.

### Layer 3 — Edge cases + accessibility (~10 min)

- [ ] **MV-3.1 — Estimates-unavailable graceful state:** DevTools → Network → block the row-count endpoint URL via "Block request URL". Trigger PDF export in soft band. **Expect:** modal still renders, headline becomes `Heads up — this looks like a large PDF`, estimate values are absent (no "~0 MB" or "~undefined seconds"), copy degrades to the AC#7 graceful state. Both CTAs still functional.
- [ ] **MV-3.2 — Mobile viewport:** Chrome DevTools → toggle device toolbar → 375px width (iPhone SE). Trigger MV-1.2 setup. **Expect:** CTAs stack vertically with **"Switch to CSV" on top**. Touch targets ≥44×44 px (eyeball, not pixel-measure).
- [ ] **MV-3.3 — Reduced-motion preference:** DevTools → Rendering panel → "Emulate CSS media feature prefers-reduced-motion" → "reduce". Trigger MV-1.2. **Expect:** modal entry/exit animation skips entirely (instant in/out, no fade or slide).
- [ ] **MV-3.4 — Keyboard-only navigation:** Trigger MV-1.2 setup. Navigate the entire modal using only Tab / Shift+Tab / Enter / ESC. Confirm focus trap (Tab past the X button cycles back to the first element). Confirm ESC closes. Confirm focus returns to the originating Export button on close.
- [ ] **MV-3.5 — Screen reader spot-check:** Use NVDA (Windows) or VoiceOver (macOS). Open modal. **Expect:** live region announces the body copy on open (a paraphrased version of the visual copy — "Heads up. This PDF will be around X megabytes and take about Y seconds...").
- [ ] **MV-3.6 — Forbidden-words DOM scan:** Open modal in MV-1.2 setup. Ctrl+F in the rendered DOM for: `warning`, `blocked`, `error`, `denied`, `cannot`, `must`, `required`, `exceeded`, `refuse`. **Expect zero matches.** AC#9 enforces this via Vitest regex; eyeballing catches retrofit drift if a future translator or designer is tempted.
- [ ] **MV-3.7 — Color check:** Open modal. Headline must use standard surface colour (Neutral-900 on Surface-50), NOT Warning-amber or Error-red. Quick visual: if it looks like an error dialog or a system alert, that's wrong — it should look like an informational tip card.

### Layer 4 — Production verification (post-deploy, ~5 min)

Mirrors your existing 9-8 CSP self-test pattern: Firefox + Chrome, both prod domains.

- [ ] **MV-4.1 — Firefox @ oyoskills.com:** Repeat MV-1.1 → MV-1.5 in Firefox against the production deployment.
- [ ] **MV-4.2 — Chrome @ oyoskills.com:** Same in Chrome.
- [ ] **MV-4.3 — Firefox @ oyotradeministry.com.ng:** Same in Firefox against the legacy domain (Strategy A relative URLs should make this identical to oyoskills.com — confirm).
- [ ] **MV-4.4 — Chrome @ oyotradeministry.com.ng:** Same in Chrome.
- [ ] **MV-4.5 — Audit-log telemetry survives the production round-trip:** After MV-4.1 + MV-4.2 override paths, confirm the prod audit log received the `export.format_chosen_after_hint` events with correct meta. (This is the strongest evidence the telemetry contract holds end-to-end through CF + nginx + Express + Drizzle + Postgres.)

### Closure rule

Story is `review`-ready when:
- All Layer 1, 2, 3 items checked `[x]` (or explicitly documented as `[~] N/A — <reason>`).
- Layer 4 items checked `[x]` post-deploy in the same PR cycle.
- Any unexpected behaviour observed during the walkthrough is logged in **Dev Agent Record → Completion Notes List** with a "manual-verification surprise" tag, and the corresponding AC re-evaluated.

Manual-verification surprises that contradict an AC must be either (a) fixed in the same commit, or (b) documented as a known-issue Review Follow-up in Dev Agent Record with an owner and date.

## Dev Notes

### Background — Why this is preventive, not reactive

The 2026-05-08 Story 9-10 close-out 2nd-pass code-review lifted the BENCHMARK gate that had hidden the real cost of `ExportService.generatePdfReport` at scale. Measured on developer-laptop hardware:

| Format | Rows    | Time      | Output  |
|--------|--------:|----------:|--------:|
| PDF    |  10,000 |   14.6 s  | 93.0 MB |
| CSV    | 100,000 |    0.34 s |  6.3 MB |

The current `ExportService` accepts arbitrary row counts. A confused user requesting "all submissions" — or a hostile actor probing API surface — can pin a request for ~75 seconds and return ~470 MB. We are not seeing it in practice today; this story is preventive, intended to ship before the first real "export everything" attempt and ahead of partner-API consumer access (Story 10-3 / 10-4) where misbehaving integrations are a real possibility.

### Prerequisites / Blockers

**None blocking.** Decision memo, ADR-021, UX Component #18, PRD V8.4 AC#5 all in place. `AuditService.logAction` is shipped (Epic 6). BENCHMARK lane is shipped (`.github/workflows/benchmarks.yml`, 2026-05-08). The export service exists at `apps/api/src/services/export.service.ts`.

### Dependencies (downstream)

- **Story 10-1 (Partner-API Consumer Auth)** — soft dependency. Story 10-1's OpenAPI spec must document the HTTP 413 response shape verbatim from this story's AC#1. Either order of completion is fine; this story leaves a TODO marker for 10-1 to consume. ADR-021 Cross-references already includes "Story 10-1 (forthcoming partner-API contract) — must document the HTTP 413 response shape."

- **Future expensive-sync-operation stories** (ID-card PDF batch render, payroll batch generation, supervisor analytics rollups) — they should default to the same tiered-cap pattern this story establishes. Not blocked by this story; this story creates the pattern they inherit.

### Architecture context

The full architectural rationale is in **ADR-021** (`_bmad-output/planning-artifacts/architecture.md` — search "ADR-021: Export Row-Cap Policy"). Salient extracts for the dev agent:

- **Two-tier cap is intentional.** Modal at 2K (educate) and HTTP 413 at 5K (protect) solve different problems; coupling them onto a single threshold either over-frictions legitimate users or under-protects the service. Per Winston's options-considered table, single-cap-only is rejected.

- **Stable JSON shape on the 413 is load-bearing.** Partner-API consumers (Story 10-3 / 10-4) will integrate against this response. Copy-driven changes to the error structure are forbidden without an ADR-021 amendment.

- **CSV is out of scope.** Existing per-endpoint CSV caps remain authoritative on their own terms — most notably the 10K-row audit-log CSV cap from UX Spec Journey 6 step 6 (Story 9-11). This ADR is consciously modelled on that pattern (server-enforced cap + prompted alternative) and extends it to PDF with one additional rung (the modal-warns soft band).

- **Telemetry asymmetry is the discipline.** We audit overrides ("Continue with PDF"), not compliance ("Switch to CSV"). Same shape as Sally's audit-log Journey 6 cap. The evidence stream is what future-John uses to revisit the threshold over time — if a meaningful share of users routinely override at 4-5K rows, the threshold is wrong OR the workflow is wrong (the right answer in either case is probably async export-to-email; out of scope here, captured as ADR-021's evolution path).

### UX context

Full anatomy + states + behaviour + accessibility + tone-and-copy is in **UX Spec Custom Component #18 `ExportFormatHintModal`** (`_bmad-output/planning-artifacts/ux-design-specification.md` — search "ExportFormatHintModal"). Salient extracts:

- **Component name is `ExportFormatHintModal` (Sally's pick), not `ExportRowCapModal`.** "Hint" reframes the modal from punitive to advisory; matches the existing `NinHelpHint` naming pattern. Use exactly this name.

- **Tone & copy guide is load-bearing.** Words to use: *heads up, large, around, switch, faster, opens cleanly*. Words to avoid: *warning, alert, blocked, exceeded, error, cannot, refuse, denied, must, required*. The user has not done anything wrong — the system is sharing context they didn't have. AC#7 enforces this.

- **Default focus is "Switch to CSV"**, the recommended action. Per ADR-021 + UX Spec #18: we are nudging toward the better outcome, not blocking the worse one. Reversing the default focus changes the modal from "respectful nudge" to "trick question."

- **ESC / backdrop close is a real third option** — user is recomposing, not deciding. NO telemetry on dismissal. Forcing a binary choice on someone trying to back out is a dark-pattern smell we don't ship.

- **Estimates are linear extrapolation, rounded for warmth.** "~3,400 rows" reads warmer than "3,427 rows"; precision here is false comfort. The minimum displayed seconds is `1` — never show "~0 seconds" (reads as broken).

### Test strategy

- **Unit tests** for the cap-config module (estimate engine boundary cases, rounding rules) and the modal component (renders, default focus, dismissal paths, copy regex).
- **Integration tests** for the backend 413 response shape (deep equality on the JSON body) and the host integration on at least one trigger surface (modal-renders → CTA-click → CSV-or-PDF path).
- **CI guard** for backend/frontend constant sync (Task 1.5) — failure mode is named so future drift is caught at PR time.
- **Suppression-flag inventory test** (AC#9 last bullet) — auto-traverses routes folder so adding a new PDF-export endpoint without thinking about the cap fails the test.
- **No new BENCHMARK tests** — the existing PDF/CSV benchmarks at `.github/workflows/benchmarks.yml` continue to validate the constants this story relies on. If a future PDFKit version bump drifts the constants, BENCHMARK catches it; this story's modal-estimate values auto-track because they're config-driven.

### Project Structure Notes

- **Frontend feature dir is new**: `apps/web/src/features/exports/` does not currently exist. This story creates it with `{components,hooks,api,lib}/` subdirs per project convention (per memory: "Frontend features at `apps/web/src/features/<name>/` with api/, hooks/, components/, pages/ subdirs"). No `pages/` subdir needed in v1 — the modal is host-rendered, not a standalone page.

- **Backend cap-config seam**: `apps/api/src/lib/export-cap-config.ts` is the suggested path (matches the existing `apps/api/src/lib/redis.ts`, `apps/api/src/lib/listen-address.ts` pattern from Story 9-9 for shared-config modules). Implementer may relocate if a better seam exists.

- **`packages/types` is a viable alternative for shared constants** — but per memory: "Drizzle schema files must NOT import from `@oslsr/types` — drizzle-kit runs compiled JS and `@oslsr/types` has no `dist/` (main points to `src/index.ts`). Inline enum constants locally with comments noting the canonical source." This story does NOT touch drizzle schemas, so importing from `packages/types` is permitted. Trade-off: a shared types package adds rebuild coordination; two-file-with-CI-guard is simpler. Implementer choice — Task 1.5 makes the two-file path safe.

- **Audit-log emit path is server-side**: `AuditService.logAction(params)` is exported from `apps/api/src/services/audit.service.ts:241`. The frontend cannot call it directly. Per Task 6.2, recommended approach is to have the export service emit the audit event server-side when the modal-was-shown signal arrives via query param or request body field. Avoid creating a generic `POST /api/v1/admin/audit-events` endpoint — that couples the frontend to audit emission and broadens attack surface.

- **Pre-existing audit log shape**: existing audit events use `{ action: '...', principal_id, target_resource, target_id, meta: {...} }` per the audit_logs schema (per Architecture Decision 5.4 and Story 9-11 Session 1 Schema Down Payment). Our new event slot fits cleanly: `action: 'export.format_chosen_after_hint'`, `meta` carries the export-specific fields.

- **Test runner discipline** (per memory): use `pnpm test` from root for the full suite; for single API tests `pnpm vitest run apps/api/src/path`; for web tests `cd apps/web && pnpm vitest run` or `pnpm --filter @oslsr/web test`. NEVER run `pnpm vitest run` from root for web tests (wrong config).

- **Race-condition anti-patterns** (per memory): default empty arrays for TanStack Query data; for any new TanStack mutation hooks created in this story (e.g., `useExportPdf`, `useExportCsv`), ensure no `data?.items?.length` against undefined.

- **CI deploy** runs `db:push:force` not `db:push` (per memory). This story does NOT add any drizzle migrations — pure code change. Should be a clean deploy with no migration concerns.

### References

- **Decision memo (canonical product source):** [Source: docs/decisions/2026-05-08-pdf-export-row-cap.md] — Awwal-ratified 2026-05-08; Q1-Q5 framing + decision rationale + open items.
- **Originating brief:** [Source: docs/follow-ups/2026-05-08-pdf-export-row-cap-product-decision.md] — closed 2026-05-08; benchmark data + product question framing.
- **PRD V8.4 Story 5.2 AC#5:** [Source: _bmad-output/planning-artifacts/prd.md] — user-facing AC pointing to ADR-021 + decision memo. Search file for "Story 5.2 Customizable Reporting & Query Builder" then AC #5.
- **ADR-021 Export Row-Cap Policy:** [Source: _bmad-output/planning-artifacts/architecture.md] — full architectural rationale, options-considered table, decision details, telemetry contract, cross-references. Search file for "### ADR-021".
- **UX Spec Custom Component #18 `ExportFormatHintModal`:** [Source: _bmad-output/planning-artifacts/ux-design-specification.md] — anatomy, states, behaviour, accessibility, tone-and-copy guide, props interface, telemetry contract, pattern lineage. Search file for "#### 18. ExportFormatHintModal".
- **UX Spec Journey 6 step 6 (Story 9-11):** [Source: _bmad-output/planning-artifacts/ux-design-specification.md:2871-2874] — the architectural precedent this story extends (audit-log CSV 10K server-enforced cap with prompted alternative).
- **BENCHMARK lane workflow:** [Source: .github/workflows/benchmarks.yml] — created 2026-05-08; tightened thresholds (PDF 10K <30s, CSV 100K <2s) regression-watchdog the constants this story relies on.
- **`ExportService.generatePdfReport`:** [Source: apps/api/src/services/export.service.ts] — current export service implementation; cap enforcement seam.
- **Export controller:** [Source: apps/api/src/controllers/export.controller.ts] — request handler for export endpoints.
- **Export routes:** [Source: apps/api/src/routes/export.routes.ts] — the canonical multi-format export route (one of the inventory targets in Task 3.1).
- **`AuditService.logAction`:** [Source: apps/api/src/services/audit.service.ts:241] — canonical server-side audit-log emit path.
- **Existing ChartExportButton (frontend trigger surface):** [Source: apps/web/src/features/dashboard/components/charts/ChartExportButton.tsx] — likely host integration target for Task 5.
- **Story 9-10 origin trail:** [Source: _bmad-output/implementation-artifacts/9-10-pm2-restart-loop-investigation.md] — Change Log entry 2026-05-08 captures the BENCHMARK gate lift that surfaced the cost curve.

## Dev Agent Record

### Agent Model Used

_To be filled by Dev agent on pickup._

### Debug Log References

_To be filled by Dev agent during implementation._

### Completion Notes List

_To be filled by Dev agent on completion._

### File List

_To be filled by Dev agent. Expected (estimate from Task breakdown):_
- `apps/api/src/lib/export-cap-config.ts` (new)
- `apps/api/src/services/export.service.ts` (modified — cap enforcement)
- `apps/api/src/controllers/export.controller.ts` (modified — possibly, if enforcement seam is at controller layer)
- `apps/api/src/routes/export.routes.ts` (modified — suppression flag wire-through)
- `apps/api/src/routes/respondent.routes.ts` (modified — suppression flag wire-through)
- `apps/api/src/routes/productivity.routes.ts` (modified — suppression flag wire-through, likely `true`)
- `apps/api/src/services/__tests__/export.service.test.ts` (modified — boundary tests)
- `apps/api/src/lib/__tests__/export-cap-config.test.ts` (new — estimate engine + sync test)
- `apps/web/src/features/exports/lib/cap-config.ts` (new)
- `apps/web/src/features/exports/components/ExportFormatHintModal.tsx` (new)
- `apps/web/src/features/exports/components/__tests__/ExportFormatHintModal.test.tsx` (new)
- `apps/web/src/features/exports/hooks/useExportFlow.ts` (new — host integration helper)
- `apps/web/src/features/dashboard/components/charts/ChartExportButton.tsx` (modified — host integration)
- (other frontend trigger surfaces — TBD by inventory in Task 5.1)
- `docs/infrastructure-cicd-playbook.md` (modified — Part 6 / Part 8 export cap pattern + per-endpoint inventory)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status flips per Task 9.4)
- `docs/decisions/2026-05-08-pdf-export-row-cap.md` (modified — Round 1 propagation log Bob row flipped to ✅ Done)
- This story file (modified — task `[x]` flips, Dev Agent Record fills, Change Log entry)

### Change Log

| Date | Change | Files |
|---|---|---|
| 2026-05-08 | Story authored by Bob (SM) via canonical `*create-story --yolo` per the Round 3 routing in `docs/decisions/2026-05-08-pdf-export-row-cap.md`. 10 ACs covering backend HTTP 413 hard cap, frontend `ExportFormatHintModal` soft band, per-endpoint suppression flag + inventory, shared cap-config module (no hard-coding), linear estimate engine, telemetry asymmetry (audit overrides not compliance), canonical English copy + tone-discipline, full accessibility per UX Spec #18, comprehensive test coverage (backend + frontend + integration + CI guard + inventory completeness), documentation updates with forward-ref TODO for Story 10-1 partner-API contract. 9 Tasks broken down with file-path-specific subtasks. Status: ready-for-dev. | This story file. |
| 2026-05-09 | **Manual Verification Plan added** between Tasks/Subtasks and Dev Notes — 4 layers / 22 checklist items: Layer 1 dev-server walkthrough (silent/soft/CSV/PDF/hard-cap golden paths), Layer 2 DevTools forensics (HTTP 413 response shape deep-equality eyeball + audit-log telemetry asymmetry verification on all four interaction paths + console-clean), Layer 3 edge cases + a11y (estimates-unavailable graceful state, mobile stacking, reduced-motion, keyboard-only, screen reader, forbidden-words DOM scan, color-not-alarm), Layer 4 production verification (Firefox + Chrome × oyoskills.com + oyotradeministry.com.ng matching the existing 9-8 CSP self-test cadence + prod audit-log round-trip). Added per Awwal request 2026-05-09 — closes the gap project memory flags as *"Type checking and test suites verify code correctness, not feature correctness"*. Closure rule explicit: story is `review`-ready only when Layer 1-3 checked [x] AND Layer 4 checked [x] post-deploy AND any surprises logged as either same-commit fixes or documented Review Follow-ups. | This story file. |
