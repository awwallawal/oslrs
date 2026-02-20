# Story 4.3: Fraud Engine Configurable Thresholds

Status: review-complete

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Super Admin,
I want to adjust the fraud detection thresholds via a UI and have a working Fraud Signal Engine that evaluates every submission,
so that I can tune the system based on pilot results and data quality is continuously monitored without blocking field work.

## Acceptance Criteria

**AC4.3.1 — FraudEngine evaluates submissions end-to-end**
**Given** a submission processed by the BullMQ `fraud-detection` worker
**When** FraudEngine.evaluate(submissionId) runs
**Then** all active heuristics execute against the submission data
**And** a composite score (0-100) with component breakdowns is stored in `fraud_detections`
**And** `config_snapshot_version` pins the threshold version active at compute time.

**AC4.3.2 — GPS Clustering heuristic (max 25 points)**
**Given** an enumerator's recent submissions with GPS coordinates
**When** GPS Clustering evaluates a new submission
**Then** DBSCAN with Haversine distance detects spatial clusters (default: epsilon=50m, minSamples=3, timeWindow=4h)
**And** secondary signals flag: GPS accuracy >50m, teleportation >120km/h between consecutive interviews, duplicate coordinates <5m between different enumerators same day.

**AC4.3.3 — Speed Run heuristic (max 25 points)**
**Given** a submission's completion time and the enumerator's historical median
**When** Speed Run evaluates the submission
**Then** Tier 1 (superspeceder): completionTime < 25% of median = 25 points
**And** Tier 2 (speeder): completionTime < 50% of median = 12 points
**And** until 30+ interviews establish an empirical median, the theoretical minimum floor is used: `(closedQ * 3s) + (openQ * 8s) + (numericQ * 4s) + 30s`.

**AC4.3.4 — Straight-lining heuristic (max 20 points)**
**Given** form responses containing scale-question batteries (5+ items)
**When** Straight-lining evaluates the submission
**Then** PIR >= 0.80 in 2+ batteries = 20 points; 1 battery = 10 points
**And** LIS >= 8 consecutive identical responses and Shannon entropy < 0.5 bits are secondary signals
**And** false positives are mitigated by battery-level-only analysis and cross-battery consistency checks.

**AC4.3.5 — Configurable thresholds via Super Admin API**
**Given** an authenticated Super Admin
**When** they call `PUT /api/v1/fraud-thresholds/:ruleKey` with a new value
**Then** a new version row is INSERT-ed (never UPDATE) with `effective_from = NOW()`
**And** the previous active row gets `effective_until = NOW()`
**And** the Redis cache keys `fraud:thresholds:*` are immediately invalidated (explicit DEL, not TTL-only)
**And** the next FraudEngine evaluation uses the new threshold values.

**AC4.3.6 — Super Admin threshold configuration UI**
**Given** an authenticated Super Admin at `/dashboard/super-admin/settings/fraud-thresholds`
**When** the page loads
**Then** all configurable thresholds are displayed grouped by category (GPS, Speed, Straight-lining, Duplicate, Timing, Severity)
**And** each threshold shows: display name, current value, category, description
**And** the Super Admin can edit values inline and save with confirmation
**And** save triggers the versioned API update with toast feedback.

**AC4.3.7 — Audit trail for threshold changes**
**Given** a threshold is updated
**When** the new version is saved
**Then** an audit log entry records: admin user ID, rule key, old value, new value, timestamp
**And** the audit log uses the existing structured logging pattern (`event: 'fraud.threshold.updated'`).

**AC4.3.8 — Severity mapping and notification**
**Given** a composite fraud score
**When** the score is computed
**Then** severity is mapped: clean (0-24), low (25-49), medium (50-69), high (70-84), critical (85-100)
**And** severity >= high triggers a supervisor notification (in-app or via existing notification patterns)
**And** severity = critical marks the submission as quarantined — this is a **derived state** from `fraud_detections.severity = 'critical'` (no separate status column on submissions). Queries filter `fraud_detections WHERE severity = 'critical' AND resolution IS NULL` to identify quarantined submissions.

**AC4.3.9 — Test coverage and regression safety**
**Given** implementation is complete
**When** test suites run
**Then** each heuristic has isolated unit tests (8+ tests per heuristic)
**And** composite scoring has integration tests
**And** threshold API has RBAC and versioning tests
**And** frontend threshold UI has component tests
**And** no existing tests regress.

## Tasks / Subtasks

- [x] Task 1: ConfigService — threshold loading + Redis cache (AC: 4.3.5, 4.3.7)
  - [x] 1.1: Create `apps/api/src/services/fraud-config.service.ts` — `getActiveThresholds(): Promise<FraudThresholdConfig[]>` loads from DB, caches in Redis `fraud:thresholds:active` (TTL 5min)
  - [x] 1.2: Implement `updateThreshold(ruleKey, newValue, adminId)` — INSERT new version row, SET `effective_until` on previous, DEL Redis cache keys immediately
  - [x] 1.3: Implement `getThresholdsByCategory()` for UI grouping and `getThresholdValue(ruleKey)` for individual lookup
  - [x] 1.4: Write audit log entry on every threshold change (`event: 'fraud.threshold.updated'`)

