# Story 13-46: Public-burst readiness — cap the SEND, not the SIGNUP (radio-jingle traffic controls)

Status: review

<!-- ✅ PREP CONFIRMED 2026-08-16 (adjudication) — NO PREP PASS WAS NEEDED, and this marker exists so
nobody concludes otherwise from the file's shape. It already carries 11 fully-specified ACs with
`file:line` citations, a `## Tasks / Subtasks` section mapping every task to AC numbers, ~200 lines of
Dev Notes, and a Change Log. Its one blocking decision — the acquisition question — was RULED on
2026-08-11 (see the ⚖️ block below), so nothing gates dev.

⚠️ WHY THE MARKER: this story was briefly mis-reported as un-prepped ("0 ACs") because a grep counted
`^### AC` HEADINGS while 13-46 writes its ACs as a NUMBERED LIST under `## Acceptance Criteria` —
`grep -cE '^[0-9]+\. \*\*AC'` returns 11. A count is not a read. Acting on that would have sent a
regeneration pass at a file holding Awwal's ruling, the load-bearing AC ordering note, AC11's
discharge and the attribution finding.

⛔ DO NOT REGENERATE THIS FILE WITH *create-story — same reason as 13-57's header: it would author from
epics.md and destroy decisions that cost real measurement to earn. Edit in place. -->

<!-- Authored 2026-07-30 by Bob (SM), EMERGENT from Awwal's decision to run a radio jingle driving the
public straight at the registration wizard BEFORE the email blasts. Nothing in the code blocks the
jingle; the CONTROLS are wrong for it in both directions at once. (1) An auth-endpoint rate limit
(5/IP/15min, "prevents mass account creation") sits on a public survey endpoint that creates no
accounts — and under Nigerian carrier-grade NAT that IP is a whole carrier's subscribers, so the
control turns away real listeners and leaves no record of who was lost. (2) The thing that actually
needs a ceiling — outbound email, fired synchronously by every public registration — has none: the
notification meter is documented FAIL-OPEN and counts AFTER the send. So the jingle is throttled where
it costs us registrations and unthrottled where it costs us the sending domain. LAUNCH-ADJACENT (it
gates the jingle, which precedes the blasts) — NOT post-launch. Deliberately EXTENDS the two runbooks
that already own this moment (13-3 cutover/failover, pre-viral-push-checklist) and 9-52's existing
Telegram alert path; it creates no third runbook. Bot Fight Mode stays OFF (9-20 decision, not
reopened) and NO captcha is added to the wizard (Awwal's account-security rationale is correct and is
honoured, not overridden — see Context §3). -->

## Story

As **the operator putting a state-wide radio jingle in front of the public registration wizard**,
I want **the outbound email a registration triggers to be CAPPED and per-address throttled, a burst to raise an alert rather than a wall of 429s, and the public "registered" number to survive inflation**,
so that **the jingle converts listeners into registrants instead of into HTTP 429s — and a flood costs us cheap, revocable database rows instead of the sending domain the entire launch depends on.**

## Context & Evidence (verified 2026-07-30 against the tree; prod facts flagged as such)

### 1. The rate limit on the wizard is a transplanted auth control

`registrationRateLimit` is `max: 5` per `windowMs: 15 * 60 * 1000`, **per IP**
(`apps/api/src/middleware/registration-rate-limit.ts:31-32`), and its own docblock states its purpose:
*"Prevents mass account creation"* (`:20-24`). It is mounted on the public wizard submit
(`apps/api/src/routes/registration.routes.ts:51`) and on the Cohort-A supplemental submit (`:56-59`),
with the route file recording exactly where it came from: *"restore the legacy
`/auth/public/register` rate-limit discipline (5/IP/15min) — H1 fix"* (`:48-50`, repeated at `:22-24`).

**There are no accounts on this path.** `submitWizard` writes a `respondents` row
(`apps/api/src/controllers/registration.controller.ts:663-683`) and a `submissions` row (`:699-747`).
An account is provisioned only as a side effect, only when an email was supplied
(`:896`, `:925-930` → `apps/api/src/services/auth.service.ts:793-803`), and that insert is
`onConflictDoNothing({ target: users.email })` — it **reuses** an existing account, it never rejects the
registration. So the control's stated threat model ("mass account creation") does not describe the
endpoint it now guards.

### 2. CGNAT makes the per-IP key actively harmful for a broadcast

Cloudflare's true-client-IP is resolved before any limiter runs — `realIpMiddleware` reads
`CF-Connecting-IP` and is mounted deliberately *"BEFORE any middleware that reads `req.ip`
(rate limiters, captcha, audit logging)"* (`apps/api/src/app.ts:127-133`). For a Nigerian mobile user
that true client IP **is** the carrier's NAT address (MTN / Airtel / Glo / 9mobile egress through small
pools). A jingle drives exactly that audience — roadmap-to-launch already says so: *"Radio drives a
phone-first, NIN-deferring audience"* (`docs/roadmap-to-launch.md:125`).

Consequence, per carrier IP per 15 minutes: **the 6th listener to submit gets HTTP 429.** The only
trace is one `logger.warn` (`registration-rate-limit.ts:38-44`, event
`registration.rate_limit_exceeded`) — **no queue, no retry, no row, no record of the person lost.**

**The draft limiter binds even earlier, and its own comment states the assumption the jingle breaks.**
`wizardDraftRateLimit` is 120/IP/15min (`apps/api/src/middleware/wizard-draft-rate-limit.ts:38-39`),
sized from *"2-second-debounced auto-save → typical 20-60 saves per active wizard session"* with the
explicit justification *"**Shared NATs (~5 wizards concurrently) stay well inside budget**"* (`:20-28`).
Do the arithmetic the file invites: 120 ÷ 20-60 saves ⇒ the budget is exhausted by roughly **2 to 6
concurrent wizard sessions behind one carrier IP**, after which every autosave 429s
(`WIZARD_DRAFT_RATE_LIMIT_EXCEEDED`, event `wizard_draft.rate_limit_exceeded`, `:41-49`). A state-wide
jingle across 11 stations invalidates "~5 wizards concurrently per shared NAT" by construction. This
limiter is NOT in the brief's original list and is added here because it fails *first* and *silently*
(a lost draft looks like a user who "just didn't finish").

### 3. NO captcha on the wizard — the existing rationale is CORRECT and is preserved

`registration.routes.ts:49-50` records *"Captcha integration deferred to follow-up (requires frontend
hCaptcha widget on Step 5 of the wizard)"*. Awwal's rationale for leaving it deferred is sound and this
story does **not** overturn it: a bot registration gains the attacker nothing, because the real gate is
the magic link sent to the email address, and the login behind it is captcha-gated;
`magicLinkRateLimit` separately protects that path (`registration.routes.ts:30,36`).

**Adding a captcha to the wizard is explicitly a NON-GOAL of this story** (see Non-goals). It taxes
every honest listener at the exact moment we are paying for their attention, to defend an asset
(accounts) that is not the one at risk.

### 4. But registration is NOT consequence-free — this is the actual threat model

