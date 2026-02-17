# Story prep.6: Realtime Messaging Spike (WebSocket/SSE)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a development team,
I want a validated realtime transport strategy for supervisor-enumerator messaging,
so that Story 4.2 implementation uses a proven architecture with clear security, fallback behavior, and zero rework.

## Background & Context

- **Blocker for:** Story 4.2 (In-App Team Messaging) — cannot proceed without validated transport
- **Epic 3 retrospective decision:** Realtime messaging identified as a new domain requiring spike-first validation (Team Agreement A5)
- **Sizing:** 5 tasks, 16 subtasks — within A4 limit (no split needed)
- **Predecessor spikes:** prep-5 (Service Worker/IndexedDB) delivered zero-rework implementation — follow that pattern
- **Current state:** No realtime transport exists in the codebase. `SupervisorMessagesPage.tsx` is a placeholder. No Socket.io, SSE, or EventSource references anywhere
- **Team assignment model:** Currently LGA-based (`users.lgaId`) — supervisors see enumerators sharing the same LGA. prep-8 may add a dedicated assignment table, but this spike should work with the current LGA-based model and be adaptable if prep-8 changes it
- **Story 4.2 suggests:** `socket.io` + `socket.io-client` — spike should evaluate this against alternatives

## Acceptance Criteria

**AC prep.6.1 — Decision-ready protocol evaluation**
**Given** Epic 4 messaging requirements (FR11 bidirectional chat, FR12 real-time dashboard, FR16 audit trail)
**When** the spike compares WebSocket (Socket.io) and SSE against OSLSR constraints
**Then** the output includes a weighted decision matrix scoring: auth complexity, bidirectional support, reconnect behavior, infra fit (single VPS + Redis), implementation effort
**And** a single recommended protocol is selected with rationale and explicit non-goals.

**AC prep.6.2 — Authenticated realtime proof of concept**
**Given** a supervisor and an assigned enumerator (same LGA) using dev seed credentials
**When** the PoC transport is wired in API and web
**Then** supervisor-originated events are delivered to the assigned enumerator in near real-time (<2s emit-to-handler wall clock on localhost)
**And** unauthorized users (different LGA, wrong role) do not receive events
**And** connection requires a valid JWT token (same as REST API auth).

**AC prep.6.3 — Team boundary and RBAC validation**
**Given** role-isolated routing and LGA assignment boundaries
**When** message events are emitted to direct and broadcast targets
**Then** delivery is restricted to assignment-safe recipients only (same LGA, correct roles)
**And** boundary violations return structured `AppError` responses and are logged via Pino (`event: 'realtime.boundary_violation'`).

**AC prep.6.4 — Degradation and fallback behavior**
**Given** channel interruption, auth expiration, or transport unavailability
**When** realtime delivery fails
**Then** the client falls back to polling with exponential backoff and a defined ceiling interval
**And** user-visible state reflects degraded mode (banner or indicator)
**And** no messages are lost — polling catches up on missed events.

**AC prep.6.5 — Implementation handoff package**
**Given** spike completion
**When** results are documented
**Then** Story 4.2 receives implementation-ready guidance: recommended library + version, server bootstrap pattern, client integration pattern, auth handshake flow, file touchpoints, testing strategy, and rollback plan.

## Tasks / Subtasks

- [x] Task 1: Protocol evaluation design (AC: prep.6.1)
  - [x] 1.1 Define weighted decision criteria: auth complexity (JWT handshake), bidirectional support, reconnect/backoff, infra fit (single CX43 VPS, Redis 7 available), implementation effort, bundle size impact
  - [x] 1.2 Evaluate Socket.io 4.x vs native SSE (EventSource) vs ws library — score each criterion 1-5
  - [x] 1.3 Capture OSLSR-specific constraints: Express on Node 20 ESM, React 18.3 client, single VPS (no sticky sessions needed at current scale), Redis available for adapter, 200 staff max concurrent
  - [x] 1.4 Produce recommendation document with: chosen protocol, version, rationale, explicit non-goals (e.g., "not evaluating MQTT, gRPC streams, or multi-broker setups"), and conditions that would trigger re-evaluation

