# Story 13-36: Make the E2E Tests workflow reliably green (messaging determinism + non-deterministic-wait sweep)

Status: done

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
- [x] **Task 1 (AC1/AC2)** — Trace the Messages page's data dependencies for the broadcast button; add the deterministic wait (test-side) or de-gate the button (product-side); justify which.
- [x] **Task 2 (AC3)** — Sweep + fix sibling socket.io/data-dependent e2e steps lacking explicit waits.
- [x] **Task 3a (AC4)** — Decide required-vs-informational; document in `e2e.yml`. **Done.**
- [x] **Task 3b (AC4)** — Burn-in **the workflow itself**. **DONE 2026-07-27 in adjudication, on CI.**
  Push run [30232138393] green (57 tests → 34 passed / 23 skipped, 1.2m), then dispatched
  `repeat_each: 3` → run [30232550112] **green**. The passthrough is PROVEN to have fired, not merely
  assumed from a green: the log carries `> playwright test "--repeat-each=3"` and the count went
  57 → **155** (100 passed / 55 skipped). 155 rather than 171 because Playwright runs setup-project
  tests once regardless of the repeat count, and there are exactly 8 (`auth.setup.ts` 7 skipped +
  `wizard-resume.setup.ts` 1 passing): 3×(34−1)+1 = 100 and 3×(23−7)+7 = 55. So the repeat applied to
  all 49 real spec tests. Test phase 2.8m vs 1.2m baseline, ~4m wall inside the 25m budget — the
  review's max of 7 is comfortable (~9-10m projected).
