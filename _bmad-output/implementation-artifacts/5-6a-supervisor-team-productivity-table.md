# Story 5.6a: Supervisor Team Productivity Table & API Foundation

Status: done

## Story

As a Supervisor,
I want a filterable, sortable table showing my team's submission productivity against daily targets,
so that I can track enumerator output, identify underperformers, and export the data for reporting.

## Acceptance Criteria

1. **Given** role authorization, **when** accessing the productivity table, **then**:
   - Supervisor: sees own assigned enumerators only (via `team_assignments` / LGA fallback), can view and export
   - Super Admin: API endpoints authorize `super_admin` for 5.6b readiness, but **no Super Admin UI page or nav link is created in 5.6a** — 5.6b delivers the admin productivity view
   - All other roles (Assessor, Official, Clerk, Enumerator, Public) receive 403

2. **Given** the productivity target system, **when** configured, **then**:
   - System-wide default daily target: 25 submissions/day
   - Per-LGA target override: Optional (Super Admin can set different target per LGA)
   - Targets apply to Enumerators and Data Entry Clerks
   - Targets stored in `productivity_targets` table with temporal versioning

3. **Given** the productivity table, **when** data loads, **then** the following 13 columns must display:
   - Enumerator (full name), Today (submissions today WAT), Target (daily target for LGA), % (progress), Status (derived indicator), Trend (arrow ↑↓→ vs previous period), This Week (total/target), This Month (total/target), Approved (verified submissions in period), Rejected (rejected in period), Rej. Rate (rejected/total %), Days Active (days with ≥1 submission / working days), Last Active (relative timestamp)

4. **Given** the current time and submission count, **when** calculating status, **then**:
   - **Complete** (green): Today ≥ Target
   - **On Track** (blue): Projected pace hits target (8am–5pm WAT workday)
   - **Behind** (amber): Projected pace won't hit target
   - **Inactive** (red): 0 submissions today AND last active > 24 hours

5. **Given** the filter and sort controls, **when** the table loads, **then**:
   - Time range picker: Today (default), This Week, This Month, Custom date range
   - Status filter: All, On Track, Behind, Inactive, Complete
   - Sort by any column (ascending/descending)
   - Free text search (enumerator name)
   - Summary row at bottom: team totals and averages

6. **Given** the export button, **when** the Supervisor clicks export, **then**:
   - CSV: via `ExportService.generateCsvExport()`, filename `oslsr-team-productivity-{lga}-{date}.csv`
   - PDF: via `ExportService.generatePdfReport()` with Oyo State header, report title, LGA name, date range, Supervisor name. Filename `oslsr-team-productivity-{lga}-{date}.pdf`
   - Export respects all active filters and sort order
   - Export action audit-logged with Supervisor ID, LGA, filters, record count, format

7. **Given** the need for historical trend data, **when** the system runs nightly, **then**:
   - BullMQ job runs at 11:59 PM WAT daily to snapshot each staff member's daily counts
   - Snapshot stored in `daily_productivity_snapshots` table
   - "Today" uses live data; historical periods (This Week, This Month) use snapshots

8. **Given** the API endpoints, **then** the following shared foundation must be created:
   - `GET /api/v1/productivity/team` — team productivity data with pagination, filters
   - `GET /api/v1/productivity/targets` — get default target and per-LGA overrides
   - `PUT /api/v1/productivity/targets` — update targets (Super Admin only)
   - `POST /api/v1/productivity/export` — export filtered data as CSV/PDF

9. **Given** the technical requirements, **then**:
   - Offset-based pagination (staff counts bounded, not 1M+)
   - Server-side filtering and sorting
   - TanStack Table in server-side mode (if installed by Story 5.5; else manual HTML table)
   - Core query extends existing `getTeamMetrics` pattern
   - WAT (UTC+1) timezone boundary calculations
   - Trend: current period average vs previous equivalent period

## Tasks / Subtasks