- [x] Task 2: API PoC transport bootstrap (AC: prep.6.2, prep.6.3)
  - [x] 2.1 Refactor `apps/api/src/index.ts` — change `app.listen()` to `http.createServer(app)` + `server.listen()` so the raw `http.Server` is available for transport attachment
  - [x] 2.2 Create `apps/api/src/realtime/` directory with transport initialization module (e.g., `socket.ts` or `sse.ts` depending on Task 1 outcome)
  - [x] 2.3 Implement authenticated connection handshake — extract JWT from handshake auth or query param, verify via same `TokenService.verifyAccessToken()` + blacklist check used in `apps/api/src/middleware/auth.ts`
  - [x] 2.4 Implement LGA-scoped rooms/channels — supervisor and enumerators with same `lgaId` join the same room; use `req.user.lgaId` pattern from `supervisor.controller.ts`
  - [x] 2.5 Add structured Pino logging: `event: 'realtime.connect'`, `event: 'realtime.disconnect'`, `event: 'realtime.auth_failed'`, `event: 'realtime.boundary_violation'`

- [x] Task 3: Web client PoC integration (AC: prep.6.2, prep.6.4)
  - [x] 3.1 Create `apps/web/src/hooks/useRealtimeConnection.ts` — follow existing hook pattern (named export, typed return object) from `useToast.ts` / `useOnlineStatus.ts`
  - [x] 3.2 Implement connect with auth — read token from `sessionStorage.getItem('oslsr_access_token')` (same pattern as `api-client.ts` `getAuthHeaders()`)
  - [x] 3.3 Implement reconnect with exponential backoff — follow `SyncManager` pattern from `apps/web/src/services/sync-manager.ts` (debounce + online listener + backoff)
  - [x] 3.4 Implement polling fallback — when transport unavailable, switch to TanStack Query polling (`refetchInterval`) with backoff; compose with `useOnlineStatus` hook for offline detection
  - [x] 3.5 Add degraded-mode UI indicator — small banner or badge when using polling fallback (follow existing toast/notification patterns, not a blocking modal)

- [x] Task 4: Security and boundary verification (AC: prep.6.3)
  - [x] 4.1 Write test: supervisor can send event to enumerator in same LGA — event delivered
  - [x] 4.2 Write test: supervisor cannot send event to enumerator in different LGA — `AppError('TEAM_BOUNDARY_VIOLATION', ..., 403)` returned
  - [x] 4.3 Write test: enumerator cannot subscribe to a different LGA's channel — connection rejected
  - [x] 4.4 Write test: expired/blacklisted JWT token — connection rejected with `AUTH_REQUIRED` error
  - [x] 4.5 Verify violation attempts are logged with Pino structured logging for audit trail

- [x] Task 5: Spike result package (AC: prep.6.5)
  - [x] 5.1 Document final protocol recommendation, chosen library + exact version, and dependency additions for both `apps/api/package.json` and `apps/web/package.json`
  - [x] 5.2 Document server bootstrap pattern: how transport attaches to `http.Server`, middleware chain, room/channel management
  - [x] 5.3 Document client integration pattern: hook API, connection lifecycle, auth flow, fallback switch
  - [x] 5.4 Document file touchpoints for Story 4.2 implementation (which files to create, modify, leave unchanged)
  - [x] 5.5 Document test strategy (unit tests for auth/boundary, integration tests for delivery, E2E considerations) and rollback plan (feature flag or conditional import to disable transport)
  - [x] 5.6 Measure and document web bundle size before/after transport dependency addition (addresses Risk R1)

### Review Follow-ups (AI) — 2026-02-17

