# Story 9.21: Route-registration integration test — single test asserts App.tsx routes match navigate-targets

Status: ready-for-dev

<!--
Authored 2026-05-19 by Bob (SM) via canonical *create-story --yolo template.

Promoted from `prep-route-resolution-integration-test` candidate prep-task
to a numbered Story per Awwal's 2026-05-19 directive: "real data drove
this decision, the weight deserves a proper story."

Real-data justification: on 2026-05-13 the operator could not log in to
the production site because App.tsx mounted the MFA challenge route at
`path="mfa-challenge"` (resolving to `/mfa-challenge`) while
useLogin.ts:121 navigated to `/auth/mfa-challenge`. All 9-13 page-level
component tests passed because MfaChallengePage.test.tsx mounted its own
router inline at `/auth/mfa-challenge`, decoupled from App.tsx's real
mount path. Bug only surfaced in production. Fixed in commit c28e8cb.
Full incident: Story 9-12 § "Post-Launch UAT Session Log" § F3 + § L5.

This story closes the testing-discipline gap so the same class of bug
cannot ship again.
-->

## Story

As the **dev agent or code reviewer working on any feature that adds or moves a route**,
I want **a single integration test that imports App.tsx's real router config and asserts every documented navigation target (`navigate('/x')` and `<Link to='/x'>`) resolves to a real component**,
So that **the class of bug that took down operator MFA login on 2026-05-13 cannot ship again — App.tsx route registration mismatches against navigate-targets fail loudly at CI time, not silently in production**.

## Acceptance Criteria

1. **AC#1 — New integration test file**: `apps/web/src/__tests__/route-resolution.integration.test.tsx`. Imports the real `App.tsx`'s router tree, mounts the application in MemoryRouter with an initial entry, and asserts the target component renders.

2. **AC#2 — Coverage list — every internal-navigation target**: the test enumerates a "known routes" array containing every path used in any `navigate(...)` call or `<Link to=...>` JSX across `apps/web/src/**/*.tsx`. Initial list (extracted via grep — dev agent verifies completeness):
   - `/` (home)
   - `/login`
   - `/staff/login`
   - `/auth/mfa-challenge`
   - `/auth/magic` and `/auth/magic/:token`
   - `/register` and `/register/complete` and `/register/complete-nin`
   - `/forgot-password`, `/reset-password/:token`
   - `/dashboard` (auth-gated; assert redirect or component, not 404)
   - `/dashboard/super-admin`, `/dashboard/super-admin/questionnaires`, `/dashboard/super-admin/operations` (when 9-19 Part B ships)
   - `/dashboard/supervisor`, `/dashboard/supervisor/team`, `/dashboard/supervisor/fraud`, `/dashboard/supervisor/messages`
   - Public pages: `/about`, `/about/initiative`, `/about/leadership`, `/about/partners`, `/about/privacy`, `/support`, `/support/faq`, `/support/contact`, `/insights`, `/marketplace`, `/participate/workers`, `/participate/employers`
   - Legal: `/legal/terms`, `/legal/privacy`
   - 404 fallback: `/some-nonexistent-path` MUST resolve to the NotFound component, not crash

3. **AC#3 — Assertion shape — each entry verifies the route resolved**: for each known route, the test does:
   ```ts
   const { unmount } = renderApp({ initialEntry: route });
   // Assert NOT the 404 fallback
   expect(screen.queryByText(/page not found/i)).not.toBeInTheDocument();
   // Assert SOME visible content rendered (loose check — the route resolved to a real component)
   expect(document.body.textContent?.length ?? 0).toBeGreaterThan(50);
   unmount();
   ```
   The 404-fallback test does the opposite assertion (expects "page not found").

4. **AC#4 — `navigate()` target grep audit at CI time**: the test ALSO greps the codebase at run-time (via `import.meta.glob` OR a build-time script) for `navigate('/...')` patterns and asserts every grepped target is IN the "known routes" array. Catches drift when a future commit adds a `navigate('/new-path')` without updating the test.

5. **AC#5 — Test runs in CI under the existing vitest config**: no new test-runner; reuses the web app's existing vitest config; tagged `[integration]` in the test describe block so it can be selectively run via `pnpm vitest run --test-name-pattern='\\[integration\\]'`.

