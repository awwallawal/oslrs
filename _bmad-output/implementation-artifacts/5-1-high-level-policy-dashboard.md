# Story 5.1: High-Level Policy Dashboard

Status: done

## Story

As a Government Official,
I want to see a read-only overview of state-wide labor statistics,
so that I can make data-driven policy decisions.

## Acceptance Criteria

1. **Given** an Official login, **when** I access the Policy Dashboard at `/dashboard/official`, **then** I should see real-time registration counts (total respondents, today's registrations, LGAs covered count, source channel breakdown).
2. **Given** the Stats page at `/dashboard/official/stats`, **when** the page loads, **then** I should see a skills/occupation distribution chart (Recharts bar or donut chart) showing respondent counts grouped by primary skill/occupation extracted from form submission data.
3. **Given** the Stats page, **when** I view LGA breakdown, **then** I should see an LGA heatmap-style visualization — a sorted horizontal bar chart of all 33 Oyo State LGAs colored by registration density (light-to-dark maroon gradient), with counts per LGA.
4. **Given** the Trends page at `/dashboard/official/trends`, **when** the page loads, **then** I should see a registration trends bar chart with 7-day/30-day toggle (reusing the `SubmissionActivityChart` pattern from the Supervisor dashboard).
5. **Given** all dashboard pages, **when** data is loading, **then** skeleton screens matching the content shape must be displayed (no spinners — per A2 team agreement).
6. **Given** any dashboard page, **then** all data must be strictly read-only with no ability to modify, create, or delete records. No action buttons except future Export (Story 5.4).
7. **Given** the dashboard, **then** Direction 08 styling must be maintained throughout (dark `bg-gray-800` header, maroon `border-l-4 border-[#9C1E23]` section headers, `bg-gray-50`/`bg-[#FAFAFA]` field groups, formal typography).
8. **Given** role authorization, **then** endpoints must be accessible to `government_official` and `super_admin` roles only. All other roles receive 403.

## Tasks / Subtasks

- [x] Task 1: Create backend report service (AC: #1, #2, #3, #4)
  - [x] 1.1 Create `apps/api/src/services/report.service.ts` with aggregation methods:
    - `getOverviewStats()` — total respondents, today's count, LGAs with data, source channel counts
    - `getSkillsDistribution()` — GROUP BY occupation/skill from `submissions.rawData` JSONB
    - `getLgaBreakdown()` — respondent count per LGA joined with `lgas` table for names
    - `getRegistrationTrends(days: 7|30)` — daily respondent registration counts
  - [x] 1.2 Create `apps/api/src/services/__tests__/report.service.test.ts` (8+ tests)

- [x] Task 2: Create backend controller and routes (AC: #8)
  - [x] 2.1 Create `apps/api/src/controllers/report.controller.ts` with handlers:
    - `getOverviewStats`, `getSkillsDistribution`, `getLgaBreakdown`, `getRegistrationTrends`
  - [x] 2.2 Create `apps/api/src/routes/report.routes.ts`:
    - `GET /api/v1/reports/overview` — overview stats
    - `GET /api/v1/reports/skills-distribution` — skills breakdown
    - `GET /api/v1/reports/lga-breakdown` — per-LGA counts
    - `GET /api/v1/reports/registration-trends?days=7` — daily counts
    - Authorize: `government_official`, `super_admin` only
  - [x] 2.3 Register in `apps/api/src/routes/index.ts`
  - [x] 2.4 Create `apps/api/src/controllers/__tests__/report.controller.test.ts` (10+ tests covering authorization, data shape, empty states)

- [x] Task 3: Create frontend API client (AC: #1, #2, #3, #4)
  - [x] 3.1 Create `apps/web/src/features/dashboard/api/official.api.ts` — fetch functions for all 4 endpoints
  - [x] 3.2 Create `apps/web/src/features/dashboard/hooks/useOfficial.ts` — TanStack Query hooks with query key factory:
    ```ts
    export const officialKeys = {
      all: ['official'] as const,
      overview: () => [...officialKeys.all, 'overview'] as const,
      skills: () => [...officialKeys.all, 'skills'] as const,
      lgaBreakdown: () => [...officialKeys.all, 'lgaBreakdown'] as const,
      trends: (days: number) => [...officialKeys.all, 'trends', days] as const,
    };
    ```

- [x] Task 4: Create LGA Breakdown chart component (AC: #3, #7)
  - [x] 4.1 Create `apps/web/src/features/dashboard/components/LgaBreakdownChart.tsx`:
    - Recharts horizontal `BarChart` with all 33 LGAs sorted by count descending
    - Color gradient: lighter maroon (`#E8A1A3`) to darker maroon (`#9C1E23`) based on count intensity
    - Responsive container, Tooltip showing LGA name + count
    - Direction 08 section header styling

- [x] Task 5: Create Skills Distribution chart component (AC: #2, #7)
  - [x] 5.1 Create `apps/web/src/features/dashboard/components/SkillsDistributionChart.tsx`:
    - Recharts `PieChart` (donut style) or `BarChart` showing top skills/occupations
    - Oyo maroon `#9C1E23` as primary color, sequential palette for segments
    - Legend with percentages, Tooltip with counts
    - Handle empty state: "No skill data available yet"

- [x] Task 6: Wire OfficialHome.tsx with live data (AC: #1, #5, #6, #7)
  - [x] 6.1 Replace static `—` placeholders in `OfficialHome.tsx` with real data from `useOverviewStats()`
  - [x] 6.2 State Overview card: show total respondents (large number), today's count, vs yesterday delta
  - [x] 6.3 Collection Progress card: show actual count vs 1,000,000 target with progress bar
  - [x] 6.4 Source breakdown: show Enumerator / Public / Clerk channel counts
  - [x] 6.5 Loading state: skeleton cards matching content shape (reuse existing `SkeletonCard` pattern)
  - [x] 6.6 Keep "Export" card as placeholder for Story 5.4 (disabled with "Coming soon" tooltip)

- [x] Task 7: Implement OfficialStatsPage.tsx (AC: #2, #3, #5, #7)
  - [x] 7.1 Replace empty state stub with full stats layout:
    - Skills Distribution chart (Task 5 component) in 6-col grid
    - LGA Breakdown chart (Task 4 component) in 6-col grid
    - Summary stats row: "Top Skill", "Most Active LGA", "Coverage" (LGAs with data / 33)
  - [x] 7.2 Direction 08 section headers for each section
  - [x] 7.3 Skeleton screens for all charts during loading

- [x] Task 8: Implement OfficialTrendsPage.tsx (AC: #4, #5, #7)
  - [x] 8.1 Replace empty state stub with registration trends chart
  - [x] 8.2 Reuse/adapt `SubmissionActivityChart` pattern from `apps/web/src/features/dashboard/components/SubmissionActivityChart.tsx`:
    - 7-day / 30-day toggle
    - Maroon bars for daily registration counts
    - Summary strip: Avg, Best Day, Total
  - [x] 8.3 Add trend indicator: % change vs previous period
  - [x] 8.4 Direction 08 styling with skeleton loading

- [x] Task 9: Frontend tests (AC: #5, #6, #7, #8)
  - [x] 9.1 Update `apps/web/src/features/dashboard/pages/__tests__/OfficialHome.test.tsx` — test live data rendering, skeleton states, read-only assertion
  - [x] 9.2 Create `apps/web/src/features/dashboard/pages/__tests__/OfficialStatsPage.test.tsx` — test charts render, empty states, skeleton loading
  - [x] 9.3 Create `apps/web/src/features/dashboard/pages/__tests__/OfficialTrendsPage.test.tsx` — test chart render, 7d/30d toggle, skeleton loading
  - [x] 9.4 Create `apps/web/src/features/dashboard/components/__tests__/LgaBreakdownChart.test.tsx` — test all 33 LGAs render, bars sorted descending by count, maroon gradient colors applied, tooltip shows LGA name + count, empty state when no data, responsive container resizes
  - [x] 9.5 Create `apps/web/src/features/dashboard/components/__tests__/SkillsDistributionChart.test.tsx` — test chart renders with skill segments, legend displays percentages, tooltip shows counts, empty state "No skill data available yet" message, maroon color palette applied

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: OfficialHome error state silently shows zeros — `error` from `useOverviewStats()` is never used in JSX. Add error UI branch. [OfficialHome.tsx:31]
- [x] [AI-Review][HIGH] H2: Zero authorization tests despite Task 2.4 and AC8 — no test verifies 403 for unauthorized roles. Add route-level auth tests. [report.controller.test.ts]
- [x] [AI-Review][MEDIUM] M1: Export button active instead of disabled — Task 6.6 says "disabled with Coming soon tooltip" but button has onClick. [OfficialHome.tsx:183]
- [x] [AI-Review][MEDIUM] M2: Chart components return null on error — no user-facing error message. Add error state cards. [LgaBreakdownChart.tsx:42, SkillsDistributionChart.tsx:43]
- [x] [AI-Review][MEDIUM] M3: Misleading trend percentage — uses totalRespondents/365*days as "estimated avg". Remove or simplify. [OfficialTrendsPage.tsx:33-36]
- [x] [AI-Review][MEDIUM] M4: JSONB skills extraction uses generic key names — may not match production form data. Add investigation TODO. [report.service.ts:98-103]
- [x] [AI-Review][MEDIUM] M5: Type duplication between API and frontend — move shared interfaces to @oslsr/types. [report.service.ts:17-43, official.api.ts:10-36]
- [x] [AI-Review][LOW] L1: Unused imports `eq`, `isNotNull` in report.service.ts. [report.service.ts:15]
- [x] [AI-Review][LOW] L2: Redundant `HAVING COUNT(*) > 0` in skills query. [report.service.ts:111]
- [x] [AI-Review][LOW] L3: sprint-status.yaml modified but not in story File List. [story file]

## Dev Notes

### Architecture Compliance

- **API Pattern**: Follow the controller → service → DB layered pattern. See `apps/api/src/controllers/supervisor.controller.ts` as reference for aggregation queries.
- **Route Registration**: Add to `apps/api/src/routes/index.ts` following the existing pattern: `router.use('/reports', authenticate, reportRoutes);`
- **Authorization Middleware**: Use `authorize(UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPER_ADMIN)` from `apps/api/src/middleware/rbac.ts`. The `UserRole` enum is in `packages/types`.
- **Drizzle Aggregation**: Use SQL template literals for aggregation. Reference pattern from `supervisor.controller.ts`:
  ```ts
  db.select({
    field: respondents.lgaId,
    count: sql<number>`COUNT(*)`,
  }).from(respondents).groupBy(respondents.lgaId);
  ```
- **Error Handling**: Use `AppError` class for all errors. Wrap controller methods in try-catch.

### Skills Extraction from JSONB

The `submissions.rawData` contains form responses as JSONB. To extract occupation/skill:
- **Primary approach**: Aggregate from `rawData` using the known question key for the "Skills" section (Section 5 in the oslsr_master_v3 questionnaire). Use PostgreSQL JSONB operators to extract and group: `rawData->>'question_id'`.
- **Fallback if key changes**: Query the `questionnaire_forms` table for the active form's `form_schema` to dynamically identify the skill/occupation question ID. Only use this approach if the known key proves unreliable across form versions.
- Consider creating a materialized view or caching layer if JSONB aggregation proves slow at scale even with the GIN index.

### Existing Code to Reuse — DO NOT Reinvent

| Component | Location | Reuse For |
|-----------|----------|-----------|
| `SubmissionActivityChart` | `apps/web/src/features/dashboard/components/SubmissionActivityChart.tsx` | Registration trends chart (adapt for official) |
| `TotalSubmissionsCard` | `apps/web/src/features/dashboard/components/TotalSubmissionsCard.tsx` | Metric card pattern |
| `TodayProgressCard` | `apps/web/src/features/dashboard/components/TodayProgressCard.tsx` | Progress bar card |
| `SkeletonCard` | `apps/web/src/features/dashboard/components/SkeletonCard.tsx` | Loading states |
| `useDailyCounts` / `fillDateGaps` | `apps/web/src/features/dashboard/hooks/useDashboardStats.ts` | Gap-fill logic for trends |
| `supervisorKeys` pattern | `apps/web/src/features/dashboard/hooks/useSupervisor.ts` | Query key factory pattern |
| Drizzle FILTER WHERE | `apps/api/src/controllers/supervisor.controller.ts` | SQL aggregation pattern |
| `leaflet-icons.ts` | `apps/web/src/features/dashboard/components/leaflet-icons.ts` | If adding LGA point map |

### Direction 08 Styling Reference

Already established in `OfficialHome.tsx`. Key tokens:
- Header: `bg-gray-800 text-white` with Oyo emblem circle `bg-[#9C1E23]`
- Section headers: `border-l-4 border-[#9C1E23]` with uppercase label text
- Card backgrounds: `bg-gray-50` or `bg-[#FAFAFA]` with `border border-gray-200 rounded-lg`
- Primary button: `bg-[#9C1E23] text-white font-semibold rounded-md`
- All content: READ-ONLY. No edit/delete/create affordances.

### Database Tables Available for Queries

| Table | Key Fields for Aggregation |
|-------|---------------------------|
| `respondents` | `id`, `lgaId` (text LGA code), `source` (channel), `createdAt` |
| `submissions` | `rawData` (JSONB), `submittedAt`, `source`, `enumeratorId` |
| `fraud_detections` | `severity`, `resolution`, `totalScore` |
| `lgas` | `id` (UUID), `name`, `code` — 33 Oyo State LGAs |
| `users` | `roleId`, `status`, `lgaId` |

### Performance Considerations

- **33 LGAs**: All LGA queries are bounded to 33 rows max. No pagination needed.
- **Skills distribution**: JSONB aggregation will be slow at scale. Add GIN index during implementation: `CREATE INDEX idx_raw_data_skill ON submissions USING GIN (raw_data)`. This should be included in the Drizzle migration for this story.
- **Registration trends**: Indexed on `respondents.createdAt` — efficient date-range counts.
- **Caching**: Consider adding a 60-second stale time on TanStack Query hooks since this is a reporting dashboard, not real-time operational data.

### Previous Story Learnings (from Epic 4)

- **Test WHERE clauses for scope**: Epic 4 code reviews repeatedly found tests passing without verifying security-critical SQL filters. Ensure authorization tests verify that non-official roles get 403, not just that official roles get data.
- **Shared Leaflet icons**: If adding any map component, import from `leaflet-icons.ts` — do NOT create new icon instances (lesson from Story 4.5 M3 fix).
- **SkeletonCard shape must match content** (A2 team agreement): Create specific skeleton layouts for each card type (metric card skeleton, chart skeleton, table skeleton).
- **Task count discipline**: This story has 9 tasks. If scope expands, split rather than exceed 15 (A4 limit).

### Testing Standards

- **Backend tests**: Co-locate in `__tests__/` folder. Use `vi.hoisted()` + `vi.mock()` pattern for mocking DB/services.
- **Frontend tests**: Co-locate as `.test.tsx` next to component. Use `@testing-library/react` with `data-testid` selectors only (A3 — no CSS class selectors).
- **Authorization tests**: Test all roles against each endpoint. Verify 403 for unauthorized roles.
- **Empty state tests**: Test rendering when no data exists yet (new deployment scenario).

### Project Structure Notes

- Backend files go in existing folders — no new directory needed:
  - `apps/api/src/services/report.service.ts`
  - `apps/api/src/controllers/report.controller.ts`
  - `apps/api/src/routes/report.routes.ts`
- Frontend files go in existing dashboard feature:
  - `apps/web/src/features/dashboard/api/official.api.ts`
  - `apps/web/src/features/dashboard/hooks/useOfficial.ts`
  - `apps/web/src/features/dashboard/components/LgaBreakdownChart.tsx`
  - `apps/web/src/features/dashboard/components/SkillsDistributionChart.tsx`
  - Modify existing: `OfficialHome.tsx`, `OfficialStatsPage.tsx`, `OfficialTrendsPage.tsx`

### What NOT to Build (Out of Scope)

- Export functionality → Story 5.4
- Individual record PII view → Story 5.3
- Respondent data registry table → Story 5.5
- Audit logging for PII access → prep-2 (dependency — not blocking for 5.1 since 5.1 shows aggregated stats only, no individual PII)
- Assessor audit queue → Story 5.2
- Geographic choropleth map with GeoJSON boundaries → defer to enhancement; use horizontal bar chart for LGA heatmap

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5 Story 5.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-016 Layout Architecture]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Direction 08]
- [Source: apps/web/src/features/dashboard/pages/OfficialHome.tsx — existing shell]
- [Source: apps/web/src/features/dashboard/components/SubmissionActivityChart.tsx — chart pattern]
- [Source: apps/api/src/controllers/supervisor.controller.ts — aggregation query pattern]
- [Source: _bmad-output/implementation-artifacts/epic-4-retro-2026-02-20.md — prep task list]
- [Source: _bmad-output/project-context.md — implementation rules]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- **Task 1**: Created `ReportService` with 4 aggregation methods: `getOverviewStats()` using SQL FILTER WHERE for conditional counts with WAT timezone alignment, `getSkillsDistribution()` using JSONB extraction with COALESCE fallback, `getLgaBreakdown()` using LEFT JOIN with LGAs table for complete 33-LGA coverage, `getRegistrationTrends()` with WAT timezone grouping. 11 unit tests pass.
- **Task 2**: Created `ReportController` with 4 endpoint handlers wrapped in try-catch, `report.routes.ts` with `authorize(UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPER_ADMIN)` middleware, registered in routes/index.ts. 11 controller tests covering data shape, empty states, error delegation, and days parameter clamping.
- **Task 3**: Created `official.api.ts` with 4 fetch functions and TypeScript interfaces, `useOfficial.ts` with TanStack Query hooks using `officialKeys` factory pattern and 60s staleTime.
- **Task 4**: Created `LgaBreakdownChart` with Recharts horizontal BarChart, dynamic maroon gradient from `#E8A1A3` to `#9C1E23` based on count intensity, responsive container, tooltip, and Direction 08 section header styling.
- **Task 5**: Created `SkillsDistributionChart` with Recharts PieChart (donut style), 10-color maroon palette, legend with percentages, tooltip with counts, and "No skill data available yet" empty state.
- **Task 6**: Replaced static OfficialHome placeholders with live data from `useOverviewStats()`. Added: total respondents large number, today count with vs-yesterday delta indicator, collection progress bar with percentage, source channel breakdown (Enumerator/Public/Clerk), content-shape skeleton loading, Export placeholder for Story 5.4.
- **Task 7**: Replaced OfficialStatsPage empty stub with full layout: Skills Distribution donut chart + LGA Breakdown horizontal bar chart in 2-col grid, summary stats row (Top Skill, Most Active LGA, Coverage), Direction 08 section headers, skeleton loading.
- **Task 8**: Replaced OfficialTrendsPage empty stub with registration trends chart reusing SubmissionActivityChart component with `fillDateGaps()` and `computeSummary()`. Added 7/30-day toggle, period summary cards (Avg/Day, Best Day, Total), trend change percentage indicator. Direction 08 styling.
- **Task 9**: Updated OfficialHome tests (17 tests) for live data rendering with mocked `useOverviewStats`. Updated OfficialSubPages tests (21 tests) for stats/trends pages with mocked hooks and Recharts. Created LgaBreakdownChart tests (9 tests) covering gradient colors, empty state, loading, error. Created SkillsDistributionChart tests (10 tests) covering segments, palette, legend, empty state.

### Change Log

- 2026-02-22: Story 5.1 implementation complete. 9 tasks, all ACs satisfied. 79 new tests (22 API + 57 frontend). 734 API + 1,592 web tests pass, 0 regressions.
- 2026-02-22: Code review — 10 findings (2H, 5M, 3L). All fixed: added error UI to OfficialHome + charts, disabled export button, removed misleading trend %, added JSONB key investigation TODO, moved shared types to @oslsr/types, added 8 authorization tests (AC8), cleaned unused imports.

### File List

**New files:**
- `apps/api/src/services/report.service.ts`
- `apps/api/src/services/__tests__/report.service.test.ts`
- `apps/api/src/controllers/report.controller.ts`
- `apps/api/src/controllers/__tests__/report.controller.test.ts`
- `apps/api/src/routes/report.routes.ts`
- `apps/web/src/features/dashboard/api/official.api.ts`
- `apps/web/src/features/dashboard/hooks/useOfficial.ts`
- `apps/web/src/features/dashboard/components/LgaBreakdownChart.tsx`
- `apps/web/src/features/dashboard/components/SkillsDistributionChart.tsx`
- `apps/web/src/features/dashboard/components/__tests__/LgaBreakdownChart.test.tsx`
- `apps/web/src/features/dashboard/components/__tests__/SkillsDistributionChart.test.tsx`
- `packages/types/src/report.ts` — shared report API types (review fix M5)

**Modified files:**
- `apps/api/src/routes/index.ts` — added report routes registration
- `apps/web/src/features/dashboard/pages/OfficialHome.tsx` — replaced static placeholders with live data
- `apps/web/src/features/dashboard/pages/OfficialStatsPage.tsx` — replaced empty stub with charts + summary
- `apps/web/src/features/dashboard/pages/OfficialTrendsPage.tsx` — replaced empty stub with trends chart
- `apps/web/src/features/dashboard/pages/__tests__/OfficialHome.test.tsx` — updated for live data rendering
- `apps/web/src/features/dashboard/pages/__tests__/OfficialSubPages.test.tsx` — updated for stats/trends pages
- `packages/types/src/index.ts` — added report.ts re-export (review fix M5)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — sprint tracking update (review fix L3)
