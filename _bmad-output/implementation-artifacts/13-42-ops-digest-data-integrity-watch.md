# Story 13-42: Ops-digest data-integrity watch — sentinel population + self-edit path liveness

Status: ready-for-dev

<!-- Authored 2026-07-23 by Bob (SM), EMERGENT from the 13-34 adjudication trace. Two one-off July manual prod checks — (a) the non-UUID `questionnaire_form_id` sentinel population that the 22P02 class casts over, and (b) whether the authenticated dashboard-edit path (`self-edit` writer) is actually landing rows — should become STANDING signals in the existing twice-daily ops digest (9-19/9-63) instead of "we looked once in July". POST-LAUNCH, NON-GATING, observability-only. The design point that makes it worth building rather than a dead counter: each metric is shaped so it can ONLY fire on the real defect, not on the benign pre-blast "no traffic yet" state. Sibling of 13-41 (the READ-side canary/linter) — this is the WRITE-side + adoption watch. Scoped tight: NO fix work (the 9-40 consent-submission asymmetry surfaced by the same trace is noted as a related observation, NOT in scope). -->

## Story
As **the operator who owns the launch blast**,
I want **the ops digest to surface the sentinel `questionnaire_form_id` population and the self-edit path's liveness with signals that only fire on the real failure shape**,
so that **the 22P02 exposure and the dashboard-edit write-path become self-monitoring during the blast, instead of a July spot-check whose evidence rots as PM2 logs rotate.**

## Context & Evidence (verified 2026-07-23, prod `oslsr_db`, via Tailscale)
- **The exposure is a function of one climbing number.** The 22P02 class (13-34/13-41) casts `submissions.questionnaire_form_id` (TEXT) that product code fills with non-UUID sentinels. Today prod carries **2** such rows, both `no-form-pinned-at-submit`; **0** `supplemental-survey`/`self-edit` — against **81** submissions / 144 respondents. But the LIVE writers grow with the blast: every Cohort-A supplemental completion writes `supplemental-survey`, every dashboard edit writes `self-edit`. The whole risk is "how big is this set, and did a NEW un-guarded value join it?" — a perfect standing metric.
- **A bare `self-edit` count is ambiguous — that ambiguity cost real time today.** `self-edit` = 0 rows despite **80/144** respondents being account-linked (eligible editors) and the path being wired end-to-end (`PublicUserHome` edit link → `/registration/manage` → `WizardPage` edit → `PUT /me/registration/wizard` → `me.service.updateRegistrationFromWizard` writes `self-edit` inside the respondent-update txn). The disambiguator was a SECOND number: the wizard-edit endpoint has been invoked **0** times (no `registration_edit`/`registration/wizard` in any PM2 log). Zero-invocation + zero-rows = healthy "no traffic yet"; **nonzero-invocation + zero-rows would be the bug** ([[pattern-ship-a-fix-that-never-fires]]). The watch must encode that pairing, or it recreates the same ambiguity twice a day.
- **The mechanism already exists.** `ops-digest.worker.ts` (`runOpsDigest` → `OperationsService.getDashboardSnapshot({force:true})` → `formatDigest`) runs twice daily (07:00/19:00 WAT), sends silently on a healthy snapshot and buzzes only on a red/yellow recommendation. Adding a `dataIntegrity` section to the snapshot + one digest line + a conditional recommendation is the whole build — no new worker, cron, or channel.
- **Complements, does not duplicate, 13-41.** 13-41 AC9's canary proves the READ tolerates a sentinel; this watches the WRITE side (what sentinels actually exist, and whether a new one appears). Together they close the class from both ends.

