# Story 4.4: Flagged Submission Review (Evidence Panel)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Supervisor,
I want to review the evidence for flagged submissions,
so that I can decide whether to verify or reject them based on fraud detection details.

## Acceptance Criteria

**AC4.4.1 — Fraud detection list replaces placeholder**
**Given** an authenticated Supervisor at `/dashboard/supervisor/fraud`
**When** the page loads
**Then** the placeholder page ("No fraud alerts") is replaced with a real fraud detection table
**And** the table shows flagged submissions for enumerators in the supervisor's LGA only
**And** each row displays: enumerator name, submission date, total fraud score, severity badge, resolution status, and an "Evidence" action button
**And** rows are sorted by `computedAt` descending (newest first).

**AC4.4.2 — Filtering and pagination**
**Given** the fraud detection list
**When** the Supervisor applies filters
**Then** severity filter allows selecting one or more levels (low, medium, high, critical)
**And** resolution status filter allows: "Unreviewed" (null resolution), "Reviewed" (any resolution)
**And** pagination is server-side with 20 items per page, Previous/Next navigation, and total count
**And** "clean" severity items are excluded from the default view (only shown if explicitly filtered).

**AC4.4.3 — Evidence panel with heuristic breakdowns**
**Given** a flagged submission in the list
**When** the Supervisor clicks "Evidence" or the row
**Then** an evidence panel expands (accordion or slide-out drawer) showing:
- **Summary**: total score, severity badge, computed timestamp, config snapshot version
- **GPS section**: cluster membership, accuracy reading, teleportation flag, coordinate distances (from `gpsDetails`)
- **Speed section**: completion time, enumerator median, ratio, tier classification (from `speedDetails`)
- **Straight-lining section**: PIR per battery, entropy, LIS length, flagged battery count (from `straightlineDetails`)
- **Duplicate section**: matched submission IDs, match ratio, matching field names (from `duplicateDetails`)
- **Timing section**: submission hour, weekend flag, local time (from `timingDetails`)
**And** sections with zero score are collapsed by default; sections with non-zero score are expanded
**And** each section shows its component score and max weight (e.g., "GPS: 18/25").

**AC4.4.4 — GPS cluster map in evidence panel**
**Given** the evidence panel is open for a submission with GPS data
**When** the GPS section renders
**Then** a map displays:
- The submission's GPS coordinates as a primary marker
- Cluster member coordinates (if clustered) as secondary markers
- Lines connecting clustered points (optional visual aid)
**And** the map uses Leaflet (react-leaflet v4.x, pinned for React 18.3 compatibility)
**And** if no GPS data exists, the section shows "No GPS data available" instead of a map.

**AC4.4.5 — Individual review workflow**
**Given** the evidence panel is open
**When** the Supervisor clicks "Review"
**Then** a dialog presents resolution options:
- "Verified — False Positive" → resolution: `false_positive`
- "Confirmed Fraud" → resolution: `confirmed_fraud`
- "Needs Investigation" → resolution: `needs_investigation`
- "Dismissed" → resolution: `dismissed`
- "Enumerator Warned" → resolution: `enumerator_warned`
- "Enumerator Suspended" → resolution: `enumerator_suspended`
**And** an optional notes field (max 1000 characters) is provided
**And** on submit, `PATCH /api/v1/fraud-detections/:id/review` is called
**And** success shows a toast and the row updates to reflect the new resolution
**And** the item moves to the "Reviewed" group if filtering by resolution status.

**AC4.4.6 — LGA-scoped data access enforcement**
**Given** a Supervisor with `lgaId = 'ib-north'`
**When** they request fraud detections
**Then** only detections for enumerators assigned to them (via team_assignments) or in their LGA (fallback) are returned
**And** attempting to review a detection outside their scope returns HTTP 403
**And** the API enforces this server-side (frontend does not control access scope).

**AC4.4.7 — UX and accessibility compliance**
**Given** the fraud detection page and evidence panel
**When** data is loading
**Then** skeleton layouts matching the table shape are displayed (not spinners)
**And** severity badges use color-coded chips (green=clean, yellow=low, orange=medium, red=high, dark-red=critical)
**And** all interactive elements are keyboard-navigable (Tab through rows, Enter to open evidence, Escape to close)
**And** empty state shows "No flagged submissions" with appropriate icon when no detections exist for the supervisor.

**AC4.4.8 — Test coverage and regression safety**
**Given** implementation is complete
**When** test suites run
**Then** backend tests cover: detail endpoint joins, LGA scope enforcement, review mutation, RBAC (Supervisor access, non-Supervisor 403)
**And** frontend tests cover: table rendering, severity badges, evidence panel expand/collapse, review dialog flow, loading/empty/error states, filter behavior
**And** no existing supervisor dashboard or role routing tests regress.

## Tasks / Subtasks

- [x] Task 1: Backend — Fraud detection detail endpoint (AC: 4.4.3, 4.4.4, 4.4.6)
  - [x] 1.1: Add `GET /api/v1/fraud-detections/:id` to `fraud-detections.routes.ts` — auth: Supervisor + Assessor + Super Admin
  - [x] 1.2: Implement controller method joining `fraud_detections` with `submissions` (GPS, submittedAt, questionnaireFormId), `users` (enumerator name, lgaId), and `questionnaire_forms` (form title). Cast all `numeric(5,2)` score columns to numbers via `parseFloat()` before returning.
  - [x] 1.3: Enforce LGA scope — supervisor can only access detections for enumerators in their LGA/team

