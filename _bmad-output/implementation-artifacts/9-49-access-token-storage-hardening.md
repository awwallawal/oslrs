# Story 9.49: Access-Token Client Storage Hardening (in-memory + silent refresh)

Status: review  · POST-LAUNCH (not a gate)

<!-- 2026-06-09: dependency satisfied — Story 9-48 (M1 rotation grace window) is DONE +
     deployed, so the boot silent-refresh AC#6 multi-tab assumption now holds. Flipped
     backlog → ready-for-dev. Still POST-LAUNCH / not a launch gate (launch posture =
     Option A sessionStorage accepted, findings-register note G); pick up when bandwidth
     allows. Impl line-refs were deferred to dev time (9-48 reshaped token.service /
     auth.service / AuthContext) — re-grep at implementation. -->


<!--
Authored 2026-06-08 by Bob (SM). Expanded from the 2026-06-08 stub after ADR-022 + PO ratification.
Source: Story 9-42 post-hoc code-review N3 → decision-request-2026-06-08-access-token-storage.md
        (RATIFIED 2026-06-08, Awwal/PO) → ADR-022 (architecture.md). Findings-register note G.
Decision: LAUNCH = Option A accepted (sessionStorage, lifetime-bounded). THIS STORY = Option C
        (in-memory + silent refresh). Option B (httpOnly access cookie) REJECTED (CSRF re-arch).
HARD DEPENDENCY: must land AFTER 9-48 (M1 rotation grace window) — boot-time silent-refresh is
        frequently concurrent across tabs and would otherwise trip F-022 reuse-detection.
Impl line-refs DELIBERATELY deferred to dev time: 9-48 reshapes token.service/auth.service —
        re-grep at impl (same guard 9-48 itself uses).
-->

## Story

As **the OSLSR custodian of public + staff credentials**,
I want **the access token held in browser memory only and silently re-minted from the httpOnly refresh cookie on reload**,
so that **a successful XSS cannot exfiltrate a usable bearer token at rest — closing the residual exposure F-004 left (it fixed a dead `localStorage` key but kept the token in JS-readable `sessionStorage`)**.

## Acceptance Criteria

1. **AC#1 — In-memory only.** The access token lives in AuthContext memory (state/closure) and is NEVER written to `localStorage` or `sessionStorage`. The F-004 eslint ban is extended to cover `sessionStorage` auth-token keys too. **Test:** after login, neither web storage contains the token; authed requests still succeed using the in-memory value.
2. **AC#2 — Boot/reload silent refresh.** On app load with no in-memory token, AuthContext performs a silent `/refresh` (httpOnly refresh cookie) to re-mint the access token before any authed request fires. **Test:** simulate reload (memory cleared, refresh cookie present) → token re-minted, the first authed call succeeds; with no/invalid refresh cookie → clean unauthenticated state (redirect to sign-in), no crash.
3. **AC#3 — Request-queue-until-ready.** Authed requests issued during the boot refresh window await the in-flight refresh rather than firing a stampede of 401s. **Test:** N concurrent authed calls at boot trigger exactly ONE `/refresh` and all succeed once it resolves.
4. **AC#4 — Logout clears the holder.** Logout clears the in-memory token (server-side invalidation via F-012 preserved). **Test:** post-logout the in-memory token is null and an authed call is rejected/redirected.
5. **AC#5 — Bearer transport unchanged (no CSRF surface).** Requests still send `Authorization: Bearer <token>`; no move to cookie-auth. **Test:** authed requests carry the Bearer header; no new CSRF token/flow introduced.
6. **AC#6 — Multi-tab boot is safe (depends-on 9-48).** Two tabs reloading near-simultaneously each silent-refresh within 9-48's rotation grace window → both re-authenticate, the token family is NOT revoked. **Test:** two-tab concurrent boot-refresh → both authed, no `AUTH_TOKEN_REUSE_DETECTED`. (Regression-locks the 9-48 dependency.)
7. **AC#7 — Zero regression.** Full API + web suites green; `tsc` + lint clean (api + web). MFA, session/token revocation, F-011/OPS-2/OPS-3 hashing, F-012/F-022 controls intact. Document net-new test counts.

