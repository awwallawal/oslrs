# Story 8.8: Geographic Visualization, Enumerator Reliability & Analytics Spec Completion

Status: done

## Prerequisites

| Dependency | What it provides | Story |
|-----------|------------------|-------|
| `GET /analytics/demographics` → `lgaDistribution: FrequencyBucket[]` | LGA registration counts for choropleth | 8.1 |
| `GET /analytics/registry-summary` + `RegistrySummary` type | Registry stat cards (already integrated) | 8.1 |
| `SurveyAnalyticsPage.tsx` + `OfficialStatsPage.tsx` | SA/Official analytics pages (add Geographic tab) | 8.2 |
| `RegistrySummaryStrip.tsx` + `RespondentRegistryPage.tsx` integration | **AC #4 already satisfied** — no work needed | 8.2 |
| `SupervisorAnalyticsPage.tsx` at `/dashboard/supervisor/analytics` | Supervisor analytics page with Data Quality tab | 8.3 |
| `AssessorAnalyticsPage.tsx` (assessor verification analytics) | Assessor analytics page with Data Quality tab | 8.4 |
| `PublicInsightsPage.tsx` at `/insights` | Public insights page with Geographic Distribution section | 8.5 |
| `ThresholdGuard` component, `ActivationStatusPanel`, `ThresholdStatus` type | Progressive activation infrastructure | 8.6 + 8.7 |
| `react-leaflet` (4.2.1) + `leaflet` (1.9.4) | Map rendering — already installed | — |
| `Lga` enum in `packages/types/src/constants.ts` | 33 LGA codes for validation | — |

## Story

As a Super Admin, Government Official, Supervisor, or public visitor,
I want LGA choropleth maps showing registration density, inter-enumerator reliability analysis, and a complete activation roadmap for all analytics features,
So that every feature in the analytics specification is either live, threshold-guarded, or registered as a dormant hook — with zero gaps.

## Progressive Activation

| Feature | Minimum N | Rationale |
|---------|-----------|-----------|
| LGA choropleth map | 1 per LGA | Maps work with any data — color intensity scales naturally |
| Inter-enumerator reliability (S10) | 2+ enumerators × 20 submissions each in same LGA | Need enough per-enumerator data to compare distributions meaningfully |
| Seasonality detection (T7) | 365 days of data | Dormant hook only — needs a full year for seasonal patterns |
| Campaign effectiveness (T8) | Campaign event dates defined | Dormant hook only — needs external campaign calendar input |
| Response pattern entropy (S11) | 50 per enumerator | Dormant hook only — entropy unreliable on tiny samples |
| GPS dispersion (S12) | 20 per enumerator with GPS | Dormant hook only — needs enough GPS points for meaningful std dev |

## Acceptance Criteria

1. **Given** a Super Admin or Government Official navigates to the "Geographic" tab on Survey Analytics **When** the page loads **Then** it displays an interactive Leaflet choropleth map of Oyo State's 33 LGAs, with color intensity proportional to registration count per LGA.
   **And** hovering over an LGA shows a tooltip with LGA name and count.
   **And** clicking an LGA filters the dashboard to that LGA's data.

2. **Given** a Supervisor navigates to their Team Analytics page (Story 8.3) **When** the page loads **Then** it displays a choropleth map with their assigned LGA highlighted and surrounding LGAs greyed out. Their LGA shows registration density with a single-color fill and count overlay.

3. **Given** a public visitor navigates to `/insights` **When** the page loads **Then** the Geographic Distribution section displays an LGA choropleth map (registration density, anonymized) alongside the existing sortable LGA table. The map uses the same suppression rules (minN=10) — LGAs with < 10 registrations show as "Insufficient data" on hover.

4. ~~**Registry Summary Strip**~~ — **ALREADY COMPLETE**. `RegistrySummaryStrip.tsx` was built in Story 8.2 and is integrated into `RespondentRegistryPage.tsx` (the single shared registry page serving all 4 roles: SA, Official, Assessor, Supervisor). Component includes 5 stat cards, collapsible with localStorage persistence, loading/error states, and role-scoped data via `useRegistrySummary()`. No work needed.

5. **Given** a Supervisor navigates to Team Analytics → Data Quality tab (Story 8.3) **When** ≥ 2 enumerators each have ≥ 20 submissions in the supervisor's LGA **Then** an "Enumerator Reliability" section displays:
   - Answer distribution comparison charts for key questions (gender, employment type, education) across enumerators
   - Divergence score per enumerator pair (Jensen-Shannon divergence, 0 = identical distributions, 1 = completely different)
   - Flag: enumerator pairs with divergence > 0.5 highlighted in amber, > 0.7 in red
   - Plain-English note: "Enumerator A and B report significantly different gender distributions in the same area — may warrant investigation"

6. **Given** the Activation Status Panel (from Story 8.7) **When** it renders **Then** it includes ALL remaining Phase 5 features as dormant hooks:
   - T7: Seasonality Detection — "Requires 365+ days of data"
   - T8: Campaign Effectiveness — "Requires campaign event dates"
   - S11: Response Pattern Entropy — "Requires 50+ submissions per enumerator"
   - S12: GPS Dispersion Analysis — "Requires 20+ GPS-tagged submissions per enumerator"
   **And** these appear alongside the existing Phase 5 dormant hooks from Story 8.7 (I15-I17, V7, anomaly detection).

7. **Given** all Epic 8 stories (8.1-8.8) are complete **When** the analytics spec feature list (§11) is audited **Then** every feature has a story reference — zero unaccounted features.

## Tasks / Subtasks