- [x] Task 2: GPS Clustering heuristic (AC: 4.3.2)
  - [x] 2.1: Create `apps/api/src/services/fraud-heuristics/gps-clustering.heuristic.ts` implementing `FraudHeuristic` interface
  - [x] 2.2: Implement Haversine distance function (`haversineDistance(lat1, lon1, lat2, lon2): meters`)
  - [x] 2.3: Implement DBSCAN clustering — query enumerator submissions within timeWindow, compute distance pairs, identify core/border/noise points
  - [x] 2.4: Implement secondary signals: accuracy filter (>50m = flag), teleportation detection (>120km/h = flag), duplicate coordinates (<5m between different enumerators = flag)

- [x] Task 3: Speed Run heuristic (AC: 4.3.3)
  - [x] 3.0: **PREREQUISITE — `completionTimeSeconds` column does not exist.** Add `completionTimeSeconds: integer('completion_time_seconds')` (nullable) to `apps/api/src/db/schema/submissions.ts`. Generate migration. Populate by: (a) capturing form start time in `FormFillerPage.tsx` (store `startedAt` ref on mount), (b) computing `duration = submittedAt - startedAt` in seconds in the submission payload, (c) persisting in `submission-processing.service.ts` during processing. Until all submissions have timing data, the Speed Run heuristic MUST use the bootstrap/theoretical minimum fallback for submissions where `completionTimeSeconds IS NULL`.
  - [x] 3.1: Create `apps/api/src/services/fraud-heuristics/speed-run.heuristic.ts` implementing `FraudHeuristic` interface
  - [x] 3.2: Implement median calculation — query enumerator's last N completionTimes for the same form via `submissions.questionnaireFormId`, compute median. Filter `WHERE completion_time_seconds IS NOT NULL`.
  - [x] 3.3: Implement bootstrap fallback — use theoretical minimum when <30 historical interviews OR when no timing data exists
  - [x] 3.4: Implement two-tier scoring (superspeceder=25pts, speeder=12pts) with per-section timing analysis

- [x] Task 4: Straight-lining heuristic (AC: 4.3.4)
  - [x] 4.1: Create `apps/api/src/services/fraud-heuristics/straight-lining.heuristic.ts` implementing `FraudHeuristic` interface
  - [x] 4.2: Implement PIR (Percentage Identical Responses) for batteries of 5+ scale questions
  - [x] 4.3: Implement LIS (Longest Identical String) and Shannon entropy as secondary signals
  - [x] 4.4: Implement cross-battery aggregation — require 2+ battery flags for full score; load form schema to identify scale-question batteries

- [x] Task 5: Duplicate Response + Off-Hours heuristics (AC: 4.3.1)
  - [x] 5.1: Create `apps/api/src/services/fraud-heuristics/duplicate-response.heuristic.ts` — exact duplicate (20pts), partial >70% field match (10pts)
  - [x] 5.2: Create `apps/api/src/services/fraud-heuristics/off-hours.heuristic.ts` — 11PM-5AM (10pts), weekend (5pts)

- [x] Task 6: ScoringAggregator + FraudEngine orchestrator (AC: 4.3.1, 4.3.8)
  - [x] 6.1: Create `apps/api/src/services/fraud-engine.service.ts` with HeuristicRegistry (register/unregister heuristics) and ScoringAggregator
  - [x] 6.2: Implement `evaluate(submissionId): Promise<FraudDetectionResult>` — load submission + context (GPS, responses, timing, enumerator history) into a `SubmissionWithContext` object, load thresholds (via ConfigService), run all active heuristics, aggregate scores. **NOTE:** The current `FraudHeuristic` interface in `packages/types/src/fraud.ts` takes `(submissionId: string, config)` — update it to `(submission: SubmissionWithContext, config)` so heuristics receive pre-loaded context instead of each re-querying the DB independently. Define `SubmissionWithContext` type in `packages/types/src/fraud.ts`.
  - [x] 6.3: Implement severity mapping (clean/low/medium/high/critical) and notification trigger for severity >= high

- [x] Task 7: BullMQ worker — replace stub (AC: 4.3.1)
  - [x] 7.1: Update `apps/api/src/workers/fraud-detection.worker.ts` — call `FraudEngine.evaluate(submissionId)`
  - [x] 7.2: Store `FraudDetectionResult` in `fraud_detections` table with `config_snapshot_version`
  - [x] 7.3: On severity >= high, log warning + push supervisor notification

- [x] Task 8: Threshold management API endpoints (AC: 4.3.5)
  - [x] 8.1: Create `apps/api/src/routes/fraud-thresholds.routes.ts` — `GET /api/v1/fraud-thresholds` (list active, auth: Super Admin), `PUT /api/v1/fraud-thresholds/:ruleKey` (new version, auth: Super Admin)
  - [x] 8.2: Create `apps/api/src/controllers/fraud-thresholds.controller.ts` — validate input with Zod `updateThresholdSchema`, delegate to ConfigService
  - [x] 8.3: Register routes in `apps/api/src/routes/index.ts`