- [x] Task 2: Backend — Enrich list endpoint response (AC: 4.4.1, 4.4.2, 4.4.6)
  - [x] 2.1: Extend `GET /api/v1/fraud-detections` controller to JOIN enumerator name and submission timestamp in list results
  - [x] 2.2: Add query params: `severity` (comma-separated), `reviewed` (boolean), `page`, `limit` (default 20)
  - [x] 2.3: Add LGA scope enforcement — filter by supervisor's lgaId via enumerator's lgaId or team_assignments
  - [x] 2.4: Return pagination meta: `{ page, pageSize, totalPages, totalItems }`

- [x] Task 3: Backend — Drizzle relations for fraud_detections (AC: 4.4.3)
  - [x] 3.1: Add `fraudDetectionsRelations` in `apps/api/src/db/schema/relations.ts`. **Dual-FK `relationName` pattern required** — `fraud_detections` has two FKs to `users` (`enumeratorId` + `reviewedBy`). Both `one()` entries MUST include `relationName` (e.g., `'detectionEnumerator'`, `'detectionReviewer'`). Also extend `usersRelations` with matching `many(fraudDetections, { relationName: 'detectionEnumerator' })` and `many(fraudDetections, { relationName: 'detectionReviewer' })` entries. Add `one(submissions)` for the submission FK. Import `fraudDetections` from `'./fraud-detections.js'`.
  - [x] 3.2: Verify schema exports in `apps/api/src/db/schema/index.ts` include fraud_detections and fraud_thresholds (already confirmed — no changes needed unless imports were missed)

- [x] Task 4: Frontend — API client functions and TanStack Query hooks (AC: 4.4.1, 4.4.3, 4.4.5)
  - [x] 4.1: Create `apps/web/src/features/dashboard/api/fraud.api.ts` — `fetchFraudDetections(params)`, `fetchFraudDetectionDetail(id)`, `submitFraudReview(id, body)`
  - [x] 4.2: Create `apps/web/src/features/dashboard/hooks/useFraudDetections.ts` — `useFraudDetections(params)` query, `useFraudDetectionDetail(id)` query, `useReviewFraudDetection()` mutation with optimistic UI + toast
  - [x] 4.3: Define query keys: `['fraud-detections', params]`, `['fraud-detections', id]`

- [x] Task 5: Frontend — SupervisorFraudPage implementation (AC: 4.4.1, 4.4.2, 4.4.7)
  - [x] 5.1: Replace placeholder content in `SupervisorFraudPage.tsx` with real fraud detection list layout
  - [x] 5.2: Add page header with title "Fraud Alerts", total count badge, and filter controls
  - [x] 5.3: Wire up `useFraudDetections` hook with filter state and pagination
  - [x] 5.4: Add skeleton loading state matching table shape, empty state ("No flagged submissions"), and error boundary

- [x] Task 6: Frontend — FraudDetectionTable + FraudSeverityBadge components (AC: 4.4.1, 4.4.7)
  - [x] 6.1: Create `FraudDetectionTable.tsx` — columns: Enumerator, Submitted, Score, Severity, Status, Actions
  - [x] 6.2: Create `FraudSeverityBadge.tsx` — color-coded chip following StaffStatusBadge pattern (green/yellow/orange/red/dark-red)
  - [x] 6.3: Create `FraudResolutionBadge.tsx` — displays resolution status (unreviewed=gray, false_positive=green, confirmed_fraud=red, etc.)
  - [x] 6.4: Add row click handler to expand/open evidence panel for that detection

- [x] Task 7: Frontend — EvidencePanel component (AC: 4.4.3)
  - [x] 7.1: Create `EvidencePanel.tsx` — accordion layout with collapsible sections per heuristic category
  - [x] 7.2: Create `EvidenceSummary` section — total score gauge, severity, timestamp, enumerator info
  - [x] 7.3: Create `GpsEvidenceSection` — cluster details, accuracy, teleportation flag, coordinate table
  - [x] 7.4: Create `SpeedEvidenceSection` — completion time vs median, tier, per-section breakdown
  - [x] 7.5: Create `StraightlineEvidenceSection` — PIR table, entropy, LIS
  - [x] 7.6: Create `DuplicateEvidenceSection` — matched submissions, field overlap
  - [x] 7.7: Create `TimingEvidenceSection` — submission time, weekend flag
  - [x] 7.8: Sections with zero score collapsed by default, non-zero expanded; each shows "X/Y" score display

- [x] Task 8: Frontend — GPS cluster map component (AC: 4.4.4)
  - [x] 8.1: If Leaflet is already set up from Story 4.1, reuse `react-leaflet` v4.x. If not, install and pin `leaflet@1.9.4` + `react-leaflet@4.2.1`
  - [x] 8.2: Create `GpsClusterMap.tsx` — renders submission point (primary marker), cluster members (secondary markers), and optional connecting lines
  - [x] 8.3: Handle missing GPS gracefully ("No GPS data available" fallback)
  - [x] 8.4: Import Leaflet CSS; wrap map in ErrorBoundary (third-party integration)

