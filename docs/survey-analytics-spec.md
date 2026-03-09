# Survey Analytics Specification

**Date**: 2026-03-09
**Status**: Draft — awaiting agreement on scope before implementation
**Data source**: `submissions.raw_data` JSONB + `respondents` + `users` (staff hierarchy)

---

## 1. Role-Based Analytics Scoping

Every analytic described below respects a **scope chain** — the same computation, filtered differently per role:

| Role | Scope | What they see |
|------|-------|---------------|
| **Super Admin** | System-wide | All LGAs, all enumerators, all submissions |
| **Government Official** | System-wide (aggregate only) | Same data as Super Admin but **no individual staff names** — LGA-level aggregates only |
| **Supervisor** | Their LGA + their enumerators | Only submissions from enumerators assigned to them via `team_assignments` |
| **Enumerator** | Their own submissions | Personal performance stats, contribution to team/LGA totals |
| **Data Entry Clerk** | Their own submissions | Same as Enumerator scope |

This means one API endpoint like `GET /analytics/demographics` returns different result sets based on the caller's role and team assignment. No separate endpoints per role.

---

## 2. Descriptive Statistics

### 2.1 Demographic Profile

| Metric | Type | Visualization | Notes |
|--------|------|---------------|-------|
| Gender distribution | Frequency count + % | Pie/donut chart | male / female / prefer not to say |
| Age distribution | Histogram with bins | Bar chart (5-year bands: 15-19, 20-24, ..., 60+) | Derived from `dob`, compute mean, median, mode, std dev |
| Age summary statistics | Mean, median, mode, range, std dev | Stat cards | Report alongside histogram |
| Marital status | Frequency count + % | Horizontal bar | single, married, divorced, widowed, separated |
| Education level | Frequency count + % | Ordered bar chart | 9 levels from "none" to "doctorate" — keep ordinal order |
| Disability prevalence | Proportion + 95% CI | Stat card + bar | yes/no with confidence interval |
| LGA population density | Count per LGA | Choropleth map (Leaflet) | Heatmap intensity by registration count |

### 2.2 Employment & Labour Market

| Metric | Type | Visualization | Notes |
|--------|------|---------------|-------|
| Work status | Frequency + % | Stacked bar | worked / temporarily absent / seeking / available |
| Unemployment rate | Proportion + 95% CI | Stat card | (seeking + available) / total |
| Employment type | Frequency + % | Donut chart | 6 types: wage public, wage private, self-employed, contractor, unpaid family, apprentice |
| Formal vs informal | Derived ratio | Stat card | (wage public + wage private) vs (self-employed + contractor + unpaid + apprentice) |
| Years of experience | Frequency + % | Bar chart | 5 ordinal bands |
| Hours worked per week | Mean, median, percentiles (25th, 75th) | Box plot or histogram | Flag: >48 hrs = potential overwork |
| Monthly income | Mean, median, percentiles, std dev | Histogram with income bands | Bands: <20k, 20-50k, 50-100k, 100-200k, 200k+ Naira |
| Income by LGA | Median income per LGA | Ranked bar chart | Highlights regional inequality |

### 2.3 Skills Inventory

| Metric | Type | Visualization | Notes |
|--------|------|---------------|-------|
| Primary skills frequency | Count per skill (all 50+) | Horizontal bar chart (top 20, expandable) | Grouped by 8 ISCO-aligned categories |
| Skills by category | Aggregate count per category | Treemap or grouped bar | 8 categories: Construction, Automotive, Fashion, Food, Digital, Healthcare, Education, Artisan |
| Skills concentration by LGA | Top 3 skills per LGA | Table or small multiples | Reveals geographic specialization |
| Skills gap analysis | "Have" vs "Want to learn" | Diverging bar chart | Side-by-side: current skills vs desired training |
| Skill diversity index | Shannon diversity per LGA | Stat card per LGA | Higher = more diverse skill base; lower = monoculture risk |

### 2.4 Household & Economic

| Metric | Type | Visualization | Notes |
|--------|------|---------------|-------|
| Household size | Mean, median, distribution | Histogram | |
| Dependency ratio | Dependents / (household size - dependents) | Stat card + distribution | Key welfare indicator |
| Head of household | Proportion by gender | Stacked bar | Female-headed household rate is a policy-relevant metric |
| Housing status | Frequency + % | Donut chart | owned, rented, family, employer, other |
| Business ownership rate | Proportion + 95% CI | Stat card | From business_ownership yes/no |
| Registered businesses | Proportion of business owners with registration | Stat card | Policy-relevant: formalization rate |
| Apprentice employment | Total apprentices across businesses | Sum + mean per business | Youth employment indicator |

### 2.5 Data Collection & Quality (Supervisor/Enumerator Focus)

| Metric | Type | Visualization | Notes |
|--------|------|---------------|-------|
| Submissions per enumerator | Count, mean, std dev | Bar chart ranked | **Supervisor sees their team; Super Admin sees all** |
| Completion time | Mean, median, percentiles | Box plot per enumerator | Flag: <3 min = speed-run risk, >45 min = possible difficulty |
| GPS coverage rate | % submissions with valid GPS | Stat card | Measures field compliance |
| GPS cluster map | Point map of submission locations | Leaflet map with markers | **Supervisor scope = their LGA only** |
| Daily submission velocity | Time series of submissions/day | Line chart | Per-enumerator or team aggregate |
| Refusal/skip rate | % of optional questions left blank per enumerator | Table | Quality indicator — high skip rate may indicate rushing |
| NIN capture rate | % of submissions with valid 11-digit NIN | Stat card | Data completeness metric |
| Rejection rate | % flagged by fraud detection | Bar per enumerator | **Supervisor sees their team** |
| Field coverage map | Submissions overlaid on LGA boundary | Leaflet choropleth | Are enumerators covering their full assigned area? |