## Acceptance Criteria
1. **AC1 — `dataIntegrity` snapshot section (pure-read, fail-open).** Extend `OperationsService.getDashboardSnapshot` with a `dataIntegrity` block gathered by cheap COUNT queries: (a) total non-UUID `questionnaire_form_id` submissions + a per-value breakdown; (b) the `self-edit` submission row count; (c) the count of the `RESPONDENT_SELF_EDITED` audit action (`me.service.ts:553`, written once per successful in-session edit) as the durable lockstep companion to (b). The block MUST fail-open (any query error → section `null`, never throws into the tick — parity with the existing sections).
2. **AC2 — Sentinel signal fires on a NEW value, not on volume.** The digest renders the sentinel population with its known-value breakdown. A recommendation (yellow) is emitted ONLY when a `questionnaire_form_id` value appears that is NOT in the known-safe set (`supplemental-survey`, `self-edit`, `no-form-pinned-at-submit`) — i.e. an unguarded-cast candidate — OR the total crosses an explicit sanity ceiling (documented, generous — the blast is expected to grow `supplemental-survey`). Volume growth within the known set is NOT an alert.
3. **AC3 — self-edit signal is self-interpreting (only the bug shape fires).** The digest shows both the `self-edit` submission count AND the `RESPONDENT_SELF_EDITED` audit count. A recommendation (yellow) is emitted ONLY when the two DIVERGE (audit count ≠ submission count over the same window) — because they are written in ONE transaction today, divergence means a future change decoupled them and lost the submission write ([[pattern-ship-a-fix-that-never-fires]]). Both-zero (no traffic) and equal-nonzero (healthy) are silent. The one-line rationale is in the code so nobody "simplifies" it to a bare `self-edit == 0` alert (which would have fired today, on a healthy system with no editors yet).
4. **AC4 — Silent-when-healthy preserved.** A snapshot with no new sentinel value and no lost-write signal adds NO recommendation, so the digest stays silent (`disable_notification`) exactly as today. The section renders its counts inline (🟢) regardless, for at-a-glance context.
5. **AC5 — MarkdownV2-safe + trim-safe.** The new line(s) go through `escapeMarkdownV2` for all dynamic content and compose from already-escaped pieces (parity with the existing sections), and survive the whole-line trim path without leaving an unbalanced `*bold*`/escape.
6. **AC6 — Tests.** Unit tests over the pure formatter + the recommendation logic: new-sentinel-value → yellow; known-set volume growth → silent; invocation>0 ∧ rows==0 → yellow; both-zero → silent; both-nonzero → silent; section-unavailable (null) → placeholder, no throw. Follows the `ops-digest.worker.test.ts` convention (pure `formatDigest`/helpers, no Redis).

### AC7 — ✅ HOTFIXED 2026-08-05 (out of band, before this story) — THE EMAIL RED WAS A PAGE SIZE, NOT A QUOTA

**The digest fired a red on 2026-08-05 18:00 UTC that cannot mean what it says:**

```
🔴 Email: 100+/100 today, 93 delivered, 2 bounced
🔴 Resend usage at 100/100 today — UPGRADE Resend to Pro tier now;
   magic-link emails will silently fail when the limit hits.
```

**One constant is doing two unrelated jobs.** `RESEND_FREE_TIER_DAILY` is used as the API **page
size** (`operations.service.ts:208` — `resend.emails.list({ limit: RESEND_FREE_TIER_DAILY })`) *and*
as the **quota denominator** (`ops-digest.worker.ts:135` — `todayCount / RESEND_FREE_TIER_DAILY`).
`todayCount` is filtered out of that single page, so **it can never exceed 100 by construction.**

Consequences, in order of how much they matter:

1. **The metric is pinned at its own alarm threshold.** Any day we send ≥100 emails, the page fills,
   `todayCount` saturates, and the digest reads `100+/100` — **identically whether we sent 101 or
   10,000.** It has no headroom left to warn with. It will now fire every busy day, and the first
   thing a daily red teaches an operator is to stop reading it.
2. **`delivered`/`bounced` are undercounts from the same partial page.** The digest said *93
   delivered*; our own Resend-webhook table says **127 delivered, 134 sent, 2 bounced** for the same
   day. The digest under-reported delivery by 34.
3. **The recommendation is asserted, not measured.** *"magic-link emails will silently fail"* did
   not happen — 134 sends went out and 127 delivered. Nothing failed. The text states a consequence
   the code never checked for.

**Fix:**
1. **Split the constant.** `RESEND_LIST_PAGE_SIZE` (an API mechanic) and `RESEND_DAILY_QUOTA` (a
   billing fact) are not the same number and must never again be the same symbol.
2. **Paginate, or stop claiming a total.** Either follow the cursor until the day is fully counted,
   or drop the `x/y` framing and render the honest thing: *"≥100 sent today (page limit reached)"*.
   ⚠️ `truncated` ALREADY EXISTS and is already rendered as the `+` in `100+`. The information was
   present and the alarm was computed as though it were not — a red built on a number the same
   function had already flagged as a lower bound.
