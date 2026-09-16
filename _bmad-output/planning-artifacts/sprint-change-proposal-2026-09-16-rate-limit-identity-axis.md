# Sprint Change Proposal — Rate-Limit Identity Axis (NFR4.4 restructure)

**Date:** 2026-09-16
**Author:** Adjudication Agent, for John (PM) via `correct-course`
**Trigger source:** Four production incidents, 2026-08-05 → 2026-09-16, all the same defect class. The most recent was found by investigating one enumerator's complaint.
**Decision basis:** Awwal, 2026-09-16 — "we instituted this during the PRD creation, thus we need the PM agent's concurrence to make the fundamental change in the PRD."
**Scope class:** **Fundamental** (normative PRD change + security-control semantics) → PM authors NFR4.4; route the code change to Bob (SM) for `*create-story`.

---

## ⛔ STATUS: PARTLY SUPERSEDED BY THE PM RULING — read this first

*2026-09-16. John (PM) ruled on this proposal in
`pm-ruling-2026-09-16-nfr4-4-rate-limit-axis.md` and its Addendum A. He was deliberately briefed
from the PRIMARY EVIDENCE rather than from this document, and asked to break it. He did. The
sections below are kept as written — a proposal edited to match its own review teaches nothing
about which way the error ran.*

| this SCP proposed | ruling | why |
|---|---|---|
| **Rule 2: a flat ≥100/window floor on IP budgets** | ❌ **REJECTED** | 14 of 20 per-IP limiters fail it, nine unscheduled for change. It also contradicts my own §0, which blesses `registrationRateLimit` at 50/IP/15min *and* forbids it. Replaced by exposure tiers keyed on **what a refusal costs the person**, plus a response-mode clause. |
| `strictLoginRateLimit` → **200**/IP/hr | ❌ **WITHDRAWN as moot** | → **60/IP/hr with `skipSuccessfulRequests: true`.** |
| the re-key is a **security** improvement | ⚠️ **half wrong** | The re-key tightens the per-account axis, yes. But failed-only counting is an **AVAILABILITY** fix: an attacker generates no successes, so all-response counting never throttled a spray. Attacker capacity at a fixed number is identical before and after. |
| — (not considered) | ➕ **MASS ACCOUNT-LOCKOUT DoS** | `failedLoginAttempts` is never cleared when `lockedUntil` expires, so an account that has once reached 10 failures is **permanently re-lockable by one attempt**. Holding it locked costs two requests an hour. This SCP assessed the sustained limiter purely as anti-brute-force and proposed raising it 20× — it is also **the meter on how fast an attacker can deliberately FAIL**. **Lockout decay is now the blocking precondition on 13-68.** |
| — (not mentioned once) | ➕ **`magicLinkRateLimit`** | 3/IP/hour pooled across routes; `/magic/consume` and `/magic/login` carry no email so they ALWAYS take the IP branch — on the primary public auth channel. ⚠️ **Measured since: 0 refusals on that branch in 14 days** (80 issued / 30 redeemed ≈ 2/day). A real SCALING risk against 13-65's projected 9/hour; **not** a live incident. Lane C. |
| **marketplace search: raise on principle** (flagged as my weakest evidence) | ❌ **LEAVE at 30/IP/min** — and now on DATA | `marketplace.search_rate_limit_exceeded` = **0** across the full 14-day pm2 window against **16,825** marketplace log lines. Positive control passed (same method finds the known 244 activation refusals). It has never fired. ⭐ **I flagged this as unevidenced so it could be discounted, and it was.** |
| **"32 limiters, 19 per-IP"** | ❌ **wrong: 20 of 33** | `registrationStatusRateLimit` hand-rolls `(req) => ipKeyGenerator(req.ip)`, so the audit script filed a pure per-IP limiter under "custom key". **The tool built to find this defect class contained it.** Caught by the PM reading the script's output, not by the script. Fixed in `67846d0`. |

⭐ **The one thing this SCP got right that survived every round:** the two-axis model itself. John
hunted across all 38 controls for one that fits neither axis and could not find it.

---

## Section 0 — ⚡ DECOUPLING: this proposal does NOT gate the enumerator re-run

**Added 2026-09-16 on Awwal's direction: the field work must not wait on PM concurrence.**