### 2.6 Registration Trends (Time Series)

| Metric | Type | Visualization | Notes |
|--------|------|---------------|-------|
| Daily registrations | Count per day | Line/area chart | Toggle: 7d / 30d / 90d / all-time |
| Cumulative registrations | Running total | Area chart | Shows acceleration/deceleration |
| Day-of-week pattern | Avg submissions by weekday | Bar chart | Reveals operational rhythm |
| Hour-of-day pattern | Avg submissions by hour (WAT) | Bar chart | When are enumerators most active? |
| Source channel trend | Enumerator vs Public vs Clerk over time | Stacked area chart | Channel adoption tracking |

---

## 3. Inferential Statistics

These go beyond "what happened" to "what patterns are statistically significant." Computed server-side, displayed as insights.

### 3.1 Association Tests (Chi-Square)

Test whether two categorical variables are statistically associated.

| Hypothesis | Variables | Policy relevance |
|-----------|-----------|-----------------|
| Is gender associated with employment type? | gender × employment_type | Gender equity in labour market |
| Is education level associated with employment type? | education_level × employment_type | Returns on education |
| Is LGA associated with unemployment rate? | lga × work_status(binary) | Geographic targeting for interventions |
| Is gender associated with business ownership? | gender × business_ownership | Women's economic empowerment |
| Is disability associated with employment? | disability_status × work_status | Disability inclusion in workforce |
| Is marital status associated with head-of-household? | marital_status × head_of_household | Household structure patterns |

**Output per test**: Chi-square statistic, degrees of freedom, p-value, Cramer's V (effect size), and a plain-English interpretation:
> "There is a statistically significant association between gender and employment type (chi-square = 45.2, p < 0.001, Cramer's V = 0.23 medium effect). Women are disproportionately represented in unpaid family work."

### 3.2 Correlation Analysis

Test strength of relationship between ordinal/continuous variables.

| Hypothesis | Variables | Method | Notes |
|-----------|-----------|--------|-------|
| Does education predict income? | education_level (ordinal) × monthly_income | Spearman's rho | Ordinal education → use rank correlation |
| Does experience predict income? | years_of_experience × monthly_income | Spearman's rho | Both ordinal |
| Does household size correlate with income? | household_size × monthly_income | Pearson's r | Both continuous |
| Does hours worked correlate with income? | hours_worked × monthly_income | Pearson's r | Diminishing returns? |

**Output**: Correlation coefficient, p-value, scatter plot with trend line.

### 3.3 Group Comparisons

Test whether groups differ significantly on a continuous outcome.

| Hypothesis | Groups | Outcome | Method |
|-----------|--------|---------|--------|
| Do income levels differ across LGAs? | LGA (33 groups) | monthly_income | Kruskal-Wallis (non-parametric ANOVA) |
| Do income levels differ by gender? | Gender (2-3 groups) | monthly_income | Mann-Whitney U |
| Do income levels differ by education? | Education (9 levels) | monthly_income | Kruskal-Wallis |
| Does household size differ by housing status? | Housing (5 types) | household_size | Kruskal-Wallis |
| Do hours worked differ by employment type? | Employment type (6) | hours_worked | Kruskal-Wallis |

**Output**: Test statistic, p-value, group medians, box plot visualization.
**Post-hoc**: If significant, pairwise Dunn's test with Bonferroni correction to identify which groups differ.

### 3.4 Proportion Confidence Intervals

For any binary metric, report the 95% CI to communicate precision.

| Metric | Formula | Example output |
|--------|---------|----------------|
| Unemployment rate | Wilson score interval | "12.3% (95% CI: 10.1% - 14.8%)" |
| Disability rate | Wilson score interval | "4.2% (95% CI: 3.0% - 5.8%)" |
| Business ownership rate | Wilson score interval | "28.5% (95% CI: 25.3% - 31.9%)" |
| Female head-of-household rate | Wilson score interval | "18.7% (95% CI: 15.9% - 21.8%)" |
| Formal employment rate | Wilson score interval | "34.1% (95% CI: 30.8% - 37.6%)" |

These communicate to policymakers: "we surveyed N people and the true population rate is likely between X% and Y%."

### 3.5 Regression Analysis (Advanced)

Multivariate models to identify predictors.

| Model | Outcome | Predictors | Method | Policy use |
|-------|---------|------------|--------|------------|
| Income model | monthly_income | gender, education, experience, employment_type, lga, hours_worked | Multiple linear regression (OLS) | What drives income? What's the gender pay gap controlling for education? |
| Employment model | employed (binary) | gender, education, age, lga, disability | Logistic regression | Who is most at risk of unemployment? |
| Business model | owns_business (binary) | gender, education, age, lga, marital_status | Logistic regression | What predicts entrepreneurship? |

**Output**: Coefficient table (beta, SE, p-value, 95% CI), R-squared / pseudo R-squared, model significance (F-test / likelihood ratio test).

**Implementation note**: These are computationally heavier. Options:
- **Option A**: Compute in PostgreSQL using `pg_stat` extensions (limited)
- **Option B**: Compute in Node.js using a lightweight stats library (`simple-statistics` or `jstat`)
- **Option C**: Export data → run in R/Python → cache results (most powerful but adds infrastructure)

