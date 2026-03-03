---
title: 'Submission Response Detail View & Role-Based Export Rate Limiting'
slug: 'submission-response-detail-view-role-rate-limit'
created: '2026-03-02'
status: 'review'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'Express', 'React', 'Radix UI Sheet', 'TanStack Query', 'Drizzle ORM (raw SQL)', 'Redis', 'express-rate-limit', 'ioredis', 'Zod', 'Tailwind CSS']
files_to_modify:
  - 'apps/api/src/middleware/export-rate-limit.ts'
  - 'apps/api/src/services/audit.service.ts'
  - 'apps/api/src/routes/respondent.routes.ts'
  - 'apps/api/src/controllers/respondent.controller.ts'
  - 'apps/api/src/services/respondent.service.ts'
  - 'apps/web/src/features/dashboard/pages/RespondentDetailPage.tsx'
  - 'apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx'
  - 'apps/web/src/features/dashboard/components/SubmissionResponseSheet.tsx'
  - 'apps/web/src/features/dashboard/api/respondent.api.ts'
  - 'apps/web/src/features/dashboard/hooks/useRespondent.ts'
  - 'packages/types/src/respondent.ts'
code_patterns:
  - 'ExportQueryService — flattenRawDataRow, buildColumnsFromFormSchema, buildChoiceMaps for label mapping'
  - 'QuestionnaireService.getFormSchemaById(id) — lightweight formSchema JSONB fetch'
  - 'RespondentService.getRespondentDetail — supervisor scope via TeamAssignmentService.getEnumeratorIdsForSupervisor'
  - 'Radix Sheet component — side prop (right/bottom), SheetContent/Header/Footer/Title'
  - 'respondentKeys query key factory — all, lists(), list(params), detail(id)'
  - 'AuditService.logPiiAccess — fire-and-forget with SHA-256 hash chain'
  - 'exportRateLimit — rateLimit() with Redis store, keyGenerator uses req.user.sub'
  - 'InfoRow helper in RespondentDetailPage — label/value pair rendering'
test_patterns:
  - 'vi.hoisted() + vi.mock() pattern for service mocking'
  - 'makeMocks helper for Express req/res/next in controller tests'
  - 'beforeEach with vi.resetAllMocks()'
  - '@testing-library/react with MemoryRouter wrapper for page tests'
  - 'mockExecute for db.execute in query service tests'
---

# Tech-Spec: Submission Response Detail View & Role-Based Export Rate Limiting

**Created:** 2026-03-02

## Overview

### Problem Statement

The respondent detail page (Story 5.3) shows submission history with metadata (date, source, enumerator, fraud score) but the actual questionnaire answers — employment status, skills, household demographics — are invisible. Users must export an entire CSV just to see one respondent's form responses. This is friction-heavy, especially on mobile where opening CSVs is impractical. Additionally, the export rate limit is a flat 5/hour for all roles regardless of their operational needs, creating unnecessary friction for Super Admins doing bulk administrative work.

### Solution

Two changes: (1) Add a mobile-friendly slide-over Sheet that displays a submission's full flattened form responses when a user clicks a submission or an "eye" icon on the registry table. Reuses the `flattenRawDataRow` + `buildColumnsFromFormSchema` + `buildChoiceMaps` infrastructure from the Full Response CSV Export spec. (2) Replace the flat rate limit with role-tiered limits: Super Admin 20/hr, Government Official 10/hr, Verification Assessor 5/hr.

### Scope

**In Scope:**
- New API endpoint `GET /api/v1/respondents/:respondentId/submissions/:submissionId/responses` returning flattened form responses with human-readable labels
- Sheet/drawer component on RespondentDetailPage: click a submission row → Sheet opens with full form responses grouped by form sections
- Quick-view eye icon on RespondentRegistryPage rows: opens the Sheet directly for the respondent's latest submission (no page navigation)
- Mobile-first layout: full-screen sheet on mobile, 55% right-side sheet on desktop
- Submission navigator (prev/next) when a respondent has multiple submissions
- PII audit logging per submission view (`pii.view_submission_response`)
- Role-based export rate limiting (Super Admin: 20/hr, Official: 10/hr, Assessor: 5/hr)

**Out of Scope:**
- Editing rawData through the detail view
- Offline caching of submission responses (future PWA enhancement)
- Cross-submission field diff/highlighting (future enhancement)
- Print-optimized layout
- Changing the existing RespondentDetailPage navigation pattern (row click → detail page stays unchanged)

