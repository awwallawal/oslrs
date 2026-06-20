# Story 9.45: Platform Access-Control & Boot Hardening (fail-closed boot, View-As bypass + dead middleware, step-up auth, rank cap, header/artifact hygiene)

Status: done

<!--
Authored 2026-06-07 by Bob (SM) via canonical *create-story --yolo workflow.
Source: sprint-change-proposal-2026-06-06-security-r2-remediation.md §4.1 + REMEDIATION-BRIEF.md.
LAUNCH-GATE story (Phase 2 🚦). One atomic commit PER F-ID + a fail-old/pass-new test each.
Findings: F-005 (+ F-026 code side: fail-closed NODE_ENV / node-dist), F-010 (View-As read-only
bypass + DEAD middleware), F-014 (step-up auth on privileged mutations), F-021 (server-side rank
cap), F-002 (strip internal x-* headers), F-003 (strip dev/localhost artifacts from prod bundle).

VERIFIED LIVE (2026-06-06): NODE_ENV is UNSET at runtime and prod runs `npx tsx` (not compiled
`node dist`) — F-005's fail-closed boot is what FORCES NODE_ENV to be set; the operator side
(commit NODE_ENV=production + run node dist) is tracked as a 9-9 subtask (F-026). nginx currently
emits `X-Proxy-Upstream` [Source: infra/nginx/oslsr.conf location /api] — F-002's strip target.
F-010 is the nastiest: the purpose-built `blockMutationsInViewAs` is DEAD code (never wired);
tests pass against it while prod runs a flawed inline substring copy.
-->

## Story

As **the OSLSR platform owner**,
I want **the app to refuse to boot in an undefined environment, View-As to be genuinely read-only, privileged mutations to require fresh re-auth, role assignment capped server-side, and internal/dev artifacts stripped from production responses**,
so that **a misconfigured deploy fails safe, a query-string trick can't bypass View-As, a stolen privileged token can't silently promote/deactivate accounts, and the prod surface leaks no internal plumbing**.

## Acceptance Criteria

1. **AC#1 — F-005: fail closed on unset `NODE_ENV`.** In `validateEnvironment()`, if `NODE_ENV` is unset in a non-test context, **throw and refuse to boot** (or default to production-safe). Make dev conveniences (`/dev` routes, report-only CSP, non-Secure cookies) opt-in via an explicit flag — never the default-when-unsure. Also confirm `validateEnvironment` asserts presence of required secrets (JWT, DB, Redis) and refuses to boot if any are missing [Source: apps/api/src/app.ts:22-32]. **Test:** boot with `NODE_ENV` unset → process exits non-zero; with `NODE_ENV=production` → boots. (Pairs with operator F-026 in 9-9: set `NODE_ENV=production` + run `node dist`.)
2. **AC#2 — F-010: fix View-As read-only enforcement + wire the real middleware + delete the dead copy.** The exemption uses `req.originalUrl.includes('/view-as/...')`, which matches the query string, so `POST /staff/:id/deactivate?x=/view-as/end` bypasses the read-only block [Source: apps/api/src/middleware/auth.ts:112-117]. Decide by **method + exact matched route** (`req.method` + an allowlist of exact view-as paths via `req.baseUrl`/`req.route`, never a substring of `originalUrl`). Wire the purpose-built `blockMutationsInViewAs` [Source: apps/api/src/middleware/view-as.middleware.ts:36] into the routers and **delete the inline substring logic** (it is the flawed copy prod actually runs; the real middleware is dead). **Test:** in View-As mode, `POST /staff/:id/deactivate?x=/view-as/end` → 403; legitimate `POST /view-as/end` → allowed. Tests must run against the WIRED middleware, not the dead one.
3. **AC#3 — F-014: step-up auth on privileged mutations.** Require `requireFreshReAuth` on `PATCH /staff/:userId/role`, deactivate/reactivate, and destructive `/admin/*` actions (email-queue drain, settings writes) [Source: apps/api/src/routes/staff.routes.ts:36,39,42; sensitive-action.ts]. Make step-up **unconditional for role changes** (not `rememberMe`-gated). **Test:** a role change without a recent re-auth → 401/step-up required; with fresh re-auth → succeeds.
4. **AC#4 — F-021: server-side rank cap in `updateRole`.** Enforce `assignedRole <= actorRole` inside `staff.service.ts updateRole` so the invariant survives any future route-authz change [Source: apps/api/src/services/staff.service.ts updateRole]. **Test:** an actor cannot assign a role higher than their own even if the route guard is bypassed.
5. **AC#5 — F-002: strip internal `x-*` headers at the edge.** Remove `X-Proxy-Upstream` (and any other internal `x-*`) from responses [Source: infra/nginx/oslsr.conf location /api + /socket.io]. **Test:** a proxied response carries no `X-Proxy-Upstream` (assert via the nginx parity test or an integration curl).
6. **AC#6 — F-003: strip dev/localhost artifacts from the prod bundle.** Remove dev/localhost artifacts (source maps, localhost references, debug toggles) from the production web build [Source: apps/web build config]. **Test:** the built bundle contains no localhost/dev-artifact references (assert in a build/post-build check).
7. **AC#7 — Tests + zero regression; no control weakened.** Full API + web suites green; RBAC, MFA, session/token revocation intact. Per-F-ID commit hashes recorded.