3. **Source the day's count from `email_events` instead.** We ingest Resend webhooks into our own
   table; it gave the true 134/127/2 in one query, with no page limit and no API call.
4. ⚠️ **Confirm the actual plan before wiring any quota number.**

---

#### ✅ WHAT SHIPPED (hotfix, 2026-08-05 — do not redo)

**Awwal confirmed the plan: Resend Pro, $20/mo, 50,000/month.** So the alarm had been firing at
**0.2% of actual capacity**, and its remediation text told the operator to *"UPGRADE Resend to Pro
tier ($20/mo, 50k/mo)"* — **the plan we already pay for.** (History: the free tier's 100/day was
exhausted once by prod keys leaking into local dev. That is the incident Story 9-63 AC0's credential
isolation exists to prevent, and it is why the constant was named `FREE_TIER` in the first place —
the name outlived the fact.)

- **Constant split** — `RESEND_LIST_PAGE_SIZE` (API mechanic) and `RESEND_MONTHLY_QUOTA = 50_000`
  (billing fact), plus `RESEND_DAILY_SUSTAINABLE` (~1,666/day) as a yardstick. The docstring records
  why they must never share a symbol again.
- **The alarm reads the METER, not the page.** `notificationUsage.thisMonth.email.total` —
  uncapped, and described in its own docstring as *"the source of truth — every send flows through
  the meter chokepoint."* **It was already in the same snapshot, and already printed two lines below
  the wrong number in every digest.** The right value was on screen the whole time.
- **Monthly quota (70/90%) is the alarm; daily is a RATE anomaly** at 1×/3× the sustainable rate —
  because Pro has no daily cap, so the only sensible daily question is *"would today's pace exhaust
  the month?"*
- All four surfaces updated together: digest worker, `dashboard.ts` CLI, the web Operations
  dashboard, and `buildRecommendations`. Delivery figures still come from Resend and are now
  explicitly labelled a lower bound when the page is truncated.

**Test note.** The replaced test (`todayCount: 85 → red`) had been **green for months while
encoding the defect** — a clean instance of [[pattern-test-that-passes-over-a-hole]]. The new
regression test asserts a saturated truncated page with tiny real usage produces **no** alarm, and
was **RED-verified**: wiring the alarm back to `resend.todayCount` fails it.

#### 🔴 THE SAME ROOT CAUSE WAS ALREADY CAUSING A LIVE OUTAGE (found 2026-08-05, fixed same day)

Chasing "why is the blast guard still 100?" found the fourth copy — and the fourth copy was
**enforcing**, not reporting:

```
email.budget.daily_limit_reached  tier:"free"  dailyCount:140  dailyLimit:100
email.digest.flush_skipped        reason:"budget_exhausted"
```

**`EMAIL_TIER` was never set on prod.** `EmailBudgetService` read
`process.env.EMAIL_TIER || 'free'` and enforced the free tier's 100/day against an account on Pro.
The email digest flush had already been skipped twice, and the next worker job would have called
`pauseEmailQueue()` — which latches and needs manual clearing. **Staff invitations run through that
queue, so creating an enumerator account would have silently failed.**

Fixed: `EMAIL_TIER=pro` set on prod + restart (verified `.env` clean, dotenv resolves `"pro"`,
health 200, 10 workers up, no pause flag).

**The default direction is the durable lesson.** `resolveEmailTier()` now defaults to **`pro`**, not
`free`: an unset variable must not silently become the most restrictive setting, because
**under-sending is invisible and over-sending is caught by the provider's own quota.** RED-verified —
reverting the default to `'free'` fails two tests.

#### 🌐 BROWSER-SAFETY NOTE (the pre-push build caught this, nothing else did)

`@oslsr/types` is bundled into the web app, and `ops-thresholds.ts` derives its quota constants at
**module load**. A `process.env` default parameter in `resolveEmailTier()` therefore ran *in the
browser, at import time*, and would have crashed the Operations dashboard. `tsc -p apps/api` passed,
vitest passed, `tsc -p apps/web` passed — **only the pre-push vite BUILD failed** (TS2591). That
step's comment says it exists to "catch vite/browser-bundle errors tsc+vitest miss"; it did exactly
that. Note the second lesson: `typeof process !== 'undefined'` is NOT enough — the bare identifier
still trips TS2591 without `@types/node`. Reach through `globalThis`.