**Recommendation**: Option B for chi-square, correlation, group comparisons (simple formulas). Option A for descriptive aggregations (SQL is fastest). Defer full regression (Option C) until sample size justifies it (n > 500).

### 3.6 Enumerator Performance Analytics (Supervisor-Scoped)

| Analysis | Method | Purpose |
|----------|--------|---------|
| Inter-enumerator reliability | Compare answer distributions across enumerators for same LGA | If enumerator A reports 90% employed but B reports 40% in the same area, one may be fabricating |
| Completion time outlier detection | Z-score per enumerator's median completion time | Flag speed-runners (< 2 SD below mean) |
| Response pattern analysis | Entropy of answer distributions per enumerator | Low entropy = same answers repeatedly = potential fraud |
| GPS dispersion | Standard deviation of GPS coordinates per enumerator | Low dispersion + high volume = stationary data fabrication |
| Coverage vs target gap | Actual submissions / daily target over time | Trend line — improving, declining, or flat? |

---

## 4. Cross-Tabulation Engine

A general-purpose "pivot table" feature — the user picks two dimensions and gets a cross-tab:

**Dimension A (rows)**: gender, age band, education, lga, employment type, marital status, housing, disability
**Dimension B (columns)**: Same list
**Measure**: Count, % of row, % of column, % of total

Example: Education Level × Employment Type cross-tab reveals which education levels feed into which employment types.

This is the single most flexible analytical tool and avoids building dozens of one-off charts. Display as a heatmap table with color intensity proportional to cell count.

---

## 5. Role-by-Role Feature Matrix

### What each role gets and WHY

| # | Feature | Super Admin | Govt Official | Assessor | Supervisor | Enumerator | Clerk | Public Insights | Rationale |
|---|---------|:-----------:|:-------------:|:--------:|:----------:|:----------:|:-----:|:---------------:|-----------|
| 1 | Demographics (gender, age, education, disability) | Full | Full | Read-only | LGA-scoped | My submissions | My submissions | Anonymized | Core labour force profile |
| 2 | Employment (work status, type, income, hours) | Full | Full | Read-only | LGA-scoped | My submissions | My submissions | Anonymized | Labour market structure |
| 3 | Skills inventory + gap analysis | Full | Full | — | LGA-scoped | — | — | Top skills only | Workforce development planning |
| 4 | Household & economic (size, housing, business) | Full | Full | — | LGA-scoped | — | — | Anonymized | Welfare indicators |
| 5 | Geographic (GPS heatmap, LGA choropleth) | Full | Full (no staff) | — | Their LGA only | — | — | LGA totals only | Spatial planning |
| 6 | Registration trends (time series) | Full | Full | — | LGA-scoped | My trend | My trend | Aggregate only | Progress tracking |
| 7 | Cross-tabulation engine | Full | Full | — | LGA-scoped | — | — | — | Flexible exploration |
| 8 | Inferential insights (chi-sq, correlation, CIs) | Full | Policy tab | — | — | — | — | Key findings only | Evidence-based policy |
| 9 | Team quality (completion time, skip rates, GPS) | All teams | — | — | Their team | — | — | — | Supervisor oversight |
| 10 | Inter-enumerator reliability | System-wide | — | Flagged items | Their team | — | — | — | Fraud/quality detection |
| 11 | Field coverage map | All LGAs | — | — | Their LGA | My GPS trail | — | — | Coverage monitoring |
| 12 | Personal performance stats | — | — | — | — | Full | Full | — | Self-monitoring |
| 13 | Registry summary strip | Full | Full | Full | LGA-scoped | — | — | — | Contextual aggregates |
| 14 | Verification pipeline analytics | Full | Read-only | Full | — | — | — | — | Assessment throughput |
| 15 | Data quality scorecard | Full | — | Relevant flags | Their team | My score | My score | — | Quality feedback loop |
| 16 | Public labour market insights | Admin view | Admin view | — | — | — | — | Public page | Transparency & trust |

**Legend**: Full = all data, LGA-scoped = filtered to their LGA/team, My = only their own submissions, Read-only = can view but not drill into staff, — = not shown

---

## 6. Current Sidebar Navigation & Where Analytics Slots In

### Current state of every role's sidebar

Source: `apps/web/src/features/dashboard/config/sidebarConfig.ts`

