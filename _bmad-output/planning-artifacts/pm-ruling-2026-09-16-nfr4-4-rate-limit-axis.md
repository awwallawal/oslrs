# PM Ruling — NFR4.4 Rate-Limit Identity Axis

**Date:** 2026-09-16 (harmonised, supersedes all earlier drafts of this file)
**Author:** John (PM), BMAD `correct-course` adjudication
**Requested by:** Awwal — "we instituted this during the PRD creation, thus we need the PM agent's concurrence to make the fundamental change in the PRD."
**Responds to:** `sprint-change-proposal-2026-09-16-rate-limit-identity-axis.md`
**Scope:** **Lane C only.** Lane A (login re-key, Story 13-68) is in flight; I rule on its *security reasoning* because SCP §5.2 asks me to, and I do not redesign its scope.

> ### ⚠️ Status — read this before acting on anything below
>
> This document was written in two passes and has been **harmonised into a single current position**. Earlier drafts argued options that are now **withdrawn**. Nothing superseded survives as a live recommendation; where an abandoned option is discussed it is labelled **WITHDRAWN** and explains *why*, because the reasoning is load-bearing for the record.
>
> **Withdrawn — do not act on these:**
> - ~~`strictLoginRateLimit` at 200/IP/hour, conditional on a companion fix~~ → **moot.** 60/hour failed-only is better on every dimension and is what ships.
> - ~~The distinct-identifier cardinality monitor as the blocking precondition~~ → **replaced** by lockout-counter decay, which is cheaper, deterministic, and removes the risk instead of observing it.
> - ~~A flat Tier 1 floor of ≥100 per window applied to every flood budget~~ → **amended** by the response-mode clause (§2.2). Without it the rule condemns the 60 I approve.
>
> **The operative deliverables are Part 6 (final NFR4.4 text), Part 7 (threshold table) and Part 8 (application handoff).** Parts 1–5 are the reasoning and the audit trail.

**Verdict in one line:** ✅ **Concur with the two-axis model.** ⚠️ **The flat ≥100 floor is replaced** by exposure tiers plus a response-mode clause. ✅ **Login: 5 failed/email/15min + 100/IP/15min all-response + 60/IP/hour FAILED-ONLY**, with lockout decay blocking. ❌ **Marketplace search stays at 30/IP/min — now on measured data, not inference.**

---

## Part 1 — My independent read of the evidence, before I opened the SCP

I read NFR4.4 as it stood, ran the limiter audit myself, and read `login-rate-limit.ts`, `auth.service.ts`, `registration.routes.ts`, `password-reset-rate-limit.ts`, `magic-link-rate-limit.ts` and `rate-limit-coverage.test.ts` before reading a word of the proposal. Six findings, in the order I hit them. Five stand; one has since been repaired by others; one I have **downgraded** on measurement.

### 1.1 NFR4.4 misdescribed one of its own four login layers — ✅ confirmed, since fixed

The PRD said: *"**Cumulative block:** temporary 30-minute block on **the IP** after 10 cumulative failed attempts (handled in `AuthService`)."*

There is no IP block in `AuthService`. `LOCKOUT_DURATION_MS` is written in exactly two places — `auth.service.ts:535` and `:742` — and both write `users.lockedUntil` keyed `where(eq(users.id, user.id))`. It is a **per-user** lock.

The PRD's "stratified defence with four layers" was three IP layers and one user layer, with the user layer mislabelled as the fourth IP layer — hiding the fact that the strongest control in the login stack is per-account. **The SCP repeated the error**, filing "cumulative block" under axis = IP in its §1 table.

**Now corrected in the tree by 13-68**, independently and in the same words. Two agents reaching it separately is the strongest evidence it was real. My replacement text therefore does **not** restate the correction — see Part 8.

### 1.2 The per-account lockout counter never decays — ✅ stands, and is the hinge of the login ruling

`failedLoginAttempts` is reset in exactly three places: `auth.service.ts:589` (password correct, MFA branch), `:1057`, and `password-reset.service.ts:293`. **Nothing resets it when `lockedUntil` expires.**

Once an account has ever reached 10 failures, *one* further failure re-locks it for 30 minutes (`10 + 1 >= EXTENDED_LOCKOUT_THRESHOLD`), indefinitely. Holding an account locked forever costs an attacker **two requests per hour**. Recovery needs the real user to either succeed at login or complete a password reset.

Excellent anti-brute-force; also an **account-lockout denial of service with no decay**. This is what the login ruling turns on (Part 3).

Note `MAX_FAILED_ATTEMPTS = 5` does nothing but emit an `approaching_lockout` warning. "5 → warn, 10 → 30 min lock" is accurate, but 5 is not a control and a threshold table that lists it as one overstates the defence.

### 1.3 The audit script undercounted per-IP limiters — ✅ stands, since fixed; and the fix is itself instructive

The script reported `32 limiters; 19 per-IP`. It classified by **syntax** — "does this limiter declare a `keyGenerator`?" — not by **semantics** — "what does that `keyGenerator` return?"

`registrationStatusRateLimit` declares `keyGenerator: (req, _res) => (req.ip ? ipKeyGenerator(req.ip) : 'unknown')` — 100% per-IP, filed as "custom key". It is **10 per IP per 15 minutes on a public, unauthenticated route**, squarely the defect class, invisible to the tool built to find the defect class, and absent from the SCP's table.

**Current, post-fix figure: `33 limiters; 20 bucket on IP (1 of them via a hand-rolled keyGenerator)`** — 33 rather than 32 because 13-68 added `loginIpFloodLimit`.

⭐ **The repair is worth recording, because it demonstrates the thesis on the enforcement tool itself.** Per the adjudication agent, two wrong answers preceded the right one: a version classifying on the `keyGenerator`'s call site reported **23** (three false positives — `keyGenerator: keyByUser` resolves to a person key), and the repair used `new RegExp` inside a template literal, where `\s` degrades to `s` and `\b` to a backspace character, so it matched nothing and preserved the wrong total. **Both emitted confident green output.** A census that cannot be wrong loudly is the same failure mode as a limiter that refuses silently. This belongs in the governance clause, and it is in NFR4.4.d.7.

Seven further "custom key" limiters resolve to `user?.sub ?? ipKeyGenerator(req.ip)`. On authenticated routes the fallback should never fire. On any path where auth has not run they are per-IP limiters wearing a person-axis label — and only `audit-log-rate-limit.ts:44-48` logs when it falls back. `ninCheckRateLimit` (20/min) sits on public `POST /forms/check-nin`, so it is per-IP in practice.

### 1.4 Magic-link is the largest *latent* exposure — ⚠️ **downgraded on measurement: a scaling risk, not a live incident**

`magicLinkRateLimit` is **3 per hour**, keyed on `req.body.email` with an IP fallback, sharing one Redis prefix `rl:magic-link:` across **eight** mounted routes. Seven carry no `email` and therefore always take the IP branch: `/auth/magic/consume` · `/auth/magic/login` · `/auth/google/verify` · `/auth/public/sms-otp/request` · `/auth/public/sms-otp/verify` · `/registration/complete-nin` · `/registration/defer-reminder`.

FR27 makes email magic-link **the primary authentication channel** for the public. So the primary public auth path is limited to three attempts per hour, per proxy, pooled across seven endpoints.

**Measured over the 14-day pm2 window (2026-09-03 → 09-16):**

