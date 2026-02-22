# Story 5.3: Individual Record PII View (Authorized Roles)

Status: done

## Story

As an Authorized Auditor (Super Admin, Verification Assessor, or Government Official),
I want to view the full PII of a respondent including their submission history and fraud context,
so that I can perform deep-dive investigations into suspicious records and verify registry integrity.

## Acceptance Criteria

1. **Given** an authorized user (Super Admin, Assessor, or Official) navigating to `/dashboard/{role}/respondent/:respondentId`, **when** the page loads, **then** the full respondent detail must display: full name, NIN, phone number, date of birth, LGA, source channel, consent flags, and registration date.
2. **Given** a Supervisor navigating to `/dashboard/supervisor/respondent/:respondentId`, **when** the page loads, **then** only operational data is shown (LGA, source, submission dates, fraud scores, verification status). PII fields (name, NIN, phone, DOB) must be hidden — not masked, but absent from the API response.
3. **Given** any respondent detail page load by a PII-authorized role, **then** an audit log entry must be written with action `pii.view_record`, the actor's ID, role, the respondent ID, and the requester's IP address.
4. **Given** the respondent detail page, **when** submissions exist, **then** a "Submission History" section must list all submissions linked to this respondent with: submission date, form name, source channel, enumerator name, processing status, and fraud severity badge (if fraud detection exists).
5. **Given** a submission in the history that has an associated fraud detection, **when** I click the fraud severity badge, **then** it should navigate to the fraud detection detail/evidence panel for that detection.
6. **Given** the respondent detail page, **when** data is loading, **then** skeleton screens matching the content shape must be displayed (A2 team agreement — no spinners).
7. **Given** role authorization, **then** the `GET /api/v1/respondents/:id` endpoint must be accessible to `super_admin`, `verification_assessor`, `government_official`, and `supervisor` roles only. All other roles (enumerator, data_entry_clerk, public_user) receive 403.
8. **Given** a Supervisor accessing the endpoint, **then** the API must enforce LGA scope: only return the respondent if their `lgaId` matches one of the supervisor's assigned LGAs (via TeamAssignmentService). Return 403 if out of scope.
9. **Given** the page header, **then** a "Back" button must navigate to the previous page (browser history back), and a breadcrumb trail must show the current location (e.g., "Audit Queue > Respondent Detail").
10. **Given** Direction 08 styling for Official role, **then** the detail page must maintain the dark header, maroon accents, `bg-gray-50` field groups established in Story 5.1. Assessor and Super Admin pages use standard dashboard styling.

## Tasks / Subtasks