- [x] **Task 4 (AC5)** — Web + e2e suites, tsc, eslint green.
- [x] **Task 5 (AC4 follow-up, added 2026-07-26 at Awwal's request)** — Make the E2E suite reproducible
  locally: root-fix the dev-seed drift that made every admin-dependent test fail on a dev machine while
  CI stayed green (`db:seed:dev` re-converges drifted `@dev.local` accounts) + fail-fast diagnosis in
  the login helper. Full local suite now green.
- [x] **Task 6 (added 2026-07-26 at Awwal's request — "fix it all")** — Close the rest of the
  never-fires class: single-source-of-truth seed contract, a sweep of the whole seed orchestrator
  (with a reasoned "do NOT converge these" verdict for the prod-path seeds), and the two `test.skip()`s
  that turned out to be parked on wrong diagnoses (both revived → 34 passed / 23 skipped). Remaining
  ~0.8% environment condition left unfixed but made self-diagnosing.

### Review Follow-ups (AI) — adversarial code review 2026-07-27

Findings from the `code-review` workflow, ordered CRITICAL → LOW. All except AI-2 were fixed in the
same pass; each line records its outcome. The through-line: **H1/H3/M4 are the story's own defect class
(a fix that never fires / a wait with no escape) committed inside the fix itself** — they survived the
AC4 burn-in because they only fire on the unhappy path, which a green burn-in never exercises.

- [x] [AI-Review][High] **AI-1 — `openTeamRoster()` had no error-branch escape.** It waited for roster
  rows OR `/No team members/`, but `TeamRosterPicker.tsx:85-90` has a third settled branch (`isError` →
  "Failed to load team members"). A roster fetch failure matched neither anchor, so the helper burned the
  full 20s and died with a bare `toBeVisible` timeout — exactly the anonymous-timeout mode
  `expectInboxReady` was written to eliminate, in the same file, in the same story.
  [apps/web/e2e/helpers/messages.ts:155] → **FIXED** (error branch is now an anchor + a named throw).
- [x] [AI-Review][High] **AI-2 — Task 3 claimed a burn-in of `e2e.yml` that never ran.** The burn-in was
  `messaging.spec.ts --repeat-each=5` **locally**; the `workflow_dispatch` + turbo `--repeat-each`
  passthrough added to `e2e.yml` has never executed in CI even once. An unexecuted CI change is
  `pattern-ship-a-fix-that-never-fires` (precedent: the 13-32 turbo strict-env regression, which also
  looked right locally). [.github/workflows/e2e.yml:152] → **CLOSED 2026-07-27 in adjudication.** Task 3b
  above has the CI evidence: dispatched run [30232550112] green with `> playwright test "--repeat-each=3"`
  in the log and the count 57 → 155. The change is no longer un-executed.
- [x] [AI-Review][High] **AI-3 — the anti-misdiagnosis diagnostic misdiagnosed.** `expectInboxReady(page)`
  at the post-reload call site passed no traffic array, so on timeout it reported
  "(none — no response and no request failure was observed)" and volunteered the browser-offline
  hypothesis from §6d. No listener was ever attached on that path, so "none observed" was guaranteed
  regardless of reality — sending the next engineer to check their Wi-Fi.
  [apps/web/e2e/messaging.spec.ts:118] → **FIXED** (`reloadMessages()` attaches a real observer; the
  no-observer case now says so and withholds the offline hypothesis).
- [x] [AI-Review][Med] **AI-4 — comment contradicted the shipped helper**: "openTeamRoster() … waits for
  /supervisor/team-metrics". §6d deliberately threw `waitForResponse` away.
  [apps/web/e2e/messaging.spec.ts:137] → **FIXED**.
- [x] [AI-Review][Med] **AI-5 — File List omitted `docs/infrastructure-cicd-playbook.md`** (+21 lines,
  Pitfall #39a — unmistakably 13-36 content), while the story carefully names the two files belonging to
  another session. An adjudicator following that instruction would have committed it unlisted.
  → **FIXED** (added to the File List).
- [x] [AI-Review][Med] **AI-6 — floating promise in the regression test.** `const navigation =
  gotoMessages(page)` is only awaited later; if either assertion before the release fails, `navigation`
  rejects unhandled at teardown ("Target page … closed") and Playwright attributes a phantom second error
  to this or the next test. [apps/web/e2e/messaging.spec.ts:264] → **FIXED**.
- [x] [AI-Review][Med] **AI-7 — new pitfall numbered `#39a` when `#42` already exists**
  (playbook footer lines 1594-1598 carry #39/#40/#41/#42). The section is last in the file yet numbered as
  an insertion after #39; memory and stories reference these by number.
  [docs/infrastructure-cicd-playbook.md:1556] → **FIXED, then CORRECTED to #44 in adjudication (AJ-1):
  #43 was ALSO already taken.** The review scanned footer lines 1594-1598 and stopped one entry short of
  the 2026-07-20 `#43` at line 1611.
- [x] [AI-Review][Med] **AI-8 — a newly-destructive path guarded only by an env-NAME check.**
  `seedDevelopmentUsers` now resets `passwordHash` to a known literal, strips MFA and DELETEs
  `user_backup_codes`, guarded solely by `NODE_ENV === 'production'` — while Pitfall #29, in the file this
  story just edited, states that destructive seed paths need an explicit gate because "a non-prod DB is
  not the same as an empty-or-disposable DB". `db:seed:dev` sets no `NODE_ENV`, so the guard's value rests
  entirely on an ambient root `.env` that Pitfall #42 already caught pointing at the wrong DB.
  [apps/api/src/db/seeds/index.ts:222] → **FIXED** (added a DB-name gate with an explicit override, in the
  `db-guard.ts` idiom; all three CI callers use `test_db` and are unaffected).
- [x] [AI-Review][Med] **AI-9 — seed integration tests were order-coupled.** Test 2 read the row test 1
  created (`before!.id`); test 3 flipped `isSeeded` and restored it inline. A reorder or a failure in
  test 1 cascaded into `before!` throwing on undefined. `beforeAll` also inserted a `super_admin` role
  that `afterAll` never removed. [apps/api/src/db/seeds/__tests__/seed-orchestrator.test.ts:159]
  → **FIXED** (each test establishes its own precondition; the role is removed only if this file created it).
- [x] [AI-Review][Low] **AI-10 — dead branch in `driftFromContract`**: no contract value is ever a `Date`
  (all date fields are `null`), so `have instanceof Date && want instanceof Date` is unreachable.
  [apps/api/src/db/seeds/index.ts:150] → **FIXED**.
- [x] [AI-Review][Low] **AI-11 — "9 spec files" is wrong**: the suite is 7 `.spec.ts` + 2 `.setup.ts`, and
  the AC3 table covers 8 of the 9 (`wizard-resume.setup.ts` unmentioned — it is Node-only, so genuinely no
  determinism surface, but "whole suite" has to say so). → **FIXED** (count corrected + the 9th row added).
- [x] [AI-Review][Low] **AI-12 — `getByText(/No team members/)` was unscoped**;
  `SupervisorProductivityPage.tsx:270` renders the same string. Harmless today (different route), a
  false-green waiting to happen. [apps/web/e2e/helpers/messages.ts:168] → **FIXED** (scoped to the roster).
- [x] [AI-Review][Low] **AI-13 — 32 spurious `ERROR: Role not found` lines** across the 4 seed tests (the
  deliberately-minimal `roleMap` skips 8 of the 9 dev users). `logger.error` is correct for real usage — a
  missing role IS a broken seed — so this is documented rather than silenced, so nobody chases it.
  → **FIXED (documented)**.
- [x] [AI-Review][Low] **AI-14 — `releaseInbox?.()`** implies a nullable path a synchronous Promise
  executor cannot produce. [apps/web/e2e/messaging.spec.ts:270] → **FIXED**.
- [x] [AI-Review][**CRITICAL**] **AI-16 — the test revived in Task 6c was NOT deterministic, and its
  "passes, 3/3" claim did not reproduce.** Found by actually running the suite during this review, not by
  reading it. `open a thread from the inbox and verify messages render` failed **2 of 3 runs** locally.
  TWO independent defects, both introduced by Task 6c, both invisible to the AC4 burn-in as run:
  1. **`page.reload()` drops the session.** The access token is in memory (AuthContext `saveToken`), so a
     hard load forces a silent refresh that races `ProtectedRoute` — when it loses, the test lands on the
     PUBLIC HOME PAGE and no inbox anchor can ever appear. The premise the rewrite was built on ("reload
     so the inbox comes from the server") does not hold for an authenticated page.
  2. **`filter({ hasText: threadText })` assumes our message is the newest for that partner.** `getInbox`
     returns ONE row per partner previewing the latest message, so any concurrent writer overwrites it.
     `--repeat-each` — the burn-in AC4 itself prescribes — runs copies of this test **concurrently**
     (`fullyParallel: true`) against the same seeded enumerator, so they clobber each other: observed with
     the row showing `…554257` while the test waited for `…554455`, 198 ms apart. **CI cannot see this**
     (`workers: 1`, playwright.config.ts:10) — green in CI, flaky locally, the precise divergence Task 5
     was written to end, re-introduced two tasks later.
  [apps/web/e2e/messaging.spec.ts:111] → **FIXED**: reload removed (selection is cleared through the UI
  via the broadcast button); the inbox row is keyed by PARTNER instead of by our own message text, and the
  per-test assertion moved to the thread log where the uniquely-stamped message is concurrency-safe.
  **Verified: 8/8 on the isolated test, then 24/24 on the full spec (`--repeat-each=4`), parallel workers.**
- [x] [AI-Review][Low] **AI-15 — `timeout-minutes: 25` with an unvalidated `repeat_each`.** A high burn-in
  count silently exceeds the job timeout and yields a red that means nothing — re-creating the
  untrustworthy-red problem AC4 exists to end. [.github/workflows/e2e.yml:27] → **FIXED** (input validated
  and bounded, with the timeout budget stated).

### Adjudication findings (Claude, 2026-07-27) — third independent layer

Verified rather than inherited: API+web `tsc --noEmit`, api `eslint` on the touched seed files, web
`eslint e2e`, the seed suite (**16 passed**, matching the review's count), **two independent RED-verifies
run by me** (below), and a read of every anchor the new helpers target against the product code that
renders it. Three findings, all fixed in this pass; none blocks the commit.

- [x] **AJ-1 [Med] — the pitfall renumber collided again: `#43` was also taken.** AI-7 correctly caught
  `#39a`, but renumbered to `#43` after scanning footer lines 1594-1598 (`#39`-`#42`) — stopping one entry
  short of line 1611, `*Updated: 2026-07-20 — Pitfall #43 added (Story 13-2 → 11-2 dependency-inversion)*`.
  That number is also cited outside this file (`docs/session-2026-07-20-import-spine-and-email-channel.md:49`),
  so the collision would have made two different lessons share one identifier — the exact harm AI-7 named.
  [docs/infrastructure-cicd-playbook.md:1556] → **FIXED (renumbered #44; #44 verified free repo-wide).**
  Root cause worth keeping: `#26`-`#38` exist as `### Pitfall #N` headings while `#39`-`#43` exist ONLY as
  footer `*Updated:*` paragraphs, so "the highest number" is not visible from either convention alone.
  Grep `Pitfall #` across the WHOLE file before minting the next one.
- [x] **AJ-2 [Low] — the AI-3 diagnostic pointed at a helper that does not exist and is banned.**
  `expectInboxReady`'s no-listener message told the next engineer to "use gotoMessages() / **reloadMessages()**",
  while the same file 40 lines above says **"DO NOT ADD A `reloadMessages()` HELPER"** (the AI-16 fix removed
  it). A diagnostic prescribing a forbidden, non-existent remedy is the same misdirection class as AI-3/AI-4,
  third instance. [apps/web/e2e/helpers/messages.ts:164] → **FIXED** (points at `gotoMessages()` /
  `observeInboxTraffic()`, both of which exist).
- [x] **AJ-3 [Low] — stale "before the reload" comment** left behind by the AI-16 fix, in the test whose
  whole revision was removing the reload. [apps/web/e2e/messaging.spec.ts:139] → **FIXED**.

**RED-verify (mine, independent of the dev's).** Both neuters applied by hand and restored by hand (the
files are uncommitted, so `git checkout --` would have wiped the work); `grep -rn "RED-VERIFY" apps/`
clean afterwards and the suite re-run green at 16/16.
1. Neutered `assertDevSeedDatabase` (early `return`) → **2 failed / 14 passed** — "refuses the production
   database name" + "refuses a name that merely CONTAINS the letters t-e-s-t", both
   `expected [Function] to throw an error`. The AI-8 gate is genuinely load-bearing.
2. Restored the pre-13-36 create-only `if (existing) continue;` → **1 failed / 15 passed** —
   "re-converges an account that drifted exactly like the 2026-05-09 local admin",
   `AssertionError: expected true to be false`. Reproduces the dev's stated canary exactly, including that
   the other three seed tests stay green (they guard the guards, not the convergence).

**Independently confirmed, not taken on trust:**
- The AI-8 gate cannot break CI: all three `db:seed:dev` callers (`ci-cd.yml:485`, `:573`, `e2e.yml:111`)
  run against `test_db`, which the boundary-matched allow-list admits. The prod path never reaches it —
  `main()` gates `assertDevSeedDatabase` behind `--dev`, and deploy runs `--admin-from-env`.
- The AI-1 error anchor actually fires: `data-testid="roster-error"` (TeamRosterPicker.tsx:86) and the
  empty state (`:106`) are both INSIDE the `role="list" aria-label="Team members"` container at `:84`, so
  scoping to `roster` does not orphan them. Same check for every other new anchor —
  `Conversation with …` (MessageInbox.tsx:58), `Message threads` (`:49`), `Loading messages`
  (SupervisorMessagesPage.tsx:100), `role="log" aria-label="Message thread"` (MessageThread.tsx:60), and
  `exact: true` correctly disambiguating `Start a new conversation` (`:30`) from the empty-inbox variant (`:97`).
- The `e2e.yml` turbo passthrough is equivalent to what it replaced: root `test:e2e` is literally
  `pnpm exec turbo run test:e2e`, so the burn-in run keeps the same `test:e2e.env` allow-list that the
  13-32 strict-env fix depends on.

**Flagged, NOT changed — for Awwal's call.** Both active messaging tests key their unique message on
`Date.now()` alone (`messaging.spec.ts:112`, `:240`). Under the `--repeat-each` burn-in AC4 prescribes,
`fullyParallel: true` runs copies concurrently, and two copies that start in the same millisecond would
produce identical text — making `messageLog.getByText(threadText)` match two elements and fail on strict
mode. This is the residual tail of AI-16's concurrency class, not a new one: the observed collision window
was 198 ms, so the probability is small but not zero. A worker-scoped suffix
(`test.info().parallelIndex`) would close it. Left alone because changing a test's identity key without a
local Playwright run is a worse trade than documenting it.

**Not verified locally: the Playwright suite itself.** It needs the full dev stack, and AC4/AI-2 is a
push-time observation by construction — the E2E Tests workflow runs on push to `main` and will exercise
the AI-16 fix in CI. That is the discharge path, not a gap I chose to skip.

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

### Implementation Plan / Approach
Test-side determinism, product untouched. One shared helper module owns the data-ready waits so the
rule is enforced by construction rather than by comment; the flake is then pinned by a regression test
that controls the in-flight window instead of hoping for it.

### Root cause (corrected vs the story's framing)
The story attributed the race to "role/team/threads data (a query + socket.io connection)". Traced to
ground truth, **socket.io is not involved at all** and neither is the team roster:

- `SupervisorMessagesPage.tsx:90-115` returns a **full-page skeleton** while `useInbox()` is in flight.
  Nothing inside `MessageInbox` — including the broadcast button — is mounted during that window.
- `useInbox()` is a single TanStack query over `GET /api/v1/messages/inbox` (`useMessages.ts:21-30`,
  `message.api.ts:63-66`). `useTeamMetrics` is `enabled:false` until the roster opens
  (`SupervisorMessagesPage.tsx:32-34`), and `useMessageRealtime()` only *invalidates* queries — the
  socket never gates the first render.
- `MessageInbox.tsx:36` gates on `showBroadcastButton && onBroadcast`, but both are **literal props**
  on the supervisor page (`:167-168`) — they are never "resolved from role/team data".

So the button is gated by exactly one thing: the inbox query. The old test navigated and clicked
immediately, leaving Playwright's 15s `actionTimeout` (`playwright.config.ts:18`) as the only cushion —
under CI load the fetch occasionally lost that race. A missing deterministic wait, not a product bug.

### AC2 decision — test-side wait (option a). Product deliberately unchanged.
The page withholds the button behind a **skeleton screen**, which is the project's mandated loading
pattern (`project-context.md` §4: "skeleton screens, NOT spinners", `aria-busy` + layout preservation),
not avoidable data-gating. De-gating would mean painting inbox chrome over no data purely to please a
test — worse UX, and it would leave the real dependency (the query) unwaited-for anyway. Fixed test-side.
The regression test also *documents* this decision: if a future story de-gates the button product-side,
its first assertion fails and forces the decision to be revisited rather than silently reversed.

### AC1 — the deterministic wait (and the wait we had to throw away)
New `apps/web/e2e/helpers/messages.ts`. **Final design gates on the RENDERED ANCHOR**, not on a network
event:
- `gotoMessages(page)` / `expectInboxReady(page)` — race-safe nav, then an auto-retrying assertion on
  the thread list, which the page mounts only on its data-loaded branch (the skeleton has no
  `role="list"`; the empty state renders *inside* that same list, so it is a valid anchor with or
  without threads). Explicit 20s budget — larger than the 10s default `expect` timeout, because this is
  the one wait that absorbs CI-load latency.
- `openTeamRoster(page)` — clicks the header button, then a POSITIVE assertion on the settled branches
  (real roster rows **or** the loaded "no team members" state). Never "skeleton absent", which passes
  trivially before the skeleton has even mounted.
- No `waitForTimeout` anywhere; no timeout was raised.

**The first cut used `waitForResponse('**/messages/inbox')` — and the AC4 burn-in caught it failing
~1-in-30:**
```
TimeoutError: page.waitForResponse: Timeout 20000ms exceeded while waiting for event "response"
  at gotoMessages (helpers/messages.ts:54)
```
Waiting on a network event is a hard dependency on *observing that exact event*: an aborted, retried,
coalesced or otherwise-invisible request means it never arrives and the test dies even though the page
rendered perfectly. **The fix had introduced a new instance of the very class it was sent to remove.**
The burn-in AC4 demands is exactly what surfaced it — the strongest argument in this story for keeping it.

Durable rule now written into the helper header:
> gating a RENDER → assert the loaded-branch anchor. Asserting that a WRITE reached the server →
> `waitForResponse` is right, because no DOM state can prove it (wizard-registration.spec.ts:227).

### RED-verify (the flake reproduced, then killed)
Run locally against the full stack (Postgres + Redis + API + Vite, dev seeds). Temporarily restored the
pre-13-36 "navigate then click" pattern with `/messages/inbox` held for 16s (> the 15s action timeout):

```
✘ RED-VERIFY naive nav-then-click races the inbox query (26.2s)
  TimeoutError: locator.click: Timeout 15000ms exceeded.
    - waiting for getByRole('button', { name: /send broadcast/i })
✓ broadcast composer opens deterministically while the inbox query is slow (12.0s)
```

That is the CI failure verbatim (`messaging.spec.ts:49 › send a broadcast message and open the composer`),
reproduced on demand — and the helper-based test passes under the *identical* hold. Temp test removed;
the shipped regression test (`messaging.spec.ts` — "inbox load race") keeps the proof with **no timing
assumptions at all**: it holds the response open, asserts (1) skeleton visible + broadcast button absent
(count 0) — the causal fact behind the flake — then releases and asserts (2) the nav gate resolves and
the click lands.

### AC3 — sibling non-determinism sweep (whole Playwright suite: 7 `.spec.ts` + 2 `.setup.ts` = 9 files)
| Surface | Verdict | Evidence |
|---|---|---|
| `messaging.spec.ts` — broadcast click (×2), New-Conversation click (×2), inbox-list assert | **FIXED** | all 6 tests routed through `gotoMessages` / `openTeamRoster` |
| `messaging.spec.ts` — roster list assertion | **FIXED (false-green)** | `TeamRosterPicker.tsx:84` wraps the *skeleton* in the same `role="list"`, so the old assertion passed over placeholders |
| `auth.setup.ts` — "projects render as skipped" (the story's adjacent risk) | **Not a flake** | every setup is `setup.skip()` by design (`auth.setup.ts:19-21`); its only consumer (`golden-path`) logs in inline. Closed in-file. |
| `supervisor-dashboard.spec.ts` — team roster / GPS map / fraud tabs | **No change needed** | every post-nav wait is an auto-retrying `expect()` on an element rendered only on the data-loaded branch (`SupervisorTeamPage.tsx:141`) — the assertion *is* the gate. All clicks are sidebar links (static chrome). |
| `fraud-threshold.spec.ts` — inline edit/save clicks | **No change needed** | each is preceded by an assertion on `fraud-thresholds-page`, which renders only after the loading/error/empty early-returns fall through (`SuperAdminFraudThresholdsPage.tsx:26-63`) |
| `golden-path.spec.ts` GP-1 — "Create New Form" click | **No change needed** | static page chrome, not query output (`QuestionnaireManagementPage.tsx:48-54`) |
| `wizard-registration.spec.ts` (active) | **Already exemplary** | explicit `waitForResponse` predicate on the autosave PUT (`:227-239`) + `expect(lga).toBeEnabled()` |
| `nin-validation.spec.ts` / `smoke.spec.ts` (active) | **No change needed** | client-side only; every interaction preceded by a visibility gate |
| `wizard-resume.setup.ts` | **No surface** (added by the 2026-07-27 review, AI-11 — the original table listed 8 of the 9 files) | Node-only: shells out to the api mint script and writes a fixture. No `page`, so no data-race to gate. |
| `waitForTimeout` in the suite | **Zero in active tests** | the only two (`nin-validation.spec.ts:123`, `wizard-registration.spec.ts:341`) are loop pacers inside `test.skip()` bodies — a different shape (UI-transition pacing, not server data). Left alone deliberately; noted here so the next sweep doesn't re-derive it. |

The three "no change needed" verdicts were written **into the spec headers** so the audit survives as a
rule for the next author, not just as a story artifact.

### AC4 — burn-in + the required-vs-informational decision
- **Burn-in:** `messaging.spec.ts --repeat-each=5` → **20/20 passed, zero flakes** (runs settled to
  3–8s each). Full suite CI-style (`CI=true`, 1 worker): first pass **27 passed / 25 skipped / 5 failed**,
  the 5 being a local-vs-CI environment divergence (diagnosed and then **fixed** — see Task 5);
  after that fix the full suite is **32 passed / 25 skipped / 0 failed**.
- **Decision — INFORMATIONAL (non-deploy-gating), treated as a REAL signal.** Written into the
  `e2e.yml` header. Rationale: `ci-cd.yml`'s `smoke-e2e` is the deploy gate; the team pushes straight to
  `main`, so a "required check" would have no PR to attach to. "Informational" governs *blocking*, not
  *trust* — the recorded rule is **triage a red, never reflexively re-run**; if a re-run is the answer,
  the flake gets a story. The stale header line *"E2E is now a real CI gate"* (never true — it never
  gated deploy) was the actual source of the ambiguity and is deleted.
- **On-demand burn-in shipped:** `workflow_dispatch` input `repeat_each`, forwarded through turbo's `--`
  passthrough (`turbo run test:e2e -- --repeat-each="$REPEAT_EACH"`) so a burn-in run is byte-identical
  to a normal one apart from the repeat count — running Playwright directly would have re-opened the
  13-32 strict-env trap. Count is passed via `env:`, never interpolated into the shell.
  Verified locally: `REPEAT_EACH=3` → 9 listed for a 3-test project, `1`/unset → 3 (degrades to a normal
  run, never errors). Job `timeout-minutes` 10 → 25 for burn-in headroom (a normal run is ~6 min).

### Task 5 (follow-up, requested by Awwal 2026-07-26) — kill the local-vs-CI divergence at its root
The 5 local failures above were *explained* but not *fixed*, which is the same "re-run and hope" reflex
AC4 exists to end — one directory over. A suite that is green in CI and red on every developer's machine
is not a trustworthy signal, so this closes it. **No AC text was changed** (that is the SM/PM's call);
this is additive under AC4's "trustworthy" clause.

**Scope decision (Awwal, 2026-07-26): resolved HERE, not carved into a new story.** The diagnosis, the
RED-verify and the evidence all live in this file; splitting the fix away from them would strand the
nuance in a story whose reader lacks the context that produced it. It touches `apps/api`, but only the
dev-seed path, which is production-guarded.

**Root cause (deeper than the `mfa_enabled` flag).** `seedDevelopmentUsers` was **create-only** —
`if (existing) { logger.info('User already exists, skipping'); continue; }` (`seeds/index.ts:184-187`).
So `db:seed:dev`, the command that *establishes* the dev contract, could never *restore* it. Local
`admin@dev.local` was MFA-enrolled on **2026-05-09** (Story 9-13 work) and has been stuck ever since:
every admin-dependent E2E test has failed locally for ~2.5 months while CI stayed green on its fresh
`test_db`. There are two symptoms of the one drift, which is why flipping the flag by hand didn't help:
  1. `mfa_enabled = t` → login stops at `/auth/mfa-challenge`;
  2. `mfa_enabled = f` **with a stale expired `mfa_grace_until`** → login succeeds, then every
     privileged route 403s `FORCE_MFA_ENROLLMENT` (`mfa-grace.ts:57-102`; the gate passes a super_admin
     through only when `mfa_grace_until IS NULL` — `:69`, i.e. exactly what CI seeds).

**Fix — three layers:**
1. **Root (`seeds/index.ts`):** the dev seed now **converges** existing `@dev.local` rows to the
   documented contract instead of skipping them, and logs which fields had drifted. Seed-owned fields:
   passwordHash, fullName, roleId, lgaId, status, failedLoginAttempts + lockedUntil (a tripped lockout
   blocks login identically), and the full MFA block including `user_backup_codes` rows. Two guards,
   because this now mutates rows: it refuses to run under `NODE_ENV=production`, and it **never touches
   a row that is not `isSeeded`** — a real account sharing a dev email is reported and skipped, never
   downgraded. CI is unaffected (both `db:seed:dev` callers run with `NODE_ENV: development`).
2. **Diagnosis (`e2e/helpers/login.ts`):** the login wait now also accepts `/auth/mfa-challenge` and
   throws a named, actionable error in ~1s instead of burning 30s on an unexplained
   `waiting for **/dashboard/**`. The message names both symptoms and the one-line fix.
3. **Tests (`seed-orchestrator.test.ts`, +4 integration tests):** creation state, convergence of a row
   drifted *exactly* like the real 2026-05-09 admin (incl. stale backup codes cleared), the
   non-seeded-row guard, and the production refusal.

**Verification:**
- **RED:** restoring the create-only `if (existing) continue;` fails the convergence test —
  `AssertionError: expected true to be false` (mfaEnabled). The other 3 pass either way by design
  (they guard the *guards*, not the convergence); only that one is the true regression canary.
- **On the real local DB:** re-drifted the admin to the exact 2026-05-09 state → `db:seed:dev` →
  `WARN: Dev user had drifted from the seed contract — re-converged  drift: [mfaEnabled, mfaSecret,
  mfaGraceUntil]`, and the row came back `mfa_enabled=f / no secret / grace NULL / active`.
- **The 5 tests:** now pass. **Full Playwright suite locally: 32 passed / 25 skipped / 0 failed** —
  green end-to-end on a dev machine for the first time.
- **Fail-fast path:** re-drifted to `mfa_enabled=t` and confirmed the new error fires immediately with
  the `pnpm --filter @oslsr/api db:seed:dev` instruction, then healed the DB again (final state verified).
- **API suite:** 248 files / **3271 tests passed**, 0 failures; API `tsc` + `eslint` clean.

### Task 6 — "fix it all": the rest of the class, and what must NOT be fixed
Asked to close the whole `pattern-ship-a-fix-that-never-fires` shape rather than one instance.

**6a. Single source of truth for the seed contract.** The first cut hand-maintained the reset fields and
the drift-report fields as two parallel lists — the same rot risk one level down (add a field to the
reset, forget the report, and the log lies about a heal it performed). Now `devSeedContract()` declares
the owned columns ONCE and `driftFromContract()` derives the report from it. Verified on the real DB: a
row drifted in 4 fields reported exactly `["status=suspended", "failedLoginAttempts", "mfaEnabled",
"mfaGraceUntil"]`. Also fixed a latent bug while there: `lgaMap.get()` returning `undefined` would make
drizzle **skip** the column instead of nulling it — silently not converging the field being converged.

**6b. Swept the whole seed orchestrator — and deliberately left the siblings alone.** `seedRoles`,
`seedLGAs`, `seedProductivityTargets` and `seedFraudThresholds` have the identical create-only shape,
and converging them would be **wrong**: `main()` calls them on the PRODUCTION path too, so a converging
seed could overwrite live reference data (LGA rows whose canonical values were migrated in 13-16;
`seedFraudThresholds` documents "preserves manual config" as intent). `seedTeamAssignments` is already
convergent (re-inserts when no `unassigned_at IS NULL` row exists) and now composes with 5a, which
restores the supervisor's LGA it depends on. The rule is recorded in the seed docblock:
**converge where the blast radius is dev-only and seed-owned; stay create-only where a run could touch
real data.** "Fix it all" ≠ "apply the same change everywhere".

**6c. Two `test.skip()`s revived — both had been parked on WRONG diagnoses** (the project's
"verify infra-gated skips before deferring" rule, applied now that the stack ran locally):
- *`start a direct message via New Conversation`* — skipped 2026-05-09 blaming the seed ("the list
  contains no enumerator buttons... the seed's team-assignments step may fail silently in CI"). The
  roster was fine all along; the failure snapshot shows `listitem "Start conversation with Dev
  Enumerator"` ×3. The test could never select them: `TeamRosterPicker.tsx:115` puts an explicit
  `role="listitem"` on the `<button>`, which **overrides the implicit button role**, so
  `getByRole('button')` matches nothing — in CI too, forever. Fixed the selector → **passes, 3/3**.
- *`open a thread and verify messages render`* — skipped blaming a "send-to-inbox round-trip that
  doesn't propagate in time" and prescribing a `waitForResponse`. No wait could ever have worked: it
  sent a **broadcast** and waited for it in the **sender's own inbox**, which `getInbox` excludes by
  design (the sent leg filters `eq(messages.messageType, 'direct')`, message.service.ts:182-185, and the
  sender gets no receipt for their own broadcast). Rewritten over supported behaviour — seed a thread
  with a DIRECT message, reload so the inbox comes from the server, then open that thread from the list
  → **passes, 3/3**. A third latent bug surfaced en route: the naive `getByText(msg)` is a strict-mode
  violation (the text also renders as the inbox row preview), so the assertion is now scoped to the log —
  which is what the test's name claimed all along.
- ⚠️ **CORRECTION (2026-07-27 review, AI-16): the "passes, 3/3" above did not reproduce — the rewritten
  thread test failed 2 of 3 runs.** The rewrite fixed the *diagnosis* but shipped two new
  non-determinism sources: `page.reload()` drops the in-memory access token (silent refresh races
  `ProtectedRoute` → lands on the public home page), and `filter({hasText: threadText})` assumes our
  message is the newest for that partner, which concurrent copies of the same test under `--repeat-each`
  routinely break. Both fixed; re-verified 8/8 isolated and 24/24 across the full spec with parallel
  workers. The lesson is recorded in the playbook: **a burn-in that only ever exercises the happy path
  cannot certify the tests it repeats** — these failures needed a reader and a real run, not a repeat count.
- Net: **34 passed / 23 skipped** (from 32 / 25). Two tests that were dead for ~2.5 months are alive,
  and neither was blocked by what its comment said. (The 34/0 figure predates AI-16 — it was recorded from
  a `workers: 1`-style local run, where the concurrency collision cannot occur.)

**6d. Known remaining condition — NOT fixed, deliberately, and now self-diagnosing.** Across ~480
burn-in executions, ~0.8% fail with one signature: the Messages page sits on its loading skeleton and
the inbox query never settles — **no response and no request failure observed**, i.e. no request was
issued at all. That is the shape of TanStack pausing queries (`networkMode: 'online'`) when the browser
reports offline; this host had a real network outage during the session. It is NOT the story's flake
(different signature; the fixed one was a click racing a render) and it never reproduced against
warm, self-hosted servers (48/48). Rather than paper over it with a retry — the reflex this story
exists to kill — the helper now **names it**: on that timeout it reports the observed inbox traffic and
`navigator.onLine`, so the next occurrence (in CI or locally) identifies itself instead of being
re-run. If it shows up in CI with `navigator.onLine: true`, that is a genuine new bug and worth a story.
Worth noting for whoever picks that up: the inbox query is `retry: 1` with no manual retry affordance
(App.tsx:225), so one transient failure leaves a real user stuck on "Failed to load messages" until they
navigate away — a product question this story does not touch.

### AC5 — no product regression
No runtime product file touched: the change is `e2e/` + `.github/workflows/e2e.yml` + the **dev-only**
seed path (`db:seed:dev` — refuses to run under `NODE_ENV=production` and is never in the deployed
request path). Web suite **2821 passed + 2 todo / 259 files**; API suite **3271 passed / 248 files**;
`tsc --noEmit` clean in both; `eslint src e2e` (web) and `eslint src scripts` (api) clean.

### Residual for the adjudicator — DISCHARGED 2026-07-27

Deployed `830dcf7`; prod VPS SHA verified `830dcf7`, health 200. CI/CD Pipeline [30232138406] green on
**all 10 jobs** (incl. `deploy`) — and, for once, no OSV prod-gate block (the streak was 5 consecutive).
E2E Tests green on the push run and on the `repeat_each: 3` dispatch (evidence in Task 3b). AC4's
"a couple of consecutive green runs on `main`" now holds: `5d80841` → `d687cf4` → `830dcf7`, plus the
burn-in. **All ACs discharged; status → done.**

⚠️ **What the burn-in does NOT prove.** CI runs `workers: 1` (playwright.config.ts:10), so
`--repeat-each` there is repetition, not concurrency — it cannot exercise the parallel-clobber path that
AI-16 was about. That defect class remains observable only locally, which is precisely the
local-vs-CI asymmetry Task 5 exists to manage. The `Date.now()` collision flagged in the adjudication
findings sits in that same blind spot: CI will never surface it.

### Original residual note (superseded by the section above)
AC4's "a couple of consecutive green runs on `main`" is a **push-time** observation and cannot be
discharged locally — same shape as 13-35's AC5 e2e residual. Local evidence is the 20/20 burn-in + the
RED-verify. On push, confirm the **E2E Tests** workflow is green, then optionally run it once from the
Actions tab with `repeat_each: 3` to bank the "consecutive greens" claim.

Also noted while working: `.gitignore` and `docs/adjudication-agent-handoff.md` are modified in the
working tree by **another session** (not this story) — exclude them from this story's selective commit.

### File List
- `apps/web/e2e/helpers/messages.ts` — NEW. `gotoMessages()` / `openTeamRoster()` data-ready waits.
- `apps/web/e2e/messaging.spec.ts` — MODIFIED. All tests routed through the helpers; new
  "inbox load race (13-36 regression)" describe; determinism rule + RED-verify evidence in the header;
  **two `test.skip()`s revived** (role="listitem" selector fix; thread test rewritten off the
  impossible broadcast-in-own-inbox premise, assertion scoped to the log).
- `apps/web/e2e/supervisor-dashboard.spec.ts` — MODIFIED. AC3 sweep verdict in the header (no logic change).
- `apps/web/e2e/fraud-threshold.spec.ts` — MODIFIED. AC3 sweep verdict in the header (no logic change).
- `apps/web/e2e/auth.setup.ts` — MODIFIED. AC3: `setup.skip()`-by-design note closing the "skipped
  projects" adjacent risk (no logic change).
- `.github/workflows/e2e.yml` — MODIFIED. Required-vs-informational decision block (stale "real CI gate"
  line removed); `workflow_dispatch` + `repeat_each` burn-in via turbo passthrough; timeout 10 → 25 min.
- `apps/web/e2e/helpers/login.ts` — MODIFIED (Task 5). Login wait accepts `/auth/mfa-challenge` and
  fails fast with an actionable precondition error instead of a 30s opaque timeout.
- `apps/api/src/db/seeds/index.ts` — MODIFIED (Task 5). `seedDevelopmentUsers` converges drifted
  `@dev.local` accounts instead of skipping them (+ `NODE_ENV=production` refusal, non-seeded-row guard,
  drift logging, backup-code clearing); exported for test.
- `apps/api/src/db/seeds/__tests__/seed-orchestrator.test.ts` — MODIFIED (Task 5). +4 integration tests
  for creation state, drift convergence, the non-seeded guard, and the production refusal.
- `docs/infrastructure-cicd-playbook.md` — MODIFIED. New pitfall (create-only seed can't heal drift +
  `waitForResponse` can't survive a missed event). **Was missing from this list until the 2026-07-27
  review (AI-5); renumbered #39a → #43 in the same pass (AI-7) and → **#44** in adjudication (AJ-1),
  since #40-#43 already existed.**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIED. Status ready-for-dev →
  **in-progress** (not "review" as this line previously claimed — corrected in adjudication; the story
  header agrees, and `in-progress` is the honest state while Task 3b is undischarged).

## PM Validation (John, 2026-07-18)

**Validated — approved. Test-hygiene, NOT launch-gating; post-launch.**
1. **Priority:** low urgency, real value. The E2E Tests workflow doesn't gate deploy, so a red never blocks a release — but an untrustworthy signal everyone learns to re-run is exactly how a *real* regression sails through (it nearly did: the 13-32 turbo-env regression hid under this flake). Fix it in the first post-launch hygiene pass, alongside 13-30.
2. **Scope is right:** deterministic data-ready waits (AC1), NOT a bigger timeout, plus a sibling sweep (AC3) so it's fixed as a class. The AC2 test-side-vs-product-side gate is correct — prefer the test-side wait unless the page genuinely withholds the button behind avoidable data-gating.
3. **AC4 (required vs informational)** is the right question to force — a workflow nobody trusts should be made trustworthy or explicitly labelled informational, never left ambiguous.

**No AC changes.** Dev-ready; schedule post-launch.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-27 | **ADJUDICATED + DEPLOYED `830dcf7` → status done.** Verified independently, not inherited: api+web `tsc`, api `eslint` on the seed files, web `eslint e2e`, seed suite **16 passed**, and **two RED-verifies of my own** — neutering `assertDevSeedDatabase` fails 2 tests (`expected [Function] to throw`), restoring the create-only `if (existing) continue` fails the convergence canary (`expected true to be false`), both matching the dev's stated results including which siblings stay green. Read every new anchor against the component that renders it (`roster-error` and the empty state are genuinely INSIDE the `role="list"` container, so the AI-1 scoping fires). Confirmed the new seed gate can't break CI (all three `db:seed:dev` callers use `test_db`; prod runs `--admin-from-env` and never reaches it) and that the turbo passthrough is equivalent to the root `test:e2e` script it replaced. **3 findings fixed: AJ-1 (Med) the pitfall renumber collided AGAIN — AI-7 moved `#39a`→`#43` but `#43` was already taken 2026-07-20 by the 13-2→11-2 lesson (playbook:1611, also cited in `session-2026-07-20-…md:49`); renumbered #44.** Root cause: `#26`-`#38` are `### Pitfall #N` headings while `#39`-`#43` exist only as footer `*Updated:*` paragraphs, so neither convention alone reveals the highest number. AJ-2 (Low) the AI-3 diagnostic told the reader to use `reloadMessages()`, a helper the same file bans 40 lines above and which AI-16 deleted — third instance of the misdirecting-diagnostic class. AJ-3 (Low) stale "before the reload" comment. **Task 3b/AI-2 discharged on CI**: push run [30232138393] green (34/23), dispatched `repeat_each: 3` [30232550112] green with the passthrough PROVEN to fire (`> playwright test "--repeat-each=3"`; 57→155 tests, arithmetic reconciled via the 8 non-repeating setup tests). CI/CD [30232138406] green on all 10 jobs; prod SHA + health verified. **Flagged not fixed:** both messaging tests key uniqueness on `Date.now()` alone, so two same-millisecond copies under a parallel burn-in would collide in strict mode — invisible to CI's `workers: 1`. | Claude (Adjudication) |
| 2026-07-27 | **Adversarial code review — 16 findings (1 Critical, 3 High, 6 Medium, 6 Low); 15 fixed, 1 push-time.** Full list + outcomes in "Review Follow-ups (AI)". The through-line: **the story's own defect class was committed inside the fix**, on the paths a green burn-in never executes. **AI-16 (Critical, found by RUNNING the suite):** the test revived in Task 6c failed **2 of 3 runs** — its "passes, 3/3" did not reproduce. Two causes, both introduced by 6c: `page.reload()` drops the in-memory access token (silent refresh races `ProtectedRoute` → public home page), and `filter({hasText: threadText})` assumes our message is the newest for that partner, which concurrent copies under `--repeat-each` (`fullyParallel: true`) clobber — invisible in CI (`workers: 1`), i.e. the Task-5 local-vs-CI divergence re-introduced two tasks later. Fixed by removing the reload (selection cleared through the UI) and keying the inbox row on PARTNER with the unique assertion moved into the thread log; **re-verified 8/8 isolated, 24/24 full spec, parallel workers**. **AI-1 (High):** `openTeamRoster` anchored on rows-or-empty but not the roster's error branch, so a failed fetch degraded to the anonymous 20s timeout the story exists to remove — all three settled branches are now anchors, with a named throw. **AI-3 (High):** `expectInboxReady(page)` on the reload path had no traffic listener, so its failure message asserted "no request was observed" and volunteered the §6d browser-offline hypothesis as fact — it now reports UNKNOWN and withholds the hypothesis unless something actually watched. **AI-2 (High, OPEN):** Task 3 claimed a burn-in of `e2e.yml` that never ran; split into 3a (done) / 3b (push-time). **AI-8 (Med):** making the seed converge made it destructive while its only environmental guard stayed an env-NAME check, against the project's own Pitfall #29 — added a fail-closed DB-name gate (`assertDevSeedDatabase`, `ALLOW_DEV_SEED_DB=1` override) wired at the `--dev` entry point, since `seedRoles`/`seedLGAs` WRITE before `seedDevelopmentUsers` is reached; RED-verified (refuses `pretend_prod_db` before "Seeding roles…", passes `app_test`). Also AI-5 File List omission, AI-7 pitfall renumbered #39a→#43 (#40-#42 already existed), AI-6 unhandled rejection, AI-9 order-coupled seed tests, + 6 LOW. Verification run by the reviewer, not inherited: web+api `tsc --noEmit` clean, web `eslint e2e` + api `eslint src scripts` clean, seed suite **16 passed** (was 7; +9 for the new gate), messaging spec **24/24** under `--repeat-each=4`. | Amelia (Review) |
| 2026-07-26 | **Task 6 ("fix it all") + scope decision: resolved in THIS story, not carved out** (Awwal) — the diagnosis and the fix stay together so the nuance isn't stranded. (a) Seed contract is now declared ONCE (`devSeedContract`) with the drift report DERIVED from it, killing the two-parallel-lists rot one level down; fixed a latent `lgaMap.get() === undefined` bug that made drizzle SKIP the column instead of nulling it. (b) Swept the whole seed orchestrator: `seedRoles`/`seedLGAs`/`seedProductivityTargets`/`seedFraudThresholds` share the create-only shape but MUST stay that way — `main()` runs them on the PRODUCTION path, so converging them could overwrite live reference data (13-16 LGA canonicalization; fraud thresholds document "preserves manual config"); `seedTeamAssignments` was already convergent and now composes with the restored supervisor LGA. Rule recorded: converge where the blast radius is dev-only and seed-owned, stay create-only where a run could touch real data. (c) **Both messaging `test.skip()`s were parked on WRONG diagnoses and are now revived**: the DM test was blamed on the seed but the roster was always populated — `TeamRosterPicker.tsx:115` puts role="listitem" on the <button>, overriding the implicit role, so `getByRole('button')` could never match; the thread test was blamed on "propagation timing" but waited for a BROADCAST in the SENDER's own inbox, which `getInbox` excludes by design (message.service.ts:182-185) — rewritten over a direct message + reload, and a third latent strict-mode violation fixed en route. Suite 32→**34 passed / 23 skipped**. (d) **The AC4 burn-in caught a flake the FIX had introduced**: the helper's original `waitForResponse` gate failed ~1-in-30 (`Timeout 20000ms exceeded while waiting for event "response"`) — waiting on a network event is a hard dependency on observing it. Replaced by an auto-retrying assertion on the loaded-branch anchor; durable rule written into the helper (gate a RENDER on the anchor; use waitForResponse only to prove a WRITE reached the server). (e) A residual ~0.8% environment condition (query never issues a request; browser-offline signature) is deliberately NOT papered over with a retry — the helper now reports the observed inbox traffic + `navigator.onLine` so the next occurrence names itself. Full local Playwright 34/0, API 3271 pass, web 2821 pass, tsc + eslint clean. | Amelia (Dev) |
| 2026-07-26 | **Task 5 (follow-up).** Killed the local-vs-CI divergence behind the 5 locally-failing admin tests instead of just documenting it. Root cause was NOT the `mfa_enabled` flag but `seedDevelopmentUsers` being **create-only** (`seeds/index.ts:184-187` "User already exists, skipping") — so `db:seed:dev` could establish the dev contract but never restore it, leaving `admin@dev.local` MFA-enrolled since 2026-05-09 and every admin-dependent E2E test red locally for ~2.5 months while CI stayed green on a fresh `test_db`. Two symptoms, one drift: `mfa_enabled=t` → login stops at `/auth/mfa-challenge`; `mfa_enabled=f` + stale expired `mfa_grace_until` → 403 `FORCE_MFA_ENROLLMENT` on every privileged route (the gate passes only when grace IS NULL, `mfa-grace.ts:69` — exactly what CI seeds). Fix in 3 layers: (1) the dev seed now **converges** drifted `@dev.local` rows (password/name/role/lga/status/lockout + the whole MFA block + `user_backup_codes`) and logs the drift, guarded by a `NODE_ENV=production` refusal and a never-touch-a-non-`isSeeded`-row rule; (2) the e2e login helper accepts `/auth/mfa-challenge` and throws a named, actionable error in ~1s instead of a 30s opaque timeout; (3) +4 integration tests. RED-verified (restoring create-only fails the convergence test: `expected true to be false`). Proven on the real local DB: re-drifted → `db:seed:dev` → `drift: [mfaEnabled, mfaSecret, mfaGraceUntil]` re-converged. **Full local Playwright suite now 32 passed / 0 failed** (was 27/5) — green on a dev machine for the first time. API suite 3271 passed / 248 files; tsc + eslint clean both packages. No AC text changed; additive under AC4's "trustworthy" clause. | Amelia (Dev) |
| 2026-07-26 | **Implemented (all 5 ACs).** Root cause corrected: the broadcast button is gated by ONE thing — the `useInbox()` query behind the page's loading skeleton (`SupervisorMessagesPage.tsx:90-115`); socket.io and the team roster are not involved (`useMessageRealtime` only invalidates; `useTeamMetrics` is `enabled:false` until the picker opens). AC2 decided **test-side** — the skeleton is the project's mandated loading pattern, not avoidable data-gating. New `e2e/helpers/messages.ts` (`gotoMessages`/`openTeamRoster`) arms `waitForResponse` BEFORE the nav click and asserts the painted anchor after; no `waitForTimeout`, no raised timeouts. RED-verified: restoring the old nav-then-click with the inbox held 16s reproduces the CI error verbatim (`locator.click: Timeout 15000ms exceeded … /send broadcast/i`) while the fixed test passes under the identical hold; shipped as a timing-free regression test that holds the response open. AC3 sweep across all 9 spec files: 5 messaging call-sites fixed (incl. a roster **false-green** — `TeamRosterPicker.tsx:84` wraps the skeleton in the same `role="list"`), `auth.setup.ts` "skipped projects" shown to be `setup.skip()`-by-design, and 4 surfaces confirmed safe with file:line evidence written into their spec headers. AC4: burn-in 20/20 (`--repeat-each=5`), decision recorded as **informational, non-deploy-gating, triage-don't-re-run** (the stale "E2E is now a real CI gate" line was the ambiguity), plus a `workflow_dispatch` `repeat_each` burn-in through turbo's `--` passthrough. Local full-suite: 27 passed / 5 failed, all 5 an `admin@dev.local` MFA-enrollment gate absent from CI's fresh seed (flag restored). Web 2821 pass + 2 todo / 259 files, tsc + eslint clean; zero product files touched. | Amelia (Dev) |
| 2026-07-18 | Story drafted via *create-story. EMERGENT from the 13-32 push: the separate E2E Tests workflow reds intermittently on the messaging broadcast-composer test (socket.io/data-timing race — button click times out before the parent's role/team/threads data resolves). The 13-32 turbo-2.x webServer env regression that masked it is already fixed; this story makes the flake deterministic + sweeps sibling non-deterministic waits so the E2E workflow is a trustworthy green. TEST-HYGIENE, not launch-gating. | Bob (SM) |
