# Story 9.16: Public-User Magic-Link Sign-In (login-purpose JWT issuance)

Status: done

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

3. **AC#3 — Backend route `POST /api/v1/auth/magic/login`.** New endpoint mounted in `apps/api/src/routes/auth.routes.ts` between the existing `POST /magic/consume` (added in 9-12 MR-8) and the SMS-OTP routes. Wraps `magicLinkRateLimit` middleware (see [Source: apps/api/src/middleware/magic-link-rate-limit.ts]). **[Code-review M1 correction 2026-06-03]** the original "3/email/hour" wording was inaccurate for this endpoint: the body carries no `email`, so the limiter keys per-IP at 3/hour (a combined bucket shared with `/magic/consume`), NOT per-email. Single-use 32-byte token entropy is the primary control; the per-IP cap is a secondary throttle (shared-network tradeoff acknowledged). Body: `{ token: string, purpose: 'login', rememberMe?: boolean }`. Validation via a new Zod schema in `magic-link.controller.ts` (mirroring `redeemMagicLinkQuerySchema` shape at [Source: apps/api/src/controllers/magic-link.controller.ts:35-38] + `rememberMe` optional). New controller method `MagicLinkController.loginByMagicLink` (NOT `consumeMagicLink` — keep them separate so the `/magic/consume` endpoint stays single-purpose for the wizard/pending-NIN flow). On success: sets the `refreshToken` httpOnly cookie via the existing `REFRESH_TOKEN_COOKIE_NAME` + `COOKIE_OPTIONS` constants at [Source: apps/api/src/controllers/auth.controller.ts:25-31], returns `{ accessToken, user, expiresIn }` in the response body (NEVER the refresh token in the body — matches `staffLogin`/`publicLogin` discipline at [Source: apps/api/src/controllers/auth.controller.ts:152-164, 197-209]). On `requiresMfa: true`: returns `{ requiresMfa: true, mfaChallengeToken, expiresIn }` with status 200 (matches existing pattern at [Source: apps/api/src/controllers/auth.controller.ts:136-145]).

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

