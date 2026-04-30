# Story 11.4: Source Badges + Filter Chips

Status: ready-for-dev

<!--
Created 2026-04-25 by impostor-SM agent per SCP-2026-04-22 §A.5.

Wires Sally's SourceBadge component into 4 read-side surfaces (Registry / Respondent Detail / Marketplace cards / Assessor Queue) + adds source filter chip on Registry page.

Sources:
  • PRD V8.3 FR25 (multi-source provenance surfacing)
  • Architecture Decision 1.5 (extended source enum) + ADR-018
  • UX Custom Component #13 SourceBadge (3 variants: inline / detail / corner) + Filter Chips pattern + Journey 5 Step downstream
  • Epics.md §Story 11.4

Depends on Story 11-1 (extended source enum live in DB).

Validation pass 2026-04-30 (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`): rebuilt to canonical template; 7 factual path corrections applied (registry feature dir → dashboard feature dir; verification feature dir → dashboard feature dir; MarketplaceCard → WorkerCard; respondents service → new file at canonical path; respondents.routes.ts plural → respondent.routes.ts singular; RegistryListPage → RespondentRegistryPage; multiple sub-path realignments). Q3 resolved per Awwal directive: new `apps/api/src/services/respondents.service.ts` created (matches existing service pattern at `audit.service.ts`, `staff.service.ts`, etc.).
-->

## Story

As an **Admin / Supervisor / Assessor / Marketplace Searcher viewing respondent records**,
I want **a colour-coded `SourceBadge` on every respondent surface (registry table row, respondent detail, marketplace card, assessor queue row) and a multi-select filter chip on the Registry page to filter by source**,
so that **I can apply appropriate trust-tier thinking to each record without misreading low-trust imports as field-verified, and I can quickly find all records from a specific source for cross-checking or audit purposes**.

## Acceptance Criteria

1. **AC#1 — `SourceBadge` component (per Sally's Component #13):** New shared component at `apps/web/src/components/SourceBadge.tsx` (shared because used across multiple features). Three variants:
   - `inline` (16px height) — table cells
   - `detail` (24px height) — Respondent Detail page header beside the name
   - `corner` (12px height, top-right corner) — Marketplace cards (when consent permits)
   - Visual contract per Sally's table:
     - `enumerator` (Success-100/900) icon `UserCheck` label "Field-Verified"
     - `clerk` (Teal-100/900) icon `FileText` label "Clerk-Entered"
     - `public` (Info-100/900) icon `Globe` label "Self-Registered"
     - `imported_itf_supa` (Amber-100/900) icon `Download` label "Imported (ITF-SUPA)"
     - `imported_other` (Neutral-200/700) icon `Download` label "Imported (Other)"
   - Imported variants additionally show "⚠ Unverified" sub-badge when `respondent.status = 'imported_unverified'` (per Sally's spec)
   - Accessibility: `role="status"` + `aria-label` describing trust tier; colour is never the sole information channel (icon + label carry meaning)
   - Hover/focus tooltip: trust tier semantic explanation

2. **AC#2 — Wired into Registry Table:** Edit existing `apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx` — add new column "Source" rendering `SourceBadge variant="inline"` per row, using `respondent.source` value. Column sortable by source. (Note: actual file path is `dashboard/components/RespondentRegistryTable.tsx`, NOT `registry/components/RegistryTable.tsx` — the `registry/` feature directory does not exist; registry surfaces live under `dashboard/`.)

3. **AC#3 — Wired into Respondent Detail:** Edit existing `apps/web/src/features/dashboard/pages/RespondentDetailPage.tsx` — render `SourceBadge variant="detail"` in header beside the respondent's name. Display `external_reference_id` (if non-null) in metadata section ("Imported as: ITF-SUPA admission no. ADM12345"). Display `import_batch_id` linking to Story 11-3 batch detail page (if super-admin role).

4. **AC#4 — Wired into Marketplace cards:** Edit existing `apps/web/src/features/marketplace/components/WorkerCard.tsx` — render `SourceBadge variant="corner"` only when respondent has marketplace consent AND when source is non-`enumerator` (the most trustworthy source needs no badge — minimum visual noise). Imports get the badge prominently because marketplace searchers should know they're not looking at field-verified data. (Note: actual file is `WorkerCard.tsx`, NOT `MarketplaceCard.tsx` — story v1 had a fictional name.)

5. **AC#5 — Wired into Assessor Queue:** Edit existing `apps/web/src/features/dashboard/pages/AssessorQueuePage.tsx` — render `SourceBadge variant="inline"` per queue row. Imported records may need different verification workflow (cross-reference vs first-time-verify) — the badge is the assessor's primary cue. (Note: there is no separate `verification/` feature dir; assessor surfaces live under `dashboard/pages/Assessor*.tsx`. Row component is currently inline within the page; impl may need to extract a row sub-component if the badge wiring is non-trivial — defer extraction decision to dev-time.)

6. **AC#6 — Source filter chip on Registry page (per Sally's Filter Chips pattern):**
   - Multi-select chip group above the Registry table — landed in existing `apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx` (NOT `registry/pages/RegistryListPage.tsx` — fictional path)
   - One chip per source enum value (5 chips total: enumerator / clerk / public / imported_itf_supa / imported_other)
   - Each chip uses the same colour palette as the corresponding `SourceBadge` (visual consistency)
   - Click chip toggles inclusion in filter
   - Chips show count of matching records ("Field-Verified (1,247)")
   - URL-routed filter state (`?source=enumerator,clerk` etc.) — shareable filter URLs
   - "Clear filters" link when any chip selected
   - Default state: all chips selected (= no filter applied)

7. **AC#7 — Backend: list-with-source-filter endpoint:**
   - Edit existing `apps/api/src/routes/respondent.routes.ts` (singular `respondent.routes.ts`, NOT plural — story v1 had `respondents.routes.ts` typo): extend the existing respondents-list endpoint to accept `source` query param (comma-separated multi-value) and additional filter dimensions per existing pattern
   - Add WHERE clause `respondents.source = ANY($sources)` when filter provided
   - Add count-by-source aggregate to response metadata for AC#6 chip counts (or separate `GET /api/v1/respondents/source-counts` endpoint to avoid bloating list response — pick at impl time based on response-payload-size considerations)
   - Auth: existing role-based access (super-admin, supervisor, assessor)

8. **AC#8 — Performance:** Source filter queries use Story 11-1's composite index `respondents(source, created_at)` (verified via EXPLAIN ANALYZE on seeded 500K-respondent dataset using `apps/api/src/db/seed-projected-scale.ts` from 11-1). p95 < 500ms with single source filter; < 800ms with two combined filters (source + LGA). If thresholds exceed, this story adds the additional index in its migration.

9. **AC#9 — Tests:**
   - Component tests: `SourceBadge` (each variant + each source value + accessibility + hover tooltip + sub-badge for imported_unverified)
   - Integration tests: Registry table renders correct badge per row; filter chips toggle correctly; URL state syncs
   - E2E test: super-admin filters Registry by `imported_itf_supa` → sees only those records; clears filter → sees all
   - Backend: list endpoint with source filter returns expected rows; count-by-source matches actual counts
   - Existing 4,191-test baseline maintained or grown

## Tasks / Subtasks

- [ ] **Task 1 — `SourceBadge` shared component** (AC: #1)
  - [ ] 1.1 Create `apps/web/src/components/SourceBadge.tsx` per Sally's spec (shared component location, NOT under a feature dir; mirrors existing shared components if any — verify pattern at impl time)
  - [ ] 1.2 Tailwind classes per source value (use design-system colour tokens, not raw hex)
  - [ ] 1.3 Sub-badge for `imported_unverified` status
  - [ ] 1.4 Accessibility: aria-label, role, tooltip
  - [ ] 1.5 Storybook stories per variant + per source (verify Storybook is in stack at impl time)
  - [ ] 1.6 Unit tests

- [ ] **Task 2 — Wire into Registry Table** (AC: #2)
  - [ ] 2.1 Edit existing `apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx` — add Source column with `SourceBadge variant="inline"`
  - [ ] 2.2 Make column sortable
  - [ ] 2.3 Update existing tests at `apps/web/src/features/dashboard/components/__tests__/RespondentRegistryTable.test.tsx` (verified to exist 2026-04-30)

- [ ] **Task 3 — Wire into Respondent Detail** (AC: #3)
  - [ ] 3.1 Edit existing `apps/web/src/features/dashboard/pages/RespondentDetailPage.tsx`
  - [ ] 3.2 Add `SourceBadge variant="detail"` in header beside respondent name
  - [ ] 3.3 Add metadata section showing `external_reference_id` (if non-null) and `import_batch_id` link (super-admin gated for batch link)
  - [ ] 3.4 Update existing tests at `apps/web/src/features/dashboard/pages/__tests__/RespondentDetailPage.test.tsx`

- [ ] **Task 4 — Wire into Marketplace cards** (AC: #4)
  - [ ] 4.1 Edit existing `apps/web/src/features/marketplace/components/WorkerCard.tsx` (NOT `MarketplaceCard.tsx` — that file does not exist)
  - [ ] 4.2 Add `SourceBadge variant="corner"` conditionally (consent + non-enumerator source)
  - [ ] 4.3 Update existing tests for WorkerCard

- [ ] **Task 5 — Wire into Assessor Queue** (AC: #5)
  - [ ] 5.1 Edit existing `apps/web/src/features/dashboard/pages/AssessorQueuePage.tsx`
  - [ ] 5.2 Identify queue row rendering (likely inline within the page component; if non-trivial, extract a row sub-component at `apps/web/src/features/dashboard/components/AssessorQueueRow.tsx` — defer extraction decision to dev-time based on page complexity)
  - [ ] 5.3 Add `SourceBadge variant="inline"` per row
  - [ ] 5.4 Update existing tests for AssessorQueuePage

- [ ] **Task 6 — Source filter chips on Registry** (AC: #6)
  - [ ] 6.1 New component `apps/web/src/features/dashboard/components/SourceFilterChips.tsx` (NOT `features/registry/components/...` — `registry/` feature dir does not exist; registry surfaces live under `dashboard/`)
  - [ ] 6.2 Multi-select chip group with same colour palette as `SourceBadge`
  - [ ] 6.3 URL-routed via TanStack Router search params
  - [ ] 6.4 Count display per chip from new backend endpoint (per AC#7)
  - [ ] 6.5 Wire into existing `apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx` above the table — placement adjacent to existing `RegistryFilters` component (`apps/web/src/features/dashboard/components/RegistryFilters.tsx`, verified to exist 2026-04-30)

- [ ] **Task 7 — Backend: source filter endpoint + service layer** (AC: #7, #8)
  - [ ] 7.1 Create new `apps/api/src/services/respondents.service.ts` (file does NOT yet exist; canonical service-layer pattern — per Awwal directive Q3=(a)). This service will host the list-with-source-filter logic, count-by-source aggregate, and any future respondent-list query composition. Follows existing service-layer pattern at `apps/api/src/services/audit.service.ts`, `staff.service.ts`, `submission-processing.service.ts`, etc.
  - [ ] 7.2 Edit existing `apps/api/src/routes/respondent.routes.ts` (singular `respondent.routes.ts`, NOT plural — story v1 had typo): wire route handlers to call new `RespondentsService` methods; accept `source` query param (comma-separated multi-value)
  - [ ] 7.3 Add `respondents.source = ANY($sources)` WHERE clause via Drizzle query builder
  - [ ] 7.4 New endpoint `GET /api/v1/respondents/source-counts` returning per-source counts (with same role-based filter applied for honest counts per role); mounts in same `respondent.routes.ts`
  - [ ] 7.5 Verify AC#8 performance via EXPLAIN ANALYZE on Story 11-1 seeded dataset (`apps/api/src/db/seed-projected-scale.ts`)
  - [ ] 7.6 Tests: service unit tests + route integration tests

- [ ] **Task 8 — Tests + sprint-status** (AC: #9)
  - [ ] 8.1 Add tests per AC#9 categories
  - [ ] 8.2 Run `pnpm test` from root — verify baseline 4,191 + new tests
  - [ ] 8.3 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `11-4-source-badges-filter-chips: in-progress` → `review` → `done`

- [ ] **Task 9 — Code review** (cross-cutting AC: all)
  - [ ] 9.1 Run `/bmad:bmm:workflows:code-review` on the uncommitted working tree (per the existing "code review before commit" project pattern in MEMORY.md `feedback_review_before_commit.md`)
  - [ ] 9.2 Auto-fix all High/Medium severity findings; document Low-severity deferrals in Review Follow-ups (AI)
  - [ ] 9.3 Only after code review passes, commit and mark status `review`

## Dev Notes

### Dependencies

- **Story 11-1 (HARD)** — extended source enum (`imported_itf_supa`, `imported_other`) live in DB; composite index `(source, created_at)` for AC#8 performance
- **Story 11-2 (PREFERRED, not strict)** — to have actual `imported_*` rows in DB for testing AC#2-AC#5; can be tested against manually-inserted fixture rows if 11-2 not yet ready
- **Sally's Custom Component #13 SourceBadge + Filter Chips pattern** — UI specs

### Field Readiness Certificate Impact

**Tier B** — does NOT block field-survey start. Can ship during the first weeks of field operation. Post-field, this story is what makes the Multi-Source Registry trustworthy from a read-side perspective (without it, source provenance is hidden in the DB and the registry looks deceptively uniform).

### Why corner variant only for marketplace + only non-enumerator

Marketplace cards have limited visual real estate; a full inline badge per card creates noise. The corner variant (12px height, top-right) is a subtle quality cue. Excluding `enumerator` source from the badge follows the principle: the default trust tier doesn't need labelling; lower tiers do.

### Why sub-badge only for `imported_unverified`

`imported_unverified` is a transient state — once a field-verified submission cross-references the imported record, status promotes to `imported_cross_referenced` (future status, not in MVP — see Out of Scope below). The sub-badge highlights the current uncertainty. After cross-referencing (future), the sub-badge would disappear and the trust tier could potentially upgrade.

### Why URL-routed filter state

Investigators (super-admin, supervisor, assessor) often share filtered views with colleagues. URL-routed filter state means a Slack message with the URL takes the recipient to the same view. PII access is enforced at the API layer regardless of URL access, so sharing URLs is safe.

### Filter chip count semantics

Counts in chips are **post-other-filters** (e.g. if LGA filter is applied, the source counts reflect only respondents in that LGA). This matches the standard Faceted Search UX pattern. Implementing this efficiently requires either:
- Re-querying counts on every other-filter change (slow at 500K rows)
- Pre-aggregating counts in a materialised view (premature optimisation)

For MVP: simple re-query on filter change; rely on Story 11-1 composite index for performance. If post-field metrics show this is slow, add a materialised view in a follow-up story.

### Out of scope: `imported_cross_referenced` status

Future enhancement: when a field-verified submission lands and matches an existing `imported_unverified` respondent (by NIN or other strong identifier), upgrade the status to `imported_cross_referenced`. This is a Story 11-5 future deliverable, NOT in MVP. The hooks are in place (status enum extensible), but the cross-reference detection logic is non-trivial and warrants its own story.

### Visual hierarchy: badge vs row content

The badge is a quality cue, not the primary content. Badge styling intentionally lower-contrast than the respondent name + key fields — the eye should land on identity first, then notice the badge. If users start scanning by badge instead, the design is wrong (signals the badge is too prominent).

### Risks

1. **Existing component paths confirmed during retrofit** — story v1 had multiple fictional paths (`registry/`, `verification/`, `MarketplaceCard.tsx`, `respondents.routes.ts`). All corrected against actual codebase 2026-04-30. Risk of further drift is low given retrofit-pass verification.
2. **Filter performance at 500K respondents may exceed thresholds.** Mitigation: AC#8 specifies EXPLAIN ANALYZE verification + adds index if needed.
3. **Marketplace card corner badge may overlap existing UI elements.** Mitigation: visual QA pass on each affected card variant; adjust corner positioning per breakpoint.
4. **Sub-badge for `imported_unverified` adds visual complexity.** Some users may find the dual-badge layout confusing. Mitigation: tooltip on sub-badge explains the semantics; usability test during implementation.
5. **URL filter state may grow unwieldy with many filters.** Mitigation: chip count limited to 5 (one per source enum value); other filters use existing patterns.
6. **Assessor queue row component may not exist as separate file.** Story v1 referenced `AssessorQueueRow.tsx` which doesn't exist; queue row is likely inline within `AssessorQueuePage.tsx`. Mitigation: Task 5.2 defers extraction decision to dev-time; if extraction is non-trivial, fold into a separate prep task.

### Project Structure Notes

- **Shared components** at `apps/web/src/components/` — `SourceBadge.tsx` lives here (NEW file), shared across multiple feature surfaces (registry table, respondent detail, marketplace card, assessor queue). Convention: cross-feature components live at `apps/web/src/components/` (top-level shared); feature-specific components live at `apps/web/src/features/<feature>/components/`.
- **Web feature directory layout** verified 2026-04-30 — existing dirs are: `about`, `auth`, `dashboard`, `forms`, `home`, `insights`, `legal`, `marketplace`, `onboarding`, `participate`, `questionnaires`, `remuneration`, `staff`, `support`. **There is no `registry/` or `verification/` feature dir.** Registry-related surfaces live under `dashboard/`:
  - Registry list page: `apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx`
  - Registry table: `apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx`
  - Registry filters: `apps/web/src/features/dashboard/components/RegistryFilters.tsx`
  - Respondent detail: `apps/web/src/features/dashboard/pages/RespondentDetailPage.tsx`
  - Assessor queue: `apps/web/src/features/dashboard/pages/AssessorQueuePage.tsx`
  - Assessor analytics: `apps/web/src/features/dashboard/pages/AssessorAnalyticsPage.tsx`
  - Story v1's references to `features/registry/...` and `features/verification/...` were impostor-SM heuristic guesses; corrected throughout this retrofit.
- **Marketplace card** is `WorkerCard.tsx` (NOT `MarketplaceCard.tsx`). Verified file list at `apps/web/src/features/marketplace/components/`: `MarketplaceResultsGrid`, `MarketplaceSearchBar`, `MarketplaceFilters`, `MarketplaceProfileSkeleton`, `GovernmentVerifiedBadge`, **`WorkerCard`**.
- **Backend service-layer pattern**: each domain has a service file at `apps/api/src/services/<name>.service.ts` (e.g. `audit.service.ts`, `staff.service.ts`, `submission-processing.service.ts`, `magic-link.service.ts`, etc.). New `respondents.service.ts` follows this pattern (per Awwal Q3=(a) directive). Service layer hosts business logic; route file delegates to service methods.
- **Routes file naming**: existing convention is one flat file per resource at `apps/api/src/routes/<name>.routes.ts`. The respondents resource uses **singular** form: `respondent.routes.ts` (NOT `respondents.routes.ts` — story v1 had pluralisation drift). Service layer uses **plural** form for the class/file (`respondents.service.ts`) since it operates on the collection. Convention: routes files match the URL segment (`/respondent/...`), service files match the entity (plural for collections).
- **Composite index dependency**: AC#8 performance relies on `respondents(source, created_at)` composite index landed by Story 11-1 AC#11 (Akintola-risk Move 1). Index list at Story 11-1 AC#11: `respondents(source, created_at)`, `respondents(lga_id, source)`, `respondents(status, source)`, `respondents(status, created_at)`. All four exist post-11-1 merge.
- **Drizzle constraint:** schema files MUST NOT import from `@oslsr/types` (drizzle-kit runs compiled JS; `@oslsr/types` has no `dist/`). Per MEMORY.md key pattern. (Not directly relevant to this story since no new schema; cross-reference for the dev agent.)
- **TanStack Query convention** — feature-level api file at `apps/web/src/features/<feature>/api/<feature>.api.ts`. For respondents queries, existing api file at `apps/web/src/features/dashboard/api/respondent.api.ts` (verified to exist 2026-04-30 — singular naming matches routes file). New TanStack Query hooks (`useRespondentSourceCounts`) added there.
- **AC#7 endpoint placement decision (in-line vs separate)**: Task 7.4 leaves the choice between (a) `count-by-source` aggregate inline in the existing list response metadata vs (b) separate `GET /api/v1/respondents/source-counts` endpoint. Decision deferred to dev-time based on response-payload-size considerations. Default lean: separate endpoint (cleaner separation of concerns; chip counts re-fetch independently of list pagination).
- **NEW files created by this story:**
  - `apps/web/src/components/SourceBadge.tsx` (shared component)
  - `apps/web/src/features/dashboard/components/SourceFilterChips.tsx`
  - `apps/api/src/services/respondents.service.ts` (canonical service layer; first time creating this file)
  - Possibly `apps/web/src/features/dashboard/components/AssessorQueueRow.tsx` (if Task 5.2 extraction is non-trivial)

### References

- Architecture Decision 1.5 (extended source enum): [Source: _bmad-output/planning-artifacts/architecture.md Decision 1.5]
- Architecture ADR-018 (multi-source registry / pending-NIN status model): [Source: _bmad-output/planning-artifacts/architecture.md:3137]
- Epics — Story 11.4 entry: [Source: _bmad-output/planning-artifacts/epics.md Epic 11 §11.4]
- Story 11-1 (HARD dependency — extended source enum + composite index `(source, created_at)`): [Source: _bmad-output/implementation-artifacts/11-1-multi-source-registry-schema-foundation.md AC#3, AC#11]
- Story 11-2 (PREFERRED dependency — to have actual imported_* rows for testing): [Source: _bmad-output/implementation-artifacts/11-2-import-service-parsers.md]
- Existing Registry table component (modified per AC#2): [Source: apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx]
- Existing Registry table tests: [Source: apps/web/src/features/dashboard/components/__tests__/RespondentRegistryTable.test.tsx]
- Existing Respondent Registry page (modified per AC#6 chip integration): [Source: apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx]
- Existing Registry filters (peer of new SourceFilterChips): [Source: apps/web/src/features/dashboard/components/RegistryFilters.tsx]
- Existing Respondent Detail page (modified per AC#3): [Source: apps/web/src/features/dashboard/pages/RespondentDetailPage.tsx]
- Existing Worker Card (modified per AC#4): [Source: apps/web/src/features/marketplace/components/WorkerCard.tsx]
- Existing Assessor Queue page (modified per AC#5): [Source: apps/web/src/features/dashboard/pages/AssessorQueuePage.tsx]
- Existing respondent routes (modified per AC#7): [Source: apps/web/src/features/dashboard/api/respondent.api.ts]
- Existing API routes file (extended per AC#7): [Source: apps/api/src/routes/respondent.routes.ts]
- Existing service-layer pattern (precedent for new respondents.service.ts): [Source: apps/api/src/services/audit.service.ts, staff.service.ts, submission-processing.service.ts]
- Story 11-1 seeder for AC#8 performance verification: [Source: apps/api/src/db/seed-projected-scale.ts (created by Story 11-1 Task 2.5)]
- Story 11-1 composite index for AC#8: [Source: _bmad-output/implementation-artifacts/11-1-multi-source-registry-schema-foundation.md AC#11]
- MEMORY.md key pattern: integration tests use beforeAll/afterAll: [Source: MEMORY.md "Key Patterns"]
- MEMORY.md key pattern: code review before commit: [Source: MEMORY.md "Process Patterns" + `feedback_review_before_commit.md`]

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation. Implementer must include:)_

- AssessorQueuePage row-component extraction decision (kept inline OR extracted to `AssessorQueueRow.tsx`)
- AC#7 endpoint placement decision (inline metadata vs separate `/source-counts` endpoint)
- AC#8 EXPLAIN ANALYZE summary (single-source filter p95, two-filter p95, observed plan: index scan vs seq scan)
- Sequential migration number claimed if any new index added beyond Story 11-1's set
- Code review findings + fixes (cross-reference Review Follow-ups (AI) below)

### File List

**Created:**
- `apps/web/src/components/SourceBadge.tsx` (shared)
- `apps/web/src/components/SourceBadge.stories.tsx` (Storybook — verify Storybook in stack at impl time)
- `apps/web/src/features/dashboard/components/SourceFilterChips.tsx`
- `apps/api/src/services/respondents.service.ts` (NEW canonical service layer; per Awwal Q3=(a) directive)
- Possibly `apps/web/src/features/dashboard/components/AssessorQueueRow.tsx` (if Task 5.2 extraction is non-trivial)
- Tests for new components

**Modified:**
- `apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx` — add Source column + integrate filter
- `apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx` — wire SourceFilterChips above table
- `apps/web/src/features/dashboard/pages/RespondentDetailPage.tsx` — add SourceBadge + provenance metadata
- `apps/web/src/features/marketplace/components/WorkerCard.tsx` — corner SourceBadge (NOT `MarketplaceCard.tsx` — that file does not exist)
- `apps/web/src/features/dashboard/pages/AssessorQueuePage.tsx` — inline SourceBadge per row
- `apps/web/src/features/dashboard/api/respondent.api.ts` — add `useRespondentSourceCounts` TanStack Query hook
- `apps/api/src/routes/respondent.routes.ts` — extend list filter + add source-counts endpoint (singular `respondent.routes.ts`, NOT plural)
- Existing tests for affected components
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

**Out of scope (explicitly NOT modified — happens in downstream / future stories):**
- `imported_cross_referenced` status enum extension — future Story 11-5 follow-up
- Materialised view for chip counts — future optimisation if post-field metrics demand
- Cross-feature component library refactor (no shared components dir convention exists yet beyond `apps/web/src/components/`) — out of scope

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story drafted by impostor-SM agent per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 9 ACs covering shared SourceBadge component (3 variants) + wiring into 4 read-side surfaces + filter chips on Registry + backend filter endpoint + performance verification + tests. Depends on Story 11-1 schema. | Makes the Multi-Source Registry honest from a read-side perspective. Without it, source provenance is hidden in the DB and consumers can't apply trust-tier thinking. Tier B per FRC — post-field. |
| 2026-04-30 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level "Dependencies", "Field Readiness Certificate Impact", "Technical Notes" (preserving all 6 subsections — Why corner variant only for marketplace / Why sub-badge only for imported_unverified / Why URL-routed filter state / Filter chip count semantics / Out of scope `imported_cross_referenced` / Visual hierarchy badge vs row content), "Risks" under Dev Notes; converted task-as-headings (`### Task N — Title` + `1.1.` numbered subitems) to canonical `[ ] Task N (AC: #X)` checkbox format with `[ ] N.M` subtasks; added `### Project Structure Notes` subsection covering web feature dir inventory + shared components convention + service-layer pattern + routes file naming (singular vs plural) + composite-index dependency reference + endpoint placement decision; added `### References` subsection with 19 verified `[Source: file:line]` cites; moved top-level `## Change Log` under `## Dev Agent Record` as `### Change Log`; added `### Review Follow-ups (AI)` placeholder; added Task 9 (code review) per `feedback_review_before_commit.md`. **Seven factual path corrections applied throughout (heaviest path drift in any retrofit yet):** (1) `apps/web/src/features/registry/components/RegistryTable.tsx` → `apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx`; (2) `apps/web/src/features/registry/pages/RegistryListPage.tsx` → `apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx`; (3) `apps/web/src/features/registry/pages/RespondentDetailPage.tsx` → `apps/web/src/features/dashboard/pages/RespondentDetailPage.tsx`; (4) `apps/web/src/features/marketplace/components/MarketplaceCard.tsx` → `apps/web/src/features/marketplace/components/WorkerCard.tsx`; (5) `apps/web/src/features/verification/components/AssessorQueueRow.tsx` → `apps/web/src/features/dashboard/pages/AssessorQueuePage.tsx` (no separate row component yet — extraction decision deferred to dev-time per Task 5.2); (6) `apps/api/src/services/respondents.service.ts` confirmed as new file (per Awwal Q3=(a) directive — canonical service layer, mirrors `audit.service.ts`/`staff.service.ts`/`submission-processing.service.ts` pattern); (7) `apps/api/src/routes/respondents.routes.ts` (plural, fictional) → `apps/api/src/routes/respondent.routes.ts` (singular, actual). Reason for drift: impostor-SM agent used a heuristic file-path generator that assumed each "domain noun" gets its own feature directory; reality is registry/verification surfaces consolidate under `dashboard/`. All 9 ACs preserved verbatim. Status `ready-for-dev` preserved. | Story v1 was authored by impostor-SM agent without canonical workflow load — same drift pattern as Stories 9-13 / prep-tsc / prep-build-off-vps / 11-1 / prep-input-sanitisation-layer / 10-5 / 9-11 / 11-2. This story had THE HEAVIEST factual path drift of any retrofit (7 corrections) because its surface area touches 5 different existing pages/components — each one of which had a fictional path in v1. |

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution per Task 9.)_
