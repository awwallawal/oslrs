# Story 8.3: Field Team Analytics (Supervisor, Enumerator, Clerk)

Status: ready-for-dev

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

- [ ] Task 1: Create team quality types in `packages/types/src/analytics.ts` (AC: #4, #5)
  - [ ] 1.1 Define `EnumeratorQualityMetric` — enumeratorId, name, submissionCount, avgCompletionTimeSec, gpsRate, ninRate, skipRate, fraudFlagRate, status ('active'|'inactive')
  - [ ] 1.2 Define `TeamQualityData` — enumerators: EnumeratorQualityMetric[], teamAverages: { avgCompletionTime, gpsRate, ninRate, skipRate, fraudRate }, submissionsByDay: TrendDataPoint[], dayOfWeekPattern: FrequencyBucket[], hourOfDayPattern: FrequencyBucket[]
  - [ ] 1.3 Define `PersonalStatsData` — dailyTrend: TrendDataPoint[], cumulativeCount: number, avgCompletionTimeSec: number, teamAvgCompletionTimeSec: number, gpsRate: number, ninRate: number, skipRate: number, fraudFlagRate: number, teamAvgFraudRate: number, respondentDiversity: { genderSplit: FrequencyBucket[], ageSpread: FrequencyBucket[] }, topSkillsCollected: SkillsFrequency[], compositeQualityScore: number
  - [ ] 1.4 Define `DataQualityScorecard` — gpsScore, ninScore, completionTimeScore, skipScore, rejectionScore, diversityScore, compositeScore (weighted 0-100)
  - [ ] 1.5 Export from `packages/types/src/index.ts`

- [ ] Task 2: Create `apps/api/src/services/team-quality.service.ts` (AC: #4, #6)
  - [ ] 2.1 `getTeamQuality(supervisorId, params?)` — queries submissions + fraudDetections for all enumerators under supervisor via `TeamAssignmentService.getEnumeratorIdsForSupervisor()`
  - [ ] 2.2 Per-enumerator metrics query — single SQL with GROUP BY enumerator_id:
    - `COUNT(*)` as submissionCount
    - `AVG(completion_time_seconds)` as avgCompletionTime
    - `COUNT(*) FILTER (WHERE gps_latitude IS NOT NULL) / COUNT(*)::float` as gpsRate
    - NIN rate: `COUNT(*) FILTER (WHERE raw_data->>'nin' IS NOT NULL AND length(raw_data->>'nin') = 11) / COUNT(*)::float`
    - Skip rate: compute from raw_data JSONB (count null optional fields / total optional fields)
  - [ ] 2.3 Fraud flag rate: LEFT JOIN `fraudDetections` grouped by enumeratorId, count severity != null / total
  - [ ] 2.4 Team averages: aggregate across all enumerators
  - [ ] 2.5 Day-of-week pattern: `EXTRACT(DOW FROM submitted_at AT TIME ZONE 'Africa/Lagos')` GROUP BY
  - [ ] 2.6 Hour-of-day pattern: `EXTRACT(HOUR FROM submitted_at AT TIME ZONE 'Africa/Lagos')` GROUP BY
  - [ ] 2.7 Apply suppression to per-enumerator metrics where submissionCount < 5
  - [ ] 2.8 Join `users` table for enumerator name (`users.fullName` — single column, not separate first/last)
  - [ ] 2.9 Write 12 unit tests (per-enumerator metrics, team averages, suppression, empty team, day/hour patterns)

- [ ] Task 3: Create `apps/api/src/services/personal-stats.service.ts` (AC: #5)
  - [ ] 3.1 `getPersonalStats(userId, params?)` — personal submission analytics for enumerator or clerk
  - [ ] 3.2 Daily trend: submissions per day for last 30 days, using WAT boundaries
  - [ ] 3.3 Avg completion time: `AVG(completion_time_seconds)` for user's submissions
  - [ ] 3.4 Team avg completion time: compute from all submissions in user's team (via team_assignments → find supervisor → get all team enumerators). **Fallback chain:** if enumerator has no active supervisor assignment, fall back to LGA-wide average (all submissions where respondents.lga_id matches user's LGA). If no LGA assignment either, return `null` for all team comparison fields
  - [ ] 3.5 GPS rate, NIN rate, skip rate: same formulas as team-quality but filtered to `submitter_id = userId`
  - [ ] 3.6 Fraud flag rate + team avg: from `fraudDetections` where `enumerator_id = userId`
  - [ ] 3.7 Respondent diversity: gender split + age spread from raw_data of user's submissions
  - [ ] 3.8 Top skills collected: unnest `raw_data->>'skills_possessed'`, GROUP BY skill, ORDER BY count DESC LIMIT 10
  - [ ] 3.9 Composite quality score: weighted formula — GPS(20%) + NIN(20%) + completionTime(15%) + skipRate(15%) + fraudRate(20%) + diversity(10%). Score 0-100 where 100 = best.
  - [ ] 3.10 Write 10 unit tests (all metric calculations, edge cases, team comparison, score calculation)

- [ ] Task 4: Create `apps/api/src/controllers/team-quality.controller.ts` (AC: #4)
  - [ ] 4.1 `getTeamQuality` handler — extract supervisorId from `req.user.sub`, Zod validate optional params
  - [ ] 4.2 Write 6 controller tests (200 for supervisor, 403 for non-supervisor roles, params validation)

- [ ] Task 5: Create `apps/api/src/controllers/personal-stats.controller.ts` (AC: #5)
  - [ ] 5.1 `getPersonalStats` handler — extract userId from `req.user.sub`
  - [ ] 5.2 Write 6 controller tests (200 for enumerator, 200 for clerk, 403 for non-field roles)

- [ ] Task 6: Create routes and register (AC: #4, #5)
  - [ ] 6.1 Add to `apps/api/src/routes/analytics.routes.ts`:
    - `GET /team-quality` → authorize(SUPER_ADMIN, SUPERVISOR) → TeamQualityController.getTeamQuality
    - `GET /my-stats` → authorize(ENUMERATOR, DATA_ENTRY_CLERK) → PersonalStatsController.getPersonalStats
  - [ ] 6.2 For Super Admin calling `/team-quality`, accept `?supervisorId=` param to view any supervisor's team (optional override)
  - [ ] 6.3 Write 4 route tests (auth chain, 401 unauthenticated, 403 wrong role)

### Frontend

- [ ] Task 7: Create API client + hooks for new endpoints (AC: #1, #2, #3)
  - [ ] 7.1 Add to `apps/web/src/features/dashboard/api/analytics.api.ts`:
    - `fetchTeamQuality(params?): TeamQualityData`
    - `fetchPersonalStats(params?): PersonalStatsData`
  - [ ] 7.2 Add to `apps/web/src/features/dashboard/hooks/useAnalytics.ts`:
    - `useTeamQuality(params?)` — staleTime 60s
    - `usePersonalStats(params?)` — staleTime 60s
  - [ ] 7.3 Write 4 hook tests (data return, loading states)

- [ ] Task 8: Create supervisor chart components (AC: #1)
  - [ ] 8.1 `TeamQualityCharts.tsx` — per-enumerator comparison bars (submission count, GPS rate, NIN rate, fraud rate), ranked by submission count. Bars colored green/amber/red based on threshold vs team average
  - [ ] 8.2 `TeamCompletionTimeChart.tsx` — box plot or grouped bar showing avg completion time per enumerator with team average reference line
  - [ ] 8.3 `FieldCoverageMap.tsx` — Leaflet map showing enumerator GPS points on LGA boundary. Reuse `TeamGpsMap` pattern but add point density heatmap layer. Different color per enumerator
  - [ ] 8.4 `DayOfWeekChart.tsx` — bar chart showing avg submissions by weekday (Mon-Sun)
  - [ ] 8.5 `HourOfDayChart.tsx` — bar chart showing avg submissions by hour (WAT)
  - [ ] 8.6 Write 10 tests (2 per component: data render, loading state)

- [ ] Task 9: Create personal stats components (AC: #2, #3)
  - [ ] 9.1 `DataQualityScorecard.tsx` — gamified composite score display (0-100). Circular progress indicator or gauge. Below: 6 individual metric cards with green/amber/red badges. Green: ≥ team avg, Amber: within 10% below, Red: > 10% below team avg
  - [ ] 9.2 `PersonalTrendChart.tsx` — daily submission line chart (reuse existing `SubmissionActivityChart` pattern). Cumulative progress line overlaid
  - [ ] 9.3 `PersonalSkillsChart.tsx` — horizontal bar showing top 10 skills the user has collected most
  - [ ] 9.4 `CompletionTimeComparison.tsx` — stat card showing "Your avg: Xm Ys" vs "Team avg: Xm Ys" with delta indicator (faster/slower)
  - [ ] 9.5 `RespondentDiversityChart.tsx` — gender split pie + age spread bar, with advisory text like "78% male — consider reaching more women"
  - [ ] 9.6 Write 10 tests (2 per component)

- [ ] Task 10: Create Supervisor Team Analytics page (AC: #1)
  - [ ] 10.1 Create `apps/web/src/features/dashboard/pages/SupervisorAnalyticsPage.tsx`
  - [ ] 10.2 Layout: dark header → filter (enumerator dropdown, date range) → tabs
  - [ ] 10.3 Tabs: Data Quality | Field Coverage | LGA Demographics
  - [ ] 10.4 **Data Quality tab**: TeamQualityCharts (per-enumerator bars) + TeamCompletionTimeChart + DayOfWeekChart + HourOfDayChart
  - [ ] 10.5 **Field Coverage tab**: FieldCoverageMap (full-width) + GPS coverage rate stat cards
  - [ ] 10.6 **LGA Demographics tab**: Reuse DemographicCharts + EmploymentCharts from Story 8-2 with LGA-scoped data (backend returns LGA scope for supervisor automatically)
  - [ ] 10.7 Loading: SkeletonCard grid matching layout. Error: per-section error cards
  - [ ] 10.8 Write 6 tests (page render, tab switching, per-enumerator filter, loading/error states)

- [ ] Task 11: Create Enumerator Stats page (AC: #2)
  - [ ] 11.1 Create `apps/web/src/features/dashboard/pages/EnumeratorStatsPage.tsx`
  - [ ] 11.2 Layout: dark header → tabs (no global filters — always personal data)
  - [ ] 11.3 Tabs: My Performance | My Data Quality | My Profile
  - [ ] 11.4 **My Performance tab**: PersonalTrendChart (daily + cumulative), CompletionTimeComparison, PersonalSkillsChart
  - [ ] 11.5 **My Data Quality tab**: DataQualityScorecard (composite 0-100 gauge + 6 metric cards)
  - [ ] 11.6 **My Profile tab**: RespondentDiversityChart (demographics of respondents surveyed)
  - [ ] 11.7 Mobile-optimized: single-column layout on small screens, tab bar scrollable
  - [ ] 11.8 Write 6 tests (page render, tab switching, scorecard rendering, mobile layout)

- [ ] Task 12: Replace Clerk Stats placeholder (AC: #3)
  - [ ] 12.1 Replace `apps/web/src/features/dashboard/pages/ClerkStatsPage.tsx` placeholder content
  - [ ] 12.2 Tabs: My Performance | My Data Quality (no "My Profile" — clerks transcribe paper, diversity feedback less relevant)
  - [ ] 12.3 **My Performance tab**: PersonalTrendChart (labeled "entries" not "submissions"), CompletionTimeComparison (labeled "avg entry time")
  - [ ] 12.4 **My Data Quality tab**: DataQualityScorecard (same composite, exclude GPS metric for clerks — weight redistributed)
  - [ ] 12.5 Write 4 tests (placeholder replaced, tabs render, clerk-specific labels)

- [ ] Task 13: Update sidebar and routing (AC: #1, #2, #3)
  - [ ] 13.1 Add to `sidebarConfig.ts` for `supervisor`: `{ label: 'Team Analytics', href: '/dashboard/supervisor/analytics', icon: BarChart }` — insert after Productivity, before Registry
  - [ ] 13.2 Add to `sidebarConfig.ts` for `enumerator`: `{ label: 'My Stats', href: '/dashboard/enumerator/stats', icon: BarChart }` — insert after Sync Status (index 3, 0-based), before Messages (index 4)
  - [ ] 13.3 Clerk sidebar: no change (My Stats already exists at `/dashboard/clerk/stats`)
  - [ ] 13.4 Add lazy imports + routes in `App.tsx`:
    - `/dashboard/supervisor/analytics` → SupervisorAnalyticsPage
    - `/dashboard/enumerator/stats` → EnumeratorStatsPage
    - Clerk route already exists for `/dashboard/clerk/stats`
  - [ ] 13.5 Write 3 tests (sidebar items render for each role, routes load correct pages)

- [ ] Task 14: Update sprint status
  - [ ] 14.1 Update `sprint-status.yaml`: `8-3-field-team-analytics-supervisor-enumerator-clerk: ready-for-dev → in-progress`

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

### Debug Log References

### Completion Notes List

### File List