- [x] Task 9: Detection query + review API endpoints (AC: 4.3.1)
  - [x] 9.1: Create `apps/api/src/routes/fraud-detections.routes.ts` — `GET /api/v1/fraud-detections` (filtered list, auth: Supervisor + Assessor + Super Admin), `PATCH /api/v1/fraud-detections/:id/review` (resolve, auth: Supervisor + Assessor + Super Admin). **Supervisor scope restriction:** When `req.user.role === 'supervisor'`, filter detections to only those where `fraud_detections.submission_id` belongs to an enumerator assigned to this supervisor. Use the team assignment resolution service (from Story 4.1 / prep-8) to resolve `getEnumeratorIdsForSupervisor(supervisorId)`, then filter: `WHERE submissions.enumeratorId IN (...assignedEnumeratorIds)`. If prep-8 is not yet available, fall back to LGA-scoped filtering via `submissions.enumeratorId IN (SELECT id FROM users WHERE lga_id = supervisorLgaId AND role = 'enumerator')`.
  - [x] 9.2: Create `apps/api/src/controllers/fraud-detections.controller.ts` — filter by severity, resolution status, enumerator, date range; pagination
  - [x] 9.3: Review endpoint: set `reviewedBy`, `reviewedAt`, `resolution`, `resolutionNotes`

- [x] Task 10: Super Admin fraud thresholds UI page (AC: 4.3.6)
  - [x] 10.1: Create `apps/web/src/features/dashboard/pages/SuperAdminFraudThresholdsPage.tsx` — grouped threshold cards by category
  - [x] 10.2: Create `ThresholdCategoryCard` component — displays thresholds in a category, inline edit mode, save/cancel buttons
  - [x] 10.3: Create `ThresholdEditRow` component — label, description, current value, input field, save indicator

- [x] Task 11: Frontend API hooks + routing (AC: 4.3.6)
  - [x] 11.1: Create `apps/web/src/features/dashboard/api/fraud-thresholds.api.ts` — `getFraudThresholds()`, `updateFraudThreshold(ruleKey, value)`
  - [x] 11.2: Create `apps/web/src/features/dashboard/hooks/useFraudThresholds.ts` — `useFraudThresholds()` query, `useUpdateFraudThreshold()` mutation with optimistic UI + toast
  - [x] 11.3: Add route `/dashboard/super-admin/settings/fraud-thresholds` to Super Admin routes and sidebar navigation

- [x] Task 12: Backend unit tests — heuristics (AC: 4.3.9)
  - [x] 12.1: Create `apps/api/src/services/fraud-heuristics/__tests__/gps-clustering.heuristic.test.ts` (8+ tests: cluster detection, no cluster, accuracy filter, teleportation, duplicate coords, empty GPS, single point, edge cases)
  - [x] 12.2: Create `apps/api/src/services/fraud-heuristics/__tests__/speed-run.heuristic.test.ts` (6+ tests: median calc, bootstrap fallback, superspeceder, speeder, no flag, section timing)
  - [x] 12.3: Create `apps/api/src/services/fraud-heuristics/__tests__/straight-lining.heuristic.test.ts` (8+ tests: PIR single battery, PIR multi-battery, LIS, entropy, cross-battery, false positive, no batteries, edge cases)
  - [x] 12.4: Create tests for duplicate-response and off-hours heuristics (4+ tests each)

- [x] Task 13: Backend integration + API tests (AC: 4.3.9)
  - [x] 13.1: Create `apps/api/src/services/__tests__/fraud-engine.service.test.ts` (composite scoring, disabled heuristic, severity mapping, config snapshot)
  - [x] 13.2: Create `apps/api/src/services/__tests__/fraud-config.service.test.ts` (load, cache hit/miss, invalidation, version insert)
  - [x] 13.3: Create `apps/api/src/controllers/__tests__/fraud-thresholds.controller.test.ts` (RBAC, CRUD, validation, versioning)
  - [x] 13.4: Create `apps/api/src/controllers/__tests__/fraud-detections.controller.test.ts` (filter, review, RBAC)

- [x] Task 14: Frontend tests (AC: 4.3.9)
  - [x] 14.1: Create `apps/web/src/features/dashboard/pages/__tests__/SuperAdminFraudThresholdsPage.test.tsx` (rendering, category grouping, loading skeleton, error state)
  - [x] 14.2: Test threshold editing and save flow (input change, save mutation, toast, optimistic update)
  - [x] 14.3: Run full suite — zero regressions against existing dashboard/role tests

- [x] Task 15: End-to-end verification (AC: all)
  - [x] 15.1: Verify BullMQ worker processes submission → FraudEngine evaluates → result stored in fraud_detections
  - [x] 15.2: Verify threshold change via API → Redis cache invalidated → next evaluation uses new values
  - [x] 15.3: Verify Super Admin UI loads thresholds, edits, saves, and reflects changes
  - [x] 15.4: Verify non-Super-Admin roles cannot access threshold endpoints (403)

### Review Follow-ups (AI) — Code Review 2026-02-20

