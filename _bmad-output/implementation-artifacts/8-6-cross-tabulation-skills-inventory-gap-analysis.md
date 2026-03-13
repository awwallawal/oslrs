# Story 8.6: Cross-Tabulation Engine, Skills Inventory & Gap Analysis

Status: done

## Prerequisites

- **Story 8.2** (Super Admin / Government Official Survey Analytics Dashboard) — creates `SurveyAnalyticsPage.tsx` with tabbed layout where Cross-Tab and Skills tabs will be added
- **Story 8.3** (Field Team Analytics) — creates `SupervisorAnalyticsPage.tsx` where simplified skills section will be added
- Task 0 (below) must be completed before Tasks 5 and 12 can begin

## Story

As a Super Admin, Government Official, or Supervisor,
I want a cross-tabulation engine for flexible two-dimensional data exploration and a full skills inventory with gap analysis,
So that I can discover hidden patterns in the workforce data and identify skills mismatches for policy planning.

## Progressive Activation

This story follows the **progressive activation** pattern. All features are built, deployed, and rendered in the UI from day one. Below each component's minimum data threshold, it renders an informational message ("X more submissions needed for this analysis") instead of empty states or errors. Features self-enable as data accumulates — no redeployment required.

| Feature | Minimum N | Rationale |
|---------|-----------|-----------|
| Cross-tabulation | 50 total submissions | Spec §10: "Cross-tabulations (2×2)" need 50 |
| Skills frequency (all 150) | 30 total | Same as basic frequency distributions |
| Skills by category | 30 total | Grouped aggregation of the same data |
| Skills concentration by LGA | 20 per LGA | Need enough per LGA to be meaningful |
| Skills gap (have vs want) | 30 total | Diverging bar needs both dimensions |
| Skill diversity index | 30 per LGA | Shannon index unreliable on tiny samples |

## Acceptance Criteria

1. **Given** a Super Admin or Government Official navigates to the Survey Analytics page and clicks the "Cross-Tab" tab **When** the page loads with >= 50 submissions **Then** a cross-tabulation interface displays with:
   - Row dimension dropdown: gender, age band, education, LGA, employment type, marital status, housing, disability
   - Column dimension dropdown: same list
   - Measure toggle: Count / % of row / % of column / % of total
   - A heatmap-styled table showing the cross-tabulation results with color intensity proportional to cell count
   **And** results are scoped by role (system-wide for SA/Official, LGA-scoped for Supervisor).

2. **Given** the cross-tabulation is loaded **When** any cell has count < 5 (authenticated) **Then** it displays "< 5" instead of the exact count to prevent de-identification (consistent with `suppressSmallBuckets(minN=5)`).

3. **Given** a Super Admin or Government Official navigates to the "Skills" tab **When** the page loads **Then** it displays:
   - Full skills horizontal bar chart (all skills, not limited to 10)
   - Skills grouped by ISCO-08 sector (20 sectors — using `ISCO08_SECTOR_MAP` from `packages/types/src/skills-taxonomy.ts`)
   - Skills concentration table: top 3 skills per LGA
   - Skills gap diverging bar chart: current skills (`skills_possessed`) vs desired training (`training_interest`) — both fields use space-separated skill codes
   - Skill diversity index (Shannon) per LGA as stat cards

4. **Given** a Supervisor navigates to their Team Analytics page **When** the page loads **Then** they see LGA-scoped versions of skills frequency and skills by category (no cross-tabulation engine — Supervisor gets a simplified skills view).

5. **Given** the backend `GET /analytics/cross-tab` endpoint **When** called with `?rowDim=gender&colDim=employmentType&measure=count` **Then** it returns a JSON structure:
   ```json
   {
     "rowLabels": ["Male", "Female"],
     "colLabels": ["Wage (Public)", "Self-Employed", "..."],
     "cells": [[120, 45], [80, 67]],
     "totalN": 500,
     "anySuppressed": false
   }
   ```
   **And** individual cells with count < 5 are replaced with `null` (frontend renders as "< 5"). The root-level `anySuppressed: boolean` indicates whether any cell was suppressed (useful for a suppression notice banner).

6. **Given** the backend `GET /analytics/skills-inventory` endpoint **When** called **Then** it returns:
   - `allSkills`: Full skills frequency (not top-10 limited), type `SkillsFrequency[]`
   - `byCategory`: Skills aggregated by ISCO-08 category
   - `byLga`: Top 3 skills per LGA (SA/Official only — `null` for Supervisor)
   - `gapAnalysis`: Have (`skills_possessed`) vs want-to-learn (`training_interest`) diverging data
   - `diversityIndex`: Shannon diversity index per LGA (SA/Official only — `null` for Supervisor)
   **And** all data respects role scoping and suppression rules (minN=5).

7. **Given** fewer than 50 submissions exist **When** a user opens the Cross-Tab tab **Then** it displays: "Cross-tabulation requires at least 50 submissions. {50 - current} more needed." with a progress bar showing current/50.

8. **Given** fewer than 30 submissions exist **When** a user opens the Skills tab **Then** skill-specific sections show threshold messages instead of charts, while sections with sufficient data still render normally.

## Tasks / Subtasks

### Backend — Prerequisite: Extract Skills Taxonomy

