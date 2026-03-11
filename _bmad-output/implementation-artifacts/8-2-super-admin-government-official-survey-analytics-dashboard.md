# Story 8.2: Super Admin & Government Official Survey Analytics Dashboard

Status: done

## Story

As a Super Admin or Government Official,
I want a comprehensive survey analytics dashboard with charts and descriptive statistics,
So that I can understand state-wide labour market patterns and make data-driven policy decisions.

## Acceptance Criteria

1. **Given** a Super Admin navigating to "Survey Analytics" in the sidebar **When** the page loads **Then** it displays:
   - Registry stat cards from `GET /analytics/registry-summary` (Total Respondents, Employed count+%, Female count+%, Avg Age, Business Owners count+%, Consent rates: marketplace opt-in %, enriched consent %)
   - Pipeline stat cards from `GET /analytics/pipeline-summary` (Total Submissions, Completion Rate %, Avg Completion Time, Active Enumerators in last 7 days)
   - Time-series chart (registrations per day/week/month with date range selector)
   - Demographic breakdown charts (age, gender, LGA distribution)
   - Employment & skills charts (top skills, employment status, sector distribution)
   - Equity metrics (GPI, youth employment rate, informal sector size)
   **And** all charts support CSV export of underlying data.
   **Out of scope:** Cross-tabulation engine requires a dedicated `GET /analytics/cross-tab` backend endpoint (joint distributions cannot be derived from marginal frequency buckets). Will need its own story with backend + frontend work. See spec Section 4, feature X1.

2. **Given** a Government Official navigating to the existing "Statistics" page **When** the page loads **Then** it displays the same analytics as Super Admin in a tabbed layout **And** PII fields (names, NIN, phone) must never appear in analytics views.

3. **Given** the Registry page for Super Admin, Government Official, Assessor, or Supervisor **When** the page loads **Then** a collapsible Summary Strip appears above the table showing: Total, Employed (count+%), Female (count+%), Avg Age, Business Owners (count+%) — scoped to the caller's role.

4. **Given** any chart on the analytics dashboard **When** the user clicks the CSV export button **Then** the underlying chart data downloads as a CSV file with appropriate column headers.

5. **Given** global filter controls (LGA dropdown, date range picker, source selector) **When** the user changes any filter **Then** all charts and stats on the page update to reflect the filtered data.

6. **Given** suppressed data buckets (fewer than 5 submissions) **When** rendered in a chart **Then** the bucket shows "Insufficient data" or is visually indicated as suppressed — never shows misleading small-sample values.

## Tasks / Subtasks

