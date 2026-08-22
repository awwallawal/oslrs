# Story 13-65: Take the registration sends off the request path — bounded concurrency, and an email that survives a 5xx

Status: ready-for-dev

<!-- Authored 2026-08-22 by Bob (SM). Discharges **gate item 7** of `docs/roadmap-to-launch.md`
(added 2026-08-21 by John/PM) via option (b) *and* option (a) — the queue AND the measurement, in one
story, on Awwal's explicit instruction (2026-08-22) not to slice it into gating and non-gating halves.
Carries 13-46 residual **R6** ("Context §4 undercounts outbound volume: 3N, not N") and its stated
reopen trigger ("the write path at 3N sends/registration has still never been load-tested").

⚠️ **FOUR CORRECTIONS TO THE DRAFTING BRIEF, each verified against this working tree on 2026-08-22.
Three of them change an AC.**

**(i) 🔴 The three sends are NOT three peers on one request, and the difference is the whole point of
sharp-edge #3.** The brief says "the blocking magic-link case is the `/login` flow, which this story
must NOT touch" — and then assumes the registration path therefore has no blocking send. It has one.
After `POST /wizard` returns its 201, the **browser fires a second request** for every non-pending
respondent — `WizardPage.tsx:553-564` — and `MagicLinkController.requestMagicLink` **awaits**
`sendMagicLinkEmail` before its 200 (`magic-link.controller.ts:92`). The success screen is gated on
that provider call. The `catch` in the client is labelled *"never block the success screen"*; it stops
an **error** from blocking, not the **latency**. So the honest per-registration picture is 3 provider
calls in both branches, but only **two** of them are on the `/wizard` request, and the one the user
actually waits on is the one this story is instructed to leave alone. AC1 scopes to what is
reachable; §7 and the Non-goals record the third with the option written down, un-built.

**(ii) 🔴 Queueing these sends creates a NEW failure mode that does not exist today, and no AC in the
brief covers it.** `email.worker.ts:92` — on budget exhaustion the worker **`pauseEmailQueue()`s the
entire `email-notification` queue and throws**. Today a registrant's magic link and reference-code
confirmation bypass the queue entirely, so an exhausted marketing budget cannot touch them. Move them
onto the queue naively and one exhausted budget silently stops every citizen-facing transactional
email. AC4 exists because of this.

