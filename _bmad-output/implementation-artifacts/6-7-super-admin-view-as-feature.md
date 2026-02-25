# Story 6.7: Super Admin View-As Feature

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Super Admin,
I want to view what another role's dashboard looks like for debugging and demos,
so that I can troubleshoot user issues and demonstrate the system to stakeholders.

## Context

### Business Value
During stakeholder demos and user support, the Super Admin needs to show what Enumerators, Supervisors, and other roles see without logging in as them. Without View-As, the admin must create test accounts per role or ask staff to share screens — neither is practical, auditable, or secure. This feature provides sandboxed, read-only rendering of any role's dashboard within the Super Admin's own routes, with full audit trail.

### Key Design Decisions

**From ADR-016 (Strict Route Isolation):**
> Super Admin NEVER visits other role's actual routes. View-As renders target dashboard components in Super Admin's context, NEVER visits other role's actual routes.

This is the foundational constraint. The frontend strategy MUST render target role's page components under `/dashboard/super-admin/view-as/*` routes — NOT redirect to `/dashboard/enumerator/*` or any other role's route prefix.

**Deferred from Epic 2.5** because:
1. Requires audit infrastructure (Story 6-1) for accountability
2. Security complexity of impersonation without privilege leakage
3. ADR-016 demands component rendering, not route sharing

### Current State

- **JWT auth**: 15-minute access tokens with `sub`, `jti`, `role`, `lgaId`, `email`, `rememberMe` claims (`TokenService.ts` lines 37-58)
- **Auth middleware**: Extracts JWT, verifies, checks blacklist, validates session, attaches to `req.user` (`auth.ts` lines 19-107)
- **RBAC middleware**: `authorize(...roles)` checks `req.user.role` against allowedRoles (`rbac.ts` lines 9-23)
- **LGA locking**: `requireLgaLock()` enforces LGA boundaries for Enumerator/Supervisor (`rbac.ts` lines 28-55)
- **Session management**: Redis-backed, single-session enforcement, 8h inactivity / 24h absolute timeouts (`SessionService.ts` lines 39-150)
- **AuthContext**: `useAuth()` provides `user`, `accessToken`, `isAuthenticated`, login/logout methods (`AuthContext.tsx` lines 21-548)
- **ProtectedRoute**: Checks auth + role, redirects to `/unauthorized` if role not in `allowedRoles` (`ProtectedRoute.tsx` lines 44-86)
- **DashboardLayout**: Sidebar (240px), header with role badge, main content `<Outlet />`, mobile nav (`DashboardLayout.tsx` lines 1-187)
- **AuditService**: Fire-and-forget + transactional, 7 existing PII action types (`audit.service.ts` lines 21-97)
- **SWUpdateBanner**: Existing banner component pattern — fixed top, dismissible, accessible (`SWUpdateBanner.tsx` lines 1-35)
- **Super Admin sidebar**: 15 items (sidebarConfig.ts lines 134-150) — no View-As item
- **Super Admin routes**: 12 routes at `/dashboard/super-admin/*` (App.tsx lines 570-676)
- **7 user roles**: Super Admin, Supervisor, Enumerator, Data Entry Clerk, Verification Assessor, Government Official, Public User

### Architecture Requirements

**From PRD/Epics (lines 1902-1924):**
1. `/dashboard/super-admin/view-as/:role` renders target role's dashboard in sandboxed context
2. Prominent banner: "Viewing as [Role] — Read Only"
3. Full audit trail: who viewed as whom, start/end timestamps, duration
4. Actions blocked: "Actions disabled in View-As mode"
5. Super Admin session remains isolated — no cross-contamination
6. Does NOT grant access to other role's actual routes (strict isolation preserved)
7. Consider mandatory "reason for viewing" field

**From prep-6 View-As Authentication Spike (design decisions):**

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Auth strategy | Redis session metadata | No JWT modification needed, server-side control, easy invalidation, no re-issue |
| Frontend rendering | Component import | True isolation, target role's components render under admin routes |
| Read-only enforcement | Dual-layer (API + frontend) | API middleware blocks mutations, frontend context disables UI |
| LGA scoping | Admin selects target LGA | Field roles require LGA context for meaningful demo |
| Public User | Excluded from View-As | Different auth context (OAuth/public) |

### Dependency
- **Story 6-1** (Immutable Audit Logs) — SHOULD be implemented first. View-As audit records must be immutable. If not done, use existing `AuditService.logPiiAccessTx()` with custom action strings — backward compatible.
- **prep-6-view-as-authentication-spike** (ready-for-dev) — Contains the complete design blueprint. If the spike has been executed, use its recommendations directly. If not, the spike story file contains detailed comparison tables, threat model, and implementation roadmap.

