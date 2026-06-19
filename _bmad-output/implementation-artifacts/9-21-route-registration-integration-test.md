# Story 9.21: Route-registration integration test — single test asserts App.tsx routes match navigate-targets

Status: done

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

- [x] **Task 1 — Extract route inventory** (AC: #2)
  - [x] 1.1: grep `apps/web/src/**/*.tsx` for `navigate(['"]/[^'"]+['"]\\)`
  - [x] 1.2: grep for `<Link\\s+to=['"]/[^'"]+['"]`
  - [x] 1.3: Consolidate into `KNOWN_ROUTES` array; commit as a separate file `apps/web/src/__tests__/known-routes.ts` for future maintenance
- [x] **Task 2 — Author the integration test** (AC: #1, #3, #5)
  - [x] 2.1: Author `apps/web/src/__tests__/route-resolution.integration.test.tsx`
  - [x] 2.2: Import App.tsx and the QueryClient + Toaster + AuthContext providers
  - [x] 2.3: Helper `renderApp({ initialEntry })` wraps the real App tree in MemoryRouter
  - [x] 2.4: `it.each(KNOWN_ROUTES)` runs the assertion shape from AC#3 for each route
- [x] **Task 3 — Add the grep audit** (AC: #4)
  - [x] 3.1: Use `import.meta.glob` to load all `.tsx` files as raw strings
  - [x] 3.2: Regex-match `navigate(['"]/[^'"]+['"]\\)` patterns
  - [x] 3.3: Assert every match is in `KNOWN_ROUTES`
- [x] **Task 4 — Negative test verification** (AC: #6)
  - [x] 4.1: Local branch — re-introduce the c28e8cb bug
  - [x] 4.2: Confirm test fails with clear error
  - [x] 4.3: Revert + commit
- [x] **Task 5 — Tests pass + lint + tsc clean** (AC: #7)
- [x] **Task 6 — Pre-merge BMAD code review on uncommitted tree** (per `feedback_review_before_commit.md`) — DONE 2026-06-18 via paired code-review CLI; findings below, all fixed in-pass.

### Review Follow-ups (AI)

Adversarial code review 2026-06-18 (paired code-review CLI, Senior-Dev workflow). 5 findings; all fixed in-pass and re-validated (55/55 file · 2693 web suite · lint 0 · tsc 0). L3 was investigated and retracted (not an issue).

- [x] [AI-Review][Med] **M1 — Test router didn't mirror production's `future` flags.** `App.tsx` mounts `<BrowserRouter future={{ v7_startTransition, v7_relativeSplatPath }}>` but the test's `MemoryRouter` passed none (emitted both v7 warnings). Fix: opt into `v7_relativeSplatPath` (the flag that affects which route *resolves* under splat routes — the test's purpose); deliberately omit `v7_startTransition` (governs update batching only, not resolution, and wrapping lazy loads in startTransition made jsdom Suspense timing nondeterministic). Documented inline. [route-resolution.integration.test.tsx — `ROUTER_FUTURE` + `renderApp`]
- [x] [AI-Review][Med] **M2 — Drift audit (AC#4) only scanned `navigate('/..')`, not `<Link to>`/`<Navigate to>`/`redirectTo`.** AC#2 requires KNOWN_ROUTES to cover Link targets too, but nothing enforced it. Concrete miss: `redirectTo="/admin"` (App.tsx:573) is a reachable target absent from KNOWN_ROUTES. Fix: extended the audit to scan `to="/.."` and `redirectTo="/.."` (string literals only), added `/admin` to KNOWN_ROUTES; audit still green. [route-resolution.integration.test.tsx — drift guard; known-routes.ts]
- [x] [AI-Review][Med] **M3 — Timing fragility: `waitFor` used the default 1000ms timeout.** The heaviest lazy page (WizardPage at `/register`) needs >1s to resolve its chunk when cold; the case passed in the full suite only as a side effect of sibling tests warming shared modules, and failed deterministically in isolation. Fix: explicit `{ timeout: 5000 }` (inside the 10s testTimeout). [route-resolution.integration.test.tsx]
- [x] [AI-Review][Low] **L1 — Parameterized/template-literal navigation targets are unguarded.** `navigate(`/.../${id}`)` and `to={dynamicPath}` (e.g. respondent-detail routes) are excluded from both KNOWN_ROUTES and the audit. Intentional, but was silent. Fix: documented the gap explicitly in known-routes.ts so it's a known limitation, not a surprise. [known-routes.ts]
- [x] [AI-Review][Low] **L2 — Test omits production's `<ErrorBoundary>` + `<ViewAsProvider>` wrappers.** Acceptable (we *want* crashing pages to fail loudly; ViewAsProvider is supplied by its own subtree). Fix: documented as a deliberate choice in `renderApp`. [route-resolution.integration.test.tsx]
- [x] [AI-Review][Low] **L3 — RETRACTED (not an issue).** Initially flagged `expect.extend(matchers)` as redundant. Verified the inherited `setupFiles` (repo-root `test/setup.ts`) does NOT import `@testing-library/jest-dom`, so the local matcher extension is REQUIRED. Left as-is. The `@vitest-environment jsdom` pragma is redundant-but-harmless (config forces jsdom) and kept as explicit documentation.

### Post-review follow-up — `/register` flake root-caused & fixed (2026-06-19, commit `bb0ad95`)

**Supersedes the M3 conclusion above.** M3 assumed the `/register` (WizardPage) flake was *cold-chunk import time* and added a 5s `waitFor`. That was insufficient: the **uncapped full web suite still failed 6 cases at exactly 5023ms** (`/register`, `/register/complete`, `/register/supplemental`). Investigation (incl. an attempted lazy-chunk warm in `beforeAll`, which did NOT help and was reverted) proved the real root cause is **CPU/RAM oversubscription** — a plain local `pnpm vitest run` spawns ~1 worker/core and starves heavy jsdom renders past the timeout. Same suite **capped at 2 workers = green** (`/register` 895ms).

**Fix (commit `bb0ad95`, file `vitest.base.ts`):** default the worker-pool cap OFF-CI — `maxWorkers = VITEST_MAX_THREADS ?? (process.env.CI ? undefined : 2)`. A plain local run now self-caps (mirrors the pre-push gate's proven `VITEST_MAX_THREADS=2`); CI stays full-parallel (gated on `process.env.CI`); `VITEST_MAX_THREADS=4 pnpm test` overrides for speed. **Proof:** off-CI default full web suite = **242 files / 2678 passed / 0 failures**, `/register` 895ms. The 5s `waitFor` (M3) is retained as headroom for cold isolation runs. Memory: `feedback_local_full_suite_flakiness` / Pitfall #37. **Residual:** CI runs this test uncapped (clean 1:1 runner, expected-fine); lever if it ever bites = cap CI or raise the timeout.

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

- `apps/web/src/App.tsx` (modified) — extracted the `<Routes>` tree into an exported `AppRoutes()` component (App() still wraps it in BrowserRouter + AuthProvider for production). This is the seam the test mounts; the 60+ lazy page defs stay in-module as the single source of truth.
- `apps/web/src/__tests__/known-routes.ts` (new) — `KNOWN_ROUTES` inventory + `resolveTestPath` helper. Built from a live grep of static `navigate('/..')`, `to="/.."`, and `redirectTo="/.."` targets, reconciled against App.tsx. Notably does NOT contain `/legal/terms` or `/legal/privacy` (the draft AC#2 list named them; the real routes are `/terms` and `/about/privacy`). _Review: added `/admin` (redirectTo target — M2); documented the parameterized-route coverage gap (L1)._
- `apps/web/src/__tests__/route-resolution.integration.test.tsx` (new) — mounts the real `AppRoutes` in a MemoryRouter + mock AuthContext for every KNOWN_ROUTE and asserts non-404 (AC#1/#3); 404-fallback negative case; and the `import.meta.glob` drift-audit (AC#4). _Review: `MemoryRouter` now opts into `v7_relativeSplatPath` to mirror prod resolution (M1); drift audit extended to `to=`/`redirectTo=` (M2); `waitFor` given an explicit 5s timeout to remove cold-chunk fragility (M3); provider-omission documented (L2)._

## Dev Agent Record

### Implementation summary (2026-06-17, Amelia)

- **Root design choice (AC#1):** `App.tsx` hardcodes `<BrowserRouter>`, so there was no injectable router. Rather than re-declare routes inline (the exact anti-pattern that hid the 2026-05-13 bug — see `rbac-routes.test.tsx`), I extracted the live `<Routes>` tree into an exported `AppRoutes()`. The test mounts the *same* tree App() renders, inside a `MemoryRouter` + a controllable `AuthContext` (mirrors the live context value, kept in sync with `rbac-routes.test.tsx`).
- **Route inventory (AC#2) — verify-against-reality:** the draft AC#2 list was treated as a hint, not truth. A live grep of static `navigate('/..')` + `to="/.."` targets, reconciled against the real route tree, drove `KNOWN_ROUTES`. Corrections vs the draft: `/legal/terms` + `/legal/privacy` do not exist (real routes are `/terms`, `/about/privacy`); `/auth/magic/:token` is not a route (`/auth/magic` reads the token from the query string). Dashboard routes are mounted with an authenticated user of the matching role so the nested component actually renders (rather than redirecting to "/"), which exercises the registration of e.g. `/dashboard/super-admin/operations`.
- **Drift audit (AC#4):** `import.meta.glob('../**/*.tsx', { query: '?raw' })` scans every component source; static `navigate('/..')` targets are checked against `KNOWN_ROUTES`. Pathname-only comparison (query string / hash stripped) — this surfaced `navigate('/register/complete?source=pending_nin')`, correctly mapped to route `/register/complete`.
- **Negative test (AC#6):** reintroduced the c28e8cb bug locally (`path="auth/mfa-challenge"` → `path="mfa-challenge"`). The suite failed with exactly one failure naming `resolves '/auth/mfa-challenge' to a real component (not the 404 fallback)` → "Page not found". Reverted; net App.tsx diff is the extraction only.

### Validation (AC#7)

- New suite: **54 passed** (49 KNOWN_ROUTES resolutions + 1 404-fallback + 1 drift-audit, plus parameterized variants).
- Full web suite regression: **241 files, 2692 passed + 2 todo, 0 failures**.
- `pnpm --filter @oslsr/web lint`: **0 errors, 0 warnings**.
- `pnpm --filter @oslsr/web build` (tsc + vite build): **clean** (pre-existing chunk-size advisory only).

### Note for the paired code-review (Task 6 / review-before-commit)

Working tree is uncommitted and ready for the paired code-review CLI. Once review passes, commit on `track/journey-9-39-40-21` (no push) flipping `9-21-...` to its post-review status in `sprint-status.yaml` in the same commit.

### Senior Developer Review (AI) — 2026-06-18

**Outcome: APPROVED (with fixes applied in-pass) → `review` → `done`.**

Adversarial review of the uncommitted working tree (App.tsx extraction + the two new test files). All claims independently re-validated against reality: both 404 components (`PublicNotFoundPage`, dashboard `NotFoundPage`) confirmed to render "Page not found"; skeletons confirmed text-free (so the `>50` heuristic legitimately waits past the Suspense fallback); `AuthContext` export + the mock's superset shape confirmed; File List ⇄ git reality = 0 discrepancies. Negative test (AC#6) accepted on verified mechanism. Static `<Link to>`/`<Navigate to>`/`redirectTo` targets grepped and reconciled against KNOWN_ROUTES.

5 findings (0 Critical, 3 Medium, 2 Low) — all resolved (L3 retracted as not-an-issue). See **Review Follow-ups (AI)** above. Post-fix validation: integration file **55/55**; full web suite **241 files / 2693 passed + 2 todo / 0 failures**; lint **0/0**; tsc **exit 0**.

Handed back to DEV to commit on `track/journey-9-39-40-21` (no push); `sprint-status.yaml` 9-21 line flipped `ready-for-dev → done`.

## Change Log

| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2026-06-17 | 1.0 | Story implemented (App.tsx route-tree extraction + KNOWN_ROUTES inventory + route-resolution integration test + drift audit). | Amelia (Dev) |
| 2026-06-18 | 1.1 | Senior-Dev code review: 3 Medium + 2 Low findings fixed in-pass (router future-flag fidelity, drift audit extended to Link/redirectTo + `/admin`, waitFor timeout fragility, doc gaps). Status `review` → `done`. | Code-review CLI (AI) |