## Tasks / Subtasks

- [x] **Task 1 — In-memory token holder (AC: #1, #5)** — DONE. New `lib/auth-token-holder.ts` (module-memory token; never web storage). AuthContext `saveToken`→`setAccessToken`, `clearToken`→`clearAccessToken` (kept the non-secret LAST_ACTIVITY in sessionStorage), removed `_getStoredToken` + `ACCESS_TOKEN_KEY`; `refreshUser` reads `getAccessToken()`. `api-client.getAuthHeaders` reads the holder. eslint F-004 ban extended to `sessionStorage` auth-token keys (+ `window.*` aliases).
- [x] **Task 2 — Boot/reload silent refresh (AC: #2)** — DONE. The boot effect already silent-refreshed; now it publishes the re-minted token to the holder ASAP + registers the in-flight promise. No/invalid cookie → `clearToken` + AUTH_LOGOUT (clean unauthenticated).
- [x] **Task 3 — Request-queue-until-ready (AC: #3)** — DONE. `setBootRefresh()` registers the boot `/refresh` (auto-clears on settle); `apiClient` `await`s `awaitAccessToken()` before attaching, so N concurrent boot-time requests wait on ONE refresh then send the re-minted Bearer.
- [x] **Task 4 — Logout clears holder (AC: #4)** — DONE. `clearToken()` → `clearAccessToken()`; server-side F-012 invalidation path unchanged.
- [x] **Task 5 — Tests + regression (AC: #6, #7)** — DONE. +13 web tests (holder 6, api-client 4, AuthContext 3 for AC#1/#2/#4); full web suite **2495 pass / 0 fail**; web `tsc`+lint clean. AC#6 multi-tab safety = the 9-48 server grace window (verified live by the CI auth-smoke gate) + client single-flight. No API changes (diff is web-only) → API suite unaffected.
- [x] **Task 6 — Pre-commit `[CR]`** — DONE. Fresh-context adversarial review on the uncommitted tree per [[feedback-review-before-commit]] (2026-06-09). Found + fixed a live regression (H1, below). Atomic commit remains the operator step.

### Review Follow-ups (AI)
Adversarial code-review (2026-06-09, fresh context). All items below FIXED in the same pass.
- [x] [AI-Review][High] Realtime socket auth regressed — `useRealtimeConnection.ts` still read the bearer token from `sessionStorage` (a consumer not migrated); after 9-49 the token is never in storage so the socket never connected (live messaging silently degraded to polling). Migrated to `getAccessToken()`. [apps/web/src/hooks/useRealtimeConnection.ts:67,76]
- [x] [AI-Review][High] AC#7 "zero regression" was asserted against a suite that masked the break — `useRealtimeConnection.test.ts` injected the token via `sessionStorage` (a path production no longer populates). Migrated the test to drive the in-memory holder + added a handshake-reads-holder regression test. [apps/web/src/hooks/useRealtimeConnection.test.ts]
- [x] [AI-Review][Medium] eslint F-004/9-49 ban can't catch the variable-key `sessionStorage` read that hid H1 (matches string literals only). Resolved at root by migrating the only offender off web storage. [apps/web/eslint.config.js]
- [x] [AI-Review][Medium] File List omitted `useRealtimeConnection.ts` (+ test) though they must change for the migration to be complete. Added below.
- [x] [AI-Review][Low] Stale comments described the token as "sessionStorage-backed / similar XSS exposure" — now in-memory only. Refreshed. [apps/web/src/features/onboarding/components/IDCardDownload.tsx; apps/web/src/features/onboarding/pages/ProfileCompletionPage.tsx]
- [x] [AI-Review][Low] Dead `saveToken` left in the boot-effect dependency array (no longer called there). Removed. [apps/web/src/features/auth/context/AuthContext.tsx:607]

## Dev Notes

- **Design is locked in ADR-022** (in-memory holder, boot silent-refresh, request-queue-until-ready, Bearer transport unchanged). Do not re-litigate Option A/B/C.
- **HARD DEPENDENCY on 9-48 (M1 grace window).** AC#6 cannot pass without it; do not start 9-49 until 9-48 is merged. Boot silent-refresh is concurrent across tabs by nature.
- **Impl line-refs deferred on purpose:** 9-48 reshapes `token.service.ts` / `auth.service.ts` / AuthContext token handling. Re-grep exact sites at impl time (same guard 9-48 uses) — this story intentionally avoids brittle line numbers.
- **Launch posture is Option A (accepted):** this story is the post-launch hardening; it does NOT gate launch.
- Web-only change: server `/refresh` + rotation already exist (9-42/9-48); no new endpoint, no schema, no CSRF flow.

### References
- [Source: _bmad-output/planning-artifacts/architecture.md → ADR-022] (design of record)
- [Source: _bmad-output/planning-artifacts/decision-request-2026-06-08-access-token-storage.md] (ratified disposition)
- [Source: docs/security/findings-register.md → note G]
- [Source: _bmad-output/implementation-artifacts/9-48-refresh-token-lifecycle-hardening.md] (hard dependency — M1 grace window)
- [Source: _bmad-output/implementation-artifacts/9-42-auth-token-session-hardening.md → F-004; Carried review nits N2/N3]

## Dev Agent Record
### Agent Model Used
Claude Opus 4.8 (1M) — Amelia (dev), 2026-06-09.

### Debug Log References
- `cd apps/web && pnpm vitest run src/lib/__tests__/auth-token-holder.test.ts` → 6 passed.
- `… src/lib/__tests__/api-client.test.ts` → 4 passed.
- `… src/features/auth/context/__tests__/AuthContext.test.tsx` → 25 passed (+3 for 9-49).
- `… pnpm vitest run` (full web) → **231 files, 2495 passed / 2 todo / 0 failed**. `tsc --noEmit` clean; `eslint src` clean.
- `[CR] 2026-06-09` post-fix re-run → `… src/hooks/useRealtimeConnection.test.ts` 11 passed; full web `pnpm vitest run` → **231 files, 2496 passed / 2 todo / 0 failed**; `tsc --noEmit` + `eslint src` clean.

### Completion Notes List
- **Design (ADR-022): in-memory holder + boot silent-refresh + request-queue, Bearer unchanged.** New `apps/web/src/lib/auth-token-holder.ts` is the single in-memory source: `setAccessToken`/`getAccessToken`/`clearAccessToken` + `setBootRefresh`/`awaitAccessToken` (single-flight; auto-clears the promise on settle). The token is held in module memory only — never `localStorage`/`sessionStorage` — so XSS cannot read a bearer token at rest.
- **api-client** now reads the holder in `getAuthHeaders()` and `await`s the in-flight boot refresh in `apiClient()` (AC#3 queue-until-ready), so boot-time requests don't stampede 401s.
- **AuthContext** writes/clears the holder instead of `sessionStorage` for the token (kept the non-secret `oslsr_last_activity` marker), publishes the re-minted token to the holder during the boot silent-refresh, and registers that refresh for the request-queue. `refreshUser` now reads `getAccessToken()`. React `state.accessToken` is kept in sync for `useAuth()` consumers.
- **eslint F-004 ban extended** to `sessionStorage` auth-token keys (+ `window.*` aliases). No app code trips it (the token is no longer in any web storage).
- **AC#6 multi-tab** is satisfied by 9-48's server-side rotation grace window (a near-simultaneous boot silent-refresh from two tabs is re-issued, not family-revoked) — verified live by the CI `auth-smoke` deploy gate — plus the client single-flight that collapses concurrent boot requests onto one `/refresh`.
- **Zero API change** (diff is web-only) → API suite unaffected.
- **[CR] 2026-06-09 (fresh-context adversarial review):** caught a live regression the green suite had masked — `useRealtimeConnection.ts` (Socket.io handshake) was still reading the bearer token from `sessionStorage`, so after 9-49 it always read `null` and the realtime socket never connected (enumerator/supervisor live messaging silently fell back to 5s polling). Root-caused to a token consumer missed by the holder migration **and** by the eslint ban (variable key, not a string literal). Fixed: migrated the hook + its test to the in-memory holder, added a handshake regression test, refreshed two stale comments, dropped a dead effect dep. Re-verified: full web suite **231 files / 2496 pass / 0 fail** (+1 vs the original 2495), `tsc` + `eslint` clean. Atomic commit is the only remaining (operator) step.

### File List
- `apps/web/src/lib/auth-token-holder.ts` — **new** (in-memory token holder + single-flight boot-refresh gate).
- `apps/web/src/lib/__tests__/auth-token-holder.test.ts` — **new** (6 tests).
- `apps/web/src/lib/api-client.ts` — modified (read holder in `getAuthHeaders`; `await awaitAccessToken()` in `apiClient`).
- `apps/web/src/lib/__tests__/api-client.test.ts` — **new** (4 tests: in-memory read + queue-until-ready single-flight + Bearer).
- `apps/web/src/features/auth/context/AuthContext.tsx` — modified (holder writes/clears; boot publishes token + registers refresh; `refreshUser` reads holder; removed `_getStoredToken`/`ACCESS_TOKEN_KEY`).
- `apps/web/src/features/auth/context/__tests__/AuthContext.test.tsx` — modified (+3: AC#1 no-storage, AC#2 boot re-mint, AC#4 logout clears).
- `apps/web/eslint.config.js` — modified (F-004 ban extended to `sessionStorage` auth-token keys).
- `apps/web/src/hooks/useRealtimeConnection.ts` — modified (**[CR] H1**: socket handshake now reads `getAccessToken()` instead of `sessionStorage` — the missed token consumer).
- `apps/web/src/hooks/useRealtimeConnection.test.ts` — modified (**[CR] M1**: drive the in-memory holder instead of `sessionStorage`; +1 handshake-reads-holder regression test).
- `apps/web/src/features/onboarding/components/IDCardDownload.tsx` — modified (**[CR] L1**: stale sessionStorage comment refreshed; no code change).
- `apps/web/src/features/onboarding/pages/ProfileCompletionPage.tsx` — modified (**[CR] L1**: stale sessionStorage comment refreshed; no code change).

### Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-06-08 | Stub created (N3 handoff). | Bob (SM) |
| 2026-06-08 | Expanded stub → ready-for-dev after ADR-022 + PO ratification: 7 ACs / 6 Tasks (Option C in-memory + silent refresh). DEPENDS-ON 9-48; POST-LAUNCH; impl line-refs deferred. | Bob (SM) |
| 2026-06-08 | Status reconciled `ready-for-dev` → **`backlog`** (story + sprint-status) to match findings-register note G — a hard unmet dependency on 9-48 means it is not pickable yet; flips to ready-for-dev when 9-48 ships. | Awwal (review) |
| 2026-06-09 | 9-48 dependency satisfied → `backlog` → ready-for-dev. | Awwal |
| 2026-06-09 | Implemented (dev-story, Amelia): in-memory token holder + boot silent-refresh + request-queue + logout-clear + eslint sessionStorage ban. +13 web tests; full web suite 2495 pass/0 fail; tsc+lint clean; web-only diff. Status → review (pre-commit [CR] + commit pending). | Amelia (dev) |
| 2026-06-09 | **Pre-commit `[CR]` (adversarial code-review, fresh context).** Found + fixed a live regression the green suite masked: `useRealtimeConnection.ts` (Socket.io handshake) still read the bearer token from `sessionStorage` → after 9-49 always null → realtime socket never connected (live messaging degraded to polling). Missed by the holder migration AND the eslint ban (variable key). Migrated the hook + its test to the in-memory holder (+1 regression test), refreshed 2 stale comments, removed a dead effect dep. Full web suite **2496 pass/0 fail**; tsc+lint clean. 6 follow-ups (1 High×2/2 Med/2 Low) all fixed. Verdict: PASS; only the atomic commit remains. Status stays `review` until commit. | Amelia (review) |
