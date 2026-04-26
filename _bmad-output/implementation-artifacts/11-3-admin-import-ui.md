# Story 11.3: Admin Import UI

Status: ready-for-dev

<!--
Created 2026-04-25 by Bob (SM) per SCP-2026-04-22 §A.5.

Frontend 3-step wizard consuming Story 11-2 endpoints. Uses Sally's ImportDryRunPreview + LawfulBasisSelector components and the WizardStepIndicator pattern from Story 9-12.

Sources:
  • PRD V8.3 FR25 (secondary-data ingestion UI)
  • UX Journey 5 (Super-Admin Data Import) + Custom Components #14 ImportDryRunPreview + #17 LawfulBasisSelector + Visible Step Indicator pattern + Navigation Patterns: super-admin sidebar Import Data item
  • Architecture Decision 3.4 + Rule 8 import batch lifecycle
  • Epics.md §Story 11.3

Depends on Story 11-2 (backend endpoints).
-->

## Story

As a **Super Admin uploading a secondary-data file (ITF-SUPA Oyo PDF, future MDA exports)**,
I want **a 3-step wizard (Upload → Review → Confirm) with a parsed dry-run preview, column mapping editor, mandatory lawful-basis capture, and a batch history page with rollback affordance**,
so that **I can ingest a 4K-row PDF in <3 minutes without ever touching psql, with full visibility into what will land before I commit and a 14-day safety net to undo**.

## Acceptance Criteria

1. **AC#1 — Sidebar nav item Import Data:** Add to `apps/web/src/features/dashboard/config/sidebarConfig.ts` per Sally's Navigation Patterns spec — placement after Submissions in the data-management cluster (Registry → Submissions → Import Data → Marketplace → ...). Super-admin only via existing role-isolated sidebar pattern. Icon: Lucide `Upload`. Badge: dot indicator (Primary-600 6px) when an import batch from past 14 days is still in rollback window.

2. **AC#2 — Route + page structure at `/dashboard/admin/imports`:**
   - List view (default): all batches table — columns SourceBadge + filename + uploaded-by + date + rows inserted/matched/skipped/failed + status badge (`active` / `rolled_back`) + rollback affordance (visible only within 14-day window)
   - "New Import" button top-right opens 3-step wizard at `/dashboard/admin/imports/new`
   - Click row in list → `/dashboard/admin/imports/:id` detail page with full audit trail

