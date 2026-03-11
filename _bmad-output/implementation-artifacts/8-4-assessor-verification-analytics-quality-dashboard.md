# Story 8.4: Assessor Verification Analytics & Quality Dashboard

Status: done

## Story

As an Assessor,
I want analytics on the verification pipeline and data quality patterns,
So that I can prioritize my audit queue and identify systematic quality issues.

## Acceptance Criteria

1. **Given** an Assessor navigating to "Analytics" in the sidebar **When** the page loads **Then** it displays:
   - Verification funnel (submissions → flagged → reviewed → approved/rejected)
   - Fraud detection breakdown (flags by type: GPS cluster, speed-run, straight-lining, duplicate, timing)
   - Resolution rate trend (verified per day/week)
   - Top flagged enumerators table (ranked by fraud flag count)
   - Data quality scorecard (completeness %, consistency checks passed %)
   **Note:** Inter-rater reliability (Cohen's Kappa) is listed in the epic AC but deferred — current workflow uses a single assessor per submission, so no multi-assessor overlap data exists. Will be revisited if multi-assessor review workflow is introduced.

2. **Given** the assessor clicks on a fraud type in the breakdown chart **When** the drill-down loads **Then** it shows specific submissions flagged for that fraud type **And** links directly to the audit queue filtered by that flag.

3. **Given** the verification pipeline endpoint **When** called by an Assessor or Super Admin **Then** it returns: daily review throughput, avg review time, backlog trend (queue size over time), approval/rejection rates, rejection reason frequency, time-to-resolution (submission → final verdict).

4. **Given** the assessor analytics page **When** a Government Official views it **Then** they see the same pipeline metrics in read-only mode (no review actions).

5. **Given** optional filters (LGA dropdown, severity multi-select, date range) **When** the user changes any filter **Then** all pipeline charts and metrics update accordingly.

6. **Given** the Demographics tab on the assessor analytics page **When** it loads **Then** it reuses the same demographic charts from Story 8-2 in read-only mode for baseline context.

## Tasks / Subtasks

### Backend

- [x] Task 1: Create verification analytics types in `packages/types/src/analytics.ts` (AC: #3)
  - [x] 1.1 Define `VerificationFunnel` — totalSubmissions, totalFlagged, totalReviewed, totalApproved, totalRejected
  - [x] 1.2 Define `FraudTypeBreakdown` — gpsCluster: number, speedRun: number, straightLining: number, duplicateResponse: number, offHours: number (count of detections where each heuristic score > 0)
  - [x] 1.3 Define `ReviewThroughput` — date: string, reviewedCount: number, approvedCount: number, rejectedCount: number
  - [x] 1.4 Define `TopFlaggedEnumerator` — enumeratorId: string, name: string, flagCount: number, criticalCount: number, highCount: number, approvalRate: number
  - [x] 1.5 Define `BacklogTrend` — date: string, pendingCount: number, highCriticalCount: number
  - [x] 1.6 Define `RejectionReasonFrequency` — reason: string, count: number, percentage: number
  - [x] 1.7 Define `VerificationPipelineData` — funnel, fraudTypeBreakdown, throughputTrend: ReviewThroughput[], topFlaggedEnumerators: TopFlaggedEnumerator[], backlogTrend: BacklogTrend[], rejectionReasons: RejectionReasonFrequency[], avgReviewTimeMinutes: number, medianTimeToResolutionDays: number, dataQualityScore: { completenessRate: number, consistencyRate: number }
  - [x] 1.8 Export from `packages/types/src/index.ts` (already present via Story 8.1 wildcard `export * from './analytics.js'`)

- [x] Task 2: Create `apps/api/src/services/verification-analytics.service.ts` (AC: #1, #3)
  - [x] 2.1 `getVerificationFunnel(params?)` — count total submissions, total fraud_detections, reviewed (supervisor resolution NOT NULL), assessor approved/rejected
  - [x] 2.2 `getFraudTypeBreakdown(params?)` — count detections where each component score > 0:
    ```sql
    COUNT(*) FILTER (WHERE gps_score > 0) AS gps_cluster,
    COUNT(*) FILTER (WHERE speed_score > 0) AS speed_run,
    COUNT(*) FILTER (WHERE straightline_score > 0) AS straight_lining,
    COUNT(*) FILTER (WHERE duplicate_score > 0) AS duplicate_response,
    COUNT(*) FILTER (WHERE timing_score > 0) AS off_hours
    ```
  - [x] 2.3 `getReviewThroughput(params?, days?)` — daily assessor reviews grouped by `DATE(assessor_reviewed_at AT TIME ZONE 'Africa/Lagos')`, counts by assessor_resolution
  - [x] 2.4 `getTopFlaggedEnumerators(params?, limit?)` — GROUP BY enumerator_id, COUNT fraud_detections, filter by severity, JOIN users for name (`u.full_name AS name` — single column, see Story 8.3 schema fix), ORDER BY flagCount DESC
  - [x] 2.5 `getBacklogTrend(params?, days?)` — tricky: need daily snapshots of pending queue size. Options: (a) compute from audit logs timestamps, (b) precompute daily, (c) approximate from cumulative created vs resolved. Use approach (c): for each day, count detections with `computed_at <= day` AND (`assessor_reviewed_at > day` OR `assessor_reviewed_at IS NULL`)
  - [x] 2.6 `getRejectionReasons(params?)` — GROUP BY resolution from supervisor first-tier decisions (confirmed_fraud, needs_investigation, etc.), count + percentage
  - [x] 2.7 `getAvgReviewTime(params?)` — AVG(EXTRACT(EPOCH FROM (assessor_reviewed_at - reviewed_at)) / 60) for completed reviews (minutes between supervisor review and assessor review)
  - [x] 2.8 `getTimeToResolution(params?)` — median days from `submissions.submitted_at` to `fraud_detections.assessor_reviewed_at` for resolved detections
  - [x] 2.9 `getDataQualityScore(params?)` — completeness: % of submissions with all required fields non-null; consistency: % of detections with severity='clean'
  - [x] 2.10 `getFullPipelineData(params?)` — orchestrator calling all above methods, returning `VerificationPipelineData`
  - [x] 2.11 Apply optional filters: lgaId (JOIN respondents), severity array, dateFrom/dateTo
  - [x] 2.12 Write 15 unit tests (one per method + filter combinations + edge cases)

- [x] Task 3: Create `apps/api/src/controllers/verification-analytics.controller.ts` (AC: #3, #4, #5)
  - [x] 3.1 `getVerificationPipeline` handler — Zod validate query params (lgaId?, severity[]?, dateFrom?, dateTo?), call orchestrator, return `{ data }`
  - [x] 3.2 Write 8 controller tests (200 for assessor, 200 for super_admin, 200 for gov_official read-only, 403 for supervisor/enumerator/clerk, params validation, empty data)

- [x] Task 4: Add route to `apps/api/src/routes/analytics.routes.ts` (AC: #3, #4)
  - [x] 4.1 `GET /verification-pipeline` → authorize(SUPER_ADMIN, VERIFICATION_ASSESSOR, GOVERNMENT_OFFICIAL) → VerificationAnalyticsController.getVerificationPipeline
  - [x] 4.2 Route MUST come before any parameterized routes in the analytics router
  - [x] 4.3 Write 3 route tests (auth chain, 401, 403)

### Frontend

- [x] Task 5: Create API client + hooks (AC: #1, #5)
  - [x] 5.1 Add to `apps/web/src/features/dashboard/api/analytics.api.ts`:
    - `fetchVerificationPipeline(params?): VerificationPipelineData`
  - [x] 5.2 Add to `apps/web/src/features/dashboard/hooks/useAnalytics.ts`:
    - `useVerificationPipeline(params?)` — staleTime 60s
  - [x] 5.3 Write 2 hook tests (data return, param forwarding)

- [x] Task 6: Create verification pipeline chart components (AC: #1, #2)
  - [x] 6.1 `VerificationFunnelChart.tsx` — horizontal funnel/waterfall showing: Submissions → Flagged → Supervisor Reviewed → Assessor Approved / Rejected. Use horizontal BarChart with cascading widths. Colors: blue → amber → green/red
  - [x] 6.2 `FraudTypeBreakdownChart.tsx` — horizontal bar chart with 5 bars (GPS cluster, speed-run, straight-lining, duplicate, off-hours). Each bar is clickable → navigates to `/dashboard/assessor/queue?heuristic=gps_clustering` (or equivalent filter)
  - [x] 6.3 `ReviewThroughputChart.tsx` — stacked area chart showing daily approved (green) + rejected (red) reviews over time. Reference line for daily average
  - [x] 6.4 `TopFlaggedEnumeratorsTable.tsx` — ranked table: Name, Flag Count, Critical, High, Approval Rate. Row click → navigate to audit queue filtered by enumeratorId. Top 10 by default, expandable
  - [x] 6.5 `BacklogTrendChart.tsx` — line chart showing pending queue size over time. Second line for high+critical subset. Area fill to visualize backlog volume
  - [x] 6.6 `RejectionReasonsChart.tsx` — horizontal bar chart of supervisor resolution reasons (confirmed_fraud, needs_investigation, dismissed, etc.) with counts
  - [x] 6.7 `PipelineStatCards.tsx` — 4 stat cards: Avg Review Time (minutes), Median Time-to-Resolution (days), Data Completeness %, Data Consistency %
  - [x] 6.8 All components: `{ data, isLoading, error, className? }` props pattern, suppression-aware, ChartExportButton
  - [x] 6.9 Write 14 tests (2 per component: data render, loading state)

- [x] Task 7: Create Assessor Analytics page (AC: #1, #2, #5, #6)
  - [x] 7.1 Create `apps/web/src/features/dashboard/pages/AssessorAnalyticsPage.tsx`
  - [x] 7.2 Layout: dark header → filters (LGA, severity, date range) → tabs
  - [x] 7.3 Tabs: Verification Pipeline | Data Quality Flags | Demographics
  - [x] 7.4 **Verification Pipeline tab**:
    - Row 1: PipelineStatCards (4 cards)
    - Row 2: VerificationFunnelChart (full-width)
    - Row 3: 2 charts — FraudTypeBreakdownChart | RejectionReasonsChart
    - Row 4: ReviewThroughputChart (full-width)
    - Row 5: 2 sections — BacklogTrendChart | TopFlaggedEnumeratorsTable
  - [x] 7.5 **Data Quality Flags tab**: Summary stat cards (completeness %, consistency %) + table of recent flagged submissions grouped by flag type, each row links to audit queue
  - [x] 7.6 **Demographics tab**: Reuse DemographicCharts + EmploymentCharts from Story 8-2 (auto-scoped via backend scope chain — assessor gets system-wide read-only)
  - [x] 7.7 Loading: SkeletonCard grid per tab. Error: per-section error cards
  - [x] 7.8 Write 8 tests (page render, tab switching, drill-down navigation, filter application, stat cards, chart rendering)

- [x] Task 8: Implement drill-down navigation (AC: #2)
  - [x] 8.1 **Backend:** Extend `AssessorService.getAuditQueue()` in `apps/api/src/services/assessor.service.ts` to accept `heuristic?: string` param — filter `WHERE ${heuristicColumn}_score > 0` (map heuristic name to score column: `gps_clustering → gps_score`, `speed_run → speed_score`, `straight_lining → straightline_score`, `duplicate_response → duplicate_score`, `off_hours → timing_score`)
  - [x] 8.2 **Backend:** Extend `AssessorService.getAuditQueue()` to accept `enumeratorId?: string` param — filter `WHERE enumerator_id = $1` (in addition to existing `enumeratorName` text search)
  - [x] 8.3 **Backend:** Update Zod validation in `assessor.controller.ts` `getAuditQueue` handler to accept both new optional params
  - [x] 8.4 **Backend:** Write 4 tests (heuristic filter returns correct subset, enumeratorId filter, invalid heuristic name rejected, backward-compatible with no new params)
  - [x] 8.5 FraudTypeBreakdownChart bar click → `navigate('/dashboard/assessor/queue?heuristic=gps_clustering')` (or speed_run, straight_lining, duplicate_response, off_hours)
  - [x] 8.6 TopFlaggedEnumeratorsTable row click → `navigate('/dashboard/assessor/queue?enumeratorId=${id}')`
  - [x] 8.7 Data Quality Flags table row click → `navigate('/dashboard/assessor/queue?severity=high,critical')`
  - [x] 8.8 **Frontend:** Update `AssessorQueuePage` to read `heuristic` and `enumeratorId` from URL search params (existing `useSearchParams()` already handles severity, LGA, date) and apply as initial filter values
  - [x] 8.9 Write 4 frontend tests (navigation on click for each drill-down type, URL params applied to queue filters)

- [x] Task 9: Update sidebar and routing (AC: #1)
  - [x] 9.1 Add to `sidebarConfig.ts` for `verification_assessor`: `{ label: 'Analytics', href: '/dashboard/assessor/analytics', icon: BarChart3 }` — inserted after Audit Queue (position 2, high-frequency placement)
  - [x] 9.2 Add lazy import + route in `App.tsx`: `/dashboard/assessor/analytics` → AssessorAnalyticsPage
  - [x] 9.3 Write 2 tests (sidebar item renders, route loads page)

- [x] Task 10: Update sprint status
  - [x] 10.1 Update `sprint-status.yaml`: `8-4-assessor-verification-analytics-quality-dashboard: ready-for-dev → in-progress`

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] SQL Injection risk: `sql.raw()` with user severity values in `buildFilterFragments` — replace with parameterized `sql.join()` [verification-analytics.service.ts:34]
- [x] [AI-Review][HIGH] Drill-down filters not clearable from UI — `heuristicFilter`/`enumeratorIdFilter` have no setter, no visible chip, no clear button [AssessorQueuePage.tsx:60-61]
- [x] [AI-Review][HIGH] Missing ChartExportButton on all 7 chart components — Task 6.8 requires it [VerificationFunnelChart, FraudTypeBreakdownChart, ReviewThroughputChart, TopFlaggedEnumeratorsTable, BacklogTrendChart, RejectionReasonsChart, PipelineStatCards]
- [x] [AI-Review][MEDIUM] 7 undocumented file changes (dead-code cleanup from Story 8.3) — update File List
- [x] [AI-Review][MEDIUM] Sidebar position contradicts task 9.1 spec — update task text to match actual (after Audit Queue)
- [x] [AI-Review][MEDIUM] RBAC rejection tests claimed but not present — add `authorize` role verification to route test
- [x] [AI-Review][LOW] Task 1.8 misleadingly marked [x] — re-export already existed from Story 8.1
- [x] [AI-Review][LOW] TanStack Query test noise — `fetchLgas` mock returns undefined, fix mock

## Dev Notes

### Backend: New Endpoint Added to analytics.routes.ts

| Endpoint | Roles | Returns |
|----------|-------|---------|
| `GET /analytics/verification-pipeline` | Super Admin, Assessor, Government Official (read-only) | Full pipeline data: funnel, fraud breakdown, throughput, backlog, top flagged, rejection reasons, metrics |

Accepts: `?lgaId=&severity=high,critical&dateFrom=&dateTo=`

### Verification Funnel SQL

The funnel counts flow through the entire verification lifecycle:

```sql
-- Total submissions
SELECT COUNT(*) FROM submissions WHERE processed = true

-- Total flagged (fraud detection exists)
SELECT COUNT(*) FROM fraud_detections

-- Supervisor reviewed (resolution populated)
SELECT COUNT(*) FROM fraud_detections WHERE resolution IS NOT NULL

-- Assessor reviewed
SELECT COUNT(*) FROM fraud_detections WHERE assessor_resolution IS NOT NULL

-- Assessor approved / rejected
SELECT COUNT(*) FILTER (WHERE assessor_resolution = 'final_approved') AS approved,
       COUNT(*) FILTER (WHERE assessor_resolution = 'final_rejected') AS rejected
FROM fraud_detections
WHERE assessor_resolution IS NOT NULL
```

### Fraud Type Breakdown SQL

Each heuristic has a corresponding score column in `fraud_detections`. Count where score > 0 indicates that heuristic flagged the submission:

```sql
SELECT
  COUNT(*) FILTER (WHERE gps_score > 0) AS gps_cluster,
  COUNT(*) FILTER (WHERE speed_score > 0) AS speed_run,
  COUNT(*) FILTER (WHERE straightline_score > 0) AS straight_lining,
  COUNT(*) FILTER (WHERE duplicate_score > 0) AS duplicate_response,
  COUNT(*) FILTER (WHERE timing_score > 0) AS off_hours
FROM fraud_detections
WHERE severity != 'clean'  -- only count actual flags
```

Score columns: `gps_score`, `speed_score`, `straightline_score`, `duplicate_score`, `timing_score` — all `numeric(5,2)`, max weights: 25, 25, 20, 20, 10.

[Source: `apps/api/src/db/schema/fraud-detections.ts`]

### Backlog Trend Computation

There's no daily snapshot table for queue size. Compute from cumulative created vs resolved:

```sql
-- For each day in range, compute pending count
WITH date_series AS (
  SELECT generate_series(
    $dateFrom::date,
    $dateTo::date,
    '1 day'::interval
  )::date AS day
)
SELECT
  ds.day,
  COUNT(*) FILTER (
    WHERE fd.computed_at::date <= ds.day
      AND (fd.assessor_reviewed_at IS NULL OR fd.assessor_reviewed_at::date > ds.day)
      AND (fd.resolution IS NOT NULL OR fd.severity IN ('high', 'critical'))
  ) AS pending_count
FROM date_series ds
CROSS JOIN fraud_detections fd
GROUP BY ds.day
ORDER BY ds.day
```

This is O(days * detections) — acceptable for 30-90 day ranges with typical detection volumes. For larger ranges, consider materialized views.

### Time-to-Resolution

Median days from submission to final assessor verdict:

```sql
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (fd.assessor_reviewed_at - s.submitted_at)) / 86400
  ) AS median_days
FROM fraud_detections fd
JOIN submissions s ON fd.submission_id = s.id
WHERE fd.assessor_resolution IS NOT NULL
```

### Drill-Down Navigation Pattern

The fraud type breakdown chart and top enumerators table link to the existing audit queue page with URL query params:

```typescript
// FraudTypeBreakdownChart — on bar click
const handleBarClick = (heuristicKey: string) => {
  navigate(`/dashboard/assessor/queue?heuristic=${heuristicKey}`);
};

// TopFlaggedEnumeratorsTable — on row click
const handleRowClick = (enumeratorId: string) => {
  navigate(`/dashboard/assessor/queue?enumeratorId=${enumeratorId}`);
};
```

**AssessorQueuePage must read these URL params** and apply as initial filter values. Check if the existing page already uses `useSearchParams()` — if not, add it. The assessor API already accepts `enumeratorName` filter but not `enumeratorId` — may need to extend the filter or do a name lookup.

For heuristic filter: the existing queue doesn't filter by heuristic type. Options:
1. **Extend backend** `/assessor/audit-queue` to accept `?heuristic=gps_clustering` which filters `WHERE gps_score > 0`
2. **Client-side filter** after fetching queue data (simpler but less efficient)

Recommendation: Extend the backend (option 1) — add optional `heuristic` query param to `getAuditQueue`.

### Existing Components to Reuse

| Component | Location | Reuse How |
|-----------|----------|-----------|
| `DemographicCharts` | `features/dashboard/components/charts/DemographicCharts.tsx` (Story 8-2) | Demographics tab — read-only |
| `EmploymentCharts` | `features/dashboard/components/charts/EmploymentCharts.tsx` (Story 8-2) | Demographics tab — read-only |
| `ChartExportButton` | `features/dashboard/components/charts/ChartExportButton.tsx` (Story 8-2) | CSV export on all chart cards |
| `AnalyticsFilters` | `features/dashboard/components/AnalyticsFilters.tsx` (Story 8-2) | Base for filter bar (extend with severity multi-select) |
| `FraudDetectionTable` | `features/dashboard/components/FraudDetectionTable.tsx` | Reference for table patterns |
| `EvidencePanel` | `features/dashboard/components/EvidencePanel.tsx` | Reference for detail display |

### Existing Backend to Reuse

| Service | Location | Reuse How |
|---------|----------|-----------|
| `AssessorService` | `services/assessor.service.ts` | Reference for queue/review patterns |
| `FraudEngine` | `services/fraud-engine.service.ts` | Reference for score columns and severity mapping |
| `SurveyAnalyticsService` | `services/survey-analytics.service.ts` (Story 8-1) | Demographics for assessor context tab |

### Fraud Detection Schema Reference

Key columns for analytics queries:

```
fraud_detections
├── id (UUID PK)
├── submission_id → submissions.id
├── enumerator_id → users.id
├── computed_at (timestamp)
├── gps_score, speed_score, straightline_score, duplicate_score, timing_score (numeric 5,2)
├── total_score (numeric 5,2)
├── severity (enum: clean, low, medium, high, critical)
├── resolution (enum: confirmed_fraud, false_positive, needs_investigation, dismissed, enumerator_warned, enumerator_suspended)
├── resolution_notes (text)
├── reviewed_by, reviewed_at (supervisor first-tier)
├── assessor_resolution (enum: final_approved, final_rejected)
├── assessor_notes (text)
├── assessor_reviewed_by, assessor_reviewed_at (assessor second-tier)
└── gps_details, speed_details, straightline_details, duplicate_details, timing_details (JSONB)
```

[Source: `apps/api/src/db/schema/fraud-detections.ts`]

### Sidebar Change

Add to `sidebarConfig.ts` for `verification_assessor` — insert after Evidence (index 4), before Export Data (index 5):
```typescript
{ label: 'Analytics', href: '/dashboard/assessor/analytics', icon: BarChart },
```

### Page Layout (from docs/survey-analytics-spec.md Section 6.1)

**Assessor: Analytics** (`/dashboard/assessor/analytics`):
```
[Dark Header: "Verification Analytics"]
[Filters: [LGA dropdown] [Severity multi-select] [Date Range]]

[Tab: Verification Pipeline] [Tab: Data Quality Flags] [Tab: Demographics]

Verification Pipeline Tab:
  [Row 1: 4 stat cards — Avg Review Time, Time-to-Resolution, Completeness %, Consistency %]
  [Row 2: VerificationFunnelChart (full-width waterfall)]
  [Row 3: 2 charts — FraudTypeBreakdownChart (clickable bars) | RejectionReasonsChart]
  [Row 4: ReviewThroughputChart (full-width stacked area)]
  [Row 5: 2 sections — BacklogTrendChart | TopFlaggedEnumeratorsTable (clickable rows)]

Data Quality Flags Tab:
  [Row 1: 2 stat cards — Completeness Rate, Consistency Rate]
  [Row 2: Table of recent quality flags grouped by type, links to audit queue]

Demographics Tab:
  [Reuse DemographicCharts + EmploymentCharts from Story 8-2, read-only]
```

### Out of Scope (No Stories Exist Yet)

- **Inter-rater agreement (Cohen's Kappa)** — Requires multiple assessors reviewing the same submissions, which doesn't happen in current single-assessor workflow. Prerequisite: multi-assessor review workflow. See spec feature V7.
- **Inter-enumerator reliability (S10)** — Complex distribution comparison across enumerators. Could be a future story if quality monitoring demands it. See spec feature S10.

### Project Structure Notes

**New backend files:**
- `packages/types/src/analytics.ts` (extend with verification pipeline types)
- `apps/api/src/services/verification-analytics.service.ts`
- `apps/api/src/controllers/verification-analytics.controller.ts`

**New frontend files:**
- `apps/web/src/features/dashboard/components/charts/VerificationFunnelChart.tsx`
- `apps/web/src/features/dashboard/components/charts/FraudTypeBreakdownChart.tsx`
- `apps/web/src/features/dashboard/components/charts/ReviewThroughputChart.tsx`
- `apps/web/src/features/dashboard/components/charts/TopFlaggedEnumeratorsTable.tsx`
- `apps/web/src/features/dashboard/components/charts/BacklogTrendChart.tsx`
- `apps/web/src/features/dashboard/components/charts/RejectionReasonsChart.tsx`
- `apps/web/src/features/dashboard/components/charts/PipelineStatCards.tsx`
- `apps/web/src/features/dashboard/pages/AssessorAnalyticsPage.tsx`

**Modified files:**
- `packages/types/src/analytics.ts` (add verification types)
- `packages/types/src/index.ts` (re-export)
- `apps/api/src/routes/analytics.routes.ts` (add verification-pipeline route)
- `apps/web/src/features/dashboard/api/analytics.api.ts` (add fetch function)
- `apps/web/src/features/dashboard/hooks/useAnalytics.ts` (add hook)
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` (add assessor analytics item)
- `apps/web/src/App.tsx` (add lazy import + route)
- `apps/api/src/services/assessor.service.ts` (extend getAuditQueue to accept `heuristic` + `enumeratorId` filter params)
- `apps/api/src/controllers/assessor.controller.ts` (extend Zod validation for new params)

### Anti-Patterns to Avoid

1. **DO NOT show individual submission details on analytics page** — analytics shows aggregates only; drill-down navigates to audit queue
2. **DO NOT duplicate fraud detection queries** — reuse existing `fraud_detections` table with aggregation, don't query raw submissions for fraud info
3. **DO NOT compute backlog with N+1 queries** — use generate_series + cross join pattern for efficient date-series computation
4. **DO NOT hardcode fraud heuristic names** — derive from schema column names (gps_score, speed_score, etc.)
5. **DO NOT show reviewer names in analytics** — show only aggregate throughput, not per-assessor breakdown (assessors should not compete)
6. **DO NOT forget Number() conversion** — `numeric(5,2)` returns strings via Drizzle, must parseFloat
7. **DO NOT break existing assessor queue** — extending it with `heuristic` filter must be backward-compatible

### References

- [Source: docs/survey-analytics-spec.md#Section-6.1] — Assessor analytics page layout
- [Source: docs/survey-analytics-spec.md#Section-9.1] — Verification pipeline analytics definition
- [Source: docs/survey-analytics-spec.md#Section-11] — Features V1-V7
- [Source: _bmad-output/planning-artifacts/epics.md#Story-8.4] — Acceptance criteria
- [Source: apps/api/src/db/schema/fraud-detections.ts] — Full schema with score columns + resolution enums
- [Source: apps/api/src/services/fraud-engine.service.ts] — 5 heuristics, severity mapping
- [Source: apps/api/src/services/assessor.service.ts] — Queue logic, review workflow
- [Source: apps/api/src/controllers/assessor.controller.ts] — Existing handlers
- [Source: apps/api/src/routes/assessor.routes.ts] — Existing route definitions
- [Source: apps/web/src/features/dashboard/pages/AssessorQueuePage.tsx] — Drill-down target
- [Source: apps/web/src/features/dashboard/hooks/useAssessor.ts] — Existing hooks
- [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts] — Sidebar entries

### Previous Story Intelligence (8-1, 8-2, 8-3)

- **Analytics route file**: Story 8-1 creates `analytics.routes.ts` — add verification-pipeline route to it
- **Types file**: Story 8-1 creates `analytics.ts` — extend with verification types
- **Chart props convention**: Story 8-2 establishes `{ data, isLoading, error, className? }` pattern
- **Story 8-2 components reusable**: DemographicCharts, EmploymentCharts for Demographics tab, ChartExportButton for CSV
- **Filters component**: Story 8-2 creates AnalyticsFilters — extend for severity multi-select
- **Multi-period aggregation**: Stories 8-1/8-3 use `COUNT(*) FILTER (WHERE ...)` — same pattern for fraud type counts
- **Score column casting**: Story 7-6 established parseFloat for numeric columns from Drizzle

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Orchestrator test fix: `vi.spyOn` on individual service methods instead of mocking `db.execute` (Promise.all parallel mock consumption issue)
- Chart test fix: Missing `@testing-library/jest-dom/matchers` import + `expect.extend(matchers)` call
- Page test fix: Radix Tabs require `mouseDown + focus + click` sequence; hooks mocked directly instead of API functions
- Assessor controller drill-down test fix: `VALID_HEURISTICS` export missing from service mock

### Completion Notes List
- All 10 tasks completed: 4 backend + 6 frontend
- 66 new tests total: 21 service + 8 controller + 3 route + 2 hook + 14 charts + 8 page + 4 assessor drill-down backend + 4 queue drill-down frontend + 2 sidebar
- Full test suite: Web 198 files / 2,279 tests passed. API 1 pre-existing failure in registration.service.test.ts (unrelated).
- Cohen's Kappa deferred per story note — single-assessor workflow has no multi-assessor overlap data
- Sidebar: Analytics inserted after Audit Queue (position 3), before Registry

### Change Log
- 2026-03-11: Tasks 1-10 implemented, all tests green, status → review
- 2026-03-11: Code review fixes — SQL injection (H1), drill-down clearability (H2), ChartExportButton (H3), RBAC test (M3), docs (M1/M2/L1/L2)

### File List

**New Files:**
- `apps/api/src/services/verification-analytics.service.ts` — 10 static methods for pipeline analytics
- `apps/api/src/services/__tests__/verification-analytics.service.test.ts` — 21 tests
- `apps/api/src/controllers/verification-analytics.controller.ts` — Pipeline handler
- `apps/api/src/controllers/__tests__/verification-analytics.controller.test.ts` — 8 tests
- `apps/api/src/routes/__tests__/analytics.routes.test.ts` — 3 tests
- `apps/web/src/features/dashboard/components/charts/VerificationFunnelChart.tsx`
- `apps/web/src/features/dashboard/components/charts/FraudTypeBreakdownChart.tsx`
- `apps/web/src/features/dashboard/components/charts/ReviewThroughputChart.tsx`
- `apps/web/src/features/dashboard/components/charts/TopFlaggedEnumeratorsTable.tsx`
- `apps/web/src/features/dashboard/components/charts/BacklogTrendChart.tsx`
- `apps/web/src/features/dashboard/components/charts/RejectionReasonsChart.tsx`
- `apps/web/src/features/dashboard/components/charts/PipelineStatCards.tsx`
- `apps/web/src/features/dashboard/components/charts/__tests__/VerificationCharts.test.tsx` — 14 tests
- `apps/web/src/features/dashboard/pages/AssessorAnalyticsPage.tsx`
- `apps/web/src/features/dashboard/pages/__tests__/AssessorAnalyticsPage.test.tsx` — 8 tests

**Modified Files:**
- `packages/types/src/analytics.ts` — Added 8 verification pipeline interfaces
- `apps/api/src/routes/analytics.routes.ts` — Added `/verification-pipeline` route
- `apps/api/src/services/assessor.service.ts` — Extended with `heuristic` + `enumeratorId` filters, exported `VALID_HEURISTICS`
- `apps/api/src/controllers/assessor.controller.ts` — Extended validation for heuristic + enumeratorId params
- `apps/api/src/controllers/__tests__/assessor.controller.test.ts` — Added 4 drill-down tests
- `apps/web/src/features/dashboard/api/analytics.api.ts` — Added `fetchVerificationPipeline`
- `apps/web/src/features/dashboard/api/assessor.api.ts` — Extended `AuditQueueFilters` + `fetchAuditQueue` with heuristic/enumeratorId
- `apps/web/src/features/dashboard/hooks/useAnalytics.ts` — Added `useVerificationPipeline` hook
- `apps/web/src/features/dashboard/hooks/__tests__/useAnalytics.test.ts` — Added 2 tests
- `apps/web/src/features/dashboard/pages/AssessorQueuePage.tsx` — Reads heuristic/enumeratorId from URL params
- `apps/web/src/features/dashboard/pages/__tests__/AssessorQueuePage.test.tsx` — Added 4 drill-down tests
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — Added Analytics item for assessor
- `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` — Updated count, added 2 tests
- `apps/web/src/App.tsx` — Added lazy import + route for AssessorAnalyticsPage
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Updated story status
- `apps/api/src/services/public-insights.service.ts` — Removed unused `FrequencyBucket` import (cleanup)
- `apps/api/src/services/survey-analytics.service.ts` — Removed unused `FrequencyBucket` import (cleanup)
- `apps/api/src/services/team-quality.service.ts` — Removed unused `toBuckets` import (cleanup)
- `apps/web/src/features/dashboard/components/charts/DataQualityScorecard.tsx` — Removed unused `scoreColor`/`badgeColor` functions (cleanup)
- `apps/web/src/features/dashboard/components/charts/FieldCoverageMap.tsx` — Removed unused `CHART_COLORS` import (cleanup)
- `apps/web/src/features/dashboard/components/charts/TeamCompletionTimeChart.tsx` — Removed unused `Legend` import (cleanup)
- `apps/web/src/features/dashboard/components/charts/TeamQualityCharts.tsx` — Removed unused functions/imports (cleanup)
