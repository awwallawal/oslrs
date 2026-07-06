# Story 13-18: Server step-up re-auth route hygiene (make the gate actually cover its targets)

Status: ready-for-dev

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
- [ ] **Task 1 (AC1)** — inventory the real routes for each SENSITIVE_ACTIONS intent (profile/password/bank-details/payment-disputes/security/sessions); rewrite the patterns to match (or remove phantom ones). Confirm the `privileged_action` explicit mounts too.
- [ ] **Task 2 (AC2)** — per-real-route integration test: no-fresh-reauth → 403 AUTH_REAUTH_REQUIRED; post-reauth → success.
- [ ] **Task 3 (AC3)** — the anti-drift test: assert each pattern matches a registered route (router-stack introspection). This is the keystone — it would have caught the original bug.
- [ ] **Task 4 (AC4)** — implement the PM's reauth-key-on-login decision; document the rule.
- [ ] **Task 5 (AC5)** — full api + web suites; `tsc`/eslint clean. Quick manual/e2e sanity that profile-edit now prompts re-auth (via the 13-17 client path).

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
### File List

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