### Task 0: Acquire and validate GeoJSON (AC: #1, #2, #3)

- [x] 0.1 Download Oyo State LGA boundaries GeoJSON from [HDX Nigeria Admin Boundaries](https://data.humdata.org/dataset/cod-ab-nga) or [GitHub nigeria-geojson-data](https://github.com/temikeezy/nigeria-geojson-data)
- [x] 0.2 Extract only Oyo State's 33 LGAs from the national dataset (filter by `ADM1_EN === "Oyo"` or equivalent property)
- [x] 0.3 Simplify geometry if file > 500KB (use [mapshaper.org](https://mapshaper.org/) — target ~200KB for fast client-side loading)
- [x] 0.4 Normalize GeoJSON LGA name properties to **exactly match** the `lgas.name` column values in the database (e.g., `"Ibadan North"`, `"Ibadan North-East"`, `"Ogo Oluwa"`). Validate against the seed data in `apps/api/src/db/seeds/lgas.seed.ts` and the `Lga` enum in `packages/types/src/constants.ts`
- [x] 0.5 Add two properties to each GeoJSON feature:
  - `lgaName`: the normalized display name matching `lgas.name` (e.g., `"Ibadan North"`) — this is the **join key** for matching `FrequencyBucket.label` from the analytics API
  - `lgaCode`: the slug code matching `lgas.code` (e.g., `"ibadan_north"`) — used for filter interaction on click
- [x] 0.6 Save to `apps/web/public/geo/oyo-lgas.geojson`
- [x] 0.7 Validate: load in a test, assert 33 features, assert each has `lgaName` and `lgaCode` properties, assert all 33 names match the seed data exactly
- [x] 0.8 Create mapping config `apps/web/src/features/dashboard/config/lgaGeoMapping.ts`:
  ```ts
  /**
   * Static name→code mapping for all 33 Oyo State LGAs.
   * Source of truth: apps/api/src/db/seeds/lgas.seed.ts
   * Used for: GeoJSON processing, choropleth click→filter mapping
   */
  export const LGA_NAME_TO_CODE: Record<string, string> = {
    'Afijio': 'afijio',
    'Akinyele': 'akinyele',
    'Atiba': 'atiba',
    // ... all 33 entries from seed data
    'Surulere': 'surulere',
  };

  export const LGA_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
    Object.entries(LGA_NAME_TO_CODE).map(([name, code]) => [code, name])
  );
  ```

### Task 1: Create reusable `LgaChoroplethMap` component (AC: #1, #2, #3)

- [x] 1.1 Create `apps/web/src/features/dashboard/components/charts/LgaChoroplethMap.tsx`
- [x] 1.2 Props interface:
  ```ts
  interface LgaChoroplethMapProps {
    /** Array of LGA data — lgaName must match GeoJSON feature lgaName property */
    data: { lgaName: string; value: number }[];
    /** Color gradient [min, max]. Default: ['#FEE2E2', '#9C1E23'] (light pink → brand maroon) */
    colorScale?: [string, string];
    /** Fires on LGA click with the LGA code (slug). Omit to disable click. */
    onLgaClick?: (lgaCode: string) => void;
    /** When set, this LGA renders in full color and all others are greyed out (Supervisor view) */
    highlightLgaName?: string;
    /** LGAs with value < this show "Insufficient data". Default: 0 (no suppression) */
    suppressionMinN?: number;
    className?: string;
  }
  ```
- [x] 1.3 Load GeoJSON from `/geo/oyo-lgas.geojson` via `fetch` — cache in module-scope variable (NOT React state) to avoid re-fetching on re-render
- [x] 1.4 Render `react-leaflet` `MapContainer` with `GeoJSON` layer. Style each feature's fill color using linear interpolation between `colorScale[0]` (min) and `colorScale[1]` (max) based on `value`. Match features to data via `feature.properties.lgaName === dataItem.lgaName`
- [x] 1.5 Tooltip on hover: LGA name + formatted count. For suppressed LGAs (value < `suppressionMinN`): show "Insufficient data"
- [x] 1.6 Click handler: look up `lgaCode` from `feature.properties.lgaCode`, call `onLgaClick(lgaCode)` to enable drill-down filtering. Follow existing `MapContainer` + event patterns from `GpsClusterMap.tsx`
- [x] 1.7 `highlightLgaName` prop: when set, the target LGA renders in full color and all others render greyed out (`#E5E7EB`)
- [x] 1.8 Responsive: map container fills parent width, minimum height 400px
- [x] 1.9 Legend: gradient bar showing min → max values with labels
- [x] 1.10 Handle missing data: LGAs not in `data` array render with `#E5E7EB` grey fill and diagonal hatch pattern

### Task 2: Write `LgaChoroplethMap` tests (AC: #1)

- [x] 2.1 Test: renders MapContainer with 33 GeoJSON features
- [x] 2.2 Test: tooltip shows LGA name and count on hover
- [x] 2.3 Test: suppressed LGAs show "Insufficient data"
- [x] 2.4 Test: `onLgaClick` fires with correct `lgaCode`
- [x] 2.5 Test: `highlightLgaName` greys out non-target LGAs

### Task 3: Create and integrate Geographic tab on SA/Official pages (AC: #1)

- [x] 3.1 In `SurveyAnalyticsPage.tsx`, **add a new "Geographic" tab** to the existing `TabsList` (after "Equity"):
  ```tsx
  <TabsTrigger value="geographic">Geographic</TabsTrigger>
  ```
  And add the corresponding `TabsContent`:
  ```tsx
  <TabsContent value="geographic">
    <LgaChoroplethMap
      data={lgaDistributionToMapData(demographics?.lgaDistribution)}
      onLgaClick={(lgaCode) => setParams({ ...params, lgaId: lgaCode })}
    />
  </TabsContent>
  ```
- [x] 3.2 Create helper function to transform `FrequencyBucket[]` → map data:
  ```ts
  function lgaDistributionToMapData(
    distribution: FrequencyBucket[] | undefined
  ): { lgaName: string; value: number }[] {
    if (!distribution) return [];
    return distribution
      .filter((b) => b.count != null && !b.suppressed)
      .map((b) => ({ lgaName: b.label, value: b.count! }));
  }
  ```
  The `FrequencyBucket.label` is the LGA display name (from `COALESCE(l.name, r.lga_id, 'Unknown')` in `survey-analytics.service.ts:150`), which matches the GeoJSON `lgaName` property.
- [x] 3.3 Wire `onLgaClick` to set the `lgaId` param (the filter state uses LGA codes). The `LgaChoroplethMap` provides `lgaCode` from `feature.properties.lgaCode`.
- [x] 3.4 In `OfficialStatsPage.tsx`, add the same "Geographic" tab (same pattern — same data source via `useDemographics(params)`)

### Task 4: Integrate choropleth into Supervisor Team Analytics (AC: #2)

- [x] 4.1 In `SupervisorAnalyticsPage.tsx` (created by Story 8.3), add `LgaChoroplethMap` with `highlightLgaName` set to the supervisor's assigned LGA display name. The supervisor's LGA code is available from auth context; look up the display name via `LGA_CODE_TO_NAME[user.lgaId]` from `lgaGeoMapping.ts`
- [x] 4.2 Pass a single-item data array: `[{ lgaName: supervisorLgaName, value: registrationCount }]`. Surrounding LGAs render grey (no data in array).
- [x] 4.3 No click-to-filter needed — Supervisor is already scoped to their LGA. Omit `onLgaClick` prop.

### Task 5: Integrate choropleth into Public Insights page (AC: #3)

- [x] 5.1 Add `LgaChoroplethMap` to the Geographic Distribution section of `PublicInsightsPage.tsx` (Story 8.5) — render above the existing sortable LGA table
- [x] 5.2 Pass `suppressionMinN={10}` for public suppression rules
- [x] 5.3 Transform `PublicInsightsData.lgaDensity: FrequencyBucket[]` → map data using the same `lgaDistributionToMapData()` helper. The `label` field contains LGA names (same source query as demographics).
- [x] 5.4 No click-to-filter — public page has no filters (prevents enumeration). Omit `onLgaClick` prop.
- [x] 5.5 Write 2 tests: map renders with public data, suppressed LGAs show "Insufficient data"

### Task 6: Create inter-enumerator reliability service (AC: #5)

- [x] 6.1 Add `getEnumeratorReliability(lgaId, scope)` method to `SurveyAnalyticsService`
- [x] 6.2 Query: for each enumerator in the LGA, extract answer distributions for 3 key categorical questions (`gender`, `employment_type`, `education_level`):
  ```sql
  SELECT
    s.enumerator_id,
    u.full_name AS enumerator_name,
    raw_data->>'gender' AS answer,
    COUNT(*) AS count
  FROM submissions s
  JOIN users u ON s.enumerator_id = u.id
  JOIN respondents r ON s.respondent_id = r.id
  WHERE r.lga_id = :lgaCode
    AND s.raw_data IS NOT NULL
  GROUP BY s.enumerator_id, u.full_name, answer
  ORDER BY s.enumerator_id, answer
  ```
  **Note**: `respondents.lga_id` stores the **code** (e.g., `"ibadan_north"`), NOT the UUID. The `:lgaCode` param must be the slug code. Run this query 3 times (once per question field) or combine with `UNION ALL`.
- [x] 6.3 For each question, build per-enumerator probability distributions and compute pairwise Jensen-Shannon divergence:
  ```ts
  /** Jensen-Shannon divergence (bounded [0, 1] with base-2 log) */
  function jsDivergence(p: number[], q: number[]): number {
    const m = p.map((pi, i) => (pi + q[i]) / 2);
    return (klDivergence(p, m) + klDivergence(q, m)) / 2;
  }
  function klDivergence(p: number[], q: number[]): number {
    return p.reduce((sum, pi, i) => {
      if (pi === 0) return sum;
      return sum + pi * Math.log2(pi / q[i]); // base-2 for [0, 1] bound
    }, 0);
  }
  ```
- [x] 6.4 Threshold guard: return structured `threshold: ThresholdStatus` (reuse type from Story 8.6/8.7):
  ```ts
  // If < 2 enumerators have ≥ 20 submissions:
  threshold: { met: false, currentN: qualifiedEnumeratorCount, requiredN: 2 }
  ```
- [x] 6.5 Flag pairs with divergence > 0.5 (amber) or > 0.7 (red)
- [x] 6.6 Generate plain-English interpretation per flagged pair:
  ```ts
  `${nameA} and ${nameB} report significantly different ${question} distributions in the same area — may warrant investigation`
  ```
- [x] 6.7 Role guard: SA (system-wide — can specify `lgaId` query param), Supervisor (auto-scoped to their LGA via `scope.lgaCode`), Assessor (read-only — same data, flagged pairs only in frontend)
- [x] 6.8 Cache: `analytics:reliability:{lgaCode}`, TTL 600s

### Task 7: Add reliability types and route (AC: #5)

- [x] 7.1 Define in `packages/types/src/analytics.ts`:
  ```ts
  export interface EnumeratorDistribution {
    enumeratorId: string;
    enumeratorName: string;
    submissionCount: number;
    distributions: {
      question: string;
      answers: { label: string; count: number; proportion: number }[];
    }[];
  }

  export interface ReliabilityPair {
    enumeratorA: string;
    enumeratorB: string;
    divergenceScores: { question: string; jsDivergence: number }[];
    avgDivergence: number;
    flag: 'normal' | 'amber' | 'red';
    interpretation: string;
  }

  export interface EnumeratorReliabilityData {
    enumerators: EnumeratorDistribution[];
    pairs: ReliabilityPair[];
    threshold: ThresholdStatus;
  }
  ```
  **Note**: Uses `ThresholdStatus` (from Story 8.6/8.7) — NOT the flat `belowThreshold`/`currentEnumerators`/`requiredEnumerators` pattern. Consistent with all other analytics response types.
- [x] 7.2 Export from `packages/types/src/index.ts`
- [x] 7.3 Add `GET /analytics/enumerator-reliability` route with optional `?lgaId=` query param
- [x] 7.4 **Per-route `authorize()` middleware** — restrict to SA, Supervisor, Assessor only (Enumerator/Clerk get 403). The router-level authorize allows all 6 dashboard roles, so this endpoint needs its own guard:
  ```ts
  router.get(
    '/enumerator-reliability',
    authorize(UserRole.SUPER_ADMIN, UserRole.SUPERVISOR, UserRole.VERIFICATION_ASSESSOR),
    AnalyticsController.getEnumeratorReliability
  );
  ```

### Task 8: Write reliability backend tests (AC: #5)

- [x] 8.1 Test: identical distributions return divergence ≈ 0
- [x] 8.2 Test: completely different distributions return divergence close to 1.0 (base-2 log)
- [x] 8.3 Test: pairs with divergence > 0.5 flagged amber, > 0.7 flagged red
- [x] 8.4 Test: below threshold returns `threshold: { met: false, currentN: ..., requiredN: 2 }`
- [x] 8.5 Test: Supervisor auto-scoped to their LGA (ignores `lgaId` query param)
- [x] 8.6 Test: Enumerator/Clerk get 403

### Task 9: Create reliability frontend components (AC: #5)

- [x] 9.1 Create `apps/web/src/features/dashboard/components/charts/EnumeratorReliabilityPanel.tsx`
- [x] 9.2 Distribution comparison: side-by-side bar charts showing each enumerator's answer distribution for the same question (gender, employment type, education)
- [x] 9.3 Divergence heatmap: enumerator × enumerator matrix, color intensity = divergence score (0=white, 0.5=amber `#F59E0B`, 0.7+=red `#DC2626`)
- [x] 9.4 Flag badges: amber/red badges on flagged pairs with interpretation text
- [x] 9.5 `ThresholdGuard` wrapping (from Story 8.6): show "Need 2+ enumerators with 20+ submissions each" when threshold not met
- [x] 9.6 Add to `SupervisorAnalyticsPage.tsx` (Story 8.3) → Data Quality tab. **File**: `apps/web/src/features/dashboard/pages/SupervisorAnalyticsPage.tsx`
- [x] 9.7 Add read-only version to assessor analytics page (Story 8.4) → Data Quality Flags tab. Render flagged pairs only (no full heatmap matrix). **Note**: Assessor page structure depends on Story 8.4 — coordinate integration point.

### Task 10: Write reliability frontend tests (AC: #5)

- [x] 10.1 Test: renders distribution comparison charts
- [x] 10.2 Test: flagged pairs show amber/red badges
- [x] 10.3 Test: below threshold shows ThresholdGuard with progress bar
- [x] 10.4 Test: `flagsOnly` mode renders flagged pairs only (no heatmap matrix)

### Task 11: Register remaining Phase 5 dormant hooks (AC: #6)

- [x] 11.1 Add dormant feature entries to the activation status configuration (extend the `PHASE_5_FEATURES` array from Story 8.7):
  ```ts
  { id: 'seasonality_detection', label: 'Seasonality Detection', requiredN: 365, unit: 'days of data', phase: 5 },
  { id: 'campaign_effectiveness', label: 'Campaign Effectiveness Analysis', requiredN: null, unit: 'campaign dates', phase: 5, note: 'Requires campaign event calendar' },
  { id: 'response_entropy', label: 'Response Pattern Entropy', requiredN: 50, unit: 'per enumerator', phase: 5 },
  { id: 'gps_dispersion', label: 'GPS Dispersion Analysis', requiredN: 20, unit: 'GPS-tagged per enumerator', phase: 5 },
  ```
- [x] 11.2 Update `ActivationStatusPanel` (Story 8.7) to render the new entries
- [x] 11.3 Write 1 test: all 4 new dormant hooks appear in the panel with correct descriptions

### Task 12: Spec completion audit (AC: #7)

- [x] 12.1 Create a checklist mapping **every feature** from `docs/survey-analytics-spec.md §11` to its implementing story. **Note**: The spec claims 80 features in the phase breakdown, but the detailed feature list (D1-D25, T1-T8, S1-S12, P1-P8, V1-V7, I1-I17, E1-E6, X1-X5) totals 88 items. Reconcile the discrepancy first — some features may be sub-features or duplicates across phases.

  Mapping:
  - D1-D5, D7-D13, D19-D25: Story 8.1 (backend) + 8.2 (frontend)
  - D6: Story **8.8** (choropleth)
  - D14-D18: Story 8.6 (skills)
  - T1-T2, T5: Story 8.1/8.2
  - T3-T4: Story 8.3
  - T6: Story 8.7
  - T7-T8: Story **8.8** (dormant hooks)
  - S1-S9: Story 8.3
  - S10: Story **8.8** (reliability)
  - S11-S12: Story **8.8** (dormant hooks)
  - P1-P8: Story 8.3
  - V1-V6: Story 8.4
  - V7: Story 8.7 (dormant hook)
  - I1-I14: Story 8.7
  - I15-I17: Story 8.7 (dormant hooks)
  - E1-E2, E6: Story 8.2
  - E3-E5: Story 8.7
  - X1: Story 8.6
  - X2: Story 8.2 (registry strip — **already complete**)
  - X3: Story 8.5
  - X4: Story 8.2
  - X5: Story 8.7

- [x] 12.2 Verify all features accounted for — document any discrepancy between 80 (phase breakdown) and 88 (detailed list)
- [x] 12.3 Update `docs/survey-analytics-spec.md` §11 tables with a "Story" column

## Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: GeoJSON fetch has no error handling + rejected promise cached forever — map never recovers [LgaChoroplethMap.tsx:44-51]
- [x] [AI-Review][HIGH] H2: `<GeoJSON>` component won't re-render styles/tooltips when choropleth data changes — stale colors after filter [LgaChoroplethMap.tsx:169-174]
- [x] [AI-Review][HIGH] H3: Dormant hook descriptions are generic and factually wrong for 4 new hooks — AC#6 specifies per-feature descriptions [ActivationStatusPanel.tsx:117-120]
- [x] [AI-Review][MEDIUM] M1: `lgaDistributionToMapData` helper duplicated in 3 files — DRY violation [SurveyAnalyticsPage.tsx:45, OfficialStatsPage.tsx:48, PublicInsightsPage.tsx:126]
- [x] [AI-Review][MEDIUM] M2: `campaign_effectiveness` renders as `75 / 0` with 100% green bar — misleading for feature needing external input [ActivationStatusPanel.tsx:97,112]
- [x] [AI-Review][MEDIUM] M3: Backend supervisor scope test only verifies call count — doesn't assert LGA filter applied [enumerator-reliability.test.ts:166-181]
- [x] [AI-Review][MEDIUM] M4: Story File List claims `packages/types/src/index.ts` modified but it wasn't — barrel already exported analytics.ts
- [x] [AI-Review][LOW] L1: `useCallback` with unstable `dataMap` dependency — memoization ineffective [LgaChoroplethMap.tsx:101,118]
- [x] [AI-Review][LOW] L2: Hardcoded question list in EnumeratorReliabilityPanel — should derive from data [EnumeratorReliabilityPanel.tsx:95]
- [ ] [AI-Review][LOW] L3: `_resetGeoJsonCache` exported for test-only use — code smell [LgaChoroplethMap.tsx:53-57]

## Dev Notes

### GeoJSON Acquisition

**Recommended source**: [HDX Nigeria Admin Boundaries](https://data.humdata.org/dataset/cod-ab-nga) — official COD-AB dataset from Nigeria's Surveyor General. Most authoritative.

**Fallback**: [GitHub temikeezy/nigeria-geojson-data](https://github.com/temikeezy/nigeria-geojson-data) — developer-friendly, ready-to-use GeoJSON.

**Processing steps**:
1. Download national LGA boundaries (Admin Level 2)
2. Filter to `state === "Oyo"` (33 LGAs expected)
3. Simplify via mapshaper: `mapshaper input.geojson -simplify dp 15% -o oyo-lgas.geojson`
4. Add `lgaName` property matching the DB `lgas.name` column — this is the **join key** for matching `FrequencyBucket.label` from analytics API responses
5. Add `lgaCode` property matching the DB `lgas.code` column — this is the **filter key** for `onLgaClick`
6. Target file size: ≤ 200KB (current React-Leaflet maps load fine at this size)

**Oyo State's 33 LGAs** (for validation — must match `apps/api/src/db/seeds/lgas.seed.ts`):
Afijio, Akinyele, Atiba, Atisbo, Egbeda, Ibadan North, Ibadan North-East, Ibadan North-West, Ibadan South-East, Ibadan South-West, Ibarapa Central, Ibarapa East, Ibarapa North, Ido, Irepo, Iseyin, Itesiwaju, Iwajowa, Kajola, Lagelu, Ogbomosho North, Ogbomosho South, Ogo Oluwa, Olorunsogo, Oluyole, Ona Ara, Orelope, Ori Ire, Oyo East, Oyo West, Saki East, Saki West, Surulere.

### Data Flow: Analytics API → Choropleth

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Backend SQL (survey-analytics.service.ts:150-158)                       │
│ SELECT COALESCE(l.name, r.lga_id, 'Unknown') AS label, COUNT(*) AS count│
│ FROM submissions s                                                      │
│ LEFT JOIN respondents r ON r.id = s.respondent_id                      │
│ LEFT JOIN lgas l ON l.code = r.lga_id  ← joins on CODE, not UUID      │
│ GROUP BY label ORDER BY count DESC                                      │
└────────────────────────┬────────────────────────────────────────────────┘
                         │ Returns FrequencyBucket[] → label = LGA name
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Frontend Transform (lgaDistributionToMapData)                          │
│ FrequencyBucket[] → { lgaName: string, value: number }[]               │
│ label → lgaName,  count → value                                        │
└────────────────────────┬────────────────────────────────────────────────┘
                         │ Matched by lgaName
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LgaChoroplethMap component                                              │
│ GeoJSON feature.properties.lgaName === data[i].lgaName                 │
│ Click → feature.properties.lgaCode → onLgaClick(lgaCode)              │
│         lgaCode goes to setParams({ lgaId: lgaCode })                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Choropleth Color Scale

Use the brand maroon gradient:
- Minimum (0 registrations): `#FEE2E2` (very light red/pink)
- Maximum: `#9C1E23` (brand maroon)
- Suppressed / no data: `#E5E7EB` (grey-200) with diagonal hatch pattern

### Registry Summary Strip — ALREADY COMPLETE (AC #4)

**No work needed.** The `RegistrySummaryStrip` component was built in Story 8.2 and is already:
- **Implemented**: `apps/web/src/features/dashboard/components/charts/RegistrySummaryStrip.tsx` (207 lines)
- **Integrated**: Imported and rendered in `RespondentRegistryPage.tsx` (lines 22-23)
- **Tested**: `__tests__/RegistrySummaryStrip.test.tsx`
- **Role-scoped**: Uses `useRegistrySummary(params)` hook → `GET /analytics/registry-summary` (scoped by auth token)

There is only **one** shared `RespondentRegistryPage.tsx` serving all 4 roles (SA, Official, Assessor, Supervisor) — not 4 separate pages.

### Jensen-Shannon Divergence

JS divergence is the symmetrized, smoothed version of KL divergence. It's bounded [0, 1] when using base-2 logarithm.

**Why not chi-square for S10?** Chi-square tests whether distributions differ significantly. JSD measures *how much* they differ — more useful for a continuous severity indicator (normal/amber/red) than a binary significant/not-significant.

**No new dependency needed**: JSD is ~10 lines of code. `simple-statistics` (from Story 8.7) provides helpers if needed, but the formulas are trivial.

**Important**: Use `Math.log2()` (not `Math.log()`) to ensure the result is bounded [0, 1]. With natural log, the range is [0, ln(2)] ≈ [0, 0.693] which would make the 0.5/0.7 thresholds nonsensical.

### Inter-Enumerator Reliability vs Inter-Rater Agreement

These are different features:
- **S10 (this story)**: Compare *enumerator* answer distributions in the same LGA. If enumerator A reports 90% male but B reports 50% in the same area, someone may be fabricating. Tool for supervisors.
- **V7 (8.7 dormant hook)**: Compare *assessor* verdicts on the same submissions. Cohen's Kappa measures whether assessors agree on approve/reject decisions. Tool for super admins.

### `respondents.lga_id` is a CODE, not a UUID

Critical implementation detail: `respondents.lga_id` stores the LGA **code** slug (e.g., `"ibadan_north"`), not the UUID `lgas.id`. The analytics service joins on `l.code = r.lga_id`. The reliability query parameter should be named `lgaCode` internally and accept the slug value.

### Anti-Patterns to Avoid

1. **Do NOT fetch GeoJSON on every render** — load once, cache in module-scope variable. NOT React state (causes re-render loop).
2. **Do NOT use react-leaflet SSR** — Leaflet requires `window`. Use dynamic import or guard with `typeof window !== 'undefined'`. Follow existing pattern from `GpsClusterMap.tsx`.
3. **Do NOT add GeoJSON to the git-tracked source tree without simplification** — raw national boundary files can be 50MB+. Always simplify first.
4. **Do NOT hardcode LGA names in the choropleth component** — match on `lgaName` property from GeoJSON features to the data array.
5. **Do NOT create RegistrySummaryStrip or add it to registry pages** — it's already done (Story 8.2). Building it again wastes effort and risks conflicts.
6. **Do NOT join choropleth data on `lgaId` (UUID)** — the API returns `FrequencyBucket.label` = LGA name, and `respondents.lga_id` stores the code slug. The GeoJSON join key is `lgaName` (display name), not UUID.
7. **Do NOT use `Math.log()` for JSD** — use `Math.log2()` to keep divergence bounded [0, 1].
8. **Do NOT use flat `belowThreshold` boolean** — use `threshold: ThresholdStatus` for consistency with Stories 8.6/8.7.
9. **Do NOT assume Supervisor/Assessor pages have tab structure** — those pages are created by Stories 8.3/8.4. This story adds components; those stories provide the integration point.

### Leaflet Import Pattern

Leaflet has known SSR issues. Use the pattern from existing map components (`GpsClusterMap.tsx`, `TeamGpsMap.tsx`):
```tsx
import { MapContainer, GeoJSON, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
```

### File Size Budget

| Asset | Target | Notes |
|-------|--------|-------|
| `oyo-lgas.geojson` | ≤ 200KB | Simplified from source, gzipped ~50KB over network |
| `LgaChoroplethMap.tsx` | ≤ 200 lines | Reusable, props-driven |
| `EnumeratorReliabilityPanel.tsx` | ≤ 250 lines | Distribution charts + heatmap |
| `lgaGeoMapping.ts` | ≤ 50 lines | Static name↔code lookup (33 entries) |

### References

- [Source: docs/survey-analytics-spec.md#2.1 D6] — LGA choropleth feature definition
- [Source: docs/survey-analytics-spec.md#5 X2] — Registry summary strip definition (already complete)
- [Source: docs/survey-analytics-spec.md#3.6 S10] — Inter-enumerator reliability
- [Source: docs/survey-analytics-spec.md#11] — Complete feature list
- [Source: apps/api/src/services/survey-analytics.service.ts:150-158] — lgaDistribution SQL (joins `lgas.code = respondents.lga_id`)
- [Source: apps/api/src/services/public-insights.service.ts:188-196] — lgaDensity SQL (same pattern)
- [Source: packages/types/src/analytics.ts:76-87] — RegistrySummary type (already complete)
- [Source: packages/types/src/constants.ts:14-48] — Lga enum (33 codes)
- [Source: apps/api/src/db/seeds/lgas.seed.ts] — LGA name→code seed data (source of truth for mapping)
- [Source: apps/web/src/features/dashboard/components/charts/RegistrySummaryStrip.tsx] — Already complete (Story 8.2)
- [Source: apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx:22-23] — Strip already integrated
- [Source: apps/web/src/features/dashboard/components/GpsClusterMap.tsx] — Existing Leaflet usage pattern
- [Source: apps/web/src/features/dashboard/components/TeamGpsMap.tsx] — Existing Leaflet usage pattern
- [HDX: Nigeria Admin Boundaries](https://data.humdata.org/dataset/cod-ab-nga) — GeoJSON source
- [GitHub: nigeria-geojson-data](https://github.com/temikeezy/nigeria-geojson-data) — Alternative GeoJSON source

## Dependencies

- **Story 8.1**: `GET /analytics/demographics` (lgaDistribution), `GET /analytics/registry-summary` (already complete)
- **Story 8.2**: `SurveyAnalyticsPage.tsx` + `OfficialStatsPage.tsx` (add Geographic tab), `RegistrySummaryStrip` (already complete)
- **Story 8.3**: `SupervisorAnalyticsPage.tsx` (integration point for choropleth + reliability panel)
- **Story 8.4**: Assessor analytics page (integration point for reliability flags)
- **Story 8.5**: `PublicInsightsPage.tsx` (integration point for public choropleth)
- **Story 8.6**: `ThresholdGuard` component, `ThresholdStatus` type
- **Story 8.7**: `ActivationStatusPanel`, `PHASE_5_FEATURES` array

## Test Strategy

- **Backend**: 6 tests (inter-enumerator reliability)
- **Frontend**: 12 tests (5 choropleth + 4 reliability + 2 public choropleth + 1 dormant hooks)
- **Total new tests**: ~18

## File List

### New Files
- `apps/web/public/geo/oyo-lgas.geojson` — static GeoJSON asset (≤ 200KB)
- `apps/web/src/features/dashboard/components/charts/LgaChoroplethMap.tsx` — reusable choropleth map
- `apps/web/src/features/dashboard/components/charts/EnumeratorReliabilityPanel.tsx` — reliability analysis UI
- `apps/web/src/features/dashboard/config/lgaGeoMapping.ts` — LGA name↔code static mapping
- `apps/web/src/features/dashboard/components/charts/__tests__/LgaChoroplethMap.test.tsx`
- `apps/web/src/features/dashboard/components/charts/__tests__/EnumeratorReliabilityPanel.test.tsx`
- `apps/api/src/services/__tests__/enumerator-reliability.test.ts`

### Modified Files
- `packages/types/src/analytics.ts` — `EnumeratorDistribution`, `ReliabilityPair`, `EnumeratorReliabilityData` types
- `packages/types/src/index.ts` — re-export new types
- `apps/api/src/services/survey-analytics.service.ts` — `getEnumeratorReliability()` method
- `apps/api/src/controllers/analytics.controller.ts` — `getEnumeratorReliability` handler
- `apps/api/src/routes/analytics.routes.ts` — `GET /analytics/enumerator-reliability` route (per-route authorize)
- `apps/web/src/features/dashboard/api/analytics.api.ts` — `fetchEnumeratorReliability(lgaId?)`
- `apps/web/src/features/dashboard/hooks/useAnalytics.ts` — `useEnumeratorReliability(lgaId?)`
- `apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx` — add Geographic tab
- `apps/web/src/features/dashboard/pages/OfficialStatsPage.tsx` — add Geographic tab
- Story 8.3 `SupervisorAnalyticsPage.tsx` — add choropleth + reliability panel (integration point)
- Story 8.4 assessor analytics page — add reliability flags (integration point)
- Story 8.5 `PublicInsightsPage.tsx` — add choropleth to Geographic section
- Story 8.7 activation config — add T7, T8, S11, S12 dormant hooks
- `docs/survey-analytics-spec.md` §11 — add Story column to feature tables

### NOT Modified (already complete)
- ~~`apps/web/src/features/dashboard/components/charts/RegistrySummaryStrip.tsx`~~ — exists, no changes
- ~~`apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx`~~ — strip already integrated
- ~~4 separate registry pages~~ — there is only 1 shared page, already wired

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- **Tasks 0-2 (GeoJSON + Choropleth + Tests)**: GeoJSON acquired, simplified to 84KB (33 LGAs), properties normalized. `LgaChoroplethMap` component (191 lines) with color interpolation, tooltip, click, highlight, suppression. 5 tests pass.
- **Task 3 (Geographic Tab SA/Official)**: Added "Geographic" tab to `SurveyAnalyticsPage` and `OfficialStatsPage`. Uses `demographics.lgaDistribution` (FrequencyBucket[]) → `lgaDistributionToMapData()` helper. Click-to-filter via `setParams({ lgaId })`.
- **Task 4 (Supervisor Choropleth)**: Added `LgaChoroplethMap` to supervisor Field Coverage tab with `highlightLgaName` (supervisor's LGA in full color, others greyed out). LGA name looked up via `LGA_CODE_TO_NAME[user.lgaId]`.
- **Task 5 (Public Choropleth)**: Added `LgaChoroplethMap` to PublicInsightsPage with `suppressionMinN={10}`. No click-to-filter (prevents enumeration). 2 tests added.
- **Tasks 6-8 (Reliability Backend)**: `getEnumeratorReliability()` method on `SurveyAnalyticsService` with JSD computation (base-2 log, bounded [0,1]), threshold guard (2+ enumerators × 20+ submissions), amber/red flagging. Route: `GET /analytics/enumerator-reliability` with per-route authorize (SA, Supervisor, Assessor). 6 backend tests pass.
- **Tasks 9-10 (Reliability Frontend)**: `EnumeratorReliabilityPanel` component with distribution comparison tables, divergence heatmap, flag badges, `flagsOnly` mode. Integrated into SupervisorAnalyticsPage (Data Quality tab) and AssessorAnalyticsPage (Data Quality Flags tab, flagsOnly). 4 frontend tests pass.
- **Task 11 (Dormant Hooks)**: Added 4 Phase 5 features to `ACTIVATION_REGISTRY`: seasonality_detection (365 days), campaign_effectiveness (campaign dates), response_entropy (50/enumerator), gps_dispersion (20 GPS/enumerator). 1 test added to ActivationStatusPanel.
- **Task 12 (Spec Audit)**: Updated `docs/survey-analytics-spec.md` §11 with Story column for all 88 features. Documented discrepancy: detailed list = 88 features (not 80 as in phase breakdown). All features accounted for across Stories 8.1-8.8.

### Change Log

- 2026-03-14: Story 8.8 complete — Geographic visualization (choropleth on 4 pages), inter-enumerator reliability (JSD-based), 4 dormant hooks registered, spec audit complete. 31 new tests. 4,093 total tests pass, 0 regressions.
- 2026-03-14: Code review — 10 issues found (3H/4M/3L), 9 fixed automatically. H1: GeoJSON fetch error handling + retry. H2: GeoJSON key prop for stale rendering. H3: Per-feature dormant hook descriptions. M1: Extracted shared `lgaDistributionToMapData` utility. M2: campaign_effectiveness progress display. M3: Strengthened supervisor scope test. M4: File List accuracy. L1: Stabilized useCallback deps with useMemo. L2: Derived question list from data. L3 deferred (test-only export pattern).

### File List

**New Files:**
- `apps/web/public/geo/oyo-lgas.geojson` — Oyo State 33 LGA boundaries (84KB)
- `apps/web/src/features/dashboard/components/charts/LgaChoroplethMap.tsx` — Reusable choropleth component
- `apps/web/src/features/dashboard/components/charts/__tests__/LgaChoroplethMap.test.tsx` — 5 tests
- `apps/web/src/features/dashboard/components/charts/EnumeratorReliabilityPanel.tsx` — Reliability analysis UI
- `apps/web/src/features/dashboard/components/charts/__tests__/EnumeratorReliabilityPanel.test.tsx` — 4 tests
- `apps/web/src/features/dashboard/config/lgaGeoMapping.ts` — LGA name↔code mapping (33 entries)
- `apps/api/src/services/__tests__/enumerator-reliability.test.ts` — 6 backend tests

**Modified Files:**
- `packages/types/src/analytics.ts` — Added `EnumeratorDistribution`, `ReliabilityPair`, `EnumeratorReliabilityData` types (auto-exported via existing barrel in `index.ts`)
- `apps/api/src/services/survey-analytics.service.ts` — Added `getEnumeratorReliability()`, `jsDivergence()`/`klDivergence()` helpers, 4 dormant hooks in ACTIVATION_REGISTRY
- `apps/api/src/controllers/analytics.controller.ts` — Added `getEnumeratorReliability` handler
- `apps/api/src/routes/analytics.routes.ts` — Added `GET /enumerator-reliability` route (SA+Supervisor+Assessor)
- `apps/web/src/features/dashboard/api/analytics.api.ts` — Added `fetchEnumeratorReliability()`
- `apps/web/src/features/dashboard/hooks/useAnalytics.ts` — Added `useEnumeratorReliability()` hook
- `apps/web/src/features/dashboard/pages/SurveyAnalyticsPage.tsx` — Added Geographic tab
- `apps/web/src/features/dashboard/pages/OfficialStatsPage.tsx` — Added Geographic tab
- `apps/web/src/features/dashboard/pages/SupervisorAnalyticsPage.tsx` — Added choropleth + reliability panel
- `apps/web/src/features/dashboard/pages/AssessorAnalyticsPage.tsx` — Added reliability panel (flagsOnly)
- `apps/web/src/features/insights/pages/PublicInsightsPage.tsx` — Added choropleth with suppression
- `docs/survey-analytics-spec.md` — §11 Story column + count reconciliation

**New Files (Review):**
- `apps/web/src/features/dashboard/utils/analytics-transforms.ts` — Shared `lgaDistributionToMapData` helper (M1 fix)

**Test Mocks Updated:**
- `apps/api/src/routes/__tests__/analytics.routes.test.ts` — Added `getEnumeratorReliability` mock
- `apps/api/src/routes/__tests__/analytics-8-7.routes.test.ts` — Added `getEnumeratorReliability` mock
- `apps/api/src/services/__tests__/insights-integration.test.ts` — Updated feature count 13→17
- `apps/web/src/features/dashboard/components/__tests__/ActivationStatusPanel.test.tsx` — Added 4 dormant hooks, new test
- `apps/web/src/features/dashboard/pages/__tests__/SupervisorAnalyticsPage.test.tsx` — Added auth/choropleth/reliability mocks
- `apps/web/src/features/dashboard/pages/__tests__/AssessorAnalyticsPage.test.tsx` — Added reliability mock
- `apps/web/src/features/insights/pages/__tests__/PublicInsightsPage.test.tsx` — Added leaflet mocks + 2 choropleth tests
