# Prep 6: View-As Authentication Spike — Summary

**Date:** 2026-02-25
**Author:** Dev Agent (Claude Opus 4.6)
**Status:** Complete
**Feeds:** Story 6-7 (Super Admin View-As Feature)
**Dependencies:** Story 6-1 (Immutable Audit Logs) must be implemented first

---

## 1. Executive Summary

This spike designs the Super Admin "View-As" feature for OSLRS — the ability for Super Admins to view the platform as any other role without navigating to that role's actual routes (per ADR-016 strict route isolation). The feature uses **delegation semantics** (not full impersonation): the Super Admin's identity is always preserved as the primary actor, with the viewed role as an explicit annotation.

**Key Decisions:**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Authentication context | Redis session metadata | No JWT re-issuance, server-side control, instant invalidation |
| Frontend rendering | Component import under `/dashboard/super-admin/view-as/:role/*` | True ADR-016 compliance, no route leakage |
| Read-only enforcement | Dual-layer: API middleware + frontend context | Defense-in-depth per OWASP guidance |
| Session duration | 30-minute hard cap, no renewal | More conservative than GitHub (1h), aligned with SaaS consensus |
| Mandatory reason | Required (dropdown + optional notes) | NDPA compliance, follows GitHub Enterprise pattern |
| Audit trail | New `view_as.*` action types via existing AuditService | Extends proven prep-2 infrastructure |
| Public User role | Excluded from View-As | Different auth context (Google OAuth), no dashboard overlap |

---

## 2. Current Authentication Architecture

### 2.1 JWT Payload

**Source:** `packages/types/src/auth.ts`

```typescript
interface JwtPayload {
  sub: string;        // userId (UUIDv7)
  jti: string;        // Unique token ID for blacklisting
  role: UserRole;     // User's role
  lgaId?: string;     // For field staff (enumerators, supervisors)
  email: string;
  rememberMe: boolean;
  iat: number;        // Issued at
  exp: number;        // Expiration
}
```

### 2.2 Authentication Flow

**Source:** `apps/api/src/middleware/auth.ts`

1. Extract Bearer token from `Authorization` header
2. Verify JWT signature and expiry (`TokenService.verifyAccessToken`)
3. Check token blacklist in Redis via `jti` (`TokenService.isBlacklisted`)
4. Check token revocation by timestamp — password change (`TokenService.isTokenRevokedByTimestamp`)
5. Validate session — inactivity (8h) + absolute timeout (24h/30d) (`SessionService.validateSession`)
6. Update last activity timestamp (`SessionService.updateLastActivity`)
7. Attach decoded payload to `req.user`

### 2.3 RBAC Middleware

**Source:** `apps/api/src/middleware/rbac.ts`

```typescript
// Role check
authorize(...allowedRoles: UserRole[]) → checks req.user.role ∈ allowedRoles

// LGA-locking (Supervisor + Enumerator only)
requireLgaLock() → validates req.user.lgaId matches request target LGA
```

**LGA-locking scope:** Only `SUPERVISOR` and `ENUMERATOR` are enforced by `requireLgaLock` (line 37). `DATA_ENTRY_CLERK` has `lgaId` for productivity tracking but is NOT locked.

### 2.4 Session Management

**Source:** `apps/api/src/services/session.service.ts`

- **Storage:** Redis-backed with `session:{sessionId}` and `user_session:{userId}` keys
- **Single-session enforcement:** Creating a new session invalidates the previous one
- **Timeouts:** 8h inactivity, 24h absolute (30d with Remember Me)
- **Token linkage:** `linkTokenToSession()` associates JWT `jti` with session for logout tracking

### 2.5 Audit Service

**Source:** `apps/api/src/services/audit.service.ts`

- **Two modes:** Fire-and-forget (`logPiiAccess`) and transactional (`logPiiAccessTx`)
- **7 PII action types:** `pii.view_record`, `pii.view_list`, `pii.export_csv`, `pii.export_pdf`, `pii.search`, `pii.view_productivity`, `pii.export_productivity`
- **Schema:** `audit_logs` table with `actorId`, `action`, `targetResource`, `targetId`, `details` (JSONB), `ipAddress`, `userAgent`, `createdAt`
- **9 existing call sites** across controllers (verified in prep-4 code review)

### 2.6 All User Roles

| Role | Dashboard Root | LGA-Locked | View-As Eligible |
|------|---------------|------------|-----------------|
| `super_admin` | `/dashboard/super-admin` | No | N/A (is the viewer) |
| `supervisor` | `/dashboard/supervisor` | Yes | Yes |
| `enumerator` | `/dashboard/enumerator` | Yes | Yes |
| `data_entry_clerk` | `/dashboard/clerk` | No (has lgaId, not enforced) | Yes |
| `verification_assessor` | `/dashboard/assessor` | No | Yes |
| `government_official` | `/dashboard/official` | No | Yes |
| `public_user` | `/dashboard/public` | No | **No** (different auth context) |

---

## 3. Authentication Context Strategy (AC1)

### 3.1 Comparison of Strategies

| Strategy | Mechanism | Pros | Cons | Complexity |
|----------|-----------|------|------|------------|
| **A. JWT Claim Extension** | Add `viewAsRole` to JWT payload, re-issue short-lived token | Stateless, travels with every request, RFC 8693 `act` claim pattern | Requires re-issuing JWT on start/end, two tokens if preserving original, refresh token complications | Medium |
| **B. Redis Session Metadata** | Store `viewingAs` state in Redis alongside existing session | No token change, instant server-side invalidation, easy timeout enforcement, compatible with single-session model | Server-side state lookup on every request, must pass to middleware chain | Low |
| **C. Separate View-As Token** | Issue dedicated read-only token with target role permissions | Clean separation, explicit permission boundary | Two tokens in flight, complex token management, refresh logic duplication | High |
| **D. Header-Based** | `X-View-As-Role` header checked by middleware | Simplest implementation, no token/session changes | Easily forged if client-side only, no server-side state = no timeout enforcement, no session tracking | Low (but insecure) |

### 3.2 Detailed Analysis

#### Strategy A: JWT Claim Extension

Following the RFC 8693 / SaaS provider pattern (Frontegg, SuperTokens), this would add `act.sub` (real admin) and set `sub` to the target user's context. However, OSLRS's View-As is **role-level, not user-level** — the Super Admin views "as Enumerator" generically, not as a specific enumerator user. This makes JWT claim extension awkward because:
- `sub` should remain the Super Admin's userId (they're not impersonating a specific user)
- Adding `viewAsRole` to JWT means re-issuing tokens on start/end
- The 15-minute JWT lifetime means View-As state persists in token even after server-side cancellation until token expires
- Refresh token flow must handle View-As state (complexity)

#### Strategy B: Redis Session Metadata (Recommended)

Extends the existing `SessionData` in Redis with View-As fields:

```typescript
interface ViewAsSessionData {
  viewingAsRole: UserRole;     // Target role being viewed
  viewingAsLgaId?: string;     // Selected LGA (for LGA-locked roles)
  viewAsStartedAt: string;     // ISO timestamp
  viewAsExpiresAt: string;     // ISO timestamp (startedAt + 30min)
  viewAsReason: string;        // Mandatory reason
  viewAsSessionId: string;     // Unique ID for this View-As session
}
```