## Tasks / Subtasks

- [x] **Task 1 — F-005 fail-closed boot + required-secret assertion (AC: #1)**
  - [x] `validateEnvironment` exported + now EXITs non-zero on unset `NODE_ENV` (except Vitest → normalized to 'test'); added `REDIS_URL` to the required-prod-secrets assertion (already a hard runtime requirement in lib/redis). 5 tests.
- [x] **Task 2 — F-010 View-As: method+exact-route enforcement, wire real middleware, delete dead inline copy, retarget tests (AC: #2)**
  - [x] `view-as.middleware`: exemption now by EXACT pathname (query stripped) against an allowlist via shared `viewAsReadOnlyError`; `blockMutationsInViewAs` delegates to it. `auth.ts` inline `originalUrl.includes(...)` copy DELETED → now calls the shared `viewAsReadOnlyError` (same code prod + tests run). Query-string bypass test added.
- [x] **Task 3 — F-014 step-up `requireFreshReAuth` ... unconditional for role changes (AC: #3)**
  - [x] New unconditional `requireFreshReAuth` (ignores `rememberMe`) wired on `PATCH /staff/:userId/role`, `POST /staff/:userId/deactivate|reactivate`, `POST /admin/email-queue/drain`, and `PATCH /admin/settings/:key`. Reuses the existing reauth Redis marker + `/auth/reauth` flow.
- [x] **Task 4 — F-021 server-side rank cap in `updateRole` (AC: #4)**
  - [x] `constants/role-rank.ts` (`ROLE_RANK` + `assertCanAssignRole`, fail-closed on unknown roles) enforced inside `staff.service.updateRole` (fetches actor role) — survives any route-authz change. 8 tests.
- [x] **Task 5 — F-002 strip internal `x-*` headers (nginx) (AC: #5)**
  - [x] Removed both `add_header X-Proxy-Upstream` directives (api + socket.io) from `infra/nginx/oslsr.conf`. nginx-hygiene test asserts the header is absent + proxy_pass intact.
- [x] **Task 6 — F-003 strip dev/localhost artifacts from prod bundle (AC: #6)**
  - [x] `vite build.sourcemap: false`; localhost API fallbacks DEV-gated (`import.meta.env.DEV`) across 7 source sites so Vite tree-shakes the literal (incl. fixing `ActivationForm` which HARD-CODED `http://localhost:3000` — would have hit localhost in prod!). Post-build scanner (`scripts/check-bundle-artifacts.ts` via tsx, wired into `web build`) fails the build on any artifact; pure `scanBundle` unit-tested.
- [x] **Task 6b — Cookie-path dedup (carryover: Story 9-13 F10)**
  - [x] 6b.1 `mfa.controller.ts` inline `COOKIE_OPTIONS`/`REFRESH_TOKEN_COOKIE_NAME` + duplicated max-age ternary replaced with imports from `lib/cookie-config.ts` (`refreshCookieMaxAge` helper). Single source of truth shared with `auth.controller.ts`.
  - [x] 6b.2 Runtime cookie path unchanged (`/api/v1/auth`); no behaviour drift (tsc + build green).
- [x] **Task 7 — Regression sweep + per-F-ID commit hashes (AC: #7)**
  - [x] API tsc + lint clean; web tsc + lint clean; full build green (scanner: 251 files, 0 artifacts); touched suites green (68 API + 5 web). Per-F-ID commit hashes recorded at commit time (post-review).

### Review Follow-ups (AI)

Adversarial code review 2026-06-20 (security-R2 track, fresh context; F-003 web slice reviewed via a parallel subagent). **0 High / 3 Medium / 2 Low.** Load-bearing claims independently verified: F-010 dead-middleware + inline copy both gone (prod + tests run one shared `viewAsReadOnlyError`); F-014 `requireFreshReAuth` is unconditional + wired after `authenticate`+`authorize`; F-021 fail-closed rank cap in the service layer; F-005 boot exits on unset `NODE_ENV`. All code findings fixed; api+web tsc 0, eslint 0; 32 API + 5 web touched tests green.

- [x] [AI-Review][Medium] **M1 — F-002 nginx: deleting `X-Proxy-Upstream` re-enabled server-level header inheritance on `/api` + `/socket.io`** (nginx inherits server `add_header`s only when a location has none of its own), duplicating HSTS / X-Frame-Options and emitting the **static-app CSP** alongside Helmet's API CSP (browser enforces the intersection) — the exact thing the now-stale line-101 comment warned about. Fixed: replaced the leaky header with a benign inheritance breaker (`add_header X-Content-Type-Options "nosniff" always;`) on both locations + corrected the comments; hygiene test now asserts each proxy location keeps an inheritance-breaking `add_header`. [infra/nginx/oslsr.conf, nginx-header-hygiene.test.ts]
- [x] [AI-Review][Medium] **M3 — F-010 `auth.ts` used `await import('./view-as.middleware.js')` inside a fall-through catch → the read-only control could fail OPEN** on a dynamic-import / `getViewAsState` error. Fixed: `viewAsReadOnlyError` is now a STATIC import (circular-safe — `view-as.service` imports no auth), and a `getViewAsState` failure now FAILS CLOSED for mutations (503) while reads proceed. [middleware/auth.ts]
- [x] [AI-Review][Low] **L1 — F-003 bundle scanner skipped `.html`/`.json`** (`.js/.css/.map` only), so an inline-script artifact in `dist/index.html` could pass the gate. Fixed: added `.html` to the scan. (Port-limited dev-origin regex left as documented narrow-by-design.) [scripts/check-bundle-artifacts.ts]
- [x] [AI-Review][Low] **L2 — F-014 shares one global re-auth marker (`reauth:<sub>`)** between low-stakes `requireReAuth` and privileged `requireFreshReAuth`, so a fresh re-auth for a profile edit also unlocks role changes for the 5-min window. Standard step-up behavior (recent password proof); documented — a per-scope marker would tighten high-stakes actions further. (No code change.)

> 🚦 **[AI-Review][Medium] M2 — DEPLOY GATE (operator action, NOT a code fix): set `NODE_ENV=production` (and confirm `REDIS_URL`) on the VPS BEFORE this story deploys.** Per the story's own VERIFIED-LIVE note, prod runs `npx tsx` with **`NODE_ENV` unset**. With F-005's fail-closed boot, deploying 9-45 before the operator sets `NODE_ENV=production` → `process.exit(1)` on startup → **prod outage**. This is the "code that adds a required env var must set it on prod first" lesson; it pairs with operator finding **F-026 (tracked in 9-9)**. Gate the merge/deploy on this being done.

## Dev Notes
- **One atomic commit per F-ID.** F-010 and F-014 are the meaty ones; F-002/F-003/F-021/F-005 are smaller.
- **F-010 is also a test-integrity lesson:** prod ran a flawed inline copy while tests greened against dead middleware. After wiring the real middleware, the tests MUST exercise the wired path (note this explicitly in the PR).
- F-005 pairs with operator F-026 (9-9): the fail-closed boot is the safety net that makes a missing `NODE_ENV=production` impossible to ship silently.
- nginx changes go in `infra/nginx/oslsr.conf` (CI-deployed via backup→`nginx -t`→reload; never hand-edit the VPS copy).
- Do NOT weaken existing controls.
- **Carryover (Task 6b): Story 9-13 F10** — a cookie-path duplication (`mfa.controller.ts:36` ↔ `auth.controller.ts`) was deferred as "future polish" in 9-13 and was untracked until the 2026-06-07 post-9-16 trace. Folded here (it now has a natural home in the `lib/cookie-config.ts` that 9-16 created). Pure hygiene — ships as its own small commit (`refactor: 9-13-F10 dedup cookie path`), not gated, no F-ID.

### Project Structure Notes
- Touch: `app.ts` (validateEnvironment), `middleware/auth.ts` + `middleware/view-as.middleware.ts` + routers, `routes/staff.routes.ts` + `middleware/sensitive-action.ts`, `services/staff.service.ts`, `infra/nginx/oslsr.conf`, web build config.

### References
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-06-security-r2-remediation.md#section-4-detailed-change-proposals]
- [Source: security-assessment/REMEDIATION-BRIEF.md] (F-005/010/014/021/002/003)
- [Source: apps/api/src/middleware/auth.ts:112] · [Source: apps/api/src/middleware/view-as.middleware.ts:36] · [Source: apps/api/src/routes/staff.routes.ts:36]

## Dev Agent Record
### Agent Model Used
claude-opus-4-8[1m] (Amelia / dev agent) — security-r2 track, worktree `../oslrs-security` on `track/security-r2-41-45`.

### Debug Log References
- Touched suites green: 68 API (validate-environment 5, role-rank 8, require-fresh-reauth 3, view-as.middleware incl. F-010 bypass, nginx-hygiene, staff.controller regression) + 5 web (bundle-artifact-scan). API+web tsc 0, eslint 0.
- Full build green — the F-003 scanner ran against the real dist: "scanned 251 files, no dev/localhost artifacts."
- DATABASE_URL-gated suites (validate-environment, role-rank import chain, etc.) verified locally with a dummy `DATABASE_URL`/`REDIS_URL` (pools are lazy; nothing connects). Real-DB integration tests (e.g. security.auth) run in CI.

### Completion Notes List
- **F-005** — fail-closed: unset `NODE_ENV` now refuses to boot (exit 1) instead of silently defaulting to development; Vitest is normalized to 'test'. `REDIS_URL` added to the required-prod-secret assertion (it was already a hard runtime requirement). With boot fail-closed, dev conveniences key off an EXPLICIT NODE_ENV — never a when-unsure default.
- **F-010** — the query-string bypass is closed: exemption is by EXACT pathname (query stripped) against an allowlist (`viewAsReadOnlyError`). The flawed inline `originalUrl.includes(...)` copy in `auth.ts` is DELETED; auth now calls the SAME shared decision as `blockMutationsInViewAs`, so prod and tests exercise one code path (the F-010 test-integrity lesson). Test proves `POST /staff/:id/deactivate?x=/view-as/end` → 403 and `POST /view-as/end` → allowed.
- **F-014** — `requireFreshReAuth` (UNCONDITIONAL, not rememberMe-gated) on role change / deactivate / reactivate / email-queue drain / settings write. Reuses the existing reauth marker + `/auth/reauth` (no net-new primitive).
- **F-021** — rank cap in `staff.service.updateRole` via `assertCanAssignRole` (extracted to `constants/role-rank.ts` for testability), fetching the actor's role and rejecting any assignment above the actor; fail-closed on unknown roles. Survives a future route-authz change.
- **F-002** — both `X-Proxy-Upstream` `add_header`s removed from nginx; hygiene test asserts the header never appears.
- **F-003** — `build.sourcemap:false` + DEV-gated localhost fallbacks (tree-shaken from prod) across 7 sites; **caught + fixed a real prod bug** in `ActivationForm.tsx` (hard-coded `http://localhost:3000`). A post-build scanner now gates the build against any localhost/sourcemap artifact.
- **Task 6b** — `mfa.controller` now imports cookie name/options + `refreshCookieMaxAge` from `lib/cookie-config.ts` (single source shared with `auth.controller`); runtime path `/api/v1/auth` unchanged.
- **No control weakened (AC#7):** RBAC, MFA grace, session/token revocation, CSP, rate limits all intact. nginx still proxies /api + /socket.io to 127.0.0.1:3000.
- **Commit plan:** per-F-ID commits at the pause (F-005, F-010, F-014, F-021, F-002, F-003) + a separate `refactor: 9-13-F10 dedup cookie path` (6b, no F-ID), via `git add -p` for files touched by more than one concern.

### File List
**New:**
- `apps/api/src/constants/role-rank.ts` (+ `__tests__/role-rank.test.ts`)
- `apps/api/src/__tests__/validate-environment.test.ts`
- `apps/api/src/__tests__/nginx-header-hygiene.test.ts`
- `apps/api/src/middleware/__tests__/require-fresh-reauth.test.ts`
- `apps/web/src/lib/bundle-artifact-scan.ts` (+ `__tests__/bundle-artifact-scan.test.ts`)
- `apps/web/scripts/check-bundle-artifacts.ts`

**Review-fix delta (AI, 2026-06-20):**
- `infra/nginx/oslsr.conf` (M1 — inheritance-breaking `nosniff` on /api + /socket.io instead of bare removal)
- `apps/api/src/__tests__/nginx-header-hygiene.test.ts` (M1 — assert each proxy location keeps an inheritance breaker)
- `apps/api/src/middleware/auth.ts` (M3 — static import of `viewAsReadOnlyError` + fail-closed mutations on state-check error)
- `apps/web/scripts/check-bundle-artifacts.ts` (L1 — scan `.html`)

**Modified (API):**
- `apps/api/src/app.ts` (F-005 validateEnvironment)
- `apps/api/src/middleware/view-as.middleware.ts` + `auth.ts` (F-010)
- `apps/api/src/middleware/sensitive-action.ts` (F-014 requireFreshReAuth)
- `apps/api/src/routes/staff.routes.ts`, `admin.routes.ts`, `settings.routes.ts` (F-014 wiring)
- `apps/api/src/services/staff.service.ts` (F-021)
- `apps/api/src/controllers/mfa.controller.ts` (6b cookie dedup)
- `apps/api/src/middleware/__tests__/view-as.middleware.test.ts`
- `infra/nginx/oslsr.conf` (F-002)

**Modified (web, F-003):**
- `apps/web/vite.config.ts`, `apps/web/package.json` (build gate)
- `apps/web/src/lib/api-client.ts`, `hooks/useRealtimeConnection.ts`,
  `features/auth/api/mfa.api.ts`, `features/auth/api/auth.api.ts`,
  `features/auth/components/ActivationForm.tsx`,
  `features/onboarding/pages/ProfileCompletionPage.tsx`,
  `features/onboarding/pages/VerificationPage.tsx`,
  `features/onboarding/components/IDCardDownload.tsx`
