# Story 9.16: Public-User Magic-Link Sign-In (login-purpose JWT issuance)

Status: ready-for-dev

<!--
Authored 2026-05-11 by Bob (SM) via canonical *create-story --yolo workflow.

Cross-story follow-up filed from Story 9-12 Review Follow-ups (MR-8 + the
Cross-story-follow-up entry at the bottom of that section). During Story 9-12
Session 8's "no technical debt" close-out, the magic-link infrastructure was
fully built for `wizard_resume` and `pending_nin_complete` purposes, but the
`login` purpose's JWT-issuance was explicitly deferred from Task 1.7 by design.
Story 9-12's MagicLinkLandingPage currently renders a "Magic-link sign-in
coming soon — use email + password" notice for the login branch
[Source: apps/web/src/features/auth/pages/MagicLinkLandingPage.tsx:152-176].
This story closes that gap as a feature delivery — NOT 9-12 technical debt.

Why NOT 9-12 debt: Story 9-12 AC#6 specifies three magic-link purposes
(`wizard_resume`, `pending_nin_complete`, `login`); Tasks 1.7 + 1.11 explicitly
scoped the `login` purpose's JWT-issuance to a future story. Existing
public_users continue to authenticate via POST /auth/public/login (email +
password), which is unaffected by Story 9-12. Magic-link login is a NEW
auth channel layered on top of the existing primitive, not a fix.

Numbering: 9-14 is RESERVED (SSH firewall re-narrow follow-up from Story 9-9
Operate-phase) per sprint-status.yaml line 375 comment; 9-15
(prod-gate-telegram-alerts) was authored earlier on 2026-05-11. 9-16 is the
next sequential slot in Epic 9.
-->

## Story

As a **returning public-user respondent** of the Oyo State Skills Registry,
I want **to sign in by clicking a one-time link delivered to my email instead of typing my password**,
So that **I can access my dashboard from any device without having to remember a credential — and so that future passwordless-only accounts (forward-compat with the Story 9-12 wizard) work out of the box**.

## Acceptance Criteria

1. **AC#1 — Frontend "Sign in with magic link" entry-point on `/login` for `type='public'` users.** `apps/web/src/features/auth/pages/LoginPage.tsx` (which already carries the public-mode cutover banner from Story 9-12 Task 8 — see [Source: apps/web/src/features/auth/pages/LoginPage.tsx]) gains a new affordance below the password field on `type='public'`: a secondary CTA "or — Send me a sign-in link" → expands an email-only input → submit POSTs `/api/v1/auth/public/magic-link` with `{ email, purpose: 'login' }` via a NEW `requestLoginMagicLink` helper in `apps/web/src/features/auth/api/magic-link.api.ts` (extends the file Story 9-12 MR-8 introduced). On submit, ALWAYS shows a generic "If your account exists, we've sent a sign-in link to that address. Check your inbox." regardless of whether the email matched a `users` row (anti-enumeration discipline — mirrors `forgotPassword` per [Source: apps/api/src/controllers/auth.controller.ts:281-311]). Staff `/staff/login` (`StaffLoginPage.tsx`) MUST stay unchanged — magic-link login is PUBLIC-ONLY because staff use back-office MFA + password.

