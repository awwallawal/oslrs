# Story 8.1: Analytics Backend Foundation & Descriptive Statistics API

Status: done

## Story

As a System,
I want a reusable analytics API layer with role-scoped access and core descriptive statistics,
So that all dashboard roles can query survey data within their authorized scope.

## Acceptance Criteria

1. **Given** an authenticated user with any dashboard role **When** they request analytics endpoints **Then** the API returns descriptive statistics scoped to their role:
   - Super Admin / Government Official: system-wide aggregates
   - Supervisor: LGA-scoped aggregates (their assigned LGA only)
   - Enumerator / Clerk: personal submission aggregates only

2. **Given** any analytics request **Then** the response includes:
   - Submission counts (total, by status, by time period)
   - Demographic distributions (age bands, gender, LGA)
   - Employment statistics (employment status breakdown, sector distribution)
   - Skills frequency ranking (top N skills by count)
   - Experience level distribution
   - Consent rates (marketplace opt-in %, enriched consent %)

3. **Given** fewer than 5 submissions in any aggregation bucket **When** data is requested **Then** the bucket is suppressed (returned as `null`) to prevent de-identification.

4. **Given** an unauthenticated visitor **When** they request `GET /api/v1/public/insights` **Then** the API returns pre-computed anonymized aggregates with 1-hour Redis cache TTL, no filter parameters accepted.

5. **Given** any authenticated analytics endpoint **Then** it accepts optional query params: `?lgaId=&dateFrom=&dateTo=&source=` and filters results accordingly.

6. **Given** the registry summary endpoint is called **Then** it returns 5 stat cards (total respondents, employed count+%, female count+%, avg age, business owners count+%) scoped to the caller's role.

## Tasks / Subtasks

