# Story 11.4: Source Badges + Filter Chips

Status: ready-for-dev

<!--
Created 2026-04-25 by Bob (SM) per SCP-2026-04-22 §A.5.

Wires Sally's SourceBadge component into 4 read-side surfaces (Registry / Respondent Detail / Marketplace cards / Assessor Queue) + adds source filter chip on Registry page.

Sources:
  • PRD V8.3 FR25 (multi-source provenance surfacing)
  • Architecture Decision 1.5 (extended source enum) + ADR-018
  • UX Custom Component #13 SourceBadge (3 variants: inline / detail / corner) + Filter Chips pattern + Journey 5 Step downstream
  • Epics.md §Story 11.4

Depends on Story 11-1 (extended source enum live in DB).
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

2. **AC#2 — Wired into Registry Table:** `apps/web/src/features/registry/components/RegistryTable.tsx` (or equivalent existing path) — add new column "Source" rendering `SourceBadge variant="inline"` per row, using `respondent.source` value. Column sortable by source.

3. **AC#3 — Wired into Respondent Detail:** `apps/web/src/features/registry/pages/RespondentDetailPage.tsx` (or equivalent) — render `SourceBadge variant="detail"` in header beside the respondent's name. Display `external_reference_id` (if non-null) in metadata section ("Imported as: ITF-SUPA admission no. ADM12345"). Display `import_batch_id` linking to Story 11-3 batch detail page (if super-admin role).

4. **AC#4 — Wired into Marketplace cards:** `apps/web/src/features/marketplace/components/MarketplaceCard.tsx` (or equivalent) — render `SourceBadge variant="corner"` only when respondent has marketplace consent AND when source is non-`enumerator` (the most trustworthy source needs no badge — minimum visual noise). Imports get the badge prominently because marketplace searchers should know they're not looking at field-verified data.

5. **AC#5 — Wired into Assessor Queue:** `apps/web/src/features/verification/components/AssessorQueueRow.tsx` (or equivalent) — render `SourceBadge variant="inline"` per row. Imported records may need different verification workflow (cross-reference vs first-time-verify) — the badge is the assessor's primary cue.

6. **AC#6 — Source filter chip on Registry page (per Sally's Filter Chips pattern):**
   - Multi-select chip group above the Registry table
   - One chip per source enum value (5 chips total: enumerator / clerk / public / imported_itf_supa / imported_other)
   - Each chip uses the same colour palette as the corresponding `SourceBadge` (visual consistency)
   - Click chip toggles inclusion in filter
   - Chips show count of matching records ("Field-Verified (1,247)")
   - URL-routed filter state (`?source=enumerator,clerk` etc.) — shareable filter URLs
   - "Clear filters" link when any chip selected
   - Default state: all chips selected (= no filter applied)

7. **AC#7 — Backend: list-with-source-filter endpoint:**
   - `GET /api/v1/respondents?source=...&...` — extend existing respondents-list endpoint to accept `source` query param (comma-separated multi-value) and additional filter dimensions per existing pattern
   - Add WHERE clause `respondents.source = ANY($sources)` when filter provided
   - Add count-by-source aggregate to response metadata for AC#6 chip counts (or separate `GET /api/v1/respondents/source-counts` endpoint to avoid bloating list response)
   - Auth: existing role-based access (super-admin, supervisor, assessor)

8. **AC#8 — Performance:** Source filter queries use Story 11-1's composite index `respondents(source, created_at)` (verified via EXPLAIN ANALYZE on seeded 500K-respondent dataset). p95 < 500ms with single source filter; < 800ms with two combined filters (source + LGA). If thresholds exceed, this story adds the additional index in its migration.

9. **AC#9 — Tests:**
   - Component tests: `SourceBadge` (each variant + each source value + accessibility + hover tooltip + sub-badge for imported_unverified)
   - Integration tests: Registry table renders correct badge per row; filter chips toggle correctly; URL state syncs
   - E2E test: super-admin filters Registry by `imported_itf_supa` → sees only those records; clears filter → sees all
   - Backend: list endpoint with source filter returns expected rows; count-by-source matches actual counts
   - Existing 4,191-test baseline maintained or grown

## Dependencies

- **Story 11-1 (HARD)** — extended source enum (`imported_itf_supa`, `imported_other`) live in DB; composite index `(source, created_at)` for AC#8 performance
- **Story 11-2 (PREFERRED, not strict)** — to have actual `imported_*` rows in DB for testing AC#2-AC#5; can be tested against manually-inserted fixture rows if 11-2 not yet ready
- **Sally's Custom Component #13 SourceBadge + Filter Chips pattern** — UI specs

## Field Readiness Certificate Impact

**Tier B** — does NOT block field-survey start. Can ship during the first weeks of field operation. Post-field, this story is what makes the Multi-Source Registry trustworthy from a read-side perspective (without it, source provenance is hidden in the DB and the registry looks deceptively uniform).