| signal | count | reading |
|---|---|---|
| `magic_link.rate_limit_exceeded` | **3** | **all three on the EMAIL branch**, one enumerator, using her real address instead of her `+test` one |
| same, **IP branch** (`/magic/consume`, `/magic/login`) | **0** | the branch I flagged has **never refused anyone** |
| magic links issued / redeemed | 80 / 30 ≈ **2/day** | the load that would expose it has not happened |

**I am restating this finding at the strength the data supports, which is lower than my first draft.** The three refusals are **§0.1a again — a fourth affected enumerator**, not the shared-IP defect. The IP-branch exposure is **real but latent**: 6 proxy addresses × 3/hour = 18 redemptions/hour for the whole state, against 13-65 route (c)'s projected 209/day ≈ 9/hour. Under 2× headroom **at a load never yet seen**.

So: **not a live incident the way login is, and it does not belong in the same urgency class.** It is `[[pattern-verification-that-cannot-run-yet]]` — the correct response is a dated fix before the traffic arrives, not an emergency. Priority **P2, ahead of any marketing or radio push**, not P1.

In fairness it was a documented decision (`magic-link-rate-limit.ts:39-48`, Story 9-16 review M1): *"a single-use token with 32 bytes of entropy is the primary brute-force control; the IP cap is a **secondary throttle**."* The reasoning is sound and the number contradicts it — a secondary throttle set at 3/hour is a primary control by accident. But that is an argument for fixing it on a schedule, which is what I now recommend.

### 1.5 The coverage test's contract table had drifted — ✅ **both findings were correct; one has since been repaired**

The reviewer-facing threshold table in `rate-limit-coverage.test.ts` is the stated contract with NFR4.4. I reported two false rows. The adjudication agent has since read the file and believes I misread the first. I checked, and the record should be precise:

| | at `HEAD` (what I read) | in the working tree now |
|---|---|---|
| `registrationRateLimit` | `\| 5/IP/15min \| sensible default \|` | `\| 50/IP/15min \| FLOOD CEILING (2026-08-07, was 5) \|` |

**The finding was correct when made.** At `HEAD` the row records **5**, against code that has been **50** since 2026-08-07 — a five-week drift. It has since been repaired in the same uncommitted changeset as 13-68, and the `(2026-08-07, was 5)` annotation the agent is reading **is that repair**. No misreading occurred; the evidence of the defect was erased by fixing it.

⭐ This is worth a line of its own, because it is a trap this project will hit again: **a repaired artefact makes the original finding look like an error.** The defence is to cite the ref you measured against — `git show HEAD:path` — which is the same discipline as `[[pattern-baseline-sampled-from-the-working-tree]]`, in the opposite direction.

`googleAuthRateLimit` — **still present, still false.** It is named in that table with a threshold of `10/IP/1hr`, and the identifier exists **nowhere in `apps/api/src`** but that comment line. The route uses `magicLinkRateLimit`. Unfixed as of this writing.

Neither row failed the suite, because the table is a comment and the assertions only count handlers. That is `[[pattern-a-record-about-the-work-is-not-the-work]]` inside the file nominated as the enforcement point — hence NFR4.4.d.1's insistence that `axis` be **asserted**, not documented.

### 1.6 The census is not all the rate controls — ✅ stands

The script enumerates `express-rate-limit` instances. Five normative controls are hand-rolled Redis counters or DB columns and are invisible to it: `PasswordResetService.checkRateLimit` (3/email/hour) · `marketplace-edit.service.ts:66` (3/NIN/day) · `reveal-rate-limit.ts` `REVEAL_LIMIT = 50`/user/24h · `users.lockedUntil` · `users.mfaLockedUntil`.

And one is specified but **not implemented at all**: NFR4.4's *"API Endpoints (General): 100 requests per user per minute."* No such limiter exists. The SCP notes this parenthetically and then carries it into its proposed table as *"unchanged (unimplemented)"*. **A PRD threshold with no implementation is not "unchanged", it is unmet.**

### 1.7 What I concluded before reading the proposal

The diagnosis "an IP is not a person in this market" is correct and I reached it independently from the incident pattern. Three things the evidence forced beyond it:

1. **The governance gap is the right target.** Nothing ever required an author to say *whose* traffic a limiter counts, and `req.ip` is always in scope. A document defect, not a run of coding mistakes.
2. **The exposure is broader than login** — magic-link and registration-status are both live, public and unfixed, though measurement has since ranked magic-link below login on urgency.
3. **A flat numeric floor will not survive contact with the codebase.** I counted the shipped per-IP budgets before knowing the SCP would propose ≥100.

---

## Part 2 — Ruling on Question 1: the two-axis model as normative PRD text

### ✅ CONCUR with the model. ⚠️ REPLACE the floor rule. ➕ ADD three clauses.

**What I tried to break, and what held.** I looked for a rate limit in this codebase fitting neither axis and could not find one: all 39 controls either shape one actor's behaviour or absorb a burst from one host, and every incident came from conflating the two. The model constrains *reasoning* rather than numbers, and numbers are what drift. **Rules 1 (declare the axis), 3 (both axes, never one) and 4 (log `keyedBy`) I adopt verbatim.** Rule 3 is the non-obvious one and is load-bearing: the instinct on discovering "IP is wrong" is to *replace* the IP key, which hands an attacker a fresh bucket per forged identifier.

### 2.1 Rule 2's flat "≥100 per window" floor cannot be adopted

Applied to all 20 genuinely per-IP limiters, **fourteen fail it** — nine of them unscheduled for any change: `magicLinkRateLimit` (3/h), `loginRateLimit` (5/15m), `reauthRateLimit` (5/15m), `editTokenRequestRateLimit` (10/h), `mfaRateLimit` (10/m), `refreshRateLimit` (10/m), `registrationStatusRateLimit` (10/15m), `revealStepUpRateLimit` (15/5m), `editTokenUseRateLimit` (30/m), `marketplaceSearchRateLimit` (30/m), `publicVerificationRateLimit` (30/m), `settingsWriteRateLimit` (30/m), `registrationRateLimit` (50/15m), `settingsListRateLimit` (60/m).

**Adopting it would ratify a PRD the production codebase violates in fourteen places on the day it is signed.** That is `[[feedback_halt_on_ac_vs_reality_conflict]]`, and per that pattern I measure, present the option and do not paper over it. It also contradicts the SCP internally: §0 blesses `registrationRateLimit` at 50 and says *"do not widen it speculatively"*, while Rule 2 makes that same control a prohibited defect.

**And 100 is a number with no model behind it.** The shipped fixes were sized to a *ratio*, not a constant: activation 20 → 300 (15×), reset completion 20 → 300 (15×), reset request 3 → 200 (66×), registration 3 → 50 (16.7×), wizard draft 300 → 1,200 (4×). Meanwhile a flat floor fails in the other direction too — `wizardDraftRateLimit` at 1,200 clears ≥100 elevenfold, yet 13-46 measured **120 being exhausted by 2–6 concurrent wizards**. A number that both over- and under-fits is not a rule.

### 2.2 The replacement: exposure tiers, a recorded population model, and a response-mode clause

**Tiers, graded by what a refusal costs the person refused.** The severity dimension the SCP is missing: all four incidents were **one-shot, irreversible, invisible** tasks — activate *this* invitation, complete *this* reset link, submit *this* registration. A refusal there ends the journey, carries no user id, and reads to an operator as apathy. A refused marketplace search is retried in four seconds.