## Context for Development

### Codebase Patterns

- **Export flattening infrastructure**: `export-query.service.ts` exports `flattenRawDataRow(rawData, schema, choiceMaps?)`, `buildColumnsFromFormSchema(schema)`, and `buildChoiceMaps(schema)`. These handle select_one→label mapping, select_multiple→semicolon-delimited labels, missing fields→empty string, unknown codes→raw fallback. The detail view reuses these server-side to flatten rawData before sending to the client.
- **Form schema access**: `QuestionnaireService.getFormSchemaById(id)` returns `NativeFormSchema | null` from the `questionnaire_forms.form_schema` JSONB column. Lightweight — only fetches the schema column.
- **Supervisor scope**: `respondent.service.ts` enforces scope via `TeamAssignmentService.getEnumeratorIdsForSupervisor(userId)`. Checks if any submission was made by a team member. Throws 403 if out of scope. The new endpoint must replicate this check.
- **PII audit**: `AuditService.logPiiAccess(req, action, resource, targetId, metadata)` — fire-and-forget. `PII_ACTIONS` constants in `audit.service.ts`. No `VIEW_SUBMISSION_RESPONSE` action exists yet — must be added.
- **Sheet component**: `components/ui/sheet.tsx` wraps Radix Dialog. `SheetContent` accepts `side` prop (`right`/`bottom`/`left`/`top`). Default width is `w-3/4 sm:max-w-sm` — must be overridden via `className` for wider content. Exports: `Sheet`, `SheetTrigger`, `SheetClose`, `SheetContent`, `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`.
- **Rate limiting**: `export-rate-limit.ts` uses `express-rate-limit` with `RedisStore` (ioredis). `keyGenerator` uses `req.user.sub`. `max: 5` is flat. `handler` returns structured JSON error with code `EXPORT_RATE_LIMIT`.
- **Registry table**: `RespondentRegistryTable.tsx` uses TanStack Table v8 server-side mode. Full row is clickable → navigates to `${roleBasePath}/respondent/${respondentId}`. No action column exists. Column visibility is role-based (PII hidden for supervisor).
- **Detail page**: `RespondentDetailPage.tsx` renders a submission history `<table>` with rows for each `SubmissionSummary`. Fraud badge is clickable for assessor/supervisor roles. No view-responses action exists.
- **`SubmissionSummary` type** (`packages/types/src/respondent.ts`): Contains id, submittedAt, source, processed, processingError, enumeratorName, formName, fraudDetectionId, fraudSeverity, fraudTotalScore, fraudResolution. Does NOT contain `enumeratorId`, rawData, or formSchema. Note: `enumeratorId` is on `RespondentListItem`, not here.
- **Submissions table**: `submissions.raw_data` is JSONB, `submissions.questionnaire_form_id` is text (stores UUID). `submissions.respondent_id` is UUID FK to respondents. `submissions.enumerator_id` is text (stores user UUID).
- **Users table**: Has `full_name` (single column), NOT separate first_name/last_name.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/api/src/middleware/export-rate-limit.ts` | Current flat rate limiter (5/hr all roles) |
| `apps/api/src/services/audit.service.ts` | PII_ACTIONS constants + logPiiAccess method |
| `apps/api/src/routes/respondent.routes.ts` | Current respondent routes (list + detail) |
| `apps/api/src/controllers/respondent.controller.ts` | Respondent controller (list + detail handlers) |
| `apps/api/src/services/respondent.service.ts` | Detail fetching, supervisor scope, PII stripping |
| `apps/api/src/services/export-query.service.ts` | flattenRawDataRow, buildColumnsFromFormSchema, buildChoiceMaps |
| `apps/api/src/services/questionnaire.service.ts` | getFormSchemaById (formSchema JSONB fetch) |
| `apps/web/src/features/dashboard/pages/RespondentDetailPage.tsx` | Submission history table, InfoRow helper |
| `apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx` | TanStack Table columns, row click handler |
| `apps/web/src/features/dashboard/api/respondent.api.ts` | fetchRespondentDetail API client |
| `apps/web/src/features/dashboard/hooks/useRespondent.ts` | respondentKeys factory, useRespondentDetail hook |
| `apps/web/src/components/ui/sheet.tsx` | Radix Sheet (side prop, SheetContent/Header/Footer) |
| `packages/types/src/respondent.ts` | RespondentDetailResponse, SubmissionSummary types |
| `packages/types/src/native-form.ts` | NativeFormSchema, Question, Section, Choice types |
| `apps/api/src/db/schema/submissions.ts` | submissions table (rawData JSONB, questionnaireFormId) |

### Technical Decisions

1. **Sheet not modal/accordion** — Sheet (Radix `Sheet` from `components/ui/sheet.tsx`) gives native mobile feel: full-viewport on mobile, side panel on desktop. Accordions are touch-unfriendly for dense form data on mobile.
2. **Reuse export flattening infra** — `flattenRawDataRow`, `buildColumnsFromFormSchema`, `buildChoiceMaps` already handle label mapping, select_one/select_multiple resolution, missing field handling. The detail view reuses these server-side so the client receives pre-mapped display values.
3. **Per-submission endpoint, not bulk** — `GET /respondents/:respondentId/submissions/:submissionId/responses` returns one submission's flattened data. Keeps payloads small (~2-5KB per submission vs 50KB+ for all rawData). Audit is granular per-submission.
4. **Server-side flattening** — rawData is flattened on the server (not sent raw to the client) because: (a) reuses existing tested functions, (b) avoids sending formSchema to client, (c) label mapping stays consistent with CSV export.
5. **Role-tiered rate limiting** — Uses existing Redis-backed `express-rate-limit`. Replaces flat `max: 5` with a role-aware `max` function. Role extracted from `req.user.role` in the key generator callback.
6. **Supervisor sees operational data only** — Submission responses ARE visible to supervisors (they verify data quality) but PII fields in the response header (NIN, phone, DOB) follow existing PII stripping from Story 5.3.
7. **Responsive Sheet sizing** — Override default `sm:max-w-sm` with `w-full sm:w-[55vw] sm:max-w-3xl` for desktop. On mobile (`< sm`), Sheet takes full viewport width. Use `side="right"` always — on mobile it effectively covers the full screen.
8. **Navigator uses sibling submission IDs** — The response endpoint returns `siblingSubmissionIds: string[]` (all submission IDs for this respondent, ordered by date). The frontend uses this for prev/next navigation without an extra API call.

## Implementation Plan

### Tasks

- [x] **Task 1: Add `VIEW_SUBMISSION_RESPONSE` audit action**
  - File: `apps/api/src/services/audit.service.ts`
  - Action: Add `PII_VIEW_SUBMISSION_RESPONSE: 'pii.view_submission_response'` to `AUDIT_ACTIONS` object. Add `VIEW_SUBMISSION_RESPONSE: AUDIT_ACTIONS.PII_VIEW_SUBMISSION_RESPONSE` to `PII_ACTIONS` object.
  - Notes: Follow existing pattern — add adjacent to `PII_VIEW_RECORD`.

- [x] **Task 2: Add `SubmissionResponseDetail` type**
  - File: `packages/types/src/respondent.ts`
  - Action: Add interface:
    ```typescript
    export interface SubmissionResponseDetail {
      submissionId: string;
      respondentId: string;
      submittedAt: string;
      source: string;
      enumeratorName: string | null;
      completionTimeSeconds: number | null;
      gpsLatitude: number | null;
      gpsLongitude: number | null;
      fraudSeverity: string | null;
      fraudScore: number | null;
      verificationStatus: string | null;
      formTitle: string;
      formVersion: string;
      sections: Array<{
        title: string;
        fields: Array<{ label: string; value: string }>;
      }>;
      siblingSubmissionIds: string[];
    }
    ```
  - Notes: `sections` groups form responses by NativeFormSchema section. Each `field` has the human-readable `label` (question label) and `value` (mapped via flattenRawDataRow). This avoids sending flat key-value pairs and instead gives the frontend a render-ready structure.

- [x] **Task 3: Add `getSubmissionResponses` method to RespondentService**
  - File: `apps/api/src/services/respondent.service.ts`
  - Action: Add a new static method `getSubmissionResponses(respondentId: string, submissionId: string, userRole: string, userId: string): Promise<SubmissionResponseDetail>` that:
    1. Fetches the submission row by ID, verifying `respondent_id` matches `respondentId` (prevents IDOR).
    2. If `userRole === 'supervisor'`, enforces scope via `TeamAssignmentService.getEnumeratorIdsForSupervisor(userId)` — checks `submission.enumerator_id` is in the list.
    3. Fetches form schema via `QuestionnaireService.getFormSchemaById(submission.questionnaire_form_id)`. If null, returns sections as empty array (legacy form).
    4. Calls `buildChoiceMaps(schema)` then iterates `schema.sections`, for each section builds `{ title, fields }` where fields are built by iterating `section.questions` (skip note/geopoint), looking up `rawData[question.name]`, and mapping via the choice maps (same logic as `flattenRawDataRow` but structured by section).
    5. Fetches sibling submission IDs: `SELECT id FROM submissions WHERE respondent_id = $respondentId ORDER BY submitted_at DESC`.
    6. Fetches submission metadata: enumerator name via `users.full_name` (LEFT JOIN on `enumerator_id = users.id::text`), fraud detection data via LEFT JOIN on `fraud_detections`.
    7. Returns `SubmissionResponseDetail`.
  - Notes: Import `buildChoiceMaps` from `export-query.service.ts`. Import `QuestionnaireService` from `questionnaire.service.ts`. This method does NOT return rawData directly — it returns pre-structured sections with mapped labels.

- [x] **Task 4: Add controller method + route for submission responses**
  - File: `apps/api/src/controllers/respondent.controller.ts`
  - Action: Add `getSubmissionResponses` static method:
    1. Validate `respondentId` and `submissionId` as UUIDs (same regex pattern as existing `getRespondentDetail`).
    2. Call `RespondentService.getSubmissionResponses(respondentId, submissionId, user.role, user.sub)`.
    3. Log `AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_SUBMISSION_RESPONSE, 'submissions', submissionId, { respondentId })`.
    4. Return `res.json({ data: result })`.
  - File: `apps/api/src/routes/respondent.routes.ts`
  - Action: Add route: `router.get('/:respondentId/submissions/:submissionId/responses', authorize(...AUTHORIZED_ROLES), RespondentController.getSubmissionResponses)`. Route ordering relative to `/:id` does not matter — `/:id` matches single-segment paths only, while this 4-segment path (`/:respondentId/submissions/:submissionId/responses`) can never collide with it. Place it after `/:id` for readability.
  - Notes: Same 4-role authorization as existing routes. Audit logging for ALL roles (not just PII-authorized).

- [x] **Task 5: Replace flat rate limit with role-tiered rate limit**
  - File: `apps/api/src/middleware/export-rate-limit.ts`
  - Action: Replace flat `max: 5` with a `max` function that reads `req.user.role`:
    ```typescript
    const ROLE_RATE_LIMITS: Record<string, number> = {
      super_admin: 20,
      government_official: 10,
      verification_assessor: 5,
    };

    max: (req) => {
      const role = (req as AuthenticatedRequest).user?.role ?? '';
      return ROLE_RATE_LIMITS[role] ?? 5;
    },
    ```
    Remove the static `message` object. Update the `handler` callback to compute the response body dynamically — the `message` option does not support per-request functions for JSON objects. Concrete pattern:
    ```typescript
    handler: (req, res) => {
      const role = (req as AuthenticatedRequest).user?.role ?? '';
      const limit = ROLE_RATE_LIMITS[role] ?? 5;
      res.status(429).json({
        status: 'error',
        code: 'EXPORT_RATE_LIMIT',
        message: `Maximum ${limit} exports per hour for your role. Please try again later.`,
      });
    },
    ```
  - Notes: The `keyGenerator` already uses `req.user.sub` so each user gets their own bucket. The `max` function makes the bucket size role-dependent. Fallback to 5 for any unknown role. The existing rate limit test (`export-rate-limit.test.ts` line 106-110) asserts the exact message string `"Maximum 5 exports per hour"` — update that assertion to expect the dynamic message.

- [x] **Task 6: Add `fetchSubmissionResponses` API client function**
  - File: `apps/web/src/features/dashboard/api/respondent.api.ts`
  - Action: Add function:
    ```typescript
    export async function fetchSubmissionResponses(
      respondentId: string,
      submissionId: string,
    ): Promise<SubmissionResponseDetail> {
      const response = await apiClient(
        `/respondents/${respondentId}/submissions/${submissionId}/responses`
      );
      return response.data;
    }
    ```
  - Notes: Import `SubmissionResponseDetail` from `@oslsr/types`. Uses existing `apiClient` (handles auth headers, JSON parsing, error handling).

- [x] **Task 7: Add `useSubmissionResponses` hook**
  - File: `apps/web/src/features/dashboard/hooks/useRespondent.ts`
  - Action: Add to `respondentKeys`:
    ```typescript
    submissionResponses: (respondentId: string, submissionId: string) =>
      [...respondentKeys.all, 'submissionResponses', respondentId, submissionId] as const,
    ```
    Add hook:
    ```typescript
    export function useSubmissionResponses(respondentId: string, submissionId: string) {
      return useQuery({
        queryKey: respondentKeys.submissionResponses(respondentId, submissionId),
        queryFn: () => fetchSubmissionResponses(respondentId, submissionId),
        enabled: !!respondentId && !!submissionId,
        staleTime: 60_000,
      });
    }
    ```
  - Notes: Import `fetchSubmissionResponses` from the API file. `enabled` guard prevents calls with empty IDs. 60s stale time matches existing detail hook.

- [x] **Task 8: Create `SubmissionResponseSheet` component**
  - File: `apps/web/src/features/dashboard/components/SubmissionResponseSheet.tsx` (NEW)
  - Action: Create a component that renders the Sheet with submission response data:
    - Props: `open: boolean`, `onOpenChange: (open: boolean) => void`, `respondentId: string`, `submissionId: string`, `respondentName?: string`
    - Calls `useSubmissionResponses(respondentId, submissionId)` to fetch data.
    - **Layout (inside SheetContent)**:
      - `SheetHeader`: "Submission Detail" title + respondent name subtitle.
      - Scrollable body (`overflow-y-auto flex-1`):
        - **Submission metadata card**: Date, Source, Enumerator, Completion Time, GPS, Fraud Severity/Score/Status — using `InfoRow`-style key-value pairs in a Card.
        - **Form response sections**: For each `section` in `data.sections`, render a Card with `CardHeader` showing section title and `CardContent` with `InfoRow`-style pairs for each `field` (label → value). Empty values show "—".
      - `SheetFooter`: Submission navigator — "Prev" / "X of Y" / "Next" buttons using `siblingSubmissionIds`.
    - **Responsive sizing**: `SheetContent` className: `"w-full sm:w-[55vw] sm:max-w-3xl"`. Use `side="right"`.
    - **Loading state**: Skeleton screen matching content shape while `useSubmissionResponses` is loading.
    - **Navigator behavior**: When prev/next is clicked, update the `submissionId` (controlled by parent via state). Parent lifts state for the current submissionId. The hook refetches for the new ID. Pre-fetch adjacent IDs via TanStack Query's `prefetchQuery` in an effect.
  - Notes: Import Sheet primitives from `components/ui/sheet`. Import Card from `components/ui/card`. Import InfoRow pattern from RespondentDetailPage (or inline equivalent). Direction 08 styling: maroon left-border on section cards for official routes.

- [x] **Task 9: Integrate Sheet into RespondentDetailPage**
  - File: `apps/web/src/features/dashboard/pages/RespondentDetailPage.tsx`
  - Action:
    1. Add state: `const [viewingSubmissionId, setViewingSubmissionId] = useState<string | null>(null)`.
    2. Make submission table rows clickable: add `onClick={() => setViewingSubmissionId(submission.id)}` and `className="cursor-pointer"` to each `<tr>`. Add a visible "View" button or eye icon (`Eye` from lucide-react) in a new last column.
    3. Render `<SubmissionResponseSheet>` at the bottom of the component, passing `open={!!viewingSubmissionId}`, `onOpenChange={(open) => !open && setViewingSubmissionId(null)}`, `respondentId`, `submissionId={viewingSubmissionId ?? ''}`, `respondentName={displayName}`.
    4. When the Sheet's navigator changes submission, it calls back to update `viewingSubmissionId`.
  - Notes: The eye icon column should be the rightmost column. On mobile, the table scrolls horizontally — the icon stays visible as the last column.

- [x] **Task 10: Add quick-view eye icon to RespondentRegistryTable**
  - File: `apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx`
  - Action:
    1. Add state for sheet: `const [sheetState, setSheetState] = useState<{ respondentId: string; submissionId: string; name: string } | null>(null)`.
    2. Add an "Actions" column as the last column in `buildColumns()`. The cell renders an `Eye` icon button from lucide-react. `onClick` (with `e.stopPropagation()` to prevent row navigation) fetches the respondent's latest submission ID. Since `SubmissionSummary` is NOT in the registry list response (only the detail response has it), the eye icon should navigate to the detail page with a query param: `navigate(\`${roleBasePath}/respondent/${row.original.id}?viewSubmission=latest\`)`. The detail page reads the query param and auto-opens the sheet for the latest submission.
    3. Alternatively (simpler): The registry list response already includes a `latestSubmissionId` field (check if it exists). If not, this column can just navigate to the detail page — the user clicks a submission row there to open the sheet.
  - Notes: After investigation, the registry list response does NOT include submission IDs. The simplest approach is: eye icon navigates to detail page. On the detail page, if query param `?viewSubmission=latest` is present, auto-open the Sheet for `detail.submissions[0].id`. This avoids adding a new field to the registry list endpoint.

- [x] **Task 11: Write backend tests for submission responses endpoint**
  - File: `apps/api/src/controllers/__tests__/respondent.controller.test.ts` (or create if doesn't exist)
  - Action: Add test cases:
    - Valid request returns structured sections with mapped labels
    - Returns 404 if submission not found
    - Returns 404 if submission belongs to different respondent (IDOR prevention)
    - Returns 403 for supervisor when submission enumerator is not in their team
    - Returns 200 for supervisor when submission enumerator IS in their team
    - Audit log includes `VIEW_SUBMISSION_RESPONSE` action
    - Returns empty sections array when form has no schema (legacy form)
    - Invalid UUID format returns 400
  - Notes: Mock `RespondentService.getSubmissionResponses`. Follow existing `makeMocks` + `makeReq` pattern from `export.controller.test.ts`.

- [x] **Task 12: Write backend tests for role-based rate limiting**
  - File: `apps/api/src/middleware/__tests__/export-rate-limit.test.ts`
  - Action: Add/update test cases:
    - Super admin gets 20 request limit
    - Government official gets 10 request limit
    - Verification assessor gets 5 request limit
    - Unknown role falls back to 5
    - Error message reflects the role's limit (dynamic string, not static)
    - Update existing "blocks 6th request" test to account for role-based limits
  - Notes: The existing `makeReq()` helper only sets `user: { sub: userId }` with no `role` field. Extend it to accept an optional `role` parameter: `makeReq(userId, role?)` → sets `user: { sub: userId, role }`. Without this, the `max` function will always hit the fallback (5) and role-specific tests will fail.

- [x] **Task 13: Write frontend tests for SubmissionResponseSheet**
  - File: `apps/web/src/features/dashboard/components/__tests__/SubmissionResponseSheet.test.tsx` (NEW)
  - Action: Add test cases:
    - Renders sheet with submission metadata when open
    - Renders form sections with human-readable labels
    - Shows skeleton when loading
    - Shows "—" for empty/null field values
    - Navigator shows correct "X of Y" count
    - Prev/Next buttons navigate between submissions
    - Prev disabled on first submission, Next disabled on last
    - Sheet closes when X button clicked
  - Notes: Mock `useSubmissionResponses` hook. Use `@testing-library/react` with MemoryRouter.

- [x] **Task 14: Write frontend test for detail page sheet integration**
  - File: `apps/web/src/features/dashboard/pages/__tests__/RespondentDetailPage.test.tsx` (update existing)
  - Action: Add test cases:
    - Clicking submission row opens SubmissionResponseSheet
    - Eye icon in submission table triggers sheet open
    - Sheet receives correct submissionId and respondentId
    - Query param `?viewSubmission=latest` auto-opens sheet on mount
  - Notes: Mock `useSubmissionResponses` to avoid API calls. Test interaction, not sheet content (Task 13 covers that).

### Acceptance Criteria

- [x] **AC 1**: Given a user on the respondent detail page clicks a submission row, when the Sheet opens, then the full form responses are displayed grouped by form sections with human-readable labels (select_one → label, select_multiple → semicolon-delimited labels).

- [x] **AC 2**: Given a user views a submission response for a select_one field with coded value `wage_public`, when the Sheet renders, then the field shows `Wage Earner (Government/Public Sector)` (the label from choiceLists), not the raw code.

- [x] **AC 3**: Given a respondent has 3 submissions, when the user opens the Sheet for submission 2, then the footer shows "2 of 3" with working Prev and Next buttons that load the adjacent submission's responses without closing the Sheet.

- [x] **AC 4**: Given a supervisor user, when they try to view a submission response for a respondent whose enumerator is NOT in their team, then the API returns 403 Forbidden.

- [x] **AC 5**: Given a user on the respondent detail page, when they view the submission history table, then each row has a clickable view icon and the entire row is clickable to open the response Sheet.

- [x] **AC 6**: Given the Sheet is open on mobile (viewport < 640px), when rendered, then it covers the full viewport width. Given desktop (viewport >= 640px), then it covers ~55% of viewport from the right.

- [x] **AC 7**: Given a submission whose form has no published formSchema (legacy/null), when the Sheet opens, then the metadata section renders normally and the form responses section shows "Form responses unavailable for this submission" instead of crashing.

- [x] **AC 8**: Given a Super Admin user, when they export respondent data, then the rate limit allows 20 exports per hour. Given a Government Official, then 10 per hour. Given a Verification Assessor, then 5 per hour.

- [x] **AC 9**: Given a user on the registry table clicks the eye icon on a row, when navigated to the detail page, then the submission response Sheet auto-opens for the respondent's latest submission.

- [x] **AC 10**: Given a user views a submission response, when the API returns, then an audit log entry is created with action `pii.view_submission_response`, target resource `submissions`, and target ID set to the submission UUID.

- [x] **AC 11**: Given a submission with rawData missing some optional fields (e.g., `monthly_income` was skipped), when the Sheet renders, then the field shows "—" (not "undefined" or "null").

- [x] **AC 12**: Given a user requests a submission that belongs to a different respondent than the URL path, when the API processes the request, then it returns 404 (IDOR prevention — `submission.respondent_id` must match `:respondentId`).

## Additional Context

### Dependencies

- **No new packages** — Sheet, TanStack Query, Zod, express-rate-limit, ioredis all already installed
- **Reuses existing functions** — `flattenRawDataRow`, `buildColumnsFromFormSchema`, `buildChoiceMaps` from `export-query.service.ts`
- **Reuses existing service** — `QuestionnaireService.getFormSchemaById` from `questionnaire.service.ts`
- **Reuses existing middleware** — `TeamAssignmentService.getEnumeratorIdsForSupervisor` for supervisor scope check
- **Database**: No schema changes — all data exists in `submissions.raw_data` JSONB and `questionnaire_forms.form_schema` JSONB

### Testing Strategy

**Unit Tests:**
- `RespondentService.getSubmissionResponses` — mock `db.execute`, verify section structure, label mapping, supervisor scope enforcement, IDOR prevention
- `RespondentController.getSubmissionResponses` — mock service, verify routing, audit logging, error responses
- `export-rate-limit` — verify role-based max values, fallback behavior
- `SubmissionResponseSheet` — mock hook, verify rendering, navigator behavior, loading/empty states

**Integration Tests (manual):**
- Open Sheet on detail page for oslrs_master_v3 form, verify all ~35 fields render with correct labels
- Test multi-select fields (skills_possessed) showing semicolon-delimited labels
- Test submission navigator cycling through 3+ submissions
- Test mobile viewport — Sheet covers full width
- Test supervisor scope — cannot view submission from non-team enumerator
- Test export rate limiting — Super Admin can export 20 times, Official hits limit at 10

### Notes

- **Risk: Large rawData payloads** — Individual submission rawData is typically 2-5KB (35 fields). Server-side flattening adds minimal overhead. No streaming needed for single-submission responses.
- **Risk: Legacy forms without formSchema** — Some submissions may reference forms that were uploaded before native form conversion. AC 7 handles this with a graceful fallback message.
- **Risk: Supervisor scope on submissions** — The existing scope check in `getRespondentDetail` verifies ANY submission is from a team member. For the new endpoint, we check the SPECIFIC submission's enumerator. This is stricter — a supervisor could access a respondent's detail page (because one submission is from their team) but be blocked from viewing a specific submission from a different enumerator. This is intentional and correct.
- **Future: Pre-fetch optimization** — The navigator could pre-fetch adjacent submissions using `queryClient.prefetchQuery` for instant prev/next transitions. This is a UX enhancement that can be added after the core feature works.
- **Future: Print/PDF** — The Sheet's section-based layout could be rendered as a PDF for individual submission reports. Out of scope for now.