```
SUPER ADMIN (/dashboard/super-admin) — 12 items
├── Home                    (Home)
├── View As                 (Eye)
├── Staff Management        (Users)
├── Questionnaires          (FileText)
├── Staff Productivity      (TrendingUp)
├── Registry                (Database)         ← gets Summary Strip
├── Export Data              (Download)
├── Remuneration            (DollarSign)
├── Payment Disputes        (Scale)
├── Reveal Analytics        (Search)           ← existing analytics page (marketplace reveals only)
├── Fraud Thresholds        (SlidersHorizontal)
├── System Health           (Activity)
└── NEW → Survey Analytics  (BarChart3)        ← ADD HERE (after Reveal Analytics)

GOVERNMENT OFFICIAL (/dashboard/official) — 6 items
├── Home                    (Home)
├── Productivity            (BarChart)
├── Registry                (Database)         ← gets Summary Strip
├── Statistics              (PieChart)         ← EXISTING — currently skills distribution + LGA breakdown only
├── Trends                  (TrendingUp)
├── Export                  (Download)
└── DECISION: Expand "Statistics" page with tabs, OR add separate "Analytics" item?
    RECOMMENDATION: Expand "Statistics" — avoid sidebar bloat, already has PieChart icon

VERIFICATION ASSESSOR (/dashboard/assessor) — 6 items
├── Home                    (Home)
├── Audit Queue             (FileSearch)
├── Registry                (Database)         ← gets Summary Strip
├── Completed               (CheckCircle)
├── Evidence                (Shield)
├── Export Data              (Download)
└── NEW → Analytics         (BarChart)         ← ADD HERE (after Evidence, before Export)

SUPERVISOR (/dashboard/supervisor) — 7 items
├── Home                    (Home)
├── Team Progress           (Users)
├── Productivity            (TrendingUp)
├── Registry                (Database)         ← gets Summary Strip
├── Fraud Alerts            (AlertTriangle)
├── Messages                (MessageSquare)    [badge: unread count]
├── Payments                (Wallet)
└── NEW → Team Analytics    (BarChart)         ← ADD HERE (after Productivity, before Registry)

ENUMERATOR (/dashboard/enumerator) — 6 items
├── Home                    (Home)
├── Surveys                 (FileText)
├── Drafts                  (Save)
├── Sync Status             (RefreshCw)
├── Messages                (MessageSquare)    [badge: unread count]
├── Payments                (Wallet)
└── NEW → My Stats          (BarChart)         ← ADD HERE (after Sync Status, before Messages)

DATA ENTRY CLERK (/dashboard/clerk) — 4 items
├── Home                    (Home)
├── Entry Queue             (ListOrdered)
├── Completed               (CheckSquare)
├── My Stats                (BarChart)         ← EXISTING — currently empty placeholder
└── DECISION: Replace placeholder content with real analytics. No sidebar change needed.

PUBLIC USER (/dashboard/public) — 4 items
├── Home                    (Home)
├── Survey Status           (ClipboardList)
├── Marketplace             (Briefcase)
├── Support                 (HelpCircle)
└── No analytics for public dashboard. Public analytics go to /insights (public site).
```

### Public site navbar — "Insights" dropdown already exists

Source: `apps/web/src/layouts/components/NavDropdown.tsx`

```
PUBLIC NAVBAR (unauthenticated)
├── About ▼ (dropdown)
├── Participate ▼ (dropdown)
├── Marketplace (direct link → /marketplace)
├── Insights ▼ (dropdown)              ← EXISTS but "Coming Soon" placeholder
│   ├── Skills Map — Coming Soon
│   ├── Trends — Coming Soon
│   └── Reports — Coming Soon
├── Support ▼ (dropdown)
└── Contact (direct link)
```

**The "Insights" dropdown is already wired in the navbar.** We just need to replace the "Coming Soon" items with real pages:

```
Insights ▼ (updated)
├── Labour Force Overview    → /insights              (aggregate dashboard)
├── Skills Map               → /insights/skills       (skills distribution + gap analysis)
├── Trends                   → /insights/trends       (registration trends, employment patterns)
└── Reports                  → /insights/reports      (downloadable PDF policy briefs, Phase 4)
```

### Mobile bottom nav (all roles)

Shows first 4 sidebar items + Profile. Analytics would be accessible via:
- **Super Admin, Assessor, Supervisor**: Hamburger menu / sidebar (not in bottom 4)
- **Enumerator**: If "My Stats" is placed 4th or earlier, it appears in bottom nav
- **Clerk**: "My Stats" is already item 4 — it's in the bottom nav

---

## 6.1 Detailed Page Layouts

### Super Admin: Survey Analytics (`/dashboard/super-admin/analytics`)

New sidebar item. Full tabbed analytics page.

```
[Tab: Demographics] [Tab: Employment] [Tab: Skills] [Tab: Household] [Tab: Geographic] [Tab: Cross-Tab] [Tab: Insights]

Global filters: [LGA ▼] [Date Range] [Source ▼] [Export CSV]
```

- All tabs show system-wide data with drill-down into any LGA or enumerator
- **Insights tab** (Phase 4): Auto-generated inferential results (chi-square, correlations, CIs)
- Full cross-tabulation engine access
- Separate from existing "Reveal Analytics" (marketplace contact reveals — different concern)

### Government Official: Statistics (enhanced) (`/dashboard/official/stats`)

Existing page, currently only shows skills distribution pie + LGA breakdown. **Expand with tabs:**

```
[Tab: Overview] [Tab: Employment] [Tab: Skills] [Tab: Equity] [Tab: Policy Insights]

Global filters: [LGA ▼] [Date Range]
```

- **Overview** (new): Demographics summary — gender, age, education, disability
- **Employment** (new): Work status, employment type, income, formal/informal
- **Skills** (existing, enhanced): Current pie chart + category breakdown + gap analysis
- **Equity** (new): GPI, youth employment, disability gap, geographic equity
- **Policy Insights** (Phase 4): Plain-English inferential findings + exportable PDF briefs
- **No individual staff data anywhere** — LGA-level aggregates only

### Assessor: Analytics (`/dashboard/assessor/analytics`)

New sidebar item.

```
[Tab: Verification Pipeline] [Tab: Data Quality Flags] [Tab: Demographics]

Filter: [LGA ▼] [Severity ▼] [Date Range]
```

- **Verification Pipeline**: Throughput (reviewed/day line chart), avg review time, backlog trend, approval/rejection rates
- **Data Quality Flags**: Submissions with inter-enumerator reliability issues, suspicious patterns — helps prioritize the audit queue
- **Demographics** (read-only): Same charts as Official — baseline context for spotting anomalies
- Does NOT see: staff performance rankings, individual enumerator comparisons, team management

### Supervisor: Team Analytics (`/dashboard/supervisor/team-analytics`)

New sidebar item. Distinct from existing "Productivity" (which shows target tracking) and "Team Progress" (which shows assignment status).