3. **AC#3 — 3-step wizard using `WizardStepIndicator` (per Story 9-12 component):**
   - Step 1 — Upload
   - Step 2 — Review (uses `ImportDryRunPreview` component #14)
   - Step 3 — Confirm
   - Step indicator persistently visible at top of wizard card; click completed steps to back-navigate
   - On wizard exit (browser back, "Cancel" button): if dry-run token has been issued and not consumed, prompt "Are you sure? Your dry-run results will be discarded."

4. **AC#4 — Step 1 — Upload:**
   - Drag-and-drop area + "Choose file" button (shadcn/ui patterns)
   - Accepts PDF, CSV, XLSX (`accept` attribute + MIME check; server-side re-checks per Story 11-2)
   - File size cap 10MB enforced client-side with helpful message
   - Source dropdown (required): `imported_itf_supa` | `imported_other`
   - Source description (optional, free-text 200 chars)
   - Parser dropdown (required when source is `imported_other`; auto-set when source is `imported_itf_supa`)
   - Continue button: disabled until file + source selected
   - Calls `POST /api/v1/admin/imports/dry-run` (multipart) on Continue
   - Loading state: skeleton screen with progress text "Parsing file... (this can take 5-15 seconds for large PDFs)"

5. **AC#5 — Step 2 — Review (uses `ImportDryRunPreview` component):**
   - Renders parse-stats card per component spec
   - Renders preview table (first 50 rows) with column-mapping editor
   - Renders `LawfulBasisSelector` component (component #17) with NDPA-aligned options
   - Confirm button disabled until lawful basis selected
   - Edit column mapping: re-runs `POST /api/v1/admin/imports/dry-run` with updated mapping; preserves scroll position on result
   - Failure report download: button → `GET /api/v1/admin/imports/dry-run/:token/failure-report.csv`
   - Per-row drawer (click a preview row): full source row + diff against any matched existing respondent

6. **AC#6 — Step 3 — Confirm:**
   - Final summary screen with explicit numbers: "**3,891 new respondent records** will be inserted with `source = imported_itf_supa`, `status = imported_unverified`. **278 records will be skipped** because their email or phone matches an existing respondent. **Lawful basis:** Public Interest (NDPA 6(1)(e)). **You can roll back this batch within 14 days.**"
   - [← Back to Review] (left) / [Commit Import] (right, Primary-600)
   - On commit: spinner with progress text "Importing 3,891 records..." (long operation; show indeterminate progress)
   - Success: success toast "Import complete. Batch ID: imp_2026_04_25_a3f9. View in Batch History →" with link
   - Transactional failure: error toast "Import failed at row 1,247. No records were saved. See details." with link to failure report

7. **AC#7 — Batch History list view (`/dashboard/admin/imports`):**
   - Sortable columns: source, filename, uploaded-by, date, rows-* counts, status
   - Filter chips: source (multi-select), status (multi-select), uploaded-by (single-select autocomplete), date range
   - URL-routed filter state (per Sally's pattern)
   - Pagination 50/page
   - Each row clickable → detail page

8. **AC#8 — Batch detail view (`/dashboard/admin/imports/:id`):**
   - Header: filename + SourceBadge + status badge + rollback button (if within 14-day window)
   - Metadata card: file_hash (truncated + copy-to-clipboard), file_size, parser_used, uploaded_at, uploaded_by + DSA reference if relevant
   - Lawful basis card: basis + justification text + NDPA reference link
   - Stats card: parsed / inserted / matched-skip / rules-skip / failed counts
   - Failure report download button
   - Audit trail: list of all `audit_logs` events with `meta.batch_id = $id` (uses Story 9-11 viewer foundation if available; otherwise inline simple list)

9. **AC#9 — Rollback flow (per Sally's Journey 5):**
   - Rollback button visible only within 14-day window
   - Click opens confirmation modal:
     - Header: "Roll back batch imp_2026_04_25_a3f9?"
     - Body: per Sally's spec — "This will mark the batch as rolled-back and soft-delete its 3,891 imported respondents. The records remain in the database for audit but become invisible to all read-side surfaces (registry, marketplace, dashboards, partner API). This action is logged in the audit log and cannot itself be undone — you would have to re-import the file."
     - Required field: free-text "Reason for rollback" (min 20 chars)
     - Actions: [Cancel] (safe default, focus on open) / [Confirm Rollback] (destructive Error-700)
   - On confirm: calls `POST /api/v1/admin/imports/:id/rollback` with reason
   - Success: toast + status badge updates to "Rolled Back <date> by <actor>"; rollback button hidden
   - Beyond 14-day window: button hidden in UI; if user crafts direct API request, server returns 403 with helpful message

10. **AC#10 — Tests:**
    - Component tests: `ImportDryRunPreview` (already part of Sally's Component #14 spec; ensure storybook story); `LawfulBasisSelector` (Component #17); wizard step navigation
    - Integration tests: full 3-step wizard happy path with mocked API; dry-run preview + column-mapping edit re-runs dry-run; rollback flow with confirmation modal
    - E2E test: upload sample ITF-SUPA fixture (from Story 11-2 test-fixtures) → review → confirm → see in batch history → roll back → verify status flip
    - Existing 4,191-test baseline maintained or grown

## Dependencies

- **Story 11-2 (HARD)** — backend endpoints
- **Story 9-12 `WizardStepIndicator` component (HARD)** — reused; Story 9-12 must land first OR component must be authored as part of this story (cross-Epic dependency — see Risk #1)
- **Sally's Custom Components #14 (`ImportDryRunPreview`) + #17 (`LawfulBasisSelector`)** — UI specs
- **Story 9-11 audit viewer (PREFERRED)** — for AC#8 audit trail surface; not strict (can fall back to inline simple list if 9-11 not yet ready)

## Field Readiness Certificate Impact

**Tier B** — does NOT block field-survey start. Can ship during the first weeks of field operation.

## Tasks / Subtasks

### Task 1 — Sidebar + routing (AC#1, AC#2)

1.1. Add Import Data nav item to sidebarConfig.ts per Sally's spec
1.2. Add routes: `/dashboard/admin/imports` + `/dashboard/admin/imports/new` + `/dashboard/admin/imports/:id`
1.3. Auth guards: super-admin only (per existing role-isolated route pattern)

### Task 2 — Wizard shell (AC#3)

2.1. New page `apps/web/src/features/admin-imports/pages/ImportWizardPage.tsx`
2.2. Use `WizardStepIndicator` component (from Story 9-12) — verify available; if not, author here
2.3. Step navigation: Continue / Back; URL-routed step number
2.4. Cancel/exit confirmation if dry-run token issued

### Task 3 — Step 1 Upload (AC#4)

3.1. Drag-and-drop + file picker
3.2. Source dropdown + parser dropdown + description textarea
3.3. Form validation
3.4. POST to dry-run endpoint with multipart
3.5. Loading state + error handling

### Task 4 — Step 2 Review (AC#5)

4.1. Use `ImportDryRunPreview` component per Sally's spec — author the component itself if not pre-existing
4.2. Use `LawfulBasisSelector` component per Sally's spec — author if not pre-existing
4.3. Column-mapping editor with re-run dry-run
4.4. Per-row drawer
4.5. Failure report download

### Task 5 — Step 3 Confirm (AC#6)

5.1. Final summary screen with explicit numbers
5.2. POST to confirm endpoint with dry-run token + lawful basis + justification
5.3. Loading + success + failure states

### Task 6 — Batch history list (AC#7)

6.1. New page `apps/web/src/features/admin-imports/pages/BatchHistoryPage.tsx`
6.2. Table with sortable columns + filter chips + URL state + pagination

### Task 7 — Batch detail (AC#8)

7.1. New page `apps/web/src/features/admin-imports/pages/BatchDetailPage.tsx`
7.2. Metadata + lawful basis + stats + failure report download
7.3. Audit trail (uses Story 9-11 viewer if available; inline fallback if not)

### Task 8 — Rollback flow (AC#9)

8.1. Rollback button on detail page (visible within 14-day window)
8.2. Confirmation modal per Sally's spec
8.3. POST to rollback endpoint with reason
8.4. UI updates on success

### Task 9 — Tests (AC#10) + sprint-status

9.1. Component tests + integration tests + E2E
9.2. Update sprint-status.yaml

## Technical Notes

### `WizardStepIndicator` cross-Story dependency

Sally's Visible Step Indicator pattern is used by Story 9-12 (Public Wizard) and this story (Admin Import Wizard). Whichever story lands first authors the component; the other consumes. Per A.5 dependency order: 9-12 lands before 11-3, so 9-12 is the author. If sequence changes, this story authors instead — coordinate via sprint-status.

### Dry-run token persistence across step navigation

The dry-run token returned by Step 1's API call must survive Step 2 → Step 3 navigation. Store in TanStack Query cache or component state (not localStorage — security; not URL — too long). On wizard cancel/back-out before Step 3 commits, the token expires server-side after 1 hour automatically (per Story 11-2 implementation).

### Per-row drawer match-against-existing diff

When a parsed row matched an existing respondent (auto-skip), the drawer shows the diff. **PII consideration:** matched_respondent_id is hashed in the failure report (per Story 11-2 AC#5). The drawer needs the actual matched respondent's data to show the diff — but the admin already has Super Admin access, so this is consistent with their existing privilege. The diff renders both rows side-by-side with changed fields highlighted.

### Why a separate "New Import" button vs default wizard view

The default landing on `/dashboard/admin/imports` is the batch history (more frequent action: "what did I import recently?"). Wizard is a less-frequent task — gated behind explicit "New Import" button. This matches the GitHub Issues pattern (issue list default, "New Issue" button) which is the most intuitive admin-flow for similar tasks.

### Rollback button visibility logic

Cleanest approach: server includes `rollback_eligible: boolean` in batch detail response (computed as `status === 'active' AND uploaded_at > now() - 14 days`). Frontend just shows button when `rollback_eligible` is true. Avoids client-side date arithmetic that could drift.

## Risks

1. **`WizardStepIndicator` ownership ambiguity.** If Story 9-12 ships in parallel, both stories may author the component. Mitigation: explicit dependency on 9-12 in this story; coordination via sprint-status comment block.
2. **PDF dry-run can be slow.** 30-second server-side timeout per Story 11-2 means user may see long spinner. Mitigation: explicit "this can take 5-15 seconds for large PDFs" copy in the loading state; show file size as context cue.
3. **Column-mapping editor UX complexity.** Mapping arbitrary CSV columns to canonical respondent fields is a tough UX (drag-and-drop? dropdowns? AI-suggest?). For MVP scope: dropdowns per column with auto-detected default. Future enhancement: AI-suggest based on column header patterns. Keeps MVP shippable.
4. **Rollback within 14 days but downstream analytics already aggregated.** When batch is rolled back, marketplace cards / dashboards / analytics derived from those rows must reconcile. Mitigation: per Story 11-2 AC#7 + Story 11-1 AC#7, the status filter on `respondents.status` excludes `rolled_back` from downstream queries — but cross-Epic verification is outside this story's scope.
5. **Story 9-11 audit viewer not yet ready.** If 9-11 hasn't shipped, AC#8 batch detail audit trail falls back to inline simple list. Mitigation: inline fallback is documented in AC#8 + Task 7.

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation.)_

### File List

**Created:**
- `apps/web/src/features/admin-imports/pages/ImportWizardPage.tsx`
- `apps/web/src/features/admin-imports/pages/BatchHistoryPage.tsx`
- `apps/web/src/features/admin-imports/pages/BatchDetailPage.tsx`
- `apps/web/src/features/admin-imports/components/ImportDryRunPreview.tsx` (per Sally's Component #14 spec)
- `apps/web/src/features/admin-imports/components/LawfulBasisSelector.tsx` (per Sally's Component #17 spec — shared, may be moved to shared components dir if used by Epic 10 too)
- `apps/web/src/features/admin-imports/components/RollbackConfirmModal.tsx`
- `apps/web/src/features/admin-imports/components/ColumnMappingEditor.tsx`
- `apps/web/src/features/admin-imports/api/imports.ts` (TanStack Query hooks)
- Tests: component + integration + E2E

**Modified:**
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — Import Data nav item
- TanStack Router config

**Other:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story created by Bob (SM) per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 10 ACs covering sidebar nav + 3-step wizard (Upload → Review → Confirm) + batch history + batch detail + rollback flow + tests. Depends on Story 11-2 backend + Story 9-12 WizardStepIndicator component. | Frontend completing the Epic 11 ingest workflow. Tier B per FRC — post-field. |
