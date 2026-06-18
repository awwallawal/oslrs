# Story 9.39: Public Entry IA — discoverable "Sign in" door + magic-link-primary sign-in

Status: done

<!--
Authored 2026-06-06 by Bob (SM) via canonical *create-story --yolo, routed by
the Public-User Journey Harmonization SCP (sprint-change-proposal-2026-06-06).
Closes the "returning user has no discoverable way back" half of the entry IA.
The logged-IN navbar state (Dashboard button) ALREADY works via SmartCta — this
story fixes the logged-OUT side, which only ever offers "Register".
-->

## Story

As a **returning public user who already registered**,
I want **an obvious "Sign in" option on the public site, leading with a magic-link**,
So that **I can get back into my account by entering my email — without hunting for a hidden `/login` URL or being funneled only toward re-registering**.

## Acceptance Criteria

1. **AC#1 — Logged-out public header offers BOTH doors.** When unauthenticated, the public header (`SmartCta` / `Header.tsx` / `MobileNav.tsx`) shows **"Sign in"** (→ the public sign-in page) AND **"Register"** (→ `/register`). When authenticated it stays **"Dashboard" → `/dashboard`** exactly as today (no regression to the verified SmartCta behavior at [Source: apps/web/src/layouts/components/SmartCta.tsx]). Loading-skeleton anti-flash preserved.

2. **AC#2 — Public sign-in page leads with magic-link.** `LoginPage` in `type='public'` mode is reordered so the **magic-link request is the primary action** ("Enter your email and we'll send you a one-time sign-in link"), with email+password demoted to a secondary "I already set a password" disclosure. Staff `/staff/login` (`StaffLoginPage`) is UNCHANGED — staff stay password + MFA. The Story 9-16 entry-point (prominent magic-link button shipped 2026-06-06, commit `b2219a5`) is promoted from "secondary CTA below the form" to the primary path. [Source: apps/web/src/features/auth/pages/LoginPage.tsx]

3. **AC#3 — Forgot-password scoped off the public surface.** "Forgot password" is removed from the public sign-in primary view (passwordless public accounts have no password to reset). It remains available to staff and to public users who opted into a password (Story 9-32), reachable from the secondary "I set a password" disclosure — not the default view.

4. **AC#4 — Wrong-door recovery.** A returning user who clicks "Register" must not be forced to restart. On wizard entry, if the visitor can be identified as already-registered (authenticated session, OR — post the wizard's existing email step — a `GET /me/registration-status` lookup by email returns a completed registration), route them to the dashboard / offer a sign-in link instead of a blank wizard. Anti-enumeration preserved (no "this email is registered" leak to an unauthenticated stranger — the recovery only fires for the authenticated user or via the same generic magic-link path). Depends on Story 9-38's read-model.

5. **AC#5 — Optional "signed in as" reminder.** When authenticated, the public header shows a lightweight "Signed in as {email/name}" affordance (or avatar) next to the Dashboard button, so a logged-in user browsing the static site has an unmistakable signal — stronger than the button-label swap alone. Small, non-blocking; may be deferred if it complicates the header.

6. **AC#6 — Tests + zero regression.** SmartCta tests extended (logged-out shows both Sign in + Register; logged-in shows Dashboard; skeleton during load). LoginPage tests updated for the magic-link-primary ordering. Header/MobileNav tests cover the new Sign-in link. No regression to staff login, the verified logged-in→Dashboard path, or 9-16 magic-link login. Full web suite green.

## Tasks / Subtasks

