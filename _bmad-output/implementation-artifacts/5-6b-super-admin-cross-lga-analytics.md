# Story 5.6b: Super Admin Cross-LGA Analytics & Government Official View

Status: done

## Story

As a Super Admin,
I want a cross-LGA staff productivity dashboard with individual staff tracking, LGA comparison, and supervisorless LGA monitoring,
so that I can hold all teams accountable, identify systemic issues, and manage LGAs without on-ground supervisors.

As a Government Official,
I want a read-only LGA-level productivity summary (no individual staff names),
so that I can track field operation progress without accessing personal staff data.

## Acceptance Criteria

1. **Given** role authorization, **when** accessing cross-LGA productivity views, **then**:
   - Super Admin: sees Individual Staff Tab (all LGAs, all field roles, staff names visible) + LGA Comparison Tab. Can export CSV/PDF.
   - Government Official: sees LGA Aggregate Summary only. No individual staff names, no export.
   - Supervisors use their own view from Story 5.6a (no access to cross-LGA data).
   - All other roles (Assessor, Clerk, Enumerator, Public) receive 403.

2. **Given** the Super Admin "Staff Performance" tab, **when** active, **then** display 15 columns:
   - Staff Name, Role (Enumerator/Clerk/Supervisor), LGA, Supervisor (assigned name or "— Direct"), Today, Target, %, Status, Trend, This Week, This Month, Approved, Rej. Rate, Days Active, Last Active
   - **Supervisor rows**: Today/Week/Month show **submissions reviewed** (approved + rejected), not collected. Target = sum of team member targets.

3. **Given** the Super Admin "LGA Comparison" tab, **when** active, **then** display 12 columns:
   - LGA, Staffing Model ("Full (1+N)" / "Lean (1+N)" / "No Supervisor (N)"), Enumerator Count, Supervisor (name or "— Super Admin"), Today Total, LGA Target, %, Avg/Enumerator, Best Performer, Lowest Performer, Rej. Rate, Trend
   - Supervisorless LGAs visually highlighted (amber background + "No Supervisor" badge).
   - Comparison mode: checkbox selection of 2+ LGAs shows side-by-side comparison card.

4. **Given** a Government Official accessing productivity, **when** the page loads, **then** display aggregate-only table with 10 columns:
   - LGA, Active Staff, Today Total, Daily Target, %, This Week, Week Avg/Day, This Month, Completion Rate, Trend
   - **No** individual staff names, no staff-level rows. **No** export button. **No** staffing model column.

5. **Given** filter and sort controls, **then**:
   - **Super Admin (both tabs)**: Time range picker (Today/Week/Month/Custom), LGA multi-select, Role filter (Staff tab), Supervisor filter (Staff tab), Staffing model filter (LGA tab), Status filter (Staff tab), sort by any column, free text search, summary row.
   - **Government Official**: Time range picker, LGA dropdown, sort by any column.

6. **Given** the export button on Super Admin's view, **when** clicked, **then**:
   - CSV/PDF via ExportService. Filenames: `oslsr-productivity-{tab}-{date}.{ext}`
   - Export respects active filters and sort. Audit-logged.
   - Government Official has NO export button.

7. **Given** an LGA with no assigned Supervisor, **when** submissions are made, **then**:
   - Productivity table marks these LGAs as "No Supervisor — Super Admin" in the Supervisor column.
   - Super Admin can filter to show only supervisorless LGAs.
   - This is a monitoring model — no new workflow. Existing fraud review and verification tools handle review.

8. **Given** the API endpoints, **then** extend the 5.6a foundation:
   - `GET /api/v1/productivity/staff` — Super Admin only: all staff across all LGAs
   - `GET /api/v1/productivity/lga-comparison` — Super Admin only: LGA-level aggregated data
   - `GET /api/v1/productivity/lga-summary` — Government Official + Super Admin: aggregate-only (no names)

9. **Given** technical requirements, **then**:
   - Builds on 5.6a's daily snapshot table — no duplicate infrastructure.
   - LGA comparison queries use `GROUP BY lga_id` on snapshots + live data for today.
   - Staffing model inferred at query time via `EXISTS` subquery on users table.
   - Supervisor review throughput: count `fraud_detections` where `reviewedBy = supervisorId`.
   - TanStack Table with tab switching for Super Admin (Tabs component from shadcn/ui).
   - Government Official view is a separate route/component with its own API endpoint.
   - All views respect existing RBAC middleware.

## Tasks / Subtasks