```
[Tab: Data Quality] [Tab: Field Coverage] [Tab: LGA Demographics]

Filter: [Enumerator ▼] [Date Range]
```

- **Data Quality**: Completion time box plots per enumerator, skip rates, NIN capture %, GPS coverage %, inter-enumerator reliability flags
- **Field Coverage**: Leaflet map — enumerator GPS points on LGA boundary, coverage gaps highlighted
- **LGA Demographics**: Demographic/employment charts scoped to their LGA — understand the population being surveyed
- Complements existing "Productivity" (targets) and "Team Progress" (assignments) without overlap

### Enumerator: My Stats (`/dashboard/enumerator/stats`)

New sidebar item.

```
[Tab: My Performance] [Tab: My Data Quality] [Tab: My Profile]

No filters (always shows own data)
```

- **My Performance**: Daily submissions line chart, cumulative vs target, streak counter, avg completion time
- **My Data Quality**: Scorecard — GPS capture %, NIN capture %, skip rate, completion time vs team avg. Gamified green/amber/red. Composite score 0-100
- **My Profile**: Demographic breakdown of respondents surveyed — gender split, age spread, employment types. "78% male — consider reaching more women"

### Data Entry Clerk: My Stats (enhanced) (`/dashboard/clerk/stats`)

Existing sidebar item (currently empty placeholder). **Replace with real content:**

```
[Tab: My Performance] [Tab: My Data Quality]

No filters (always shows own data)
```

- **My Performance**: Entries per day, cumulative total, avg entry time
- **My Data Quality**: Completeness rate, error/flag rate, NIN capture %
- No "My Profile" tab — clerks transcribe paper forms, demographic diversity feedback less relevant

### Registry Page Enhancement (4 roles)

Add collapsible **Summary Strip** above existing `RespondentRegistryPage` table. Appears on:
- `/dashboard/super-admin/registry`
- `/dashboard/official/registry`
- `/dashboard/assessor/registry`
- `/dashboard/supervisor/registry`

```
[Total: 1,247] [Employed: 892 (71.5%)] [Female: 623 (49.9%)] [Avg Age: 34] [With Business: 312 (25.0%)]
```

Updates live as user changes existing registry filters. Scoped to role's data access level.

### Public Insights Page (`/insights`)

Replaces "Coming Soon" placeholder in public navbar. Unauthenticated, anonymized.

```
Route: /insights (PublicLayout)

[Hero: "Oyo State Labour Force at a Glance"]
  - Counter animation: total registered, LGAs covered
  - Gender split pie, age distribution bar

[Section: Employment Landscape]
  - Employment type donut, formal/informal stat card
  - Unemployment estimate with 95% CI

[Section: Skills & Training]
  - Top 10 skills bar chart
  - Skills gap: have vs want diverging bar

[Section: Geographic Distribution]
  - LGA choropleth map (density only, no GPS points)

[Section: Methodology & Trust]
  - Sample size, collection method, update frequency
  - "Data updated daily" badge
```

Sub-pages (from navbar dropdown):
- `/insights` — main dashboard (above)
- `/insights/skills` — expanded skills map with all 50+ skills, category breakdown
- `/insights/trends` — registration trends, time series
- `/insights/reports` — downloadable PDF policy briefs (Phase 4)

**API**: `GET /api/v1/public/insights` — pre-computed, 1-hour cache, no auth, no filters (prevents enumeration).

---

## 7. Technical Architecture

### Backend

```
apps/api/src/
  services/survey-analytics.service.ts    ← SQL aggregations on raw_data JSONB
  services/statistical-tests.service.ts   ← Chi-square, correlation, CIs (using simple-statistics)
  services/verification-analytics.service.ts ← Assessor pipeline metrics
  controllers/analytics.controller.ts     ← Role-scoped authenticated endpoints
  controllers/public-insights.controller.ts ← Unauthenticated public endpoint
  routes/analytics.routes.ts              ← Authenticated route definitions
  routes/public-insights.routes.ts        ← Public route (no auth middleware)
```

**Authenticated endpoints (role-scoped):**

| Endpoint | Roles | Returns |
|----------|-------|---------|
| `GET /analytics/demographics` | All (scoped) | Gender, age, education, marital, disability frequencies + summary stats |
| `GET /analytics/employment` | All (scoped) | Work status, employment type, income, hours frequencies + summary stats |
| `GET /analytics/skills` | SA, Official, Supervisor | Skill frequencies, category aggregates, gap analysis |
| `GET /analytics/household` | SA, Official, Supervisor | Household size, dependents, housing, business frequencies |
| `GET /analytics/geographic` | SA, Official, Supervisor | GPS point data (not for Official), LGA aggregates |
| `GET /analytics/trends` | All (scoped) | Time series at configurable granularity |
| `GET /analytics/cross-tab` | SA, Official, Supervisor | Dynamic pivot: `?rowDim=gender&colDim=employment_type` |
| `GET /analytics/insights` | SA, Official | Pre-computed inferential test results |
| `GET /analytics/team-quality` | SA, Supervisor | Enumerator comparison, reliability, completion times |
| `GET /analytics/my-stats` | Enumerator, Clerk | Personal performance + data quality scorecard |
| `GET /analytics/verification-pipeline` | SA, Official (read), Assessor | Throughput, backlog, approval rates, avg review time |
| `GET /analytics/registry-summary` | SA, Official, Assessor, Supervisor | 5 stat cards for registry page header |

**Public endpoint (no auth, cached):**

