# Story 13-36: Make the E2E Tests workflow reliably green (messaging determinism + non-deterministic-wait sweep)

Status: ready-for-dev

<!-- Authored 2026-07-18 by Bob (SM). TEST-HYGIENE, NOT launch-gating (the E2E Tests workflow is separate from CI/CD Pipeline and does NOT gate deploy). The separate full-Playwright "E2E Tests" workflow (e2e.yml) intermittently reds on `messaging.spec.ts:49 › send a broadcast message and open the composer` — a socket.io/data-timing flake — which trains operators to reflexively re-run red CI (dangerous: it can mask a real failure, exactly what almost happened when a 13-32 turbo-2.x env regression hid *under* this flake). The regression itself (webServer `DATABASE_URL` unset) was fixed in the 13-32 adjudication (turbo.json test:e2e env); this story kills the flake beneath it so the workflow can be trusted green. -->

## Story
As **a developer who reads the E2E Tests result as a real signal**,
I want **the messaging broadcast-composer test (and its siblings) to wait deterministically for the data they depend on**,
so that **the E2E Tests workflow is reliably green — a red means a real regression, not "re-run and hope."**

## Context & Evidence
- **The flaky test:** `apps/web/e2e/messaging.spec.ts:49 › send a broadcast message and open the composer`. It navigates to `/messages`, then `page.getByRole('button', { name: /send broadcast/i }).click()` — which intermittently **times out at 15s** (`TimeoutError: locator.click … waiting for getByRole('button', { name: /send broadcast/i })`). Seen red on the 13-28 push, green on re-run; masked since by the 13-32 webServer regression (E2E didn't boot at all).
- **Root cause (not "button missing"):** the button renders unconditionally *given its props* — `MessageInbox.tsx:37` gates it on `showBroadcastButton && onBroadcast`. Those props are supplied by the parent Messages page, which resolves them from role/team/threads data (a query + socket.io connection). Under CI load that resolution can lag past the 15s action timeout, so the button isn't actionable in time. It's a **missing deterministic wait on the data the button depends on**, not a product bug.
- **Prior partial mitigation (2026-05-09):** the test was already scoped to compose-pane-only and the "verify it appears in inbox" assertion was skipped (the send→inbox WebSocket round-trip was flaky) — but the *button-click* step still races the initial data load.
- **Adjacent risk:** the earlier E2E log showed `auth.setup.ts` projects rendering as skipped in one run — worth a quick sweep for other socket.io/data-dependent steps that lack explicit waits.
- **Non-deploy-gating:** CI/CD Pipeline (with its own smaller `smoke-e2e`) gates deploy and is green; this full-Playwright workflow is a broader, currently-untrustworthy signal.

## Acceptance Criteria
1. **AC1 — Deterministic messaging test.** The broadcast-composer test waits for the data the button depends on before interacting — e.g. `await page.waitForResponse` on the threads/team-roster fetch, or an explicit `await expect(broadcastButton).toBeVisible()` / `.toBeEnabled()` tied to a data-ready signal — rather than relying on the 15s action-timeout to paper over the load race. No arbitrary `waitForTimeout`. The test passes reliably (burn-in, not a single green).
2. **AC2 — Root fix vs test-only, stated.** Decide + document whether the durable fix is (a) test-side (wait for the roster/threads response) or (b) product-side (the Messages page should render the broadcast affordance for a supervisor without blocking on threads/socket). Prefer (a) unless the page genuinely withholds the button behind avoidable data-gating — in which case fix the page and keep the test honest.
3. **AC3 — Sweep sibling e2e non-determinism.** Grep the Playwright suite for interactions that depend on socket.io / async data without an explicit wait (messaging thread render, new-conversation roster, auth.setup projects, supervisor dashboard live panels); fix any with the same race or confirm none. (This is a class, like the 13-30 teardown sweep.)
4. **AC4 — Workflow reliably green + trustworthy.** The E2E Tests workflow (`e2e.yml`) passes across repeated runs (burn-in / a couple of consecutive green runs on `main`). Consider whether the full-Playwright workflow should be a *required* check or explicitly *informational* — document the decision so a red is unambiguous.
5. **AC5 — No product regression.** Any product-side change (AC2b) keeps the messaging feature intact; web suite + the e2e suite green; tsc/eslint clean.

## Tasks / Subtasks
- [ ] **Task 1 (AC1/AC2)** — Trace the Messages page's data dependencies for the broadcast button; add the deterministic wait (test-side) or de-gate the button (product-side); justify which.
- [ ] **Task 2 (AC3)** — Sweep + fix sibling socket.io/data-dependent e2e steps lacking explicit waits.
- [ ] **Task 3 (AC4)** — Burn-in `e2e.yml`; decide required-vs-informational; document.
- [ ] **Task 4 (AC5)** — Web + e2e suites, tsc, eslint green.

## Dev Notes
- **Turbo env regression already fixed (13-32 adjudication):** `turbo.json` `test:e2e.env` now carries `DATABASE_URL`/`REDIS_URL`/`JWT_SECRET`/`REFRESH_TOKEN_SECRET`/`PUBLIC_APP_URL`/`VITE_E2E`/`E2E` (turbo 2.x strict env mode had filtered them → webServer boot failure). So the webServer now starts; this story is only the messaging/data-timing flake *underneath* that.
- **Prefer a data-ready wait over a bigger timeout.** Bumping the action timeout hides the race; `waitForResponse('**/messages/threads')` (or the roster endpoint) makes the intent explicit and the test fast when the data is ready.
- **Don't re-enable the skipped inbox-round-trip test blindly** (`messaging.spec.ts` `test.skip('open a thread and verify messages render')`) — that one needs the real-time propagation handled; out of scope unless AC3 naturally covers it.
- **Class, not one-off:** the fire-and-forget/socket.io async patterns recur; AC3 sweeps siblings so the next flake doesn't surface under a different test name (mirrors 13-30's teardown-class sweep).
- Test-hygiene only; no launch dependency. Value = a trustworthy E2E signal so "red CI → re-run" stops being reflexive.

### References
- [Source: apps/web/e2e/messaging.spec.ts:49 (the flaky broadcast-composer test) + its 2026-05-09 mitigation comments]
- [Source: apps/web/src/features/dashboard/components/MessageInbox.tsx:37-45 (broadcast button gated on showBroadcastButton && onBroadcast props)]
- [Source: .github/workflows/e2e.yml (the separate, non-deploy-gating full-Playwright workflow); turbo.json test:e2e.env (13-32 regression fix)]
- [Source: 13-30 (teardown-class sweep precedent); 13-32 adjudication Change Log (the turbo-env regression that masked this)]

## Dev Agent Record
_(to be completed by the dev)_

### File List
_(to be completed by the dev)_

## PM Validation (to be completed)

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-18 | Story drafted via *create-story. EMERGENT from the 13-32 push: the separate E2E Tests workflow reds intermittently on the messaging broadcast-composer test (socket.io/data-timing race — button click times out before the parent's role/team/threads data resolves). The 13-32 turbo-2.x webServer env regression that masked it is already fixed; this story makes the flake deterministic + sweeps sibling non-deterministic waits so the E2E workflow is a trustworthy green. TEST-HYGIENE, not launch-gating. | Bob (SM) |
