# Story 13-18: Server step-up re-auth route hygiene (make the gate actually cover its targets)

Status: done

<!-- Authored 2026-07-06 by Bob (SM) via *create-story. EMERGENT L3 from the 13-17 adversarial code-review: the server's SENSITIVE_ACTIONS route patterns don't match the routes the app actually serves, so the actions they were meant to step-up-gate (profile/password/…) are NOT gated today. 13-17 fixed the CLIENT (surface the reauth modal); this story fixes the SERVER (make the guard's targets real) + resolves the reauth-key-on-login design question. Security-hygiene; NOT launch-blocking. -->

## Story
As **the security owner of OSLSR**,
I want **the step-up re-auth guard to actually fire on the real profile/password/bank/security routes** (and its route patterns to be drift-proof),
so that **sensitive account changes require a fresh re-auth as intended — instead of the guard silently covering path shapes the app never calls.**

## Context & Evidence (a guard pointed at the wrong doors)
The step-up re-auth guard is TWO mechanisms in `apps/api/src/middleware/sensitive-action.ts`:
- **`privileged_action`** — applied at specific routes (e.g. the settings-write / pin route). WORKS (13-17 surfaced it).
- **`sensitive_action`** — a **path-pattern list** (`SENSITIVE_ACTIONS`) checked against `req.path`. **The patterns don't match the real routes:**
  - Pattern `PATCH /api/v1/users/[^/]+/profile` expects an `:id` segment, but the actual route is **`PATCH /api/v1/users/profile`** (no id) [Source: apps/api/src/routes/user.routes.ts:25]. `/users/profile` never matches `/users/[^/]+/profile` → **profile updates are NOT step-up-gated today.**
  - Password patterns (`PUT /users/[^/]+/password`, `POST /auth/change-password`) match **no currently-registered route** — the authenticated change-password path (if any) must be identified; the only password routes today are the unauthenticated `/auth/forgot-password` + `/auth/reset-password` [Source: apps/api/src/routes/auth.routes.ts:86,99].
  - Bank-details / payment-disputes / security / sessions patterns each need the same real-route reconciliation.
- **Re-auth key lifecycle:** only `POST /api/v1/auth/reauth` sets the `reauth:<userId>` Redis key (5-min) [Source: apps/api/src/middleware/reauth-rate-limit.ts:18; require-fresh-reauth.ts]. **Login does NOT set it** — so `requireFreshReAuth`/the guards 403 on ANY session lacking a recent explicit re-auth, not just "Remember Me" sessions (the pin required re-auth even on a fresh login). This is either intended (strict) or an over-friction gap — a DESIGN decision to make explicit, not leave ambiguous.

⇒ Net: the guard under-protects (wrong patterns → profile/password ungated) AND is stricter than its own "Remember Me"-framed comments imply (login grants no grace). Both are server hygiene.

## Acceptance Criteria
1. **AC1 — Patterns match real routes.** Every entry in `SENSITIVE_ACTIONS` (and every explicit `privileged_action` mount) is reconciled against the ACTUAL registered route + method. Fixed so that a request to the real route (e.g. `PATCH /api/v1/users/profile`) is recognized as sensitive. Where an intended-sensitive action has NO real route yet (e.g. an authenticated change-password that doesn't exist), the dead pattern is removed with a comment (don't keep phantom patterns), and the gap is noted.
2. **AC2 — The real sensitive routes are gated E2E.** GIVEN a session without a fresh `reauth:` key, WHEN it calls the real profile route (and each other real sensitive route), THEN it gets `403 AUTH_REAUTH_REQUIRED`; and after `POST /auth/reauth`, the same call succeeds. Integration test per real route.
3. **AC3 — Anti-drift guard (the make-it-better).** A test asserts **every `SENSITIVE_ACTIONS` pattern matches at least one registered Express route** (introspect the router stack, or a maintained route inventory). A future route rename that un-gates a sensitive action FAILS this test instead of silently regressing. (This is the durable fix — the mismatch existed precisely because nothing pinned patterns to reality.)
4. **AC4 — Re-auth-key-on-login DECISION (PM-owned) is implemented + documented.** Resolve: does a fresh interactive login grant a short re-auth grace (set `reauth:<id>` on successful password login), or is re-auth ALWAYS required per sensitive action regardless of login recency? Implement the chosen behavior; document the rule in the security section / runbook so the intent is unambiguous. (See PM Validation for the recommendation.)
5. **AC5 — No new client work; 13-17 stays correct.** The client (13-17 global interceptor) already handles `AUTH_REAUTH_REQUIRED` for whatever the server returns — once the server gates the real routes, the modal will simply start appearing on profile/password too. Confirm no client change is needed (or note the minimal one). Full api + web suites green.

## Tasks / Subtasks
- [x] **Task 1 (AC1)** — inventory the real routes for each SENSITIVE_ACTIONS intent (profile/password/bank-details/payment-disputes/security/sessions); rewrite the patterns to match (or remove phantom ones). Confirm the `privileged_action` explicit mounts too.
- [x] **Task 2 (AC2)** — per-real-route integration test: no-fresh-reauth → 403 AUTH_REAUTH_REQUIRED; post-reauth → success.
- [x] **Task 3 (AC3)** — the anti-drift test: assert each pattern matches a registered route (router-stack introspection). This is the keystone — it would have caught the original bug.
- [x] **Task 4 (AC4)** — implement the PM's reauth-key-on-login decision; document the rule.
- [x] **Task 5 (AC5)** — full api + web suites; `tsc`/eslint clean. Quick manual/e2e sanity that profile-edit now prompts re-auth (via the 13-17 client path).

### Review Follow-ups (AI)
- [x] [AI-Review][MEDIUM] M1 — `completeStaffLoginAfterMfa` granted the login grace unconditionally ("password proven at step-1") but the MFA challenge token was minted identically by the staff PASSWORD login and `loginByMagicLinkToken` — only two unrelated RBAC facts (MFA enroll = super_admin-only; magic-link = public-only) made the no-password path unreachable. **FIXED**: `ChallengePayload.passwordProven` set by the step-1 channel (staff=true, magic-link=false), threaded through both mfa.controller step-2 sites, grace granted only when true; absent flag (legacy in-flight tokens) fails safe to no grace. +3 unit tests (conditional grant) + mint-site assertion + roundtrip assertion. [apps/api/src/services/auth.service.ts:493; mfa.service.ts:73]
- [ ] [AI-Review][MEDIUM] M2 — COMMIT DISCIPLINE (operator, at commit time): tree carries the unrelated `.gitignore` slide-presentation hunk + ~40 `_bmad-output/baseline-report/*` files. The 13-18 commit MUST be a SELECTIVE add of the File List below — never `git add -A` (same near-miss as 13-16/13-17).
- [x] [AI-Review][LOW] L1 — gate ran BEFORE `profileUpdateRateLimit`, so graceless probes (Redis GET + DB SELECT each) were uncapped. **FIXED**: limiter now runs first. [apps/api/src/routes/user.routes.ts:30]
- [x] [AI-Review][LOW] L2 — the anti-drift test's hardcoded gate-name array was itself a drift point (a third gate variant would escape the reverse check). **FIXED**: prefix match `requireFreshReAuth*`. [apps/api/src/__tests__/security.reauth-routes.test.ts:96]
- [x] [AI-Review][LOW] L3 — AC2/AC4 integration tests were execution-order-coupled (later tests relied on earlier tests' marker mutations). **FIXED**: AC4 grace test logs in its own dedicated user; reauth-restore test sets its own precondition.
- [x] [AI-Review][LOW] L4 — grace lifecycle (`setReAuthValid`/`clearReAuth`/`getReAuthValidity`) lived in middleware while being consumed by services/controllers. **FIXED**: extracted to `apps/api/src/lib/reauth-grace.ts`; `sensitive-action.ts` re-exports (existing import paths + route-test mocks unaffected); auth.service/auth.controller import from lib.

## Dev Notes
- **This is the SERVER half of 13-17** — 13-17 made the client surface `AUTH_REAUTH_REQUIRED`; this makes the server actually EMIT it on the routes that matter.
- **The anti-drift test (AC3) is the real deliverable.** The patterns drifted because nothing tied them to registered routes. Pin them. (Mirror how other route-registration discipline tests work in the suite — there's precedent, e.g. the analytics route-registration assertions.)
- **Don't over-gate.** Only genuinely sensitive account/security mutations belong here; adding reauth to routine reads/writes is friction. Reconcile intent, not just syntax.
- **Coordinate with the 13-17 client:** once profile/password start returning 403 AUTH_REAUTH_REQUIRED, the 13-17 interceptor pops the modal automatically — so verify the profile/settings screens behave sanely (no double toast; honest cancel).

### References
- [Source: apps/api/src/middleware/sensitive-action.ts:18-32] — the `SENSITIVE_ACTIONS` patterns (the mismatched list).
- [Source: apps/api/src/routes/user.routes.ts:25] — `PATCH /profile` (the real profile route the pattern misses).
- [Source: apps/api/src/routes/auth.routes.ts:86,99] — the only password routes today (unauthenticated reset flow).
- [Source: apps/api/src/middleware/require-fresh-reauth.ts; reauth-rate-limit.ts:18] — `reauth:<userId>` key set only by `POST /auth/reauth`.
- [Source: 13-17 story — Review L3 + the "login doesn't set reauth key" server note] — where this was found.

## Dev Agent Record

### Implementation Plan (2026-07-06, Amelia/dev-story)

**Recon findings (worse than the story assumed):**
1. `requireReAuth` (the SENSITIVE_ACTIONS pattern middleware) is **never mounted anywhere** — not app-level, not route-level. The entire mechanism is dead code; even correct patterns would never fire. (Story assumed patterns mismatch; reality: the gun was never loaded.)
2. Phantom intents confirmed: NO authenticated change-password route exists (only unauth forgot/reset flow); NO bank-details route (bank fields live INSIDE `PATCH /users/profile` payload — `updateProfileSchema` accepts bankName/accountNumber/accountName); NO payments/disputes, security, or sessions routes.
3. Real gated routes today (all explicit `requireFreshReAuth` mounts): settings PATCH `/admin/settings/:key`, staff role/deactivate/reactivate, admin `/email-queue/drain`, MFA enroll/disable/regenerate-codes. TWO duplicate `requireFreshReAuth` implementations exist (sensitive-action.ts + require-fresh-reauth.ts).
4. `PATCH /users/profile` is used by ALL roles including public_user (ProfilePage mounted on all 7 dashboards). **Passwordless public users exist** (wizard-provisioned, `passwordHash: null`, magic-link only) and `AuthService.reAuthenticate` 401s on null passwordHash → an unconditional gate would permanently lock them out of profile self-service (NDPA self-service issue). PM's "staff-only routes" framing is inaccurate for this one route.
5. `clearReAuth` exists but is never called — logout does not clear the grace key.

**Design (reconciling intent, not just syntax):**
- Delete `requireReAuth` + regex SENSITIVE_ACTIONS (dead). Rewrite `SENSITIVE_ACTIONS` as the exported **inventory of really-gated routes** (method + Express path template) consumed by the AC3 anti-drift test; phantom intents removed with gap comments.
- Gate `PATCH /users/profile` with new `requireFreshReAuthExceptPasswordless`: same 403 AUTH_REAUTH_REQUIRED, but a passwordless account (no passwordHash) passes with a logged event — it cannot answer a password modal; its magic-link possession at login is its identity proof; risk delta vs today (ungated) is zero for that cohort. Password-holding users (all staff + password publics) are gated. Bank-detail fields ride this gate (the original "bank-details" intent).
- Consolidate duplicate middleware: `require-fresh-reauth.ts` becomes a re-export shim of the canonical `requireFreshReAuth` in sensitive-action.ts (route-test mocks unaffected — they mock the module path).
- AC4 (PM ruling): `setReAuthValid(userId)` on successful **interactive password login** — loginStaff (non-MFA branch), loginPublic, completeStaffLoginAfterMfa (password proven at step 1). NOT on magic-link login (no password proof, per ruling), NOT on silent refresh. Non-fatal (try/catch warn — grace is a UX nicety, never fails login). Logout calls `clearReAuth` (non-fatal) so grace dies with the session. Middleware comments purged of "Remember Me only" framing.
- AC3 keystone test: introspect the real `app` router stack (Express 4 `app._router`), assert BOTH directions: every SENSITIVE_ACTIONS entry resolves to a registered route whose stack contains a fresh-reauth gate, AND every fresh-reauth-gated registered route is in the inventory.
- AC2 integration tests (real app + DB + Redis): parameterized 403-without-grace per inventory route (super_admin session, reauth key deleted); full E2E on profile route (login→grace→200, key-deleted→403, POST /auth/reauth→200); passwordless public user exemption test.

### Debug Log
- Recon greps proved `requireReAuth` had ZERO mounts (only its definition + one stale test mock) — the story's premise ("patterns don't match") understated it; the middleware never ran at all. Verified bank-details/payments/security/sessions intents against `routes/index.ts` mount table: no such routes exist anywhere.
- `PATCH /users/profile` payload includes bankName/accountNumber/accountName (user.service.ts:83-85) — the phantom "bank-details" intent actually lives inside the profile route, reinforcing the gate.
- Passwordless lockout risk confirmed empirically: `AuthService.reAuthenticate` throws AUTH_INVALID_CREDENTIALS on `passwordHash: null` (auth.service.ts:1133), ProfilePage is mounted on ALL 7 role dashboards incl. public_user, and wizard-provisioned public users are passwordless (auth.service.ts:753). Hence `requireFreshReAuthExceptPasswordless`.
- The two duplicate `requireFreshReAuth` implementations (sensitive-action.ts vs require-fresh-reauth.ts) consolidated via re-export shim — route-test mocks (`vi.mock('.../require-fresh-reauth.js')`) unaffected because they replace the module path.
- Unit run: 8/8 (middleware). Integration run: 9/9 first try (anti-drift sanity guard `>50 routes` prevents vacuous pass if Express internals change). Full API suite: **218 files / 3004 passed, 7 skipped, 0 failures**. `tsc --noEmit` clean; eslint clean on all touched files.

### Completion Notes
- **AC1** — SENSITIVE_ACTIONS rewritten from a dead regex list to the canonical inventory of the 9 really-gated route+method pairs (each with its gate name). Phantom intents removed with gap comments (authenticated change-password: route doesn't exist — gap explicitly documented in code + docs; bank-details: rides the profile gate; payments/security/sessions: no such routes). Dead `requireReAuth` + `isSensitiveAction` deleted. All existing `privileged_action` explicit mounts confirmed + inventoried (settings write, email-queue drain, staff role/deactivate/reactivate, MFA enroll/disable/regenerate).
- **AC2** — `PATCH /users/profile` now step-up-gated (`requireFreshReAuthExceptPasswordless`, mounted after `authenticate`). Integration test hits EVERY inventoried route with an authenticated-but-graceless session → 403 AUTH_REAUTH_REQUIRED, then proves POST /auth/reauth restores access (full E2E on the profile route).
- **AC3 (keystone)** — `security.reauth-routes.test.ts` introspects the LIVE Express router stack and asserts BOTH directions: every inventory entry resolves to a registered route carrying its declared gate (a rename un-gating a sensitive action fails CI), AND every fresh-reauth-gated registered route is inventoried (an undocumented gate fails CI). This test would have caught the original bug.
- **AC4 (PM ruling implemented)** — successful interactive password login grants the 5-min `reauth:<id>` grace: staff login (non-MFA branch), public login, MFA step-2 completion (password proven at step 1). NOT set on magic-link login (asserted in test) or silent refresh. Logout now calls `clearReAuth` (grace dies with the session — `clearReAuth` existed but was never called). Grace grant/clear are non-fatal (Redis blip never fails login/logout). Rule documented at `docs/security/step-up-reauth.md`; middleware comments purged of the misleading "Remember Me only" framing.
- **AC5** — no client change needed: the 13-17 interceptor handles `AUTH_REAUTH_REQUIRED` globally (profile.api goes through apiClient), the modal shows "this action" (13-17 M3), and a cancelled re-auth surfaces as ONE honest toast via `useUpdateProfile.onError` (server's re-auth message). Final gates: **API 3004 passed / 7 skipped (0 fail), web 2744 passed / 2 todo (0 fail), api+web `tsc --noEmit` clean, api+web eslint clean.** E2E sanity is covered by the integration test's real-HTTP profile flow (403 → reauth → 200), replaying exactly what the 13-17 client does; the AC2 test proves the server side of the modal path end-to-end.
- **Design deviation surfaced for review:** PM validation framed these as "staff-only routes" — inaccurate for `/users/profile` (all roles incl. public use it). Resolved with the passwordless exemption rather than role-scoping: password-holding accounts (all staff + password publics) are gated; passwordless accounts (who CANNOT pass a password modal) pass with a logged `privileged_action.passwordless_exemption` event. Risk delta vs the previously-ungated route is zero for that cohort.

### File List
- apps/api/src/middleware/sensitive-action.ts (rewritten — inventory + consolidated gates + passwordless-exempt variant; dead `requireReAuth` deleted; review L4: grace lifecycle re-exported from lib)
- apps/api/src/middleware/require-fresh-reauth.ts (now a re-export shim of the canonical gate)
- apps/api/src/lib/reauth-grace.ts (NEW, review L4 — grace lifecycle extracted from middleware: `REAUTH_KEY_PREFIX`/`REAUTH_VALIDITY`/`setReAuthValid`/`clearReAuth`/`getReAuthValidity`)
- apps/api/src/routes/user.routes.ts (PATCH /profile gated; review L1: limiter before gate)
- apps/api/src/services/auth.service.ts (AC4: login grants grace ×3 call-sites; logout clears it; `grantLoginReAuthGrace` helper; review M1: MFA step-2 grace conditional on `passwordProven`)
- apps/api/src/services/mfa.service.ts (review M1 — `ChallengePayload.passwordProven`, mint signature requires it)
- apps/api/src/controllers/mfa.controller.ts (review M1 — threads `payload.passwordProven` into both step-2 completion sites)
- apps/api/src/controllers/auth.controller.ts (review L4 — `setReAuthValid` import moved to lib)
- apps/api/src/middleware/__tests__/require-fresh-reauth.test.ts (+5 tests for the passwordless-exempt gate)
- apps/api/src/__tests__/security.reauth-routes.test.ts (NEW — AC3 anti-drift both-directions + AC2/AC4 E2E, 9 tests; review L2 prefix-match, L3 order-decoupling)
- apps/api/src/routes/__tests__/settings.routes.test.ts (stale `requireReAuth` mock key removed; exempt-gate mock added)
- apps/api/src/services/__tests__/auth.service.test.ts (review M1 — +3 conditional-grant tests, magic-link mint asserts `passwordProven: false`, grace-lib mock)
- apps/api/src/services/__tests__/mfa.service.test.ts (review M1 — challenge roundtrip asserts `passwordProven` survives)
- docs/security/step-up-reauth.md (NEW — AC4 policy doc + gated-route table + add-a-route checklist; review M1 structural-enforcement note)
- _bmad-output/implementation-artifacts/13-18-server-reauth-route-hygiene.md (this file)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status flips)

## PM Validation (John, 2026-07-06)

**Validated — approved. This is a real (quiet) security gap, and the anti-drift test is what makes it a *story* rather than a one-line patch.**

1. **Severity framing:** profile/password mutations being ungated is genuine under-protection, but **low exploitability pre-launch** (few accounts, staff-only, no public exposure of these routes) → **NOT launch-blocking; post-launch security-hygiene, medium priority.** Do it in the first post-launch hardening pass, not ahead of the blast.

2. **AC3 (anti-drift pattern↔route test) is the keystone — keep it non-negotiable.** The bug existed because nothing tied the patterns to reality; a syntax-only fix would drift again on the next route rename. The test that fails when a `SENSITIVE_ACTIONS` pattern matches no registered route is the durable value here.

3. **AC4 reauth-key-on-login — RULING:** **set `reauth:<id>` on successful interactive password login** (grace = the existing 5-min `reauth` validity window). Rationale: a user who *just* entered their password shouldn't be redundantly re-prompted seconds later for a sensitive action — that's friction with no security gain (they proved identity). Meanwhile a **Remember-Me / long-resumed session** (no recent password entry) correctly still gets gated — which matches the middleware's own "Remember Me" framing. This removes the current over-friction (re-auth on *every* session) without weakening the actual threat model (stale/hijacked long-lived sessions). **Do NOT** set it on silent token-refresh (that's not a fresh identity proof). Security-owner may override toward stricter (always re-auth) — if so, update the middleware comments to stop implying "Remember Me only."

4. **Scope guard (reinforce Bob):** reconcile INTENT, not just syntax — only genuinely sensitive account/security mutations belong in the list. Don't sweep routine writes in while fixing patterns.

5. **Sequencing:** depends on 13-17 (deployed) — the client already handles `AUTH_REAUTH_REQUIRED`, so once the server starts gating the real routes, the modal appears with no extra client work. Verify the profile/settings screens don't double-toast (13-17's honest-error handling covers it, but confirm).

**No AC changes.** Dev-ready.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-06 | Story drafted via *create-story — server step-up re-auth route hygiene: fix SENSITIVE_ACTIONS patterns to match real routes (profile/password ungated today), add an anti-drift pattern↔route test, and resolve the reauth-key-on-login decision. EMERGENT L3 from the 13-17 review. Security-hygiene, NOT launch-blocking. | Bob (SM) |
| 2026-07-07 | dev-story COMPLETE (all 5 ACs): recon found `requireReAuth` was never even MOUNTED (worse than the mismatch premise); deleted it, rebuilt SENSITIVE_ACTIONS as the 9-route gated inventory, gated PATCH /users/profile (with passwordless exemption — public magic-link users cannot answer a password modal), consolidated the duplicate requireFreshReAuth via shim, implemented AC4 login-grace (staff/public/MFA-step-2; NOT magic-link/refresh) + logout clear, shipped the both-directions anti-drift test + 9-test E2E suite + 5 new unit tests, and documented the policy at docs/security/step-up-reauth.md. Gates: API 3004 / web 2744 green, tsc+eslint clean both. Status → review. | Amelia (dev, Fable 5) |
| 2026-07-07 | ADVERSARIAL CODE-REVIEW PASSED (0H/2M/4L). All ACs verified implemented; reviewer independently re-ran gates (full API suite 3004 green pre-fix, targeted 7 suites/93 tests + tsc + eslint green post-fix). M1 fixed: MFA challenge token now carries `passwordProven` so step-2 grants grace ONLY on a password step-1 — closes the latent magic-link+MFA grace path that was unreachable only by RBAC coincidence (+ new `lib/reauth-grace.ts` per L4, L1 limiter-before-gate, L2 prefix-matched gate names, L3 test order-decoupling). M2 (open, operator): commit = SELECTIVE add of File List only. Status → done. | Fable 5 (adversarial code-review) |