| Endpoint | Returns |
|----------|---------|
| `GET /api/v1/public/insights` | Pre-computed aggregate stats: total registered, gender split, top skills, employment breakdown, LGA density. 1-hour cache TTL. No filters (prevents enumeration). |

**All authenticated endpoints accept**: `?lgaId=&dateFrom=&dateTo=&source=&enumeratorId=`

### Frontend

```
apps/web/src/features/dashboard/
  pages/AnalyticsPage.tsx                 ← Shared tabbed layout, role-aware tab visibility
  pages/SupervisorAnalyticsPage.tsx       ← Team-specific analytics
  pages/AssessorAnalyticsPage.tsx         ← Verification pipeline + quality flags
  pages/EnumeratorStatsPage.tsx           ← Personal stats (replaces placeholder)
  pages/ClerkStatsPage.tsx                ← Updated with real metrics (replaces placeholder)
  components/charts/
    DemographicCharts.tsx                 ← Gender pie, age histogram, education bar
    EmploymentCharts.tsx                  ← Employment donut, income histogram, hours box plot
    SkillsCharts.tsx                      ← Skills bar, category treemap, gap diverging bar
    HouseholdCharts.tsx                   ← Household histogram, housing donut
    CrossTabTable.tsx                     ← Heatmap pivot table
    InsightsPanel.tsx                     ← Plain-English inferential results
    TeamQualityCharts.tsx                 ← Enumerator comparison charts (Supervisor)
    FieldCoverageMap.tsx                  ← Leaflet GPS map (Supervisor)
    VerificationPipelineCharts.tsx        ← Assessor throughput, backlog trend
    DataQualityScorecard.tsx              ← Personal quality score (Enumerator/Clerk)
    RegistrySummaryStrip.tsx              ← 5-card summary for registry page
  hooks/useAnalytics.ts                   ← TanStack Query hooks for all endpoints
  api/analytics.api.ts                    ← API client functions

apps/web/src/features/insights/
  pages/PublicInsightsPage.tsx            ← Public route /insights (no auth)
  components/
    LabourForceOverview.tsx               ← Counter animation, headline stats
    PublicSkillsChart.tsx                  ← Top skills bar (anonymized)
    PublicEmploymentChart.tsx              ← Employment breakdown (anonymized)
    PublicLgaMap.tsx                       ← LGA choropleth (density only)
    MethodologyNote.tsx                    ← Sample size, methodology, update badge
  api/publicInsights.api.ts               ← Fetch from /public/insights (no auth header)
```

### Dependencies

| Package | Purpose | Status |
|---------|---------|--------|
| `recharts` | Charts (bar, line, pie, area, scatter, box plot) | Already installed |
| `react-leaflet` | Geographic maps | Already installed |
| `simple-statistics` | Chi-square, correlation, regression, CIs | **New — ~15KB gzipped** |

One new dependency. Everything else reuses existing infrastructure.

---

## 8. Implementation Phases

### Phase 1: Descriptive Foundation + Public Insights (MVP)
- `survey-analytics.service.ts` with SQL aggregations on `raw_data` JSONB
- Demographics + Employment tabs (Super Admin + Official)
- Registry summary strip (4 roles)
- Public Insights page (`/insights`) with anonymized aggregates
- ~7 chart components reusing existing Recharts patterns

### Phase 2: Supervisor/Enumerator/Clerk Analytics
- Team quality endpoint (scoped by `team_assignments`)
- Supervisor analytics page (team overview, data quality, field coverage map)
- Enumerator stats page with data quality scorecard (replaces placeholder)
- Clerk stats page with real metrics (replaces placeholder)
- GPS field coverage map (Leaflet)

### Phase 3: Assessor + Skills + Cross-Tabulation
- Assessor verification pipeline analytics (throughput, backlog, approval rates)
- Assessor data quality flags view (inter-enumerator reliability issues feed into verification queue)
- Skills inventory tab with category grouping
- Skills gap analysis (have vs want)
- Cross-tabulation engine (dynamic pivot)

### Phase 4: Inferential Insights
- `statistical-tests.service.ts` with chi-square, correlation, Mann-Whitney, Kruskal-Wallis
- Insights tab for Super Admin + Government Official
- Confidence intervals on all proportion metrics
- Policy brief PDF export
- Public Insights page gets "Key Findings" section (anonymized inferential results)

### Phase 5: Advanced (deferred until n > 500)
- Regression models (income predictors, employment predictors)
- Inter-enumerator reliability scoring
- Automated anomaly detection in answer distributions
- Assessor: AI-assisted priority scoring for verification queue

---

## 9. Additional Analyses (beyond the original 17)

### 9.1 Verification Pipeline Analytics (Assessor)

| Metric | Type | Purpose |
|--------|------|---------|
| Daily review throughput | Count reviewed / day (line chart) | Track assessor productivity |
| Avg review time | Median minutes per review | Identify bottleneck assessors |
| Backlog trend | Pending queue size over time | Predict when backlog clears |
| Approval/rejection rate | Proportions with trend | Quality signal — high rejection = data collection problems |
| Rejection reasons | Frequency of reason codes | What types of issues are most common? |
| Time-to-resolution | Median days from submission to final verdict | SLA tracking |
| Assessor inter-rater agreement | Cohen's Kappa across assessors reviewing same cases | If 2 assessors disagree on same case, calibration needed |

### 9.2 Data Quality Scorecard (Enumerator/Clerk personal feedback)