- [x] **Task 1 — SmartCta / header logged-out door (AC: #1, #5, #6)**
  - [x] 1.1 Extend `SmartCta` (or the header) so logged-out renders Sign in + Register; logged-in unchanged.
  - [x] 1.2 Optional "signed in as" indicator (AC#5).
  - [x] 1.3 Update SmartCta + Header + MobileNav tests.
- [x] **Task 2 — Public sign-in page magic-link-primary (AC: #2, #3, #6)**
  - [x] 2.1 Reorder `LoginPage` public mode: magic-link primary; password → secondary disclosure; forgot-password out of default view.
  - [x] 2.2 Confirm `StaffLoginPage` untouched.
  - [x] 2.3 Update LoginPage tests.
- [x] **Task 3 — Wrong-door recovery (AC: #4)** _(depends on 9-38 read-model)_
  - [x] 3.1 Wizard-entry check via session / `GET /me/registration-status`; route already-registered → dashboard / sign-in.
  - [x] 3.2 Tests incl. anti-enumeration.
- [x] **Task 4 — Regression + code review (AC: #6)**
  - [x] 4.1 Web tsc + lint + full vitest green.
  - [x] 4.2 `/bmad:bmm:workflows:code-review` on the uncommitted tree — DONE 2026-06-18 (paired CLI); findings below, fixed in-pass.

### Review Follow-ups (AI)

Adversarial code review 2026-06-18 (paired code-review CLI, Senior-Dev workflow). 5 findings (0 Critical, 2 Med, 3 Low); M1 + L1 fixed in-pass, M2 accepted by-design, L2/L3 noted. Re-validated: affected suites 170/170 · lint 0 · tsc 0 · full web suite green (thread-capped).

- [x] [AI-Review][Med] **M1 — Duplicate OSLSR branding when the password disclosure opens.** `LoginForm` renders its own header (`<h1>OSLSR</h1>` + "Login" heading + subtitle) and a "Create account" footer; the new public `LoginPage` already supplies page-level branding + the /register cutover banner. Revealing "I already set a password" produced two `<h1>`s, a conflicting "Sign in" vs "Login" heading, and a third Register CTA. Fix: added an `embedded` prop to `LoginForm` (default false — staff/standalone unchanged) that suppresses its header + register footer; `PasswordSignInDisclosure` now passes `embedded`. [LoginForm.tsx; LoginPage.tsx]
- [x] [AI-Review][Low] **L1 — No test on the disclosure-open state** (M1 shipped untested). Fix: added a LoginPage test asserting that revealing the password form yields exactly one `OSLSR` mark + one "Sign in" heading and no "Login" heading. [LoginPage.test.tsx]
- [~] [AI-Review][Med] **M2 — AC#4 literal spec (unauthenticated by-email `GET /me/registration-status` lookup) intentionally NOT implemented.** ACCEPTED BY-DESIGN. Verified against the real read-model: `me.routes.ts` returns "the caller's OWN registration" and `MeService` reads `userId`+`email` from the JWT principal — there is no anti-enumeration-safe way to tell an unauthenticated stranger "you're registered", which AC#4's own anti-enumeration clause forbids. The shipped static "Already registered? Sign in" link in `WizardLayout` satisfies the AC's spirit (discoverable way back, leaks nothing). No code change; flagged for conscious ratification. [WizardLayout.tsx; apps/api/src/services/me.service.ts]
- [ ] [AI-Review][Low] **L2 — Two email fields visible when the disclosure is open** (magic-link "Email address" + password-form "Email Address"). Mild redundancy; acceptable for a self-contained password alternative. NOTED, not changed.
- [ ] [AI-Review][Low] **L3 — `SmartCta` now returns a wrapping `<div>`** (was a bare `<Link>`). Desktop `Header` relies on default inline-flex layout; verified no regression in SmartCta/Header tests. NOTED, not changed.

## Dev Notes

- **Logged-in state already solved.** Verified 2026-06-06: `PublicLayout → Header → SmartCta` shows Dashboard→`/dashboard` when authenticated; `DashboardRedirect` routes `public_user` → `/dashboard/public`. Do NOT rebuild that — only add the logged-out Sign-in door. [Source: apps/web/src/layouts/components/SmartCta.tsx; apps/web/src/features/dashboard/components/DashboardRedirect.tsx]
- **Magic-link is the return channel** (ADR-015 + 2026-06-03 amendment). This story makes it the *primary, discoverable* path; the mechanism is done (9-16).
- **Keep the wizard pure** — this story touches entry/sign-in only, never adds an auth step to the capture flow (SCP guardrail).
- HARD deps: Story 9-16 (done — magic-link login), Story 9-38 (read-model for wrong-door recovery). Sibling: Story 9-40 (dashboard) — can run in parallel; shared dep is 9-38.

### References
- SCP: [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-06-public-user-journey-harmonization.md]
- [Source: apps/web/src/layouts/components/SmartCta.tsx, Header.tsx, MobileNav.tsx]
- [Source: apps/web/src/features/auth/pages/LoginPage.tsx]

## Dev Agent Record
### Agent Model Used
Amelia (Developer Agent) — Opus 4.8, 2026-06-18.
### Completion Notes List

- **AC#1/#5 (SmartCta door).** `SmartCta` now renders BOTH "Sign in" → `/login` (secondary style) and "Register" → `/register` (primary) when logged out, and "Dashboard" + a "Signed in as {name}" affordance when logged in. Added a `stacked` prop so the mobile drawer stretches the doors full-width; `MobileNav` now passes `stacked` instead of per-link classes. Logged-in→Dashboard path and the loading skeleton are unchanged (the verified 1.5-8 AC5 behavior). `Header` mocks SmartCta in its test, so it's unaffected.
- **AC#2/#3 (magic-link-primary).** `LoginPage` public mode now leads with the magic-link email field (always visible, primary) and demotes email+password to a collapsed `PasswordSignInDisclosure` ("I already set a password"). Because the password form — and the "Forgot password?" link it carries — lives inside that disclosure, forgot-password is OUT of the default public view (AC#3) while staying reachable for password users and unchanged for staff. The magic-link `MagicLinkSignInEntry` lost its reveal-button (it's primary now); the anti-enumeration generic confirmation is unchanged. **Staff untouched:** `LoginPage type="staff"` renders `LoginForm type="staff"` directly (password + MFA + inline forgot-password); `StaffLoginPage` was not modified.
- **AC#4 (wrong-door recovery).** Two triggers, per the read-model reality:
  1. *Authenticated* wrong-door is already solved — `/register` is wrapped in `<PublicOnlyRoute redirectTo="/dashboard">` (App.tsx), so a logged-in visitor is redirected to the dashboard before `WizardPage` mounts. Verified, not rebuilt.
  2. *Unauthenticated* recovery: added an "Already registered? Sign in" → `/login` link to `WizardLayout`'s top bar (visible on entry + every step). Deliberately a STATIC link, NOT an email lookup against `GET /me/registration-status` — that read-model (`apps/api/src/services/me.service.ts`) is JWT-only and refuses arbitrary identifiers by construction, so there is no anti-enumeration-safe way to actively tell an unauthenticated stranger "you're registered." The passive link gives returning users a discoverable way back without restarting and leaks nothing. (The draft AC#4 framing of an unauthenticated by-email lookup is not achievable against the real read-model; documented here per verify-against-reality.)
- **AC#6 (tests + zero regression).** Affected files green (43); full web suite **242 files / 2695 passed + 2 todo / 0 fail**; `lint` 0 errors/0 warnings; `build` (tsc + vite) clean.

### File List

- `apps/web/src/layouts/components/SmartCta.tsx` (modified) — logged-out Sign in + Register doors; `stacked` prop; signed-in-as affordance.
- `apps/web/src/layouts/components/SmartCta.test.tsx` (modified) — added Sign-in-door + signed-in-as assertions.
- `apps/web/src/layouts/components/MobileNav.tsx` (modified) — pass `stacked` to SmartCta.
- `apps/web/src/features/auth/pages/LoginPage.tsx` (modified) — magic-link-primary public mode + `PasswordSignInDisclosure`; staff branch unchanged.
- `apps/web/src/features/auth/pages/__tests__/LoginPage.test.tsx` (modified) — magic-link-primary ordering; password/forgot/captcha behind disclosure (AC#3); staff-unchanged test.
- `apps/web/src/layouts/WizardLayout.tsx` (modified) — "Already registered? Sign in" wrong-door recovery link.
- `apps/web/src/layouts/WizardLayout.test.tsx` (new) — covers Back-to-Homepage + recovery link.
- `apps/web/src/features/auth/components/LoginForm.tsx` (modified, **review M1**) — added `embedded` prop to suppress the duplicate header + register footer when nested in the password disclosure.

### Note for the paired code-review (Task 4 / review-before-commit)

Working tree is uncommitted and ready for the paired code-review CLI. After it passes, commit on `track/journey-9-39-40-21` (no push) flipping `9-39-...` in `sprint-status.yaml` in the same commit.

### Senior Developer Review (AI) — 2026-06-18

**Outcome: APPROVED (with fixes applied in-pass) → `review` → `done`.**

Adversarial review of the uncommitted tree. Verified against reality: `Header`(desktop)/`MobileNav`(stacked) both route through the updated `SmartCta` so the logged-out "Sign in" door actually appears; staff login genuinely untouched (`StaffLoginPage` + the `type="staff"` branch render `LoginForm` standalone); AC#4's anti-enumeration claim confirmed against `me.service` (JWT-only read-model). File List ⇄ git = 0 discrepancies.

5 findings (0 Critical, 2 Medium, 3 Low). **M1** (duplicate branding in the password disclosure) fixed via a new `LoginForm embedded` prop + **L1** regression test. **M2** (AC#4 literal lookup) accepted by-design — the literal spec is infeasible without leaking, and the shipped static link satisfies the AC's anti-enumeration intent. **L2/L3** noted, no change. See **Review Follow-ups (AI)**.

Post-fix validation: affected suites **170/170**; lint **0/0**; tsc **exit 0**; full web suite green (thread-capped — an unrelated, pre-existing 9-21 `/register` cold-chunk timing flake appears only under uncapped thread oversubscription and passes in isolation). Handed back to DEV to commit on `track/journey-9-39-40-21` (no push); `sprint-status.yaml` 9-39 → done.

## Change Log
| Date | Change | Rationale |
|---|---|---|
| 2026-06-06 | Drafted by Bob (SM) via *create-story --yolo, routed by the Public-User Journey Harmonization SCP. 6 ACs / 4 Tasks. Adds the logged-out "Sign in" door + magic-link-primary public sign-in + wrong-door recovery; logged-in Dashboard behavior already verified-working. | Closes the "no discoverable way back for returning users" gap surfaced in the 9-16 UAT. |
| 2026-06-18 | Senior-Dev code review: M1 (duplicate-branding) fixed via `LoginForm embedded` prop + L1 test; M2 (AC#4) accepted by-design; L2/L3 noted. Status `review` → `done`. | Paired code-review CLI; review-before-commit discipline. |