- [x] Task 9: Frontend — ReviewDialog component (AC: 4.4.5)
  - [x] 9.1: Create `ReviewDialog.tsx` using AlertDialog pattern — resolution radio/select with all 6 options, optional notes textarea (max 1000 chars)
  - [x] 9.2: Wire to `useReviewFraudDetection()` mutation — on success: toast, invalidate queries, close dialog
  - [x] 9.3: Disable submit while mutation is pending, show loading indicator on button

- [x] Task 10: Frontend — Filter controls (AC: 4.4.2)
  - [x] 10.1: Add severity filter — multi-select chips (low, medium, high, critical); clean excluded by default
  - [x] 10.2: Add resolution filter — toggle between "Unreviewed" / "All" / "Reviewed"
  - [x] 10.3: Connect filters to query params, triggering re-fetch via TanStack Query

- [x] Task 11: Backend tests (AC: 4.4.8)
  - [x] 11.1: Extend `apps/api/src/controllers/__tests__/fraud-detections.controller.test.ts` (created by Story 4.3 Task 13.4) — add tests for detail endpoint JOINs, list filtering, pagination, LGA scope via TeamAssignmentService, review mutation
  - [x] 11.2: Test RBAC: Supervisor access allowed, Enumerator access denied (403), unauthenticated denied (401)
  - [x] 11.3: Test LGA enforcement: Supervisor cannot access detections outside their LGA

- [x] Task 12: Frontend tests (AC: 4.4.8)
  - [x] 12.1: Update `apps/web/src/features/dashboard/pages/__tests__/SupervisorFraudPage.test.tsx` — test list rendering, severity badges, loading skeleton, empty state, error state
  - [x] 12.2: Create `apps/web/src/features/dashboard/components/__tests__/EvidencePanel.test.tsx` — test accordion expand/collapse, heuristic sections rendering, zero-score sections collapsed
  - [x] 12.3: Create `apps/web/src/features/dashboard/components/__tests__/ReviewDialog.test.tsx` — test resolution selection, notes input, submit flow, loading state
  - [x] 12.4: Run full suite (`pnpm test`) — zero regressions

- [x] Task 14: Review Follow-ups (AI Code Review 2026-02-20)
  - [x] 14.1: [AI-Review][HIGH] Add Escape key handler to close evidence panel — AC4.4.7 requires "Escape to close" [SupervisorFraudPage.tsx]
  - [x] 14.2: [AI-Review][HIGH] Add loading skeleton in evidence panel area while detail query loads — prevents layout shift gap [SupervisorFraudPage.tsx]
  - [x] 14.3: [AI-Review][HIGH] Add UUID format validation on `:id` route params in getDetection and reviewDetection — returns 400 instead of PostgreSQL 500 [fraud-detections.controller.ts:182,256]
  - [x] 14.4: [AI-Review][MEDIUM] Pass selectedId to FraudDetectionTable and highlight active row [FraudDetectionTable.tsx, SupervisorFraudPage.tsx]
  - [x] 14.5: [AI-Review][MEDIUM] Show existing review info (resolution, reviewer, notes, date) in EvidencePanel when detection is already reviewed [EvidencePanel.tsx]
  - [x] 14.6: [AI-Review][MEDIUM] Separate unrelated middleware changes (rate-limit.ts, message-rate-limit.ts) from story 4.4 commit — documented as unrelated, not committed with story
  - [x] 14.7: [AI-Review][MEDIUM] Add keyboard navigation tests (Enter to open evidence, Escape to close) [SupervisorFraudPage.test.tsx]
  - [x] 14.8: [AI-Review][LOW] Remove conflicting Tailwind class on Review button — kept inline style, removed dead `bg-maroon-600` class [EvidencePanel.tsx:329]
  - [x] 14.9: [AI-Review][LOW] Add castScores() to reviewDetection response for consistency [fraud-detections.controller.ts:306]
  - [x] 14.10: [AI-Review][LOW] Move JSONB detail types (GpsDetails, SpeedDetails, etc.) to @oslsr/types for shared use [fraud.api.ts:55-98] — done: moved 5 interfaces to packages/types/src/fraud.ts, re-exported from fraud.api.ts

- [x] Task 13: End-to-end verification (AC: all)
  - [x] 13.1: Verify supervisor sees only their LGA's flagged submissions with correct counts
  - [x] 13.2: Verify evidence panel displays correct heuristic breakdowns with GPS map
  - [x] 13.3: Verify review workflow updates resolution and refreshes the list
  - [x] 13.4: Verify non-supervisor roles cannot access supervisor fraud page (403 redirect)
  - [x] 13.5: Verify filters correctly scope the visible detections

## Dev Notes

### Story Foundation

- **Epic source:** `_bmad-output/planning-artifacts/epics.md` Story 4.4 — "Flagged Submission Review (Evidence Panel)"
- **UX source:** `_bmad-output/planning-artifacts/ux-design-specification.md` — Critical Success Moment #2: "Reviewing 15 fraud alerts from enumerator at union meeting." Progressive disclosure pattern: summary card → expand → full evidence panel with map.
- **Dependencies:**
  - **Story 4.3** (MUST be complete): Creates FraudEngine, heuristics, BullMQ worker, threshold/detection API endpoints, fraud-detections controller/routes
  - **Story 4.1** (recommended complete): Introduces Leaflet map, team assignment integration
  - **prep-7** (done): Creates schema, types, seed data
  - **prep-8** (ready-for-dev): Creates team_assignments table for supervisor→enumerator mapping