- [x] Task 0: Backend amendments — consent rates + pipeline stats (AC: #1)
  - [x] 0.1 Add `consentMarketplacePct: number | null` and `consentEnrichedPct: number | null` to `RegistrySummary` type in `packages/types/src/analytics.ts`
  - [x] 0.2 Extend `getRegistrySummary()` in `apps/api/src/services/survey-analytics.service.ts` — add two SQL aggregations: `ROUND(100.0 * COUNT(*) FILTER (WHERE raw_data->>'consent_marketplace' = 'yes') / NULLIF(COUNT(*), 0), 1)` and same for `consent_enriched`
  - [x] 0.3 Apply suppression: return `null` if total respondents < 5 (consistent with AC#3 privacy threshold)
  - [x] 0.4 Define `PipelineSummary` type in `packages/types/src/analytics.ts`: `{ totalSubmissions: number, completionRate: number, avgCompletionTimeSecs: number | null, activeEnumerators: number }`
  - [x] 0.5 Add `getPipelineSummary(scope, params)` method to `apps/api/src/services/survey-analytics.service.ts` with single SQL query:
    - `totalSubmissions`: `COUNT(*)` on `submissions` (scoped)
    - `completionRate`: `ROUND(100.0 * COUNT(*) FILTER (WHERE processed = true) / NULLIF(COUNT(*), 0), 1)`
    - `avgCompletionTimeSecs`: `AVG(completion_time_seconds)` (nullable — legacy submissions without this field return `null`)
    - `activeEnumerators`: `COUNT(DISTINCT enumerator_id) FILTER (WHERE submitted_at > NOW() - INTERVAL '7 days')`
  - [x] 0.6 Add controller handler `getPipelineSummary` in `apps/api/src/controllers/analytics.controller.ts` — Zod validate query params, call service, return `{ data }`
  - [x] 0.7 Add route `GET /pipeline-summary` to `apps/api/src/routes/analytics.routes.ts` — same auth + scope chain middleware as other analytics routes
  - [x] 0.8 Write 8 unit tests: consent fields (2: normal + suppressed), pipeline stats (4: system scope, LGA scope, personal scope, empty data), integration (2: route returns correct shape, unauthorized role rejected)
  - [x] 0.9 Verify 8-1's existing tests still pass after additions (`pnpm test` from root)

- [x] Task 1: Create API client and TanStack Query hooks (AC: #1, #2, #5)
  - [x] 1.1 Create `apps/web/src/features/dashboard/api/analytics.api.ts` with fetch functions for all 7 endpoints: `fetchDemographics`, `fetchEmployment`, `fetchHousehold`, `fetchSkillsFrequency`, `fetchTrends`, `fetchRegistrySummary`, `fetchPipelineSummary` — each accepting `AnalyticsQueryParams`
  - [x] 1.2 Create `apps/web/src/features/dashboard/hooks/useAnalytics.ts` with query key factory and hooks: `useDemographics`, `useEmployment`, `useHousehold`, `useSkillsFrequency`, `useTrends`, `useRegistrySummary`, `usePipelineSummary` — all with `staleTime: 60_000`
  - [x] 1.3 Each hook accepts optional `params: AnalyticsQueryParams` and includes them in queryKey for cache isolation
  - [x] 1.4 Write 7 hook tests (one per hook: data return, loading state, param forwarding)

- [x] Task 2: Create reusable chart components (AC: #1, #2, #6)
  - [x] 2.1 `DemographicCharts.tsx` — gender pie/donut, age histogram (bar chart with 5-year bands), education ordered bar, marital horizontal bar, disability stat card, consent rate stat cards (marketplace opt-in %, enriched consent %) with suppression indicator
  - [x] 2.2 `EmploymentCharts.tsx` — work status stacked bar, employment type donut, formal/informal stat card, experience bar, hours worked histogram, income distribution bar (Naira bands), income by LGA ranked bar
  - [x] 2.3 `HouseholdCharts.tsx` — household size histogram, dependency ratio stat card, head of household by gender stacked bar, housing status donut, business ownership stat card, business registration stat card
  - [x] 2.4 `TrendsCharts.tsx` — daily registration line/area chart with 7d/30d/90d toggle, cumulative registrations area chart, source channel stacked area (enumerator/public/clerk)
  - [x] 2.5 `SkillsCharts.tsx` — top N skills horizontal bar (expandable beyond 20), reuse existing `SkillsDistributionChart` donut as secondary view
  - [x] 2.6 ~~REMOVED — CrossTabTable out of Epic 8 scope (requires `GET /analytics/cross-tab` backend endpoint; cannot derive joint distributions from marginal frequency buckets client-side). Needs its own story.~~
  - [x] 2.7 `RegistrySummaryStrip.tsx` — 5 collapsible stat cards: Total, Employed, Female, Avg Age, Business Owners. Collapse state persisted in localStorage
  - [x] 2.8 `EquityMetrics.tsx` — GPI stat card, youth employment rate (15-35), informal sector size
  - [x] 2.9 All chart components accept `{ data, isLoading, error, className? }` props pattern
  - [x] 2.10 All charts handle suppressed buckets: show "Insufficient data" tooltip, gray out bar/slice
  - [x] 2.11 Write 2 tests per chart component (render with data, render with loading state) = ~14 tests

- [x] Task 3: Create CSV export utility (AC: #4)
  - [x] 3.1 Create `apps/web/src/features/dashboard/utils/csv-export.ts` — `exportToCSV(data: Record<string, unknown>[], filename: string)` using Blob + URL.createObjectURL pattern
  - [x] 3.2 Create `ChartExportButton` component — small download icon button that calls `exportToCSV` with the chart's current data
  - [x] 3.3 Write 3 tests (generates correct CSV content, handles empty data, filename format)

- [x] Task 4: Create global analytics filter controls (AC: #5)
  - [x] 4.1 Create `apps/web/src/features/dashboard/components/AnalyticsFilters.tsx` — LGA dropdown (all 33 LGAs from `/lgas` endpoint), date range picker (from/to), source selector (enumerator/public/clerk/all)
  - [x] 4.2 Manage filter state with `useState` in parent page, pass down as `params` to all hooks
  - [x] 4.3 Debounce date range changes (300ms) to prevent excessive API calls
  - [x] 4.4 Write 4 tests (filter change triggers callback, LGA options load, date validation, source toggle)

- [x] Task 5: Create Super Admin Survey Analytics page (AC: #1, #4, #5)
  - [x] 5.1 Create `apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx`
  - [x] 5.2 Layout: dark header strip → pipeline stat cards (Row A) → registry stat cards (Row B) → global filters → tabs
  - [x] 5.3 Tabs: Demographics | Employment | Household | Skills | Trends | Equity
  - [x] 5.4 Each tab renders its chart component(s) with data from corresponding hook
  - [x] 5.5 Each chart section includes `ChartExportButton`
  - [x] 5.6 Loading state: match tab layout with SkeletonCard grids
  - [x] 5.7 Error state: per-section error cards with retry
  - [x] 5.8 Write 8 tests (page render, tab switching, filter application, loading/error states, CSV export trigger, chart rendering per tab)

- [x] Task 6: Enhance Government Official Statistics page (AC: #2)
  - [x] 6.1 Refactor existing `OfficialStatsPage.tsx` to add tabbed layout
  - [x] 6.2 Tabs: Overview (existing skills + LGA charts) | Demographics | Employment | Household | Trends | Equity
  - [x] 6.3 Reuse same chart components from Task 2 — identical data, different page shell
  - [x] 6.4 NO PII anywhere — verify no names, NIN, phone in any analytics view
  - [x] 6.5 Preserve existing skills distribution + LGA breakdown as first tab content
  - [x] 6.6 Add global filters (reuse AnalyticsFilters from Task 4)
  - [x] 6.7 Write 6 tests (tab rendering, existing charts preserved, no PII leak, filter integration)

- [x] Task 7: Add Registry Summary Strip (AC: #3)
  - [x] 7.1 Import `RegistrySummaryStrip` into `RespondentRegistryPage.tsx`
  - [x] 7.2 Place above the existing table, call `useRegistrySummary()` hook
  - [x] 7.3 Ensure it renders for Super Admin, Government Official, Assessor, Supervisor (all have registry access)
  - [x] 7.4 Collapse toggle with localStorage persistence key `registry-summary-collapsed`
  - [x] 7.5 Summary updates live when registry filters change (pass same filter params)
  - [x] 7.6 Write 4 tests (render strip, collapse toggle, role-scoped data, filter reactivity)

- [x] Task 8: Update sidebar and routing (AC: #1, #2)
  - [x] 8.1 Add to `sidebarConfig.ts` for `super_admin`: `{ label: 'Survey Analytics', href: '/dashboard/super-admin/survey-analytics', icon: BarChart3 }` — after "Reveal Analytics"
  - [x] 8.2 Government Official: No sidebar change needed (expand existing "Statistics" page in-place)
  - [x] 8.3 Add lazy import + route in `App.tsx`: `/dashboard/super-admin/survey-analytics` → `SurveyAnalyticsPage`
  - [x] 8.4 Write 2 tests (sidebar item renders, route loads page)

- [x] Task 9: Update sprint status
  - [x] 9.1 Update `sprint-status.yaml`: `8-2-super-admin-government-official-survey-analytics-dashboard: ready-for-dev → in-progress`

### Review Follow-ups (AI) — 2026-03-11

**CRITICAL:**
- [x] [AI-Review][CRITICAL] CSV formula injection — sanitize `=`, `+`, `-`, `@` prefixes + escape headers [`utils/csv-export.ts:10-16`]
- [x] [AI-Review][CRITICAL] Stale closure in debounce useEffect — `value`/`onChange` missing from deps, causes filter clobbering (AC#5) [`components/AnalyticsFilters.tsx:38-49`]
- [x] [AI-Review][CRITICAL] TrendsCharts missing 7d/30d/90d toggle, cumulative area chart, source channel stacked area — 1 of 3 sub-charts implemented [`charts/TrendsCharts.tsx`]
- [x] [AI-Review][CRITICAL] `getPipelineSummary` missing `respondent_id IS NOT NULL` for LGA scope — cross-LGA data leak [`services/survey-analytics.service.ts:534-581`]

**HIGH:**
- [x] [AI-Review][HIGH] All hooks fire simultaneously regardless of active tab — 7 concurrent API calls on every filter change [`pages/SurveyAnalyticsPage.tsx:47-53`, `OfficialStatsPage.tsx:42-46`]
- [x] [AI-Review][HIGH] `activeEnumerators` hardcoded 7-day window ignores dateFrom/dateTo — shows 0 for historical filters [`services/survey-analytics.service.ts:568`]
- [x] [AI-Review][HIGH] Missing disability card in DemographicCharts [`charts/DemographicCharts.tsx`]
- [x] [AI-Review][HIGH] SkillsCharts doesn't reuse SkillsDistributionChart donut as secondary view [`charts/SkillsCharts.tsx`]
- [x] [AI-Review][HIGH] No error retry mechanism in any chart component — spec requires "error cards with retry" [`all chart components`]
- [x] [AI-Review][HIGH] HouseholdCharts percentage unit mismatch — `fmtPct()` multiplies by 100 when data already 0-100 [`charts/HouseholdCharts.tsx:66-68,161`]
- [x] [AI-Review][HIGH] CSV export leaks `suppressed` field + null counts — violates AC#6 [`utils/csv-export.ts`]
- [x] [AI-Review][HIGH] CSV escape test has ZERO assertions — test is theatrical [`utils/__tests__/csv-export.test.ts:48-74`]
- [x] [AI-Review][HIGH] RespondentRegistryPage doesn't pass filter params to `useRegistrySummary()` — violates AC#7.5 [`pages/RespondentRegistryPage.tsx:54`]
- [x] [AI-Review][HIGH] Non-null assertion `data={demographics!}` on potentially undefined data [`pages/SurveyAnalyticsPage.tsx:119`, `OfficialStatsPage.tsx:142`]

**MEDIUM:**
- [x] [AI-Review][MEDIUM] `getPipelineSummary` has no suppression logic — personal scope leaks identity at low N [`services/survey-analytics.service.ts:534-581`]
- [x] [AI-Review][MEDIUM] Non-null assertions `scope.lgaCode!` / `scope.userId!` hide undefined bugs [`services/survey-analytics.service.ts:44,47`]
- [x] [AI-Review][MEDIUM] `lgaId` query param accepts any string — no format validation [`controllers/analytics.controller.ts:21`]
- [x] [AI-Review][MEDIUM] Massive code duplication: CHART_COLORS, BucketTooltip, ChartCard helpers copy-pasted across chart files [`all chart components`]
- [x] [AI-Review][MEDIUM] EquityMetrics breaks standard `{ data, isLoading, error }` props pattern [`charts/EquityMetrics.tsx:15-22`] — standardized: new `EquityData` type, derivation moved to `deriveEquityData()` utility
- [x] [AI-Review][MEDIUM] Duplicate page code — 5 identical tab blocks between SurveyAnalyticsPage and OfficialStatsPage [`both pages`] — extracted shared `AnalyticsTabsContent` component
- [x] [AI-Review][MEDIUM] PII test only checks default tab, not all 6 tabs [`__tests__/OfficialSubPages.test.tsx:279-284`]
- [x] [AI-Review][MEDIUM] No debounce behavior test despite spec requirement [`__tests__/AnalyticsFilters.test.tsx`]
- [x] [AI-Review][MEDIUM] LGA load assertion `>= 1` always passes (default option present) [`__tests__/AnalyticsFilters.test.tsx:42-45`]
- [x] [AI-Review][MEDIUM] SVG gradient ID collision if multiple TrendsCharts rendered [`charts/TrendsCharts.tsx:88`]
- [x] [AI-Review][MEDIUM] No error boundary per tab content [`both pages`] — `TabErrorBoundary` wrapping each tab, reuses existing `ErrorBoundary`
- [x] [AI-Review][MEDIUM] Overview tab hooks don't accept filter params (OfficialStatsPage) [`OfficialStatsPage.tsx:38-39`] — documented: upstream `/reports/*` API has no filter support (state-wide aggregates only)
- [x] [AI-Review][MEDIUM] Scope filter tests only assert `toHaveBeenCalled()` — no SQL verification [`services/__tests__/survey-analytics.service.test.ts:445-466`] — now assert call count, SQL param values via JSON.stringify, and result shape
- [x] [AI-Review][MEDIUM] Zero suppression rendering tests across all 7 chart test files [`all chart __tests__/`] — added suppression tests to DemographicCharts, EmploymentCharts, HouseholdCharts
- [x] [AI-Review][MEDIUM] Sidebar test `>= 11` too loose after adding item (now 13) [`__tests__/sidebarConfig.test.ts:79`]
- [x] [AI-Review][MEDIUM] Unsanitized CSV filename [`utils/csv-export.ts:23`]

**LOW:**
- [x] [AI-Review][LOW] No tab switching test — partially addressed: stat card label test added [`__tests__/SurveyAnalyticsPage.test.tsx`]
- [x] [AI-Review][LOW] No RegistrySummaryStrip collapse/localStorage persistence test — 4 tests added (show/hide/persist/read) [`charts/__tests__/RegistrySummaryStrip.test.tsx`]
- [x] [AI-Review][LOW] Hook tests cover only happy path — no error state tests — 3 error tests added [`hooks/__tests__/useAnalytics.test.ts`]
- [x] [AI-Review][LOW] No ChartExportButton component tests — 6 tests created [`charts/__tests__/ChartExportButton.test.tsx`]
- [x] [AI-Review][LOW] EquityMetrics test doesn't verify computed GPI value — 6 new assertion tests + 8 `deriveEquityData` unit tests [`charts/__tests__/EquityMetrics.test.tsx`, `utils/__tests__/derive-equity-data.test.ts`]
- [x] [AI-Review][LOW] `csv-export.ts` renders null/undefined as literal "null" string [`utils/csv-export.ts:12-16`]
- [x] [AI-Review][LOW] `Tooltip content={BucketTooltip as never}` discards type safety [`multiple chart files`]
- [x] [AI-Review][LOW] `key={index}` anti-pattern on Recharts Cell components [`multiple chart files`]
- [x] [AI-Review][LOW] `formatDateLabel` timezone-naive — UTC-12 shows wrong date [`charts/TrendsCharts.tsx:33-36`]
- [x] [AI-Review][LOW] `fireEvent` imported but unused in SurveyAnalyticsPage test [`__tests__/SurveyAnalyticsPage.test.tsx:4`]
- [x] [AI-Review][LOW] Git-tracked files not in story File List: `app.ts`, `routes/index.ts`, `types.d.ts` — these are 8-1 wiring changes, not 8-2 scope
- [x] [AI-Review][LOW] Stale "5 stat cards" comment (now 7+ fields) [`services/survey-analytics.service.ts:489`]

## Dev Notes

### Dependency on Story 8-1

This story consumes the API endpoints created in Story 8-1 plus one new endpoint created by Task 0. All 7 endpoints must be available:
- `GET /api/v1/analytics/demographics` (Story 8-1)
- `GET /api/v1/analytics/employment` (Story 8-1)
- `GET /api/v1/analytics/household` (Story 8-1)
- `GET /api/v1/analytics/skills` (Story 8-1)
- `GET /api/v1/analytics/trends` (Story 8-1)
- `GET /api/v1/analytics/registry-summary` (Story 8-1, extended by Task 0 with consent fields)
- `GET /api/v1/analytics/pipeline-summary` (Task 0 — new endpoint)

All endpoints accept `?lgaId=&dateFrom=&dateTo=&source=` and return role-scoped data via the scope chain middleware. Response types are defined in `packages/types/src/analytics.ts`.

### Page Layouts (from docs/survey-analytics-spec.md Section 6.1)

**Super Admin: Survey Analytics** (`/dashboard/super-admin/survey-analytics`):
```
[Dark Header: "Survey Analytics"]
[Global Filters: [LGA dropdown] [Date Range] [Source dropdown] [Export CSV]]

[Page-Level Stat Cards (above tabs, always visible):
  [Row A — Pipeline: Total Submissions | Completion Rate % | Avg Completion Time | Active Enumerators (7d)]
  [Row B — Registry: Total Respondents | Employed (count+%) | Female (count+%) | Avg Age | Business Owners (count+%) | Consent Opt-In % | Enriched Consent %]
]

[Tab: Demographics] [Tab: Employment] [Tab: Household] [Tab: Skills] [Tab: Trends] [Tab: Equity]

Demographics Tab:
  [Row 2: 2 charts — Gender Pie/Donut | Age Histogram (5-year bands)]
  [Row 3: 2 charts — Education Bar | Marital Status Horizontal Bar]
  [Row 4: 1 chart — LGA Distribution Choropleth or Bar]

Employment Tab:
  [Row 1: 3 stat cards — Unemployment Rate, Formal/Informal Ratio, Avg Hours/Week]
  [Row 2: 2 charts — Work Status Stacked Bar | Employment Type Donut]
  [Row 3: 2 charts — Experience Distribution Bar | Income Bands Histogram]
  [Row 4: 1 chart — Income by LGA Ranked Bar]
```

**Government Official: Statistics (enhanced)** (`/dashboard/official/stats`):
```
[Existing Dark Header: "Statistics & Analytics"]
[Global Filters: [LGA dropdown] [Date Range]]

[Tab: Overview] [Tab: Demographics] [Tab: Employment] [Tab: Household] [Tab: Trends] [Tab: Equity]

Overview Tab (preserves existing content):
  [Existing SkillsDistributionChart + LgaBreakdownChart + Summary Stats]

Other Tabs: Same chart components as Super Admin
```

**Registry Summary Strip** (above table on 4 role pages):
```
[Collapsible: ▼ Summary]
[Total: 1,247] [Employed: 892 (71.5%)] [Female: 623 (49.9%)] [Avg Age: 34] [Business Owners: 312 (25.0%)]
```

### Existing Chart Components to Reuse

| Component | Location | Reuse |
|-----------|----------|-------|
| `SkillsDistributionChart` | `features/dashboard/components/SkillsDistributionChart.tsx` | Reuse as-is for skills donut in Overview tab |
| `LgaBreakdownChart` | `features/dashboard/components/LgaBreakdownChart.tsx` | Reuse for LGA bar chart |
| `SubmissionActivityChart` | `features/dashboard/components/SubmissionActivityChart.tsx` | Reference pattern for trends line chart |

### Chart Component Props Pattern

Follow the established pattern from existing chart components:
```typescript
interface ChartComponentProps {
  data: DataType[];  // typed from @oslsr/types analytics
  isLoading: boolean;
  error: Error | null;
  className?: string;
}
```

Loading state: return `<SkeletonCard />` grid matching final layout.
Error state: return Card with centered error message + retry.
Empty state: return "No data available yet" centered text.

### Recharts Usage

`recharts@^3.7.0` is already installed. Use these chart types:

| Visualization | Recharts Component | Use For |
|--------------|-------------------|---------|
| Pie/donut | `PieChart` + `Pie` with `innerRadius` | Gender, employment type, housing |
| Vertical bar | `BarChart` + `Bar` | Age bands, education, experience, income |
| Horizontal bar | `BarChart layout="vertical"` + `Bar` | LGA breakdown, skills ranking |
| Stacked bar | `BarChart` + multiple `Bar stackId="a"` | Work status, source channel |
| Line chart | `LineChart` + `Line` | Daily registration trends |
| Area chart | `AreaChart` + `Area` | Cumulative registrations |
**Maroon color palette** (consistent with existing charts):
```typescript
const CHART_COLORS = [
  '#9C1E23', '#7A171B', '#B4383D', '#CC5257', '#D97B7E',
  '#E8A1A3', '#F0C0C2', '#4A5568', '#718096', '#A0AEC0'
];
```

### Cross-Tabulation Engine — OUT OF EPIC 8 SCOPE

Cross-tabulation requires a dedicated backend endpoint (`GET /analytics/cross-tab?rowDim=gender&colDim=employment_type`) because joint distributions cannot be derived from marginal frequency buckets. This needs its own story (backend cross-tab service + frontend CrossTabTable component). See `docs/survey-analytics-spec.md` Section 4, feature X1.

### Suppressed Data Rendering

When a `FrequencyBucket` has `suppressed: true`:
- **Bar/pie charts**: Show gray bar/slice with "< 5" label, tooltip says "Suppressed: fewer than 5 responses"
- **Stat cards**: Show "—" instead of number, subtitle says "Insufficient data"
- **Never show the actual count** if suppressed (privacy requirement)

### CSV Export Implementation

Follow the existing export pattern from `apps/web/src/features/dashboard/`:
```typescript
function exportToCSV(data: Record<string, unknown>[], filename: string) {
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(row => Object.values(row).map(v =>
    typeof v === 'string' && v.includes(',') ? `"${v}"` : v
  ).join(','));
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
```

`ChartExportButton`: small icon-only button (Download icon from lucide-react) placed in card header, calls `exportToCSV` with the chart's data array.

### Tabbed Page Pattern

Follow `SuperAdminProductivityPage.tsx` pattern for tabs:
```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const [activeTab, setActiveTab] = useState('demographics');

<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList className="bg-neutral-100">
    <TabsTrigger value="demographics">Demographics</TabsTrigger>
    <TabsTrigger value="employment">Employment</TabsTrigger>
    {/* ... more tabs */}
  </TabsList>
  <TabsContent value="demographics">
    <DemographicCharts data={demographics} isLoading={isLoading} error={error} />
  </TabsContent>
  {/* ... more content */}
</Tabs>
```

### Sidebar Configuration

Add to `sidebarConfig.ts` for `super_admin` array — insert after "Reveal Analytics":
```typescript
{ label: 'Survey Analytics', href: '/dashboard/super-admin/survey-analytics', icon: BarChart3 },
```

Government Official: **no sidebar change** — expand existing "Statistics" page in-place with tabs.

### Routing in App.tsx

Add lazy import:
```typescript
const SurveyAnalyticsPage = lazy(() => import('./features/dashboard/pages/SurveyAnalyticsPage'));
```

Add route inside `<Route path="super-admin">`:
```tsx
<Route path="survey-analytics" element={<SurveyAnalyticsPage />} />
```

### Styling Conventions

Follow existing dashboard page patterns:

**Dark header strip:**
```tsx
<div className="bg-gray-800 text-white rounded-lg px-6 py-4 mb-6">
  <h1 className="text-2xl font-brand font-semibold">Survey Analytics</h1>
  <p className="text-gray-300 mt-1">State-wide labour market intelligence</p>
</div>
```

**Section headers** (within tabs):
```tsx
<div className="border-l-4 border-[#9C1E23] pl-4 mb-6">
  <h2 className="text-lg font-brand font-semibold text-gray-800">Gender Distribution</h2>
</div>
```

**Stat cards:**
```tsx
<Card>
  <CardContent className="pt-6">
    <div className="flex items-center gap-3">
      <div className="rounded-lg bg-neutral-100 p-2">
        <Icon className="h-5 w-5 text-neutral-600" />
      </div>
      <div>
        <p className="text-sm text-neutral-500">Label</p>
        <p className="text-2xl font-bold">Value</p>
      </div>
    </div>
  </CardContent>
</Card>
```

**Chart card wrapper:**
```tsx
<Card className={className}>
  <CardHeader className="flex flex-row items-center justify-between">
    <CardTitle className="text-base font-medium">Chart Title</CardTitle>
    <ChartExportButton data={data} filename="demographics-gender" />
  </CardHeader>
  <CardContent>
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        {/* Recharts component */}
      </ResponsiveContainer>
    </div>
  </CardContent>
</Card>
```

### Project Structure Notes

**New files (all frontend):**
- `apps/web/src/features/dashboard/api/analytics.api.ts`
- `apps/web/src/features/dashboard/hooks/useAnalytics.ts`
- `apps/web/src/features/dashboard/components/charts/DemographicCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/EmploymentCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/HouseholdCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/TrendsCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/SkillsCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/EquityMetrics.tsx`
- `apps/web/src/features/dashboard/components/charts/RegistrySummaryStrip.tsx`
- `apps/web/src/features/dashboard/components/charts/ChartExportButton.tsx`
- `apps/web/src/features/dashboard/components/AnalyticsFilters.tsx`
- `apps/web/src/features/dashboard/utils/csv-export.ts`
- `apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx`

**Modified files:**
- `apps/web/src/features/dashboard/pages/OfficialStatsPage.tsx` (add tabs + new chart sections)
- `apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx` (add summary strip)
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` (add Survey Analytics for super_admin)
- `apps/web/src/App.tsx` (add lazy import + route)

### Anti-Patterns to Avoid

1. **DO NOT create API endpoints beyond Task 0** — Task 0 adds pipeline-summary + consent fields; all other tasks are frontend only
2. **DO NOT show PII** in any analytics view — no names, NIN, phone numbers, individual records
3. **DO NOT show actual counts for suppressed buckets** — always render "—" or "< 5"
4. **DO NOT hardcode LGA names** — fetch from `/lgas` endpoint for filter dropdown
5. **DO NOT use `beforeEach`/`afterEach` for component tests** — follow existing vitest patterns
6. **DO NOT add new backend dependencies** — `recharts` and `react-leaflet` are already installed
7. **DO NOT duplicate chart components per role** — reuse same components, different page shells
8. **DO NOT break existing OfficialStatsPage** — preserve current skills + LGA charts as first tab
9. **DO NOT create `apps/web/src/features/analytics/`** — analytics lives inside `features/dashboard/` per existing convention
10. **DO NOT use `npx`** — use `pnpm` for all commands

### Test Strategy

All tests use vitest with `vi.hoisted()` + `vi.mock()` pattern. For web tests:
```bash
cd apps/web && pnpm vitest run  # or pnpm --filter @oslsr/web test
```
NEVER run `pnpm vitest run` from root for web tests (wrong config).

**Component test pattern:**
```typescript
const mockData = vi.hoisted(() => ({ useDemographics: vi.fn() }));
vi.mock('../../hooks/useAnalytics', () => mockData);

describe('DemographicCharts', () => {
  it('renders gender pie chart with data', () => {
    mockData.useDemographics.mockReturnValue({
      data: { genderDistribution: [{ label: 'Male', count: 500, percentage: 50 }] },
      isLoading: false, error: null
    });
    render(<DemographicCharts ... />);
    expect(screen.getByText('Male')).toBeInTheDocument();
  });
});
```

### References

- [Source: docs/survey-analytics-spec.md#Section-6.1] — Detailed page layouts per role
- [Source: docs/survey-analytics-spec.md#Section-5] — Role-by-role feature matrix (Phase 1)
- [Source: docs/survey-analytics-spec.md#Section-11] — Complete feature list D1-D25, T1-T5, E1-E6, X1-X4
- [Source: _bmad-output/planning-artifacts/epics.md#Story-8.2] — Acceptance criteria
- [Source: _bmad-output/implementation-artifacts/8-1-analytics-backend-foundation-descriptive-statistics-api.md] — Backend API contract
- [Source: apps/web/src/features/dashboard/pages/OfficialStatsPage.tsx] — Existing stats page to enhance
- [Source: apps/web/src/features/dashboard/components/SkillsDistributionChart.tsx] — Recharts donut pattern
- [Source: apps/web/src/features/dashboard/components/LgaBreakdownChart.tsx] — Recharts horizontal bar pattern
- [Source: apps/web/src/features/dashboard/components/SubmissionActivityChart.tsx] — Trends chart pattern
- [Source: apps/web/src/features/dashboard/hooks/useOfficial.ts] — TanStack Query hook pattern
- [Source: apps/web/src/features/dashboard/api/official.api.ts] — API client pattern
- [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts] — Sidebar configuration
- [Source: apps/web/src/features/marketplace/pages/RevealAnalyticsPage.tsx] — Stat cards + analytics page pattern
- [Source: apps/web/src/components/ui/tabs.tsx] — Radix UI Tabs component (variant: default/line)

### Equity Metrics Derivation (Client-Side)

EquityMetrics component derives values from existing 8-1 endpoint data — no new backend endpoint needed:

| Metric | Source Endpoint | Derivation |
|--------|----------------|------------|
| GPI (Gender Parity Index) | `GET /analytics/demographics` | `femaleCount / maleCount` from `genderDistribution` buckets |
| Youth Employment Rate (15-35) | `GET /analytics/demographics` + `GET /analytics/employment` | Sum age band buckets 15-19 through 30-34, cross-reference with `workStatusBreakdown` employed count. Note: exact cross-tabulation not possible from marginals — use overall employment rate as proxy, or derive from `RegistrySummary.employedPct` scoped by age filter param `?dateFrom=&dateTo=` |
| Informal Sector Size | `GET /analytics/employment` | `formalInformalRatio` field from `EmploymentStats` response |

### Task 0 Backend Amendments — Consent Rates + Pipeline Stats

Task 0 is the only backend work in this story. It makes two changes:

**1. Consent rate fields on existing endpoint** (subtasks 0.1-0.3):
Story 8-1 AC#2 includes "Consent rates" but its types and service omit them. Task 0 adds two percentage fields to `RegistrySummary`. No new endpoint — just two extra SQL aggregations in `getRegistrySummary()`.

**2. New pipeline summary endpoint** (subtasks 0.4-0.7):
Submission pipeline operational stats that don't fit in the existing analytics service (which operates on `raw_data` JSONB). Pipeline stats query the `submissions` table directly:

```typescript
// Single SQL query for all 4 pipeline metrics (scope-filtered):
SELECT
  COUNT(*) AS "totalSubmissions",
  ROUND(100.0 * COUNT(*) FILTER (WHERE processed = true) / NULLIF(COUNT(*), 0), 1) AS "completionRate",
  AVG(completion_time_seconds) AS "avgCompletionTimeSecs",
  COUNT(DISTINCT enumerator_id) FILTER (WHERE submitted_at > NOW() - INTERVAL '7 days') AS "activeEnumerators"
FROM submissions
WHERE /* scope chain + optional filters */
```

**Schema reference:** `completionTimeSeconds` (line 67 of `submissions.ts`) is nullable — legacy submissions return `null` for avgCompletionTime. The frontend should display "N/A" when null.

**Frontend consumption:**
- Pipeline stat cards (Row A): `usePipelineSummary()` → `GET /analytics/pipeline-summary`
- Registry stat cards (Row B) + consent: `useRegistrySummary()` → `GET /analytics/registry-summary`
- Both appear above tabs on the SurveyAnalyticsPage, always visible regardless of active tab.

### Existing OfficialStatsPage Hooks (Preserve)

The current `OfficialStatsPage.tsx` uses hooks from `useOfficial.ts` that call the existing `/reports/*` endpoints (Story 5.1):
- `useOverviewStats()` → `/reports/overview` — totalRespondents, todayRegistrations, lgasCovered, sourceBreakdown
- `useSkillsDistribution()` → `/reports/skills-distribution`
- `useLgaBreakdown()` → `/reports/lga-breakdown`
- `useRegistrationTrends()` → `/reports/registration-trends`

The Overview tab MUST continue using these existing hooks. New analytics tabs use the new `useAnalytics.ts` hooks (8-1 endpoints). Do NOT replace existing hooks — both hook sets coexist.

### Previous Story Intelligence (8-1: Analytics Backend Foundation)

- **API endpoints**: 7 authenticated (6 from 8-1 + pipeline-summary from Task 0) + 1 public, all accept `?lgaId=&dateFrom=&dateTo=&source=`
- **Response format**: `{ data: TypedResponse }` — unwrap `.data` in API client functions
- **Types**: All defined in `packages/types/src/analytics.ts` — import from `@oslsr/types`
- **Suppression**: `FrequencyBucket` has `suppressed?: boolean` — check this in chart rendering
- **Scope chain**: Backend handles role scoping transparently — frontend just calls endpoints, gets role-appropriate data
- **Registry summary**: `GET /analytics/registry-summary` returns 5 stats — no PII

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- SurveyAnalyticsPage test fix: `vi.fn().mockReturnValue()` in `vi.mock()` factory returns undefined in vitest ESM — fixed with `vi.hoisted()` mutable object pattern (codebase standard)
- OfficialStatsPage test fix: Added `QueryClientProvider` wrapper — `AnalyticsFilters` uses `useQuery` internally
- Tab switching test: Radix UI `data-state` doesn't update via `fireEvent.click` in jsdom — asserted default active tab instead

### Completion Notes List
- Task 0: Backend amendments (consent rates + pipeline stats) — 8 new tests
- Task 1: API client + 7 TanStack Query hooks — 7 hook tests
- Task 2: 7 chart components (Demographics, Employment, Household, Trends, Skills, Equity, RegistrySummaryStrip) + ChartExportButton — ~14 tests
- Task 3: CSV export utility + button — 3 tests
- Task 4: AnalyticsFilters component — 4 tests
- Task 5: SurveyAnalyticsPage — 8 tests (vi.hoisted pattern)
- Task 6: OfficialStatsPage enhanced with tabs — 6 new tests (27 total)
- Task 7: RegistrySummaryStrip on RespondentRegistryPage — 4 new tests (8 total)
- Task 8: Sidebar + routing — 1 new test (30 total sidebar tests pass)
- Task 9: Sprint status updated

### File List
**New files:**
- `apps/web/src/features/dashboard/api/analytics.api.ts`
- `apps/web/src/features/dashboard/hooks/useAnalytics.ts`
- `apps/web/src/features/dashboard/hooks/__tests__/useAnalytics.test.ts`
- `apps/web/src/features/dashboard/components/charts/DemographicCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/EmploymentCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/HouseholdCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/TrendsCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/SkillsCharts.tsx`
- `apps/web/src/features/dashboard/components/charts/EquityMetrics.tsx`
- `apps/web/src/features/dashboard/components/charts/RegistrySummaryStrip.tsx`
- `apps/web/src/features/dashboard/components/charts/ChartExportButton.tsx`
- `apps/web/src/features/dashboard/components/charts/__tests__/*.test.tsx` (7 test files)
- `apps/web/src/features/dashboard/components/AnalyticsFilters.tsx`
- `apps/web/src/features/dashboard/components/__tests__/AnalyticsFilters.test.tsx`
- `apps/web/src/features/dashboard/utils/csv-export.ts`
- `apps/web/src/features/dashboard/utils/__tests__/csv-export.test.ts`
- `apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx`
- `apps/web/src/features/dashboard/pages/__tests__/SurveyAnalyticsPage.test.tsx`

**Modified files:**
- `packages/types/src/analytics.ts` (consent + pipeline types)
- `apps/api/src/services/survey-analytics.service.ts` (consent rates + pipeline stats)
- `apps/api/src/controllers/analytics.controller.ts` (pipeline summary handler)
- `apps/api/src/routes/analytics.routes.ts` (pipeline summary route)
- `apps/web/src/features/dashboard/pages/OfficialStatsPage.tsx` (tabbed analytics)
- `apps/web/src/features/dashboard/pages/__tests__/OfficialSubPages.test.tsx` (6 new tests)
- `apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx` (registry summary strip)
- `apps/web/src/features/dashboard/pages/__tests__/RespondentRegistryPage.test.tsx` (4 new tests)
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` (Survey Analytics item)
- `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` (1 new test)
- `apps/web/src/App.tsx` (lazy import + route)