⚠️ **Follow-up (small, real):** in a browser there is no `EMAIL_TIER`, so the web card shows the
DEFAULT plan's ceiling rather than the configured one. Correct today (we are on the default), wrong
the day the plan changes. **The authoritative tier should travel in the ops snapshot** rather than
be re-derived client-side.

#### ⚠️ STILL OPEN FOR THIS STORY

- ~~The blast scripts keep their own `RESEND_FREE_TIER_DAILY_LIMIT = 100`.~~ ✅ **DONE 2026-08-05** —
  all four now derive from the active tier. The gate was also split into the two different jobs it
  had been conflating: a **HARD limit** (only real on `free`, where 100/day REFUSES mail) and a
  **CONFIRM line** ("you are about to email this many real people"), which is about blast size, not
  billing, and stays useful on every tier.
- **Nothing warns as the monthly quota is approached across a month.** The new alarm fires at 70%,
  which on a 50,000 plan is 35,000 emails — fine, but untested against real blast volume.
- **AC8 below (the deliverability line) was NOT hotfixed** and is full story scope.

### AC8 — The deliverability red misdirects (ADDED 2026-08-05, adjudication)

Same digest: *"🔴 Resend deliverability — 2 bounced. Inspect at resend.com/logs and check DNS
DKIM/SPF."*

**DKIM/SPF were fine — 127 messages delivered that same day.** A signing/DNS fault does not deliver
127 and bounce 2. The recommendation is boilerplate attached to a bounce counter, and it points the
operator at infrastructure when **every bounce on file is a recipient-side address problem**:

| suppressed address | what it actually is |
|---|---|
| `asirusakirat@gmail.come` | typo — `.come` |
| `fatomidejumoke@mail.com` | likely meant `gmail.com` |
| `wahab akeem olaide <aqeemakolade@gmail.com>` | **a display-name string used as the address** |
| `julietiyabodeodiba@gmail.com`, `jambestojeke@gmail.com`, `ola4ct@outlook.com` | plausibly dead |

**The bounce alert should say which addresses, and whether they are malformed or merely dead** —
those need opposite responses. A malformed one is our bug; a dead one is the person's.

**And it should say who we have just gone silent on.** Every bounce writes an `email_suppressions`
row, so the register loses a contact channel permanently and no digest line mentions it. Three
suppressed people are **in the register with working phone numbers** — `OSL-2026-DQNPTQ`,
`OSL-2026-TYZ3AH`, `OSL-2026-51CNVZ` — and three more are D4 invitees whose invitation never
arrived. **A suppression is a person we can no longer reach; it deserves a digest line of its own,
naming them, so they can be moved to the SMS list.**

⚠️ **One-off worth not generalising from:** the malformed row is the ONLY one — `wizard_drafts`,
`submissions` and `campaign_sends` all hold **0** name-wrapped addresses, so this is not systemic
capture corruption. Note also that suppression keyed on the *malformed* string, so the clean address
`aqeemakolade@gmail.com` was never suppressed and that person (`OSL-2026-WKM3FC`, active) is still
reachable. **A suppression list keyed on an unnormalised address both over- and under-blocks.**

### AC9 — NOBODY IS READING THE API'S OWN ERROR STREAM (ADDED 2026-08-07, adjudication)

**This story watches metrics. It does not watch the process's own stderr — and that is where the
last security defect sat, in plain text, for four days.**

On 2026-08-07, while adding swap to the VPS, a routine "did the services survive?" check found nine
copies of this in `/root/.pm2/logs/oslsr-api-error.log`:

```
ValidationError: Custom keyGenerator appears to use request IP without calling the
ipKeyGenerator helper function for IPv6 addresses. This could allow IPv6 users to bypass limits.
    at .../middleware/registration-rate-limit.ts   code: 'ERR_ERL_KEY_GEN_IPV6'
```

It was real: the per-email registration limiter keyed its IP fallback on the raw address, so an IPv6
client could rotate its own low bits for unlimited buckets — **a bypass of a public-endpoint control
we had added four days earlier for a citizen who could not finish registering.** Fixed in `077e129`.

**Everything that was supposed to catch it did not.** Not the adversarial code review. Not tsc, not
eslint, not 3603 tests. Not the ops digest. The process printed it **on every single boot**, into a
file with no reader, and it surfaced only because an unrelated ops task made someone open the log.