### What Story 4.3 Already Creates (Do NOT Recreate)

Story 4.3 Task 9 creates these API endpoints — Story 4.4 **extends** them:

| Method | Path | Auth | Created By |
|--------|------|------|------------|
| GET | `/api/v1/fraud-detections` | Supervisor, Assessor, Super Admin | Story 4.3 Task 9.1 |
| PATCH | `/api/v1/fraud-detections/:id/review` | Supervisor, Assessor, Super Admin | Story 4.3 Task 9.3 |

**Story 4.4 adds:**

| Method | Path | Auth | New in 4.4 |
|--------|------|------|-----------|
| GET | `/api/v1/fraud-detections/:id` | Supervisor, Assessor, Super Admin | Detail endpoint with enriched JOINs |

Story 4.4 also **extends** the existing list endpoint (from 4.3) to include enumerator names and submission timestamps via JOINs, and adds filter query params.

### What This Story Creates

```
apps/api/src/controllers/
├── fraud-detections.controller.ts    # EXTEND: add detail method, enrich list
├── __tests__/
│   └── fraud-detections.controller.test.ts  # NEW: detail, scope, filter tests

apps/api/src/routes/
└── fraud-detections.routes.ts        # EXTEND: add GET /:id route

apps/api/src/db/schema/
└── relations.ts                      # EXTEND: add fraudDetections relations

apps/web/src/features/dashboard/
├── pages/
│   ├── SupervisorFraudPage.tsx       # REPLACE: placeholder → real implementation
│   └── __tests__/
│       └── SupervisorFraudPage.test.tsx  # REPLACE: stub → real tests
├── api/
│   └── fraud.api.ts                  # NEW: fraud API client functions
├── hooks/
│   └── useFraudDetections.ts         # NEW: TanStack Query hooks
├── components/
│   ├── FraudDetectionTable.tsx       # NEW
│   ├── FraudSeverityBadge.tsx        # NEW
│   ├── FraudResolutionBadge.tsx      # NEW
│   ├── EvidencePanel.tsx             # NEW (accordion with heuristic sections)
│   ├── GpsClusterMap.tsx             # NEW (Leaflet map for GPS evidence)
│   ├── ReviewDialog.tsx              # NEW (resolution selection dialog)
│   └── __tests__/
│       ├── EvidencePanel.test.tsx    # NEW
│       └── ReviewDialog.test.tsx     # NEW
```

### Database Schema — fraud_detections (Created by prep-7)

```typescript
// Key columns for Story 4.4 UI
fraudDetections = pgTable('fraud_detections', {
  id: uuid('id').primaryKey(),
  submissionId: uuid('submission_id').references(() => submissions.id),
  enumeratorId: uuid('enumerator_id').references(() => users.id),
  computedAt: timestamp('computed_at'),
  configSnapshotVersion: integer('config_snapshot_version'),
  // Component scores
  gpsScore, speedScore, straightlineScore, duplicateScore, timingScore, totalScore,
  // Severity: 'clean' | 'low' | 'medium' | 'high' | 'critical'
  severity: text('severity'),
  // JSONB evidence details (populated by heuristics in Story 4.3)
  gpsDetails, speedDetails, straightlineDetails, duplicateDetails, timingDetails,
  // Resolution workflow (set by Story 4.4 review action)
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  resolution: text('resolution'),  // 'confirmed_fraud' | 'false_positive' | 'needs_investigation' | 'dismissed' | 'enumerator_warned' | 'enumerator_suspended'
  resolutionNotes: text('resolution_notes'),
});
```

**Indexes (already exist):**
- `idx_fraud_detections_severity_resolution` — efficient filtering
- `idx_fraud_detections_enumerator_id` — LGA-scoped queries
- `idx_fraud_detections_submission_id` — detail lookups

### Detail Endpoint Query Pattern

> **Important: Drizzle `numeric(5,2)` returns strings.** All component scores (`gpsScore`, `speedScore`, etc.) and `totalScore` are `numeric(5,2)` — Drizzle returns them as strings (e.g., `"18.50"`). The controller MUST cast to numbers via `parseFloat()` before sending to the frontend. Follow the established pattern: `parseFloat(row.totalScore)` (see `user.controller.ts:55`, `supervisor.controller.ts:53`).

```typescript
// GET /api/v1/fraud-detections/:id — enriched with JOINs
const detection = await db.select({
  // fraud_detections fields
  id: fraudDetections.id,
  totalScore: fraudDetections.totalScore,
  severity: fraudDetections.severity,
  gpsScore: fraudDetections.gpsScore,
  speedScore: fraudDetections.speedScore,
  straightlineScore: fraudDetections.straightlineScore,
  duplicateScore: fraudDetections.duplicateScore,
  timingScore: fraudDetections.timingScore,
  gpsDetails: fraudDetections.gpsDetails,
  speedDetails: fraudDetections.speedDetails,
  straightlineDetails: fraudDetections.straightlineDetails,
  duplicateDetails: fraudDetections.duplicateDetails,
  timingDetails: fraudDetections.timingDetails,
  computedAt: fraudDetections.computedAt,
  configSnapshotVersion: fraudDetections.configSnapshotVersion,
  resolution: fraudDetections.resolution,
  resolutionNotes: fraudDetections.resolutionNotes,
  reviewedAt: fraudDetections.reviewedAt,
  // JOINed submission data
  submissionId: submissions.id,
  gpsLatitude: submissions.gpsLatitude,
  gpsLongitude: submissions.gpsLongitude,
  submittedAt: submissions.submittedAt,
  // JOINed enumerator data
  enumeratorName: users.fullName,
  enumeratorLgaId: users.lgaId,
  // JOINed form data
  formName: questionnaireForms.title,
})
.from(fraudDetections)
.innerJoin(submissions, eq(fraudDetections.submissionId, submissions.id))
.innerJoin(users, eq(fraudDetections.enumeratorId, users.id))
.leftJoin(questionnaireForms, eq(submissions.questionnaireFormId, questionnaireForms.id))
.where(eq(fraudDetections.id, detectionId));
```