**Why this wins:**
1. **No JWT re-issuance** — The Super Admin's existing JWT remains untouched. View-As state is purely server-side.
2. **Instant invalidation** — Deleting Redis keys immediately ends View-As. No waiting for JWT expiry.
3. **Compatible with single-session model** — View-As is metadata on the existing session, not a new session.
4. **Server-controlled timeout** — Redis TTL or timestamp check enforces the 30-minute hard cap.
5. **No refresh token complications** — Token refresh continues normally; View-As state is orthogonal.
6. **Existing pattern** — `SessionService` already stores `SessionData` in Redis with similar structure.

**Trade-off:** Every authenticated request must read View-As state from Redis. This is already happening (session validation reads Redis on every request at `auth.ts:58-88`), so the marginal cost is adding ~2 fields to the existing Redis read.

#### Strategy C: Separate View-As Token

Over-engineered for this use case. OSLRS View-As is role-level viewing (not user-level impersonation), making a separate token's permission boundary hard to define meaningfully. The dual-token management adds complexity without proportional benefit.

#### Strategy D: Header-Based

Rejected for security reasons. Without server-side state, there's no way to enforce timeout, track sessions, or prevent a compromised client from sending arbitrary `X-View-As-Role` headers indefinitely.

### 3.3 Impact on Existing Middleware

**`apps/api/src/middleware/auth.ts`** — Minimal change:
- After session validation (line 62-88), read View-As state from Redis
- Attach `req.viewAs` object to request (parallel to `req.user`, never replacing it)
- `req.user` always remains the Super Admin's real identity

**`apps/api/src/middleware/rbac.ts`** — No change to `authorize()`:
- View-As does NOT change `req.user.role` — the Super Admin remains authorized as `SUPER_ADMIN`
- A new `viewAsReadOnly` middleware (separate file) handles read-only enforcement

### 3.4 Recommendation

**Use Strategy B: Redis Session Metadata.** Store View-As state as additional fields on the existing session in Redis. This is the lowest-complexity approach that provides full server-side control, instant invalidation, and compatible timeout enforcement.

### 3.5 Redis Key Design

```
# Existing session key (unchanged)
session:{sessionId} → { userId, sessionId, createdAt, lastActivity, ... }

# New View-As key (separate, with its own TTL)
view_as:{sessionId} → {
  viewingAsRole: "enumerator",
  viewingAsLgaId: "ibadan_north",
  startedAt: "2026-02-25T10:00:00Z",
  expiresAt: "2026-02-25T10:30:00Z",
  reason: "debugging",
  reasonNotes: "User reported missing survey",
  viewAsSessionId: "01JNKP..."
}
TTL: 1800 seconds (30 minutes)

# Navigation tracking (separate list for atomic RPUSH — avoids race conditions)
view_as:{sessionId}:nav → ["team", "team/members", "fraud"]
TTL: 1800 seconds (matches main key)
```

Using a **separate Redis key** (not embedding in session data) provides:
- Independent TTL (View-As auto-expires via Redis TTL even if main session continues)
- Clean deletion on exit (single `DEL` command)
- No risk of corrupting main session data

---

## 4. Permission Scoping Design (AC2)

### 4.1 Role-to-Endpoint Mapping

When viewing as a target role, the Super Admin sees **only read endpoints** that the target role normally accesses. The View-As session computes the target role's visible data by:

1. **Determining the target role's API endpoints** (from route files)
2. **Filtering to GET-only** (read-only enforcement)
3. **Applying LGA scoping** (for LGA-locked roles)

### 4.2 Endpoint Allowlist Per Target Role

| Target Role | Allowed Read Endpoints (GET only) | LGA Scope |
|-------------|----------------------------------|-----------|
| **Supervisor** | `/api/v1/supervisor/team`, `/api/v1/supervisor/team/members`, `/api/v1/submissions/*` (list/detail), `/api/v1/fraud-detections/*`, `/api/v1/messaging/*` (read), `/api/v1/dashboard/supervisor/*` | Selected LGA |
| **Enumerator** | `/api/v1/questionnaires/*` (assigned forms), `/api/v1/submissions/*` (own), `/api/v1/dashboard/enumerator/*`, `/api/v1/messaging/*` (read) | Selected LGA |
| **Data Entry Clerk** | `/api/v1/submissions/*` (list/detail), `/api/v1/dashboard/clerk/*` | Selected LGA (see Section 4.3) |
| **Verification Assessor** | `/api/v1/submissions/*` (audit queue), `/api/v1/respondents/*`, `/api/v1/dashboard/assessor/*`, `/api/v1/exports/*` (read) | All LGAs |
| **Government Official** | `/api/v1/dashboard/official/*`, `/api/v1/respondents/*`, `/api/v1/exports/*` (read), `/api/v1/targets/*` | All LGAs |

### 4.3 LGA Scoping for LGA-Associated Roles

When viewing as a role that uses LGA for data scoping, the Super Admin must **select a target LGA** before entering View-As mode. This LGA is stored in `viewingAsLgaId` in Redis.

**Which roles require LGA selection:**
- **Supervisor** — LGA-locked via `requireLgaLock` middleware. **LGA selector required.**
- **Enumerator** — LGA-locked via `requireLgaLock` middleware. **LGA selector required.**
- **Data Entry Clerk** — NOT LGA-locked by middleware, but has `lgaId` assigned for productivity tracking. Clerk dashboard pages (`ClerkHome`, `ClerkStatsPage`) filter data by `req.user.lgaId`. **LGA selector required** — without it, View-As Clerk would show all-LGA data (more than a real Clerk sees), breaking the "see what they see" promise.
- **Verification Assessor** — Back-office role, no LGA scoping. `viewingAsLgaId` omitted.
- **Government Official** — Back-office role, no LGA scoping. `viewingAsLgaId` omitted.