6. **AC#6 — Negative test — fails loudly when App.tsx mounts at wrong path**: as part of authoring, deliberately introduce the c28e8cb bug (change `path="auth/mfa-challenge"` back to `path="mfa-challenge"` in a local branch) and verify the test FAILS with a clear error message naming the offending path. Then revert. Document the negative test in the story's File List as "verification: bug-reintroduction test confirmed test catches the regression".

7. **AC#7 — Zero regression**: existing 41 component-level page tests continue to pass. The new integration test is additive; it does not replace per-page tests, it complements them.

## Tasks / Subtasks

- [ ] **Task 1 — Extract route inventory** (AC: #2)
  - [ ] 1.1: grep `apps/web/src/**/*.tsx` for `navigate(['"]/[^'"]+['"]\\)`
  - [ ] 1.2: grep for `<Link\\s+to=['"]/[^'"]+['"]`
  - [ ] 1.3: Consolidate into `KNOWN_ROUTES` array; commit as a separate file `apps/web/src/__tests__/known-routes.ts` for future maintenance
- [ ] **Task 2 — Author the integration test** (AC: #1, #3, #5)
  - [ ] 2.1: Author `apps/web/src/__tests__/route-resolution.integration.test.tsx`
  - [ ] 2.2: Import App.tsx and the QueryClient + Toaster + AuthContext providers
  - [ ] 2.3: Helper `renderApp({ initialEntry })` wraps the real App tree in MemoryRouter
  - [ ] 2.4: `it.each(KNOWN_ROUTES)` runs the assertion shape from AC#3 for each route
- [ ] **Task 3 — Add the grep audit** (AC: #4)
  - [ ] 3.1: Use `import.meta.glob` to load all `.tsx` files as raw strings
  - [ ] 3.2: Regex-match `navigate(['"]/[^'"]+['"]\\)` patterns
  - [ ] 3.3: Assert every match is in `KNOWN_ROUTES`
- [ ] **Task 4 — Negative test verification** (AC: #6)
  - [ ] 4.1: Local branch — re-introduce the c28e8cb bug
  - [ ] 4.2: Confirm test fails with clear error
  - [ ] 4.3: Revert + commit
- [ ] **Task 5 — Tests pass + lint + tsc clean** (AC: #7)
- [ ] **Task 6 — Pre-merge BMAD code review on uncommitted tree** (per `feedback_review_before_commit.md`)

## Dev Notes

### Why this matters now (real-data justification)

The 2026-05-13 incident cost the operator ~30 min of triage during launch week. The bug existed for 11 hours in production. If a real user had hit it instead of the operator, they would have seen "Login Failed" → tried again → tried a third time → given up. **First impression: site doesn't work.**

For a public-survey project where first impressions drive registration rates, route-registration bugs are operationally fatal. This test costs ~30 lines of code and prevents the class of failure.

### Pattern source

Captured in `feedback_route_registration_test_discipline.md` memory entry (saved 2026-05-13). This story operationalizes the memory's recommendation as code.

### Dependencies

- **Story 9-13** — surfaced the bug. Story 9-13 stays in `review` until this story's test guarantees the bug class can't ship.
- **Story 9-19** — adds `/dashboard/super-admin/operations` to the route tree. AC#2's KNOWN_ROUTES list must include it once 9-19 Part B lands.
- No backend dependencies.

### Risks

1. **Auth-gated routes** — `/dashboard/*` resolves to a redirect-to-login when no auth context. The test's "not 404" assertion still holds (redirect is a different render path than 404). But a route that 404s INSIDE an authenticated section (e.g., `/dashboard/super-admin/operations` mounted wrong) might pass the "not 404" check because the unauthenticated user sees the login redirect first. Mitigation: optionally test BOTH unauthenticated (current default) AND authenticated (with a mock AuthContext) for dashboard routes. Defer to dev judgment at impl time.
2. **Parameterized routes** — `/reset-password/:token` cannot be tested with the literal `:token`; the test enters a placeholder value like `/reset-password/test-token-value` and asserts the page renders. Document in `KNOWN_ROUTES` as `route: '/reset-password/:token', testPath: '/reset-password/test-token-value'`.
3. **Service worker interference** — vitest doesn't run service workers; safe.

### Effort estimate

~half-day. Mostly mechanical: grep, list, test, verify.

## File List

(Populated by dev agent. Expected:)
- `apps/web/src/__tests__/known-routes.ts` (new)
- `apps/web/src/__tests__/route-resolution.integration.test.tsx` (new)