### LGA Scope Enforcement Pattern

Use `TeamAssignmentService.getEnumeratorIdsForSupervisor()` — it already has LGA fallback built in (returns `[]` if supervisor has no lgaId, preventing null comparison issues):

```typescript
import { TeamAssignmentService } from '../services/team-assignment.service.js';
import { inArray } from 'drizzle-orm';

// Supervisor can only see detections for their assigned enumerators
const user = req.user; // from authenticate middleware
if (user.role === UserRole.SUPERVISOR) {
  const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(user.sub);
  if (enumeratorIds.length === 0) {
    return res.json({ data: [], page: 1, pageSize: 20, totalPages: 0, totalItems: 0 });
  }
  query = query.where(inArray(fraudDetections.enumeratorId, enumeratorIds));
}
// Super Admin and Assessor see all detections (state-wide)
```

### Evidence Panel — JSONB Detail Shapes

Each heuristic stores its evidence in a JSONB column. The evidence panel reads these:

```typescript
// gpsDetails shape (from GPS Clustering heuristic)
{
  clusterCount: number;
  clusterMembers: Array<{ submissionId: string; lat: number; lng: number; submittedAt: string }>;
  accuracy: number | null;          // GPS accuracy in meters
  teleportationFlag: boolean;       // >120km/h between consecutive
  teleportationSpeed?: number;      // km/h
  duplicateCoords: boolean;         // <5m between different enumerators
  nearestNeighborDistance?: number;  // meters
}

// speedDetails shape (from Speed Run heuristic)
{
  completionTimeSeconds: number;
  medianTimeSeconds: number | null;
  ratio: number;                    // completionTime / median
  tier: 'superspeceder' | 'speeder' | null;
  historicalCount: number;          // interviews used for median
  theoreticalMinimum?: number;      // fallback floor in seconds
  perSectionBreakdown?: Array<{ section: string; timeSeconds: number }>;
}

// straightlineDetails shape
{
  batteries: Array<{
    sectionName: string;
    questionCount: number;
    pir: number;                    // Percentage Identical Responses
    entropy: number;                // Shannon entropy (bits)
    lis: number;                    // Longest Identical String
    flagged: boolean;
  }>;
  flaggedBatteryCount: number;
}

// duplicateDetails shape
{
  matchType: 'exact' | 'partial' | null;
  matchedSubmissions: Array<{ submissionId: string; matchRatio: number }>;
  matchingFields: string[];
}

// timingDetails shape
{
  submissionHour: number;           // 0-23
  isWeekend: boolean;
  localTime: string;                // ISO string
  isOffHours: boolean;              // 11PM-5AM
}
```

### Severity Badge Color Mapping

Follow the existing `StaffStatusBadge` pattern (inline-flex, rounded-full, color chip):

| Severity | Background | Text | Dot Color |
|----------|-----------|------|-----------|
| clean | `bg-green-100` | `text-green-700` | `bg-green-500` |
| low | `bg-yellow-100` | `text-yellow-700` | `bg-yellow-500` |
| medium | `bg-orange-100` | `text-orange-700` | `bg-orange-500` |
| high | `bg-red-100` | `text-red-700` | `bg-red-500` |
| critical | `bg-red-200` | `text-red-900` | `bg-red-700` |

### Resolution Option Mapping

Map user-friendly labels to `FraudResolution` enum values:

| UI Label | Resolution Value | Color/Icon |
|----------|-----------------|------------|
| Verified — False Positive | `false_positive` | Green checkmark |
| Confirmed Fraud | `confirmed_fraud` | Red X |
| Needs Investigation | `needs_investigation` | Orange magnifier |
| Dismissed | `dismissed` | Gray dash |
| Enumerator Warned | `enumerator_warned` | Yellow warning |
| Enumerator Suspended | `enumerator_suspended` | Red ban |

### Frontend Patterns to Follow

**TanStack Query keys:**
```typescript
// Query key factory
export const fraudKeys = {
  all: ['fraud-detections'] as const,
  lists: () => [...fraudKeys.all, 'list'] as const,
  list: (params: FraudFilterParams) => [...fraudKeys.lists(), params] as const,
  details: () => [...fraudKeys.all, 'detail'] as const,
  detail: (id: string) => [...fraudKeys.details(), id] as const,
};
```

**Mutation with toast (following useOptimisticMutation pattern):**
```typescript
export function useReviewFraudDetection() {
  const queryClient = useQueryClient();
  return useOptimisticMutation({
    mutationFn: ({ id, resolution, resolutionNotes }: ReviewPayload) =>
      submitFraudReview(id, { resolution, resolutionNotes }),
    successMessage: 'Review submitted successfully',
    errorMessage: 'Failed to submit review',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fraudKeys.all });
    },
  });
}
```

