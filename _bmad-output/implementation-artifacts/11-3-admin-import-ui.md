# Story 11.3: Admin Import UI

Status: ready-for-dev

<!--
Created 2026-04-25 by impostor-SM agent per SCP-2026-04-22 §A.5.

Frontend 3-step wizard consuming Story 11-2 endpoints. Uses Sally's ImportDryRunPreview + LawfulBasisSelector components and the WizardStepIndicator pattern from Story 9-12.

Sources:
  • PRD V8.3 FR25 (secondary-data ingestion UI)
  • UX Journey 5 (Super-Admin Data Import) + Custom Components #14 ImportDryRunPreview + #17 LawfulBasisSelector + Visible Step Indicator pattern + Navigation Patterns: super-admin sidebar Import Data item
  • Architecture Decision 3.4 + Rule 8 import batch lifecycle
  • Epics.md §Story 11.3

Depends on Story 11-2 (backend endpoints) + Story 9-12 (WizardStepIndicator).

Validation pass 2026-04-30 (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`): rebuilt to canonical template; 1 URL bug fixed (AC#2 `/dashboard/admin/imports` → `/dashboard/super-admin/imports` matching existing `roleRouteMap` at `sidebarConfig.ts:60-68`); sidebar position clarified ("Submissions → Import Data → Marketplace" was aspirational — neither item exists in current super_admin array; pinned to "after Registry, before Export Data" which IS the data-management cluster in actual sidebarConfig.ts:148-149); coordination note added for new Audit Log + Settings sidebar entries (Story 9-11 + prep-settings-landing).
-->

## Story

As a **Super Admin uploading a secondary-data file (ITF-SUPA Oyo PDF, future MDA exports)**,
I want **a 3-step wizard (Upload → Review → Confirm) with a parsed dry-run preview, column mapping editor, mandatory lawful-basis capture, and a batch history page with rollback affordance**,
so that **I can ingest a 4K-row PDF in <3 minutes without ever touching psql, with full visibility into what will land before I commit and a 14-day safety net to undo**.

## Acceptance Criteria

1. **AC#1 — Sidebar nav item Import Data:** Add to `apps/web/src/features/dashboard/config/sidebarConfig.ts:142-156` super_admin array. **Position: after Registry (currently index 5), before Export Data (currently index 6)** — the data-management cluster in the actual sidebar (Sally's spec referenced "Submissions → Marketplace" anchors which don't exist in the current sidebar array; placement is approximated to the closest existing data-management cluster). Super-admin only via existing role-isolated sidebar pattern (entry lives in `super_admin` keyed array). Icon: Lucide `Upload`. Badge: dot indicator (Primary-600 6px) when an import batch from past 14 days is still in rollback window — pollable via `GET /api/v1/admin/imports?status=active&within=14d&_count=1` (same endpoint as AC#7 list with `_count=1` mode).

2. **AC#2 — Route + page structure at `/dashboard/super-admin/imports`** (corrected from story v1's `/dashboard/admin/imports` — that pattern doesn't match `roleRouteMap` at `sidebarConfig.ts:60-68`; every super-admin URL uses `/dashboard/super-admin/X`):
   - List view (default): all batches table — columns SourceBadge + filename + uploaded-by + date + rows inserted/matched/skipped/failed + status badge (`active` / `rolled_back`) + rollback affordance (visible only within 14-day window)
   - "New Import" button top-right opens 3-step wizard at `/dashboard/super-admin/imports/new`
   - Click row in list → `/dashboard/super-admin/imports/:id` detail page with full audit trail

3. **AC#3 — 3-step wizard using `WizardStepIndicator`** (per Story 9-12 component at `apps/web/src/features/registration/components/WizardStepIndicator.tsx`):
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
   - Calls `POST /api/v1/admin/imports/dry-run` (multipart) on Continue (endpoint mounted via `apps/api/src/routes/imports.routes.ts` per Story 11-2 retrofit; flat-file convention, NOT subdirectory)
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

7. **AC#7 — Batch History list view (`/dashboard/super-admin/imports`):**
   - Sortable columns: source, filename, uploaded-by, date, rows-* counts, status
   - Filter chips: source (multi-select), status (multi-select), uploaded-by (single-select autocomplete), date range
   - URL-routed filter state (per Sally's pattern; mirrors `apps/web/src/features/dashboard/components/SourceFilterChips.tsx` retrofit pattern from Story 11-4)
   - Pagination 50/page
   - Each row clickable → detail page

8. **AC#8 — Batch detail view (`/dashboard/super-admin/imports/:id`):**
   - Header: filename + SourceBadge (uses shared `apps/web/src/components/SourceBadge.tsx` from Story 11-4 retrofit) + status badge + rollback button (if within 14-day window)
   - Metadata card: file_hash (truncated + copy-to-clipboard), file_size, parser_used, uploaded_at, uploaded_by + DSA reference if relevant
   - Lawful basis card: basis + justification text + NDPA reference link
   - Stats card: parsed / inserted / matched-skip / rules-skip / failed counts
   - Failure report download button
   - Audit trail: list of all `audit_logs` events with `meta.batch_id = $id`. **Two paths depending on Story 9-11 readiness:**
     - **If Story 9-11 audit viewer is live**: link to `/dashboard/super-admin/audit-log?target_id=$id` deep-link (uses URL-routed filter state from Story 9-11 AC#6) — single source of truth for audit display
     - **If Story 9-11 not yet ready**: render inline simple list (filename + actor + timestamp + action per row); migrate to deep-link when 9-11 ships

9. **AC#9 — Rollback flow (per Sally's Journey 5):**
   - Rollback button visible only within 14-day window (server-driven via `rollback_eligible: boolean` field in batch detail response)
   - Click opens confirmation modal:
     - Header: "Roll back batch imp_2026_04_25_a3f9?"
     - Body: per Sally's spec — "This will mark the batch as rolled-back and soft-delete its 3,891 imported respondents. The records remain in the database for audit but become invisible to all read-side surfaces (registry, marketplace, dashboards, partner API). This action is logged in the audit log and cannot itself be undone — you would have to re-import the file."
     - Required field: free-text "Reason for rollback" (min 20 chars)
     - Actions: [Cancel] (safe default, focus on open) / [Confirm Rollback] (destructive Error-700)
   - On confirm: calls `POST /api/v1/admin/imports/:id/rollback` with reason
   - Success: toast + status badge updates to "Rolled Back <date> by <actor>"; rollback button hidden
   - Beyond 14-day window: button hidden in UI; if user crafts direct API request, server returns 403 with helpful message (per Story 11-2 AC#7)

10. **AC#10 — Tests:**
    - Component tests: `ImportDryRunPreview` (already part of Sally's Component #14 spec; ensure storybook story); `LawfulBasisSelector` (Component #17); wizard step navigation
    - Integration tests: full 3-step wizard happy path with mocked API; dry-run preview + column-mapping edit re-runs dry-run; rollback flow with confirmation modal
    - E2E test: upload sample ITF-SUPA fixture (from Story 11-2 test-fixtures at `apps/api/test-fixtures/itf-supa-sample.pdf`) → review → confirm → see in batch history → roll back → verify status flip
    - Existing 4,191-test baseline maintained or grown

## Tasks / Subtasks

- [ ] **Task 1 — Sidebar + routing** (AC: #1, #2)
  - [ ] 1.1 Add Import Data nav item to `apps/web/src/features/dashboard/config/sidebarConfig.ts:142-156` super_admin array — position after Registry (line ~148), before Export Data (line ~149); icon `Upload` from lucide-react
  - [ ] 1.2 Coordinate with concurrent sidebar additions: Story 9-11 (Audit Log, after System Health) + `prep-settings-landing-and-feature-flags` (Settings, after Audit Log). Insertions are commutative within the array; whichever story commits first claims its slot. Update `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` if it asserts on array length.
  - [ ] 1.3 Add routes: `/dashboard/super-admin/imports` + `/dashboard/super-admin/imports/new` + `/dashboard/super-admin/imports/:id` (TanStack Router); URL pattern matches existing `roleRouteMap` convention at `sidebarConfig.ts:60-68`
  - [ ] 1.4 Auth guards: super-admin only (per existing role-isolated route pattern)

- [ ] **Task 2 — Wizard shell** (AC: #3)
  - [ ] 2.1 New page `apps/web/src/features/admin-imports/pages/ImportWizardPage.tsx` (NEW feature directory `apps/web/src/features/admin-imports/`, mirrors Wave 1/2 precedent: `registration/`, `audit-log/`, `settings/`)
  - [ ] 2.2 Use `WizardStepIndicator` component from Story 9-12 (`apps/web/src/features/registration/components/WizardStepIndicator.tsx`) — verify component is shipped before this story starts dev work; if not, author here. Per A.5 dependency order: 9-12 ships before 11-3.
  - [ ] 2.3 Step navigation: Continue / Back; URL-routed step number (`/imports/new?step=N`)
  - [ ] 2.4 Cancel/exit confirmation if dry-run token issued

- [ ] **Task 3 — Step 1 Upload** (AC: #4)
  - [ ] 3.1 Drag-and-drop + file picker
  - [ ] 3.2 Source dropdown + parser dropdown + description textarea
  - [ ] 3.3 Form validation
  - [ ] 3.4 POST to dry-run endpoint with multipart (endpoint at `apps/api/src/routes/imports.routes.ts` mounted at `/api/v1/admin/imports/*` per Story 11-2 retrofit)
  - [ ] 3.5 Loading state + error handling

- [ ] **Task 4 — Step 2 Review** (AC: #5)
  - [ ] 4.1 Use `ImportDryRunPreview` component per Sally's spec — author the component itself if not pre-existing at `apps/web/src/features/admin-imports/components/ImportDryRunPreview.tsx`
  - [ ] 4.2 Use `LawfulBasisSelector` component per Sally's spec — author at `apps/web/src/features/admin-imports/components/LawfulBasisSelector.tsx` (initial location; may be promoted to `apps/web/src/components/LawfulBasisSelector.tsx` shared if Epic 10 also needs it)
  - [ ] 4.3 Column-mapping editor with re-run dry-run
  - [ ] 4.4 Per-row drawer
  - [ ] 4.5 Failure report download

- [ ] **Task 5 — Step 3 Confirm** (AC: #6)
  - [ ] 5.1 Final summary screen with explicit numbers
  - [ ] 5.2 POST to confirm endpoint (`/api/v1/admin/imports/confirm` per Story 11-2 AC#4) with dry-run token + lawful basis + justification
  - [ ] 5.3 Loading + success + failure states

- [ ] **Task 6 — Batch history list** (AC: #7)
  - [ ] 6.1 New page `apps/web/src/features/admin-imports/pages/BatchHistoryPage.tsx`
  - [ ] 6.2 Table with sortable columns + filter chips + URL state + pagination

- [ ] **Task 7 — Batch detail** (AC: #8)
  - [ ] 7.1 New page `apps/web/src/features/admin-imports/pages/BatchDetailPage.tsx`
  - [ ] 7.2 Metadata + lawful basis + stats + failure report download
  - [ ] 7.3 Audit trail surface — TWO paths per AC#8: (a) deep-link to Story 9-11 audit viewer at `/dashboard/super-admin/audit-log?target_id=$id` IF 9-11 is shipped, OR (b) inline simple list as fallback. Implementation should detect 9-11 availability via setting flag (similar pattern to `audit_log_viewer_available` flag introduced by Story 10-1) OR via runtime feature detection (does the route exist?). Defer choice to dev-time.

- [ ] **Task 8 — Rollback flow** (AC: #9)
  - [ ] 8.1 Rollback button on detail page (visible when server returns `rollback_eligible: true` in batch detail response)
  - [ ] 8.2 Confirmation modal per Sally's spec at `apps/web/src/features/admin-imports/components/RollbackConfirmModal.tsx`
  - [ ] 8.3 POST to rollback endpoint (`/api/v1/admin/imports/:id/rollback` per Story 11-2 AC#7) with reason
  - [ ] 8.4 UI updates on success

- [ ] **Task 9 — Tests + sprint-status** (AC: #10)
  - [ ] 9.1 Component tests + integration tests + E2E
  - [ ] 9.2 Run `pnpm test` from root — verify baseline 4,191 + new tests
  - [ ] 9.3 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `11-3-admin-import-ui: in-progress` → `review` → `done`

- [ ] **Task 10 — Code review** (cross-cutting AC: all)
  - [ ] 10.1 Run `/bmad:bmm:workflows:code-review` on the uncommitted working tree (per the existing "code review before commit" project pattern in MEMORY.md `feedback_review_before_commit.md`)
  - [ ] 10.2 Auto-fix all High/Medium severity findings; document Low-severity deferrals in Review Follow-ups (AI)
  - [ ] 10.3 Only after code review passes, commit and mark status `review`

## Dev Notes

### Dependencies

- **Story 11-2 (HARD)** — backend endpoints (`/api/v1/admin/imports/*`) live at `apps/api/src/routes/imports.routes.ts` (per Story 11-2 retrofit — flat file under `routes/`, NOT subdirectory)
- **Story 9-12 `WizardStepIndicator` component (HARD)** — reused; Story 9-12 must land first OR component must be authored as part of this story (see Risk #1)
- **Story 11-4 `SourceBadge` component (PREFERRED)** — reused for AC#8 batch detail header; can be authored in this story if 11-4 not yet shipped
- **Sally's Custom Components #14 (`ImportDryRunPreview`) + #17 (`LawfulBasisSelector`)** — UI specs
- **Story 9-11 audit viewer (PREFERRED, not strict)** — for AC#8 audit trail deep-link surface; not strict (can fall back to inline simple list if 9-11 not yet ready per Task 7.3)

### Field Readiness Certificate Impact

**Tier B** — does NOT block field-survey start. Can ship during the first weeks of field operation.

### `WizardStepIndicator` cross-Story dependency

Sally's Visible Step Indicator pattern is used by Story 9-12 (Public Wizard) and this story (Admin Import Wizard). Whichever story lands first authors the component; the other consumes. Per A.5 dependency order: 9-12 lands before 11-3, so 9-12 is the author. If sequence changes, this story authors instead — coordinate via sprint-status.

Component path per Story 9-12 retrofit: `apps/web/src/features/registration/components/WizardStepIndicator.tsx`. Cross-feature usage: this story imports it directly from that path (no shared-component refactor for MVP).

### Dry-run token persistence across step navigation

The dry-run token returned by Step 1's API call must survive Step 2 → Step 3 navigation. Store in TanStack Query cache or component state (not localStorage — security; not URL — too long). On wizard cancel/back-out before Step 3 commits, the token expires server-side after 1 hour automatically (per Story 11-2 implementation).

### Per-row drawer match-against-existing diff

When a parsed row matched an existing respondent (auto-skip), the drawer shows the diff. **PII consideration:** matched_respondent_id is hashed in the failure report (per Story 11-2 AC#5). The drawer needs the actual matched respondent's data to show the diff — but the admin already has Super Admin access, so this is consistent with their existing privilege. The diff renders both rows side-by-side with changed fields highlighted.

### Why a separate "New Import" button vs default wizard view

The default landing on `/dashboard/super-admin/imports` is the batch history (more frequent action: "what did I import recently?"). Wizard is a less-frequent task — gated behind explicit "New Import" button. This matches the GitHub Issues pattern (issue list default, "New Issue" button) which is the most intuitive admin-flow for similar tasks.

### Rollback button visibility logic

Cleanest approach: server includes `rollback_eligible: boolean` in batch detail response (computed as `status === 'active' AND uploaded_at > now() - 14 days`). Frontend just shows button when `rollback_eligible` is true. Avoids client-side date arithmetic that could drift across timezones.

### Audit trail surface decision (AC#8 / Task 7.3)

Two paths per AC#8 + Task 7.3:
- **Path A (preferred — Story 9-11 audit viewer is live):** deep-link from batch detail page to `/dashboard/super-admin/audit-log?target_id=$id&target_resource=import_batches` — single source of truth, leverages 9-11's filter + pagination + export
- **Path B (fallback — Story 9-11 not yet shipped):** inline simple list within batch detail page — simpler implementation but parallel display logic

Decision deferred to dev-time. If 9-11 ships before this story → Path A. If not → Path B with explicit "TODO: migrate to deep-link when 9-11 ships" comment + tracking item in MEMORY.md.

### Sidebar position — aspirational vs actual

Story v1 referenced "Submissions → Import Data → Marketplace" as Sally's intended placement. The actual `apps/web/src/features/dashboard/config/sidebarConfig.ts:142-156` super_admin array does not contain "Submissions" or "Marketplace" entries (the data-management cluster is: Registry → Export Data → Remuneration → Payment Disputes → Reveal Analytics → Survey Analytics, with Staff Management and Questionnaires earlier). Closest semantic placement: **after Registry, before Export Data** — both are data-management-cluster entries. Final placement may be re-tuned by Sally during impl review.

### Risks

1. **`WizardStepIndicator` ownership ambiguity.** If Story 9-12 ships in parallel with this story, both may author the component. Mitigation: explicit dependency on 9-12 in this story; coordination via sprint-status comment block; per A.5 dependency order, 9-12 ships first.
2. **PDF dry-run can be slow.** 30-second server-side timeout per Story 11-2 means user may see long spinner. Mitigation: explicit "this can take 5-15 seconds for large PDFs" copy in the loading state; show file size as context cue.
3. **Column-mapping editor UX complexity.** Mapping arbitrary CSV columns to canonical respondent fields is a tough UX (drag-and-drop? dropdowns? AI-suggest?). For MVP scope: dropdowns per column with auto-detected default. Future enhancement: AI-suggest based on column header patterns. Keeps MVP shippable.
4. **Rollback within 14 days but downstream analytics already aggregated.** When batch is rolled back, marketplace cards / dashboards / analytics derived from those rows must reconcile. Mitigation: per Story 11-2 AC#7 + Story 11-1 AC#7, the status filter on `respondents.status` excludes `rolled_back` from downstream queries — but cross-Epic verification is outside this story's scope.
5. **Story 9-11 audit viewer not yet ready.** If 9-11 hasn't shipped, AC#8 batch detail audit trail falls back to inline simple list per Task 7.3. Mitigation: inline fallback is documented + flagged for migration when 9-11 ships.
6. **Sidebar coordination drift.** Three concurrent stories add nav items: this story (Import Data), 9-11 (Audit Log), prep-settings-landing (Settings). Mitigation: insertions are commutative within the array; rebase on merge; update test if it asserts on array length.

### Project Structure Notes

- **NEW feature directory** `apps/web/src/features/admin-imports/` with `pages/`, `components/`, `api/` subdirs. Mirrors Wave 1/2 precedent (`registration/`, `audit-log/`, `settings/` from Stories 9-12, 9-11, prep-settings-landing). Substantial-enough surface (3 wizard steps + 4 components + history + detail page) to warrant its own dir.
- **Web feature directory layout** verified 2026-04-30 — existing dirs are: `about`, `auth`, `dashboard`, `forms`, `home`, `insights`, `legal`, `marketplace`, `onboarding`, `participate`, `questionnaires`, `remuneration`, `staff`, `support`. New `admin-imports/` is the 15th feature dir (alongside other new ones from Wave 1/2 retrofits).
- **Sidebar config** at `apps/web/src/features/dashboard/config/sidebarConfig.ts:142-156` (super_admin array). All super-admin URLs use `/dashboard/super-admin/X` pattern (per `roleRouteMap` at `sidebarConfig.ts:60-68`). **Story v1's URL `/dashboard/admin/imports` was a typo** — that pattern doesn't exist anywhere in the codebase. Corrected to `/dashboard/super-admin/imports` throughout.
- **Concurrent sidebar additions** during Wave 0/1/2 retrofit cascade: this story adds Import Data, Story 9-11 adds Audit Log, prep-settings-landing adds Settings. All three are NavItem appends within the same `super_admin` keyed array. Insertions are commutative; rebase order doesn't matter; final order = whatever order the commits land. Update `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` if it asserts array length.
- **Component cross-feature reuse:**
  - `WizardStepIndicator` from Story 9-12 (path: `apps/web/src/features/registration/components/WizardStepIndicator.tsx`)
  - `SourceBadge` from Story 11-4 (path: `apps/web/src/components/SourceBadge.tsx` — shared component)
  - `LawfulBasisSelector` authored here (path: `apps/web/src/features/admin-imports/components/LawfulBasisSelector.tsx`); may be promoted to shared if Epic 10 needs it
- **Backend endpoints** consumed via TanStack Query hooks at `apps/web/src/features/admin-imports/api/imports.api.ts` (NEW file). Calls go through existing `apiClient` at `apps/web/src/lib/api-client.ts:31` (fetch-based, throws `ApiError`; NOT axios).
- **Audit trail deep-link** uses Story 9-11's URL-routed filter state (per 9-11 retrofit AC#6). Format: `/dashboard/super-admin/audit-log?target_resource=import_batches&target_id=$id`. Falls back to inline list per Task 7.3 if 9-11 not yet shipped.
- **CSP discipline:** Story 9-7 enforces strict CSP via nginx mirror. Frontend components must avoid `eval` / `new Function()` / inline scripts. Affects choice of any column-mapping editor library that uses dynamic code generation.
- **TanStack Query convention** — feature-level api file at `apps/web/src/features/admin-imports/api/imports.api.ts`; hooks named `useImportBatches`, `useImportBatchDetail`, `useDryRun`, `useConfirmImport`, `useRollbackImport`, etc.
- **NEW directories created by this story:**
  - `apps/web/src/features/admin-imports/` (with `pages/`, `components/`, `api/` subdirs)

### References

- Architecture Decision 3.4 (`/api/v1/admin/imports/*` namespace + Rule 8 import batch lifecycle): [Source: _bmad-output/planning-artifacts/architecture.md Decision 3.4]
- Epics — Story 11.3 entry: [Source: _bmad-output/planning-artifacts/epics.md Epic 11 §11.3]
- Story 11-2 (HARD dependency — backend endpoints + ITF-SUPA test fixture): [Source: _bmad-output/implementation-artifacts/11-2-import-service-parsers.md AC#3-#8, Task 7.1]
- Story 9-12 (HARD dependency — `WizardStepIndicator` component): [Source: _bmad-output/implementation-artifacts/9-12-public-wizard-pending-nin-magic-link.md AC#2, Task 4.2]
- Story 11-4 (PREFERRED — `SourceBadge` shared component): [Source: _bmad-output/implementation-artifacts/11-4-source-badges-filter-chips.md AC#1, Task 1]
- Story 9-11 (PREFERRED — audit viewer for AC#8 deep-link): [Source: _bmad-output/implementation-artifacts/9-11-admin-audit-log-viewer.md AC#1, AC#6]
- Sidebar config (append Import Data NavItem; URL convention): [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts:60-68,142-156]
- Sidebar test (may need length assertion update): [Source: apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts]
- Story 11-2 imports endpoint location (flat file): [Source: apps/api/src/routes/imports.routes.ts (created by Story 11-2)]
- Story 11-2 ITF-SUPA test fixture: [Source: apps/api/test-fixtures/itf-supa-sample.pdf (created by Story 11-2 Task 7.1)]
- Web HTTP client (TanStack Query hooks consume): [Source: apps/web/src/lib/api-client.ts:31]
- MEMORY.md key pattern: integration tests use beforeAll/afterAll: [Source: MEMORY.md "Key Patterns"]
- MEMORY.md key pattern: code review before commit: [Source: MEMORY.md "Process Patterns" + `feedback_review_before_commit.md`]

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation. Implementer must include:)_

- Final sidebar position (verify against actual array post-merge of concurrent retrofits)
- AC#8 audit trail surface decision (Path A deep-link to 9-11 vs Path B inline list — Task 7.3 outcome)
- `LawfulBasisSelector` component final location (feature-local vs shared)
- `WizardStepIndicator` import path verified (was 9-12 the author, or did this story author?)
- Code review findings + fixes (cross-reference Review Follow-ups (AI) below)

### File List

**Created:**
- `apps/web/src/features/admin-imports/pages/ImportWizardPage.tsx`
- `apps/web/src/features/admin-imports/pages/BatchHistoryPage.tsx`
- `apps/web/src/features/admin-imports/pages/BatchDetailPage.tsx`
- `apps/web/src/features/admin-imports/components/ImportDryRunPreview.tsx` (per Sally's Component #14 spec)
- `apps/web/src/features/admin-imports/components/LawfulBasisSelector.tsx` (per Sally's Component #17 spec — feature-local; may be promoted to `apps/web/src/components/` shared if Epic 10 also needs it)
- `apps/web/src/features/admin-imports/components/RollbackConfirmModal.tsx`
- `apps/web/src/features/admin-imports/components/ColumnMappingEditor.tsx`
- `apps/web/src/features/admin-imports/api/imports.api.ts` (TanStack Query hooks)
- Tests: component + integration + E2E

**Modified:**
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — Import Data nav item appended to `super_admin` array (position: after Registry, before Export Data; coordinate with concurrent 9-11 + prep-settings-landing additions per Task 1.2)
- `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` — update if asserts on array length
- TanStack Router config — add routes `/dashboard/super-admin/imports`, `/dashboard/super-admin/imports/new`, `/dashboard/super-admin/imports/:id`

**Other:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

**Out of scope (explicitly NOT modified — happens in downstream / future stories):**
- Backend imports routes — Story 11-2
- `SourceBadge` shared component — Story 11-4
- `WizardStepIndicator` component — Story 9-12 (this story consumes)
- Audit viewer page — Story 9-11 (this story deep-links if available)
- Settings landing page — `prep-settings-landing-and-feature-flags`

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story drafted by impostor-SM agent per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 10 ACs covering sidebar nav + 3-step wizard (Upload → Review → Confirm) + batch history + batch detail + rollback flow + tests. Depends on Story 11-2 backend + Story 9-12 WizardStepIndicator component. | Frontend completing the Epic 11 ingest workflow. Tier B per FRC — post-field. |
| 2026-04-30 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level "Dependencies", "Field Readiness Certificate Impact", "Technical Notes" (preserving all 6 subsections — `WizardStepIndicator` cross-Story dependency / Dry-run token persistence / Per-row drawer match-against-existing diff / Why a separate "New Import" button / Rollback button visibility logic / Audit trail surface decision), "Risks" under Dev Notes; converted task-as-headings (`### Task N — Title` + `1.1.` numbered subitems) to canonical `[ ] Task N (AC: #X)` checkbox format with `[ ] N.M` subtasks; added `### Project Structure Notes` subsection covering new feature dir + sidebar coordination with 3 concurrent stories + component cross-feature reuse map + audit-trail deep-link pattern; added `### References` subsection with 13 verified `[Source: file:line]` cites; moved top-level `## Change Log` under `## Dev Agent Record` as `### Change Log`; added `### Review Follow-ups (AI)` placeholder; added Task 10 (code review) per `feedback_review_before_commit.md`. **One factual URL bug fixed:** AC#2 + Task 1.3 + AC#7-#8 URL pattern `/dashboard/admin/imports` corrected to `/dashboard/super-admin/imports` matching existing `roleRouteMap` convention at `sidebarConfig.ts:60-68` (every super-admin URL uses `/dashboard/super-admin/X`; `/dashboard/admin/X` doesn't exist anywhere). **Sidebar position aspirational-vs-actual reconciled:** AC#1 + Task 1.1 + Dev Notes "Sidebar position — aspirational vs actual" — story v1 referenced "Submissions → Import Data → Marketplace" which neither item exists in actual super_admin sidebar; pinned to "after Registry, before Export Data" which IS the data-management cluster in actual `sidebarConfig.ts:148-149`. **Coordination note added** for concurrent sidebar additions from Story 9-11 (Audit Log) + `prep-settings-landing-and-feature-flags` (Settings) — insertions are commutative within array, rebase on merge. **Audit-trail two-path approach surfaced** (AC#8 + Task 7.3 + Dev Notes): Path A deep-link to Story 9-11 viewer if shipped; Path B inline simple list as fallback. **Cross-feature component reuse documented** in Project Structure Notes: `WizardStepIndicator` from 9-12, `SourceBadge` from 11-4, `LawfulBasisSelector` authored here. All 10 ACs preserved verbatim. Status `ready-for-dev` preserved. | Story v1 was authored by impostor-SM agent without canonical workflow load — same drift pattern as Stories 9-13 / prep-tsc / prep-build-off-vps / 11-1 / prep-input-sanitisation-layer / 10-5 / 9-11 / 11-2 / 11-4 / 9-12. One factual URL bug + one aspirational-vs-actual sidebar position reconciliation. Otherwise low-novelty drift signature. |

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution per Task 10.)_
