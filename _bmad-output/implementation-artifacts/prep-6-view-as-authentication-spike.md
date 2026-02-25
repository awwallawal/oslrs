# Prep 6: View-As Authentication Spike

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the development team,
I want a thoroughly researched architecture design for the Super Admin "View-As" feature covering authentication context extension, permission scoping, read-only enforcement, audit trail, and frontend rendering strategy,
so that Story 6-7 implementation has a proven, decision-complete blueprint that prevents rework.

## Context

**This is a RESEARCH SPIKE, not an implementation story.** The deliverable is a spike document (`_bmad-output/implementation-artifacts/prep-6-view-as-authentication-spike-summary.md`) containing architecture decisions, comparison tables, security analysis, and recommendations. No production code changes.

### Current State

The OSLRS platform has strict role-based route isolation (ADR-016):
- **7 user roles**: Super Admin, Supervisor, Enumerator, Data Entry Clerk, Verification Assessor, Government Official, Public User
- **Each role has a distinct dashboard root**: `/dashboard/super-admin`, `/dashboard/supervisor`, `/dashboard/enumerator`, etc.
- **Strict isolation**: Each role can ONLY access their own dashboard routes — no cross-role route access
- **JWT authentication**: 15-minute access tokens with `sub` (userId), `jti` (blacklist ID), `role`, `lgaId`, `email` fields
- **Session management**: Redis-backed with inactivity (8h) and absolute (24h/30d) timeouts, single-session enforcement
- **RBAC middleware**: `authorize(...roles)` middleware on every route, LGA-locking for field staff
- **AuditService**: Fire-and-forget + transactional modes, 7 PII action types, 3 consumer controllers

### Why View-As Was Deferred

Originally planned for Epic 2.5, View-As was deferred to Epic 6 because:
1. **Requires audit infrastructure** — Story 6-1 (immutable audit logs) must exist before enabling role impersonation
2. **Security complexity** — Must preserve strict route isolation while rendering another role's UI
3. **ADR-016 mandate** — Super Admin NEVER visits other role's actual routes; View-As renders target components in Super Admin's own context

### What Needs Designing (Story 6-7)

- **No authentication context extension** — JWT/session has no "viewingAs" concept
- **No permission scoping** — No mechanism to compute what a target role would see
- **No read-only enforcement** — No API-level or frontend-level action blocking for View-As mode
- **No View-As audit events** — AuditService has no `view_as.start`, `view_as.end` actions
- **No frontend rendering strategy** — No pattern for rendering another role's dashboard components within Super Admin routes
- **No security validation** — No analysis of impersonation attack vectors or session isolation guarantees

## Acceptance Criteria

**AC1**: Given the spike is complete, when reviewed, then it contains a comparison of at least 3 authentication context strategies (JWT claim extension, Redis session metadata, separate view-as token) with pros/cons/recommendation for how to represent the "viewing as" state.

**AC2**: Given the spike document, when reviewed, then it contains a permission scoping design with: how to compute target role's visible data, which API endpoints to allow/block, how LGA-locking applies when viewing as field staff, and how role-specific features (offline sync, fraud alerts) are handled.

**AC3**: Given the spike document, when reviewed, then it contains a read-only enforcement design with: API-level middleware to block mutations during View-As, frontend-level action disabling, banner component specification ("Viewing as [Role] — Read Only"), and edge cases (WebSocket events, real-time updates).

**AC4**: Given the spike document, when reviewed, then it contains an audit trail design with: new action types (`view_as.start`, `view_as.end`, `view_as.navigate`), details schema (`viewedAsRole`, `reason`, `duration`, `pagesVisited`), and integration with existing AuditService.

**AC5**: Given the spike document, when reviewed, then it contains a frontend rendering strategy with: route design (`/dashboard/super-admin/view-as/:role`), how to render target role's page components without navigating to their actual routes, React context provider design for View-As state, and sidebar/header adaptation.

**AC6**: Given the spike document, when reviewed, then it contains a security analysis with: session isolation guarantees (no cross-contamination), prevention of privilege escalation, rate limiting on View-As sessions, mandatory reason field evaluation, and comparison with industry-standard impersonation patterns (e.g., Salesforce "Login As", AWS assume-role).