This SCP contains two changes of different urgency, risk and approver. They are separable, and
separating them costs nothing because **the fast half is a strict SUBSET of the slow half's target
state** — no rework, no divergence.

| Lane | Content | Approver | Blocks the re-run? |
|---|---|---|---|
| **A — Login axis** | `loginRateLimit` IP → email + a 100/15min IP ceiling; `strictLoginRateLimit` → 200/IP/hr. ONE endpoint, TWO lines of NFR4.4. | Awwal + a dev-story | ✅ **the only blocker** |
| **B — Field ops** | the re-run itself: resend the 7 `invited`, recreate the 10 `active`, **provision REAL addresses (§0.1a)** | Awwal | — |
| **C — Governance (this SCP, §1–5)** | the normative two-axis rule, IP floor ≥100, reclassifying all 32 limiters, coverage-test enforcement, `mfa`/`refresh`/`edit-token` re-keys, doc reconciliation | **John (PM)** | ❌ no |

### Why Lane A does not need the restructure agreed first

**NFR4.4 already contains a precedent for exactly this shape of change.** The 2026-06-03
`skipSuccessfulRequests` amendment was a UAT-driven, mid-flight change to a login limiter, written
into NFR4.4 with its rationale, without a restructure. Lane A is the same class: a threshold-and-key
amendment to one named control, with evidence. It is **not** the normative rule — that is Lane C.

### The re-run path, traced end-to-end — login is the ONLY broken link