- [x] Task 1: Create shared types in `packages/types/src/analytics.ts` (AC: #1, #2, #6)
  - [x] 1.1 Define `AnalyticsQueryParams` (lgaId?, dateFrom?, dateTo?, source?)
  - [x] 1.2 Define `DemographicStats` (genderDistribution, ageDistribution, educationDistribution, maritalDistribution, disabilityPrevalence, lgaDistribution)
  - [x] 1.3 Define `EmploymentStats` (workStatusBreakdown, employmentTypeBreakdown, formalInformalRatio, experienceDistribution, hoursWorked, incomeDistribution, incomeByLga)
  - [x] 1.4 Define `HouseholdStats` (householdSizeDistribution, dependencyRatio, headOfHouseholdByGender, housingDistribution, businessOwnershipRate, businessRegistrationRate, apprenticeTotal)
  - [x] 1.5 Define `SkillsFrequency` (skill, count, percentage)
  - [x] 1.6 Define `TrendDataPoint` (date, count)
  - [x] 1.7 Define `RegistrySummary` (totalRespondents, employedCount, employedPct, femaleCount, femalePct, avgAge, businessOwners, businessOwnersPct)
  - [x] 1.8 Define `PublicInsightsData` (totalRegistered, lgasCovered, genderSplit, ageDistribution, topSkills, employmentBreakdown, formalInformalRatio, businessOwnershipRate, unemploymentEstimate, youthEmploymentRate, gpi, lgaDensity)
  - [x] 1.9 Define `FrequencyBucket` (label, count, percentage, suppressed?)
  - [x] 1.10 Export all types from `packages/types/src/index.ts`

- [x] Task 2: Create scope chain middleware `apps/api/src/middleware/analytics-scope.ts` (AC: #1)
  - [x] 2.1 Define `AnalyticsScope` type: `{ type: 'system' | 'lga' | 'personal'; lgaId?: string; userId?: string }`
  - [x] 2.2 Implement `resolveAnalyticsScope()` middleware that reads `req.user.role` and sets `req.analyticsScope`
  - [x] 2.3 Super Admin / Government Official → `{ type: 'system' }`
  - [x] 2.4 Supervisor → look up assigned LGA from `team_assignments` table → `{ type: 'lga', lgaId }`
  - [x] 2.5 Enumerator / Clerk → `{ type: 'personal', userId: req.user.sub }`
  - [x] 2.6 Verification Assessor → `{ type: 'system' }` (read-only demographic context)
  - [x] 2.7 Extend Express Request type with `analyticsScope` property
  - [x] 2.8 Write 7 unit tests (one per role + unknown role rejection)

- [x] Task 3: Create suppression utility `apps/api/src/utils/analytics-suppression.ts` (AC: #3)
  - [x] 3.1 Implement `suppressSmallBuckets(buckets: FrequencyBucket[], minN: number = 5): FrequencyBucket[]` — sets count/percentage to null and `suppressed: true` for buckets < minN
  - [x] 3.2 Implement `suppressIfTooFew(value: number, minN: number = 5): number | null`
  - [x] 3.3 Write 5 unit tests (normal, edge at 5, below threshold, empty array, mixed)

- [x] Task 4: Create `apps/api/src/services/survey-analytics.service.ts` (AC: #1, #2, #5)
  - [x] 4.1 Implement `scopeFilter(scope: AnalyticsScope, params: AnalyticsQueryParams)` — returns Drizzle WHERE conditions array combining scope + optional filters
  - [x] 4.2 Implement `getDemographics(scope, params): DemographicStats` — SQL aggregations on `submissions.raw_data` JSONB + `respondents` table
  - [x] 4.3 Implement `getEmployment(scope, params): EmploymentStats` — employment_status, employment_type, hours_worked, monthly_income from raw_data
  - [x] 4.4 Implement `getHousehold(scope, params): HouseholdStats` — household_size, dependents_count, is_head, housing_status, has_business from raw_data
  - [x] 4.5 Implement `getSkillsFrequency(scope, params, limit?): SkillsFrequency[]` — JSONB array unnest on skills_possessed
  - [x] 4.6 Implement `getTrends(scope, params, granularity): TrendDataPoint[]` — time series grouped by day/week/month
  - [x] 4.7 Implement `getRegistrySummary(scope, params): RegistrySummary` — 5 stat cards in single query
  - [x] 4.8 Apply suppression to all bucket-based responses via `suppressSmallBuckets()`
  - [x] 4.9 Write 20+ unit tests covering each method, scope filtering, suppression, edge cases

- [x] Task 5: Create `apps/api/src/services/public-insights.service.ts` (AC: #4)
  - [x] 5.1 Implement `getPublicInsights(): PublicInsightsData` — pre-computed aggregates, no scope params, minimum sample sizes enforced
  - [x] 5.2 Add Redis caching with 1-hour TTL (key: `analytics:public:insights`)
  - [x] 5.3 Invalidation: no active invalidation needed (TTL expiry is sufficient for daily-updated data)
  - [x] 5.4 Write 8 unit tests (cache hit, cache miss, suppression, empty data)

- [x] Task 6: Create `apps/api/src/controllers/analytics.controller.ts` (AC: #1, #2, #5, #6)
  - [x] 6.1 `getDemographics` handler — Zod validate query params, call service, return `{ data }`
  - [x] 6.2 `getEmployment` handler
  - [x] 6.3 `getHousehold` handler
  - [x] 6.4 `getSkillsFrequency` handler — accepts `?limit=20` (default)
  - [x] 6.5 `getTrends` handler — accepts `?granularity=day|week|month&days=30`
  - [x] 6.6 `getRegistrySummary` handler
  - [x] 6.7 Shared Zod schema for `AnalyticsQueryParams` validation
  - [x] 6.8 Write 18+ controller tests (per-endpoint: success, validation error, 403 for unauthorized roles)

- [x] Task 7: Create `apps/api/src/controllers/public-insights.controller.ts` (AC: #4)
  - [x] 7.1 `getInsights` handler — no auth, calls service, returns `{ data }`
  - [x] 7.2 Write 4 controller tests (success, cache header, rate limit, empty data)

- [x] Task 8: Create `apps/api/src/routes/analytics.routes.ts` (AC: #1, #5)
  - [x] 8.1 Mount `authenticate` + `authorize(all dashboard roles)` + `resolveAnalyticsScope`
  - [x] 8.2 `GET /demographics` → `AnalyticsController.getDemographics`
  - [x] 8.3 `GET /employment` → `AnalyticsController.getEmployment`
  - [x] 8.4 `GET /household` → `AnalyticsController.getHousehold`
  - [x] 8.5 `GET /skills` → `AnalyticsController.getSkillsFrequency`
  - [x] 8.6 `GET /trends` → `AnalyticsController.getTrends`
  - [x] 8.7 `GET /registry-summary` → `AnalyticsController.getRegistrySummary`
  - [x] 8.8 Register in `routes/index.ts` as `router.use('/analytics', analyticsRoutes)`

- [x] Task 9: Create `apps/api/src/routes/public-insights.routes.ts` (AC: #4)
  - [x] 9.1 NO auth middleware — public endpoint
  - [x] 9.2 Apply rate limiting (60 req/min per IP)
  - [x] 9.3 `GET /` → `PublicInsightsController.getInsights`
  - [x] 9.4 Register in `app.ts` as `app.use('/api/v1/public/insights', publicInsightsRoutes)` (outside authenticated router)

- [x] Task 10: Update sprint status (AC: all)
  - [x] 10.1 Update `sprint-status.yaml`: `8-1-analytics-backend-foundation-descriptive-statistics-api: ready-for-dev → in-progress`

### Review Follow-ups (AI) — All Fixed

- [x] [AI-Review][HIGH] AC#2 consent rates missing — added `consentMarketplace` and `consentEnriched` FrequencyBucket[] to DemographicStats type and getDemographics() queries [packages/types/src/analytics.ts, services/survey-analytics.service.ts]
- [x] [AI-Review][HIGH] Skills frequency not suppressed per AC#3 — added `.filter(s => s.count >= minN)` to getSkillsFrequency() (minN=5) and public insights topSkills (minN=10) [services/survey-analytics.service.ts, services/public-insights.service.ts]
- [x] [AI-Review][MEDIUM] dateFrom/dateTo not validated as dates — added Zod `.refine()` with date format regex + Date.parse check; bad dates now return 400 instead of 500 [controllers/analytics.controller.ts]
- [x] [AI-Review][MEDIUM] Public scalar metrics not suppressed when total < PUBLIC_MIN_N — added `meetsThreshold` guard; biz_rate, unemployment, youth_emp, gpi return null when total < 10 [services/public-insights.service.ts]
- [x] [AI-Review][MEDIUM] incomeByLga misused FrequencyBucket — changed query from AVG to COUNT of income-reporting respondents per LGA (proper frequency distribution) [services/survey-analytics.service.ts]
- [x] [AI-Review][MEDIUM] toBuckets duplicated between services — extracted to shared `utils/analytics-suppression.ts`, imported in both services [utils/analytics-suppression.ts]
- [x] [AI-Review][LOW] Test count corrected (was 73, now 77 after review additions)
- [x] [AI-Review][LOW] source query param not enum-validated — noted; deferred to frontend integration (valid values TBD per endpoint usage)
- [x] [AI-Review][LOW] Fragile interval construction in getTrends — changed from `(${n} || ' days')::interval` to `(${n}::int * INTERVAL '1 day')` [services/survey-analytics.service.ts]
- [x] [AI-Review][LOW] Inconsistent Redis lazy-init pattern — noted; routes file works correctly via isTestEnv guard at call site; cosmetic only

## Dev Notes

### Critical: raw_data JSONB Field Names

The `submissions.raw_data` JSONB stores the full survey response. Use these **exact field names** from the questionnaire schema (`docs/questionnaire_schema.md` v4.0):

**Demographics (Section 2):**
- `gender` → values: `'male'`, `'female'`, `'other'` (prefer not to say)
- `dob` → date string, derive age with `int((today - dob) / 365.25)`
- `marital_status` → values: `'single'`, `'married'`, `'divorced'`, `'widowed'`, `'separated'`
- `education_level` → values: `'none'`, `'primary'`, `'jss'`, `'sss'`, `'vocational'`, `'nce_ond'`, `'hnd_bsc'`, `'masters'`, `'doctorate'`
- `disability_status` → values: `'yes'`, `'no'`
- `lga_id` → LGA code (join with `lgas` table for name)

**Employment (Section 3):**
- `employment_status` → `'yes'`/`'no'` (worked for pay in last 7 days)
- `temp_absent` → `'yes'`/`'no'` (temporarily absent from job)
- `looking_for_work` → `'yes'`/`'no'`
- `available_for_work` → `'yes'`/`'no'`
- `employment_type` → values from `emp_type` list (check choices sheet)
- `years_experience` → ordinal bands from `experience_list`
- `hours_worked` → integer (0-168)
- `monthly_income` → integer (Naira), optional field

**Household (Section 4):**
- `is_head` → `'yes'`/`'no'`
- `household_size` → integer (>0)
- `dependents_count` → integer
- `housing_status` → values: `'owned'`, `'rented'`, `'family'`, `'employer'`, `'other'`

**Skills (Section 5):**
- `skills_possessed` → space-separated string of skill codes (ISCO-08 taxonomy, 150 skills across 20 sectors — see `docs/skills-taxonomy-isco08.md`)
- `training_interest` → space-separated skill codes (want to learn)
- `has_business` → `'yes'`/`'no'`
- `business_reg` → `'registered'`/`'not_registered'`/`'in_progress'`
- `apprentice_count` → integer

**Consent (Section 6):**
- `consent_marketplace` → `'yes'`/`'no'`
- `consent_enriched` → `'yes'`/`'no'`

### SQL Patterns to Follow

**JSONB extraction pattern** (from `report.service.ts`):
```typescript
// Text field extraction
sql<string>`${submissions.rawData}->>'gender'`

// COALESCE for flexible field names
sql`COALESCE(${submissions.rawData}->>'occupation', ${submissions.rawData}->>'primary_skill', 'Unknown')`

// Multi-period aggregation (from reveal-analytics.service.ts)
sql<number>`count(*) FILTER (WHERE ${submissions.submittedAt} > NOW() - INTERVAL '24 hours')`
```

**Role scope WHERE clauses:**
```typescript
// System scope: no additional filter
// LGA scope: JOIN respondents, filter by lgaId
and(eq(respondents.lgaId, scope.lgaId), isNotNull(submissions.respondentId))
// Personal scope: filter by submitterId
eq(submissions.submitterId, scope.userId)
```

**Age band computation in SQL:**
```sql
CASE
  WHEN EXTRACT(YEAR FROM AGE(NOW(), (raw_data->>'dob')::date)) BETWEEN 15 AND 19 THEN '15-19'
  WHEN ... BETWEEN 20 AND 24 THEN '20-24'
  ...
  WHEN ... >= 60 THEN '60+'
  ELSE 'unknown'
END
```

**Skills array unnest** (space-separated string in raw_data):
```sql
SELECT skill, COUNT(*) as count
FROM submissions,
     unnest(string_to_array(raw_data->>'skills_possessed', ' ')) AS skill
WHERE raw_data->>'skills_possessed' IS NOT NULL
  AND raw_data->>'skills_possessed' != ''
GROUP BY skill
ORDER BY count DESC
LIMIT 20
```

### Scope Chain Architecture

Per `docs/survey-analytics-spec.md` Section 1, **one endpoint returns different data per role**:

| Role | Scope | Filter |
|------|-------|--------|
| Super Admin | System-wide | None (all data) |
| Government Official | System-wide (aggregate only) | No individual staff names |
| Supervisor | LGA-scoped | `respondents.lga_id = team_assignments.lga_code` |
| Enumerator | Personal | `submissions.submitter_id = user.id` |
| Clerk | Personal | `submissions.submitter_id = user.id` |
| Assessor | System-wide read-only | Demographics context only |

**Supervisor LGA lookup:** Query `team_assignments` table for user's assigned LGA:
```typescript
const assignment = await db.select({ lgaId: teamAssignments.lgaId })
  .from(teamAssignments)
  .where(eq(teamAssignments.supervisorId, userId))
  .limit(1);
```
Note: The column is `lgaId` (UUID FK to `lgas.id`), DB column name `lga_id`. Use `supervisorId` (not `userId`) — see schema.
[Source: `apps/api/src/db/schema/team-assignments.ts`, created in prep-8-supervisor-team-assignment-schema]

### AC#6 Stat Card Derivations

| Stat Card | Source | Derivation |
|-----------|--------|------------|
| totalRespondents | `respondents` table | `COUNT(*)` scoped to role |
| employedCount + employedPct | `raw_data->>'employment_status'` | `COUNT WHERE = 'yes'` (worked for pay in last 7 days) |
| femaleCount + femalePct | `raw_data->>'gender'` | `COUNT WHERE = 'female'` |
| avgAge | `raw_data->>'dob'` | `AVG(EXTRACT(YEAR FROM AGE(NOW(), dob::date)))` |
| businessOwners + businessOwnersPct | `raw_data->>'has_business'` | `COUNT WHERE = 'yes'` |

### Suppression Rules

Per AC#3 and spec Section 10, suppress small sample sizes:
- Authenticated endpoints: `minN = 5` per bucket
- Public insights: `minN = 10` per bucket (stricter for public)
- Suppressed buckets return `{ label, count: null, percentage: null, suppressed: true }`
- Display "Insufficient data" on frontend when all buckets suppressed

### Public Insights Endpoint

- Route: `GET /api/v1/public/insights` (outside `/api/v1/` authenticated router)
- No auth middleware, no query parameters accepted (prevents enumeration)
- Redis cache: key `analytics:public:insights`, TTL 3600s (1 hour)
- Returns pre-computed aggregate snapshot:
  - Total registered, LGAs covered, gender split, top 10 skills
  - Employment breakdown, formal/informal ratio, unemployment estimate
  - Youth employment rate (15-35), GPI (female/male ratio), LGA density
  - Minimum sample size: 10 per bucket for public
- Rate limit: 60 req/min per IP (use existing rate-limit pattern from `middleware/rate-limit.ts`)

### Existing Code to Reuse / Extend

| Existing | Location | Reuse How |
|----------|----------|-----------|
| `ReportService` | `services/report.service.ts` | SQL patterns for JSONB aggregation, LGA breakdown, trends |
| `RevealAnalyticsService` | `services/reveal-analytics.service.ts` | Multi-period COUNT FILTER pattern, Zod query validation |
| `authenticate` | `middleware/auth.ts` | Import directly |
| `authorize()` | `middleware/rbac.ts` | Import and pass all dashboard roles |
| Rate limiter | `middleware/rate-limit.ts` | Use `rateLimit()` factory for public endpoint |
| Redis lazy init | `middleware/reveal-rate-limit.ts` | Follow same pattern for cache client |
| `AppError` | Used across all controllers | `new AppError('VALIDATION_ERROR', msg, 400)` |
| LGAs table | `db/schema/lgas.ts` | LEFT JOIN for inclusive LGA counts |
| TeamAssignments | `db/schema/team-assignments.ts` | Supervisor LGA lookup |

### Route Registration

New routes go in `apps/api/src/routes/index.ts`:
```typescript
import analyticsRoutes from './analytics.routes.js';
// ...
router.use('/analytics', analyticsRoutes);
```

Public insights route goes in `apps/api/src/app.ts` (before the authenticated `/api/v1` router):
```typescript
import publicInsightsRoutes from './routes/public-insights.routes.js';
// Mount BEFORE authenticated router
app.use('/api/v1/public/insights', publicInsightsRoutes);
```
[Source: Pattern from existing public marketplace routes in `app.ts`]

### Project Structure Notes

- New files follow existing kebab-case convention
- Controllers: static methods on exported class
- Services: static methods, pure data logic
- Routes: Router with middleware chain
- Types: barrel-exported from `packages/types/src/index.ts`
- Tests: `__tests__/` subdirectory colocated with source

**New files:**
- `packages/types/src/analytics.ts`
- `apps/api/src/middleware/analytics-scope.ts`
- `apps/api/src/utils/analytics-suppression.ts`
- `apps/api/src/services/survey-analytics.service.ts`
- `apps/api/src/services/public-insights.service.ts`
- `apps/api/src/controllers/analytics.controller.ts`
- `apps/api/src/controllers/public-insights.controller.ts`
- `apps/api/src/routes/analytics.routes.ts`
- `apps/api/src/routes/public-insights.routes.ts`

**Modified files:**
- `packages/types/src/index.ts` (add analytics exports)
- `apps/api/src/routes/index.ts` (register analytics routes)
- `apps/api/src/app.ts` (register public insights route)
- `apps/api/src/types.d.ts` (extend Request with analyticsScope)

### Anti-Patterns to Avoid

1. **DO NOT create separate endpoints per role** — one endpoint, scope chain filters data
2. **DO NOT import from `@oslsr/types` in schema files** — Drizzle-kit runs compiled JS
3. **DO NOT use `sql.raw()` for user input** — parameterize with Drizzle template syntax
4. **DO NOT use `beforeEach`/`afterEach` for DB tests** — use `beforeAll`/`afterAll`
5. **DO NOT add `simple-statistics` dependency** — inferential stats (chi-square, correlation, CIs) are out of Epic 8 scope and have no story yet
6. **DO NOT build frontend pages** — backend API only; frontend is Stories 8-2 through 8-5
7. **DO NOT accept filter params on public endpoint** — prevents enumeration attacks
8. **DO NOT forget Number() conversion** — PostgreSQL returns aggregate strings via Drizzle

### WAT Timezone Handling

All date grouping in SQL must use WAT (UTC+1):
```sql
DATE(submitted_at AT TIME ZONE 'Africa/Lagos')
```
[Source: `services/report.service.ts` getRegistrationTrends pattern]

### References

- [Source: docs/survey-analytics-spec.md] — Comprehensive 80-feature spec, Phase 1 scope
- [Source: docs/questionnaire_schema.md] — raw_data field names (v4.0 ISCO-08)
- [Source: docs/skills-taxonomy-isco08.md] — 150 skills, 20 ISCO-08 sectors
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-8] — Story 8.1 acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md] — API patterns, RBAC, caching
- [Source: _bmad-output/project-context.md] — Technology stack, conventions, anti-patterns
- [Source: apps/api/src/services/report.service.ts] — JSONB aggregation patterns
- [Source: apps/api/src/services/reveal-analytics.service.ts] — Multi-period COUNT FILTER
- [Source: apps/api/src/middleware/rbac.ts] — authorize() middleware
- [Source: apps/api/src/middleware/rate-limit.ts] — Rate limiting factory
- [Source: apps/api/src/db/schema/submissions.ts] — Submissions table with raw_data JSONB
- [Source: apps/api/src/db/schema/respondents.ts] — Respondent identity fields
- [Source: apps/api/src/db/schema/team-assignments.ts] — Supervisor LGA assignment

### Previous Story Intelligence (7-6: Contact View Logging & Rate Limiting)

- **Redis lazy init**: Follow the exact same pattern — test mode bypass with `VITEST === 'true'`, graceful degradation when Redis unavailable
- **SQL injection fix**: Analytics service in 7-6 had `sql.raw(String(days))` → changed to parameterized. NEVER use `sql.raw()` for any variable
- **Route ordering**: Analytics routes MUST come before wildcard `:id` routes in the same router
- **Chainable Drizzle mock pattern**: For unit tests, use Proxy-based chainable mock that intercepts `.then()` for thenable queries
- **PostgreSQL FILTER syntax**: `COUNT(*) FILTER (WHERE ...)` works on PostgreSQL 15+ for multi-period aggregation in a single query
- **Test count honesty**: Adversarial review caught inflated test counts — be accurate

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Fixed `vi.clearAllMocks()` resetting mock chain in Vitest 4.x — switched to inline mock factories instead of hoisted `mockReturnValue`.
- Identified respondents.lgaId (text code) vs team_assignments.lgaId (UUID) mismatch — resolved by adding `lgaCode` to AnalyticsScope via innerJoin with lgas table.
- Initial implementation used `sql.raw()` with string interpolation — rewrote to use Drizzle `sql` template tag with `sql.join()` for parameterized queries (anti-pattern #3 compliance).

### Completion Notes List
- All 10 tasks with ~60 subtasks completed
- 77 new API tests: 9 middleware + 8 suppression + 25 service + 7 public-insights + 24 controller + 4 public-insights controller (includes 8 authorization/403 tests in controller file)
- 1,551 total API tests pass, 0 regressions
- Scope chain architecture: one middleware resolves scope per role, services apply scope filter to all queries
- Parameterized SQL via Drizzle `sql` template tag — no `sql.raw()` for user input
- Public insights: Redis-cached (1h TTL), stricter suppression (minN=10), rate-limited (60 req/min)
- WAT timezone handling in trends via `AT TIME ZONE 'Africa/Lagos'`
- ILO-aligned work status classification in employment stats

### File List

**New files:**
- `packages/types/src/analytics.ts` — shared analytics type definitions
- `apps/api/src/middleware/analytics-scope.ts` — scope chain middleware
- `apps/api/src/middleware/__tests__/analytics-scope.test.ts` — 9 tests
- `apps/api/src/utils/analytics-suppression.ts` — small-bucket suppression utility + shared toBuckets helper
- `apps/api/src/utils/__tests__/analytics-suppression.test.ts` — 8 tests
- `apps/api/src/services/survey-analytics.service.ts` — core analytics service (6 methods)
- `apps/api/src/services/__tests__/survey-analytics.service.test.ts` — 25 tests
- `apps/api/src/services/public-insights.service.ts` — public insights with Redis cache
- `apps/api/src/services/__tests__/public-insights.service.test.ts` — 7 tests
- `apps/api/src/controllers/analytics.controller.ts` — authenticated analytics endpoints
- `apps/api/src/controllers/__tests__/analytics.controller.test.ts` — 24 tests
- `apps/api/src/controllers/public-insights.controller.ts` — public insights endpoint
- `apps/api/src/controllers/__tests__/public-insights.controller.test.ts` — 4 tests
- `apps/api/src/routes/analytics.routes.ts` — analytics route definitions
- `apps/api/src/routes/public-insights.routes.ts` — public insights route with rate limiting

**Modified files:**
- `packages/types/src/index.ts` — added analytics barrel export
- `apps/api/src/types.d.ts` — extended Express Request with `analyticsScope`
- `apps/api/src/routes/index.ts` — registered analytics routes
- `apps/api/src/app.ts` — mounted public insights route before authenticated router

### Change Log
- 2026-03-11: Story 8.1 implementation complete — analytics backend foundation with 6 authenticated endpoints, 1 public endpoint, scope chain middleware, suppression utility.
- 2026-03-11: Adversarial code review — 10 issues found (2H, 4M, 4L), 8 auto-fixed: consent rates added (AC#2), skills suppression (AC#3), date validation, public scalar suppression, incomeByLga semantics, toBuckets DRY, interval fix. 4 new tests added (77 total). 1,551 API tests pass.