**(iii) The dedup key does NOT solve sharp-edge #1 and must not be used for it.** `checkDedup` is
**produce-side** (`email.queue.ts:100`), a non-atomic `EXISTS`-then-`SET` with a **5-minute** TTL, and
it is **skipped entirely for `critical` types**. A worker retry at 30s/2min/**10min** (`BACKOFF_DELAYS`,
`:46`) walks straight past a 5-minute window on the third attempt. The thing that actually makes a
retry safe is the send-once marker the code already has — and the answer is to move the **whole guard
block**, not just the send. AC2 says so explicitly.

**(iv) `getSystemHealth` is TWO different functions and the story must name which.** 13-3's runner
comment points at the Operations dashboard, i.e. `operations.service.ts:93` (pm2 RSS/CPU/restart) —
**not** `MonitoringService.getSystemHealth` (`monitoring.service.ts:59`), which is the one that
carries `queues`. AC8 needs BOTH, and naming the wrong one produces a measurement with no memory
figure in it.

⛔ **PM2 topology is a CONSTRAINT here, not a question.** All 10 BullMQ workers run in the API process
(`app.ts:100-104`). Awwal has ruled (2026-08-22) that the PM2 topology is battle-tested and hardened
and will NOT be changed; process isolation is story **11-8**, which stays in backlog, untouched. It is
recorded once, in §3, and is not to be re-opened anywhere in this story. -->

## Story

As **the operator about to point 11 radio stations at a public registration form**,
I want **the emails a registration triggers to be handed to the existing email queue instead of dialled out on the request that created them**,
so that **a burst becomes a few hundred small Redis job records processed five at a time, instead of a few hundred simultaneous open TLS sockets on a 2GB box with no swap — and so a citizen's email survives a provider 5xx or a deploy instead of vanishing into a log line.**

## Context & Evidence (verified 2026-08-22 against the working tree on `story/13-46-burst-readiness`, which carries 13-46's uncommitted dev work; prod facts flagged as such)

### 1. What actually fires, per registration, and on which request

| # | Email | Fired from | Awaited by the request? | Category |
|---|---|---|---|---|
| 1 | Pending-NIN magic link | `registration.controller.ts:1391` (`if (pendingNin)` at `:1381`) | No — `.catch()` fire-and-forget; but `issueToken` at `:1383` **is** awaited | transactional (no category) |
| 2 | Reference-code confirmation | `submission-processing.service.ts:1385` → `sendReferenceConfirmationEmail` (`:1412`, provider at `:1462`) | No — double `void` (controller `:1261` → service `:1322`) | transactional (no category) |
| 3 | Thank-you referral outreach | `submission-processing.service.ts:1393` → `sendThankYouReferralEmail` (`:1514`) | No — same double `void` | **marketing** (`'thankyou-referral'`) |
| — | Login magic link | `WizardPage.tsx:559` → `POST /auth/public/magic-link` → `magic-link.controller.ts:92` | **YES — awaited before the 200, and the success screen waits on it** | transactional |

Rows 1 and 4 are **mutually exclusive**: row 1 is the pending-NIN branch, row 4 is fired by the client
for everyone else. So it is three provider calls per registration either way — but the composition is
branch-dependent, and roadmap item 7's phrase *"three synchronous outbound emails"* is true of the
**journey**, not of one request.

**Prod timing, measured 2026-08-21** (13-46 R6): submission `16:53:17.676Z` → `campaign_sends` row
`16:53:18.039Z` — **0.36 s later, same request**. That is row 3 landing its ledger write.

⚠️ **"Fire-and-forget" is not "off the request path."** `void`/`.catch()` detaches the *response*, not
the *work*. The socket, the TLS session, the rendered HTML body and the pending promise all live in the
same process, on the same event loop, held for the whole provider round trip. The 201 returns early;
the memory does not.

### 2. 🔴 The failure mode is MEMORY, and it is a cliff, not a slope

Today the fan-out is **unbounded**: nothing anywhere limits how many registration emails are in flight
at once. N simultaneous registrations open ~2N–3N concurrent HTTPS connections to the provider, each
holding a socket, TLS buffers and a fully-rendered HTML body.

The box is **2GB with NO SWAP** — 13-46's own open note records this (*"the VPS has no swap (2GB
total) … a traffic burst, into a throttle, on a box with no swap"*). Without swap the kernel does not
degrade; it **OOM-kills**. There is no p95 that creeps up and warns you first.

Queued, at most **5** of these run at once — `email.worker.ts:248`, `concurrency: 5` — and the rest are
small JSON job records **in Redis, not in the API heap**. For a 200-registration burst that is ~400
simultaneous in-flight provider calls reduced to 5, with ~395 job records waiting in Redis.

> **State it exactly this way and no stronger:** this is a reduction in **peak concurrent in-flight
> provider calls and their resident memory**. It is not a reduction in total work, total CPU, or total
> emails sent. The multiplier is a property of the burst, not a constant — quote it as "5 concurrent
> instead of unbounded", not as a fixed ×120.

### 3. ⛔ The limit, stated once, as a constraint

All 10 BullMQ workers run **inside the API process** — `app.ts:100-104`, dynamic-imported
`initializeWorkers()`, no separate PM2 entry. Therefore queueing buys:

- **bounded concurrency** (5 at a time),
- **durability** (a restart mid-burst resumes; today it drops),
- **retry** (3 attempts, 30s/2min/10min),
- **backpressure and a queue-depth signal**.

It does **not** buy CPU reduction and does **not** buy event-loop isolation. The rendering and the HTTP
call still happen in the API process; they just happen five at a time instead of all at once.

**The PM2 topology is battle-tested and hardened and is NOT being changed (Awwal, 2026-08-22).**
Process isolation is story **11-8**; it stays in backlog and is not touched by this story. This
paragraph is the only place that decision is recorded. Do not restate it, do not re-litigate it, and
do not add "consider a separate worker process" to any task.

### 4. The two gaps this closes that nothing else does

**(a) A transient provider 5xx silently loses a citizen's email today.** `submission-processing.service.ts:1599-1607`:

```ts
if (!result.success) {
  await recordAutoSendFailure({ kind: 'thankyou', respondentId: args.respondentId, error: result.error });
  return;                      // ← counted, logged, and gone. No retry, ever.
}
```

The confirmation path is the same shape. `recordAutoSendFailure` (`email-autosend-monitor.ts:83`) makes
the loss *visible* — 13-21 was written because 140 failures had been swallowed — but visible is not
recovered. Nothing re-sends. On the queue, a 5xx throws, BullMQ retries at 30s/2min/10min, and the
email arrives.

**(b) A restart mid-burst drops every in-flight send with no record.** A deploy, a `pm2 restart`, or an
OOM kill during a jingle takes out every pending promise. There is no row anywhere saying those people
were owed an email. Job records in Redis survive all three.

### 5. What already exists — reuse it; do NOT build a second queue

**`apps/api/src/queues/email.queue.ts`** — queue `'email-notification'` (`:53`), `attempts: 3`,
`backoff: { type: 'custom' }` resolved by the worker's `backoffStrategy` to
`BACKOFF_DELAYS = [30_000, 120_000, 600_000]` (`:46`), `removeOnComplete: {age: 3600, count: 1000}`,
`removeOnFail: {age: 86400}`. Six exported `queue*Email()` producers, each opening with
`if (isTestMode()) return 'test-job-id'` (`:30`). `buildDedupKey` (`:86`), `DEDUP_TTL_SECONDS = 300`.
`deferEmail`/`getDeferredRecipients` (`:146`/`:192`) — the ≥80%-budget shedding path.

**`apps/api/src/workers/email.worker.ts`** — `concurrency: 5` (`:248`), **no rate limiter anywhere**,
six job types in the `switch` at `:170-202`. The registration sends are simply not among them.

**Adding a type touches five coordinated places** (`packages/types/src/email.ts`): the `EmailJobType`
union (`:251`), `EMAIL_TYPE_PRIORITY` (`:257` — a `Record<EmailJobType, …>`, so it fails to compile
until extended), a new `…Job extends BaseEmailJob` interface, the `EmailJob` union (`:340`), and the
`critical | standard` classification. Then in the worker: `getRecipientEmail` (`:38`, **no `default`**
→ compile-enforced), `buildDeferralSummary` (`:53`, **has a `default`** → *not* enforced, will silently
produce a generic string), and the main `switch` (`:170`).

⚠️ **`EmailPriority` (`critical`/`standard`) is not BullMQ priority.** It drives two things only:
whether `checkDedup` runs at all, and whether the ≥80%-budget deferral sheds the job.

### 6. Where each 13-46 guard lives — verified, because they must not move by accident

**Inside `EmailService.dispatch`** (`email.service.ts:103`), in this order — these SURVIVE the move
untouched, because the worker still calls `sendGenericEmail` → `dispatch`:

1. `:117` List-Unsubscribe headers (marketing only, fail-soft)
2. `:140` `attributionTag = campaignId ?? category`
3. `:158-166` **the marketing send cap** — `NotificationMeter.checkCap(category)`, pre-provider, returns `{success:false}` on refusal
4. `:168` the provider call
5. `:171-175` `NotificationMeter.recordEmailSend` (post-send, result discarded)
6. `:186-194` **the `campaign_sends` ledger write** — `isMarketingCategory(category)` only

**NOT inside `dispatch`** — these live in the *caller*, `sendThankYouReferralEmail`, and therefore
**move into the worker with the function**:

| Guard | Site | Failure direction |
|---|---|---|
| `source !== 'public'` gate | `:1522` | — |
| **send-once marker** `metadata.thankyou_referral_sent_at` | check `:1524-1527`, stamp `:1619-1631` | stamp failure = warn, not a counted failure |
| suppression `getSuppressedEmails` | `:1528-1532` | skip on hit |
| **per-address 5-day gap** `getRecentlyContactedEmails` | `:1570-1590` | **fails OPEN** on read error (`:1582-1590`) |
| **`recordRegistrationAutoSend()`** | `:1612` | fire-and-forget Redis `INCR`, **after a confirmed dispatch** |

`MARKETING_CONTACT_GAP_DAYS = 5` (`campaign-contact.service.ts:39`); `recordRegistrationAutoSend` is
defined in `middleware/registration-burst.ts:137` and bumps a **minute-resolution** Redis bucket
`registration:burst:autosends:<YYYY-MM-DDTHH:MM>` read by `evaluateRegistrationBurst`.

🔴 **This is the trap.** Build the job payload at request time and evaluate the guards at request time,
and a job that sits in a backlog dispatches **outside the window its own gate approved**. The gap check
in particular is a *time* window. Every one of these guards must run **in the worker, immediately
before the send**, not at enqueue.

### 7. The one send this story does NOT take off the request path, and why that is written down

`POST /auth/public/magic-link` (`auth.routes.ts:197`) **awaits** the provider before responding
(`magic-link.controller.ts:92`), and `WizardPage.tsx:559` awaits *that* before `setCompletionData`. So
on the active-respondent branch the success screen genuinely waits on Resend.

Two things are true at once and both belong in the record:

- **It is out of scope by instruction** (Awwal, 2026-08-22: do not touch the `/login` flow), and the
  latency argument for queueing a *blocking* send is the wrong way round anyway — a user waiting on a
  screen should not be waiting on a queue.
- **The cheapest correct fix is not in the `/login` flow at all** — it is dropping the `await` on
  `WizardPage.tsx:559`, in the registration wizard's own client code. The client already discards the
  result (`catch {}` at `:561`). That is one keyword. **It is deliberately NOT in this story's ACs.**
  Recorded in Non-goals with a reopen trigger so it is a decision, not an oversight.

### 8. Latency on the registration path — verified, not assumed

The 201 carries the reference code and depends on no send:

```ts
// registration.controller.ts:1426-1454
return res.status(201).json({ status: 'ok', data: {
  respondentId, submissionUid, referenceCode: effectiveReferenceCode, status, pendingNin, authChoice } });
```

The code is minted at `:796`, resolved in the transaction at `:1051`, returned at `:1444`. The email
fan-out was detached at `:1261`, ~165 lines earlier. **Nobody is waiting on any of the three sends this
story queues.** Queueing them adds latency only to *delivery*, and only by the queue's own drain time —
which under the burst this story exists for is precisely the point.

### 9. 13-3's rig measured a read, and cannot do a write as it stands

`apps/api/scripts/load-test.ts` drives autocannon with `{ url, connections, duration, warmup, headers }`
only — **no `method`, no `body`**. Every request is a GET. `LOAD_PROFILE` = 50 connections × 60s,
thresholds p95 < 1500ms / errors < 1% / ≥ 20 req/s (`apps/api/src/lib/load-test-eval.ts`). The prod run
went at `/api/v1/registration/active-form`. Its guard refuses a non-localhost target without
`--i-understand-this-hits-prod`, and every request carries `x-load-test: 13-3` so cf-traffic-watch can
be allow-listed.

🔴 **A write-path test is not the read test with a different path, and the difference is not the HTTP
verb — it is that the requests LEAVE ROWS.** 50 connections × 60s against `POST /wizard` would create
thousands of respondents, users, submissions, magic-link tokens, marketplace profiles and
`campaign_sends` rows on prod, and would fire thousands of real emails at real-looking addresses. AC8
splits the two halves for exactly this reason.

## Non-goals (decisions already made — recorded so they are not re-opened mid-sprint)

1. ⛔ **No new queue, no second worker, no new Redis structure.** Extend `email-notification`. If the
   change wants a new queue, the design is wrong.
2. ⛔ **No PM2 / process-topology change.** §3. Story 11-8 stays in backlog and is not edited.
3. ⛔ **The `/login` magic-link flow is not touched** — not the route, not the controller, not
   `MagicLinkService.sendMagicLinkEmail`'s own body. §7.
   - 🔁 **Reopen trigger, written down so it is a decision:** if AC8's measurement shows
     `POST /auth/public/magic-link` is a material share of peak RSS, or if the success screen's
     time-to-paint is raised as a UX problem, the fix is to drop the `await` at `WizardPage.tsx:559`
     — one keyword, in the wizard's own client code, with the result already discarded. Owner: PM.
4. ⛔ **No change to what any of the three emails SAY**, to their templates, or to whether they are
   sent at all. This story changes *where the send executes*, nothing else.
5. ⛔ **No change to 13-46's cap, throttle or breaker thresholds.** This story composes with them
   (AC5); it does not tune them. 13-46 is `in-progress` in a concurrent review — do not edit its file.
6. ⛔ **No per-job-type queue-depth metric.** `getEmailQueueStats()` reports the queue as one row and
   that is sufficient for AC5. A per-type breakdown is a different story.

## Acceptance Criteria

> **Ordering is load-bearing.** AC1–AC3 move the work. AC4 is the guard that stops the move from
> creating a worse failure than it cures, and **must be green before AC1's transactional types ship**.
> AC8 is the measurement that discharges the gate, and it cannot be run until AC1–AC5 are in the tree.

1. **AC1 — The three registration sends are ENQUEUED, not dialled, and the enqueue is on the existing queue.**
   Three new job types are added to `email-notification` — one per row 1–3 of §1 — and the call sites
   at `registration.controller.ts:1391`, `submission-processing.service.ts:1385` and `:1393` enqueue
   instead of calling the provider.
   - Names follow the `{domain}-{action}` kebab-case rule (`project-context.md` §10) and are distinct
     from the six existing types.
   - **The payload carries IDENTIFIERS, not a rendered email.** `respondentId`, `email`, `referenceCode`,
     `status`, and for the magic link the already-issued token — never a pre-rendered HTML body. A
     rendered body in a job record puts the thing this story is removing from the heap into Redis
     instead, and it goes stale.
   - ⚠️ **`MagicLinkService.issueToken` stays where it is, awaited, on the request** (`:1383`). Only the
     *send* is queued. The token is what the reminder worker references; minting it in a worker
     introduces a window where a pending-NIN respondent exists with no token.
   - All five coordination points in `packages/types/src/email.ts` (§5) are updated, and the worker's
     `buildDeferralSummary` case is added **explicitly** — its `default` will otherwise swallow the
     omission silently.
   - `isTestMode()` short-circuit replicated in every new producer, per the existing six.
2. **AC2 — A retried job must not double-send, and the mechanism is the MARKER, not the dedup key.**
   - **The whole guard block moves into the worker handler, in its existing order** (§6): source gate →
     send-once marker check → suppression → 5-day gap → render → dispatch → `recordRegistrationAutoSend()`
     → stamp the marker. Not just the `sendGenericEmail` call. A guard evaluated at enqueue time and a
     send executed minutes later is a guard that did not run.
   - **A test that would FAIL if the marker check were deleted**: run the worker handler twice for the
     same `respondentId` with the marker already stamped by the first run, and assert the provider was
     called **exactly once**. Asserting "one email arrived" over a path that never re-entered the guard
     is [[pattern-test-that-passes-over-a-hole]].
   - **State the residual honestly rather than engineering it away.** The marker is stamped *after* a
     confirmed dispatch (`:1619-1631`), by existing deliberate design (13-21 review M1). A crash in the
     window between provider-success and stamp still yields one duplicate on retry. That window is
     **unchanged** by this story — do not claim the queue closes it. What the queue *does* change is
     that the window is now entered up to 3 times instead of once; record that, and record why it is
     accepted (a duplicate thank-you is a nuisance; a lost one is a citizen who never heard from us).
   - ⛔ **`buildDedupKey` is NOT the answer and must not be cited as one** — produce-side, non-atomic
     `EXISTS`-then-`SET`, 300s TTL, skipped for `critical`. The third retry lands at 10 min. If the
     dedup key is used at all it is belt-and-braces on the marker, never instead of it.
3. **AC3 — The reference confirmation and the magic link stay TRANSACTIONAL; only the thank-you is marketing.**
   - The two transactional types pass **no `category`** to `sendGenericEmail`, exactly as today
     (`:1462`, `magic-link.service.ts:377`), so they remain outside the marketing cap, outside the
     `campaign_sends` ledger, and outside the 5-day gap. **Giving a reference-code email a marketing
     category would put a citizen's own registration code behind a marketing throttle.**
   - They are classified `critical` in `EMAIL_TYPE_PRIORITY`, so the ≥80%-budget deferral
     (`email.worker.ts:134`) can never shed them.
   - The thank-you keeps category `'thankyou-referral'` and campaign `'thankyou-referral-auto'`, stays
     `standard`, and therefore stays under 13-46's cap and inside the ledger. A test asserts the cap
     still refuses it and the ledger row is still written, **from the worker**.
4. **AC4 — 🔴 Budget exhaustion must not be able to stop a citizen's transactional email.**
   `email.worker.ts:92` today pauses the WHOLE queue and throws when `checkBudget()` denies. Putting
   magic links and reference codes on that queue makes an exhausted marketing budget a transactional
   outage that cannot happen today (§ authoring note (ii)).
   - The budget gate must **not** apply to `critical` job types: they proceed, and the pause/throw path
     is reached only for `standard` work.
   - A test that would fail if the exemption were removed: with `checkBudget()` denying, assert a
     `critical` registration job still dispatches **and** that `pauseEmailQueue()` was not called for it.
   - **Also assert the converse** — a `standard` thank-you under the same denial still pauses and
     throws, i.e. 13-46's spend control is intact.
   - ⚠️ `getRecipientEmail` (`:38`) is compile-enforced; `buildDeferralSummary` (`:53`) is not. Add both.
5. **AC5 — Queue depth becomes a burst signal, composing with 13-46's breaker rather than duplicating it.**
   - `evaluateRegistrationBurst`'s window read gains the `email-notification` **waiting** depth from
     `getEmailQueueStats()`, reported as one additional field in the single existing Telegram message.
     **No second alert, no second threshold, no second cooldown** — 13-46 owns the breaker.
   - 🔴 **Name the new blind spot in the message text itself.** `recordRegistrationAutoSend()` now fires
     at **worker** time, on a minute-resolution bucket (§6). Under a backlog the auto-send count **lags
     the submit count in the same window**, so "300 submits, 40 auto-sends" now reads as *queued*, not
     as *stopped*. Before this story those two numbers moved together. The depth field is what makes the
     lag legible; a reader who sees only the counts will misdiagnose it.
   - `recordRegistrationAutoSend()` **stays after a confirmed dispatch** — it counts sends, not
     intentions, and 13-46 judges marketing headroom with it. Do not move it to enqueue.
6. **AC6 — Failure telemetry survives, and stops crying wolf on attempt 1.**
   - `recordAutoSendFailure` (`email-autosend-monitor.ts:83`) fires **only on final failure** — i.e.
     when `job.attemptsMade + 1 >= job.opts.attempts`, the same condition `logEmailFailureToAudit`
     already uses (`email.worker.ts:~236`). A transient 5xx that succeeds on retry must not count as a
     failure; 13-21 built that counter to page an operator, and a paging counter that fires on
     recoverable events is a counter the operator learns to ignore.
   - The controller's one-shot Telegram page on side-effect failure (`registration.controller.ts:1290-1295`)
     still fires for an **enqueue** failure — a Redis outage during a jingle must stay loud. Its text is
     updated: it currently says the auto-emails "may not have queued", which becomes literally true.
   - A test asserts: transient failure on attempts 1–2 → no `recordAutoSendFailure`; failure on the
     final attempt → exactly one.
7. **AC7 — The `void` fan-out at the call sites is left in place, and that is deliberate.**
   `runPostSubmissionSideEffects` is called from **two** places — the wizard (`registration.controller.ts:1261`)
   and the enumerator/clerk queue worker (`submission-processing.service.ts:445`). Both keep their
   existing detachment and their existing `.catch()`.
   - The enqueue is fast and local, but it is not free and it can throw (Redis). Making the 201 depend
     on Redis would trade an email outage for a **registration** outage — the exact inversion 9-26
     taught. The existing comment at `:1249-1254` already states this rule; do not "tidy" it.
   - A test asserts `POST /wizard` still returns 201 when the enqueue rejects.
8. **AC8 — 🎯 The measurement that discharges roadmap gate item 7. Two halves, because they carry different blast radii.**
   Extend `apps/api/scripts/load-test.ts` to support `--method` and `--body` (it is GET-only today, §9),
   keeping its non-localhost refusal, its `x-load-test` header and the pure evaluator in
   `apps/api/src/lib/load-test-eval.ts` unchanged.
   - **Half A — draft-save at the modelled peak.** `PUT /api/v1/registration/draft` at the stated peak
     (default `LOAD_PROFILE`: 50 × 60s; the operator confirms/raises it to the modelled jingle reach
     before the run). This is the high-volume half of the write path — the wizard autosaves — and its
     rows are `wizard_drafts` keyed by resume token, cheap to enumerate and delete.
   - **Half B — submit, bounded and SMALL.** `POST /wizard` at a deliberately small N, because each
     request creates a respondent, a user, a submission, a magic-link token, a marketplace profile and
     possibly a `campaign_sends` row, **and sends real email**. Use the established smoke tagging
     (surname `ZZSMOKE`, the `7000000001x` NIN sentinel series, phones `0800000001x`, a `+tag` address
     the operator controls) and tear down with the **child-first chain** at
     `docs/runbooks/13-3-cutover-and-failover.md:66-80` — reading every `DELETE n`, never restoring to a
     baseline number.
     ⚠️ **`campaign_sends` above all**: 13-46's per-address throttle reads that ledger, so a leftover row
     silently suppresses the next real thank-you to that address for the whole 5-day window.
   - **The reading is RSS + CPU + queue depth, from the two functions named correctly (§ authoring note (iv)):**
     `getSystemHealth` in **`operations.service.ts:93`** for `pm2Memory` / `pm2CpuPct` / `pm2RestartCount`
     / `ramUsedPct` (this is 13-3's rig), **and** `MonitoringService.getSystemHealth`
     (`monitoring.service.ts:59`) for `queues[].waiting` — noting its **10-second cache** (`CACHE_TTL_MS`),
     which sets the sampling floor. `pm2RestartCount` moving during a run **is the OOM kill** and is a
     RED verdict regardless of latency.
   - **The finding must be a COMPARISON, not a single number.** Run each half **before** the queue change
     and **after**, on the same box with the same profile, and report peak RSS and peak concurrent
     provider calls for both. "It didn't fall over" is not evidence that the change did anything —
     [[pattern-a-record-about-the-work-is-not-the-work]].
   - **Where it runs is a recorded decision, not a default.** Prod is the only 2GB/no-swap box, and it is
     also the only box where the rows and the emails are real. Write down which box each half ran on and
     what that costs the conclusion. A local run on a 16GB laptop cannot reach the OOM cliff and must not
     be reported as if it had.
   - **The verdict and its inputs land in `docs/runbooks/13-3-cutover-and-failover.md`** beside 13-3's
     existing capacity note, and gate item 7's three docs are flipped from "needs a story" to the
     recorded result.
9. **AC9 — The story states its own limit in the artefacts, in the same words every time.**
   The queue buys **bounded concurrency, durability, retry and backpressure**; it does **not** reduce
   total CPU and does **not** give event-loop isolation, because the workers run in the API process.
   That sentence (or one materially identical) appears in: the roadmap gate-item-7 discharge, the
   runbook entry, and the code comment on the new worker cases.
   - ⛔ Nowhere in any artefact does the phrase "process isolation", "separate worker process" or
     "11-8" appear as a follow-up, a recommendation or a next step. §3 is the whole record.

## Tasks / Subtasks

- [ ] **Task 1 — Types + producers** (AC: #1, #3)
  - [ ] `packages/types/src/email.ts`: three `…EmailData` interfaces, `EmailJobType` union (`:251`),
        `EMAIL_TYPE_PRIORITY` (`:257`, two `critical` + one `standard`), three `…Job` interfaces,
        `EmailJob` union (`:340`).
  - [ ] `email.queue.ts`: three `queue*Email()` producers with the `isTestMode()` guard; `checkDedup`
        prelude on the `standard` one only.
  - [ ] Update the counting invariants in `queues/__tests__/email-backpressure.test.ts` —
        `toHaveLength(2)` / `(4)` / `(6)` at `:57`, `:58`, `:63` and **both** hardcoded `allTypes`
        arrays (`:121`, `:334`). These fail loudly; that is the mechanism working.
- [ ] **Task 2 — Worker handlers, with the guards moved in whole** (AC: #2, #3, #4)
  - [ ] `email.worker.ts`: three `switch` cases (`:170`), `getRecipientEmail` (`:38`),
        `buildDeferralSummary` (`:53`).
  - [ ] Move `sendReferenceConfirmationEmail` and `sendThankYouReferralEmail` bodies to worker-invoked
        handlers, preserving the guard ORDER of §6 verbatim. ⚠️ Both are `private static` on
        `SubmissionProcessingService` today — they must be relocated, not merely widened (see the
        circular-import note in Dev Notes).
  - [ ] Exempt `critical` types from the budget-exhaustion pause/throw (`:92`).
  - [ ] Worker-level tests using the captured-processor harness in
        `workers/__tests__/marketplace-extraction.worker.test.ts` (`:1-60`) — there is **no**
        `email.worker.test.ts` today; this story creates one.
- [ ] **Task 3 — Call sites** (AC: #1, #7)
  - [ ] `registration.controller.ts:1391` → enqueue (keep `issueToken` awaited at `:1383`).
  - [ ] `submission-processing.service.ts:1385`, `:1393` → enqueue.
  - [ ] Leave both `void` fan-outs and their `.catch()` intact; update the Telegram text (`:1290-1295`).
  - [ ] Route test: `POST /wizard` still 201s when the enqueue rejects.
- [ ] **Task 4 — Burst-breaker composition** (AC: #5)
  - [ ] Add `waiting` depth to `evaluateRegistrationBurst`'s window read and to the single existing
        message; extend `lib/__tests__/registration-burst.test.ts`.
  - [ ] Write the lag caveat into the message text, not only into a comment.
- [ ] **Task 5 — Failure telemetry** (AC: #6)
  - [ ] Gate `recordAutoSendFailure` on the final attempt; test attempts 1–2 vs final.
- [ ] **Task 6 — Load-test rig** (AC: #8)
  - [ ] `--method` / `--body` in `scripts/load-test.ts`; keep the prod refusal and `x-load-test`.
  - [ ] Unit-test the arg parsing and the unchanged evaluator (`scripts/` is outside tsconfig — **run
        it, don't trust `tsc`**).
- [ ] **Task 7 — OPERATOR: run both halves, before and after** (AC: #8)
  - [ ] Record box, profile, peak RSS, peak CPU, `pm2RestartCount` delta, peak queue depth, verdict.
  - [ ] Half B teardown by the child-first chain, `DELETE n` counts read, `campaign_sends` confirmed clear.
- [ ] **Task 8 — Docs parity** (AC: #8, #9)
  - [ ] `docs/roadmap-to-launch.md` item 7, `docs/runbooks/pre-viral-push-checklist.md` §0,
        `docs/runbooks/enumerator-prod-smoke-and-golive-gate.md` row 7 → the recorded result.
  - [ ] `docs/runbooks/13-3-cutover-and-failover.md` → the comparison and its verdict.
  - [ ] The §3 limit sentence, identically worded, in all three.

## Dev Notes

### The one line a reviewer should hold on to

**Detaching a promise moves the response off the send; it does not move the send off the box.** Every
one of these three calls is already `void`/`.catch()`-ed, and every one of them still holds a socket, a
TLS session and a rendered body in a 2GB heap with no swap for the whole provider round trip. The queue
is the first thing in this codebase that puts a **number** on how many of those may exist at once.

### Why this is one story and not two

Roadmap item 7 offers three discharges and says any one is enough. Building only (b) leaves the gate
open on an unmeasured claim; building only (a) measures a system nobody improved. Awwal's instruction
(2026-08-22) is to do both, and they are cheaper together: the same rig, run twice, **is** the evidence
that (b) worked, and the before/after comparison is worth more than either number alone.

### The trade AC1 makes, stated so nobody re-litigates it under pressure

Delivery gets slower. Under the burst this story exists for, a thank-you might arrive minutes after the
registration instead of 0.36 s after it. That is not a regression — it is the mechanism. The reference
code is already on the user's screen (§8), the confirmation is a record not a key, and the magic link is
a resume path used over days. **What is bought is that the box is still running to send them.**

### The idempotency reasoning, in one place

Three mechanisms, and only one of them is load-bearing:

| Mechanism | Scope | Covers a worker retry? |
|---|---|---|
| `buildDedupKey` | produce-side, 300s, `standard` only, non-atomic | ❌ — third retry lands at 10 min |
| BullMQ `attempts: 3` | delivery | ❌ — it *causes* the re-entry |
| **`metadata.thankyou_referral_sent_at`** | DB, permanent | ✅ — **this is the one** |

The confirmation email has **no** equivalent marker today. It is gated only on `isNew && referenceCode`
(`:1384`), which is a property of the submission, not of the send — so a retry after a successful
dispatch re-sends it. Decide this explicitly in the dev pass: either accept it (a duplicate
confirmation is low-harm and today's fail-soft already loses them outright) or add a marker in the same
JSONB shape. **Do not leave it undecided and unstated** — that is the class 13-46's ledger exists to catch.

### 🔴 Put the handlers in their OWN module — the obvious placement is a circular import

The two handler bodies are `private static` members of `SubmissionProcessingService`, and that service
already imports `email.queue.ts`, `marketplace-extraction.queue.ts` and `fraud-detection.queue.ts`. If
`email.worker.ts` reaches back into `SubmissionProcessingService` to run them, the cycle is
`worker → submission-processing → queues`, and the worker is itself pulled in by `workers/index.ts` at
app boot behind a top-level `await` (`app.ts:100-104`). ESM cycles here fail as `undefined` at call
time, not as a build error — the worst shape.

**Put the three handlers in a dedicated module** (e.g. `apps/api/src/services/registration-email-jobs.ts`)
that imports `EmailService`, `db`, the suppression/gap helpers and `recordRegistrationAutoSend`, and is
imported by the worker only. `SubmissionProcessingService` then imports the *producers* from
`email.queue.ts` and nothing else changes about its shape. Do not solve this by making the private
methods public.

### Testing standards

- `vitest`, `vi.hoisted()` + `vi.mock()`. Worker tests: the captured-processor harness
  (`marketplace-extraction.worker.test.ts:1-60` — `vi.mock('bullmq')` whose `MockWorker` captures the
  processor so it can be invoked directly with a fake job), plus `vi.mock('ioredis')` and a mocked `db`.
- ⚠️ `isTestMode()` makes every producer return `'test-job-id'` without touching Redis, so an
  integration test **cannot** observe a real enqueue. Assert on the mocked producer, or drive the
  processor directly.
- ⛔ **One vitest suite at a time across BOTH worktrees** — a pre-push hook runs the full suite per
  tree, and two at once is the memory cliff. ⚠️ turbo uses a shared worktree cache, so a guard result
  from one tree can replay in the other; run a guard **direct** after a status flip.
- Integration tests (real DB) use `beforeAll`/`afterAll`, never per-test hooks.

### Project Structure Notes

- **Types:** `packages/types/src/email.ts` — five coordinated edits (§5).
- **Queue/worker:** `apps/api/src/queues/email.queue.ts`, `apps/api/src/workers/email.worker.ts`.
- **Callers:** `apps/api/src/controllers/registration.controller.ts`,
  `apps/api/src/services/submission-processing.service.ts`.
- **Breaker:** `apps/api/src/lib/registration-burst.ts` + `apps/api/src/middleware/registration-burst.ts`
  (13-46, uncommitted in this tree — rebase before starting).
- **Rig:** `apps/api/scripts/load-test.ts` (outside tsconfig) + `apps/api/src/lib/load-test-eval.ts` (inside).
- ⚠️ **Drizzle schema files must not import from `@oslsr/types`.** Not expected to bite here — no schema
  change — but the marker stamp is raw SQL (`:1619-1631`) and stays that way.

### Dependencies and relationships

- **13-46** (`in-progress`) — this story consumes its cap, throttle and breaker and must not edit its
  story file or retune its constants. Its dev work is **uncommitted in this worktree**.
- **13-3** — owns the load-test rig and the capacity runbook; this story extends both.
- **13-21** — owns `recordAutoSendFailure`; AC6 changes *when* it fires, not *whether*.
- **13-12** — owns the evergreen thank-you and its send-once marker.
- **11-8** — process isolation. **Backlog. Not touched. Not referenced as a next step.** §3.

### References

- [Source: `apps/api/src/controllers/registration.controller.ts:1249-1300,1381-1400,1426-1454`] — the fan-out, the pending-NIN link, the 201
- [Source: `apps/api/src/services/submission-processing.service.ts:1307-1330,1375-1394,1412-1470,1514-1656`] — side-effects, the two auto-emails, the guard block
- [Source: `apps/api/src/services/email.service.ts:103-194,895-927`] — `dispatch` guard order, `sendGenericEmail`
- [Source: `apps/api/src/services/campaign-contact.service.ts:39,103-117`] — `MARKETING_CONTACT_GAP_DAYS`, `getRecentlyContactedEmails`
- [Source: `apps/api/src/middleware/registration-burst.ts:33-52,95-139`] — buckets, `evaluateRegistrationBurst`, `recordRegistrationAutoSend`
- [Source: `apps/api/src/services/email-autosend-monitor.ts:83-110`] — `recordAutoSendFailure`
- [Source: `apps/api/src/queues/email.queue.ts:30,46,53-71,86-128,146-243,419`] — test guard, backoff, queue opts, dedup, deferral, stats
- [Source: `apps/api/src/workers/email.worker.ts:32-33,38-61,72-165,170-202,225-244,248`] — thresholds, switches, budget gate, deferral, error path, concurrency
- [Source: `apps/api/src/workers/index.ts:46-91`] · [Source: `apps/api/src/app.ts:100-104`] — all 10 workers in the API process
- [Source: `packages/types/src/email.ts:247,251,257-264,273,282-340`] — the five coordination points
- [Source: `apps/api/src/services/monitoring.service.ts:50,59,218-234`] — queue depths, 10s cache
- [Source: `apps/api/src/services/operations.service.ts:93,456`] — pm2 RSS/CPU (13-3's reading)
- [Source: `apps/api/src/services/magic-link.service.ts:334-388`] · [Source: `apps/api/src/controllers/magic-link.controller.ts:84-100`] · [Source: `apps/web/src/features/registration/pages/WizardPage.tsx:553-564`] — the one blocking send, out of scope
- [Source: `apps/api/scripts/load-test.ts:23-87`] · [Source: `apps/api/src/lib/load-test-eval.ts:17-29`] — GET-only rig, profile, thresholds
- [Source: `apps/api/src/queues/__tests__/email-backpressure.test.ts:57-63,120-130,333-347`] — the invariants Task 1 breaks
- [Source: `apps/api/src/workers/__tests__/marketplace-extraction.worker.test.ts:1-60`] — the captured-processor harness
- [Source: `docs/roadmap-to-launch.md` § Pre-flight gate item 7] — the gate this story discharges
- [Source: `docs/runbooks/13-3-cutover-and-failover.md:7,36,66-80`] — capacity note, dashboard reading, teardown chain
- [Source: `_bmad-output/implementation-artifacts/13-46-public-burst-readiness-send-caps-and-registration-throttle.md` § Residual ledger R6] — the 3N finding and its reopen trigger
- [Source: `_bmad-output/project-context.md` §5, §10] — log-event naming, BullMQ job-name and retry patterns

## Dev Agent Record

### Context Reference

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change | By |
|------|--------|-----|
| 2026-08-22 | **Story drafted** to discharge `roadmap-to-launch.md` pre-flight gate item 7 by BOTH of its offered routes — (b) queue the registration sends and (a) measure the write path — authored as ONE story on Awwal's explicit instruction not to split it into gating and non-gating halves. Carries 13-46 residual **R6**. **Four corrections against the drafting brief, each verified against the tree, three of which changed an AC:** (i) 🔴 the brief assumes the registration path has no user-blocking send because the blocking magic link is "the `/login` flow" — but `WizardPage.tsx:559` **awaits** `POST /auth/public/magic-link` before painting the success screen, and `magic-link.controller.ts:92` awaits the provider before its 200, so the registration journey *does* block on a send; it is out of scope by instruction, and §7 + Non-goal 3 record the one-keyword fix and a reopen trigger rather than losing the finding. (ii) 🔴 **queueing creates a failure mode that does not exist today** — `email.worker.ts:92` pauses the WHOLE queue and throws on budget exhaustion, so naively queued magic links and reference codes would be stopped by an exhausted *marketing* budget; AC4 exists solely for this. (iii) the dedup key cannot answer the retry question the brief raised — produce-side, non-atomic, 300s TTL, skipped for `critical`, while the third retry lands at 10 min — so AC2 moves the **whole guard block** into the worker and names the send-once marker as the only load-bearing mechanism, while stating honestly that the send-then-stamp window is *unchanged* and merely entered up to 3× instead of once. (iv) `getSystemHealth` is **two different functions** — `operations.service.ts:93` (pm2 RSS/CPU, what 13-3 actually read) and `monitoring.service.ts:59` (queue depths, 10s cache) — and AC8 needs both, since naming the wrong one yields a measurement with no memory figure. Also found: the confirmation email has **no** send-once marker at all, so AC2 forces that decision to be made and stated rather than left implicit; and 13-3's rig is **GET-only** (no `method`/`body`), so AC8 splits draft-save (high volume, cheap teardown) from submit (small N, real rows, real email, child-first teardown) because a write test *leaves rows*. **The PM2 topology is recorded ONCE, in §3, as a constraint** — battle-tested and hardened, not changing (Awwal, 2026-08-22); story 11-8 stays in backlog and AC9 forbids "process isolation" appearing as a follow-up in any artefact. The claim is bounded throughout to **bounded concurrency, durability, retry and backpressure — never CPU reduction or event-loop isolation**, since all 10 workers run in the API process. 9 ACs / 8 Tasks. Status `ready-for-dev`. | Bob (SM) |