**API client pattern:**
```typescript
// fraud.api.ts
export async function fetchFraudDetections(params: FraudFilterParams) {
  const searchParams = new URLSearchParams();
  if (params.severity) searchParams.set('severity', params.severity.join(','));
  if (params.reviewed !== undefined) searchParams.set('reviewed', String(params.reviewed));
  searchParams.set('page', String(params.page || 1));
  searchParams.set('limit', String(params.limit || 20));
  return apiClient(`/fraud-detections?${searchParams.toString()}`);
}

export async function fetchFraudDetectionDetail(id: string) {
  return apiClient(`/fraud-detections/${id}`);
}

export async function submitFraudReview(id: string, body: ReviewBody) {
  return apiClient(`/fraud-detections/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
```

**Loading states:** Use `SkeletonTable rows={5} columns={6}` for the detection list. Use `SkeletonCard` for the evidence panel sections.

**Test selectors:** Use text content, `data-testid`, and ARIA roles ONLY (A3 rule). Never CSS class selectors.

### Map Library Decision

Story 4.1 specifies: "Pin versions compatible with React 18.3. Prefer react-leaflet v4.x."

| Package | Version | Notes |
|---------|---------|-------|
| `leaflet` | `1.9.4` | Stable, widely used |
| `react-leaflet` | `4.2.1` | Last version supporting React 18 |
| `@types/leaflet` | `1.9.x` | TypeScript types |

If Story 4.1 has already installed these, reuse. If not, Story 4.4 installs them.

**Leaflet CSS must be imported** (either in `GpsClusterMap.tsx` or in the root CSS):
```typescript
import 'leaflet/dist/leaflet.css';
```

**Wrap map in ErrorBoundary** — third-party libraries can crash:
```tsx
<ErrorBoundary fallbackProps={{ title: 'Map Error', description: 'Unable to render GPS map.' }}>
  <GpsClusterMap coordinates={gpsDetails?.clusterMembers} primary={primaryCoords} />
</ErrorBoundary>
```

### ESM Import Convention (Backend)

All relative imports in `apps/api/src/` MUST include `.js` extension:
```typescript
// CORRECT
import { fraudDetections } from '../db/schema/fraud-detections.js';
import { submissions } from '../db/schema/submissions.js';