| Metric | Score | What it means |
|--------|-------|---------------|
| GPS capture rate | % of submissions with valid GPS | Were you in the field? |
| NIN capture rate | % with valid 11-digit NIN | Data completeness |
| Completion time | Your avg vs team avg | Too fast = rushing, too slow = struggling |
| Skip rate | % optional questions left blank | Are you asking all questions? |
| Rejection rate | % flagged by fraud/quality | Are your submissions passing verification? |
| Respondent diversity | Gender ratio, age spread | Are you sampling broadly? |
| **Composite score** | Weighted average (0-100) | Gamified quality indicator — "Your data quality score: 87/100" |

### 9.3 Temporal Pattern Analysis

| Metric | Method | Purpose |
|--------|--------|---------|
| Seasonality detection | Compare weekday vs weekend, month-over-month | Registration patterns linked to agricultural/market cycles |
| Campaign effectiveness | Before/after analysis around public awareness campaigns | Did the radio ad drive public registrations? |
| Enrollment velocity forecasting | Simple linear projection | "At current rate, 50,000 registrations by March 2027" |

### 9.4 Equity & Inclusion Metrics (Government Official focus)

| Metric | Formula | Policy use |
|--------|---------|-----------|
| Gender Parity Index (GPI) | Female registrations / Male registrations | Target: 0.97-1.03 for parity |
| Youth employment rate | Employed aged 15-35 / Total aged 15-35 | Youth bulge indicator |
| Disability inclusion rate | Employed disabled / Total disabled vs employed non-disabled / Total non-disabled | Disability employment gap |
| Education-employment alignment | % employed in jobs matching their education tier | Over/under-qualification rate |
| Geographic equity (Gini coefficient) | Distribution of registrations across LGAs | Are some LGAs being neglected? |
| Informal sector size | Informal / Total employment | Formalization opportunity |

---

## 10. Sample Size Considerations

| Analysis type | Minimum n | Current n | Ready? |
|--------------|-----------|-----------|--------|
| Frequency distributions | 30 | TBD (starting fresh) | After first day of enumeration |
| Cross-tabulations (2×2) | 50 | TBD | After first 2 days |
| Chi-square tests | 100 (5+ per cell) | TBD | After first week |
| Correlation analysis | 50-100 | TBD | After first week |
| Group comparisons (3+ groups) | 20 per group | TBD | After 2 weeks |
| Regression (5 predictors) | 200+ | TBD | After 1 month |
| Regression (10 predictors) | 500+ | TBD | Phase 5 |

The system should display "Insufficient data for this analysis (need N more responses)" when sample size thresholds aren't met, rather than showing misleading results.

---

## 11. Complete Feature List (for agreement)

Consolidated list of all features across all roles. Check (Y) = include, (N) = defer, (?) = discuss.

### Descriptive Analytics

| # | Feature | Roles | Phase |
|---|---------|-------|-------|
| D1 | Gender distribution (pie/donut) | All 6 roles (scoped) + Public | 1 |
| D2 | Age distribution histogram + mean/median/std dev | All 6 + Public | 1 |
| D3 | Education level bar chart | All 6 + Public | 1 |
| D4 | Marital status breakdown | SA, Official, Assessor, Supervisor | 1 |
| D5 | Disability prevalence with 95% CI | SA, Official, Assessor, Supervisor + Public | 1 |
| D6 | LGA registration density choropleth (Leaflet) | SA, Official, Supervisor (their LGA) + Public | 1 |
| D7 | Work status breakdown | All 6 + Public | 1 |
| D8 | Employment type donut | All 6 + Public | 1 |
| D9 | Formal vs informal employment ratio | SA, Official + Public | 1 |
| D10 | Years of experience bar chart | SA, Official, Supervisor | 1 |
| D11 | Hours worked histogram + percentiles | SA, Official, Supervisor | 1 |
| D12 | Monthly income distribution (bands) | SA, Official, Supervisor | 1 |
| D13 | Income by LGA (ranked bar) | SA, Official | 1 |
| D14 | Primary skills frequency (all 50+) | SA, Official, Supervisor + Public (top 10) | 3 |
| D15 | Skills by category (8 groups) | SA, Official, Supervisor | 3 |
| D16 | Skills concentration by LGA | SA, Official | 3 |
| D17 | Skills gap: have vs want-to-learn | SA, Official + Public | 3 |
| D18 | Skill diversity index (Shannon) | SA, Official | 3 |
| D19 | Household size distribution | SA, Official, Supervisor | 1 |
| D20 | Dependency ratio | SA, Official | 1 |
| D21 | Head of household by gender | SA, Official | 1 |
| D22 | Housing status breakdown | SA, Official, Supervisor | 1 |
| D23 | Business ownership rate with CI | SA, Official + Public | 1 |
| D24 | Business registration rate | SA, Official | 1 |
| D25 | Apprentice employment totals | SA, Official | 1 |

### Time Series & Trends

| # | Feature | Roles | Phase |
|---|---------|-------|-------|
| T1 | Daily registration trend (7/30/90d) | SA, Official, Supervisor, Enum, Clerk | 1 |
| T2 | Cumulative registration curve | SA, Official + Public | 1 |
| T3 | Day-of-week submission pattern | SA, Official, Supervisor | 2 |
| T4 | Hour-of-day submission pattern | SA, Supervisor | 2 |
| T5 | Source channel trend (enum/public/clerk) | SA, Official | 1 |
| T6 | Enrollment velocity forecast | SA, Official | 4 |
| T7 | Seasonality detection | SA, Official | 5 |
| T8 | Campaign effectiveness (before/after) | SA, Official | 5 |

### Supervisor/Team Analytics

