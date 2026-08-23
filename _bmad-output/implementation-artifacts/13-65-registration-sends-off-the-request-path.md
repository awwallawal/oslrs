# Story 13-65: Take the registration sends off the request path — bounded concurrency, and an email that survives a 5xx

Status: review

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

- [x] **Task 1 — Types + producers** (AC: #1, #3)
  - [x] `packages/types/src/email.ts`: three `…EmailData` interfaces, `EmailJobType` union,
        `EMAIL_TYPE_PRIORITY` (two `critical` + one `standard`), three `…Job` interfaces, `EmailJob` union.
  - [x] `email.queue.ts`: three `queue*Email()` producers with the `isTestMode()` guard; `checkDedup`
        prelude on the `standard` one only.
  - [x] Updated the counting invariants in `queues/__tests__/email-backpressure.test.ts` — 2+4 → **4+5**,
        6 → **9** types, and BOTH hardcoded `allTypes` arrays. They failed loudly first; that is the
        mechanism working. Added two direct classification assertions on top.
- [x] **Task 2 — Worker handlers, with the guards moved in whole** (AC: #2, #3, #4)
  - [x] `email.worker.ts`: three `switch` cases, `getRecipientEmail`, `buildDeferralSummary`.
  - [x] Both bodies RELOCATED (not widened) to `services/registration-email-jobs.ts`, guard ORDER of §6
        preserved verbatim.
  - [x] 🔴 `critical` types exempted from the budget-exhaustion pause/throw, **with the converse pinned**.
  - [x] New `workers/__tests__/email.worker.test.ts` using the captured-processor harness (there was no
        such file before this story).
- [x] **Task 3 — Call sites** (AC: #1, #7)
  - [x] `registration.controller.ts` → enqueue (`issueToken` stays awaited on the request).
  - [x] `submission-processing.service.ts` `sendRegistrationAutoEmails` → enqueue.
  - [x] Both `void` fan-outs at the two CALL SITES left intact with their `.catch()`; Telegram text updated.
  - [x] Route test: `POST /wizard` still 201s when the enqueue rejects — falsified (500 without the guard).
- [x] **Task 4 — Burst-breaker composition** (AC: #5)
  - [x] `emailQueueWaiting` added to the window read and to the single existing message; extended both
        `lib/__tests__/registration-burst.test.ts` and `middleware/__tests__/registration-burst.test.ts`.
  - [x] The lag caveat is in the MESSAGE TEXT, with a test asserting the wording is there.
- [x] **Task 5 — Failure telemetry** (AC: #6)
  - [x] `recordAutoSendFailure` gated on the final attempt; attempts 1–2 vs final both tested.
- [x] **Task 6 — Load-test rig** (AC: #8)
  - [x] `--method` / `--body`; prod refusal and `x-load-test` unchanged; evaluator untouched.
  - [x] Arg parsing + refusal moved INTO `src/lib/load-test-eval.ts` so they are type-checked and
        unit-tested; the script was also RUN (dry-run, write dry-run, prod refusal, both arg errors).
- [ ] **Task 7 — OPERATOR: run both halves, before and after** (AC: #8) — ⛔ **NOT DONE. DELIBERATELY DEFERRED
      TO WEEK 1 OF THE FLIGHT; this is the reason the story is `review` and gate item 7 is still RED.**
  - [ ] Record box, profile, peak RSS, peak CPU, `pm2RestartCount` delta, peak queue depth, verdict.
  - [ ] Half B teardown by the child-first chain, `DELETE n` counts read, `campaign_sends` confirmed clear.
  - See Completion Notes → "What was NOT done" for the reasoning and the BEFORE-half warning.
- [x] **Task 8 — Docs parity** (AC: #8, #9)
  - [x] `docs/roadmap-to-launch.md` item 7, `docs/runbooks/pre-viral-push-checklist.md` §0,
        `docs/runbooks/enumerator-prod-smoke-and-golive-gate.md` row 7 — recorded as **half discharged**,
        NOT flipped to green.
  - [x] `docs/runbooks/13-3-cutover-and-failover.md` → the method, both halves, both readings, the
        blind-spot warning, and an EMPTY verdict table to be filled in.
  - [x] The §3 limit sentence, identically worded, in all of them (verified by grep).

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

- Story file (this document), read in full before any edit.
- `_bmad-output/project-context.md` §5 (log-event naming), §10 (`{domain}-{action}` job names).
- The 13-46 dev work is COMMITTED in this worktree (`d496abf`), not uncommitted as the story's Project
  Structure note assumed — so no rebase was needed, but every line reference in the story is ~9 lines
  short of the tree. Verified each one against the code rather than trusting the number.

### Agent Model Used

claude-opus-5[1m] (BMAD DEV agent, `dev-story` workflow)

### Debug Log References

**Falsification runs — every guard this story adds was verified to be load-bearing by deleting it and
watching the suite go red, then restoring:**

| Guard deleted | Result | Restored |
|---|---|---|
| AC4 `critical` exemption (`emailPriority !== 'critical'`) | 4 red in `email.worker.test.ts`; both CONVERSE tests stayed green | ✅ |
| AC4 exemption widened to ALL types | exactly the 2 CONVERSE tests went red | ✅ |
| thank-you send-once marker check | AC2 integration test red | ✅ (see below) |
| confirmation send-once marker check | AC2 integration test red | ✅ |
| `void`/`.catch()` detachment at `registration.controller.ts` | route test red — **500 instead of 201** | ✅ |

🔴 **The falsification caught a hole in my own test, which is why it was worth running.** The first
version of the AC2 thank-you double-send test PASSED with the marker check deleted — 13-46's
per-address `campaign_sends` gap was suppressing the second send, so the test never entered the guard
it claimed to prove. That is exactly `[[pattern-test-that-passes-over-a-hole]]`, named by AC2 itself.
Fixed by deleting the ledger row between the two runs, which both isolates the marker AND models a
real state (`recordCampaignSend` is fail-soft, so "dispatched, no ledger row" genuinely happens). A
CONTROL test was added alongside it: with BOTH the ledger row and the marker gone, it DOES send twice
— otherwise "one email" could be true because the test was inert.

### Completion Notes List

**AC-by-AC.**

- **AC1 — done.** Three job types (`registration-magic-link`, `registration-confirmation`,
  `registration-thankyou`), all five coordination points in `packages/types/src/email.ts`, three
  producers with the `isTestMode()` short-circuit, all three call sites enqueueing. Payloads carry
  IDENTIFIERS ONLY — asserted, not just intended (`expect(payload).not.toHaveProperty('html')`).
  `MagicLinkService.issueToken` stays awaited on the request.
- **AC2 — done.** The WHOLE guard block moved into `services/registration-email-jobs.ts` in its
  original order. `buildDedupKey` is used only as belt-and-braces on the `standard` producer and is
  explicitly documented as NOT the mechanism. The send-then-stamp window is recorded as UNCHANGED and
  now entered up to 3× instead of once, with the acceptance reasoning, in the module header.
- **AC3 — done.** Both transactional types pass NO `category` (asserted:
  `expect(sendGenericEmail.mock.calls[0]).toHaveLength(1)`), are classified `critical`, and are proven
  NOT refused by an exhausted marketing cap. The thank-you keeps `thankyou-referral` /
  `thankyou-referral-auto`, stays `standard`, and its cap refusal + ledger row are both asserted FROM
  THE WORKER against a real DB.
- **AC4 — done, and this was the red line.** `critical` is exempt from the queue-wide pause/throw;
  `standard` still pauses and still throws. Both directions falsified (table above). A distinct
  `email.job.budget_exhausted_critical_exempt` warn keeps the exemption visible, and
  `budgetService.recordSend()` still counts every critical send so overage stays measurable.
- **AC5 — done.** `emailQueueWaiting` added to `BurstCounts`, read fail-soft in its OWN try/catch (a
  queue-read failure degrades to "unavailable" and must never swallow the page it annotates — tested).
  `evaluateBurst` never reads it: tested that a 100,000-deep queue on quiet traffic produces NO
  finding, and that a burst still pages with an empty queue. The lag caveat is in the message TEXT.
  `recordRegistrationAutoSend()` stayed after a confirmed dispatch.
- **AC6 — done.** `recordAutoSendFailure` fires only when `job.attemptsMade + 1 >= job.opts.attempts`,
  passed to the handlers as `RegistrationJobContext.isFinalAttempt`. Attempts 1–2 → none; final →
  exactly one. Both kinds tested. The controller's Telegram text now states the literal truth.
- **AC7 — done.** Both `void` fan-outs at the CALL SITES kept, with their `.catch()`. Route test
  asserts the 201 survives a rejected enqueue, and was falsified (500 without it).
- **AC8 — HALF done.** Rig built, method written, unit-tested, and RUN (arg paths exercised). **The
  measurement itself has not run — see below.**
- **AC9 — done.** The bounded sentence appears identically in the roadmap discharge, the 13-3 runbook
  entry, both operator checklists, and materially identically in the code comments on the new worker
  cases. Verified by grep that "process isolation" / "separate worker process" / "11-8" appear nowhere
  in any artefact this story touched.

---

**🔴 TWO DEFECTS THIS STORY'S OWN TESTS FOUND IN MY FIRST IMPLEMENTATION, both fixed:**

1. **A detached enqueue became an UNHANDLED REJECTION and silently disarmed AC6.** I first kept
   `void this.sendRegistrationAutoEmails(...)` inside `runPostSubmissionSideEffects`, matching the old
   shape. That was correct while the emails DIALLED a provider; it is wrong now they are an enqueue,
   because a rejecting enqueue (Redis down during a jingle) is invisible to the caller — so the
   wizard's one-shot Telegram page, whose entire job is to make that outage loud, could never fire.
   The integration suite surfaced it as an unhandled error. Fixed: the enqueue is now awaited, exactly
   like the marketplace and fraud enqueues beside it, and the rejection propagates to the caller's
   `.catch()`. The 201 is still protected — at the CALL SITE, which is where AC7 puts it.
2. **My AC2 test passed over a hole** — see Debug Log above.

**⚠️ CONSUMER SWEEP — two batch callers of `sendRegistrationAutoEmails` changed behaviour, and one of
them would have lied to the operator.** `scripts/_backfill-registration-autosends.ts` re-read the
send-once markers immediately after each send to report what had ACTUALLY been delivered. With an
enqueue, the worker stamps those markers seconds-to-minutes later, so an immediate re-read returns a
guaranteed `false` and the script would have reported **100% failure on a fully successful run** —
`[[pattern-a-record-about-the-work-is-not-the-work]]`, and the operator's next move would have been to
re-run it. Fixed: the loop now counts ENQUEUES, `readMarkers()` was removed with the reasoning
written where it stood, and the apply pass prints the delivery-confirmation procedure (re-run
`--dry-run` after the queue drains; the remaining-eligible count is marker-derived, so it going to ~0
IS the evidence). `services/draft-adoption/send.ts` also now enqueues its thank-you half; annotated,
behaviour otherwise unchanged (the adoption confirmation it reports on is still sent inline).

---

**⛔ WHAT WAS NOT DONE, AND WHY.**

- **Task 7 / the AC8 MEASUREMENT did not run, so gate item 7 is NOT discharged and all three docs stay
  RED.** Awwal's instruction was not to block the story on a synthetic load test: the first radio spot
  is **Monday 24 August 2026 (Fresh FM Ibadan, one station, one 60-second spot)** — a real measurement,
  small blast radius, two days out. Hundreds of synthetic registrations against prod would create
  thousands of respondents, users, submissions, magic-link tokens, marketplace profiles and
  `campaign_sends` rows and fire thousands of real emails at real-looking addresses. The rig, the
  method, both readings (correctly named — `operations.service.ts` for pm2 RSS/CPU, and
  `MonitoringService.getSystemHealth` for `queues[].waiting` with its 10s cache), the teardown chain
  and an EMPTY verdict table are in `13-3-cutover-and-failover.md` § *Write-path capacity (13-65 AC8)*.
  🔴 **OPERATOR ACTION, TIME-CRITICAL: the BEFORE half must be captured from the currently-deployed
  build — i.e. BEFORE 13-65 deploys — or the comparison has only one side and can never be recovered.**
- **`WizardPage.tsx:559` was left alone**, per §7 / Non-goal 3, with its reopen trigger intact. Not
  touched, not tidied.
- **`magic-link.service.ts` was NOT modified at all**, taking the conservative reading of Non-goal 3
  ("not `MagicLinkService.sendMagicLinkEmail`'s own body"). **The honest cost, stated rather than
  glossed:** that method SWALLOWS a provider failure by deliberate security design (never reveal
  whether an address exists), so the queued magic-link job gains bounded concurrency, durability and
  backpressure but **NOT retry-on-5xx** — a provider refusal is still logged and dropped, exactly as
  today. That loss already has an existing re-drive path (the T+2d pending-NIN reminder worker
  re-issues the link), which is why the conservative reading was taken. It is written into the handler
  so nobody later describes that job as "retried on provider failure". **If retry for the magic link
  is wanted, it needs a ruling on touching that method — it is a decision, not an oversight.**
- **Story 11-8 / PM2 topology: not touched, not referenced.** §3 is the whole record.
- **The story was NOT set to `done`** and no residual ledger was closed.

**📌 A CORRECTION TO THE STORY'S OWN DEV NOTES, verified against the tree.** Dev Notes state "The
confirmation email has **no** equivalent marker today … Decide this explicitly." It DOES have one:
`metadata.confirmation_email_sent_at`, added by 9-58 review L1, checked before the send and stamped
after a confirmed dispatch. **The decision is therefore: KEEP IT, unchanged, moved into the worker
with the rest of the guard block. No new marker was added**, and the confirmation is retry-safe by
exactly the same mechanism as the thank-you. There is a test asserting the marker is persisted, so
this is a fact rather than a claim.

**13-46 test files touched — three, all SETUP only, no assertion relaxed.**

| File | What changed | Why |
|---|---|---|
| `thankyou-autosend-throttle.integration.test.ts` | driver moved from `sendRegistrationAutoEmails` to `handleRegistrationThankYouJob` (12 call sites, via a one-line `drive()` helper) | The guard block it tests moved into the worker. `isTestMode()` makes every producer a no-op, so driving the old entrypoint would have gone green because nothing was attempted — the exact false-green 13-46 exists to prevent. **All 10 assertions byte-identical.** |
| `thankyou-gap-failopen.integration.test.ts` | same driver move for the 4 fail-open/scoping tests; the AC8 end-to-end test SPLIT | `runPostSubmissionSideEffects` now enqueues. Rather than weaken it to "did it enqueue", the test does both halves and JOINS them — it takes the payload the request path actually enqueued and feeds THAT to the handler, then asserts the provider send. Plus a new test pinning that an enqueue rejection SURFACES (defect 1 above). |
| `lib/` + `middleware/__tests__/registration-burst.test.ts` | extended only — `emailQueueWaiting` added to the counts helper, new AC5 describes appended | Task 4. Nothing existing was changed. |

`notification-cap.test.ts`, `email-send-cap.test.ts` and
`registry-verification-sql-parity.integration.test.ts` were **not touched** — they exercise
`EmailService.dispatch`, the meter and the SQL parity directly, none of which moved.

**Also updated (not a 13-46 file, but a drift guard that fired correctly):**
`respondent-promotion-census.test.ts` — the pinned raw-`UPDATE "respondents"` inventory. The two
marker stamps moved file, so the guard reddened. Re-pinned with the reason; **count unchanged (2), file
count unchanged (6)** — only the path moved. That guard doing its job is the point of it existing.

**Verification actually run by me (not self-reported by a subagent):**

```
apps/api  vitest run       Test Files  299 passed | 2 skipped (301)
                                Tests  4195 passed | 8 skipped | 1 todo (4204)
apps/web  vitest run       Test Files  272 passed (272)
                                Tests  3010 passed | 2 todo (3012)
apps/api  pnpm lint        eslint clean +
                           ✅ registry-read drift guard: 393 files, no drift
                           ✅ respondent-write drift guard: 393 files, no un-sanctioned creation
                           ✅ story-residual guard: 320 stories, no done-with-open-residuals
packages/types  tsc --noEmit  exit 0
apps/api        tsc --noEmit  exit 0
apps/web        tsc --noEmit  exit 0
apps/api  eslint scripts/_backfill-registration-autosends.ts   clean
          tsx scripts/load-test.ts --dry-run (GET default)      ok
          tsx scripts/load-test.ts --dry-run --method PUT ...   ok
          tsx scripts/load-test.ts --target https://oyoskills.com ...  REFUSED (exit 2) ✅
          tsx scripts/load-test.ts --method TRACE               rejected ✅
          tsx scripts/load-test.ts --body '{}' (GET)            rejected ✅
          tsx scripts/_backfill-registration-autosends.ts --help  runs ✅
```

API suite run with `NODE_ENV=test DATABASE_URL=…/app_test`. Both suites were run **one at a time**;
neither was invoked from the repo root. No timeout was raised. The known
`import.service.integration.test.ts` bucket-collision flake did not appear.

**NOT COMMITTED** — the adversarial code review runs on the uncommitted tree, per house rule.

### File List

⚠️ **GENERATED FROM `git status --short`** (review D8 / finding T8 — a modified file was
missing from the hand-written version). A File List curated from memory drifts by
construction; this one is derived from the tree.

**API**

- `apps/api/src/controllers/registration.controller.ts` (modified)
- `apps/api/src/lib/load-test-eval.ts` (modified)
- `apps/api/src/lib/registration-burst.ts` (modified)
- `apps/api/src/middleware/registration-burst.ts` (modified)
- `apps/api/src/queues/email.queue.ts` (modified)
- `apps/api/src/services/draft-adoption/send.ts` (modified)
- `apps/api/src/services/registration-email-jobs.ts` (new)
- `apps/api/src/services/submission-processing.service.ts` (modified)
- `apps/api/src/workers/email.worker.ts` (modified)

**API scripts (⚠️ OUTSIDE tsconfig — must be RUN, never typechecked)**

- `apps/api/scripts/_backfill-registration-autosends.ts` (modified)
- `apps/api/scripts/load-test.ts` (modified)

**Shared types**

- `packages/types/src/email.ts` (modified)

**Tests**

- `apps/api/src/lib/__tests__/load-test-eval.test.ts` (modified)
- `apps/api/src/lib/__tests__/registration-burst.test.ts` (modified)
- `apps/api/src/middleware/__tests__/registration-burst.test.ts` (modified)
- `apps/api/src/queues/__tests__/email-backpressure.test.ts` (modified)
- `apps/api/src/queues/__tests__/email.queue.test.ts` (modified)
- `apps/api/src/routes/__tests__/registration.routes.test.ts` (modified)
- `apps/api/src/services/__tests__/registration-email-jobs.integration.test.ts` (new)
- `apps/api/src/services/__tests__/registration-email-jobs.test.ts` (new)
- `apps/api/src/services/__tests__/respondent-promotion-census.test.ts` (modified)
- `apps/api/src/services/__tests__/submission-processing.service.test.ts` (modified)
- `apps/api/src/services/__tests__/thankyou-autosend-throttle.integration.test.ts` (modified)
- `apps/api/src/services/__tests__/thankyou-gap-failopen.integration.test.ts` (modified)
- `apps/api/src/workers/__tests__/email.worker.test.ts` (new)

**Docs**

- `docs/RESEND-SETUP.md` (modified)
- `docs/roadmap-to-launch.md` (modified)
- `docs/runbooks/13-3-cutover-and-failover.md` (modified)
- `docs/runbooks/enumerator-prod-smoke-and-golive-gate.md` (modified)
- `docs/runbooks/pre-viral-push-checklist.md` (modified)

**Planning / story**

- `_bmad-output/implementation-artifacts/13-65-registration-sends-off-the-request-path.md` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

_32 paths total._
## Change Log

| Date | Change | By |
|------|--------|-----|
| 2026-08-22 | **Implemented (Tasks 1-6, 8; Task 7 deferred). Status → `review`.** All three registration sends are ENQUEUED onto `email-notification` instead of dialled in-request, with the whole guard block relocated verbatim into a dedicated `services/registration-email-jobs.ts` (the handlers could not stay on `SubmissionProcessingService` — worker → service → queues is an ESM cycle that fails as `undefined` at call time). 🔴 **AC4 shipped as the load-bearing guard: `critical` types are exempt from the queue-wide budget-exhaustion pause, so an exhausted MARKETING budget can never stop a citizen's LOGIN LINK — with the converse pinned too, and BOTH directions falsified by deleting the guard and watching exactly the right tests red.** **Two defects in my own first implementation were caught by these tests and fixed:** (1) a `void`-ed enqueue produced an UNHANDLED REJECTION and silently disarmed AC6's operator page — the enqueue is now awaited and the rejection reaches the caller's `.catch()`, while the 201 stays protected at the call site; (2) the AC2 double-send test PASSED with the marker check deleted, because 13-46's ledger gap was suppressing the second send — `[[pattern-test-that-passes-over-a-hole]]` inside the AC that names it — fixed by isolating the marker and adding a control. **Consumer sweep:** `_backfill-registration-autosends.ts` would have reported 100% failure on a successful run (it re-read worker-written markers immediately); it now counts enqueues and prints the delivery-confirmation procedure. **Story Dev Notes CORRECTED against the tree:** the confirmation email DOES already have a send-once marker (9-58 review L1), so the required decision is KEEP IT, moved with the guard block; no new marker added. Three 13-46 test files had their SETUP re-pointed at the moved guard with **every assertion unchanged**; the raw-`UPDATE` census guard fired correctly and was re-pinned (same count, same file count, new path). ⛔ **Gate item 7 is NOT discharged and all three docs stay RED: the AC8 MEASUREMENT has not run.** Rig, method, both correctly-named readings, teardown chain and an EMPTY verdict table are recorded in `13-3-cutover-and-failover.md`; the numbers come from the first real spot (Mon 24 Aug 2026, Fresh FM, one station, one 60s spot) rather than a synthetic prod run that would leave thousands of rows and send thousands of real emails. 🔴 **The BEFORE half must be captured before 13-65 deploys.** `magic-link.service.ts` was not touched at all (Non-goal 3), and the honest cost — the queued magic link gains durability and bounded concurrency but NOT retry-on-5xx, because that method swallows provider failures by design — is written into the handler rather than glossed. Full API suite (4195 passed), full web suite (3010 passed), `tsc --noEmit` on all three packages and `pnpm --filter @oslsr/api lint` (3 drift guards) all green, run directly. Not committed. | Amelia (DEV) |
| 2026-08-22 | **Story drafted** to discharge `roadmap-to-launch.md` pre-flight gate item 7 by BOTH of its offered routes — (b) queue the registration sends and (a) measure the write path — authored as ONE story on Awwal's explicit instruction not to split it into gating and non-gating halves. Carries 13-46 residual **R6**. **Four corrections against the drafting brief, each verified against the tree, three of which changed an AC:** (i) 🔴 the brief assumes the registration path has no user-blocking send because the blocking magic link is "the `/login` flow" — but `WizardPage.tsx:559` **awaits** `POST /auth/public/magic-link` before painting the success screen, and `magic-link.controller.ts:92` awaits the provider before its 200, so the registration journey *does* block on a send; it is out of scope by instruction, and §7 + Non-goal 3 record the one-keyword fix and a reopen trigger rather than losing the finding. (ii) 🔴 **queueing creates a failure mode that does not exist today** — `email.worker.ts:92` pauses the WHOLE queue and throws on budget exhaustion, so naively queued magic links and reference codes would be stopped by an exhausted *marketing* budget; AC4 exists solely for this. (iii) the dedup key cannot answer the retry question the brief raised — produce-side, non-atomic, 300s TTL, skipped for `critical`, while the third retry lands at 10 min — so AC2 moves the **whole guard block** into the worker and names the send-once marker as the only load-bearing mechanism, while stating honestly that the send-then-stamp window is *unchanged* and merely entered up to 3× instead of once. (iv) `getSystemHealth` is **two different functions** — `operations.service.ts:93` (pm2 RSS/CPU, what 13-3 actually read) and `monitoring.service.ts:59` (queue depths, 10s cache) — and AC8 needs both, since naming the wrong one yields a measurement with no memory figure. Also found: the confirmation email has **no** send-once marker at all, so AC2 forces that decision to be made and stated rather than left implicit; and 13-3's rig is **GET-only** (no `method`/`body`), so AC8 splits draft-save (high volume, cheap teardown) from submit (small N, real rows, real email, child-first teardown) because a write test *leaves rows*. **The PM2 topology is recorded ONCE, in §3, as a constraint** — battle-tested and hardened, not changing (Awwal, 2026-08-22); story 11-8 stays in backlog and AC9 forbids "process isolation" appearing as a follow-up in any artefact. The claim is bounded throughout to **bounded concurrency, durability, retry and backpressure — never CPU reduction or event-loop isolation**, since all 10 workers run in the API process. 9 ACs / 8 Tasks. Status `ready-for-dev`. | Bob (SM) |

## Residual ledger (13-65)

⚠️ **Added at adjudication 2026-08-23 — the story arrived with NO ledger.** Its Task 7 deferral was
recorded only as unchecked boxes, which §2a0's debt gate surfaces but the CI guard cannot police: the
guard scans residual TABLE ROWS, so a story with no table is policed by nothing until it reads
`done`. Written now so the deferral is a row with an owner and a trigger rather than three ticks.

| # | Item | State | Re-runnable evidence | Owner | Reopen trigger |
|---|---|---|---|---|---|
| **R1** | **AC8's before/after measurement has NOT been run** (Task 7, both halves). The queue is deployed but its behaviour under real load is unmeasured — peak RSS, peak CPU, `pm2RestartCount` delta, peak queue depth. | ⏳ **OPEN — BLOCKS `done`** | `apps/api/scripts/load-test.ts` (now `--method`/`--body` capable, non-localhost refusal intact). **Deliberately deferred to JINGLE WEEK 1** — one station, one 60-second spot, the smallest real blast radius available, against a 2 GB box. A synthetic run at production would be a worse measurement AND a worse risk. | Awwal / ops, week 1 | Week 1 passing without the measurement being taken — the window does not recur |
| **R2** | The two transactional registration sends are `critical` and therefore **bypass dedup**. That is correct (a citizen's login link must not be deduplicated away) but it means a genuine double-submit sends two magic links. | ✅ **ACCEPTED** | `EMAIL_TYPE_PRIORITY` in `packages/types/src/email.ts`; guarded by *"classifies the two TRANSACTIONAL registration sends as critical"* | — | A complaint about duplicate login emails, which would mean the submit path is not idempotent upstream |
| **R4** | `CITIZEN_REGISTRATION_EMAIL_TYPES` is exported by this story and has **zero consumers** anywhere in the repo — not even in its own file. | ✅ **ACCEPTED** | `grep -rn CITIZEN_REGISTRATION_EMAIL_TYPES` → 1 hit, the definition | a future story touching `packages/types/src/email.ts` | Anyone importing it and relying on the old `as const` tuple type, which no longer exists |
| **R5** | `load-test.ts` silently clamps `--connections` to `LOAD_PROFILE.connections` (50), discarding an explicit operator value without saying so. | ⏳ **OPEN — one-line fix, do it with the AC8 run** | `--connections 100` on a bounded run; observe 50 with no message | dev, alongside R1's week-1 measurement | An operator reporting that a load run did not reach the concurrency they asked for |
| **R6** | `--verify`'s `still missing: N` counts every public respondent with a resolvable email, NOT this run's cohort, so a non-zero value is normal and reads as failure. | ⏳ **OPEN — rename the label, do not rescope** | Run `--verify` after a backfill; the number will not be 0 | dev, alongside R1 | An operator halting or re-running a backfill because `still missing` was non-zero |
| **R3** | 13-65 moves the code 13-46's burst guards live in. Those guards' behavioural tests are the contract and were **not** rewritten — but the concurrency residual the review raised as M9 is real and unstated in the ACs. | ✅ **ACCEPTED — documented in the review, not silently carried** | `## Senior Developer Review (AI)` → M9 | 13-46 R8's week-1 numbers will show whether it matters | Queue depth behaving unlike the M9 analysis predicts under week-1 load |

### 🏁 THE SEVEN FOURTH-PASS PROBES — EXECUTED BY ADJUDICATION 2026-08-23

⚠️ **First, the process failure, recorded because it is the useful part.** The
`## 🏁 FOR ADJUDICATION` section was written *for the adjudication agent, explicitly in lieu of a
fourth review pass*. **The first adjudication pass did not read it** — it ran the §2a0 debt gate,
tsc/eslint/guards, the touched suites and one RED-verify, then wrote this ledger. That pass would have
missed six of the seven probes; only AC8 was caught independently (as R1). Found because Awwal asked.
**The §2a0 gate checks unchecked boxes and ledger presence — it did not check "is there a section
addressed to me". That check is now added to the playbook.**

| # | Probe | Ruling |
|---|---|---|
| **2** | `CITIZEN_REGISTRATION_EMAIL_TYPES` changed TYPE — check consumers relying on tuple typing or iteration order | ✅ **SAFE, but not for the stated reason.** It appears **exactly once in the repo — its own definition.** No consumer in `apps/web`, none in `apps/api`, not even used inside its own file, so nothing can depend on the tuple type or the order. ⚠️ **But `git log -S` shows THIS story introduced it**, so it ships an exported constant with zero consumers. → **R4** |
| **3** | D11's silent 50-connection ceiling — is the cap wanted, and visible enough? | ⚠️ **The cap is right; the SILENCE is the defect.** Clamping a write run against a 2 GB box is defensible. Silently discarding an explicit `--connections 100` is the "correct but invisible" class this project keeps being caught by. **One line fixes it** — print `requested 100 → clamped to 50 (LOAD_PROFILE)`. → **R5** |
| **4** | D7 resolved by STATING not SCOPING — is stating enough for an operator at 2am? | ❌ **No.** A verification line exists to be read under pressure, and *"`still missing: 0` will rarely be true and must not be read as the run failing"* is exactly a number that WILL be misread — the §2t family. **Cheapest honest fix is the LABEL, not the scope:** `registry-wide missing (NOT this run): N`. The caveat then travels with the number. → **R6** |
| **5** | C6 is a product ruling — does the adjudicator agree with the RULING, not the test? | ✅ **Agreed.** A password reset is someone locked out; blocking it to save a fraction of a cent is the wrong trade, and it fails in the direction that favours the user. ⚠️ **Recorded consequence:** password-reset floods are no longer budget-capped — but the cap was never the right control for abuse, and `login-rate-limit` / `magic-link-rate-limit` are. |
| **6** | C9 deliberately did not change code — is a dead array entry the right call? | ✅ **Right call, NOW.** Re-indexing alters live retry timing, days before a jingle, to tidy an array. Correcting the CLAIMS was the part that mattered. **When it is removed it must be a deliberate change with the timing consequence stated** — not a cleanup. |
| **7** | AC8 has never run — gate item 7 must stay RED | ✅ **Confirmed, and caught independently as R1.** Needs Monday's spot; cannot be discharged early. |
| **8** | Pointer accuracy — audit independently, since adjudication caught this class on 13-46 | ✅ **Confirmed.** Every referenced story key resolves, and **11-8 is genuinely `backlog` on the board**, matching all 11 of its references. ⚠️ My first sweep threw a FALSE POSITIVE — `17-29` is a line range in `load-test-eval.ts:17-29`, not a story key. Recorded because reporting a regex artefact as a finding is the same error class the probe exists to catch. |

**Probe 1 needed no action** — closed before hand-off with a body-recording server (6 requests → 6
distinct bodies).

### Closing verdict

**NOT CLOSED — `review`, closing on the week-1 measurement. Deploy SHA: ⏳ PENDING.**
**R1 blocks `done` and cannot be discharged early** — it needs the jingle to have aired
([[pattern-verification-that-cannot-run-yet]]). Deploying is fine and expected; closing is not.

| Gate | Evidence — run by adjudication, not accepted from the dev |
|---|---|
| `tsc` | API **0**, web **0** (re-run after the rebase onto `b87dff7`) |
| `eslint` + 3 drift guards | **0 errors**, guards green at **393 files** |
| Touched suites | **210 passed / 11 files** pre-rebase; **129 passed / 9 files** re-run post-rebase |
| Rebase | clean onto current main; one board conflict, resolved keeping BOTH 13-65's `review` and main's new 13-66 row |

### ⭐ RED-verify by adjudication — AC4's red line, which is the whole story

Downgrading `registration-magic-link` from `critical` to `standard` in `EMAIL_TYPE_PRIORITY` reds
**exactly the right two tests**:

```
× should have exactly 4 critical types and 5 standard types (post Story 13-65 registration sends)
× classifies the two TRANSACTIONAL registration sends as critical
```

That is the property AC4 exists to protect: the email worker pauses on budget exhaustion, so a
`standard` login link could be held behind an exhausted MARKETING budget — a citizen unable to sign in
because a campaign spent its quota. The sibling assertion (*"classifies the MARKETING thank-you as
standard, so 13-46 cap and deferral still bind"*) proves the separation cuts both ways rather than
just exempting everything. Restored by hand, zero residue, 45/45.

## Senior Developer Review (AI)

**Reviewer:** adversarial code-review workflow (`bmad:bmm:workflows:code-review`), 2026-08-22, on the
UNCOMMITTED working tree of `story/13-65-registration-sends-off-request-path`. No code was changed.

**What I ran myself** (not taken from the Dev Agent Record): `apps/api` vitest on all touched/new test
files — `email.worker.test.ts`, `registration-email-jobs.test.ts`, `email-backpressure.test.ts`,
`lib/registration-burst.test.ts`, `middleware/registration-burst.test.ts`, `load-test-eval.test.ts`,
`respondent-promotion-census.test.ts` (**154 passed**), and with `NODE_ENV=test
DATABASE_URL=.../app_test` the DB-backed `registration-email-jobs.integration.test.ts`,
`thankyou-autosend-throttle.integration.test.ts`, `thankyou-gap-failopen.integration.test.ts`,
`registration.routes.test.ts` (**92 passed**). `tsc --noEmit` clean on `packages/types` and
`apps/api`. Story File List matches `git status --short` exactly — no discrepancy.

**Verdict: the story does not meet AC4, AC6 or AC8, and it introduces a citizen-facing send that
bypasses every 13-46 / 13-12 / 13-9 guard.** Findings ranked most-severe first.

---

### H1 (CRITICAL, AC4) — the `critical` exemption cannot do what AC4 requires: `pauseEmailQueue()` is a GLOBAL pause, so an exhausted marketing budget still stops every citizen login link

`email.worker.ts:131-141` (exemption) / `:143-172` (the pause branch) / `email.queue.ts:571-573`.

`pauseEmailQueue()` calls `getEmailQueue().pause()`. BullMQ v5's own source
(`node_modules/.pnpm/bullmq@5.66.4/.../classes/queue.js:257-268`) documents it: "Pauses the processing
of this queue **globally** ... atomic RENAME on the wait queue ... no new jobs will be processed ...
Adding jobs ... will add it there [the paused list] instead of the wait list."

**Failure scenario.** Budget denies (`EMAIL_TIER=free` -> 100/day, the exact 2026-08-05
misconfiguration; on `pro` -> 50,000/mo + overage). The next `standard` job the worker picks up — a
`registration-thankyou`, a `backup-notification`, a `dispute-notification` — takes `:143`, calls
`pauseEmailQueue()` at `:162`, sets `email:queue:paused` at `:163`, throws at `:172`. From that
instant the `wait` list is renamed `paused`. Every subsequent registration's `registration-magic-link`
and `registration-confirmation` job is **added to the paused list and never dequeued**. The exemption
at `:131` only executes for a job the worker has already picked up; after the pause there are none.

Recovery is **manual only** — the sole `resumeEmailQueue()` caller is `admin.routes.ts:156`. There is
no cron, no budget-rollover resume, and the paused state lives in Redis, so it survives `pm2 restart`
and a deploy. Before this story these two emails were dialled in-request and were entirely unaffected
by budget state. **This is precisely the failure AC4 was written to prevent, and it is worse than the
OOM it cures: silent, durable, and it needs a human.**

The test at `email.worker.test.ts:238-243` cannot see it. The captured-processor harness has no queue
— `pauseEmailQueue` is a bare mock — so "the queue was not paused *for this job*" is the only thing it
is capable of asserting. It is [[pattern-test-that-passes-over-a-hole]] inside the AC that names that
pattern.

**Amplifier:** the false safety claim is now written into three operator-facing artefacts —
`docs/runbooks/pre-viral-push-checklist.md:20`,
`docs/runbooks/enumerator-prod-smoke-and-golive-gate.md:31` and the roadmap gate-7 discharge — as "an
exhausted marketing budget can never stop a citizen's login link".

**Fix direction (not applied).** The pause is no longer safe on a queue carrying citizen transactional
mail. Options: (a) drop `pauseEmailQueue()` and let the `standard` throw + backoff be the spend
control; (b) keep it but gate it so it can only fire when the queue holds no `critical` work, plus an
auto-resume on budget rollover; (c) surface `getEmailQueueStats().paused` in the burst alert so a
pause is at least visible — `middleware/registration-burst.ts:85` already fetches that object and
discards the field. Whatever is chosen, the test must exercise a **queue**, not the processor.

---

### H2 (HIGH, AC2/AC3) — at >=80% budget the thank-you never reaches its handler, so every guard is bypassed and the citizen is mailed an ops digest instead

`email.worker.ts:182-211` defers any `standard` job **before** the switch. The dev's own passing test
proves it fires for this type: `email.worker.test.ts:304-314` asserts `deferEmail` is called and
`mockThankYouHandler` is **not**.

Everything AC2 moved into the handler is therefore skipped on that path: the `source !== 'public'`
gate, the 13-9 suppression check, 13-46's 5-day per-address gap, the send-once marker (neither checked
nor stamped) and `recordRegistrationAutoSend()`.

What is actually sent instead: `processDigestFlush` (`email.worker.ts:436-445`) mails
`[OSLRS] You have 1 notification` containing the line added at `email.worker.ts:76` — "Thank you for
registering — refer someone (registration-thankyou)" — via `sendGenericEmail` with **no category**.
`classifyEmailSubject` (`services/notification-category.ts:75`) maps "you have ... notification" ->
`notification-digest`, which is not marketing, so `EmailService.dispatch` (`email.service.ts:129-190`)
attaches **no List-Unsubscribe header**, consults **no marketing cap**, and writes **no
`campaign_sends` row**. A marketing email to a citizen, laundered into an ops category, delivered to
an address that may be on the bounce/complaint/unsubscribe list, with no ledger row for 13-46's gap to
read next time. The job returns `{success:true, deferred:true}`, so nothing retries and nothing is
counted as lost — the real thank-you is simply never sent.

None of the four 13-46 test files can catch this: they all drive `handleRegistrationThankYouJob`
directly. The guards still bind **where they were moved**; the new code path **around** them does not
go through them.

**Fix direction.** At minimum the digest flush must consult the suppression list. Better: run the
guard block before deferring, or exclude citizen-facing types from the deferral/digest mechanism
(which was built for ops/staff notifications), and decide explicitly what >=80% budget should do to a
marketing auto-send.

---

### H3 (HIGH, AC8) — the rig cannot perform either half of the measurement it was extended for

Two independent blockers, neither of which Task 7's deferral excuses, because the runbook now
instructs the operator to run exactly these commands.

**(a) The rate limiters bound the run far below the profile.** `shouldSkipRateLimit = () =>
isTestMode()` (`middleware/login-rate-limit.ts:18`), so there is no prod bypass.

- Half A, `PUT /api/v1/registration/draft` (`routes/registration.routes.ts:60`):
  `wizardDraftRateLimit` 1,200/IP/15min **then** `wizardDraftEmailRateLimit`
  300/normalised-email/15min. One IP, one static body => one email => the 300 bucket is exhausted in
  roughly 15s of a 60s run; the rest are 429 -> `non2xx` -> error rate far past the 1% threshold ->
  a **guaranteed RED that measures the limiter**, with no RSS conclusion available.
- Half B, `POST /wizard` (`routes/registration.routes.ts:74-80`): `registrationRateLimit` 50/IP/15min
  then `registrationEmailRateLimit` 3/normalised-email/15min. The run is capped at **50 requests per
  15 minutes and 3 per email** — it cannot generate the burst whose memory profile AC8 exists to
  measure.

**(b) autocannon sends one static body.** `scripts/load-test.ts:93-101` passes a single `body` string;
no `idReplacement`, no `requests[]`/`setupRequest`. So every request is byte-identical: Half A's
successful requests all write the **same** `wizard_drafts` row (measuring single-row contention, not
50 concurrent drafts), and Half B creates one respondent and then duplicate-NIN rejections. There is
also no `--amount`, so "submit, bounded and SMALL" is not expressible — the rig only takes a rate.

`docs/runbooks/13-3-cutover-and-failover.md` section *Write-path capacity (13-65 AC8)* documents the
`50 x 60s` profile against `PUT /draft`, so the operator will run it, get RED, and have no way to
separate the limiter from the box. `load-test-eval.test.ts` only unit-tests argument parsing, so
nothing catches it.

**Fix direction.** Per-request body variation, a documented allow-listed / limit-relaxed source (or a
staging target) for the run, an `--amount` bound for Half B, and either 429-exclusion in the verdict
or an explicit statement that the halves are not yet executable. Until then the runbook's profile
numbers should be replaced with what the limiters actually permit.

**Related, same rig (MEDIUM):** the prod refusal is still the single `--i-understand-this-hits-prod`
flag (`lib/load-test-eval.ts:204-211`) that 13-3 minted for a **read**. That one flag now also unlocks
a write run that creates rows and sends real email, with defaults of 50 x 60s and no upper bound on
`--connections` / `--duration`. A second, differently-named acknowledgement for `--method != GET`
against a non-localhost target would cost one line.

---

### H4 (HIGH, AC6) — 13-21's auto-send failure counter goes blind to every non-provider failure

Before, both senders wrapped their whole body in `try { ... } catch (err) { await
recordAutoSendFailure(...) }` — so a failure of the `respondents` lookup, `getSuppressedEmails`,
template building, or a provider client that **throws** rather than returning `{success:false}` was
counted and could page.

Now, in `services/registration-email-jobs.ts`, `reportFailure()` is reachable from exactly two places
— `:221` and `:379`, both inside `if (!result.success)`. There is no outer try/catch. Every other
exception propagates to the worker, which logs `email.job.failed` and (final attempt only) writes an
`email.delivery.failed` audit row, but **never calls `recordAutoSendFailure`**.

So the counter 13-21 built to page after 5 failures ("the confirmation + thank-you/referral loop may
be down") will not fire when the DB or the email-events service is the thing that is down — the
burst-day failure mode. `registration-email-jobs.test.ts` has no test for a **thrown** (as opposed to
returned-unsuccessful) failure, and the old `submission-processing.service.test.ts` test "AC4: records
a counted failure when a send fails" was deleted without an equivalent replacement.

**Fix direction.** Wrap each handler body so a final-attempt exception routes through `reportFailure`
before being re-thrown; add the test.

---

### H5 (HIGH/MEDIUM, AC7) — the awaited enqueue now short-circuits fraud detection and marketplace extraction, and the enumerator path makes that permanent

`services/submission-processing.service.ts:1332-1339` — `await this.sendRegistrationAutoEmails(...)`
is now the **first** statement of `runPostSubmissionSideEffects` and it can throw (both producers are
`getEmailQueue().add()`). Fraud detection (`:1341-1353`) and marketplace extraction (`:1355-1367`)
follow and are skipped on a throw.

The enumerator/clerk queue path at `:442` awaits `runPostSubmissionSideEffects` and lets it throw —
but `submissions.processed = true` is already committed at `:410-417`, so a BullMQ retry of that job
hits the already-processed early return. **The marketplace profile and the fraud check are lost for
that submission with no record** — the same 13-27 bypass class that story exists to prevent. The
wizard path is protected by its `.catch()`; this one is not.

The docblock immediately below, at `:1379-1383`, still reads "Fully fire-and-forget + fail-soft: each
send self-contains its try/catch and never throws" — now false.

**Fix direction.** Move the enqueue **last**, or wrap it so it cannot pre-empt the two queue ops that
have always been awaited; reconcile the stale docblock.

---

### M6 (MEDIUM) — `sendAdoptionMessages` now reports a *successful* confirmation send as a FAILED row, inviting a duplicate on re-run

`services/draft-adoption/send.ts:71-90`. The adoption confirmation is dispatched and ledgered at
`:72-79`; the new awaited enqueue at `:89` can throw **after** the citizen has already been emailed,
so `sendAdoptionMessages` throws and the runner counts the row failed. There is no send-once marker on
the adoption confirmation itself, and this runner has a recorded duplicate history (13-49: 174
adopted, 7 duplicate records). Re-driving a "failed" row re-sends the confirmation.

The comment at `:81-88` asserts this is "the right direction". It is the wrong direction for the half
that already succeeded. **Fix:** catch the enqueue rejection, log loudly, still return `{sent:true}` —
or add a third outcome the runner can distinguish.

---

### M7 (MEDIUM, security) — the plaintext magic-link token is now persisted at rest in Redis for up to 24h

`packages/types/src/email.ts` `RegistrationMagicLinkEmailData.tokenPlaintext`, enqueued from
`registration.controller.ts:~1408` via `email.queue.ts:435-450`.

`magic-link.service.ts:74` stores only `sha256Hex(tokenPlaintext)` in the DB — deliberately, so the
plaintext has never existed at rest anywhere. The job record now holds it beside the citizen's email
under the queue defaults `removeOnComplete: {age: 3600}` / `removeOnFail: {age: 86400}`, and
**indefinitely while the queue is paused** (H1). The token is valid 72h
(`magic-link.service.ts:29`). No Bull Board or job-data endpoint exists, so exposure needs box/Redis
access or an RDB dump — but it is a real new credential-at-rest surface that AC1 sanctioned without
naming. **Fix:** per-job `removeOnComplete: true` and a short `removeOnFail` age for
`registration-magic-link` at minimum.

---

### M8 (MEDIUM) — the backfill's replacement evidence procedure does not prove what it claims

`scripts/_backfill-registration-autosends.ts:204-215` and `:344-355`: "re-run with `--dry-run`; the
remaining-eligible count going to ~0 IS the delivery evidence."

But `selectEligible` (`:219-241`) pipes candidates through `filterMarketingCohort`, which applies the
5-day contact gap against `campaign_sends`. A successful thank-you writes that ledger row, so the
address drops out of `eligible` **via the gap, not via the marker** — including for a row whose
*confirmation* half failed all three attempts, since the confirmation is transactional and writes no
ledger row. Such a row is silently reported as delivered.

Separately, `queueRegistrationThankYouEmail` returns `'dedup-skipped'` on a `checkDedup` hit
(`email.queue.ts:~473`), and the loop at `:317-327` counts the row as enqueued regardless of the
producer's return value — a silently-dropped enqueue is reported as an enqueue and will never be
delivered nor retried.

**Fix:** a `--verify` pass that reads `confirmation_email_sent_at` / `thankyou_referral_sent_at`
directly, without the marketing cohort filter; and check the producer's return value.

---

### M9 (MEDIUM, AC2) — a concurrency residual the story does not state

`registration-email-jobs.ts:182-193` (confirmation) and `:269-280` (thank-you) read the send-once
marker, then send, then stamp. Two jobs for the same `respondentId` — a wizard enqueue racing a
backfill enqueue, or a stalled-job re-delivery racing the original — can be processed **concurrently**
by the 5-way worker and both pass the check. AC2 requires the residual to be stated honestly; the
story names the contact-gap TOCTOU (`:320-322`) and the crash-between-dispatch-and-stamp window, but
not this one, which the queue newly widens.

---

### L10 — retry widens duplicate exposure beyond the documented window

Only the crash-between-dispatch-and-stamp window is recorded. A provider call that times out *after*
the message was accepted returns `{success:false}` -> `throw` -> up to 3 attempts -> up to 3 delivered
copies. Before this story that case produced zero emails, not three. One sentence in the module
header.

### L11 — stale comments and status drift introduced by the change

- `submission-processing.service.ts:1379-1383` — "never throws" (false; H5).
- `thankyou-gap-failopen.integration.test.ts`, AC8 describe — "That entrypoint fires its work with
  `void`" (it is now awaited).
- `docs/runbooks/enumerator-prod-smoke-and-golive-gate.md:31` still labels 13-65 `ready-for-dev` while
  `sprint-status.yaml` says `review`.

### L12 — AC5 stops one field short of the signal that matters

`middleware/registration-burst.ts:83-90` reads `getEmailQueueStats()` and keeps only `waiting`. The
same object carries `paused`, which is the single most diagnostic field during the H1 failure: a deep
queue that is **paused** reads identically to a deep queue that is draining. One line, one message
row, composes with 13-46's breaker exactly as `waiting` does.

---

### What is genuinely right (so the ranking is calibrated)

- The guard-block relocation is **whole and in order**; the ESM-cycle reasoning is correct and the
  dedicated module is the right placement.
- AC9's bounded claim is held consistently — I grepped every touched artefact and found **no**
  overclaiming, and no "process isolation" / "separate worker process" / "11-8" follow-up anywhere.
- The four 13-46 test files kept every assertion; the driver move was necessary (`isTestMode()` would
  have made the old entrypoint assert nothing) and the gap-failopen file's split-and-**join** is
  stronger than a "did it enqueue" weakening would have been.
- The `respondent-promotion-census` re-pin is honest — same count, same file count, new path.
- Both self-caught defects (the `void`-ed enqueue becoming an unhandled rejection; the AC2 test
  passing over the ledger-suppressed hole) are real and correctly fixed, and the confirmation-marker
  correction to the story's own Dev Notes is right.
- The AC8 runbook entry is honest about what has NOT been measured and does not flip any gate green.


### Action Items (dev response to the review) — CRITICAL → LOW

**Worked in dependency order**, not severity order: B1 changes the worker's budget branch that B2
also edits, and B12 reports the field B1 stops setting. **Every item ships with a test that fails
without it** — H1 and H2 both slipped past tests that could not see them, so a fix without a test
that FIRES would repeat the exact defect class.

⚖️ **THE B1/B2 DESIGN RULING (taken by Claude, 2026-08-22, stated because it changes what 9-63's
budget guard MEANS).** The reviewer offered three directions for H1. Only one survives contact:

- ❌ *"Gate the pause so it only fires when the queue holds no `critical` work"* — **race, and
  ineffective anyway.** "Holds no critical work" is a TOCTOU: a magic link enqueued one millisecond
  later lands in the **paused list** and is never dequeued. The exemption at the top of the processor
  can only ever run for a job the worker ALREADY picked up, so gating the pause does not restore the
  flow of new critical jobs. It would look like a fix and not be one.
- ✅ **CHOSEN: remove the queue-wide pause. The per-job refusal IS the spend control.** The budget
  check runs BEFORE the provider call, so a denied `standard` job burns worker cycles, not money.
  Bounded per job (3 attempts, then terminal). The global pause only ever bought us "stop spinning" —
  and it bought that at the price of stopping citizen login links, durably, with manual-only recovery.
  That is not a trade worth making on a queue that now carries transactional mail.
- ✅ **ALSO: surface `paused` in the burst alert** (L12). An admin can still pause deliberately via
  `admin.routes.ts`, and a deep queue that is PAUSED reads identically to one that is draining.

⚠️ **What this changes for 9-63:** budget exhaustion no longer halts the queue; it refuses the
offending `standard` job and lets everything else — above all `critical` — keep flowing. The
exhaustion warning, the hourly dedup and `recordSend()` accounting are all unchanged, so the operator
signal is not lost. **This is a deliberate narrowing of 9-63's blast radius, not an accident.**

| # | Sev | Finding | Fix | Order |
|---|---|---|---|---|
| ✅ **B1** | **CRITICAL** | **H1** — `pauseEmailQueue()` is a BullMQ GLOBAL pause, so AC4's `critical` exemption cannot work: new magic-link jobs land in the paused list and are never dequeued. Manual-only recovery, survives restart+deploy. | Remove the queue-wide auto-pause per the ruling above; keep the per-job refusal. Test must exercise a **QUEUE**, not the processor. | **1st** |
| ✅ **B2** | **CRITICAL** | **H2** — at ≥80% budget the citizen-facing thank-you is deferred BEFORE the type switch, bypassing every guard, and is delivered as an ops digest with NO category ⇒ no unsubscribe header, no cap, no ledger row, possibly to a SUPPRESSED address. | Exclude citizen-facing `registration-*` types from the deferral/digest mechanism (built for ops/staff). Marketing volume is already governed by 13-46's cap — the right control for that mail. | 2nd |
| ✅ **B3** | **HIGH** | **H4** — `recordAutoSendFailure` is now reachable only inside `if (!result.success)`, so a THROWN failure (DB down, email-events down — the burst-day modes) never counts and 13-21's pager goes blind. | Wrap each handler body; route a final-attempt exception through `reportFailure` before re-throwing. Add the thrown-failure test that was deleted without replacement. | 3rd |
| ✅ **B4** | **HIGH** | **H5** — the awaited enqueue is now the FIRST statement of `runPostSubmissionSideEffects`, so a throw skips fraud detection AND marketplace extraction. On the enumerator path that is PERMANENT: `processed=true` is already committed, so a retry early-returns. | Move the enqueue LAST so it cannot pre-empt the two queue ops that have always been awaited. Fix the now-false "never throws" docblock. | 4th |
| ✅ **B5** | **HIGH** | **H3** — the AC8 rig cannot perform either half: rate limiters bound Half B to 50 req/15min, autocannon sends ONE static body so every request writes the same draft row, and the runbook already tells the operator to run it. | Per-request body variation + `--amount` + a SEPARATE write-acknowledgement flag; and correct the runbook to what the limiters actually permit. | 5th |
| ✅ **B6** | MEDIUM | **M6** — `sendAdoptionMessages` reports a SUCCESSFUL confirmation as a failed row, inviting a duplicate on re-run (13-49: 174 adopted, 7 duplicates). | Catch the enqueue rejection, log loudly, still return `{sent:true}`. | 6th |
| ✅ **B7** | MEDIUM | **M7** — the plaintext magic-link token is now persisted at rest in Redis for up to 24h (indefinitely while paused), where it has never existed before. | Per-job `removeOnComplete: true` + short `removeOnFail` age for `registration-magic-link`. | 7th |
| ✅ **B8** | MEDIUM | **M8** — the backfill's replacement evidence procedure proves the CONTACT GAP, not delivery; and a `'dedup-skipped'` enqueue is counted as enqueued. | `--verify` reading the markers directly without the cohort filter; check the producer's return value. | 8th |
| ✅ **B9** | MEDIUM | **M9** — two jobs for the same respondent can be processed concurrently by the 5-way worker and both pass the send-once check. AC2 requires the residual STATED. | State it beside the two residuals already named. | 9th |
| ✅ **B10** | LOW | **L10** — a provider timeout AFTER acceptance now yields up to 3 delivered copies; before this story it yielded zero. | One sentence in the module header. | 10th |
| ✅ **B11** | LOW | **L11** — stale comments + status drift: "never throws", "fires its work with `void`", and 13-65 labelled `ready-for-dev` in a runbook while sprint-status says `review`. | Correct all three. | 11th |
| ✅ **B12** | LOW | **L12** — `getEmailQueueStats()` is read and `paused` discarded; during a pause a deep queue reads identically to a draining one. | Carry `paused` into the burst alert message. | with B1 |



#### Outcome of the action-item pass — all 12 applied, 2026-08-22

**Gates:** full API suite **4206 passed / 0 failed** (299 files, up 11 net tests); web suite green;
`tsc --noEmit` clean on both packages; eslint clean; all three drift guards green.

**Both CRITICALs had tests that ASSERTED THE BUG.** B2's test literally required the citizen
thank-you to be deferred into the ops digest. B1's could only assert "not paused for THIS job",
because the harness captures the processor rather than a queue — so the global pause was structurally
invisible to it. That is the third time in this story a test has been weaker than it looked, and each
time the CODE was wrong rather than the test's intent.

**One fix was deliberately NOT built the way the review asked.** B8 requested a `--verify` pass AND a
check on the producer's return value. Threading that return through `sendRegistrationAutoEmails`
meant restructuring a function on the live registration path; it was started, judged
disproportionate, and reverted. `--verify` closes both holes on its own: it reads the delivery
markers directly via `fetchCandidates` (**not** `selectEligible`, whose cohort filter is exactly what
made the old evidence prove the CONTACT GAP instead of delivery), and a `dedup-skipped` enqueue never
sends, so its marker is never stamped and verify reports it as still missing.

**The B5 finding that mattered was consent, not mechanics.** `--i-understand-this-hits-prod` was
minted by 13-3 for a READ profile; it would now have unlocked a run that creates registry rows and
sends real email — a different consent on a flag whose wording mentions neither, typed by habit. A
second flag names the consequence, `--amount` is required (because `--duration 60` on the submit path
means "create respondents for a minute"), and the prod refusal is reported FIRST, since that is the
fact that makes the rest serious.

⚠️ **The false safety claim was corrected in all three operator documents.** They stated that
"`critical` types are exempt from the queue-wide pause, so an exhausted marketing budget can never
stop a citizen's login link". That was never true, and after B1 the mechanism it describes does not
exist. A reassuring-but-false sentence in a runbook read at 2am is worse than the original bug.

⚠️ **This pass has NOT been reviewed.** On 13-46 the fix pass itself introduced two new defects that
a second review caught (a false-green harness and a broken SQL query). B1 removed a mechanism three
documents described and B3 restructured error handling on the live registration path, so a re-review
of the delta is warranted — specifically B1's spend-control reasoning and whether B3's single
reporting path can itself throw in front of the retry logic.

**Recommended disposition:** H1, H2, H3 and H4 must be resolved before this ships — H1 and H2 are
citizen-facing regressions created by the change itself, and H3 means the gate-7 evidence cannot be
gathered with the rig as built. Status left as `review`; no code, Status field or Dev Agent Record was
modified by this review.

---




#### ⚠️ A test-infrastructure finding surfaced by this pass (NOT a 13-65 defect)

`apps/web/src/__tests__/route-resolution.integration.test.tsx` fails on `'/login'` **the first time
any file in the web import graph changes**, and passes on every run after. Measured 2026-08-23:

| run | outcome | transform time |
|---|---|---|
| cold (after editing `packages/types/src/email.ts`) | ❌ `/login` timed out at 20,098ms | — |
| after reverting that file (content vitest had ALREADY cached) | ✅ 58/58, `/login` in **878ms** | — |
| warm, WITH the change present | ✅ **58/58** | `transform 21.65s` |

**The file's transform cost (~20s) is the same order as the per-test budget (20s)**, so whether
`/login` passes depends on how much cold-compile happens to land inside that one test's window. It
already carries a `fix(test): the route-resolution flake` commit.

⚠️ **AND IT PRODUCED A WRONG CONCLUSION HERE, WHICH IS THE REAL WARNING.** The stash test —
"revert the file, it passes; restore it, it fails" — reads as proof that the change is at fault. It
is not: reverting reproduces PREVIOUSLY-CACHED content, so it measures cache state, not correctness.
Anyone bisecting a web failure with `git stash` on this suite will reach the same false answer.

**Fix direction (a separate story):** raise the budget for this file, warm the transform in a
`beforeAll`, or split the route table so no single test carries a whole cold compile.

#### Outcome of the SECOND-PASS action items — all 12 applied, 2026-08-22

**Gates:** full API suite **4208 passed / 0 failed**; web suite green; `tsc` clean both packages;
eslint + 3 drift guards clean. ⭐ **And, unlike the first pass, both `scripts/` fixes were proven by
RUNNING the scripts** — the gap that let R1 and R2 through.

**Measured, not asserted:**
- **C1** — `--amount 8` now sends exactly **8** (counting server, delta 17→25). The reviewer measured
  **16** before the fix. On the AC8 Half-B profile `--amount 20` would have created 40 respondents,
  users, submissions, tokens and marketplace profiles, and sent 40 real emails.
- **C2** — `--verify` executes and appears in `--help`; it previously died on `FATAL: Unknown flag`.
- **C4** — seeded one delivered + one undelivered row in `app_test`: **`both delivered: 1, still
  missing: 1`**. The old version could not report a non-zero success by construction. Torn down
  `DELETE 2` / `DELETE 2`, verified zero left.
- **C3** — the plan line prints the real bound and `--connections 50` clamps to 8 with a note.

**⚠️ THE HARNESS LIED BEFORE THE CODE DID.** Four verification runs reported "0 requests, N errors"
and the script was nearly declared broken. It was correct: Git Bash's POSIX path conversion had
rewritten `--path /` into `http://localhost:4599C:/Program Files/Git/`. What caught it was checking
the tool's own output against an INDEPENDENT counter. "Run it" is necessary and not sufficient —
the harness needs corroboration too.

**⚖️ C6 was a scope change nobody had noticed.** `staff-invitation` and `password-reset` were already
`critical`, but before AC4 there was no exemption at all — budget exhaustion paused and threw for
every type. So a registration story quietly un-gated unrelated transactional mail. **KEPT**: blocking
a password reset for someone locked out, to save a fraction of a cent, is the same wrong trade this
story rejects for the magic link. Now a recorded decision with a test and its converse, not an
accident.

**⚠️ C9 was deliberately NOT "fixed" in code.** The effective backoff is **2min then 10min**, not
"30s/2min/10min": BullMQ passes `attemptsMade >= 1`, so index 0 is unreachable. Re-indexing would
change live retry timing — a behaviour change, not a documentation fix. The claim was corrected in
all five places; the array is untouched.

### Action Items — SECOND PASS (dev response to the re-review) — CRITICAL → LOW

⚠️ **THE ROOT CAUSE OF BOTH CRITICALS, STATED FIRST BECAUSE IT IS THE ACTUAL LESSON.**
Both live in `apps/api/scripts/`, which sits OUTSIDE tsconfig and has no tests. Every gate the first
fix pass cited — 4206 API tests, `tsc --noEmit`, eslint, three drift guards — was STRUCTURALLY
INCAPABLE of seeing either. The repo already records this rule: *"`scripts/` is outside tsconfig —
RUN scripts, don't trust tsc."* It was not followed. **"All gates green" was reported for a change
whose two most dangerous parts no gate covered; the confidence was the defect.**
➜ Every fix below that touches `scripts/` is verified by EXECUTING the script, not by typechecking it.

| # | Sev | Finding | Fix | Order |
|---|---|---|---|---|
| ✅ **C1** | **CRITICAL** | **R2** — every bounded write run sends **2× `--amount`**: autocannon's warmup inherits `amount`, and `amount` kills the duration timer, so warmup runs a full amount and then the main run runs another. Confirmed 16 vs 8 against a counting server. `--amount 20` ⇒ **40 real registrations and 40 real emails.** | Drop the warmup entirely for bounded write runs (a warmup that WRITES is wrong regardless), and prove it by running. | **1st — live foot-gun the runbook tells an operator to fire at prod** |
| ✅ **C2** | **CRITICAL** | **R1** — `--verify` cannot run at all: `'verify'` was never added to `KNOWN_FLAGS` and `parseArgs` hard-throws on unknown flags. Help text, `Args` field, `main()` branch and the whole `verifyDelivery()` are unreachable. | Register the flag; **verify by executing the script**. | 2nd |
| ✅ **C3** | **HIGH** | **R3** — `--connections` (default 50) > `--amount` makes autocannon throw; `--amount` VOIDS `--duration` rather than composing; the dry-run plan prints "50 connections × 60s" and never mentions `--amount`. | Clamp connections to amount, state the semantics, and print the real plan. | 3rd |
| ✅ **C4** | **HIGH** | **R8** — `verifyDelivery`'s counters are degenerate BY CONSTRUCTION: it re-runs `fetchCandidates`, which selects rows *missing* a marker, so `bothDelivered` is ~always 0 and the pass cannot report success. | Query the BASE population (public + resolvable email) and report marker state across it. | 4th |
| ✅ **C5** | **HIGH** | **R6** — the false pause/exemption claim SURVIVES in a fourth operator doc (`13-3-cutover-and-failover.md`, read during the jingle) and in `packages/types/src/email.ts`; and `roadmap-to-launch.md:136` now asserts BOTH the exemption and its removal in one sentence. | Correct all remaining sites; make the roadmap sentence say one thing. | 5th |
| ✅ **C6** | **HIGH** | **R5** — the `critical` exemption also un-gates `staff-invitation` and `password-reset`, which budget exhaustion previously blocked. Undocumented, untested, unrelated to registration. | Decide and RECORD it, with a test pinning the decision. | 6th |
| ✅ **C7** | MEDIUM | **R4** — the worker still throws `"emails queued for tomorrow"` into the audit row, but since C-pass B1 the job is TERMINAL at ~12 min and discarded. The message tells an operator to expect a delivery that will never come. | Say what now happens. | 7th |
| ✅ **C8** | MEDIUM | **R7** — the backfill's apply run still prints the DISPROVEN `--dry-run` evidence procedure. | Point it at `--verify`. | 8th |
| ✅ **C9** | MEDIUM | **R9** — `getBackoffDelay(0)` is unreachable, so the "30s/2min/10min" claim is wrong everywhere it appears; the real schedule is 2min/10min. | Correct the claim wherever it is stated. | 9th |
| ✅ **C10** | LOW | **R10** — `String(type).startsWith('registration-')` discards compile-time enforcement; a future registration type not matching the prefix silently falls back into the ops digest — the exact bug B2 fixed. | Use an explicit typed set. | 10th |
| ✅ **C11** | LOW | **R11** — `ctx` is a dead parameter in both `*Impl` functions after the B3 wrapper. | Remove or use. | 11th |
| ✅ **C12** | LOW | **R12** — `readEmailQueueState`'s catch is silent, so a persistently failing queue read is indistinguishable from a healthy empty queue. | Log it once. | 12th |


## Senior Developer Review (AI) — SECOND PASS, on the FIX DELTA (B1–B12)

**Reviewer:** adversarial code-review workflow (`bmad:bmm:workflows:code-review`), 2026-08-22, on the
UNCOMMITTED tree of `story/13-65-registration-sends-off-request-path`. **Subject: the action-item pass
itself, not the whole story.** No code, Status or Dev Agent Record was modified.

**What I ran myself:** `apps/api` vitest on `email.worker.test.ts`, `registration-email-jobs.test.ts`,
`load-test-eval.test.ts` (**71 passed**) and `submission-processing.service.test.ts`,
`email-backpressure.test.ts`, `lib/registration-burst.test.ts`, `middleware/registration-burst.test.ts`,
`respondent-promotion-census.test.ts` (**191 passed**) — from `apps/api`, never the repo root. I also
**executed** `scripts/_backfill-registration-autosends.ts --verify`, `scripts/load-test.ts` in three
configurations, and a purpose-built autocannon probe against a local counting server. Findings below are
marked CONFIRMED BY RUNNING or ANALYSIS.

> The suite being green is not evidence the pass is clean: **the two worst findings below are in
> `scripts/`, which is outside tsconfig and has no tests, and the third is in a runbook.** Every gate the
> fixer cited is blind to all three.

---

### R1 (CRITICAL, B8) — `--verify` cannot be invoked at all: `'verify'` was never added to `KNOWN_FLAGS`

`apps/api/scripts/_backfill-registration-autosends.ts:47-54` (the set) vs `:64` (the help text), `:91`,
`:123`, `:396`.

`parseArgs` hard-throws on any flag not in `KNOWN_FLAGS`, and the set was not extended:

```
$ tsx scripts/_backfill-registration-autosends.ts --verify
FATAL: Unknown flag --verify. Known flags: dry-run, apply, confirm-i-am-not-dry-running, max-rows, rate-per-minute, help
```

**CONFIRMED BY RUNNING.** The flag is documented in `HELP_TEXT`, threaded through `Args`, branched on in
`main()`, and `verifyDelivery()` is fully written — and none of it is reachable. This is
`[[pattern-ship-a-fix-that-never-fires]]`, the named top defect class in this repo, in the one item the
Outcome block singles out as "deliberately NOT built the way the review asked… `--verify` closes both
holes on its own." It closes neither, because it cannot run. **Fix:** add `'verify'` to `KNOWN_FLAGS`,
then actually execute the pass against the test DB before claiming it.

---

### R2 (CRITICAL, B5) — the warmup phase inherits `--amount`, so every "bounded and SMALL" write run sends **exactly twice** the requested number of requests

`apps/api/scripts/load-test.ts:115-125` (`amount` and `warmup` passed together) ×
`autocannon/lib/init.js:40-43` (`warmupOpts = { ...opts, ...opts.warmup }`).

The script's `warmup` object carries only `connections` and `duration`, so `opts.amount` **survives the
spread into the warmup run** — and because `amount` suppresses the duration timer entirely
(`autocannon/lib/run.js:88`), the warmup does not stop after 5 seconds; it stops after a full `amount`
of requests. Then the main run does `amount` again.

**CONFIRMED BY RUNNING** (local counting HTTP server, identical option shape, `amount:10, connections:2,
duration:60`):

| Config | Requests the server actually received |
|---|---|
| with `warmup: { connections: 2, duration: 5 }` | **16** |
| identical, `warmup` removed | **8** |

**Failure scenario.** AC8 Half B against prod with `--amount 20`: the operator consents to 20 submits and
gets **40** — 40 respondents, 40 users, 40 submissions, 40 magic-link tokens, 40 marketplace profiles,
40 real emails, and up to 40 `campaign_sends` rows each suppressing that address's next real thank-you
for five days. The teardown table in the runbook is sized for the number the operator typed. B5's entire
purpose was bounding a run that writes registry rows and mails real citizens; it doubles it instead.
**Fix:** `warmup: { connections, duration: warmupSeconds, amount: 0 }` — or, better, no warmup at all on
a write run (a warmup phase that creates rows is not a warmup).

---

### R3 (HIGH, B5) — `--amount` below `--connections` is a hard crash, `--amount` silently voids `--duration`, and the dry-run plan reports neither

Three separate defects in the same six lines, `load-test.ts:66-67` and `:115-125`:

**(a) It throws.** `autocannon/lib/run.js:194-197` — `if (url.responseMax === 0) throw Error('connections
cannot be greater than amount')`. `parseLoadTestArgs` defaults `connections` to `LOAD_PROFILE.connections
= 50` and `loadTestRefusal` *requires* `--amount` for a write run, but nothing cross-checks them. So the
documented Half B shape (`--amount 20`, connections left at the default) dies on an opaque autocannon
error after the operator has already typed both consent flags. **CONFIRMED BY RUNNING**: `THREW:
connections cannot be greater than amount`.

**(b) `--duration` is ignored, not composed.** `run.js:88` — `if (!amount) { stopTimer = setTimeout(...
opts.duration ...) }`. With `amount` set there is no duration timer at all. The story and the runbook
both describe the two as composing.

**(c) The dry-run plan does not mention `--amount`.** `load-test.ts:67` prints `profile: 50 connections ×
60s` regardless. **CONFIRMED BY RUNNING** `--dry-run --method POST --amount 20`: the preview says "50
connections × 60s" and never names the bound — so the one artefact whose job is to show the operator
what a write run will do omits the only thing limiting it, and states a duration autocannon will discard.

**Fix:** reject `connections > amount` in `parseLoadTestArgs` (or clamp connections to amount); print
`amount` in the plan and suppress the duration line when it is set; correct the runbook.

**Genuinely right, so the ranking is calibrated:** `idReplacement` and the `[<id>]` placeholder are real,
correctly spelled, and body-scoped — verified against `autocannon/README.md:311,331` and the installed
8.0.0 source. The separate write-consent flag (`--i-understand-this-writes-rows-and-sends-email`) and the
prod-refusal-first ordering in `loadTestRefusal` are both correct and well-reasoned.

---

### R4 (HIGH, B1) — removing the pause turned "held until the budget resets" into "discarded ~12 minutes later", and the error message still promises the old behaviour

`apps/api/src/workers/email.worker.ts:143-189`.

The ruling's cost analysis is right about money and wrong about mail. Verified end to end:

- **No path reaches a provider call while the budget is exhausted for `standard` work.** `checkBudget()`
  is awaited at `:111`, the refusal throws at `:188`, both before the switch at `:266`. ✅
- **The retry storm is cheap.** Each denied job costs one `checkBudget()` and one `connection.exists()`.
  Hundreds of denied jobs cost Redis round-trips, not sends. ✅
- **`recordSend()` accounting is intact for exempt jobs** — `:333` runs for every `critical` job that
  proceeds, so overage stays *measured*. ✅
- **Nothing else depends on the queue being paused.** `email:queue:paused` is now written and cleared
  only by `admin.routes.ts:124,160`, and read only by `EmailBudgetService.isQueuePaused()`
  (`email-budget.service.ts:367-372`) — which is now *more* accurate than before, since the flag no
  longer gets set by a path that never clears it. B12 additionally surfaces the authoritative
  `queue.isPaused()` in the burst alert. ✅

**What was not verified and is wrong:** the comment at `:180-183` claims "Everything the operator relied
on is unchanged". It is not. Under the pause, a denied `standard` job stayed in the queue until an admin
resumed it, and was sent after the budget rolled over. Now it throws, BullMQ retries, and it is
**terminal and gone**. Real timing, from `bullmq/dist/cjs/classes/job.js:489` (`Backoffs.calculate(...,
this.attemptsMade + 1, ...)`) against `getBackoffDelay`: delays of **2 min then 10 min**, terminal at
**~12 minutes**. That is not "queued for tomorrow" — and `:188` still says exactly that:

```ts
throw new Error(`Budget exhausted: ${budgetCheck.reason}. Daily email limit reached - emails queued for tomorrow.`);
```

That string is what lands in the `email.delivery.failed` audit row and the operator's logs. **Failure
scenario:** `EMAIL_TIER` misconfigured to `free` (100/day — the recorded 2026-08-05 incident) on a
jingle day. Every backup notification, dispute notification and citizen thank-you enqueued in that window
is silently discarded within 12 minutes, and the audit trail tells the operator they were held for
tomorrow. **Fix:** correct the message; and decide explicitly whether budget-denied `standard` work
should be re-driven (a `deferEmail`-style park, or an operator-visible count of what was dropped).
Silently dropping mail was the failure class §4(a) of this very story was written to close.

---

### R5 (HIGH, B1 scope) — the exemption also un-gates `staff-invitation` and `password-reset`, which the budget previously stopped; no AC, no doc, no test covers it

`email.worker.ts:143` vs the pre-change `if (!budgetCheck.allowed)` (git diff), against
`packages/types/src/email.ts:320-321`.

`EMAIL_TYPE_PRIORITY` already classified `staff-invitation` and `password-reset` as `critical`. Before
this story every type was blocked on exhaustion. Now four types dial the provider regardless of budget —
two of them nothing to do with registration. Combined with R4, budget exhaustion means: criticals send
with **no ceiling in code at all**, standards are dropped.

So the answer to "is the per-job refusal the spend control?" is: **for `standard` work only.** For
`critical` work there is no refusal — `checkBudget()` is consulted, logged, and ignored. During a burst
every registration produces two exempt criticals, so the exempt volume is exactly the unbounded quantity
this story exists to bound. That may well be the right call for transactional mail, but it is a
deliberate policy change to 9-63's guard affecting two unrelated email types, and it is stated nowhere.
`email.worker.test.ts` has no case for either type under `DENIED`. **Fix:** state it in the AC4 record and
in the operator docs, and add the two converse tests; or scope the exemption to the registration types.

---

### R6 (HIGH, docs) — the false pause/exemption claim survives in a fourth operator document and in the shared types, and the roadmap's replacement contradicts itself

The Outcome block names three documents. It missed two places and mangled a third.

**(a) `docs/runbooks/13-3-cutover-and-failover.md:44-47` — NOT corrected**, still reads in full:

> "Two of the three are classified `critical`, which exempts them from the queue-wide budget-exhaustion
> pause — without that, an exhausted **marketing** budget would stop a citizen's **login link**, a failure
> that did not exist before the change."

The mechanism it describes no longer exists. This is the runbook opened *during* the jingle, and the
section was added by this very story — so it is not inherited drift, it is drift the fix pass created.

**(b) `packages/types/src/email.ts:326-329` — NOT corrected:** "`critical` is what keeps them out of the
>=80%-budget deferral AND (13-65 AC4) out of the queue-wide budget-exhaustion pause, so an exhausted
MARKETING budget can never stop a citizen's login link." Both halves are now wrong: there is no pause,
and the thank-you is kept out of the deferral by the `registration-` prefix test, not by `critical`.

**(c) `docs/roadmap-to-launch.md:136` — the replacement left the old clause in place**, producing a
sentence that asserts both things at once:

> "…and `critical` types are exempted from the queue-wide budget-exhaustion pause so the queue-wide
> budget-exhaustion **auto-pause was REMOVED** (13-65 review B1)…"

A reader cannot tell which is true. `pre-viral-push-checklist.md:20` and
`enumerator-prod-smoke-and-golive-gate.md:31` **are** correct and read well — the B11 status-label drift
is also genuinely fixed (both now say `review`). ALL CONFIRMED BY READING.

---

### R7 (MEDIUM, B8) — the apply run still prints the disproven evidence procedure, and `verifyDelivery`'s counters are structurally degenerate

`_backfill-registration-autosends.ts:373-380` — after a live apply the script still tells the operator:

> "re-run this script with `--dry-run`. The remaining-eligible count it prints is marker-derived, so it
> going to ~0 IS the delivery evidence."

That is precisely the claim M8 disproved (`runDryRun` → `selectEligible` → `filterMarketingCohort`, so
the count drops via the **contact gap**, not the marker). `--verify` was added and the operator is still
routed to the wrong procedure — which, given R1, is the only one that runs.

Separately, `verifyDelivery` (`:435-482`) is built on `fetchCandidates`, whose `WHERE` clause
(`:159-165`) already restricts to rows with **at least one marker NULL**. Re-reading the markers for
exactly those ids therefore makes `bothDelivered` structurally ~0 and `stillMissing === checked` by
construction; the second query returns what `fetchCandidates` already put in `confirmationSentAt` /
`thankyouSentAt`. The exit code still happens to be sane (all-delivered ⇒ zero candidate rows ⇒ the
`:439` early return ⇒ exit 0), but the report reads like a delivery census and is not one.

**On the raw SQL, since it was asked:** `sql.raw` building `ARRAY[...]::uuid[]` at `:449` is **not
injectable** — the ids come from `respondents.id`, a `uuid` column, so no quote can appear in them — and
the **empty-array case IS correctly guarded** by the `rows.length === 0` early return at `:439`. It is
still an unnecessary bypass of parameterisation in a repo that runs a raw-SQL drift guard; `inArray()` or
a bound `= ANY(...)` is equivalent and safe by construction.

---

### R8 (MEDIUM, B4) — the move is correct; a truncated comment and one un-named residual came with it

**B4 verified clean on the substance.** `submission-processing.service.ts:1375-1381` — the enqueue is
genuinely the last statement; fraud (`:1332-1344`) and marketplace (`:1349-1359`) are byte-identical to
HEAD and in their original relative order; both callers are unchanged (`registration.controller.ts:1263`
still `void`+`.catch()`, `submission-processing.service.ts:442` still awaits). The stale "never throws"
docblock was fixed. ANALYSIS + git diff.

Two leftovers:

1. **`:1329` is a truncated orphan comment** where the statement used to be — `// 3. Registration
   auto-emails — an ENQUEUE (13-65), awaited like the other two queue ops so an` — cut off mid-sentence,
   followed by a blank line. An artefact of the cut-and-paste that nothing type-checks.
2. **The enumerator-path residual moved rather than closed.** With `submissions.processed = true` already
   committed at `:411-417`, an enqueue throw at `:1375` still early-returns on retry — so on that path a
   Redis blip now permanently loses **the two emails**, with no `recordAutoSendFailure` count (the
   counter lives in the handler, which never ran) and no Telegram page (that is the wizard caller's).
   Fraud and marketplace are saved, which was the point; the new residual is smaller but real and unstated.

---

### R9 (MEDIUM) — `getBackoffDelay(0)` is unreachable, so the "30s/2min/10min" retry claim this story restates in six new places is wrong

`email.queue.ts:81-83` + `bullmq/dist/cjs/classes/job.js:489`, which calls the custom strategy with
`this.attemptsMade + 1`. First failure passes `1` → 120 000 ms; second passes `2` → 600 000 ms.
`BACKOFF_DELAYS[0] = 30_000` is **never used**. Real schedule: **2 min, 10 min, terminal at ~12 min.**

Inherited from 1-11/13-3, but 13-65 newly restates the wrong figure in `email.queue.ts:428`,
`registration-email-jobs.ts:221`, `registration-email-jobs.integration.test.ts:27` and the story text, and
it is load-bearing for two of this pass's decisions: R4's "bounded, then terminal" window, and **B7's
`removeOnFail: { age: 900 }`** — 15 minutes of retention after a terminal failure that arrives at ~12
minutes, i.e. the magic-link job record is gone ~27 minutes after enqueue. That is defensible for a
credential, but it should be chosen against the real number rather than the documented one.

**B7 is otherwise correct:** per-job `removeOnComplete`/`removeOnFail` merge over `defaultJobOptions` in
BullMQ, so `attempts: 3` and the custom backoff survive the override (`email.queue.ts:57-72` vs
`:451-455`). ANALYSIS.

---

### R10 (LOW, B2) — the exclusion is a string prefix test, and the comment it left behind is now false

`email.worker.ts:218` — `String(type).startsWith('registration-')`.

**B2 works and the converse holds:** `email.worker.test.ts:336` reddens if reverted (it asserts
`deferEmail` is *not* called and the handler *is*), and `:360` proves genuine ops/staff deferral still
fires for `backup-notification`. CONFIRMED BY RUNNING.

The fragility is real though. `EmailJobType` is a compile-enforced union everywhere else in this file —
`getRecipientEmail` (`:46-60`) has no `default` precisely so the compiler catches an omission — and this
predicate throws that away. A future citizen-facing type that does not happen to start with
`registration-` (a wizard reminder, a pending-NIN nudge, a status-change notice) falls straight back into
the ops digest: the exact bug just fixed, silently. A `const CITIZEN_FACING: Record<EmailJobType,
boolean>` or a `Set<EmailJobType>` costs one line and fails the build when a type is added.

Consequently the `buildDeferralSummary` comment at `:71-77` is now stale — it says "Only
`registration-thankyou` can ever reach the deferral path"; after B2, **none** of the three can.

---

### R11 (LOW, B3) — the wrapper is correct; two small edges

**B3 verified clean on both questions asked.**

- **Can `reportFailure` throw in front of BullMQ's retry?** In practice no. `recordAutoSendFailure`
  (`email-autosend-monitor.ts:83-149`) guards every fallible call: `resolveRedis()` is try/caught,
  `incr`/`expire` are try/caught with an early return, the `SET NX` is try/caught, and
  `sendTelegramMessage` carries `.catch(() => {})`. The `logger.error` at `:90` is the only unguarded
  statement and pino does not throw on a plain object. ANALYSIS.
- **Can it double-report?** No. Both `*Impl` bodies now only `throw`; every `reportFailure` call site is
  gone from them (`registration-email-jobs.ts:219-226`, `:379-382`), and
  `registration-email-jobs.test.ts:115,128` pin `toHaveBeenCalledTimes(1)`. The four new B3 tests at
  `:288-341` genuinely fail if `reportThenRethrow` is removed. CONFIRMED BY RUNNING.

Two edges worth one line each: `reportThenRethrow` (`:476-481`) does not guard the `await reportFailure`,
so it rests entirely on that "Never throws" contract — a `.catch(() => {})` would make the guarantee
local rather than remote; and **`ctx` is now a dead parameter** in both `confirmationJobImpl` (`:176`)
and `thankYouJobImpl` (`:268`) — passed, never read, since the reporting moved to the wrapper.

---

### R12 (LOW, B12/B6) — clean, with one silent catch

`middleware/registration-burst.ts:76-98` — `readEmailQueueState` has its own try/catch so a queue-read
failure degrades to "unavailable" instead of swallowing the page it annotates, and `evaluateBurst` never
reads either field. Correct, and pinned by tests. One gap: the `catch` at `:95` logs **nothing**, so a
persistent queue-read failure is visible only inside a Telegram message that fires only when a burst is
already detected. One `logger.warn` closes it.

**B6 (`draft-adoption/send.ts:84-112`) is clean** and the reasoning is right: the catch is scoped to the
enqueue alone, it fires after the confirmation has already dispatched and ledgered, it logs at `error`
with the operator's next move in the note, and it returns `{ sent: true }` — which is the truth about the
half the citizen experienced. No finding.

---

### What the fix pass got genuinely right

- **The B1 design ruling is sound where it matters.** The TOCTOU rejection of "gate the pause on no
  critical work" is correct, no path reaches a provider call with the budget exhausted for `standard`
  work, `recordSend()` accounting survives, and nothing outside `admin.routes.ts` depended on the pause.
  The failure is in what it *says* (R4, R5, R6), not in the choice itself.
- **B3, B4, B6, B12 are correct fixes** with falsifiable tests, and the `email.worker.test.ts:268`
  regression guard does redden on a literal revert.
- **B2's converse is pinned** — "never defers registration mail" cannot be satisfied by breaking deferral
  for everything.
- **The AC7 route test** (`registration.routes.test.ts`) and the B3 thrown-failure tests are the two best
  tests in this pass: both fail if the code is reverted, and both were absent before.
- **B8's empty-array case is correctly guarded and the exit code is sane** — the two things most likely to
  be wrong in a hand-rolled `ANY(...)` are the two things that are right.

---

### Recommended disposition

**R1 and R2 must be fixed before anything runs against prod**, and neither is visible to any gate the
fixer cited: `--verify` is dead code, and the AC8 Half B blast radius is double what the operator
consents to. **R3, R4 and R6 must be fixed before this ships** — R3 makes the documented Half B command
crash, R4 leaves an audit trail that misdescribes discarded mail, and R6 leaves the disproven safety
claim live in the runbook read during the jingle. R5 needs a ruling rather than a fix.

⚠️ **This is the third consecutive pass in which the tests were greener than the code.** The pattern is
now specific and worth naming: **every finding above lives where the suite cannot reach** — `scripts/`
(outside tsconfig, no tests), a third-party library's argument semantics, and four markdown files. A
fourth pass should start there rather than in `src/`.

Status left as `review`. No code, Status field or Dev Agent Record was modified by this review.

---

### Action Items — THIRD PASS (dev response) — CRITICAL → LOW

⚠️ **THE PROCESS FAILURE THIS PASS EXPOSED, STATED FIRST — IT IS DIFFERENT FROM THE LAST TWO.**
Passes 1 and 2 slipped through because the gates were structurally blind (`apps/api/scripts/` sits
outside tsconfig and has no tests). **This time three of twelve items were marked ✅ WITHOUT BEING
APPLIED AS RECORDED** — T3 (the printed string was left; only its comment was corrected), T4 (JSDoc
claims a `satisfies` that does not exist), T5 ("corrected in all five places" — four were done, all
in one file). Nothing was hidden. A tick was taken as evidence of its own claim.

➜ **RULE FOR THIS PASS: every item is closed only with a READ-BACK** — a grep or diff of the file,
pasted as evidence — never from memory. A tick is a claim, and three of mine were false.

⚠️ **AND A VERIFICATION LESSON FROM T1:** C1 was "proved by running", but the run used a body with
no `[<id>]` placeholder, so `idReplacement` was false and the code path C1 ADDED was never exercised.
Running the wrong configuration is not verification. Each fix below states which configuration it was
proved in.

| # | Sev | Finding | Fix | Order |
|---|---|---|---|---|
| **D1** | **CRITICAL** | **T1** — `idReplacement` under-declares `Content-Length` (autocannon assumes `[<id>]`→33 chars; hyperid emits 24). Raw-socket capture: declared 41, sent 32, `bodyComplete=0`. **The AC8 write rig creates ZERO rows and returns a guaranteed RED.** | Replace `idReplacement` with `requests: [{ setupRequest }]` so autocannon sizes each body itself. Prove WITH a `[<id>]` body. | **1st — must not reach prod** |
| **D2** | **CRITICAL** | **T2** — `--amount abc` → `NaN`; `NaN <= 0` is false, so the mandatory-bound refusal is SKIPPED and the run falls to the duration branch: **50 connections × 60s unbounded against `POST /wizard`**. `connections`/`duration` have `Number.isFinite` guards; `amount` — added by C3 — has none and no tests. | Guard it like its siblings; test the guard. | 2nd |
| **D3** | HIGH | **T3** — the apply run still PRINTS the disproven `--dry-run` evidence procedure (`:392-393`). | Correct the printed string. | 3rd |
| **D4** | HIGH | **T4** — the JSDoc promises a `satisfies`-checked set; none exists, and adding an `EmailJobType` compiles clean. A false guarantee is worse than none. | Make the guarantee REAL — an exhaustive `Record<EmailJobType, boolean>` — so the compile error actually happens. | 4th |
| **D5** | HIGH | **T5** — the removed pause and the wrong retry schedule survive in `registration-email-jobs.ts:220`, its integration test `:27`, `email.worker.ts:88/:89/:383`, `email.queue.ts:447`, `email-backpressure.test.ts:78-81` and the sprint-status DEV note. | Correct every site, then grep to prove none remain. | 5th |
| **D6** | HIGH | **T6** — `--dry-run` is REFUSED on a write run, so the runbook's "always start here" fails; Half A (50×60s PUT) is inexpressible now `--amount` is mandatory; the script's own usage examples are refused by its own validation. | Let a dry run PREVIEW (it sends nothing) while still showing what would be refused; re-express Half A as a bounded count; fix the examples. | 6th |
| **D7** | MEDIUM | **T7** — `--verify`'s population is the base public cohort, not the BACKFILL's population, so the pass can never read clean while unrelated public rows lack markers. | Scope it to the backfill's predicate, or state the difference in the output. | 7th |
| **D8** | MEDIUM | **T8** — a modified file is missing from the story File List. | Regenerate from `git status`. | 8th |
| **D9** | MEDIUM | **T9** — C6's ruling is sound and tested, but R5's OPERATOR-facing half was not done: nothing tells an operator that budget exhaustion no longer blocks staff invitations or password resets. | Record it where an operator reads. | 9th |
| **D10** | LOW | **T10** — a broken pointer introduced by this story ("§B.4 above"). ⚠️ Same class as the R2 pointer error adjudication caught on 13-46. | Point it somewhere real. | 10th |
| **D11** | LOW | **T11** — clamping connections to amount maximises concurrency on the run that wants the least. | Clamp toward the smaller, sane value. | 11th |
| **D12** | LOW | **T12** — the comment justifying the `amount`/`duration` spread states a false fact about autocannon. | Say what is true. | 12th |
| **D13** | LOW | **T13** — `load-test.ts:16` points at a route that does not exist. | Correct it. | 13th |

## 🏁 FOR ADJUDICATION — final gate state + the fourth-pass probes, IN LIEU of a fourth review

**Awwal's ruling, 2026-08-23:** three review passes have cost considerable compute; a fourth is not
being run. The probes a fourth pass would have carried are written out below so the ADJUDICATION
AGENT can execute them inside its own pass instead of triggering another long review cycle.

### Final gate state — measured 2026-08-23, all by the dev, not taken from a report

| Gate | Result |
|---|---|
| Full API suite (`pnpm --filter @oslsr/api test`, vs `app_test`) | **4208 passed · 0 failed** · 299 files · 2 skipped |
| Full web suite (`cd apps/web && pnpm vitest run`) | **3010 passed · 0 failed** · 272 files |
| `tsc --noEmit` | clean — `apps/api` AND `apps/web` |
| `pnpm --filter @oslsr/api lint` | clean · registry-read + respondent-write drift guards (393 files) · story-residual guard (320 stories) |
| `apps/api/scripts/` | **EXECUTED, not typechecked** — both `load-test.ts` and `_backfill-registration-autosends.ts` |
| File List | 32 entries = 32 in `git status`, verified |

**Review history: 39 findings across three passes, all closed.** The passes failed in three different
ways, and the progression is the useful part: (1) the code was wrong; (2) the GATES could not see the
code — both criticals lived in `apps/api/scripts/`, outside tsconfig with no tests; (3) the RECORD did
not match the code — three items were ticked without being applied. Only the third was a discipline
failure, which is why every item in the third pass closes with a **read-back** (a grep or diff), and
the two riskiest were proven by deliberately BREAKING them.

### ⚠️ PROVEN vs NOT-YET-DISPROVEN — read this distinction before trusting the table above

**Proven by execution:**
- **D1** — with a `[<id>]` body (the configuration the previous pass never tested), an independent
  server counted `arrived=4 bodyComplete=4`; before the fix `bodyComplete=0` and the rig reported
  `requests: 0 total · VERDICT: RED`.
- **D2** — `--amount abc` is refused; it previously became an unbounded 60s write run against
  `POST /wizard`.
- **D4** — injecting a new `EmailJobType` without a map entry produces **4 tsc errors**; it previously
  compiled clean, so the "compile-time guarantee" in the JSDoc was false.
- **D5** — grep read-back: zero stale retry-schedule or pause claims remain anywhere.
- **D6** — `--dry-run` previews a write run and prints `⚠️ WOULD REFUSE` instead of aborting.

**NOT proven — the fourth-pass probe list. Each is a specific, checkable claim:**

1. ✅ **CLOSED BEFORE HAND-OFF — `setupRequest` bodies are genuinely DISTINCT.** This was written as
   an open probe: D1 had counted body *completions* (4/4) but never whether the bodies DIFFERED, and
   if substitution ran once instead of per request every write would still complete while all landing
   on ONE row — the exact defect B5 exists to fix, wearing a green verdict. **Measured 2026-08-23**
   against a body-recording server: **6 requests → 6 distinct bodies**
   (`zz+1787474901805-0@x.test`, `…-1`, `…-2`), 0 failures. No adjudicator action needed.
2. 🔴 **`CITIZEN_REGISTRATION_EMAIL_TYPES` changed TYPE, not just value.** It was a `readonly` tuple
   from `as const`; it is now a filtered `EmailJobType[]` derived from the map. `tsc` passes, so no
   current consumer depends on the tuple type — but this is an exported surface `apps/web` imports.
   **Check:** any consumer relying on literal-tuple typing or on iteration order.
   `packages/types/src/email.ts`.
3. **D11 introduced a hard ceiling nobody asked for.** The clamp is now
   `min(connections, amount, LOAD_PROFILE.connections)`, so a bounded run can NEVER exceed 50
   connections even when the operator deliberately passes `--connections 100`. Defensible for a write
   run; it is still a silent cap. **Check:** is the cap wanted, and is it visible enough in the plan?
4. **D7 was resolved by STATING, not SCOPING.** `--verify`'s population is every public respondent
   with a resolvable email — NOT this backfill's cohort — so `still missing: 0` will rarely be true
   and must not be read as "the run failed". Tightening it to the run's actual cohort is a real
   change, not a wording one. **Check:** is stating it sufficient for an operator at 2am?
5. **C6 is a product ruling, not a technical one.** Budget exhaustion no longer blocks
   `staff-invitation` or `password-reset` — a registration story changing unrelated mail. Ruled KEEP
   (a password reset is someone locked out; blocking it to save a fraction of a cent is the wrong
   trade), tested, and now documented in `docs/RESEND-SETUP.md`. **Check:** does the adjudicator agree
   with the ruling, not merely with the test?
6. **C9 deliberately did NOT change code.** The effective backoff is **2min then 10min**, not
   30s/2min/10min, because BullMQ passes `attemptsMade >= 1` so `BACKOFF_DELAYS[0]` is unreachable.
   Re-indexing would alter live retry timing, so only the claims were corrected. **Check:** is leaving
   a dead array entry the right call, or should it be removed?
7. **AC8 HAS NEVER RUN.** The rig is fixed and executable; the measurement itself is scheduled for the
   first real spot (Mon 24 Aug 2026, Fresh FM — one station, one 60-second spot), deliberately in
   preference to a synthetic prod run that would leave thousands of rows and send thousands of real
   emails. **Gate item 7 must stay RED until the before/after comparison is recorded.**
8. **Pointer accuracy was audited BY THE AUTHOR.** All four referenced story keys exist and all nine
   `11-8` references correctly say it stays in backlog — but adjudication caught exactly this class of
   error on 13-46 (R2's hand-off named the wrong story). **Check:** independently.

### What is NOT in scope for this story, recorded so it is not rediscovered

- **11-8 (PM2 worker/API process split) stays in backlog, untouched.** Awwal ruled the topology is
  battle-tested and will not change. Queueing buys BOUNDED CONCURRENCY, durability, retry and
  backpressure — it does **not** reduce total CPU and does **not** give event-loop isolation, because
  all 10 workers run inside the API process. No artefact in this story claims otherwise.
- **Two load-sensitive web tests** (`route-resolution.integration.test.tsx`, `a3-eslint-policy.test.ts`)
  have budgets the same order as their own cost and produce false reds under load — and, worse, a
  false BISECTION: reverting a file makes them pass because it restores CACHED content, not because
  the change was at fault. Recorded above; deserves its own story.

## Senior Developer Review (AI) — THIRD PASS, on the C-PASS FIX DELTA (C1–C12)

**Reviewer:** adversarial code-review workflow (`bmad:bmm:workflows:code-review`), 2026-08-23, on the
UNCOMMITTED tree of `story/13-65-registration-sends-off-request-path` in the `wt-13-46` worktree.
**Subject: the SECOND-PASS action items (C1–C12), not the whole story.** No code, Status field or Dev
Agent Record was modified.

**Baseline re-verified, not trusted:** full API suite **299 files / 4208 passed / 0 failed** (253s,
against `app_test`); `tsc --noEmit` clean on `packages/types` and `apps/api`; `pnpm --filter @oslsr/api
lint` clean including all three drift guards. The fixer's numbers are exact.

**What I ran myself:** `load-test.ts` in eight configurations against an instrumented counting server
(including a raw-socket capture of the bytes actually on the wire); `autocannon` directly in twelve
option shapes; `_backfill-registration-autosends.ts` with **every** documented flag, and `--verify`
against five purpose-seeded rows in `app_test` (torn down, verified zero left); `tsc` on an isolated
reproduction of the C10 type; and a **mutation test** of the C6 guard. Findings marked CONFIRMED BY
RUNNING or ANALYSIS.

> **Every finding below is again outside what the suite can reach** — `scripts/`, a third-party
> library's wire format, a `packages/types` JSDoc, and several markdown/comment sites. That is now the
> third consecutive pass with the same shape, and a fourth should start there again.

---

### T1 (CRITICAL, C1/C3 blast radius) — `idReplacement` under-declares `Content-Length`, so every write-path request times out: the rig reports **0 requests and RED** while the server never receives a complete body

`apps/api/scripts/load-test.ts:111` (`varies`) → `:163` (`idReplacement: varies`), against
`autocannon/lib/httpRequestBuilder.js:90-93`.

autocannon computes `Content-Length = bodyBuf.length + (idCount * 27)` — it assumes each 6-character
`[<id>]` expands to 33 characters. The installed `hyperid` emits **24**. Raw-socket capture of an
actual request:

```
--- declared Content-Length: 41
--- actual body bytes sent : 32
--- body: {"a":"dzI-6xDPSEiLbWrVPadvEg-0"}
```

Every request therefore under-sends by 9 bytes per placeholder, and the server's request stream never
ends. **CONFIRMED BY RUNNING** against an instrumented HTTP server:

| config | server `arrived` | server `bodyComplete` | server `responded` | autocannon | duration |
|---|---|---|---|---|---|
| `idReplacement: true`, one `[<id>]` | 4 | **0** | **0** | `total=0 errors=4 timeouts=4` | 20.2s |
| `idReplacement: true`, three `[<id>]` (realistic wizard body) | 4 | **0** | **0** | `total=0 errors=4 timeouts=4` | 20.2s |
| identical, `idReplacement: false` | 4 | 4 | 4 | `total=4 errors=0` | 1.0s |

Through the script itself (`--method POST --amount 8 --body '{"a":"[<id>]"}'`), the server counted 8
while the script printed:

```
requests:    0 total · 0.0 req/s
failures:    16 errors/timeouts · 0 non-2xx · 0.00%
VERDICT: RED — no requests completed — origin unreachable or test misconfigured
```

**Failure scenario.** AC8 Half B against prod. Express's json parser never fires, so **zero**
respondents/users/submissions/tokens are created; each request hangs the full 10-second client
timeout; and gate item 7's evidence run returns RED at 0 req/s. The operator's conclusion — "the box
failed the write-path capacity gate" — is the opposite of what happened.

**Why it survived C1.** R3 marked `idReplacement` "genuinely right — verified against
`autocannon/README.md` and the installed 8.0.0 source": verified by READING. C1 then verified by
RUNNING, but corroborated only the counting server's **arrival delta** (8) and did not read the
script's own verdict line, which said `0 total / RED` in the same output. The C-pass Outcome block's
own lesson — *"'Run it' is necessary and not sufficient — the harness needs corroboration too"* —
inverted: the corroborating counter was believed and the instrument's own verdict was ignored.

**Fix (verified working):** drop `idReplacement` and vary the body through autocannon's per-request
hook, which rebuilds `Content-Length` from the body it returns —
`requests: [{ setupRequest: (req) => ({ ...req, body: JSON.stringify({ … }) }) }]`. Measured:
`arrived=4 bodyComplete=4 responded=4`, `total=4 errors=0`, distinct bodies per request,
`contentLength === actualBytes`.

---

### T2 (CRITICAL, C3) — `--amount <non-numeric>` silently defeats the mandatory bound and turns a consented write run into an **unbounded 60-second flood**

`apps/api/src/lib/load-test-eval.ts:203` (`amount: Number(argValue(argv,'amount') ?? 0)`), `:249`
(`args.amount <= 0`), consumed at `load-test.ts:136,144,160`.

`Number('abc')` is `NaN`; `NaN <= 0` is **false**, so the "a write run must be bounded" refusal does
not fire — and `NaN > 0` is also false, so `main()` takes the **`duration`** branch.

**CONFIRMED BY RUNNING** (`--amount abc` and `--amount 2O`, a plausible typo, with the write-consent
flag already typed):

```
profile:     50 connections × 60s (warmup 5s)
[dry-run] plan printed; no requests sent.        ← no refusal
```

**Failure scenario.** `--amount 2O` against `POST /api/v1/registration/wizard` on prod: 50 connections
for 60 seconds, unbounded — thousands of respondents, users, submissions, magic-link tokens,
marketplace profiles, `campaign_sends` rows and real emails, against a teardown table sized for the
number the operator typed. That is R2's failure class, one order worse.

`connections` and `duration` each carry `Number.isFinite(x) || x <= 0 → throw LoadTestArgError`
(`:177-182`). `amount` — the **only** flag whose job is to bound a destructive run — got neither, and
has **no test**: `load-test-eval.test.ts` mentions `amount` twice, both as fixture values (`:205`,
`:222`). This is in the module whose own docblock says "all of the parsing, the validation and the
prod refusal live in `src/lib/load-test-eval.ts`, which is type-checked AND unit-tested".

Related, same line: the plan text `(warmup 5s)` prints unconditionally in the `amount <= 0` branch,
but `useWarmup` also requires `method === 'GET'` — so every non-GET run reaching that branch is told it
will warm up when it will not.

---

### T3 (HIGH, C8 — TICKED ✅, NOT APPLIED) — the live apply run still routes the operator to the disproven `--dry-run` evidence procedure

`apps/api/scripts/_backfill-registration-autosends.ts:386-395`. After a LIVE apply the script still
prints, verbatim:

```
TO CONFIRM DELIVERY: wait for the queue to drain … then re-run this
script with --dry-run. The remaining-eligible count it prints is marker-derived, so
it going to ~0 IS the delivery evidence.
```

`--verify` appears **nowhere** in `runApply`'s output (grep: only in `HELP_TEXT` and in comments).
CONFIRMED BY READING + grep.

What *was* changed is the **code comment** at `:326-329` — "⚠️ review C8 — this used to say `--dry-run`,
and that was DISPROVEN" — i.e. the note *about* the instruction was corrected and the instruction the
operator actually reads was not. `[[pattern-a-record-about-the-work-is-not-the-work]]`, in the item
whose entire content was one string.

---

### T4 (HIGH, C10) — the `satisfies`-checked set does not exist; the JSDoc's compile-time guarantee is false, so R10's regression is exactly as open as before

`packages/types/src/email.ts:325-340`. The docblock claims: *"A `satisfies`-checked set means adding a
type without deciding its digest behaviour is a compile error, not a silent regression."* There is no
`satisfies` in the file, the array is not constrained to `EmailJobType`, and
`isCitizenRegistrationEmailType(type: string)` takes a bare `string`.

**CONFIRMED BY RUNNING** — `tsc --noEmit --strict` on an isolated reproduction that adds
`'registration-pending-nin-reminder'` to `EmailJobType`: **exit 0, no error.** A typo'd member
(`'registration-thankyu'`) and a member that is not an email type at all also compile clean.

So the failure R10 described — a future citizen-facing registration type falling silently into the ops
digest, the exact bug B2 fixed — is unchanged, and the code now carries a comment asserting it cannot
happen. `EMAIL_TYPE_PRIORITY: Record<EmailJobType, EmailPriority>` twenty lines below *is* the pattern
that works; the new constant does not use it.

**Fix:** `] as const satisfies readonly EmailJobType[];` catches typos and non-members;
`Record<EmailJobType, boolean>` (what R10 actually asked for) is what makes an omission a build error.

**Same finding, un-fixed half:** `email.worker.ts:71-77` still says *"Only `registration-thankyou` can
ever reach the deferral path (the other two are `critical`)"*. R10 named this comment explicitly.
After B2, **none** of the three can reach it.

---

### T5 (HIGH, C5 + C9) — "corrected in all five places" is false: the removed pause and the wrong retry schedule both survive in code this story added

**The pause claim (C5):**

| Site | Text | Added by |
|---|---|---|
| `queues/email.queue.ts:446-447` | "`critical` — never deduped, never deferred, never stopped by the **budget-exhaustion pause** (AC4)" | 13-65 |
| `workers/email.worker.ts:89` | "AC4: Budget tracking with **automatic queue pause** when exhausted" — 70 lines above the code that removed it | inherited, in-file |
| `queues/__tests__/email-backpressure.test.ts:78-81` | "…AND out of the **queue-wide budget-exhaustion pause**. Flip either to `standard` and an exhausted MARKETING budget can stop a transactional email." | 13-65 (a `+` line) |
| `sprint-status.yaml:538` (the current DEV note) | "AC4 `critical`-exempt-from-budget-pause **shipped**" | 13-65 |

**The retry schedule (C9):** four sites were corrected, **all inside `email.queue.ts` /
`email.queue.test.ts`**. Both sites R9 named by `file:line` outside that file are untouched:

- `services/registration-email-jobs.ts:220` — "THROW so BullMQ retries at **30s/2min/10min**" (new in 13-65)
- `services/__tests__/registration-email-jobs.integration.test.ts:27` — "exactly as a BullMQ retry at **30s/2min/10min** would be" (new in 13-65)
- `workers/email.worker.ts:88` — "AC3: Exponential backoff (30s, 2min, 10min)"
- `workers/email.worker.ts:383` — "AC3: Custom backoff strategy (30s, 2min, 10min)", sitting **directly on the `backoffStrategy` registration**, i.e. the exact site of the defect
- story text `:35`, `:107`, `:131` — and `:35`'s argument ("a worker retry at 30s/2min/**10min** walks straight past a 5-minute window on the third attempt") now cites numbers that do not exist; the conclusion survives, the reasoning does not

Also `queues/__tests__/email.queue.test.ts:100-105` now asserts **three** different schedules in one
comment block: the new C9 correction, the old "30s, 2min, 10min", and the pre-existing false "Note: Our
implementation uses 30s, 60s, 120s which is stricter". And `docs/RESEND-SETUP.md:192` still quotes the
exact error string C7 rewrote ("Daily email limit reached - emails queued for tomorrow").

ALL CONFIRMED BY READING + grep.

---

### T6 (HIGH) — `--dry-run` cannot preview a write run, and the runbook's Half A is impossible to express

**CONFIRMED BY RUNNING**, all three:

1. `loadTestRefusal` is evaluated at `load-test.ts:76`, **before** the `args.dryRun` return at `:92`.
   So the runbook's "always start here" line (`13-3-cutover-and-failover.md:68-71`) —
   `--dry-run --method PUT --path … --body '{…}'` — exits 2 with `✋ REFUSING: a PUT run CREATES ROWS…`.
   The one affordance whose purpose is to show the operator the plan *before* consenting requires the
   consent flags first.
2. Every non-GET run requires `--amount`, and `--amount` discards `--duration`. So Half A — documented
   at `13-3-cutover-and-failover.md:76-81` as "draft-save at the modelled peak (default `LOAD_PROFILE`:
   50 × 60s)", explicitly *the high-volume half* — **cannot be run at all**. C3 hardened the bounded
   path without reconciling it with a documented half that is deliberately duration-based.
3. Both write examples in the script's **own** header (`load-test.ts:20-29`) are refused by validation
   living in the same change — they carry neither `--amount` nor
   `--i-understand-this-writes-rows-and-sends-email`.

---

### T7 (MEDIUM, C4) — the rewritten `--verify` query is CORRECT; its POPULATION is not the backfill's population, so the pass can never read clean

Seeded five rows in `app_test` (one both-delivered; one no-markers; one with **two** magic-link tokens
and only the confirmation marker; one `@oslsr.test` synthetic; one `source='enumerator'`), ran, tore
down (`tokens=2 respondents=5 users=4` → 0/0/0, verified). **CONFIRMED BY RUNNING.**

**What is right (the three things challenged):**

- ✅ **No double count.** The respondent with two `magic_link_tokens` rows appears **once** —
  `DISTINCT ON (r.id)` with `ORDER BY r.id, mlt.created_at DESC NULLS LAST` is correct, and the
  ordering picks the newest token's email, matching `fetchCandidates`.
- ✅ **A non-zero success is now reportable** — `population: 4 / both delivered: 1 / still missing: 3`.
  R8's structural degeneracy is genuinely gone.
- ✅ Enumerator rows excluded; the empty case still early-returns; and the hand-rolled
  `sql.raw('ARRAY[…]::uuid[]')` R7 flagged is gone entirely — the query is parameterised throughout.

**What is wrong:**

1. **The population is wider than the backfill's, with no way to close the gap.** verify reads
   `public + resolvable email`; the backfill reads that MINUS `isTestEmail` MINUS
   `filterMarketingCohort`. My `@oslsr.test` row sits in `still missing` while `--dry-run` reports
   `skipping test rows=1` for the same row. On prod that means every AC8 write-path smoke row (the
   sentinels are `+tag` addresses, matched by `TEST_EMAIL_RE`) and every 13-9-suppressed address is
   **permanently** "still missing" — and the report attributes it to "the queue has not drained, the
   job exhausted its attempts, or the enqueue was dropped as a duplicate", none of which is true. The
   operator's stated stop condition ("re-run `--verify` after the queue drains before concluding") has
   no terminal state. `isTestEmail` is exported two hundred lines above; applying it, and reporting
   excluded-by-design separately, closes this.
2. **`--max-rows` truncates the census and mislabels it as the population.** `--verify --max-rows 2`
   printed `population: 2 public respondents with a resolvable email` — there were 4 — and reported
   `0 delivered / 2 missing` against a true `1 / 3`. Worse, the two `LIMIT`s are over **different row
   sets** (verify = all public, ordered by id; apply = public-missing-a-marker, ordered by id), so
   `--apply --max-rows N` followed by the habitual `--verify --max-rows N` verifies a different N rows.
   Ignore `--max-rows` for `--verify`, or label the line as capped.

---

### T8 (MEDIUM) — a modified file is missing from the story File List

`apps/api/src/queues/__tests__/email.queue.test.ts` is modified (it is a C9 correction site, `:100-105`)
and does not appear under **Modified — tests**. Every other changed path reconciles with `git status`.

---

### T9 (MEDIUM, C6) — the ruling is sound and tested, but the operator-facing half of R5's fix was not done

R5 asked for the scope change to be stated "in the AC4 record **and** in the operator docs". grep across
all four runbooks and `roadmap-to-launch.md`: **no mention** that budget exhaustion no longer blocks a
password reset or a staff invitation. The four documents say only "Budget exhaustion now refuses the
offending `standard` job ONLY", leaving the reader to reconstruct which types that covers from
`EMAIL_TYPE_PRIORITY`. The decision currently lives in a test comment and this story file.

---

### T10 (LOW) — broken pointer introduced by this story: "§B.4 above"

`docs/runbooks/13-3-cutover-and-failover.md:91` sends the operator to "the child-first teardown chain in
**§B.4 above**". That document has no §B at all (its sections are ①, ②, *Write-path capacity*,
*Monitoring…*, *Dry-run rehearsal*, *Attribution liveness dry run*). The chain is in
`enumerator-prod-smoke-and-golive-gate.md` §B item 4 — and a copy exists in the cutover runbook itself
at `:187`, **below** the new section, under an unrelated heading. This is the teardown reference an
operator reaches for while holding real prod rows.

---

### T11 (LOW, C3) — clamping connections to amount maximises concurrency on the run that wants the least of it

`load-test.ts:143-144`. `--amount 20` prints `20 connections × 20 requests TOTAL` — one request per
connection, a 20-wide simultaneous burst, while the runbook documents `--connections 2` for Half B. The
clamp **cannot** produce 0 for integer input (the `amount > 0` guard makes `Math.min` ≥ 1) ✅, but
`--amount 0.5` yields `0.5 connections × 0.5 requests` — no integer validation (same root as T2).

---

### T12 (LOW, C1) — the comment justifying the `amount`/`duration` spread states a false fact about autocannon

`load-test.ts:154-159`: *"`amount` and `duration` DO NOT COMPOSE — passing both makes autocannon error
out with every request failing (measured: 8 attempted, 8 errors, 0 reaching a live server…)"*.

**CONFIRMED BY RUNNING** — `{amount: 8, duration: 60, connections: 8}` against a counting server:
**8 requests received, `requests.total=8`, `errors=0`, `2xx=8`** — byte-identical to omitting
`duration`. R3(b) was right: `run.js:88` simply skips the duration timer when `amount` is set; it is
ignored, not fatal. The "8 errors" measurement carries the signature of the Git-Bash path rewrite this
same pass documented in its own Outcome block. The **behaviour** (omit `duration`) is fine and worth
keeping; the recorded reason is wrong, and the next maintainer will act on it.

---

### T13 (LOW) — `load-test.ts:16` points at a route that does not exist

`--path /api/v1/registration/active-form`. The only active-form read in the API is
`GET /api/v1/forms/public-active` (`routes/form.routes.ts:27`); no route matching `active` exists
anywhere else. Run as written against prod it 404s → 100% non-2xx → RED. Inherited from
`13-3-launch-capacity-and-fallback.md:31`, but this story re-blessed the line by relabelling it
"13-3's READ gate run".

---

### What the C pass got genuinely right — so the ranking is calibrated

**C1 — the doubling is genuinely gone, and the GET profile is intact.** `useWarmup = method === 'GET'
&& amount <= 0` means `amount` can never be in `opts` when `warmup` is, so R2's spread-inheritance is
structurally impossible rather than patched. Both spreads do exactly what they look like: when the
condition is false the key is **absent**, not `undefined`, so autocannon's `!opts.warmup` and
`if (!amount)` checks both behave. A GET run now sends `{url, connections, duration, method:'GET',
body:undefined, idReplacement:false, warmup:{connections, duration:5}, headers}` — behaviourally
identical to 13-3's `{url, connections, duration, warmup, headers}`. Measured: `--amount 8` → **exactly
8** at the server. ✅

**C2 — complete, and checked for the class rather than the instance.** All seven documented flags are
in `KNOWN_FLAGS`, and I **executed** each one (`--help`, `--verify`, `--dry-run`, `--apply`,
`--max-rows 5 --dry-run`, `--rate-per-minute 3 --dry-run`, `--verify --max-rows 2`): every one exits 0,
none hits `Unknown flag`. ✅

**C4 — the query judgement call survives.** Detailed above (T7): the inherited `DISTINCT ON` +
`LEFT JOIN magic_link_tokens` shape is correct, does not double-count, and now reports success. The
fixer inherited the shape without reasoning it through and got a right answer; the residue is scope,
not SQL.

**C6 — the ruling survives, and the test has real teeth.** Two checks:

- *Is anything else un-gated?* **No.** `EMAIL_TYPE_PRIORITY` has exactly four `critical` members, and
  `job.data.priority` is populated from that table at every producer (`email.queue.ts:283, 320, 346,
  372, 398, 423, 462, 499, 528`). `queueStaffInvitationEmail`'s `options?.priority` (`:291`) is the
  **BullMQ job option**, not the payload field — no caller can promote a job to `critical`.
- *Does the test pin it?* **MUTATION-TESTED, CONFIRMED BY RUNNING.** Narrowing the guard to
  `!(emailPriority === 'critical' && isCitizenRegistrationEmailType(String(type)))` reddens **exactly**
  the two C6 cases and nothing else (19 pass, 2 fail); restoring the file (md5 verified identical)
  returns 21/21. The decision is genuinely load-bearing.
- On the merits: keeping it is right. A password reset is someone locked out; blocking it to save a
  fraction of a cent is the trade this story already rejected for the magic link. Only the
  documentation half (T9) is missing.

**C9 — the factual claim is TRUE, verified in the installed library, and not re-indexing is correct.**
`bullmq@5.66.4`: `job.js:489` calls `Backoffs.calculate(this.opts.backoff, **this.attemptsMade + 1**, …)`
from `shouldRetryJob`, and `attemptsMade` is incremented only afterwards, in `moveToFailed` (`:545`).
So first failure → strategy(1) → `BACKOFF_DELAYS[1]` = 120 000 ms; second → strategy(2) → 600 000 ms;
third → `2 + 1 < 3` is false → terminal. **2 min, 10 min, terminal ≈12 min.** `BACKOFF_DELAYS[0]` is
unreachable exactly as claimed, and re-indexing would be a live behaviour change rather than a
documentation fix. The judgement is right; only the coverage of the correction is not (T5).

**C7, C11, C12 — clean.** The budget-exhaustion error now says what actually happens ("will retry its
remaining attempts and then be discarded — it is NOT held until tomorrow"); `ctx` is gone from both
`*Impl` signatures and retained only where the wrapper reads it; and `readEmailQueueState`'s catch logs
`registration_burst.queue_stats_unavailable` — observed firing during the test run.

**C5(c) — the garbled roadmap sentence is genuinely fixed.** `roadmap-to-launch.md:136` now asserts one
thing. `pre-viral-push-checklist.md:20` and `enumerator-prod-smoke-and-golive-gate.md:31` read
coherently too, and `13-3-cutover-and-failover.md:44-47` — the fourth document R6(a) found — is
corrected.

---

### Recommended disposition

**T1 and T2 must be fixed before anything is pointed at prod.** T1 means the AC8 measurement returns a
guaranteed RED that is an artefact of the instrument, and creates no rows to measure; T2 means one
mistyped character converts a bounded, consented run into an unbounded 60-second registration flood.
Neither is visible to the 4208 tests, `tsc`, eslint or the three drift guards.

**T3, T4, T5 and T6 must be fixed before this ships.** T3 and T5 leave disproven and removed mechanisms
described as current in the operator path; T4 leaves a false safety guarantee in shared types that the
web package imports; T6 makes the documented Half A un-runnable.

**T7–T13 are corrections, not blockers.**

⚠️ **Three of the twelve C items are not applied as recorded: C8 (not applied at all), C10 (applied,
but its stated guarantee does not exist), C5/C9 (applied to a minority of the sites named).** Each was
ticked ✅ in the action-item table. The previous two passes were caught by "no gate could see it"; this
one is different — these were **self-reported without a read-back**. The mechanical check that would
have caught all three costs one command each: *after correcting a claim, grep the repo for the claim.*

Status left as `review`. No code, Status field or Dev Agent Record was modified by this review.