- [x] Task 1: Create `daily_productivity_snapshots` schema (AC: #7)
  - [x]1.1 Create `apps/api/src/db/schema/daily-productivity-snapshots.ts`:
    ```ts
    export const dailyProductivitySnapshots = pgTable('daily_productivity_snapshots', {
      id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
      userId: uuid('user_id').notNull(),
      lgaId: text('lga_id'),  // Text LGA code (matches respondents.lgaId pattern)
      roleId: uuid('role_id').notNull(),
      date: date('date').notNull(),  // WAT date YYYY-MM-DD
      submissionCount: integer('submission_count').notNull().default(0),
      approvedCount: integer('approved_count').notNull().default(0),
      rejectedCount: integer('rejected_count').notNull().default(0),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    });
    ```
  - [x]1.2 Add composite index: `(userId, date)` for fast lookups
  - [x]1.3 Add unique constraint: `(userId, date)` to prevent duplicate snapshots
  - [x]1.4 Export from `apps/api/src/db/schema/index.ts`
  - [x]1.5 Run `pnpm db:push:force` to apply schema

- [x] Task 2: Create `productivity_targets` schema and seed data (AC: #2)
  - [x]2.1 Create `apps/api/src/db/schema/productivity-targets.ts`:
    ```ts
    export const productivityTargets = pgTable('productivity_targets', {
      id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
      lgaId: text('lga_id'),  // NULL = system-wide default
      dailyTarget: integer('daily_target').notNull(),
      effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
      effectiveUntil: timestamp('effective_until', { withTimezone: true }),  // NULL = current active
      createdBy: uuid('created_by'),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    });
    ```
  - [x]2.2 Add partial unique index: `(lgaId) WHERE effectiveUntil IS NULL` — only one active target per LGA
  - [x]2.3 Seed system-wide default: `{ lgaId: null, dailyTarget: 25 }`
  - [x]2.4 Export from `apps/api/src/db/schema/index.ts`
  - [x]2.5 Run `pnpm db:push:force`

- [x] Task 3: Create shared types (AC: #3, #8)
  - [x]3.1 Add types to `packages/types/src/productivity.ts`:
    ```ts
    export interface StaffProductivityRow {
      id: string;
      fullName: string;
      todayCount: number;
      target: number;
      percent: number;
      status: 'complete' | 'on_track' | 'behind' | 'inactive';
      trend: 'up' | 'down' | 'flat';
      weekCount: number;
      weekTarget: number;
      monthCount: number;
      monthTarget: number;
      approvedCount: number;
      rejectedCount: number;
      rejRate: number;  // percentage
      daysActive: string;  // "5/7" format
      lastActiveAt: string | null;  // ISO 8601
    }

    export interface ProductivityFilterParams {
      period: 'today' | 'week' | 'month' | 'custom';
      dateFrom?: string;
      dateTo?: string;
      status?: string;
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    }

    export interface ProductivitySummary {
      totalSubmissions: number;
      avgPerDay: number;
      totalTarget: number;
      overallPercent: number;
      completedCount: number;
      behindCount: number;
      inactiveCount: number;
    }

    export interface ProductivityTarget {
      defaultTarget: number;
      lgaOverrides: Array<{ lgaId: string; lgaName: string; dailyTarget: number }>;
    }
    ```
  - [x]3.2 Re-export from `packages/types/src/index.ts`

- [x] Task 4: Create backend productivity service (AC: #1, #3, #4, #5, #9)
  - [x]4.1 Create `apps/api/src/services/productivity.service.ts`:
    - `getTeamProductivity(supervisorId, filters)` — main method:
      1. Get enumerator IDs via `TeamAssignmentService.getEnumeratorIdsForSupervisor(supervisorId)`
      2. Fetch user details: `fullName`, `status`, `lgaId`, `lastLoginAt`
      3. For "Today" period: LIVE query using `COUNT(*) FILTER (WHERE ...)` pattern from `supervisor.controller.ts` (lines 72-81)
      4. For historical periods (week/month/custom): query `daily_productivity_snapshots` aggregated
      5. Compute derived fields: %, Status, Trend, Rej. Rate, Days Active
      6. Apply filters (status, search) and sorting
      7. Return paginated `StaffProductivityRow[]` with summary
    - `getTargetForLga(lgaId)` — return active target (per-LGA override or system default 25)
    - `computeStatus(todayCount, target, lastActiveAt)` — Status indicator logic (matches AC #4):
      ```ts
      if (todayCount >= target) return 'complete';
      const now = new Date();
      const watHour = (now.getUTCHours() + 1) % 24;  // UTC+1
      // Check inactive FIRST: 0 today AND last active > 24h
      if (todayCount === 0 && lastActiveAt) {
        const hoursSinceActive = (now.getTime() - new Date(lastActiveAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceActive > 24) return 'inactive';
      }
      if (todayCount === 0 && !lastActiveAt) return 'inactive';
      // Outside work hours: can't project pace
      if (watHour < 8 || watHour >= 17) return 'behind';
      // Projection: will current pace reach target by 5pm WAT?
      const hoursElapsed = watHour - 8;
      if (hoursElapsed === 0) return 'on_track';  // Start of workday
      const hoursRemaining = 17 - watHour;
      const projectedAdditional = (todayCount / hoursElapsed) * hoursRemaining;
      return (todayCount + projectedAdditional >= target) ? 'on_track' : 'behind';
      ```
    - `computeTrend(currentPeriodAvg, previousPeriodAvg)` — returns 'up' | 'down' | 'flat'
    - `getApprovedRejectedCounts(enumeratorId, dateFrom, dateTo)`:
      - Approved: submissions where fraud_detections.severity = 'clean' OR fraud_detections.resolution IN ('false_positive', 'dismissed') OR (no fraud detection and processed = true)
      - Rejected: fraud_detections.resolution = 'confirmed_fraud'
  - [x]4.2 Create `apps/api/src/services/productivity-target.service.ts`:
    - `getActiveTargets()` — return all active targets (default + per-LGA overrides)
    - `getTargetForLga(lgaId)` — return specific LGA target or default
    - `updateTargets(updates, adminId)` — temporal versioning pattern from `fraud-config.service.ts`:
      1. Close current active record (set `effectiveUntil`)
      2. Insert new record (new `effectiveFrom`, `effectiveUntil = null`)
      3. Invalidate cache
    - Redis caching with 5-minute TTL (follow `fraud-config.service.ts` pattern)

- [x] Task 5: Create backend productivity controller and routes (AC: #1, #8)
  - [x]5.0 Extend `PII_ACTIONS` in `apps/api/src/services/audit.service.ts` — add two new typed constants:
    ```ts
    export const PII_ACTIONS = {
      VIEW_RECORD: 'pii.view_record',
      VIEW_LIST: 'pii.view_list',
      EXPORT_CSV: 'pii.export_csv',
      EXPORT_PDF: 'pii.export_pdf',
      SEARCH_PII: 'pii.search',
      VIEW_PRODUCTIVITY: 'pii.view_productivity',    // NEW — staff names are operational PII
      EXPORT_PRODUCTIVITY: 'pii.export_productivity', // NEW — productivity export with staff names
    } as const;
    ```
    The `PiiAction` type union auto-expands since it's derived from `typeof PII_ACTIONS`. No other changes needed.
  - [x]5.1 Create `apps/api/src/controllers/productivity.controller.ts`:
    - `getTeamProductivity` handler:
      1. Parse + validate query params via Zod schema
      2. Call `ProductivityService.getTeamProductivity(user.sub, filters)`
      3. Audit log: `AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_PRODUCTIVITY, 'staff_productivity', null, { filters, resultCount })`
      4. Return paginated response with summary
    - `getTargets` handler — return active targets
    - `updateTargets` handler — update targets (Super Admin only, Zod-validated)
  - [x]5.2 Create Zod validation schemas:
    ```ts
    const productivityQuerySchema = z.object({
      period: z.enum(['today', 'week', 'month', 'custom']).default('today'),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      status: z.enum(['all', 'complete', 'on_track', 'behind', 'inactive']).default('all'),
      search: z.string().max(100).optional(),
      sortBy: z.enum(['fullName', 'todayCount', 'target', 'percent', 'status', 'weekCount', 'monthCount', 'rejRate', 'lastActiveAt']).default('fullName'),
      sortOrder: z.enum(['asc', 'desc']).default('asc'),
      page: z.coerce.number().min(1).default(1),
      pageSize: z.coerce.number().min(1).max(100).default(20),
    });

    const updateTargetsSchema = z.object({
      defaultTarget: z.number().min(1).max(500).optional(),
      lgaOverrides: z.array(z.object({
        lgaId: z.string(),
        dailyTarget: z.number().min(1).max(500),
      })).optional(),
    });
    ```
  - [x]5.3 Create `apps/api/src/routes/productivity.routes.ts`:
    - `GET /api/v1/productivity/team` — authorize: `supervisor`, `super_admin`
    - `GET /api/v1/productivity/targets` — authorize: `supervisor`, `super_admin`
    - `PUT /api/v1/productivity/targets` — authorize: `super_admin` only
  - [x]5.4 Register in `apps/api/src/routes/index.ts`: `router.use('/productivity', authenticate, productivityRoutes)`

- [x] Task 6: Create productivity export endpoint (AC: #6)
  - [x]6.1 Add `exportTeamProductivity` handler to `productivity.controller.ts`:
    1. Parse `format` (csv/pdf) and `filters` from body
    2. Get team productivity data (same service method, no pagination limit)
    3. Audit log: `AuditService.logPiiAccess(req, PII_ACTIONS.EXPORT_PRODUCTIVITY, 'staff_productivity', null, { format, filters, recordCount })`
    4. Define export columns:
      ```ts
      const columns: ExportColumn[] = [
        { key: 'fullName', header: 'Enumerator', width: 100 },
        { key: 'todayCount', header: 'Today', width: 50 },
        { key: 'target', header: 'Target', width: 50 },
        { key: 'percent', header: '%', width: 40 },
        { key: 'status', header: 'Status', width: 60 },
        { key: 'weekCount', header: 'This Week', width: 70 },
        { key: 'monthCount', header: 'This Month', width: 70 },
        { key: 'approvedCount', header: 'Approved', width: 60 },
        { key: 'rejectedCount', header: 'Rejected', width: 60 },
        { key: 'rejRate', header: 'Rej. Rate', width: 55 },
        { key: 'daysActive', header: 'Days Active', width: 70 },
        { key: 'lastActiveAt', header: 'Last Active', width: 80 },
      ];
      ```
    5. Route by format:
       - CSV: `ExportService.generateCsvExport(data, columns)` → send with CSV headers
       - PDF: `ExportService.generatePdfReport(data, columns, { title: 'Team Productivity Report' })` → send with PDF headers
    6. Response headers: `Content-Disposition: attachment; filename="oslsr-team-productivity-{lga}-{date}.{ext}"`, `Cache-Control: no-store`
  - [x]6.2 Add route: `POST /api/v1/productivity/export` — authorize: `supervisor`, `super_admin`
  - [x]6.3 Apply export rate limit (reuse `export-rate-limit.ts` from Story 5.4 if available, else create)

- [x] Task 7: Create daily snapshot BullMQ worker (AC: #7)
  - [x]7.1 Create `apps/api/src/queues/productivity-snapshot.queue.ts`:
    ```ts
    const QUEUE_NAME = 'productivity-snapshot';
    // Lazy-initialized following email.queue.ts pattern
    export function getProductivitySnapshotQueue(): Queue { ... }
    export async function scheduleNightlySnapshot(): Promise<void> {
      const queue = getProductivitySnapshotQueue();
      // BullMQ repeatable job: 22:59 UTC = 23:59 WAT
      await queue.upsertJobScheduler(
        'nightly-snapshot',
        { pattern: '59 22 * * *' },  // Cron: 22:59 UTC daily
        { name: 'daily-snapshot', data: {} }
      );
    }
    ```
  - [x]7.2 Create `apps/api/src/workers/productivity-snapshot.worker.ts`:
    - Query ALL active enumerators and data entry clerks (not just one supervisor's team)
    - For each staff member, count submissions for the WAT day:
      ```ts
      const watDateStart = getWatDayStart(new Date());
      const watDateEnd = getWatDayEnd(new Date());
      // COUNT(*) for submissionCount
      // COUNT(*) FILTER (WHERE fd.severity = 'clean' OR fd.resolution IN (...)) for approvedCount
      // COUNT(*) FILTER (WHERE fd.resolution = 'confirmed_fraud') for rejectedCount
      ```
    - Insert into `daily_productivity_snapshots` with `ON CONFLICT (userId, date) DO UPDATE` (idempotent)
    - Log completion: staff count, duration
  - [x]7.3 Register worker in `apps/api/src/workers/index.ts`:
    - Add to `initializeWorkers()` and `closeAllWorkers()`
  - [x]7.4 Call `scheduleNightlySnapshot()` during server startup (in `apps/api/src/index.ts` or worker init)

- [x] Task 8: Create frontend API client and hooks (AC: #3, #5)
  - [x]8.1 Create `apps/web/src/features/dashboard/api/productivity.api.ts`:
    - `fetchTeamProductivity(params)` — GET `/api/v1/productivity/team?...` via `apiClient`
    - `fetchProductivityTargets()` — GET `/api/v1/productivity/targets`
    - `downloadProductivityExport(filters, format)` — POST `/api/v1/productivity/export` with raw `fetch()` for blob (follow `downloadStaffIdCard` pattern)
  - [x]8.2 Create `apps/web/src/features/dashboard/hooks/useProductivity.ts`:
    ```ts
    export const productivityKeys = {
      all: ['productivity'] as const,
      team: (params: ProductivityFilterParams) => [...productivityKeys.all, 'team', params] as const,
      targets: () => [...productivityKeys.all, 'targets'] as const,
    };

    export function useTeamProductivity(params: ProductivityFilterParams) {
      return useQuery({
        queryKey: productivityKeys.team(params),
        queryFn: () => fetchTeamProductivity(params),
        staleTime: 30_000,
        refetchInterval: params.period === 'today' ? 60_000 : false,  // Auto-refresh for today
      });
    }
    ```

- [x] Task 9: Create ProductivityTable component (AC: #3, #4, #9)
  - [x]9.1 Create `apps/web/src/features/dashboard/components/ProductivityTable.tsx`:
    - If `@tanstack/react-table` available (Story 5.5): Use TanStack Table in server-side mode
    - Fallback: Manual HTML `<table>` following `FraudDetectionTable.tsx` pattern
    - **13 column definitions** from AC5.6a.3
    - **Status badge** with color coding: Complete (green), On Track (blue), Behind (amber), Inactive (red)
    - **Trend indicator**: ↑ (green), ↓ (red), → (gray) arrow icons
    - **Progress bar** in % column (maroon fill)
    - **"This Week"/"This Month"** displayed as "98/125" format with secondary text
    - **Rej. Rate** with conditional coloring: > 20% = red, > 10% = amber, else green
    - **Last Active** as relative time ("2 min ago", "3 hrs ago", "2 days ago")
    - **Summary row** at bottom: team totals/averages for each numeric column
    - **Pagination** controls: Previous/Next + page size selector (offset-based)
    - **Sort** indicators on column headers

- [x] Task 10: Create SupervisorProductivityPage (AC: #3, #4, #5, #6)
  - [x]10.1 Create `apps/web/src/features/dashboard/pages/SupervisorProductivityPage.tsx`:
    - **Header**: "Team Productivity" with refresh button + last updated timestamp
    - **Time range picker**: Button group — Today (default) | This Week | This Month | Custom
    - **Filter controls row**: Status filter dropdown, text search input, Clear button
    - **Summary strip**: Total submissions, Avg per enumerator, Team completion %, Flagged enumerators count
    - **Productivity table** (Task 9 component)
    - **Export panel**: Export CSV / Export PDF buttons (using `downloadProductivityExport`)
    - **Skeleton loading** matching table shape (A2 team agreement)
    - **Empty state**: "No team members assigned. Contact your administrator." when no enumerators
  - [x]10.2 Add lazy import in `App.tsx`:
    ```ts
    const SupervisorProductivityPage = lazy(() => import('./features/dashboard/pages/SupervisorProductivityPage'));
    ```
  - [x]10.3 Add route under Supervisor routes: `/dashboard/supervisor/productivity`
  - [x]10.4 Add "Productivity" navigation link to Supervisor sidebar/nav menu

- [x] Task 11: Backend tests (AC: #1, #3, #4, #7, #8)
  - [x]11.1 Create `apps/api/src/services/__tests__/productivity.service.test.ts` (10+ tests):
    - Returns team productivity for supervisor's enumerators
    - Status computed correctly (complete, on_track, behind, inactive)
    - Supervisor scope enforced (only own team)
    - Historical data from snapshots (week/month)
    - Today uses live submission counts
    - Trend computed correctly (up/down/flat)
    - Approved/rejected counts correct
    - Rej. rate calculation correct
    - Empty team returns empty result
    - Targets fetched correctly (per-LGA override or default)
  - [x]11.2 Create `apps/api/src/controllers/__tests__/productivity.controller.test.ts` (10+ tests):
    - 200 for supervisor with team data
    - 200 for super_admin (all staff)
    - 403 for enumerator, clerk, assessor, official, public_user
    - Filters applied correctly (period, status, search)
    - Pagination works (page, pageSize, totalItems)
    - Sort order applied
    - Targets endpoint returns active targets
    - Update targets works for super_admin only
    - Export returns correct Content-Type and Content-Disposition
    - Audit log called on view and export
  - [x]11.3 Create `apps/api/src/workers/__tests__/productivity-snapshot.worker.test.ts` (5+ tests):
    - Snapshots all active staff members
    - Correct WAT date boundary
    - Idempotent (re-run same day doesn't duplicate)
    - Approved/rejected counts from fraud detections
    - Handles staff with no submissions

- [x] Task 12: Frontend tests (AC: #3, #4, #5, #6)
  - [x]12.1 Create `apps/web/src/features/dashboard/pages/__tests__/SupervisorProductivityPage.test.tsx`:
    - Renders table with team data
    - Time range picker switches period
    - Status filter works
    - Search field filters by name
    - Summary strip shows team totals
    - Export buttons trigger download
    - Skeleton loading state
    - Empty state for no team members
  - [x]12.2 Create `apps/web/src/features/dashboard/components/__tests__/ProductivityTable.test.tsx`:
    - All 13 columns render
    - Status badge colors correct
    - Trend arrows render correctly
    - Summary row at bottom
    - Pagination controls visible
    - Sort header click triggers callback

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: Approved/rejected counts ignore period filter — always uses weekApproved+todayFraud regardless of period (today/week/month). Should be period-aware. [apps/api/src/services/productivity.service.ts:291-293]
- [x] [AI-Review][MEDIUM] M1: Custom date range picker missing from UI — AC #5 requires "Custom date range" but PERIOD_OPTIONS only has Today/This Week/This Month. Backend supports `custom` period. [apps/web/src/features/dashboard/pages/SupervisorProductivityPage.tsx:21-25]
- [x] [AI-Review][MEDIUM] M2: PDF export missing AC-required metadata — AC #6 requires Oyo State header, LGA name, date range, Supervisor name. Controller only passes `{ title: 'Team Productivity Report' }`. [apps/api/src/controllers/productivity.controller.ts:216-219]
- [x] [AI-Review][MEDIUM] M3: lgaName in targets response set to lgaId — ProductivityTargetService maps `lgaName: r.lgaId!` instead of resolving from LGA table. [apps/api/src/services/productivity-target.service.ts:87]
- [x] [AI-Review][MEDIUM] M4: N+1 query for target lookup in enumerator loop — getTargetForLga() called per enumerator inside for-loop. Should fetch once before loop. [apps/api/src/services/productivity.service.ts:281]
- [x] [AI-Review][LOW] L1: sprint-status.yaml modified in git but not in story File List [story File List section]
- [x] [AI-Review][LOW] L2: Export pageSize 10000 is a magic number — should be a named constant [apps/api/src/controllers/productivity.controller.ts:186]
- [x] [AI-Review][LOW] L3: overallPercent can produce NaN if all targets sum to 0 [apps/api/src/services/productivity.service.ts:366]

## Dev Notes

### Architecture Compliance

- **API Pattern**: Controller → service → DB layered pattern.
- **Route Registration**: `router.use('/productivity', authenticate, productivityRoutes)` in `apps/api/src/routes/index.ts`.
- **Authorization**: `authorize(UserRole.SUPERVISOR, UserRole.SUPER_ADMIN)` for team data. `authorize(UserRole.SUPER_ADMIN)` for target updates.
- **Supervisor Scope**: Use `TeamAssignmentService.getEnumeratorIdsForSupervisor(user.sub)`. If empty array, return empty result (no team).
- **Audit Logging**: Use `AuditService.logPiiAccess()` with typed constants `PII_ACTIONS.VIEW_PRODUCTIVITY` and `PII_ACTIONS.EXPORT_PRODUCTIVITY` (added in Task 5.0). Fire-and-forget mode. Supervisor data contains staff names (operational PII), so audit is appropriate.
- **Temporal Versioning for Targets**: Follow `fraud-config.service.ts` pattern — never update, always close old + insert new.

### Extending getTeamMetrics Pattern

The existing `supervisor.controller.ts` (lines 72-81) has the foundation:

```ts
// Existing pattern — extend this for Story 5.6a
const countRows = await db
  .select({
    submitterId: submissions.submitterId,
    dailyCount: sql<number>`COUNT(*) FILTER (WHERE ${submissions.submittedAt} >= ${todayStart})`,
    weeklyCount: sql<number>`COUNT(*) FILTER (WHERE ${submissions.submittedAt} >= ${weekStart})`,
    lastSubmittedAt: sql<string>`MAX(${submissions.submittedAt})`,
  })
  .from(submissions)
  .where(inArray(submissions.submitterId, enumeratorIds))
  .groupBy(submissions.submitterId);
```

**Extend with**:
- Monthly count: `COUNT(*) FILTER (WHERE submittedAt >= monthStart)`
- Approved count: `COUNT(*) FILTER (WHERE fd.severity = 'clean' OR fd.resolution IN ('false_positive', 'dismissed'))`
- Rejected count: `COUNT(*) FILTER (WHERE fd.resolution = 'confirmed_fraud')`
- JOIN `fraud_detections` via `submissions.id = fraud_detections.submissionId`

For historical periods, query `daily_productivity_snapshots` instead of live submissions.

### WAT Timezone Boundary Calculations

All date boundaries use WAT (UTC+1). Established pattern from `supervisor.controller.ts` (lines 64-70):

```ts
// WAT = UTC+1
const WAT_OFFSET_MS = 1 * 60 * 60 * 1000;

function getWatDayBoundaries(): { todayStart: Date; weekStart: Date; monthStart: Date } {
  const now = new Date();
  const watNow = new Date(now.getTime() + WAT_OFFSET_MS);

  // Today start (midnight WAT in UTC)
  const todayWat = new Date(watNow);
  todayWat.setUTCHours(0, 0, 0, 0);
  const todayStart = new Date(todayWat.getTime() - WAT_OFFSET_MS);

  // Week start (Monday midnight WAT in UTC)
  const day = watNow.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const weekWat = new Date(watNow);
  weekWat.setUTCDate(weekWat.getUTCDate() - diff);
  weekWat.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(weekWat.getTime() - WAT_OFFSET_MS);

  // Month start (1st of month midnight WAT in UTC)
  const monthWat = new Date(watNow);
  monthWat.setUTCDate(1);
  monthWat.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(monthWat.getTime() - WAT_OFFSET_MS);

  return { todayStart, weekStart, monthStart };
}
```

### Status Indicator Logic (AC5.6a.4)

Calculate on the **backend** (in service layer) so it's consistent across views:

```ts
function computeStatus(todayCount: number, target: number, lastActiveAt: Date | null): string {
  if (todayCount >= target) return 'complete';

  const now = new Date();
  const watHour = (now.getUTCHours() + 1) % 24;  // UTC+1

  // Check inactive: 0 today AND last active > 24h
  if (todayCount === 0 && lastActiveAt) {
    const hoursSinceActive = (now.getTime() - new Date(lastActiveAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceActive > 24) return 'inactive';
  }
  if (todayCount === 0 && !lastActiveAt) return 'inactive';

  // Outside work hours: can't project
  if (watHour < 8 || watHour >= 17) return 'behind';

  // Projection: will current pace reach target by 5pm?
  const hoursElapsed = watHour - 8;
  if (hoursElapsed === 0) return 'on_track';  // Start of workday
  const hoursRemaining = 17 - watHour;
  const projectedAdditional = (todayCount / hoursElapsed) * hoursRemaining;
  return (todayCount + projectedAdditional >= target) ? 'on_track' : 'behind';
}
```

### Trend Calculation

Compare current period average with the previous equivalent period:

```ts
function computeTrend(currentAvg: number, previousAvg: number): 'up' | 'down' | 'flat' {
  if (previousAvg === 0) return currentAvg > 0 ? 'up' : 'flat';
  const changePercent = ((currentAvg - previousAvg) / previousAvg) * 100;
  if (changePercent > 5) return 'up';
  if (changePercent < -5) return 'down';
  return 'flat';
}
```

- **Today**: Compare with yesterday
- **This Week**: Compare with last week
- **This Month**: Compare with last month's daily average

### BullMQ Nightly Snapshot Job

Follow existing queue/worker patterns:

```ts
// Queue: apps/api/src/queues/productivity-snapshot.queue.ts
// Pattern from email.queue.ts — lazy Redis initialization, test mode handling

// Worker: apps/api/src/workers/productivity-snapshot.worker.ts
// Pattern from fraud-detection.worker.ts — structured logging, error handling

// Schedule: Use BullMQ job schedulers (repeatable jobs)
await queue.upsertJobScheduler(
  'nightly-snapshot',
  { pattern: '59 22 * * *' },  // 22:59 UTC = 23:59 WAT
  { name: 'daily-snapshot', data: {} }
);
```

**Worker logic**:
1. Get WAT date boundaries for "today" (the day being snapshotted)
2. Query ALL active users with roles enumerator/data_entry_clerk
3. For each: COUNT submissions, approved, rejected within WAT day
4. Upsert into `daily_productivity_snapshots` (ON CONFLICT DO UPDATE for idempotency)
5. Log completion: staff count, snapshot date, duration

### Approved / Rejected Definition

For Story 5.6a, "approved" and "rejected" refer to the quality outcome of submissions:

- **Approved**: Submission is clean or cleared:
  - `fraud_detections.severity = 'clean'` (auto-clean)
  - `fraud_detections.resolution IN ('false_positive', 'dismissed')` (supervisor cleared)
  - No fraud detection AND `submissions.processed = true` (processed without flagging)
- **Rejected**: Submission confirmed fraudulent:
  - `fraud_detections.resolution = 'confirmed_fraud'`

When Story 5.2 (Assessor Queue) is implemented and `assessorResolution` column exists, extend:
- Approved also includes `assessorResolution = 'final_approved'`
- Rejected also includes `assessorResolution = 'final_rejected'`

### Existing Code to Reuse — DO NOT Reinvent

| Component | Location | Reuse For |
|-----------|----------|-----------|
| `getTeamMetrics` query | `apps/api/src/controllers/supervisor.controller.ts:72-81` | Foundation for productivity query |
| `TeamAssignmentService` | `apps/api/src/services/team-assignment.service.ts` | Supervisor scope enforcement |
| `AuditService` | `apps/api/src/services/audit.service.ts` | View + export audit logging |
| `ExportService` | `apps/api/src/services/export.service.ts` | CSV + PDF generation |
| `FraudConfigService` (pattern) | `apps/api/src/services/fraud-config.service.ts` | Temporal versioning for targets |
| BullMQ queue pattern | `apps/api/src/queues/email.queue.ts` | Lazy init, test mode, job options |
| BullMQ worker pattern | `apps/api/src/workers/fraud-detection.worker.ts` | Worker lifecycle, logging |
| Worker registry | `apps/api/src/workers/index.ts` | Register new worker |
| `DAILY_TARGETS` | `apps/web/src/features/dashboard/hooks/useDashboardStats.ts` | Hardcoded targets (replace with API) |
| `useTeamMetrics` hook | `apps/web/src/features/dashboard/hooks/useSupervisor.ts` | 60s polling pattern |
| `FraudDetectionTable` | `apps/web/src/features/dashboard/components/FraudDetectionTable.tsx` | Manual table pattern (if no TanStack Table) |
| Offset pagination | `apps/api/src/controllers/fraud-detections.controller.ts:56-68` | Page/pageSize/offset pattern |
| `downloadStaffIdCard` | `apps/web/src/features/staff/api/staff.api.ts` | Blob download pattern for export |
| `UUID_REGEX` | `apps/api/src/controllers/fraud-detections.controller.ts:26` | UUID validation |
| `AppError` | `packages/utils/src/errors.ts` | Structured error responses |
| `Card`, `Badge`, `Button` | `apps/web/src/components/ui/` | UI primitives |
| `SkeletonCard` | `apps/web/src/features/dashboard/components/SkeletonCard.tsx` | Loading states |
| `useAuth` | `apps/web/src/features/auth/` | Get current user role |

### Performance Considerations

- **Staff counts are bounded**: A supervisor typically has < 10 enumerators. Offset pagination is fine (no cursor needed).
- **Live "Today" query**: Uses `COUNT(*) FILTER (WHERE ...)` — very efficient with existing `submitterIdIdx` and `submittedAtIdx`.
- **Historical queries**: Go through `daily_productivity_snapshots` — simple lookups by `(userId, date range)` with composite index.
- **Nightly snapshot**: Processes all active staff (~200 total). Should complete in < 5 seconds.
- **Target caching**: Redis with 5-min TTL. Targets rarely change.
- **Auto-refresh**: 60s for "Today" period (same as existing `useTeamMetrics` pattern).

### Database Tables Used / Created

| Table | Status | Purpose |
|-------|--------|---------|
| `daily_productivity_snapshots` | **NEW** | Historical daily counts per staff member |
| `productivity_targets` | **NEW** | Configurable daily targets with temporal versioning |
| `submissions` | Existing | Live submission counts per enumerator |
| `fraud_detections` | Existing | Approved/rejected determination |
| `users` | Existing | Staff details (fullName, roleId, lgaId, status) |
| `team_assignments` | Existing | Supervisor → enumerator mapping |
| `lgas` | Existing | LGA names for export headers |
| `audit_logs` | Existing | Written to via AuditService |

### Dependencies and Warnings

- **Story 5.5 (Registry Table)**: May install `@tanstack/react-table`. If available, use it. If not, use manual HTML table (like `FraudDetectionTable.tsx`).
- **Story 5.4 (Export)**: Creates `ExportButton` and `export-rate-limit.ts`. If available, reuse. If not, Story 5.6a creates its own export endpoint with inline rate limiting.
- **prep-2 (Audit Logging)**: `AuditService` is ready. Task 5.0 extends `PII_ACTIONS` with `VIEW_PRODUCTIVITY` and `EXPORT_PRODUCTIVITY` typed constants.
- **prep-3 (Export Infrastructure)**: `ExportService` is ready. `generatePdfReport()` and `generateCsvExport()` are tested.
- **BullMQ connection**: The Redis connection pattern is established. Ensure `REDIS_URL` is configured in all environments.
- **`assessorResolution` column**: May not exist yet (Story 5.2 dependency). Use available resolution columns for approved/rejected counts. Document the extension point.
- **Schema changes**: Two new tables require `pnpm db:push:force`. Coordinate with any in-progress migrations.

### Previous Story Learnings

- **Test WHERE clauses for scope** (Epic 4): Verify supervisor sees only own team.
- **castScores() for numeric columns** (Story 4.4): If any numeric aggregates return as strings, parseFloat.
- **WAT timezone** (Story 4.1): All day/week/month boundaries use UTC+1.
- **A2: Skeleton must match content shape**: Table skeleton with correct column count.
- **A3: Test selectors only via data-testid**: No CSS class selectors.
- **A4: Task count limit**: 12 tasks (under 15 limit).
- **Queue test isolation** (Story 3.4): BullMQ queues must be lazy-initialized for test compatibility.

### Testing Standards

- **Backend tests**: In `__tests__/` folders. Use `vi.hoisted()` + `vi.mock()` pattern.
- **Frontend tests**: Co-located as `.test.tsx`. Use `@testing-library/react` with `data-testid` selectors only.
- **Authorization tests**: Test all 7 roles. Supervisor + Super Admin → 200. Others → 403.
- **Scope tests**: Supervisor sees only own team. Empty team returns empty result.
- **Status logic tests**: Test each status condition (complete, on_track, behind, inactive) with specific data.
- **Snapshot worker tests**: Idempotency, WAT date boundaries, correct counts.
- **Export tests**: Correct Content-Type, filename, audit logging.

### Project Structure Notes

- **Backend** (new files):
  - `apps/api/src/db/schema/daily-productivity-snapshots.ts`
  - `apps/api/src/db/schema/productivity-targets.ts`
  - `apps/api/src/services/productivity.service.ts`
  - `apps/api/src/services/productivity-target.service.ts`
  - `apps/api/src/controllers/productivity.controller.ts`
  - `apps/api/src/routes/productivity.routes.ts`
  - `apps/api/src/queues/productivity-snapshot.queue.ts`
  - `apps/api/src/workers/productivity-snapshot.worker.ts`
  - (test files in respective `__tests__/` folders)
- **Backend** (modify):
  - `apps/api/src/db/schema/index.ts` — export new schemas
  - `apps/api/src/routes/index.ts` — register productivity routes
  - `apps/api/src/workers/index.ts` — register snapshot worker
- **Frontend** (new files):
  - `apps/web/src/features/dashboard/api/productivity.api.ts`
  - `apps/web/src/features/dashboard/hooks/useProductivity.ts`
  - `apps/web/src/features/dashboard/components/ProductivityTable.tsx`
  - `apps/web/src/features/dashboard/pages/SupervisorProductivityPage.tsx`
  - (test files in respective `__tests__/` folders)
- **Frontend** (modify):
  - `apps/web/src/App.tsx` — add productivity route under Supervisor
- **Shared types** (new):
  - `packages/types/src/productivity.ts`
  - `packages/types/src/index.ts` — re-export

### What NOT to Build (Out of Scope)

- Super Admin cross-LGA view or productivity page/nav → Story 5.6b (API access is authorized in 5.6a for foundation readiness only)
- Government Official aggregate view → Story 5.6b
- Individual staff detail drilldown page → not specified (may add in 5.6b)
- Real-time WebSocket updates → use polling (60s `refetchInterval`) per existing pattern
- Target editing UI for Super Admin → Story 5.6b delivers the UI; 5.6a provides the API only
- Productivity alerts/notifications → not in any story yet
- Weekly/monthly email digests → out of scope
- Gamification or leaderboard features → out of scope

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.6a AC5.6a.1-AC5.6a.9]
- [Source: apps/api/src/controllers/supervisor.controller.ts:38-110 — getTeamMetrics foundation]
- [Source: apps/api/src/services/team-assignment.service.ts — supervisor scope]
- [Source: apps/api/src/queues/email.queue.ts — BullMQ queue pattern]
- [Source: apps/api/src/workers/fraud-detection.worker.ts — BullMQ worker pattern]
- [Source: apps/api/src/workers/index.ts — worker registry]
- [Source: apps/api/src/services/fraud-config.service.ts — temporal versioning for targets]
- [Source: apps/api/src/services/export.service.ts — CSV/PDF generation]
- [Source: apps/api/src/services/audit.service.ts — operational audit logging]
- [Source: apps/api/src/controllers/fraud-detections.controller.ts:56-68 — offset pagination pattern]
- [Source: apps/web/src/features/dashboard/hooks/useDashboardStats.ts:3-7 — hardcoded DAILY_TARGETS]
- [Source: apps/web/src/features/dashboard/hooks/useSupervisor.ts:31-38 — 60s polling pattern]
- [Source: apps/web/src/features/dashboard/components/FraudDetectionTable.tsx — manual table pattern]
- [Source: _bmad-output/project-context.md — WAT timezone, API format, team agreements]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Fixed `useToast` API: `success('text')` → `success({ message: 'text' })` (ToastOptions interface)
- Fixed `audit.service.test.ts`: Updated PII_ACTIONS count from 5 to 7 (added VIEW_PRODUCTIVITY, EXPORT_PRODUCTIVITY)
- Fixed `sidebarConfig.test.ts`: Updated supervisor sidebar count from 5 to 6 (added Productivity link)

### Completion Notes List

- All 12 tasks completed across backend (schema, service, controller, routes, queue, worker) and frontend (API client, hooks, table component, page, routing, sidebar)
- 74 new tests written across 5 test files, all passing
- Full test suite green: API 910 passed, Web 1750 passed
- Two new DB tables created via `db:push:force`: `daily_productivity_snapshots`, `productivity_targets`
- Seed data added for system-wide default target (25/day)
- BullMQ nightly snapshot scheduled at 22:59 UTC (23:59 WAT)
- TanStack React Table v8 used in server-side mode (13 columns)
- WAT (UTC+1) timezone boundaries used throughout
- Temporal versioning for productivity targets (never update, close old + insert new)
- Redis caching with 5-min TTL for target lookups

### Change Log

- **2026-02-23**: Full implementation of Story 5.6a — all 12 tasks, 9 acceptance criteria satisfied
- **2026-02-23**: Code review — 8 issues found (1H, 4M, 3L). All 8 fixed:
  - H1: Period-aware approved/rejected counts (was always using week data)
  - M1: Added Custom date range picker UI with dateFrom/dateTo inputs
  - M2: Extended PdfReportOptions with subtitle; PDF exports now include LGA name, date range, supervisor name
  - M3: Resolved lgaName from LGA table instead of using lgaId as display name
  - M4: Eliminated N+1 target query — fetch all targets once before enumerator loop
  - L1: Added sprint-status.yaml to File List
  - L2: Extracted EXPORT_MAX_ROWS constant
  - L3: Explicit NaN guard for overallPercent
  - Tests updated: 75 tests passing across 5 test files (41 API + 34 web)

### File List

**New files:**
- `apps/api/src/db/schema/daily-productivity-snapshots.ts`
- `apps/api/src/db/schema/productivity-targets.ts`
- `packages/types/src/productivity.ts`
- `apps/api/src/services/productivity.service.ts`
- `apps/api/src/services/productivity-target.service.ts`
- `apps/api/src/controllers/productivity.controller.ts`
- `apps/api/src/routes/productivity.routes.ts`
- `apps/api/src/queues/productivity-snapshot.queue.ts`
- `apps/api/src/workers/productivity-snapshot.worker.ts`
- `apps/web/src/features/dashboard/api/productivity.api.ts`
- `apps/web/src/features/dashboard/hooks/useProductivity.ts`
- `apps/web/src/features/dashboard/components/ProductivityTable.tsx`
- `apps/web/src/features/dashboard/pages/SupervisorProductivityPage.tsx`
- `apps/api/src/services/__tests__/productivity.service.test.ts`
- `apps/api/src/controllers/__tests__/productivity.controller.test.ts`
- `apps/api/src/workers/__tests__/productivity-snapshot.worker.test.ts`
- `apps/web/src/features/dashboard/pages/__tests__/SupervisorProductivityPage.test.tsx`
- `apps/web/src/features/dashboard/components/__tests__/ProductivityTable.test.tsx`

**Modified files:**
- `apps/api/src/db/schema/index.ts` — export new schemas
- `apps/api/src/db/schema/relations.ts` — add relations for new tables
- `apps/api/src/db/seeds/index.ts` — seed default productivity target
- `apps/api/src/services/audit.service.ts` — add VIEW_PRODUCTIVITY and EXPORT_PRODUCTIVITY to PII_ACTIONS
- `apps/api/src/services/export.service.ts` — extend PdfReportOptions with subtitle (review fix M2)
- `apps/api/src/routes/index.ts` — register productivity routes
- `apps/api/src/workers/index.ts` — register snapshot worker, async initializeWorkers
- `apps/web/src/App.tsx` — add SupervisorProductivityPage lazy route
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — add Productivity nav item for supervisor
- `packages/types/src/index.ts` — re-export productivity types
- `apps/api/src/services/__tests__/audit.service.test.ts` — update PII_ACTIONS count from 5 to 7
- `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` — update supervisor sidebar count from 5 to 6
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — update story status