- [x] Task 1: Extend shared productivity types (AC: #1, #2, #3, #4, #8)
  - [x] 1.1 Add to `packages/types/src/productivity.ts` (created by Story 5.6a):
    ```ts
    // Super Admin all-staff row (extends StaffProductivityRow)
    export interface StaffProductivityRowExtended extends StaffProductivityRow {
      role: 'enumerator' | 'data_entry_clerk' | 'supervisor';
      lgaId: string;
      lgaName: string;
      supervisorName: string | null;  // null = supervisorless LGA → display "— Direct"
    }

    // LGA Comparison row (Super Admin)
    export interface LgaProductivityRow {
      lgaId: string;
      lgaName: string;
      staffingModel: string;  // "Full (1+5)", "Lean (1+1)", "No Supervisor (3)"
      hasSupervisor: boolean;
      enumeratorCount: number;
      supervisorName: string | null;
      todayTotal: number;
      lgaTarget: number;
      percent: number;
      avgPerEnumerator: number;
      bestPerformer: { name: string; count: number } | null;
      lowestPerformer: { name: string; count: number } | null;
      rejRate: number;
      trend: 'up' | 'down' | 'flat';
    }

    // Government Official aggregate row (no names)
    export interface LgaAggregateSummaryRow {
      lgaId: string;
      lgaName: string;
      activeStaff: number;
      todayTotal: number;
      dailyTarget: number;
      percent: number;
      weekTotal: number;
      weekAvgPerDay: number;
      monthTotal: number;
      completionRate: number;  // month total / month target
      trend: 'up' | 'down' | 'flat';
    }

    export interface CrossLgaFilterParams {
      period: 'today' | 'week' | 'month' | 'custom';
      dateFrom?: string;
      dateTo?: string;
      lgaIds?: string[];        // Multi-select LGA filter
      roleId?: string;          // Filter by role (Staff tab)
      supervisorId?: string;    // Filter by supervisor (Staff tab)
      staffingModel?: string;   // Filter: 'full' | 'lean' | 'no_supervisor' (LGA tab)
      status?: string;
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    }
    ```
  - [x] 1.2 Re-export new types from `packages/types/src/index.ts`

- [x] Task 2: Backend — Extend productivity service with cross-LGA methods (AC: #2, #3, #4, #7, #9)
  - [x] 2.1 Add to `apps/api/src/services/productivity.service.ts` (created by 5.6a):
    - `getAllStaffProductivity(filters: CrossLgaFilterParams)`:
      1. No team scope restriction (Super Admin sees all)
      2. Query all active users with roles: `enumerator`, `data_entry_clerk`, `supervisor`
      3. JOIN `users` → `roles` for role name, `users` → `lgas` for LGA name
      4. LEFT JOIN `team_assignments` to find each user's supervisor name
      5. For enumerators/clerks: use same live/snapshot query pattern as `getTeamProductivity()`
      6. **For supervisors**: count `fraud_detections` where `reviewed_by = supervisorId` instead of submissions. Target = sum of team members' individual targets.
      7. Apply filters (lgaIds, roleId, supervisorId, status, search)
      8. Apply sorting and offset pagination
      9. Return `StaffProductivityRowExtended[]` with summary
    - `getLgaComparison(filters: CrossLgaFilterParams)`:
      1. GROUP BY `lga_id` to aggregate per-LGA statistics
      2. For each LGA: total submissions, enumerator count, avg/enumerator, best/lowest performer (name + count)
      3. **Staffing model inference** at query time:
         ```sql
         -- Count active supervisors per LGA
         SELECT l.id, l.name,
           COUNT(u.id) FILTER (WHERE r.name = 'supervisor' AND u.status IN ('active','verified')) as supervisor_count,
           COUNT(u.id) FILTER (WHERE r.name IN ('enumerator','data_entry_clerk') AND u.status IN ('active','verified')) as field_staff_count
         FROM lgas l
         LEFT JOIN users u ON u.lga_id = l.id
         LEFT JOIN roles r ON r.id = u.role_id
         GROUP BY l.id, l.name
         ```
         - `supervisor_count > 0 && field_staff_count >= 3` → "Full (1+N)"
         - `supervisor_count > 0 && field_staff_count < 3` → "Lean (1+N)"
         - `supervisor_count === 0` → "No Supervisor (N)"
      4. Supervisorless LGA detection: `hasSupervisor = supervisor_count > 0`
      5. Apply filters (staffingModel, lgaIds) and sorting
      6. Return `LgaProductivityRow[]` with summary
    - `getLgaSummary(filters)`:
      1. Same GROUP BY lga_id pattern as `getLgaComparison`
      2. Returns **only** aggregate numbers — no staff names, no best/lowest performer
      3. Includes: activeStaff count, todayTotal, dailyTarget, percent, weekTotal, weekAvgPerDay, monthTotal, completionRate, trend
      4. Return `LgaAggregateSummaryRow[]` with summary
  - [x] 2.2 Add helper `getSupervisorReviewThroughput(supervisorId, dateFrom, dateTo)`:
    ```ts
    // Count fraud_detections reviewed by this supervisor in the date range
    const reviewCount = await db.select({
      total: sql<number>`COUNT(*)`,
      approved: sql<number>`COUNT(*) FILTER (WHERE ${fraudDetections.resolution} IN ('false_positive', 'dismissed'))`,
      rejected: sql<number>`COUNT(*) FILTER (WHERE ${fraudDetections.resolution} = 'confirmed_fraud')`,
    })
    .from(fraudDetections)
    .where(and(
      eq(fraudDetections.reviewedBy, supervisorId),
      gte(fraudDetections.reviewedAt, dateFrom),
      lte(fraudDetections.reviewedAt, dateTo),
    ));
    ```
  - [x] 2.3 **Critical**: `submissions.submitterId` is `text` not `uuid`. Cross-LGA joins that GROUP BY lga need:
    ```ts
    // JOIN through users to get lgaId
    .leftJoin(users, sql`${submissions.submitterId}::uuid = ${users.id}`)
    ```
    Alternatively, use `daily_productivity_snapshots` (5.6a) which stores `lgaId` directly — prefer snapshots for historical, live query for today.

- [x] Task 3: Backend — Add cross-LGA controller handlers and routes (AC: #1, #8)
  - [x] 3.1 Add handlers to `apps/api/src/controllers/productivity.controller.ts` (created by 5.6a):
    - `getAllStaffProductivity`:
      1. Validate query params via Zod (extends `productivityQuerySchema` with lgaIds, roleId, supervisorId)
      2. Call `ProductivityService.getAllStaffProductivity(filters)`
      3. Audit log: `AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_PRODUCTIVITY, 'cross_lga_staff_productivity', null, { filters, resultCount })`
      4. Return paginated response with summary
    - `getLgaComparison`:
      1. Validate query params
      2. Call `ProductivityService.getLgaComparison(filters)`
      3. Audit log: `AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_PRODUCTIVITY, 'lga_comparison', null, { filters, resultCount })`
      4. Return response with summary
    - `getLgaSummary`:
      1. Validate query params (simpler — no role/supervisor/staffing filters)
      2. Call `ProductivityService.getLgaSummary(filters)`
      3. Audit log: `AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_PRODUCTIVITY, 'lga_aggregate_summary', null, { filters, resultCount })`
      4. Return response with summary
  - [x] 3.2 Add Zod validation schemas:
    ```ts
    const crossLgaQuerySchema = z.object({
      period: z.enum(['today', 'week', 'month', 'custom']).default('today'),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      lgaIds: z.string().optional().transform(v => v?.split(',').filter(Boolean)),  // Comma-separated
      roleId: z.string().optional(),
      supervisorId: z.string().optional(),
      staffingModel: z.enum(['all', 'full', 'lean', 'no_supervisor']).default('all'),
      status: z.enum(['all', 'complete', 'on_track', 'behind', 'inactive']).default('all'),
      search: z.string().max(100).optional(),
      sortBy: z.string().default('fullName'),
      sortOrder: z.enum(['asc', 'desc']).default('asc'),
      page: z.coerce.number().min(1).default(1),
      pageSize: z.coerce.number().min(1).max(100).default(50),
    });

    const lgaSummaryQuerySchema = z.object({
      period: z.enum(['today', 'week', 'month', 'custom']).default('today'),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      lgaId: z.string().optional(),
      sortBy: z.string().default('lgaName'),
      sortOrder: z.enum(['asc', 'desc']).default('asc'),
    });
    ```
  - [x] 3.3 Add routes to `apps/api/src/routes/productivity.routes.ts` (created by 5.6a):
    ```ts
    // Super Admin cross-LGA endpoints
    router.get('/staff', authorize(UserRole.SUPER_ADMIN), controller.getAllStaffProductivity);
    router.get('/lga-comparison', authorize(UserRole.SUPER_ADMIN), controller.getLgaComparison);

    // Government Official aggregate endpoint (Super Admin can also access)
    router.get('/lga-summary', authorize(UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPER_ADMIN), controller.getLgaSummary);
    ```

- [x] Task 4: Backend — Cross-LGA export endpoint (AC: #6)
  - [x] 4.1 Add `exportCrossLgaData` handler to `productivity.controller.ts`:
    1. Parse `format` (csv/pdf), `tab` (staff/lga-comparison), and `filters` from body
    2. If `tab === 'staff'`: call `ProductivityService.getAllStaffProductivity(filters)` (no pagination limit)
    3. If `tab === 'lga-comparison'`: call `ProductivityService.getLgaComparison(filters)` (no pagination limit)
    4. Audit log: `AuditService.logPiiAccess(req, PII_ACTIONS.EXPORT_PRODUCTIVITY, 'cross_lga_export', null, { tab, format, filters, recordCount })`
    5. Define export columns per tab:
       - Staff tab: 15 columns (Staff Name through Last Active + Role + LGA + Supervisor)
       - LGA Comparison tab: 12 columns (LGA through Trend)
    6. Route by format: CSV via `ExportService.generateCsvExport()`, PDF via `ExportService.generatePdfReport()`
    7. Response: `Content-Disposition: attachment; filename="oslsr-productivity-{tab}-{date}.{ext}"`
  - [x] 4.2 Add route: `POST /api/v1/productivity/cross-lga-export` — `authorize(UserRole.SUPER_ADMIN)` only
  - [x] 4.3 Apply export rate limit (reuse from Story 5.4/5.6a)

- [x] Task 5: Frontend — Extend API client and hooks (AC: #2, #3, #4, #5)
  - [x] 5.1 Add to `apps/web/src/features/dashboard/api/productivity.api.ts` (created by 5.6a):
    ```ts
    export function fetchAllStaffProductivity(params: CrossLgaFilterParams) {
      const searchParams = new URLSearchParams();
      // ... serialize params (lgaIds as comma-separated)
      return apiClient(`/productivity/staff?${searchParams}`);
    }

    export function fetchLgaComparison(params: CrossLgaFilterParams) {
      return apiClient(`/productivity/lga-comparison?${new URLSearchParams(...)}`);
    }

    export function fetchLgaSummary(params: { period: string; dateFrom?: string; dateTo?: string; lgaId?: string; sortBy?: string; sortOrder?: string }) {
      return apiClient(`/productivity/lga-summary?${new URLSearchParams(...)}`);
    }

    export function downloadCrossLgaExport(tab: 'staff' | 'lga-comparison', filters: CrossLgaFilterParams, format: 'csv' | 'pdf') {
      // Blob download pattern from downloadStaffIdCard
      return fetch(`/api/v1/productivity/cross-lga-export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ tab, filters, format }),
      }).then(res => res.blob());
    }
    ```
  - [x] 5.2 Add to `apps/web/src/features/dashboard/hooks/useProductivity.ts` (created by 5.6a):
    ```ts
    // Extend existing productivityKeys
    export const productivityKeys = {
      ...existingKeys,
      allStaff: (params: CrossLgaFilterParams) => [...productivityKeys.all, 'allStaff', params] as const,
      lgaComparison: (params: CrossLgaFilterParams) => [...productivityKeys.all, 'lgaComparison', params] as const,
      lgaSummary: (params: Record<string, unknown>) => [...productivityKeys.all, 'lgaSummary', params] as const,
    };

    export function useAllStaffProductivity(params: CrossLgaFilterParams) {
      return useQuery({
        queryKey: productivityKeys.allStaff(params),
        queryFn: () => fetchAllStaffProductivity(params),
        staleTime: 30_000,
        refetchInterval: params.period === 'today' ? 60_000 : false,
      });
    }

    export function useLgaComparison(params: CrossLgaFilterParams) {
      return useQuery({
        queryKey: productivityKeys.lgaComparison(params),
        queryFn: () => fetchLgaComparison(params),
        staleTime: 30_000,
        refetchInterval: params.period === 'today' ? 60_000 : false,
      });
    }

    export function useLgaSummary(params: Record<string, unknown>) {
      return useQuery({
        queryKey: productivityKeys.lgaSummary(params),
        queryFn: () => fetchLgaSummary(params),
        staleTime: 30_000,
        refetchInterval: params.period === 'today' ? 60_000 : false,
      });
    }
    ```

- [x] Task 6: Frontend — CrossLgaStaffTable + LgaMultiSelect components (AC: #2, #5)
  - [x] 6.0 Extend `apps/web/src/components/ui/dropdown-menu.tsx` — add `DropdownMenuCheckboxItem` re-export from `@radix-ui/react-dropdown-menu` (already installed as a dependency). The existing file exports `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator` but **not** the `CheckboxItem` variant. Add:
    ```tsx
    const DropdownMenuCheckboxItem = React.forwardRef<
      React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
      React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
    >(({ className, children, checked, ...props }, ref) => (
      <DropdownMenuPrimitive.CheckboxItem ref={ref} className={cn("...", className)} checked={checked} {...props}>
        <span className="..."><DropdownMenuPrimitive.ItemIndicator><Check className="h-4 w-4" /></DropdownMenuPrimitive.ItemIndicator></span>
        {children}
      </DropdownMenuPrimitive.CheckboxItem>
    ));
    ```
    Export it alongside existing exports. This is a standard shadcn/ui addition.
  - [x] 6.1 Create `apps/web/src/features/dashboard/components/CrossLgaStaffTable.tsx`:
    - TanStack Table in server-side mode (from Story 5.5, reused by 5.6a)
    - **15 column definitions**:
      1. Staff Name (text)
      2. Role (badge: Enumerator/Clerk/Supervisor)
      3. LGA (text)
      4. Supervisor (text, or "— Direct" if null + amber text for supervisorless)
      5-15. Same 11 productivity columns as 5.6a's `ProductivityTable`: Today, Target, %, Status, Trend, This Week, This Month, Approved, Rej. Rate, Days Active, Last Active
    - **Supervisor productivity rows**: Visually distinct (different row background or "Reviews" label on Today/Week/Month cells)
    - **Reuse** status badges (Complete/On Track/Behind/Inactive) and trend arrows (↑↓→) from 5.6a's `ProductivityTable`
    - **Summary row** at bottom: totals and averages across all visible staff
    - **Pagination** controls (offset-based)
    - **Sort** indicators on all column headers
  - [x] 6.2 Create LGA multi-select filter component (`LgaMultiSelect.tsx`):
    - Use `DropdownMenu` + `DropdownMenuCheckboxItem` (from Task 6.0) from shadcn/ui
    - Shows selected count: "3 LGAs selected" or "All LGAs"
    - Clear selection button
    - Searchable LGA list within dropdown
    - Fetch LGA list from existing `GET /api/v1/admin/lgas` endpoint

- [x] Task 7: Frontend — LgaComparisonTable + ComparisonCard (AC: #3, #7)
  - [x] 7.1 Create `apps/web/src/features/dashboard/components/LgaComparisonTable.tsx`:
    - TanStack Table in server-side mode
    - **12 column definitions** from AC5.6b.3
    - **Checkbox column** (first column) for comparison mode selection
    - **Supervisorless LGA highlighting**: Rows where `hasSupervisor === false` get `bg-amber-50` background + amber "No Supervisor" badge
    - **Staffing model display**: "Full (1+5)", "Lean (1+1)", "No Supervisor (3)" with color-coded badge
    - **Best/Lowest performer**: Inline name + count (e.g., "Adamu O. (32)")
    - **Summary row** at bottom
    - **Sort** indicators on all column headers
    - **Staffing model filter**: Dropdown (All, Full, Lean, No Supervisor)
    - **Supervisorless filter**: Quick toggle "Show supervisorless only"
  - [x] 7.2 Create `apps/web/src/features/dashboard/components/LgaComparisonCard.tsx`:
    - Appears when 2+ LGAs are checkbox-selected in the table
    - **Floating card** below the filter row (or above the table)
    - **Side-by-side layout**: Shows selected LGAs' key metrics in columns:
      - LGA Name, Staffing Model, Today Total, Target, %, Avg/Enumerator, Rej. Rate, Trend
    - **Visual comparison**: Progress bars for % completion, color-coded metrics
    - **Clear selection** button to dismiss the card
    - Max 5 LGAs in comparison (prevent UI overflow)

- [x] Task 8: Frontend — SuperAdminProductivityPage with tabs (AC: #2, #3, #5, #6)
  - [x] 8.1 Create `apps/web/src/features/dashboard/pages/SuperAdminProductivityPage.tsx`:
    - **Page header**: "Staff Productivity Analytics" with refresh button + last updated timestamp
    - **Tabs** using `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `apps/web/src/components/ui/tabs.tsx`:
      ```tsx
      <Tabs defaultValue="staff" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="staff">Staff Performance</TabsTrigger>
          <TabsTrigger value="lga-comparison">LGA Comparison</TabsTrigger>
        </TabsList>
        <TabsContent value="staff">
          {/* Filter controls + CrossLgaStaffTable (Task 6) + Export */}
        </TabsContent>
        <TabsContent value="lga-comparison">
          {/* Filter controls + LgaComparisonTable + ComparisonCard (Task 7) + Export */}
        </TabsContent>
      </Tabs>
      ```
    - **Staff Performance tab filters**: Time range picker, LGA multi-select (Task 6 `LgaMultiSelect`), Role dropdown, Supervisor dropdown, Status filter, text search
    - **LGA Comparison tab filters**: Time range picker, Staffing model filter (All/Full/Lean/No Supervisor), LGA multi-select (for pre-filtering), text search
    - **Export panel** on both tabs: Export CSV / Export PDF buttons (using `downloadCrossLgaExport`)
    - **Summary strip** above table: Total staff / Total submissions / Avg per staff / Supervisorless LGA count
    - **Skeleton loading** matching tab + table shape (A2)
    - **Empty state**: "No staff data available for the selected filters."
  - [x] 8.2 Add lazy import in `apps/web/src/App.tsx`:
    ```ts
    const SuperAdminProductivityPage = lazy(() => import('./features/dashboard/pages/SuperAdminProductivityPage'));
    ```
    Add route under Super Admin routes: `<Route path="productivity" element={<Suspense ...><SuperAdminProductivityPage /></Suspense>} />`
  - [x] 8.3 Add sidebar link in `apps/web/src/features/dashboard/config/sidebarConfig.ts`:
    ```ts
    // Add to super_admin array (after 'Reports' entry):
    { label: 'Staff Productivity', href: '/dashboard/super-admin/productivity', icon: BarChart3 }
    ```
    Import `BarChart3` from lucide-react (or reuse `BarChart` which is already imported at line 24).

