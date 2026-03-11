# Story 8.5: Public Insights Page — Anonymized Labour Market Intelligence

Status: ready-for-dev

## Story

As an unauthenticated visitor (citizen, policymaker, journalist, researcher),
I want a public-facing Insights page displaying anonymized labour market statistics for Oyo State,
So that I can understand workforce composition, skills distribution, and employment patterns without requiring a login.

## Acceptance Criteria

1. **Given** a visitor navigates to `/insights` **When** the page loads **Then** it displays a hero section ("Oyo State Labour Force at a Glance") with animated counter stat cards: total registered, LGAs covered, gender parity index, youth employment rate.

2. **Given** the public insights API returns data **When** the page renders **Then** it displays 4 content sections:
   - **Demographics**: gender split pie/donut chart, age distribution bar chart
   - **Employment Landscape**: employment status donut, formal vs informal stat card, unemployment estimate with percentage
   - **Skills & Training**: top 10 skills horizontal bar chart
   - **Geographic Distribution**: LGA density table (top LGAs by registration count)

3. **Given** the Insights navbar dropdown currently shows "Coming Soon" placeholders **When** Story 8-5 is complete **Then** the dropdown items link to real routes:
   - "Labour Force Overview" → `/insights` (this story)
   - "Skills Map" → `/insights/skills` (this story — expanded skills view)
   - "Trends" → `/insights/trends` (this story — registration trend line)
   - "Reports" → `/insights/reports` (Coming Soon — PDF report exports have no story yet, placeholder link only)

4. **Given** the `/insights/skills` sub-page **When** it loads **Then** it displays: all skills bar chart (not just top 10), skills grouped by ISCO-08 category, and a skills gap visualization (have vs want-to-learn diverging bar) using `allSkills` and `desiredSkills` from the public insights API.

5. **Given** the `/insights/trends` sub-page **When** it loads **Then** it displays: cumulative registration curve (area chart), and employment type breakdown over time. **Note**: This sub-page requires a new public endpoint `GET /api/v1/public/insights/trends` returning daily registration counts — implement as a backend task.

6. **Given** any public insights page **When** it loads **Then** a "Methodology & Trust" footer section displays: sample size (N=totalRegistered), data collection method, update frequency ("Data refreshed hourly"), and last-updated badge.

7. **Given** a mobile device (< 768px) **When** the user visits any Insights page **Then** all charts and stat cards stack vertically, text remains readable, and the page is fully responsive.

8. **Given** the public insights API returns suppressed buckets (count < 10) **When** the charts render **Then** suppressed buckets are excluded from visualizations (not shown as zero).

9. **Given** SEO requirements **When** the page renders **Then** it sets a descriptive document title via `useDocumentTitle` (e.g., `useDocumentTitle('Labour Market Insights')` — the hook auto-appends `| OSLSR - Oyo State Labour & Skills Registry`) and uses semantic HTML headings.

10. **Given** the backend trends endpoint `GET /api/v1/public/insights/trends` **When** called **Then** it returns daily registration counts for the last 90 days, cached for 1 hour, rate-limited, no filters accepted, with minN=10 suppression.

## Tasks / Subtasks

### Backend