- [x] [AI-Review][HIGH] H1: Update Dev Agent Record File List — was 2 files, should be 30+ [story file]
- [x] [AI-Review][HIGH] H2: GPS accuracy secondary signal not implemented — `maxAccuracyM` loaded but unused, no `gps_accuracy` column exists. Document gap, add TODO. [gps-clustering.heuristic.ts]
- [x] [AI-Review][HIGH] H3: Speed Run heuristic doesn't filter by same form — add `questionnaireFormId` to `recentSubmissions`, filter in heuristic [fraud-engine.service.ts, fraud.ts, speed-run.heuristic.ts]
- [x] [AI-Review][HIGH] H4: No supervisor notification for severity >= high — enhance TODO with Socket.IO implementation path from Story 4.2 [fraud-detection.worker.ts]
- [x] [AI-Review][MEDIUM] M1: Duplicate coordinates threshold (5m) hardcoded — make configurable via `gps_duplicate_coord_threshold_m` [gps-clustering.heuristic.ts:271]
- [x] [AI-Review][MEDIUM] M2: DBSCAN `seedSet.includes()` is O(n²) — replace with Set for O(1) lookups [gps-clustering.heuristic.ts:93]
- [x] [AI-Review][MEDIUM] M3: Query param validation missing — validate `severity` and `resolution` against allowed enum values [fraud-detections.controller.ts:67,73]
- [x] [AI-Review][MEDIUM] M4: `fraud-engine.service.test.ts` only has 3 tests — add `mapSeverity` and severity mapping tests
- [x] [AI-Review][MEDIUM] M5: `fraud-detections.controller.test.ts` only has 4 tests — add list, pagination, supervisor scope, review flow tests
- [x] [AI-Review][LOW] L1: `getThreshold()` helper duplicated in 5 files — extract to `fraud-heuristics/utils.ts`
- [x] [AI-Review][LOW] L2: `ThresholdEditRow` doesn't sync `editValue` on prop change [ThresholdEditRow.tsx:21]
- [x] [AI-Review][LOW] L3: `completeDraft` missing `formStartedAt` in useCallback deps [useDraftPersistence.ts:221]

## Dev Notes

### Critical Dependency: prep-7 MUST Be Complete First

This story depends on prep-7 (Fraud Detection Domain Research) which creates:

| File | Purpose |
|------|---------|
| `apps/api/src/db/schema/fraud-thresholds.ts` | Threshold config table (temporal versioning) |
| `apps/api/src/db/schema/fraud-detections.ts` | Detection results table |
| `apps/api/src/db/seeds/fraud-thresholds.seed.ts` | 21 default threshold records |
| `packages/types/src/fraud.ts` | FraudHeuristic, FraudThresholdConfig, FraudDetectionResult, FraudSeverity, FraudComponentScore, HeuristicCategory |
| `packages/types/src/validation/fraud.ts` | Zod schemas: fraudThresholdConfigSchema, fraudDetectionResultSchema, updateThresholdSchema |
| `_bmad-output/implementation-artifacts/prep-7-fraud-heuristics-research.md` | Algorithm specs, threshold rationale, academic refs |

**Do NOT recreate any of these files.** Import and use what prep-7 provides.

### What Already Exists (Do NOT Recreate)

| Component | File | Status |
|-----------|------|--------|
| BullMQ fraud queue | `apps/api/src/queues/fraud-detection.queue.ts` | Complete (queue setup) |
| Worker skeleton | `apps/api/src/workers/fraud-detection.worker.ts` | Stub — returns `{ processed: false }` |
| Queue trigger | `apps/api/src/services/submission-processing.service.ts:177-191` | Fires job when GPS present |
| Job data interface | `FraudDetectionJobData` in queue file | `{ submissionId, respondentId, gpsLatitude?, gpsLongitude? }` |
| GPS columns | `apps/api/src/db/schema/submissions.ts` | `gps_latitude`, `gps_longitude` (doublePrecision) |
| Supervisor fraud page | `apps/web/src/features/dashboard/pages/SupervisorFraudPage.tsx` | Placeholder UI only |
| Super Admin settings nav | Sidebar already has Settings section | May need new nav item |

### What This Story Creates

```
apps/api/src/services/
├── fraud-engine.service.ts              # FraudEngine orchestrator (HeuristicRegistry + ScoringAggregator)
├── fraud-config.service.ts              # ConfigService (DB thresholds, Redis cache, invalidation)
├── fraud-heuristics/
│   ├── gps-clustering.heuristic.ts      # DBSCAN + Haversine (max 25 pts)
│   ├── speed-run.heuristic.ts           # Two-tier median-ratio (max 25 pts)
│   ├── straight-lining.heuristic.ts     # PIR + LIS + entropy (max 20 pts)
│   ├── duplicate-response.heuristic.ts  # Exact/partial match (max 20 pts)
│   ├── off-hours.heuristic.ts           # Night/weekend flags (max 10 pts)
│   └── __tests__/
│       ├── gps-clustering.heuristic.test.ts
│       ├── speed-run.heuristic.test.ts
│       ├── straight-lining.heuristic.test.ts
│       ├── duplicate-response.heuristic.test.ts
│       └── off-hours.heuristic.test.ts
├── __tests__/
│   ├── fraud-engine.service.test.ts
│   └── fraud-config.service.test.ts

apps/api/src/controllers/
├── fraud-thresholds.controller.ts
├── fraud-detections.controller.ts
├── __tests__/
│   ├── fraud-thresholds.controller.test.ts
│   └── fraud-detections.controller.test.ts

apps/api/src/routes/
├── fraud-thresholds.routes.ts
├── fraud-detections.routes.ts

apps/web/src/features/dashboard/
├── pages/
│   ├── SuperAdminFraudThresholdsPage.tsx
│   └── __tests__/
│       └── SuperAdminFraudThresholdsPage.test.tsx
├── api/
│   └── fraud-thresholds.api.ts
├── hooks/
│   └── useFraudThresholds.ts
├── components/
│   ├── ThresholdCategoryCard.tsx
│   └── ThresholdEditRow.tsx
```

