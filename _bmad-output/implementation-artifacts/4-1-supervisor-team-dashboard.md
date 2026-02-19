# Story 4.1: Supervisor Team Dashboard

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Supervisor,
I want to view a real-time dashboard of my assigned team's progress,
so that I can monitor daily quotas and identify laggards.

## Acceptance Criteria

**AC4.1.1 - Team Roster in Supervisor Dashboard**
**Given** an authenticated Supervisor session
**When** I open `/dashboard/supervisor` or `/dashboard/supervisor/team`
**Then** I see only my assigned enumerators (target: 3 per LGA) with:
- Name
- Activity status (`active`, `verified`, `inactive`)
- Last sync / last submission timestamp
- Daily and weekly submission counts

**AC4.1.2 - Assignment Boundary Enforcement**
**Given** prep-8 (Supervisor Team Assignment Schema) is complete — providing `team_assignments` table, assignment resolution service with LGA fallback, and dev seed data
**When** team data is queried
**Then** only enumerators assigned to that supervisor are returned (via prep-8's `getEnumeratorIdsForSupervisor()`)
**And** if no explicit assignment records exist, the service's built-in LGA-scoped fallback is used (prep-8 AC4).
> **Prerequisite:** Story prep-8 MUST be completed before this story begins. Do NOT recreate the assignment schema, resolution service, or seed data — import and wire up prep-8's service.

**AC4.1.3 - GPS Map View of Latest Submissions**
**Given** assigned enumerators have submitted forms with GPS coordinates
**When** the supervisor opens Team Dashboard
**Then** the dashboard renders a map with each enumerator's latest GPS-captured submission point
**And** each marker includes enumerator identity and submission time.

**AC4.1.4 - Performance and Freshness**
**Given** normal operations
**When** new submissions arrive
**Then** supervisor team metrics and map data become visible within the architecture target window (<5s p95 ingestion-to-dashboard)
**And** frontend polling / refresh behavior avoids excessive request load.

**AC4.1.5 - UX and Accessibility Compliance**
**Given** dashboard loading and error states
**When** data is loading or unavailable
**Then** skeleton layouts (not generic spinners) are shown using existing project patterns
**And** map/list panels have accessible labels and keyboard-usable controls.

**AC4.1.6 - Test Coverage and Regression Safety**
**Given** implementation is complete
**When** test suites are run
**Then** backend controller/service tests validate role/assignment filtering, counts, and GPS payloads
**And** frontend page/component tests validate roster rendering, map markers, loading/empty/error states
**And** no existing role-routing or dashboard tests regress.

## Tasks / Subtasks

- [x] Task 1: Wire up prep-8's assignment resolution service (AC: 4.1.1, 4.1.2)
  - [x] 1.1: Verify prep-8 is complete — `team_assignments` table exists, `team-assignment.service.ts` exports `getEnumeratorIdsForSupervisor()`, dev seed data assigns 3 enumerators to the test supervisor. If prep-8 is NOT complete, stop and complete it first.
  - [x] 1.2: Import `getEnumeratorIdsForSupervisor` from `apps/api/src/services/team-assignment.service.ts` into the supervisor controller. Use it to resolve the enumerator ID list for the authenticated supervisor.
  - [x] 1.3: Ensure only enumerator-role users are included in team roster queries (prep-8's service already handles this via role validation).

- [x] Task 2: Backend team metrics endpoint(s) (AC: 4.1.1, 4.1.2, 4.1.4)
  - [x] 2.1: Add/extend supervisor API endpoint to return per-enumerator daily + weekly counts and last activity. Query `submissions` using `submitterId` column (TEXT — the JWT user ID set at submission time in `form.controller.ts:104`). Filter by the enumerator ID list from Task 1.2 using the existing cast pattern: `${submissions.submitterId}::uuid IN (...)` (see `supervisor.controller.ts:87` and `form.controller.ts:212` for precedent).
  - [x] 2.2: Keep existing auth and RBAC (`authenticate` + `authorize(UserRole.SUPERVISOR)`) intact.
  - [x] 2.3: Use indexed submission fields and bounded date filters for daily/weekly queries. The `idx_submissions_submitter_id` index on `submitterId` supports the filter.

- [x] Task 3: Backend latest GPS map endpoint (AC: 4.1.3, 4.1.4)
  - [x] 3.1: Add endpoint returning latest valid GPS point per assigned enumerator (lat/lng + submittedAt + enumerator info). Use PostgreSQL `DISTINCT ON (submitter_id) ORDER BY submitted_at DESC` or a window function to get one row per enumerator — do NOT use N+1 queries or fetch all rows and filter in JS. Filter by the enumerator ID list from Task 1.2 with the same `submitterId::uuid IN (...)` cast pattern.
  - [x] 3.2: Exclude records without GPS coordinates (`WHERE gps_latitude IS NOT NULL AND gps_longitude IS NOT NULL`).
  - [x] 3.3: Return deterministic payload shape for frontend map rendering: `{ enumeratorId, enumeratorName, latitude, longitude, submittedAt }`.

- [x] Task 4: Frontend API + hooks integration (AC: 4.1.1, 4.1.3)
  - [x] 4.1: Add supervisor dashboard API functions for team roster metrics and map points.
  - [x] 4.2: Add TanStack Query hooks and query keys under `features/dashboard/hooks`.
  - [x] 4.3: Reuse refresh/invalidation patterns already used in `SupervisorHome.tsx`.

- [x] Task 5: Supervisor team UI implementation (AC: 4.1.1, 4.1.3, 4.1.5)
  - [x] 5.1: Replace placeholder UI in `SupervisorTeamPage.tsx` with real roster cards/table and summary stats.
  - [x] 5.2: Add map panel showing latest points for assigned enumerators.
  - [x] 5.3: Add loading/empty/error states with skeleton and accessible fallback copy.

- [x] Task 6: Install and pin map library (AC: 4.1.3)
  - [x] 6.1: Install `leaflet@1.9.4` + `react-leaflet@4.x` (latest v4 minor). Do NOT install react-leaflet v5 — it requires React 19, and the project is locked to React 18.3 per project-context.md. Install `@types/leaflet` for TypeScript support. Pin exact versions in `package.json`.
  - [x] 6.2: Import Leaflet CSS in the map component (not globally). Ensure Leaflet tile assets work with the PWA service worker for offline tile caching if needed.
  - [x] 6.3: Document the version choice in completion notes. This decision propagates to Story 4.3 (fraud GPS evidence maps) — the same component/library will be reused.

- [x] Task 7: Tests (AC: 4.1.6)
  - [x] 7.1: Add backend tests for assignment filtering, unauthorized access, and GPS payload generation.
  - [x] 7.2: Rewrite `SupervisorTeamPage.test.tsx` — the existing file (37 lines) tests the placeholder state ("No enumerators assigned yet") which will be replaced entirely. Write new tests for roster rendering, map marker rendering, loading/empty/error states, and refresh behavior. Follow the mock pattern from `SupervisorHome.test.tsx` (vi.hoisted + vi.mock).
  - [x] 7.3: Ensure test selectors follow project rule A3 (text/data-testid/ARIA only; no CSS-class selectors).

- [x] Task 8: End-to-end verification (AC: all)
  - [x] 8.1: Verify supervisor in LGA sees only assigned enumerators and correct daily/weekly counts.
  - [x] 8.2: Verify latest GPS markers update after new submissions.
  - [x] 8.3: Verify non-supervisor roles cannot access supervisor endpoints or pages.

## Dev Notes

### Story Foundation

- Epic source: `_bmad-output/planning-artifacts/epics.md` Story 4.1.
- PRD source: `_bmad-output/planning-artifacts/prd.md` Story 4.1 requires comprehensive supervisor dashboard monitoring (status, quota progress, map view, alerts, trends).
- **BLOCKER: prep-8 (Supervisor Team Assignment Schema)** must be complete before this story begins. prep-8 creates the `team_assignments` table, assignment resolution service (`getEnumeratorIdsForSupervisor` with LGA fallback), dev seed data (3 enumerators assigned to test supervisor), and tests. This story imports and wires up that service — it does NOT recreate it.
- Retrospective source: `_bmad-output/implementation-artifacts/epic-3-retro-2026-02-14.md` identifies prep-8 as a high-priority prerequisite.

### Current Implementation Intelligence

- Existing supervisor APIs already provide:
  - Team overview counts: `GET /api/v1/supervisor/team-overview`
  - Pending alerts: `GET /api/v1/supervisor/pending-alerts`
- Existing supervisor UI:
  - `SupervisorHome.tsx` is live and data-driven.
  - `SupervisorTeamPage.tsx` is currently placeholder-only and explicitly states real team data comes in Epic 4.

### Data and Architecture Constraints

- Submission GPS data is available in `submissions.gps_latitude` and `submissions.gps_longitude` (doublePrecision columns).
- **Enumerator identification column:** Use `submissions.submitterId` (TEXT, not UUID FK) — this is the JWT user ID set at submission time (`form.controller.ts:104`). Note: `submissions.enumeratorId` (also TEXT) was added in Story 3.4 for explicit linking but may not be populated on all records. `submitterId` is the safe choice — populated on every submission.
- **TEXT→UUID cast pattern:** The existing codebase casts `submitterId` to UUID for subqueries: `${submissions.submitterId}::uuid IN (SELECT ...)`. See `supervisor.controller.ts:87` and `form.controller.ts:212` for precedent. Follow this pattern.
- **Index:** `idx_submissions_submitter_id` exists on `submitterId` — supports the filter.
- Ingestion target from architecture is near-real-time visibility (submission to supervisor dashboard <5s p95).
- Apply project conventions from `project-context.md`:
  - UUIDv7 IDs only
  - snake_case DB, camelCase API payloads
  - AppError for API errors
  - skeleton loading, not generic spinners
  - strict RBAC boundaries.

### Latest Technical Specifics (Web Research)

- **Map library decision: `leaflet@1.9.4` + `react-leaflet@4.x`** (latest v4 minor). This is the only production-stable option compatible with React 18.3. react-leaflet v5 requires React 19 (blocked by project-context.md). Leaflet 2.0.0-alpha.1 is pre-release — do not use. This choice propagates to Story 4.3 (fraud GPS evidence maps).
- Socket.IO latest 4.8.x includes bundle fixes; however, Story 4.1 ships with polling/refresh model and defers realtime channel complexity to Story 4.2.

### Suggested Backend Touch Points

- `apps/api/src/controllers/supervisor.controller.ts` — add team metrics + GPS endpoints
- `apps/api/src/routes/supervisor.routes.ts` — register new routes
- `apps/api/src/services/team-assignment.service.ts` — import `getEnumeratorIdsForSupervisor` (created by prep-8, do NOT recreate)
- `apps/api/src/controllers/__tests__/supervisor.controller.test.ts` — extend with new endpoint tests

### Suggested Frontend Touch Points

- `apps/web/src/features/dashboard/pages/SupervisorTeamPage.tsx`
- `apps/web/src/features/dashboard/api/supervisor.api.ts`
- `apps/web/src/features/dashboard/hooks/useSupervisor.ts`
- `apps/web/src/features/dashboard/pages/__tests__/SupervisorTeamPage.test.tsx`
- `apps/web/src/features/dashboard/pages/__tests__/SupervisorHome.test.tsx` (if refresh/query behavior changes)

### Project Structure Notes

- Keep role-isolated routing under `/dashboard/supervisor/*`.
- Keep query keys and API client pattern aligned with existing dashboard code.
- Avoid adding cross-role route access patterns; maintain strict role isolation from Epic 2.5.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-4.1]
- [Source: _bmad-output/planning-artifacts/prd.md#Story-4.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#FR12-FR13]
- [Source: _bmad-output/project-context.md#Critical-Implementation-Rules]
- [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-02-14.md#Prep-Phase-Epic-4-Readiness]
- [Source: apps/api/src/controllers/supervisor.controller.ts]
- [Source: apps/web/src/features/dashboard/pages/SupervisorHome.tsx]
- [Source: apps/web/src/features/dashboard/pages/SupervisorTeamPage.tsx]
- [Web Source: https://leafletjs.com/download]
- [Web Source: https://github.com/PaulLeCam/react-leaflet/releases]
- [Web Source: https://github.com/socketio/socket.io/releases]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Story drafted from epics + PRD + architecture + project-context + retrospective + current codebase inspection.
- Story generated in yolo mode per Scrum Master agent activation rule for `*create-story`.

### Implementation Plan

- **Backend:** Added `getTeamMetrics` (per-enumerator daily/weekly counts via `inArray` filter on `submitterId`) and `getTeamGps` (PostgreSQL `DISTINCT ON` for latest GPS per enumerator) to supervisor controller. Both use `TeamAssignmentService.getEnumeratorIdsForSupervisor()` for assignment boundary enforcement.
- **Frontend:** Added `fetchTeamMetrics`, `fetchTeamGps` API functions + `useTeamMetrics`, `useTeamGps` TanStack Query hooks. Created `TeamGpsMap` component using `leaflet@1.9.4` + `react-leaflet@4.2.1`. Replaced placeholder `SupervisorTeamPage.tsx` with full roster table + GPS map panel.
- **Tests:** Extended supervisor controller tests (11 new: 6 getTeamMetrics + 5 getTeamGps, mocking TeamAssignmentService). Rewrote SupervisorTeamPage.test.tsx from 3 placeholder tests → 18 tests covering roster, map, loading/empty/error states, and refresh.

### Completion Notes List

- Story generated as `ready-for-dev` with assignment, metrics, map, UX, and test guardrails.
- Includes explicit dependency handling for missing supervisor-enumerator assignment schema.
- Includes version guardrail to avoid accidental React 19 migration while implementing map view.
- PM validation (2026-02-17): Declared prep-8 as explicit blocker, replaced Task 1 with service import/verification (C1). Specified `submitterId` TEXT column + `::uuid` cast pattern for queries (M1). Pinned map library to leaflet@1.9.4 + react-leaflet@4.x (M2). Noted SupervisorTeamPage.test.tsx needs full rewrite (L1). Added DISTINCT ON strategy for GPS "latest per enumerator" query (L2).
- **Implementation (2026-02-18):** All 8 tasks completed. Backend: 2 new endpoints (`GET /team-metrics`, `GET /team-gps`) with assignment boundary via prep-8 service. Frontend: Full roster table with status badges, daily/weekly counts, last sync. GPS map via Leaflet + react-leaflet. Skeleton loading states (A2 compliant). 24 backend + 18 frontend tests pass. 493 API + 1,378 web total tests — 0 regressions.
- **Map library:** `leaflet@1.9.4` + `react-leaflet@4.2.1` + `@types/leaflet` installed and pinned. CSS imported locally in `TeamGpsMap.tsx`. This library propagates to Story 4.3 (fraud GPS evidence maps).
- **Query pattern:** Used `inArray(submissions.submitterId, enumeratorIds)` for team metrics (simpler than `::uuid` cast since both sides are TEXT). Used `DISTINCT ON` raw SQL for GPS latest-per-enumerator (Drizzle doesn't have first-class DISTINCT ON support).

### File List

- `apps/api/src/controllers/supervisor.controller.ts` (modified — added getTeamMetrics, getTeamGps, imports)
- `apps/api/src/routes/supervisor.routes.ts` (modified — registered team-metrics, team-gps routes)
- `apps/api/src/controllers/__tests__/supervisor.controller.test.ts` (modified — added 11 new tests)
- `apps/web/src/features/dashboard/api/supervisor.api.ts` (modified — added types + API functions)
- `apps/web/src/features/dashboard/hooks/useSupervisor.ts` (modified — added hooks + query keys)
- `apps/web/src/features/dashboard/pages/SupervisorTeamPage.tsx` (rewritten — full roster + map)
- `apps/web/src/features/dashboard/components/TeamGpsMap.tsx` (new — Leaflet map component)
- `apps/web/src/features/dashboard/components/__tests__/TeamGpsMap.test.tsx` (new — 7 tests for map + computeCenter)
- `apps/web/src/features/dashboard/pages/__tests__/SupervisorTeamPage.test.tsx` (rewritten — 18 tests)
- `apps/web/package.json` (modified — added leaflet, react-leaflet, @types/leaflet)
- `pnpm-lock.yaml` (modified — lockfile updated)
- `_bmad-output/implementation-artifacts/4-1-supervisor-team-dashboard.md` (modified — story status + tasks)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status: in-progress → review)

## Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: Wrap `<TeamGpsMap>` in `<ErrorBoundary>` — project-context.md mandates wrapping third-party integrations [SupervisorTeamPage.tsx:199]
- [x] [AI-Review][MEDIUM] M1: Leaflet marker icons loaded from unpkg CDN — won't work offline. Bundle locally via Vite asset imports [TeamGpsMap.tsx:18-20]
- [x] [AI-Review][MEDIUM] M2: No `refetchInterval` on `useTeamMetrics`/`useTeamGps` — AC4.1.4 mentions "polling". Added 60s interval + 30s staleTime [useSupervisor.ts:32-43]
- [x] [AI-Review][MEDIUM] M3: UTC date boundary for daily/weekly counts — Nigeria is UTC+1 (WAT). Submissions 12:00-1:00 AM WAT counted as previous day. Fixed to use WAT boundary [supervisor.controller.ts:93-95]
- [x] [AI-Review][LOW] L1: API inconsistency — old `getTeamOverview`/`getPendingAlerts` used LGA scoping, new endpoints used assignment service. Migrated both old endpoints to `TeamAssignmentService`. All 4 supervisor endpoints now use same authorization boundary. Tests rewritten.
- [x] [AI-Review][LOW] L2: `formatTimeAgo` returns "Just now" for future dates (clock skew). Added guard for negative diff [SupervisorTeamPage.tsx:37]
- [x] [AI-Review][LOW] L3: No unit test for `TeamGpsMap` component. Added `TeamGpsMap.test.tsx` with 7 tests covering computeCenter + rendering [components/__tests__/TeamGpsMap.test.tsx]
- [x] [AI-Review][LOW] L4: Hardcoded Ibadan coordinates `[7.3775, 3.947]` as magic number. Extracted to `DEFAULT_MAP_CENTER` named constant [TeamGpsMap.tsx:28]
- [x] [AI-Review][LOW] L5: Documentation typo — "10 new" tests but 6+5=11. Fixed in Implementation Plan [story file]

## Change Log

- **2026-02-19:** Adversarial code review: 9 findings (1H, 3M, 5L), ALL 9 fixed. ErrorBoundary around map (H1), local marker icons for offline PWA (M1), 60s refetchInterval on hooks (M2), WAT timezone boundary for daily counts (M3), future-date guard in formatTimeAgo (L2), TeamGpsMap unit tests (L3), named constant for map center (L4), doc typo (L5). L1 resolved: migrated `getTeamOverview` + `getPendingAlerts` from LGA scoping to `TeamAssignmentService` — all 4 supervisor endpoints now use same assignment boundary. Tests rewritten. Total: 24 backend + 25 frontend supervisor tests, 0 regressions.
- **2026-02-18:** Story 4.1 implementation complete. Added supervisor team dashboard with real-time roster (per-enumerator daily/weekly counts, status badges, last sync) and GPS map view (Leaflet). Backend: 2 new endpoints using prep-8's TeamAssignmentService for assignment boundary enforcement. Frontend: Full page rewrite from placeholder to data-driven dashboard. 42 tests added/rewritten (24 backend + 18 frontend). 0 regressions across 1,871 total tests.