| step | control | state |
|---|---|---|
| invitation → activation | `activationIpFloodLimit` 300/IP + `activationRateLimit` 20/**token** | ✅ fixed 2026-09-15 |
| **login** | `strictLoginRateLimit` **10/IP/hr counting successes** + `loginRateLimit` 5 failed/IP/15min | ⛔ **Lane A** |
| capture (wizard submit) | `registrationRateLimit` 50/IP/15min → `registrationEmailRateLimit` 3/email/15min | ✅ already two-axis |
| password reset (recovery) | token-keyed 20/15min + 300/IP ceiling | ✅ fixed `1e7b878` |

⚠️ **Capture headroom is real but not generous:** 17 enumerators at Adedeji Adetola's *measured*
rate (14 captures in 2h48m ≈ 1 per 12 min) is ≈21 submits/15min against a 50 ceiling — **2.4×**.
Adequate; **watch it, do not widen it speculatively.**

### Lane A: the two options, and why the cheap one is the bad one

- ~~**(a) Raise the IP ceilings only** (~30 min).~~ ⛔ **BOTH OPTIONS BELOW ARE SUPERSEDED — the final position is 60/IP/hr WITH `skipSuccessfulRequests`, plus lockout decay as the blocking precondition. Do not act on either.** Kept for the reasoning only. `strictLoginRateLimit` 10 → 200/IP/hr,
  `loginRateLimit` 5 → 50/IP/15min. ⛔ **This genuinely trades security for availability**: at 50,
  an attacker gets 50 accounts per 15 min at one password each — a real credential-spray window.
  The per-account lockout still bounds attacks on ONE account, but the spray across MANY is what
  the 5/IP burst was uniquely buying.
- **✅ (b) Re-key `loginRateLimit` to the submitted email** + a 100/15min IP flood ceiling, and
  raise `strictLoginRateLimit` to 200/IP/hr (~2–3 h with tests). **No trade at all.** Per-account
  protection gets *tighter* (5 failed per email beats 5 failed per IP shared among strangers),
  spray stays bounded by the ceiling, account lockout untouched.

~~⭐ **RECOMMENDED: (b).**~~ ⛔ **SUPERSEDED — (b)'s re-key was approved, but its 200/IP/hr ceiling was withdrawn as moot and the sustained limiter also became failed-only. See the status banner.** It is slower by ~2 hours and is the only option that costs nothing. And it
invents nothing — `registration.routes.ts` already ships this exact shape and calls it a
*"CGNAT-tolerant flood-stop"* in its own comments. Lane A copies a shipped pattern onto one more
route.

⚠️ **Process note:** a login rate-limit change is a substantive security-behaviour change, so per
`[[feedback_code_review_no_story_dev]]` it routes to a **dev-story + adversarial code review**, not
an inline adjudication fix. The two already-shipped fixes (activation, reset) were live production
incidents; this one is a *foreseeable* incident, which is a different bar.

---

## Section 1 — Issue Summary

**NFR4.4 licenses "IP Throttling" as a blanket technique. In this market an IP is not a person, and that licence has turned real users away four times.**

Nigerian carriers use CGNAT, and **Opera Mini — among the most-used mobile browsers here — proxies every user through a handful of servers.** A per-IP budget is therefore shared between strangers. Four incidents, each on a different endpoint, each found only because somebody complained:

| date | endpoint | limit | measured harm |
|---|---|---|---|
| 2026-08-05 | registration | 5 / IP / 15 min | **36 real citizens blocked** across 5 carrier ranges, on the morning 75 invitations went out |
| 2026-09-07/08 | activation | 10 / IP / 15 min | **244 refusals from SIX addresses** — reverse DNS `opera-mini.net` / `NO-OPERA-AMS-MINI` — right after 17 field enumerators were invited |
| 2026-09-16 | password-reset completion | 5 / IP / 15 min | mounted on the **page load** as well as the submit, so opening the reset link spent a slot; 3 refusals logged, and the user-visible error loops back to "request a new link" |
| **open** | login (burst + sustained) | 5, and **10 / IP / hour counting successes** | has not fired at scale because the cohort has not logged in yet. **The enumerator re-run puts 17 first-time logins through it.** |

### The precise defect, which is not what it first looks like

A sweep of **all 32 limiters** (`apps/api/scripts/audit-rate-limit-keys.ts`) shows the PRD's *named* thresholds are mostly sound:

| NFR4.4 threshold | axis | incidents |
|---|---|---|
| Password Reset — 3 / **email** / hour | person | none |
| Profile Edit Token — 3 / **NIN** / day | person | none |
| Contact Reveal — 50 / **authenticated user** / 24h | person | none |
| API General — 100 / **user** / min | person | none (not yet implemented) |
| MFA per-user lockout — 5 / **user** / 15 min | person | none |
| Login burst / sustained / MFA gate | **IP** | ⚠️ open risk |
| ~~Cumulative block~~ | ❌ **MY ERROR — it is per-ACCOUNT** | writes `users.lockedUntil` keyed on the user; a per-IP cumulative block **has never existed in the code**. The PRD said "on the IP" from the day it was written; 13-68 corrected it. |
| Marketplace Search — 30 / IP / min | IP | none (generous enough so far) |

**Wherever the PRD named a person axis, the implementation honoured it — in the service layer — and then someone ALSO bolted a small per-IP limiter onto the route as "defense-in-depth".** `PasswordResetService.checkRateLimit` really does enforce 3/email/hour; `marketplace-edit.service.ts:66` really does enforce 3/day/NIN. **Every one of the four incidents came from a bolted-on IP limiter that NFR4.4 never specified, never risk-assessed, and never counted.**

So there are two distinct faults, needing two distinct remedies:

1. **A governance gap.** 26 of 32 limiters have no NFR4.4 entry. The preamble's blanket "and IP Throttling" licensed them. Nothing required an author to state *whose* traffic a limit bounds, so the default was `req.ip` — because it is always in scope.
2. **A modelling error in the login thresholds**, which genuinely are specified per-IP, and one of which (`strictLoginRateLimit`, 10/IP/hour) **counts successful logins**.

### Why this kept recurring

Each fix swept only its own endpoint. Registration was fixed 2026-08-07 and its siblings were never swept, so activation carried the identical flaw for five more weeks. Activation was fixed 2026-09-15 and its siblings were not swept either, so password reset surfaced the next day.

⭐ **The knowledge even existed in-repo and never travelled.** In May, the magic-link peek endpoint was deliberately left unlimited with this rationale: *"a per-IP limiter would need careful tuning to avoid blocking legitimate users on shared NATs."* Correct, written down, and never applied to the neighbouring routes.

⛔ **And the 2026-05-10 BMAD compliance audit certified NFR4.4 as PASS.** It verified that each endpoint *had* a limiter matching its *documented threshold*. It could not have caught this, because what is wrong is the documented threshold's **axis**. A coverage audit that never asks "whose traffic is this counting?" is measuring a different property from the one that matters.

### Blast-radius note, for honesty in the record

All four defects are **invisible in the database**. A refused request carries no user id, so the victim's row reads "invited, never activated" or "activated, never logged in" — which an operator reads as apathy. Two enumerators previously filed as *"no attempt recorded"* had in fact tried 6 and 5 times. **The absence of evidence here is manufactured by the defect itself**, which is why all four surfaced through complaints rather than monitoring.

---

## Section 2 — Impact Analysis

- **PRD:** `_bmad-output/planning-artifacts/prd.md` **NFR4.4** — normative rewrite (Section 4). This is the fundamental change requiring PM concurrence.
- **Architecture:** ADR-015 § *"Rate-limit semantics post-9-13 close-out"* — extend with the identity-axis model; the existing four-layer login matrix is re-expressed on two axes rather than four IP layers.
- **Security posture:** `docs/security-posture-stride-mapping-2026-04-20.md` asserts **NFR4.4 = PASS** in three places. Those claims were true against the old text and must be re-stated against the new one, naming the availability failure mode — this control class can deny service to legitimate users, which the STRIDE mapping currently does not consider.
- **Compliance record:** `docs/bmad-compliance-restoration-2026-05-10.md` F2 — add a correction note. The audit was correctly executed against a specification that was itself wrong; leaving it uncorrected implies the property was verified.
- **Enforcement point:** `apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts` — the 22-entry coverage map gains a required **`axis`** field. This is the control that stops instance #5.
- **Epic/story impact:** three fixes already shipped (`6284d19`, `1e7b878`, and the 2026-09-15 activation fix). **One new story** for the login axis — security-sensitive, must not be an inline fix.
- **No schema migration.** Redis keys only; new prefixes mean new buckets, so cutover is a restart with no data step.

---

## Section 3 — Recommended Approach

**Adopt a two-axis model as a normative PRD rule, rather than tuning numbers endpoint by endpoint.** Numbers drift; a rule about *whose traffic a limit counts* does not.

Every rate limit serves exactly one of two jobs, and the job determines the key:

| | **Person axis** | **Flood axis** |
|---|---|---|
| **Job** | shape one actor's behaviour; make abuse of a specific account or resource expensive | stop a spray from one host exhausting the service |
| **Key** | the per-person identifier the request already carries — `email`, `nin`, `userId`, or a single-use `token` | client IP, resolved via `real-ip.ts`, never raw `req.ip` |
| **Budget** | sized for ONE person's legitimate use | sized for the **largest legitimate group behind one address** — hundreds, not tens |
| **Shared between strangers?** | no | **yes — which is precisely why it must be generous** |

### The three normative rules

1. ⭐ **Every rate limit MUST declare its axis.** No limiter ships without a row in the NFR4.4 table naming its key. The blanket "IP Throttling" licence is withdrawn.
2. ~~⛔ **An IP-keyed budget small enough for one person to exhaust is a defect.** Floor: **≥ 100 per window**.~~ ❌ **REJECTED BY THE PM RULING — 14 of 20 per-IP limiters fail this floor, and §0 of this very document blesses `registrationRateLimit` at 50 while this rule forbids it. Replaced by exposure tiers + a response-mode clause.** Original text: Floor: **≥ 100 per window**. If a limit needs to be tighter than that, it is a person-axis limit and needs a person key.
3. ⚠️ **Both axes, not one.** Dropping the IP ceiling when adding a person key is a *regression* — an attacker spraying 1,000 random tokens would get 1,000 separate buckets, i.e. no limit at all. The person key shapes experience; the IP key stops floods.

Two supporting requirements:

4. **Observability:** every 429 logs `keyedBy: 'token' | 'email' | 'user' | 'ip'`. Without it the next investigation has to reverse-DNS a handful of addresses to discover a limit was per-proxy — which is literally how the activation defect was found.
5. **The tell, monitored:** a high refusal count concentrated on a *small* number of distinct IPs is a proxy, not an attack. Six addresses producing 244 refusals should raise an alert, not a shrug.

### The login recommendation specifically — the security-sensitive part

This is where the PM agent's scrutiny is most needed, because loosening a login control deserves it. The position:

- **`loginRateLimit` (burst, 5 FAILED / 15 min): re-key from IP → submitted email.** Keep `skipSuccessfulRequests`. This *improves* the control: it bounds attempts against **the account being attacked**, which is the actual threat, instead of against whoever happens to share the attacker's proxy. Add an IP flood ceiling (**100 / 15 min**) so email-rotation stays bounded.
- ⛔ **`strictLoginRateLimit` (sustained, 10 / IP / hour, ALL responses counted) — raise to a flood ceiling of 200 / IP / hour.** Its stated purpose is *"catches sustained activity including successful brute-forces."* **A per-IP counter is not what stops a successful brute-force** — by definition the attacker already has the password; what stops them is the per-account lockout and MFA. Meanwhile this layer refuses the **11th legitimate login in an hour from a shared address**, which is exactly the enumerator cohort.
- ✅ **The account axis is already built and stays untouched:** `auth.service.ts` `MAX_FAILED_ATTEMPTS = 5`, `EXTENDED_LOCKOUT_THRESHOLD = 10` → 30-minute lock on `users.lockedUntil`. This is the real defence, and it is per-person by construction.
- ⚠️ **One genuine gap the PM should weigh:** the account lockout only protects accounts that **exist**. A wrong-address attempt returns `user_not_found` and increments nothing — which is exactly how 36 failed enumerator logins left `failed_login_attempts = 0` on every row. **Enumeration of non-existent accounts is a real job for the IP ceiling** — but a ceiling of 100–200, not 10.
- **`mfaRateLimit` / `refreshRateLimit`:** both run *after* identity is known (post-password, or from a refresh cookie). Re-key to `userId` with an IP ceiling. Lower urgency; fold into the same story.

**Net security effect:** on the axis that matters — attempts against one account — protection is unchanged or better (5 failed/email/15min is *tighter* per-account than 5 failed/IP shared among many). What is deliberately relaxed is the collateral: strangers no longer spend each other's budget.

---

## Section 4 — Detailed Change Proposals

### 4.1 PRD NFR4.4 — proposed replacement structure

> **NFR4.4 Defense-in-Depth:** Rate Limiting (Redis), Honeypots, strict Content Security Policy (CSP), and per-IP flood ceilings.
>
> **NFR4.4.a — Identity axis (NORMATIVE).** Every rate limit MUST declare the identifier it counts against ("axis"), and MUST appear in the NFR4.4.c table. Two axes only:
> - **Person axis** — keyed on an identifier the request already carries (`email`, `nin`, `userId`, or a single-use `token`). Sized for one person's legitimate use.
> - **Flood axis** — keyed on client IP resolved via `real-ip.ts`. **Minimum budget 100 per window.** A tighter IP budget is prohibited: see NFR4.4.b.
>
> **NFR4.4.b — Population constraint (RATIONALE).** In the Oyo State operating environment an IP address does not identify a person. Nigerian carriers use CGNAT, and Opera Mini proxies users through a small pool of servers. Measured: **244 refusals originated from 6 addresses** (2026-09-07/08); **36 citizens blocked across 5 carrier ranges** (2026-08-05). A per-IP budget is therefore shared between strangers, and a small one is an availability defect that presents as user apathy — refused requests carry no user id, so the victim is invisible in the database.
>
> **NFR4.4.c — Thresholds.** [full table, every limiter; columns: Control · Axis · Budget · Window · Rationale · Code reference]
>
> **NFR4.4.d — Governance.** A new limiter without an NFR4.4.c row fails `rate-limit-coverage.test.ts`. Every 429 response logs `keyedBy`. Refusals concentrated on few distinct IPs are alerted as a proxy signature, not as abuse.

### 4.2 Threshold table — proposed values

| Control | Axis | Budget | Status |
|---|---|---|---|
| Login burst (`loginRateLimit`) | **email** (was IP) | 5 failed / 15 min | **CHANGE — new story** |
| Login flood ceiling | IP | 100 / 15 min | **NEW — new story** |
| Login sustained (`strictLoginRateLimit`) | IP | **200 / hour** (was 10) | **CHANGE — new story** |
| Account lockout (`users.lockedUntil`) | user | 5 → warn, 10 → 30 min lock | unchanged, already correct |
| MFA gate (`mfaRateLimit`) | **userId** (was IP) | 10 / min | CHANGE — new story |
| MFA per-user lockout | user | 5 / 15 min | unchanged |
| Refresh (`refreshRateLimit`) | **userId** (was IP) | 10 / min | CHANGE — new story |
| Registration (`registrationRateLimit`) | IP ceiling | 50 / 15 min | shipped 2026-08-07 |
| Registration email (`registrationEmailRateLimit`) | email | 3 / 15 min | shipped |
| Activation (`activationRateLimit`) | **invitation token** | 20 / 15 min | shipped 2026-09-15 |
| Activation flood (`activationIpFloodLimit`) | IP | 300 / 15 min | shipped |
| Password reset request | email (service) | 3 / hour | unchanged — NFR4.4 as written |
| Password reset request flood | IP | 200 / hour (was 10) | shipped `1e7b878` |
| Password reset completion | **reset token** | 20 / 15 min | shipped `1e7b878` |
| Password reset completion flood | IP | 300 / 15 min | shipped `1e7b878` |
| Edit token request | NIN (service) | 3 / day | unchanged — NFR4.4 as written |
| Edit token request flood | IP | 100 / hour (was 10) | **CHANGE — new story** |
| Marketplace search | IP | 30 / min | **PM decision — see open question** |
| Contact reveal | authenticated user | 50 / 24h | unchanged |
| API general | user | 100 / min | unchanged (unimplemented) |

### 4.3 Enforcement change

`rate-limit-coverage.test.ts`'s coverage map gains a required `axis: 'person' | 'flood'` plus `key` and `budget`. The suite then asserts: (a) every router limiter has a map entry; (b) every `flood` entry has budget ≥ 100; (c) every `person` entry names a non-IP key.

**This is the control that prevents instance #5.** The existing suite proves a limiter *exists* — which is exactly why it stayed green through all four incidents.

---

## Section 5 — Implementation Handoff

**For John (PM) — decide and author:**

1. Concur (or not) with the two-axis model as normative NFR4.4 text.
2. **Rule on the login recommendation.** This is the one real security trade: per-account bounding improves, per-IP collateral relaxes. The reasoning is §3; the counter-argument worth testing is credential-stuffing across many accounts from one host, which the 100/15min ceiling is sized for.
3. **Open question:** marketplace search is 30/IP/min with no person axis available (public, unauthenticated). 30/min for a whole Opera Mini pool is plausible to hit at scale. Options: raise to a true ceiling (300/min), or accept and monitor. ⚠️ There is **no evidence of harm** here — the marketplace has never seen that load — so this is the **weakest-evidence item in the proposal** and is flagged as such rather than bundled in.
4. Author NFR4.4.a–d plus the 4.2 table into the PRD.

**For Bob (SM) — one story via `*create-story`:**

- Re-key `loginRateLimit` → email; add the login IP ceiling; raise `strictLoginRateLimit`; re-key `mfaRateLimit` and `refreshRateLimit` → userId; raise `editTokenRequestRateLimit`'s ceiling.
- Extend the coverage map with `axis`/`key`/`budget` and the three new assertions.
- ⚠️ **Sequencing: BEFORE the enumerator re-run.** 17 first-time logins, plausibly several behind one proxy, currently meet a 10/IP/hour limit that counts successes.
- ⚠️ **Guard-rail, learned the hard way:** the key-builder gets its own unit test asserting *two identities from one IP produce two keys, and one identity from two IPs produces one key*. Both shipped fixes have this (`activation-rate-limit-key.test.ts`, `password-reset-rate-limit-key.test.ts`); it is the assertion that actually encodes the defect.
- ⚠️ Adding an export to a rate-limit middleware module breaks every `vi.mock` with a fixed export list — silently: `undefined` middleware, a throw at import, and a report of "no tests". Sweep those in the same commit.

**Already shipped, no story needed:** activation (2026-09-15), password-reset completion + request ceiling (`1e7b878`), and the `confirmPassword` wire-contract defect (`6284d19`) that was masking the reset limiter.

**Documents to update on acceptance:** PRD NFR4.4 · architecture ADR-015 · `security-posture-stride-mapping-2026-04-20.md` (3 PASS claims) · `bmad-compliance-restoration-2026-05-10.md` F2 (correction note) · `rate-limit-coverage.test.ts` (enforcement) · `docs/adjudication-agent-handoff.md` §9j (already records the sweep).