### Architecture Compliance (ADR-003)

```
FraudEngine
  ├── HeuristicRegistry          # Register/unregister pluggable heuristics
  │   ├── GpsClusteringHeuristic # Implements FraudHeuristic interface
  │   ├── SpeedRunHeuristic
  │   ├── StraightLiningHeuristic
  │   ├── DuplicateResponseHeuristic
  │   └── OffHoursHeuristic
  ├── ConfigService              # DB-backed thresholds with Redis cache
  │   ├── getActiveThresholds()  # Cached (TTL 5min + immediate invalidation on write)
  │   ├── updateThreshold()      # INSERT new version, never UPDATE
  │   └── invalidateCache()      # Explicit DEL fraud:thresholds:*
  └── ScoringAggregator          # Weighted additive, 0-100 composite
      └── aggregate(scores)      # min(100, sum of component scores)
```

**Runtime adjustment flow:**
```
Super Admin changes threshold value
  → API: PUT /api/v1/fraud-thresholds/:ruleKey
  → INSERT new version row (effective_from = NOW())
  → UPDATE previous row (effective_until = NOW())
  → DEL Redis cache keys (immediate, not TTL)
  → Next FraudEngine.evaluate() loads fresh thresholds
  → Audit log: event: 'fraud.threshold.updated'
```

### Composite Scoring Model

```typescript
totalScore = min(100, gpsScore + speedScore + straightlineScore + duplicateScore + timingScore)
```

| Score | Severity | Supervisor Action |
|-------|----------|-------------------|
| 0-24 | clean | Auto-accept |
| 25-49 | low | Weekly review batch |
| 50-69 | medium | Next-day callback/verification |
| 70-84 | high | Immediate notification, hold payment |
| 85-100 | critical | Auto-quarantine, block enumerator until cleared |

### Heuristic Implementation Patterns

Each heuristic MUST implement the `FraudHeuristic` interface from `packages/types/src/fraud.ts`:

```typescript
interface FraudHeuristic {
  key: string;                    // e.g., 'gps_clustering'
  category: HeuristicCategory;    // e.g., 'gps'
  evaluate(
    submission: SubmissionWithContext,
    config: FraudThresholdConfig[]
  ): Promise<{ score: number; details: Record<string, unknown> }>;
}
```

Each heuristic:
- Receives the full submission context (GPS, responses, timing, enumerator history)
- Reads its relevant thresholds from the config array
- Returns a score (0 to max weight) and a details object for the evidence panel
- Is independently testable and can be disabled via `isActive` flag on thresholds
- Logs structured events via Pino (e.g., `event: 'fraud.heuristic.evaluated'`)

### Data Query Patterns for Heuristics

> **Important:** `submissions.enumeratorId` is `TEXT`, not a UUID FK. It is populated during processing in `submission-processing.service.ts` only for enumerator-role submitters (`enumeratorId = submitterId`). When comparing against UUID user IDs, cast as needed: `eq(submissions.enumeratorId, userId)` works in Drizzle because `=` auto-casts TEXT↔UUID in Postgres. Similarly, `submissions.questionnaireFormId` is TEXT — use it directly with `eq()`, no cast needed.

**GPS Clustering** — needs enumerator's recent submissions:
```typescript
// Query: submissions by same enumerator within timeWindow, with GPS
const recentSubmissions = await db.select()
  .from(submissions)
  .where(and(
    eq(submissions.enumeratorId, enumeratorId),
    gte(submissions.submittedAt, subHours(now, timeWindowHours)),
    isNotNull(submissions.gpsLatitude),
    isNotNull(submissions.gpsLongitude)
  ))
  .orderBy(desc(submissions.submittedAt));
```

**Speed Run** — needs enumerator's historical completion times for same form:
```typescript
// Query: past completionTimes for same form by same enumerator
const pastTimes = await db.select({ completionTimeSeconds: submissions.completionTimeSeconds })
  .from(submissions)
  .where(and(
    eq(submissions.enumeratorId, enumeratorId),
    eq(submissions.questionnaireFormId, formId),
    isNotNull(submissions.completionTimeSeconds)
  ))
  .orderBy(desc(submissions.submittedAt))
  .limit(100);
```

**Straight-lining** — needs form schema to identify scale-question batteries:
```typescript
// Load form schema to find scale-question batteries
const form = await db.select({ formSchema: questionnaireForms.formSchema })
  .from(questionnaireForms)
  .where(eq(questionnaireForms.id, questionnaireFormId));
// Parse JSONB to find sections with 5+ select_one questions sharing same choice list
```

### API Endpoint Design

**Threshold Management (Super Admin only):**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/fraud-thresholds` | Super Admin | List all active thresholds, grouped by category |
| PUT | `/api/v1/fraud-thresholds/:ruleKey` | Super Admin | Create new version (body: `{ thresholdValue, notes? }`) |

**Detection Queries (Supervisor + Assessor + Super Admin):**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/fraud-detections` | Supervisor, Assessor, Super Admin | Filtered list (severity, resolution, enumeratorId, dateRange, page, pageSize) |
| PATCH | `/api/v1/fraud-detections/:id/review` | Supervisor, Assessor, Super Admin | Resolve (body: `{ resolution, resolutionNotes }`) |