⚠️ **The finding was luck, and luck is not a control.** That is the whole reason for this AC.

#### AC9.1 — Capture at the SOURCE, not from a pm2 file path

1. Install a recorder at process start that captures **`console.error`/`console.warn` and
   `process.on('warning')`** into a de-duplicated in-memory set, and persist it where the digest can
   read it. The defect above was a **dependency calling `console.error`** — pino never saw it, so a
   logger-only watch would have missed it entirely.
2. ⚠️ **The interceptor MUST forward to the original.** A wrapper that captures and forgets to
   re-emit turns "nobody reads the log" into "there is no log" — strictly worse than today.
3. ⚠️ **Install it before anything else imports.** The rate-limit error fired during module import
   of the middleware; a recorder installed after route wiring would not have seen it. Anything that
   can kill the process before the recorder is up remains out of reach — say so in the code rather
   than implying full coverage.
4. Reading pm2's log file is the fallback, not the design: it hardcodes a path, breaks outside pm2,
   and cannot distinguish the current boot from every boot before it.

#### AC9.2 — Fire on a NEW SIGNATURE, never on volume (the AC2 rule, applied to errors)

1. **Nine copies of one error is ONE signal, not nine.** Collapse to a stable signature: the error
   `code` when present (`ERR_ERL_KEY_GEN_IPV6`), else the message's first line with volatile parts
   (numbers, paths, UUIDs, timestamps) stripped.
2. Yellow **only** when a signature appears that is not in a known-acknowledged set. Repeat
   occurrences of a known signature are silent.
3. **The acknowledged set is an explicit allowlist with a REASON per entry** — same rule as 13-54
   AC1.3. *An entry without a reason is a hole with a comment.*
4. ⚠️ **AN UNSTABLE SIGNATURE IS WORSE THAN NO WATCH.** If normalisation leaves a timestamp or a pid
   in the key, every boot mints a "new" signature, the digest yellows daily, and the operator learns
   to ignore it — the alarm-fatigue death this story's Dev Notes already name as the thing to avoid.
   **Test the normaliser against two real boots of the same error and assert ONE key.**

#### AC9.3 — Startup errors are the high-value window

1. Report separately on errors captured between process start and `server_start`. A boot-time error
   is deterministic, reproducible, and repeats forever — exactly the shape that rots unread.
2. Silent-when-healthy is preserved (AC4): no new signature → no recommendation.

#### AC9.4 — RED-verify against the real incident

1. **We have a genuine historical trigger, so use it instead of a synthetic one:** restore the raw
   `req.ip` fallback in `registration-rate-limit.ts`, boot, and assert the digest yellows with the
   `ERR_ERL_KEY_GEN_IPV6` signature. Restore by hand.
