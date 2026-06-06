# Story 9.39: Public Entry IA — discoverable "Sign in" door + magic-link-primary sign-in

Status: ready-for-dev

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

- [ ] **Task 1 — SmartCta / header logged-out door (AC: #1, #5, #6)**
  - [ ] 1.1 Extend `SmartCta` (or the header) so logged-out renders Sign in + Register; logged-in unchanged.
  - [ ] 1.2 Optional "signed in as" indicator (AC#5).
  - [ ] 1.3 Update SmartCta + Header + MobileNav tests.
- [ ] **Task 2 — Public sign-in page magic-link-primary (AC: #2, #3, #6)**
  - [ ] 2.1 Reorder `LoginPage` public mode: magic-link primary; password → secondary disclosure; forgot-password out of default view.
  - [ ] 2.2 Confirm `StaffLoginPage` untouched.
  - [ ] 2.3 Update LoginPage tests.
- [ ] **Task 3 — Wrong-door recovery (AC: #4)** _(depends on 9-38 read-model)_
  - [ ] 3.1 Wizard-entry check via session / `GET /me/registration-status`; route already-registered → dashboard / sign-in.
  - [ ] 3.2 Tests incl. anti-enumeration.
- [ ] **Task 4 — Regression + code review (AC: #6)**
  - [ ] 4.1 Web tsc + lint + full vitest green.
  - [ ] 4.2 `/bmad:bmm:workflows:code-review` on the uncommitted tree.

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
_(unset — Bob/SM authored; dev fills on pickup)_
### Completion Notes List
### File List

## Change Log
| Date | Change | Rationale |
|---|---|---|
| 2026-06-06 | Drafted by Bob (SM) via *create-story --yolo, routed by the Public-User Journey Harmonization SCP. 6 ACs / 4 Tasks. Adds the logged-out "Sign in" door + magic-link-primary public sign-in + wrong-door recovery; logged-in Dashboard behavior already verified-working. | Closes the "no discoverable way back for returning users" gap surfaced in the 9-16 UAT. |
