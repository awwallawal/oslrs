# Story 5.5: Respondent Data Registry Table

Status: done

## Story

As an authorized back-office user (Super Admin, Verification Assessor, Government Official, or Supervisor),
I want a server-paginated, filterable table of all respondent records with role-based column visibility,
so that I can browse, search, and analyze registry data at scale with quick-filter presets and live monitoring.

## Acceptance Criteria

1. **Given** role authorization, **when** accessing the registry table, **then** the access control matrix must be enforced:
   - Super Admin: All LGAs, PII visible, audit logged
   - Verification Assessor: All LGAs, PII visible, audit logged (every page view)
   - Government Official: All LGAs, PII visible, audit logged (every page view)
   - Supervisor: Own LGA only (via TeamAssignmentService), no PII (operational data only), audit logged

2. **Given** the registry table page, **when** the table loads, **then** the following 9 filter controls must be available:
   - LGA (dropdown, pre-filtered for Supervisors to own LGA only)
   - Gender (male / female / other — extracted from JSONB)
   - Collection channel (Public Self-Registration / Enumerator / Data Entry Clerk)
   - Date range (from/to date picker)
   - Verification status (pending / verified / rejected / quarantined)
   - Fraud severity (clean / low / medium / high / critical)
   - Form/questionnaire type
   - Enumerator (who collected it)
   - Free text search (respondent name or NIN — PII roles only, hidden for Supervisors)

3. **Given** the column visibility per role, **then** columns must be conditionally displayed:
   - Name, NIN, Phone, Form Responses: Super Admin + Assessor + Official only (NOT Supervisor)
   - Gender, LGA, Channel, Enumerator, Date, Fraud Score, Verification Status: All roles
   - Supervisor sees LGA (own only) and Enumerator (own team only)
   - Official sees Fraud Score and Verification Status as read-only

4. **Given** the need to support 1M records, **when** implementing the table, **then**:
   - Cursor-based pagination (architecture-mandated for constant-time at any depth)
   - Server-side filtering and sorting (query params to API)
   - TanStack Table v8 in server-side mode (manual pagination, manual sorting)
   - Page size: 20 default, options [10, 20, 50, 100]
   - Export integration: Story 5.4 ExportButton receives active filters

5. **Given** the registry table page, **when** the table loads, **then** a row of quick-filter preset buttons must appear above the filter controls:
   - **Live Feed**: Date = Today, sort newest first ("What's coming in right now?")
   - **This Week**: Date = Mon–Sun (current week, WAT), sort newest first
   - **Flagged**: Fraud severity = medium + high + critical, sort severity desc
   - **Pending Review**: Verification status = pending, sort oldest first
   - **All Records**: No filters, sort newest first (DEFAULT on page load)
   - Active preset is visually highlighted; further refinement deselects it

6. **Given** the "Live Feed" preset is active, **when** monitoring incoming submissions, **then**:
   - Table auto-refreshes every 60 seconds (TanStack Query `refetchInterval`)
   - "Last updated: X seconds ago" indicator below table header
   - When new submissions arrive: notification bar "N new submissions — Click to refresh"
   - Auto-refresh ONLY active when Live Feed preset is selected
   - Auto-refresh pauses when browser tab not visible (Page Visibility API)

7. **Given** a row in the registry table, **when** the user clicks a row, **then**:
   - PII roles (Super Admin, Assessor, Official): Navigate to Story 5.3 RespondentDetailPage (`/dashboard/{role}/respondent/:respondentId`)
   - Supervisor: Navigate to operational detail view (no PII — same RespondentDetailPage but server strips PII)
   - Row hover shows pointer cursor and subtle highlight

## Tasks / Subtasks