2. **A watch that has never been observed firing is a watch nobody knows works** — and this story
   already carries one test (AC7's) that was *green for months while encoding the defect*.

#### Note on scope

This is bundled here rather than raised standalone because it is the same sentence as the rest of
13-42: **turn a thing we happened to look at once into a standing signal that cannot cry wolf.** The
difference is the input — the API's own error stream instead of a COUNT query.

## Tasks / Subtasks
- [ ] **Task 1 — snapshot section** (AC1) — `OperationsService`: add the `dataIntegrity` gather (2–3 COUNT queries), typed in `@oslsr/types` alongside the other snapshot section types; fail-open wrapper.
- [ ] **Task 2 — formatter + recommendation** (AC2, AC3, AC4, AC5) — `formatDataIntegrityLines()` (pure, exported for test) + the conditional recommendation push in `runOpsDigest`/the recommendation builder; MarkdownV2-escaped; document the known-safe sentinel set as a shared constant (reuse 13-41's if it lands first).
- [ ] **Task 3 — tests** (AC6) — extend `ops-digest.worker.test.ts` with the AC6 cases.
- [ ] **Task 5 — error-stream watch** (AC9) — startup-ordered `console.error`/`console.warn`/`process.on('warning')` recorder that FORWARDS to the original; stable signature normaliser (test two real boots of one error → one key); reasoned allowlist; digest line + new-signature-only recommendation; RED-verify by restoring the raw `req.ip` fallback and observing the yellow.
- [ ] **Task 4 — validate** — API suite + tsc + eslint; a manual `runOpsDigest()` dry-run against a seeded snapshot proving the silent/buzz branches.

## Dev Notes
### Why the pairing is the whole point
A counter that fires on volume would scream all through the blast (by design `supplemental-survey` climbs) and get muted — the classic alarm-fatigue death of a watch. A counter that fires on a bare `self-edit == 0` would have fired today, on a perfectly healthy system with no editors yet. Both are the failure mode this story exists to avoid. The signals are deliberately shaped to fire on the DELTA that means a defect (a new sentinel value; writes lost despite invocation), not on the level. (Awwal, 2026-07-23: turn "we sized it once in July" into a standing signal that can't cry wolf.)

### Source of the invocation signal (AC1c) — VERIFIED
`updateRegistrationFromWizard` writes `AUDIT_ACTIONS.RESPONDENT_SELF_EDITED` (`me.service.ts:553`, `logActionTx`) in the SAME transaction as the `self-edit` submission insert (`:517-519`). So the two counts are equal BY CONSTRUCTION today — which is exactly why they make a good tripwire: the watch's job is to catch a FUTURE change that decouples them (the audit fires but the row doesn't land, or vice-versa), i.e. a silent write regression. Query the audit count from the DB — durable, unlike the PM2 log grep the 13-34 trace had to use (logs rotate; that rot is the very thing this story fixes). Do NOT use `respondents.updated_at` as a proxy — the trace showed 140/144 rows carry `updated_at > created_at` from unrelated paths (backfills, NIN-capture, admin, the 9-40 consent toggle), so it cannot isolate wizard edits. (Note: because the audit is written AFTER validation inside the txn, rejected edits — NIN dup, incomplete — write neither, so this signal never false-alarms on legitimate rejections.)

### Related observation — OUT OF SCOPE (documented so it isn't lost)
The same trace found the 9-40 path (`PUT /me/registration` → `updateMarketplaceConsent`) mutates respondent state (marketplace consent) WITHOUT writing a submission — a minor asymmetry against the "every respondent state-change has a submission" contract ([[feedback_unified_ingestion_pipeline]]). Low-stakes (a consent flag, not survey data) and pre-existing; recorded here as a known exception + a backlog candidate, explicitly NOT fixed in this observability story.

### Dependencies / sequencing
- No schema, no new prod deps, no new worker. Extends 9-19/9-63's existing digest.
- Best sequenced AFTER 13-41 so the known-safe sentinel set is defined once and shared (soft dep — can inline the constant if 13-41 hasn't landed). POST-LAUNCH; does NOT gate the blast (it watches the blast).

### References
- [Source: apps/api/src/workers/ops-digest.worker.ts — `formatDigest`/`runOpsDigest`, silent-when-healthy discipline, MarkdownV2 escaping + trim]
- [Source: apps/api/src/services/me.service.ts:497-519 — the `self-edit` writer (respondent update + submission insert, one txn)]
- [Source: 13-34 adjudication trace 2026-07-23 — prod numbers (2 sentinels, 0 self-edit, 0 invocations, 80/144 linked, 81 submissions) + the wired end-to-end edit path]
- [Source: 13-41 — the READ-side canary/linter this watch complements on the WRITE side]

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-08-07 | **AC9 added at adjudication** — the digest watches metrics but not the API's own stderr, and that is where an IPv6 rate-limiter bypass (`ERR_ERL_KEY_GEN_IPV6`) sat unread for four days, printed on every boot, missed by review + tsc + eslint + 3603 tests. Found only as a side effect of adding swap to the VPS. Specced to the story's existing discipline: capture at the source (a dependency's `console.error`, which pino never sees), collapse to a STABLE signature, fire only on a NEW one, reasoned allowlist, and RED-verify against the real historical trigger. Bundled here rather than raised standalone because it is the same sentence as the rest of 13-42. | Adjudication |
| 2026-07-23 | Story drafted, EMERGENT from the 13-34 adjudication trace. Turns two one-off July prod checks (sentinel population for the 22P02 class + self-edit path liveness) into standing ops-digest signals, each shaped to fire ONLY on the real defect delta (a NEW sentinel value; writes lost despite invocation) rather than on blast-expected volume or benign no-traffic. POST-LAUNCH, non-gating, observability-only; sibling of 13-41 (read-side). 6 ACs / 4 Tasks. Related 9-40 consent-submission asymmetry noted out-of-scope. | Bob (SM) |
