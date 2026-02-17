# Realtime Transport Protocol Evaluation — OSLSR prep.6

**Date:** 2026-02-17
**Author:** Dev Agent (prep-6-realtime-messaging-spike)
**Purpose:** Decision-ready protocol evaluation for Story 4.2 (In-App Team Messaging)

---

## 1. Weighted Decision Criteria

| # | Criterion | Weight | Rationale |
|---|-----------|--------|-----------|
| C1 | Auth complexity (JWT handshake) | 20% | Must integrate with existing 5-step JWT verification + Redis blacklist. Auth on every connection (ADR-006). |
| C2 | Bidirectional support | 25% | FR11 requires bidirectional supervisor ↔ enumerator chat. Highest-impact criterion. |
| C3 | Reconnect / backoff | 15% | ADR-005 mandates degraded mode. Field staff on unstable mobile networks. |
| C4 | Infra fit (single CX43 VPS + Redis 7) | 15% | Single-server deployment, ~200 concurrent users, Redis available for adapter. |
| C5 | Implementation effort | 15% | Spike budget is bounded; production implementation in Story 4.2 must be efficient. |
| C6 | Bundle size impact | 10% | NFR1.2 LCP target 2.5s. Mobile-first field staff on 3G. Risk R1. |

**Total Weight:** 100%

---

## 2. OSLSR-Specific Constraints (Subtask 1.3)

| Constraint | Detail |
|-----------|--------|
| Runtime | Node.js 20 LTS, ES Modules (`"type": "module"`) |
| Framework | Express 4.x on `http.createServer()` (refactor required) |
| Client | React 18.3, Vite 6.x, TanStack Query for server state |
| Deployment | Single Hetzner CX43 VPS (8 vCPU, 16 GB RAM) — no load balancer, no sticky sessions |
| Scale | 200 staff max concurrent (132 field + 68 back-office) |
| State | Redis 7 available (ioredis 5.4 already installed) — can serve as pub/sub adapter |
| Auth | JWT access tokens (15 min expiry), refresh via HttpOnly cookie, Redis blacklist for revocation |
| Team model | LGA-based assignment (`users.lgaId`). Supervisor + enumerators in same LGA form a team. |
| Offline | PWA with IndexedDB queue; transport is best-effort, polling fallback mandatory (ADR-005) |
| Logging | Pino 9.x structured events only — no `console.log` |
| Security | Defense-in-depth (ADR-006): auth on every connection, not just initial handshake |

---

## 3. Protocol Evaluation Matrix (Subtask 1.2)

### 3.1 Socket.io 4.8.3

| Criterion | Score (1-5) | Notes |
|-----------|:-----------:|-------|
| C1 Auth | **5** | First-class `auth` option in handshake. Server middleware hook (`io.use()`) runs before connection. Verified pattern: extract JWT from `socket.handshake.auth.token`, run `TokenService.verifyAccessToken()`. Well-documented. |
| C2 Bidirectional | **5** | Full duplex by design. `emit()`/`on()` on both client and server. Rooms + namespaces built-in. Broadcast to room: `io.to('lga:ibadan-north').emit()`. |
| C3 Reconnect | **5** | Built-in auto-reconnect with exponential backoff + jitter. Configurable `reconnectionDelay`, `reconnectionDelayMax`, `reconnectionAttempts`. Fires `connect_error` event for custom fallback logic. |
| C4 Infra fit | **5** | Works on single server out of the box. `@socket.io/redis-adapter` available for horizontal scaling when needed. No sticky sessions required for single instance. |
| C5 Effort | **5** | Mature ecosystem (14 years). Room management, broadcasting, namespace isolation — all built-in. Express integration documented. ~50 lines to bootstrap. |
| C6 Bundle | **3** | `socket.io-client@4.8.3` ≈ 45 KB gzipped. Heavier than raw WebSocket, but can be lazy-loaded via dynamic import. Acceptable given LCP budget. |

**Weighted Score:** (5×20 + 5×25 + 5×15 + 5×15 + 5×15 + 3×10) / 100 = **4.80 / 5.00**

### 3.2 Native SSE (EventSource)

