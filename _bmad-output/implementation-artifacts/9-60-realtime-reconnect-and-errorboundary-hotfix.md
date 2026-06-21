# Story 9.60: Realtime reconnect cap + route-scoped ErrorBoundary reset

Status: done (✅ 2026-06-21 — operator confirmed the white-screen freeze is resolved on prod; deployed via the journey/main integration @ d31f920→e403fb5. Code review-passed earlier — 2 independent adversarial passes, 0 High; socket-storm fix verified.)
Type: hotfix
Discovered: 2026-06-18 (operator, local dev — Enumerator login)
Authored: 2026-06-18 by Bob (SM)
Implemented + reviewed: 2026-06-18 (in-session dev + 2 independent adversarial reviews)
Classification: HOTFIX — quality/resilience. NOT a launch gate, but fixes a prod-affecting class (post-login white-screen + realtime degradation). Lightweight, isolated.

## Story

As a **registered user (staff or public) logging into the app**,
I want **the page to render reliably after login and the realtime layer to fail gracefully**,
so that **I never hit a permanent white screen that only a hard refresh clears, and a dead Socket.io handshake degrades to polling instead of retrying forever**.

## Context / Why

Reproduced in local dev: after an Enumerator login the page goes **white until a manual refresh**, and over a session the page **degrades to unresponsive until `pnpm run dev` is killed and restarted**. Diagnosis traced two independent defects, both introduced/aggravated by Story 9-49 (in-memory access-token migration):

1. **Realtime reconnect storm (→ progressive unresponsiveness / "must kill Vite").** The socket is created with `reconnectionAttempts: Infinity` and `connect_error` only flips state to `degraded` — it **never stops retrying** [Source: apps/web/src/hooks/useRealtimeConnection.ts:86, :101-104]. A dead/auth-failing handshake (server throws `AUTH_REQUIRED` [Source: apps/api/src/realtime/index.ts:52-69]) retries forever. In dev, HMR re-mounts `DashboardLayout` and accumulates orphaned sockets — each retrying — until the event loop is pegged. A polling fallback **already exists** (`POLLING_INTERVALS`, `pollingInterval`, `degraded` state) but nothing ever hands off to it because the socket never gives up [Source: apps/web/src/hooks/useRealtimeConnection.ts:28-29, :115-117].

2. **Permanent white screen on a post-login render error (→ "fixed by refresh, not by logout").** A full reload runs `initializeAuth`'s deterministic boot-refresh barrier (`awaitAccessToken` queue) so refresh always works; the SPA-navigate path after login has no such barrier. If any first-render dashboard child throws, the **top-level `<ErrorBoundary>` blanks the whole app with no route-aware reset** — it sits **outside `<BrowserRouter>`** so it cannot key off `useLocation`, and its fallback persists until a hard reload [Source: apps/web/src/App.tsx:237-242, :244]. The `ErrorBoundary` component **already supports `resetKey`** (and `componentDidUpdate` resets on key change) — it is simply never given a route-scoped key at the top level [Source: apps/web/src/components/ErrorBoundary.tsx:29, :107-114].

Both defects affect **production**, not just dev: (1) any user whose handshake transiently fails gets an infinite retry loop + extra API load; (2) any caught render error white-screens a real user until they manually reload.

## Acceptance Criteria

