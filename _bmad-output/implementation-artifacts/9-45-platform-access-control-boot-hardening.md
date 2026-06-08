# Story 9.45: Platform Access-Control & Boot Hardening (fail-closed boot, View-As bypass + dead middleware, step-up auth, rank cap, header/artifact hygiene)

Status: ready-for-dev

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

- [ ] **Task 1 — F-005 fail-closed boot + required-secret assertion (AC: #1)** _(test first)_
- [ ] **Task 2 — F-010 View-As: method+exact-route enforcement, wire real middleware, delete dead inline copy, retarget tests (AC: #2)**
- [ ] **Task 3 — F-014 step-up `requireFreshReAuth` on role-change/deactivate/destructive-admin, unconditional for role changes (AC: #3)**
- [ ] **Task 4 — F-021 server-side rank cap in `updateRole` (AC: #4)**
- [ ] **Task 5 — F-002 strip internal `x-*` headers (nginx) (AC: #5)**
- [ ] **Task 6 — F-003 strip dev/localhost artifacts from prod bundle (AC: #6)**
- [ ] **Task 6b — Cookie-path dedup (carryover: Story 9-13 F10 — hygiene, not an R2 finding)**
  - [ ] 6b.1 Extract the duplicated cookie path `/api/v1/auth` shared by `mfa.controller.ts:36` + `auth.controller.ts` into the existing `apps/api/src/lib/cookie-config.ts` (created by Story 9-16); both controllers import it. [Source: _bmad-output/implementation-artifacts/9-13-super-admin-totp-mfa.md:454 (F10, deferred-as-polish)]
  - [ ] 6b.2 Regression: cookie path unchanged at runtime; no behaviour drift. (No new R2 AC — covered by Task 7 regression.)
- [ ] **Task 7 — Regression sweep + per-F-ID commit hashes (AC: #7)**

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
### Debug Log References
### Completion Notes List
### File List