- [x] Task 9: Frontend — OfficialProductivityPage (AC: #4, #5)
  - [x] 9.1 Create `apps/web/src/features/dashboard/pages/OfficialProductivityPage.tsx`:
    - **Direction 08 styling**: `bg-gray-800` header, `border-l-4 border-[#9C1E23]` section headers (match `OfficialHome.tsx` pattern)
    - **Page header**: "LGA Productivity Overview"
    - **10-column table** from AC5.6b.4: LGA, Active Staff, Today Total, Daily Target, %, This Week, Week Avg/Day, This Month, Completion Rate, Trend
    - **NO individual staff names** — only LGA-level aggregates
    - **NO export button** — read-only view
    - **Filter controls**: Time range picker (Today/Week/Month/Custom), LGA dropdown (single-select), sort by any column
    - **Summary strip**: Total LGAs, Total active staff, Overall completion rate, Total submissions today
    - **Skeleton loading** matching table shape (A2)
    - **Empty state**: "No productivity data available for the selected period."
    - Uses `useLgaSummary` hook for data fetching (60s auto-refresh for "today")
  - [x] 9.2 Add lazy import in `apps/web/src/App.tsx`:
    ```ts
    const OfficialProductivityPage = lazy(() => import('./features/dashboard/pages/OfficialProductivityPage'));
    ```
    Add route under Government Official routes: `<Route path="productivity" element={<Suspense ...><OfficialProductivityPage /></Suspense>} />`
  - [x] 9.3 Add sidebar link in `sidebarConfig.ts`:
    ```ts
    // Add to government_official array (after 'Home'):
    { label: 'Productivity', href: '/dashboard/official/productivity', icon: BarChart }
    ```

- [x] Task 10: Backend tests (AC: #1, #2, #3, #4, #7, #8)
  - [x] 10.1 Add to `apps/api/src/services/__tests__/productivity.service.test.ts` (extend from 5.6a):
    - `getAllStaffProductivity` returns all staff across all LGAs (10+ tests):
      - Includes enumerators, clerks, and supervisors
      - Supervisor rows show review throughput, not submission count
      - LGA filter works (single and multi)
      - Role filter works
      - Supervisor filter works
      - Status filter works
      - Search by name works
      - Pagination correct
      - Summary totals correct
      - Empty result for no matching filters
    - `getLgaComparison` returns per-LGA aggregates (8+ tests):
      - All 33 LGAs included (or only populated ones)
      - Staffing model inferred correctly (Full/Lean/No Supervisor)
      - Supervisorless LGAs correctly identified
      - Best/lowest performer names returned
      - Staffing model filter works
      - Summary row correct
      - Sort by any column
      - LGA filter works
    - `getLgaSummary` returns aggregate-only data (5+ tests):
      - No staff names in response
      - Completion rate calculated correctly
      - Week avg/day calculated correctly
      - Period filter works
      - All LGAs included
  - [x] 10.2 Add to `apps/api/src/controllers/__tests__/productivity.controller.test.ts` (extend from 5.6a):
    - `/staff` endpoint (8+ tests):
      - 200 for super_admin with all-staff data
      - 403 for supervisor, government_official, enumerator, clerk, assessor, public_user
      - Filters applied correctly
      - Pagination works
      - Audit log called
    - `/lga-comparison` endpoint (6+ tests):
      - 200 for super_admin
      - 403 for all other roles
      - Staffing model filter works
      - Sort order applied
      - Audit log called
    - `/lga-summary` endpoint (6+ tests):
      - 200 for government_official with aggregate-only data
      - 200 for super_admin
      - 403 for supervisor, enumerator, clerk, assessor, public_user
      - No staff names in response (verify response shape)
      - Audit log called
    - `/cross-lga-export` endpoint (5+ tests):
      - 200 for super_admin with correct Content-Type
      - 403 for government_official (no export!)
      - 403 for other roles
      - Correct filename in Content-Disposition
      - Audit log called

- [x] Task 11: Frontend tests (AC: #2, #3, #4, #5, #6)
  - [x] 11.1 Create `apps/web/src/features/dashboard/pages/__tests__/SuperAdminProductivityPage.test.tsx` (10+ tests):
    - Renders with tabs (Staff Performance + LGA Comparison)
    - Tab switching works
    - Staff tab shows 15-column table
    - LGA Comparison tab shows 12-column table
    - Time range picker switches period
    - LGA multi-select filter works
    - Export buttons trigger download
    - Supervisor rows show "Reviews" label
    - Summary strip shows correct totals
    - Skeleton loading state
    - Empty state for no data
  - [x] 11.2 Create `apps/web/src/features/dashboard/components/__tests__/LgaComparisonTable.test.tsx` (8+ tests):
    - All 12 columns render
    - Supervisorless LGAs have amber background
    - Staffing model badge renders correctly
    - Checkbox selection triggers comparison card
    - Comparison card shows selected LGAs side-by-side
    - Max 5 LGA selection enforced
    - Summary row renders
    - Sort header click triggers callback
  - [x] 11.3 Create `apps/web/src/features/dashboard/pages/__tests__/OfficialProductivityPage.test.tsx` (8+ tests):
    - Renders 10-column aggregate table
    - No staff names visible anywhere
    - No export button present
    - Time range picker works
    - LGA filter dropdown works
    - Summary strip shows aggregate totals
    - Skeleton loading state
    - Direction 08 styling applied (maroon border)

### Review Follow-ups (AI)

- [x] [AI-Review][CRITICAL] Dev Agent Record completely empty — fill File List, Completion Notes, Agent Model [story:814-825]
- [x] [AI-Review][CRITICAL] Missing Supervisor filter dropdown in Super Admin Staff tab (AC5 violation) [SuperAdminProductivityPage.tsx:247-283]
- [x] [AI-Review][HIGH] Backend service tests below story minimums — add ~8 missing tests [productivity.service.test.ts]
- [x] [AI-Review][HIGH] Controller tests missing 403 role-based rejection tests [productivity.controller.test.ts]
- [x] [AI-Review][MEDIUM] LGA list fetch bypasses TanStack Query pattern — use useQuery [SuperAdminProductivityPage.tsx:61-67]
- [x] [AI-Review][MEDIUM] Unused variable maxPercent in LgaComparisonCard.tsx:22
- [x] [AI-Review][LOW] useCallback with non-memoized object dependencies [SuperAdminProductivityPage.tsx:101-112]
- [x] [AI-Review][LOW] sortBy Zod schemas lack z.enum() validation [productivity.controller.ts:37,49]

## Dev Notes

### Architecture Compliance

- **API Pattern**: Extends existing productivity controller/service/routes from Story 5.6a. No new route files.
- **Route Registration**: New endpoints added to existing `productivity.routes.ts` from 5.6a.
- **Authorization**:
  - `authorize(UserRole.SUPER_ADMIN)` for `/staff`, `/lga-comparison`, `/cross-lga-export`
  - `authorize(UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPER_ADMIN)` for `/lga-summary`
- **No LGA Scope Restriction**: Both Super Admin and Government Official have `lgaId = null`. The `requireLgaLock()` middleware passes them through. Cross-LGA endpoints inherently have no scope restriction.
- **Audit Logging**: Use `AuditService.logPiiAccess()` with `PII_ACTIONS.VIEW_PRODUCTIVITY` for views and `PII_ACTIONS.EXPORT_PRODUCTIVITY` for exports (constants added by 5.6a Task 5.0). Staff productivity data contains names (operational PII).
- **Government Official Data Isolation**: Enforced at the API level — `/lga-summary` returns only aggregate numbers, never individual names. The frontend route and component are separate from Super Admin's view. Even if the Official's frontend were compromised, the API endpoint physically cannot return staff-level data.

### Supervisor Productivity Rows (AC5.6b.2 Special Logic)

Supervisors are measured differently from enumerators:

```ts
// In productivity.service.ts getAllStaffProductivity():
if (user.roleName === 'supervisor') {
  // Count reviews instead of submissions
  const reviewCounts = await getSupervisorReviewThroughput(user.id, dateFrom, dateTo);
  row.todayCount = reviewCounts.today;    // fraud_detections reviewed today
  row.weekCount = reviewCounts.week;       // reviewed this week
  row.monthCount = reviewCounts.month;     // reviewed this month
  row.approvedCount = reviewCounts.approved;
  row.rejectedCount = reviewCounts.rejected;

  // Target = sum of team members' targets
  const teamMemberIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(user.id);
  row.target = teamMemberIds.length * getTargetForLga(user.lgaId);
} else {
  // Standard enumerator/clerk: count submissions (same as 5.6a)
}
```

The `fraud_detections.reviewedBy` column (UUID FK to users.id) tracks who reviewed each detection. Count rows where `reviewedBy = supervisorId` AND `reviewedAt` falls within the date range.

### Staffing Model Inference (AC5.6b.3)

Derived at query time from actual user assignments — no configuration needed:

```ts
function inferStaffingModel(supervisorCount: number, fieldStaffCount: number): string {
  if (supervisorCount === 0) return `No Supervisor (${fieldStaffCount})`;
  if (fieldStaffCount >= 3) return `Full (${supervisorCount}+${fieldStaffCount})`;
  return `Lean (${supervisorCount}+${fieldStaffCount})`;
}
```

- "Full": Supervisor with 3+ field staff (healthy team size)
- "Lean": Supervisor with 1-2 field staff (may need attention)
- "No Supervisor": No active supervisor in LGA — Super Admin monitors directly

The model updates automatically when staff are added, removed, or roles changed (no separate configuration).

### Cross-LGA Query: `submissions.submitterId` is TEXT

**Critical**: The `submissions.submitterId` column is `text`, not `uuid`. When joining to `users.id` (which IS uuid), you must cast:

```ts
// Drizzle ORM join with type cast
.leftJoin(users, sql`${submissions.submitterId}::uuid = ${users.id}`)
```

For historical data, prefer `daily_productivity_snapshots` (from 5.6a) which stores `lgaId` directly as `text`, avoiding this join entirely. Only the "today" live query needs the `submissions → users` join.

### Comparison Mode (AC5.6b.3)

The comparison card is a custom component — no existing pattern:

```tsx
// In LgaComparisonTable: track selected LGAs
const [selectedLgaIds, setSelectedLgaIds] = useState<Set<string>>(new Set());

// Show comparison card when 2+ selected
{selectedLgaIds.size >= 2 && (
  <LgaComparisonCard
    lgaIds={[...selectedLgaIds]}
    data={lgaData.filter(r => selectedLgaIds.has(r.lgaId))}
    onClear={() => setSelectedLgaIds(new Set())}
  />
)}
```

Max 5 LGAs in comparison. The card appears between the filter row and the table.

### LGA Multi-Select Filter

No multi-select component exists. Build with `DropdownMenu` + checkboxes:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline">
      {selectedLgas.length === 0 ? 'All LGAs' : `${selectedLgas.length} LGAs`}
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent className="max-h-60 overflow-y-auto">
    {lgas.map(lga => (
      <DropdownMenuCheckboxItem
        key={lga.id}
        checked={selectedLgas.includes(lga.id)}
        onCheckedChange={(checked) => toggleLga(lga.id, checked)}
      >
        {lga.name}
      </DropdownMenuCheckboxItem>
    ))}
  </DropdownMenuContent>
</DropdownMenu>
```

Fetch LGA list from `GET /api/v1/admin/lgas`. For Government Official (who cannot access admin endpoints), the `/lga-summary` endpoint returns LGA names in the response data — extract unique LGAs from that.

### Government Official: Separate Everything

The Government Official view is fully isolated:
- **Separate API endpoint**: `GET /api/v1/productivity/lga-summary` — physically cannot return staff names
- **Separate frontend route**: `/dashboard/official/productivity`
- **Separate component**: `OfficialProductivityPage.tsx` — no export button, no staff table
- **No shared data fetching**: Uses `useLgaSummary` hook, not `useAllStaffProductivity`

This prevents accidental PII exposure through shared components or state.

### Direction 08 Styling for Official Pages

Follow `OfficialHome.tsx` pattern:

```tsx
// Dark header bar
<div className="bg-gray-800 text-white px-6 py-4 rounded-t-lg">
  <h1 className="text-xl font-semibold">LGA Productivity Overview</h1>
</div>

// Section headers with maroon border
<div className="border-l-4 border-[#9C1E23] pl-4 mb-4">
  <h2 className="text-lg font-semibold text-gray-800">Submission Activity</h2>
</div>

// Metric cards on gray background
<div className="bg-gray-50 rounded-lg p-4">...</div>
```

### Existing Code to Reuse — DO NOT Reinvent

| Component | Location | Reuse For |
|-----------|----------|-----------|
| `ProductivityService` | `apps/api/src/services/productivity.service.ts` (5.6a) | Foundation — extend with cross-LGA methods |
| `ProductivityController` | `apps/api/src/controllers/productivity.controller.ts` (5.6a) | Add new handlers |
| `productivity.routes.ts` | `apps/api/src/routes/productivity.routes.ts` (5.6a) | Add new routes |
| `ProductivityTable` | `apps/web/.../components/ProductivityTable.tsx` (5.6a) | Basis for CrossLgaStaffTable column defs |
| `useProductivity` hooks | `apps/web/.../hooks/useProductivity.ts` (5.6a) | Extend with cross-LGA hooks |
| `productivity.api.ts` | `apps/web/.../api/productivity.api.ts` (5.6a) | Extend with cross-LGA fetchers |
| `StaffProductivityRow` type | `packages/types/src/productivity.ts` (5.6a) | Extend for cross-LGA fields |
| `ExportService` | `apps/api/src/services/export.service.ts` | CSV + PDF generation |
| `AuditService` | `apps/api/src/services/audit.service.ts` | View + export audit logging |
| `TeamAssignmentService` | `apps/api/src/services/team-assignment.service.ts` | Supervisor → team mapping |
| `Tabs` component | `apps/web/src/components/ui/tabs.tsx` | Super Admin tab switching |
| `DropdownMenu` | `apps/web/src/components/ui/dropdown-menu.tsx` | LGA multi-select filter |
| `Badge` | `apps/web/src/components/ui/badge.tsx` | Status and staffing model badges |
| `Card` | `apps/web/src/components/ui/card.tsx` | Comparison card, summary strip |
| `Select` | `apps/web/src/components/ui/select.tsx` | Single-select filters |
| `SkeletonTable` | `apps/web/src/components/skeletons/` | Loading states |
| `OfficialHome.tsx` | `apps/web/.../pages/OfficialHome.tsx` | Direction 08 styling reference |
| `FraudSeverityBadge` pattern | `apps/web/.../components/FraudSeverityBadge.tsx` | Color-coded badge CONFIG pattern |
| `sidebarConfig.ts` | `apps/web/.../config/sidebarConfig.ts` | Add nav links for both roles |
| `useAuth` | `apps/web/src/features/auth/` | Get current user role |
| `downloadStaffIdCard` | `apps/web/src/features/staff/api/staff.api.ts` | Blob download pattern |
| `UUID_REGEX` | `apps/api/src/controllers/fraud-detections.controller.ts:26` | UUID validation |
| `AppError` | `packages/utils/src/errors.ts` | Structured errors |
| Offset pagination | `apps/api/src/controllers/fraud-detections.controller.ts:56-68` | Page/pageSize pattern |
| Zod query validation | `apps/api/src/controllers/productivity.controller.ts` (5.6a) | Extend schemas |

### Performance Considerations

- **Cross-LGA staff query**: All active staff (~200 total). Offset pagination is fine.
- **LGA comparison query**: 33 LGAs max. No pagination needed — return all in one response.
- **Government Official query**: Same 33 LGAs. Very small dataset.
- **Supervisor review throughput**: `fraud_detections.reviewedBy` + `reviewedAt` — add index if slow:
  ```sql
  CREATE INDEX idx_fraud_detections_reviewed_by ON fraud_detections (reviewed_by, reviewed_at);
  ```
  With ~200 supervisors and bounded fraud detections, this should be fast without index.
- **Historical queries**: Use `daily_productivity_snapshots` (5.6a) — avoids expensive live aggregation.
- **Staffing model inference**: Computed per-LGA at query time. 33 LGAs × simple COUNT query — negligible.
- **Auto-refresh**: 60s for "today" period (same as 5.6a's supervisor view).
- **Comparison card**: Client-side filtering of already-fetched data — no additional API call.

### Database Tables Used / Created

| Table | Status | Purpose |
|-------|--------|---------|
| `daily_productivity_snapshots` | From 5.6a | Historical daily counts for trend/comparison |
| `productivity_targets` | From 5.6a | Configurable daily targets |
| `submissions` | Existing | Live submission counts (today) |
| `fraud_detections` | Existing | Approved/rejected + supervisor review throughput |
| `users` | Existing | Staff details (fullName, roleId, lgaId, status) |
| `roles` | Existing | Role names for filtering |
| `lgas` | Existing | LGA names for grouping |
| `team_assignments` | Existing | Supervisor → enumerator mapping |
| `audit_logs` | Existing | Written to via AuditService |

**No new tables created by 5.6b** — all infrastructure comes from 5.6a.

### Dependencies and Warnings

- **Story 5.6a (MUST complete first)**: Creates ProductivityService, ProductivityController, routes, schemas, types, frontend components/hooks. Story 5.6b extends all of these. Cannot start 5.6b without 5.6a done.
- **Story 5.5 (TanStack Table)**: If `@tanstack/react-table` is installed by 5.5, use it. Otherwise, fall back to manual HTML tables.
- **Story 5.4 (ExportButton)**: If `ExportButton` component exists from 5.4, reuse. Otherwise, inline export buttons.
- **prep-2 (Audit Logging)**: `AuditService` is ready. Define new action metadata keys for cross-LGA views.
- **prep-3 (Export Infrastructure)**: `ExportService` is ready.
- **`fraud_detections.reviewedBy` index**: May need `CREATE INDEX idx_fd_reviewed_by ON fraud_detections(reviewed_by, reviewed_at)` if supervisor review throughput query is slow. Test first — current scale (~200 staff) likely doesn't need it.
- **Admin LGA list endpoint**: `GET /api/v1/admin/lgas` is `authorize(super_admin)` only. Government Official cannot call this. For Official's LGA dropdown, extract LGA names from the `/lga-summary` response instead.

### Previous Story Learnings

- **5.6a Foundation**: All productivity infrastructure (service, controller, routes, schemas, types, frontend) comes from 5.6a. Extend, don't duplicate.
- **Test WHERE clauses for scope** (Epic 4): Verify Super Admin sees ALL staff (no scope restriction). Verify Government Official sees ONLY aggregates (no names).
- **castScores() for numeric columns** (Story 4.4): If any numeric aggregates return as strings from Drizzle, parseFloat.
- **WAT timezone** (Story 4.1): All day/week/month boundaries use UTC+1.
- **A2: Skeleton must match content shape**: Tab + table skeleton for Super Admin. Table skeleton for Official.
- **A3: Test selectors only via data-testid**: No CSS class selectors.
- **A4: Task count limit**: 11 tasks (under 15 limit).
- **Queue/worker patterns** (Story 3.4): BullMQ infrastructure from 5.6a — no additional workers in 5.6b.
- **Direction 08 styling** (Story 5.1, OfficialHome): Official pages use dark header + maroon section borders.

### Testing Standards

- **Backend tests**: In `__tests__/` folders. Use `vi.hoisted()` + `vi.mock()` pattern.
- **Frontend tests**: Co-located as `.test.tsx`. Use `@testing-library/react` with `data-testid` selectors only.
- **Authorization tests**: Test role access for each endpoint:
  - `/staff`: Super Admin only (403 for all others including Government Official)
  - `/lga-comparison`: Super Admin only
  - `/lga-summary`: Government Official + Super Admin (403 for all others)
  - `/cross-lga-export`: Super Admin only (403 for Government Official!)
- **Data isolation tests**: Verify `/lga-summary` response contains NO `fullName`, `staffName`, or other PII fields.
- **Supervisor review throughput tests**: Verify supervisor rows count reviews, not submissions.
- **Comparison mode tests**: Verify checkbox selection, comparison card rendering, max 5 limit.
- **Supervisorless LGA tests**: Verify amber highlighting, staffing model badge, filter toggle.

### Project Structure Notes

- **Backend** (modify — all files created by 5.6a):
  - `apps/api/src/services/productivity.service.ts` — add cross-LGA methods
  - `apps/api/src/controllers/productivity.controller.ts` — add cross-LGA handlers
  - `apps/api/src/routes/productivity.routes.ts` — add cross-LGA routes
  - (test files extended in respective `__tests__/` folders)
- **Frontend** (new files):
  - `apps/web/src/features/dashboard/pages/SuperAdminProductivityPage.tsx`
  - `apps/web/src/features/dashboard/pages/OfficialProductivityPage.tsx`
  - `apps/web/src/features/dashboard/components/CrossLgaStaffTable.tsx`
  - `apps/web/src/features/dashboard/components/LgaComparisonTable.tsx`
  - `apps/web/src/features/dashboard/components/LgaComparisonCard.tsx`
  - `apps/web/src/features/dashboard/components/LgaMultiSelect.tsx`
  - (test files in respective `__tests__/` folders)
- **Frontend** (modify):
  - `apps/web/src/features/dashboard/api/productivity.api.ts` — add cross-LGA fetchers
  - `apps/web/src/features/dashboard/hooks/useProductivity.ts` — add cross-LGA hooks
  - `apps/web/src/App.tsx` — add Super Admin + Official productivity routes
  - `apps/web/src/features/dashboard/config/sidebarConfig.ts` — add nav links for both roles
- **Shared types** (modify):
  - `packages/types/src/productivity.ts` — add cross-LGA types
  - `packages/types/src/index.ts` — re-export

### What NOT to Build (Out of Scope)

- Supervisor team view → Story 5.6a (already handles supervisor's own team)
- Target editing UI → 5.6a provides the API; Super Admin settings page for targets is a potential future enhancement
- Individual staff drilldown page → not specified in any story
- Real-time WebSocket updates → use polling (60s `refetchInterval`) per existing pattern
- Alerts/notifications for supervisorless LGAs → not in any story
- Historical trend charts (line graphs over time) → could be future enhancement
- Staff ranking/leaderboard gamification → out of scope
- Productivity targets per role → all roles share the same per-LGA target

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.6b AC5.6b.1-AC5.6b.9]
- [Source: _bmad-output/implementation-artifacts/5-6a-supervisor-team-productivity-table.md — full 5.6a story for extension patterns]
- [Source: apps/web/src/components/ui/tabs.tsx — Tab switching component]
- [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts — sidebar link config]
- [Source: apps/web/src/App.tsx — route registration patterns]
- [Source: apps/web/src/features/dashboard/pages/OfficialHome.tsx — Direction 08 styling]
- [Source: apps/web/src/features/dashboard/components/FraudSeverityBadge.tsx — color-coded badge pattern]
- [Source: apps/api/src/db/schema/lgas.ts — LGA schema (33 LGAs)]
- [Source: apps/api/src/db/schema/submissions.ts — submitterId is TEXT, needs cast]
- [Source: apps/api/src/db/schema/fraud-detections.ts — reviewedBy column for supervisor throughput]
- [Source: apps/api/src/db/schema/team-assignments.ts — supervisor-enumerator mapping]
- [Source: apps/api/src/services/team-assignment.service.ts — supervisor scope enforcement]
- [Source: apps/api/src/services/export.service.ts — CSV/PDF generation]
- [Source: apps/api/src/services/audit.service.ts — PII access audit logging]
- [Source: apps/api/src/middleware/rbac.ts — authorize() + requireLgaLock() patterns]
- [Source: packages/types/src/constants.ts — UserRole enum, Lga enum]
- [Source: _bmad-output/project-context.md — WAT timezone, API format, team agreements, Direction 08]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

N/A — no persistent debug logs for this story.

### Completion Notes List

- All 11 tasks implemented and verified.
- Code review (AI adversarial) found 8 issues (2 Critical, 2 High, 2 Medium, 2 Low) — all resolved in review follow-up pass.
- C1: Dev Agent Record filled.
- C2: Supervisor filter dropdown added to Super Admin Staff tab (AC5 compliance).
- H1: Backend service tests expanded to meet story minimums.
- H2: Controller tests now include 403 role-based rejection tests.
- M1: LGA list fetch migrated from raw useEffect to useQuery (TanStack Query pattern).
- M2: Unused maxPercent variable removed from LgaComparisonCard.
- L1: Replaced useCallback with useMemo for filter objects — proper memoization.
- L2: sortBy Zod schemas now use z.enum() with explicit allowed columns.
- All 1784+ tests passing after fixes.

### File List

**Backend (new):**
- `apps/api/src/controllers/productivity.controller.ts` (modified — added cross-LGA handlers, Zod schemas)
- `apps/api/src/services/productivity.service.ts` (modified — added getAllStaffProductivity, getLgaComparison, getLgaSummary)
- `apps/api/src/routes/productivity.routes.ts` (modified — added /staff, /lga-comparison, /lga-summary, /cross-lga-export)
- `apps/api/src/controllers/__tests__/productivity.controller.test.ts` (modified — added 5.6b handler tests + 403 role tests)
- `apps/api/src/services/__tests__/productivity.service.test.ts` (modified — added 5.6b service tests)

**Frontend (new):**
- `apps/web/src/features/dashboard/pages/SuperAdminProductivityPage.tsx` (new)
- `apps/web/src/features/dashboard/pages/OfficialProductivityPage.tsx` (new)
- `apps/web/src/features/dashboard/components/CrossLgaStaffTable.tsx` (new)
- `apps/web/src/features/dashboard/components/LgaComparisonTable.tsx` (new)
- `apps/web/src/features/dashboard/components/LgaComparisonCard.tsx` (new)
- `apps/web/src/features/dashboard/components/LgaMultiSelect.tsx` (new)
- `apps/web/src/features/dashboard/pages/__tests__/SuperAdminProductivityPage.test.tsx` (new)
- `apps/web/src/features/dashboard/pages/__tests__/OfficialProductivityPage.test.tsx` (new)
- `apps/web/src/features/dashboard/components/__tests__/LgaComparisonTable.test.tsx` (new)

**Frontend (modified):**
- `apps/web/src/features/dashboard/api/productivity.api.ts` (modified — added cross-LGA fetchers)
- `apps/web/src/features/dashboard/hooks/useProductivity.ts` (modified — added cross-LGA hooks)
- `apps/web/src/App.tsx` (modified — added routes for Super Admin + Official productivity pages)
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` (modified — added nav links)
- `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` (modified — added sidebar link tests)
- `apps/web/src/components/ui/dropdown-menu.tsx` (modified — added DropdownMenuCheckboxItem)

**Shared types:**
- `packages/types/src/productivity.ts` (modified — added cross-LGA types)
- `packages/types/src/index.ts` (re-export verified)

### Post-Review Follow-up: Dynamic Targets + Dashboard Padding

**Findings during 5.6b review sweep:**

1. **SupervisorProductivityPage missing `p-6` padding** — root `<div>` had `space-y-6` but no `p-6`, causing content to sit at the sidebar edge. Fixed: added `p-6` to match all other dashboard pages.

2. **SupervisorHome hardcoded `DAILY_TARGETS.supervisor = 200`** — but actual team target is `teamSize * defaultTarget` (e.g., 3 enumerators × 25 = 75). Fixed: call `useTeamProductivity({ period: 'today' })` and use `summary.totalTarget` with static fallback.

3. **EnumeratorHome hardcoded `DAILY_TARGETS.enumerator = 25`** — backend has configurable `defaultTarget` via `productivity_targets` table. Fixed: call `useProductivityTargets()` and use `targets.defaultTarget` with fallback to 25.

4. **ClerkHome hardcoded `DAILY_TARGETS.clerk = 100`** — this was especially wrong since the backend has no role-specific targets; all roles share the same `defaultTarget` (25). Fixed: same pattern as enumerator, `useProductivityTargets()` with fallback to 25.

### Review Follow-ups (AI) — Dynamic Targets Fix

- [x] [AI-Review][HIGH] `/productivity/targets` route returns 403 for Enumerator/Clerk — add roles to authorize() [productivity.routes.ts:29]
- [x] [AI-Review][MEDIUM] SupervisorHome fetches full `useTeamProductivity` just for totalTarget — switch to `useProductivityTargets` + derive from team size [SupervisorHome.tsx:34]
- [x] [AI-Review][MEDIUM] No tests verify dynamic target behavior — mocks return static data, add tests varying mock target [*.test.tsx]
- [x] [AI-Review][MEDIUM] `DAILY_TARGETS.enumerator` and `DAILY_TARGETS.clerk` are dead code after refactor [useDashboardStats.ts:3-7]
- [x] [AI-Review][LOW] SupervisorHome fallback is still `DAILY_TARGETS.supervisor = 200` — derive from team size instead [SupervisorHome.tsx:37]
