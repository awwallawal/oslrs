# Brief — Story 13-70: Limiter Hygiene, and Making a Dated Residual Fire

**Author:** Adjudication Agent · **Date:** 2026-09-17 · **For:** Bob (SM) to author Story 13-70 via canonical `*create-story`
**Origin:** Residual sweep after 13-68. Six rows were open and handed to stories that did not exist — the exact pattern that produced the rate-limit defect family.
**Tier:** Debt closure. Not field-blocking; do NOT sequence it ahead of 13-69.

---

## The job-to-be-done (the why)

**Six residuals were open and five were handed to stories nobody had written.** That is not a backlog, it is a list that looks like one.

⭐ **This project has measured what happens next.** Registration's per-IP limiter was fixed 2026-08-07 and its siblings were "handed to a sweep" — activation carried the identical defect for five more weeks. Activation was fixed 2026-09-15 and its siblings were handed to a sweep again — password reset surfaced the next day. **Three incidents, one habit.**

So this story does two things: it closes the limiter debt that is real, and it makes the remaining deferrals **mechanically enforceable**, so the next one cannot quietly expire.

## The disposition — decide, do not defer

| residual | disposition |
|---|---|
| **A1** — flood ceiling counts the 429s its own downstream limiters produce | **FIX HERE** (FR1) |
| **R5** — keyspace collision latent in the activation and reset-completion limiters | **FIX HERE** (FR2) |
| **R7** — raw unbounded email as a Redis key in `registrationEmailRateLimit` / `wizardDraftEmailRateLimit` | **FIX HERE** (FR3) |
| **R2a** — escalating lockout duration | ⛔ **CLOSE BY DECISION — won't do** (FR5) |
| **R8** — account existence revealed by login error CODES | ⛔ **CLOSE BY DECISION — product copy, John's** (FR5) |
| **R2b** — distinct-identifier cardinality monitor | keep, **dated 2026-10-15** — enforced by FR4 |

⭐ **"Won't do, and here is why" is a CLOSED residual, not an open one.** Three of six rows are decisions, not work. A ledger where half the open rows are really accepted risks makes the genuine ones invisible — which is how a real item gets lost among fake ones.

## In scope

**FR1 — A refusal is not a request.** `loginIpFloodLimit` is mounted first and counts every response, including the 429s `loginRateLimit` and `strictLoginRateLimit` emit. One person spending their own 5-failure budget and continuing to retry burns 5 real attempts plus up to 95 of their own refusals, hits the 100 ceiling, and **their whole proxy is refused for 15 minutes**.

⚠️ **This is already normative in the PRD (NFR4.4.d) and annotated as NOT YET IMPLEMENTED.** This story is what makes that clause true. Leaving it is worse than never having written it — a PRD asserting a rule the code violates is the drift class this whole arc has been closing.

⛔ **The trap, and the story must pin which behaviour shipped:** express-rate-limit applies its skip predicate in a **response listener**, so a ceiling that skips 429s will skip **its own** 429s too and stop counting at the limit. That still refuses each request, but it is not what the clause says. Decide deliberately, and assert it.
✅ **CAPTCHA refusals (400) stay counted** — the ceiling must keep bounding the hCaptcha verification call.

**FR2 — R5, keyspace collision.** `registration-rate-limit.ts:200,229` and `password-reset-rate-limit.ts:98,131` use prefix pairs where one prefix is a proper prefix of the other, so keys from two limiters can collide in Redis. Low live impact; cheap to make disjoint. Do it while the files are open.

**FR3 — R7, raw email as a Redis key.** `registrationEmailRateLimit` and `wizardDraftEmailRateLimit` key on the raw normalised email — the defect 13-68 fixed in `loginRateLimit` by hashing (`e:<sha256>`). Bounded today by their flood ceilings (50 and **1,200**/IP/15min) against a 1 MB body limit, so the wizard-draft one is the larger exposure. **Copy 13-68's `buildLoginRateLimitKey` shape**; it is already shipped, tested and reviewed.

**FR4 — ⭐ MAKE A DATE FIRE.** Extend `lint-story-residuals.ts` so a residual carrying a date **fails the build once that date passes**.

Today the guard refuses `Status: done` while a row says OPEN — which is why it caught 13-68's premature flip. But **a dated deferral is prose**: R2b says 2026-10-15 and nothing will notice on 2026-10-16. Every perishable item this project has lost was lost exactly this way — the jingle-week traffic window had a condition ("when week 1 settles") and no date, and the data aged out of pm2 retention before anyone looked.

- Parse a date from the residual's state or trigger cell (`2026-10-15` / `DATED 2026-10-15`).
- Fail when `today > date` and the row is still open.
- ⚠️ **Fail with the row's own text**, not a line number — the operator must be able to act without opening the story.
- ⚠️ **Do not make an undated residual fail.** Most rows are legitimately trigger-based ("reopen if X"). Only a row that claims a date is held to it.

**FR5 — Close R2a and R8 by decision, in the ledger, with reasons.**
- **R2a** — escalating lockout: `users` has no lock-count column, so it needs a migration; plain decay leaves ~10 guesses per 30 min (**~480/day**) against bcrypt, the password policy and MFA. ⚠️ **Record 480/day as the ACCEPTED FIGURE**, so whoever revisits argues against a number instead of re-deriving the question — and state the reopen trigger: **any weakening of the password policy, or MFA ceasing to be mandatory for super-admins.**
- **R8** — login error codes distinguish locked / not-activated / suspended. The messages help real users; the response is generically safe (`user_not_found` and `invalid_password` both return the same error), and 13-68 closed the timing channel. The disclosure boundary is **response-side, not log-side** — the log distinguishes them deliberately, which is what makes the cardinality monitor possible. Accept, owner John.

## Acceptance-criteria seeds

1. A 429 emitted by any login limiter is NOT counted by another limiter on the same route — RED-verify by restoring the current behaviour.
2. A 400 from `verifyCaptcha` IS still counted by the flood ceiling.
3. Whichever self-skip behaviour ships (FR1's trap) is asserted, not incidental.
4. Two limiters with adjacent prefixes cannot collide on one key.
5. A megabyte-long "email" still yields a fixed-size Redis key in both wizard-draft and registration-email limiters.
6. The residual guard fails on a story carrying a past-dated open residual, and passes on an undated trigger-based one. **Both directions** — a guard that only fires one way is half a guard.
7. The PRD's NFR4.4.d "NOT YET IMPLEMENTED" annotation is removed in the same commit that makes it true.

## Out of scope

- The login axis itself (13-68, shipped).
- The fraud engine (13-69).
- `magicLinkRateLimit`'s 3/IP/hour on the token-bearing routes — **latent scaling risk, P2, measured 0 refusals in 14 days.** It belongs to a Lane C follow-up, not here. Record it; do not widen into it.

## Dependencies & sequencing

- **Do NOT sequence ahead of 13-69.** The fraud engine is dark and that blocks scaling the field cohort; this is debt closure and blocks nothing.
- No dependency on R-A8.
- ⚠️ **Shares files with nothing currently in flight** — but confirm before starting: 13-69 touches `submission-processing.service.ts` and the fraud queue, not the limiters.