## Acceptance Criteria

**AC1**: Given a Super Admin navigates to "View As" in the sidebar, when they select a target role (Supervisor, Enumerator, Data Entry Clerk, Verification Assessor, Government Official) and optionally select a target LGA (required for field roles), then the target role's dashboard renders within the Super Admin's route context at `/dashboard/super-admin/view-as/:role`, showing that role's sidebar items, home page, and navigable sub-pages.

**AC2**: Given View-As mode is active, when the dashboard renders, then a prominent, non-dismissible banner is displayed at the top of the page showing "Viewing as [Role Name] — Read Only" with the role's color coding, the admin's original identity ("Logged in as: [Admin Name]"), and an "Exit View-As" button.

**AC3**: Given a View-As session starts, when the admin selects a role and optionally provides a reason, then an audit log entry is created recording: actor (Super Admin userId), action (`view_as.start`), target role, target LGA (if applicable), reason, timestamp, IP address, and user agent.

**AC4**: Given a View-As session is active, when the admin clicks "Exit View-As" or navigates away from the View-As routes, then an audit log entry is created recording: action (`view_as.end`), duration (seconds from start), and the session returns to the Super Admin's normal dashboard.

**AC5**: Given View-As mode is active, when the admin attempts any mutation action (form submission, button click, file upload), then the action is blocked with a toast message "Actions disabled in View-As mode" and the UI element is visually disabled (grayed out, cursor not-allowed).

**AC6**: Given View-As mode is active, when viewing as a field role (Enumerator/Supervisor), then the displayed data is scoped to the selected LGA (not all data), and role-specific features (offline sync UI, messaging, fraud alerts) render in a read-only, demonstration state.

**AC7**: Given the View-As feature, when the Super Admin is in View-As mode, then their original Super Admin session remains active and isolated — no cross-contamination with target role's permissions, no ability to perform target role's write operations, and the original admin identity is preserved in the auth context.

**AC8**: Given the full test suite, when all tests run, then new tests cover: View-As session start/end API, Redis session metadata storage, read-only middleware blocking mutations, ViewAsProvider context behavior, role selector page rendering, View-As banner display, audit logging for start/end, LGA scoping for field roles, exit behavior, and zero regressions across existing tests.

## Tasks / Subtasks