| Criterion | Score (1-5) | Notes |
|-----------|:-----------:|-------|
| C1 Auth | **2** | `EventSource` API does not support custom headers. JWT must go in query param (logged in server access logs — security concern) or use `fetch()`-based polyfill. No standard auth pattern. |
| C2 Bidirectional | **1** | Server → client only. Client → server requires separate REST POST endpoints. Not true bidirectional — requires hybrid architecture (SSE + REST) which doubles complexity for chat use case. |
| C3 Reconnect | **3** | Built-in auto-reconnect in EventSource spec, but limited configurability. No backoff control. `retry` field set by server, not client. |
| C4 Infra fit | **4** | Zero additional dependencies. Uses standard HTTP. Works on single server. But requires keeping connections open (HTTP/1.1 6-connection browser limit applies). |
| C5 Effort | **2** | Must build: hybrid SSE+REST for bidirectional, custom room management, message routing, auth workaround. Significantly more custom code than Socket.io. |
| C6 Bundle | **5** | Native browser API — zero bundle size impact. Best possible score. |

**Weighted Score:** (2×20 + 1×25 + 3×15 + 4×15 + 2×15 + 5×10) / 100 = **2.50 / 5.00**

### 3.3 ws 8.19.0 (Raw WebSocket)

| Criterion | Score (1-5) | Notes |
|-----------|:-----------:|-------|
| C1 Auth | **3** | Supports `protocols` subprotocol and query params for auth. But requires manual middleware implementation — no built-in auth hooks. Must parse upgrade request manually. |
| C2 Bidirectional | **5** | Full WebSocket duplex. But raw — no rooms, no broadcasting, no namespaces. All routing logic must be built from scratch. |
| C3 Reconnect | **2** | Zero built-in reconnect on client side (browser `WebSocket` API). Must implement entirely from scratch: reconnect loop, backoff, jitter, state management. |
| C4 Infra fit | **4** | Very lightweight server footprint. But no Redis adapter — horizontal scaling requires custom pub/sub implementation. |
| C5 Effort | **2** | Must build from scratch: room management, message routing, broadcasting, reconnection, error handling. Essentially building a custom Socket.io. Estimated 3-5x more code than Socket.io approach. |
| C6 Bundle | **4** | Browser `WebSocket` is native (0 KB). But reconnection + room management client code adds ~10-15 KB. Still lighter than Socket.io. |

**Weighted Score:** (3×20 + 5×25 + 2×15 + 4×15 + 2×15 + 4×10) / 100 = **3.45 / 5.00**

---

## 4. Comparative Summary

| Protocol | C1 Auth (20%) | C2 Bidir (25%) | C3 Reconnect (15%) | C4 Infra (15%) | C5 Effort (15%) | C6 Bundle (10%) | **Weighted Total** |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Socket.io 4.8** | 5 | 5 | 5 | 5 | 5 | 3 | **4.80** |
| **ws 8.19** | 3 | 5 | 2 | 4 | 2 | 4 | **3.45** |
| **Native SSE** | 2 | 1 | 3 | 4 | 2 | 5 | **2.50** |

---

## 5. Recommendation (Subtask 1.4)

### Chosen Protocol: Socket.io 4.8.3

**Libraries:**
- Server: `socket.io@4.8.3`
- Client: `socket.io-client@4.8.3`
- Future scaling (not for spike): `@socket.io/redis-adapter`

### Rationale

1. **Bidirectional chat is non-negotiable.** FR11 requires supervisor ↔ enumerator messaging. SSE fails this requirement outright — hybrid SSE+REST adds unjustifiable complexity for a chat system.

2. **Built-in rooms map directly to LGA team model.** `io.to('lga:ibadan-north').emit('message', data)` — zero custom routing code. This is the exact feature we need for LGA-scoped team messaging.

3. **Auth integration is first-class.** Socket.io's `io.use(middleware)` pattern mirrors Express middleware. We can extract JWT from `socket.handshake.auth.token` and run the same `TokenService.verifyAccessToken()` + blacklist check used in REST middleware.

4. **Reconnection with backoff is built-in.** Field staff on unstable 3G networks need robust reconnection. Socket.io provides configurable exponential backoff with jitter — matching ADR-005 degraded mode requirements without custom code.

5. **Single-server deployment is the sweet spot.** At 200 concurrent connections, Socket.io on a single CX43 VPS handles this trivially. Redis adapter is available for future horizontal scaling but not needed now.

6. **Bundle size is manageable.** ~45 KB gzipped is acceptable given the LCP budget of 2.5s. Can be mitigated with dynamic import (`React.lazy` or route-level code splitting) so the transport module only loads for authenticated dashboard users, not the public site.

### Explicit Non-Goals

