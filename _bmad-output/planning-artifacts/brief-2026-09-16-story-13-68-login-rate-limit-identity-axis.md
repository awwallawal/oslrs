# Brief — Story 13-68: Login Rate Limiting by Person, Not by Proxy

**Author:** Adjudication Agent · **Date:** 2026-09-16 · **For:** Bob (SM) to author Story 13-68 via canonical `*create-story`
**Origin:** SCP `sprint-change-proposal-2026-09-16-rate-limit-identity-axis.md` **Lane A** (Section 0). Lanes B and C do NOT gate this story, and this story does not wait on them.
**Decision:** Awwal, 2026-09-16 — re-key to email (not the cheaper ceiling-raise), via dev-story + adversarial code review.
**Tier:** ⚠️ **Field-blocking.** Sequence BEFORE the enumerator re-run.

---

## The job-to-be-done (the why)

**Seventeen enumerators are about to log in for the first time, and the login limiter counts their traffic by proxy IP.**

`strictLoginRateLimit` allows **10 attempts per IP per hour and counts SUCCESSFUL logins**. Opera Mini — among the most-used mobile browsers in Nigeria — proxies every user through a handful of servers; we measured **244 activation refusals originating from SIX addresses**, reverse DNS `opera-mini.net` / `NO-OPERA-AMS-MINI`, during the last cohort. If several enumerators share a proxy, **the 11th person to log in that hour is refused for succeeding.**

`loginRateLimit` (5 FAILED / IP / 15 min) has the same shape. It already did damage indirectly: **36 wrong-address login failures** from at least 7 enumerators (the §0.1a plus-addressing problem). Anyone sharing a proxy with them was spending their budget on someone else's typo.

This is **the fourth instance** of one defect class. Registration (2026-08-05, 36 citizens blocked), activation (2026-09-07/08, 244 refusals), password-reset completion (2026-09-16) — all fixed. Login is the last one on the enumerator's path, and the only one still broken.

⭐ **The mechanism is NOT new to this codebase.** `registration.routes.ts` already ships exactly this shape and names it in its own comments: *"`registrationRateLimit` (50/IP/15min, a crude CGNAT-tolerant flood-stop) THEN `registrationEmailRateLimit` (3/normalised-email/15min)"*. This story copies a shipped, documented pattern onto one more route.

## In scope — one endpoint pair, two axes

**FR1 — `loginRateLimit` keys on the submitted email, not the IP.** 5 FAILED attempts per normalised email per 15 minutes. Keep `skipSuccessfulRequests: true`. The email is in `req.body.email`; `app.ts` mounts `express.json` (line 331) before the router (line 350), so the body IS parsed when route middleware runs — same as the reset-token fix.

**FR2 — NEW `loginIpFloodLimit`, 100 / IP / 15 min.** The only key strangers share, so it is sized for the worst legitimate case behind one address. Mounted BEFORE the per-email limiter on both `/auth/staff/login` and `/auth/public/login` (and the two `/login/mfa*` routes, which carry the same pair).

**FR3 — `strictLoginRateLimit` 10 → 200 / IP / hour.** It becomes a pure flood ceiling. Its stated purpose — *"catches sustained activity including successful brute-forces"* — is not something a per-IP counter can do: by definition the attacker already has the password. What stops that is the per-account lockout and MFA, both untouched.

**FR4 — the 429 log records `keyedBy: 'email' | 'ip'`.** Without it the next investigation has to reverse-DNS a handful of addresses to discover a limit was per-proxy — which is literally how the activation defect was found.

**FR5 — PRD amendment (2 lines, NOT a restructure).** Under NFR4.4's existing login block, amend the burst limiter's axis and the sustained limiter's threshold, with the evidence. ⭐ **Precedent to follow exactly: the 2026-06-03 `skipSuccessfulRequests` amendment**, which was a UAT-driven mid-flight change to this same limiter, written in with its rationale and no restructure. Lane C (the normative two-axis rule) is John's, separately.

## Security model — read this twice, it is the whole argument

**Nothing here is a net loosening.** The axes:

| threat | control | effect of this story |
|---|---|---|
| brute-force ONE account | per-email burst (FR1) + `users.lockedUntil` (5 → warn, 10 → 30-min lock, `auth.service.ts`) | **TIGHTER.** 5 failed per *email* beats 5 failed per *IP shared among many* |
| credential spray across MANY accounts from one host | `loginIpFloodLimit` 100/15min (FR2) | bounded, and sized deliberately |
| sustained successful brute-force | per-account lockout + MFA | unchanged — and never was the IP counter's job |
| enumeration of accounts that DON'T exist | `loginIpFloodLimit` | ⚠️ **the one real gap: a `user_not_found` attempt increments NOTHING account-side** — which is exactly why 36 failed enumerator logins left `failed_login_attempts = 0` on every row. The IP ceiling is the only bound here, so **do not remove it and do not raise it further.** |

⛔ **Do NOT drop the IP ceiling when adding the person key.** That would be a regression: an attacker rotating emails would mint a fresh bucket per address, i.e. no limit at all. Two keys, two threats.

## Acceptance-criteria seeds (refine in the story)

1. Two different emails from the SAME IP get independent burst budgets.
2. One email from two different IPs shares ONE budget (a phone changing network mid-session).
3. The per-IP flood ceiling still fires at 100/15min — prove the limiter is alive, not merely absent.
4. `skipSuccessfulRequests` still holds: successful logins do not consume the per-email budget.
5. `strictLoginRateLimit` fires at 200, not 10.
6. Account lockout behaviour is unchanged (`MAX_FAILED_ATTEMPTS = 5`, `EXTENDED_LOCKOUT_THRESHOLD = 10`) — assert it, do not assume it.
7. A 429 from either limiter logs `keyedBy`.
8. `rate-limit-coverage.test.ts` still passes, and its doc table is corrected in the same commit.

## Implementation notes the dev will otherwise rediscover the hard way

- ⚠️ **`vi.mock` with a fixed export list.** Adding `loginIpFloodLimit` to `login-rate-limit.ts` breaks every test that mocks that module with an explicit export list — silently: the mocked middleware is `undefined`, the router throws at import, and the file reports **"no tests"** rather than a failure. This cost a re-push on 2026-09-15 (three files) and again on 2026-09-16 (two). **Grep for mocks of the module and patch them in the same commit.**
- ⚠️ **`ipKeyGenerator` is mandatory on any IP fallback.** An IPv6 subscriber holds a whole prefix and can mint a fresh bucket by rotating low bits. The library's `ERR_ERL_KEY_GEN_IPV6` warning is a `toString()` grep and proves nothing.
- ✅ **Two working references, copy their shape:** `buildActivationRateLimitKey` (`registration-rate-limit.ts`) and `buildPasswordResetCompletionKey` (`password-reset-rate-limit.ts`), each with a dedicated key-builder unit test. **The key-builder gets its own test — that is the assertion that actually encodes the defect**, and it must be RED-verified by restoring the old key.
- **Normalise the email before keying** (lowercase + trim) so `A@x.com` and `a@x.com ` are ONE bucket. `emailSchema` already does this; `registrationEmailRateLimit` has the precedent.
- ⚠️ **Resolve the IP via `real-ip.ts`, never raw `req.ip`.** After Cloudflare proxying, `req.ip` can be the CF edge address, which buckets all CF-served users together — infra playbook pitfall #19.
- **No test currently pins the login MAX values** (verified 2026-09-16); they live only in `rate-limit-coverage.test.ts`'s header comment table. So the numbers are free to change — **and the comment table must be corrected in the same commit**, or the record drifts from the work.
- Heads-up: that same table still carried `activationRateLimit | 10/IP/15min` a day after it became 20/token. It is now correct; keep it that way.

## Out of scope — do NOT widen this story

- `mfaRateLimit`, `refreshRateLimit`, `editTokenRequestRateLimit` re-keys → **Lane C**, John's SCP.
- The normative NFR4.4 two-axis rule, the ≥100 IP floor as policy, reclassifying all 32 limiters, and the `axis` field in the coverage map → **Lane C**.
- Marketplace search (30/IP/min) → Lane C, and explicitly flagged there as the weakest-evidence item: no observed harm.
- §0.1a plus-addressed provisioning → **not code.** It is Awwal's provisioning decision for the re-run.

## Dependencies & sequencing

- **Depends on:** nothing. Activation and password-reset are already fixed and deployed.
- **Blocks:** the enumerator re-run (Lane B). ⚠️ **Land this first.**
- **Does not block, and is not blocked by:** the SCP's Lane C. This story is a strict SUBSET of Lane C's target state, so there is no rework either way.
