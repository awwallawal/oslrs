# Story 6.7: Super Admin View-As Feature

Status: done

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

- [x] Task 1: Implement View-As session management via Redis (AC: #3, #4, #7)
  - [x] 1.1 Create `apps/api/src/services/view-as.service.ts`: startViewAs, endViewAs, getViewAsState, isViewingAs
  - [x] 1.2 Implement Redis session storage: key `view_as:{adminId}`, 30-min TTL
  - [x] 1.3 Implement `startViewAs()`: role validation, LGA requirement for field roles, concurrent session prevention, audit log
  - [x] 1.4 Implement `endViewAs()`: fetch session, compute duration, delete from Redis, audit log
- [x] Task 2: Create View-As API middleware (AC: #5, #7)
  - [x] 2.1 Create `apps/api/src/middleware/view-as.middleware.ts`: attachViewAsState + blockMutationsInViewAs
  - [x] 2.2 Implement `attachViewAsState`: reads Redis, attaches to req.viewAs
  - [x] 2.3 Implement `blockMutationsInViewAs`: rejects POST/PUT/PATCH/DELETE with 403
  - [x] 2.4 Apply middleware
  - [x] 2.5 Extend `req` type in Express: added `viewAs?` to global Express.Request in types.d.ts
- [x] Task 3: Create View-As API endpoints (AC: #1, #3, #4)
  - [x] 3.1 Create `apps/api/src/routes/view-as.routes.ts`: POST /start, POST /end, GET /current
  - [x] 3.2 Create `apps/api/src/controllers/view-as.controller.ts`: Zod validation, handlers
  - [x] 3.3 Mount in `apps/api/src/routes/index.ts`
  - [x] 3.4 Add Zod validation schemas with `.refine()` for conditional LGA requirement
  - [x] 3.5 All routes: authenticate → authorize('super_admin') → controller
- [x] Task 4: Create View-As data proxy endpoints (AC: #1, #6)
  - [x] 4.1 Create `apps/api/src/routes/view-as-data.routes.ts`: GET /dashboard, GET /sidebar
  - [x] 4.2 Create `apps/api/src/services/view-as-data.service.ts`: role-specific dashboard summaries
  - [x] 4.3 All proxy endpoints are GET-only
  - [x] 4.4 Mount in routes/index.ts
- [x] Task 5: Create ViewAsProvider React context (AC: #2, #5, #7)
  - [x] 5.1 Create `apps/web/src/features/dashboard/context/ViewAsContext.tsx`
  - [x] 5.2 Implement ViewAsProvider: auto-expire timer, blockAction toast, exitViewAs
  - [x] 5.3 Export `useViewAs()` hook
  - [x] 5.4 Wrap View-As routes in App.tsx with `<ViewAsProvider>` (scoped to /view-as/* subtree)
- [x] Task 6: Create View-As role selector page (AC: #1)
  - [x] 6.1 Create `apps/web/src/features/dashboard/pages/ViewAsPage.tsx`: role grid (5 roles), LGA dropdown, reason field
  - [x] 6.2 LGA dropdown for field roles (enumerator, supervisor)
  - [x] 6.3 Optional reason textarea (max 500 chars)
  - [x] 6.4 "Start Viewing" button with validation
- [x] Task 7: Create View-As dashboard shell and target role rendering (AC: #1, #6)
  - [x] 7.1 Create `apps/web/src/features/dashboard/pages/ViewAsDashboardPage.tsx`: sidebar, banner, dashboard cards
  - [x] 7.2 SIDEBAR_MAP and ICON_MAP for role-specific rendering
  - [x] 7.3 Components receive data from View-As data proxy endpoints
  - [x] 7.4 Interactive elements disabled via useViewAs().blockAction()
  - [x] 7.5 useAuth() returns real Super Admin identity (no override)
- [x] Task 8: Create View-As banner component (AC: #2)
  - [x] 8.1 Create `apps/web/src/features/dashboard/components/ViewAsBanner.tsx`: amber banner, role name, admin identity, exit button
  - [x] 8.2 Responsive layout
  - [x] 8.3 "Exit View-As" button calls exitViewAs()
- [x] Task 9: Wire up frontend routing and sidebar (AC: #1)
  - [x] 9.1 Add "View As" sidebar item with Eye icon in sidebarConfig.ts
  - [x] 9.2 Add lazy imports for ViewAsPage and ViewAsDashboardPage in App.tsx
  - [x] 9.3 Add 3 routes: /view-as, /view-as/:role, /view-as/:role/*
  - [x] 9.4 ViewAsDashboardPage renders its own sidebar and banner
- [x] Task 10: Add API client and hooks (AC: #1, #3, #4)
  - [x] 10.1 Create `apps/web/src/features/dashboard/api/view-as.api.ts`
  - [x] 10.2 Create `apps/web/src/features/dashboard/hooks/useViewAs.ts`: TanStack Query hooks
- [x] Task 11: Add backend tests (AC: #8) — 32 tests
  - [x] 11.1 `view-as.service.test.ts`: 15 tests (session management, validation, Redis operations)
  - [x] 11.2 `view-as.middleware.test.ts`: 9 tests (attachViewAsState, blockMutationsInViewAs)
  - [x] 11.3 `view-as.controller.test.ts`: 8 tests (endpoints, auth, validation)
- [x] Task 12: Add frontend tests (AC: #8) — 21 tests
  - [x] 12.1 `ViewAsPage.test.tsx`: 7 tests (role grid, LGA selector, validation)
  - [x] 12.2 `ViewAsDashboardPage.test.tsx`: 5 tests (sidebar, banner, cards, loading)
  - [x] 12.3 `ViewAsBanner.test.tsx`: 5 tests (display, exit button, accessibility)
  - [x] 12.4 `ViewAsContext.test.tsx`: 4 tests (blockAction, exitViewAs, target role)
- [x] Task 13: Run full test suites and verify zero regressions (AC: #8)
  - [x] 13.1 API tests: 82 files passed, 1153 tests, 0 failures
  - [x] 13.2 Web tests: 169 files passed, 1939 tests, 0 failures
- [x] Task 14: Update story status and dev agent record

### Review Follow-ups (AI) — Code Review 2026-03-01

- [x] [AI-Review][CRITICAL] C1/C2: `blockMutationsInViewAs` middleware defined but never applied — server-side mutation blocking was dead code. Fixed: integrated View-As state check + mutation blocking into `authenticate` middleware (auth.ts). Now runs for all authenticated Super Admin requests. View-As management routes (start/end/current) are excluded from blocking. [middleware/auth.ts:92-112]
- [x] [AI-Review][HIGH] H1: Unused `AUDIT_ACTIONS` import in view-as.service.ts. Fixed: removed dead import. [services/view-as.service.ts:12]
- [x] [AI-Review][HIGH] H2: Backend `/view-as/data/sidebar` endpoint never consumed — `getViewAsSidebarItems` API client function was dead code. Fixed: removed unused API function, added note about backend endpoint availability. [api/view-as.api.ts]
- [x] [AI-Review][MEDIUM] M1: ViewAsBanner showed "LGA scoped" instead of actual LGA name. Fixed: added useQuery for LGA list (uses TanStack cache from ViewAsPage), displays LGA name. [components/ViewAsBanner.tsx:43]
- [x] [AI-Review][MEDIUM] M2: `ROLE_DISPLAY_NAMES` duplicated in ViewAsBanner.tsx and ViewAsDashboardPage.tsx. Fixed: replaced with `getRoleDisplayName()` from `@oslsr/types`. [components/ViewAsBanner.tsx, pages/ViewAsDashboardPage.tsx]
- [ ] [AI-Review][MEDIUM] M3: `ViewAsProvider` eagerly imported in App.tsx (non-lazy), breaks code-splitting for View-As feature. Low impact — module is small — but should be wrapped in a lazy boundary in a future cleanup pass.
- [ ] [AI-Review][MEDIUM] M4: 5 `as any` type casts on route handlers (view-as.routes.ts, view-as-data.routes.ts). Codebase-wide pattern — defer to a global type-safety cleanup.
- [x] [AI-Review][LOW] L1: Dev Notes "File Change Scope" mentions `ViewAsSidebar.tsx` and `useViewAsHooks.ts` which don't exist. Fixed: updated naming in Dev Notes.
- [x] [AI-Review][LOW] L2: eslint-disable for react-hooks/exhaustive-deps in ViewAsContext auto-expire timer. Fixed: used useRef for stable mutation reference. [context/ViewAsContext.tsx:63]

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
- `apps/web/src/features/dashboard/api/view-as.api.ts` — API client
- `apps/web/src/features/dashboard/hooks/useViewAs.ts` — TanStack Query hooks
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

Claude Opus 4.6

### Debug Log References

- `vi.mock` hoisting error: Fixed by wrapping mock variables in `vi.hoisted()` for ESM compatibility
- Redis mock constructor error: Fixed by using `class MockRedis {}` instead of `vi.fn().mockImplementation()`
- TypeScript header type incompatibility: Created `ReqLike` interface with `headers: Record<string, string | string[] | undefined>` to match Express's IncomingHttpHeaders
- Used `AuditService.logAction()` (fire-and-forget) instead of `logPiiAccess()` which requires PiiAction type union

### Completion Notes List

- All 14 tasks completed, all 8 ACs satisfied
- 53 new tests (32 backend + 21 frontend), zero regressions
- No schema changes — uses Redis for session state
- ViewAsProvider scoped to View-As route subtree only (not app-wide)
- useAuth() always returns real Super Admin identity — no override

### Change Log

- 2026-03-01: Story implemented — all tasks 1-14 complete
  - Backend: View-As service (Redis sessions), middleware (dual-layer read-only), controller (Zod validation), routes, data proxy
  - Frontend: ViewAsContext, ViewAsPage (role selector), ViewAsDashboardPage (shell), ViewAsBanner (amber banner), API client, TanStack Query hooks
  - Tests: 32 backend + 21 frontend tests, full regression passed (1153 API + 1939 web)
- 2026-03-01: Code review (adversarial) found 10 issues (C2, H2, M4, L2) — 8 fixed post-review
  - C1/C2 FIXED: Integrated View-As mutation blocking into authenticate middleware (auth.ts)
  - H1 FIXED: Removed unused AUDIT_ACTIONS import
  - H2 FIXED: Removed dead getViewAsSidebarItems API function
  - M1 FIXED: ViewAsBanner now shows actual LGA name via cached query
  - M2 FIXED: Replaced duplicate ROLE_DISPLAY_NAMES with getRoleDisplayName() from @oslsr/types
  - M3 NOTED: ViewAsProvider eager import — deferred (low impact, small module)
  - M4 NOTED: as any casts — deferred (codebase-wide pattern)
  - L1 FIXED: Dev Notes naming corrected (ViewAsSidebar.tsx → inline, useViewAsHooks.ts → useViewAs.ts)
  - L2 FIXED: exhaustive-deps warning resolved with useRef pattern

### File List

**New files (backend):**
- `apps/api/src/services/view-as.service.ts` — Redis session management (startViewAs, endViewAs, getViewAsState, isViewingAs)
- `apps/api/src/middleware/view-as.middleware.ts` — attachViewAsState + blockMutationsInViewAs
- `apps/api/src/controllers/view-as.controller.ts` — Start/end/current handlers with Zod validation
- `apps/api/src/routes/view-as.routes.ts` — View-As management routes (POST /start, POST /end, GET /current)
- `apps/api/src/services/view-as-data.service.ts` — Role-specific dashboard data proxy
- `apps/api/src/routes/view-as-data.routes.ts` — Data proxy routes (GET /dashboard, GET /sidebar)
- `apps/api/src/services/__tests__/view-as.service.test.ts` — 15 tests
- `apps/api/src/middleware/__tests__/view-as.middleware.test.ts` — 9 tests
- `apps/api/src/controllers/__tests__/view-as.controller.test.ts` — 8 tests

**New files (frontend):**
- `apps/web/src/features/dashboard/context/ViewAsContext.tsx` — ViewAsProvider + useViewAs() hook
- `apps/web/src/features/dashboard/pages/ViewAsPage.tsx` — Role selector grid (5 roles + LGA dropdown)
- `apps/web/src/features/dashboard/pages/ViewAsDashboardPage.tsx` — View-As dashboard shell
- `apps/web/src/features/dashboard/components/ViewAsBanner.tsx` — Non-dismissible amber banner
- `apps/web/src/features/dashboard/api/view-as.api.ts` — API client functions
- `apps/web/src/features/dashboard/hooks/useViewAs.ts` — TanStack Query hooks
- `apps/web/src/features/dashboard/pages/__tests__/ViewAsPage.test.tsx` — 7 tests
- `apps/web/src/features/dashboard/pages/__tests__/ViewAsDashboardPage.test.tsx` — 5 tests
- `apps/web/src/features/dashboard/components/__tests__/ViewAsBanner.test.tsx` — 5 tests
- `apps/web/src/features/dashboard/context/__tests__/ViewAsContext.test.tsx` — 4 tests

**Modified files:**
- `apps/api/src/middleware/auth.ts` — View-As state attachment + mutation blocking for Super Admins (code review fix)
- `apps/api/src/routes/index.ts` — Mount viewAsRoutes + viewAsDataRoutes
- `apps/api/src/types.d.ts` — Added `viewAs?` property to Express.Request
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — Added "View As" sidebar item + Eye icon import
- `apps/web/src/App.tsx` — Added lazy imports + 3 View-As routes under super-admin