- [ ] Task 1: Implement View-As session management via Redis (AC: #3, #4, #7)
  - [ ] 1.1 Create `apps/api/src/services/view-as.service.ts`:
    - `startViewAs(adminId, targetRole, targetLgaId?, reason?)` — create View-As session in Redis
    - `endViewAs(adminId)` — close View-As session, return duration
    - `getViewAsState(adminId)` — get current View-As state (or null if not active)
    - `isViewingAs(adminId)` — boolean check
  - [ ] 1.2 Implement Redis session storage:
    - Key: `view_as:{adminId}`
    - Value: `{ targetRole, targetLgaId, reason, startedAt, expiresAt }`
    - TTL: 30 minutes (auto-expire as safety net)
    - On start: check no existing View-As session → store in Redis
    - On end: delete from Redis, compute duration
  - [ ] 1.3 Implement `startViewAs()`:
    1. Validate: targetRole is valid and NOT `super_admin` or `public_user`
    2. Validate: if targetRole is `enumerator` or `supervisor`, targetLgaId is required
    3. Check: no existing View-As session active (prevent concurrent sessions)
    4. Store session in Redis with 30-minute TTL
    5. Audit log: `'view_as.start'` via `AuditService.logPiiAccess()` (fire-and-forget)
    6. Return: `{ sessionId, targetRole, targetLgaId, expiresAt }`
  - [ ] 1.4 Implement `endViewAs()`:
    1. Fetch session from Redis
    2. Compute duration: `NOW - startedAt` (in seconds)
    3. Delete from Redis
    4. Audit log: `'view_as.end'` with `{ duration, targetRole }`
    5. Return: `{ duration }`
- [ ] Task 2: Create View-As API middleware (AC: #5, #7)
  - [ ] 2.1 Create `apps/api/src/middleware/view-as.middleware.ts`:
    - `attachViewAsState` — middleware that checks Redis for active View-As session and attaches to `req.viewAs` (run after `authenticate`)
    - `blockMutationsInViewAs` — middleware that rejects POST/PUT/PATCH/DELETE when `req.viewAs` is active (returns 403 "Actions disabled in View-As mode")
  - [ ] 2.2 Implement `attachViewAsState`:
    ```typescript
    export const attachViewAsState = async (req, res, next) => {
      if (!req.user) return next();
      const viewAsState = await ViewAsService.getViewAsState(req.user.sub);
      if (viewAsState) {
        req.viewAs = viewAsState; // { targetRole, targetLgaId, startedAt, expiresAt }
      }
      next();
    };
    ```
  - [ ] 2.3 Implement `blockMutationsInViewAs`:
    ```typescript
    export const blockMutationsInViewAs = (req, res, next) => {
      if (req.viewAs && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        return next(new AppError('VIEW_AS_READ_ONLY', 'Actions disabled in View-As mode', 403));
      }
      next();
    };
    ```
  - [ ] 2.4 Apply middleware: Mount `attachViewAsState` globally after `authenticate` in app-level middleware chain. Mount `blockMutationsInViewAs` on routes that should be blocked during View-As (all role-specific data routes, NOT the View-As management endpoints themselves)
  - [ ] 2.5 Extend `req` type in Express: add `viewAs?: { targetRole: string; targetLgaId?: string; startedAt: string; expiresAt: string }` to the Request type declaration
- [ ] Task 3: Create View-As API endpoints (AC: #1, #3, #4)
  - [ ] 3.1 Create `apps/api/src/routes/view-as.routes.ts`:
    - `POST /view-as/start` — start View-As session (Super Admin only)
    - `POST /view-as/end` — end View-As session (Super Admin only)
    - `GET /view-as/current` — get current View-As state (Super Admin only)
  - [ ] 3.2 Create `apps/api/src/controllers/view-as.controller.ts`:
    - `startViewAs(req, res)` — validates input, calls service, returns session info
    - `endViewAs(req, res)` — calls service, returns duration
    - `getCurrentState(req, res)` — returns active state or `{ active: false }`
  - [ ] 3.3 Mount in `apps/api/src/routes/index.ts`: `router.use('/view-as', viewAsRoutes)`
  - [ ] 3.4 Add Zod validation schemas:
    - `startViewAsSchema`: `{ targetRole: z.enum([supervisor, enumerator, data_entry_clerk, verification_assessor, government_official]), targetLgaId: z.string().uuid().optional(), reason: z.string().max(500).optional() }`
    - Conditional validation: if targetRole is `enumerator` or `supervisor`, `targetLgaId` is required
  - [ ] 3.5 All routes: `authenticate → authorize('super_admin') → controller`
- [ ] Task 4: Create View-As data proxy endpoints (AC: #1, #6)
  - [ ] 4.1 Create `apps/api/src/routes/view-as-data.routes.ts`:
    - Proxy endpoints that return data scoped to the View-As role's perspective
    - `GET /view-as/data/dashboard` — returns target role's dashboard data (home page widgets/stats)
    - `GET /view-as/data/sidebar` — returns target role's sidebar items
    - `GET /view-as/data/:resource` — generic proxy for role-scoped data (surveys, submissions, team, etc.)
  - [ ] 4.2 Implement data scoping:
    - When View-As is active, data queries use `targetRole` and `targetLgaId` for filtering
    - For Enumerator: show surveys assigned to that LGA, submission stats for LGA
    - For Supervisor: show team members in that LGA, productivity for LGA
    - For Assessor: show audit queue items
    - For Official: show read-only statistics/reports
    - For Clerk: show data entry queue for LGA
  - [ ] 4.3 All proxy endpoints are GET-only (read-only by design, no mutation proxy needed)
  - [ ] 4.4 Mount: `router.use('/view-as/data', authenticate, authorize('super_admin'), attachViewAsState, viewAsDataRoutes)`
- [ ] Task 5: Create ViewAsProvider React context (AC: #2, #5, #7)
  - [ ] 5.1 Create `apps/web/src/features/dashboard/context/ViewAsContext.tsx`:
    ```typescript
    interface ViewAsState {
      isViewingAs: boolean;
      targetRole: UserRole | null;
      targetLgaId: string | null;
      startedAt: string | null;
      expiresAt: string | null;
    }

    interface ViewAsContextValue extends ViewAsState {
      startViewAs: (targetRole: UserRole, targetLgaId?: string, reason?: string) => Promise<void>;
      exitViewAs: () => Promise<void>;
      blockAction: (actionName?: string) => boolean; // Returns true + shows toast if blocked
    }
    ```
  - [ ] 5.2 Implement `ViewAsProvider`:
    - On mount: check `GET /view-as/current` to restore state if View-As was active
    - `startViewAs()`: call `POST /view-as/start`, update context state, navigate to `/dashboard/super-admin/view-as/${targetRole}`
    - `exitViewAs()`: call `POST /view-as/end`, clear context state, navigate back to `/dashboard/super-admin`
    - `blockAction()`: if `isViewingAs`, show toast "Actions disabled in View-As mode", return true (blocked)
    - Auto-expire: if `expiresAt` passes, call `exitViewAs()` automatically
  - [ ] 5.3 Export `useViewAs()` hook for consuming components
  - [ ] 5.4 Wrap the View-As routes in `App.tsx` with `<ViewAsProvider>` (only within the `/view-as/*` route subtree)
- [ ] Task 6: Create View-As role selector page (AC: #1)
  - [ ] 6.1 Create `apps/web/src/features/dashboard/pages/ViewAsPage.tsx`:
    - Card-based role selector grid (one card per viewable role)
    - Each card shows: role icon, role display name, brief description
    - Viewable roles: Supervisor, Enumerator, Data Entry Clerk, Verification Assessor, Government Official
    - Excluded: Super Admin (self), Public User (different auth context)
  - [ ] 6.2 For field roles (Enumerator, Supervisor), show LGA dropdown after role selection:
    - Fetch LGAs via existing `GET /api/v1/lgas` endpoint
    - Required selection before proceeding
    - Label: "Select LGA to view as"
  - [ ] 6.3 Optional reason field:
    - Textarea: "Reason for viewing (optional)" — max 500 chars
    - Placeholder: "e.g., Debugging reported issue, Stakeholder demo, User support"
  - [ ] 6.4 "Start Viewing" button → calls `startViewAs()` from ViewAsContext → navigates to `/dashboard/super-admin/view-as/${role}`
- [ ] Task 7: Create View-As dashboard shell and target role rendering (AC: #1, #6)
  - [ ] 7.1 Create `apps/web/src/features/dashboard/pages/ViewAsDashboardPage.tsx`:
    - Read `role` from URL params (`:role`)
    - Render target role's home page component within a View-As shell:
      - ViewAsBanner at top (Task 8)
      - Target role's sidebar items (from `sidebarConfig[targetRole]` with modified hrefs → `/dashboard/super-admin/view-as/${role}/*`)
      - Target role's page content (lazy-loaded, existing components)
    - Catch-all nested routes for sub-pages (surveys, team, messages, etc.)
  - [ ] 7.2 Map target role routes to existing page components:
    ```typescript
    // Route mapping for View-As rendering
    const viewAsRouteMap: Record<string, Record<string, LazyComponent>> = {
      enumerator: {
        '': EnumeratorHome,
        'survey': EnumeratorSurveysPage,
        'drafts': EnumeratorDraftsPage,
        'sync': EnumeratorSyncPage,
        'messages': EnumeratorMessagesPage,
      },
      supervisor: {
        '': SupervisorHome,
        'team': SupervisorTeamPage,
        'productivity': SupervisorProductivityPage,
        'registry': RespondentRegistryPage,
        'fraud': SupervisorFraudPage,
        'messages': SupervisorMessagesPage,
      },
      // ... other roles
    };
    ```
  - [ ] 7.3 All rendered components receive data from View-As data proxy endpoints (Task 4), NOT from the actual role's API endpoints
  - [ ] 7.4 Disable all interactive elements: buttons, forms, file uploads, toggles — use `useViewAs().blockAction()` in component event handlers
  - [ ] 7.5 Handle components that call `useAuth()`: the ViewAsProvider should NOT override `useAuth()` — instead, components check `useViewAs().isViewingAs` to disable actions. The `useAuth()` hook continues to return the Super Admin's real identity.
- [ ] Task 8: Create View-As banner component (AC: #2)
  - [ ] 8.1 Create `apps/web/src/features/dashboard/components/ViewAsBanner.tsx`:
    - Fixed position at top of View-As layout (not dismissible — must always be visible)
    - Content: "Viewing as: [Role Display Name] — Read Only"
    - Sub-text: "Logged in as: [Admin Full Name] | LGA: [LGA Name] (if field role)"
    - "Exit View-As" button (prominent, right-aligned)
    - Color scheme: amber/gold background (`bg-amber-500 text-white`) — distinctive from error red or success green
    - Timer: show elapsed time since session start (optional, nice-to-have)
    - `aria-live="assertive"` for screen reader accessibility
  - [ ] 8.2 Responsive: on mobile, stack text above button
  - [ ] 8.3 "Exit View-As" button calls `useViewAs().exitViewAs()` → returns to `/dashboard/super-admin`
- [ ] Task 9: Wire up frontend routing and sidebar (AC: #1)
  - [ ] 9.1 Add sidebar item in `sidebarConfig.ts` for Super Admin (after 'Staff Management'):
    ```typescript
    { label: 'View As', href: '/dashboard/super-admin/view-as', icon: Eye },
    ```
    Import `Eye` from `lucide-react`.
  - [ ] 9.2 Add lazy imports in `App.tsx`:
    ```typescript
    const ViewAsPage = lazy(() => import('./features/dashboard/pages/ViewAsPage'));
    const ViewAsDashboardPage = lazy(() => import('./features/dashboard/pages/ViewAsDashboardPage'));
    ```
  - [ ] 9.3 Add routes under super-admin routes (App.tsx):
    ```typescript
    {/* Story 6.7: View-As Feature */}
    <Route path="view-as" element={<Suspense fallback={<DashboardLoadingFallback />}><ViewAsPage /></Suspense>} />
    <Route path="view-as/:role" element={<ViewAsProvider><Suspense fallback={<DashboardLoadingFallback />}><ViewAsDashboardPage /></Suspense></ViewAsProvider>} />
    <Route path="view-as/:role/*" element={<ViewAsProvider><Suspense fallback={<DashboardLoadingFallback />}><ViewAsDashboardPage /></Suspense></ViewAsProvider>} />
    ```
  - [ ] 9.4 The `ViewAsDashboardPage` renders its own sidebar (target role's items) and banner, replacing the normal DashboardLayout sidebar content for that subtree
- [ ] Task 10: Add API client and hooks (AC: #1, #3, #4)
  - [ ] 10.1 Create `apps/web/src/features/dashboard/api/view-as.api.ts`:
    - `startViewAs(data)` — POST `/view-as/start`
    - `endViewAs()` — POST `/view-as/end`
    - `getCurrentViewAs()` — GET `/view-as/current`
    - `getViewAsDashboardData(role, lgaId?)` — GET `/view-as/data/dashboard`
    - `getViewAsSidebarItems(role)` — GET `/view-as/data/sidebar`
  - [ ] 10.2 Create `apps/web/src/features/dashboard/hooks/useViewAs.ts`:
    - `useViewAsState()` — TanStack Query for current state, staleTime: 0 (always fresh)
    - `useStartViewAs()` — mutation hook
    - `useEndViewAs()` — mutation hook
    - `useViewAsDashboardData(role, lgaId)` — TanStack Query for dashboard data
- [ ] Task 11: Add backend tests (AC: #8)
  - [ ] 11.1 Create `apps/api/src/services/__tests__/view-as.service.test.ts`:
    - Test: `startViewAs()` stores session in Redis with correct TTL
    - Test: `startViewAs()` rejects `super_admin` as target role → 400
    - Test: `startViewAs()` rejects `public_user` as target role → 400
    - Test: `startViewAs()` requires LGA for field roles (enumerator, supervisor) → 400
    - Test: `startViewAs()` rejects if View-As session already active → 409
    - Test: `endViewAs()` removes session from Redis and returns duration
    - Test: `endViewAs()` when no session active → 404
    - Test: `getViewAsState()` returns null when no session active
    - Test: `getViewAsState()` returns session data when active
    - Test: session auto-expires after TTL (30 minutes)
  - [ ] 11.2 Create `apps/api/src/middleware/__tests__/view-as.middleware.test.ts`:
    - Test: `attachViewAsState` populates `req.viewAs` when session active
    - Test: `attachViewAsState` does nothing when no session active
    - Test: `blockMutationsInViewAs` blocks POST requests when View-As active → 403
    - Test: `blockMutationsInViewAs` blocks PUT/PATCH/DELETE when View-As active → 403
    - Test: `blockMutationsInViewAs` allows GET requests when View-As active
    - Test: `blockMutationsInViewAs` does nothing when no View-As session
  - [ ] 11.3 Create `apps/api/src/controllers/__tests__/view-as.controller.test.ts`:
    - Test: `POST /view-as/start` returns session info for valid request
    - Test: `POST /view-as/start` returns 403 for non-Super Admin
    - Test: `POST /view-as/start` returns 401 for unauthenticated
    - Test: `POST /view-as/end` returns duration
    - Test: `GET /view-as/current` returns `{ active: false }` when no session
    - Test: audit log created on start and end
- [ ] Task 12: Add frontend tests (AC: #8)
  - [ ] 12.1 Create `apps/web/src/features/dashboard/pages/__tests__/ViewAsPage.test.tsx`:
    - Test: renders role selector grid with 5 viewable roles
    - Test: excludes Super Admin and Public User from role grid
    - Test: shows LGA dropdown when field role selected
    - Test: "Start Viewing" button disabled until role selected
    - Test: "Start Viewing" button disabled until LGA selected (for field roles)
    - Test: navigates to View-As dashboard on success
  - [ ] 12.2 Create `apps/web/src/features/dashboard/pages/__tests__/ViewAsDashboardPage.test.tsx`:
    - Test: renders target role's sidebar items
    - Test: renders ViewAsBanner with correct role name
    - Test: renders target role's home page component
    - Test: disables mutation actions (buttons greyed out)
    - Test: shows toast when disabled action clicked
  - [ ] 12.3 Create `apps/web/src/features/dashboard/components/__tests__/ViewAsBanner.test.tsx`:
    - Test: displays role name and "Read Only" text
    - Test: displays admin's original name
    - Test: "Exit View-As" button calls exitViewAs
    - Test: banner is not dismissible (no close button)
  - [ ] 12.4 Create `apps/web/src/features/dashboard/context/__tests__/ViewAsContext.test.tsx`:
    - Test: `blockAction()` returns true and shows toast when View-As active
    - Test: `blockAction()` returns false when not in View-As mode
    - Test: `startViewAs()` transitions state correctly
    - Test: `exitViewAs()` clears state and navigates to admin dashboard
- [ ] Task 13: Run full test suites and verify zero regressions (AC: #8)
  - [ ] 13.1 Run API tests: `pnpm vitest run apps/api/src/`
  - [ ] 13.2 Run web tests: `cd apps/web && pnpm vitest run`
- [ ] Task 14: Update story status and dev agent record

## Dev Notes

### Authentication Strategy: Redis Session Metadata (Recommended by prep-6)

**Why NOT modify JWT tokens:**
- JWT re-issuance requires token rotation logic
- Short-lived View-As tokens complicate the 15-minute access/7-day refresh cycle
- Two tokens in flight increases complexity and attack surface

**Redis approach:**
```typescript
// Redis key: view_as:{adminId}
// TTL: 30 minutes (auto-expire safety net)
const viewAsSession = {
  targetRole: 'enumerator',
  targetLgaId: 'uuid-of-selected-lga',
  reason: 'Debugging reported issue',
  startedAt: '2026-02-24T14:30:00.000Z',
  expiresAt: '2026-02-24T15:00:00.000Z',
};

// Store
await redis.set(`view_as:${adminId}`, JSON.stringify(viewAsSession), 'EX', 1800);

// Retrieve
const state = await redis.get(`view_as:${adminId}`);

// Delete (on exit)
await redis.del(`view_as:${adminId}`);
```

The Super Admin's original JWT and session remain completely untouched. `req.user` always reflects the real admin. The View-As state is an overlay, not a replacement.

### Frontend Rendering: Component Import Strategy

Target role's page components are imported and rendered under `/dashboard/super-admin/view-as/:role/*` — they never touch the actual role's route prefix.

```typescript
// ViewAsDashboardPage.tsx
const { role } = useParams<{ role: string }>();
const { isViewingAs, targetRole } = useViewAs();

// Get sidebar items for target role (from sidebarConfig)
const targetSidebarItems = sidebarConfig[role as UserRole]?.map(item => ({
  ...item,
  // Rewrite hrefs: /dashboard/enumerator/survey → /dashboard/super-admin/view-as/enumerator/survey
  href: item.href.replace(`/dashboard/${role}`, `/dashboard/super-admin/view-as/${role}`),
}));

// Render target role's component tree
return (
  <div>
    <ViewAsBanner />
    <div className="flex">
      <ViewAsSidebar items={targetSidebarItems} />
      <main>
        <Routes>
          {viewAsRouteMap[role]?.map(({ path, Component }) => (
            <Route key={path} path={path} element={<Component />} />
          ))}
        </Routes>
      </main>
    </div>
  </div>
);
```

### Read-Only Enforcement: Dual Layer

**Layer 1 — API Middleware (safety net):**
```typescript
// view-as.middleware.ts
export const blockMutationsInViewAs = (req, res, next) => {
  if (req.viewAs && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next(new AppError('VIEW_AS_READ_ONLY', 'Actions disabled in View-As mode', 403));
  }
  next();
};
```

**Layer 2 — Frontend Context (UX):**
```typescript
// In any component
const { isViewingAs, blockAction } = useViewAs();

const handleSubmit = () => {
  if (blockAction('submit form')) return; // Shows toast, returns true
  // ... normal submit logic
};

// Disable button visually
<Button disabled={isViewingAs} onClick={handleSubmit}>Submit</Button>
```

### useAuth() vs useViewAs() — No Override

**Critical**: `useAuth()` ALWAYS returns the real Super Admin's identity. The View-As feature does NOT monkey-patch the auth context. Instead:

- `useAuth()` → `{ user: { id: adminId, role: 'super_admin', ... } }` (unchanged)
- `useViewAs()` → `{ isViewingAs: true, targetRole: 'enumerator', targetLgaId: '...', blockAction, exitViewAs }`

Components that need View-As awareness check `useViewAs().isViewingAs`. Components that don't (pure display) work unchanged. This prevents any accidental privilege leakage.

### Viewable Roles (Exclude 2)

| Role | Viewable | Reason |
|------|----------|--------|
| Supervisor | Yes | Field role with team management |
| Enumerator | Yes | Field role with survey filling |
| Data Entry Clerk | Yes | Back-office data entry |
| Verification Assessor | Yes | Audit queue workflow |
| Government Official | Yes | Read-only statistics |
| Super Admin | **No** | Cannot view-as self |
| Public User | **No** | Different auth context (OAuth/public registration) |

### LGA Scoping for Field Roles

Field roles (Enumerator, Supervisor) are LGA-locked. The View-As selector MUST require LGA selection for these roles:

```typescript
// In ViewAsPage.tsx
const needsLga = ['enumerator', 'supervisor'].includes(selectedRole);

{needsLga && (
  <Select value={selectedLga} onChange={setSelectedLga}>
    <option value="">Select LGA...</option>
    {lgas.map(lga => <option key={lga.id} value={lga.id}>{lga.name}</option>)}
  </Select>
)}

<Button disabled={!selectedRole || (needsLga && !selectedLga)}>
  Start Viewing
</Button>
```

### Audit Trail Events

```typescript
// New audit action types
const VIEW_AS_ACTIONS = {
  START: 'view_as.start',
  END: 'view_as.end',
};

// Start event details
AuditService.logPiiAccess(req, 'view_as.start', 'user', adminId, {
  targetRole: 'enumerator',
  targetLgaId: 'uuid',
  reason: 'Debugging reported issue',
});

// End event details
AuditService.logPiiAccess(req, 'view_as.end', 'user', adminId, {
  targetRole: 'enumerator',
  targetLgaId: 'uuid',
  duration: 847, // seconds
});
```

### Banner Component Design

```typescript
// ViewAsBanner.tsx
<div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between"
     role="alert"
     aria-live="assertive">
  <div className="flex items-center gap-2">
    <Eye className="w-5 h-5" />
    <span className="font-semibold">
      Viewing as: {roleDisplayName} — Read Only
    </span>
    <span className="text-amber-100 text-sm ml-2">
      Logged in as: {adminName}
      {targetLgaName && ` | LGA: ${targetLgaName}`}
    </span>
  </div>
  <Button
    variant="outline"
    size="sm"
    className="border-white text-white hover:bg-amber-600"
    onClick={exitViewAs}
    data-testid="exit-view-as"
  >
    Exit View-As
  </Button>
</div>
```

### Data Proxy vs Direct API Calls

Target role components normally call their own APIs (e.g., `GET /api/v1/supervisor/team`). In View-As mode, these calls should be proxied or intercepted:

**Option A — API proxy endpoints** (recommended for safety):
- Create `/view-as/data/*` endpoints that return role-scoped data
- Components in View-As mode call proxy endpoints instead

**Option B — Axios interceptor** (simpler but less isolated):
- Add `X-View-As-Role` and `X-View-As-LGA` headers to requests during View-As
- Backend middleware uses these headers for data scoping

Recommendation: Start with **Option A** (explicit proxy) for maximum safety, migrate to Option B if proxy maintenance becomes burdensome. The proxy approach ensures View-As NEVER accidentally hits real role endpoints.

### File Change Scope

**New files (backend):**
- `apps/api/src/services/view-as.service.ts` — View-As session management (Redis)
- `apps/api/src/middleware/view-as.middleware.ts` — attachViewAsState + blockMutationsInViewAs
- `apps/api/src/controllers/view-as.controller.ts` — Start/end/current handlers
- `apps/api/src/routes/view-as.routes.ts` — View-As management routes
- `apps/api/src/routes/view-as-data.routes.ts` — Data proxy routes
- `apps/api/src/services/__tests__/view-as.service.test.ts`
- `apps/api/src/middleware/__tests__/view-as.middleware.test.ts`
- `apps/api/src/controllers/__tests__/view-as.controller.test.ts`

**New files (frontend):**
- `apps/web/src/features/dashboard/context/ViewAsContext.tsx` — ViewAsProvider + useViewAs()
- `apps/web/src/features/dashboard/pages/ViewAsPage.tsx` — Role selector
- `apps/web/src/features/dashboard/pages/ViewAsDashboardPage.tsx` — View-As dashboard shell
- `apps/web/src/features/dashboard/components/ViewAsBanner.tsx` — Read-only banner
- `apps/web/src/features/dashboard/components/ViewAsSidebar.tsx` — Target role's sidebar
- `apps/web/src/features/dashboard/api/view-as.api.ts` — API client
- `apps/web/src/features/dashboard/hooks/useViewAsHooks.ts` — TanStack Query hooks
- `apps/web/src/features/dashboard/pages/__tests__/ViewAsPage.test.tsx`
- `apps/web/src/features/dashboard/pages/__tests__/ViewAsDashboardPage.test.tsx`
- `apps/web/src/features/dashboard/components/__tests__/ViewAsBanner.test.tsx`
- `apps/web/src/features/dashboard/context/__tests__/ViewAsContext.test.tsx`

**Modified files:**
- `apps/api/src/routes/index.ts` — Mount View-As routes
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — Add "View As" sidebar item for Super Admin
- `apps/web/src/App.tsx` — Add lazy imports + View-As routes under super-admin

**Schema changes:** None. Uses Redis for session state, not database tables.

### Project Structure Notes

- Backend: new `view-as.*` files (service, middleware, controller, routes) — NOT extending remuneration infrastructure
- Frontend: new components within `apps/web/src/features/dashboard/` (View-As is a dashboard feature, not a separate feature directory)
- ViewAsContext is scoped to View-As route subtree only — NOT app-wide
- Redis key namespace: `view_as:` (alongside existing `session:` and `user_session:` namespaces)

### Testing Standards

- Use `vi.hoisted()` + `vi.mock()` pattern for controller/middleware tests
- Mock Redis operations for service tests (mock `ioredis`)
- Use `data-testid` selectors in frontend tests (A3: no CSS class selectors)
- Mock `useAuth()` to return Super Admin user in all View-As tests
- Run web tests: `cd apps/web && pnpm vitest run`
- Run API tests: `pnpm vitest run apps/api/src/`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#L1902-1924] — Story 6-7 acceptance criteria + security notes
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-016] — Strict route isolation mandate
- [Source: _bmad-output/implementation-artifacts/prep-6-view-as-authentication-spike.md] — Full design blueprint (auth strategies, frontend rendering, read-only enforcement, audit trail, security analysis)
- [Source: apps/api/src/middleware/auth.ts#L19-107] — Authentication middleware (JWT verification, session validation)
- [Source: apps/api/src/middleware/rbac.ts#L9-55] — RBAC middleware (authorize, requireLgaLock)
- [Source: apps/api/src/services/token.service.ts#L37-58] — JWT token generation (payload structure, expiry)
- [Source: apps/api/src/services/session.service.ts#L39-150] — Redis session management (keys, TTL, validation)
- [Source: apps/api/src/services/audit.service.ts#L21-97] — AuditService (PII_ACTIONS, logPiiAccess, logPiiAccessTx)
- [Source: apps/web/src/features/auth/context/AuthContext.tsx#L21-548] — AuthContext (AuthState, useAuth, login/logout)
- [Source: apps/web/src/features/auth/components/ProtectedRoute.tsx#L44-86] — ProtectedRoute (role checking, redirects)
- [Source: apps/web/src/layouts/DashboardLayout.tsx#L1-187] — Dashboard layout (sidebar, header, banner placement)
- [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts#L134-150] — Super Admin sidebar (15 items, add View As)
- [Source: apps/web/src/App.tsx#L570-676] — Super Admin routes (add view-as routes)
- [Source: apps/web/src/components/SWUpdateBanner.tsx#L1-35] — Banner component pattern (fixed, accessible)
- [Source: packages/types/src/constants.ts#L1-9] — UserRole enum
- [Source: packages/types/src/auth.ts] — JwtPayload interface

### Previous Story Intelligence

**From Story 6-6 (Payment Dispute Resolution Queue):**
- Split-panel layout patterns (not directly applicable but shows complex page patterns)
- State machine transition validation (View-As has simple start/end lifecycle)
- Worker registration pattern (not needed here — no background jobs)
- Socket.io notification patterns (View-As should suppress socket events to avoid confusion)

**From Story 6-5 (Staff Payment History & Dispute):**
- AlertDialog pattern (may be used for "Confirm Start View-As" dialog)
- Extending existing hooks/API files pattern

**From Story 6-1 (Immutable Audit Logs):**
- Expanded `AUDIT_ACTIONS` constant — add `VIEW_AS_START`, `VIEW_AS_END`
- `logPiiAccess()` fire-and-forget for View-As events (non-blocking)

**From prep-6 (View-As Authentication Spike — design source):**
- Complete comparison of 4 auth strategies → Redis session metadata recommended
- Complete comparison of 3 frontend strategies → Component import recommended
- Security threat model with mitigations
- API endpoint design with request/response shapes
- Rate limiting recommendation: max 30-minute session, max 1 concurrent View-As per admin

### Git Intelligence

Recent commits are Epic 5 completions and Epic 6 prep:
- `c240b19 fix(web): add consistent p-6 padding to 3 dashboard pages (prep-2)` — latest
- `bd5a443 docs: complete Epic 5 retrospective and define Epic 6 prep phase`
- `92f8a2b fix(api,web): use dynamic productivity targets across all dashboards`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### Change Log

### File List