// WRONG — will fail at runtime
import { fraudDetections } from '../db/schema/fraud-detections';
```

### Existing Patterns to Follow

| Pattern | Source File | Reuse For |
|---------|-----------|-----------|
| Table component | `apps/web/src/features/staff/components/StaffTable.tsx` | FraudDetectionTable layout |
| Status badge | `apps/web/src/features/staff/components/StaffStatusBadge.tsx` | FraudSeverityBadge, FraudResolutionBadge |
| Controller + RBAC | `apps/api/src/controllers/supervisor.controller.ts` | Fraud detections controller |
| Route + auth | `apps/api/src/routes/supervisor.routes.ts` | Fraud detections routes |
| TanStack hooks | `apps/web/src/features/dashboard/hooks/useSupervisor.ts` | useFraudDetections hooks |
| API client | `apps/web/src/features/dashboard/api/supervisor.api.ts` | fraud.api.ts pattern |
| AlertDialog | DeactivateDialog, ReactivateDialog in staff features | ReviewDialog |
| Dashboard page | `apps/web/src/features/dashboard/pages/SupervisorHome.tsx` | Page structure pattern |
| Backend tests | `apps/api/src/controllers/__tests__/supervisor.controller.test.ts` | Controller test with mocks |
| Frontend page tests | `apps/web/src/features/dashboard/pages/__tests__/SupervisorHome.test.tsx` | Page test pattern |
| Validation schemas | `packages/types/src/validation/fraud.ts` | `reviewFraudDetectionSchema` (already exists) |

### What NOT to Do

- **Do NOT recreate fraud-detections routes/controller from scratch** — Story 4.3 creates the base; Story 4.4 extends it.
- **Do NOT implement bulk verification** — that is Story 4.5. Story 4.4 is individual record review only.
- **Do NOT modify heuristic implementations** — they are Story 4.3's scope.
- **Do NOT block submissions based on fraud flags** — FR13 says "Flags do NOT block data."
- **Do NOT use PostGIS for the map** — Leaflet renders client-side from lat/lng coordinates stored in `gpsDetails`.
- **Do NOT upgrade React** — pin react-leaflet to v4.x for React 18.3 compatibility.
- **Do NOT use `console.log`** — all logging through Pino structured events.
- **Do NOT use generic spinners** — skeleton screens only.
- **Do NOT use CSS class selectors in tests** — A3 rule: text/data-testid/ARIA only.
- **Do NOT give Supervisors access to threshold management** — thresholds are Super Admin only (Story 4.3). Supervisors only review detections.

### Relation to Surrounding Stories

- **Story 4.1** (Supervisor Team Dashboard): Introduces team assignment resolution and Leaflet map. Story 4.4 reuses both patterns.
- **Story 4.3** (Fraud Engine): Creates the entire backend fraud infrastructure (engine, heuristics, API, threshold UI). Story 4.4 builds the review UI on top.
- **Story 4.5** (Bulk Verification of Mass-Events): Extends Story 4.4 with multi-select and "Verify Mass Event" capability for GPS clusters. Story 4.4 builds the single-record foundation that 4.5 extends.
- **Story 5.2** (Verification Assessor Audit Queue): Assessors do state-wide secondary review using the same fraud_detections data. Story 4.4's API endpoints are already multi-role (Supervisor + Assessor + Super Admin), so Assessor frontend can use the same API.

### Previous Story Intelligence (Git)

```
8a1f05d fix(test): remove unused eslint-disable directive in realtime hook test
af2b34f feat(realtime): complete prep-6 realtime messaging spike with Socket.io
c843b4f fix(web): restore node typings and fix A3 ESLint policy test
f50cb49 feat(web): enforce A3 selector lint policy and resolve review follow-ups
3190e6a fix(forms): harden RHF schema validation and close review follow-ups
```

**Key patterns from recent work:**
- A3 ESLint policy is enforced — test selectors MUST use text/data-testid/ARIA
- Socket.IO 4.8.3 available for future realtime fraud notifications
- RHF + Zod pattern established — use for ReviewDialog form

### Sidebar Navigation (Already Configured)

The supervisor sidebar already has "Fraud Alerts" at `/dashboard/supervisor/fraud`:
```typescript
// sidebarConfig.ts — NO CHANGES NEEDED
supervisor: [
  { label: 'Home', href: '/dashboard/supervisor', icon: Home },
  { label: 'Team Progress', href: '/dashboard/supervisor/team', icon: Users },
  { label: 'Fraud Alerts', href: '/dashboard/supervisor/fraud', icon: AlertTriangle },
  { label: 'Messages', href: '/dashboard/supervisor/messages', icon: MessageSquare },
],
```

The route is also already wired in `App.tsx`:
```tsx
<Route path="fraud" element={<Suspense fallback={<DashboardLoadingFallback />}><SupervisorFraudPage /></Suspense>} />
```

No routing or sidebar changes needed — just replace the page implementation.

### Project Structure Notes

- Frontend components go in `apps/web/src/features/dashboard/components/` — shared dashboard components
- Frontend tests use `__tests__/` subdirectory (existing project convention for page/component tests)
- Backend controller tests go in `apps/api/src/controllers/__tests__/`
- API functions and hooks go alongside existing supervisor api/hooks files
- Reuse existing `apiClient` from `apps/web/src/lib/api-client.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-4.4 — Epic story definition]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-003 — Fraud Detection Engine Design]
- [Source: _bmad-output/planning-artifacts/architecture.md#RBAC-Matrix — Role permissions for fraud endpoints]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Critical Success Moment #2: Bulk Fraud Verification UX]
- [Source: _bmad-output/project-context.md — Critical Implementation Rules (A3, skeleton, AppError, ESM)]
- [Source: _bmad-output/implementation-artifacts/prep-7-fraud-detection-domain-research.md — Schema, types, seed data, heuristic algorithms]
- [Source: _bmad-output/implementation-artifacts/4-3-fraud-engine-configurable-thresholds.md — FraudEngine, API endpoints, heuristic implementations]
- [Source: _bmad-output/implementation-artifacts/4-1-supervisor-team-dashboard.md — Team assignment, Leaflet map, supervisor dashboard patterns]
- [Source: _bmad-output/implementation-artifacts/prep-8-supervisor-team-assignment-schema.md — Team assignments table for LGA scoping]
- [Source: apps/api/src/db/schema/fraud-detections.ts — Fraud detections table schema]
- [Source: apps/api/src/db/schema/fraud-thresholds.ts — Fraud thresholds table schema]
- [Source: apps/api/src/db/schema/submissions.ts — GPS columns, submission data]
- [Source: packages/types/src/fraud.ts — FraudSeverity, FraudResolution, FraudDetectionResult types]
- [Source: packages/types/src/validation/fraud.ts — reviewFraudDetectionSchema Zod schema]
- [Source: apps/web/src/features/dashboard/pages/SupervisorFraudPage.tsx — Current placeholder to replace]
- [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts — Sidebar already configured]
- [Source: apps/web/src/features/staff/components/StaffStatusBadge.tsx — Badge pattern]
- [Source: apps/web/src/features/staff/components/StaffTable.tsx — Table pattern]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Story drafted from: epics.md (Story 4.4 definition), architecture.md (ADR-003, RBAC, API patterns), project-context.md, prep-7 (fraud schema/types), Stories 4.1/4.2/4.3, ux-design-specification.md, sprint-status.yaml, git log, comprehensive codebase exploration (62 tool uses).
- Confirmed: fraud_detections schema exists with JSONB detail columns, resolution workflow columns, and appropriate indexes.
- Confirmed: SupervisorFraudPage is placeholder-only ("No fraud alerts"), route already wired at `/dashboard/supervisor/fraud`.
- Confirmed: Story 4.3 creates base API endpoints; Story 4.4 extends and builds UI on top.
- Confirmed: Leaflet decision from Story 4.1 (react-leaflet v4.x for React 18.3).

### Completion Notes List

- Story generated as `ready-for-dev` with 8 ACs and 13 tasks (within 15-task limit).
- Depends on Story 4.3 (fraud engine, API endpoints) being complete — clearly documented.
- Extends (not duplicates) Story 4.3's API endpoints with enriched detail endpoint and JOINs.
- Individual record review only — bulk verification deferred to Story 4.5.
- Map uses Leaflet (react-leaflet v4.x) reusing Story 4.1's library decision.
- All 6 fraud resolution types supported with user-friendly labels.
- LGA scope enforcement documented with query patterns.
- JSONB detail shapes documented for all 5 heuristic categories.
- **PM validation 2026-02-17 — 6 fixes applied:**
  - M1: Task 3.1 — added explicit dual-FK `relationName` pattern for `enumeratorId` + `reviewedBy` FKs to users, plus `many()` entries on `usersRelations`.
  - M2: LGA scope pattern — replaced raw `eq(users.lgaId)` with `TeamAssignmentService.getEnumeratorIdsForSupervisor()` (has built-in LGA fallback, handles null lgaId).
  - M3: Added `numeric(5,2)` → `parseFloat()` cast documentation — Drizzle returns strings for numeric columns. Controller must cast before sending to frontend.
  - M4: Task 1.2 — fixed `formId` → `questionnaireFormId`, added score cast reminder.
  - L1: Task 11.1 — changed "Create" to "Extend" (file created by Story 4.3 Task 13.4).
  - L2: Supervisor lgaId null guard — handled by M2 fix (TeamAssignmentService returns `[]` when no lgaId).

### Implementation Notes (2026-02-20)

- All 13 tasks and 53 subtasks completed in a single session.
- **Key technical decisions:**
  - SQL cast `::uuid` needed for LEFT JOIN between `submissions.questionnaireFormId` (text) and `questionnaireForms.id` (uuid)
  - `castScores()` helper centralizes `parseFloat()` conversion for all `numeric(5,2)` Drizzle columns
  - Comma-separated severity filter parsed to array, validated against enum, cast to `SeverityEnum[]` for `inArray()`
  - Default clean-exclusion implemented via `not(eq(fraudDetections.severity, 'clean'))` when no explicit severity filter
  - `useOptimisticMutation` with spread `[...fraudKeys.all]` to satisfy readonly→mutable array constraint
- **Test results:** 1,457 tests across 128 files (4 turbo tasks), 0 regressions
  - Backend fraud controller: 21 tests (detail, list, scope, review, RBAC, filters)
  - Frontend EvidencePanel: 11 tests (accordion, heuristics, GPS/speed/timing details)
  - Frontend ReviewDialog: 12 tests (resolution options, notes, submit, loading)
  - Frontend SupervisorFraudPage: 14 tests (structure, filters, states, pagination, evidence panel)

### Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-02-17 | Story created as ready-for-dev | PM validation with 6 fixes (M1-M4, L1-L2) |
| 2026-02-20 | All 13 tasks implemented | Full-stack fraud evidence panel + review workflow |
| 2026-02-20 | Status → review | All ACs satisfied, 1,457 tests pass, 0 regressions |
| 2026-02-20 | Adversarial code review | 10 findings (3H, 4M, 3L) — 9/10 fixed, 1 deferred (L3: type migration) |
| 2026-02-20 | Status → done | 1,462 tests pass (5 new), 0 regressions, all HIGH/MEDIUM fixed |
| 2026-02-20 | L3 resolved | Moved 5 JSONB detail interfaces to @oslsr/types — 10/10 review items complete |

### File List

**Backend (modified):**
- `apps/api/src/controllers/fraud-detections.controller.ts` — Added `getDetection` detail endpoint, enriched `listDetections` with JOINs/filters/pagination
- `apps/api/src/routes/fraud-detections.routes.ts` — Added `GET /:id` route
- `apps/api/src/db/schema/relations.ts` — Added `fraudDetectionsRelations`, extended `usersRelations` with dual-FK pattern

**Backend tests (modified):**
- `apps/api/src/controllers/__tests__/fraud-detections.controller.test.ts` — Rewritten: 21 tests covering detail, list, scope, review, RBAC, filters

**Frontend (new):**
- `apps/web/src/features/dashboard/api/fraud.api.ts` — API client functions + TypeScript interfaces
- `apps/web/src/features/dashboard/hooks/useFraudDetections.ts` — TanStack Query hooks + key factory
- `apps/web/src/features/dashboard/components/FraudDetectionTable.tsx` — Table with 6 columns
- `apps/web/src/features/dashboard/components/FraudSeverityBadge.tsx` — Color-coded severity badge
- `apps/web/src/features/dashboard/components/FraudResolutionBadge.tsx` — Resolution status badge
- `apps/web/src/features/dashboard/components/EvidencePanel.tsx` — Accordion evidence panel with 5 heuristic sections
- `apps/web/src/features/dashboard/components/GpsClusterMap.tsx` — Leaflet map with markers + connecting lines
- `apps/web/src/features/dashboard/components/ReviewDialog.tsx` — AlertDialog with 6 resolution options + notes

**Frontend (replaced):**
- `apps/web/src/features/dashboard/pages/SupervisorFraudPage.tsx` — Replaced placeholder with full implementation

**Frontend tests (new/modified):**
- `apps/web/src/features/dashboard/pages/__tests__/SupervisorFraudPage.test.tsx` — Rewritten: 14 tests
- `apps/web/src/features/dashboard/components/__tests__/EvidencePanel.test.tsx` — New: 11 tests
- `apps/web/src/features/dashboard/components/__tests__/ReviewDialog.test.tsx` — New: 12 tests

**Story artifacts:**
- `_bmad-output/implementation-artifacts/4-4-flagged-submission-review-evidence-panel.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