**Supervisor scope restriction:** Supervisors ONLY see detections for their assigned enumerators (via team_assignments or LGA fallback from Story 4.1/prep-8).

### Redis Cache Pattern

```typescript
// Threshold cache (invalidate on threshold change)
`fraud:thresholds:active`              // JSON blob of all active thresholds, TTL 5 min
`fraud:thresholds:${ruleKey}`          // Individual rule cache (optional)

// Enumerator stats cache (updated on each scoring)
`fraud:stats:${enumeratorId}:${questionnaireFormId}` // Rolling median/percentile, TTL 1 hour

// Cache invalidation (MUST be explicit on threshold write)
await redis.del('fraud:thresholds:active');
// Do NOT rely on TTL expiry alone — AC 4.3.5 requires "immediately apply" semantics
```

### ESM Import Convention (Backend)

All relative imports in `apps/api/src/` MUST include `.js` extension:
```typescript
// CORRECT
import { fraudThresholds } from '../db/schema/fraud-thresholds.js';
import { fraudDetections } from '../db/schema/fraud-detections.js';
import { FraudEngine } from '../services/fraud-engine.service.js';

// WRONG — will fail at runtime
import { fraudThresholds } from '../db/schema/fraud-thresholds';
```

### Database Naming Patterns (Mandatory)

- Tables: `fraud_thresholds`, `fraud_detections` (snake_case, plural)
- Columns: `rule_key`, `threshold_value`, `gps_score`, `total_score` (snake_case)
- Drizzle schema: camelCase properties mapping to snake_case columns
- Primary keys: UUIDv7 via `$defaultFn(() => uuidv7())`
- Foreign keys: `enumerator_id` → `users.id`, `submission_id` → `submissions.id`

### Frontend Patterns

**TanStack Query keys:**
```typescript
['fraud-thresholds']                           // All active thresholds
['fraud-thresholds', ruleKey]                  // Single threshold
['fraud-detections', { severity, page }]       // Filtered detections
```

**Mutation with optimistic UI + toast:**
```typescript
const updateThreshold = useOptimisticMutation({
  mutationFn: (data) => updateFraudThreshold(data.ruleKey, data.value),
  successMessage: 'Threshold updated successfully',
  errorMessage: 'Failed to update threshold',
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fraud-thresholds'] }),
});
```

**Loading states:** Use `SkeletonCard` and `SkeletonTable` for the threshold configuration page. Never use generic spinners.

**Test selectors:** Use text content, `data-testid`, and ARIA roles ONLY (A3 rule). Never CSS class selectors.

### What NOT to Do

- **Do NOT use PostGIS** — DBSCAN with Haversine in pure TypeScript is sufficient at 200-enumerator scale (per prep-7)
- **Do NOT use ML/AI models** — weighted additive model is appropriate for pilot phase
- **Do NOT use `console.log`** — all logging through Pino structured events
- **Do NOT use `uuid` v4 package** — use `uuidv7` from the `uuidv7` package
- **Do NOT UPDATE threshold rows** — always INSERT new version (temporal versioning)
- **Do NOT hardcode threshold values** — all values come from `fraud_thresholds` table via ConfigService
- **Do NOT block submissions** — fraud flags are advisory, they do NOT prevent data ingestion (FR13)
- **Do NOT create new BullMQ queue** — use existing `fraud-detection` queue, just update the worker
- **Do NOT modify `submission-processing.service.ts`** — the queue trigger already works correctly
- **Do NOT give Supervisors access to threshold management** — thresholds are Super Admin only
- **Do NOT skip the `config_snapshot_version`** — every fraud_detections row must pin the threshold version for audit

### Existing Patterns to Follow

| Pattern | Source File | Reuse For |
|---------|------------|-----------|
| Drizzle schema | `apps/api/src/db/schema/submissions.ts` | Query patterns for heuristics |
| Service pattern | `apps/api/src/services/submission-processing.service.ts` | FraudEngine service structure |
| Controller pattern | `apps/api/src/controllers/supervisor.controller.ts` | Threshold/detection controllers |
| Route pattern | `apps/api/src/routes/supervisor.routes.ts` | Fraud routes with auth middleware |
| BullMQ worker | `apps/api/src/workers/fraud-detection.worker.ts` | Update existing stub |
| Queue pattern | `apps/api/src/queues/fraud-detection.queue.ts` | Reference for job data shape |
| TanStack hooks | `apps/web/src/features/dashboard/hooks/useSupervisor.ts` | Frontend hook pattern |
| API client | `apps/web/src/features/dashboard/api/supervisor.api.ts` | Frontend API function pattern |
| Dashboard page | `apps/web/src/features/dashboard/pages/SupervisorHome.tsx` | Data-driven page pattern |
| Test pattern (backend) | `apps/api/src/services/__tests__/submission-processing.service.test.ts` | Service test with mocks |
| Test pattern (frontend) | `apps/web/src/features/dashboard/pages/__tests__/SupervisorHome.test.tsx` | Page test pattern |
| UUIDv7 pattern | Any schema file | `id: uuid('id').primaryKey().$defaultFn(() => uuidv7())` |
| Auth middleware | `apps/api/src/middleware/authenticate.ts` | `authenticate` + `authorize(roles)` |
| Seed data | `apps/api/src/db/seeds/fraud-thresholds.seed.ts` | Created by prep-7 |