**Design:**
- The View-As start screen (`/dashboard/super-admin/view-as`) shows a role selector dropdown
- When Supervisor, Enumerator, or Data Entry Clerk is selected, an LGA dropdown appears (populated from the `Lga` enum — 33 LGAs)
- The selected LGA is passed to `POST /api/v1/view-as/start` and stored in Redis
- API middleware uses `req.viewAs.viewingAsLgaId` to filter data (replacing the field staff's `req.user.lgaId`)
- For back-office roles (Assessor, Official), `viewingAsLgaId` is omitted

### 4.4 Role-Specific Feature Handling

| Feature | Roles | View-As Behavior |
|---------|-------|-----------------|
| **Offline sync** | Enumerator | UI shown but disabled — "Offline sync unavailable in View-As mode" |
| **Draft management** | Enumerator | Read-only view of drafts queue; create/edit/delete disabled |
| **Fraud alerts** | Supervisor | Read-only view of flagged submissions; resolve/dismiss disabled |
| **Messaging** | Supervisor, Enumerator | Read-only view of message threads; send disabled |
| **Form submission** | Enumerator, Data Entry Clerk | Form rendered in read-only preview mode; submit disabled |
| **Data entry** | Data Entry Clerk | Entry queue visible; keyboard entry disabled |
| **Audit queue** | Verification Assessor | Queue visible; approve/reject/flag actions disabled |
| **Export** | Assessor, Official | Export buttons disabled — "Export unavailable in View-As mode" |

### 4.5 Public User Exclusion

**Decision: Exclude `PUBLIC_USER` from View-As.**

Rationale:
- Public Users authenticate via Google OAuth — fundamentally different auth context
- Public User dashboard is minimal (survey status, marketplace placeholder, support)
- No administrative value in viewing as Public User (Super Admin already sees all data)
- Including Public User would require simulating OAuth state — unnecessary complexity

The role selector dropdown should display 5 roles: Supervisor, Enumerator, Data Entry Clerk, Verification Assessor, Government Official.

---

## 5. Read-Only Enforcement Design (AC3)

### 5.1 Defense-in-Depth Architecture

Read-only enforcement operates at **four layers**, any one of which is sufficient to block mutations:

```
Layer 1: API Middleware (viewAsReadOnly)
  └── Blocks POST/PUT/PATCH/DELETE when View-As is active
Layer 2: Frontend Context (ViewAsProvider)
  └── isViewingAs flag disables all action UI elements
Layer 3: Route-Level Guards
  └── View-As routes only mount read-only component variants
Layer 4: WebSocket Filter
  └── Suppresses action-triggering socket events during View-As
```

### 5.2 API-Level Middleware: `viewAsReadOnly`

**New file:** `apps/api/src/middleware/view-as.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { getViewAsState } from '../services/view-as.service.js';

/**
 * Middleware to enforce read-only mode during View-As sessions.
 * Must be placed AFTER authenticate middleware in the chain.
 *
 * Blocks all non-GET requests when the requesting user has an active View-As session.
 */
export const viewAsReadOnly = async (req: Request, res: Response, next: NextFunction) => {
  // Only applies to authenticated requests
  if (!req.user || !req.sessionId) return next();

  const viewAsState = await getViewAsState(req.sessionId);
  if (!viewAsState) return next();

  // Attach View-As state to request for downstream use
  req.viewAs = viewAsState;

  // Allow GET and HEAD requests only
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    return next(new AppError(
      'VIEW_AS_READ_ONLY',
      'Actions are disabled in View-As mode. Exit View-As to perform this action.',
      403
    ));
  }

  next();
};
```

**Middleware chain position:**
```
authenticate → viewAsReadOnly → authorize(...roles) → requireLgaLock() → controller
```

**Exception:** The View-As management endpoints themselves (`/api/v1/view-as/start`, `/api/v1/view-as/end`) must be exempt from `viewAsReadOnly` since they use POST. This is handled by not applying the middleware to the view-as router.

### 5.3 Frontend-Level Enforcement: `ViewAsContext`

**New file:** `apps/web/src/features/dashboard/context/ViewAsContext.tsx`

```typescript
interface ViewAsState {
  isViewingAs: boolean;
  viewAsRole: UserRole | null;
  viewAsLgaId: string | null;
  viewAsExpiresAt: string | null;
  viewAsSessionId: string | null;
  exitViewAs: () => Promise<void>;
}

// Usage in components:
const { isViewingAs } = useViewAs();

// Disable buttons:
<Button disabled={isViewingAs} title={isViewingAs ? 'Disabled in View-As mode' : undefined}>
  Submit
</Button>
```

**Provider placement:** Wraps the View-As route subtree only (not the entire app), so `isViewingAs` is `false` by default on normal Super Admin pages.

### 5.4 Banner Component: `ViewAsBanner`

Persistent top bar rendered when View-As is active:

```
┌─────────────────────────────────────────────────────────────────┐
│ 👁 Viewing as Supervisor (Ibadan North) — Read Only    [Exit]  │
│    Expires in 24:31                                             │
└─────────────────────────────────────────────────────────────────┘
```

**Specifications:**
- **Position:** Fixed top bar above the dashboard header (z-50)
- **Color:** Amber/warning background (`bg-amber-100 border-amber-300 text-amber-900`)
- **Content:** Eye icon + "Viewing as [Role Display Name]" + LGA name (if applicable) + " — Read Only"
- **Countdown timer:** Shows remaining minutes:seconds, updates every second
- **Exit button:** Prominent button that calls `POST /api/v1/view-as/end` and navigates back to `/dashboard/super-admin/view-as`
- **Height:** 48px (compensate with `pt-12` on dashboard container)

### 5.5 Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **WebSocket events during View-As** | Socket.io events are received (show notification toasts as read-only info) but action callbacks are no-ops. The `isViewingAs` flag in `ViewAsContext` prevents any socket-triggered mutations. |
| **Form submission prevention** | Forms render in read-only/preview mode (existing `FormFillerPage` has a `readOnly` prop pattern from prep-8). Submit buttons are `disabled`. API middleware blocks POST as backup. |
| **File uploads** | Upload buttons disabled. API middleware blocks multipart POST. |
| **Browser back/forward** | Navigation within View-As routes works normally. Navigating outside View-As routes (e.g., typing `/dashboard/super-admin/staff` in URL) exits the View-As context silently (no View-As state on those routes). |
| **View-As session expiry during navigation** | API returns `403 VIEW_AS_EXPIRED`. Frontend intercepts, shows toast "View-As session expired", navigates to `/dashboard/super-admin/view-as`. |
| **Tab duplication** | Both tabs share the same session. View-As state is server-side (Redis), so both tabs see consistent state. Exiting in one tab affects the other. |
| **Token refresh during View-As** | Normal token refresh proceeds. View-As state is in Redis (not JWT), so refresh doesn't affect it. |

---

## 6. Audit Trail Design (AC4)

### 6.1 New Audit Action Types

Extend `AuditService` in `apps/api/src/services/audit.service.ts` with View-As action types. **The action type union must be widened** so `logPiiAccess` and `logPiiAccessTx` accept both PII and View-As actions:

```typescript
/** Existing PII actions (unchanged) */
export const PII_ACTIONS = { /* ... existing 7 actions ... */ } as const;

/** New View-As actions */
export const VIEW_AS_ACTIONS = {
  VIEW_AS_START: 'view_as.start',
  VIEW_AS_END: 'view_as.end',
  VIEW_AS_NAVIGATE: 'view_as.navigate',
  VIEW_AS_EXPIRED: 'view_as.expired',
} as const;

/** Combined audit action types — widen the union for method signatures */
export type PiiAction = (typeof PII_ACTIONS)[keyof typeof PII_ACTIONS];
export type ViewAsAction = (typeof VIEW_AS_ACTIONS)[keyof typeof VIEW_AS_ACTIONS];
export type AuditAction = PiiAction | ViewAsAction;
```

**Implementation note:** Update the `logPiiAccess` and `logPiiAccessTx` method signatures to accept `action: AuditAction` (instead of `action: PiiAction`). This is a backward-compatible widening — existing PII call sites continue to work unchanged. Consider renaming the methods to `logAuditEvent` / `logAuditEventTx` for clarity, or keep the existing names with the widened type to minimize churn.

### 6.2 Details Schema

```typescript
// view_as.start details
interface ViewAsStartDetails {
  viewAsSessionId: string;
  viewedAsRole: UserRole;
  targetLgaId?: string;       // Only for LGA-locked roles
  reason: string;             // "debugging" | "demo" | "user_support" | "audit" | "training"
  reasonNotes?: string;       // Optional free-text notes
  expiresAt: string;          // ISO timestamp
}

// view_as.end details
interface ViewAsEndDetails {
  viewAsSessionId: string;
  viewedAsRole: UserRole;
  targetLgaId?: string;
  duration: number;           // Seconds
  pagesVisited: string[];     // Array of route paths visited
  endReason: 'manual' | 'expired' | 'logout' | 'session_expired';
}

// view_as.navigate details
interface ViewAsNavigateDetails {
  viewAsSessionId: string;
  viewedAsRole: UserRole;
  fromPath: string;
  toPath: string;
}

// view_as.expired details (auto-expiry event)
interface ViewAsExpiredDetails {
  viewAsSessionId: string;
  viewedAsRole: UserRole;
  duration: number;           // Always 1800 (30 minutes)
  pagesVisited: string[];
}
```

### 6.3 Session Tracking

**Duration computation:**
- `startedAt` recorded in Redis on `view_as.start`
- `duration = now() - startedAt` computed on `view_as.end` or `view_as.expired`

**Automatic end triggers:**
1. **Manual exit:** Super Admin clicks "Exit View-As" button → `POST /api/v1/view-as/end`
2. **Timeout:** Redis TTL expires (30 min). Next request detects missing View-As key → log `view_as.expired`
3. **Logout:** Logout handler checks for active View-As and logs `view_as.end` with `endReason: 'logout'`
4. **Session expiry:** If the main session expires, View-As ends implicitly (session validation fails)

**Pages visited tracking:**
- Frontend sends page path to a lightweight `POST /api/v1/view-as/navigate` endpoint on route changes
- Stored in a **separate Redis list key** (`view_as:{sessionId}:nav`) using atomic `RPUSH` — avoids read-modify-write race conditions on concurrent navigation events
- Retrieved via `LRANGE` on session end and included in `view_as.end` details for audit completeness

> **Note:** The `view_as.navigate` endpoint is the ONE exception to the read-only POST block — it is whitelisted in the `viewAsReadOnly` middleware alongside the `/view-as/start` and `/view-as/end` endpoints.

### 6.4 Reason Field Design

**Decision: Mandatory dropdown + optional free-text notes.**

**Reason dropdown options:**

| Value | Display Label | Description |
|-------|--------------|-------------|
| `debugging` | Debugging | Investigating a reported issue |
| `demo` | Demonstration | Showing the system to stakeholders |
| `user_support` | User Support | Helping a user with their workflow |
| `audit` | Compliance Audit | Reviewing role-specific access patterns |
| `training` | Training | Preparing training materials |

**UX:** Dropdown is required before the "Start View-As" button becomes enabled. Optional "Additional notes" textarea (max 500 chars) appears below the dropdown.

**Rationale for mandatory:** NDPA compliance context (Nigeria's data protection law). GitHub Enterprise also mandates reason selection. The UX friction is minimal (one click) and the compliance benefit is significant.

### 6.5 AuditService Integration

As defined in Section 6.1, method signatures should be widened from `PiiAction` to `AuditAction` (the union of `PiiAction | ViewAsAction`). This is backward-compatible — existing 9 PII call sites are unaffected.

| Event | AuditService Mode | Rationale |
|-------|-------------------|-----------|
| `view_as.start` | Transactional (`logPiiAccessTx`) | Critical event — must succeed |
| `view_as.end` | Transactional (`logPiiAccessTx`) | Critical event — duration + pages must be recorded |
| `view_as.navigate` | Fire-and-forget (`logPiiAccess`) | High-frequency, non-critical |
| `view_as.expired` | Fire-and-forget (`logPiiAccess`) | Server-side cleanup, best-effort. **Must be called from `getCurrentViewAs` when TTL-based expiry is detected** (see Section 11.1 `getCurrentViewAs`). |

After Story 6-1 (immutable audit logs) is implemented, all View-As events will automatically benefit from hash chaining and append-only enforcement.

---

## 7. Frontend Rendering Strategy (AC5)

### 7.1 Route Structure

```
/dashboard/super-admin/view-as                    → ViewAsLauncherPage (role + LGA selector)
/dashboard/super-admin/view-as/:role              → ViewAsDashboardPage (target role's home)
/dashboard/super-admin/view-as/:role/*             → ViewAsDashboardPage (target role's nested pages)
```

**Route definition in `App.tsx`:**

```tsx
{/* Inside super-admin ProtectedRoute */}
<Route path="view-as" element={<ViewAsProvider><Outlet /></ViewAsProvider>}>
  <Route index element={<ViewAsLauncherPage />} />
  <Route path=":role" element={<ViewAsDashboardShell />}>
    <Route index element={<ViewAsRoleHome />} />
    <Route path="*" element={<ViewAsRolePage />} />
  </Route>
</Route>
```

### 7.2 Component Rendering Strategy

**Approach: Direct component import with route remapping.**

Each target role's page components are imported and rendered within the Super Admin's View-As route context. The `ViewAsDashboardShell` component:

1. Reads the `:role` param from the URL
2. Looks up the target role's sidebar config via `getSidebarItems(role)`
3. Remaps sidebar `href` values from `/dashboard/{role-path}/*` to `/dashboard/super-admin/view-as/{role}/*`
4. Renders the target role's page components based on the wildcard path match

**Example rendering flow:**

```
URL: /dashboard/super-admin/view-as/supervisor/team
                                    ^^^^^^^^^^  ^^^^
                                    role param  nested path

1. ViewAsDashboardShell reads role="supervisor"
2. Sidebar shows supervisor's items with remapped hrefs:
   - Home → /dashboard/super-admin/view-as/supervisor
   - Team Progress → /dashboard/super-admin/view-as/supervisor/team
   - Fraud Alerts → /dashboard/super-admin/view-as/supervisor/fraud
   ...
3. Nested path "team" maps to SupervisorTeamPage component
4. Component renders with ViewAsContext.isViewingAs = true
5. All mutation actions are disabled
```

**Component mapping table:**

> **Note:** All dashboard pages live in a flat directory (`features/dashboard/pages/`), not role-specific subdirectories. Some pages are shared across roles (e.g., `RespondentRegistryPage`, `ExportPage`). Import paths and component names are taken directly from `App.tsx`.

```typescript
const roleComponentMap: Record<string, Record<string, React.LazyExoticComponent<any>>> = {
  supervisor: {
    '': lazy(() => import('./features/dashboard/pages/SupervisorHome')),
    'team': lazy(() => import('./features/dashboard/pages/SupervisorTeamPage')),
    'productivity': lazy(() => import('./features/dashboard/pages/SupervisorProductivityPage')),
    'registry': lazy(() => import('./features/dashboard/pages/RespondentRegistryPage')), // Shared component
    'fraud': lazy(() => import('./features/dashboard/pages/SupervisorFraudPage')),
    'messages': lazy(() => import('./features/dashboard/pages/SupervisorMessagesPage')),
  },
  enumerator: {
    '': lazy(() => import('./features/dashboard/pages/EnumeratorHome')),
    'survey': lazy(() => import('./features/dashboard/pages/EnumeratorSurveysPage')),
    'drafts': lazy(() => import('./features/dashboard/pages/EnumeratorDraftsPage')),
    'sync': lazy(() => import('./features/dashboard/pages/EnumeratorSyncPage')),
    'messages': lazy(() => import('./features/dashboard/pages/EnumeratorMessagesPage')),
  },
  data_entry_clerk: {
    '': lazy(() => import('./features/dashboard/pages/ClerkHome')),
    'surveys': lazy(() => import('./features/dashboard/pages/ClerkSurveysPage')),
    'entry': lazy(() => import('./features/forms/pages/ClerkDataEntryPage')), // In forms/, not dashboard/
    'completed': lazy(() => import('./features/dashboard/pages/ClerkCompletedPage')),
    'stats': lazy(() => import('./features/dashboard/pages/ClerkStatsPage')),
  },
  verification_assessor: {
    '': lazy(() => import('./features/dashboard/pages/AssessorHome')),
    'queue': lazy(() => import('./features/dashboard/pages/AssessorQueuePage')),
    'registry': lazy(() => import('./features/dashboard/pages/RespondentRegistryPage')), // Shared component
    'completed': lazy(() => import('./features/dashboard/pages/AssessorCompletedPage')),
    'evidence': lazy(() => import('./features/dashboard/pages/AssessorEvidencePage')),
    'export': lazy(() => import('./features/dashboard/pages/ExportPage')), // Shared component
  },
  government_official: {
    '': lazy(() => import('./features/dashboard/pages/OfficialHome')),
    'productivity': lazy(() => import('./features/dashboard/pages/OfficialProductivityPage')),
    'registry': lazy(() => import('./features/dashboard/pages/RespondentRegistryPage')), // Shared component
    'stats': lazy(() => import('./features/dashboard/pages/OfficialStatsPage')),
    'trends': lazy(() => import('./features/dashboard/pages/OfficialTrendsPage')),
    'export': lazy(() => import('./features/dashboard/pages/ExportPage')), // Shared component
  },
};
```

### 7.3 `ViewAsProvider` React Context

```typescript
interface ViewAsContextValue {
  isViewingAs: boolean;
  viewAsRole: UserRole | null;
  viewAsLgaId: string | null;
  viewAsExpiresAt: Date | null;
  viewAsSessionId: string | null;
  remainingSeconds: number;
  exitViewAs: () => Promise<void>;
}
```

**Provider responsibilities:**
1. On mount, fetch current View-As state from `GET /api/v1/view-as/current`
2. Start countdown timer based on `expiresAt`
3. When timer reaches 0, call `exitViewAs()` and show "Session expired" toast
4. Provide `exitViewAs()` function that calls `POST /api/v1/view-as/end` and navigates back
5. Track page navigation events and send to `POST /api/v1/view-as/navigate`

### 7.4 Sidebar Adaptation

The `ViewAsDashboardShell` renders a modified sidebar:

```typescript
function getViewAsSidebarItems(targetRole: UserRole): NavItem[] {
  const items = getSidebarItems(targetRole);
  const roleRoute = roleRouteMap[targetRole]; // e.g., "/dashboard/supervisor"
  const viewAsPrefix = `/dashboard/super-admin/view-as/${targetRole}`;

  return items.map(item => ({
    ...item,
    href: item.href.replace(roleRoute, viewAsPrefix),
  }));
}
```

This remaps all sidebar links to stay within the Super Admin's View-As route namespace, maintaining ADR-016 compliance.

### 7.5 Header Adaptation

When View-As is active, the `DashboardHeader` shows:
- **Role badge:** Target role's display name (e.g., "Supervisor") with a distinct color
- **ViewAsBanner** above the header (see Section 5.4)
- **Admin identity:** Small text "Logged in as [Admin Name]" preserved in the profile dropdown

### 7.6 Lazy Loading

All target role components are already code-split via React lazy loading in the existing route definitions. The `roleComponentMap` re-imports them lazily, so no additional bundle impact on the Super Admin's initial load. View-As components are only loaded when the Super Admin navigates to a View-As route.

### 7.7 DashboardLayout Nesting Resolution

**Problem:** View-As routes are children of `DashboardLayout` (`App.tsx:558-562`), which renders the super-admin sidebar using `getSidebarItems('super_admin')`. The `ViewAsDashboardShell` also needs to render the target role's sidebar. Without intervention, **two sidebars** would appear.

**Recommended approach — sidebar override via context:**

1. Add a `SidebarOverrideContext` to `DashboardLayout`:
   ```typescript
   // In DashboardLayout.tsx
   const SidebarOverrideContext = createContext<NavItem[] | null>(null);
   export function useSidebarOverride() { return useContext(SidebarOverrideContext); }
   ```

2. `DashboardLayout` checks for sidebar override before rendering default items:
   ```typescript
   const override = useSidebarOverride();
   const sidebarItems = override ?? getSidebarItems(user.role);
   ```

3. `ViewAsDashboardShell` provides the override via context:
   ```typescript
   <SidebarOverrideContext.Provider value={getViewAsSidebarItems(targetRole)}>
     {/* Target role page content */}
   </SidebarOverrideContext.Provider>
   ```

**Why not a separate layout route:** Duplicating `DashboardLayout` for View-As would mean maintaining two layout components (header, notification system, profile dropdown, etc.). The override pattern keeps a single layout with swappable sidebar content.

**Alternative — `DashboardLayout` prop threading:** Pass `sidebarItems` as a prop via route element. Less flexible but simpler if context feels over-engineered.

---

## 8. API Endpoint Design (AC7)

### 8.1 `POST /api/v1/view-as/start`

**Start a View-As session.**

```typescript
// Request
interface StartViewAsRequest {
  targetRole: UserRole;         // Required: role to view as
  targetLgaId?: string;         // Required for supervisor/enumerator
  reason: ViewAsReason;         // Required: dropdown selection
  reasonNotes?: string;         // Optional: free-text (max 500 chars)
}

// Response (200 OK)
interface StartViewAsResponse {
  viewAsSessionId: string;      // UUIDv7
  targetRole: UserRole;
  targetLgaId?: string;
  expiresAt: string;            // ISO timestamp (now + 30 min)
  startsAt: string;             // ISO timestamp
}

// Middleware chain
authenticate → authorize(SUPER_ADMIN) → viewAsController.start
```

**Validation:**
- `targetRole` must be one of: `supervisor`, `enumerator`, `data_entry_clerk`, `verification_assessor`, `government_official`
- `targetLgaId` required when `targetRole` is `supervisor`, `enumerator`, or `data_entry_clerk`; must be valid `Lga` enum value
- `reason` required; must be one of: `debugging`, `demo`, `user_support`, `audit`, `training`
- `reasonNotes` optional; max 500 characters

**Error responses:**
- `403 FORBIDDEN` — Not Super Admin
- `400 INVALID_ROLE` — Invalid target role (e.g., `super_admin`, `public_user`)
- `400 LGA_REQUIRED` — LGA-associated role (supervisor, enumerator, data_entry_clerk) selected without `targetLgaId`
- `400 INVALID_LGA` — `targetLgaId` not in Lga enum
- `400 REASON_REQUIRED` — Missing reason
- `409 VIEW_AS_ALREADY_ACTIVE` — Already in a View-As session (must end current first)

### 8.2 `POST /api/v1/view-as/end`

**End the current View-As session.**

```typescript
// Request (empty body — session determined from auth)
// Response (200 OK)
interface EndViewAsResponse {
  duration: number;             // Seconds
  pagesVisited: string[];       // Route paths visited
  viewAsSessionId: string;
}

// Middleware chain
authenticate → authorize(SUPER_ADMIN) → viewAsController.end
```

**Error responses:**
- `403 FORBIDDEN` — Not Super Admin
- `404 VIEW_AS_NOT_FOUND` — No active View-As session

### 8.3 `GET /api/v1/view-as/current`

**Get current View-As state (for frontend hydration).**

```typescript
// Response (200 OK)
interface ViewAsCurrentResponse {
  active: boolean;
  targetRole?: UserRole;
  targetLgaId?: string;
  startedAt?: string;           // ISO timestamp
  expiresAt?: string;           // ISO timestamp
  viewAsSessionId?: string;
  remainingSeconds?: number;
}

// Middleware chain
authenticate → authorize(SUPER_ADMIN) → viewAsController.current
```

When no active View-As session: `{ active: false }`

### 8.4 `POST /api/v1/view-as/navigate`

**Track page navigation during View-As (for audit trail).**

```typescript
// Request
interface ViewAsNavigateRequest {
  fromPath: string;
  toPath: string;
}

// Response (204 No Content)

// Middleware chain
authenticate → authorize(SUPER_ADMIN) → viewAsController.navigate
```

**Note:** This endpoint is whitelisted from `viewAsReadOnly` middleware. Fire-and-forget audit logging.

### 8.5 Middleware Chain Summary

```
View-As management endpoints (exempt from viewAsReadOnly):
  POST /api/v1/view-as/start    → authenticate → authorize(SUPER_ADMIN) → controller
  POST /api/v1/view-as/end      → authenticate → authorize(SUPER_ADMIN) → controller
  GET  /api/v1/view-as/current  → authenticate → authorize(SUPER_ADMIN) → controller
  POST /api/v1/view-as/navigate → authenticate → authorize(SUPER_ADMIN) → controller

All other API routes:
  authenticate → viewAsReadOnly → authorize(...roles) → requireLgaLock() → controller
```

---

## 9. Security Analysis & Threat Model (AC6)

### 9.1 Session Isolation

| Threat | Mitigation | Residual Risk |
|--------|-----------|---------------|
| **Cross-tab leakage** | View-As state is server-side (Redis), tied to session ID. All tabs sharing the same session see consistent state. | Low — shared-session is by design. Exiting in one tab affects all tabs. |
| **Cross-session contamination** | View-As key is `view_as:{sessionId}` — scoped to specific session. Other users' sessions are unaffected. | None |
| **View-As state persists after logout** | Logout handler explicitly deletes `view_as:{sessionId}` key before session invalidation. | None |
| **View-As state persists after session expiry** | Redis TTL on View-As key (30 min) guarantees auto-cleanup. Additionally, `viewAsReadOnly` middleware checks expiry timestamp. | None |

### 9.2 Privilege Escalation Prevention

| Threat | Mitigation | Residual Risk |
|--------|-----------|---------------|
| **Admin views as role with higher privileges** | Super Admin is already the highest-privilege role. View-As targets lower-privilege roles only. Target role list excludes `super_admin`. | None |
| **Admin accesses data beyond target role's scope** | API middleware filters data by `req.viewAs.viewingAsRole` and `req.viewAs.viewingAsLgaId`. The admin cannot see more than the target role would see. | Low — requires careful controller implementation to respect View-As filters. |
| **Admin performs mutations through View-As** | `viewAsReadOnly` middleware blocks all non-GET methods. Frontend disables all action UI. Double protection. | None |
| **Forged View-As header** | No header-based approach used. View-As state is purely server-side (Redis). Client cannot forge it. | None |
| **View-As used to circumvent LGA locking** | `viewingAsLgaId` is server-validated against `Lga` enum. Cannot specify arbitrary LGA values. | None |

### 9.3 CSRF/XSS Implications

| Threat | Mitigation | Residual Risk |
|--------|-----------|---------------|
| **XSS triggers View-As start** | `POST /api/v1/view-as/start` requires valid JWT + SUPER_ADMIN role. XSS on a non-admin page cannot trigger it. XSS on admin page could theoretically start View-As, but it's read-only and audited. | Low — XSS on admin page is a pre-existing concern, not introduced by View-As. |
| **CSRF triggers View-As** | All API requests require Bearer token in Authorization header (not cookies). CSRF is already mitigated by the token-based auth model. | None |
| **View-As components introduce XSS** | Target role components are the same components rendered for actual role users. No new XSS surface. View-As banner content uses role display names from constants, not user input. | None |

### 9.4 Rate Limiting

| Control | Value | Enforcement |
|---------|-------|-------------|
| **Max concurrent View-As sessions per admin** | 1 | `409 VIEW_AS_ALREADY_ACTIVE` on second start attempt |
| **Max View-As session duration** | 30 minutes | Redis TTL + server-side timestamp check |
| **Max View-As sessions per hour per admin** | 10 | Rate counter in Redis: `view_as_rate:{userId}` with 1-hour TTL. Increment on each start. |
| **Cooldown between sessions** | None | Not needed — 30-min cap + 10/hour limit sufficient |

### 9.5 Mandatory Reason Evaluation

**Decision: Mandatory.**

| Factor | Assessment |
|--------|-----------|
| **Compliance benefit** | High — NDPA (Nigeria Data Protection Act) requires justification for accessing personal data in non-routine contexts. View-As is explicitly non-routine. |
| **UX friction** | Minimal — single dropdown click. Pre-populated options cover 95% of use cases. |
| **Audit value** | High — enables filtering and reporting on View-As usage patterns. |
| **Industry precedent** | GitHub Enterprise mandates reason before impersonation. SaaS providers recommend it for regulated environments. |

### 9.6 Industry Pattern Comparison

| Pattern | OSLRS Design | Industry Reference |
|---------|-------------|-------------------|
| **Token strategy** | Redis session metadata (no JWT modification) | SuperTokens/Frontegg use JWT extension; OSLRS deviates for simplicity and instant invalidation |
| **Read-only enforcement** | Dual-layer (API + frontend) | AWS STS session policy intersection; all SaaS providers use dual-layer |
| **Identity preservation** | `req.user` always = admin; `req.viewAs` = annotation | RFC 8693 delegation semantics; AWS `SourceIdentity` |
| **Session duration** | 30 minutes hard cap | GitHub: 1 hour; SaaS consensus: 30-60 min |
| **Mandatory reason** | Required (dropdown + notes) | GitHub: required; SaaS providers: recommended |
| **Target notification** | Not implemented (single-admin system) | GitHub: mandatory email. OSLRS: not applicable (Super Admin is sole admin; no user notification needed for role-level viewing) |
| **Audit trail** | Dedicated `view_as.*` events via AuditService | GitHub: dual-log; Salesforce: LoginAs event type |

### 9.7 Threat Model Summary

| Attacker Scenario | Mitigations | Risk Level |
|-------------------|------------|------------|
| **Compromised Super Admin account** | View-As is read-only, audited, and time-bounded. Attacker gains no additional write access. 2FA recommended as external control. | Medium (pre-existing — not introduced by View-As) |
| **Insider threat: admin abuses View-As for surveillance** | Mandatory reason, audit trail, 30-min cap, 10/hour limit. Admin activity is fully traceable. | Low |
| **Session hijacking during View-As** | Standard JWT + session protections apply. View-As state is server-side, so hijacking the JWT alone doesn't reveal View-As context to attacker. | Low (pre-existing) |
| **Race condition: simultaneous start** | Redis `SETNX` (set-if-not-exists) on `view_as:{sessionId}` prevents dual creation. | None |

---

## 10. Implementation Roadmap — Story 6-7 Task Breakdown

Based on this spike's findings, Story 6-7 should be structured as follows:

### Prerequisite
- Story 6-1 (Immutable Audit Logs) must be completed first

### Recommended Task Order

1. **Backend: ViewAsService + Redis operations**
   - Create `apps/api/src/services/view-as.service.ts`
   - Implement: `startViewAs`, `endViewAs`, `getCurrentViewAs`, `recordNavigation`
   - Redis key management with TTL
   - Rate limiting counter

2. **Backend: View-As API endpoints**
   - Create `apps/api/src/routes/view-as.routes.ts`
   - Create `apps/api/src/controllers/view-as.controller.ts`
   - 4 endpoints: start, end, current, navigate
   - Zod request validation schemas

3. **Backend: viewAsReadOnly middleware**
   - Create `apps/api/src/middleware/view-as.ts`
   - Integrate into global middleware chain (after `authenticate`, before `authorize`)
   - Whitelist View-As management endpoints

4. **Backend: Audit integration**
   - Extend AuditService with `VIEW_AS_ACTIONS`
   - Log `view_as.start` (transactional) and `view_as.end` (transactional) events
   - Log `view_as.navigate` (fire-and-forget) events

5. **Backend: Tests**
   - Unit tests for ViewAsService
   - Integration tests for View-As endpoints (start/end/current/navigate)
   - Middleware tests for viewAsReadOnly (block POST/PUT/PATCH/DELETE, allow GET)
   - Rate limiting tests
   - Session isolation tests

6. **Frontend: ViewAsProvider context**
   - Create `apps/web/src/features/dashboard/context/ViewAsContext.tsx`
   - Implement `useViewAs` hook
   - Countdown timer logic
   - API integration (start, end, current, navigate)

7. **Frontend: ViewAsLauncherPage**
   - Role selector dropdown (5 roles)
   - LGA selector (conditional, for supervisor/enumerator)
   - Reason dropdown (mandatory)
   - Notes textarea (optional)
   - Start button with validation

8. **Frontend: ViewAsDashboardShell**
   - URL param parsing (`:role`)
   - Component mapping via `roleComponentMap`
   - Sidebar remapping
   - ViewAsBanner integration

9. **Frontend: ViewAsBanner component**
   - Persistent top bar with role name, LGA, countdown, exit button
   - Amber warning styling

10. **Frontend: Route configuration**
    - Add View-As routes under super-admin in `App.tsx`
    - Add "View-As" item to super-admin sidebar config
    - Lazy load all View-As components

11. **Frontend: Tests**
    - ViewAsProvider context tests
    - ViewAsLauncherPage form validation tests
    - ViewAsBanner rendering tests
    - ViewAsDashboardShell route mapping tests
    - Integration tests for start/exit flow

12. **E2E: Playwright test**
    - Happy path: start View-As → navigate → exit
    - Verify read-only enforcement (mutation attempt shows error)
    - Verify banner display and countdown

---

## 11. Reference Code Snippets

### 11.1 ViewAsService (Backend)

```typescript
// apps/api/src/services/view-as.service.ts
import { Redis } from 'ioredis';
import { uuidv7 } from 'uuidv7';
import { UserRole } from '@oslsr/types';
import { AppError } from '@oslsr/utils';

const VIEW_AS_KEY_PREFIX = 'view_as:';
const VIEW_AS_RATE_KEY_PREFIX = 'view_as_rate:';
const VIEW_AS_TTL = 1800; // 30 minutes
const VIEW_AS_RATE_LIMIT = 10; // per hour
const VIEW_AS_RATE_WINDOW = 3600; // 1 hour

interface ViewAsState {
  viewAsSessionId: string;
  viewingAsRole: UserRole;
  viewingAsLgaId?: string;
  startedAt: string;
  expiresAt: string;
  reason: string;
  reasonNotes?: string;
  // pagesVisited stored in separate Redis list key (view_as:{sessionId}:nav)
  // for atomic RPUSH — see recordNavigation() and getPagesVisited()
}

export class ViewAsService {
  constructor(private redis: Redis) {}

  async startViewAs(
    sessionId: string,
    userId: string,
    targetRole: UserRole,
    targetLgaId: string | undefined,
    reason: string,
    reasonNotes?: string,
  ): Promise<ViewAsState> {
    // Check if already in View-As
    const existing = await this.redis.get(`${VIEW_AS_KEY_PREFIX}${sessionId}`);
    if (existing) {
      throw new AppError('VIEW_AS_ALREADY_ACTIVE', 'Already in a View-As session. End current session first.', 409);
    }

    // Rate limit check
    const rateKey = `${VIEW_AS_RATE_KEY_PREFIX}${userId}`;
    const currentCount = await this.redis.incr(rateKey);
    if (currentCount === 1) {
      await this.redis.expire(rateKey, VIEW_AS_RATE_WINDOW);
    }
    if (currentCount > VIEW_AS_RATE_LIMIT) {
      throw new AppError('VIEW_AS_RATE_LIMITED', 'Too many View-As sessions. Try again later.', 429);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + VIEW_AS_TTL * 1000);

    const state: ViewAsState = {
      viewAsSessionId: uuidv7(),
      viewingAsRole: targetRole,
      viewingAsLgaId: targetLgaId,
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      reason,
      reasonNotes,
    };

    // SETNX pattern to prevent race conditions
    const key = `${VIEW_AS_KEY_PREFIX}${sessionId}`;
    const result = await this.redis.set(key, JSON.stringify(state), 'EX', VIEW_AS_TTL, 'NX');
    if (!result) {
      throw new AppError('VIEW_AS_ALREADY_ACTIVE', 'Already in a View-As session.', 409);
    }

    return state;
  }

  async endViewAs(sessionId: string): Promise<ViewAsState & { duration: number; pagesVisited: string[] }> {
    const key = `${VIEW_AS_KEY_PREFIX}${sessionId}`;
    const navKey = `${VIEW_AS_KEY_PREFIX}${sessionId}:nav`;
    const data = await this.redis.get(key);
    if (!data) {
      throw new AppError('VIEW_AS_NOT_FOUND', 'No active View-As session', 404);
    }

    const state: ViewAsState = JSON.parse(data);
    const duration = Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000);
    const pagesVisited = await this.redis.lrange(navKey, 0, -1);

    // Clean up both keys
    await this.redis.del(key, navKey);

    return { ...state, duration, pagesVisited };
  }

  async getCurrentViewAs(sessionId: string): Promise<ViewAsState | null> {
    const key = `${VIEW_AS_KEY_PREFIX}${sessionId}`;
    const data = await this.redis.get(key);
    if (!data) return null;

    const state: ViewAsState = JSON.parse(data);

    // Check if expired (belt-and-suspenders with Redis TTL)
    if (new Date(state.expiresAt) <= new Date()) {
      await this.redis.del(key);
      // Log view_as.expired audit event (fire-and-forget)
      // The caller must pass AuditService context to enable this,
      // or this method emits an event that the controller handles.
      // Recommended: return a sentinel { ...state, expired: true } so the
      // controller can log view_as.expired with full session details.
      return null;
    }

    return state;
  }

  /**
   * Track page navigation during View-As session.
   * Uses Redis RPUSH on a separate list key for atomic array append,
   * avoiding the read-modify-write race condition of GET → parse → push → SET.
   */
  async recordNavigation(sessionId: string, fromPath: string, toPath: string): Promise<void> {
    const key = `${VIEW_AS_KEY_PREFIX}${sessionId}`;
    const exists = await this.redis.exists(key);
    if (!exists) return; // Silently ignore if no active session

    // Atomic append to a separate navigation list key (avoids race conditions)
    const navKey = `${VIEW_AS_KEY_PREFIX}${sessionId}:nav`;
    await this.redis.rpush(navKey, toPath);

    // Match TTL to the main View-As key
    const ttl = await this.redis.ttl(key);
    if (ttl > 0) {
      await this.redis.expire(navKey, ttl);
    }
  }

  /**
   * Get all pages visited during a View-As session.
   * Called by endViewAs to include in audit trail.
   */
  async getPagesVisited(sessionId: string): Promise<string[]> {
    const navKey = `${VIEW_AS_KEY_PREFIX}${sessionId}:nav`;
    return this.redis.lrange(navKey, 0, -1);
  }
}
```

### 11.2 ViewAsContext (Frontend)

> **Implementation note:** This reference code uses raw `fetch()` for clarity. The actual implementation should use the project's established API client pattern (TanStack Query hooks / configured fetcher) for consistency with error handling, token refresh interceptors, and base URL configuration.

```typescript
// apps/web/src/features/dashboard/context/ViewAsContext.tsx
import { createContext, useContext, useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/context/AuthContext';
import { toast } from 'sonner';
import type { UserRole } from '@oslsr/types';

interface ViewAsContextValue {
  isViewingAs: boolean;
  viewAsRole: UserRole | null;
  viewAsLgaId: string | null;
  viewAsExpiresAt: Date | null;
  viewAsSessionId: string | null;
  remainingSeconds: number;
  exitViewAs: () => Promise<void>;
}

const ViewAsContext = createContext<ViewAsContextValue>({
  isViewingAs: false,
  viewAsRole: null,
  viewAsLgaId: null,
  viewAsExpiresAt: null,
  viewAsSessionId: null,
  remainingSeconds: 0,
  exitViewAs: async () => {},
});

export function ViewAsProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<Omit<ViewAsContextValue, 'exitViewAs' | 'remainingSeconds'>>({
    isViewingAs: false,
    viewAsRole: null,
    viewAsLgaId: null,
    viewAsExpiresAt: null,
    viewAsSessionId: null,
  });
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const prevPathRef = useRef(location.pathname);

  // Fetch current View-As state on mount
  useEffect(() => {
    const fetchState = async () => {
      const res = await fetch('/api/v1/view-as/current', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.active) {
        setState({
          isViewingAs: true,
          viewAsRole: data.targetRole,
          viewAsLgaId: data.targetLgaId ?? null,
          viewAsExpiresAt: new Date(data.expiresAt),
          viewAsSessionId: data.viewAsSessionId,
        });
      }
    };
    fetchState();
  }, [accessToken]);

  // Countdown timer
  useEffect(() => {
    if (!state.viewAsExpiresAt) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((state.viewAsExpiresAt!.getTime() - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        toast.info('View-As session expired');
        setState({ isViewingAs: false, viewAsRole: null, viewAsLgaId: null, viewAsExpiresAt: null, viewAsSessionId: null });
        navigate('/dashboard/super-admin/view-as');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [state.viewAsExpiresAt, navigate]);

  // Track navigation
  useEffect(() => {
    if (!state.isViewingAs || !accessToken) return;
    if (prevPathRef.current !== location.pathname) {
      fetch('/api/v1/view-as/navigate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromPath: prevPathRef.current,
          toPath: location.pathname,
        }),
      }).catch(() => {}); // Fire-and-forget
      prevPathRef.current = location.pathname;
    }
  }, [location.pathname, state.isViewingAs, accessToken]);

  const exitViewAs = useCallback(async () => {
    await fetch('/api/v1/view-as/end', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    setState({ isViewingAs: false, viewAsRole: null, viewAsLgaId: null, viewAsExpiresAt: null, viewAsSessionId: null });
    navigate('/dashboard/super-admin/view-as');
    toast.success('Exited View-As mode');
  }, [accessToken, navigate]);

  return (
    <ViewAsContext.Provider value={{ ...state, remainingSeconds, exitViewAs }}>
      {children}
    </ViewAsContext.Provider>
  );
}

export function useViewAs() {
  return useContext(ViewAsContext);
}
```

### 11.3 Route Configuration Snippet

> **Note:** All dashboard pages use a flat `features/dashboard/pages/` directory. The existing `App.tsx` uses `DashboardLoadingFallback` (not `DashboardLoadingSkeleton`). View-As pages follow the same pattern.

```tsx
// In App.tsx, inside the super-admin route group:
const ViewAsLauncherPage = lazy(() => import('./features/dashboard/pages/ViewAsLauncherPage'));
const ViewAsDashboardShell = lazy(() => import('./features/dashboard/pages/ViewAsDashboardShell'));

// Inside <Route path="super-admin" ...>
<Route path="view-as" element={<ViewAsProvider><Outlet /></ViewAsProvider>}>
  <Route index element={<Suspense fallback={<DashboardLoadingFallback />}><ViewAsLauncherPage /></Suspense>} />
  <Route path=":role/*" element={<Suspense fallback={<DashboardLoadingFallback />}><ViewAsDashboardShell /></Suspense>} />
</Route>
```

**Important — Layout nesting:** These routes are children of the `DashboardLayout` (which renders the super-admin sidebar). The `ViewAsDashboardShell` must **replace** the sidebar content with the target role's sidebar, not render a second sidebar. Recommended approach: `DashboardLayout` should accept a `sidebarOverride` prop or use a context to allow `ViewAsDashboardShell` to inject the target role's sidebar items. See Section 7.7 for details.

### 11.4 Sidebar Config Addition

```typescript
// In sidebarConfig.ts, add to super_admin array:
{ label: 'View-As', href: '/dashboard/super-admin/view-as', icon: Eye },
```

---

## 12. Open Questions Resolved

| Question | Resolution |
|----------|-----------|
| JWT claim extension vs Redis session? | **Redis session metadata** — simpler, instant invalidation, no JWT re-issuance |
| Include Public User in View-As? | **No** — different auth context (Google OAuth), minimal dashboard, no admin value |
| Mandatory reason field? | **Yes** — minimal UX friction, high compliance value, follows GitHub Enterprise pattern |
| User notification on View-As start? | **No** — OSLRS has single Super Admin; role-level viewing (not user-level impersonation) doesn't warrant notification |
| View-As write access? | **Read-only only** — dual-layer enforcement (API + frontend), following industry best practice |
| Nesting (View-As within View-As)? | **Not supported** — `409 VIEW_AS_ALREADY_ACTIVE` prevents nesting |
| Component import vs iframe? | **Component import** — better UX, no styling issues, same security boundary |
| How to handle offline features in View-As? | **Show UI, disable actions** — informational display without functional capability |

---

## 13. Code Review Amendments (2026-02-25)

**Reviewer:** Adversarial Code Review (Claude Opus 4.6)
**Findings:** 3 HIGH, 3 MEDIUM, 3 LOW — all 9 fixed in-place

| # | Severity | Finding | Fix Applied |
|---|----------|---------|-------------|
| H1 | HIGH | `roleComponentMap` wrong import paths and component names | Updated to flat `/features/dashboard/pages/` paths, correct names, all 5 roles fully mapped including shared components |
| H2 | HIGH | `VIEW_AS_ACTIONS` type conflict with `PiiAction` | Introduced `AuditAction = PiiAction \| ViewAsAction` union, documented method signature widening |
| H3 | HIGH | Clerk LGA scoping under-specified | Added Clerk to LGA-required roles in Sections 4.2, 4.3, 8.1 |
| M1 | MEDIUM | DashboardLayout dual-sidebar nesting | Added Section 7.7 with `SidebarOverrideContext` recommendation |
| M2 | MEDIUM | `view_as.expired` audit event missing from reference code | Added expiry detection comment in `getCurrentViewAs`, updated Section 6.5 |
| M3 | MEDIUM | `sprint-status.yaml` missing from story File List | Fixed in story file |
| L1 | LOW | Race condition in `recordNavigation` | Replaced read-modify-write with atomic `RPUSH` on separate `:nav` list key |
| L2 | LOW | Raw `fetch()` in ViewAsContext reference code | Added implementation note to use project's TanStack Query / API client |
| L3 | LOW | Story File List marks story as "(modified)" vs "(new)" | Fixed in story file |