- **Not evaluating:** MQTT, gRPC streams, WebTransport, GraphQL subscriptions, or multi-broker setups (Kafka, RabbitMQ). These are architecturally inappropriate for a 200-user single-VPS deployment.
- **Not solving:** Message persistence or chat UI. That is Story 4.2 scope. This spike validates transport delivery only.
- **Not implementing:** Redis adapter for Socket.io. Single-server deployment doesn't need it. Documented for when horizontal scaling is required.
- **Not optimizing:** Binary protocol or custom serialization. JSON payloads are sufficient at this scale.

### Conditions That Would Trigger Re-evaluation

| Condition | Alternative to Consider |
|-----------|----------------------|
| Scale exceeds 10,000 concurrent connections | Consider `uWebSockets.js` for raw performance |
| Multiple server instances required | Add `@socket.io/redis-adapter` (not a protocol change) |
| Unidirectional notifications only (no chat) | SSE becomes viable if FR11 is descoped |
| Bundle size exceeds 100 KB gzipped | Consider `ws` with custom reconnect if lazy-loading insufficient |
| React Native mobile client required | Socket.io supports React Native — no protocol change needed |

---

## 6. Implementation Handoff Package for Story 4.2

### 6.1 Dependencies (Subtask 5.1)

**API (`apps/api/package.json`):**
```json
"socket.io": "^4.8.3"
```

**Web (`apps/web/package.json`):**
```json
"socket.io-client": "^4.8.3"
```

**Future (when horizontal scaling needed):**
```json
"@socket.io/redis-adapter": "^8.x"
```

### 6.2 Server Bootstrap Pattern (Subtask 5.2)

**HTTP Server Refactoring (already done in spike):**

`apps/api/src/index.ts` was refactored from `app.listen()` to:
```typescript
import http from 'http';
const server = http.createServer(app);
const { initializeRealtime } = await import('./realtime/index.js');
initializeRealtime(server);
server.listen(port, () => { ... });
```

**Transport Initialization (`apps/api/src/realtime/index.ts`):**
```typescript
import { Server as SocketServer } from 'socket.io';
const io = new SocketServer(httpServer, {
  cors: { origin: CORS_ORIGIN, credentials: true },
  transports: ['websocket', 'polling'],
});

// Auth middleware — runs BEFORE connection is established
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  const user = await verifySocketToken(token);
  socket.data.user = user;  // Attach to socket for downstream
  next();
});

// Connection handler — auto-join LGA room
io.on('connection', (socket) => {
  const user = socket.data.user;
  const room = getRoomName(user.lgaId);
  if (canJoinRoom(user, room)) socket.join(room);
});
```

**Room/Channel Management (`apps/api/src/realtime/rooms.ts`):**
- Room naming: `lga:{lgaId}` (e.g., `lga:ibadan_north`)
- Authorized roles: `SUPERVISOR` and `ENUMERATOR` only
- `canJoinRoom(user, room)` validates role + LGA match
- Room abstracted behind function — easy to swap if prep-8 changes team model

### 6.3 Client Integration Pattern (Subtask 5.3)

**Hook API (`apps/web/src/hooks/useRealtimeConnection.ts`):**
```typescript
const { isConnected, isDegraded, connectionState, pollingInterval, socket } = useRealtimeConnection();
```

**Return values:**
| Property | Type | Description |
|----------|------|-------------|
| `isConnected` | `boolean` | True when socket is actively connected |
| `isDegraded` | `boolean` | True when using polling fallback |
| `connectionState` | `'disconnected' \| 'connecting' \| 'connected' \| 'degraded'` | Current state |
| `pollingInterval` | `number \| false` | Use as TanStack Query `refetchInterval` — `false` when connected |
| `socket` | `Socket \| null` | Raw socket for event listeners |

**Connection Lifecycle:**
1. Read JWT from `sessionStorage.getItem('oslsr_access_token')`
2. Connect to `VITE_API_URL` (stripped to origin) with `auth: { token }`
3. Socket.io auto-reconnect: 1s → 30s max, infinite attempts
4. On `connect_error`: enter degraded mode, expose `pollingInterval`
5. On unmount: `socket.close()` for cleanup

**Auth Flow:**
- Token passed via `socket.handshake.auth.token` (NOT query params)
- Token refresh: when `AuthContext` refreshes token, component re-renders and hook reconnects with new token
- Token expiry: server rejects with `AUTH_SESSION_EXPIRED`, triggers `connect_error`