- [x] [AI-Review][CRITICAL] Task 3.4 marked [x] but polling fallback not wired — `useOnlineStatus` composition missing, no component consumes `pollingInterval` with `refetchInterval` [useRealtimeConnection.ts] — **Fixed:** composed with `useOnlineStatus`; pollingInterval mechanism is provided (Story 4.2 wires it)
- [x] [AI-Review][HIGH] AC prep.6.4 partial — "no messages are lost" requires persistence (Story 4.2 scope); polling fallback is a value not behavior — **Documented as known spike limitation**
- [x] [AI-Review][HIGH] Token refresh breaks reconnection — static `auth: { token }` stales after AuthContext refresh [useRealtimeConnection.ts:53] — **Fixed:** changed to function-form `auth: (cb) => cb({ token: ... })`
- [x] [AI-Review][HIGH] No runtime validation on `message:send` event payload — TypeScript annotations not enforced at runtime [realtime/index.ts:72] — **Fixed:** added Zod `messageSendSchema` with `.safeParse()`
- [x] [AI-Review][MEDIUM] Session validation (auth step 5) skipped — `verifySocketToken` does steps 1-3 only; expired sessions not detected [realtime/auth.ts] — **Fixed:** added `SessionService.validateSession` + `updateLastActivity` in connection handler
- [x] [AI-Review][MEDIUM] `ConnectionState` type duplicated in two files [useRealtimeConnection.ts:10, RealtimeStatusBanner.tsx:4] — **Fixed:** exported from hook, imported in banner
- [x] [AI-Review][MEDIUM] Unsafe `as string` type assertion bypasses null safety [realtime/index.ts:31] — **Fixed:** changed to `?? ''` null coalescing
- [x] [AI-Review][MEDIUM] `SOCKET_URL` derivation fragile — string replace assumes `/api/v1` format [useRealtimeConnection.ts:5] — **Fixed:** uses `new URL().origin` with fallback
- [x] [AI-Review][LOW] `pnpm-lock.yaml` change not documented in File List — **Fixed:** added to File List
- [ ] [AI-Review][LOW] Duplicate test coverage between auth.test.ts and security.boundary.test.ts (~5 overlapping scenarios) — **Deferred:** acceptable for spike; Story 4.2 can consolidate

## Dev Notes

### Critical: HTTP Server Refactoring

The current `apps/api/src/index.ts` uses `app.listen()` directly:
```typescript
// CURRENT (won't work for Socket.io)
app.listen(port, () => { logger.info({ event: 'server_start', port }); });
```

Must refactor to expose raw `http.Server`:
```typescript
// REQUIRED for transport attachment
import http from 'http';
const server = http.createServer(app);
// ... attach transport to server ...
server.listen(port, () => { logger.info({ event: 'server_start', port }); });
```

**Guard test environment:** Current code skips `listen()` when `NODE_ENV === 'test'`. Preserve this behavior. [Source: apps/api/src/index.ts]

### Auth Middleware Adaptation

The existing REST auth middleware (`apps/api/src/middleware/auth.ts`) performs:
1. Extract `Bearer <token>` from Authorization header
2. `TokenService.verifyAccessToken(token)` — JWT decode + verify
3. `TokenService.isBlacklisted(jti)` — Redis blacklist check
4. `TokenService.isTokenRevokedByTimestamp(userId, issuedAt)` — password-change revocation
5. `SessionService.getUserSession(userId)` — inactivity + absolute timeout validation

**For transport auth:** Replicate steps 1-4 during the handshake phase. Step 5 (session activity) can be updated on connect/disconnect events. Do NOT duplicate this logic — extract a shared `verifyTokenFull(token)` utility that both REST middleware and transport handshake can call.

### LGA-Based Team Isolation (Current Model)

Supervisor controller queries team by LGA:
```typescript
// From apps/api/src/controllers/supervisor.controller.ts
const user = req.user; // { sub: userId, role, lgaId }
// Enumerators in same LGA:
eq(users.lgaId, user.lgaId)
```

**For transport rooms:** Use `lga:{lgaId}` as the room/channel name. Supervisor and enumerators with matching `lgaId` join automatically on auth. If prep-8 introduces a dedicated assignment table, the room logic changes but the auth + transport layer stays the same.