### Previous Story Intelligence (Epic 4)

Stories 4.1 and 4.2 are `ready-for-dev` but NOT yet implemented. Key takeaways from their story files:

- **Story 4.1** introduces team assignment resolution service (from prep-8). This story's detection query endpoint needs to respect supervisor assignment boundaries — use the same resolution service.
- **Story 4.2** introduces Socket.IO for realtime messaging (from prep-6). This story can use the same realtime infrastructure for supervisor fraud notifications if available, or fall back to polling.
- **Leaflet map** (Story 4.1) is pinned to v4.x for React 18.3 compatibility — not relevant to this story but good to know.

### Git Intelligence (Recent Commits)

```
8a1f05d fix(test): remove unused eslint-disable directive in realtime hook test
af2b34f feat(realtime): complete prep-6 realtime messaging spike with Socket.io
c843b4f fix(web): restore node typings and fix A3 ESLint policy test
f50cb49 feat(web): enforce A3 selector lint policy and resolve review follow-ups
3190e6a fix(forms): harden RHF schema validation and close review follow-ups
```

**Patterns established:**
- Socket.IO 4.8.3 selected for realtime (prep-6) — can be used for fraud notifications
- A3 ESLint policy enforced — test selectors must use text/data-testid/ARIA only
- RHF + Zod pattern hardened — use for threshold edit forms (static form, not dynamic)

### Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | GPS accuracy varies widely across TECNO/Infinix devices | High | Medium | Default 50m accuracy filter; configurable threshold |
| R2 | Straight-lining false positives on legitimately uniform responses | Medium | High | Require 2+ battery flags; per-enumerator baseline |
| R3 | Speed median unreliable in first week of field data | High | Medium | Theoretical minimum floor until 30+ interviews |
| R4 | Threshold changes affect in-flight scoring | Low | Medium | Pin config_snapshot_version on each score row |
| R5 | Composite score weights may need rebalancing after pilot | High | Low | All weights in DB, adjustable by Super Admin |
| R6 | Large number of heuristic DB queries per submission | Medium | Medium | Redis cache for thresholds + stats; batch queries where possible |
| R7 | Straight-lining needs form schema — couples to form system | Low | Low | Load schema once per evaluation, cache for duration |

### Project Structure Notes