**AC7**: Given the spike document, when reviewed, then it contains an API endpoint design with: request/response shapes, middleware chain, and error handling for at least: start view-as session, end view-as session, get current view-as state.

## Tasks / Subtasks

- [x] Task 1: Research authentication context strategies (AC: #1)
  - [x] 1.1 Research JWT claim extension: add `viewAsRole` field to token payload, issue short-lived view-as token
  - [x] 1.2 Research Redis session metadata: store `viewingAs` state in existing session data without modifying JWT
  - [x] 1.3 Research separate view-as token: issue dedicated read-only token with target role permissions
  - [x] 1.4 Research header-based approach: `X-View-As-Role` header checked by middleware, no token modification
  - [x] 1.5 Document pros/cons comparison table and recommend approach
  - [x] 1.6 Evaluate impact on existing auth middleware (`apps/api/src/middleware/auth.ts`) and RBAC middleware (`apps/api/src/middleware/rbac.ts`)
- [x] Task 2: Design permission scoping for target role (AC: #2)
  - [x] 2.1 Map each role's API endpoints and data access patterns from route files
  - [x] 2.2 Design data scoping: when viewing as Enumerator, which LGA data? (use admin's LGA filter selection or specific staff member's LGA?)
  - [x] 2.3 Define endpoint allowlist per target role (read-only subset of role's normal endpoints)
  - [x] 2.4 Handle LGA-locked roles: Supervisor/Enumerator require `lgaId` — how does Super Admin specify which LGA to "view as"?
  - [x] 2.5 Handle role-specific features: offline sync (Enumerator), fraud alerts (Supervisor), messaging (Supervisor/Enumerator) — show UI but disable actions?
  - [x] 2.6 Handle Public User role: exclude from View-As? (different authentication context — OAuth/public)
- [x] Task 3: Design read-only enforcement (AC: #3)
  - [x] 3.1 Design API-level middleware: `viewAsReadOnly` middleware that blocks POST/PUT/PATCH/DELETE when View-As is active
  - [x] 3.2 Design frontend-level enforcement: React context provider (`ViewAsContext`) with `isViewingAs` flag, disable buttons/forms/actions
  - [x] 3.3 Design banner component: persistent top bar with "Viewing as [Role Name] — Read Only" text, "Exit View-As" button, role-specific color coding
  - [x] 3.4 Handle edge cases: WebSocket events during View-As (show notifications but disable actions), form submissions (prevent), file uploads (prevent)
  - [x] 3.5 Design graceful degradation: what happens if View-As session expires during navigation?
- [x] Task 4: Design audit trail for View-As sessions (AC: #4)
  - [x] 4.1 Define new audit action types: `view_as.start`, `view_as.end`, `view_as.navigate` (page change within View-As)
  - [x] 4.2 Define details schema: `{ viewedAsRole, targetLgaId?, reason?, duration?, pagesVisited?, startedAt, endedAt }`
  - [x] 4.3 Design session tracking: how to compute duration (start/end timestamps), automatic end on timeout/navigation away
  - [x] 4.4 Design "reason" field: mandatory vs optional, free-text vs dropdown (debugging, demo, user support, audit)
  - [x] 4.5 Plan integration with existing AuditService: extend `PII_ACTIONS` constant, use fire-and-forget for navigation events, transactional for start/end
- [x] Task 5: Design frontend rendering strategy (AC: #5)
  - [x] 5.1 Design route structure: `/dashboard/super-admin/view-as` (role selector page) → `/dashboard/super-admin/view-as/:role` (rendered dashboard) → `/dashboard/super-admin/view-as/:role/*` (nested pages)
  - [x] 5.2 Design component rendering: import target role's page components and render within Super Admin's route context
  - [x] 5.3 Design `ViewAsProvider` React context: provides `isViewingAs`, `viewAsRole`, `viewAsLgaId`, `exitViewAs()` to child components
  - [x] 5.4 Design sidebar adaptation: show target role's sidebar items (from existing `getSidebarItems()`) with modified hrefs pointing to `/dashboard/super-admin/view-as/:role/*`
  - [x] 5.5 Design header adaptation: show target role badge, View-As banner, original admin identity preserved
  - [x] 5.6 Evaluate lazy loading: target role's components already code-split? Need additional lazy boundaries?
- [x] Task 6: Security analysis (AC: #6)
  - [x] 6.1 Analyze session isolation: ensure View-As state cannot leak to other tabs/sessions
  - [x] 6.2 Analyze privilege escalation vectors: can View-As be used to access data beyond target role's normal scope?
  - [x] 6.3 Analyze CSRF/XSS implications: does View-As introduce new attack surfaces?
  - [x] 6.4 Design rate limiting: max concurrent View-As sessions, max session duration (e.g., 30 minutes auto-expire)
  - [x] 6.5 Evaluate mandatory reason field: compliance benefit vs UX friction
  - [x] 6.6 Research industry patterns: Salesforce "Login As", AWS STS assume-role, GitHub staff mode — extract applicable patterns
  - [x] 6.7 Document threat model: attacker scenarios, mitigations, residual risks
- [x] Task 7: Design API endpoints (AC: #7)
  - [x] 7.1 Design `POST /api/v1/view-as/start` — body: `{ targetRole, targetLgaId?, reason? }`, response: `{ sessionId, expiresAt }`
  - [x] 7.2 Design `POST /api/v1/view-as/end` — body: `{ sessionId }`, response: `{ duration, pagesVisited }`
  - [x] 7.3 Design `GET /api/v1/view-as/current` — response: `{ active, targetRole?, targetLgaId?, startedAt?, expiresAt? }`
  - [x] 7.4 Define middleware chain: `authenticate → authorize(SUPER_ADMIN) → viewAsController`
  - [x] 7.5 Define error handling: 403 if not Super Admin, 400 if invalid role, 409 if already in View-As session, 404 if session not found
- [x] Task 8: Write spike summary document (all ACs)
  - [x] 8.1 Compile all research into `_bmad-output/implementation-artifacts/prep-6-view-as-authentication-spike-summary.md`
  - [x] 8.2 Include comparison tables, decision rationale, security threat model, and implementation roadmap
  - [x] 8.3 Include reference code snippets for middleware, React context provider, and route configuration
  - [x] 8.4 Include Story 6-7 implementation checklist derived from spike findings
- [x] Task 9: Update story status and dev agent record

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: `roleComponentMap` reference code uses wrong import paths (`/supervisor/SupervisorHomePage`) and wrong component names. Actual codebase uses flat `/features/dashboard/pages/` with names like `SupervisorHome`. `SupervisorRegistryPage` doesn't exist — uses shared `RespondentRegistryPage`. [spike-summary:Section 7.2, 7.4, 11.3]
- [x] [AI-Review][HIGH] H2: `VIEW_AS_ACTIONS` defined as separate constant (Section 6.1) but Section 6.5 says "Extend PII_ACTIONS". Existing `logPiiAccess` accepts `PiiAction` type only — passing `view_as.*` values is a TypeScript compile error. Contradictory guidance for Story 6-7. [spike-summary:Section 6.1, 6.5]
- [x] [AI-Review][HIGH] H3: Clerk LGA scoping under-specified. Section 4.3 omits `viewingAsLgaId` for Clerk, but Clerk dashboard queries filter by `lgaId`. View-As Clerk would show all-LGA data (more than a real Clerk sees), breaking "see what they see" promise. [spike-summary:Section 4.2, 4.3]
- [x] [AI-Review][MEDIUM] M1: DashboardLayout nesting conflict. View-As routes nest inside `DashboardLayout` which renders super-admin sidebar. `ViewAsDashboardShell` also renders target role sidebar — would create dual sidebars. No resolution provided. [spike-summary:Section 7.1, 7.2]
- [x] [AI-Review][MEDIUM] M2: `view_as.expired` audit event designed (Section 6.1) but `getCurrentViewAs` reference code silently deletes and returns null without logging. Implementer would miss the expiry event. [spike-summary:Section 6.3, 11.1]
- [x] [AI-Review][MEDIUM] M3: `sprint-status.yaml` modification not documented in File List. [spike.md:File List]
- [x] [AI-Review][LOW] L1: Race condition in `recordNavigation` — read-modify-write on Redis pagesVisited array. Concurrent events could overwrite. Should use RPUSH or Lua script. [spike-summary:Section 11.1]
- [x] [AI-Review][LOW] L2: ViewAsContext reference code uses raw `fetch()` — should use project's TanStack Query / API client pattern for consistency. [spike-summary:Section 11.2]
- [x] [AI-Review][LOW] L3: File List marks story file as "(modified)" but it's untracked (`??`) in git — should say "(new)". [spike.md:File List]

## Dev Notes

### Architecture Decision: Strict Route Isolation (ADR-016)

**Critical constraint**: Super Admin NEVER visits other role's actual routes. From `architecture.md`:

> **Why Strict Isolation (NOT Super Admin access to all routes):**
> - Security: Prevents watering hole attacks where compromising one role's route exposes Super Admin
> - Attack Surface: If attacker breaches /dashboard/enumerator/*, they cannot exploit Super Admin visiting that route
> - 360° Visibility: Super Admin gets full system view via aggregated widgets on /dashboard/super-admin/*
> - View-As Feature: Renders target dashboard components in Super Admin's context, NEVER visits other role's actual routes

This means the frontend strategy MUST render target role components under `/dashboard/super-admin/view-as/*` routes — NOT redirect to `/dashboard/enumerator/*`.

### Current Authentication Architecture

**JWT Payload** (`packages/types/src/auth.ts`):
```typescript
interface JwtPayload {
  sub: string;        // userId (UUIDv7)
  jti: string;        // Unique token ID for blacklisting
  role: UserRole;     // User's role
  lgaId?: string;     // For field staff
  email: string;
  rememberMe: boolean;
  iat: number;
  exp: number;
}
```

**Auth Middleware Flow** (`apps/api/src/middleware/auth.ts`):
1. Extract Bearer token from `Authorization` header
2. Verify JWT signature and expiry
3. Check token blacklist in Redis (via `jti`)
4. Check token revocation by timestamp (password change)
5. Validate session (inactivity + absolute timeout)
6. Update last activity timestamp
7. Attach decoded payload to `req.user`

**RBAC Middleware** (`apps/api/src/middleware/rbac.ts`):
```typescript
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('FORBIDDEN', 'Insufficient permissions', 403));
    }
    next();
  };
};
```

**LGA-Locking** (`apps/api/src/middleware/rbac.ts`):
- Field staff (Supervisor, Enumerator) must have `lgaId` assigned
- Requests targeting a different LGA are rejected with 403

### All User Roles

```typescript
enum UserRole {
  SUPER_ADMIN = 'super_admin',
  SUPERVISOR = 'supervisor',
  ENUMERATOR = 'enumerator',
  DATA_ENTRY_CLERK = 'data_entry_clerk',
  VERIFICATION_ASSESSOR = 'verification_assessor',
  GOVERNMENT_OFFICIAL = 'government_official',
  PUBLIC_USER = 'public_user',
}
```

**Field roles** (LGA-locked via `requireLgaLock` middleware): Enumerator, Supervisor
**LGA-associated but NOT locked**: Data Entry Clerk (has `lgaId` for productivity tracking, but `requireLgaLock` does not enforce boundaries — middleware only checks `SUPERVISOR || ENUMERATOR` at `rbac.ts:37`)
**Back-office roles**: Super Admin, Government Official, Verification Assessor
**Public role**: Public User (OAuth/public auth — likely excluded from View-As)

### Existing Code to Analyze

| Component | Location | Relevance |
|-----------|----------|-----------|
| Auth middleware | `apps/api/src/middleware/auth.ts` | Extend for View-As context |
| RBAC middleware | `apps/api/src/middleware/rbac.ts` | Read-only enforcement point |
| JWT types | `packages/types/src/auth.ts` | JwtPayload extension design |
| Role constants | `packages/types/src/constants.ts` | UserRole enum, display names |
| Sidebar config | `apps/web/src/features/dashboard/config/sidebarConfig.ts` | `getSidebarItems()`, `roleRouteMap` |
| Dashboard layout | `apps/web/src/layouts/DashboardLayout.tsx` | Role-based rendering, sidebar, header |
| AuditService | `apps/api/src/services/audit.service.ts` | Add View-As action types |
| Audit schema | `apps/api/src/db/schema/audit.ts` | Details JSONB for View-As metadata |
| TokenService | `apps/api/src/services/token.service.ts` | Token issuance, session management |
| App routes | `apps/web/src/App.tsx` | Role-based route definitions |
| useAuth hook | `apps/web/src/features/auth/context/AuthContext.tsx:542` (re-exported via `features/auth/index.ts`) | Frontend auth state management |

### Key Design Decisions to Research

**1. Authentication Context Strategy:**

| Strategy | Mechanism | Pros | Cons |
|----------|-----------|------|------|
| JWT claim extension | Add `viewAsRole` to JWT, issue new short-lived token | Stateless, travels with every request | Requires re-issuing token, short-lived or security risk |
| Redis session metadata | Store `viewingAs` in Redis session data | No token change, server-side control, easy invalidation | Server-side state, must pass to every middleware |
| Separate view-as token | Issue dedicated read-only token | Clean separation, explicit permissions | Complex token management, two tokens in flight |
| Header-based | `X-View-As-Role` header, middleware checks | Simplest, no token/session changes | Easily forged if not properly validated server-side |

**2. Frontend Rendering Strategy:**

| Approach | Mechanism | Pros | Cons |
|----------|-----------|------|------|
| Component import | Import target role's page components, render under `/view-as/:role/*` | True isolation, components work as-is | Must map all routes manually, maintenance burden |
| iframe sandbox | Render target dashboard in sandboxed iframe | Perfect isolation, no component coupling | Poor UX, styling issues, communication overhead |
| Role context override | Override `useAuth()` role temporarily, render same components | Minimal code, reuses existing components | Risk of actual permission leakage, hooks may fire mutations |

**3. Read-Only Enforcement:**

| Layer | Mechanism | Coverage |
|-------|-----------|----------|
| API middleware | Block POST/PUT/PATCH/DELETE when View-As active | Backend safety net |
| Frontend context | `isViewingAs` flag disables buttons/forms | UX clarity |
| Route guards | View-As routes only mount read-only variants | Component-level |
| WebSocket filter | Suppress action-triggering socket events | Real-time safety |

### Story 6-7 Acceptance Criteria (from epics.md)

1. Super Admin at `/dashboard/super-admin/view-as/:role` selects role → target dashboard renders in sandboxed context
2. Prominent banner: "Viewing as [Role] — Read Only"
3. Full audit trail: who viewed as whom, start/end timestamps, duration
4. Actions blocked with "Actions disabled in View-As mode" message
5. Super Admin session remains isolated — no cross-contamination
6. View-As does NOT grant access to other role's actual routes (strict isolation)

### Spike Document Template

The output document should follow this structure:
1. Executive Summary
2. Current Authentication Architecture (JWT, session, RBAC)
3. Authentication Context Strategy (comparison + recommendation)
4. Permission Scoping Design (per-role endpoint mapping)
5. Read-Only Enforcement (API + frontend layers)
6. Audit Trail Design (new action types, details schema)
7. Frontend Rendering Strategy (routing, component import, context provider)
8. API Endpoint Design (request/response shapes)
9. Security Analysis & Threat Model
10. Implementation Roadmap (Story 6-7 task breakdown)
11. Reference Code Snippets (middleware, React context, route config)

### Project Structure Notes

- Spike output: `_bmad-output/implementation-artifacts/prep-6-view-as-authentication-spike-summary.md`
- No frontend changes needed for this spike
- No production code changes — research only
- Future middleware location: `apps/api/src/middleware/view-as.ts` (new file)
- Future frontend context: `apps/web/src/features/dashboard/context/ViewAsContext.tsx` (new file)
- Future route additions: `apps/web/src/App.tsx` (nested under super-admin routes)

### Testing Standards

- This is a research spike — no production code tests needed
- Reference code snippets should be syntactically valid TypeScript
- Security threat model should include testable assertions for Story 6-7 implementation
- API endpoint designs should include expected status codes and error responses
- Run existing auth tests to confirm current baseline: `pnpm vitest run apps/api/src/middleware/`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#L1902-1924] — Story 6-7 acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md#L2613] — View-As design decision and ADR-016
- [Source: _bmad-output/planning-artifacts/architecture.md#Route-Access-Control-Table] — Strict role isolation matrix
- [Source: _bmad-output/implementation-artifacts/epic-5-retro-2026-02-24.md#L228-249] — prep-6 task definition
- [Source: apps/api/src/middleware/auth.ts] — Authentication middleware (JWT verification, session management)
- [Source: apps/api/src/middleware/rbac.ts] — RBAC middleware (authorize, requireLgaLock)
- [Source: packages/types/src/auth.ts] — JwtPayload interface definition
- [Source: packages/types/src/constants.ts] — UserRole enum, role display names
- [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts] — Sidebar items per role, roleRouteMap
- [Source: apps/web/src/layouts/DashboardLayout.tsx] — Role-based layout rendering
- [Source: apps/api/src/services/audit.service.ts] — AuditService (PII_ACTIONS, fire-and-forget + transactional modes)
- [Source: apps/api/src/db/schema/audit.ts] — Audit logs table schema
- [Source: apps/api/src/services/token.service.ts] — Token issuance, session timeouts
- [Source: apps/web/src/App.tsx] — Role-based route definitions

### Previous Story Intelligence

**From prep-5-remuneration-domain-modeling (previous prep task):**
- Research spike for remuneration domain — no direct overlap with View-As
- Establishes pattern for spike deliverable: schema code samples, state machine diagrams, API endpoint tables
- Notification trigger design (BullMQ + Socket.io) may inform View-As real-time behavior during impersonation

**From prep-4-immutable-audit-log-spike (earlier prep task):**
- Story 6-1 (immutable audit logs) is a DEPENDENCY for View-As — must be implemented first
- Hash chaining and append-only enforcement will apply to View-As audit records
- AuditService extension pattern (new action types) directly applicable

**From prep-epic-5/prep-6 (Assessor Workflow State Machine):**
- State machine patterns: role-based transition matrix, concurrent review handling
- View-As session has simple lifecycle (Active → Ended) but benefits from structured state thinking

**From Epic 5 Retrospective (spike-first pattern, A5):**
- Three consecutive epics of zero rework thanks to spike-first approach
- prep-3 (Export Spike) → exact ExportService architecture used in Story 5-4
- prep-6 (State Machine) → verification status framework used in Stories 5-2, 5-3, 5-5
- This spike should follow the same pattern: complete design before Story 6-7 begins

### Git Intelligence

Recent commits are Epic 5 completions and prep-1 fix:
- `ab03648 fix(web,api): fix CI build errors` — latest
- `328ad63 fix(web): fix ExportPage LGA race condition + code review fixes (prep-1)` — bug fix pattern
- `bd5a443 docs: complete Epic 5 retrospective and define Epic 6 prep phase` — retro defining this spike
- `92f8a2b fix(api,web): use dynamic productivity targets across all dashboards` — shows dashboard data patterns
- `3e0e1c9 feat(api,web): add super admin cross-LGA analytics and government official view (Story 5.6b)` — shows cross-role data access patterns

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Existing auth middleware baseline: 10/10 tests pass (2 files: rbac.test.ts, export-rate-limit.test.ts)
- Analyzed 10 source files for current architecture understanding
- Industry research: Salesforce Login As, AWS STS AssumeRole, GitHub Enterprise impersonation, Frontegg/SuperTokens SaaS patterns, RFC 8693

### Completion Notes List

- **Task 1 (AC1):** Compared 4 authentication context strategies: JWT claim extension, Redis session metadata, separate view-as token, header-based. Recommended **Redis session metadata** — no JWT re-issuance, instant invalidation, compatible with single-session model. Separate Redis key `view_as:{sessionId}` with independent TTL.
- **Task 2 (AC2):** Mapped all 7 roles' endpoints and data access. Designed endpoint allowlist per target role (GET-only). LGA scoping: admin selects target LGA for field staff roles. Excluded `public_user` (different OAuth auth context). Role-specific features: show UI but disable actions.
- **Task 3 (AC3):** Designed 4-layer read-only enforcement: API middleware (`viewAsReadOnly`), frontend context (`ViewAsProvider`), route-level guards, WebSocket filter. Banner spec: amber fixed top bar with countdown timer and exit button. Edge cases: session expiry, tab duplication, token refresh all handled.
- **Task 4 (AC4):** Defined 4 new audit action types: `view_as.start`, `view_as.end`, `view_as.navigate`, `view_as.expired`. Details schema includes `viewedAsRole`, `reason`, `duration`, `pagesVisited`. Mandatory reason dropdown (5 options) + optional notes. Transactional logging for start/end, fire-and-forget for navigate.
- **Task 5 (AC5):** Designed route structure under `/dashboard/super-admin/view-as/:role/*`. Component import strategy with `roleComponentMap` for lazy-loaded target role pages. Sidebar href remapping preserves ADR-016 compliance. `ViewAsProvider` React context with countdown timer, navigation tracking, and exit handler.
- **Task 6 (AC6):** Security analysis: session isolation via Redis key scoping, privilege escalation prevention (read-only + role validation), CSRF mitigated by token auth model, XSS surface unchanged. Rate limiting: 1 concurrent session, 10/hour max, 30-min hard cap. Threat model with 4 attacker scenarios documented. Industry comparison with Salesforce, AWS STS, GitHub, SaaS providers, RFC 8693.
- **Task 7 (AC7):** Designed 4 API endpoints: `POST /start`, `POST /end`, `GET /current`, `POST /navigate`. Full request/response shapes with Zod-compatible types. Middleware chain: `authenticate → authorize(SUPER_ADMIN) → controller`. Error handling: 403, 400, 409, 404, 429 codes defined. View-As management endpoints exempt from `viewAsReadOnly`.
- **Task 8:** Compiled all research into comprehensive spike summary document (12 sections, ~700 lines). Includes comparison tables, decision rationale, security threat model, reference code snippets (ViewAsService, ViewAsContext, route config), and Story 6-7 implementation roadmap with 12 tasks.
- **Task 9:** Updated story status, all tasks marked complete, dev agent record populated.

### Change Log

- 2026-02-25: Completed View-As authentication spike. Created spike summary document with full architecture design covering auth context (Redis session metadata), permission scoping (per-role endpoint allowlist), read-only enforcement (4-layer defense-in-depth), audit trail (4 new action types), frontend rendering (component import under /view-as/:role/*), security analysis (threat model + industry comparison), and API endpoint design (4 endpoints). No production code changes.
- 2026-02-25: **Code review passed.** 9 findings (3H, 3M, 3L), all 9 fixed in-place. H1: roleComponentMap corrected to flat /pages/ structure with accurate component names. H2: AuditAction union type defined (PiiAction | ViewAsAction). H3: Clerk added to LGA-required roles. M1: DashboardLayout nesting resolved via SidebarOverrideContext (Section 7.7). M2: view_as.expired audit event documented. M3/L3: File List corrected. L1: recordNavigation uses atomic RPUSH. L2: API client note added.

### File List

- `_bmad-output/implementation-artifacts/prep-6-view-as-authentication-spike-summary.md` (new) — Spike summary document with all architecture decisions, comparison tables, security analysis, and reference code snippets
- `_bmad-output/implementation-artifacts/prep-6-view-as-authentication-spike.md` (new) — Story file: tasks marked complete, dev agent record updated, status updated
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) — Updated prep-6 status to "review"