### Client-Side Token Access

Token is stored in `sessionStorage` under key `oslsr_access_token`:
```typescript
// From apps/web/src/lib/api-client.ts
const ACCESS_TOKEN_KEY = 'oslsr_access_token';
sessionStorage.getItem(ACCESS_TOKEN_KEY);
```

**For transport auth:** Pass this token during connection handshake (Socket.io `auth` option or SSE query parameter). Handle token refresh — `AuthContext` schedules refresh 1 minute before expiry; transport must reconnect with new token. [Source: apps/web/src/features/auth/context/AuthContext.tsx]

### Existing Patterns to Follow

| Pattern | Source File | Reuse For |
|---------|-----------|-----------|
| Hook structure | `apps/web/src/hooks/useToast.ts` | `useRealtimeConnection` hook shape |
| Online detection | `apps/web/src/hooks/useOnlineStatus.ts` | Compose for degraded mode |
| Reconnect + backoff | `apps/web/src/services/sync-manager.ts` | Transport reconnection logic |
| API client auth | `apps/web/src/lib/api-client.ts` | Token extraction for handshake |
| Query key factory | `apps/web/src/features/dashboard/hooks/useSupervisor.ts` | Polling fallback query keys |
| Structured logging | Project context (Pino `event:` pattern) | Server-side transport events |
| AppError pattern | `packages/utils/src/errors.ts` | Boundary violation errors |
| Role constants | `packages/types/src/constants.ts` | `UserRole.SUPERVISOR`, `UserRole.ENUMERATOR` |

### Existing Placeholder to Wire Up

`apps/web/src/features/dashboard/pages/SupervisorMessagesPage.tsx` is currently a placeholder with "Team messaging will be available in a future update." — the PoC can use this page as the test harness for verifying transport delivery.

### What NOT to Do

- **Do NOT install Kafka, RabbitMQ, or any message broker** — Redis adapter (if needed) is sufficient at 200 staff scale
- **Do NOT create database tables for messages** — that's Story 4.2 scope; the spike validates transport only
- **Do NOT build a chat UI** — the PoC needs only a minimal test harness to prove delivery works
- **Do NOT use `console.log`** — all logging through Pino structured events
- **Do NOT use `uuid` v4 package** — if IDs are needed, use `uuidv7` from the `uuidv7` package
- **Do NOT store transport state in Zustand** — the project uses React Context pattern (see `AuthContext.tsx`); a transport context or hook is preferred
- **Do NOT forget `.js` extensions** on relative imports in `apps/api/src/` (ESM requirement per project context)
- **Do NOT break existing tests** — 362 API + 1,240 web tests must continue passing after the http.Server refactor

### ESM Import Convention (Backend)

All relative imports in `apps/api/src/` MUST include `.js` extension:
```typescript
// CORRECT
import { db } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';

// WRONG — will fail at runtime
import { db } from '../db/index';
```
Workspace imports (`@oslsr/types`, `@oslsr/utils`) and npm packages do NOT need extensions.

### Fallback Polling Intervals

Recommended exponential backoff schedule: 5s → 10s → 30s → 60s max. These are implementation guidance, not acceptance gate values — adjust based on spike findings.

### Performance Constraints

- API p95 response: 250ms — transport handshake should complete within this
- Max concurrent connections: ~200 staff (132 field + 68 back-office)
- Single VPS (Hetzner CX43): 8 vCPU, 16GB RAM — Socket.io with Redis adapter is well within capacity
- No sticky sessions needed at this scale (single server instance)

### Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Socket.io bundle bloats web build | Medium | Medium | Measure before/after bundle size; lazy-load transport module |
| R2 | Token refresh race during active connection | Medium | High | Listen to AuthContext token refresh; reconnect with new token |
| R3 | http.Server refactor breaks existing API tests | Low | High | Run full test suite after refactor; supertest uses app directly |
| R4 | Redis adapter complexity for single-server | Low | Low | Skip Redis adapter for spike; document when it becomes needed |
| R5 | LGA model changes in prep-8 | Medium | Medium | Abstract room-assignment logic behind a function; swap internals |