**Polling Fallback (Subtask 3.4):**
```typescript
// In consuming component:
const { pollingInterval } = useRealtimeConnection();
const { data } = useQuery({
  queryKey: ['supervisor', 'messages'],
  queryFn: fetchMessages,
  refetchInterval: pollingInterval, // false when connected, 5s→60s when degraded
});
```

### 6.4 File Touchpoints for Story 4.2 (Subtask 5.4)

**Files to MODIFY (already exist from spike):**

| File | Action |
|------|--------|
| `apps/api/src/realtime/index.ts` | Add message persistence events, namespace for messaging |
| `apps/api/src/realtime/rooms.ts` | Add direct-message room pattern (if needed beyond LGA broadcast) |
| `apps/web/src/hooks/useRealtimeConnection.ts` | Add message event listeners, send method |
| `apps/web/src/features/dashboard/pages/SupervisorMessagesPage.tsx` | Replace PoC harness with full chat UI |
| `apps/web/src/components/RealtimeStatusBanner.tsx` | Integrate into DashboardLayout header |

**Files to CREATE (Story 4.2 scope):**

| File | Purpose |
|------|---------|
| `apps/api/src/db/schema/messages.ts` | Drizzle schema for messages table |
| `apps/api/src/services/message.service.ts` | Message CRUD, delivery tracking |
| `apps/api/src/controllers/message.controller.ts` | REST API for message history |
| `apps/api/src/routes/message.routes.ts` | Message endpoints |
| `apps/web/src/features/dashboard/components/ChatComposer.tsx` | Message input component |
| `apps/web/src/features/dashboard/components/MessageList.tsx` | Conversation display |
| `apps/web/src/features/dashboard/hooks/useMessages.ts` | TanStack Query hooks for messages |

**Files to LEAVE UNCHANGED:**

| File | Reason |
|------|--------|
| `apps/api/src/index.ts` | HTTP server refactor already done |
| `apps/api/src/app.ts` | Express middleware chain unaffected |
| `apps/api/src/middleware/auth.ts` | REST auth unchanged; transport uses `verifySocketToken` |
| `apps/api/src/realtime/auth.ts` | Auth handshake logic complete |

### 6.5 Test Strategy & Rollback Plan (Subtask 5.5)

**Unit Tests (already done in spike):**
- `apps/api/src/realtime/__tests__/auth.test.ts` — 7 tests (JWT verify, blacklist, revocation)
- `apps/api/src/realtime/__tests__/rooms.test.ts` — 10 tests (room naming, join authorization)
- `apps/api/src/realtime/__tests__/security.boundary.test.ts` — 16 tests (all boundary scenarios)
- `apps/web/src/hooks/useRealtimeConnection.test.ts` — 9 tests (hook state, connect, disconnect, degraded)

**Story 4.2 should add:**
- Integration tests: actual Socket.io client-server message delivery (use `socket.io-client` + test server)
- Message persistence tests: CRUD operations for messages table
- E2E tests: supervisor sends message, enumerator receives (Playwright with two browser contexts)

**Rollback Plan:**
1. **Feature flag (recommended):** Add `FEATURE_REALTIME_ENABLED` env var. When `false`, skip `initializeRealtime(server)` in `index.ts` and return early in `useRealtimeConnection`.
2. **Conditional import:** The `import('./realtime/index.js')` in `index.ts` is already a dynamic import inside the `NODE_ENV !== 'test'` guard. Wrapping it in a feature flag is trivial.
3. **Dependency removal:** `pnpm --filter @oslsr/api remove socket.io && pnpm --filter @oslsr/web remove socket.io-client` — revert `index.ts` to `app.listen()`. Zero database migration needed (spike added no tables).

### 6.6 Bundle Size Impact (Subtask 5.6)

**Measurement:**

| Metric | Value |
|--------|-------|
| `SupervisorMessagesPage` chunk (with socket.io-client) | 54 KB raw |
| socket.io-client contribution (estimated) | ~50 KB raw / ~16 KB gzipped |
| Impact on initial page load | **None** — route-level code splitting |
| Impact on Messages page load | +16 KB gzipped over the wire |
| LCP impact | **Negligible** — loaded after initial render, not on critical path |

**Mitigation already in place:**
- Vite code-splits the Messages page into its own chunk (`SupervisorMessagesPage-*.js`)
- Socket.io-client is only downloaded when the user navigates to `/dashboard/supervisor/messages`
- Public pages, login, and other dashboard pages are unaffected

**Risk R1 status:** MITIGATED. Bundle size (16 KB gzipped) is well within acceptable limits and already isolated by code splitting.