- [ ] Task 0: Return all skills + desired skills from public insights endpoint (AC: #4)
  - [ ] 0.1 In `apps/api/src/services/public-insights.service.ts`, remove `LIMIT 10` from the skills query (line ~154) so all skills above suppression threshold are returned
  - [ ] 0.2 Add a new parallel query for `training_interest` (want-to-learn skills) using the same `unnest(string_to_array(...))` pattern:
    ```sql
    SELECT skill, COUNT(*) AS count
    FROM submissions s
    LEFT JOIN respondents r ON r.id = s.respondent_id,
         unnest(string_to_array(s.raw_data->>'training_interest', ' ')) AS skill
    WHERE s.raw_data IS NOT NULL AND s.respondent_id IS NOT NULL
      AND s.raw_data->>'training_interest' IS NOT NULL
      AND s.raw_data->>'training_interest' != ''
    GROUP BY skill
    ORDER BY count DESC
    ```
  - [ ] 0.3 Add `desiredSkills: SkillsFrequency[]` to `PublicInsightsData` in `packages/types/src/analytics.ts` — same shape as `topSkills`, with PUBLIC_MIN_N suppression
  - [ ] 0.4 Rename `topSkills` field to `allSkills` in `PublicInsightsData` type and service return value (all skills returned, no LIMIT). Update `packages/types/src/index.ts` export if needed.
  - [ ] 0.5 Write 3 additional backend tests: returns all skills (not just 10), desiredSkills populated from `training_interest`, suppression applied to both arrays
  - **IMPORTANT**: The survey form field is `training_interest` (NOT `skills_desired` or `skills_wanted`). Confirmed in `scripts/generate-xlsform.cjs:62` and `docs/questionnaire_schema.md:64`.

- [ ] Task 1: Add trends endpoint to public insights backend (AC: #5, #10)
  - [ ] 1.1 Add `getTrends()` method to `PublicInsightsService` in `apps/api/src/services/public-insights.service.ts`:
    ```sql
    SELECT DATE(s.created_at AT TIME ZONE 'Africa/Lagos') AS date,
           COUNT(*) AS count
    FROM submissions s
    WHERE s.raw_data IS NOT NULL
      AND s.respondent_id IS NOT NULL
      AND s.created_at >= NOW() - INTERVAL '90 days'
    GROUP BY date
    ORDER BY date ASC
    ```
  - [ ] 1.2 Apply suppression: days with count < 10 return `null` count (consistent with PUBLIC_MIN_N=10)
  - [ ] 1.3 Cache result in Redis with key `analytics:public:trends`, TTL 3600s (same as insights)
  - [ ] 1.4 Define `PublicTrendDataPoint` type in `packages/types/src/analytics.ts`: `{ date: string; count: number | null }`
  - [ ] 1.5 Define `PublicTrendsData` type: `{ dailyRegistrations: PublicTrendDataPoint[]; totalDays: number }`
  - [ ] 1.6 Export new types from `packages/types/src/index.ts`

- [ ] Task 2: Add trends route to `apps/api/src/routes/public-insights.routes.ts` (AC: #10)
  - [ ] 2.1 Add `GET /trends` route with same rate limiter as the main `/` endpoint
  - [ ] 2.2 Create `getTrends` handler in `apps/api/src/controllers/public-insights.controller.ts`
  - [ ] 2.3 Write 5 backend tests: 200 response shape, empty data, suppression of small days, rate limiting, cache hit/miss

### Frontend — Feature Scaffold

- [ ] Task 3: Create insights feature module (AC: #1, #2, #9)
  - [ ] 3.1 Create `apps/web/src/features/insights/` directory structure:
    ```
    features/insights/
      api/publicInsights.api.ts
      hooks/usePublicInsights.ts
      pages/PublicInsightsPage.tsx
      pages/SkillsMapPage.tsx
      pages/TrendsPage.tsx
      components/
        LabourForceOverview.tsx
        PublicDemographicsSection.tsx
        PublicEmploymentSection.tsx
        PublicSkillsChart.tsx
        PublicLgaTable.tsx
        MethodologyNote.tsx
        AnimatedCounter.tsx
        StatCard.tsx
        SkillsGapChart.tsx
    ```
  - [ ] 3.2 Create `publicInsights.api.ts` — fetch from `/public/insights` and `/public/insights/trends` using `apiClient` WITHOUT auth headers:
    ```ts
    import { apiClient } from '../../../lib/api-client';
    import type { PublicInsightsData, PublicTrendsData } from '@oslsr/types';

    const PUBLIC_BASE = '/public/insights';

    export async function fetchPublicInsights(): Promise<PublicInsightsData> {
      const res = await apiClient(PUBLIC_BASE);
      return res.data;
    }

    export async function fetchPublicTrends(): Promise<PublicTrendsData> {
      const res = await apiClient(`${PUBLIC_BASE}/trends`);
      return res.data;
    }
    ```
    **VERIFIED**: `apiClient` works without auth token. `getAuthHeaders()` in `api-client.ts:26-29` returns `{}` when no token exists in sessionStorage — no Authorization header is sent. Marketplace already uses this pattern for unauthenticated requests (`/marketplace/search`, `/marketplace/profiles/:id`). No need for a separate `publicApiClient`.
  - [ ] 3.3 Create `usePublicInsights.ts` — TanStack Query hooks:
    ```ts
    export function usePublicInsights() {
      return useQuery({
        queryKey: ['public', 'insights'],
        queryFn: fetchPublicInsights,
        staleTime: 5 * 60 * 1000, // 5 min client-side (server caches 1hr)
      });
    }

    export function usePublicTrends() {
      return useQuery({
        queryKey: ['public', 'insights', 'trends'],
        queryFn: fetchPublicTrends,
        staleTime: 5 * 60 * 1000,
      });
    }
    ```

### Frontend — Main Insights Page

- [ ] Task 4: Create `AnimatedCounter` component (AC: #1)
  - [ ] 4.1 Implement CSS-only counter animation using `requestAnimationFrame` — count from 0 to target value over ~1.5s with easing. No external animation library.
  - [ ] 4.2 Accept props: `value: number`, `duration?: number`, `prefix?: string`, `suffix?: string`
  - [ ] 4.3 Format large numbers with locale separators (e.g., 1,234)
  - [ ] 4.4 Write 3 component tests: renders final value, renders prefix/suffix, handles zero

- [ ] Task 5: Create `StatCard` component (AC: #1)
  - [ ] 5.1 Card with icon, label, `AnimatedCounter` value, optional subtitle
  - [ ] 5.2 Use existing shadcn Card component
  - [ ] 5.3 Responsive: 2-column grid on mobile, 4-column on desktop
  - [ ] 5.4 Write 2 component tests: renders label + value, renders optional subtitle

- [ ] Task 6: Create `PublicInsightsPage` (AC: #1, #2, #6, #7, #9)
  - [ ] 6.1 Hero section: maroon gradient background, white text, "Oyo State Labour Force at a Glance" heading, 4 `StatCard` components (totalRegistered, lgasCovered, GPI, youthEmploymentRate)
  - [ ] 6.2 Demographics section: `PublicDemographicsSection` — gender pie chart (recharts PieChart), age bar chart (recharts BarChart)
  - [ ] 6.3 Employment section: `PublicEmploymentSection` — employment status donut (PieChart with inner radius), formal/informal stat cards, unemployment estimate card
  - [ ] 6.4 Skills section: `PublicSkillsChart` — top 10 skills horizontal BarChart (slice `allSkills.slice(0, 10)` client-side), "View all skills →" link to `/insights/skills`
  - [ ] 6.5 Geographic section: `PublicLgaTable` — sortable table of LGAs by registration count (top 10, expandable). No map — LGA choropleth out of scope (requires GeoJSON boundary files not yet available; can be added as a future enhancement when boundary data is sourced).
  - [ ] 6.6 Methodology section: `MethodologyNote` — sample size, collection method, hourly refresh, data suppression notice
  - [ ] 6.7 Set `useDocumentTitle('Labour Market Insights')` (hook auto-appends base title suffix — do NOT include "OSLRS" in the argument)
  - [ ] 6.8 Handle loading state with content-shaped skeletons (not spinner)
  - [ ] 6.9 Handle error state with retry button
  - [ ] 6.10 Filter out suppressed buckets (where `suppressed === true` or `count === null`) before passing to charts
  - [ ] 6.11 Write 8 component tests: renders hero stats, renders charts, handles loading, handles error, handles suppressed data, responsive layout, document title, methodology section

### Frontend — Sub-Pages

- [ ] Task 7: Create `SkillsMapPage` at `/insights/skills` (AC: #4)
  - [ ] 7.1 Full skills horizontal bar chart (all skills from `allSkills` — backend now returns complete list, no LIMIT 10)
  - [ ] 7.2 Skills grouped by ISCO-08 category (if category metadata available from spec, else flat list with category labels)
  - [ ] 7.3 Skills gap diverging bar chart: left bars = `allSkills` (have), right bars = `desiredSkills` (want-to-learn). Match skills by name. Use diverging horizontal bar pattern (green for have, amber for want). If `desiredSkills` is empty, show "No training interest data yet" placeholder instead of broken chart.
  - [ ] 7.4 Set `useDocumentTitle('Skills Distribution')`
  - [ ] 7.5 Back link to `/insights`
  - [ ] 7.6 Reuse `usePublicInsights()` hook (same data, different visualization)
  - [ ] 7.7 Write 6 component tests: renders all skills, loading state, error state, back navigation, skills gap chart renders, empty desiredSkills placeholder

- [ ] Task 8: Create `TrendsPage` at `/insights/trends` (AC: #5)
  - [ ] 8.1 Cumulative registration area chart (recharts AreaChart) from `dailyRegistrations`
  - [ ] 8.2 Compute cumulative sum client-side from daily counts
  - [ ] 8.3 Set `useDocumentTitle('Registration Trends')`
  - [ ] 8.4 Back link to `/insights`
  - [ ] 8.5 Handle suppressed days (null count) by interpolating or showing gap
  - [ ] 8.6 Write 4 component tests: renders chart, loading state, cumulative computation, suppressed days

### Frontend — Routing & Navigation

- [ ] Task 9: Update navbar to link to real Insights routes (AC: #3)
  - [ ] 9.1 In `apps/web/src/layouts/components/NavDropdown.tsx`, update `insightsItems` array:
    ```ts
    const insightsItems = [
      { label: 'Labour Force Overview', description: 'Key workforce statistics at a glance', href: '/insights' },
      { label: 'Skills Map', description: 'Geographic distribution of skills', href: '/insights/skills' },
      { label: 'Trends', description: 'Registration and employment trends', href: '/insights/trends' },
      { label: 'Reports', description: 'Detailed statistical reports', comingSoon: true },
    ];
    ```
  - [ ] 9.2 Update the rendering logic to use `<Link>` for items with `href` and the disabled "Coming Soon" div for items with `comingSoon: true`
  - [ ] 9.3 Update `NavDropdown.test.tsx`: adjust `insightsItems.length` assertion (still 4), update Coming Soon test (only 1 now — Reports), add test for clickable links
  - [ ] 9.4 Update `MobileNav.tsx` — Insights items DO appear in mobile nav (imported from NavDropdown):
    - [ ] 9.4a Remove the hardcoded "Coming Soon" badge from the parent `<button>` at line 198-200 (Insights is no longer Coming Soon)
    - [ ] 9.4b Replace the all-disabled rendering loop (lines 210-222) with conditional logic: items with `href` render as `<SheetClose asChild><Link to={item.href}>` (same pattern as support items), items with `comingSoon: true` keep the disabled `<div>` rendering
    - [ ] 9.4c Update `MobileNav.test.tsx`: Coming Soon badge removed from parent, only "Reports" remains Coming Soon, clickable links navigate correctly

- [ ] Task 10: Add Insights routes to `App.tsx` (AC: #3)
  - [ ] 10.1 Add lazy imports:
    ```ts
    const PublicInsightsPage = lazy(() => import('./features/insights/pages/PublicInsightsPage'));
    const SkillsMapPage = lazy(() => import('./features/insights/pages/SkillsMapPage'));
    const TrendsPage = lazy(() => import('./features/insights/pages/TrendsPage'));
    ```
  - [ ] 10.2 Add routes inside the `<Route element={<PublicLayout />}>` block, AFTER the marketplace routes:
    ```tsx
    {/* Insights — public analytics (Story 8-5) */}
    <Route path="insights">
      <Route index element={<Suspense fallback={<PageLoadingFallback />}><PublicInsightsPage /></Suspense>} />
      <Route path="skills" element={<Suspense fallback={<PageLoadingFallback />}><SkillsMapPage /></Suspense>} />
      <Route path="trends" element={<Suspense fallback={<PageLoadingFallback />}><TrendsPage /></Suspense>} />
    </Route>
    ```
  - [ ] 10.3 Verify no route collision with existing paths

## Dev Notes

### Backend — Already Implemented (Story 8-1)

The core public insights backend is ALREADY built in Story 8-1. Do NOT rewrite:

- **Service**: `apps/api/src/services/public-insights.service.ts` — `PublicInsightsService.getPublicInsights()` with Redis cache (1hr TTL), suppression (minN=10)
- **Controller**: `apps/api/src/controllers/public-insights.controller.ts`
- **Route**: `apps/api/src/routes/public-insights.routes.ts` — `GET /` with rate limiter
- **Mount**: `apps/api/src/app.ts:167` — `app.use('/api/v1/public/insights', publicInsightsRoutes)` (BEFORE authenticated router)
- **Type**: `PublicInsightsData` in `packages/types/src/analytics.ts:87-100`

Backend work for this story:
1. **Remove `LIMIT 10`** from skills query and rename `topSkills` → `allSkills` (Task 0) — frontend slices to 10 for main page
2. **Add `training_interest` extraction** (Task 0) — populates `desiredSkills` for skills gap visualization
3. **Add trends endpoint** (`GET /trends`) for the Trends sub-page (Task 1-2)

### Frontend — Key Patterns

- **PublicLayout**: `apps/web/src/layouts/PublicLayout.tsx` — SkipLink → Header → Outlet → Footer. All public pages use this.
- **Public API calls**: Use `apiClient` from `apps/web/src/lib/api-client.ts`. **Verified**: `getAuthHeaders()` returns `{}` when no token in sessionStorage — no Authorization header sent. Marketplace already uses this pattern for unauthenticated requests (`/marketplace/search`, `/marketplace/profiles/:id`).
- **Recharts**: Already installed (`recharts@^3.7.0`). Existing patterns in `apps/web/src/features/dashboard/components/charts/`. Use `PieChart`, `BarChart`, `AreaChart` with consistent color palette.
- **Color palette**: Use OSLRS brand maroon `#9C1E23` as primary chart color. Secondary colors for multi-series: `#2563EB` (blue), `#059669` (green), `#D97706` (amber), `#7C3AED` (purple).
- **Responsive grid**: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4` for stat cards. `container mx-auto px-4 sm:px-6 lg:px-8` for page wrapper.
- **Content skeletons**: Use `Skeleton` from shadcn for loading states. Match shape of final content (not spinners).
- **`useDocumentTitle`**: `apps/web/src/hooks/useDocumentTitle.ts` — sets `document.title`.

### Anti-Patterns to Avoid

- **Do NOT import dashboard chart components** — public charts are simpler (no filters, no role scoping). Create dedicated components in `features/insights/components/`.
- **Do NOT add filter params** to public API calls — the backend explicitly rejects filters to prevent enumeration attacks.
- **Do NOT show zero for suppressed buckets** — filter them out before rendering. A suppressed bucket has `suppressed: true` on `FrequencyBucket`.
- **Do NOT use `react-leaflet` for LGA map** — GeoJSON boundary files for Oyo State LGAs are not available in the codebase. Use a sortable table instead. Choropleth can be added later when boundary data is sourced.
- **Do NOT lazy-load recharts** — it's already in the main bundle via dashboard charts.

### Suppressed Data Handling

The `FrequencyBucket` type from `@oslsr/types` (note: `count` and `percentage` are nullable):
```ts
interface FrequencyBucket {
  label: string;
  count: number | null;
  percentage: number | null;
  suppressed?: boolean;
}
```

Filter before charting:
```ts
const visibleBuckets = data.genderSplit.filter(b => !b.suppressed);
```

### NavDropdown Update Pattern

Current `insightsItems` (line 44-48 of NavDropdown.tsx) are ALL `comingSoon: true` with no `href`. Update to a mixed model:
- Items with `href` render as `<Link>` inside `<NavigationMenuLink>` (same pattern as `supportItems`)
- Items with `comingSoon: true` keep the disabled div rendering
- The `insightsItems` type needs updating: `{ label: string; description: string; href?: string; comingSoon?: boolean }`

### Test Strategy

- **Backend**: 8 tests (5 trends endpoint + 3 all-skills/desiredSkills from Task 0)
- **Frontend**: ~30 tests across components (8 main page + 6 skills + 4 trends + 3 AnimatedCounter + 2 StatCard + 3 NavDropdown + 4 MobileNav)
- **Total new tests**: ~38
- Mock `usePublicInsights` and `usePublicTrends` hooks in page tests
- Use `vi.hoisted()` + `vi.mock()` pattern for hook mocking

### Project Structure Notes

- New feature module `apps/web/src/features/insights/` — separate from `features/dashboard/` because public insights pages have no auth context, no sidebar, no role scoping
- Routes mount under `PublicLayout` in `App.tsx` — same pattern as `/marketplace`
- Public API client in `features/insights/api/` — not in `features/dashboard/api/`
- Backend additions: all-skills query (remove LIMIT 10), `training_interest` extraction for `desiredSkills`, and trends endpoint — all in existing `public-insights.service.ts`

### References

- [Source: docs/survey-analytics-spec.md#4.6 Public Insights Page] — page layout, sections, API contract
- [Source: docs/survey-analytics-spec.md#7 Technical Architecture] — frontend file structure, component list
- [Source: docs/survey-analytics-spec.md#8 Implementation Phases] — Phase 1 scope confirmation
- [Source: packages/types/src/analytics.ts:87-100] — `PublicInsightsData` type definition
- [Source: apps/api/src/services/public-insights.service.ts] — existing backend (Story 8-1)
- [Source: apps/api/src/routes/public-insights.routes.ts] — route + rate limiter
- [Source: apps/web/src/layouts/components/NavDropdown.tsx:44-48] — current Coming Soon items
- [Source: apps/web/src/App.tsx:217] — PublicLayout route wrapper
- [Source: apps/web/src/App.tsx:421-453] — marketplace route pattern (model for insights routes)
- [Source: apps/web/src/features/marketplace/api/marketplace.api.ts] — public API call pattern
- [Source: apps/web/src/hooks/useDocumentTitle.ts] — SEO document title hook (auto-appends `| OSLSR - Oyo State Labour & Skills Registry`)
- [Source: scripts/generate-xlsform.cjs:62] — `training_interest` field definition (want-to-learn skills)
- [Source: docs/questionnaire_schema.md:64] — `training_interest` schema confirmation
- [Source: apps/web/src/layouts/components/MobileNav.tsx:188-225] — mobile nav Insights section (needs update)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

### File List