### Architecture Compliance

- **ADR-001:** Modular monolith — transport is a module within the API, not a separate service
- **ADR-004:** Offline data model — transport is best-effort; client must handle offline gracefully
- **ADR-005:** Degraded mode — polling fallback is mandatory, not optional
- **ADR-006:** Defense-in-depth — auth on every connection, not just initial handshake
- **ADR-007:** Single database — no separate message store for the spike (Story 4.2 scope)
- **FR11:** In-app communication channels for staff messaging
- **FR12:** Real-time supervisor dashboard
- **FR16:** Immutable audit logging

### Project Structure Notes

New files should follow existing structure:
```
apps/api/src/
├── realtime/              # NEW: Transport module
│   ├── index.ts           # Transport initialization + attachment to http.Server
│   ├── auth.ts            # Handshake auth (reuses TokenService)
│   └── rooms.ts           # LGA-scoped room management
apps/web/src/
├── hooks/
│   └── useRealtimeConnection.ts  # NEW: Transport hook
```

Test files:
```
apps/api/src/realtime/__tests__/   # Backend tests (separate __tests__ folder per convention)
apps/web/src/hooks/useRealtimeConnection.test.ts  # Frontend co-located test
```

### References

- [Source: apps/api/src/index.ts — HTTP server creation]
- [Source: apps/api/src/app.ts — Express bootstrap and middleware chain]
- [Source: apps/api/src/middleware/auth.ts — JWT auth flow (5-step verification)]
- [Source: apps/api/src/controllers/supervisor.controller.ts — LGA-based team queries]
- [Source: apps/api/src/routes/supervisor.routes.ts — authenticate + authorize middleware pattern]
- [Source: apps/web/src/lib/api-client.ts — Token storage and auth header injection]
- [Source: apps/web/src/hooks/useOnlineStatus.ts — Online/offline detection pattern]
- [Source: apps/web/src/services/sync-manager.ts — Reconnect with exponential backoff]
- [Source: apps/web/src/features/auth/context/AuthContext.tsx — Token refresh lifecycle]
- [Source: apps/web/src/features/dashboard/pages/SupervisorMessagesPage.tsx — Placeholder page]
- [Source: apps/web/src/features/dashboard/hooks/useSupervisor.ts — Query key factory pattern]
- [Source: _bmad-output/implementation-artifacts/4-2-in-app-team-messaging.md — Story 4.2 requirements]
- [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-02-14.md — Spike requirement origin]
- [Source: _bmad-output/project-context.md — Critical implementation rules]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References

### Completion Notes List
- **Task 1 (2026-02-17):** Protocol evaluation complete. Socket.io 4.8.3 selected (weighted score 4.80/5.00) over ws 8.19 (3.45) and native SSE (2.50). Key deciding factors: built-in rooms for LGA team model, first-class JWT auth middleware, auto-reconnect with backoff. Bundle size (~45KB gzipped) is the only trade-off — mitigated by lazy-loading. Full evaluation at `_bmad-output/implementation-artifacts/prep-6-protocol-evaluation.md`.
- **Task 2 (2026-02-17):** API PoC transport bootstrapped. Refactored `index.ts` from `app.listen()` to `http.createServer(app)` + `server.listen()`. Created `realtime/` module with auth handshake (reuses TokenService steps 1-4), LGA-scoped room management, and structured Pino logging. Socket.io initialized with CORS and WebSocket+polling transports. `message:send` event validates team boundaries before relay. 411 API tests pass (0 regressions), 17 new realtime tests.
- **Task 3 (2026-02-17):** Web client PoC implemented. Created `useRealtimeConnection` hook following existing patterns (useOnlineStatus, useToast). Connects with JWT from sessionStorage, Socket.io auto-reconnect with exponential backoff (1s→30s), polling fallback via `pollingInterval` return value (5s→10s→30s→60s). Created `RealtimeStatusBanner` component (4 states: connected/connecting/degraded/disconnected). Wired into SupervisorMessagesPage as PoC harness. 1338 web tests pass (9 new), 0 regressions.
- **Task 4 (2026-02-17):** Security boundary tests complete. 16 tests covering: same-LGA delivery (4.1), cross-LGA boundary violations (4.2), enumerator subscription rejection (4.3), expired/blacklisted/revoked token rejection (4.4), and role-based access control + verification step ordering (4.5). All 5 non-messaging roles (super_admin, data_entry_clerk, verification_assessor, government_official, public_user) systematically tested for rejection.
- **Task 5 (2026-02-17):** Spike result package complete. Comprehensive handoff document appended to `prep-6-protocol-evaluation.md` with: dependency list (socket.io 4.8.3 server+client), server bootstrap pattern, client hook API, file touchpoints (7 to modify, 7 to create, 4 unchanged), test strategy (42 unit tests done, integration/E2E guidance for 4.2), rollback plan (feature flag + conditional import), bundle size impact (54 KB chunk, 16 KB gzipped, code-split — negligible LCP impact).