- [x] Task 1: Create backend respondent detail service (AC: #1, #2, #3, #4, #8)
  - [x] 1.1 Create `apps/api/src/services/respondent.service.ts` with method:
    - `getRespondentDetail(respondentId: string, userRole: string, userId: string)`:
      - Query `respondents` by ID
      - LEFT JOIN `submissions` WHERE `respondentId = :id` (ordered by `submittedAt` DESC)
      - LEFT JOIN `fraud_detections` on `submissionId` for each submission
      - LEFT JOIN `users` on `submissions.enumeratorId` for enumerator names
      - LEFT JOIN `questionnaire_forms` on `submissions.questionnaireFormId` for form titles
      - LEFT JOIN `lgas` on `respondents.lgaId` for LGA display name
      - If `userRole === 'supervisor'`: strip PII fields (firstName, lastName, nin, phoneNumber, dateOfBirth) from response, enforce LGA scope via TeamAssignmentService
      - Return enriched `RespondentDetailResponse`
  - [x] 1.2 Create `apps/api/src/services/__tests__/respondent.service.test.ts` (6+ tests):
    - Returns full PII for authorized roles
    - Strips PII for supervisor role
    - Includes submission history with fraud context
    - Returns 404 for non-existent respondent
    - Enforces supervisor LGA scope
    - Handles respondent with no submissions

- [x] Task 2: Create backend controller and routes (AC: #3, #7, #8)
  - [x] 2.1 Create `apps/api/src/controllers/respondent.controller.ts`:
    - `getRespondentDetail` handler:
      1. Validate UUID format with `UUID_REGEX.test(id)`
      2. Call service to get detail
      3. Log PII access via `AuditService.logPiiAccess()` (fire-and-forget) for PII-authorized roles
      4. Return response with `{ data: respondentDetail }`
  - [x] 2.2 Create `apps/api/src/routes/respondent.routes.ts`:
    - `GET /api/v1/respondents/:id` — respondent detail
    - Authorize: `super_admin`, `verification_assessor`, `government_official`, `supervisor`
  - [x] 2.3 Register in `apps/api/src/routes/index.ts`: `router.use('/respondents', authenticate, respondentRoutes)`
  - [x] 2.4 Create `apps/api/src/controllers/__tests__/respondent.controller.test.ts` (10+ tests):
    - 200 with full PII for super_admin, verification_assessor, government_official
    - 200 with stripped PII for supervisor (in-scope LGA)
    - 403 for supervisor (out-of-scope LGA)
    - 403 for enumerator, data_entry_clerk, public_user
    - 404 for non-existent respondent
    - 400 for invalid UUID format
    - Audit log written for PII-authorized roles
    - Submission history included in response
    - Empty submission history handled

- [x] Task 3: Create shared types (AC: #1, #2)
  - [x] 3.1 Add types to `packages/types/src/respondent.ts`:
    ```ts
    export interface SubmissionSummary {
      id: string;
      submittedAt: string;
      formName: string | null;
      source: string;  // submission source enum (webapp, mobile, webhook, backfill, manual, public, enumerator, clerk)
      enumeratorName: string | null;
      processed: boolean;
      processingError: string | null;
      // Fraud context (null if no fraud detection for this submission)
      fraudDetectionId: string | null;
      fraudSeverity: 'clean' | 'low' | 'medium' | 'high' | 'critical' | null;
      fraudTotalScore: number | null;
      fraudResolution: string | null;
    }

    export interface FraudSummary {
      highestSeverity: 'clean' | 'low' | 'medium' | 'high' | 'critical';
      flaggedSubmissionCount: number;
      latestResolution: string | null;
    }

    export interface RespondentDetailResponse {
      id: string;
      // PII fields — null for supervisor role
      nin: string | null;
      firstName: string | null;
      lastName: string | null;
      phoneNumber: string | null;
      dateOfBirth: string | null;
      // Operational fields — always present
      lgaId: string | null;
      lgaName: string | null;
      source: 'enumerator' | 'public' | 'clerk';
      consentMarketplace: boolean;
      consentEnriched: boolean;
      createdAt: string;
      updatedAt: string;
      // Enriched data
      submissions: SubmissionSummary[];
      fraudSummary: FraudSummary | null;
    }
    ```
  - [x] 3.2 Re-export from `packages/types/src/index.ts`

- [x] Task 4: Create frontend API client and hooks (AC: #1, #4)
  - [x] 4.1 Create `apps/web/src/features/dashboard/api/respondent.api.ts`:
    - `fetchRespondentDetail(id: string)` — GET `/api/v1/respondents/:id`
  - [x] 4.2 Create `apps/web/src/features/dashboard/hooks/useRespondent.ts`:
    ```ts
    export const respondentKeys = {
      all: ['respondents'] as const,
      detail: (id: string) => [...respondentKeys.all, 'detail', id] as const,
    };

    export function useRespondentDetail(id: string) {
      return useQuery({
        queryKey: respondentKeys.detail(id),
        queryFn: () => fetchRespondentDetail(id),
        enabled: !!id,
        staleTime: 60_000, // 60s — detail data changes infrequently
      });
    }
    ```

- [x] Task 5: Create RespondentDetailPage component (AC: #1, #2, #4, #5, #6, #9, #10)
  - [x] 5.1 Create `apps/web/src/features/dashboard/pages/RespondentDetailPage.tsx`:
    - Extract `respondentId` from URL params via `useParams()`
    - Fetch data via `useRespondentDetail(respondentId)`
    - **Header section**: Back button (browser history), breadcrumb, respondent name (or "Record Details" for supervisor)
    - **Personal Information card** (PII-authorized roles only):
      - Full Name, NIN (monospace font), Phone Number, Date of Birth, LGA name, Source channel badge, Registration date
      - Consent flags: Marketplace consent (green/gray badge), Enriched consent (green/gray badge)
    - **Operational Information card** (all roles):
      - LGA, Source channel, Registration date, Total submissions count
    - **Submission History section**:
      - Table columns: # | Submitted Date | Form Name | Source | Enumerator | Status | Fraud Score
      - `FraudSeverityBadge` for fraud score column — clickable, navigates to the role-specific fraud review page with the detection pre-selected (e.g., assessor: `/dashboard/assessor/queue?detection={detectionId}`, supervisor: `/dashboard/supervisor/fraud?detection={detectionId}`). Follow the `SupervisorFraudPage` split-panel selection pattern.
      - Processing status badge: "Processed" (green) / "Pending" (amber) / "Error" (red)
      - Empty state: "No submissions found for this respondent"
    - **Fraud Summary card** (if any fraud detections exist):
      - Highest severity among all submissions
      - Count of flagged submissions
      - Latest resolution status
    - Skeleton loading for all sections
    - Direction 08 styling when accessed via official route (detect from URL path)
  - [x] 5.2 Create `apps/web/src/features/dashboard/components/RespondentDetailSkeleton.tsx`:
    - Skeleton matching the content shape: header bar + 2 info cards + table skeleton

- [x] Task 6: Add frontend routes for all authorized roles (AC: #7, #10)
  - [x] 6.1 Add lazy import in `App.tsx`:
    ```ts
    const RespondentDetailPage = lazy(() => import('./features/dashboard/pages/RespondentDetailPage'));
    ```
  - [x] 6.2 Add route under **Assessor** routes:
    ```tsx
    <Route path="respondent/:respondentId" element={<Suspense fallback={<PageLoadingFallback />}><RespondentDetailPage /></Suspense>} />
    ```
  - [x] 6.3 Add route under **Official** routes (same pattern)
  - [x] 6.4 Add route under **Super Admin** routes (same pattern)
  - [x] 6.5 Add route under **Supervisor** routes (same pattern — operational view, no PII)

- [x] Task 7: Frontend tests (AC: #1, #2, #5, #6, #9)
  - [x] 7.1 Create `apps/web/src/features/dashboard/pages/__tests__/RespondentDetailPage.test.tsx`:
    - Renders full PII fields for authorized roles
    - Hides PII fields for supervisor context (mock role from auth context)
    - Shows submission history table with data
    - Shows skeleton loading state
    - Shows empty state when no submissions
    - Back button present and functional
    - Fraud severity badge is clickable
    - Direction 08 styling when path includes "/official/"
  - [x] 7.2 Create `apps/web/src/features/dashboard/components/__tests__/RespondentDetailSkeleton.test.tsx`:
    - Renders skeleton matching content shape (cards + table)

## Dev Notes

### Architecture Compliance

- **API Pattern**: Controller → service → DB layered pattern. Reference `apps/api/src/controllers/fraud-detections.controller.ts` for the detail endpoint pattern (lines 175-251).
- **Route Registration**: Add `router.use('/respondents', authenticate, respondentRoutes)` to `apps/api/src/routes/index.ts`.
- **Authorization**: Use `authorize(UserRole.SUPER_ADMIN, UserRole.VERIFICATION_ASSESSOR, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)` from `apps/api/src/middleware/rbac.ts`.
- **PII Stripping for Supervisor**: Do NOT return PII from the API when `user.role === 'supervisor'`. Strip fields server-side — never rely on frontend to hide data the user shouldn't see. Set `nin: null, firstName: null, lastName: null, phoneNumber: null, dateOfBirth: null` in the service layer.
- **LGA Scope for Supervisor**: Use `TeamAssignmentService.getEnumeratorIdsForSupervisor()` (from `apps/api/src/services/team-assignment.service.ts`) to get the supervisor's assigned LGAs. Check `respondent.lgaId` against the supervisor's scope. If out of scope, return 403.
- **Audit Logging**: Use `AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_RECORD, 'respondents', respondentId, { lgaId, source })` — fire-and-forget mode (non-blocking). Import from `apps/api/src/services/audit.service.ts`. Only log for PII-authorized roles (super_admin, verification_assessor, government_official), NOT for supervisor (they don't see PII).

### Multi-JOIN Query Pattern

Follow the `getDetection` pattern from `fraud-detections.controller.ts` (line 190-232):

```ts
const [respondent] = await db
  .select({
    // respondent fields
    id: respondents.id,
    nin: respondents.nin,
    firstName: respondents.firstName,
    // ... etc
    // LGA name via JOIN
    lgaName: lgas.name,
  })
  .from(respondents)
  .leftJoin(lgas, eq(respondents.lgaId, lgas.code))  // lgas.code matches respondents.lgaId (text)
  .where(eq(respondents.id, id))
  .limit(1);

// Separate query for submissions (with fraud enrichment)
const submissionRows = await db
  .select({
    id: submissions.id,
    submittedAt: submissions.submittedAt,
    source: submissions.source,
    processed: submissions.processed,
    processingError: submissions.processingError,
    enumeratorName: users.fullName,
    formName: questionnaireForms.title,
    // Fraud detection fields (LEFT JOIN — may be null)
    fraudDetectionId: fraudDetections.id,
    fraudSeverity: fraudDetections.severity,
    fraudTotalScore: fraudDetections.totalScore,
    fraudResolution: fraudDetections.resolution,
  })
  .from(submissions)
  .leftJoin(users, eq(submissions.enumeratorId, users.id))
  .leftJoin(questionnaireForms, sql`${submissions.questionnaireFormId}::uuid = ${questionnaireForms.id}`)
  .leftJoin(fraudDetections, eq(fraudDetections.submissionId, submissions.id))
  .where(eq(submissions.respondentId, respondentId))
  .orderBy(desc(submissions.submittedAt));
```

**Important**: The `questionnaireForms` JOIN requires casting `submissions.questionnaireFormId` (text) to UUID: `sql\`${submissions.questionnaireFormId}::uuid = ${questionnaireForms.id}\``. This is the established pattern from `fraud-detections.controller.ts` line 230.

### Numeric Score Casting

Drizzle returns `numeric(5,2)` columns as strings. Use `parseFloat()` for `fraudTotalScore`:
```ts
fraudTotalScore: detection.fraudTotalScore ? parseFloat(String(detection.fraudTotalScore)) : null,
```
Reference: `castScores()` in `apps/api/src/controllers/fraud-detections.controller.ts` lines 32-41.

### LGA Join Pattern

The `respondents.lgaId` stores LGA codes as text (e.g., "ibadan_north"). The `lgas` table has `id` (UUID) and `code` (text). Join on `lgas.code`:
```ts
.leftJoin(lgas, eq(respondents.lgaId, lgas.code))
```

### Existing Code to Reuse — DO NOT Reinvent

| Component | Location | Reuse For |
|-----------|----------|-----------|
| `FraudSeverityBadge` | `apps/web/src/features/dashboard/components/FraudSeverityBadge.tsx` | Fraud score badges in submission history |
| `FraudResolutionBadge` | `apps/web/src/features/dashboard/components/FraudResolutionBadge.tsx` | Resolution status display |
| `SkeletonCard` | `apps/web/src/features/dashboard/components/SkeletonCard.tsx` | Loading states for info cards |
| `SkeletonTable` from skeletons lib | `apps/web/src/components/skeletons/` | Submission history table loading |
| `Card`, `CardContent`, `CardHeader` | `apps/web/src/components/ui/card` | Card layout |
| `Badge` | `apps/web/src/components/ui/badge` | Status badges (source, consent, processing status) |
| `Button` | `apps/web/src/components/ui/button` | Back button |
| `AuditService` | `apps/api/src/services/audit.service.ts` | PII access logging (prep-2) |
| `PII_ACTIONS` | `apps/api/src/services/audit.service.ts` | Action constants (`VIEW_RECORD`) |
| `TeamAssignmentService` | `apps/api/src/services/team-assignment.service.ts` | Supervisor LGA scope enforcement |
| `UUID_REGEX` | `apps/api/src/controllers/fraud-detections.controller.ts` | UUID format validation |
| `ErrorBoundary` | `apps/web/src/components/ErrorBoundary.tsx` | Wrap detail page |
| Detail endpoint pattern | `apps/api/src/controllers/fraud-detections.controller.ts:175-251` | JOIN query + scope check + not-found |
| `useAuth` / auth context | `apps/web/src/features/auth/` | Get current user role for conditional PII display |
| `apiClient` | `apps/web/src/lib/api-client.ts` | Authenticated API fetch wrapper |

### Direction 08 Styling (Official Role Only)

When accessed via `/dashboard/official/respondent/:id`, apply Direction 08 tokens:
- Header: `bg-gray-800 text-white` with Oyo emblem
- Section headers: `border-l-4 border-[#9C1E23]` with uppercase label
- Card backgrounds: `bg-gray-50` or `bg-[#FAFAFA]` with `border border-gray-200 rounded-lg`
- Read-only presentation throughout

For Assessor/Super Admin routes, use standard dashboard card styling (white cards, neutral borders).

Detect role from URL path:
```ts
const location = useLocation();
const isOfficialRoute = location.pathname.includes('/official/');
```

### Database Tables Used

| Table | Key Fields for This Story |
|-------|--------------------------|
| `respondents` | `id`, `nin`, `firstName`, `lastName`, `phoneNumber`, `dateOfBirth`, `lgaId`, `source`, `consentMarketplace`, `consentEnriched`, `createdAt` |
| `submissions` | `id`, `respondentId`, `submittedAt`, `source`, `enumeratorId`, `questionnaireFormId`, `processed`, `processingError` |
| `fraud_detections` | `id`, `submissionId`, `totalScore`, `severity`, `resolution` |
| `users` | `id`, `fullName` (for enumerator names) |
| `questionnaire_forms` | `id`, `title` (for form names) |
| `lgas` | `id`, `code`, `name` (for LGA display names) |
| `audit_logs` | Written to via AuditService — not read in this story |

### Supervisor Scope Enforcement

Supervisors are assigned to specific LGAs via `team_assignments`. For Story 5.3, when a supervisor views a respondent:

**Primary approach** (team-based — aligns with existing `fraud-detections.controller.ts` pattern):
```ts
const teamEnumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(user.sub);
const hasSubmissionFromTeam = submissionRows.some(s => teamEnumeratorIds.includes(s.enumeratorId));
if (!hasSubmissionFromTeam) {
  throw new AppError('FORBIDDEN', 'Respondent not in your team scope', 403);
}
```
This checks if the respondent was submitted by any enumerator in the supervisor's team. Consistent with how `fraud-detections.controller.ts` scopes detections to the supervisor's team.

### Performance Considerations

- **Single respondent query**: Bounded to 1 row — fast with primary key lookup.
- **Submissions query**: Could have multiple submissions per respondent. Use `.orderBy(desc(submissions.submittedAt))` and consider `.limit(50)` for respondents with many submissions (unlikely in practice but safe).
- **Fraud detection LEFT JOIN**: At most 1 fraud detection per submission. No performance concern.
- **Stale time**: Set TanStack Query `staleTime: 60_000` (60s) since detail data changes infrequently.
- **No caching needed**: Individual record views are low-frequency. No Redis cache required.

### Previous Story Learnings

- **UUID validation before DB query** (Story 4.4): Always validate UUID format with regex before passing to Drizzle query. Invalid UUIDs cause PostgreSQL errors.
- **castScores() for numeric columns** (Story 4.4): Drizzle returns `numeric(5,2)` as strings. Always `parseFloat()` fraud scores before returning to frontend.
- **Test WHERE clauses for scope** (Epic 4 recurring): Authorization tests must verify that unauthorized roles get 403, and that supervisor scope is properly enforced.
- **A2: Skeleton must match content shape**: Create dedicated `RespondentDetailSkeleton` with card + table skeleton layout.
- **A3: Test selectors only via data-testid or ARIA**: No CSS class selectors in tests. Enforced by ESLint.
- **File List accuracy** (Epic 4 retro): Keep file list precise — see Project Structure Notes below.

### Testing Standards

- **Backend tests**: In `__tests__/` folders. Use `vi.hoisted()` + `vi.mock()` pattern for mocking DB/services.
- **Frontend tests**: Co-located as `.test.tsx`. Use `@testing-library/react` with `data-testid` selectors only.
- **Authorization tests**: Test ALL 7 roles against the endpoint. Super Admin, Assessor, Official → 200 with PII. Supervisor → 200 without PII. Enumerator, Clerk, Public → 403.
- **Scope tests**: Supervisor accessing in-scope respondent → 200. Supervisor accessing out-of-scope → 403.
- **Audit log tests**: Verify `AuditService.logPiiAccess` called for PII roles, NOT called for supervisor.
- **Empty state tests**: Respondent with no submissions renders correctly.

### Project Structure Notes

- **Backend** (new files):
  - `apps/api/src/services/respondent.service.ts`
  - `apps/api/src/services/__tests__/respondent.service.test.ts`
  - `apps/api/src/controllers/respondent.controller.ts`
  - `apps/api/src/controllers/__tests__/respondent.controller.test.ts`
  - `apps/api/src/routes/respondent.routes.ts`
- **Backend** (modify):
  - `apps/api/src/routes/index.ts` — add respondent routes
- **Frontend** (new files):
  - `apps/web/src/features/dashboard/api/respondent.api.ts`
  - `apps/web/src/features/dashboard/hooks/useRespondent.ts`
  - `apps/web/src/features/dashboard/pages/RespondentDetailPage.tsx`
  - `apps/web/src/features/dashboard/components/RespondentDetailSkeleton.tsx`
  - `apps/web/src/features/dashboard/pages/__tests__/RespondentDetailPage.test.tsx`
  - `apps/web/src/features/dashboard/components/__tests__/RespondentDetailSkeleton.test.tsx`
- **Frontend** (modify):
  - `apps/web/src/App.tsx` — add respondent detail route under 4 role sections
- **Shared types** (new or modify):
  - `packages/types/src/respondent.ts` — `RespondentDetailResponse` type
  - `packages/types/src/index.ts` — re-export

### What NOT to Build (Out of Scope)

- Respondent data registry table → Story 5.5
- PII-rich CSV/PDF exports → Story 5.4
- Edit/modify respondent data → not in any story (all views are read-only)
- Immutable audit log viewer page → Story 6.1
- Respondent search or list API → Story 5.5
- Assessor review actions from this page → Story 5.2 (already has its own review flow)
- Form response rendering (showing full JSONB form answers) → consider for future enhancement; this story shows metadata only

### Dependencies and Warnings

- **prep-2 (audit logging)**: AuditService and PII_ACTIONS are already implemented. No additional prep needed. Import directly.
- **Story 5.2 (assessor queue)**: The assessor queue may link to this detail page. Ensure the route path is consistent: `/dashboard/assessor/respondent/:respondentId`. Story 5.2 uses `submissionId`-based navigation to evidence panel, not respondent-based, so no conflict.
- **Story 5.5 (registry table)**: Will navigate to this page via row click (AC5.5.7). The route and component must be ready before 5.5. No circular dependency — 5.3 is standalone.
- **Story 5.1 (policy dashboard)**: Shares Direction 08 styling. Reuse established tokens.
- **No submission status field**: Verification state lives on `fraud_detections`, not `submissions`. Display fraud detection resolution as the "verification status" proxy.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5 Story 5.3]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5 AC5.5.1 Access Control Matrix]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5 AC5.5.7 Row Navigation]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-016 Layout Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#NFR4 NDPA PII Access Controls]
- [Source: _bmad-output/planning-artifacts/architecture.md#NFR8 Immutable Audit Trail]
- [Source: apps/api/src/controllers/fraud-detections.controller.ts:175-251 — detail endpoint pattern]
- [Source: apps/api/src/services/audit.service.ts — PII audit logging]
- [Source: apps/api/src/services/team-assignment.service.ts — supervisor scope enforcement]
- [Source: apps/api/src/db/schema/respondents.ts — respondent PII fields]
- [Source: apps/api/src/db/schema/submissions.ts — submission data structure]
- [Source: apps/api/src/db/schema/fraud-detections.ts — fraud context]
- [Source: _bmad-output/project-context.md — implementation rules]
- [Source: _bmad-output/implementation-artifacts/5-1-high-level-policy-dashboard.md — Direction 08 styling reference]
- [Source: _bmad-output/implementation-artifacts/5-2-verification-assessor-audit-queue.md — assessor patterns]

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: Fix fraud badge navigation for Super Admin and Official — routes don't exist, badge now non-clickable for those roles [RespondentDetailPage.tsx:112-123]
- [x] [AI-Review][HIGH] H2: Rename misleading "returns 403 for enumerator" test, add missing data_entry_clerk and public_user role tests [respondent.controller.test.ts:170-188]
- [x] [AI-Review][MEDIUM] M3: Fix PII card render condition — remove `detail.firstName` data dependency, use role-only check [RespondentDetailPage.tsx:197]
- [x] [AI-Review][MEDIUM] M4: Eliminate duplicate submissions query for supervisor scope check — combined into single query [respondent.service.ts:73-108]
- [x] [AI-Review][MEDIUM] M5: Add proper fraud badge click navigation test for AC5 with route verification [RespondentDetailPage.test.tsx:217-224]
- [x] [AI-Review][MEDIUM] M6: Add government_official audit log test — was missing for this PII-authorized role [respondent.controller.test.ts]
- [x] [AI-Review][LOW] L7: Make breadcrumb context-aware based on route (Audit Queue / Team / Registry / Dashboard) [RespondentDetailPage.tsx:165,183]
- [x] [AI-Review][LOW] L8: Type SubmissionSummary.source as IngestionSource union instead of bare string [respondent.ts:13]
- [x] [AI-Review][LOW] L9: Document zero-submissions supervisor scope edge case with inline comment [respondent.service.ts:78-84]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

N/A

### Completion Notes List

- Task 3 (shared types) implemented first since both backend and frontend depend on it
- 9 service tests, 17 controller tests, 16 page tests, 3 skeleton tests = 45 total story-specific tests, all passing (post-review)
- Supervisor scope enforcement uses team-based approach (checking if respondent has submissions from supervisor's team members) consistent with fraud-detections.controller.ts pattern
- PII stripping is server-side in the service layer — supervisor never receives PII fields from the API
- Audit logging fires only for PII-authorized roles (super_admin, verification_assessor, government_official), not for supervisor
- Direction 08 styling detected via URL path (`location.pathname.includes('/official/')`) rather than auth role
- Fraud badge navigation uses role-specific paths (assessor→queue, supervisor→fraud); super-admin and official render non-clickable badges (no fraud detail route exists)
- Full regression suite shows 29 pre-existing failing test files (144 failures) — none from story 5.3 changes

### Change Log

- 2026-02-22: All 7 tasks implemented. 40 tests passing. Status → review.
- 2026-02-22: Code review completed. 9 findings (2H, 4M, 3L) — all fixed. 45 tests passing. Status → done.

### File List

**New files:**
- `packages/types/src/respondent.ts` — Shared types (RespondentDetailResponse, SubmissionSummary, FraudSummary)
- `apps/api/src/services/respondent.service.ts` — Backend service with multi-JOIN queries, PII stripping, supervisor scope check
- `apps/api/src/services/__tests__/respondent.service.test.ts` — 9 service tests
- `apps/api/src/controllers/respondent.controller.ts` — Controller with UUID validation, audit logging
- `apps/api/src/controllers/__tests__/respondent.controller.test.ts` — 17 controller tests (post-review)
- `apps/api/src/routes/respondent.routes.ts` — Route with authenticate + authorize middleware
- `apps/web/src/features/dashboard/api/respondent.api.ts` — Frontend API client
- `apps/web/src/features/dashboard/hooks/useRespondent.ts` — TanStack Query hook with key factory
- `apps/web/src/features/dashboard/pages/RespondentDetailPage.tsx` — Main page with PII card, operational card, fraud summary, submission history
- `apps/web/src/features/dashboard/components/RespondentDetailSkeleton.tsx` — A2-compliant content-shaped skeleton
- `apps/web/src/features/dashboard/pages/__tests__/RespondentDetailPage.test.tsx` — 16 page tests (post-review)
- `apps/web/src/features/dashboard/components/__tests__/RespondentDetailSkeleton.test.tsx` — 3 skeleton tests

**Modified files:**
- `packages/types/src/index.ts` — Added `export * from './respondent.js';`
- `apps/api/src/routes/index.ts` — Added `router.use('/respondents', respondentRoutes);`
- `apps/web/src/App.tsx` — Added lazy import + 4 route entries (super-admin, supervisor, assessor, official)
