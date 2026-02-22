# Story 5.2: Verification Assessor Audit Queue

Status: done

## Story

As a Verification Assessor,
I want a state-wide queue of submissions marked for final audit,
so that I can perform a secondary level of quality control.

## Acceptance Criteria

1. **Given** an Assessor login, **when** I open the Audit Queue at `/dashboard/assessor/queue`, **then** I should see all fraud detections that have been reviewed by Supervisors (resolution IS NOT NULL) **or** flagged with high/critical fraud scores (severity IN 'high','critical'), filtered to items where the assessor has not yet made a final decision (`assessorResolution IS NULL`).
2. **Given** the audit queue, **when** I select a queue item, **then** the `EvidencePanel` component (from Story 4.4) must display in a split-panel layout showing all 5 heuristic breakdowns (GPS, Speed, Straight-lining, Duplicate, Timing), the supervisor's prior resolution and notes (if any), and a GPS cluster map.
3. **Given** the evidence panel for a selected item, **when** I click "Final Approve", **then** the record's `assessorResolution` must be set to `final_approved` with my user ID as `assessorReviewedBy` and current timestamp as `assessorReviewedAt`. The supervisor's original `resolution` must be preserved unchanged.
4. **Given** the evidence panel for a selected item, **when** I click "Reject", **then** a confirmation dialog must appear (destructive action — per UX spec). On confirm, the record's `assessorResolution` must be set to `final_rejected`. I must provide mandatory rejection notes (min 10 characters).
5. **Given** the Assessor Home at `/dashboard/assessor`, **when** the page loads, **then** the "Verification Queue" card must show the real count of items pending assessor review (not hardcoded `0`), and the "Recent Activity" card must show the last 5 assessor review actions.
6. **Given** the Completed page at `/dashboard/assessor/completed`, **when** I view it, **then** I should see all fraud detections where `assessorResolution IS NOT NULL`, with columns showing the original supervisor resolution alongside my final decision, sorted by `assessorReviewedAt` descending.
7. **Given** the audit queue, **when** filters are applied, **then** I can filter by: LGA (all 33, since assessors are state-wide), severity level, supervisor resolution type, date range, and enumerator name. Filters must be applied server-side.
8. **Given** any assessor review action (Final Approve or Reject), **then** an audit log entry must be written with: `action: 'assessor.final_review'`, `actorId`, `targetResource: 'fraud_detection'`, `targetId`, `details: { assessorResolution, assessorNotes, previousSupervisorResolution }`.
9. **Given** role authorization, **then** the new assessor audit queue endpoints must be accessible to `verification_assessor` and `super_admin` roles only. All other roles receive 403.
10. **Given** data loading states, **then** skeleton screens matching the content shape must be displayed (A2 team agreement — no spinners).

## Tasks / Subtasks