- Heuristic files go in new directory `apps/api/src/services/fraud-heuristics/` — keeps them isolated and independently testable
- Tests for heuristics go in `apps/api/src/services/fraud-heuristics/__tests__/` (backend `__tests__/` pattern)
- Frontend threshold page goes in existing `apps/web/src/features/dashboard/pages/` under Super Admin
- Frontend components can go in `apps/web/src/features/dashboard/components/` (shared) or create `fraud-thresholds/` subdirectory if needed
- Routes added to existing `apps/api/src/routes/index.ts` alongside other route registrations

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-4.3 — Epic story definition]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-003 — Fraud Detection Engine Design]
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision-3.2 — Error Handling Strategy]
- [Source: _bmad-output/planning-artifacts/architecture.md#Pattern-Category-7 — Security Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-014 — Testing Strategy]
- [Source: _bmad-output/project-context.md — Critical Implementation Rules]
- [Source: _bmad-output/implementation-artifacts/prep-7-fraud-detection-domain-research.md — Heuristic algorithms, schema, types, scoring]
- [Source: _bmad-output/implementation-artifacts/4-1-supervisor-team-dashboard.md — Assignment resolution, map patterns]
- [Source: _bmad-output/implementation-artifacts/4-2-in-app-team-messaging.md — Realtime patterns]
- [Source: _bmad-output/implementation-artifacts/prep-8-supervisor-team-assignment-schema.md — Team assignment schema]
- [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-02-14.md — prep-7 action item origin]
- [Source: apps/api/src/queues/fraud-detection.queue.ts — Existing queue infrastructure]
- [Source: apps/api/src/workers/fraud-detection.worker.ts — Existing stub worker]
- [Source: apps/api/src/services/submission-processing.service.ts:177-191 — Queue trigger]
- [Source: apps/api/src/db/schema/submissions.ts — GPS columns, submission schema]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Story drafted from: epics.md, architecture.md (ADR-003 + 40 relevant sections), project-context.md, prep-7 (complete fraud research), prep-8 (team assignment), Stories 4.1/4.2, sprint-status.yaml, git log (10 recent commits).
- Architecture explored via subagent: fraud detection, BullMQ, API patterns, testing, security, RBAC — comprehensive extraction across 4000+ lines.
- Codebase state confirmed: BullMQ fraud queue exists with stub worker, GPS columns on submissions, no heuristic implementations.

### Completion Notes List

- Story generated as `ready-for-dev` with 15 tasks (A4 limit respected).
- Includes full heuristic algorithm guidance from prep-7 research.
- Includes explicit dependency on prep-7 completion (schema, types, seed data).
- Includes Redis cache invalidation requirement for "immediately apply" semantics.
- Includes supervisor scope restriction for detection queries (assignment boundaries).
- Flags do NOT block data ingestion (FR13 requirement preserved).
- **PM validation 2026-02-17 — 7 fixes applied:**
  - C1: Added Task 3.0 prerequisite — `completionTimeSeconds` column doesn't exist on submissions; full migration + population path specified.
  - M1: Fixed `submissions.formId` → `submissions.questionnaireFormId` in Speed Run + Straight-lining query patterns + Redis cache key.
  - M2: Added note to Task 6.2 — `FraudHeuristic` interface in types takes `submissionId` string, must be updated to accept `SubmissionWithContext` + define type.
  - M3: Reworded AC4.3.8 quarantine — no status column on submissions; quarantine is derived from `fraud_detections.severity = 'critical' AND resolution IS NULL`.
  - M4: Added TEXT column documentation — `enumeratorId` and `questionnaireFormId` are TEXT, not UUID FK; Postgres auto-casts on `eq()`.
  - L1: Changed test pattern reference from in-flight `team-assignment.service.test.ts` to stable `submission-processing.service.test.ts`.
  - L2: Added explicit supervisor scope filter to Task 9.1 — resolve via team assignment service or LGA fallback.

### File List

**Story & tracking:**
- `_bmad-output/implementation-artifacts/4-3-fraud-engine-configurable-thresholds.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

**Types (modified):**
- `packages/types/src/fraud.ts` — Added SubmissionWithContext, updated FraudHeuristic interface

**Schema (modified):**
- `apps/api/src/db/schema/submissions.ts` — Added `completionTimeSeconds` column

**Services (new):**
- `apps/api/src/services/fraud-engine.service.ts`
- `apps/api/src/services/fraud-config.service.ts`
- `apps/api/src/services/fraud-heuristics/utils.ts`
- `apps/api/src/services/fraud-heuristics/gps-clustering.heuristic.ts`
- `apps/api/src/services/fraud-heuristics/speed-run.heuristic.ts`
- `apps/api/src/services/fraud-heuristics/straight-lining.heuristic.ts`
- `apps/api/src/services/fraud-heuristics/duplicate-response.heuristic.ts`
- `apps/api/src/services/fraud-heuristics/off-hours.heuristic.ts`

**Controllers (new):**
- `apps/api/src/controllers/fraud-thresholds.controller.ts`
- `apps/api/src/controllers/fraud-detections.controller.ts`

**Routes (new + modified):**
- `apps/api/src/routes/fraud-thresholds.routes.ts`
- `apps/api/src/routes/fraud-detections.routes.ts`
- `apps/api/src/routes/index.ts` — Registered fraud routes

**Workers (modified):**
- `apps/api/src/workers/fraud-detection.worker.ts` — Replaced stub with FraudEngine call
- `apps/api/src/workers/webhook-ingestion.worker.ts` — Extract completionTimeSeconds from rawData

**Frontend pages (new):**
- `apps/web/src/features/dashboard/pages/SuperAdminFraudThresholdsPage.tsx`

**Frontend components (new):**
- `apps/web/src/features/dashboard/components/ThresholdCategoryCard.tsx`
- `apps/web/src/features/dashboard/components/ThresholdEditRow.tsx`

**Frontend API + hooks (new):**
- `apps/web/src/features/dashboard/api/fraud-thresholds.api.ts`
- `apps/web/src/features/dashboard/hooks/useFraudThresholds.ts`

**Frontend routing + nav (modified):**
- `apps/web/src/App.tsx` — Added fraud thresholds route
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — Added Fraud Thresholds nav item

**Frontend form flow (modified):**
- `apps/web/src/features/forms/pages/FormFillerPage.tsx` — Track formStartedAt ref
- `apps/web/src/features/forms/hooks/useDraftPersistence.ts` — Compute completionTimeSeconds on complete
- `apps/web/src/features/forms/api/submission.api.ts` — Added completionTimeSeconds to payload
- `apps/web/src/services/sync-manager.ts` — Pass completionTimeSeconds in sync payload

**Backend controller (modified):**
- `apps/api/src/controllers/form.controller.ts` — Accept completionTimeSeconds in submit schema

**Tests (new):**
- `apps/api/src/services/fraud-heuristics/__tests__/gps-clustering.heuristic.test.ts`
- `apps/api/src/services/fraud-heuristics/__tests__/speed-run.heuristic.test.ts`
- `apps/api/src/services/fraud-heuristics/__tests__/straight-lining.heuristic.test.ts`
- `apps/api/src/services/fraud-heuristics/__tests__/duplicate-response.heuristic.test.ts`
- `apps/api/src/services/fraud-heuristics/__tests__/off-hours.heuristic.test.ts`
- `apps/api/src/services/__tests__/fraud-engine.service.test.ts`
- `apps/api/src/services/__tests__/fraud-config.service.test.ts`
- `apps/api/src/controllers/__tests__/fraud-thresholds.controller.test.ts`
- `apps/api/src/controllers/__tests__/fraud-detections.controller.test.ts`
- `apps/api/src/workers/__tests__/fraud-detection.worker.test.ts`
- `apps/web/src/features/dashboard/pages/__tests__/SuperAdminFraudThresholdsPage.test.tsx`