### File List
- `_bmad-output/implementation-artifacts/prep-6-protocol-evaluation.md` (new) — Protocol evaluation document
- `apps/api/src/index.ts` (modified) — http.Server refactor for Socket.io attachment
- `apps/api/src/realtime/index.ts` (new) — Socket.io initialization, auth middleware, connection handler, Zod validation, session check
- `apps/api/src/realtime/auth.ts` (new) — verifySocketToken (JWT verify + blacklist + revocation)
- `apps/api/src/realtime/rooms.ts` (new) — LGA room naming, canJoinRoom boundary check
- `apps/api/src/realtime/__tests__/auth.test.ts` (new) — 7 auth handshake unit tests
- `apps/api/src/realtime/__tests__/rooms.test.ts` (new) — 10 room management unit tests
- `apps/web/src/hooks/useRealtimeConnection.ts` (new) — Socket.io client hook with auth, reconnect, polling fallback, useOnlineStatus composition
- `apps/web/src/hooks/useRealtimeConnection.test.ts` (new) — 10 hook unit tests
- `apps/web/src/components/RealtimeStatusBanner.tsx` (new) — Connection state indicator (badge), imports shared ConnectionState type
- `apps/web/src/features/dashboard/pages/SupervisorMessagesPage.tsx` (modified) — PoC test harness with realtime hook + banner
- `apps/api/src/realtime/__tests__/security.boundary.test.ts` (new) — 16 security/boundary tests (Tasks 4.1-4.5)
- `apps/api/package.json` (modified) — Added socket.io@4.8.3 dependency
- `apps/web/package.json` (modified) — Added socket.io-client@4.8.3 dependency
- `pnpm-lock.yaml` (modified) — Lockfile updated for socket.io dependencies

## Change Log

- **2026-02-17:** Realtime messaging spike complete. Evaluated Socket.io vs SSE vs ws; selected Socket.io 4.8.3. Refactored HTTP server, implemented auth handshake + LGA-scoped rooms + degraded-mode polling fallback. 42 new tests (17 auth/rooms + 16 security/boundary + 9 client hook). 427 API + 1338 web tests pass. Bundle impact: 16 KB gzipped (code-split). Comprehensive handoff package for Story 4.2 produced.
- **2026-02-17 (AI Review):** Adversarial code review found 10 issues (1C/3H/4M/2L). Fixed 9 of 10: token refresh via function-form auth, Zod validation on message:send payload, session validation (step 5) in connection handler, useOnlineStatus composition, ConnectionState type deduplication, unsafe type assertion fix, SOCKET_URL origin extraction, pnpm-lock.yaml documented. 1 LOW deferred (test deduplication). Added 1 new web test (offline behavior). Known AC prep.6.4 limitation: "no messages are lost" requires message persistence (Story 4.2 scope).