- **Tier 1 — public, unauthenticated, one-shot or irreversible.** Floor **≥ 100 per window**, no exemption.
- **Tier 2 — public, unauthenticated, retryable and idempotent.** Floor ≥ 100, **or** a recorded population model with a dated review.
- **Tier 3 — authenticated.** Person axis **mandatory** (`user.sub` exists by definition); any IP budget is a **loud** fallback path, exempt from the floor. A silent `?? ipKeyGenerator(req.ip)` is prohibited.

⭐ **Response-mode clause — the amendment Q2 forced, and the most durable thing in this ruling.** My first draft's floor did not distinguish a budget consumed by *use* from one consumed by *error*. Read literally it condemned the 60 I go on to approve — the identical contradiction I charged the SCP with. So:

> A flood budget counting **all responses** is spent by ordinary successful use and carries its tier's fixed floor. A budget counting **failures only** is spent only when someone errs, and instead carries a **derived floor: ≥ (assumed strangers behind one address) × (one person's per-window failure allowance)**, both figures recorded in its row. **A failure budget may never be set at or below one person's own failure allowance** — that is the defect class by definition.

Under the tiers, `registrationRateLimit` is Tier 1 and **must go 50 → 100**. I overrule the SCP's "do not widen it": its own §0 measures capture headroom at 2.4×, and raising the *IP ceiling* takes that to ~4.8× while weakening nothing, because `registrationEmailRateLimit` (3/email/15min) is the actual abuse control and is untouched. **The SCP cautions against a change that improves the very number it is worried about.**

### 2.3 ADD — the flood axis is a security control on authentication routes, not a capacity valve

The SCP defines it as *"stop a spray from one host exhausting the service"*. On auth endpoints that is materially wrong, and getting it wrong is what makes the login ruling risky. Once `loginRateLimit` is keyed on email, a credential spray touches each email once: it never reaches the 5-per-email budget and never reaches the 10-failure account lockout. **The IP ceiling is then the only control in the system that sees a spray at all.** Calling it a generously-sized availability backstop invites a future author to relax it without noticing what they are relaxing.

### 2.4 ADD — spray is detected by cardinality, not volume

200 login requests from one address is three enumerators retrying **or** 200 accounts sprayed once each. Identical counts, opposite meanings. The separating statistic is **distinct identifiers per IP per window with the failure ratio** — and it is nearly free: `auth.service.ts:474-478` logs `email` + `ipAddress` on `user_not_found`, and `:557-562` logs `userId` + `ipAddress` on `invalid_password`.

⚠️ **Note the asymmetry:** the two branches log *different* identifiers, so a monitor written against `email` sees only half the traffic — `[[pattern-a-monitor-measuring-something-else]]` pre-installed. **The fix is one field: add `email` to the `invalid_password` line**, not a monitor that unions two identifier types.

---

## Part 3 — Ruling on Question 2: the login trade — FINAL

### ✅ Re-key approved. ✅ 60/IP/hour, FAILED-ONLY. ⛔ Lockout decay blocking. ~~200/hour~~ WITHDRAWN.

### 3.1 The tree as it now stands (verified)

| control | current | mounted |
|---|---|---|
| `strictLoginRateLimit` | **60 / IP / hour, ALL responses** | layer 1 |
| `loginIpFloodLimit` | **100 / IP / 15 min, ALL responses** — *"a flood is a flood whether or not it works"* | layer 2 |
| `loginRateLimit` | **5 FAILED / EMAIL / 15 min** (IP fallback on the two MFA step-2 routes) | layer 3 |
| account lockout | 10 failures → 30 min; **counter still never decays** | `AuthService` |

13-68 took the 60 branch, not the SCP's 200. Its implementation already applies this ruling's reasoning: `loginIpFloodLimit` emits `keyedBy: 'ip'` and its docblock records the population worst case with a named reopen trigger.

### 3.2 Email rotation, and the arithmetic that did not close