- [x] Task 0: Extract ISCO-08 skills taxonomy into shared package (AC: #3, #6)
  - [x] 0.1 Create `packages/types/src/skills-taxonomy.ts` — extract the `SECTOR_MAP` constant from `apps/web/src/features/forms/components/ComboboxMultiSelect.tsx:21-123` into a shared, importable constant:
    ```ts
    /**
     * ISCO-08 sector mapping: skill code → sector name
     * 151 skills across 20 sectors. Source of truth for both frontend grouping
     * (ComboboxMultiSelect) and backend analytics aggregation.
     */
    export const ISCO08_SECTOR_MAP: Record<string, string> = {
      // Construction & Building (16 skills)
      bricklaying: 'Construction & Building',
      plastering: 'Construction & Building',
      // ... full 150-skill mapping extracted from ComboboxMultiSelect
    };

    /** Unique sector names derived from ISCO08_SECTOR_MAP */
    export const ISCO08_SECTORS: string[] = [...new Set(Object.values(ISCO08_SECTOR_MAP))];
    ```
  - [x] 0.2 Export from `packages/types/src/index.ts`: `export { ISCO08_SECTOR_MAP, ISCO08_SECTORS } from './skills-taxonomy.js';`
  - [x] 0.3 Refactor `ComboboxMultiSelect.tsx` — replace the inline `SECTOR_MAP` with `import { ISCO08_SECTOR_MAP } from '@oslsr/types'` to eliminate duplication. Verify the component still renders correctly.
  - [x] 0.4 Write 2 unit tests in `packages/types/src/__tests__/skills-taxonomy.test.ts`: SECTOR_MAP has 150 entries, SECTORS has 20 unique values
  - **WHY**: The taxonomy currently lives in a frontend component file (`apps/web`). The backend (`apps/api`) cannot import from `apps/web`. Extracting to `packages/types` makes it importable by both.

### Backend — Cross-Tabulation Engine

- [x] Task 1: Create cross-tabulation service (AC: #1, #2, #5)
  - [x] 1.1 Add `getCrossTab(rowDim, colDim, measure, scope, params)` method to `SurveyAnalyticsService` in `apps/api/src/services/survey-analytics.service.ts`
  - [x] 1.2 Validate dimensions against allowed enum: `gender`, `ageBand`, `education`, `lga`, `employmentType`, `maritalStatus`, `housing`, `disability`
  - [x] 1.3 Build dynamic SQL using Drizzle `sql` template tags. Map each dimension to its extraction expression (see JSONB Dimension Map in Dev Notes). Use `buildWhereFragments(scope, params)` for scope + filter injection:
    ```sql
    SELECT
      <row_expr> AS row_val,
      <col_expr> AS col_val,
      COUNT(*) AS cell_count
    FROM submissions s
    LEFT JOIN respondents r ON r.id = s.respondent_id
    WHERE <scope_where>
    GROUP BY row_val, col_val
    ORDER BY row_val, col_val
    ```
    **IMPORTANT**: Dimension expressions must use Drizzle `sql` template tags (never `sql.raw()`). Build a `dimensionToSql()` helper that returns the `SQL` fragment for each dimension enum value.
  - [x] 1.4 Pivot the flat SQL result into the `{ rowLabels, colLabels, cells }` matrix structure in application code. Handle sparse matrices — not all row×col combinations may have results; fill missing cells with 0.
  - [x] 1.5 Apply suppression: cells with count < 5 → `null`, set `anySuppressed: true` if any cell was suppressed
  - [x] 1.6 Compute percentage measures in application code (not SQL): `rowPct` = cell/rowTotal*100, `colPct` = cell/colTotal*100, `totalPct` = cell/grandTotal*100. Suppressed cells remain `null` regardless of measure.
  - [x] 1.7 Apply scope chain via `buildWhereFragments()`: system-wide for SA/Official, LGA-filtered for Supervisor
  - [x] 1.8 Cache result in Redis with composite key `analytics:cross-tab:{scopeType}:{scopeId}:{rowDim}:{colDim}:{measure}:{paramsHash}`, TTL 300s (5 min — cross-tabs are expensive). Include query params in cache key to avoid stale filtered results.
  - [x] 1.9 Add threshold guard: if total submissions (within scope) < 50, return `{ belowThreshold: true, currentN, requiredN: 50 }` instead of data

- [x] Task 2: Add cross-tabulation types (AC: #5)
  - [x] 2.1 Define `CrossTabDimension` enum in `packages/types/src/analytics.ts`:
    ```ts
    export enum CrossTabDimension {
      GENDER = 'gender',
      AGE_BAND = 'ageBand',
      EDUCATION = 'education',
      LGA = 'lga',
      EMPLOYMENT_TYPE = 'employmentType',
      MARITAL_STATUS = 'maritalStatus',
      HOUSING = 'housing',
      DISABILITY = 'disability',
    }
    ```
  - [x] 2.2 Define `CrossTabMeasure` enum: `count`, `rowPct`, `colPct`, `totalPct`
  - [x] 2.3 Define `CrossTabResult` type:
    ```ts
    interface CrossTabResult {
      rowLabels: string[];
      colLabels: string[];
      cells: (number | null)[][];
      totalN: number;
      anySuppressed: boolean;
      belowThreshold?: boolean;
      currentN?: number;
      requiredN?: number;
    }
    ```
  - [x] 2.4 Define `CrossTabQuery` type: `{ rowDim: CrossTabDimension; colDim: CrossTabDimension; measure?: CrossTabMeasure }`
  - [x] 2.5 Export from `packages/types/src/index.ts`

- [x] Task 3: Add cross-tabulation route (AC: #5)
  - [x] 3.1 Add `GET /analytics/cross-tab` route in `apps/api/src/routes/analytics.routes.ts`
  - [x] 3.2 **Per-route role guard**: The analytics router already authorizes all 6 dashboard roles at router level (`analytics.routes.ts:20-27`). Add per-route middleware to restrict cross-tab to SA/Official/Supervisor:
    ```ts
    router.get('/cross-tab',
      authorize(UserRole.SUPER_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR),
      AnalyticsController.getCrossTab
    );
    ```
    Enumerator/Clerk/Assessor pass the router-level auth but get 403 at route level.
  - [x] 3.3 Zod validation for query params: `rowDim`, `colDim` (both required, must be valid `CrossTabDimension`), `measure` (optional, defaults to `count`)
  - [x] 3.4 Reject if `rowDim === colDim` (400 error — cross-tab of same dimension is meaningless)
  - [x] 3.5 Add `getCrossTab` controller handler in `apps/api/src/controllers/analytics.controller.ts`

- [x] Task 4: Write cross-tab backend tests (AC: #1, #2, #5, #7)
  - [x] 4.1 Test: valid cross-tab returns correct matrix structure (rowLabels, colLabels, cells dimensions match)
  - [x] 4.2 Test: suppressed cells (count < 5) return null, `anySuppressed` is true
  - [x] 4.3 Test: same dimension for row and col returns 400
  - [x] 4.4 Test: invalid dimension returns 400
  - [x] 4.5 Test: Supervisor gets LGA-scoped results (only their LGA data)
  - [x] 4.6 Test: Enumerator gets 403 (per-route guard)
  - [x] 4.7 Test: below threshold (< 50 submissions) returns belowThreshold response
  - [x] 4.8 Test: cache hit skips SQL query
  - [x] 4.9 Test: percentage measures compute correctly (rowPct, colPct, totalPct)
  - [x] 4.10 Test: sparse matrix fills missing cells with 0

### Backend — Skills Inventory & Gap Analysis

- [x] Task 5: Create skills inventory service (AC: #3, #6)
  - [x] 5.1 Add `getSkillsInventory(scope, params)` method to `SurveyAnalyticsService`
  - [x] 5.2 `allSkills`: Full skills frequency query — **use existing extraction pattern** (NOT `jsonb_array_elements_text`):
    ```sql
    SELECT skill, COUNT(*) AS count
    FROM submissions s
    LEFT JOIN respondents r ON r.id = s.respondent_id,
         unnest(string_to_array(s.raw_data->>'skills_possessed', ' ')) AS skill
    WHERE <scope_where>
      AND s.raw_data->>'skills_possessed' IS NOT NULL
      AND s.raw_data->>'skills_possessed' != ''
    GROUP BY skill
    ORDER BY count DESC
    ```
    **CRITICAL**: Skills are stored as **space-separated strings** in `skills_possessed`, NOT as JSON arrays. Use `unnest(string_to_array(..., ' '))` — same pattern as `survey-analytics.service.ts:429` and `public-insights.service.ts:148`. Using `jsonb_array_elements_text` will return zero rows silently.
  - [x] 5.3 `byCategory`: Import `ISCO08_SECTOR_MAP` from `@oslsr/types` (created in Task 0). After fetching all skills from SQL, group in application code:
    ```ts
    import { ISCO08_SECTOR_MAP } from '@oslsr/types';

    const byCategory = new Map<string, { count: number; skills: SkillsFrequency[] }>();
    for (const skill of allSkills) {
      const category = ISCO08_SECTOR_MAP[skill.skill] || 'Other';
      const entry = byCategory.get(category) || { count: 0, skills: [] };
      entry.count += skill.count;
      entry.skills.push(skill);
      byCategory.set(category, entry);
    }
    ```
  - [x] 5.4 `byLga`: Top 3 skills per LGA using window function — **use correct extraction pattern**:
    ```sql
    WITH skill_counts AS (
      SELECT r.lga_id, skill, COUNT(*) AS count
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id,
           unnest(string_to_array(s.raw_data->>'skills_possessed', ' ')) AS skill
      WHERE <scope_where>
        AND s.raw_data->>'skills_possessed' IS NOT NULL
        AND s.raw_data->>'skills_possessed' != ''
      GROUP BY r.lga_id, skill
    ),
    ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY lga_id ORDER BY count DESC) AS rn
      FROM skill_counts
    )
    SELECT lga_id, skill, count FROM ranked WHERE rn <= 3
    ```
    Return `null` for Supervisor scope (they only see their own LGA — byLga comparison is meaningless).
  - [x] 5.5 `gapAnalysis`: Have vs want-to-learn. Run two parallel queries using the correct field names:
    - **Have**: `unnest(string_to_array(s.raw_data->>'skills_possessed', ' '))` — skills people currently have
    - **Want**: `unnest(string_to_array(s.raw_data->>'training_interest', ' '))` — skills people want to learn
    - **IMPORTANT**: The survey form field is `training_interest` (NOT `skills_desired` or `skills_wanted`). Confirmed in `scripts/generate-xlsform.cjs:62` and `docs/questionnaire_schema.md:64`.
    - Join both results by skill name in application code to produce `{ skill, haveCount, wantCount }[]`
    - If `training_interest` data is empty/insufficient, return `null` (not an empty array)
  - [x] 5.6 `diversityIndex`: Compute Shannon diversity index per LGA in application code. Query skill counts per LGA, then:
    ```ts
    function shannonIndex(counts: number[]): number {
      const total = counts.reduce((a, b) => a + b, 0);
      if (total === 0) return 0;
      return -counts
        .filter(c => c > 0)
        .reduce((H, c) => H + (c / total) * Math.log(c / total), 0);
    }
    ```
    Return `null` for Supervisor scope.
  - [x] 5.7 Apply suppression rules: skills with count < 5 → suppressed (filtered from results). Use `SUPPRESSION_MIN_N` constant (already 5 in service file).
  - [x] 5.8 Apply scope chain via `buildWhereFragments(scope, params)`: system-wide for SA/Official, LGA for Supervisor
  - [x] 5.9 Cache with composite key `analytics:skills-inventory:{scopeType}:{scopeId}:{paramsHash}`, TTL 600s (10 min)
  - [x] 5.10 Threshold guard: Each section returns `belowThreshold` individually based on its minimum N (see Progressive Activation table). Return the `thresholds` object alongside data so the frontend can show/hide each section independently.

- [x] Task 6: Add skills inventory types (AC: #6)
  - [x] 6.1 Define `SkillsInventoryData` type in `packages/types/src/analytics.ts`:
    ```ts
    interface SkillsInventoryData {
      allSkills: SkillsFrequency[];
      byCategory: { category: string; totalCount: number; skills: SkillsFrequency[] }[];
      byLga: { lgaId: string; lgaName: string; topSkills: { skill: string; count: number }[] }[] | null;
      gapAnalysis: { skill: string; haveCount: number; wantCount: number }[] | null;
      diversityIndex: { lgaId: string; lgaName: string; index: number; skillCount: number }[] | null;
      thresholds: {
        allSkills: { met: boolean; currentN: number; requiredN: number };
        byCategory: { met: boolean; currentN: number; requiredN: number };
        byLga: { met: boolean; currentN: number; requiredN: number };
        gapAnalysis: { met: boolean; currentN: number; requiredN: number };
        diversityIndex: { met: boolean; currentN: number; requiredN: number };
      };
    }
    ```
    **Note**: Uses `SkillsFrequency[]` (not `FrequencyBucket[]`) for consistency with existing `getSkillsFrequency()` which returns `{ skill, count, percentage }`. `FrequencyBucket` uses `label` not `skill` — mixing them would force unnecessary field renaming. Thresholds use a richer object (not bare boolean) so the frontend `ThresholdGuard` gets `currentN`/`requiredN` directly.
  - [x] 6.2 Export from `packages/types/src/index.ts`

- [x] Task 7: Add skills inventory route (AC: #6)
  - [x] 7.1 Add `GET /analytics/skills-inventory` route in `apps/api/src/routes/analytics.routes.ts`.
    **IMPORTANT**: Do NOT use `GET /analytics/skills` — that route already exists (`analytics.routes.ts:33`) and maps to `getSkillsFrequency()` (top-N skills for the existing dashboard). The new endpoint is a separate, richer analysis.
  - [x] 7.2 **Per-route role guard** (same pattern as cross-tab): `authorize(SA, Official, Supervisor)` before handler. Enumerator/Clerk/Assessor get 403.
  - [x] 7.3 Accept optional query params via existing `analyticsQuerySchema`: `lgaId`, `dateFrom`, `dateTo`, `source`
  - [x] 7.4 Add `getSkillsInventory` controller handler in `analytics.controller.ts`

- [x] Task 8: Write skills inventory backend tests (AC: #3, #6, #8)
  - [x] 8.1 Test: returns full skills list (not top-10 limited)
  - [x] 8.2 Test: skills grouped by ISCO-08 category correctly (uses ISCO08_SECTOR_MAP)
  - [x] 8.3 Test: top 3 skills per LGA (window function ranking)
  - [x] 8.4 Test: gap analysis returns have (`skills_possessed`) vs want (`training_interest`) with matched skill names
  - [x] 8.5 Test: gap analysis returns `null` when no `training_interest` data exists
  - [x] 8.6 Test: Shannon diversity index computation (known input → known output)
  - [x] 8.7 Test: suppression applied (skills with count < 5 excluded)
  - [x] 8.8 Test: per-section threshold guards return correct `thresholds` object
  - [x] 8.9 Test: Supervisor gets LGA-scoped data, `byLga` and `diversityIndex` are `null`
  - [x] 8.10 Test: Enumerator gets 403 (per-route guard)

### Frontend — Cross-Tabulation UI

- [x] Task 9: Create cross-tab API + hooks (AC: #1)
  - [x] 9.1 Add `fetchCrossTab(query: CrossTabQuery, params?: AnalyticsQueryParams)` in `apps/web/src/features/dashboard/api/analytics.api.ts`
  - [x] 9.2 Add `useCrossTab(query: CrossTabQuery, params?)` hook in `apps/web/src/features/dashboard/hooks/useAnalytics.ts` with `enabled: !!query.rowDim && !!query.colDim` (don't fire until both dimensions selected)
  - [x] 9.3 Add `fetchSkillsInventory(params?)` and `useSkillsInventory(params?)` in same files. Query key: `analyticsKeys.skillsInventory(params)`

- [x] Task 10: Create `CrossTabTable` component (AC: #1, #2)
  - [x] 10.1 Create `apps/web/src/features/dashboard/components/charts/CrossTabTable.tsx`
  - [x] 10.2 Render heatmap-style HTML table with color intensity proportional to cell value. Use maroon-to-white gradient scale (darkest = highest count). Apply `opacity` or `background-color` interpolation based on cell value relative to max cell value.
  - [x] 10.3 Row dimension selector dropdown (shadcn Select) — labels from `CrossTabDimension` enum, human-readable: `{ gender: 'Gender', ageBand: 'Age Band', education: 'Education Level', lga: 'LGA', employmentType: 'Employment Type', maritalStatus: 'Marital Status', housing: 'Housing Status', disability: 'Disability Status' }`
  - [x] 10.4 Column dimension selector dropdown — same options, disable currently selected row dimension (prevent same×same without server round-trip)
  - [x] 10.5 Measure toggle (shadcn ToggleGroup): Count / Row % / Col % / Total %
  - [x] 10.6 Display `< 5` for suppressed cells (where value is `null`) with muted styling. Show suppression notice banner when `anySuppressed === true`: "Some cells suppressed (< 5 observations) to protect privacy."
  - [x] 10.7 Below-threshold state: use `ThresholdGuard` with progress bar + "N more submissions needed" message
  - [x] 10.8 Loading state: content-shaped skeleton matching table layout (grid of grey boxes)
  - [x] 10.9 Handle 0-count edge case: if `totalN === 0` after scope filtering, show "No data available for this scope" instead of an empty table

- [x] Task 11: Write CrossTabTable tests (AC: #1, #2, #7)
  - [x] 11.1 Test: renders heatmap table with correct row/col dimensions
  - [x] 11.2 Test: suppressed cells show "< 5" text
  - [x] 11.3 Test: suppression banner shows when `anySuppressed` is true
  - [x] 11.4 Test: dimension selectors update query, disabled option for selected counterpart
  - [x] 11.5 Test: below-threshold shows progress bar and message
  - [x] 11.6 Test: loading state renders skeleton
  - [x] 11.7 Test: measure toggle switches between count and percentages

### Frontend — Skills Inventory UI

- [x] Task 12: Create skills inventory components (AC: #3)
  - [x] 12.1 Create `apps/web/src/features/dashboard/components/charts/FullSkillsChart.tsx` — horizontal bar chart (all skills). Recharts BarChart with `layout="vertical"`. Scrollable container if > 30 skills. Maroon bars with hover tooltip showing count + percentage.
  - [x] 12.2 Create `apps/web/src/features/dashboard/components/charts/SkillsCategoryChart.tsx` — accordion or grouped bar chart showing skills by ISCO-08 sector. Import `ISCO08_SECTORS` from `@oslsr/types` for sector ordering. Each sector expandable to show individual skills.
  - [x] 12.3 Create `apps/web/src/features/dashboard/components/charts/SkillsGapChart.tsx` — diverging horizontal bar chart: have (maroon `#9C1E23`, extending left) vs want (blue `#2563EB`, extending right). Skills sorted by largest gap (`wantCount - haveCount`). If `gapAnalysis` is `null`, show "No training interest data available yet" placeholder. Tooltip shows both counts.
  - [x] 12.4 Create `apps/web/src/features/dashboard/components/charts/SkillsConcentrationTable.tsx` — sortable table: LGA name | #1 Skill | #2 Skill | #3 Skill | Total registrations. LGA name from join, not raw ID. For SA/Official only — component not rendered for Supervisor.
  - [x] 12.5 Create `apps/web/src/features/dashboard/components/charts/SkillsDiversityCards.tsx` — stat cards with Shannon index per LGA, color-coded: green (> 2.0, high diversity), amber (1.0-2.0, moderate), red (< 1.0, low — potential skills monoculture). Include `skillCount` in subtitle. For SA/Official only.
  - [x] 12.6 Each component wraps content in `ThresholdGuard` using the corresponding `thresholds.{section}` object from `SkillsInventoryData`

- [x] Task 13: Write skills inventory component tests (AC: #3, #8)
  - [x] 13.1 Test: FullSkillsChart renders all skills (not truncated to 10)
  - [x] 13.2 Test: SkillsCategoryChart groups by ISCO-08 sector with correct count
  - [x] 13.3 Test: SkillsGapChart renders diverging bars, sorted by gap size
  - [x] 13.4 Test: SkillsGapChart shows placeholder when `gapAnalysis` is null
  - [x] 13.5 Test: below-threshold components show ThresholdGuard messages with progress bar
  - [x] 13.6 Test: suppressed skills excluded from charts (count < 5 not shown)
  - [x] 13.7 Test: SkillsConcentrationTable renders LGA names and top 3 skills

### Frontend — Tab Integration

- [x] Task 14: Add Cross-Tab and Skills tabs to analytics pages (AC: #1, #3, #4)
  - **Prerequisite**: Stories 8.2 and 8.3 must be implemented first. These create the page shells with tab structures:
    - `SurveyAnalyticsPage.tsx` (8.2) — Super Admin survey analytics with existing tabs: Demographics | Employment | Household | Skills | Trends | Equity
    - `OfficialStatsPage.tsx` refactored (8.2) — Government Official with tabbed layout
    - `SupervisorAnalyticsPage.tsx` (8.3) — Supervisor analytics with tabs: Data Quality | Field Coverage | LGA Demographics
  - [x] 14.1 Add "Cross-Tab" tab to `SurveyAnalyticsPage.tsx` — render `CrossTabTable` component. Position after the existing tabs.
  - [x] 14.2 Add "Skills Inventory" tab (or rename existing "Skills" tab) to `SurveyAnalyticsPage.tsx` — render the full skills suite: `FullSkillsChart` + `SkillsCategoryChart` + `SkillsGapChart` + `SkillsConcentrationTable` + `SkillsDiversityCards` in a responsive grid layout.
  - [x] 14.3 Add "Cross-Tab" and "Skills Inventory" tabs to Government Official analytics page (same components, same scope — both SA and Official get system-wide data).
  - [x] 14.4 Add simplified skills section to `SupervisorAnalyticsPage.tsx` — only `FullSkillsChart` + `SkillsCategoryChart` (NO cross-tab, NO byLga table, NO diversity cards — Supervisor sees only their LGA). Add as a new "Skills" tab after existing tabs.
  - [x] 14.5 Tab visibility enforcement: Cross-Tab + Skills Inventory visible to SA/Official/Supervisor only. Enumerator/Clerk/Assessor tabs should not appear (they use different pages per Story 8.3).
  - [x] 14.6 Write 4 integration tests: Cross-Tab tab renders with component, Skills tab renders with all sub-components, role-based tab visibility, Supervisor sees simplified skills (no cross-tab)

### Frontend — Shared Utility

- [x] Task 15: Create reusable `ThresholdGuard` component
  - [x] 15.1 Create `apps/web/src/features/dashboard/components/ThresholdGuard.tsx`:
    ```tsx
    interface ThresholdGuardProps {
      threshold: { met: boolean; currentN: number; requiredN: number };
      label: string;
      children: React.ReactNode;
    }

    export function ThresholdGuard({ threshold, label, children }: ThresholdGuardProps) {
      if (!threshold.met) {
        return (
          <Card className="p-6 text-center">
            <p className="text-muted-foreground">
              {label} requires at least {threshold.requiredN} submissions.
            </p>
            <p className="text-sm mt-1">
              {threshold.requiredN - threshold.currentN} more needed.
            </p>
            <Progress
              value={(threshold.currentN / threshold.requiredN) * 100}
              className="mt-3 max-w-xs mx-auto"
            />
          </Card>
        );
      }
      return <>{children}</>;
    }
    ```
  - [x] 15.2 Write 2 tests: renders children when threshold met, renders progress message when below threshold
  - **Note**: This component is reusable across all progressive activation features (8.6 and any future threshold-gated features).

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] Skills Inventory tab missing loading and error states on SurveyAnalyticsPage, OfficialStatsPage, SupervisorAnalyticsPage — added SkeletonCard loading + Card error states [SurveyAnalyticsPage.tsx, OfficialStatsPage.tsx, SupervisorAnalyticsPage.tsx]
- [x] [AI-Review][HIGH] SkillsGapChart legend semantically incorrect — bars show gap direction but legend said "Current (have)" / "Desired (want)". Fixed to "Oversupply (have > want)" / "Undersupply (want > have)" [SkillsGapChart.tsx:62-69]
- [x] [AI-Review][HIGH] Test description says "150" but assertion expects 151 — updated test name and story text to reflect actual 151-skill taxonomy [skills-taxonomy.test.ts:6]
- [x] [AI-Review][MEDIUM] Magic number 50 for cross-tab threshold fallback in CrossTabTable — extracted to named constant `CROSS_TAB_MIN_N` [CrossTabTable.tsx:10]
- [x] [AI-Review][MEDIUM] Same-dimension 400 error used non-standard format vs Zod errors — moved validation into Zod `.refine()` for consistent error handling [analytics.controller.ts:36-42]
- [x] [AI-Review][MEDIUM] Cache keys used `JSON.stringify(params)` without key sorting — added `stableStringify()` helper for deterministic cache keys [survey-analytics.service.ts:99-101,709,831]
- [x] [AI-Review][LOW] Story Test Strategy said ~42 tests vs actual 51 — corrected counts
- [x] [AI-Review][LOW] Story referenced "150 skills" throughout but actual count is 151 — corrected all references

## Dev Notes

### Cross-Tab Cannot Be Client-Side

Cross-tabulation MUST be computed server-side in SQL. Client-side "pivot" from separate frequency distributions is mathematically impossible — the joint distribution cannot be reconstructed from marginal distributions. Example: knowing 60% male and 40% employed tells you nothing about what percentage of males are employed.

### JSONB Dimension Map

The cross-tab query extracts raw_data JSONB fields dynamically. The dimension names map to SQL expressions. **All must use Drizzle `sql` template tags** — never `sql.raw()` for user-controlled values. The dimension is controlled by an enum (not user-typed text), so the `switch` maps safely:

| Dimension | SQL Expression | Source |
|-----------|---------------|--------|
| `gender` | `s.raw_data->>'gender'` | Direct JSONB extraction |
| `ageBand` | `CASE WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 15 AND 19 THEN '15-19' WHEN ... BETWEEN 20 AND 24 THEN '20-24' ... WHEN >= 60 THEN '60+' ELSE 'unknown' END` | Derived — use full 10-band mapping from `survey-analytics.service.ts:101-110` |
| `education` | `s.raw_data->>'education_level'` | Direct |
| `lga` | `COALESCE(l.name, r.lga_id, 'Unknown')` | Join column — requires `LEFT JOIN lgas l ON l.code = r.lga_id` |
| `employmentType` | `s.raw_data->>'employment_type'` | Direct |
| `maritalStatus` | `s.raw_data->>'marital_status'` | Direct |
| `housing` | `s.raw_data->>'housing_status'` | Direct |
| `disability` | `s.raw_data->>'disability_status'` | Direct |

### Skills Data Extraction — CRITICAL

Skills are stored as **space-separated strings** in the `skills_possessed` and `training_interest` JSONB fields. They are NOT JSON arrays.

**Correct pattern** (used everywhere in the codebase):
```sql
unnest(string_to_array(s.raw_data->>'skills_possessed', ' ')) AS skill
```

**WRONG** (would silently return zero rows):
```sql
jsonb_array_elements_text(s.raw_data->'skills') AS skill  -- WRONG field, WRONG function
```

### Skills Taxonomy

The ISCO-08 skills taxonomy (150 skills, 20 sectors) is extracted into `packages/types/src/skills-taxonomy.ts` by Task 0. This provides:
- `ISCO08_SECTOR_MAP`: `Record<string, string>` mapping skill code → sector name
- `ISCO08_SECTORS`: `string[]` of 20 unique sector names

Previously this data was inline in `apps/web/src/features/forms/components/ComboboxMultiSelect.tsx:21-123`. After Task 0, both frontend and backend import from the shared package.

### Relationship to Story 8.5 (Public Insights)

Story 8.5 adds `allSkills` and `desiredSkills` to the **public** `PublicInsightsData` type (unauthenticated, PUBLIC_MIN_N=10 suppression). Story 8.6's `SkillsInventoryData` serves **authenticated** users (SUPPRESSION_MIN_N=5) with richer analysis (categories, LGA concentration, diversity index). These are intentionally separate endpoints with different suppression thresholds and scoping rules. Do NOT merge them.

### Existing Skills Route — Do NOT Collide

`analytics.routes.ts:33` already has `router.get('/skills', AnalyticsController.getSkillsFrequency)` — this returns top-N skills for the existing dashboard (Stories 8.2/8.3). The new skills inventory endpoint uses a **different path**: `GET /analytics/skills-inventory`.

### Per-Route Role Guards

The analytics router (`analytics.routes.ts:20-27`) authorizes all 6 dashboard roles at the router level. Cross-tab and skills-inventory need stricter access:

```ts
// Existing router-level: all 6 roles pass
router.use(authorize(SA, Official, Supervisor, Enumerator, Clerk, Assessor));

// Per-route restriction for new endpoints:
router.get('/cross-tab', authorize(SA, Official, Supervisor), handler);
router.get('/skills-inventory', authorize(SA, Official, Supervisor), handler);
```

The outer `authorize()` lets all 6 roles through to existing endpoints. The inner per-route `authorize()` restricts new endpoints to 3 roles. Enumerator/Clerk/Assessor get 403 at route level.

### Suppression Rules

- Authenticated users (SA, Official, Supervisor): minN = 5 (from `SUPPRESSION_MIN_N` in service)
- Cross-tab cells with count < 5 → `null` (frontend displays as "< 5")
- `anySuppressed: boolean` at response root indicates if any cell was suppressed — used for suppression notice banner
- Skills with count < 5 → excluded from results (not shown at all)

### Performance Considerations

- Cross-tabulation queries scan the full `submissions` table with JSONB extraction — can be slow at scale
- Redis cache (5 min TTL for cross-tab, 10 min for skills-inventory) mitigates repeat queries
- Consider adding `CREATE INDEX idx_submissions_raw_data ON submissions USING gin(raw_data)` if query times exceed 2s
- Skills diversity index computed in application code (not SQL) — acceptable for < 33 LGAs
- `byCategory` grouping done in application code (not SQL) — avoids complex SQL and leverages the shared taxonomy constant

### Anti-Patterns to Avoid

1. **Do NOT attempt client-side pivot** — see "Cross-Tab Cannot Be Client-Side" above
2. **Do NOT hardcode ISCO-08 categories** — import `ISCO08_SECTOR_MAP` from `@oslsr/types`
3. **Do NOT reuse `topSkills` from demographics endpoint** — it's limited to top-N and lacks category/LGA/gap data
4. **Do NOT show 0 for suppressed cells** — show "< 5" text to make suppression visible
5. **Do NOT allow cross-tab of same dimension** — `gender x gender` is a 400 error
6. **Do NOT use `jsonb_array_elements_text`** for skills — skills are space-separated strings, not JSON arrays. Use `unnest(string_to_array(...))`
7. **Do NOT use `raw_data->'skills'` or `raw_data->'skills_wanted'`** — correct fields are `skills_possessed` and `training_interest`
8. **Do NOT mount skills-inventory on `/analytics/skills`** — that route is taken by the existing top-N endpoint

### References

- [Source: docs/survey-analytics-spec.md#4 Cross-Tabulation Engine] — cross-tab feature definition
- [Source: docs/survey-analytics-spec.md#2.3 Skills Inventory] — skills features (D14-D18)
- [Source: docs/survey-analytics-spec.md#11 Feature List] — X1 (Phase 3), D14-D18 (Phase 3)
- [Source: docs/survey-analytics-spec.md#10 Sample Size] — minimum N thresholds
- [Source: apps/web/src/features/forms/components/ComboboxMultiSelect.tsx:21-123] — ISCO-08 taxonomy source (to be extracted in Task 0)
- [Source: packages/types/src/analytics.ts] — existing analytics types (FrequencyBucket, SkillsFrequency, etc.)
- [Source: apps/api/src/services/survey-analytics.service.ts:405-445] — existing `getSkillsFrequency()` with correct SQL pattern
- [Source: apps/api/src/services/public-insights.service.ts:144-155] — public insights skills query (same extraction pattern)
- [Source: apps/api/src/routes/analytics.routes.ts:33] — existing `/skills` route (do not collide)
- [Source: apps/api/src/routes/analytics.routes.ts:20-27] — router-level authorize (all 6 roles)
- [Source: apps/api/src/middleware/analytics-scope.ts] — AnalyticsScope type + resolution logic
- [Source: scripts/generate-xlsform.cjs:62] — `training_interest` field definition
- [Source: docs/questionnaire_schema.md:64] — `training_interest` schema confirmation

## Test Strategy

- **Backend**: 35 tests (17 service + 6 controller + 10 route + 2 taxonomy)
- **Frontend**: 16 tests (14 CrossTabSkills + 2 ThresholdGuard)
- **Total new tests**: 51
- Mock `useCrossTab` and `useSkillsInventory` hooks in component tests
- Use `vi.hoisted()` + `vi.mock()` pattern

## File List

### New Files
- `packages/types/src/skills-taxonomy.ts` — ISCO-08 sector map (extracted from ComboboxMultiSelect)
- `packages/types/src/__tests__/skills-taxonomy.test.ts`
- `apps/web/src/features/dashboard/components/charts/CrossTabTable.tsx`
- `apps/web/src/features/dashboard/components/charts/FullSkillsChart.tsx`
- `apps/web/src/features/dashboard/components/charts/SkillsCategoryChart.tsx`
- `apps/web/src/features/dashboard/components/charts/SkillsGapChart.tsx`
- `apps/web/src/features/dashboard/components/charts/SkillsConcentrationTable.tsx`
- `apps/web/src/features/dashboard/components/charts/SkillsDiversityCards.tsx`
- `apps/web/src/features/dashboard/components/ThresholdGuard.tsx`

### Modified Files
- `packages/types/src/analytics.ts` — CrossTabDimension, CrossTabMeasure, CrossTabResult, CrossTabQuery, SkillsInventoryData types
- `packages/types/src/index.ts` — re-export new types + taxonomy
- `apps/web/src/features/forms/components/ComboboxMultiSelect.tsx` — replace inline SECTOR_MAP with import from `@oslsr/types`
- `apps/api/src/services/survey-analytics.service.ts` — getCrossTab(), getSkillsInventory() methods
- `apps/api/src/controllers/analytics.controller.ts` — getCrossTab, getSkillsInventory handlers
- `apps/api/src/routes/analytics.routes.ts` — GET /analytics/cross-tab, GET /analytics/skills-inventory routes (with per-route authorize)
- `apps/web/src/features/dashboard/api/analytics.api.ts` — fetchCrossTab(), fetchSkillsInventory()
- `apps/web/src/features/dashboard/hooks/useAnalytics.ts` — useCrossTab(), useSkillsInventory()
- `SurveyAnalyticsPage.tsx` (Story 8.2) — add Cross-Tab and Skills Inventory tabs
- `OfficialStatsPage.tsx` (Story 8.2) — add Cross-Tab and Skills Inventory tabs
- `SupervisorAnalyticsPage.tsx` (Story 8.3) — add simplified Skills tab

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- SECTOR_MAP has 151 entries (not 150 as stated in story) — verified against ComboboxMultiSelect source

### Completion Notes List

- Task 0: Extracted ISCO-08 taxonomy (151 skills, 20 sectors) from ComboboxMultiSelect.tsx to packages/types/src/skills-taxonomy.ts. Refactored ComboboxMultiSelect to import from shared package. 2 unit tests pass.
- Tasks 1-3: Built cross-tabulation engine with dimensionToSql() helper mapping 8 dimensions to Drizzle SQL fragments. Supports count/rowPct/colPct/totalPct measures. Redis caching (5min TTL), threshold guard (50), suppression (< 5 → null). Routes with per-route authorize (SA/Official/Supervisor only).
- Tasks 5-7: Built skills inventory service with allSkills (full list), byCategory (ISCO-08 grouping), byLga (top 3 per LGA with window function), gapAnalysis (have vs want using skills_possessed and training_interest), diversityIndex (Shannon). Per-section threshold guards. Redis caching (10min TTL).
- Tasks 9, 15: Frontend API client (fetchCrossTab, fetchSkillsInventory) + hooks (useCrossTab with enabled gating, useSkillsInventory). ThresholdGuard reusable component with progress bar.
- Tasks 10-14: CrossTabTable with heatmap styling, dimension selectors, measure toggle, suppression banner. FullSkillsChart (vertical bar, scrollable), SkillsCategoryChart (accordion), SkillsGapChart (diverging bar), SkillsConcentrationTable, SkillsDiversityCards (color-coded). Integrated into SurveyAnalyticsPage, OfficialStatsPage (full suite), and SupervisorAnalyticsPage (simplified: FullSkills + Category only).
- 35 new backend tests (17 service + 6 controller + 10 route + 2 taxonomy). 16 new frontend tests (2 ThresholdGuard + 14 CrossTabSkills). Updated 3 existing test mocks. Total: 51 new tests.

### File List

#### New Files
- `packages/types/src/skills-taxonomy.ts`
- `packages/types/src/__tests__/skills-taxonomy.test.ts`
- `apps/api/src/services/__tests__/cross-tab-skills.service.test.ts`
- `apps/api/src/controllers/__tests__/cross-tab-skills.controller.test.ts`
- `apps/web/src/features/dashboard/components/ThresholdGuard.tsx`
- `apps/web/src/features/dashboard/components/__tests__/ThresholdGuard.test.tsx`
- `apps/web/src/features/dashboard/components/charts/CrossTabTable.tsx`
- `apps/web/src/features/dashboard/components/charts/FullSkillsChart.tsx`
- `apps/web/src/features/dashboard/components/charts/SkillsCategoryChart.tsx`
- `apps/web/src/features/dashboard/components/charts/SkillsGapChart.tsx`
- `apps/web/src/features/dashboard/components/charts/SkillsConcentrationTable.tsx`
- `apps/web/src/features/dashboard/components/charts/SkillsDiversityCards.tsx`
- `apps/web/src/features/dashboard/components/charts/__tests__/CrossTabSkills.test.tsx`

#### Modified Files
- `packages/types/src/analytics.ts` — CrossTabDimension, CrossTabMeasure, CrossTabResult, CrossTabQuery, SkillsInventoryData types
- `packages/types/src/index.ts` — re-export skills-taxonomy
- `apps/web/src/features/forms/components/ComboboxMultiSelect.tsx` — replace inline SECTOR_MAP with shared import
- `apps/api/src/services/survey-analytics.service.ts` — getCrossTab(), getSkillsInventory(), dimensionToSql(), shannonIndex()
- `apps/api/src/controllers/analytics.controller.ts` — getCrossTab, getSkillsInventory handlers + crossTabQuerySchema
- `apps/api/src/routes/analytics.routes.ts` — GET /analytics/cross-tab, GET /analytics/skills-inventory routes
- `apps/api/src/routes/__tests__/analytics.routes.test.ts` — 6 new route registration + 403 tests
- `apps/web/src/features/dashboard/api/analytics.api.ts` — fetchCrossTab(), fetchSkillsInventory()
- `apps/web/src/features/dashboard/hooks/useAnalytics.ts` — useCrossTab(), useSkillsInventory()
- `apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx` — Cross-Tab + Skills Inventory tabs
- `apps/web/src/features/dashboard/pages/OfficialStatsPage.tsx` — Cross-Tab + Skills Inventory tabs
- `apps/web/src/features/dashboard/pages/SupervisorAnalyticsPage.tsx` — simplified Skills tab
- `apps/web/src/features/dashboard/pages/__tests__/SurveyAnalyticsPage.test.tsx` — added useSkillsInventory mock
- `apps/web/src/features/dashboard/pages/__tests__/OfficialSubPages.test.tsx` — added useSkillsInventory mock
- `apps/web/src/features/dashboard/pages/__tests__/SupervisorAnalyticsPage.test.tsx` — added useSkillsInventory mock

### Change Log

- 2026-03-13: Story 8.6 implemented — Cross-tabulation engine, skills inventory with gap analysis, ISCO-08 taxonomy extraction. 51 new tests, 0 regressions.
- 2026-03-13: Code review — 3 HIGH, 4 MEDIUM, 2 LOW issues found and auto-fixed. Added loading/error states for Skills Inventory tabs, fixed gap chart legend, normalized validation error format, added stable cache key serialization, corrected taxonomy count (151 not 150).