## Tasks / Subtasks

### Task 1 — `SourceBadge` shared component (AC#1)

1.1. Create `apps/web/src/components/SourceBadge.tsx` per Sally's spec
1.2. Tailwind classes per source value (use design-system colour tokens, not raw hex)
1.3. Sub-badge for `imported_unverified` status
1.4. Accessibility: aria-label, role, tooltip
1.5. Storybook stories per variant + per source
1.6. Unit tests

### Task 2 — Wire into Registry Table (AC#2)

2.1. Find existing RegistryTable component (likely `apps/web/src/features/registry/components/...`)
2.2. Add Source column with `SourceBadge variant="inline"`
2.3. Make column sortable
2.4. Update existing tests

### Task 3 — Wire into Respondent Detail (AC#3)

3.1. Find existing detail page
3.2. Add `SourceBadge variant="detail"` in header
3.3. Add external_reference_id + import_batch_id metadata section (super-admin gated for batch link)
3.4. Update existing tests

### Task 4 — Wire into Marketplace cards (AC#4)

4.1. Find existing marketplace card component
4.2. Add `SourceBadge variant="corner"` conditionally (consent + non-enumerator source)
4.3. Update existing tests

### Task 5 — Wire into Assessor Queue (AC#5)

5.1. Find existing assessor queue row component
5.2. Add `SourceBadge variant="inline"`
5.3. Update existing tests

### Task 6 — Source filter chips on Registry (AC#6)

6.1. New component `apps/web/src/features/registry/components/SourceFilterChips.tsx`
6.2. Multi-select chip group with same colour palette as SourceBadge
6.3. URL-routed via TanStack Router search params
6.4. Count display per chip from new backend endpoint
6.5. Wire into Registry page above table

### Task 7 — Backend: source filter endpoint (AC#7, AC#8)

7.1. Extend `GET /api/v1/respondents` to accept `source` query param
7.2. Add `respondents.source = ANY($sources)` WHERE clause
7.3. New endpoint `GET /api/v1/respondents/source-counts` returning per-source counts (with same role-based filter applied for honest counts per role)
7.4. Verify AC#8 performance via EXPLAIN ANALYZE on Story 11-1 seeded dataset

### Task 8 — Tests (AC#9) + sprint-status

8.1. Add tests per AC#9
8.2. Update sprint-status.yaml

## Technical Notes

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

## Risks

1. **Existing component paths may differ from assumed paths.** RegistryTable, MarketplaceCard, AssessorQueueRow components may have different file locations than guessed in the Tasks section. Mitigation: dev does a quick grep before starting Task 2-5; updates Tasks if paths differ.
2. **Filter performance at 500K respondents may exceed thresholds.** Mitigation: AC#8 specifies EXPLAIN ANALYZE verification + adds index if needed.
3. **Marketplace card corner badge may overlap existing UI elements.** Mitigation: visual QA pass on each affected card variant; adjust corner positioning per breakpoint.
4. **Sub-badge for `imported_unverified` adds visual complexity.** Some users may find the dual-badge layout confusing. Mitigation: tooltip on sub-badge explains the semantics; usability test during implementation.
5. **URL filter state may grow unwieldy with many filters.** Mitigation: chip count limited to 5 (one per source enum value); other filters use existing patterns.

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation.)_

### File List

**Created:**
- `apps/web/src/components/SourceBadge.tsx` (shared)
- `apps/web/src/components/SourceBadge.stories.tsx` (Storybook)
- `apps/web/src/features/registry/components/SourceFilterChips.tsx`
- Tests for new components

**Modified:**
- `apps/web/src/features/registry/components/RegistryTable.tsx` — add Source column + integrate filter
- `apps/web/src/features/registry/pages/RegistryListPage.tsx` — wire filter chips above table
- `apps/web/src/features/registry/pages/RespondentDetailPage.tsx` — add SourceBadge + provenance metadata
- `apps/web/src/features/marketplace/components/MarketplaceCard.tsx` — corner SourceBadge
- `apps/web/src/features/verification/components/AssessorQueueRow.tsx` — inline SourceBadge
- `apps/api/src/routes/respondents.routes.ts` — extend list filter + add source-counts endpoint
- `apps/api/src/services/respondents.service.ts` — source filter query + count aggregate
- Existing tests for affected components
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story created by Bob (SM) per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 9 ACs covering shared SourceBadge component (3 variants) + wiring into 4 read-side surfaces + filter chips on Registry + backend filter endpoint + performance verification + tests. Depends on Story 11-1 schema. | Makes the Multi-Source Registry honest from a read-side perspective. Without it, source provenance is hidden in the DB and consumers can't apply trust-tier thinking. Tier B per FRC — post-field. |