Keying the burst limiter on email lets an attacker mint a fresh 5-slot bucket per forged address. Correct, structural, and matches shipped practice (`registration.routes.ts` says the same about MR-11's objection).

**One thing the SCP undersells in its own favour:** it files *"a wrong-address attempt returns `user_not_found` and increments nothing"* as an open gap. True account-side — but after the re-key that 401 is not skipped by `skipSuccessfulRequests`, so it **consumes a slot in that email's burst bucket**. Probing one non-existent address is bounded at 5/15min after the change and bounded by nothing today. The re-key *closes* part of the gap.

**The SCP's two IP figures did not reconcile:** 100/15 min is 400/hour against a sustained 200/hour, so the 15-minute ceiling was decorative after the opening window. At the shipped numbers the same tension is benign and inverted — 60/hour binds and 100/15min is its non-binding backstop — but the PRD must still state the combined budget as one figure.

### 3.3 The scenario the proposal did not consider: mass account-lockout DoS

Chain §1.2 with §2.3: `failedLoginAttempts` never decays, and the spray axis is bounded only by the per-IP ceiling. An attacker therefore need not *guess* a password — only **fail** ten times per account.

| | pre-13-68 (10/IP/h) | shipped (60/IP/h) | ~~SCP's 200/IP/h~~ |
|---|---|---|---|
| accounts newly locked / IP / hour | 1 | **6** | ~~20~~ |
| accounts held locked indefinitely / IP | 5 | **30** | ~~100~~ |
| hours for one IP to lock the ~200-account registry | ~200 | **~33** | ~~10~~ |

NFR2.2 plans ~200 staff accounts. Staff emails are not secret — `/verify-staff/:id` is public, the marketplace surfaces worker identity, and `docs/` ships a generated enumerator skills list. And the failure mode is this project's signature one: **invisible, and it looks like the users' fault.** A locked-out enumerator presents exactly as the plus-addressed ones did — "activated, never logged in" — which an operator reads as apathy.

The SCP's argument — *"a per-IP counter is not what stops a successful brute-force"* — is **correct for confidentiality and silent on availability**. Under a spray the per-account lockout is not only a defence; it is the attacker's weapon, and the per-IP counter is the only thing metering how fast they can swing it.

### 3.4 `skipSuccessfulRequests` on the sustained limiter — approve the mode, keep the number

Making `strictLoginRateLimit` failed-only is the person/flood insight applied to the response dimension: **stop charging legitimate success against a budget whose purpose is to bound failure.** The 2026-06-03 amendment made exactly this argument for `loginRateLimit`; the only reason it was not extended was the claim that this limiter "catches successful brute-forces" — a job §3.3 establishes it cannot do. With the rationale gone, the exemption goes with it. **Approved.**

❌ **But not at 20/IP/hour.** `loginRateLimit` permits 5 failures per email per 15 min = **20 per hour**, so a single enumerator mistyping at their full legitimate allowance consumes the entire proposed IP budget, leaving **zero headroom for a second person behind the same address**. That is NFR4.4.b's defect definition verbatim — closing four incidents by legislating a fifth. The evidence that this cohort fumbles at that rate is measured: **36 failed logins from 7 enumerators** in the plus-addressing incident, ~5 each, and the re-run puts the same people through a first-time login again.

✅ **60 is what my own population rule derives**, from measured inputs: 17 enumerators observed spread across **6** Opera Mini addresses ≈ **3 strangers per address**, × **20 failures per person per hour** = **60**. The number already in the tree is the number the rule produces. **Keep `max: 60`; change only the mode — a one-line diff with no figure to re-litigate.**

⛔ **The correction that matters: the mode change buys availability, not security.** The claims that failed-only makes spray "tighter" and drops lockout throughput to 2/hour are artefacts of the *number* 20, not of `skipSuccessfulRequests`. The comparison implicitly pits an attacker under the new regime against a *legitimate-traffic-contaminated* budget under the old — but **an attacker generates no successes**. Sprays and lockout runs are failures by construction and were never throttled by all-response counting. Holding 60:

| dimension | 60 all-responses | 60 failed-only |
|---|---|---|
| attacker spray / lockout capacity | 60 failures/h → 6 locks/h | **unchanged** |
| legitimate successful logins charged | yes — the "11th login in an hour" problem | **no — free** |
| legitimate fumble headroom per address | shared with successes | **3 maximally-fumbling people** |

**The accepted cost:** layer 1 going failed-only leaves `loginIpFloodLimit` (100/15 min, all responses ≈ 400/hour) as the only all-response ceiling, so an attacker **already holding valid credentials** can validate them at 400/hour instead of 60. I accept this — against an attacker with the password, the control is lockout, MFA and the audit trail, never a request counter. The property is weakened, not lost: it survives one layer down.

### 3.5 Escalating lockout duration — ✅ I CONCUR with deferring it

I proposed decay **plus** escalation. Verified against the schema: `users` carries only `failedLoginAttempts` and `lockedUntil` — **no lock-count column, no jsonb metadata**. Escalation therefore needs a migration, which is not same-day work and not what "~10 lines" described. That estimate was wrong and the correction is right.

**Concur: decay IN, escalation OUT as residual R2a**, on my own arithmetic. Without escalation a persistent attacker gets 10 guesses per 30 minutes ≈ **480/day per account** — immaterial against bcrypt plus an enforced password policy, with MFA on super-admins. Escalation hardens a margin that is already wide; **decay removes an unbounded denial of service**. They are not close in value, and bundling them would have traded the urgent fix for the optional one.

⚠️ **One condition on the deferral:** R2a must record that **480 guesses/day is the accepted figure**, so whoever revisits it argues against a number rather than re-deriving the question. And if password policy is ever weakened, R2a reopens automatically — that dependency belongs in the residual.

### 3.6 Ruling on Q2 — final

> ✅ **`loginRateLimit`** — person axis, submitted email (normalised), **5 FAILED / 15 min**, IP fallback on the two MFA step-2 routes. Approved as shipped.
> ✅ **`loginIpFloodLimit`** — flood axis, IP, **100 / 15 min, ALL responses**. Approved as shipped; it is the stack's only all-response ceiling once the line below changes.
> ⭐ **`strictLoginRateLimit`** — flood axis, IP, **60 / hour — number UNCHANGED — add `skipSuccessfulRequests: true`.** The only limiter change. Record in the docblock that 60 is *derived* (3 strangers/address × 20 failures/person/hour) so the next author amends the population model, not the constant.
> ⛔ **BLOCKING on 13-68:** (a) **lockout decay** — reset `failedLoginAttempts` when `lockedUntil` expires, at `auth.service.ts:482` and `:698`; (b) **add `email` to the `invalid_password` log line**.
> ✅ **Escalating lock duration** — deferred to **R2a** with the 480/day figure recorded. Concurred.
> ⏳ **Cardinality monitor** — **no longer blocking.** Downgraded to a dated follow-up (§3.7).
> ❌ ~~**200 / IP / hour**~~ — **WITHDRAWN as moot.** 60 failed-only is better on every dimension.

### 3.7 Why the monitor stopped being the precondition

It was never the strongest available control; I under-weighted a better one. The DoS has two multiplicands — **rate** and **persistence**. The monitor addresses neither; it only makes the attack *visible*. **Decay removes persistence outright**, degrading the attack from permanent denial to a 30-minute nuisance requiring continuous effort against a 60/hour ceiling — a fight the attacker loses. It is also deterministic and provable on a test DB, with no traffic to synthesise, no alert channel to exercise and no scheduler whose execution must be witnessed. **It closes today; the monitor cannot.**

✅ **I concur with the stricter acceptance test for the monitor, and it matters more now that it is deferred, not less** — a deferred monitor that ships broken is the 9-52 `cf-traffic-watch.ts` failure exactly: a documented cron line that never executed, discovered three weeks later, by which time the data it existed to capture was permanently gone. "The monitor shipped" is not an acceptance test; it is `[[pattern-verification-that-cannot-run-yet]]` closed on a zero.

> **Monitor follow-up — dated, per the jingle-week lesson that a perishable input needs a DATE, not a condition:**
> - **Date: 2026-10-15.** Not "after the re-run settles" — the re-run's own login traffic is the first real data this monitor would ever see, and it expires on the same pm2 retention that already destroyed the 9-52 window.
> - **AC:** synthesise > 20 distinct identifiers from one IP in one hour with > 80% failures → alert **observed arriving** via `alerting/telegram-channel.ts`; scheduler execution **witnessed**, not inferred from a cron line; query asserted to read `email` on **both** failure branches.
> - **Reopen trigger, independent of the date:** any `auth.login_ip_flood_limit_exceeded` or `auth.ip_blocked` event whose IP does *not* reverse-resolve to a proxy or carrier CGNAT range.
> - **Interim detection capability:** the runbook query `SELECT email, failed_login_attempts, locked_until FROM users WHERE locked_until > now()`. Until the monitor exists, this **is** the capability — and every incident in this family reached us through a human who needed exactly one query.

---

## Part 4 — Ruling on Question 3: marketplace search — ❌ LEAVE IT, now on measured data

My first draft said this should be settled by one grep rather than by reasoning. It has been.

**Measured, 14-day pm2 window (2026-09-03 → 09-16):**

| signal | count |
|---|---|
| `marketplace.search_rate_limit_exceeded` | **0** |
| marketplace log lines searched | **16,825** |
| positive control — `activation.rate_limit_exceeded` | **244** ✅ found |
| positive control — `auth.password_reset_completion_rate_limited` | **12** ✅ found |

⭐ **The positive control is what makes this result admissible.** A zero from a method that has not demonstrated it can find a non-zero is decorative — `[[pattern-a-clean-result-must-prove-it-measured]]`. The same query over the same window returns the known 244 activation refusals and the known reset-completion refusals, so the instrument works and the zero is real.

**Ruling: `marketplaceSearchRateLimit` stays at 30 / IP / min; `marketplaceProfileRateLimit` stays at 100 / IP / min.** No harm across 16,825 log lines; refusals here are visible, immediately retryable and destroy nothing (Tier 2, categorically unlike all four incidents); and 300 is as unmodelled as 30 — the SCP offers no more basis for one than the other. **The ruling no longer rests on absence of complaint. It rests on a measured zero with a passing positive control.**

Both rows carry an explicit Tier 2 population model so the low budget reads as a decision, not an oversight.

> **Pre-registered trigger — a condition AND a date:**
> - **Condition:** first day `marketplace.search_rate_limit_exceeded` exceeds **20 events**, or any refusal traced to fewer than 10 distinct IPs → raise to 300/min immediately under the Tier 2 clause, no new SCP.
> - **Condition:** any marketing push, radio read or partner launch driving marketplace traffic → raise to 300/min **before** the push. The jingle read produced a 0–1/day → 19/day step change inside 24 hours.
> - **Date: 2026-12-31** regardless. If the counter is still zero, the row is re-affirmed with the number as evidence.

---

## Part 5 — Where I disagree with the SCP

Strongest first. The proposal is good work: the diagnosis is right, the model is right, the evidence is real, and flagging its own weakest item is why Q3 got a proper hearing. These are the places it does not hold. **Items 1–3 are for the adjudication agent to fix in the SCP; I have not edited that document.**

1. ⛔ **The 200/IP/hour recommendation was unsafe, and the reason is absent from the document.** It evaluates `strictLoginRateLimit` purely as an anti-brute-force control, correctly finds it useless in that role, and raises it 20× — without noting it is also the meter on mass account-lockout DoS, because `failedLoginAttempts` never decays (§3.3). **Moot now that 60 ships**, but the SCP's §0 and §3 still recommend 200 and should be corrected, or a future reader will apply it.
2. ⚠️ **Rule 2's flat ≥100 floor cannot be adopted** — 14 of 20 shipped per-IP controls fail it, nine unscheduled, and it contradicts the SCP's own §0 blessing of `registrationRateLimit` at 50. It also under-fits: `wizardDraftRateLimit` clears it elevenfold, yet 120 was exhausted by 2–6 concurrent wizards. Replaced by §2.2.
3. ⚠️ **The SCP's threshold table covers 20 controls, not the full census.** Nine limiters are absent: `reauthRateLimit`, `editTokenUseRateLimit`, `revealStepUpRateLimit`, `settingsListRateLimit`, `settingsWriteRateLimit`, `registrationStatusRateLimit`, `publicVerificationRateLimit`, `ninCheckRateLimit`, `unsubscribeRateLimit` — four of them authenticated routes on pure IP keys, which the SCP's own Rule 1 forbids. Complete table at Part 7.
4. ⚠️ **The re-key targets for `mfaRateLimit` and `refreshRateLimit` are wrong.** *"Both run after identity is known"* — but middleware runs **before** the controller verifies either credential, so `userId` is not available at keying time. For `mfaRateLimit`, key the **MFA challenge token** (in the body; same pattern as activation and reset). For `refreshRateLimit`, the token value is wrong because refresh tokens **rotate** (`auth.service.ts:1230,1267 mode: 'rotate'`) — a fresh bucket per refresh defeats the limiter; key the **session / token-family id**. Governing principle: *key on whatever is stable across the attempt sequence you are bounding.*
5. ⚠️ **The SCP repeats NFR4.4's error about the cumulative block**, filing it under axis = IP when it is per-**user**. Fixed in the PRD by 13-68; still wrong in the SCP's §1 table.
6. ⚠️ **"API general — unchanged (unimplemented)" launders a gap into a settled row.** It gets an owning story or an explicit withdrawal.
7. ⚠️ **"Do not widen `registrationRateLimit`" is backwards** — §2.2.
8. ➕ **Missing: the severity dimension** (one-shot/irreversible/invisible vs retryable). Now Tiers 1–3.
9. ➕ **Missing: cardinality monitoring**, and the log-field asymmetry that would have crippled it (§2.4).
10. ➕ **Missing: the enforcement tool is subject to the defect class it polices** (§1.3). Now NFR4.4.d.7.

**What I tried to break and could not:** the person/flood dichotomy (no control among 39 fits neither); Rule 3's insistence on keeping the IP axis when adding a person key (forged identifiers mint free buckets); and the claim that re-keying login to email tightens per-account protection — it does, and it closes more of the `user_not_found` gap than the SCP claims for itself. Those three hold.

---

## Part 6 — FINAL NFR4.4 replacement text

⛔ **Not applied by me.** Apply per the handoff in Part 8, on top of 13-68's login amendment.

---

> ### NFR4.4 Defense-in-Depth: Rate Limiting
>
> Rate Limiting (Redis), Honeypots, strict Content Security Policy (CSP), and per-IP flood ceilings.
>
> #### NFR4.4.a — Identity axis (NORMATIVE)
>
> Every rate limit MUST declare the identifier it counts against — its **axis** — and MUST appear as a row in the NFR4.4.c table. The blanket "IP Throttling" licence of the previous revision is **withdrawn**. Two axes, and almost every protected route needs **both**:
>
> - **Person axis** — keyed on a per-person identifier the request already carries: `email` (normalised lowercase, trimmed), `nin`, `userId` (JWT `sub`), or a single-use `token`. Sized for **one person's** legitimate use.
> - **Flood axis** — keyed on the client IP resolved via `real-ip.ts` (never raw `req.ip`; IPv6 collapses via `ipKeyGenerator`). Sized for the **largest legitimate group behind one address**. This key is shared between strangers, which is precisely why its budget must be generous.
>
> A person axis MUST be used wherever the request carries a person identifier. Where it carries none, the limiter is flood-axis only and must be declared as such with a recorded population model per NFR4.4.b.
>
> **Dropping the flood axis when adding a person axis is a regression, not a simplification.** An attacker spraying 1,000 forged identifiers obtains 1,000 fresh buckets — no limit at all. Both axes ship together.
>
> **Key on whatever is stable across the attempt sequence being bounded.** A rotating credential is not a key: refresh tokens rotate on use, so a refresh limiter keyed on the token value mints a fresh bucket per request and bounds nothing.
>
> **A person-axis limiter that silently falls back to IP is a flood-axis limiter in disguise.** Any `user?.sub ?? ip` fallback MUST log a warning and increment a metric on every IP-keyed request (reference: `apps/api/src/middleware/audit-log-rate-limit.ts`). Silent fallback is prohibited.
>
> #### NFR4.4.b — Population constraint, exposure tiers, response mode (NORMATIVE)
>
> **In the Oyo State operating environment an IP address does not identify a person.** Nigerian carriers use CGNAT, and Opera Mini proxies users through a small pool of servers. Measured: **244 activation refusals from 6 addresses** with reverse DNS `opera-mini.net` (2026-09-07/08); **36 citizens blocked across 5 carrier ranges** in one morning (2026-08-05). A per-IP budget is shared between strangers; a small one is an availability defect.
>
> **The failure mode is invisible by construction.** A refused request carries no user id, so the victim's row reads "invited, never activated" or "activated, never logged in" — which an operator reads as apathy. Two enumerators filed as "no attempt recorded" had tried 6 and 5 times. Absence of evidence in this control class is manufactured by the defect itself; all four incidents surfaced through complaints, never through monitoring.
>
> Flood budgets are constrained by **what a refusal costs the person refused**:
>
> - **Tier 1 — public, unauthenticated, one-shot or irreversible.** Activation, registration submit, magic-link request and redemption, password reset request and completion, registration status, NIN check, public verification, login. **Minimum flood budget: 100 per window. No exemption.** A refusal ends the journey, cannot be meaningfully retried, and is invisible in the database. All four recorded incidents are Tier 1.
> - **Tier 2 — public, unauthenticated, retryable and idempotent.** Marketplace search, marketplace profile, edit-token use. **Minimum 100 per window, OR a recorded population model** stating (i) assumed strangers behind one address and (ii) one person's legitimate volume per window, with `budget ≥ (i) × (ii)`, plus a dated review in the row.
> - **Tier 3 — authenticated.** **Person axis mandatory**; any IP budget is a loud fallback path, exempt from the floor.
>
> **Response-mode clause.** A flood budget's floor depends on what consumes it. A budget counting **all responses** is spent by ordinary successful use and carries its tier's fixed floor. A budget counting **failures only** is spent only when someone errs, and instead carries a **derived floor: ≥ (assumed strangers behind one address) × (one person's per-window failure allowance)**, both figures recorded in its row. **A failure budget may never be set at or below one person's own failure allowance** — that is the defect class by definition. *Worked example: `strictLoginRateLimit` = 3 strangers/address × 20 failures/person/hour = **60/hour**.*
>
> A limiter whose budget must be tighter than its floor is not a flood limiter. It is a person-axis limit that has not been given a person key.
>
> #### NFR4.4.c — Thresholds
>
> The complete table of every rate control — columns **Control · Axis · Key · Budget · Window · Mode · Tier · Rationale · Code reference** — is NFR4.4.c and is reproduced at Part 7 of the PM ruling of 2026-09-16. No control may exist outside it.
>
> #### NFR4.4.d — Governance and observability (NORMATIVE)
>
> 1. **Enforcement.** A limiter without an NFR4.4.c row fails `apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts`. The coverage map gains required `axis`, `key`, `tier`, `mode` and `budget` fields, and the suite **asserts** — not documents — that: (a) every limiter reachable from a mounted router has a map entry; (b) every Tier 1 all-response flood entry has budget ≥ 100; (c) every failed-only flood entry exceeds one person's failure allowance and records its population model; (d) every Tier 2 entry below 100 records a population model and a review date; (e) every person entry names a non-IP key; (f) every declared IP-fallback path logs. **Assertions, not comment tables:** the previous comment table drifted undetected for five weeks and named a limiter (`googleAuthRateLimit`) that exists nowhere in `src`.
> 2. **Attribution.** Every 429 logs `keyedBy: 'email' | 'nin' | 'user' | 'token' | 'ip'`. Without it an investigation must reverse-DNS a handful of addresses to discover a limit was per-proxy — which is literally how the activation defect was found.
> 3. **The flood axis is a security control on authentication routes, not a capacity valve.** Once a login limiter is keyed on the submitted email, a credential spray touches each identifier once and is bounded by **nothing except the IP ceiling** — it reaches neither the per-email budget nor the account lockout. Any change to an authentication flood ceiling is a security change requiring a dev-story plus adversarial review, never an inline fix.
> 4. **Spray is detected by cardinality, not volume.** 200 login requests from one address is three enumerators retrying **or** 200 accounts sprayed once each; identical counts, opposite meanings. The monitored signal is **distinct person-identifiers per IP per window with the failure ratio** — alert at > 20 distinct identifiers from one IP per hour with > 80% failures. Both failure branches MUST log the same identifier field; a monitor reading a field present on only one branch measures half the traffic.
> 5. **The proxy signature is a documented non-event.** High refusals concentrated on *few* distinct IPs is a proxy pool, not an attack. Six addresses producing 244 refusals alerts a human; it does not block.
> 6. **Account lockout must decay.** A per-account failure counter never reset converts a brute-force defence into a standing denial of service: an attacker holds an account locked indefinitely at two requests per hour. Lockout counters reset when the lockout expires.
> 7. **The enforcement tooling is subject to the defect class it polices.** A census that classifies limiters by syntax rather than by the key actually returned will under-report, and a monitor that cannot fail loudly will report a clean zero it never measured. Every such tool MUST carry a **positive control** — a known non-zero it can still find — and MUST be verified against `git show HEAD:<path>` rather than the working tree, so a repair does not erase the evidence of the defect it repaired. *Instances on record: the limiter census reported 19 per-IP when the answer was 20, then 23 after a repair that produced three false positives, then the right answer only after a regex defect (`\s`/`\b` degraded inside a template literal) that matched nothing while emitting confident green output.*
>
> #### NFR4.4.e — Login thresholds
>
> *(Owned by Story 13-68 — see the handoff note. Four layers on two axes: **5 FAILED per submitted email per 15 min**; **100 per IP per 15 min, all responses**; **60 per IP per hour, failures only** — derived as 3 strangers/address × 20 failures/person/hour; and the per-account lockout at 10 failures → 30 minutes, whose counter resets on expiry. Combined per-IP budget: **60 failures per hour, at most 100 requests in any 15-minute window**.)*
>
> #### NFR4.4.f — Known gap
>
> **"API Endpoints (General): 100 requests per user per minute" is specified but NOT IMPLEMENTED.** No general per-user API limiter exists. This remains an **open requirement with an owning story**, not a satisfied threshold, and is not to be restated as "unchanged".

---

## Part 7 — NFR4.4.c: the full threshold table

⚠️ **Census: `33 limiters; 20 bucket on IP (1 via a hand-rolled keyGenerator)`** — post-repair figure. 33 rather than 32 because 13-68 added `loginIpFloodLimit`. **This counts `express-rate-limit` instances only**; five further normative controls are hand-rolled Redis counters or DB columns (§7.5) and one requirement is unimplemented. Governed universe: **38 controls + 1 open requirement.**

Legend — ✅ compliant · 🔧 change required · ⏳ deferred with trigger · ⛔ unimplemented/blocking

### 7.1 Authentication and account lifecycle

| Control | Axis | Key | Budget | Window | Mode | Tier | Status |
|---|---|---|---|---|---|---|---|
| `loginRateLimit` | person | submitted email (IP fallback on MFA step-2) | 5 | 15 min | FAILED | 1 | ✅ 13-68 |
| `loginIpFloodLimit` | flood | IP | 100 | 15 min | ALL | 1 | ✅ 13-68 — stack's only all-response ceiling |
| `strictLoginRateLimit` | flood | IP | **60** *(3 × 20 derived)* | 1 h | ⭐ **FAILED — change this** | 1 | 🔧 one line |
| Account lockout | person | `users.locked_until` | 10 fails → 30 min | cumulative | — | — | ⛔ **decay BLOCKING**; escalation → R2a |
| `mfaRateLimit` | person | **MFA challenge token** (was IP) | 10 | 1 min | ALL | 1 | 🔧 |
| MFA lockout | person | `users.mfa_locked_until` | 5 fails → 15 min | 15 min | — | — | ✅ |
| `refreshRateLimit` | person | **session / token-family id** (was IP) | 10 | 1 min | ALL | 3 | 🔧 — tokens rotate |
| `reauthRateLimit` | person | **`user.sub`** (was IP) | 5 | 15 min | ALL | 3 | 🔧 missed by SCP |
| `magicLinkRateLimit` | **split required** | email on request; **IP on 7 of 8 routes** | 3 | 1 h | ALL | 1 | 🔧 **P2** — §7.6 |
| `activationRateLimit` | person | invitation token | 20 | 15 min | ALL | 1 | ✅ `b602591` |
| `activationIpFloodLimit` | flood | IP | 300 | 15 min | ALL | 1 | ✅ |
| `passwordResetRateLimit` | flood | IP | 200 | 1 h | ALL | 1 | ✅ `1e7b878` |
| `passwordResetCompletionRateLimit` | person | reset token | 20 | 15 min | ALL | 1 | ✅ `1e7b878` |
| `passwordResetCompletionIpFloodLimit` | flood | IP | 300 | 15 min | ALL | 1 | ✅ |

### 7.2 Registration, wizard and public surfaces

| Control | Axis | Key | Budget | Window | Tier | Status |
|---|---|---|---|---|---|---|
| `registrationRateLimit` | flood | IP | **100** (is 50) | 15 min | 1 | 🔧 — I overrule "do not widen"; §2.2 |
| `registrationEmailRateLimit` | person | normalised email | 3 | 15 min | 1 | ✅ the real abuse control |
| `wizardDraftRateLimit` | flood | IP | 1,200 | 15 min | 1 | ✅ 13-46 |
| `wizardDraftEmailRateLimit` | person | normalised email | 300 | 15 min | 1 | ✅ 13-46 |
| `registrationStatusRateLimit` | flood | **IP** (hand-rolled) | **100** (is 10) | 15 min | 1 | 🔧 **P1** — missed by SCP, mis-filed by the census |
| `ninCheckRateLimit` | person → **silent IP fallback** | `user.sub` ?? IP | 20 | 1 min | 1 | 🔧 — public route, so per-IP in practice |
| `publicVerificationRateLimit` | flood | IP | **100** (is 30) | 1 min | 1 | 🔧 missed by SCP |
| `unsubscribeRateLimit` | flood | IP | 120 | 1 min | 1 | ✅ |

### 7.3 Marketplace

| Control | Axis | Key | Budget | Window | Tier | Status |
|---|---|---|---|---|---|---|
| `marketplaceSearchRateLimit` | flood | IP | **30 — UNCHANGED** | 1 min | 2 | ⏳ **0 refusals / 16,825 lines / positive control passed.** Trigger + 2026-12-31 review |
| `marketplaceProfileRateLimit` | flood | IP | 100 | 1 min | 2 | ✅ |
| `editTokenRequestRateLimit` | flood | IP | **100** (is 10) | 1 h | 1 | 🔧 |
| `editTokenUseRateLimit` | person | **edit token** (was IP) | 30 | 1 min | 2 | 🔧 missed by SCP |
| `revealStepUpRateLimit` | person | **`user.sub`** (was IP) | 15 | 5 min | 3 | 🔧 missed by SCP |

### 7.4 Authenticated back-office

| Control | Axis | Key | Budget | Window | Tier | Status |
|---|---|---|---|---|---|---|
| `auditLogReadRateLimit` | person | `user.sub` | 60 | 1 min | 3 | ✅ **reference impl — the only loud IP fallback** |
| `auditLogExportRateLimit` | person | `user.sub` | 10 | 1 h | 3 | ✅ |
| `exportRateLimit` | person | `user.sub` | role-based | 1 h | 3 | ✅ silent fallback → make loud |
| `messageRateLimit` | person | `user.sub` | 30 | 1 min | 3 | ✅ silent fallback → make loud |
| `operationsReadRateLimit` | person | `user.sub` | 60 | 1 min | 3 | ✅ silent fallback → make loud |
| `profileUpdateRateLimit` | person | `user.sub` | 10 | 1 min | 3 | ✅ silent fallback → make loud |
| `settingsListRateLimit` | flood → **person** | **`user.sub`** (is IP) | 60 | 1 min | 3 | 🔧 missed by SCP |
| `settingsWriteRateLimit` | flood → **person** | **`user.sub`** (is IP) | 30 | 1 min | 3 | 🔧 missed by SCP |

### 7.5 Controls the census cannot see (not `express-rate-limit`)

| Control | Axis | Key | Budget | Window | Status | Code |
|---|---|---|---|---|---|---|
| Password-reset request | person | normalised email | 3 | 1 h | ✅ | `password-reset.service.ts` `RESET_RATE_LIMIT` |
| Profile edit token request | person | NIN → respondent id | 3 | 1 day | ✅ | `marketplace-edit.service.ts:66` |
| Contact reveal | person | `userId` | 50 | 24 h | ✅ | `reveal-rate-limit.ts` `REVEAL_LIMIT` |
| **API general** | person | `userId` | 100 | 1 min | ⛔ **UNIMPLEMENTED** | none — story or withdrawal |

*(`users.lockedUntil` and `users.mfaLockedUntil` are listed in §7.1 alongside the login stack they belong to.)*

### 7.6 Magic-link — the sizing, stated at measured strength

`magicLinkRateLimit` is 3/hour across eight routes on one `rl:magic-link:` prefix; seven carry no `email` and take the IP branch. FR27 makes this the primary public auth channel.

**Measured (14 days): 3 refusals total, all on the EMAIL branch, one enumerator using her real address instead of her `+test` one — §0.1a again, a fourth affected enumerator. The IP branch has ZERO refusals. Volume: 80 issued / 30 redeemed ≈ 2/day.**

So this is a **latent scaling risk, not a live incident**: 6 addresses × 3/hour = 18 redemptions/hour statewide against 13-65 route (c)'s projected ≈9/hour — under 2× headroom at a load never yet seen. **Priority P2, scheduled ahead of any marketing or radio push**, not P1 and not an emergency.

**Fix when scheduled:** (1) split the bucket — `POST /auth/public/magic-link` keeps its email-keyed prefix at 3/email/hour; redemption routes move to a separate prefix keyed on the **magic-link token**, with a Tier 1 IP ceiling ≥100/hour; (2) unbundle `/registration/complete-nin` and `/defer-reminder` from the auth bucket; (3) key-builder unit test — two identities from one IP → two keys, one identity from two IPs → one key.

---

## Part 8 — Application handoff: who owns which lines of NFR4.4

To avoid clobbering 13-68, whoever applies this must split by sub-clause.

| NFR4.4 clause | Owner | Action |
|---|---|---|
| **NFR4.4.e — the login bullets** | ⛔ **Story 13-68 — do NOT overwrite** | 13-68 owns every login threshold line, the `skipSuccessfulRequests` rationale, the identity-axis amendment note, and the **cumulative-block correction** (it already replaced "on the IP" with "on the account"). My Part 6 deliberately contains **no** restatement of that correction and no login numbers beyond a summary paraphrase. If 13-68's wording differs from my paraphrase, **13-68 wins**. |
| **NFR4.4.a, .b, .c, .d, .f** | ✅ **This ruling** | New clauses. They do not exist in the current PRD, so they are additions, not overwrites. Insert **above** 13-68's login bullets; the login bullets then become NFR4.4.e beneath them. |
| **The four legacy bullets** — Marketplace Search / Profile Views / API General / Password Reset / Profile Edit Token | ✅ **This ruling** | **Delete** them from their current position and fold into the NFR4.4.c table (Part 7), which supersedes them. They are the only lines in NFR4.4 that this ruling *removes* rather than adds. |
| **Preamble line** — *"…and IP Throttling with the following thresholds"* | ✅ **This ruling** | Replace with the NFR4.4 opening line in Part 6. This is the sentence that granted the blanket licence; it must go. |

**Sequence:** 13-68 lands and commits → apply NFR4.4.a–d and .f above its login block → delete the five legacy bullets → renumber its login block as NFR4.4.e. **Do not apply before 13-68 commits**, or the two edits collide in the same paragraph.

---

## Part 9 — Documents that must change

| # | Document | Change | Owner | Blocking |
|---|---|---|---|---|
| 1 | `prd.md` | Apply Part 6 per the Part 8 split. **After 13-68 commits.** | adjudication | — |
| 2 | `architecture.md` ADR-015 | Re-express the login matrix on two axes; record the `mfa`/`refresh` keying decision (Part 5 #4) and the response-mode clause. | Architect | — |
| 3 | `architecture.md` ~line 912 | Source of marketplace 30/min — add the Tier 2 population model + 2026-12-31 review + the measured zero. | Architect | — |
| 4 | `security-posture-stride-mapping-2026-04-20.md` | Re-state three `NFR4.4 = PASS` claims. **Add the availability failure mode to the STRIDE model** — including that an attacker can weaponise the per-account lockout into a registry-wide DoS. | Security | — |
| 5 | `bmad-compliance-restoration-2026-05-10.md` F2 | Correction note: the audit was correctly executed against a specification that was itself wrong — it verified each endpoint *had* a limiter matching its *documented threshold*, never whose traffic that threshold counted. | adjudication | — |
| 6 | `rate-limit-coverage.test.ts` | **Asserted** `axis`/`key`/`tier`/`mode`/`budget` + the six NFR4.4.d.1 assertions. **Delete the `googleAuthRateLimit` row** (still false). Extend beyond `auth.routes.ts` to every mounted router. | SM → dev-story | ⛔ prevents instance #5 |
| 7 | `scripts/audit-rate-limit-keys.ts` | ✅ **Repaired** (33/20). Add a **positive control** + a `git show HEAD:` comparison mode per NFR4.4.d.7. | Lane C | — |
| 8 | **Story 13-68** | `skipSuccessfulRequests: true` on `strictLoginRateLimit` (keep 60) · **lockout decay** · **`email` on the `invalid_password` log line**. | 13-68 | ⛔ gates the re-run |
| 9 | **R2a — escalating lockout** | Needs a migration (no lock-count column). Record **480 guesses/day** as the accepted figure; auto-reopen if password policy weakens. | SM | no — concurred deferral |
| 10 | **Follow-up — cardinality monitor** | Stricter "demonstrated firing" AC. **Date 2026-10-15.** | SM | no |
| 11 | **Follow-up — magic-link axis (P2)** | §7.6. **Before any marketing/radio push.** | SM | no |
| 12 | **Lane C sweep** | `registrationStatusRateLimit` 10→100 · `registrationRateLimit` 50→100 · `publicVerificationRateLimit` 30→100 · `editTokenRequestRateLimit` 10→100 · `reauth`/`settingsList`/`settingsWrite`/`revealStepUp` → `user.sub` · `editTokenUse` → edit token · `mfa` → challenge token · `refresh` → session id · loud IP fallback on the six silent ones · `keyedBy` on every 429. | SM | no |
| 13 | **API-general limiter** | Implement 100/user/min or withdraw the requirement. | SM | no |
| 14 | `docs/runbooks/` | "Staff report they cannot log in" — the lockout query. Until the monitor exists this **is** the detection capability. | adjudication | no |
| 15 | `docs/adjudication-agent-handoff.md` §9j | Record the rulings, the measured zeros, the two dated triggers. | adjudication | no |
| 16 | **SCP** (not mine to edit) | Correct the 200/hour recommendation, Rule 2's floor, and the cumulative-block axis error — Part 5 #1, #2, #5. | adjudication | no |

---

## Part 10 — Summary of rulings

| Q | Ruling |
|---|---|
| **1 — two-axis model** | ✅ **CONCUR.** Rules 1, 3, 4 verbatim. ⚠️ **Flat ≥100 floor replaced** by Tiers 1–3 + a recorded population model + the **response-mode clause** — as written it made 14 of 20 shipped controls non-compliant and condemned the 60 I approve. ➕ Added: flood axis is a **security** control on auth routes; spray is detected by **cardinality**; the **enforcement tooling is subject to its own defect class**. |
| **2 — login** | ✅ **5 FAILED/email/15min + 100/IP/15min ALL + 60/IP/hour FAILED-ONLY.** The only limiter change is one line: `skipSuccessfulRequests` on the sustained limiter; **60 stays**, derived as 3 strangers/address × 20 failures/person/hour. ❌ **20/hour rejected** — equal to one person's own failure allowance, i.e. the defect class. ❌ ~~200/hour withdrawn as moot.~~ ⛔ **Blocking: lockout decay + `email` on the `invalid_password` line.** ✅ **Escalation deferred to R2a — concurred** (needs a migration; 480 guesses/day is immaterial). ⏳ Monitor → dated follow-up, stricter AC, **2026-10-15**. |
| **3 — marketplace search** | ❌ **LEAVE at 30/IP/min — now on data.** 0 refusals across 16,825 marketplace log lines in 14 days, with a **passing positive control** (the same method finds the known 244 activation and 12 reset-completion refusals). Trigger + **2026-12-31** date pre-registered. |

---

# ADDENDUM B — 2026-09-17: Lane C APPLIED

13-68 landed (`4a3279d`), so the Part 8 handoff executed. **NFR4.4.a/.b/.c/.d/.f are now in `prd.md`**; 13-68's login block is renumbered **NFR4.4.e** and its wording is untouched, as Part 8 specified. The five legacy bullets and the "IP Throttling with the following thresholds" preamble are deleted, their values carried into the .c register unchanged.

### Ruling on A3 — flood-ceiling divergence (300 vs 100)

**Login stays at 100/15 min. The divergence is permitted, and the permission is dated.**

Login's ceiling mounts ahead of the CAPTCHA, so it uniquely bounds the external hCaptcha `siteverify` call and the bcrypt work behind it — a per-attempt cost activation and reset-completion do not carry. That is a real asymmetry and it justifies a tighter number.

⚠️ **But the justification is unmeasured, and an unverified assumption may not do normative work indefinitely.** Neither hCaptcha's own rate limit at 400 verifications/IP/hour nor bcrypt p95 on the 2 GB VPS has been measured (A2). Both are now **required by 2026-10-15**; if neither constrains, login harmonises to 300 and the exception is deleted. The general rule written into .c: **a flood ceiling may diverge from its tier's peers only where its register row records the cost it is bounding.** Three numbers with three derivations is engineering; three numbers with none is drift.

### A1 — generalised into a normative rule

A1 is not a login bug, it is a class. Written into NFR4.4.d as **"a refusal is not a request"**: a 429 emitted by one limiter must not be counted by any other limiter on the same route. CAPTCHA refusals (400) stay counted, so the ceiling still bounds the verification call. **This needs a code change I did not make** — `loginIpFloodLimit` requires a predicate excluding 429s.

### New findings while applying

1. ⛔ **`revealStepUpRateLimit` needs a re-ORDER, not just a re-key.** It is mounted *ahead of* `authenticate`, so `user.sub` does not exist when it keys. My earlier register row said "re-key to `user.sub`" — as written that instruction would have **silently fallen back to IP and changed nothing**: `[[pattern-ship-a-fix-that-never-fires]]`, authored by me. Row corrected; it is why the mount-order rule is normative rather than advisory.
2. ⛔ **A third unimplemented PRD threshold.** *"CAPTCHA required after 10 queries in 5 minutes"* on marketplace search is **not implemented** — `verifyCaptcha` is mounted on contact-reveal and edit-token-request only; `GET /marketplace/search` carries its limiter alone. Flagged in place. **This matters for Q3:** had the CAPTCHA existed, it would have been a second control justifying the 30/min ceiling. It does not, so 30 is the *only* control on that route — which strengthens the case for the dated review while leaving the measured-zero ruling intact.
3. ✅ **F2's own "API general not implemented" note was accurate in May and still is** — reaffirmed rather than corrected, and now carried as NFR4.4.f.

### Evidence folded in

The 32 `user_not_found` failures across seven enumerators — two typing a bare `+` — now sit in **NFR4.4.b** as the measured proof that this control class is invisible in the database: a cohort failing 32 times while production shows exactly **one** account with any failure count. It is stronger evidence than the argument it replaces, and it converts .b from a claim into a citation. The response-side/log-side disclosure boundary (R8) is stated explicitly in .b.

### Applied elsewhere

`security-posture-stride-mapping-2026-04-20.md` — all three NFR4.4 claims re-stated; the availability failure mode added to the threat model, including that the per-account lockout is attacker-usable and that `D` is **bidirectional** for this control class. `bmad-compliance-restoration-2026-05-10.md` — F2 correction note. `rate-limit-coverage.test.ts` — the false `googleAuthRateLimit` row deleted (comment only; suite 8/8 green).

---

**Signed:** John, Product Manager — 2026-09-16 (harmonised)
**Status:** uncommitted. `prd.md` untouched by me. `sprint-change-proposal-…md` untouched by me — corrections flagged at Part 5 #1/#2/#5 for its author. No code changed.
