# Story 8.3: Field Team Analytics (Supervisor, Enumerator, Clerk)

Status: done

## Story

As a Supervisor,
I want to see team-level analytics for my assigned LGA,
So that I can identify performance patterns, coverage gaps, and coach my enumerators effectively.

As an Enumerator or Clerk,
I want to see my personal submission statistics,
So that I can track my own productivity and data quality.

## Acceptance Criteria

1. **Given** a Supervisor navigating to "Team Analytics" in the sidebar **When** the page loads **Then** it displays LGA-scoped analytics:
   - Team submission volume (daily/weekly trend chart)
   - Per-enumerator comparison (bar chart: submissions per enumerator)
   - Coverage heatmap (submissions by ward/area within their LGA)
   - Data quality indicators (completion rates, fraud flag rates per enumerator)
   - Demographic summary for their LGA vs state-wide comparison

2. **Given** an Enumerator navigating to "My Stats" in the sidebar **When** the page loads **Then** it displays personal analytics:
   - Daily/weekly submission count trend
   - Average completion time per survey
   - Personal fraud flag rate with comparison to team average
   - Skills collected frequency (what skills they've recorded most)

3. **Given** a Clerk navigating to "My Stats" in the sidebar **When** the page loads **Then** it displays the same personal analytics as Enumerator **And** includes data entry speed metrics (avg time per submission).

4. **Given** the team quality endpoint **When** called by a Supervisor **Then** it returns per-enumerator metrics: submission count, avg completion time, GPS capture rate, NIN capture rate, skip rate, fraud flag rate — all scoped to their team.

5. **Given** the my-stats endpoint **When** called by an Enumerator or Clerk **Then** it returns personal metrics: daily trend, cumulative count, avg completion time (+ team avg comparison), GPS rate, NIN rate, skip rate, fraud rate, respondent diversity, composite quality score (0-100).

6. **Given** any per-enumerator metric in supervisor view **When** the sample size is fewer than 5 **Then** the metric is suppressed.

## Tasks / Subtasks

### Backend (New Endpoints)

- [x] Task 1: Create team quality types in `packages/types/src/analytics.ts` (AC: #4, #5)
  - [x] 1.1 Define `EnumeratorQualityMetric`
  - [x] 1.2 Define `TeamQualityData`
  - [x] 1.3 Define `PersonalStatsData`
  - [x] 1.4 Define `DataQualityScorecard`
  - [x] 1.5 Export from `packages/types/src/index.ts`

- [x] Task 2: Create `apps/api/src/services/team-quality.service.ts` (AC: #4, #6)
  - [x] 2.1–2.8 Full implementation with 6 parallel queries, suppression, team averages
  - [x] 2.9 11 unit tests passing

- [x] Task 3: Create `apps/api/src/services/personal-stats.service.ts` (AC: #5)
  - [x] 3.1–3.9 Full implementation with 8 parallel queries, composite scorecard, clerk adjustment
  - [x] 3.10 11 unit tests passing

- [x] Task 4: Create `apps/api/src/controllers/team-quality.controller.ts` (AC: #4)
  - [x] 4.1 Handler with Zod validation
  - [x] 4.2 6 controller tests passing

- [x] Task 5: Create `apps/api/src/controllers/personal-stats.controller.ts` (AC: #5)
  - [x] 5.1 Handler with userId from req.user.sub, isClerk detection
  - [x] 5.2 6 controller tests passing

- [x] Task 6: Create routes and register (AC: #4, #5)
  - [x] 6.1 GET /team-quality (super_admin, supervisor), GET /my-stats (enumerator, clerk)
  - [x] 6.2 Super Admin ?supervisorId= override
  - [x] 6.3 Routes registered in analytics.routes.ts

### Frontend

- [x] Task 7: Create API client + hooks for new endpoints (AC: #1, #2, #3)
  - [x] 7.1 fetchTeamQuality, fetchPersonalStats in analytics.api.ts
  - [x] 7.2 useTeamQuality, usePersonalStats hooks with 60s staleTime
  - [x] 7.3 4 hook tests passing

- [x] Task 8: Create supervisor chart components (AC: #1)
  - [x] 8.1–8.5 TeamQualityCharts, TeamCompletionTimeChart, FieldCoverageMap, DayOfWeekChart, HourOfDayChart
  - [x] 8.6 15 chart tests passing (3 per component)

- [x] Task 9: Create personal stats components (AC: #2, #3)
  - [x] 9.1–9.5 DataQualityScorecard, PersonalTrendChart, PersonalSkillsChart, CompletionTimeComparison, RespondentDiversityChart
  - [x] 9.6 15 chart tests passing (3 per component)

- [x] Task 10: Create Supervisor Team Analytics page (AC: #1)
  - [x] 10.1–10.7 SupervisorAnalyticsPage with 3 tabs, AnalyticsFilters, DemographicCharts/EmploymentCharts reuse
  - [x] 10.8 6 page tests passing

- [x] Task 11: Create Enumerator Stats page (AC: #2)
  - [x] 11.1–11.7 EnumeratorStatsPage with 3 tabs, summary cards, mobile-optimized
  - [x] 11.8 5 page tests passing (in FieldTeamStatsPages.test.tsx)

- [x] Task 12: Replace Clerk Stats placeholder (AC: #3)
  - [x] 12.1–12.4 Real ClerkStatsPage with 2 tabs, clerk-specific labels, no GPS
  - [x] 12.5 4 tests passing (ClerkStatsPage.test.tsx updated from placeholder)

- [x] Task 13: Update sidebar and routing (AC: #1, #2, #3)
  - [x] 13.1 Supervisor: Team Analytics sidebar item
  - [x] 13.2 Enumerator: My Stats sidebar item
  - [x] 13.3 Clerk: no change needed
  - [x] 13.4 Lazy imports + routes in App.tsx
  - [x] 13.5 3 sidebar tests + count assertions updated

- [x] Task 14: Update sprint status
  - [x] 14.1 sprint-status.yaml updated

## Dev Notes

### Backend: New Endpoints Added to analytics.routes.ts

Story 8-1 creates the analytics route file. Story 8-3 adds two more endpoints to it:

| Endpoint | Roles | Returns |
|----------|-------|---------|
| `GET /analytics/team-quality` | Super Admin, Supervisor | Per-enumerator metrics + team averages + temporal patterns |
| `GET /analytics/my-stats` | Enumerator, Clerk | Personal performance + quality scorecard |

Both accept `?dateFrom=&dateTo=` filters. Team-quality also accepts `?enumeratorId=` to filter to one enumerator.

For Super Admin calling `/team-quality`, accept optional `?supervisorId=` to view any supervisor's team. If omitted, Super Admin gets system-wide team metrics.

### Supervisor Scoping Pattern

Supervisor data scoping is already solved. Follow the existing pattern from `supervisor.controller.ts`:

```typescript
// Get enumerator IDs for this supervisor
const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(req.user.sub);
if (enumeratorIds.length === 0) return res.json({ data: emptyTeamQuality });

// Use enumeratorIds in queries
.where(inArray(submissions.enumeratorId, enumeratorIds))
```

[Source: `apps/api/src/controllers/supervisor.controller.ts` — getTeamMetrics pattern]
[Source: `apps/api/src/services/team-assignment.service.ts` — getEnumeratorIdsForSupervisor]

### Team Quality SQL Patterns

**Per-enumerator metrics (single query):**
```sql
SELECT
  s.enumerator_id,
  u.full_name AS name,
  COUNT(*) AS submission_count,
  AVG(s.completion_time_seconds) AS avg_completion_time,
  COUNT(*) FILTER (WHERE s.gps_latitude IS NOT NULL)::float / NULLIF(COUNT(*), 0) AS gps_rate,
  COUNT(*) FILTER (WHERE length(s.raw_data->>'nin') = 11)::float / NULLIF(COUNT(*), 0) AS nin_rate
FROM submissions s
JOIN users u ON s.enumerator_id = u.id
WHERE s.enumerator_id = ANY($1)  -- enumeratorIds array
  AND s.submitted_at >= $2       -- dateFrom
GROUP BY s.enumerator_id, u.full_name
```

**Fraud flag rate (separate query or LEFT JOIN):**
```sql
SELECT
  fd.enumerator_id,
  COUNT(*) FILTER (WHERE fd.severity IN ('critical', 'high', 'medium'))::float / NULLIF(COUNT(*), 0) AS fraud_rate
FROM fraud_detections fd
WHERE fd.enumerator_id = ANY($1)
GROUP BY fd.enumerator_id
```
**Denominator note:** `COUNT(*)` here counts rows in `fraud_detections` = total evaluated submissions (not total submissions). This correctly handles partial evaluation — if the fraud engine hasn't processed all submissions, the rate reflects only checked ones. Severity values: `'clean'`, `'low'`, `'medium'`, `'high'`, `'critical'` — only medium+ count as "flagged".

**Skip rate calculation from raw_data:**
Optional fields in questionnaire: `training_interest`, `skills_other`, `monthly_income`, `apprentice_count`, `bio_short`, `portfolio_url`, `consent_enriched`.
Skip rate = count of null optional fields / total optional fields across all submissions.

**Day-of-week pattern:**
```sql
SELECT
  EXTRACT(DOW FROM submitted_at AT TIME ZONE 'Africa/Lagos') AS day_of_week,
  COUNT(*) AS count
FROM submissions
WHERE enumerator_id = ANY($1)
GROUP BY day_of_week
ORDER BY day_of_week
```
Map 0=Sunday through 6=Saturday.

**Hour-of-day pattern:**
```sql
SELECT
  EXTRACT(HOUR FROM submitted_at AT TIME ZONE 'Africa/Lagos') AS hour,
  COUNT(*) AS count
FROM submissions
WHERE enumerator_id = ANY($1)
GROUP BY hour
ORDER BY hour
```

### Personal Stats: Composite Quality Score

Weighted formula (0-100 where 100 = perfect):

| Metric | Weight | Scoring |
|--------|--------|---------|
| GPS capture rate | 20% | rate * 100 (e.g., 0.95 → 95 points → 19 weighted) |
| NIN capture rate | 20% | rate * 100 |
| Completion time | 15% | 100 if within ±1 SD of team avg, scaled down for outliers |
| Skip rate | 15% | (1 - skipRate) * 100 (lower skip = better) |
| Fraud flag rate | 20% | (1 - fraudRate) * 100 (lower fraud = better) |
| Respondent diversity | 10% | Shannon diversity index normalized to 0-100 |

**Clerk adjustment:** Exclude GPS metric (clerks work indoors). Redistribute 20% weight proportionally:
- NIN: 25%, Completion: 20%, Skip: 20%, Fraud: 25%, Diversity: 10%

### Existing Components to Reuse

| Component | Location | Reuse How |
|-----------|----------|-----------|
| `TeamGpsMap` | `features/dashboard/components/TeamGpsMap.tsx` | Base for FieldCoverageMap — extend with density heatmap |
| `SubmissionActivityChart` | `features/dashboard/components/SubmissionActivityChart.tsx` | Reuse for PersonalTrendChart and team trend |
| `DemographicCharts` | `features/dashboard/components/charts/DemographicCharts.tsx` (Story 8-2) | Reuse for LGA Demographics tab |
| `EmploymentCharts` | `features/dashboard/components/charts/EmploymentCharts.tsx` (Story 8-2) | Reuse for LGA Demographics tab |
| `SkillsDistributionChart` | `features/dashboard/components/SkillsDistributionChart.tsx` | Reuse for PersonalSkillsChart |
| `ChartExportButton` | `features/dashboard/components/charts/ChartExportButton.tsx` (Story 8-2) | Reuse on all chart cards |
| `AnalyticsFilters` | `features/dashboard/components/AnalyticsFilters.tsx` (Story 8-2) | Reuse for supervisor date range filter |

### Existing Backend to Reuse

| Service | Location | Reuse How |
|---------|----------|-----------|
| `TeamAssignmentService` | `services/team-assignment.service.ts` | `getEnumeratorIdsForSupervisor()` for scope |
| `ProductivityService` | `services/productivity.service.ts` | `getWatBoundaries()` for time calculations |
| `FraudEngine` | `services/fraud-engine.service.ts` | Reference fraud scoring — fraudDetections table |
| `SurveyAnalyticsService` | `services/survey-analytics.service.ts` (Story 8-1) | Demographics for LGA comparison |

### Sidebar Changes

**Supervisor** — add after Productivity (index 2), before Registry (index 3):
```typescript
{ label: 'Team Analytics', href: '/dashboard/supervisor/analytics', icon: BarChart },
```

**Enumerator** — add after Sync Status (index 3), before Messages (index 4):
```typescript
{ label: 'My Stats', href: '/dashboard/enumerator/stats', icon: BarChart },
```

**Clerk** — no change needed. `My Stats` already at `/dashboard/clerk/stats` with BarChart icon.

### Page Layouts (from docs/survey-analytics-spec.md Section 6.1)

**Supervisor: Team Analytics** (`/dashboard/supervisor/analytics`):
```
[Dark Header: "Team Analytics"]
[Filters: [Enumerator dropdown] [Date Range]]

[Tab: Data Quality] [Tab: Field Coverage] [Tab: LGA Demographics]

Data Quality Tab:
  [Row 1: 4 stat cards — Team Submissions, Avg Completion Time, GPS Coverage, Fraud Rate]
  [Row 2: Per-enumerator comparison bars (ranked by submissions)]
  [Row 3: 2 charts — Day-of-Week Pattern | Hour-of-Day Pattern]

Field Coverage Tab:
  [Full-width Leaflet map with enumerator GPS points, colored per enumerator]
  [Row 2: 2 stat cards — GPS Coverage Rate, NIN Capture Rate]

LGA Demographics Tab:
  [Reuse DemographicCharts + EmploymentCharts from Story 8-2, auto-scoped to supervisor LGA]
```

**Enumerator: My Stats** (`/dashboard/enumerator/stats`):
```
[Dark Header: "My Stats"]
No global filters (always personal data)

[Tab: My Performance] [Tab: My Data Quality] [Tab: My Profile]

My Performance Tab:
  [Row 1: 3 stat cards — Total Submissions, Streak Counter, Avg Completion Time]
  [Row 2: PersonalTrendChart (daily + cumulative line)]
  [Row 3: PersonalSkillsChart (top 10 skills horizontal bar)]

My Data Quality Tab:
  [Row 1: DataQualityScorecard (large circular gauge: "87/100")]
  [Row 2: 6 metric cards (GPS, NIN, Completion, Skip, Fraud, Diversity)]
  [Row 3: Color-coded comparison: green=above avg, amber=near avg, red=below avg]

My Profile Tab:
  [Row 1: RespondentDiversityChart — gender split pie + age histogram]
  [Row 2: Advisory text — "78% male — consider reaching more women"]
```

**Clerk: My Stats** (`/dashboard/clerk/stats`) — Replace placeholder:
```
[Dark Header: "My Stats"]
No global filters

[Tab: My Performance] [Tab: My Data Quality]

My Performance Tab:
  [Row 1: 3 stat cards — Total Entries, Avg Entry Time, Today's Entries]
  [Row 2: PersonalTrendChart (daily entries)]

My Data Quality Tab:
  [Row 1: DataQualityScorecard (no GPS metric)]
  [Row 2: 5 metric cards (NIN, Completion, Skip, Fraud, Diversity)]
```

### Project Structure Notes

**New backend files:**
- `packages/types/src/analytics.ts` (extend — add team-quality + personal-stats types)
- `apps/api/src/services/team-quality.service.ts`
- `apps/api/src/services/personal-stats.service.ts`
- `apps/api/src/controllers/team-quality.controller.ts`
- `apps/api/src/controllers/personal-stats.controller.ts`

**New frontend files:**
- `apps/web/src/features/dashboard/components/charts/TeamQualityCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/TeamCompletionTimeChart.tsx`
- `apps/web/src/features/dashboard/components/charts/FieldCoverageMap.tsx`
- `apps/web/src/features/dashboard/components/charts/DayOfWeekChart.tsx`
- `apps/web/src/features/dashboard/components/charts/HourOfDayChart.tsx`
- `apps/web/src/features/dashboard/components/charts/DataQualityScorecard.tsx`
- `apps/web/src/features/dashboard/components/charts/PersonalTrendChart.tsx`
- `apps/web/src/features/dashboard/components/charts/PersonalSkillsChart.tsx`
- `apps/web/src/features/dashboard/components/charts/CompletionTimeComparison.tsx`
- `apps/web/src/features/dashboard/components/charts/RespondentDiversityChart.tsx`
- `apps/web/src/features/dashboard/pages/SupervisorAnalyticsPage.tsx`
- `apps/web/src/features/dashboard/pages/EnumeratorStatsPage.tsx`

**Modified files:**
- `packages/types/src/analytics.ts` (add new types)
- `packages/types/src/index.ts` (re-export new types)
- `apps/api/src/routes/analytics.routes.ts` (add team-quality + my-stats routes)
- `apps/web/src/features/dashboard/api/analytics.api.ts` (add fetch functions)
- `apps/web/src/features/dashboard/hooks/useAnalytics.ts` (add hooks)
- `apps/web/src/features/dashboard/pages/ClerkStatsPage.tsx` (replace placeholder)
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` (add supervisor + enumerator items)
- `apps/web/src/App.tsx` (add lazy imports + routes)

### Anti-Patterns to Avoid

1. **DO NOT create separate services per role** — team-quality serves both Super Admin and Supervisor, personal-stats serves both Enumerator and Clerk
2. **DO NOT duplicate the TeamGpsMap** — extend or compose with the existing component for FieldCoverageMap
3. **DO NOT hardcode enumerator IDs** — always resolve via `TeamAssignmentService.getEnumeratorIdsForSupervisor()`
4. **DO NOT show PII in supervisor analytics** — the `users.fullName` column is a single string. For per-enumerator charts, show full name (it's internal staff, not respondent PII). If privacy is needed, parse: `fullName.split(' ')[0]` for first name only
5. **DO NOT forget WAT timezone** — all daily/weekly/hourly aggregations use `AT TIME ZONE 'Africa/Lagos'`
6. **DO NOT include GPS metric in clerk quality score** — clerks work indoors, redistribute weight
7. **DO NOT call `getEnumeratorIdsForSupervisor` multiple times** — call once, pass array to all sub-queries
8. **DO NOT use `beforeEach`/`afterEach` for DB integration tests** — use `beforeAll`/`afterAll`
9. **DO NOT forget Number() conversion** — PostgreSQL aggregates return strings via Drizzle

### Leaflet Map Notes

`react-leaflet@4.2.1` is already installed. For the FieldCoverageMap:
- Reuse `leaflet-icons.ts` for custom markers
- Different marker color per enumerator (use `L.divIcon` with inline CSS)
- Existing `TeamGpsMap` fetches via `useTeamGps()` — already returns `GpsPoint[]` with lat/lng/enumeratorId
- For LGA boundary overlay: use GeoJSON polygon if available, else just plot points
- Center map on supervisor's LGA centroid

[Source: `apps/web/src/features/dashboard/components/TeamGpsMap.tsx`]
[Source: `apps/web/src/features/dashboard/components/GpsClusterMap.tsx`]
[Source: `apps/web/src/features/dashboard/components/leaflet-icons.ts`]

### Dependencies on Previous Stories

- **Story 8-1**: `analytics.routes.ts` exists to add routes to, types in `analytics.ts` to extend
- **Story 8-2**: Chart components (DemographicCharts, EmploymentCharts, ChartExportButton, AnalyticsFilters) reused in supervisor LGA Demographics tab
- **Existing**: TeamAssignmentService, ProductivityService, FraudDetections schema, TeamGpsMap — all from Epics 4-5

### References

- [Source: docs/survey-analytics-spec.md#Section-2.5] — Data Collection & Quality metrics
- [Source: docs/survey-analytics-spec.md#Section-6.1] — Supervisor, Enumerator, Clerk page layouts
- [Source: docs/survey-analytics-spec.md#Section-9.2] — Data Quality Scorecard definition
- [Source: docs/survey-analytics-spec.md#Section-11] — Features S1-S9, P1-P8, T3-T4
- [Source: _bmad-output/planning-artifacts/epics.md#Story-8.3] — Acceptance criteria
- [Source: _bmad-output/implementation-artifacts/8-1-analytics-backend-foundation-descriptive-statistics-api.md] — Backend API types
- [Source: _bmad-output/implementation-artifacts/8-2-super-admin-government-official-survey-analytics-dashboard.md] — Reusable chart components
- [Source: apps/api/src/controllers/supervisor.controller.ts] — Supervisor scoping pattern
- [Source: apps/api/src/services/team-assignment.service.ts] — getEnumeratorIdsForSupervisor
- [Source: apps/api/src/services/productivity.service.ts] — WAT boundaries, status computation
- [Source: apps/api/src/services/fraud-engine.service.ts] — Fraud scoring reference
- [Source: apps/api/src/db/schema/submissions.ts] — gps_latitude, gps_longitude, completion_time_seconds
- [Source: apps/web/src/features/dashboard/components/TeamGpsMap.tsx] — Leaflet map pattern
- [Source: apps/web/src/features/dashboard/pages/ClerkStatsPage.tsx] — Placeholder to replace
- [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts] — Sidebar entries to modify

### Previous Story Intelligence (8-1 & 8-2)

- **Analytics route file**: Story 8-1 creates `analytics.routes.ts` — add team-quality and my-stats routes to it
- **Types file**: Story 8-1 creates `packages/types/src/analytics.ts` — extend with team-quality + personal-stats types
- **Chart component pattern**: Story 8-2 establishes `{ data, isLoading, error, className? }` props convention
- **Story 8-2 components reusable**: DemographicCharts, EmploymentCharts for supervisor's LGA Demographics tab
- **CSV export**: Story 8-2 creates ChartExportButton — reuse on all supervisor/personal charts
- **Suppression rendering**: Story 8-2 establishes gray bar + "Insufficient data" tooltip pattern

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Floating point precision: `teamAverages.fraudRate` — `toBe(0.075)` failed, fixed with `toBeCloseTo(0.075)`
- UUID validation: controller tests used `'sup-2'` which failed Zod `.uuid()`, fixed with proper UUIDs
- Promise.all mock ordering: `PersonalStatsService` runs 8 parallel queries via `Promise.all`, sequential `mockResolvedValueOnce()` unreliable. Fixed with universal `mockResolvedValue()` default returning all fields
- AnalyticsFilters API mismatch: SupervisorAnalyticsPage initially passed individual date props instead of `{value, onChange}` pattern. Fixed by using `AnalyticsQueryParams` state
- DemographicCharts/EmploymentCharts import: named exports not default. Fixed import statements
- Recharts Tooltip formatter type: `(value: number)` incompatible with `Formatter<number, NameType>`. Fixed by removing type annotation
- Old ClerkStatsPage test: Story 2.5-6 placeholder test expected "No stats available yet". Updated to test real implementation

### Completion Notes List
- 34 backend tests (11 team-quality service + 11 personal-stats service + 6 team-quality controller + 6 personal-stats controller)
- 97 frontend tests across 6 files (4 hook + 30 chart component + 6 supervisor page + 10 enumerator/clerk pages + 4 clerk page + 33 sidebar + 10 route assertions)
- Total new tests: 131 (34 backend + 97 frontend, though 33 sidebar tests existed before with 3 new + count updates)
- Full suite: 2249 web tests passing, 0 failures
- TypeScript: web package compiles cleanly (`tsc --noEmit`)
- submissions.enumerator_id is `text`, fraud_detections.enumerator_id is `uuid` — handled with `::text` cast in SQL

### Change Log
- 2026-03-11: Story 8.3 implemented — all 14 tasks complete, 131 tests passing

### File List

**New files:**
- `apps/api/src/services/team-quality.service.ts`
- `apps/api/src/services/personal-stats.service.ts`
- `apps/api/src/controllers/team-quality.controller.ts`
- `apps/api/src/controllers/personal-stats.controller.ts`
- `apps/api/src/services/__tests__/team-quality.service.test.ts`
- `apps/api/src/services/__tests__/personal-stats.service.test.ts`
- `apps/api/src/controllers/__tests__/team-quality.controller.test.ts`
- `apps/api/src/controllers/__tests__/personal-stats.controller.test.ts`
- `apps/web/src/features/dashboard/components/charts/TeamQualityCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/TeamCompletionTimeChart.tsx`
- `apps/web/src/features/dashboard/components/charts/FieldCoverageMap.tsx`
- `apps/web/src/features/dashboard/components/charts/DayOfWeekChart.tsx`
- `apps/web/src/features/dashboard/components/charts/HourOfDayChart.tsx`
- `apps/web/src/features/dashboard/components/charts/DataQualityScorecard.tsx`
- `apps/web/src/features/dashboard/components/charts/PersonalTrendChart.tsx`
- `apps/web/src/features/dashboard/components/charts/PersonalSkillsChart.tsx`
- `apps/web/src/features/dashboard/components/charts/CompletionTimeComparison.tsx`
- `apps/web/src/features/dashboard/components/charts/RespondentDiversityChart.tsx`
- `apps/web/src/features/dashboard/components/charts/__tests__/Story83Charts.test.tsx`
- `apps/web/src/features/dashboard/pages/SupervisorAnalyticsPage.tsx`
- `apps/web/src/features/dashboard/pages/EnumeratorStatsPage.tsx`
- `apps/web/src/features/dashboard/pages/__tests__/SupervisorAnalyticsPage.test.tsx`
- `apps/web/src/features/dashboard/pages/__tests__/FieldTeamStatsPages.test.tsx`

**Modified files:**
- `packages/types/src/analytics.ts` — added EnumeratorQualityMetric, TeamQualityData, PersonalStatsData, DataQualityScorecard
- `apps/api/src/routes/analytics.routes.ts` — added GET /team-quality, GET /my-stats
- `apps/web/src/features/dashboard/api/analytics.api.ts` — added fetchTeamQuality, fetchPersonalStats
- `apps/web/src/features/dashboard/hooks/useAnalytics.ts` — added useTeamQuality, usePersonalStats
- `apps/web/src/features/dashboard/hooks/__tests__/useAnalytics.test.ts` — added 4 Story 8.3 hook tests
- `apps/web/src/features/dashboard/pages/ClerkStatsPage.tsx` — replaced placeholder with real implementation
- `apps/web/src/features/dashboard/pages/__tests__/ClerkStatsPage.test.tsx` — updated from placeholder to real tests
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — added supervisor Team Analytics, enumerator My Stats
- `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` — updated counts, added 3 Story 8.3 assertions
- `apps/web/src/App.tsx` — added lazy imports + routes for SupervisorAnalyticsPage, EnumeratorStatsPage