- [x] **Task 1 — Write failing tests for the new service method (AC: #2, #5, #7)** _(red half of red-green-refactor)_
  - [x] 1.1 In `apps/api/src/services/__tests__/auth.service.test.ts`, add a new `describe('loginByMagicLinkToken', ...)` block. **NOTE: there was NO existing `loginPublic` test in this file to mirror — it only tested `decodeBase64Image`. Built the mock setup from scratch:** mock `../magic-link.service.js` (`consumeToken`), `../mfa.service.js` (`mintChallengeToken`), and `../../db/index.js` (`db.query.users.findFirst`); the happy-path spies the private `createLoginSession` so Redis/JWT are never touched. Wrote **9 tests** (7 from AC#7 + a forward-compat passwordless-user test + a consume-error passthrough test).
  - [x] 1.2 Ran the file — confirmed the new tests fail before impl, then pass after (red→green).

- [x] **Task 2 — Implement `AuthService.loginByMagicLinkToken` (AC: #2, #5)** _(green half — Task 1 tests pass)_
  - [x] 2.1 Added the method to `apps/api/src/services/auth.service.ts` directly below `loginPublic`. Signature: `({ plaintext, rememberMe?, ipAddress?, userAgent? })`. Added `MagicLinkLoginResult` + `LoginTrigger` exported types.
  - [x] 2.2 Body calls `MagicLinkService.consumeToken({ plaintext, purpose: 'login' })` FIRST — atomic single-use + throws `MAGIC_LINK_*` 400s before any user lookup.
  - [x] 2.3 Looks up user by `consumed.email`; applies the 4-step gate in the EXACT order (not-found 401 → locked 429 → suspended/deactivated 403 → non-public-role 401). Forward-compat: NO `passwordHash IS NOT NULL` gate.
  - [x] 2.4 MFA branch via `MfaService.mintChallengeToken({ userId, email, rememberMe })` (passes `rememberMe` so the post-MFA session preserves the choice) → returns `requiresMfa: true` branch.
  - [x] 2.5 Else calls `createLoginSession(user, rememberMe, ipAddress, userAgent, 'magic_link')`.
  - [x] 2.6 **Audit: DEVIATION FROM LITERAL WORDING (reviewer-friendly).** `createLoginSession` ALREADY emits the canonical `auth.login_success` audit entry for every login. Rather than emit a SECOND `AUDIT_ACTIONS.AUTH_LOGIN` entry (double-logging one login event — a smell given the project's audit-pattern-unification discipline, Stories 9-33/34/36/37), the `trigger: 'password' | 'magic_link'` marker is threaded into the existing single entry's `details`. The Story 9-11 viewer still filters magic-link logins via `details.trigger`. Intent of AC#2.6 fully met with one clean entry per login.
  - [x] 2.7 Ran the service test — 9 new pass, existing `decodeBase64Image` tests still pass.

- [x] **Task 3 — Write failing supertests for the new route (AC: #3, #7)**
  - [x] 3.1 Extended `apps/api/src/routes/__tests__/magic-link.routes.test.ts`: added `mockLoginByMagicLink` to the hoisted bag + a NEW `vi.mock('../../services/auth.service.js', ...)` (the controller now imports AuthService directly). Added a `describe('POST /api/v1/auth/magic/login', ...)` block with **4 tests**.
  - [x] 3.2 Confirmed the new tests fail before the route exists, then pass. The adjacent `sms-otp.routes.test.ts` MagicLinkController stub also needed `loginByMagicLink: vi.fn()` added (it mounts the real auth.routes) — fixed.

- [x] **Task 4 — Implement the new route + controller method (AC: #3)** _(green half)_
  - [x] 4.1 Added `loginByMagicLinkSchema = z.object({ token: z.string().min(8), purpose: z.literal('login'), rememberMe: z.boolean().optional() })` in `magic-link.controller.ts`.
  - [x] 4.2 Added `MagicLinkController.loginByMagicLink` after `consumeMagicLink`. Zod failure → **`MAGIC_LINK_INVALID` 400** (chosen over `INVALID_INPUT` for consistency with the sibling magic-link endpoints in the same controller — both `redeemMagicLink` + `consumeMagicLink` already use this generic code). Extracts token + rememberMe + ip + user-agent; calls `AuthService.loginByMagicLinkToken`.
  - [x] 4.3 Branches on the union. **Cookie config refactor (Risk #6 resolved):** extracted `REFRESH_TOKEN_COOKIE_NAME` + `COOKIE_OPTIONS` + a new `refreshCookieMaxAge(rememberMe)` helper into `apps/api/src/lib/cookie-config.ts` (this controller is the SECOND consumer, per the story's "cleanest path"); `auth.controller.ts` now imports from there too and its two inline ternaries were deduped.
  - [x] 4.4 Mounted `POST /magic/login` between `/magic/consume` and the SMS-OTP section in `auth.routes.ts`, wrapped in `magicLinkRateLimit`.
  - [x] 4.5 Added the `/magic/login` entry to `AUTH_RATE_LIMIT_COVERAGE` in `rate-limit-coverage.test.ts`.
  - [x] 4.6 Ran the route + coverage tests — all green.

- [x] **Task 5 — Frontend magic-link API extensions (AC: #1, #4)**
  - [x] 5.1 Added `requestLoginMagicLink({ email })` → POSTs `/auth/public/magic-link` with `{ email, purpose: 'login' }`.
  - [x] 5.2 Added `loginByMagicLink({ token, rememberMe })` → POSTs `/auth/magic/login`. **Uses `credentials: 'include'`** (apiClient omits it by default — required so the browser stores the httpOnly refresh cookie). Returns the discriminated union; added `MagicLinkLoginResult` type + `isMagicLinkMfaRequired` type-guard.

- [x] **Task 6 — `MagicLinkLandingPage` login-branch wiring (AC: #4, #5, #7)**
  - [x] 6.1 Updated `PURPOSE_COPY.login` → `{ title: 'Continue signing in', body: 'Click Continue to sign in on this device.', cta: 'Continue to sign-in' }` (email rendered separately via `peeked.email`).
  - [x] 6.2 Replaced the deferred-notice block with a Confirm card (`isSigningIn` / `loginError` state) that calls `loginByMagicLink({ token, rememberMe: false })`. Error branches via new `loginFriendlyErrorCopy` (handles `AUTH_INVALID_CREDENTIALS` / `AUTH_ACCOUNT_LOCKED` / `AUTH_ACCOUNT_SUSPENDED` + delegates MAGIC_LINK_* / NETWORK_ERROR to the shared `friendlyErrorCopy`).
  - [x] 6.3 Session integration: added a new `loginWithMagicLink(response, rememberMe)` method to `AuthContext` (mirrors `loginWithGoogle`/`completeStaffLoginAfterMfa` — the canonical "mount a session from a LoginResponse" path). On success → `navigate('/dashboard', { replace: true })`.
  - [x] 6.4 On `requiresMfa: true` → `navigate('/auth/mfa-challenge', { replace: true, state: { mfaChallengeToken, expiresIn, rememberMe: false, redirectTo: '/dashboard' } })` — matches the EXACT state shape `useLogin.ts` + `MfaChallengePage.tsx` use (route is `/auth/mfa-challenge`, not `/mfa-challenge`).
  - [x] 6.5 Replaced the deferred-notice test with **3 login-branch tests** (Confirm card renders with CTA; Confirm → /dashboard on success; Confirm → /auth/mfa-challenge on MFA). Mock now exposes `loginByMagicLink` + `isMagicLinkMfaRequired` + a `useAuth` stub.

- [x] **Task 7 — `LoginPage` magic-link entry-point (AC: #1, #7)**
  - [x] 7.1 Added a `MagicLinkSignInEntry` component (in `LoginPage.tsx`): `data-testid="magic-link-entry-point"`, "Send me a sign-in link" reveal → email input + submit → `requestLoginMagicLink({ email })` → ALWAYS shows the generic "If your account exists…" message (anti-enumeration; API errors swallowed).
  - [x] 7.2 Rendered only on `type='public'` (staff login untouched).
  - [x] 7.3 Added **3 LoginPage tests** (CTA present on public; absent on staff; submit calls the fetcher with `{ email }` + shows the generic message).

- [x] **Task 8 — ADR-015 amendment flag (AC: #6)**
  - [x] 8.1 Added the `🏗️ AMENDMENT PROPOSED 2026-06-03 by Story 9-16` note in `architecture.md`, after the ADR-015 cross-references block and BEFORE the "Superseded — Original ADR-015" section. Captures all design constraints (single-use, 15-min TTL, MFA-aware, anti-enumeration, shared rate-limit, forward-compat, audit `trigger`) for Winston.
  - [x] 8.2 Did NOT touch the ADR Decision body — flag line only.

- [x] **Task 9 — Sprint-status flip + full regression sweep (AC: #7)**
  - [x] 9.1 Flipped `9-16-magic-link-login` → `in-progress` at start; → `review` at completion (below).
  - [x] 9.2 API: `pnpm tsc --noEmit` clean, `eslint src --max-warnings=0` clean, full `vitest run` = **2315 passed / 7 skipped / 0 failed** (163 files). NOTE: the "5 pre-existing DB-constraint failures" mentioned in the story baseline are NO LONGER present (test DB is in sync). Net new API tests: +9 auth.service, +4 magic-link.routes (+ rate-limit-coverage map entry, + sms-otp stub fix).
  - [x] 9.3 Web: `tsc --noEmit` clean, `eslint src --max-warnings=0` clean, full `vitest run` = **2480 passed / 2 todo / 0 failed** (228 files). Net new web tests: +3 MagicLinkLandingPage (net +2 vs the replaced deferred test) + 3 LoginPage. Also added `loginWithMagicLink: vi.fn()` to 7 pre-existing AuthContext mock objects (required field on the context value).
  - [x] 9.4 Flow regression coverage (verified via the green test suites rather than a manual browser smoke, since this session has no interactive app): (a) `wizard_resume` → /register and (b) `pending_nin_complete` → /register/complete-nin are unchanged and still covered by the existing MagicLinkLandingPage tests; (c) `login` → Confirm → /dashboard is covered by the new login-branch tests. No behaviour drift in the two pre-existing branches.

- [x] **Task 10 — Code review (per `feedback_review_before_commit.md`)**
  - [x] 10.1 Ran `/bmad:bmm:workflows:code-review` on the uncommitted working tree (2026-06-03, Opus 4.8). 2 Medium + 4 Low found (0 Critical/High); ALL fixed in-session per user directive + catalogued in Review Follow-ups (AI). Targeted suites re-run green post-fix.
  - [x] 10.2 Committed (1ee3c3e) + code-review fixes; **prod UAT passed 2026-06-06** — seeded passwordless public_user `akannilawal@gmail.com`, requested a login link from `/login`, received the email (Resend, confirming deliverability), clicked through the landing-page Confirm, landed on `/dashboard`. Magic-link login mechanism verified end-to-end in production. Status → done.

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
1. Shared `magicLinkRateLimit` middleware (no separate quota). **[M1 correction]** the request endpoint (`/auth/public/magic-link`) keys per-email at 3/hour (NFR4.4 budget); the token-consume endpoints (`/magic/consume`, `/magic/login`) carry no email and key per-IP at 3/hour (combined bucket). The "unified per-email budget" framing was wrong — for the login endpoint the IP cap is a secondary throttle behind single-use 32-byte token entropy.
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
- Rate-limit: request endpoint keyed per-email (3/hour, NFR4.4 pool); token-consume endpoints (`/magic/consume`, `/magic/login`) keyed per-IP (3/hour, combined) since their bodies carry no email — single-use token entropy is the primary control (M1 correction).
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

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — dev-story workflow, 2026-06-03.

### Debug Log References

- API auth-route cluster (auth.service + magic-link.routes + rate-limit-coverage + sms-otp.routes): 45/45 pass.
- Full API suite: 2315 pass / 7 skip / 0 fail (163 files).
- Full web suite: 2480 pass / 2 todo / 0 fail (228 files).
- One self-introduced regression caught + fixed: `sms-otp.routes.test.ts` mounts the real `auth.routes.ts`, so its `MagicLinkController` stub needed the new `loginByMagicLink: vi.fn()` (Express throws on an `undefined` route handler otherwise).

### Completion Notes List

- ✅ All 7 ACs implemented. New passwordless public-user auth channel layered on the Story 9-12 magic-link primitive; existing email+password login unchanged.
- ✅ **AC#2 audit deviation (documented, reviewer-friendly):** the `trigger: 'magic_link'` marker is folded into `createLoginSession`'s existing single `auth.login_success` audit entry rather than emitting a second `AUDIT_ACTIONS.AUTH_LOGIN` entry. Avoids double-logging one login event while still letting the Story 9-11 viewer filter on `details.trigger`. Threaded as a `LoginTrigger` param (default `'password'`) so staff/public password logins are unaffected.
- ✅ **AC#3 controller Zod-failure code:** uses `MAGIC_LINK_INVALID` 400 (consistent with the sibling `redeemMagicLink`/`consumeMagicLink` endpoints) rather than a bespoke `INVALID_INPUT`.
- ✅ **Risk #6 resolved:** cookie config extracted to `apps/api/src/lib/cookie-config.ts` (shared by `auth.controller.ts` + `magic-link.controller.ts`); the two duplicated `refreshCookieMaxAge` ternaries in auth.controller were deduped into a helper.
- ✅ **AC#5 MFA:** magic-link login does NOT bypass MFA — `mfaEnabled` users get the `requiresMfa` challenge branch (`mintChallengeToken` receives `rememberMe`), and the frontend routes to the existing `/auth/mfa-challenge` page with the identical router-state shape password login uses. No changes to `/login/mfa` or the MFA completion path (channel-agnostic post-step-1).
- ✅ **Forward-compat:** `loginByMagicLinkToken` does NOT gate on a non-null `passwordHash` — a future passwordless wizard account can sign in (unit-tested).
- ✅ **Anti-enumeration:** `/login` entry-point always shows the generic "If your account exists…" message; service returns generic `AUTH_INVALID_CREDENTIALS` on user-not-found; backend request endpoint already returns 200 regardless.
- ✅ **credentials: 'include'** added to the frontend `loginByMagicLink` fetcher so the httpOnly refresh cookie is actually stored (apiClient omits credentials by default — a silent gap that would have broken token refresh).
- ✅ **AC#4 session integration:** new `AuthContext.loginWithMagicLink(response, rememberMe)` method (mirrors `loginWithGoogle`/`completeStaffLoginAfterMfa`). Adding it as a required context field required updating 7 pre-existing test mock objects.
- ✅ Quality gates: API + web tsc clean; API + web eslint `--max-warnings=0` clean; full suites green, zero regressions.
- ☐ **Task 10 (code review) NOT yet run** — per `feedback_review_before_commit.md`, code review runs on the uncommitted tree, ideally in a SEPARATE session with a different LLM. Story flipped to `review` for that pass. No commit made.
- Operator/Winston follow-up: ADR-015 amendment flagged (Task 8) — Winston authors the full amendment text; implementation does not block on it.

### File List

**New files:**
- `apps/api/src/lib/cookie-config.ts` — shared refresh-cookie name + options + `refreshCookieMaxAge` helper.

**Modified — API:**
- `apps/api/src/services/auth.service.ts` — `loginByMagicLinkToken` method + `MagicLinkLoginResult`/`LoginTrigger` types; `createLoginSession` gains a `trigger` param folded into the audit entry; `MagicLinkService` import.
- `apps/api/src/controllers/magic-link.controller.ts` — `loginByMagicLink` method + `loginByMagicLinkSchema`; imports `AuthService` + shared cookie-config.
- `apps/api/src/controllers/auth.controller.ts` — consumes shared cookie-config; deduped two `refreshCookieMaxAge` ternaries.
- `apps/api/src/routes/auth.routes.ts` — mounts `POST /magic/login`.

**Modified — API tests:**
- `apps/api/src/services/__tests__/auth.service.test.ts` — +9 `loginByMagicLinkToken` tests + mock scaffolding.
- `apps/api/src/routes/__tests__/magic-link.routes.test.ts` — +4 `/magic/login` supertests + auth.service mock.
- `apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts` — `/magic/login` coverage entry.
- `apps/api/src/routes/__tests__/sms-otp.routes.test.ts` — `loginByMagicLink: vi.fn()` added to the MagicLinkController stub (real-router mount).

**Modified — Web:**
- `apps/web/src/features/auth/api/magic-link.api.ts` — `requestLoginMagicLink` + `loginByMagicLink` + `MagicLinkLoginResult`/`isMagicLinkMfaRequired`.
- `apps/web/src/features/auth/context/AuthContext.tsx` — `loginWithMagicLink` method.
- `apps/web/src/features/auth/pages/MagicLinkLandingPage.tsx` — login-branch Confirm flow + `loginFriendlyErrorCopy`; updated `PURPOSE_COPY.login`.
- `apps/web/src/features/auth/pages/LoginPage.tsx` — `MagicLinkSignInEntry` entry-point (public-only).

**Modified — Web tests:**
- `apps/web/src/features/auth/pages/__tests__/MagicLinkLandingPage.test.tsx` — 3 login-branch tests (replaced the deferred-notice test).
- `apps/web/src/features/auth/pages/__tests__/LoginPage.test.tsx` — 3 entry-point tests.
- `apps/web/src/layouts/components/SmartCta.test.tsx`, `apps/web/src/layouts/components/MobileNav.test.tsx`, `apps/web/src/layouts/__tests__/DashboardLayout.test.tsx`, `apps/web/src/features/dashboard/__tests__/rbac-routes.test.tsx`, `apps/web/src/features/dashboard/__tests__/DashboardRedirect.test.tsx`, `apps/web/src/features/dashboard/pages/__tests__/AssessorOfficialRbac.test.tsx`, `apps/web/src/features/dashboard/pages/__tests__/PublicUserRbac.test.tsx` — added `loginWithMagicLink: vi.fn()` to the AuthContext mock objects.

**Modified — Planning/tracking:**
- `_bmad-output/planning-artifacts/architecture.md` — ADR-015 amendment-proposed flag (Task 8); rate-limit + Google-migration corrections (code-review M1/L3).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `9-16` → `in-progress` → `review`.
- `_bmad-output/implementation-artifacts/9-16-magic-link-login.md` — this file.

**Modified — repo tooling (unrelated to 9-16, documented per code-review M2):**
- `.gitignore` — adds `SESSION_LOG.md` (local Claude-Code session-continuity log; append-only, never committed). NOT a 9-16 deliverable; bundled in the same working tree. Documented here for File-List/git transparency rather than reverted, since the ignore rule guards against accidentally committing a local narrative log.

### Review Follow-ups (AI)

**Adversarial code review — 2026-06-03 (Opus 4.8, `/bmad:bmm:workflows:code-review`, Task 10.1).** Read every File-List file + cross-referenced sources (rate-limit middleware, `loginPublic`/`loginStaff` gates, `mintChallengeToken` signature, `apiClient`). All 7 ACs verified implemented with real code + substantive tests (gate coverage, MFA-no-bypass asserted, refresh-token-never-in-body asserted, anti-enumeration asserted). No Critical/High. 2 Medium + 4 Low found; **all fixed in the same session** (user directive: create action items AND auto-fix).

- [x] **[AI-Review][Medium] M1 — "3/email/hour shared budget" claim was false for `/magic/login`; it silently keys per-IP.** `magicLinkRateLimit` keys on `req.body?.email` and falls back to `req.ip`; the login (and consume) bodies carry no email, so both key per-IP at 3/hour (combined `rl:magic-link:` bucket). The per-email framing in AC#3 / mitigations §1 / Dev-Notes ADR flag / route comment / coverage comment / architecture.md was inaccurate, and the shared-IP cap risks shared-network (cybercafé) lockouts — the exact scenario the middleware's own comment warns about. **Fix:** runtime kept as per-IP (single-use 32-byte token entropy is the real control); corrected every claim to state per-IP keying + documented the tradeoff. Files: `middleware/magic-link-rate-limit.ts:35` (keyGenerator note), `routes/auth.routes.ts:218`, `middleware/__tests__/rate-limit-coverage.test.ts:146`, `architecture.md:2834`, story AC#3 + mitigations §1 + ADR-015 flag bullet.
- [x] **[AI-Review][Medium] M2 — undocumented out-of-scope `.gitignore` change in the working tree.** `.gitignore` adds `SESSION_LOG.md`, unrelated to 9-16 and absent from the File List. **Fix:** documented in the File List under "repo tooling (unrelated to 9-16)" rather than reverted (the ignore rule prevents accidental commit of a local PII-ish session log). Operator may unstage from the 9-16 commit if preferred.
- [x] **[AI-Review][Low] L1 — `trigger` now decorates every login's audit `details` (incl. password logins).** `createLoginSession` defaults `trigger='password'`, so all staff/public password logins now emit `details.trigger='password'`. Documented AC#2.6 deviation; suite green confirms no consumer asserts the old shape. **Fix:** behaviour confirmed acceptable; recorded explicitly in architecture.md so the Story 9-11 viewer contract notes both trigger values. `auth.service.ts:696-766`.
- [x] **[AI-Review][Low] L2 — `ipAddress` derivation diverged from sibling controllers.** `loginByMagicLink` used `req.ip`; `staffLogin`/`publicLogin` use `req.ip || req.socket.remoteAddress`. **Fix:** aligned to the same fallback. `magic-link.controller.ts:254`.
- [x] **[AI-Review][Low] L3 — magic-link signs in legacy `authProvider='google'`/passwordless accounts that password-login gates (`AUTH_GOOGLE_ONLY`).** Intentional forward-compat + de-facto migration path for retired-Google accounts. **Fix:** documented the cross-channel asymmetry in the ADR-015 amendment brief for Winston. `architecture.md:2834`.
- [x] **[AI-Review][Low] L4 — anti-enumeration "sent" confirmation lacked an aria-live region.** Screen-reader users may not hear it. **Fix:** added `role="status"` + `aria-live="polite"`. `LoginPage.tsx:40`.

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-06-06 | **Status review → done.** Prod UAT passed: passwordless public_user seeded (`akannilawal@gmail.com`) via `scripts/_seed-test-public-user.ts`; full magic-link login exercised on production (request link from `/login` → email delivered via Resend → landing Confirm → `/dashboard`). All 7 ACs met + the login mechanism is now verified end-to-end in prod. **Scope boundary:** 9-16 delivered the magic-link *login mechanism* — the broader public-user journey incoherence surfaced during UAT (legacy `PublicUserHome` unaware of wizard/respondent state; no respondent↔user link; `/login` undiscoverable; no magic-link-primary entry) is OUT of 9-16's scope and is being carved into correct-course stories (keystone: Story 9-38). "Done" here is honest about what 9-16 was. | Login channel works in prod; downstream journey harmonization tracked separately so 9-16 isn't held hostage to it. |
| 2026-06-03 | Code review (Task 10.1, Opus 4.8, adversarial). 0 Critical/High; 2 Medium (M1 rate-limit per-IP-vs-per-email claim correction; M2 undocumented `.gitignore` change) + 4 Low (L1 audit-trigger payload note; L2 ipAddress fallback alignment; L3 Google-migration asymmetry doc; L4 aria-live) — ALL fixed in-session + catalogued in Review Follow-ups (AI). Touched: `magic-link-rate-limit.ts`, `auth.routes.ts`, `rate-limit-coverage.test.ts`, `magic-link.controller.ts`, `LoginPage.tsx`, `architecture.md`, this story. Targeted suites green post-fix. Status stays `review` (commit + done-flip are operator steps). | Closes Task 10.1. M1 was the load-bearing fix — the per-email budget claim misrepresented a security control; runtime kept per-IP (token entropy is the real control) with all docs corrected. |
| 2026-06-03 | Implemented Tasks 1–9 (dev-story, Opus 4.8). New `AuthService.loginByMagicLinkToken` + `POST /api/v1/auth/magic/login` + `MagicLinkController.loginByMagicLink`; shared `lib/cookie-config.ts`; frontend `MagicLinkLandingPage` login-branch Confirm flow + `LoginPage` "Send me a sign-in link" entry-point + `AuthContext.loginWithMagicLink`. MFA-aware, anti-enumeration, forward-compat with passwordless accounts. ADR-015 amendment flagged for Winston. +13 API tests / +6 web tests; full suites green (API 2315 / web 2480, 0 fail), tsc + lint clean both packages. Audit `trigger` folded into the single login entry (documented deviation from the literal AC#2.6 second-entry wording). Status → review; Task 10 (code review) handed to a separate session per `feedback_review_before_commit.md`. | Closes the JWT-issuance feature gap Story 9-12 Task 1.7 deferred. Head of the locked field-readiness wizard-redesign sequence (9-16 → 9-17 → 9-18). |
| 2026-05-11 | Story drafted by Bob (SM) via `*create-story --yolo` per Awwal directive. 7 ACs covering: frontend public-mode magic-link entry-point on `/login`, backend `AuthService.loginByMagicLinkToken` method, new `POST /auth/magic/login` route, `MagicLinkLandingPage` login-branch wiring, MFA challenge integration (Story 9-13 honoured), ADR-015 amendment FLAGGED for Winston, tests + zero-regression discipline. Effort: ~3-5 dev-days. Priority: post-field-survey unless escalated — existing `/auth/public/login` (email + password) covers all current public_users; this is a NEW channel, not a fix. HARD deps: Story 9-12 (magic-link primitive) + Story 9-13 (MFA challenge). | Cross-story follow-up filed from Story 9-12 Review Follow-ups MR-8 entry. Closes the JWT-issuance feature gap that Story 9-12 Task 1.7 explicitly deferred by design. Authored autonomously with comprehensive brief from Awwal session 2026-05-11 — no elicitation needed; all 7 ACs, 10 Tasks, and source citations derived from the brief + verified against the live codebase. |