1. **Socket reconnection is bounded.** `useRealtimeConnection` uses a **finite** `reconnectionAttempts` (named constant `MAX_RECONNECTION_ATTEMPTS = 10`) instead of `Infinity`. When attempts are exhausted, the socket stops retrying and the hook settles into the existing `degraded`/polling mode (does not silently go dark), and re-arms on a recovery signal (see AC#7).
2. **Exhaustion hands off to polling cleanly.** A `reconnect_failed` (and/or attempt-exhaustion) handler sets `connectionState = 'degraded'` so `pollingInterval` engages the existing TanStack Query refetch fallback, and ensures the underlying socket is closed/idle (no lingering retry timers). Consumers continue to receive data via polling.
3. **No regression to the happy path.** A successful connect still resets `errorCount` to 0 and reports `connected`; a transient single failure still recovers within the bounded attempts. Cleanup on unmount/logout still closes the socket (no leaked sockets).
4. **Route-scoped ErrorBoundary self-heals.** A render error caught at the route level no longer requires a hard refresh: an `ErrorBoundary` **inside** `<BrowserRouter>` wraps `<Routes>` with `resetKey={pathname}` (via a small router-aware helper, mirroring the existing `ScrollToTop` `useLocation` pattern), so navigating to a new route resets the boundary and re-attempts render. **Scope note (L1):** this wraps **all** route-level renders — public *and* authenticated — so every route-level throw now self-heals on navigation (broader than just the post-login case that motivated it), showing the route-scoped "Page Error" copy. The existing top-level boundary remains as the last-resort catch-all for errors **above** the router (e.g. `AuthProvider`), which stay hard-refresh-only by design. **Efficacy caveat (M1):** the specific post-login white screen is only fixed by this if the throw originates *inside* `<Routes>` (a dashboard page render — the likely case); if the real throw is in `AuthProvider`/`ReAuthModal`/boot path it is caught by the outer boundary instead. Confirm with the captured stack at the operator repro (Task 4) — the socket fix is independent of this.
5. **Tests cover both fixes.** Unit tests assert: (a) the socket is created with a finite `reconnectionAttempts`; (b) on `reconnect_failed` the hook reports `degraded` + deterministic `pollingInterval` and re-arms on focus; (c) the route-scoped boundary clears its error state when the route key changes. No reliance on the mocked layer that hid the original bug — assert observable behavior.
6. **Scope discipline.** Two existing production files change (`useRealtimeConnection.ts`, `App.tsx`) plus **one small extracted component** (`RouteErrorBoundary.tsx` — extracted for testability + minimal `App.tsx` churn) and their tests. No edit to `ErrorBoundary.tsx` (already supports `resetKey`). No change to socket auth, transports semantics, or the server. The optional stale-service-worker concern is **out of scope** (noted as a follow-up, not the cause).
7. **Bounded reconnection re-arms on recovery.** After exhaustion (degraded), a `focus`/`visibilitychange` listener re-arms a fresh bounded connection **only from the settled `degraded` state**, so a transient outage that never toggled `navigator.onLine` self-heals when the user returns to the tab — without reintroducing an unbounded retry loop or interrupting a healthy/in-progress connection.

## Tasks / Subtasks

- [x] **Task 1 — Bound socket reconnection (AC: #1, #2, #3, #7)**
  - [x] Replace `reconnectionAttempts: Infinity` with a named finite constant `MAX_RECONNECTION_ATTEMPTS = 10`.
  - [x] Add a `socket.io.on('reconnect_failed', …)` Manager handler (NOT a socket event) that sets `connectionState = 'degraded'`, pins `errorCount` to the slowest polling tier (deterministic 60 s), nulls the dead socket so `[socket]` consumers unbind, and `socket.close()`s.
  - [x] Add focus/visibility re-arm (`reconnectNonce`, gated on `degraded` via `connectionStateRef`) so a transient outage self-heals (AC#7).
  - [x] Confirm the existing `connect` handler still resets `errorCount`/`connected` and the unmount cleanup detaches the Manager listener + `socket.close()`s.
- [x] **Task 2 — Route-scoped ErrorBoundary reset (AC: #4, #6)**
  - [x] Extracted `RouteErrorBoundary.tsx` (inside `<BrowserRouter>`, `useLocation().pathname` → `resetKey`) wrapping `<Routes>`; top-level `<ErrorBoundary>` kept as outer catch-all.
  - [x] `ErrorBoundary.tsx` NOT modified — `resetKey` + `componentDidUpdate` reset already existed.
- [x] **Task 3 — Tests (AC: #5)**
  - [x] `useRealtimeConnection` test: finite `reconnectionAttempts`; `reconnect_failed` → degraded + `pollingInterval === 60_000` + close; Manager subscribe-name lock; re-arm-on-focus; no-rearm-while-connected; listener cleanup. (16 tests)
  - [x] `RouteErrorBoundary` test: throw → fallback; route change → self-heal; no-throw → passthrough. (3 tests)
- [x] **Task 4 — Verify + land (AC: all)**
  - [x] Touched suites 19/19 pass + `pnpm --filter @oslsr/web build` (vite-build gate) green; lint clean.
  - [x] **Manual repro (operator gate — M1):** ✅ 2026-06-21 — operator confirmed the white-screen freeze is gone (login renders on first paint; socket settles to polling, no peg).
  - [x] Landed on `main` via the journey integration (merge `d6fdb0b`), deployed `d31f920`→`e403fb5`; CI green each push.

## Dev Notes

### Reuse / seams (verified)
- **Polling fallback already wired** — do not build a new one. `POLLING_INTERVALS` + `getPollingInterval` + `pollingInterval` return + `degraded` state are the intended degraded mode; the fix just makes the socket actually reach it [Source: apps/web/src/hooks/useRealtimeConnection.ts:28-29, :64-67, :115-124].
- **In-memory token is correct as-is** — the `auth: (cb) => cb({ token: getAccessToken() })` function form re-reads the refreshed JWT on each attempt; no change needed there [Source: apps/web/src/hooks/useRealtimeConnection.ts:76-80].
- **`ErrorBoundary.resetKey` is pre-built** — props `:29`, reset on change `:107-114`; precedent `@example` in the file's own docblock `:67-70`. Router-aware helper precedent = `ScrollToTop` (`useLocation`) [Source: apps/web/src/App.tsx:230, :245].

### Worktree-conflict surface (active parallel tracks: journey 9-21→9-39→9-40, security 9-41/43/44/45)
- `useRealtimeConnection.ts` — touched by neither track → **zero conflict**.
- `App.tsx` — journey 9-40 adds `<Route>`s *inside* `<Routes>`; this story wraps `<Routes>` + adds a helper near the top → **different region, trivial/auto-merge**.
- `ErrorBoundary.tsx` — not edited.
- **Sequencing recommendation:** land 9-60 on `main` first; both worktrees then `git merge main` to pick it up — which **also fixes the same white-screen/degradation bug in their dev CLIs** (they are hitting it now). The hotfix is an enabler for the parallel work, not a risk to it.

### Bible compliance
- Pino logging on the new failure handler stays `{domain}.{action}` if any log is added (prefer existing `logger.warn`); skeleton-not-spinner unaffected; no new env vars; ESM `.js` relative imports. Keep the `App.tsx` helper a named function component (no inline arrow in JSX prop creating a new boundary identity each render).

### Out of scope / follow-up
- Stale service worker on `localhost` from a prior prod build/preview can mimic this once; `devOptions.enabled:false` means dev never registers a new one. Advise testers to Unregister once under Application → Service Workers. A boot-time dev SW-unregister could be a separate hygiene follow-up — **not** part of this hotfix.
- Periodic socket re-attempt after exhaustion (beyond polling) is intentionally deferred; polling is the accepted degraded mode.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-18 | 0.1 | Initial draft (ready-for-dev) — from the 2026-06-18 local-dev white-screen diagnosis | Bob (SM) |
| 2026-06-18 | 0.2 | Implemented + independently reviewed. Review raised H1 (5-cap + `[isOnline]`-only effect = permanently-dead socket after a transient outage) → fixed with focus/visibility re-arm. M1/M2/M3 folded in. Status → review (review-passed). | dev + reviewer |
| 2026-06-18 | 0.3 | Insurance (2nd independent) review: 0 High / 3 Med / 4 Low — "no code changes strictly required". Code validated sound (re-arm can't storm, Manager-event correct, ref-during-render blessed, socket propagation holds). Folded in: AC#6 → 3-file reality (M2), Task boxes checked (M3), AC#4 scope+efficacy caveat (L1/M1), stale test docblock (L3). Reconnection cap **5 → 10** for headroom. M1 efficacy = operator-repro gate (kept open). | dev + reviewer-2 |

## Senior Developer Review (2026-06-18)

Independent adversarial review of the uncommitted diff (read both prod files, both tests, `ErrorBoundary.tsx`, `ErrorFallback.tsx`, the socket.io-client v4.8.3 Manager source, and the consumer `useMessages.ts`). Verdict was **CHANGES-REQUIRED** on H1; resolutions:

- **H1 (High) — FIXED.** Capping at 5 with the effect keyed only on `[isOnline]` left the socket permanently in polling mode after a transient outage that never toggled `navigator.onLine` (server restart / WiFi blip). Resolution: a mount-once `focus` + `visibilitychange` listener re-arms a fresh connection (`reconnectNonce`) — but **only from the settled `degraded` state** (via a `connectionStateRef`), so it never interrupts a healthy/in-progress connection and never reintroduces an unbounded loop. New tests: re-arm-on-focus-after-degrade; no-rearm-while-connected.
- **M1 (Med) — FIXED.** On exhaustion the handler now nulls `socketRef.current`, so consumers keyed on `[socket]` (`useMessages.ts:125`) unbind from the closed socket immediately and rebind to the fresh one on re-arm.
- **M2 (Med) — FIXED.** Handler sets `errorCount` to the slowest tier, so degraded polling is a deterministic 60 s regardless of prior `connect_error` count; test asserts `toBe(60_000)`.
- **M3 (Med) — FIXED.** Test now asserts `mockManagerOn` was called with the exact event name `'reconnect_failed'` (locks the v4 Manager-event contract on the subscribe side, not just cleanup).
- **L1 (double `close()`) — accepted:** socket.io `close()` is idempotent. **L3 (same-route errors)** — known blind spot: `resetKey={pathname}` only self-heals on a *path change*; a re-throw on the same route still shows the fallback, but `ErrorFallback`'s "Try Again" button (`resetError`) is the manual escape hatch. **L4 (errors in `AuthProvider`/`ReAuthModal` outside `<Routes>`)** — by design, caught by the outer boundary (hard-refresh-only); scope-limited to post-login route renders. **L7 (commit scope)** — the unrelated `_bmad-output/baseline-report/**` working-tree churn must NOT be swept into this commit (staging only the hotfix files).

### Insurance review — 2nd independent pass (2026-06-18)

Run as a pre-push insurance gate in a separate CLI. Verdict: **APPROVE-WITH-NITS — 0 High / 3 Med / 4 Low, "no code changes strictly required to merge."** File-List vs git diff: 0 discrepancies. Independently re-validated the riskiest claims (all hold): `reconnect_failed` is a v4 Manager event; the re-arm guard cannot form a storm (fires only on discrete focus/visibility events, only from `degraded`); ref-mutation-during-render is the blessed StrictMode-safe pattern; socket recreation propagates to `useMessages` (`[socket]` dep); double-`close()` idempotent + symmetric cleanup. Resolutions:
- **M1 (efficacy unproven)** — KEPT OPEN as an operator gate. The throwing component was never captured; `RouteErrorBoundary` wraps inside `<Routes>` while `AuthProvider`/`ReAuthModal` are outside. If the real post-login throw is outside `<Routes>`, AC#4's remedy won't fire. Story Status + AC#4 now state this explicitly; Task 4 repro now requires **capturing the stack**. The socket-storm fix is independent and verified.
- **M2 (AC#6 said "exactly two prod files")** — FIXED: AC#6 updated to the 3-file reality (extracted `RouteErrorBoundary.tsx`).
- **M3 (task boxes all `[ ]`)** — FIXED: completed tasks checked `[x]`; Task 4 left `[~]` (manual repro open).
- **L1 (AC#4 scope wording)** — FIXED: AC#4 now notes the boundary covers all route-level renders (public + authed).
- **L2 (kiosk/never-blur tab never re-arms)** — accepted trade-off (data still flows via polling; "degraded, not dark"); documented.
- **L3 (stale "Story prep-6" test docblock)** — FIXED: added a 9-60 line.
- **L4 (`pollingInterval` 5 000 ms during initial connecting)** — pre-existing, not a 9-60 regression; arguably desirable (fast first paint). No change.

Post-review change: reconnection cap raised **5 → 10** for headroom (test asserts finite/>0, not the literal value — no test churn).

## Dev Agent Record

### Context Reference
- Diagnosis: 2026-06-18 background investigation of post-login white-screen + progressive unresponsiveness (Enumerator login, local dev).
- Independent review: 2026-06-18 adversarial pass (CHANGES-REQUIRED → all High/Med resolved).

### File List
- `apps/web/src/hooks/useRealtimeConnection.ts` — finite reconnection cap + `reconnect_failed` → deterministic polling handoff + null-on-degrade + focus/visibility re-arm.
- `apps/web/src/components/RouteErrorBoundary.tsx` — **new** route-scoped boundary (`resetKey={pathname}`), extracted for testability + minimal `App.tsx` churn.
- `apps/web/src/App.tsx` — import + 2-line wrap of `<Routes>` in `<RouteErrorBoundary>` (inside the Router).
- `apps/web/src/hooks/useRealtimeConnection.test.ts` — finite-attempts, reconnect_failed→degraded(60s)+close, Manager subscribe-name lock, re-arm-on-focus, no-rearm-while-connected, listener cleanup.
- `apps/web/src/components/RouteErrorBoundary.test.tsx` — **new** fallback-on-throw, self-heal-on-route-change, passthrough-when-no-throw.

### Verification
- `pnpm --filter @oslsr/web` touched suites: **19/19 pass** (16 hook + 3 boundary).
- Lint clean; `tsc && vite build` green (the vite-build gate that caught the 9-58 barrel break).
- Manual repro (operator, post-pull): Enumerator login renders without the white screen; dashboard left open settles to degraded/polling instead of pegging the dev server — **pending**.
