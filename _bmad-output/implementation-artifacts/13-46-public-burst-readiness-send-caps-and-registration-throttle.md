# Story 13-46: Public-burst readiness — cap the SEND, not the SIGNUP (radio-jingle traffic controls)

Status: ready-for-dev

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
(`email.service.ts:116-122`) — and discards its return value (`:143`). A cap is therefore a **new
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
   *before* the provider call at `email.service.ts:115` — not after it at `:116`.
   - **Category-aware, per Context §5.** The cap applies to `MARKETING_CATEGORIES`
     (`list-unsubscribe.ts:16-20`) only. Transactional mail (magic link, password reset, activation,
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
5. **AC5 — `/insights` publishes REGISTERED vs VERIFIED, so the public number survives inflation.**
   The public headline must stop being a single unqualified count (today: no verification filter at all,
   summary with no WHERE at `public-insights.service.ts:132`).
   - **Use the taxonomy that already exists.** Axis 3 (VERIFICATION / TRUST) defines
     `verified` / `nin_on_file` / `self_declared` / `pending_nin` / `unverified_import`, and
     honest-display **Rule 5** already binds: *"Verified vs pending are never blended in any 'registry
     size' claim"* (`_bmad-output/planning-artifacts/registry-data-status-taxonomy.md`, Axis 3 +
     Honest-display RULES). This AC is enforcing a contract already written, not minting a new one.
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

- [ ] **Task 1 — Cap the send** (AC: #1, #8)
  - [ ] Add cap constants + a pure `checkCap(category, …)` to `notification-meter.service.ts` beside the
        TTLs (`:60,62`); keep it read-only and side-effect-free so it is unit-testable.
  - [ ] Consult it in `EmailService.dispatch` **before** the provider call (`email.service.ts:115`),
        branching on `isMarketingCategory` exactly as `:133-141` already does. Preserve the fail-open
        contract for everything else and pin it with a test.
  - [ ] Loud refusal: structured result + `notification.cap_exceeded` log + Telegram via
        `isAlertSendEnabled`.
- [ ] **Task 2 — Per-address auto-send throttle** (AC: #2, #8)
  - [ ] Consult the contact ledger in `sendThankYouReferralEmail`
        (`submission-processing.service.ts:1048-1074`) using `MARKETING_CONTACT_GAP_DAYS`
        (`campaign-contact.service.ts:39`). Prefer reusing `filterMarketingCohort`'s gap query over a
        second implementation of the same rule.
  - [ ] Decide and document the fail-soft-ledger direction (AC2's warning).
- [ ] **Task 3 — Global burst breaker that alerts** (AC: #3)
  - [ ] Rolling global counter on registration submits + a per-kind cooldown, modelled on
        `cf-traffic-watch.ts:39-49`; dispatch through the existing Telegram path gated by
        `isAlertSendEnabled`.
  - [ ] Compose the one-message payload (submits / 429s / auto-sends / cap headroom).
- [ ] **Task 4 — Rescope the signup limits** (AC: #4) — ⚠️ **BLOCKED until Tasks 1 + 2 are merged.**
  - [ ] Re-key and re-size `registrationRateLimit` (`registration-rate-limit.ts:25-51`) per AC7's
        derivation; do the same analysis for `wizardDraftRateLimit`
        (`wizard-draft-rate-limit.ts:30-58`).
  - [ ] Correct the stale docblocks + route comments (`registration.routes.ts:22-24,48-50`) and rule on
        the shared supplemental route (`:56-59`).
- [ ] **Task 5 — Registered vs verified on /insights** (AC: #5)
  - [ ] Extend `getRegistryCountCore` (`registry-totals.service.ts`, consumed at
        `public-insights.service.ts:15,98-99`) with the Axis-3 verification split; surface it in
        `computeInsights` + the web insights page. One counting source only.
- [ ] **Task 6 — Operator gate + runbook edits** (AC: #6) — **no new file**
  - [ ] `pre-viral-push-checklist.md` §1 + §3: add the registration-scoped WAF rule and **correct the
        `exclude /api/*` remedy** (`:27`, `:50`); restate Bot Fight Mode = OFF unchanged.
  - [ ] `13-3-cutover-and-failover.md:17-22`: add arming the rule to the one-time pre-jingle setup,
        beside the parked redirect rule.
  - [ ] `roadmap-to-launch.md:115-124`: add it to the pre-flight gate that gates paid spend.
- [ ] **Task 7 — Measure + record** (AC: #7)
  - [ ] BEFORE counts of `registration.rate_limit_exceeded` + `wizard_draft.rate_limit_exceeded` from
        prod logs (record window + command). Publish every derived number with its arithmetic.
  - [ ] AFTER counts from the first jingle window → the turn-away delta.
- [ ] **Task 8 — Attribution liveness dry run** (AC: #9) — ⚠️ **the pre-jingle GATE; independent of
      Tasks 1-7 and dischargeable before any of them.**
  - [ ] One live public registration selecting "Radio" through the pinned public form; assert the
        stored `raw_data->'campaign_source'->>'channel'` **and** that `getCampaignBreakdown()` returns
        the row.
  - [ ] Teardown by id / reference code — **never** by restoring a count. Record the result in
        `13-3-cutover-and-failover.md`'s pre-jingle setup.
- [ ] **Task 9 — Attribution instrument quality** (AC: #10)
  - [ ] Real `— Select —` placeholder default + explicit "Prefer not to say" choice
        (`Step5ReviewAndSave.tsx:239,247`); decide and record how an explicit decline is treated by
        `getCampaignBreakdown` (`report.service.ts:89,93`).
  - [ ] Reorder `ACQUISITION_CHANNELS` (`attribution.ts:15-25`) so Radio is not first.
  - [ ] Web tests for the three states; submit must succeed in all three.
  - [ ] (Only if Awwal takes the SM recommendation) the non-blocking submit nudge, with a test pinning
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
  bare `?ref` as a first-class signal (`attribution.ts:47`), not only `utm_*`. That redirect is a
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
  `src/services/public-insights.service.ts` (AC5).
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

## Change Log

| Date | Change | By |
|------|--------|-----|
| 2026-07-30 | **Station-attribution note completed + one citation corrected.** The per-station UTM bullet had closed on the wrong constraint — *"whether a station will read a URL on air"*. The real blocker is that **a listener cannot type a query string**: `oyoskills.com/?ref=fresh_fm` is unsayable on radio. Added the instrument that dissolves it — a **radio-sayable vanity path per station** (`oyoskills.com/fresh` → 302 → `/?ref=fresh`), which `parseUtm` already consumes because it treats a bare `?ref` as first-class (`attribution.ts:47`). It is a **Cloudflare Redirect Rule — no code, no deploy, no story**. With **11 stations** on the buy (`roadmap-to-launch.md:107`) this is the difference between *"radio worked"* and *which of 11 stations* earned the naira, and it is the only station-level instrument that survives a listener who skips the question. Flagged as decide-BEFORE-the-buy: a URL read on air cannot be retrofitted. Also corrected `MagicLinkLandingPage.tsx:293` to its real path (`features/auth/pages/`, not `features/registration/pages/`) — the bare filename pointed readers at the wrong feature directory. | Claude (code-review/adjudication pass) |
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