- **No email dedupe, and on the pending-NIN path no dedupe at all.** The only duplicate check on the
  wizard submit is NIN, and it is gated on NIN being present:
  `if (ninValue) { … throw new AppError('NIN_DUPLICATE', …, 409) }`
  (`registration.controller.ts:586-598`, with the header at `:581-583` — *"FR21 dedupe — NIN-provided
  path only. Pending rows are not bound by NIN uniqueness"*). NIN is nullable post-11-1
  (`apps/api/src/db/schema/respondents.ts:181`) and the pending path sets `ninValue = null`
  (`:500-501`), so **the pending-NIN path has no duplicate check of any kind**. Phone is written
  (`:670`, `:713`) and never queried.
  ⚠️ **Sharper than "no unique index on `respondents.email`": there is no `email` COLUMN on
  `respondents` at all.** The address lives in `submissions.raw_data.email` (`:720`) and in
  `users.email`. `users.email` *is* unique (`apps/api/src/db/schema/users.ts:8`) — but the wizard's
  insert is `onConflictDoNothing` (`auth.service.ts:802`), so uniqueness there silently reuses the
  account and lets the registration through. A unique index on the respondent side is not merely
  missing, it is **not expressible** without a JSONB functional index. Any AC that says "add a unique
  index on the email" would have been unimplementable as written.
- **Unverified rows enter the public statistic immediately.** `PublicInsightsService.computeInsights`
  aggregates `registry_unified` with **one** predicate — `answersWhere = ru.raw_data IS NOT NULL`
  (`apps/api/src/services/public-insights.service.ts:80`) — and the headline summary carries **no
  WHERE clause at all** (`:132`). The underlying source has no `r`-side filter either
  (`apps/api/src/services/registry-unified.sql.ts:69-91`; the service's own header at `:69-74` confirms
  "no exclusion of submission-less registrants"). No reference to `status`, `verification`, `tier` or
  `source` appears anywhere in the file. The endpoint is unauthenticated
  (`apps/api/src/routes/public-insights.routes.ts:38-40`). **A bot row is a government-facing number
  within one cache TTL** (3600s, `public-insights.service.ts:23`).
- **Each public registration fires outbound email SYNCHRONOUSLY, in-process.**
  `registration.controller.ts:855-863` fires `void SubmissionProcessingService.runPostSubmissionSideEffects(…)`
  → `submission-processing.service.ts:841,856` → `sendRegistrationAutoEmails` `:909,927` →
  `sendThankYouReferralEmail` `:1048` with `AUTO_CAMPAIGN_ID = 'thankyou-referral-auto'` (`:1049`) →
  `EmailService.sendGenericEmail` (`:1070-1074`) → `EmailService.dispatch`
  (`apps/api/src/services/email.service.ts:690,721,100`) → the provider call at `:115`.
  ⚠️ **This is NOT queued.** `apps/api/src/queues/email.queue.ts` exists but is used only for
  staff-invitation / password-reset / payment / dispute / backup jobs; the registration auto-sends never
  enqueue. `void` makes it fire-and-forget, not off-process. N simultaneous registrations therefore
  become N provider HTTP calls **on the API's own event loop** — the same event loop that already hosts
  all 10 BullMQ workers. This is a capacity fact as well as a reputation fact.
  **Prod evidence (this session):** respondent created `15:16:49.41`, `campaign_sends` row
  (`thankyou-referral-auto`) at `15:16:49.951` — ~0.5s later, same request.
  Pointed at harvested addresses this makes OSLRS an unsolicited sender: bounce/complaint spike, NDPR
  exposure, and a burned sending domain.
- **The asset at risk is sending reputation, not accounts.** Rows are cheap and revocable — a burned
  domain is neither, and the entire launch is one large email send.

### 5. The meter COUNTS but cannot CAP — and that is by documented design

`apps/api/src/services/notification-meter.service.ts` holds only TTL constants —
`DAILY_TTL_SECONDS` (`:60`) and `MONTHLY_TTL_SECONDS` (`:62`). **There is no cap constant and no code
path that refuses a send.** The module header states the principle: *"**Fail-OPEN.** A Redis hiccup must
never block a notification. Errors are logged at warn and swallowed"* (`:23-25`), and the abuse signal
is explicit about it: *"Counted, not blocked: **the send already happened**"* (`:150-153`); the catch
comment reads *"Fail open — the send is more important than the count"* (`:161-169`).

**Structurally, the meter cannot cap where it currently sits.** `EmailService.dispatch` calls it
*after* the provider returns — `if (result.success) { await NotificationMeter.recordEmailSend(…) }`
(the `NotificationMeter.recordEmailSend(...)` call in `dispatch`, currently `email.service.ts:144`) — and discards its return value. ⚠️ Line numbers re-anchored 2026-08-17: `:116-122` had drifted to a comment block. A cap is therefore a **new
pre-send check**, not a new constant.

⚠️ **And fail-open is the RIGHT default for most of what flows through `dispatch`** — a magic link, a
password reset and a critical Telegram-adjacent alert must never be blocked by a counter. So the cap
**must be category-aware**, not global. The category taxonomy already exists:
`MARKETING_CATEGORIES = {reengagement-blast, supplemental-survey, thankyou-referral}`
(`apps/api/src/services/list-unsubscribe.ts:16-20`), and `dispatch` already branches on it at
`:133-141`. This is the single most important design constraint in the story: **cap the marketing
categories, leave transactional fail-open.**

`recordCampaignSend` is likewise fail-soft — try at `campaign-contact.service.ts:80`, catch at
`:89-96` logging *"contact ledger write failed — dedupe for this address is degraded"*, never rethrows.
It cannot fail the caller, so exceeding a limit today fails **silently in both directions**.

### 6. Resend Pro = 50,000/month is a CEILING ON DAMAGE, not a protection

Awwal, this session. Frame it correctly: the quota was never the control. A larger quota means a
registration-flood can send **more** unsolicited mail before anything stops it.
**A bigger quota makes AC1's send cap MORE important, not less.**

### 7. Cloudflare posture is ALREADY DECIDED — two genuine gaps, no relitigation

`docs/runbooks/pre-viral-push-checklist.md:26` records **Bot Fight Mode = deliberately OFF** (Story
9-20): WAF Managed Rules + always-on DDoS cover the baseline, the origin is locked, and it risks false
positives on future inbound automation. **That decision STANDS and this story does not reopen it.**
Two gaps are recorded instead:

1. **Its rationale dismisses email with a category error.** `:26` ends *"Email/SMS (Resend/Termii) are
   **outbound** — Bot Fight Mode never affected them."* True of a blast; **false of a public WRITE
   endpoint that triggers outbound mail as a side effect** (Context §4). The outbound/inbound split does
   not partition the risk once inbound traffic *causes* outbound sends.
2. **The prescribed remedy excludes the exact path that needs protecting.** `:27` (and again `:50`)
   says: on a real bot flood add *"a targeted WAF rate-limit rule scoped to **exclude `/api/*`**"*. The
   registration endpoint is `POST /api/v1/registration/wizard` — **it is under `/api/*`**. Followed
   literally under pressure, the documented remedy is a no-op for this story's threat.

### 8. The jingle is NOT unplanned — three artifacts already own this moment (EXTEND, don't duplicate)

⚠️ **Correction to the drafting brief, verified here:** `pre-viral-push-checklist.md` is not the only
existing owner. A dedicated radio-jingle runbook already exists.

- **`docs/runbooks/13-3-cutover-and-failover.md`** (Story 13-3, `done`) — *"during the radio jingle,
  oyoskills.com serves the real wizard normally, and fails over to the email-first capture page if the
  box can't cope"* (`:3`), with the load-test capacity context at `:7`, the parked Cloudflare redirect
  rule (`:13-24`), the monitoring section (`:30-35`) and a dry-run rehearsal (`:37-47`).
- **`docs/runbooks/pre-viral-push-checklist.md`** — the go/no-go gate (§0), the CF posture decisions
  (§1), live monitoring incl. 9-52's tripwire (`:36-42`), and the spike playbook (§3).
- **`docs/roadmap-to-launch.md:115-127`** — the **pre-flight gate that gates PAID SPEND (radio +
  social)**, four numbered items, plus the abort tripwire at `:127`.

**The gap those three leave is precisely this story's subject: they are all about CAPACITY and
CLASSIFICATION, none about the WRITE-side controls.** Two specifics:

- **The 13-3 load test never exercised the registration write path.** AC1.1 asked for a profile against
  *"the wizard entry + draft-save + submit path (the real registration hot path)"*
  (`13-3-launch-capacity-and-static-fallback.md:31`), but the executed run was
  `50×60s vs localhost:3000/api/v1/forms/public-active` — a **READ** endpoint — deliberately bypassing
  Cloudflare (`:51`). So the green verdict (p95 346ms / 0% err / 247 req/s) is evidence about form
  reads, and says nothing about the path that takes the rate limiter and fires a provider call
  in-request. It could not have, without creating real respondents and sending real email — which is
  itself the finding.
- **9-52's tripwire classifies bots vs virality; it cannot see a 429 wall.** Its three signals are
  `requests_spike_low_pageviews | threats_spike | error_ratio`
  (`apps/api/src/lib/cf-watch.ts:36`) with thresholds at `:17-32` (`errorRatioPct: 30`,
  `minStatusSamples: 100`). A jingle that converts is *requests up AND page-views up* — deliberately
  NOT a trigger (`pre-viral-push-checklist.md:42`) — while every rate-limited listener silently takes a
  429. AC3 composes with this alert path rather than building a second one.

### 9. Channel attribution is BUILT AND LIVE — the gap is liveness and the DENOMINATOR, not the question

⚠️ **Stated first because the opposite was believed at one point in drafting and is wrong.** The
"How did you hear about us?" question **exists, is enabled, and its write path is complete end to end.**
Story 13-1 shipped it. Nothing in this story asks for it to be added.

- **The question renders on the Review step** — `How did you hear about us?` at
  `apps/web/src/features/registration/pages/Step5ReviewAndSave.tsx:229`, inside a prominent card
  (`:215-255`), i.e. the last screen before submit.
- **The flag is ON** — `ATTRIBUTION_ENABLED = true`
  (`apps/web/src/features/registration/lib/attribution.ts:12`).
- **Radio is the FIRST option** — `ACQUISITION_CHANNELS = ['Radio','TV','Word of mouth',
  'Association / cooperative','Search engine','Facebook','Instagram','Twitter / X','Other']`
  (`attribution.ts:15-25`).
- **The chain is complete.** Web writes `extras.acquisition = { channel }`
  (`Step5ReviewAndSave.tsx:240-245`) → `buildCampaignSource` folds it into `campaign_source`
  (`apps/api/src/controllers/registration.controller.ts:103-115`, key built at `:114`) → spread into
  `submissions.raw_data` **last, so no answer key can clobber it** (`:735-738`) → read back by
  `ReportService.getCampaignBreakdown` (`apps/api/src/services/report.service.ts:86-95`; the JSON
  accessor is a FIXED expression at `:89`, filtered by
  `raw_data -> 'campaign_source' IS NOT NULL` at `:93`).

**The three real gaps:**

1. **The path has NEVER executed on prod.** `campaign_source` is present on **0 of 82** submissions
   (prod, verified this session). That is *expected*, not broken — no campaign has run, the question is
   optional, and `buildCampaignSource` **omits the key entirely** on the degenerate path (`:110`,
   `:113`; the AC3.4 contract is documented at `:103-107`). But "expected" is not "proven", and the
   jingle is the first traffic that will ever exercise it. **The pre-jingle gate is therefore a LIVENESS
   DRY RUN, not a form change** — see AC9. [[pattern-ship-a-fix-that-never-fires]]: a capture path that
   has never once run on prod data is exactly the shape this project keeps getting burned by.
2. **"Ignored" and "declined" are the SAME stored value — the denominator is unrecoverable.**
   `<option value="">Prefer not to say</option>` is the **first** option (`Step5ReviewAndSave.tsx:247`)
   and the control's value falls back to `''` (`:239`), so it is **pre-selected by default**. A user who
   never touched the control is indistinguishable from one who deliberately declined; both produce
   `channel: undefined` → no `campaign_source` key at all (`:243` → `:110/:113`). Every per-channel
   conclusion after the jingle would rest on a denominator we cannot reconstruct. See AC10.
3. **First-position bias sits on the channel we most want to measure.** Radio is first
   (`attribution.ts:16`). Harmless while the question is genuinely optional and unprompted; it becomes
   a signal-manufacturing risk the moment the question is made mandatory — which is an OPEN DECISION,
   see below. Worth de-biasing regardless (AC10).

## ⚖️ ✅ RULED 2026-08-11 (Awwal): the acquisition question stays OPTIONAL

> **THE RULING — do NOT make it blocking-required.** Ship **AC10** (a real `— Select —` placeholder,
> an explicit *"Prefer not to say"*, de-biased ordering) **plus one non-blocking prompt on submit**
> when nothing is selected. The prompt **never blocks the submit**, so 13-1's recorded guardrail
> (*prominence ≠ mandatory*, `Step5ReviewAndSave.tsx:211-214`, `attribution.ts:7`) survives intact and
> this is **not** a reversal.
>
> **This ruling closes the item that was blocking this story's own dev.** It matches the SM
> recommendation below, and the reasoning that carried it was the middle two rows of the table:
> the question sits at **the most expensive point in the funnel** — the last screen before the
> registration number, after a 10–15 minute wizard, on a phone-first radio audience — and **a forced
> choice with Radio in first position manufactures the very signal the jingle is meant to measure.**
> A mandatory field would have bought a 100% denominator by corrupting the numerator.
>
> ⚠️ **AC10 and the nudge are ONE deliverable, not two.** AC10 alone recovers the *denominator* but not
> the *response rate*; shipping it without the nudge satisfies the letter of this ruling and misses its
> point. Recorded as a reopen trigger in SCP §10.14.
>
> Full ruling set for this session, and the seven other decisions put alongside it: **SCP §10.14.**

*(Original framing preserved below — it is the reasoning that produced the ruling.)*

**Not an AC. Recorded so it is decided deliberately rather than drifted into.**

**Prior ruling that constrains it.** This was already ruled on once, in 13-1's own code review, and both
sides of the codebase carry the ruling in prose:
`Step5ReviewAndSave.tsx:211-214` — *"Elevated to a prominent, legible card so it isn't missed on a
scroll-to-submit … Still OPTIONAL and NEVER blocks submit (**13-1 review guardrail: prominence ≠
mandatory**)"*; and `attribution.ts:7` — *"**NEITHER ever blocks a submit**"*. Reversing it is a
reversal, not a tweak, and should be recorded as one.

| | Mandatory (blocking) | Optional + de-biased + soft nudge |
|---|---|---|
| Denominator | 100% response | Response rate measurable **only if AC10 lands** (today it is not) |
| Funnel cost | Sits at the **most expensive point in the funnel** — the last screen before the registration number, after a 10-15 min wizard, on a phone-first radio audience | Zero |
| Signal quality | ⚠️ Forced choice **with Radio in first position manufactures the very signal we are trying to detect** | Self-selected, unprompted, un-anchored |
| Reversibility | A wizard-blocking change mid-campaign is a deploy | One-line flag (`ATTRIBUTION_ENABLED`, `attribution.ts:9-12`) |

**SM recommendation (Awwal decides):** do **NOT** make it blocking-required. Ship **AC10** (real
`— Select —` placeholder + explicit "Prefer not to say" + de-biased ordering) plus **one non-blocking
prompt on submit** when nothing is selected — a soft nudge that still *never* blocks the submit, so
13-1's guardrail survives intact. That recovers the denominator, removes the anchor, and lifts response
rate without taxing the funnel at its most expensive moment.

## Non-goals (each is a decision already made, recorded so it is not re-opened mid-sprint)

- **No captcha on the public wizard.** Context §3. The magic-link + captcha-gated login is the real
  gate; a wizard captcha taxes honest listeners to defend the wrong asset.
- **Bot Fight Mode stays OFF.** Context §7 / 9-20. Only a *targeted* WAF rule is proposed (AC6).
- **No third runbook.** Context §8. Every operator-facing output of this story lands in
  `13-3-cutover-and-failover.md`, `pre-viral-push-checklist.md` or `roadmap-to-launch.md`.
- **No new alert channel.** AC3 composes with 9-52 / 9-15 Telegram.
- **No new attribution question, and no per-station sub-picker.** Context §9 — the question exists and
  works; `attribution.ts:14` records the deliberate absence of a station picker (13-1 AC2.4). Station
  granularity is a **media-buy** decision, not a code gap (Dev Notes).
- **The question is NOT made mandatory by this story.** That is an explicit OPEN DECISION above, with
  a prior ruling against it (`Step5ReviewAndSave.tsx:214`, `attribution.ts:7`). AC10 improves the
  *instrument* without touching the *optionality*.
- **No blocking of registrations to defend the mailbox.** The whole thesis is the inverse: cap the
  send so the signup does not have to be capped.
- **Not a fix for `recordCampaignSend`'s fail-soft ledger** — that is 13-44's ledger-liveness banner
  and `pre-blast-dry-run.md` §2's mandatory `SELECT`. Referenced, not absorbed.

## Acceptance Criteria

> **Ordering is Awwal's accepted recommendation and is load-bearing, not stylistic.** AC1 and AC2 bound
> the damage; only then is it safe to loosen the signup control (AC4). Shipping AC4 first would remove
> the only thing currently limiting the flood.

1. **AC1 — The meter ENFORCES a ceiling for MARKETING categories (cap the send).**
   `NotificationMeter` gains explicit cap constants beside its TTLs
   (`notification-meter.service.ts:60,62`) and a **pre-send** check consulted by `EmailService.dispatch`
   ***before* the `await this.getProvider().send(...)` call** — not after it, where
   `NotificationMeter.recordEmailSend(...)` already sits.
   > ⚠️ **ANCHORED ON THE SYMBOLS, NOT THE LINE NUMBERS — corrected 2026-08-17 (adjudication sweep).**
   > This AC previously read *"the provider call at `:115` … not after it at `:116`"*. **Both had
   > drifted ~26 lines**: `:115` is now a List-Unsubscribe comment, the provider call is at **`:141`**
   > and `recordEmailSend` at **`:144`** — moved by 13-13, and `email.service.ts` changed again in
   > 13-59. A dev opening `:115` would have found no provider call at all, at exactly the moment they
   > were siting the cap that protects the sending domain. **The requirement was always the
   > BEFORE/AFTER RELATIONSHIP; the numbers were convenience, and convenience is what rotted.**
   - **Category-aware, per Context §5.** The cap applies to `MARKETING_CATEGORIES`
     (`services/list-unsubscribe.ts:16-20`) only. Transactional mail (magic link, password reset, activation,
     ops/alert) keeps today's fail-open behaviour **unchanged**, and a test must pin that: a magic link
     must still send with the marketing cap fully exhausted, and with Redis unavailable.
   - **Fail-open on infrastructure, fail-closed on the limit.** If Redis is unreachable the cap cannot
     be evaluated → allow the send (preserving `:23-25`'s principle). If the cap is evaluated and
     exceeded → refuse, and say so.
   - **A refusal is LOUD.** It returns a structured failure (not a swallowed no-op), logs
     `event: 'notification.cap_exceeded'` with category + window + count, and pages the 9-15 Telegram
     channel through the existing `isAlertSendEnabled` gate. ⚠️ **Silence here would reproduce
     [[pattern-ship-a-fix-that-never-fires]]** — the exact failure mode `recordCampaignSend`'s
     fail-soft catch (`campaign-contact.service.ts:89-96`) already demonstrates in this codebase.
   - **Caps are configurable via env with committed defaults**, derived and shown in the Dev Agent
     Record (see AC7's method) — never invented at the keyboard. They must sit well under the Resend Pro
     50,000/month ceiling so the cap, not the quota, is what binds (Context §6).
2. **AC2 — Per-address throttle on the registration auto thank-you (one per address per N days).**
   `sendThankYouReferralEmail` (`submission-processing.service.ts:1048`) must not send to an address
   contacted within the marketing contact gap.
   - **This is applying an EXISTING mechanism to the ONE path that skips it, not inventing one.**
     `filterMarketingCohort` (`campaign-contact.service.ts:150`; suppression `:174-176`, 5-day recent
     contact gap `:179-188`, intra-run de-dupe `:193-200`) is inherited by all four blast/backfill
     scripts — `_thankyou-referral-blast.ts:237`, `_reengagement-email-blast.ts:379`,
     `_cohort-a-supplemental-survey-blast.ts:293`, `_backfill-registration-autosends.ts:232` — and by
     **no in-request path**. Neither `registration.controller.ts` nor `submission-processing.service.ts`
     imports it. The auto-send's only guards today are the per-respondent marker (`:1058`) and the
     suppression list (`:1062-1066`), and **the marker is per-RESPONDENT, so a new respondent row for the
     same address is a fresh send every time** — which is exactly the mail-cannon shape.
   - Reuse `MARKETING_CONTACT_GAP_DAYS` (`campaign-contact.service.ts:39`); do not introduce a second,
     divergent gap constant.
   - ⚠️ **Read-path consequence to handle explicitly:** the ledger read must tolerate
     `recordCampaignSend` having failed soft (`:89-96`) — a missing ledger row must not be treated as
     proof the address was never contacted where that would license a send. State the chosen direction
     and its reason in the code.
   - **This AC alone defeats the mail-cannon without touching signup**, which is why it sits above AC4.
3. **AC3 — Replace the per-IP wall with a GLOBAL burst circuit-breaker that ALERTS, not blocks.**
   A rolling global counter on registration submits (all IPs, one window) that, when crossed,
   **pages the 9-15 Telegram channel and keeps serving requests**.
   - **During a campaign this must not block. Awwal wants to know the jingle worked** — a burst is the
     success signal, and a control that swallows it destroys the measurement it should produce.
   - **Composes with 9-52, does not duplicate it.** 9-52 watches the Cloudflare edge for bot-vs-viral
     classification (`cf-watch.ts:36`, thresholds `:17-32`) and is blind to application-layer 429s
     (Context §8). This breaker watches the application write path. Reuse the same dispatch + per-kind
     cooldown discipline (`cf-traffic-watch.ts:39-49`), and the same `isAlertSendEnabled` gate so it can
     never page from dev/test.
   - The alert states, in one message: submits in window, 429s in window, auto-sends in window, and
     the current marketing cap headroom from AC1.
4. **AC4 — THEN rescope the 5/IP/15min registration limit. NOT before AC1 and AC2 are merged.**
   This precondition is an acceptance criterion, not advice: until the send is capped and the address is
   throttled, the per-IP limit is the only thing bounding the flood, and removing it first converts a
   registration burst directly into a mail burst.
   - Re-key and re-size so a carrier NAT is not a single bucket: raise the per-IP ceiling to an
     anti-hammer floor (a value a single automated client exceeds and a shared carrier does not), and add
     a per-identity dimension (normalised email / phone) so repetition by one *person* is what is
     limited. Method and arithmetic recorded per AC7 — do not guess a number.
   - **`wizardDraftRateLimit` is in scope for the same reason** (Context §2): its own comment states
     the "~5 wizards concurrently per shared NAT" assumption the jingle breaks
     (`wizard-draft-rate-limit.ts:20-28`). Re-size it with the same method, or record a measured reason
     it is safe as-is.
   - Update the limiter's own docblock — `"Prevents mass account creation"`
     (`registration-rate-limit.ts:20-24`) — and the route comments that cite the legacy auth discipline
     (`registration.routes.ts:22-24,48-50`). **Prose is not type-checked; a comment that still describes
     the retired threat model is how a future reviewer restores the old value.**
   - The supplemental-survey route shares this limiter (`registration.routes.ts:56-59`) — state
     whether the change is intended there too, do not let it ride silently.
5. **AC5 — `/insights` publishes REGISTERED vs the TRUST TIERS, so the public number survives inflation.**
   > ⚠️ **WORDING AMENDED 2026-08-21 (SM, discharging residual R4) — the requirement is unchanged.**
   > This AC previously read *"REGISTERED vs **VERIFIED**"* and cited a taxonomy containing a `verified`
   > tier. **There is no `verified` tier, and deliberately never was one after 12-4:** Story 12-4 (AC9 /
   > ruling R1) deleted it because a NIN is **CAPTURED, never validated** — no NIMC integration exists and
   > NINs carry no check digit ([[nin-validation-mod11-invalid]]). The shipped tiers are exactly
   > `nin_on_file` / `self_declared` / `pending_nin` / `unverified_import`
   > (`registry-totals.service.ts:196-205`, whose own comment states *"There is no `verified`"*), and the
   > public label reads **"with NIN on file"**, never "Verified". **The requirement was always the SPLIT
   > — a single unqualified count must not silently absorb a registration burst — and the split is what
   > shipped; only the word was wrong**, and using it would have published a claim the system cannot
   > support. If NIMC access ever arrives, a real tier is added ABOVE `nin_on_file` and the label changes
   > then; nothing built here blocks that.
   The public headline must stop being a single unqualified count (today: no verification filter at all,
   summary with no WHERE at `public-insights.service.ts:132`).
   - **Use the taxonomy that already exists.** Axis 3 (VERIFICATION / TRUST) defines the four tiers above,
     and honest-display **Rule 5** already binds: *"Verified vs pending are never blended in any 'registry
     size' claim"* (`_bmad-output/planning-artifacts/registry-data-status-taxonomy.md`, Axis 3 +
     Honest-display RULES) — a rule against BLENDING trust levels into one published number, which binds
     identically whether the top tier is called `verified` or `nin_on_file`. This AC is enforcing a
     contract already written, not minting a new one.
   - **Follow 13-25's slice pattern, do not wait for Epic 12.** `public-insights.service.ts:15,98-99`
     already consumes `getRegistryCountCore()` from `registry-totals.service.ts` — 13-25's shared
     count-core, explicitly the *"Seed of 12-4"* (`:98`). Extend **that** core with the Axis-3 split so
     there remains ONE counting source and 12-4 inherits it. A second count computed in the controller
     would recreate the 76-vs-139 drift 13-25/13-33 killed.
   - Copy is honest in both directions: this is a better number, not a defensive one. A registration
     burst then moves the "registered" figure and leaves "verified" untouched — which is the truth.
   - Cache TTL (3600s, `:23`) and the 60/min/IP public limiter (`public-insights.routes.ts:38-40`) are
     unchanged; `/insights` is not a capacity risk and is not being re-architected here.
6. **AC6 — Operator gate: a targeted CF WAF rate-limit rule scoped TO the registration path.**
   The **inverse** of the documented remedy at `pre-viral-push-checklist.md:27,50` ("scoped to exclude
   `/api/*`"), which excludes the very path at risk (Context §7).
   - Deliverable is **documentation + a pre-jingle operator step**, not code: a rule matching
     `POST /api/v1/registration/wizard`, with a stated threshold, a stated action
     (managed challenge / block — decided and recorded, not left open), and instant rollback per
     `pre-viral-push-checklist.md:60`.
   - **Recorded as an EDIT to the existing artifacts, in all three places that will be read under
     pressure:** the checklist's §1 posture list and §3 spike playbook (correcting the
     `exclude /api/*` line so the wrong instruction cannot be followed literally at 2am), the 13-3
     runbook's pre-jingle setup (`13-3-cutover-and-failover.md:17-22`, beside the parked redirect rule
     the operator is already there to arm), and `roadmap-to-launch.md:115-124`'s pre-flight gate.
   - **Bot Fight Mode stays OFF** — the checklist's §1 decision is preserved verbatim and this rule is
     added as the surgical alternative it already prescribes.
7. **AC7 — Measure the turn-away, before and after. No new instrumentation required.**
   `registration.rate_limit_exceeded` is already logged today
   (`registration-rate-limit.ts:38-44`), as is `wizard_draft.rate_limit_exceeded`
   (`wizard-draft-rate-limit.ts:45-51`).
   - Record a **BEFORE** count of both from prod logs (state the window and the command), and an
     **AFTER** count from the first jingle window. That delta is the story's "how many people did we
     turn away" evidence. It exists today and costs nothing to collect — the reason it has never been
     read is that nobody was asked to.
   - The same evidence is the derivation input for AC1's caps and AC4's new ceilings: state the method
     (observed/expected concurrent sessions per carrier IP → per-IP ceiling; expected registrations per
     hour × 1 auto-send → cap headroom), show the arithmetic, and name the assumption each number rests
     on. **A number without a derivation is a guess with a decimal point.**
8. **AC8 — Tests, and one that proves the CAP fires on the real path.**
   - Unit: marketing category refused at the cap; transactional category **unaffected** at the same
     cap; Redis-down ⇒ allow (fail-open preserved); the refusal is logged and alerted, not swallowed.
   - Unit: second registration with the same email inside the gap does not send (AC2); outside the gap
     does; a soft-failed ledger row behaves as specified.
   - **Integration / RED-verify (the one that matters):** drive the **real** post-submission side-effect
     chain (`runPostSubmissionSideEffects` → `sendRegistrationAutoEmails` → `sendThankYouReferralEmail`
     → `dispatch`) with the cap exhausted and assert **no provider call**. A unit test on the meter
     proves the counter; only this proves the cap is *reached* from the path that actually sends.
     [[pattern-ship-a-fix-that-never-fires]] — a cap that the send path never consults is the default
     outcome here, given `dispatch` currently calls the meter *after* the provider (`:116`).
   - Full API suite + `tsc --noEmit` + eslint clean.
9. **AC9 — Attribution LIVENESS proven on prod before the jingle (this is the pre-jingle gate).**
   ⚠️ **A verification gate, not a build item** — it does not sit in AC1→AC4's leverage ordering and
   must be discharged before the jingle **regardless of how much of the rest has shipped.** The capture
   chain is complete in code (Context §9) but has executed on prod **zero times** (`campaign_source`
   present on **0 of 82** submissions).
   - **One live public registration selecting "Radio"**, through the real pinned public form, then
     confirm **both** ends:
     (a) `SELECT raw_data->'campaign_source'->>'channel' FROM submissions WHERE id = '<id>'` returns
     `'Radio'`; and
     (b) `ReportService.getCampaignBreakdown()` (`report.service.ts:86-95`) returns that row — the read
     side matters independently, because its `WHERE raw_data -> 'campaign_source' IS NOT NULL` (`:93`)
     is what the degenerate-path omission (`registration.controller.ts:110,113`) interacts with.
   - **Checking only (a) is insufficient.** A row that lands but never appears in the breakdown is the
     `getCampaignFunnel` failure shape all over again (13-9 computed it, nothing consumed it, 13-44
     exists to fix that). Prove the number a human will actually read.
   - 🚨 **Teardown: delete that respondent + submission BY ID / reference code. NEVER "restore to
     baseline".** The baseline is a tripwire, not a restore target — deleting down to a count destroys
     live registry data (`docs/adjudication-agent-handoff.md` §3).
   - Record the result in `docs/runbooks/13-3-cutover-and-failover.md`'s pre-jingle setup, beside the
     redirect-rule rehearsal the operator is already there to run (`:37-47`) — one rehearsal session,
     not two.
10. **AC10 — Make the attribution DENOMINATOR recoverable, and de-bias the ordering.**
    Instrument quality only. **Optionality is unchanged** — see the Open Decision block.
    - **(a) "Declined" must be distinguishable from "ignored".** Today
      `<option value="">Prefer not to say</option>` is the FIRST option and therefore pre-selected
      (`Step5ReviewAndSave.tsx:239,247`), so both states collapse to "no key written". Replace the
      default with a real, non-submitting placeholder (`— Select —`) and make "Prefer not to say" an
      explicit choice a user must pick.
    - ⚠️ **This changes what lands in the database, and the change must be decided, not discovered.**
      An explicit decline writes a *value*, so `campaign_source` becomes **non-NULL for decliners** —
      which moves them inside `getCampaignBreakdown`'s `IS NOT NULL` filter (`report.service.ts:93`)
      and changes what its `COALESCE(…, '(unknown)')` (`:89`) means. State and implement one of: decline
      is its own reported row, or decline is excluded from the breakdown. Record which, and why, in
      code. **Silently letting the row set grow would corrupt the exact measurement this AC exists to
      protect.**
    - **(b) De-bias the ordering.** `ACQUISITION_CHANNELS` (`attribution.ts:15-25`) puts **Radio
      first** — the channel the jingle is meant to measure. Reorder (or randomise per render, if that
      is testable here) so the list does not anchor toward the answer we want. Cheap now; it becomes
      load-bearing if the Open Decision ever goes the other way.
    - **(c) OPTIONAL, per the SM recommendation and only if Awwal takes it:** one **non-blocking**
      prompt on submit when nothing is selected. It must never block — `attribution.ts:7` and
      `Step5ReviewAndSave.tsx:214` both state the guardrail, and a test must pin that submit still
      succeeds with the prompt dismissed.
    - Web tests: placeholder is the default and is not submittable as a channel; explicit decline is
      distinguishable from untouched; submit succeeds in **all three** states (channel chosen /
      declined / untouched).

11. **AC11 — Prove a PRE-RE-PIN draft can still be resumed against the CURRENT form.** ⚠️ **Raised
    2026-07-30, never verified — this is an open question, not a known-good.** The blast invites
    Cohort B to RESUME, but **291 of the 293 live drafts were created against the OLD public form**
    (pre-2026-07-23). They now hydrate into the **new six-section** form. Story 13-47 fixed one
    incompatibility between them (the step cap); **whether the stored `questionnaireResponses` keys
    still map to the new form's questions is a SEPARATE question nobody has tested.** If they do not,
    a resuming registrant sees an empty or mis-filled questionnaire — and the blast is precisely the
    event that drives resumes at volume.
    - Resume **one real pre-re-pin draft** end to end against the pinned form and confirm the stored
      answers land on the right questions (not merely that the wizard renders).
    - Compare the old form's question `name`s to the new one's; any renamed/removed key is silent
      data loss on resume. `main_occupation` is the precedent — 13-34 relabelled it but deliberately
      kept the NAME because analytics/export/13-29 read that key.
    - If keys diverge: decide **before the blast** between a draft migration, a resume-time mapping,
      or accepting the loss with the audience told. **Do not discover this from a support message.**
    - This is a GATE on the blast, not on the jingle.

### 🔴 AC-RL — THE REGISTRATION THROTTLE WAS ALREADY TURNING CITIZENS AWAY (hotfixed 2026-08-07)

**Not a hypothesis this story needed to model — it had already happened, before the radio jingle.**

A registrant emailed to say he could not finish. He had completed **all ten steps**; the final
submit returned *"Too many registration attempts."* `POST /registration/wizard` was limited to
**5 per IP per 15 minutes**.

Retained logs: **36 blocks across 5 IPs — 27 of them on 2026-08-05**, the morning 75 re-engagement
invitations went out. **We drove people to register and then refused them for responding.**

The blocked ranges — `102.88.*`, `102.89.*`, `102.90.*`, `197.211.*` — are Nigerian mobile carriers,
and **carriers here use CGNAT: thousands of subscribers share one public IP.** So "5 per IP" was
never "5 attempts by one person". It was **5 PEOPLE per carrier gateway per quarter hour** — and
identically one cybercafé, one office, or one supervised registration drive where everyone is on the
venue's wifi. **It bit hardest in exactly the situation this story exists to protect.**

⚠️ **36 is a FLOOR, not a total.** It counts only what survived log rotation, and behind CGNAT one
IP can be many different citizens. **The number of people turned away is unknown and unknowable.**

**Shipped:**
1. IP limiter **5 → 50** per 15 min — a crude flood-stop, set well above any real venue.
2. **NEW per-email limiter, 3 per 15 min**, keyed on the lowercased/trimmed address, falling back to
   IP when no email is present so a payload omitting it cannot bypass the limiter.
3. Route test mock updated — a mock missing a new export fails at import, which caught a real break.

**Why not simply remove it.** Unauthenticated endpoint writing to a government register; with no
limit a script could fabricate thousands of records, and **the register's credibility IS the
product**. The AXIS was wrong, not the principle: abuse is one actor creating MANY records, and
CGNAT makes IP a poor proxy for "one actor" while the submitted email is a good one.

**Operator follow-through (decisions taken, recorded so they are not re-litigated):**
- **NO D4 re-blast.** 4 people were stranded, not 71. A re-blast mails citizens who already
  registered and citizens who deliberately declined — spam, and it burns the only channel we have.
- **YES to telling those four**, briefly, in the tone *"a technical issue on our side… it's fixed,
  your answers are saved"*. An organisation that notices, fixes and says so reads as MORE competent
  — especially in government service, where the baseline expectation is being ignored.
- `raheemjamiu166@gmail.com` — resume link sent + **delivered** 2026-08-07 18:32, 17 answers intact
  at step 10. ⬜ **Three still to send** (`sadiqabdulmajid9009`, `owolabibunkunmielizabeth`,
  `molasun813`) — held for Awwal's approval of citizen-facing copy.

⬜ **STILL OPEN, and it belongs to this story's burst premise:** the VPS has **no swap** (2GB total).
A memory spike does not degrade — it invokes the OOM killer. **A radio jingle is precisely the shape
that tests all three at once**: a traffic burst, into a throttle, on a box with no swap.

## Tasks / Subtasks

- [x] **Task 1 — Cap the send** (AC: #1, #8)
  - [x] Add cap constants + a pure `checkCap(category, …)` to `notification-meter.service.ts` beside the
        TTLs (`:60,62`); keep it read-only and side-effect-free so it is unit-testable.
  - [x] Consult it in `EmailService.dispatch` **before** the `await this.getProvider().send(...)` call (currently `email.service.ts:141`; anchor on the SYMBOL — the line has drifted twice),
        branching on `isMarketingCategory` exactly as `:133-141` already does. Preserve the fail-open
        contract for everything else and pin it with a test.
  - [x] Loud refusal: structured result + `notification.cap_exceeded` log + Telegram via
        `isAlertSendEnabled`.
- [x] **Task 2 — Per-address auto-send throttle** (AC: #2, #8)
  - [x] Consult the contact ledger in `sendThankYouReferralEmail`
        (`submission-processing.service.ts:1048-1074`) using `MARKETING_CONTACT_GAP_DAYS`
        (`campaign-contact.service.ts:39`). Prefer reusing `filterMarketingCohort`'s gap query over a
        second implementation of the same rule.
  - [x] Decide and document the fail-soft-ledger direction (AC2's warning).
- [x] **Task 3 — Global burst breaker that alerts** (AC: #3)
  - [x] Rolling global counter on registration submits + a per-kind cooldown, modelled on
        `cf-traffic-watch.ts:39-49`; dispatch through the existing Telegram path gated by
        `isAlertSendEnabled`.
  - [x] Compose the one-message payload (submits / 429s / auto-sends / cap headroom).
- [x] **Task 4 — Rescope the signup limits** (AC: #4) — ⚠️ **BLOCKED until Tasks 1 + 2 are merged.** (Precondition satisfied: Tasks 1 + 2 landed first, in this same working tree, before any limiter was touched.)
  - [x] Re-key and re-size `registrationRateLimit` (`registration-rate-limit.ts:25-51`) per AC7's
        derivation; do the same analysis for `wizardDraftRateLimit`
        (`wizard-draft-rate-limit.ts:30-58`).
  - [x] Correct the stale docblocks + route comments (`registration.routes.ts:22-24,48-50`) and rule on
        the shared supplemental route (`:56-59`).
- [x] **Task 5 — Registered vs verified on /insights** (AC: #5)
  - [x] Extend `getRegistryCountCore` (`registry-totals.service.ts`, consumed at
        `public-insights.service.ts:15,98-99`) with the Axis-3 verification split; surface it in
        `computeInsights` + the web insights page. One counting source only.
- [x] **Task 6 — Operator gate + runbook edits** (AC: #6) — **no new file**
  - [x] `pre-viral-push-checklist.md` §1 + §3: add the registration-scoped WAF rule and **correct the
        `exclude /api/*` remedy** (`:27`, `:50`); restate Bot Fight Mode = OFF unchanged.
  - [x] `13-3-cutover-and-failover.md:17-22`: add arming the rule to the one-time pre-jingle setup,
        beside the parked redirect rule.
  - [x] `roadmap-to-launch.md:115-124`: add it to the pre-flight gate that gates paid spend.
- [ ] **Task 7 — Measure + record** (AC: #7) — ◨ **HALF DONE. The BEFORE baseline is COLLECTED (prod, 2026-08-21); the AFTER count cannot exist until the jingle airs.** Window 2026-08-07 20:31Z → 2026-08-21 13:30Z (15 retained pm2 out-logs): `registration.rate_limit_exceeded` **23 — all pre-hotfix** (`attempts=6…25`, only possible while `max` was still 5), so **ZERO in the 13 days since**; `registration.email_rate_limit_exceeded` **13** (11 the same evening, then 1 on 08-09 and 1 on 08-14, **both `attempts=4`** — one retry over the limit of 3, i.e. a real person, not a script); `wizard_draft.rate_limit_exceeded` **0**. Volume baseline: 327 respondents, 1-8 submissions/day, busiest day ever **168 submissions / 177 marketing sends (2026-08-04)**, busiest month **300 sends**. These figures are now the derivation shown at each constant. ⚠️ Remaining: the AFTER count from the first jingle window — [[pattern-verification-that-cannot-run-yet]].
  - [ ] BEFORE counts of `registration.rate_limit_exceeded` + `wizard_draft.rate_limit_exceeded` from
        prod logs (record window + command). Publish every derived number with its arithmetic.
  - [ ] AFTER counts from the first jingle window → the turn-away delta.
- [x] **Task 8 — Attribution liveness dry run** (AC: #9) — ✅ **DISCHARGED ON PROD 2026-08-21.** `OSL-2026-9F4TRH` / submission `01a0253d-bae4-769a-ab1c-491585cdc04f`: stored `channel='Radio'` **and** `getCampaignBreakdown()` returned it. Torn down child-first, all traces 0, re-measured 327/286/25. 🔴 The run proved AC9's own teardown wording incomplete — it would have orphaned `users`, `magic_link_tokens`, `marketplace_profiles` and `campaign_sends`. Full record in `13-3-cutover-and-failover.md`. — ⚠️ **the pre-jingle GATE; independent of
      Tasks 1-7 and dischargeable before any of them.**
  - [ ] One live public registration selecting "Radio" through the pinned public form; assert the
        stored `raw_data->'campaign_source'->>'channel'` **and** that `getCampaignBreakdown()` returns
        the row.
  - [ ] Teardown by id / reference code — **never** by restoring a count. Record the result in
        `13-3-cutover-and-failover.md`'s pre-jingle setup.
- [x] **Task 9 — Attribution instrument quality** (AC: #10)
  - [x] Real `— Select —` placeholder default + explicit "Prefer not to say" choice
        (`Step5ReviewAndSave.tsx:239,247`); decide and record how an explicit decline is treated by
        `getCampaignBreakdown` (`report.service.ts:89,93`).
  - [x] Reorder `ACQUISITION_CHANNELS` (`attribution.ts:15-25`) so Radio is not first.
  - [x] Web tests for the three states; submit must succeed in all three.
  - [x] (Only if Awwal takes the SM recommendation) the non-blocking submit nudge, with a test pinning
        that it never blocks.

## Dev Notes

### Why "cap the send, not the signup" — the trade stated plainly

A registration row costs a UUID, a JSONB blob and an index entry, and can be deleted or marked
`unverified_import` after the fact. A burned sending domain cannot be deleted, cannot be re-earned on a
schedule, and takes the **entire** launch with it — every cohort blast, every magic link, every
password reset. Given a flood, we would rather absorb rows and refuse mail than refuse rows and send
mail. Every AC ordering in this story follows from that single sentence.

### The three-way trap this story sits in

1. The control we have (5/IP/15min) defends the asset **not** at risk (accounts) and taxes the audience
   we are **paying** for.
2. The asset at risk (sending reputation) has **no** ceiling, and the module that looks like it should
   provide one is documented FAIL-OPEN and runs **after** the send.
3. A bigger quota (Resend Pro, 50k/mo) makes trap 2 **worse**, not better — more headroom to burn.

### ⚠️ Two design constraints that will bite an unwary implementation

- **Fail-open is correct for most of `dispatch`'s traffic.** `notification-meter.service.ts:23-25` is
  not sloppiness — blocking a magic link on a Redis hiccup is a worse outcome than an uncounted send.
  A global cap would be a regression. AC1's category-awareness is the whole design.
- **The auto-send marker is per-RESPONDENT, not per-ADDRESS.**
  `submission-processing.service.ts:1058` stamps `thankyou_referral_sent_at` on the respondent row
  (`:1091-1095`), so a *new* respondent row for the *same* address passes the marker cleanly. Combined
  with "no email dedupe on the respondent side" (Context §4), that is the mail-cannon: one address, N
  registrations, N emails. AC2 closes it at the address, which is the only key that holds.

### Station-level attribution is deliberately absent — that is a MEDIA-BUY decision, not a code gap

`attribution.ts:14` records it in the source: *"The single plain-language channel list (**no
per-station sub-picker — AC2.4**)"*. So a jingle across several stations yields **"Radio worked"** and
**not "which station worked"**. Epic 13's push is *"radio 11 stations"*
(`docs/roadmap-to-launch.md:107`), so this is a live limitation, not a hypothetical one.

**Do not solve it here.** Adding a station picker means a second dropdown at the most expensive point
in the funnel, on a phone-first audience, to serve an optimisation that only pays off across repeat
buys. The cheaper instruments are operational and cost no code:
- **sequence the stations** (stagger start times) so a registration spike attributes by *time*; or
- **per-station UTM/`?ref` landing URLs** — already built AND wired: `parseUtm`
  (`attribution.ts:42-53`, bounded allow-list, never sweeps arbitrary params) is called on wizard entry
  at `apps/web/src/features/registration/pages/WizardPage.tsx:171` (imported `:23`) and survives the
  magic-link hop (`apps/web/src/features/**auth**/pages/MagicLinkLandingPage.tsx:293` — the `auth`
  feature, NOT `registration`; the bare filename in an earlier draft sent a reader to the wrong
  directory); it is surfaced by `report.service.ts:133`'s
  `campaign_source -> 'utm' ->> 'campaign'`. **Crucially, `buildCampaignSource` writes
  `campaign_source` when EITHER a channel OR a UTM is present**
  (`registration.controller.ts:113`) — so a per-station link attributes the registration **even when
  the listener never answers the question**, which sidesteps both the denominator problem and the
  funnel cost entirely.
  **⚠️ The binding constraint is NOT "will a station read a URL on air" — it is that a listener
  cannot type a query string.** `oyoskills.com/?ref=fresh_fm` is unsayable on radio and unmemorable
  in a car. That constraint dissolves with a **radio-sayable vanity path per station** —
  `oyoskills.com/fresh` → 302 → `/?ref=fresh` — which `parseUtm` already consumes, because it reads a
  bare `?ref` as a first-class signal (`attribution.ts:131` — ⚠️ corrected 2026-08-17; `:47` was a type declaration, the bare `?ref` read is `params.get('ref')` at `:131`), not only `utm_*`. That redirect is a
  **Cloudflare Redirect Rule: no code, no deploy, no story** — one rule per station, added beside the
  parked rule in `13-3-cutover-and-failover.md`. With **11 stations** on the buy
  (`docs/roadmap-to-launch.md:107`) this is the difference between knowing *"radio worked"* and
  knowing *which of 11 stations* earned the naira — i.e. exactly the renew/kill decision the
  attribution spec exists to serve. It is also the ONLY station-level instrument that survives a
  listener who skips the question. **Decide it before the buy**: the vanity paths must be live and
  dry-run-verified (AC9) *before* the first jingle airs, because a URL read on air cannot be
  retrofitted afterwards.
  ⚠️ Like the channel path, this has **never executed on prod** (0 of 82) — if a UTM link is used for
  the jingle, extend AC9's dry run to cover it; or
- **accept the aggregate** for wave one and buy station granularity with wave two.
Recorded so the choice is made before the buy, not regretted after it.

### Dependencies and relationships

- **13-42 (ops-digest data-integrity watch, `ready-for-dev`)** — **write-side sibling.** 13-42 turns
  one-off prod checks into standing digest signals shaped to fire only on a real defect delta; this
  story adds the burst/cap signals for the same write path. Share the digest surface; do not build a
  parallel one.
- **9-52 (`cf-traffic-watch.ts`, LIVE)** — AC3 **consumes** its alert path and cooldown discipline. Its
  three edge signals (`cf-watch.ts:36`) stay unchanged.
- **13-3 (`done`)** — capacity + failover for this exact jingle. Extended by AC6, not duplicated. Note
  its load test measured a **read** endpoint (Context §8) — this story does not attempt to fix that, but
  states it so the green verdict is not over-read.
- **13-25 (`done`)** — the precedent AC5 follows: a forward-compatible public-surface slice built on the
  same count-core Epic 12's 12-4 will complete.
- **13-44 (`ready-for-dev`)** — its campaign-observability UI is where AC1's cap headroom and AC3's
  burst counters should eventually be *displayed*. Out of scope here; noted so the surfaces converge.
- **12-4 (Epic 12, post-launch)** — AC5 extends its seed, does not wait for it.
- **NOT dependent on 13-37 or 13-41.** No CI guard, no shared `ci-guard` toolkit; those stories'
  sequencing does not gate this one, and this one does not gate them.
- **Termii is irrelevant to this story's controls but relevant to its framing** — SMS is still dark
  (`roadmap-to-launch.md:125`), so email is the only automated follow-up a radio listener gets, which is
  precisely why it must not be spent on inflation.

### Why `ready-for-dev`, and why LAUNCH-ADJACENT rather than POST-LAUNCH

The jingle precedes the blasts, and this story gates the jingle — so it is not post-launch hygiene like
13-41/13-42/13-43/13-44. Every AC is implementable from evidence already in this file: the measurements
are taken, the mechanisms exist (`filterMarketingCohort`, `MARKETING_CATEGORIES`, `getRegistryCountCore`,
9-52's dispatch path), and the two rulings that could have blocked drafting — no wizard captcha, Bot
Fight Mode stays OFF — are already made and recorded here as non-goals. No further elicitation is
needed, which is the definition of `ready-for-dev`.

It is **not** placed on the launch-gate list unilaterally: whether the jingle waits for it is Awwal's
call. What this story does is make that a *decision* rather than an omission — the §2a0 lesson that a
launch-adjacent item parked without a trigger becomes invisible debt.

### Project Structure Notes

- **Modified (API):** `src/services/notification-meter.service.ts` (caps + pre-send check),
  `src/services/email.service.ts` (consult before the provider call at `:115`),
  `src/services/submission-processing.service.ts` (per-address gate in `sendThankYouReferralEmail`),
  `src/middleware/registration-rate-limit.ts` + `src/middleware/wizard-draft-rate-limit.ts` (AC4, after
  AC1+AC2), `src/routes/registration.routes.ts` (comments), `src/services/registry-totals.service.ts` +
  `src/services/public-insights.service.ts` (AC5 — the Axis-3 split; label is `nin_on_file` / "with NIN on file", **never "verified"**, per 12-4 R1).
- **New (API):** the burst breaker (AC3) — place the pure evaluator in `src/lib/` with the thin runner
  beside `scripts/cf-traffic-watch.ts`, per the `osv-prod-gate` / `registry-read-drift` core+runner
  convention. `apps/api/tsconfig.json` sets `rootDir: ./src`, so logic under `scripts/` is neither
  type-checked nor unit-tested.
- **Modified (web):** the insights page for AC5's registered-vs-verified display; and for AC10,
  `apps/web/src/features/registration/pages/Step5ReviewAndSave.tsx:239,247` (placeholder + explicit
  decline) and `apps/web/src/features/registration/lib/attribution.ts:15-25` (channel ordering).
  ⚠️ **AC10 must not touch `ATTRIBUTION_ENABLED` (`attribution.ts:12`) or the never-blocks-submit
  guardrail (`attribution.ts:7`, `Step5ReviewAndSave.tsx:214`).**
- **NOT modified:** nothing about the attribution *question* itself, its presence, or its optionality —
  Context §9. AC9 is verification-only and writes no code.
- **Modified (docs, AC6):** `docs/runbooks/pre-viral-push-checklist.md`,
  `docs/runbooks/13-3-cutover-and-failover.md`, `docs/roadmap-to-launch.md`. **No new runbook.**
- No schema change, no migration, no new prod dependency.

### References

- [Source: apps/api/src/middleware/registration-rate-limit.ts:20-24,31-32,38-44 — `max: 5` /
  `windowMs: 15min` per IP, the "prevents mass account creation" docblock, and the
  `registration.rate_limit_exceeded` warn that is the only trace of a turned-away listener]
- [Source: apps/api/src/middleware/wizard-draft-rate-limit.ts:20-28,38-39,45-51 — 120/IP/15min, the
  "~5 wizards concurrently per shared NAT" assumption, and `wizard_draft.rate_limit_exceeded`]
- [Source: apps/api/src/routes/registration.routes.ts:22-24,48-51,56-59 — the transplanted legacy
  `/auth/public/register` discipline, the deferred captcha, and the shared supplemental route]
- [Source: apps/api/src/app.ts:127-133 — `trust proxy` + `realIpMiddleware` (CF-Connecting-IP) resolved
  BEFORE any rate limiter, i.e. the carrier NAT address is the key]
- [Source: apps/api/src/controllers/registration.controller.ts:500-501,581-598,663-683,720,855-863,
  896,925-930 — pending-NIN ⇒ no dedupe; respondent row with no email column; email into
  `submissions.raw_data`; the fire-and-forget side-effect call]
- [Source: apps/api/src/services/auth.service.ts:793-803 + apps/api/src/db/schema/users.ts:8 —
  `users.email` IS unique, but the wizard's insert is `onConflictDoNothing` ⇒ reuse, never reject]
- [Source: apps/api/src/db/schema/respondents.ts:181,236-243 — nullable NIN; NO email column; only
  non-unique indexes]
- [Source: apps/api/scripts/migrate-multi-source-registry-init.ts:99-102 — the partial
  `respondents_nin_unique_when_present` index: the ONLY identity uniqueness on respondents]
- [Source: apps/api/src/services/submission-processing.service.ts:841,856,909,927,1048-1074,1091-1095 —
  the synchronous auto-send chain, `AUTO_CAMPAIGN_ID = 'thankyou-referral-auto'`, and the
  per-RESPONDENT marker that a new row for the same address walks straight past]
- [Source: apps/api/src/services/email.service.ts:100,115,116-122,133-143 — `dispatch`: provider call
  FIRST, meter and `recordCampaignSend` AFTER, return value discarded ⇒ a cap must be a new pre-send
  check]
- [Source: apps/api/src/services/notification-meter.service.ts:23-25,60,62,150-153,161-169 — TTLs only,
  no caps; "Fail-OPEN"; "Counted, not blocked: the send already happened"]
- [Source: apps/api/src/services/campaign-contact.service.ts:39,70-97,150,174-200 —
  `MARKETING_CONTACT_GAP_DAYS`, the fail-soft ledger write, and `filterMarketingCohort`'s three passes]
- [Source: apps/api/scripts/_thankyou-referral-blast.ts:237, _reengagement-email-blast.ts:379,
  _cohort-a-supplemental-survey-blast.ts:293, _backfill-registration-autosends.ts:232 — the ONLY four
  consumers of `filterMarketingCohort`; no in-request path consumes it]
- [Source: apps/api/src/services/list-unsubscribe.ts:16-20 — `MARKETING_CATEGORIES`, the taxonomy AC1's
  category-aware cap keys off]
- [Source: apps/api/src/services/public-insights.service.ts:15,23,80,98-99,132 — `getRegistryCountCore`
  ("Seed of 12-4"), the 3600s cache, `answersWhere` as the only predicate, and the headline summary with
  no WHERE at all]
- [Source: apps/api/src/services/registry-unified.sql.ts:69-91 — the canonical source has no `r`-side
  status/verification filter]
- [Source: apps/api/src/routes/public-insights.routes.ts:38-40 — unauthenticated public endpoint,
  60/min/IP]
- [Source: _bmad-output/planning-artifacts/registry-data-status-taxonomy.md — Axis 3 (VERIFICATION /
  TRUST) + honest-display RULE 5 "Verified vs pending are never blended in any registry-size claim":
  the contract AC5 enforces]
- [Source: apps/api/src/lib/cf-watch.ts:17-32,36 + apps/api/scripts/cf-traffic-watch.ts:39-58 — 9-52's
  three edge signals, thresholds, and the cooldown/dispatch discipline AC3 reuses]
- [Source: docs/runbooks/pre-viral-push-checklist.md:26,27,36-42,50,60 — Bot Fight Mode OFF (9-20,
  preserved), the `exclude /api/*` remedy that excludes the path at risk, 9-52's tripwire, and instant
  WAF rollback]
- [Source: docs/runbooks/13-3-cutover-and-failover.md:3,7,13-24,30-35 — the EXISTING radio-jingle
  runbook: fallback, capacity context, the parked redirect rule AC6 arms alongside]
- [Source: _bmad-output/implementation-artifacts/13-3-launch-capacity-and-static-fallback.md:31,51 —
  AC1.1 specified the registration hot path; the executed run measured
  `GET /api/v1/forms/public-active` instead]
- [Source: docs/roadmap-to-launch.md:107,115-127 — Epic 13's 5-channel push incl. radio (11 stations),
  the pre-flight gate on PAID SPEND, the phone-first/Termii-dark audience, and the abort tripwire]
- [Source: _bmad-output/implementation-artifacts/13-25-public-insights-registry-count-honesty.md —
  the launch-slice precedent AC5 follows: one count-core, forward-compatible with 12-4]
- [Source: apps/web/src/features/registration/pages/Step5ReviewAndSave.tsx:211-214,229,239-245,247 —
  Story 13-1's acquisition question: LIVE on the Review step, the "prominence ≠ mandatory" guardrail,
  and the `value=""` "Prefer not to say" FIRST option that collapses declined into ignored (AC10a)]
- [Source: apps/web/src/features/registration/lib/attribution.ts:7,9-12,14,15-25,42-53 —
  `ATTRIBUTION_ENABLED = true`; "NEITHER ever blocks a submit"; the deliberate no-per-station-picker
  (13-1 AC2.4); `ACQUISITION_CHANNELS` with **Radio first** (AC10b); the bounded `parseUtm`]
- [Source: apps/web/src/features/registration/pages/WizardPage.tsx:23,171 — `parseUtm` is actually
  CALLED on wizard entry, so the per-station-UTM alternative in Dev Notes is wired, not theoretical]
- [Source: apps/api/src/controllers/registration.controller.ts:103-115,735-738 — `buildCampaignSource`:
  the AC3.4 degenerate path omits the key entirely (`:110`,`:113`), writes on channel **OR** utm
  (`:113-114`), spread LAST into `raw_data` so no answer key can clobber it (`:738`)]
- [Source: apps/api/src/services/report.service.ts:86-95,133 — `getCampaignBreakdown`: the FIXED JSON
  accessor (`:89`) and the `campaign_source IS NOT NULL` filter (`:93`) that AC10a's explicit-decline
  value would move decliners inside; the UTM campaign read at `:133`]

## Dev Agent Record

### Context Reference

- This story file — 914 lines, read in full. **Not regenerated** (`*create-story` would have destroyed the ruling, the AC ordering note, AC11's discharge and the attribution findings).
- The ⚖️ ruling of 2026-08-11 read **before Task 1**, as its header requires.

### Implementation Plan (as executed)

Built in the story's leverage order, which is load-bearing rather than stylistic: **cap the send (1) → throttle the address (2) → alert on burst (3) → only THEN loosen the signup limits (4)**. AC4's precondition was honoured literally: Tasks 1 and 2 were complete and green in this working tree before any limiter value was touched. Until the send is capped and the address throttled, the per-IP limit is the only thing bounding a flood, and loosening it first converts a registration burst straight into a mail burst.

### Debug Log

| What happened | Outcome |
|---|---|
| RED phase, Task 1 | 18/18 cap tests failed on missing symbols, then passed. At dispatch level exactly the 4 refusal tests failed while the 5 "allowed direction" tests passed — the correct baseline, since today everything sends. |
| RED phase, Task 2 | 3 of 10 failed, and precisely the mail-cannon cases (same address, brand-new respondent row). The AC8 cap tests passed on the first run, which is the evidence that Task 1's cap is genuinely reached from the real send chain. |
| Six partial module mocks broke | `NotificationMeter` gained `checkCap`, so four files stubbing the meter for `dispatch` failed, plus the registration route mock missing `wizardDraftEmailRateLimit` and the burst middleware. **This is the mechanism working** — the same one AC-RL item 3 records. Each stub now carries a comment saying why it exists. |
| `email-campaign-ledger` failed on a DB connection | Environmental, not the change: DB-backed files need `NODE_ENV=test DATABASE_URL=…/app_test`. Green against `app_test`. |
| 🔴 **Four files passed in isolation and failed in the full suite** | **Root cause: I had been running `pnpm vitest run <path>` from the REPO ROOT, and there is no root vitest config — so `vitest.base.ts`'s `mockReset: true` never applied.** Under the real per-package config, `mockReset` strips any implementation set inside a `vi.mock` factory before each test, so `checkCap: vi.fn().mockResolvedValue(...)` returned `undefined` and `dispatch` threw on `.allowed`. Fixed by making those stubs **plain async functions**, which no reset can clear. ⚠️ All new tests were then re-verified under the correct config (67/67). The same trap as the recorded "never `pnpm vitest run` from root for web" rule — it applies to the API package too. |
| `getRegistryCountCore` unit fixtures | Failed once the query became `GROUPING SETS`. Fixtures updated to the real shape; grand-total detection loosened to `== null` so a driver omitting the key is not read as a tier row. Two tests added (zero-fill, unknown-tier rejection). |
| Two pre-existing Step 5 tests | Genuinely changed by the nudge — they clicked Save once with the question untouched. Updated to state the new behaviour explicitly rather than paper over it. |

### Completion Notes

**Shipped — Tasks 1–6 and 9:**

1. **AC1 — the meter now ENFORCES, it does not only count.** `NotificationMeter.checkCap()` is a pure, read-only pre-send check consulted by `EmailService.dispatch` **before** `getProvider().send(...)`. Anchored on the symbol rather than a line number — the story's own warning, since that anchor had already rotted twice. Marketing categories only: a test pins that a magic link still sends with the cap fully exhausted **and** with Redis unreachable. Fail-OPEN on infrastructure, fail-CLOSED on the limit. A refusal returns a structured failure, logs `notification.cap_exceeded`, and pages Telegram through `isAlertSendEnabled` with a per-window cooldown — one page per window, not one per refused send.
2. **AC2 — per-address throttle** on the registration auto thank-you, reusing `getRecentlyContactedEmails` (the exact gap query the four blast scripts inherit) and `MARKETING_CONTACT_GAP_DAYS`. No second gap constant. **The fail-soft-ledger direction is decided and recorded in code:** a missing or unreadable ledger row ALLOWS the send, because the opposite direction converts degraded instrumentation into total loss of a citizen-facing email — and the residual risk is bounded by AC1's cap, which reads Redis rather than this ledger. Two guards, two deliberately opposite failure directions.
3. **AC3 — a burst breaker that alerts and never blocks.** Pure evaluator plus DI orchestration in `lib/registration-burst.ts` (9-52's shape), Redis and Express wiring in `middleware/registration-burst.ts`. `next()` is called **synchronously, first**; a test asserts it still is when Redis throws. One message carries submits / 429s / auto-sends / marketing headroom. It also fires on a **429 wall at ordinary throughput** — the signal 9-52 is structurally blind to, and the one that went unnoticed in August until a registrant emailed to say he could not finish.
4. **AC4 — signup limits.** ⚠️ **Most of this AC was already shipped by the 2026-08-07 hotfix** (IP 5→50, per-email limiter, IPv6-safe key). What was still outstanding, and is now done: the **stale route prose** (the header still described "5/IP/15min per the legacy `/auth/public/register` discipline" — prose is not type-checked, and that comment is how a future reviewer restores the old value); the **supplemental-route ruling**, stated rather than left to ride silently (it keeps the IP flood-stop and deliberately does **not** take the per-email limiter — it is magic-link-token-gated and its payload carries no email, so the limiter would silently re-impose a second per-IP bucket on a CGNAT address, the exact failure August removed); and **`wizardDraftRateLimit`**, re-sized 120 → 1,200/IP with a new per-email dimension (300). The draft limiter matters most of the three because it fails FIRST and SILENTLY — a lost draft looks like a user who simply did not finish, so nobody reports it.
5. **AC5 — registered vs verified.** `getRegistryCountCore` extended with the Axis-3 split **inside the same query** (GROUPING SETS), so there is still exactly ONE counting source and 12-4 inherits it. It is **rendered on the public page**, not merely added to the shared type — shipping a required field no component reads is the 12-5 defect this project has already paid for once.
6. **AC6 — operator gate.** The `exclude /api/*` remedy corrected in **both** places it appears (§1 posture and §3 spike playbook), a `registration-wizard-burst` rule specified (30/min/IP, **Managed Challenge** not block — decided, with carrier CGNAT as the stated reason), and arming it added to the 13-3 pre-jingle setup and the roadmap's paid-spend gate. Bot Fight Mode stays OFF. No new runbook.
7. **AC10 — denominator + de-bias shipped; the nudge became PROMINENCE, not interception.** A real `— Select —` placeholder, an explicit "Prefer not to say" that stores a value, and `ACQUISITION_CHANNELS` reordered alphabetically with `Other` last so **Radio is no longer first**. **How an explicit decline is treated by `getCampaignBreakdown` is decided and recorded: its own reported row**, not excluded — excluding it would drop decliners back into the same invisible bucket as the people who ignored the question, re-creating one layer down the exact denominator loss AC10 exists to close.
   ⚠️ **The submit-time nudge was built, reviewed, and DROPPED (ruling R1, Awwal 2026-08-21).** It intercepted the first Save press when the question was untouched. What ships instead is purely visual: an unanswered question gets a highlighted card and one line of copy, and `onSubmit` is wired straight through exactly as before this story. **Four regression tests assert the first press submits in all three states**, and two assert the interception affordances are gone — so the behaviour cannot creep back. The response-rate half is now residual **R2**, deliberately gated on measuring whether prominence alone moves the rate. **How an explicit decline is treated by `getCampaignBreakdown` is decided and recorded: its own reported row**, not excluded — excluding it would drop decliners back into the same invisible bucket as the people who ignored the question, re-creating one layer down the exact denominator loss AC10 exists to close.

### ✅ PROD WORK COMPLETED 2026-08-21 (authorised by Awwal; read-only except the AC9 dry run)

**Task 8 / AC9 — DISCHARGED. Both halves passed, on the real pinned public form.**
`OSL-2026-9F4TRH` → submission `01a0253d-bae4-769a-ab1c-491585cdc04f` stored
`{"utm": {}, "channel": "Radio"}`, **and** `getCampaignBreakdown()` returned `Radio|1`. Checking only
the write would have been the `getCampaignFunnel` failure again. Torn down child-first (every trace
re-checked at 0) and **re-measured, not restored**: 327 / 286 / 25, `Radio` gone. Prod SHA `fd5fe2e`.
⭐ Before this run `Radio` had **never once** been selected on prod.

🔴 **THE DRY RUN FOUND A DEFECT IN AC9 ITSELF.** Its teardown wording — *"delete that respondent +
submission BY ID"* — is **incomplete for the public-wizard path**. The run created four rows it would
have orphaned: `users`, `magic_link_tokens`, `marketplace_profiles`, `campaign_sends`. The child-first
chain (already verified against the code on 2026-08-06 in the enumerator smoke runbook) is now written
into `13-3-cutover-and-failover.md`. ⚠️ `campaign_sends` matters most **because of this story**: the new
AC2 throttle reads that ledger, so a leftover row silently suppresses the next real thank-you to that
address for the whole gap window.

🔴 **ONE REGISTRATION SENDS THREE EMAILS, NOT ONE** (magic link + reference confirmation + thank-you
outreach, all confirmed delivered). Context §4 says "N simultaneous registrations become N provider HTTP
calls on the API's own event loop" — it is **3N**, so that capacity argument is three times sharper than
written. The cap design is unaffected and vindicated: only the outreach is marketing (capped +
throttled); the magic link and confirmation are transactional and stay uncapped, which is exactly what
AC1's category-awareness exists to protect.

⏱️ **Context §4's synchronous-send timing reproduced exactly:** submission `16:53:17.676Z`,
`campaign_sends` row `16:53:18.039Z` — **0.36 s later, same request.**

**Task 7 / AC7 — BEFORE baseline COLLECTED; the AFTER half cannot exist yet.**
Window 2026-08-07 20:31Z → 2026-08-21 13:30Z (15 retained pm2 out-logs):

| Event | Count | Shape |
|---|---|---|
| `registration.rate_limit_exceeded` | 23 | **all 2026-08-07 20:31-20:39Z**, 2 carrier IPs, `attempts=6…25` |
| `registration.email_rate_limit_exceeded` | 13 | 11 that evening; then 1 on 08-09, 1 on 08-14 — **both `attempts=4`** |
| `wizard_draft.rate_limit_exceeded` | **0** | never fired |

⭐ **The 23 are PRE-hotfix**: `attempts` above 5 can only be refused while `max` was still 5, so they
predate the 5→50 restart that evening. **Since the hotfix the IP limiter has fired zero times in 13
days** — the hotfix worked and the raised ceiling is not turning anyone away. The per-email limiter's
only two organic hits are both **one retry over a limit of 3**, which is what a real person retrying
looks like, not a script. First time anyone has read these events.

**Volume baseline (read-only SQL):** 327 respondents · 1-8 submissions/day · busiest day ever **168
submissions and 177 marketing sends (2026-08-04)** · busiest month **300 sends (2026-08)**.

**⭐ These figures REPLACED the invented numbers at every constant.** The daily cap is now stated as
~11× the busiest marketing day the system has ever had, and the check that matters is recorded in the
code: **the cap would NOT have bound on 2026-08-04**, the biggest real day. The burst threshold likewise
would not have paged on it (~0.6 submits per 5-min window even that day).

⚠️ **What is STILL an assumption, said plainly:** the JINGLE's peak. No campaign of that shape has ever
run, so the headroom multiples are a judgement, not an extrapolation — and the draft limiter's measured
zero proves only that it was never under load (1-8 submissions/day), **not** that the old 120 was safe.

**⛔ STILL NOT DONE:**

- **Task 7's AFTER count** — the turn-away delta from the first jingle window. It requires an event that
  has not happened: [[pattern-verification-that-cannot-run-yet]]. It stays on the roadmap pre-flight
  gate rather than being closed on a zero.
- **AC11** was already discharged on 2026-08-01 (recorded in this file); untouched.

**⚠️ Deviation a reviewer should look at — AC5 says "REGISTERED vs VERIFIED", and there is no `verified` tier.** Story 12-4 (AC9 / ruling R1) removed it deliberately: a NIN is CAPTURED, never validated — there is no NIMC check available and NINs carry no check digit. The split therefore ships against the real taxonomy and the public label reads **"with NIN on file"**, never "Verified". AC5's mechanism and honest-display RULE 5 are both satisfied; only the word differs, and using the AC's word would have published a claim the system cannot support. Flagged rather than silently resolved.

**⚠️ Second item RESOLVED on review — the nudge no longer intercepts anything.** It originally took the first Save press when the question was untouched. Dropped on 2026-08-21 (residual R1) because the risk is asymmetric: a lost registration is permanent, an unanswered question costs one data point, and on a slow phone a swallowed first press reads as a broken button at the exact moment of conversion. What tipped the decision is that **per-station vanity links already attribute a registration even when the listener never answers** (`buildCampaignSource` writes on channel OR utm) — so the marginal value of squeezing the response rate at the conversion moment is smaller than the conversion risk. Those vanity paths are now residual **R3**, and they carry a hard pre-jingle deadline because a URL read on air cannot be retrofitted.

**⚠️ Read the residual ledger below before adjudicating.** Eight rows, in the format `lint-story-residuals.ts` parses, so an OPEN row blocks `Status: done` at pre-commit rather than relying on anyone remembering. Three are OPEN: **R2** (post-submit ask — evidence-triggered, do not build before the measurement), **R3** (vanity paths — hard deadline, gates the jingle's measurability), **R7** (6 mis-bucketed hemorrhage rows), plus **R8** (AC7's AFTER count, which needs an event that has not happened).

### File List

⚠️ **GENERATED FROM `git status --short`, not hand-maintained** (review A15 / finding M7). The
hand-written version had drifted: three changed docs and two new story files were missing. A
File List that is curated by memory drifts by construction — the whole tree is listed here, with
the rows this story does not own marked, so a reviewer can see the boundary rather than guess it.

**API**

- `apps/api/scripts/_recover-abandoned-wizard-drafts.ts` (modified)
- `apps/api/src/lib/registration-burst.ts` (new)
- `apps/api/src/middleware/registration-burst.ts` (new)
- `apps/api/src/middleware/registration-rate-limit.ts` (modified)
- `apps/api/src/middleware/wizard-draft-rate-limit.ts` (modified)
- `apps/api/src/routes/registration.routes.ts` (modified)
- `apps/api/src/services/campaign-contact.service.ts` (modified)
- `apps/api/src/services/email.service.ts` (modified)
- `apps/api/src/services/notification-meter.service.ts` (modified)
- `apps/api/src/services/public-insights.service.ts` (modified)
- `apps/api/src/services/registry-totals.service.ts` (modified)
- `apps/api/src/services/submission-processing.service.ts` (modified)

**Tests — API**

- `apps/api/src/lib/__tests__/registration-burst.test.ts` (new)
- `apps/api/src/middleware/__tests__/registration-burst.test.ts` (new)
- `apps/api/src/middleware/__tests__/wizard-draft-rate-limit-key.test.ts` (new)
- `apps/api/src/routes/__tests__/registration.routes.test.ts` (modified)
- `apps/api/src/services/__tests__/email-campaign-ledger.test.ts` (modified)
- `apps/api/src/services/__tests__/email-campaign-tag.test.ts` (modified)
- `apps/api/src/services/__tests__/email-send-cap.test.ts` (new)
- `apps/api/src/services/__tests__/list-unsubscribe.test.ts` (modified)
- `apps/api/src/services/__tests__/notification-cap.test.ts` (new)
- `apps/api/src/services/__tests__/registry-totals.service.test.ts` (modified)
- `apps/api/src/services/__tests__/registry-verification-sql-parity.integration.test.ts` (new)
- `apps/api/src/services/__tests__/staff-activation-complete-email.test.ts` (modified)
- `apps/api/src/services/__tests__/thankyou-autosend-throttle.integration.test.ts` (new)
- `apps/api/src/services/__tests__/thankyou-gap-failopen.integration.test.ts` (new)

**Shared types**

- `packages/types/src/analytics.ts` (modified)
- `packages/types/src/email.ts` (modified)

**Web**

- `apps/web/src/features/insights/pages/PublicInsightsPage.tsx` (modified)
- `apps/web/src/features/registration/lib/attribution.ts` (modified)
- `apps/web/src/features/registration/pages/Step5ReviewAndSave.tsx` (modified)

**Tests — web**

- `apps/web/src/features/insights/pages/__tests__/PublicInsightsPage.test.tsx` (modified)
- `apps/web/src/features/insights/pages/__tests__/SkillsMapPage.test.tsx` (modified)
- `apps/web/src/features/registration/pages/__tests__/Step5ReviewAndSave.test.tsx` (modified)

**Docs**

- `docs/roadmap-to-launch.md` (modified)
- `docs/runbooks/13-3-cutover-and-failover.md` (modified)
- `docs/runbooks/enumerator-prod-smoke-and-golive-gate.md` (modified) — ⚠️ *not 13-46: authored by SM/PM in the same tree*
- `docs/runbooks/pre-launch-operator-runbook.md` (modified) — ⚠️ *not 13-46: authored by SM/PM in the same tree*
- `docs/runbooks/pre-viral-push-checklist.md` (modified)

**Planning / tracking**

- `_bmad-output/implementation-artifacts/13-46-public-burst-readiness-send-caps-and-registration-throttle.md` (modified)
- `_bmad-output/implementation-artifacts/13-63-station-level-attribution-vanity-paths-and-a-readable-number.md` (new) — ⚠️ *not 13-46: authored by SM/PM in the same tree*
- `_bmad-output/implementation-artifacts/13-64-data-loss-marker-tail-six-respondents-in-the-wrong-bucket.md` (new) — ⚠️ *not 13-46: authored by SM/PM in the same tree*
- `_bmad-output/implementation-artifacts/13-65-registration-sends-off-the-request-path.md` (new) — ⚠️ *not 13-46: authored by SM/PM in the same tree*
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)
- `_bmad-output/planning-artifacts/epics.md` (modified) — ⚠️ *not 13-46: authored by SM/PM in the same tree*

_45 paths total, of which 6 belong to 13-63 / 13-64 / 13-65 planning work._

## Residual ledger (13-46)

**Format is the one `lint-story-residuals.ts` parses** — ID · severity · STATE · evidence · owner.
An OPEN row here BLOCKS `Status: done` at pre-commit, which is the point: these are the items that
must not be lost between code review and adjudication.

⚠️ **HANDED OFF ≠ ABANDONED, and it is not the same as OPEN.** Rows whose remaining work now belongs
to a REGISTERED story (13-63 / 13-64 / 13-65) are marked CLOSED HERE with the story key. 13-46's
obligation for those findings was to discover, root-cause, file and register them — which is done and
verifiable in `sprint-status.yaml`. Leaving them OPEN would make THIS story's closure hostage to three
other stories' schedules, which is how a ledger stops being read.

**What genuinely keeps 13-46 out of `done`:** **R8** — AC7's AFTER count, which is 13-46's OWN
acceptance criterion and needs the jingle to have aired. That alone is sufficient, and it is the
honest blocker. **R3** (a media-buy decision) and **R12** (the falsifier for a ruling 13-46 made)
stay open beside it.

| Residual | Severity | State | Evidence | Owner |
|---|---|---|---|---|
| **R1** — The AC10c submit-time NUDGE was BUILT and then DROPPED. Shipped instead: non-intercepting prominence (highlighted card + one line) when the question is unanswered. | Med | **CLOSED — ruled by Awwal 2026-08-21.** Risk is asymmetric: a lost registration is permanent and costs a citizen 10-15 min of work; an unanswered question costs one data point. On a slow phone "I pressed Save and nothing happened" reads as BROKEN. 13-1's "prominence ≠ mandatory" is now honoured in the strongest sense — prominence is the only thing it does. | 4 regression tests assert the first press submits in ALL three states (untouched / chosen / declined); 2 assert the interception affordances are gone | Dev |
| **R2** — The post-submit ask (attribution on the confirmation screen) is the stronger response-rate instrument and is NOT built. | Med | **CLOSED HERE — HANDED OFF to Story `13-65-registration-sends-off-the-request-path` (AC7), registered `ready-for-dev`.** 13-46's obligation was to discover, root-cause, file and register it; that is done. ⚠️ The trigger travels WITH the story and is written into it as a LOCK: it is EVIDENCE-TRIGGERED, not taste-triggered — Trigger: measure the public-rows-only `answered_rate` (query in `13-3-cutover-and-failover.md`) after AC10 deploys. If prominence does not move it, that justifies the ask; if it does, the funnel change is unnecessary. **Do NOT build it before that measurement exists.** | Runbook carries the exact query, scoped `r.source='public'` so staff captures cannot dilute the denominator | SM (Bob) to author · PM (John) to sequence |
| **R3** — Per-station VANITY PATHS (`oyoskills.com/fresh` → 302 → `/?ref=fresh`) are the only station-level instrument that survives a listener who never answers the question. Not yet created. | **High** | **OPEN — but the TRIGGER IS RE-STATED against the real schedule (2026-08-22). NOT a gate for the 7-station test wave.** ⭐ The buy airs **one station per week, sequentially, 24 Aug → 9 Oct 2026, with clean gaps between weeks** — so a registration's TIMESTAMP already identifies its station with near-perfect fidelity. That is literally the first no-code option this story's own Dev Notes listed (*"sequence the stations so a registration spike attributes by time"*), and the media buy has already done it. ⚠️ **NEW TRIGGER: vanity paths become NECESSARY the moment two stations air in the SAME window** — i.e. the later 11-station wave, if it runs concurrently rather than staggered. Then timestamps stop identifying a station and the signal collapses to "radio worked". ⚠️ **Production cost, previously unstated:** the 21 airings look like **3 master recordings** (one per language) aired 7 times, so per-station URLs would mean **21 distinct masters instead of 3** — a 7× production cost to buy what the stagger gives free. Zero code: one Cloudflare Redirect Rule per station. `parseUtm` already consumes a bare `?ref`, and `buildCampaignSource` writes `campaign_source` on channel **OR** utm — so it attributes without asking. With 11 stations this is the difference between "radio worked" and *which of 11* earned the naira. | AC9 proved the channel half live 2026-08-21; the `?ref` half has still executed **0 times** on prod | PM (John) — sequencing vs paid spend |
| **R4** — AC5's wording says "REGISTERED vs **VERIFIED**"; the taxonomy has no `verified` tier. | Med | **CLOSED — shipped against the real taxonomy.** 12-4 AC9 / ruling R1 deleted it deliberately: a NIN is CAPTURED, never validated (no NIMC path, no check digit). Public label reads "with NIN on file", never "Verified". If NIMC access ever arrives, a real tier is added ABOVE `nin_on_file` and the label changes then — nothing built here blocks that. | `registry-verification-sql-parity.integration.test.ts` asserts NO `verified` key is ever published | Dev · AC text to be amended by SM |
| **R5** — AC9's own teardown wording ("delete that respondent + submission BY ID") is INCOMPLETE for the public-wizard path. | **High** | **CLOSED — corrected in `13-3-cutover-and-failover.md`.** Proven live, not theorised: the 2026-08-21 dry run created `users`(1), `magic_link_tokens`(1), `marketplace_profiles`(1) and `campaign_sends`(1) that the literal wording would have orphaned. ⚠️ `campaign_sends` matters *because of this story* — the AC2 throttle reads that ledger, so a leftover row silently suppresses the next real thank-you to that address for the whole gap window. | `DELETE n` counts recorded in the runbook run-record | Dev |
| **R6** — Context §4 undercounts outbound volume: one registration sends **THREE** emails (magic link + confirmation + outreach), not one. | Med | **CLOSED as documented — but note the capacity implication.** "N registrations ⇒ N provider calls on the event loop" is really **3N**. The cap design is unaffected (only the outreach is marketing); the capacity argument is 3× sharper. **REOPEN TRIGGER:** 13-3's load test measured a READ endpoint (`/forms/public-active`), so the write path at 3N sends/registration has still never been load-tested — reopen if the jingle scale estimate rises. | Confirmed by delivery 2026-08-21; ledger row 0.36 s after submit, same request | PM (John) — is a write-path load test a paid-spend gate? |
| **R7** — 6 respondents from the 9-26 soft-launch hemorrhage carry NO `questionnaire_data_lost` marker, so `deriveDataStatus` buckets them `no_submission` instead of `data_lost`. | Low | **CLOSED HERE — HANDED OFF to Story `13-64-data-loss-marker-tail-six-respondents-in-the-wrong-bucket`, registered `ready-for-dev`, sequenced by PM ruling 3 to ride immediately before 12-6.** All 6 are `source='public'`, created 2026-05-20 02:18-06:28Z — the tail of the hemorrhage on the morning of the fix, before it deployed. The marker backfill evidently keyed on `created_at < 2026-05-20`. Six people sit in the wrong bucket on a taxonomy this story now PUBLISHES. | `OSL-2026-BECYNP`, `4RRPPA`, `P9NESM`, `RKTVAR`, `99Y46Z`, `T50C36` · 49 of 55 orphans ARE correctly marked · 0 marked rows after 2026-05-20 | SM (Bob) to file |
| **R11** — `import.service.integration.test.ts` collides on `users_email_unique` when two runs land in the same ~65-second bucket. | Low | **CLOSED HERE — pre-existing, NOT introduced by 13-46, and recorded for the backlog rather than carried as 13-46 work.** Its actor email is `_imp112_${uuidv7().slice(0,8)}`, and the first 8 hex chars are the HIGH 32 bits of a 48-bit ms timestamp — they only change every ~65s. It also never cleans up: **73 leftover rows in `app_test`, oldest 2026-08-07.** Passes in isolation (11/11); it failed once in a back-to-back full-suite run and would read as a flake. | Confirmed by re-running the file alone after a full-suite failure, and by counting the debris | Backlog |
| **R12** — the AC2 gap is now scoped to `thankyou-referral`, so cross-campaign suppression no longer protects the auto thank-you. | Med | **OPEN as a WATCH, not as work — this is R1's falsifier.** `recordThankYouSuppressed()` counts every suppression. **REOPEN TRIGGER: a non-trivial suppression count on a day with no duplicate-registration activity** means the ruling was wrong and the broad gap should come back. Deliberately a counter rather than a catch-up queue: the alternative would be machinery whose job is to eventually deliver mail that should not be sent. | Counter wired in `middleware/registration-burst.ts`; event `thankyou_referral_auto.skipped_duplicate_thankyou` | Operator, first jingle window |
| **R9** — `getCampaignBreakdown` has **ZERO callers** in `apps/`. AC9's assertion (b) was verified at SQL level, so the row IS returned — but no surface invokes the function, so no human can read the number. | **High** | **CLOSED HERE — HANDED OFF to Story `13-63` AC4, registered `ready-for-dev`. My own AC9 discharge was half-true and is corrected in the record.** AC9's stated intent was "prove the number a human will actually read"; I proved the query, not the readability. This is the `getCampaignFunnel` failure (computed, never consumed) reproduced *inside the check written to catch it*. Fix is Story **13-63 AC4**. | grep: only the definition at `report.service.ts:86` and one comment reference | SM (Bob) — carried by 13-63 |
| **R10** — A `?ref` tag on the APEX (`oyoskills.com/?ref=fresh`) is DROPPED before it can be captured. | **High** | **CLOSED 2026-08-22 — the correction is PROPAGATED; the build is R3's.** Corrected in `roadmap-to-launch.md` gate item 6, `pre-viral-push-checklist.md` §0, and Story 13-63 AC1-AC3. ⚠️ Leaving this OPEN once the corrective action was complete was this ledger drifting from reality — the exact failure it exists to prevent. The BUILD is tracked by R3, which is the row with the deadline. `parseUtm` is called from exactly ONE place, `WizardPage.tsx:172` (mounted at `/register`), and every CTA is a bare `<Link to="/register">` that discards the query string. So a redirect to `/?ref=…` measures **nothing**. Target must be **`/register?ref=<slug>`** — still zero code. Same defect 13-9 AC1 already fixed on the `/auth/magic` hop. ⚠️ Had the rules been built from R3's original wording they would have been live, verified-as-redirecting, and silently attributing nothing. | Verified by grep: 1 `parseUtm` call site; 10+ bare `to="/register"` CTAs | PM (John) — before the buy |
| **R8** — AC7's AFTER count (turn-away delta from the first jingle window). | Med | **OPEN — [[pattern-verification-that-cannot-run-yet]].** The BEFORE baseline is collected (2026-08-21). The AFTER half needs an event that has not happened. **Do not close this on a zero.** It sits on the roadmap paid-spend pre-flight gate. | BEFORE: IP limiter 0 in 13 days post-hotfix; per-email 2 organic hits, both `attempts=4`; draft limiter 0 | Operator, at the jingle |

## Change Log

| Date | Change | By |
|------|--------|-----|
| 2026-08-21 | **AC5 WORDING AMENDED — residual R4 discharged on the AC text side. NOTHING ELSE IN THIS FILE CHANGED** (no status, no residual ledger, no Dev Agent Record). AC5 said `/insights` publishes *"REGISTERED vs **VERIFIED**"* and its first bullet cited an Axis-3 taxonomy including a `verified` tier. **That tier does not exist and its absence is deliberate:** 12-4 (AC9 / ruling R1) removed it because a NIN is CAPTURED, never validated — there is no NIMC integration and NINs carry no check digit — so the shipped tiers are exactly `nin_on_file` / `self_declared` / `pending_nin` / `unverified_import` (`registry-totals.service.ts:196-205`, whose own comment reads *"There is no `verified`"*) and the public label reads **"with NIN on file"**. The dev agent flagged the contradiction rather than silently resolving it (2026-08-20 row below) and shipped against the real taxonomy; this amendment makes the AC agree with what shipped, so the next reader does not hit the same conflict and "fix" the code to match a word. **The requirement is unchanged** — honest-display RULE 5 forbids BLENDING trust levels into one registry-size claim, which binds identically whichever name the top tier carries; the split is the AC, the word was the error. Also generalised the bullet so it names the four real tiers instead of the retired five. ➜ Follow-ups from the same ledger were filed as separate stories, not folded in here: **13-63** (R3 vanity paths + R2 post-submit ask) and **13-64** (R7 data-loss marker tail). | Bob (SM) |
| 2026-08-21 | **PROD: AC9 DISCHARGED, AC7's BEFORE baseline COLLECTED, and every cap re-derived from measured data.** ✅ **AC9 passed both halves on the real pinned form** — `OSL-2026-9F4TRH` stored `{"utm": {}, "channel": "Radio"}` **and** `getCampaignBreakdown()` returned `Radio|1`; torn down child-first, all traces 0, **re-measured** to 327/286/25 (never restored to a number). Before this run `Radio` had never once been selected on prod. 🔴 **The run proved AC9's OWN teardown wording incomplete** — the public-wizard path created `users`, `magic_link_tokens`, `marketplace_profiles` and `campaign_sends` rows that "delete that respondent + submission BY ID" would have orphaned; the `campaign_sends` one matters *because of this story*, since the new AC2 throttle reads that ledger and a leftover row silently suppresses the next real thank-you to that address. 🔴 **One registration sends THREE emails, not one** (magic link + confirmation + outreach) — Context §4's "N registrations ⇒ N provider calls on the event loop" is really **3N**, though only the outreach is marketing and therefore capped. ⏱️ §4's synchronous-send timing reproduced exactly: submit `16:53:17.676Z` → ledger `16:53:18.039Z`, **0.36 s, same request**. **AC7 BEFORE baseline:** the 23 `registration.rate_limit_exceeded` events are ALL **pre-hotfix** (`attempts=6…25` is only refusable while `max` was 5), so the IP limiter has fired **zero** times in the 13 days since; the per-email limiter's two organic hits are both `attempts=4`, one retry over the limit — a person, not a script; `wizard_draft.rate_limit_exceeded` **0**. Volume: 327 respondents, busiest day ever 168 submissions / 177 marketing sends, busiest month 300 sends. ⭐ **Those figures replaced the invented numbers at every constant**, with the check that matters recorded in code: the cap would NOT have bound on the busiest real day. ⚠️ Still assumed, and said so: the jingle's own peak; and the draft limiter's measured zero proves only that it was never under load. ⛔ Task 7's AFTER count remains open — it needs an event that has not happened. Suite after the prod pass: **4104 API / 3006 web, 0 failed**; tsc + lint + 3 drift guards clean. | Claude (dev-story) |
| 2026-08-20 | **DEV: Tasks 1-6 + 9 implemented; Tasks 7 + 8 NOT done (prod access).** Built in the story's leverage order, with AC4's precondition honoured literally — the send cap and the per-address throttle were green before any limiter value was touched. **AC1**: `NotificationMeter.checkCap()` is a pure pre-send check consulted by `dispatch` BEFORE the provider call (anchored on the symbol, not the line — that anchor had already rotted twice); marketing-only, fail-OPEN on infrastructure and fail-CLOSED on the limit; refusals are loud (structured failure + `notification.cap_exceeded` + one Telegram page per window). **AC2**: the auto thank-you now consults the SAME gap query the four blast scripts inherit — closing the mail cannon, where a new respondent row for the same address walked straight past the per-RESPONDENT marker; the fail-soft-ledger direction is decided in code (missing row ⇒ ALLOW, because the opposite turns degraded instrumentation into total loss of a citizen-facing email, and AC1's cap bounds the residual). **AC3**: a burst breaker that pages and **never blocks** (`next()` synchronously, first), which also fires on a 429 WALL at ordinary throughput — the signal 9-52 is structurally blind to. **AC4**: mostly already shipped by the 2026-08-07 hotfix; this finished the stale route prose, the supplemental-route ruling, and re-sized `wizardDraftRateLimit` 120 → 1,200/IP plus a new per-email dimension (it fails FIRST and SILENTLY — a lost draft looks like a user who didn't finish). **AC5**: the Axis-3 split computed inside the SAME count-core query (one counting source) and actually RENDERED, not just added to the type. **AC6**: the `exclude /api/*` remedy corrected in both places, plus a registration-scoped WAF rule (Managed Challenge, not block — CGNAT). **AC10 + the nudge shipped as ONE deliverable.** ⚠️ **Two things flagged for review rather than silently resolved:** (i) AC5 says "VERIFIED" but 12-4 R1 deleted that tier — a NIN is captured, never validated — so the public label reads "with NIN on file"; (ii) the nudge intercepts the first Save press when the question is untouched, which is a real funnel change and wants a look on a phone. ⚠️ **Every cap remains PROVISIONAL** — AC7's prod counts are the real derivation input and were not collectable here, so each constant ships with its arithmetic, its assumption named AS an assumption, its failure direction and a reopen trigger. Status → `review`. | Claude (dev-story) |
| 2026-07-30 | **Station-attribution note completed + one citation corrected.** The per-station UTM bullet had closed on the wrong constraint — *"whether a station will read a URL on air"*. The real blocker is that **a listener cannot type a query string**: `oyoskills.com/?ref=fresh_fm` is unsayable on radio. Added the instrument that dissolves it — a **radio-sayable vanity path per station** (`oyoskills.com/fresh` → 302 → `/?ref=fresh`), which `parseUtm` already consumes because it treats a bare `?ref` as first-class (`attribution.ts:131` — ⚠️ corrected 2026-08-17; `:47` was a type declaration, the bare `?ref` read is `params.get('ref')` at `:131`). It is a **Cloudflare Redirect Rule — no code, no deploy, no story**. With **11 stations** on the buy (`roadmap-to-launch.md:107`) this is the difference between *"radio worked"* and *which of 11 stations* earned the naira, and it is the only station-level instrument that survives a listener who skips the question. Flagged as decide-BEFORE-the-buy: a URL read on air cannot be retrofitted. Also corrected `MagicLinkLandingPage.tsx:293` to its real path (`features/auth/pages/`, not `features/registration/pages/`) — the bare filename pointed readers at the wrong feature directory. | Claude (code-review/adjudication pass) |
| 2026-07-30 | **Attribution addendum — +Context §9, +AC9, +AC10, +an OPEN DECISION block, +a station-attribution Dev Note, +2 non-goals.** ⚠️ **Corrects a wrong position held earlier in drafting: the "How did you hear about us?" question is NOT missing.** It is live on the Review step (`Step5ReviewAndSave.tsx:229`), the flag is ON (`attribution.ts:12`), **Radio is the first option** (`attribution.ts:15-25`), and the chain is complete end to end — web `extras.acquisition` (`Step5ReviewAndSave.tsx:240-245`) → `buildCampaignSource` (`registration.controller.ts:103-115`) → spread last into `raw_data` (`:735-738`) → `ReportService.getCampaignBreakdown` (`report.service.ts:86-95`). Story 13-1 shipped it. **The real gaps are narrower and different:** (1) the path has **executed zero times on prod** — `campaign_source` present on **0 of 82** submissions — so the pre-jingle gate is a **LIVENESS DRY RUN, not a form change** (new **AC9**, with teardown BY ID because "restore to baseline" is a data-deletion hazard, and with the read side asserted too so it cannot become another built-but-unconsumed `getCampaignFunnel`); (2) `<option value="">Prefer not to say</option>` is the pre-selected FIRST option (`:239,247`), so **"declined" and "ignored" are the same stored value** and the denominator for every channel conclusion is unrecoverable (new **AC10a**, incl. the consequence that an explicit decline moves decliners inside `getCampaignBreakdown`'s `IS NOT NULL` filter at `report.service.ts:93` — a decision to record, not discover); (3) **first-position bias sits on Radio**, the channel we most want to measure (new **AC10b**). Station-level attribution is deliberately absent (`attribution.ts:14`, 13-1 AC2.4) — recorded as a **media-buy** decision with three no-code alternatives, incl. per-station UTM links, which are already wired (`WizardPage.tsx:171`) and attribute **even when the listener never answers the question** (`registration.controller.ts:113`). **Making the question mandatory is an explicit OPEN DECISION for Awwal, NOT an AC** — it reverses a prior review ruling recorded in both files (`Step5ReviewAndSave.tsx:214` "prominence ≠ mandatory"; `attribution.ts:7` "NEITHER ever blocks a submit"), it sits at the most expensive point in the funnel, and forced choice with Radio first manufactures the very signal we are trying to detect. SM recommendation: keep it optional, ship AC10, add one **non-blocking** submit nudge. | Bob (SM) |
| 2026-07-30 | **Story drafted**, EMERGENT from Awwal's decision to run a radio jingle at the public wizard before the email blasts. Framing: the code does not block the jingle, the CONTROLS are wrong in both directions — an auth-shaped 5/IP/15min limit on an accountless public survey endpoint (harmful under carrier NAT), and NO ceiling at all on the outbound email every registration fires synchronously in-request. 8 ACs / 7 Tasks, ordered by leverage per Awwal's accepted recommendation: cap the send → throttle the address → alert on burst → THEN loosen signup → publish registered-vs-verified → operator WAF gate → measure the turn-away. Status `ready-for-dev`, classified LAUNCH-ADJACENT (not post-launch). **Corrections made against the drafting brief, each verified:** (i) `respondents` has NO email column at all — the address lives in `submissions.raw_data` + `users.email`, and `users.email` IS unique but the wizard inserts `onConflictDoNothing`, so an email unique index is not merely missing but not expressible on the respondent side; (ii) the auto thank-you is **synchronous in-process**, never queued, so a burst is N provider calls on the API event loop; (iii) `NotificationMeter` cannot cap where it sits — `dispatch` calls it AFTER the provider and discards the result — and its fail-open contract is *correct* for transactional mail, so the cap must be category-aware; (iv) `wizardDraftRateLimit` (120/IP/15min) fails FIRST under CGNAT and its own comment states the "~5 wizards per shared NAT" assumption the jingle breaks; (v) a radio-jingle runbook **already exists** (`13-3-cutover-and-failover.md`) alongside `pre-viral-push-checklist.md` and roadmap-to-launch's paid-spend pre-flight gate — this story edits all three and creates none; (vi) 13-3's load test measured a READ endpoint, so its green verdict says nothing about the write path. **Preserved, not reopened:** no wizard captcha (magic link + captcha-gated login is the real gate), Bot Fight Mode OFF (9-20). | Bob (SM) |

## AC11 — DISCHARGED 2026-08-01 (measured on prod, read-only)

**The question:** 291 live drafts were answered against the MASTER; can they safely hydrate into the
six-section PUBLIC CORE? 13-47 fixed the step-cap incompatibility, but key mapping was untested.

**Static half** (`pnpm --filter @oslsr/api form:diff` over Master → Public Core): Public Core is a
**strict SUBSET** of Master — 0 questions absent, 0 type changes, 0 dropped choice values; 22 Master-only
questions; sections 7 → 6 (N 11 → 10, `grp_household` dropped).

**Dynamic half** (prod, read-only):

| Metric | Value |
|---|---|
| Drafts / with answers | 292 / **214** |
| Distinct answer keys stored | 37 |
| Keys the pinned form still asks | **15 — all map** |
| Orphan keys | **22** |
| Drafts holding ≥1 orphan | **206** |

**Verdict: SAFE, and better than safe — no data is lost.**
1. **Every one of the 15 keys the Public Core asks maps exactly.** Nothing a resuming draft-holder already
   answered will fail to prefill.
2. **The 22 orphans are preserved, not dropped.** `WizardPage:513` submits the WHOLE
   `effectiveFormData.questionnaireResponses`, and `registration.controller.ts` spreads `...responses` into
   `raw_data` **unfiltered**. So a resumed draft yields a RICHER record than a fresh registration —
   `marital_status` (203 drafts), `education_level` (200), `disability_status` (200), `household_size`
   (174), `monthly_income` (97), business + portfolio fields all land in `raw_data` even though the shorter
   form no longer asks them. The Public Core reduction cost the registry nothing for these 206 people.
3. **No step-remap hazard.** `current_step` is a positional index, so a draft parked past a removed section
   would resume on a different one — but `.max(5)` capped every draft at or before `grp_identity`, which
   sits at the same position in both forms. The bug that caused the incident also prevented its worst
   symptom.

**Note on design consistency (not a defect):** `questionnaireResponses` is `z.record(z.unknown())` and
flows into `raw_data` unfiltered, while 13-47 deliberately BOUNDED `campaignSource` with `.strict()` to stop
arbitrary keys reaching the same place. That asymmetry is correct, not an oversight: the questionnaire slot
must be form-agnostic because forms change (that is the whole point of the two-form split), whereas
`campaignSource` has a fixed known shape, so bounding it costs nothing. Worth stating so a future reader
does not "fix" the inconsistency by tightening the questionnaire path.

**Re-runnable evidence:** the four-part query is in this story's git history; the shape check is
`gh workflow run prod-verify.yml` §2, and the form comparison is `form:diff`.

## 📌 ATTRIBUTION IS PATH-SPECIFIC — recorded 2026-08-13 so nobody re-investigates it

**Measured on prod during the enumerator smoke, and it cost an hour of doubt before it was
understood. Written here because this story owns the acquisition question, so this is where the next
person tuning it will look.**

| path | `campaign_source` | why |
|---|---|---|
| **public wizard** | populated when answered — `{"utm": {"source":"referral","campaign":"thankyou-referral-auto"}, "channel":"Facebook"}` | the acquisition question is on this form |
| **public wizard, skipped** | NULL | ⚠️ **the question is OPTIONAL by ruling R-B** — a null is a person exercising that choice, not a defect |
| **enumerator / clerk capture** | **always NULL, correctly** | there is no acquisition question on the staff form. **The enumerator IS the channel** — asking "how did you hear about us?" of someone an enumerator walked up to is meaningless |

**Prod figures 2026-08-13: 25 of 291 submissions carry it.** All six enumerator smoke rows returned
NULL and that was briefly reported as gate item 3 failing. **It was correct behaviour.**

➜ **The runbook has been corrected** — `enumerator-prod-smoke-and-golive-gate.md` gate item 3 and
§A query 3 are now bound to `source='public'`, because the unbounded query reads red on a healthy
enumerator run.

### What this means for AC10 + the nudge (ruling R-B)

**The gap AC10 closes is the SKIPPED-public bucket, not the enumerator NULLs** — nothing can or should
be captured on the staff path. So when the nudge ships, measure it on **public rows only**:

```sql
SELECT count(*) FILTER (WHERE s.raw_data->>'campaign_source' IS NOT NULL)::numeric
       / NULLIF(count(*),0) AS answered_rate
FROM submissions s JOIN respondents r ON r.id = s.respondent_id
WHERE r.source = 'public' AND s.submitted_at >= '<AC10 DEPLOY>';
```

⚠️ **Computing that rate over ALL submissions would dilute it with staff captures that were never
asked** — the same defect class as ruling R-E's denominator, on a different metric. **A rate's
denominator is the set of people who were ASKED the question.**

## Senior Developer Review (AI) — 2026-08-22

**Reviewer:** adversarial code review (BMAD `code-review` workflow), on the UNCOMMITTED working tree
of `story/13-46-burst-readiness`. **Outcome: CHANGES REQUESTED.** No code was modified and no status,
ledger, Change Log or Dev Agent Record entry was touched by this pass.

**What I ran (so a reader can separate proof from analysis):**
`cd apps/api && pnpm vitest run` over the six unit files — **58/58 green**; and, against `app_test`,
`registry-verification-sql-parity.integration.test.ts` + `thankyou-autosend-throttle.integration.test.ts`
— **14/14 green**. Plus one throwaway `tsx` probe of the real `classifyEmailSubject` /
`isMarketingCategory` (deleted; nothing left in the tree). Findings below are marked **CONFIRMED BY
RUNNING** or **ANALYSIS**.

### H1 — The 429-wall alert can only fire on a SERVED submit, so the incident AC3 cites would probably not have paged it

`apps/api/src/middleware/registration-burst.ts:121-134` · `apps/api/src/routes/registration.routes.ts:72-78`
**Severity: HIGH. CONFIRMED (single call site proven by grep); scenario is ANALYSIS.**

`evaluateRegistrationBurst()` has exactly one caller — the body of `registrationBurstWatch`, mounted
only on `POST /wizard`. `recordRegistration429()` (`:131-134`) only bumps a counter; it never
evaluates. The draft limiters' refusals (`wizard-draft-rate-limit.ts:124,157`) come from `/draft`,
where the watch is not mounted at all, so a pure draft-limiter wall can never trigger an evaluation
from the route it happens on.

**Failure scenario:** one carrier gateway spends its 50/15min budget; the next 10+ submits 429 inside
one 5-minute window with no other served submit. `blocked429 = 10 >= blocked429PerWindow` — and nothing
reads it. The minute buckets expire at `BUCKET_TTL_SECONDS = 600` (`:33`) and the wall is gone. This is
structural, not a corner case: a limiter's refusals always come *after* the served traffic in a window,
so the last evaluation in any burst runs one step too early. It is also exactly the August shape the
module's own docblock cites (1-8 served submits/day, 27 refusals in one morning).

**Fix (described, not applied):** fire `void evaluateRegistrationBurst()` from `recordRegistration429()`
as well as from the submit path (both halves already swallow their own errors), or add a cheap interval
runner. Add a middleware-level test that pages from a 429-only window.

### H2 — A deliberate cap refusal pages the operator as "Registration auto-emails are FAILING… the loop may be down"

`apps/api/src/services/submission-processing.service.ts:1599-1605` · `apps/api/src/services/email.service.ts:159-167` · `apps/api/src/services/email-autosend-monitor.ts:31,90-95,134-143`
**Severity: HIGH. CONFIRMED BY RUNNING** — this line came out of the integration run above:
`registration_autosend.failure kind=thankyou error="Marketing send cap reached (daily-cap-exceeded: 2000/2000 in the daily window)"`.

The cap returns `{ success: false }`, and the caller treats any falsy success as a 13-21 auto-send
FAILURE. `DEFAULT_THRESHOLD = 5`, so the fifth capped thank-you in a day pages
*"CRITICAL — Registration auto-emails are FAILING… The confirmation + thank-you/referral loop may be
down. Check the Resend dashboard."* Three consequences at once: the operator gets the wrong diagnosis at
the exact moment the right one matters; it routes around `reportCapRefusal`'s deliberate one-page-per-window
cooldown; and 13-21's failure metric is now polluted by refusals that are the system working.

**Fix:** branch on the refusal before `recordAutoSendFailure` — skip it, or pass a distinct `kind`
(`'thankyou_capped'`) with its own copy.

### H3 — A blast-driven registrant loses the thank-you/referral email permanently, not "for N days"

`apps/api/src/services/submission-processing.service.ts:1567-1580` · `apps/api/src/services/email.service.ts:176-186`
**Severity: HIGH (product). ANALYSIS.**

AC2 reads as a throttle; the implementation is a drop. On a hit the function `return`s with no marker
stamped, and nothing re-drives `sendRegistrationAutoEmails` for that respondent — there is no deferred
queue and no catch-up pass. Because `dispatch` writes `campaign_sends` for **every** marketing category,
the gap fires for a *different* campaign's contact. So: the re-engagement blast goes out Monday; a
listener registers Tuesday; their thank-you + referral ask — the growth loop the jingle exists to feed —
is never sent. `_thankyou-referral-blast.ts` cannot recover them inside the same window either, since
`filterMarketingCohort` applies the same 5-day gap. This is the primary launch flow (13-49 adopted 174
through it), and no test or note states the consequence.

**Fix options:** scope the gap read to the auto-send's own category/campaign; or stamp a
`thankyou_referral_deferred_at` marker and run a catch-up after the gap.

### H4 — Counted-but-not-capped: the cap's gate and the cap's counter resolve the category differently

`apps/api/src/services/email.service.ts:158` vs `:171-175` · `apps/api/src/services/notification-meter.service.ts:307-309` · `apps/api/src/services/magic-link.service.ts:377,420`
**Severity: MEDIUM-HIGH (latent today). CONFIRMED BY RUNNING the real classifier.**

`checkCap(category)` uses the **caller-declared** category. `recordEmailSend({subject, category})` falls
back to `classifyEmailSubject(subject)` when the caller declared none — and `sendGenericEmail`'s own
docblock names subject classification as the supported default. Probe output:

`{"subject":"One more step for your Oyo State Skills Registry profile (3 minutes)","category":"supplemental-survey","marketing":true}`

— that is `magic-link.service.ts:420`, sent at `:377` **with no category**. Such a send is never capped
but *does* consume the marketing bucket, so transactional traffic can exhaust the ceiling and refuse real
thank-yous, and the `marketingHeadroom` the AC3 alert publishes is wrong. Currently dormant only because
nothing calls `sendMagicLinkEmail` with that purpose — it is one caller away, and nothing guards it.

**Fix:** resolve once at the top of `dispatch` (`const resolved = category ?? classifyEmailSubject(data.subject)`)
and use `resolved` for `checkCap`, the List-Unsubscribe headers, the ledger write and `recordEmailSend`.
Note this deliberately widens 13-13/13-24 behaviour too — worth stating rather than sliding in.

### M1 — A bulk re-engagement script bypasses the new cap, the unsubscribe header and the AC2 ledger

`apps/api/scripts/_recover-abandoned-wizard-drafts.ts:386,191`
**Severity: MEDIUM. CONFIRMED BY RUNNING** (`'Complete your Oyo Skills Registry registration'` → `other`,
`marketing:false`). It sends with no category to the abandoned-draft cohort (293 live drafts). Result: a
bulk outbound run the cap reports as **0 used**, with no `List-Unsubscribe` header and **no
`campaign_sends` row** — so AC2's per-address gap will not suppress a thank-you to those addresses
afterwards either. Pre-existing, but this is the story whose whole thesis is a ceiling on outbound
marketing volume, and it does not hold for one of the largest sends the project can make.

### M2 — `wizardDraftEmailRateLimit` silently re-imposes a per-IP bucket 4x TIGHTER than the flood-stop it sits behind

`apps/api/src/middleware/wizard-draft-rate-limit.ts:84-92,139-164` · `apps/api/src/routes/registration.routes.ts:58-59`
**Severity: MEDIUM. ANALYSIS.**

When no address is present the key falls back to `ip:` at `WIZARD_DRAFT_EMAIL_MAX = 300`, against
`WIZARD_DRAFT_IP_MAX = 1200` on the limiter mounted immediately before it. `GET /draft` is token-only on
the magic-link resume path (`apps/web/.../wizard.api.ts:99-107` sets `email` only when supplied), so
resume hydration behind one carrier gateway shares a 300/15min bucket — and 300 was derived as a
**per-person** ceiling ("300 sits far above the real band", `:63-65`), never as a per-gateway one. This is
the identical mechanism the story explicitly and correctly refused for the supplemental route
(`registration.routes.ts:93-97`); it rode silently here, on the limiter the story itself calls the one
that "fails FIRST and SILENTLY". Compounding it: the handler logs `dimension: 'email'` (`:155`) even when
the key was the IP fallback, so the one field an operator would use to diagnose it is wrong.

**Fix:** skip the email limiter when the key had to fall back (or give the fallback its own, higher max),
and log the dimension actually used.

### M3 — AC5 publishes four tiers, renders one, and nothing tests the render

`apps/web/src/features/insights/pages/PublicInsightsPage.tsx:100-105` · `packages/types/src/analytics.ts:388-403`
**Severity: MEDIUM. CONFIRMED** (grep: `byVerification` appears in the two web fixtures with no assertion
anywhere; `"NIN on file"` appears only in the component and its comment).

The headline is still a single unqualified `totalRegistered`; the split is a subtitle showing
`nin_on_file` only. `self_declared`, `pending_nin` and `unverified_import` are computed, made **required**
on the shared type, shipped in the payload — and read by no component. That is three-quarters of the 12-5
defect the Completion Notes say this avoided. And because no test asserts the subtitle text, reverting
the one rendered tier leaves the web suite green.

**Fix:** assert the rendered string in `PublicInsightsPage.test.tsx`, and either render the remaining
tiers or say in the type why they are payload-only.

### M4 — An unknown Axis-3 tier is dropped silently, and a unit test blesses the resulting inconsistency

`apps/api/src/services/registry-totals.service.ts:129-138` · `apps/api/src/services/__tests__/registry-totals.service.test.ts` ("IGNORES an unknown tier string")
**Severity: MEDIUM. CONFIRMED by reading both files (tests green).**

`if (tier in byVerification)` discards anything outside the four tiers with no log. The unit test pins
`total_respondents: 3` with the tiers summing to **0** — i.e. it enshrines a published split that does not
add up to its own headline, which the integration test ("the tiers PARTITION the headline") declares
unacceptable. Two tests, two contradictory invariants; in prod the silent one wins and the integration
guard only fires if such a row happens to exist in the test DB.

**Fix:** `logger.error({ event: 'registry.unknown_verification_tier', tier })` on the drop, so a taxonomy
change is loud instead of arithmetic.

### M5 — `reportCapRefusal` burns the 6-hour page slot even when the page was not delivered

`apps/api/src/services/notification-meter.service.ts:449-474` · `apps/api/src/services/alerting/telegram-channel.ts:100-140`
**Severity: MEDIUM. ANALYSIS.**

`winCapAlertCooldown` claims the slot with `SET … NX` *before* the send, and `sendTelegramMessage`'s
boolean return is discarded. That function never throws but returns `false` on a missing token, a non-2xx
from Telegram, or a fetch failure. One transient failure at the moment the cap first binds therefore costs
the operator the page for `NOTIFY_CAP_COOLDOWN_MINUTES` (default 360) while `logger.error` keeps firing per
refused send — the "logged and forgotten" shape the docblock says this exists to prevent. The docstring's
claim "Fail-OPEN: a cooldown read error lets the page through" covers the read, not the send.

**Fix:** set the cooldown key only after a truthy dispatch, or `DEL` it when the dispatch returns false.

### M6 — Two tests AC8 names by hand are missing

`apps/api/src/services/__tests__/thankyou-autosend-throttle.integration.test.ts` · `apps/api/src/services/submission-processing.service.ts:1582-1590`
**Severity: MEDIUM. CONFIRMED by reading the file.**

AC8 asks for "a soft-failed ledger row behaves as specified" and for the RED-verify to be driven through
`runPostSubmissionSideEffects`. Neither exists: the integration test enters one level lower, at
`sendRegistrationAutoEmails`, and **nothing exercises the `catch (gapErr)` fail-open branch**. The
deliberately-chosen failure direction — the one AC2 demanded be decided *and recorded* — is the single
branch with no test. Deleting the whole `try/catch` would not redden the suite.

### M7 — Three changed files are absent from the story's File List

`docs/runbooks/enumerator-prod-smoke-and-golive-gate.md`, `docs/runbooks/pre-launch-operator-runbook.md`
and `_bmad-output/planning-artifacts/epics.md` all carry uncommitted edits and appear nowhere in
**Dev Agent Record → File List** (its Docs section names only three runbooks; Planning names only
`sprint-status.yaml`). The two new story files (13-63 / 13-64) are described in the Change Log but also
absent from the File List. **CONFIRMED** by `git status --short` vs the File List.

### L1 — TOCTOU on both new guards, unstated in the derivations

`checkCap` reads counters that `record()` only increments *after* the provider returns, so N concurrent
marketing sends can all clear the ceiling; the overshoot is bounded by in-flight concurrency, not by the
cap. Symmetrically, the AC2 gap check reads `campaign_sends` before the send while the row is written
after it, so two simultaneous registrations on the same address both send — the exact burst shape the
story is written for. Both are acceptable at these volumes; neither is named as a bound beside the
numbers that are otherwise derived so carefully. **ANALYSIS.**

### L2 — `blocked429` conflates submit refusals with autosave refusals under one threshold and one message

`recordRegistration429()` is called from the submit limiter, the per-email submit limiter and **both**
draft limiters, into a single counter. `lib/registration-burst.ts:141,168-169` then renders it as
*"Registrations are being REFUSED… Registrations that reached the app HAVE been served; the refused ones
were not"* — which may be describing autosaves: a different event, a different remedy, and a natural
per-session volume 20-60x higher than submits, against a threshold of 10 derived from submit refusals
only. **ANALYSIS.**

### L3 — `BTRIM` vs `.trim()`: the parity test passes over exactly this hole

`registry-totals.service.ts:336` uses `BTRIM(nin) <> ''` (ASCII spaces only) against TS
`nin.trim() !== ''` (all Unicode whitespace), and `respondents.nin` is an unconstrained `text` column
(`db/schema/respondents.ts:200`). A tab- or newline-only NIN reads `nin_on_file` in SQL and
`self_declared` in TS. The parity test's `blanknin` seed is `'   '` — spaces, the one whitespace class
where the two agree. The `LIKE 'imported\_%'` escape, by contrast, **is** correct under
`standard_conforming_strings` and matches `startsWith('imported_')` exactly. **ANALYSIS.**
**Fix:** `BTRIM(nin, E' \t\n\r\f\v')` (or a regex), and add a tab seed.

### L4 — The burst evaluation runs on every served submit

`middleware/registration-burst.ts:121-129`: each registration costs a pipeline INCR/EXPIRE, a 15-key
MGET, a 6-key MGET for headroom and (on a finding) a SET NX — on the event loop that also hosts all ten
BullMQ workers. It is all after `next()`, so it cannot delay a response, but the burst pays for its own
measurement precisely when it is largest. Sampling, or moving the evaluation to an interval runner (which
would also fix **H1**), costs nothing in fidelity. **ANALYSIS.**


### Action Items (dev response to the review) — CRITICAL → LOW

**Ordered by severity for reading; WORKED in dependency order** (noted per item), because AC4's
category resolution changes what `checkCap` sees and must land before the refusal-shape fix.
**Every item ships with a test that fails without it** — M6 and L3 are both "the guard has no test",
and fixing them in a way that repeats that class would be self-defeating.

| # | Sev | Finding | Fix | Order |
|---|---|---|---|---|
| ✅ **A1** | CRITICAL | **H1** — the 429-wall alert can only fire on a served submit, so a pure turn-away never pages | Fire `void evaluateRegistrationBurst()` from `recordRegistration429()` too. Test: a 429-ONLY window pages. | 3rd |
| ✅ **A2** | CRITICAL | **H2** — a deliberate cap refusal pages "auto-emails are FAILING… loop may be down" | Branch on the refusal before `recordAutoSendFailure`; distinct `kind`, own copy, no false page | 2nd (needs A4) |
| ✅ **A3** | CRITICAL | **H3** — a blast-suppressed registrant loses the thank-you PERMANENTLY | ⚖️ **RULED: scope the gap to the auto-send's OWN category**, + a counted/logged suppression so a wrong call surfaces. See the ruling note below. | 4th |
| ✅ **A4** | CRITICAL | **H4** — `checkCap` uses the declared category, `recordEmailSend` falls back to the classifier ⇒ counted-but-not-capped | Resolve ONCE at the top of `dispatch`; use it for cap, headers, ledger and meter. State that it widens 13-13/13-24. | **1st** |
| ✅ **A5** | HIGH | **M2** — the draft per-email limiter's IP fallback (300) is 4× TIGHTER than the 1,200 flood-stop before it | Skip the email limiter when the key fell back to IP; log the dimension actually used | 5th |
| ✅ **A6** | HIGH | **M1** — `_recover-abandoned-wizard-drafts.ts` sends to 293 drafts with NO category ⇒ uncapped, unledgered, no unsubscribe header | Give it its explicit marketing category | 6th |
| ✅ **A7** | MEDIUM | **M5** — `reportCapRefusal` burns the 6h page slot even when the page was NOT delivered | Claim the cooldown only after a truthy dispatch | 7th |
| ✅ **A8** | MEDIUM | **M4** — an unknown Axis-3 tier is dropped silently, and a unit test enshrines a non-summing split | Log `registry.unknown_verification_tier` on the drop; correct the test's invariant | 8th |
| ✅ **A9** | MEDIUM | **M6** — two tests AC8 names by hand are missing; the AC2 fail-open `catch` has NO test | Add both, incl. driving `runPostSubmissionSideEffects` | 9th |
| ✅ **A10** | MEDIUM | **M3** — AC5 publishes four tiers, renders one, and nothing tests the render | Assert the rendered string; state why the other tiers are payload-only | 10th |
| ✅ **A11** | LOW | **L3** — `BTRIM` (ASCII) vs `.trim()` (Unicode); the parity seed is `'   '`, the one class where they agree | Explicit whitespace class in SQL + a TAB seed | 11th |
| ✅ **A12** | LOW | **L2** — `blocked429` conflates submit refusals with autosave refusals under one threshold and one message | Split the counters; name the split in the alert | 12th (with A1) |
| ✅ **A13** | LOW | **L4** — the burst evaluation runs on EVERY served submit, on the shared event loop | Bound it with a short evaluation cooldown — fidelity unchanged over a 5-min window | 13th (with A1) |
| ✅ **A14** | LOW | **L1** — TOCTOU on both new guards, unstated beside otherwise-careful derivations | Name the bound in the docblocks; no locking | 14th |
| ✅ **A15** | LOW | **M7** — three changed files and two new story files absent from the File List | Regenerate the File List from `git status` rather than hand-maintaining it | last |

#### ⚖️ Ruling on A3 / H3 — scope the gap, do NOT build defer-and-catch-up (Awwal, 2026-08-22)

Awwal's first instinct was **defer-and-catch-up**, on the principle that we must not hide behind
technical debt to avoid doing the right thing, and explicitly left the call open if the alternative
were more right. It is, and the reason changes the calculus rather than dodging it:

- **The broad gap is over-broad relative to AC2's OWN stated threat.** AC2 exists to stop the mail
  cannon — *one address, N registrations, N thank-yous*. The precise guard for that is "has this
  address already had a THANK-YOU recently", not "has this address had any marketing at all".
- **Scoped that way, the only suppressed send is a DUPLICATE thank-you** to an address that already
  received one. That is not an email anyone wants redelivered late — it is one that should be dropped.
  So the catch-up machinery would exist to eventually deliver mail that should not be sent.
- **The case the broad gap was "protecting" is the one that should NOT be suppressed.** Blast Monday
  ("please finish registering") then register Tuesday ("thanks, you're registered") is a conversation,
  not two campaigns. Suppressing the second is the defect, not the safeguard.
- **Defer-and-catch-up also carries an unbounded-deferral failure mode** — each new marketing contact
  inside the window re-defers — which is new machinery and a new failure surface days before a jingle.

⚠️ **The half of Awwal's instinct that IS carried:** the suppression is now COUNTED and logged with its
own event, so if this ruling is wrong we learn it from a rising counter rather than from a citizen who
never got their referral link. **REOPEN TRIGGER:** a non-trivial suppression count on a day with no
duplicate-registration activity.


#### Outcome of the action-item pass — all 15 applied, 2026-08-22

**Gates after the fixes:** full API suite **4110 passed / 0 test failures**; web suite green;
`tsc --noEmit` clean on both packages; eslint clean; all three drift guards green.

**Three things the fixes themselves surfaced — each worth more than the item that found them:**

1. 🔴 **An EXISTING guard caught my own fix within one run.** Declaring the category on
   `_recover-abandoned-wizard-drafts.ts` (A6) made it a MARKETING sender, and
   `scripts/__tests__/blast-dedupe-inheritance.test.ts` immediately failed: 13-24's invariant is
   that every marketing script routes its cohort through `filterMarketingCohort`. It was right —
   A6 as first written closed the cap/header/ledger hole and left the DEDUPE hole open. The script
   now inherits the shared filter.
   ⚠️ **This changes who that operator script mails** (293 abandoned drafts): suppressed and
   recently-contacted addresses are now skipped. The shrink is printed AND logged with its reasons,
   because a cohort that quietly gets smaller is worse than one that visibly does.
2. 🔴 **My own test harness was passing over a hole.** The burst middleware tests used ONE
   `setImmediate` to "settle" a fire-and-forget chain that awaits five async steps, so every
   NEGATIVE assertion ("does not page on ordinary volume") passed because nothing had run YET — not
   because nothing would. The same defect class the review flagged in L3 and M6, in the tests
   written to guard against it. Now a bounded 25-tick flush with the reason recorded.
3. 🔴 **`mockReset: true` bit twice more.** `email-send-cap`'s Telegram mock resolved `undefined`
   under reset, which (correctly, post-A7) reads as an undelivered page and releases the cooldown —
   so a cooldown test failed for a reason unrelated to cooldowns. Both times the TEST was weaker
   than it looked; neither time was the code wrong. See [[pitfall-vitest-from-repo-root-skips-mockreset]].

**Two behaviour changes made deliberately, stated rather than slid in:**

- **A4 widens 13-13 and 13-24**: an uncategorised send whose SUBJECT classifies as marketing now
  also gets the List-Unsubscribe header and a `campaign_sends` row. That is the correct reading —
  the category is a property of the mail, not of how carefully a caller filled in an argument.
  Knock-on: an unmatched subject now tags `other` instead of going untagged, which is what
  `dispatch`'s own docblock says it wants ("so NO send is untagged", after the 2026-08-04 incident
  where seven citizen emails bounced untraceably).
- **A10 was resolved toward RENDERING, not documenting.** The reviewer offered "render the remaining
  tiers or say why they are payload-only". Given 12-5 is precisely the defect of a required field
  nobody reads, keeping three of four unread with a justification attached would have been the same
  mistake wearing an explanation. All four tiers render; two tests assert the strings, including one
  that no tier is ever labelled "Verified".

### What is genuinely good, recorded so the fixes do not undo it

- The cap sits **before** the provider call (`email.service.ts:158` vs `:168`) and is category-aware; the
  refused *and* allowed directions are both pinned, including a magic link surviving an exhausted cap with
  Redis down. That is the AC1 requirement met on its own terms.
- `registrationBurstWatch` calls `next()` synchronously and is tested for it, including Redis on fire.
- The Step 5 regression block would genuinely fail if interception came back: `save()` asserts
  `onSubmit` was called on the **first** press in all three states, and "pressing twice calls onSubmit
  twice". These are real guards, not passes over a hole.
- The `— Select —` placeholder / explicit-decline split is correct end to end: `campaignSource.channel`
  is a bounded free string server-side (`validation/registration.schema.ts:73-87`), so the decline value
  cannot reject a submit, and `buildCampaignSource` still omits the key for the untouched state.
- The six updated mock stubs assert no less than before; the plain-async-function form is the right fix
  for `mockReset: true`, and each carries the reason it exists.