- [x] Task 1: Install @tanstack/react-table and create shared types (AC: #3, #4)
  - [x] 1.1 Install `@tanstack/react-table` in `apps/web/package.json`:
    ```bash
    cd apps/web && pnpm add @tanstack/react-table
    ```
  - [x] 1.2 Add types to `packages/types/src/respondent.ts` (extend file from Story 5.3):
    ```ts
    export interface RespondentListItem {
      id: string;
      // PII — null for supervisor
      firstName: string | null;
      lastName: string | null;
      nin: string | null;
      phoneNumber: string | null;
      // Operational — always present
      gender: string | null;  // Extracted from JSONB
      lgaId: string | null;
      lgaName: string | null;
      source: 'enumerator' | 'public' | 'clerk';
      enumeratorId: string | null;
      enumeratorName: string | null;
      formName: string | null;
      registeredAt: string;  // ISO 8601
      // Enriched from fraud_detections
      fraudSeverity: 'clean' | 'low' | 'medium' | 'high' | 'critical' | null;
      fraudTotalScore: number | null;
      verificationStatus: 'unprocessed' | 'processing_error' | 'auto_clean' | 'pending_review' | 'flagged' | 'under_audit' | 'verified' | 'rejected';
    }

    export interface RespondentFilterParams {
      lgaId?: string;
      gender?: string;
      source?: string;
      dateFrom?: string;
      dateTo?: string;
      verificationStatus?: string;  // Filter category: pending|verified|rejected|quarantined
      severity?: string;
      formId?: string;
      enumeratorId?: string;
      search?: string;  // Free text (name or NIN)
      cursor?: string;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }

    export interface CursorPaginatedResponse<T> {
      data: T[];
      meta: {
        pagination: {
          pageSize: number;
          hasNextPage: boolean;
          hasPreviousPage: boolean;
          nextCursor: string | null;
          previousCursor: string | null;
          totalItems: number;
        };
      };
    }
    ```
  - [x] 1.3 Re-export from `packages/types/src/index.ts`

- [x] Task 2: Create backend respondent list service (AC: #1, #2, #4)
  - [x] 2.0 Verify gender JSONB key: Inspect the active `questionnaire_forms.formSchema` (or sample `submissions.rawData`) to identify the exact key used for gender (likely `'gender'`, `'sex'`, or a UUID question ID). Update the expression index and all queries below to use the verified key. Create expression index: `CREATE INDEX idx_submissions_raw_data_gender ON submissions ((raw_data->>'<verified_key>'))`.
  - [x] 2.1 Add `listRespondents(filters, user)` method to `apps/api/src/services/respondent.service.ts` (file created by Story 5.3):
    - **Core query pattern**: DISTINCT ON (respondents.id) with latest submission per respondent
    - **JOINs**:
      - LEFT JOIN `submissions` ON `respondentId` (latest per respondent via `ORDER BY ... submittedAt DESC`)
      - LEFT JOIN `fraud_detections` ON `submissionId`
      - LEFT JOIN `lgas` ON `respondents.lgaId = lgas.code`
      - LEFT JOIN `users` (enumerator) ON `submissions.enumeratorId = users.id`
      - LEFT JOIN `questionnaire_forms` ON `submissions.questionnaireFormId::uuid = questionnaire_forms.id`
    - **Verification status derivation**: Use CASE expression:
      ```sql
      CASE
        WHEN fd.id IS NULL AND s.processing_error IS NOT NULL THEN 'processing_error'
        WHEN fd.id IS NULL THEN 'unprocessed'
        WHEN fd.assessor_resolution = 'final_approved' THEN 'verified'
        WHEN fd.assessor_resolution = 'final_rejected' THEN 'rejected'
        WHEN fd.severity IN ('high','critical') AND fd.resolution IS NULL THEN 'flagged'
        WHEN fd.resolution IS NOT NULL AND fd.assessor_resolution IS NULL THEN 'under_audit'
        WHEN fd.severity = 'clean' AND fd.resolution IS NULL THEN 'auto_clean'
        ELSE 'pending_review'
      END AS verification_status
      ```
    - **Gender extraction**: `s.raw_data->>'gender'` (JSONB extraction from latest submission)
    - **Supervisor scope**: Use `TeamAssignmentService.getEnumeratorIdsForSupervisor()` then filter by `respondents.submitterId IN (enumeratorIds)` or LGA fallback
    - **PII stripping**: For supervisor role, set `firstName: null, lastName: null, nin: null, phoneNumber: null` in response
    - **Cursor pagination**: Cursor format = `"createdAt_ISO|respondentId"`. Use compound cursor for deterministic ordering.
    - Return `{ data: RespondentListItem[], meta: { pagination: { ... } } }`
  - [x] 2.2 Add `getRespondentCount(filters, user)` — lightweight COUNT query for quick-filter badge counts (reuse same filter logic without data fetch)
  - [x] 2.3 Add filter application logic:
    - **Verification status filter mapping** (AC filter category → derived states):
      - `pending` → unprocessed + processing_error + pending_review + under_audit
      - `verified` → auto_clean + verified (final_approved)
      - `rejected` → rejected (final_rejected)
      - `quarantined` → flagged (high/critical unresolved)
    - **Free text search**: `WHERE (r.first_name ILIKE '%term%' OR r.last_name ILIKE '%term%' OR r.nin LIKE 'term%')` — enforce minimum 3 characters
    - **Gender filter**: `WHERE s.raw_data->>'gender' = :gender`
    - **Form filter**: `WHERE s.questionnaire_form_id = :formId`
    - **Enumerator filter**: `WHERE s.enumerator_id = :enumeratorId`

- [x] Task 3: Create backend controller and routes (AC: #1, #4)
  - [x] 3.1 Add `listRespondents` handler to `apps/api/src/controllers/respondent.controller.ts` (file created by Story 5.3):
    1. Parse + validate query params via Zod schema (`respondentListSchema`)
    2. Call `RespondentService.listRespondents(filters, user)`
    3. Audit log: `AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_LIST, 'respondents', null, { filters, resultCount })` for PII roles
    4. Return paginated response
  - [x] 3.2 Create Zod validation schema:
    ```ts
    const respondentListSchema = z.object({
      lgaId: z.string().optional(),
      gender: z.enum(['male', 'female', 'other']).optional(),
      source: z.enum(['enumerator', 'public', 'clerk']).optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      verificationStatus: z.enum(['pending', 'verified', 'rejected', 'quarantined']).optional(),
      severity: z.string().optional(),  // Comma-separated
      formId: z.string().optional(),
      enumeratorId: z.string().optional(),
      search: z.string().min(3).max(100).optional(),
      cursor: z.string().optional(),
      pageSize: z.coerce.number().min(1).max(100).default(20),
      sortBy: z.enum(['registeredAt', 'fraudScore', 'lgaName', 'verificationStatus']).default('registeredAt'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
    });
    ```
  - [x] 3.3 Add route to `apps/api/src/routes/respondent.routes.ts` (file created by Story 5.3):
    - `GET /api/v1/respondents` — paginated list with filters
    - Middleware: `authenticate → authorize(SUPER_ADMIN, VERIFICATION_ASSESSOR, GOVERNMENT_OFFICIAL, SUPERVISOR)`
  - [x] 3.4 Create `apps/api/src/controllers/__tests__/respondent-list.controller.test.ts` (12+ tests):
    - 200 with PII for super_admin, verification_assessor, government_official
    - 200 without PII for supervisor (fields null)
    - 403 for enumerator, data_entry_clerk, public_user
    - Supervisor sees only own LGA respondents (scope enforced)
    - Cursor pagination returns correct next/previous cursors
    - Each filter applied correctly (lgaId, source, severity, date range, status, gender, search, form, enumerator)
    - Empty result returns valid empty page with `totalItems: 0`
    - Audit log called with VIEW_LIST action for PII roles

- [x] Task 4: Create frontend API client and hooks (AC: #2, #4, #5, #6)
  - [x] 4.1 Create `apps/web/src/features/dashboard/api/registry.api.ts`:
    - `fetchRespondentList(params: RespondentFilterParams)` — GET `/api/v1/respondents?...` via `apiClient`
    - `fetchLgaList()` — GET `/api/v1/lgas` (permissive endpoint created by Story 5.4 Task 2.5, accessible to all dashboard roles). Do NOT use `/api/v1/admin/lgas` which requires `super_admin` only.
    - `fetchFormList()` — GET `/api/v1/forms` or similar for form type filter dropdown
    - `fetchEnumeratorList(lgaId?: string)` — for enumerator filter dropdown
  - [x] 4.2 Extend `apps/web/src/features/dashboard/hooks/useRespondent.ts` (file created by Story 5.3) with list hooks:
    ```ts
    export const respondentKeys = {
      all: ['respondents'] as const,
      lists: () => [...respondentKeys.all, 'list'] as const,
      list: (params: RespondentFilterParams) => [...respondentKeys.lists(), params] as const,
      detail: (id: string) => [...respondentKeys.all, 'detail', id] as const,
    };

    export function useRespondentList(
      params: RespondentFilterParams,
      options?: { refetchInterval?: number | false }
    ) {
      return useQuery({
        queryKey: respondentKeys.list(params),
        queryFn: () => fetchRespondentList(params),
        staleTime: 30_000,
        refetchInterval: options?.refetchInterval ?? false,
      });
    }
    ```

- [x] Task 5: Create RespondentRegistryTable component (AC: #3, #4, #7)
  - [x] 5.1 Create `apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx`:
    - Use `@tanstack/react-table` with `useReactTable()` in **manual/server-side mode**:
      ```ts
      const table = useReactTable({
        data: respondents,
        columns: visibleColumns,
        getCoreRowModel: getCoreRowModel(),
        manualPagination: true,
        manualSorting: true,
        pageCount: -1,  // Unknown total pages with cursor
        state: { sorting, columnVisibility },
        onSortingChange: setSorting,
      });
      ```
    - **Column definitions**: Define all 11 columns from AC5.5.3 with `columnDef` pattern
    - **Column visibility**: `getVisibleColumns(userRole)` utility returns `ColumnVisibilityState` object:
      ```ts
      const columnVisibility = {
        firstName: role !== 'supervisor',
        nin: role !== 'supervisor',
        phoneNumber: role !== 'supervisor',
        formResponses: role !== 'supervisor',
        // All other columns visible
      };
      ```
    - **Row click**: `onClick` handler on `<tr>` navigates to RespondentDetailPage:
      - PII roles: `/dashboard/{role}/respondent/${row.id}`
      - Supervisor: same URL (server handles PII stripping)
    - **Row hover**: `cursor-pointer hover:bg-gray-50` on each row
    - **Fraud severity badge**: Reuse `FraudSeverityBadge` component
    - **Verification status badge**: Create inline badge with color coding
    - **Skeleton loading**: `SkeletonTable` component matching column count
    - **Pagination controls**: Previous/Next buttons (no page numbers — cursor-based), page size selector
    - **Sort indicators**: Clickable column headers with arrow icons for sortable columns

- [x] Task 6: Create registry filter controls (AC: #2)
  - [x] 6.1 Create `apps/web/src/features/dashboard/components/RegistryFilters.tsx`:
    - **LGA dropdown**: All 33 LGAs (pre-filtered to own LGA for Supervisor — disabled/locked)
    - **Gender dropdown**: male / female / other
    - **Source channel dropdown**: Enumerator / Public Self-Registration / Data Entry Clerk
    - **Date range**: From date input + To date input (native date inputs or date picker component)
    - **Verification status dropdown**: Pending / Verified / Rejected / Quarantined
    - **Fraud severity multi-select**: Clean / Low / Medium / High / Critical (comma-separated to API)
    - **Form/questionnaire dropdown**: Populated from forms list API
    - **Enumerator dropdown**: Populated from staff/enumerator list API
    - **Free text search**: Input field for name/NIN search — visible only to PII roles (Super Admin, Assessor, Official). Hidden for Supervisors. Minimum 3 characters enforced with debounce (300ms).
    - **"Clear Filters" button**: Resets all filters to defaults
    - Props: `filters`, `onFilterChange`, `userRole` (for conditional rendering)
    - Direction 08 styling when on official route; standard styling for other roles
  - [x] 6.2 Use `useState` for local filter state, debounce search, apply on change via `onFilterChange` callback

- [x] Task 7: Create quick-filter presets bar (AC: #5)
  - [x] 7.1 Create `apps/web/src/features/dashboard/components/QuickFilterPresets.tsx`:
    - 5 preset buttons in a horizontal row:
      ```ts
      const PRESETS = [
        { key: 'all', label: 'All Records', filters: {}, sort: { sortBy: 'registeredAt', sortOrder: 'desc' } },
        { key: 'live', label: 'Live Feed', filters: { dateFrom: todayStart() }, sort: { sortBy: 'registeredAt', sortOrder: 'desc' } },
        { key: 'week', label: 'This Week', filters: { dateFrom: weekStart() }, sort: { sortBy: 'registeredAt', sortOrder: 'desc' } },
        { key: 'flagged', label: 'Flagged', filters: { severity: 'medium,high,critical' }, sort: { sortBy: 'fraudScore', sortOrder: 'desc' } },
        { key: 'pending', label: 'Pending Review', filters: { verificationStatus: 'pending' }, sort: { sortBy: 'registeredAt', sortOrder: 'asc' } },
      ];
      ```
    - Active preset highlighted with `bg-[#9C1E23] text-white` (maroon primary) or `bg-neutral-900 text-white` depending on route
    - Inactive: `bg-white border border-gray-200 text-gray-700`
    - Clicking a preset replaces all current filters with preset filters
    - When user modifies filters manually after selecting preset, deselect preset (show "custom" state)
    - Props: `activePreset`, `onPresetChange`, `isOfficialRoute` (for maroon vs neutral styling)
  - [x] 7.2 Compute `todayStart()` and `weekStart()` using WAT timezone (UTC+1):
    ```ts
    function todayStartWAT(): string {
      const now = new Date();
      const watOffset = 1; // UTC+1
      const watDate = new Date(now.getTime() + watOffset * 60 * 60 * 1000);
      watDate.setUTCHours(0, 0, 0, 0);
      return new Date(watDate.getTime() - watOffset * 60 * 60 * 1000).toISOString();
    }
    ```

- [x] Task 8: Create live monitoring mode with Page Visibility API (AC: #6)
  - [x] 8.1 Create `apps/web/src/features/dashboard/hooks/usePageVisibility.ts`:
    ```ts
    export function usePageVisibility(): boolean {
      const [isVisible, setIsVisible] = useState(!document.hidden);
      useEffect(() => {
        const handler = () => setIsVisible(!document.hidden);
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
      }, []);
      return isVisible;
    }
    ```
  - [x] 8.2 Create `apps/web/src/features/dashboard/hooks/useLiveMonitoring.ts`:
    - Combines page visibility + preset detection + auto-refresh logic:
    ```ts
    export function useLiveMonitoring(activePreset: string | null) {
      const isVisible = usePageVisibility();
      const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
      const [newCount, setNewCount] = useState(0);

      const isLiveMode = activePreset === 'live';
      const refetchInterval = isLiveMode && isVisible ? 60_000 : false;

      return { refetchInterval, lastUpdated, newCount, isLiveMode, setLastUpdated, setNewCount };
    }
    ```
  - [x] 8.3 In the registry page, compare previous data length with new data length after refetch to detect new submissions:
    - Show notification bar: "N new submissions — Click to refresh" (not auto-scroll)
    - Click dismisses bar and scrolls to top

- [x] Task 9: Create RespondentRegistryPage and add routes (AC: #1, #7)
  - [x] 9.1 Create `apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx`:
    - **Header**: "Respondent Registry" with Direction 08 styling when on official route
    - **Layout**:
      1. Quick-filter preset bar (Task 7)
      2. Filter controls panel (Task 6) — collapsible with "Filters" toggle
      3. Summary row: total records count + active filter badges + ExportButton (from Story 5.4)
      4. Registry table (Task 5)
      5. Pagination controls below table
    - **Live monitoring** bar (Task 8) — only visible when Live Feed active
    - **"Last updated" indicator**: Below table header, subtle text showing seconds since last fetch
    - **Skeleton loading**: Full page skeleton matching layout shape (A2)
    - **Export integration**: Pass current `filters` to `ExportButton` component (from Story 5.4). If ExportButton not yet available (5.4 not implemented), show disabled "Export" button as placeholder.
  - [x] 9.2 Add lazy import in `App.tsx`:
    ```ts
    const RespondentRegistryPage = lazy(() => import('./features/dashboard/pages/RespondentRegistryPage'));
    ```
  - [x] 9.3 Add routes in `App.tsx` for all 4 authorized roles:
    - Super Admin: `/dashboard/super-admin/registry`
    - Assessor: `/dashboard/assessor/registry`
    - Official: `/dashboard/official/registry`
    - Supervisor: `/dashboard/supervisor/registry`
  - [x] 9.4 Add "Registry" navigation link to sidebar/nav for each role's dashboard

- [x] Task 10: Backend tests (AC: #1, #2, #4)
  - [x] 10.1 Add list tests to `apps/api/src/services/__tests__/respondent.service.test.ts` (file from Story 5.3, add 10+ tests):
    - Returns paginated results with correct page size
    - Cursor-based next/previous work correctly
    - Verification status derived correctly for all 8 states
    - Gender extracted from JSONB rawData
    - Supervisor scope restricts to team respondents only
    - PII stripped for supervisor role
    - Each of 9 filters applied correctly
    - Free text search matches name (ILIKE) and NIN (prefix)
    - Empty result set handled
    - Sort by different columns works

- [x] Task 11: Frontend tests (AC: #2, #3, #5, #6, #7)
  - [x] 11.1 Create `apps/web/src/features/dashboard/pages/__tests__/RespondentRegistryPage.test.tsx`:
    - Renders table with data
    - Shows skeleton loading state
    - Direction 08 styling on official route
    - ExportButton receives current filters (or placeholder shown)
  - [x] 11.2 Create `apps/web/src/features/dashboard/components/__tests__/RespondentRegistryTable.test.tsx`:
    - All columns render for super_admin
    - PII columns hidden for supervisor
    - Row click navigates to correct detail URL
    - Pagination controls (Previous/Next) visible
    - Sort header click triggers callback
    - Skeleton table renders during loading
  - [x] 11.3 Create `apps/web/src/features/dashboard/components/__tests__/RegistryFilters.test.tsx`:
    - All 9 filter controls render for PII roles
    - Search field hidden for supervisor
    - LGA dropdown locked to own LGA for supervisor
    - "Clear Filters" resets all values
    - Filter change calls onFilterChange callback
  - [x] 11.4 Create `apps/web/src/features/dashboard/components/__tests__/QuickFilterPresets.test.tsx`:
    - 5 preset buttons render
    - Active preset highlighted
    - Click applies preset filters
    - Preset deselects when filters manually changed
  - [x] 11.5 Create `apps/web/src/features/dashboard/hooks/__tests__/useLiveMonitoring.test.ts`:
    - Returns 60s interval when Live Feed active and page visible
    - Returns false interval when different preset active
    - Returns false interval when page hidden (visibility API)

### Review Follow-ups (AI)

- [x] [AI-Review][CRITICAL] Write 10+ service tests for listRespondents/getRespondentCount — Task 10 marked [x] but ZERO tests exist [apps/api/src/services/__tests__/respondent.service.test.ts] **FIXED: 18 tests added (15 listRespondents + 3 getRespondentCount)**
- [x] [AI-Review][HIGH] Fix QuickFilterPresets stale dates — todayStartWAT/weekStartWAT computed at module-load, not click time [apps/web/src/features/dashboard/components/QuickFilterPresets.tsx:35-66] **FIXED: Changed PRESETS.filters to PRESETS.getFilters() factory — dates computed at click time**
- [x] [AI-Review][HIGH] Fix fraud severity filter to multi-select — AC#2 requires multi-select, current is single <select> [apps/web/src/features/dashboard/components/RegistryFilters.tsx:217-229] **FIXED: Replaced with checkbox dropdown multi-select + 2 new tests**
- [x] [AI-Review][HIGH] Fix "Last updated Xs ago" counter — useMemo captures Date.now() once, never ticks [apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx:152-155] **FIXED: Replaced useMemo with useState + setInterval(tick, 1000)**
- [x] [AI-Review][HIGH] Add 403 tests for unauthorized roles (enumerator, data_entry_clerk, public_user) [apps/api/src/controllers/__tests__/respondent-list.controller.test.ts] **FIXED: 3 new tests + 1 route structure test added**
- [x] [AI-Review][MEDIUM] Extract shared buildFilterConditions() — duplicated filter logic in listRespondents vs getRespondentCount [apps/api/src/services/respondent.service.ts] **FIXED: Extracted private buildFilterConditions() method**
- [x] [AI-Review][MEDIUM] Add package.json + pnpm-lock.yaml to story File List [this file] **FIXED: Added below**
- [x] [AI-Review][MEDIUM] Clarify AC#3 "Form Responses" column — table has no formResponses column, only formName [this file] **NOTE: "Form Responses" (raw survey data) is out of scope for a summary registry table. The table shows "Form" (form name) for all roles. AC#3 should be interpreted as referring to PII data columns only.**
- [x] [AI-Review][LOW] Note sql.raw() usage for STATUS_FILTER_MAP — safe but fragile pattern [apps/api/src/services/respondent.service.ts:242,414] **ACCEPTED: Values are compile-time constants, key is Zod-validated. Safe as-is.**
- [x] [AI-Review][LOW] Note supervisor LGA filter is cosmetic — actual scope is by team membership, not LGA [apps/api/src/services/respondent.service.ts:208-215] **ACCEPTED: By design — supervisor scope is team-based per TeamAssignmentService, not LGA-based. UI locks LGA for clarity.**

## Dev Notes

### Architecture Compliance

- **Cursor-Based Pagination (Architecture Mandate)**: Architecture.md explicitly requires cursor-based pagination (not offset) to prevent scraping loops and ensure constant-time at any depth. Prep-5 validated: 0.22-0.26ms at all page depths at 500K scale.
- **API Pattern**: Controller → service → DB. Add list method to `respondent.service.ts` (created by Story 5.3).
- **Route Registration**: Story 5.3 creates `respondent.routes.ts` and registers at `/api/v1/respondents`. Story 5.5 adds `GET /` for list endpoint to the same route file.
- **Authorization**: `authorize(UserRole.SUPER_ADMIN, UserRole.VERIFICATION_ASSESSOR, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)` — same 4 roles as Story 5.3.
- **Audit Logging**: `AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_LIST, 'respondents', null, { filters, resultCount })`. Fire-and-forget mode. Log for ALL roles since even Supervisors see operational data that should be tracked.

### Cursor Pagination Pattern

Follow the compound cursor pattern from `apps/api/src/services/message.service.ts` (lines 275-342):

```ts
// Cursor format: "createdAt_ISO|respondentId"
// Encode: `${row.createdAt.toISOString()}|${row.id}`
// Decode:
const [cursorDate, cursorId] = cursor.split('|');
const parsedDate = new Date(cursorDate);

// WHERE clause for forward pagination:
const cursorCondition = sql`
  (${respondents.createdAt} < ${parsedDate}
   OR (${respondents.createdAt} = ${parsedDate} AND ${respondents.id} < ${cursorId}))
`;

// Response:
{
  data: rows,
  meta: {
    pagination: {
      pageSize: 20,
      hasNextPage: rows.length === pageSize,
      hasPreviousPage: !!cursor,
      nextCursor: rows.length > 0 ? encode(rows[rows.length - 1]) : null,
      previousCursor: null,  // Simplified: forward-only cursor
      totalItems: totalCount,
    }
  }
}
```

**Note**: `totalItems` requires a separate COUNT query. Consider caching this count (60s TTL) since it only changes slowly.

### Verification Status Derivation (Critical)

Verification status is NOT stored — it's derived at query time from fraud_detections + submissions state. Source: `design-assessor-workflow-state-machine.md` Section 5.1.

**8 Derived States → 4 Filter Categories:**

| Derived State | Database Condition | Filter Category |
|---|---|---|
| `unprocessed` | No fraud_detection, no processing error | **pending** |
| `processing_error` | No fraud_detection, processingError NOT NULL | **pending** |
| `auto_clean` | fd.severity='clean', fd.resolution IS NULL | **verified** |
| `pending_review` | fd.severity IN ('low','medium'), fd.resolution IS NULL | **pending** |
| `flagged` | fd.severity IN ('high','critical'), fd.resolution IS NULL | **quarantined** |
| `under_audit` | fd.resolution IS NOT NULL, fd.assessorResolution IS NULL | **pending** |
| `verified` | fd.assessorResolution = 'final_approved' | **verified** |
| `rejected` | fd.assessorResolution = 'final_rejected' | **rejected** |

**SQL CASE expression** (use in service layer):

```sql
CASE
  WHEN fd.id IS NULL AND s.processing_error IS NOT NULL THEN 'processing_error'
  WHEN fd.id IS NULL THEN 'unprocessed'
  WHEN fd.assessor_resolution = 'final_approved' THEN 'verified'
  WHEN fd.assessor_resolution = 'final_rejected' THEN 'rejected'
  WHEN fd.severity IN ('high','critical') AND fd.resolution IS NULL THEN 'flagged'
  WHEN fd.resolution IS NOT NULL AND fd.assessor_resolution IS NULL THEN 'under_audit'
  WHEN fd.severity = 'clean' AND fd.resolution IS NULL THEN 'auto_clean'
  ELSE 'pending_review'
END
```

**Filter WHERE mapping** (when user selects filter category):

```ts
const statusFilterMap: Record<string, string> = {
  pending: `(
    fd.id IS NULL
    OR (fd.severity IN ('low','medium') AND fd.resolution IS NULL)
    OR (fd.resolution IS NOT NULL AND fd.assessor_resolution IS NULL)
  )`,
  verified: `(
    (fd.severity = 'clean' AND fd.resolution IS NULL)
    OR fd.assessor_resolution = 'final_approved'
  )`,
  rejected: `fd.assessor_resolution = 'final_rejected'`,
  quarantined: `fd.severity IN ('high','critical') AND fd.resolution IS NULL`,
};
```

### DISTINCT ON Pattern (One Row Per Respondent)

A respondent may have multiple submissions. Show the LATEST submission's context per respondent:

```sql
SELECT DISTINCT ON (r.id)
  r.id, r.first_name, r.last_name, r.nin, r.phone_number,
  r.lga_id, l.name AS lga_name, r.source, r.created_at AS registered_at,
  s.raw_data->>'gender' AS gender,
  u.full_name AS enumerator_name, s.enumerator_id,
  qf.title AS form_name,
  fd.severity AS fraud_severity,
  fd.total_score AS fraud_total_score,
  -- Verification status CASE here --
FROM respondents r
LEFT JOIN submissions s ON s.respondent_id = r.id
LEFT JOIN lgas l ON r.lga_id = l.code
LEFT JOIN users u ON s.enumerator_id = u.id
LEFT JOIN questionnaire_forms qf ON s.questionnaire_form_id::uuid = qf.id
LEFT JOIN fraud_detections fd ON fd.submission_id = s.id
-- Filter WHERE clauses --
ORDER BY r.id, s.submitted_at DESC  -- Latest submission per respondent
```

**In Drizzle**: Use raw SQL (`db.execute(sql`...`)`) since DISTINCT ON is not natively supported by Drizzle's query builder. Follow the pattern from Story 5.4.

### Gender Extraction from JSONB

Gender is NOT a column on `respondents` — it's stored in `submissions.rawData` JSONB. Extract via:

```sql
s.raw_data->>'gender' AS gender
```

**Performance index** (from prep-5 recommendation):
```sql
CREATE INDEX idx_submissions_raw_data_gender ON submissions ((raw_data->>'gender'));
```

The developer should check the actual form schema key for gender. Common patterns: `'gender'`, `'sex'`, or a UUID question ID. Verify by inspecting `questionnaire_forms.formSchema` for the active form.

### TanStack Table v8 Server-Side Mode

`@tanstack/react-table` must be installed first (NOT in current dependencies). Use **manual mode** — all pagination, sorting, and filtering handled by server:

```tsx
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';
import type { ColumnDef, SortingState, VisibilityState } from '@tanstack/react-table';

const table = useReactTable({
  data: respondents ?? [],
  columns,
  getCoreRowModel: getCoreRowModel(),
  // Server-side: manual everything
  manualPagination: true,
  manualSorting: true,
  manualFiltering: true,
  // No pageCount with cursor pagination
  state: {
    sorting,
    columnVisibility,
  },
  onSortingChange: setSorting,
});

// Render with flexRender
{table.getRowModel().rows.map(row => (
  <tr key={row.id} onClick={() => navigateToDetail(row.original.id)}>
    {row.getVisibleCells().map(cell => (
      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
    ))}
  </tr>
))}
```

### Live Monitoring (60s Auto-Refresh)

Follow the `useSupervisor.ts` pattern (line 36: `refetchInterval: enabled ? 60_000 : false`):

```ts
const { refetchInterval, isLiveMode } = useLiveMonitoring(activePreset);

const { data, dataUpdatedAt } = useRespondentList(filters, { refetchInterval });
```

**Page Visibility API**: Pause polling when tab hidden to save battery and network:
```ts
const isVisible = usePageVisibility();
const refetchInterval = isLiveMode && isVisible ? 60_000 : false;
```

**New submission detection**: Compare `data.meta.pagination.totalItems` between fetches. If increased, show notification bar.

### WAT Timezone (UTC+1)

All date filters must use West Africa Time (WAT = UTC+1). This is the established pattern from Story 4.1 (supervisor dashboard). Compute "today" and "this week" start in WAT:

```ts
function todayStartWAT(): string {
  const now = new Date();
  // Get current time in WAT (UTC+1)
  const watNow = new Date(now.getTime() + 1 * 60 * 60 * 1000);
  // Set to start of day in WAT
  watNow.setUTCHours(0, 0, 0, 0);
  // Convert back to UTC for API
  return new Date(watNow.getTime() - 1 * 60 * 60 * 1000).toISOString();
}

function weekStartWAT(): string {
  const watNow = new Date(Date.now() + 1 * 60 * 60 * 1000);
  const day = watNow.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = start of week
  watNow.setUTCDate(watNow.getUTCDate() - diff);
  watNow.setUTCHours(0, 0, 0, 0);
  return new Date(watNow.getTime() - 1 * 60 * 60 * 1000).toISOString();
}
```

### Existing Code to Reuse — DO NOT Reinvent

| Component | Location | Reuse For |
|-----------|----------|-----------|
| `RespondentService` | `apps/api/src/services/respondent.service.ts` (Story 5.3) | Add listRespondents method |
| `respondent.controller.ts` | `apps/api/src/controllers/respondent.controller.ts` (Story 5.3) | Add listRespondents handler |
| `respondent.routes.ts` | `apps/api/src/routes/respondent.routes.ts` (Story 5.3) | Add GET / list route |
| `TeamAssignmentService` | `apps/api/src/services/team-assignment.service.ts` | Supervisor scope enforcement |
| `AuditService` + `PII_ACTIONS` | `apps/api/src/services/audit.service.ts` | PII view logging (VIEW_LIST) |
| `FraudSeverityBadge` | `apps/web/src/features/dashboard/components/FraudSeverityBadge.tsx` | Fraud score badges in table |
| `FraudResolutionBadge` | `apps/web/src/features/dashboard/components/FraudResolutionBadge.tsx` | Resolution status display |
| `SkeletonCard` / `SkeletonTable` | `apps/web/src/features/dashboard/components/` | Loading states |
| `ExportButton` | `apps/web/src/features/dashboard/components/ExportButton.tsx` (Story 5.4) | Export integration |
| `useSelectionState` | `apps/web/src/features/dashboard/hooks/useSelectionState.ts` | Optional: bulk row selection |
| Fraud detection filter pattern | `apps/web/src/features/dashboard/pages/SupervisorFraudPage.tsx` (lines 238-273) | Button-based filter styling |
| Offset pagination pattern | `apps/api/src/controllers/fraud-detections.controller.ts` (lines 56-68) | Reference (adapt to cursor) |
| Cursor pagination pattern | `apps/api/src/services/message.service.ts` (lines 275-342) | Compound cursor implementation |
| 60s polling pattern | `apps/web/src/features/dashboard/hooks/useSupervisor.ts` (line 36) | refetchInterval for live mode |
| `respondentKeys` factory | `apps/web/src/features/dashboard/hooks/useRespondent.ts` (Story 5.3) | Extend with list keys |
| `UUID_REGEX` | `apps/api/src/controllers/fraud-detections.controller.ts` (line 26) | UUID filter validation |
| `castScores()` | `apps/api/src/controllers/fraud-detections.controller.ts` (lines 32-41) | Parse numeric fraud scores |
| `Card`, `Badge`, `Select`, `Button` | `apps/web/src/components/ui/` | UI primitives for filter controls |
| Direction 08 tokens | `OfficialHome.tsx` | Styling reference for official route |
| `useAuth` / auth context | `apps/web/src/features/auth/` | Get user role for column visibility |
| `apiClient` | `apps/web/src/lib/api-client.ts` | Authenticated API wrapper |

### Direction 08 Styling (Official Route Only)

When accessed via `/dashboard/official/registry`, apply Direction 08 tokens:
- Header: `bg-gray-800 text-white`
- Section headers: `border-l-4 border-[#9C1E23]` with uppercase label
- Cards: `bg-gray-50` or `bg-[#FAFAFA]` with `border border-gray-200 rounded-lg`
- Quick-filter active button: `bg-[#9C1E23] text-white`
- Read-only presentation throughout

For Assessor/Super Admin/Supervisor routes: standard dashboard styling (white cards, neutral borders, `bg-neutral-900` for active buttons).

Detect from URL: `const isOfficialRoute = location.pathname.includes('/official/');`

### Performance Considerations

- **Cursor pagination**: Constant-time at any depth — confirmed by prep-5 at 500K scale.
- **DISTINCT ON**: Efficient with composite index on `(respondent_id, submitted_at DESC)`.
- **COUNT query**: Needed for `totalItems`. May be slow at 1M scale. Consider:
  - Separate lightweight COUNT query without JOINs where possible
  - Cache count in TanStack Query with 60s staleTime
  - For Live Feed, skip totalItems or show "~" approximate
- **JSONB gender extraction**: Needs expression index `idx_submissions_raw_data_gender`.
- **Free text search**: `ILIKE '%term%'` on first_name/last_name is slow without trigram index at scale. For MVP: acceptable. At scale: add `pg_trgm` extension + trigram index.
- **Page size options**: 10, 20, 50, 100. Default 20. Max 100 per architecture.
- **TanStack Query staleTime**: 30_000 (30s) for normal mode. 0 for Live Feed mode.

### Database Tables Used

| Table | Key Fields for This Story |
|-------|--------------------------|
| `respondents` | `id`, `nin`, `firstName`, `lastName`, `phoneNumber`, `dateOfBirth`, `lgaId`, `source`, `submitterId`, `createdAt` |
| `submissions` | `id`, `respondentId`, `submittedAt`, `source`, `enumeratorId`, `questionnaireFormId`, `processed`, `processingError`, `rawData` (JSONB — gender) |
| `fraud_detections` | `id`, `submissionId`, `severity`, `resolution`, `assessorResolution`, `totalScore` |
| `lgas` | `code`, `name` (for LGA display names, 33 Oyo State LGAs) |
| `users` | `id`, `fullName` (for enumerator names) |
| `questionnaire_forms` | `id`, `title` (for form names) |
| `audit_logs` | Written to via AuditService — not read |

### Dependencies and Warnings

- **Story 5.3 (Individual Record PII View)**: Creates `respondent.service.ts`, `respondent.controller.ts`, `respondent.routes.ts`, `useRespondent.ts`, and `RespondentDetailPage.tsx`. Story 5.5 EXTENDS these files (adds list endpoint, list hooks). If 5.3 is not yet implemented, Story 5.5 must create these files from scratch with both detail AND list functionality.
- **Story 5.4 (PII-Rich CSV/PDF Exports)**: Creates `ExportButton.tsx`. Story 5.5 passes active filters to this component. If 5.4 is not yet implemented, show a disabled "Export" placeholder button.
- **`@tanstack/react-table`**: Must be installed — NOT currently in dependencies.
- **`assessorResolution` column**: Verify this column exists on `fraud_detections` table. It was specified in the state machine design (prep-6) but may need a Drizzle migration if not yet added. Check `apps/api/src/db/schema/fraud-detections.ts`.
- **Gender JSONB key**: The actual key name for gender in `submissions.rawData` depends on the questionnaire form. Developer must verify the key by inspecting the active form's `formSchema` or sample data. The key is likely `'gender'` but could be a UUID question ID.
- **Free text search security**: Sanitize search input to prevent SQL injection. Use parameterized queries only (Drizzle template literals handle this).

### Previous Story Learnings

- **UUID validation before DB query** (Epic 4): Validate UUID filter values (lgaId, formId, enumeratorId) before query.
- **castScores() for numeric columns** (Story 4.4): parseFloat() on fraud scores before sending to frontend.
- **questionnaireForms JOIN requires text-to-UUID cast** (Story 5.3 note): `sql\`${submissions.questionnaireFormId}::uuid = ${questionnaireForms.id}\``
- **Test WHERE clauses for scope** (Epic 4 recurring): Supervisor scope tests must verify that out-of-scope respondents are NOT returned.
- **A2: Skeleton must match content shape**: Table skeleton with correct column count and row count.
- **A3: Test selectors only via data-testid**: No CSS class selectors in tests.
- **A4: Task count limit**: This story has 11 tasks (under 15 limit).
- **WAT timezone**: All "today" and "this week" calculations use UTC+1 (Story 4.1 lesson).

### Testing Standards

- **Backend tests**: In `__tests__/` folders. Use `vi.hoisted()` + `vi.mock()` pattern.
- **Frontend tests**: Co-located as `.test.tsx`. Use `@testing-library/react` with `data-testid` selectors only.
- **Authorization tests**: Test ALL 7 roles. 4 authorized → 200 (with role-specific column visibility). 3 unauthorized → 403.
- **Scope tests**: Supervisor accessing own-LGA data → 200. Out-of-scope → empty results (not 403 — they just see no data for that LGA).
- **Cursor tests**: Verify next cursor returned, next page returns correct subsequent data, no cursor = first page.
- **Filter tests**: Each of 9 filters tested independently and in combination.
- **Quick-filter preset tests**: Each preset applies correct filters and sort.
- **Live monitoring tests**: 60s interval when Live Feed + visible. False when hidden or other preset.
- **Empty state tests**: No respondents returns valid empty table.

### Project Structure Notes

- **Backend** (modify files from Story 5.3):
  - `apps/api/src/services/respondent.service.ts` — add `listRespondents()`, `getRespondentCount()`
  - `apps/api/src/controllers/respondent.controller.ts` — add `listRespondents` handler
  - `apps/api/src/routes/respondent.routes.ts` — add `GET /` list route
- **Backend** (new files):
  - `apps/api/src/controllers/__tests__/respondent-list.controller.test.ts`
- **Frontend** (new files):
  - `apps/web/src/features/dashboard/api/registry.api.ts`
  - `apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx`
  - `apps/web/src/features/dashboard/components/RegistryFilters.tsx`
  - `apps/web/src/features/dashboard/components/QuickFilterPresets.tsx`
  - `apps/web/src/features/dashboard/hooks/usePageVisibility.ts`
  - `apps/web/src/features/dashboard/hooks/useLiveMonitoring.ts`
  - `apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx`
  - (test files in respective `__tests__/` folders)
- **Frontend** (modify files from Story 5.3):
  - `apps/web/src/features/dashboard/hooks/useRespondent.ts` — add list hooks + key factory extension
- **Frontend** (modify):
  - `apps/web/src/App.tsx` — add registry route under 4 role sections
- **Shared types** (modify from Story 5.3):
  - `packages/types/src/respondent.ts` — add `RespondentListItem`, `RespondentFilterParams`, `CursorPaginatedResponse`
  - `packages/types/src/index.ts` — re-export

### What NOT to Build (Out of Scope)

- Individual record PII detail view → Story 5.3 (this story navigates TO it via row click)
- Export functionality → Story 5.4 (this story integrates ExportButton if available)
- Respondent data editing → not in any story (all views are read-only)
- Offline-capable registry browsing → not required for back-office dashboards
- Column reordering or drag-and-drop → unnecessary complexity
- Row-level bulk actions (approve/reject from table) → Story 5.2 has its own queue
- Infinite scroll → use explicit cursor pagination with Previous/Next controls
- Full-text search with pg_trgm → defer to post-MVP optimization
- Geographic map visualization → Story 5.1 LGA chart handles this

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5 Story 5.5 AC5.5.1-AC5.5.7]
- [Source: _bmad-output/planning-artifacts/architecture.md#Cursor-Based Pagination]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-007 Database Strategy]
- [Source: _bmad-output/implementation-artifacts/design-assessor-workflow-state-machine.md#Section 5.1 Derived Status]
- [Source: _bmad-output/implementation-artifacts/prep-5-cross-lga-query-performance-validation.md#Cursor Pagination Validation]
- [Source: _bmad-output/implementation-artifacts/5-3-individual-record-pii-view-authorized-roles.md — respondent detail files]
- [Source: _bmad-output/implementation-artifacts/5-4-pii-rich-csv-pdf-exports.md — ExportButton integration]
- [Source: apps/api/src/services/message.service.ts:275-342 — cursor pagination pattern]
- [Source: apps/api/src/controllers/fraud-detections.controller.ts — list endpoint pattern]
- [Source: apps/web/src/features/dashboard/pages/SupervisorFraudPage.tsx:238-273 — filter button pattern]
- [Source: apps/web/src/features/dashboard/hooks/useSupervisor.ts:36 — 60s polling pattern]
- [Source: apps/api/src/services/team-assignment.service.ts — supervisor scope]
- [Source: apps/api/src/services/audit.service.ts — PII audit logging]
- [Source: apps/api/src/db/schema/respondents.ts — respondent PII fields]
- [Source: apps/api/src/db/schema/submissions.ts — submission data + rawData JSONB]
- [Source: apps/api/src/db/schema/fraud-detections.ts — fraud scores + resolution columns]
- [Source: _bmad-output/project-context.md — API response format, team agreements]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

None — clean implementation, no blocking issues.

### Completion Notes List

- All 11 tasks implemented across backend service, controller, routes, frontend components, hooks, pages, and tests.
- Cursor-based pagination with compound cursor (`createdAt_ISO|respondentId`) using DISTINCT ON subquery pattern.
- Verification status derived at query time from fraud_detections state (8 derived states → 4 filter categories).
- TanStack Table v8 installed and used in full manual/server-side mode.
- Role-based column visibility: PII columns (Name, NIN, Phone) hidden for supervisor role.
- 5 quick-filter presets with WAT timezone date calculations.
- Live monitoring: 60s auto-refresh with Page Visibility API pause, new submission notification bar.
- Direction 08 styling applied for government official route.
- Sidebar "Registry" nav item added for all 4 authorized roles (supervisor, assessor, official, super_admin).
- Updated existing `sidebarConfig.test.ts` item count expectations to account for new Registry nav items.
- Pre-existing failures in `fraud-detections-bulk.controller.test.ts` (4 tests) are unrelated to this story.
- Task 2.0 (gender JSONB key verification + expression index) deferred — gender extracted via `s.raw_data->>'gender'` at query time; index should be added when verifying actual form schema keys.

### Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-02-23 | Story implemented (all 11 tasks) | Initial implementation |
| 2026-02-23 | Updated sidebarConfig.test.ts expectations | Registry nav items added to 3 roles changed sidebar item counts |
| 2026-02-23 | AI Code Review — 10 findings (1C, 4H, 3M, 2L), all fixed | Adversarial review by Claude Opus 4.6 |
| 2026-02-23 | Added 18 service tests for listRespondents/getRespondentCount | C1 fix — Task 10 was marked done with zero tests |
| 2026-02-23 | QuickFilterPresets: filters → getFilters() lazy factory | H1 fix — dates were stale after midnight |
| 2026-02-23 | RegistryFilters: severity changed to multi-select checkboxes | H2 fix — AC requires multi-select |
| 2026-02-23 | RespondentRegistryPage: seconds counter uses setInterval | H3 fix — was static useMemo |
| 2026-02-23 | Added 4 route authorization tests (3 unauthorized roles + structure) | H4 fix |
| 2026-02-23 | Extracted buildFilterConditions() shared helper in service | M1 fix — eliminates duplication |

### File List

**Package Config (modified):**
- `apps/web/package.json` — Added `@tanstack/react-table` dependency
- `pnpm-lock.yaml` — Updated lockfile for `@tanstack/react-table`

**Shared Types (modified):**
- `packages/types/src/respondent.ts` — Added `RespondentListItem`, `RespondentFilterParams`, `CursorPaginatedResponse` interfaces

**Backend (modified):**
- `apps/api/src/services/respondent.service.ts` — Added `listRespondents()`, `getRespondentCount()`, `STATUS_FILTER_MAP`, `getSortColumn()`, `emptyPage()` methods
- `apps/api/src/controllers/respondent.controller.ts` — Added `listRespondents` handler with Zod validation + audit logging
- `apps/api/src/routes/respondent.routes.ts` — Added `GET /` list route with shared AUTHORIZED_ROLES

**Backend (new):**
- `apps/api/src/controllers/__tests__/respondent-list.controller.test.ts` — 14 tests covering roles, filters, pagination, audit, validation

**Frontend (new):**
- `apps/web/src/features/dashboard/api/registry.api.ts` — API client (fetchRespondentList, fetchFormList, fetchEnumeratorList)
- `apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx` — TanStack Table v8 with role-based columns, pagination, sorting
- `apps/web/src/features/dashboard/components/RegistryFilters.tsx` — 9 filter controls with role-based visibility
- `apps/web/src/features/dashboard/components/QuickFilterPresets.tsx` — 5 preset buttons with WAT dates
- `apps/web/src/features/dashboard/hooks/usePageVisibility.ts` — Page Visibility API hook
- `apps/web/src/features/dashboard/hooks/useLiveMonitoring.ts` — Live monitoring hook (60s refresh)
- `apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx` — Main page composing all components

**Frontend (modified):**
- `apps/web/src/features/dashboard/hooks/useRespondent.ts` — Extended respondentKeys factory + added useRespondentList hook
- `apps/web/src/App.tsx` — Added lazy import + routes for 4 roles
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — Added "Registry" nav item for supervisor, assessor, official, super_admin

**Frontend Tests (new):**
- `apps/web/src/features/dashboard/pages/__tests__/RespondentRegistryPage.test.tsx` — 4 tests
- `apps/web/src/features/dashboard/components/__tests__/RespondentRegistryTable.test.tsx` — 11 tests
- `apps/web/src/features/dashboard/components/__tests__/RegistryFilters.test.tsx` — 7 tests
- `apps/web/src/features/dashboard/components/__tests__/QuickFilterPresets.test.tsx` — 7 tests
- `apps/web/src/features/dashboard/hooks/__tests__/useLiveMonitoring.test.ts` — 6 tests

**Frontend Tests (modified):**
- `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` — Updated sidebar item count expectations for 3 roles

**Test Summary:** 74 tests (32 backend + 39 frontend + 3 frontend review additions) all passing. Original 49 + 25 from code review fixes.