2. **AC#2 — Backend `AuthService.loginByMagicLinkToken` method.** New static method on `apps/api/src/services/auth.service.ts` that:
   - Takes `{ plaintext: string, rememberMe?: boolean, ipAddress?: string, userAgent?: string }`.
   - Atomically consumes the `login`-purpose token via `MagicLinkService.consumeToken({ plaintext, purpose: 'login' })` — single-use enforced by the atomic UPDATE at [Source: apps/api/src/services/magic-link.service.ts:111-181] (`redeemToken` aliased by `consumeToken`).
   - Looks up the public_user via `db.query.users.findFirst({ where: eq(users.email, peeked.email), with: { role: true } })` (case-already-normalised by `MagicLinkService.issueToken` lowercase+trim at [Source: apps/api/src/services/magic-link.service.ts:81]).
   - Enforces account-state gates in this EXACT order (mirroring `loginPublic` at [Source: apps/api/src/services/auth.service.ts:445-555] for SHAPE consistency, NOT identical error codes):
     1. User not found → `AUTH_INVALID_CREDENTIALS` 401 with generic message (anti-enumeration parity with password login at [Source: apps/api/src/services/auth.service.ts:462-477]).
     2. `lockedUntil` in the future → `AUTH_ACCOUNT_LOCKED` 429 (reuse the existing constant + error code at [Source: apps/api/src/services/auth.service.ts:480-486]).
     3. `status === 'suspended'` OR `status === 'deactivated'` → `AUTH_ACCOUNT_SUSPENDED` 403 (reuse the existing constant + error code at [Source: apps/api/src/services/auth.service.ts:488-494]).
     4. `role.name !== UserRole.PUBLIC_USER` → `AUTH_INVALID_CREDENTIALS` 401 with the existing "Please use the staff login for staff accounts" message at [Source: apps/api/src/services/auth.service.ts:547-553]. Magic-link login is PUBLIC-ONLY; if a staff user somehow received a magic link (they shouldn't — `LoginPage.tsx` only renders the entry-point on `type='public'`), the path rejects them at the role gate.
   - **Forward-compat: does NOT check `passwordHash IS NOT NULL`** — Story 9-12 wizard is forward-compat with passwordless public_users; magic-link must work for those accounts too. (`loginPublic` rejects null `passwordHash` at line 513-515 because it tries to bcrypt-compare; magic-link login skips that path entirely since it doesn't compare a password.)
   - Returns the same `LoginResponse & { refreshToken, sessionId } | { requiresMfa: true, mfaChallengeToken, expiresIn }` discriminated-union shape as `loginStaff` / `loginPublic` after `createLoginSession` runs (see [Source: apps/api/src/services/auth.service.ts:22-24, 561-621] for the type + the createLoginSession helper).

3. **AC#3 — Backend route `POST /api/v1/auth/magic/login`.** New endpoint mounted in `apps/api/src/routes/auth.routes.ts` between the existing `POST /magic/consume` (added in 9-12 MR-8) and the SMS-OTP routes. Wraps `magicLinkRateLimit` middleware (3/email/hour shared with the magic-link request endpoint — see [Source: apps/api/src/middleware/magic-link-rate-limit.ts]). Body: `{ token: string, purpose: 'login', rememberMe?: boolean }`. Validation via a new Zod schema in `magic-link.controller.ts` (mirroring `redeemMagicLinkQuerySchema` shape at [Source: apps/api/src/controllers/magic-link.controller.ts:35-38] + `rememberMe` optional). New controller method `MagicLinkController.loginByMagicLink` (NOT `consumeMagicLink` — keep them separate so the `/magic/consume` endpoint stays single-purpose for the wizard/pending-NIN flow). On success: sets the `refreshToken` httpOnly cookie via the existing `REFRESH_TOKEN_COOKIE_NAME` + `COOKIE_OPTIONS` constants at [Source: apps/api/src/controllers/auth.controller.ts:25-31], returns `{ accessToken, user, expiresIn }` in the response body (NEVER the refresh token in the body — matches `staffLogin`/`publicLogin` discipline at [Source: apps/api/src/controllers/auth.controller.ts:152-164, 197-209]). On `requiresMfa: true`: returns `{ requiresMfa: true, mfaChallengeToken, expiresIn }` with status 200 (matches existing pattern at [Source: apps/api/src/controllers/auth.controller.ts:136-145]).

4. **AC#4 — Frontend `MagicLinkLandingPage` login branch fully wired.** Replace the "Magic-link sign-in coming soon" notice block in `apps/web/src/features/auth/pages/MagicLinkLandingPage.tsx` (currently at lines 152-176; see also the `PURPOSE_COPY.login` entry at lines 39-44 which has empty `body`/`cta`) with a real Confirm flow:
   - On peek success for `purpose='login'`: render a Confirm card with title "Continue signing in", body "Click Continue to sign in as user@example.com on this device.", CTA "Continue to sign-in".
   - On Confirm click: call a NEW `loginByMagicLink({ token, rememberMe: false })` fetcher in `apps/web/src/features/auth/api/magic-link.api.ts` → POSTs the new `/auth/magic/login` endpoint.
   - On success without MFA: integrate with the existing `AuthProvider` to store the access token + user info (mirror the existing post-login token-storage pattern — see [Source: apps/web/src/features/auth/AuthProvider.tsx] for the entry-point; if no clean public hook exists, the simplest path is to call the existing `useLogin` mutation's success-path equivalent OR to mount the response into the auth context directly per how `LoginForm.tsx` integrates today). Redirect to `/dashboard` (the existing `DashboardRedirect` then routes to role-specific home).
   - On `{ requiresMfa: true, mfaChallengeToken }` response: navigate to `/mfa-challenge` with `mfaChallengeToken` carried in router state, mirroring the existing public-login MFA branch (verify the LoginForm/LoginPage current implementation for the same; if 9-13 already wired this for password login, magic-link login reuses the identical navigation).
   - On error codes: handle `MAGIC_LINK_INVALID` / `MAGIC_LINK_EXPIRED` / `MAGIC_LINK_ALREADY_USED` (passthrough from consume) via the existing `friendlyErrorCopy` helper at [Source: apps/web/src/features/auth/pages/MagicLinkLandingPage.tsx:220-244]. Add new branches for `AUTH_INVALID_CREDENTIALS` (user not found) → "We couldn't find an account for this email. The link may have been issued to an old address."; `AUTH_ACCOUNT_LOCKED` / `AUTH_ACCOUNT_SUSPENDED` → friendly localised copy + "Please contact support" link.

5. **AC#5 — MFA challenge integration (Story 9-13 interaction).** `AuthService.loginByMagicLinkToken` MUST check MFA enrolment AFTER the account-state gates but BEFORE calling `createLoginSession` — same pattern `loginStaff` uses for the public-side path (the staff version at lines 380-410 of [Source: apps/api/src/services/auth.service.ts] is the template). If `user.mfaEnabled === true`, mint a challenge token via `MfaService.mintChallengeToken({ userId, email })` and return the `{ requiresMfa: true, mfaChallengeToken, expiresIn: MFA_CHALLENGE_TTL_SECONDS }` branch instead of the session-bearing branch. **Critical**: magic-link login MUST NOT bypass MFA — doing so would silently defeat the Story 9-13 security uplift. The user then completes the 2-step challenge at `/auth/mfa-challenge` per Story 9-13's existing flow (no changes to `/login/mfa` or `/login/mfa-backup` routes; they're channel-agnostic post-step-1). Integration test in `auth.service.test.ts` exercises the MFA-required branch end-to-end (mock `MfaService.mintChallengeToken` + assert the return shape).

6. **AC#6 — ADR-015 amendment FLAGGED (Winston authors).** This story does NOT author the ADR amendment — that's Winston's role. The story file's Dev Notes section "ADR-015 amendment flag" subsection captures the design constraints Winston needs (single-use enforcement, 15-min TTL on login-purpose tokens per [Source: apps/api/src/services/magic-link.service.ts:30], rate-limit shared with password-reset budget per NFR4.4, anti-enumeration on request, MFA-aware) so Winston can lift them verbatim. Bob (or the dev agent) opens a note in `_bmad-output/planning-artifacts/architecture.md` § "ADR-015 — Public User Registration & Authentication Strategy" (around line 2713 of architecture.md per existing rewrite at [Source: _bmad-output/planning-artifacts/architecture.md:2713]) flagging the amendment-needed status. The story does NOT block on Winston completing the ADR amendment — implementation can ship; Winston's ADR documents what shipped.

7. **AC#7 — Tests + zero-regression discipline.** New tests:
   - `apps/api/src/services/__tests__/auth.service.test.ts` — 7 unit tests for `loginByMagicLinkToken`: happy path returns session shape; suspended account → `AUTH_ACCOUNT_SUSPENDED` 403; deactivated account → same; locked account → `AUTH_ACCOUNT_LOCKED` 429; user-not-found → `AUTH_INVALID_CREDENTIALS` 401; staff-role account → `AUTH_INVALID_CREDENTIALS` 401; MFA-required user → `{ requiresMfa: true, mfaChallengeToken, expiresIn }` branch. Forward-compat assertion: a public_user with `passwordHash: null` is allowed through.
   - `apps/api/src/routes/__tests__/magic-link.routes.test.ts` — extend with 4 new supertests covering the new `POST /magic/consume`-like `POST /magic/login` endpoint: Zod validation failure (400), MagicLinkService.consumeToken failure (400 passthrough), happy-path success with refresh-cookie set + access-token returned, MFA-required branch (returns `requiresMfa: true`). Reuse the existing mock pattern from 9-12 session 8 [Source: apps/api/src/routes/__tests__/magic-link.routes.test.ts].
   - `apps/web/src/features/auth/pages/__tests__/MagicLinkLandingPage.test.tsx` — extend with 3 new tests for the login branch (was a 1-test "deferred-notice" assertion in 9-12 session 8; replace with: renders Confirm card on peek-success for purpose=login; Confirm click → POSTs `/auth/magic/login` → redirects to `/dashboard` on success; Confirm click → MFA-required response → navigates to `/mfa-challenge` with token in router state).
   - `apps/web/src/features/auth/pages/__tests__/LoginPage.test.tsx` — extend with 3 new tests for the public-mode magic-link entry-point: renders the "Send me a sign-in link" CTA on `type='public'`; absent on `type='staff'`; submit POSTs `/auth/public/magic-link` with `purpose='login'` + shows the generic "If your account exists…" message regardless of API response.
   - **No regression in existing test counts**: password login on `/auth/public/login`, staff login on `/auth/staff/login`, password-reset flow, MFA challenge flow, magic-link `wizard_resume` + `pending_nin_complete` flows from Story 9-12 — all verified unchanged by running the full vitest suite pre/post and confirming the API + web test counts move only by the additive net-new tests above (no test deletions, no behaviour drift).

## Tasks / Subtasks

- [ ] **Task 1 — Write failing tests for the new service method (AC: #2, #5, #7)** _(red half of red-green-refactor)_
  - [ ] 1.1 In `apps/api/src/services/__tests__/auth.service.test.ts`, add a new `describe('loginByMagicLinkToken', ...)` block with 7 tests. Mock `MagicLinkService.consumeToken` + `MfaService.mintChallengeToken` + `SessionService.createSession` + `TokenService.generateAccessToken` + `TokenService.generateRefreshToken` + db (mirror the existing `loginPublic` test setup in the same file for the mock shape). Cases enumerated in AC#7 bullet 1.
  - [ ] 1.2 Run `pnpm vitest run apps/api/src/services/__tests__/auth.service.test.ts` — confirm the 7 new tests FAIL (the method doesn't exist yet). Existing `loginPublic` + `loginStaff` tests stay GREEN.

- [ ] **Task 2 — Implement `AuthService.loginByMagicLinkToken` (AC: #2, #5)** _(green half — Task 1 tests pass)_
  - [ ] 2.1 Add the method to `apps/api/src/services/auth.service.ts` directly below `loginPublic` (around line 555). Signature per AC#2.
  - [ ] 2.2 Body: call `MagicLinkService.consumeToken({ plaintext, purpose: 'login' })` first — this enforces single-use atomically AND throws `MAGIC_LINK_*` 400s for invalid/expired/used tokens. The `await` of this is the FIRST async operation, so a thrown error from here is the response shape.
  - [ ] 2.3 Look up user by `peeked.email` (the consume return shape includes the canonical email). Apply the 4-step account-state gate per AC#2 in the EXACT order specified — order matters for the anti-enumeration discipline (user-not-found check first to keep the timing profile similar to `loginPublic`'s; verify against the existing pattern).
  - [ ] 2.4 MFA check per AC#5 — if `user.mfaEnabled`, mint a challenge token via `MfaService.mintChallengeToken({ userId: user.id, email: user.email })` and return the `requiresMfa: true` branch.
  - [ ] 2.5 Else, call `createLoginSession(user, rememberMe ?? false, ipAddress, userAgent)` (the existing private helper at line 561) and return its result.
  - [ ] 2.6 Audit-log via `AuditService.logAction({ action: AUDIT_ACTIONS.AUTH_LOGIN, actorId: user.id, targetResource: 'users', targetId: user.id, details: { trigger: 'magic_link', loginType: 'public' } })` — note the `trigger` detail so the Story 9-11 audit-log viewer can filter password vs magic-link logins.
  - [ ] 2.7 Run `pnpm vitest run apps/api/src/services/__tests__/auth.service.test.ts` — all 7 new tests pass, existing tests still pass.

- [ ] **Task 3 — Write failing supertests for the new route (AC: #3, #7)**
  - [ ] 3.1 In `apps/api/src/routes/__tests__/magic-link.routes.test.ts`, extend the file with a new `describe('POST /api/v1/auth/magic/login', ...)` block. Mock `AuthService.loginByMagicLinkToken` (add `mockLoginByMagicLink: vi.fn()` to the hoisted bag + the `vi.mock` of auth.service.js — note the test currently stubs AuthController not AuthService, so this means EXTENDING the auth.service.js mock; if no current mock exists, ADD one carefully so it doesn't break the magic-link or sms-otp test files in the same router). Tests per AC#7 bullet 2.
  - [ ] 3.2 Verify the 4 new tests FAIL (route doesn't exist), existing 12 magic-link tests + 8 sms-otp tests in adjacent files all GREEN.

- [ ] **Task 4 — Implement the new route + controller method (AC: #3)** _(green half)_
  - [ ] 4.1 Add a new Zod schema `loginByMagicLinkSchema = z.object({ token: z.string().min(8), purpose: z.literal('login'), rememberMe: z.boolean().optional() })` in `apps/api/src/controllers/magic-link.controller.ts` (near the existing `redeemMagicLinkQuerySchema` at line 35-38).
  - [ ] 4.2 Add a new controller method `MagicLinkController.loginByMagicLink(req, res, next)` after the existing `consumeMagicLink` at line 169-208. Validate via Zod (generic 400 INVALID_INPUT on failure per anti-enumeration discipline established by 9-12 L4 fix). Extract `token` + `rememberMe ?? false` + `ipAddress = req.ip` + `userAgent = req.get('user-agent')`. Call `AuthService.loginByMagicLinkToken({ plaintext: token, rememberMe, ipAddress, userAgent })`.
  - [ ] 4.3 Branch on the discriminated union return:
    - `'requiresMfa' in result && result.requiresMfa === true` → `res.status(200).json({ data: { requiresMfa: true, mfaChallengeToken: result.mfaChallengeToken, expiresIn: result.expiresIn } })`.
    - Else → set the `refreshToken` httpOnly cookie via the existing `REFRESH_TOKEN_COOKIE_NAME` + `COOKIE_OPTIONS` constants (import them from `auth.controller.ts` OR redeclare with shared pattern; cleanest: factor them into a small `lib/cookie-config.ts` shared file IF this is the second consumer — verify current usage first). Set `maxAge` per the existing `refreshCookieMaxAge` ternary at [Source: apps/api/src/controllers/auth.controller.ts:148-150]. Return `{ data: { accessToken, user, expiresIn } }` (NEVER the refresh token in the body).
  - [ ] 4.4 In `apps/api/src/routes/auth.routes.ts`, mount the new route between line 228 (the closing `}` of `POST /magic/consume`) and the SMS OTP section header at line 230-234. Pattern:
    ```ts
    router.post('/magic/login',
      magicLinkRateLimit,
      MagicLinkController.loginByMagicLink
    );
    ```
  - [ ] 4.5 In `apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts`, add a new entry for the new route in the `AUTH_RATE_LIMIT_COVERAGE` array (around line 144 where the `/magic/consume` entry lives — keep them adjacent for grep-ability):
    ```ts
    { method: 'POST', path: '/magic/login', rateLimiters: ['magicLinkRateLimit'], expectedHandlerCount: { min: 2 } },
    ```
  - [ ] 4.6 Run `pnpm vitest run apps/api/src/routes/__tests__/magic-link.routes.test.ts apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts` — all green.

- [ ] **Task 5 — Frontend magic-link API extensions (AC: #1, #4)**
  - [ ] 5.1 In `apps/web/src/features/auth/api/magic-link.api.ts`, add a new `requestLoginMagicLink({ email })` function that POSTs `/auth/public/magic-link` with `{ email, purpose: 'login' }` (the email entry-point on /login uses this — separate from the existing `/wizard_resume` and `/pending_nin_complete` paths the wizard uses).
  - [ ] 5.2 In the same file, add a new `loginByMagicLink({ token, rememberMe })` function that POSTs `/auth/magic/login` with `{ token, purpose: 'login', rememberMe }`. Returns the discriminated union shape: `{ requiresMfa: true, mfaChallengeToken, expiresIn } | { accessToken, user, expiresIn }`.

- [ ] **Task 6 — `MagicLinkLandingPage` login-branch wiring (AC: #4, #5, #7)**
  - [ ] 6.1 In `apps/web/src/features/auth/pages/MagicLinkLandingPage.tsx`, replace the empty `PURPOSE_COPY.login` entry (lines 39-44) with `{ title: 'Continue signing in', body: 'Click Continue to sign in as <email> on this device.', cta: 'Continue to sign-in' }`. (Email interpolation happens at render time via `peeked.email`.)
  - [ ] 6.2 Replace the `if (purpose === 'login') { return <CenteredCard testId="magic-link-login-deferred">...` block (currently at lines 152-176) with a Confirm card that on click calls `loginByMagicLink({ token, rememberMe: false })`. State machine: `idle | confirming | error`. Error branches per AC#4 bullet 5.
  - [ ] 6.3 On successful response without `requiresMfa`: integrate with the existing AuthProvider. Read the current LoginPage/LoginForm integration to identify the canonical path — preferred order: (a) the AuthProvider exposes a `setSession({ accessToken, user })` setter; (b) else a custom `useLogin().mutate` is invoked with synthetic args; (c) else call the lib/api-client's auth-state-store directly if one exists. Whichever path matches, use it. Then `navigate('/dashboard', { replace: true })`.
  - [ ] 6.4 On `requiresMfa: true` response: `navigate('/mfa-challenge', { replace: true, state: { mfaChallengeToken: result.mfaChallengeToken } })` — mirroring whatever `LoginForm.tsx` already does for the public-mode MFA branch (verify exact shape; if the staff variant uses a different state key, match the public-variant key for consistency with the MFA challenge page's expectations).
  - [ ] 6.5 Extend `apps/web/src/features/auth/pages/__tests__/MagicLinkLandingPage.test.tsx` with the 3 new login-branch tests per AC#7 bullet 3. Replace the existing "renders the deferred-login notice" test (test name `'renders the deferred-login notice (NOT the confirm CTA)'`) — keep the assertion that `magic-link-confirm-button` IS now in the document for login; remove the previous "NOT in document" assertion.

- [ ] **Task 7 — `LoginPage` magic-link entry-point (AC: #1, #7)**
  - [ ] 7.1 In `apps/web/src/features/auth/pages/LoginPage.tsx`, on `type='public'`, add a new `<section data-testid="magic-link-entry-point">` below the existing `LoginForm` rendering. Header text: "Or sign in with a magic link". Body: a small `<button>` "Send me a sign-in link" that on click reveals an inline email input + submit button. On submit, call `requestLoginMagicLink({ email })` and ALWAYS show the generic "If your account exists, we've sent a sign-in link to that address. Check your inbox." message regardless of the API response (anti-enumeration).
  - [ ] 7.2 NEVER render this section on `type='staff'` (`StaffLoginPage` is untouched — but `LoginPage` is shared and branches on the `type` prop per its Story 9-12 Task 8 cutover-banner pattern; verify the prop shape).
  - [ ] 7.3 Extend `apps/web/src/features/auth/pages/__tests__/LoginPage.test.tsx` with the 3 new tests per AC#7 bullet 4.

- [ ] **Task 8 — ADR-015 amendment flag (AC: #6)**
  - [ ] 8.1 In `_bmad-output/planning-artifacts/architecture.md` around line 2713 (where ADR-015 lives — see [Source: _bmad-output/planning-artifacts/architecture.md:2713]), add an Amendment-Needed note after the current rewritten ADR-015 body but BEFORE the Superseded section: "🏗️ AMENDMENT PROPOSED 2026-05-11 by Story 9-16 (magic-link login wiring) — magic-link login is now SUPPORTED as a passwordless public-user channel alongside email+password. Single-use, 15-min TTL, MFA-aware, anti-enumeration on request, shared rate-limit with password-reset budget per NFR4.4. Winston to author the full amendment when picking up the architecture follow-up; this story does NOT block on the amendment text."
  - [ ] 8.2 Do NOT modify the ADR's body or its "Decision" section — those changes belong to Winston. This task ONLY adds the flag line for Winston's followup queue.

- [ ] **Task 9 — Sprint-status flip + full regression sweep (AC: #7)**
  - [ ] 9.1 In `_bmad-output/implementation-artifacts/sprint-status.yaml`, locate the `9-16-magic-link-login: ready-for-dev` line (added by this story's authoring commit). After implementation completes, flip it to `in-progress` at start-of-work, then `review` at PR, then `done` at merge (canonical lifecycle).
  - [ ] 9.2 Run the full pre-commit regression: `cd apps/api && pnpm tsc --noEmit && pnpm exec eslint src --max-warnings=0 && pnpm exec vitest run` — must show **zero new failures** vs the 5 pre-existing DB-constraint failures + 7 skipped baseline; **+~14 net new tests** (7 auth.service + 4 magic-link.routes + 3 MagicLinkLandingPage); rate-limit-coverage map test must still pass with the new `/magic/login` entry.
  - [ ] 9.3 `cd apps/web && pnpm exec tsc --noEmit && pnpm exec vitest run` — must show zero failures; net new tests +6 (3 MagicLinkLandingPage + 3 LoginPage); no test deletions.
  - [ ] 9.4 Run a focused smoke through the 3 existing magic-link flows to verify zero regression: (a) request → wizard_resume link → click → /register hydrates; (b) request → pending_nin_complete link → click → /register/complete-nin handles save; (c) request → login link → click → MagicLinkLandingPage Confirm → /dashboard. Capture in Dev Notes / Completion Notes for review-pass evidence.

- [ ] **Task 10 — Code review (per `feedback_review_before_commit.md`)**
  - [ ] 10.1 Run `/bmad:bmm:workflows:code-review` on the uncommitted working tree once Tasks 1-9 are green. Auto-fix all HIGH/Medium severity findings; document Low-severity deferrals in Review Follow-ups (AI) per project convention.
  - [ ] 10.2 Only after code review passes, commit and mark status `review`.

## Dev Notes

### Why this is a feature gap, NOT 9-12 technical debt

Story 9-12 AC#6 specifies three magic-link purposes (`wizard_resume`, `pending_nin_complete`, `login`) — see [Source: _bmad-output/implementation-artifacts/9-12-public-wizard-pending-nin-magic-link.md AC#6]. Story 9-12 Task 1.7 EXPLICITLY scoped the `login`-purpose JWT-issuance to a future story:

> "JWT issuance for full magic-link login flow deferred to a future task — Task 1's scope captures the redemption mechanism; JWT cookie issuance lands when frontend drives it."
> [Source: _bmad-output/implementation-artifacts/9-12-public-wizard-pending-nin-magic-link.md Task 1.7]

Existing public_users continue to authenticate via `POST /auth/public/login` (email + password), which is unaffected by Story 9-12. Magic-link login is a NEW auth channel layered on top of the existing primitive — NOT a fix.

The Story 9-12 Review Follow-up MR-8 entry confirms this:

> "**STILL deferred** as a separate concern (NOT 9-12 technical debt — it's a feature gap): JWT issuance for `login` purpose. The landing page currently renders a 'Magic-link sign-in coming soon — use email + password' notice for the login branch because the backend `POST /auth/magic/consume` for purpose=login doesn't yet issue a session JWT (would require `AuthService.loginByMagicLinkToken` + session cookie + ADR amendment)."
> [Source: _bmad-output/implementation-artifacts/9-12-public-wizard-pending-nin-magic-link.md MR-8 entry]

### Dependencies

- **Story 9-12** (HARD) — Provides the magic-link primitive surface: `MagicLinkService.issueToken` / `peekToken` / `consumeToken` / `consumeTokenTx` at [Source: apps/api/src/services/magic-link.service.ts:65-291]; the `login` purpose enum value at [Source: apps/api/src/db/schema/magic-link-tokens.ts] (3-value enum); the 15-min TTL at [Source: apps/api/src/services/magic-link.service.ts:30]; the `magicLinkRateLimit` middleware (3/email/hour per NFR4.4 budget) at [Source: apps/api/src/middleware/magic-link-rate-limit.ts]; the `MagicLinkLandingPage` at `/auth/magic` (login-branch placeholder currently renders deferred notice — this story fills it). 9-16 cannot ship before 9-12 lands.
- **Story 9-13** (HARD) — Provides the MFA challenge flow that magic-link login MUST integrate with (AC#5). 9-13 is currently `review` status in sprint-status; should land `done` before 9-16 implementation starts to avoid carrying scope. The MFA integration is non-trivial — magic-link login bypassing MFA would silently defeat the Story 9-13 security uplift.
- **Story 6-1** — Provides the hash-chain audit log surface used by `AuditService.logAction({ action: AUDIT_ACTIONS.AUTH_LOGIN, ... })` per [Source: apps/api/src/services/audit.service.ts:51 + audit.service.ts:251].
- **ADR-015 amendment** (SOFT-blocker) — Architectural consistency requires Winston to amend ADR-015 to document magic-link login as a supported public-user channel alongside password. This story FLAGS the amendment need (Task 8); the amendment text itself is Winston's responsibility. Implementation does NOT block on the amendment landing.

### Architectural notes

#### Anti-enumeration discipline

The frontend "Send me a sign-in link" entry-point on `/login` MUST follow the same anti-enumeration discipline as `forgotPassword` — see [Source: apps/api/src/controllers/auth.controller.ts:281-311] for the pattern. The backend `POST /auth/public/magic-link` (which already exists from 9-12) ALREADY returns `200 sent: true` regardless of whether the email matches a user row (see [Source: apps/api/src/controllers/magic-link.controller.ts:51-108]), so this story's frontend MUST present a generic "If your account exists, we've sent a sign-in link" message and MUST NOT reveal API state in the UI.

#### Account-status edge cases

Suspended / deactivated / pending_verification accounts MUST be rejected with the SAME error codes that `loginPublic` uses (`AUTH_ACCOUNT_SUSPENDED` 403, `AUTH_ACCOUNT_LOCKED` 429) — see AC#2 for the exact gate order. NOT introducing new error codes prevents the frontend from having to duplicate copy strings + prevents confusion when an account is suspended after a token is issued (issue at time T, suspend at T+5min, click link at T+10min → expected: friendly "account suspended" message via the existing code).

#### Forward-compat with passwordless wizard accounts

Story 9-12 retired the legacy `/auth/public/register` flow but existing accounts retain their passwords. If a FUTURE story makes new public_users via the wizard with NO password (magic-link only), they MUST still be able to log in via magic-link. This story's `AuthService.loginByMagicLinkToken` does NOT gate on `password_hash IS NOT NULL` (unlike `loginPublic` at line 513-515 which rejects null `passwordHash` because it tries to bcrypt-compare; magic-link login skips that path entirely).

#### Auth surface area expansion mitigations

Adding a NEW auth channel widens the attack surface. Mitigations:
1. Shared rate-limit budget per NFR4.4 (no separate quota — magic-link request endpoint already at 3/email/hour; this story's new `/auth/magic/login` endpoint reuses the same `magicLinkRateLimit` middleware so the budget is unified).
2. Single-use enforcement on every login token via the atomic UPDATE at [Source: apps/api/src/services/magic-link.service.ts:111-181].
3. 15-min TTL on `login`-purpose tokens (intentionally shorter than `wizard_resume`'s 72h and `pending_nin_complete`'s 72h — minimises window of opportunity for a stolen email-link).
4. MFA-aware — Story 9-13's 2-step challenge is honoured (AC#5).
5. Audit-logged via `AUDIT_ACTIONS.AUTH_LOGIN` with `trigger: 'magic_link'` detail — Story 9-11 audit-log viewer can filter password vs magic-link logins.

#### Why a SEPARATE `/auth/magic/login` endpoint instead of overloading `/auth/magic/consume`

The existing `/auth/magic/consume` endpoint (added in Story 9-12 MR-8) consumes a token and returns the consumed token's metadata — it's the GENERIC consume endpoint used by `wizard_resume` + `pending_nin_complete` purposes via downstream pages. Adding session-issuance logic to it would conflate two responsibilities:
- "Consume the token and tell me what it was for" (current `/magic/consume` contract)
- "Consume the token and sign me in" (the new behaviour)

Cleaner: keep `/magic/consume` single-purpose (used by `MagicLinkLandingPage` for the wizard branches that need to know what came next) and ADD a dedicated `/magic/login` that does consume + session issuance. The two endpoints share the `magicLinkRateLimit` budget and the underlying `MagicLinkService.consumeToken` primitive, but the higher-level orchestration is cleanly separated.

#### ADR-015 amendment flag

Per AC#6 + Task 8 — Winston authors the amendment. Design constraints for him:
- Single-use enforcement on every login token (atomic UPDATE at the DB layer).
- 15-min TTL on login-purpose tokens (shorter than wizard_resume/pending_nin_complete's 72h to minimise stolen-link window).
- Rate-limit shared with magic-link request endpoint (3/email/hour, per NFR4.4 budget pool).
- Anti-enumeration on request (generic 200 regardless of email match).
- MFA-aware — Story 9-13's 2-step challenge flow is honoured for any magic-link login into an MFA-enrolled account.
- Forward-compat with passwordless public_users (no `passwordHash IS NOT NULL` gate).
- Audit-logged via `AUDIT_ACTIONS.AUTH_LOGIN` with `trigger: 'magic_link'` detail.

### Risks

1. **Auth surface area expansion.** See Mitigations subsection above.
2. **Account-status edge cases.** Must reject with SAME error codes as password login (consistency). Documented in AC#2 gate order.
3. **MFA integration.** Story 9-13's 2-step challenge MUST be honoured. Magic-link bypassing MFA would defeat the security uplift. AC#5 + Task 2.4 cover this; integration test in `auth.service.test.ts` exercises the MFA-required branch end-to-end.
4. **Anti-enumeration on `/login` magic-link request.** Must mirror `forgotPassword` discipline. AC#1 specifies the generic UI message; the backend at [Source: apps/api/src/controllers/magic-link.controller.ts:51-108] ALREADY honours this on the API side.
5. **Existing public_users with NO password set.** Story 9-12 retired the legacy `/auth/public/register` flow but existing accounts retain their passwords. Forward-compat scenario (a future story makes new wizard-only passwordless public_users) requires `loginByMagicLinkToken` to NOT gate on `password_hash IS NOT NULL`. AC#2 captures this.
6. **Cookie pattern duplication.** The refresh-cookie-setting code in `auth.controller.ts:152-155` is duplicated to magic-link.controller.ts in Task 4.3. Refactor opportunity (factor into `lib/cookie-config.ts`) — flagged as a potential code review point but not load-bearing for shipping.
7. **AuthProvider integration friction.** Task 6.3 says "verify the canonical path"; if the AuthProvider doesn't expose a clean setter, this could become a small refactor. Mitigation: spike Task 6.3 first (1-2 hours) to identify the integration surface before committing to the full landing-page wiring.

### Project Structure Notes

- **New surface in existing files** (no new files needed except possibly a small frontend api extension; the existing `apps/web/src/features/auth/api/magic-link.api.ts` from Story 9-12 MR-8 gets two new exports):
  - `apps/api/src/services/auth.service.ts` — new `loginByMagicLinkToken` static method (sits between `loginPublic` and `createLoginSession`)
  - `apps/api/src/controllers/magic-link.controller.ts` — new `loginByMagicLink` static method + new Zod schema
  - `apps/api/src/routes/auth.routes.ts` — new `POST /magic/login` route entry
  - `apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts` — new map entry for `/magic/login`
  - `apps/web/src/features/auth/api/magic-link.api.ts` — new `requestLoginMagicLink` + `loginByMagicLink` exports
  - `apps/web/src/features/auth/pages/MagicLinkLandingPage.tsx` — replace deferred-notice block with login Confirm flow; update `PURPOSE_COPY.login`
  - `apps/web/src/features/auth/pages/LoginPage.tsx` — new public-mode "Send me a sign-in link" entry-point section
  - 4 test files extended (no new test files; reuse the existing test infrastructure from Story 9-12 MR-8)
- **No new files**: This story is intentionally additive — no new services, no new schemas, no migrations, no new audit-action keys (reuses `AUTH_LOGIN` with a `trigger: 'magic_link'` detail), no new dependencies. Schema, DB tables, and email templates ALREADY exist from Story 9-12.
- **No DB migrations**.
- **No new audit-action keys** — reuses `AUDIT_ACTIONS.AUTH_LOGIN` per [Source: apps/api/src/services/audit.service.ts:51]; the `trigger` detail in `details` distinguishes password vs magic-link logins for the Story 9-11 audit-log viewer.
- **No new env vars**.
- **No FRC impact** — magic-link login is not field-survey-blocking; existing public_users use password login.

### References

- Story 9-12 (parent — provides the magic-link primitive + the MagicLinkLandingPage deferred-notice surface this story replaces): [Source: _bmad-output/implementation-artifacts/9-12-public-wizard-pending-nin-magic-link.md AC#6 + Task 1.7 + MR-8 + Cross-story follow-up sections]
- Magic-link service: [Source: apps/api/src/services/magic-link.service.ts:27-31 (TTL_MS_BY_PURPOSE), :65-103 (issueToken), :111-181 (redeemToken), :195-222 (peekToken), :230-291 (consumeToken / consumeTokenTx)]
- Magic-link controller (existing surface): [Source: apps/api/src/controllers/magic-link.controller.ts:35-38 (Zod schema pattern), :41-108 (requestMagicLink), :122-156 (redeemMagicLink — PEEK-only), :169-208 (consumeMagicLink)]
- Magic-link routes (existing surface): [Source: apps/api/src/routes/auth.routes.ts:207-228]
- Magic-link rate-limit middleware: [Source: apps/api/src/middleware/magic-link-rate-limit.ts]
- AuthService.loginPublic (the password-login template to mirror for SHAPE, not behaviour): [Source: apps/api/src/services/auth.service.ts:445-555]
- AuthService.createLoginSession (the shared session-issuance helper): [Source: apps/api/src/services/auth.service.ts:561-621]
- AuthService.loginStaff MFA branch (template for AC#5 MFA integration): [Source: apps/api/src/services/auth.service.ts:380-410]
- AuthController.publicLogin (the controller pattern to mirror): [Source: apps/api/src/controllers/auth.controller.ts:174-213]
- AuthController.staffLogin MFA branch (template for AC#3 controller MFA branch): [Source: apps/api/src/controllers/auth.controller.ts:115-168]
- Cookie config constants: [Source: apps/api/src/controllers/auth.controller.ts:25-31]
- LoginPage (existing surface — Story 9-12 Task 8 cutover banner already there; this story adds the public-mode magic-link entry-point): [Source: apps/web/src/features/auth/pages/LoginPage.tsx]
- MagicLinkLandingPage (the login branch this story fills): [Source: apps/web/src/features/auth/pages/MagicLinkLandingPage.tsx:39-44 (PURPOSE_COPY.login empty), :152-176 (deferred-notice block to replace)]
- AuditService.logAction + AUTH_LOGIN action: [Source: apps/api/src/services/audit.service.ts:51, :251]
- ADR-015 (current rewritten state — Winston will amend): [Source: _bmad-output/planning-artifacts/architecture.md:2713 + :2806 (superseded original below)]
- Sprint-status numbering (9-14 reserved, 9-15 telegram alerts authored 2026-05-11, 9-16 next slot): [Source: _bmad-output/implementation-artifacts/sprint-status.yaml:374-376]
- NFR4.4 rate-limit budget (3/email/hour shared pool): see PRD + Story 9-12 AC#6 references the same pool

## Dev Agent Record

### Agent Model Used

_(Dev agent will fill in on pickup)_

### Debug Log References

_(Dev agent will fill in on pickup)_

### Completion Notes List

_(Dev agent will fill in on pickup)_

### File List

_(Dev agent will fill in on pickup)_

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution per Task 10.)_

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-05-11 | Story drafted by Bob (SM) via `*create-story --yolo` per Awwal directive. 7 ACs covering: frontend public-mode magic-link entry-point on `/login`, backend `AuthService.loginByMagicLinkToken` method, new `POST /auth/magic/login` route, `MagicLinkLandingPage` login-branch wiring, MFA challenge integration (Story 9-13 honoured), ADR-015 amendment FLAGGED for Winston, tests + zero-regression discipline. Effort: ~3-5 dev-days. Priority: post-field-survey unless escalated — existing `/auth/public/login` (email + password) covers all current public_users; this is a NEW channel, not a fix. HARD deps: Story 9-12 (magic-link primitive) + Story 9-13 (MFA challenge). | Cross-story follow-up filed from Story 9-12 Review Follow-ups MR-8 entry. Closes the JWT-issuance feature gap that Story 9-12 Task 1.7 explicitly deferred by design. Authored autonomously with comprehensive brief from Awwal session 2026-05-11 — no elicitation needed; all 7 ACs, 10 Tasks, and source citations derived from the brief + verified against the live codebase. |