- [x] Task 1: Add assessor review fields to fraud_detections schema (AC: #3, #4, #6)
  - [x] 1.1 Add columns to `apps/api/src/db/schema/fraud-detections.ts`:
    - `assessorReviewedBy` — uuid FK to users.id, nullable
    - `assessorReviewedAt` — timestamp, nullable
    - `assessorResolution` — text enum (`final_approved`, `final_rejected`), nullable
    - `assessorNotes` — text, nullable
  - [x] 1.2 Add composite index on `(assessorResolution, severity)` for queue filtering
  - [x] 1.3 Add `assessorResolutionTypes` constant to `packages/types/src/constants.ts`:
    ```ts
    export const assessorResolutionTypes = ['final_approved', 'final_rejected'] as const;
    ```
  - [x] 1.4 Add Zod validation schema `assessorReviewSchema` to `packages/types/src/validation/fraud.ts`
  - [x] 1.5 Run `pnpm db:push:force` to apply schema changes

- [x] Task 2: Create assessor audit queue backend service (AC: #1, #5, #7)
  - [x] 2.1 Create `apps/api/src/services/assessor.service.ts` with methods:
    - `getAuditQueue(filters)` — query fraud_detections WHERE (resolution IS NOT NULL OR severity IN ('high','critical')) AND assessorResolution IS NULL. Join submissions + respondents (for LGA) + users (for enumerator name). Support pagination (page/pageSize) and all filter params. Return `PaginatedResponse`.
    - `getCompletedReviews(filters)` — query fraud_detections WHERE assessorResolution IS NOT NULL. Same joins, sorted by assessorReviewedAt DESC.
    - `getQueueStats()` — counts: total pending, by severity breakdown, today's reviews
    - `getRecentActivity(limit)` — last N assessor review actions from audit_logs
  - [x] 2.2 Create `apps/api/src/services/__tests__/assessor.service.test.ts` (14 tests)

- [x] Task 3: Create assessor controller and routes (AC: #8, #9)
  - [x] 3.1 Create `apps/api/src/controllers/assessor.controller.ts` with handlers:
    - `getAuditQueue` — calls service, returns paginated list
    - `getCompletedReviews` — calls service, returns paginated list
    - `getQueueStats` — returns stats object
    - `getRecentActivity` — returns last N actions
    - `reviewDetection` — sets assessorResolution, writes audit log in transaction
  - [x] 3.2 Create `apps/api/src/routes/assessor.routes.ts`:
    - `GET /api/v1/assessor/audit-queue` — paginated queue with filters
    - `GET /api/v1/assessor/completed` — completed reviews
    - `GET /api/v1/assessor/stats` — queue counts
    - `GET /api/v1/assessor/recent-activity` — last 5 reviews
    - `PATCH /api/v1/assessor/review/:detectionId` — final approve/reject
    - Authorize: `verification_assessor`, `super_admin` only
  - [x] 3.3 Register in `apps/api/src/routes/index.ts`: `router.use('/assessor', assessorRoutes)`
  - [x] 3.4 Create `apps/api/src/controllers/__tests__/assessor.controller.test.ts` (14 tests)

- [x] Task 4: Create frontend API client and hooks (AC: #1, #5, #6)
  - [x] 4.1 Create `apps/web/src/features/dashboard/api/assessor.api.ts` — fetch functions for all 5 endpoints
  - [x] 4.2 Create `apps/web/src/features/dashboard/hooks/useAssessor.ts` — TanStack Query hooks with query key factory
  - [x] 4.3 Create `useAssessorReview` mutation hook (invalidates all assessor keys on success)

- [x] Task 5: Create AssessorReviewActions component and extend EvidencePanel (AC: #2, #3, #4)
  - [x] 5.0 Add `renderActions?: () => React.ReactNode` prop to EvidencePanel.tsx (backward-compatible)
  - [x] 5.1 Create AssessorReviewActions.tsx with Final Approve/Reject, AlertDialog with cancel focus, notes validation

- [x] Task 6: Implement AssessorQueuePage.tsx (AC: #1, #2, #7, #10)
  - [x] 6.1 Split-panel layout with FraudDetectionTable + EvidencePanel
  - [x] 6.2a Extended FraudDetectionTable with `showLgaColumn` and `showSupervisorResolutionColumn` props
  - [x] 6.2b Wired queue list with LGA + Supervisor Resolution columns
  - [x] 6.3 Filter bar: LGA dropdown, severity multi-select, supervisor resolution, date range, enumerator name
  - [x] 6.4 Stats summary strip with pending/reviewed/severity counts
  - [x] 6.5 Evidence panel with AssessorReviewActions via renderActions prop
  - [x] 6.6 Escape key handler
  - [x] 6.7 Skeleton loading states
  - [x] 6.8 Empty state with FileSearch icon

- [x] Task 7: Implement AssessorCompletedPage.tsx (AC: #6, #10)
  - [x] 7.1 Replace empty placeholder with completed reviews table:
    - Columns: Enumerator | LGA | Submitted | Score | Severity | Supervisor Resolution | Assessor Decision | Reviewed At | Notes
    - Sorted by `assessorReviewedAt` DESC
    - `FraudResolutionBadge` for supervisor column
    - New badge for assessor decision: green "Final Approved" / red "Final Rejected"
  - [x] 7.2 Click row to expand/view evidence (read-only, no action buttons)
  - [x] 7.3 Filter by assessor decision (approved/rejected), date range, severity
  - [x] 7.4 Skeleton loading + empty state

- [x] Task 8: Wire AssessorHome.tsx with live data (AC: #5, #10)
  - [x] 8.1 Replace hardcoded `0` in Verification Queue card with real `useQueueStats()` count
  - [x] 8.2 Replace empty Recent Activity card with `useRecentActivity()` data — show last 5 actions with timestamp, resolution type, and detection ID
  - [x] 8.3 Quick Filters: wire LGA + Severity dropdowns to navigate to queue page with pre-set filters + "Go to Queue" button
  - [x] 8.4 Skeleton loading states matching card shapes (combines external + hooks loading)

- [x] Task 9: Frontend tests (AC: #3, #4, #9, #10) — 78 tests across 5 files
  - [x] 9.1 Create `apps/web/src/features/dashboard/pages/__tests__/AssessorQueuePage.test.tsx` (17 tests):
    - Queue renders with data, skeleton loading, error state, empty state
    - Filter controls render (LGA, severity toggle, resolution, date, enumerator)
    - Stats strip, pagination
  - [x] 9.2 Create `apps/web/src/features/dashboard/pages/__tests__/AssessorCompletedPage.test.tsx` (13 tests):
    - Completed table renders, decision badges, table headers, filter by decision type
    - Skeleton loading, error state, empty state, pagination, row selection
  - [x] 9.3 Create `apps/web/src/features/dashboard/components/__tests__/AssessorReviewActions.test.tsx` (11 tests):
    - Final Approve triggers mutation, Reject opens dialog, notes validation (min 10 chars)
    - Cancel button in reject dialog, character count
    - Supervisor resolution badge displayed/hidden
  - [x] 9.4 Update `apps/web/src/features/dashboard/pages/__tests__/AssessorHome.test.tsx` (28 tests):
    - Live count renders from useQueueStats, high severity count, reviewed today
    - Recent activity list with data + empty + undefined states, 5-item limit
    - Skeleton states (external + hook loading), Quick Filters navigation
  - [x] 9.5 Update `AssessorSubPages.test.tsx` (9 tests): mocked hooks for new implementations

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] AssessorQueuePage does not consume URL search params — Quick Filters navigation from Home broken [AssessorQueuePage.tsx:47-53]
- [x] [AI-Review][MEDIUM] "Coming in Epic 5" badge still on AssessorHome Evidence Panel card — stale placeholder [AssessorHome.tsx:178-179]
- [x] [AI-Review][MEDIUM] Completed page missing "Notes" column per Task 7.1 spec [AssessorCompletedPage.tsx:191-199]
- [x] [AI-Review][MEDIUM] getCompletedReviews controller does not validate severity filter (inconsistent with getAuditQueue) [assessor.controller.ts:67-95]
- [x] [AI-Review][MEDIUM] Duplicate assessorResolutionTypes in constants.ts vs assessorResolutions in fraud.ts — violates single-source-of-truth [constants.ts:11, fraud.ts:45]
- [x] [AI-Review][MEDIUM] castScores duplicated locally in assessor.service.ts instead of consistent usage [assessor.service.ts:44-53]
- [x] [AI-Review][MEDIUM] LIKE pattern wildcards (% _) not escaped in enumeratorName filter [assessor.service.ts:120-121]
- [x] [AI-Review][LOW] Service reviewDetection returns error objects instead of throwing AppError — architectural inconsistency [assessor.service.ts:358-373]
- [x] [AI-Review][LOW] No lgaId validation against Lga enum in controller [assessor.controller.ts:22-55]
- [x] [AI-Review][LOW] sprint-status.yaml modification not documented in story File List

## Dev Notes

### Architecture Compliance

- **Assessor is a SECOND-TIER auditor**: Supervisors review first (setting `resolution`), then Assessors do final audit (setting `assessorResolution`). The supervisor's decision is NEVER overwritten — both decisions coexist on the same `fraud_detections` row.
- **State-wide access**: Assessors have NO LGA scope restriction. The existing fraud-detections controller already handles this — when `user.role !== 'supervisor'`, no `TeamAssignmentService` filter is applied. The new assessor endpoints follow the same pattern.
- **Audit logging**: Every assessor review action MUST write to `audit_logs` table. Use the existing pattern from Story 4.5's bulk review:
  ```ts
  await tx.insert(auditLogs).values({
    id: uuidv7(),
    actorId: user.sub,
    action: 'assessor.final_review',
    targetResource: 'fraud_detection',
    targetId: detectionId,
    details: { assessorResolution, assessorNotes, previousSupervisorResolution },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  ```

### Queue Composition Logic (SQL)

The audit queue should select fraud_detections WHERE:
```sql
(
  -- Items supervisors have already reviewed (second-pass audit)
  resolution IS NOT NULL
  OR
  -- High-severity items regardless of supervisor review
  severity IN ('high', 'critical')
)
AND
  -- Not yet assessed by this tier
  assessor_resolution IS NULL
```

### Existing Code to Reuse — DO NOT Reinvent

| Component | Location | Reuse For |
|-----------|----------|-----------|
| `EvidencePanel` | `apps/web/src/features/dashboard/components/EvidencePanel.tsx` | Evidence accordion display — REUSE AS-IS, only swap action button area |
| `FraudDetectionTable` | `apps/web/src/features/dashboard/components/FraudDetectionTable.tsx` | Queue table — may need to add LGA + Supervisor Resolution columns |
| `FraudSeverityBadge` | `apps/web/src/features/dashboard/components/FraudSeverityBadge.tsx` | Severity color badges |
| `FraudResolutionBadge` | `apps/web/src/features/dashboard/components/FraudResolutionBadge.tsx` | Supervisor resolution badges |
| `GpsClusterMap` | `apps/web/src/features/dashboard/components/GpsClusterMap.tsx` | GPS evidence map |
| `ReviewDialog` | `apps/web/src/features/dashboard/components/ReviewDialog.tsx` | Reference for reject dialog pattern (but assessor uses simpler approve/reject) |
| `leaflet-icons.ts` | `apps/web/src/features/dashboard/components/leaflet-icons.ts` | MUST import from here — never recreate (M3 lesson from Story 4.5) |
| `useFraudDetectionDetail` | `apps/web/src/features/dashboard/hooks/useFraudDetections.ts` | Detail fetch for evidence panel (reuse existing endpoint `GET /api/v1/fraud-detections/:id`) |
| `castScores()` | `apps/api/src/controllers/fraud-detections.controller.ts` | Drizzle numeric(5,2) → parseFloat — MUST use this for score columns |
| Split-panel pattern | `apps/web/src/features/dashboard/pages/SupervisorFraudPage.tsx` | Layout: `w-1/2` + `transition-all` + Escape handler |
| Staggered animation | `SupervisorFraudPage.tsx` lines 67-170 | Approve/reject card fade animation |

### Important: EvidencePanel Composition

The `EvidencePanel` component from Story 4.4 accepts an `onReview` callback prop. For the assessor queue:
- **Option A**: Pass a different `onReview` that opens the assessor-specific review actions (Final Approve / Reject) instead of the 6-option ReviewDialog
- **Option B**: Add an `actionSlot` or `renderActions` prop to EvidencePanel for custom action buttons
- **Recommended: Option B** — keeps EvidencePanel reusable across roles without modifying its internals. Add a `renderActions?: () => ReactNode` prop that defaults to the existing review button behavior.

### Database Schema Addition Detail

Add to `fraud-detections.ts` after the existing `resolutionNotes` column:
```ts
// Assessor (second-tier) review fields
assessorReviewedBy: uuid('assessor_reviewed_by').references(() => users.id),
assessorReviewedAt: timestamp('assessor_reviewed_at'),
assessorResolution: text('assessor_resolution'),  // 'final_approved' | 'final_rejected'
assessorNotes: text('assessor_notes'),
```

**Do NOT modify existing `resolution`/`reviewedBy`/`reviewedAt` fields** — those belong to the supervisor tier.

### Drizzle Schema Note

Remember: **Drizzle schema files must NOT import from `@oslsr/types`**. Inline the `assessorResolutionTypes` array locally in the schema file with a comment noting `packages/types/src/constants.ts` as the canonical source (established pattern from MEMORY.md).

### Performance Considerations

- **Queue query joins 3 tables**: fraud_detections + submissions + respondents (for LGA) + users (for enumerator name). Ensure indexes on join columns.
- **State-wide query**: No LGA restriction means potentially large result sets. Server-side pagination is mandatory (page/pageSize with default 20).
- **Composite index**: `(assessor_resolution, severity)` enables efficient queue filtering.
- **TanStack Query stale time**: Set to 30s for queue (assessors need reasonably fresh data as multiple assessors may work the same queue).

### Previous Story Learnings

- **Test WHERE clauses for scope** (Epic 4 recurring finding): Tests must verify that supervisors get 403 on assessor endpoints, and that enumerators/clerks/officials cannot access the queue.
- **Route ordering** (Story 4.5 lesson): Register static paths (`/audit-queue`, `/completed`, `/stats`, `/recent-activity`, `/review/:id`) — ensure no path conflicts.
- **castScores() helper** (Story 4.4): Always use this to convert Drizzle's numeric(5,2) string representation to JavaScript numbers before sending to frontend.
- **Staggered animation** (Story 4.5): Use `style={{ animationDelay: \`${index * 0.3}s\` }}` for visual feedback on approve/reject.
- **useOptimisticMutation limitation**: `successMessage` only accepts `string | false` — for dynamic messages use manual `sonner` toast.
- **File List accuracy** (Epic 4 retro): 6/14 stories had inaccurate file lists. Keep this story's file list precise.

### Testing Standards

- **Backend tests**: Co-locate in `__tests__/` folder. Use `vi.hoisted()` + `vi.mock()` pattern.
- **Frontend tests**: Co-locate as `.test.tsx`. Use `@testing-library/react` with `data-testid` selectors only (A3 — no CSS class selectors, enforced by ESLint).
- **Authorization tests**: Test ALL roles against each endpoint. Verify 403 for unauthorized roles (supervisor, enumerator, clerk, official, public_user).
- **Empty state tests**: Test rendering when queue is empty.
- **Keyboard tests**: Escape closes evidence panel, Tab navigates through table rows.

### Project Structure Notes

- **Backend** (new files):
  - `apps/api/src/services/assessor.service.ts`
  - `apps/api/src/controllers/assessor.controller.ts`
  - `apps/api/src/routes/assessor.routes.ts`
  - Tests in `__tests__/` subdirs
- **Frontend** (modify existing):
  - `apps/web/src/features/dashboard/pages/AssessorQueuePage.tsx` — replace placeholder
  - `apps/web/src/features/dashboard/pages/AssessorCompletedPage.tsx` — replace placeholder
  - `apps/web/src/features/dashboard/pages/AssessorHome.tsx` — wire live data
- **Frontend** (new files):
  - `apps/web/src/features/dashboard/api/assessor.api.ts`
  - `apps/web/src/features/dashboard/hooks/useAssessor.ts`
  - `apps/web/src/features/dashboard/components/AssessorReviewActions.tsx`
  - Tests co-located
- **Shared types** (modify existing):
  - `packages/types/src/constants.ts` — add `assessorResolutionTypes`
  - `packages/types/src/validation/fraud.ts` — add `assessorReviewSchema`
- **Schema** (modify existing):
  - `apps/api/src/db/schema/fraud-detections.ts` — add 4 assessor columns

### What NOT to Build (Out of Scope)

- Individual record PII deep-dive → Story 5.3
- PII-rich CSV/PDF exports → Story 5.4
- Respondent data registry table → Story 5.5
- Immutable audit log viewer → Story 6.1
- Bulk assessor review (multi-select approve/reject) → enhancement if needed later
- Assessor Evidence page (`/dashboard/assessor/evidence`) — keep as placeholder for now; evidence is accessed inline via the split-panel on the queue page

### Dependencies and Warnings

- **prep-2 (audit logging)**: Story 5.2 writes to `audit_logs` table. The table and insert pattern already exist from Story 4.5 (`apps/api/src/db/schema/audit-logs.ts`). No additional prep-2 work is strictly blocking for 5.2 — the existing audit_logs infrastructure is sufficient. Prep-2's "lightweight audit logger" becomes critical for Stories 5.3-5.5 which need PII _access_ logging (read events), not just action logging.
- **prep-6 (assessor workflow state machine)**: This story effectively implements the state machine design by adding the assessor tier. The lifecycle becomes: `submission → fraud scoring → supervisor review → assessor final audit → done`. No separate design document is needed — the story's AC defines the behavior.
- **No submission status field exists**: The `submissions` table has no `verification_status`. All verification state lives in `fraud_detections`. This story continues that pattern — assessor decisions are stored on `fraud_detections`, not on `submissions`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5 Story 5.2] (Note: PRD references this as "Story 5.5" — numbering was superseded during epic planning; epics.md is authoritative)
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-003 Fraud Detection Engine]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Assessor Evidence Display]
- [Source: apps/web/src/features/dashboard/pages/SupervisorFraudPage.tsx — split-panel pattern]
- [Source: apps/web/src/features/dashboard/components/EvidencePanel.tsx — evidence accordion]
- [Source: apps/api/src/controllers/fraud-detections.controller.ts — scope + castScores + audit pattern]
- [Source: apps/api/src/db/schema/fraud-detections.ts — existing schema]
- [Source: _bmad-output/implementation-artifacts/4-4-flagged-submission-review-evidence-panel.md — component inventory]
- [Source: _bmad-output/implementation-artifacts/4-5-bulk-verification-of-mass-events.md — bulk review + audit log pattern]
- [Source: _bmad-output/implementation-artifacts/epic-4-retro-2026-02-20.md — prep tasks + code review lessons]
- [Source: _bmad-output/project-context.md — implementation rules]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Fixed TS2308 duplicate `AssessorResolution` export (constants.ts vs fraud.ts)
- Fixed fraud-schema.test.ts FK count assertion (3→4 for new assessorReviewedBy reference)
- Fixed AssessorHome.test.tsx: getAllByText for duplicate activity labels, valid LGA enum value
- Fixed AssessorCompletedPage.test.tsx: getByRole('columnheader') to avoid duplicate "Severity" text match
- Pre-existing 4 test failures in fraud-detections-bulk.controller.test.ts (Story 4.5) — not caused by this story

### Completion Notes List

- All 9 tasks completed (schema, service, controller/routes, API client, hooks, components, 3 pages, tests)
- Backend: 28 new tests (14 service + 14 controller), all passing
- Frontend: 78 new/updated tests across 5 files (17 queue + 13 completed + 11 review actions + 28 home + 9 sub-pages), all passing
- Full test suite: 1643 web tests pass, 765/769 API tests pass (4 pre-existing failures)
- EvidencePanel extended with backward-compatible `renderActions` prop (no breaking changes)
- FraudDetectionTable extended with `showLgaColumn` and `showSupervisorResolutionColumn` props
- AssessorHome wired with live useQueueStats + useRecentActivity + Quick Filters navigation

### Code Review Fixes (2026-02-22)

- **10 issues found** (1 High, 6 Medium, 3 Low), **all fixed automatically**
- H1: AssessorQueuePage now reads URL search params via `useSearchParams()` — Quick Filters navigation works
- M1: Replaced stale "Coming in Epic 5" badge with "Available in Verification Queue"
- M2: Added Notes column to AssessorCompletedPage (Task 7.1 spec compliance)
- M3: Added severity validation in getCompletedReviews controller
- M4: Removed duplicate `assessorResolutionTypes` from constants.ts (fraud.ts is canonical)
- M5: All list methods now use `castScores()` consistently
- M6: Added `escapeLike()` helper for LIKE pattern wildcard safety
- L1: Service `reviewDetection` now throws AppError instead of returning error objects
- L2: Added lgaId validation against Lga enum
- L3: Added sprint-status.yaml to File List
- All 43 backend tests + 78 frontend tests pass after fixes

### Change Log

| Change | Reason |
|--------|--------|
| Added `renderActions` prop to EvidencePanel | Composition pattern for assessor actions without modifying internals |
| Extended FraudDetectionTable with optional column props | Reuse existing table for assessor queue with LGA/Supervisor columns |
| Replaced 3 disabled Quick Filter dropdowns with 2 functional selects + "Go to Queue" button | Story 5.2 AC#5 requires wired filters |
| Removed "Coming in Epic 5" placeholders from Queue and Completed pages | Replaced with full implementations |
| [AI-Review] AssessorQueuePage reads URL search params on mount | Quick Filters navigation from Home now works (H1) |
| [AI-Review] Updated Evidence Panel card badge to "Available in Verification Queue" | Stale "Coming in Epic 5" text removed (M1) |
| [AI-Review] Added Notes column to AssessorCompletedPage | Task 7.1 spec compliance (M2) |
| [AI-Review] Added severity validation in getCompletedReviews controller | Consistent with getAuditQueue validation (M3) |
| [AI-Review] Removed duplicate assessorResolutionTypes from constants.ts | Single source of truth: fraud.ts (M4) |
| [AI-Review] Consistent castScores usage in all assessor service methods | Was mixing castScores and manual parseFloat (M5) |
| [AI-Review] Escaped LIKE wildcards in enumeratorName filter | Prevents wildcard pattern injection (M6) |
| [AI-Review] Service throws AppError instead of returning error objects | Consistent with codebase error pattern (L1) |
| [AI-Review] Added lgaId validation against Lga enum | Consistent input validation (L2) |
| [AI-Review] Added sprint-status.yaml to File List | Documentation completeness (L3) |

### File List

**New Files:**
- `apps/api/src/services/assessor.service.ts` — Assessor audit queue service (5 methods)
- `apps/api/src/services/__tests__/assessor.service.test.ts` — 14 service tests
- `apps/api/src/controllers/assessor.controller.ts` — HTTP handlers for 5 endpoints
- `apps/api/src/controllers/__tests__/assessor.controller.test.ts` — 14 controller tests
- `apps/api/src/routes/assessor.routes.ts` — Route definitions (GET/PATCH, RBAC)
- `apps/web/src/features/dashboard/api/assessor.api.ts` — Typed API client (5 functions)
- `apps/web/src/features/dashboard/hooks/useAssessor.ts` — TanStack Query hooks + key factory
- `apps/web/src/features/dashboard/components/AssessorReviewActions.tsx` — Final Approve/Reject with AlertDialog
- `apps/web/src/features/dashboard/components/__tests__/AssessorReviewActions.test.tsx` — 11 tests
- `apps/web/src/features/dashboard/pages/__tests__/AssessorQueuePage.test.tsx` — 17 tests
- `apps/web/src/features/dashboard/pages/__tests__/AssessorCompletedPage.test.tsx` — 13 tests

**Modified Files:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Updated story status for sprint tracking
- `apps/api/src/db/schema/fraud-detections.ts` — Added 4 assessor columns + composite index
- `apps/api/src/db/schema/__tests__/fraud-schema.test.ts` — Updated FK count assertion (3→4)
- `apps/api/src/routes/index.ts` — Registered assessor routes
- `packages/types/src/constants.ts` — Added `assessorResolutionTypes` constant
- `packages/types/src/fraud.ts` — Added `assessorResolutions` const + `AssessorResolution` type
- `packages/types/src/validation/fraud.ts` — Added `assessorReviewSchema` with conditional validation
- `apps/web/src/features/dashboard/components/EvidencePanel.tsx` — Added `renderActions` prop
- `apps/web/src/features/dashboard/components/FraudDetectionTable.tsx` — Added optional LGA/Supervisor columns
- `apps/web/src/features/dashboard/pages/AssessorQueuePage.tsx` — Full queue implementation (replaced placeholder)
- `apps/web/src/features/dashboard/pages/AssessorCompletedPage.tsx` — Full completed table (replaced placeholder)
- `apps/web/src/features/dashboard/pages/AssessorHome.tsx` — Wired live data (stats, activity, navigation)
- `apps/web/src/features/dashboard/pages/__tests__/AssessorHome.test.tsx` — 28 tests (rewritten)
- `apps/web/src/features/dashboard/pages/__tests__/AssessorSubPages.test.tsx` — Updated mocks for new implementations