| # | Feature | Roles | Phase |
|---|---------|-------|-------|
| S1 | Submissions per enumerator (ranked bar) | SA, Supervisor | 2 |
| S2 | Completion time box plots per enumerator | SA, Supervisor | 2 |
| S3 | GPS coverage rate per enumerator | SA, Supervisor | 2 |
| S4 | GPS cluster map (Leaflet, LGA-scoped) | SA, Supervisor | 2 |
| S5 | Daily submission velocity per enumerator | SA, Supervisor | 2 |
| S6 | Skip/refusal rate per enumerator | SA, Supervisor | 2 |
| S7 | NIN capture rate per enumerator | SA, Supervisor | 2 |
| S8 | Rejection/fraud flag rate per enumerator | SA, Supervisor | 2 |
| S9 | Field coverage map (GPS on LGA boundary) | SA, Supervisor | 2 |
| S10 | Inter-enumerator reliability (distribution comparison) | SA, Supervisor, Assessor (flags) | 3 |
| S11 | Response pattern entropy per enumerator | SA, Supervisor | 5 |
| S12 | GPS dispersion (std dev of coordinates) | SA, Supervisor | 5 |

### Enumerator/Clerk Personal Stats

| # | Feature | Roles | Phase |
|---|---------|-------|-------|
| P1 | My daily submissions line chart | Enumerator, Clerk | 2 |
| P2 | My cumulative progress vs target | Enumerator, Clerk | 2 |
| P3 | My avg completion time vs team avg | Enumerator, Clerk | 2 |
| P4 | My GPS capture rate | Enumerator | 2 |
| P5 | My data quality composite score (0-100) | Enumerator, Clerk | 2 |
| P6 | My respondent demographic diversity | Enumerator | 2 |
| P7 | My NIN capture rate | Enumerator, Clerk | 2 |
| P8 | My skip rate | Enumerator, Clerk | 2 |

### Assessor/Verification Analytics

| # | Feature | Roles | Phase |
|---|---------|-------|-------|
| V1 | Daily review throughput (line chart) | SA, Assessor | 3 |
| V2 | Avg review time (median minutes) | SA, Assessor | 3 |
| V3 | Backlog trend (queue size over time) | SA, Assessor | 3 |
| V4 | Approval/rejection rate with trend | SA, Official (read), Assessor | 3 |
| V5 | Rejection reason frequency | SA, Assessor | 3 |
| V6 | Time-to-resolution (submission → verdict) | SA, Assessor | 3 |
| V7 | Inter-rater agreement (Cohen's Kappa) | SA | 5 |

### Inferential Statistics

| # | Feature | Roles | Phase |
|---|---------|-------|-------|
| I1 | Chi-square: gender × employment type | SA, Official + Public (finding only) | 4 |
| I2 | Chi-square: education × employment type | SA, Official | 4 |
| I3 | Chi-square: LGA × unemployment | SA, Official | 4 |
| I4 | Chi-square: gender × business ownership | SA, Official | 4 |
| I5 | Chi-square: disability × employment | SA, Official + Public (finding only) | 4 |
| I6 | Chi-square: marital status × head of household | SA, Official | 4 |
| I7 | Correlation: education vs income (Spearman) | SA, Official | 4 |
| I8 | Correlation: experience vs income (Spearman) | SA, Official | 4 |
| I9 | Correlation: household size vs income (Pearson) | SA, Official | 4 |
| I10 | Correlation: hours vs income (Pearson) | SA, Official | 4 |
| I11 | Group comparison: income across LGAs (Kruskal-Wallis) | SA, Official | 4 |
| I12 | Group comparison: income by gender (Mann-Whitney) | SA, Official | 4 |
| I13 | Group comparison: income by education (Kruskal-Wallis) | SA, Official | 4 |
| I14 | Proportion CIs: unemployment, disability, business, formal employment | SA, Official + Public | 4 |
| I15 | Regression: income predictors (OLS) | SA, Official | 5 |
| I16 | Regression: employment predictors (logistic) | SA, Official | 5 |
| I17 | Regression: business ownership predictors (logistic) | SA, Official | 5 |

### Equity & Inclusion (Government Official focus)

| # | Feature | Roles | Phase |
|---|---------|-------|-------|
| E1 | Gender Parity Index (GPI) | SA, Official + Public | 1 |
| E2 | Youth employment rate (15-35) | SA, Official + Public | 1 |
| E3 | Disability employment gap | SA, Official | 4 |
| E4 | Education-employment alignment | SA, Official | 4 |
| E5 | Geographic equity (Gini coefficient) | SA, Official | 4 |
| E6 | Informal sector size | SA, Official + Public | 1 |

### Cross-Cutting

| # | Feature | Roles | Phase |
|---|---------|-------|-------|
| X1 | Cross-tabulation engine (any × any) | SA, Official, Supervisor | 3 |
| X2 | Registry summary strip (5 stat cards) | SA, Official, Assessor, Supervisor | 1 |
| X3 | Public Insights page (/insights) | Unauthenticated | 1 |
| X4 | Export chart data as CSV | All roles with analytics | 1 |
| X5 | Policy brief PDF export | SA, Official | 4 |

---

**Totals: 80 features across 5 phases, 6 authenticated roles + 1 public page**

| Phase | Features | Focus |
|-------|----------|-------|
| Phase 1 | 28 | Descriptive foundation + Public Insights page |
| Phase 2 | 20 | Supervisor/Enumerator/Clerk team & personal analytics |
| Phase 3 | 16 | Assessor pipeline + Skills + Cross-tabulation |
| Phase 4 | 13 | Inferential statistics + equity metrics |
| Phase 5 | 3 | Regression + advanced anomaly detection |
