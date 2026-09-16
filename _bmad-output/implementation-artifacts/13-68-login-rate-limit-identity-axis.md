# Story 13.68: Login rate limiting by person, not by proxy

Status: review

<!-- Authored 2026-09-16 via canonical *create-story from the adjudication brief
`_bmad-output/planning-artifacts/brief-2026-09-16-story-13-68-login-rate-limit-identity-axis.md`
(commit b10ecda) and SCP `sprint-change-proposal-2026-09-16-rate-limit-identity-axis.md` §0 LANE A.
Awwal's ruling 2026-09-16: re-key to the submitted email (NOT the cheaper ceiling-raise), delivered via
dev-story + adversarial code review, never inline. Every code fact below was re-verified against the tree
at b10ecda while authoring — where the brief and the code disagree, the code wins and the disagreement
is called out (see "Corrections to the brief"). -->

> ⚠️ **FIELD-BLOCKING. Land before the enumerator re-run (SCP Lane B).** Seventeen enumerators are about
> to log in, and today `strictLoginRateLimit` allows **10 logins per IP per hour — counting SUCCESSES**.
> Behind one Opera Mini proxy the 11th enumerator that hour is refused *for succeeding*.

## Story

**As** a field enumerator (or any staff/public user) logging in from a phone behind Opera Mini or a
carrier CGNAT address shared with strangers,
**I want** the login rate limits to count *my* failed attempts rather than everyone's traffic on my
proxy,
**so that** I am never refused because other people — or other people's typos — share my IP, while a
credential spray from one host is still bounded.

## Context — why this story exists

This is the **fourth instance** of one defect class, and login is the last one on the enumerator's path:

| date | endpoint | limit | measured harm | status |
|---|---|---|---|---|
| 2026-08-05 | registration submit | 5/IP/15min | 36 citizens blocked across 5 carrier ranges | fixed (two-axis) |
| 2026-09-07/08 | activation | 10/IP/15min | **244 refusals from SIX addresses**, reverse DNS `opera-mini.net` | fixed 2026-09-15 |
| 2026-09-16 | reset completion | 5/IP/15min | page-load spent a slot | fixed `1e7b878` |
| **open** | **login** | 5 failed/IP/15min + **10/IP/hr counting successes** | 36 wrong-address failures (§0.1a) spent strangers' budgets | **THIS STORY** |

⭐ **The mechanism is not new.** `registration-rate-limit.ts` ships exactly this shape (IP flood ceiling →
per-email limiter), as does `password-reset-rate-limit.ts` (IP flood ceiling → per-token limiter). This
story copies a shipped, documented, tested pattern onto the login routes.

### The login stack today (verified at b10ecda)

`apps/api/src/routes/auth.routes.ts` mounts the pair on **four** routes:

| route | line | body carries | stack |
|---|---|---|---|
| `POST /staff/login` | 34 | `{ email, password, captchaToken, rememberMe }` | `strictLoginRateLimit, loginRateLimit, verifyCaptcha, AuthController.staffLogin` |
| `POST /public/login` | 42 | `{ email, password, captchaToken, rememberMe }` | `strictLoginRateLimit, loginRateLimit, verifyCaptcha, AuthController.publicLogin` |
| `POST /login/mfa` | 175 | `{ mfaChallengeToken, code }` — **NO email** | `strictLoginRateLimit, loginRateLimit, mfaRateLimit, verifyCaptcha, MfaController.loginMfa` |
| `POST /login/mfa-backup` | 184 | `{ mfaChallengeToken, code }` — **NO email** | same |

`apps/api/src/middleware/login-rate-limit.ts`:
- `loginRateLimit` — prefix `rl:login:`, 15 min, `max: 5`, `skipSuccessfulRequests: true`, **no
  `keyGenerator`** (library default = IP), 429 code `AUTH_RATE_LIMIT_EXCEEDED`, log event
  `auth.rate_limit_exceeded`.
- `strictLoginRateLimit` — prefix `rl:login:strict:`, 1 hour, `max: 10`, **all responses counted**, 429
  code `AUTH_IP_BLOCKED`, log event `auth.ip_blocked` with `reason: 'excessive_failures'` (which is false —
  it counts successes too).

## Acceptance Criteria

1. **AC1 — Two people, one proxy, two budgets.** On `/staff/login` and `/public/login`, `loginRateLimit`
   keys on the submitted email. Two different emails from the SAME IP get independent 5-failure budgets:
   exhausting email A's budget (6th failed attempt → 429) does NOT refuse email B from that IP.
2. **AC2 — One person, two networks, one budget.** The same email from two different IPs shares ONE
   budget (a phone changing network mid-session is still one person; an attacker rotating IPs against one
   account gains nothing).
3. **AC3 — Normalisation.** `A@X.com`, `a@x.com` and `  a@x.com  ` are ONE bucket.
4. **AC4 — Fallback is IP, IPv6-safe.** A request with no usable email (missing, blank, non-string —
   including both MFA routes, whose body has no email) keys on the IP via `ipKeyGenerator`. Two IPv6
   addresses in one /56 collapse to ONE key; two different prefixes stay apart.
5. **AC5 — `skipSuccessfulRequests` still holds.** Successful (2xx) logins do not consume the per-email
   budget: an email may succeed any number of times and still have its 5 failures available.
6. **AC6 — The IP flood ceiling is ALIVE, not merely present.** A new `loginIpFloodLimit`
   (100 requests / IP / 15 min, all responses counted, own Redis prefix) is mounted BEFORE `loginRateLimit`
   on all four routes. Request 101 from one IP in the window → 429, even when every request uses a
   different email (the spray case). Request 100 → allowed.
   *[Final scope 2026-09-16: **LOAD-BEARING.** With strict counting failures only (AC7), this is the only
   login limiter that counts successful responses — the only bound on successful request volume per IP.
   Proven alone (100 allowed / 101st refused, successes counted) AND through the production stack: 100
   successful logins from one IP are served and the 101st is refused by THIS limiter, not strict. (An earlier
   addendum called it non-binding; that was true only while strict counted all responses and is reversed.)]*
7. **AC7 — `strictLoginRateLimit` is ~~a flood ceiling at 200/IP/hour~~ 60 FAILED/IP/hour
   (`skipSuccessfulRequests: true`), PINNED by test.** 100 successful logins from one IP are all served; then 60
   failures are allowed and the 61st → 429 `AUTH_IP_BLOCKED`; a failure spray through the production stack is
   refused at 61. The tests fail at 200, at 10, and without `skipSuccessfulRequests`. The docblock no longer
   claims it "catches successful brute-forces"; it records that **failed-only is an availability fix, not a
   security one** (an attacker generates no successes, so attacker capacity at 60 is unchanged) and that
   **60 is derived**: 3 strangers per address (17 enumerators / 6 Opera Mini addresses) × 20 failures per
   person per hour (5 per email per 15 min). Its 429 log reason is `excessive_failures` — true again now that it
   counts failures only. *[History: authored at 200 all-responses → PM ruling made 200 unsafe (mass
   account-lockout DoS) → addendum 60 all-responses → final scope 60 failed-only, PM ruling Addendum A.]*
   **Combined per-IP login budget: 60 failures/hour, at most 100 requests of any outcome per 15 minutes.**
8. **AC8 — Account lockout THRESHOLDS are unchanged, and asserted.** `MAX_FAILED_ATTEMPTS = 5`,
   `EXTENDED_LOCKOUT_THRESHOLD = 10`, `LOCKOUT_DURATION_MS = 30 min` in `auth.service.ts` are unchanged —
   pinned by a test, not assumed. *(The counter's DECAY is new — AC11.)*
9. **AC9 — Every 429 says which key it counted.** All three login limiters' handlers log
   `keyedBy: 'email' | 'ip'` (the flood and strict limiters always `'ip'`; `loginRateLimit` reports the key
   actually used). No raw email in the log beyond what `auth.login_failed` already records.
10. **AC10 — The record matches the work.** `rate-limit-coverage.test.ts` passes with the new limiter in
    each login route's `rateLimiters` list and handler minimums bumped; its header threshold table is
    corrected in the same change (login rows, the new flood row, and the stale `registrationRateLimit`
    row). PRD NFR4.4's login block is amended per FR5 (see Task 6) — an amendment, not a restructure.

**Final-scope ACs (adjudication consolidated instruction + PM ruling Addendum A, 2026-09-16):**

11. **AC11 — Lockout decays.** In `loginStaff` and `loginPublic`, when an account's `lockedUntil` has
    EXPIRED, `failedLoginAttempts` is reset to 0 (and the stale lock cleared) before the attempt is judged — so
    one wrong password after an expired lock counts as failure 1, not a re-lock. An ACTIVE lock is still
    refused with nothing written; a counter with no lock still accumulates; the 10th failure still locks for
    30 min. RED-verified: removing the reset fails the test. Escalating lock duration is NOT built (residual R2a).
12. **AC12 — One identifier field on every failure branch.** Both `invalid_password` log lines carry
    `email: normalizedEmail`, as `user_not_found` already does — distinct-identifier-per-IP is a
    single-field aggregation over `auth.login_failed`, never a union of `email` and `userId`.
13. **AC13 — Runbook.** `docs/runbooks/enumerator-prod-smoke-and-golive-gate.md` carries a short
    "staff report they are locked out" entry with
    `SELECT email, failed_login_attempts, locked_until FROM users WHERE locked_until > now();`.

## Tasks / Subtasks

- [x] **Task 1 — Key builder, test-first (AC: 1, 2, 3, 4)**
  - [x] 1.1 Create `apps/api/src/middleware/__tests__/login-rate-limit-key.test.ts` modelled on
        `password-reset-rate-limit-key.test.ts`. Cases: email key; normalisation (case + whitespace → one
        key); two emails same IP → different keys; one email two IPs → same key; missing/blank/non-string
        email → `ip:` fallback; IPv6 same-/56 collapse AND different-prefix separation; undefined IP does
        not throw.
  - [x] 1.2 RED: run it before the builder exists (fails on import) — then, after 1.3, RED-VERIFY the
        defect assertion specifically: temporarily make the builder return `ip:${ipKeyGenerator(ip)}` only
        (the old behaviour) and confirm "two emails same IP → different keys" and "one email two IPs → same
        key" FAIL. Restore by hand; record the red output in Debug Log.
  - [x] 1.3 Add `export function buildLoginRateLimitKey(email: unknown, ip: string | undefined): string` to
        `login-rate-limit.ts`: `e:${email.trim().toLowerCase()}` when a non-blank string, else
        `ip:${ipKeyGenerator(ip ?? 'unknown')}`. Import `ipKeyGenerator` from `express-rate-limit`.
  - [x] 1.4 RED-VERIFY the IPv6 case: temporarily drop `ipKeyGenerator` from the fallback, confirm the /56
        collapse test fails, restore.
- [x] **Task 2 — Re-key `loginRateLimit` (AC: 1, 2, 5, 9)**
  - [x] 2.1 Add `keyGenerator: ({ body, ip }) => buildLoginRateLimitKey((body as { email?: unknown } | undefined)?.email, ip)`
        — destructured, same as the two references. Keep `max: 5`, `windowMs: 15 min`,
        `skipSuccessfulRequests: true`, prefix `rl:login:` (the key namespace changes shape from IP to
        `e:`/`ip:`, so old IP buckets simply age out within 15 min — no migration).
  - [x] 2.2 Handler logs `keyedBy` ('email' when the body email is a non-blank string, else 'ip').
  - [x] 2.3 Rewrite the docblock: axis, the Opera Mini evidence, why the IP ceiling still exists, the
        MFA-route fallback, and which way each limit fails (see Dev Notes → "Failure direction").
- [x] **Task 3 — New `loginIpFloodLimit` (AC: 6, 9)**
  - [x] 3.1 Export `loginIpFloodLimit`: prefix ~~`rl:login:ip:`~~ `rl:login-ip-flood:` *(keyspace collision — Completion Notes #2)*, 15 min, `max: 100`, NO
        `skipSuccessfulRequests` (a flood ceiling counts everything), code `AUTH_RATE_LIMIT_EXCEEDED` (the
        web client's `useLogin.ts:143` already handles it), handler logs `event: 'auth.login_ip_flood_limit_exceeded'`,
        `keyedBy: 'ip'`. Same `store`/`validate`/`skip` shape as the siblings in this file.
  - [x] 3.2 Mount it in `auth.routes.ts` on all four routes, order:
        ~~`strictLoginRateLimit, loginIpFloodLimit, loginRateLimit, …`~~ **`loginIpFloodLimit, verifyCaptcha, loginRateLimit, strictLoginRateLimit, …`** *(adversarial review H1/M1 — the authored order let a captcha-less request spend anyone's budget and charged a person's own 429s to their proxy)*. Update the "Layer" comment above
        `/staff/login`.
  - [x] 3.3 ⚠️ Patch every `vi.mock` of `login-rate-limit.js` that uses a fixed export list — at b10ecda:
        `routes/__tests__/magic-link.routes.test.ts:41` and `routes/__tests__/sms-otp.routes.test.ts:34`.
        Add `loginIpFloodLimit` (and `buildLoginRateLimitKey` is not needed by routes, but verify). Re-grep
        at dev time (`grep -rn "login-rate-limit" apps/api/src --include=*.test.ts`) — do not trust this list.
        Confirm both files still report their real test counts afterwards, NOT "no tests".
- [x] **Task 4 — `strictLoginRateLimit` → ~~200/IP/hour~~ 60 FAILED/IP/hour (AC: 7, 9)** *(⚠️ review M5: 4.1/4.3 below are the AUTHORING round; the shipped shape is Task 8.1)*
  - [x] 4.1 `max: 10` → ~~`max: 200`~~ `max: 60` + `skipSuccessfulRequests` (Task 8.1), with a comment at the constant: what it now bounds (sustained flood
        from one host), which way it fails, the evidence, and the reopen trigger.
  - [x] 4.2 Docblock: remove the "catches successful brute-forces" claim; state that a successful brute
        force is stopped by per-account lockout + MFA, not an IP counter.
  - [x] 4.3 Handler log: `keyedBy: 'ip'`; ~~replace `reason: 'excessive_failures'` with a truthful reason
        (e.g. `'sustained_ip_volume'`)~~ `reason: 'excessive_failures'` KEPT — true again once strict counts failures only (Task 8.1). Keep the `event: 'auth.ip_blocked'` name and the `AUTH_IP_BLOCKED`
        response code unchanged (dashboards/clients may key on them — out of scope to rename).
- [x] **Task 5 — Prove the limiters BIND (AC: 1, 2, 5, 6, 7, 8)**
  - [x] 5.1 Create `apps/api/src/middleware/__tests__/login-rate-limit.binding.test.ts`: a minimal express
        app (`express.json()`, `app.set('trust proxy', true)` so tests can set `X-Forwarded-For`) mounting
        the REAL `strictLoginRateLimit, loginIpFloodLimit, loginRateLimit` in production order before a stub
        handler that returns 401 or 200 based on the body. Drive it with `supertest` (already a devDep).
  - [x] 5.2 Test mode skips these limiters (`skip: shouldSkipRateLimit` → `isTestMode()`), but `skip` is
        evaluated PER REQUEST while the store (memory in test mode) and `validate` are fixed at import. So:
        import under test mode, then `vi.stubEnv('VITEST','')`, `vi.stubEnv('NODE_ENV','development')`,
        `vi.stubEnv('E2E','')` in the tests, `vi.unstubAllEnvs()` after. Assert first that a limiter is NOT
        skipped (a sentinel test that would fail if stubbing didn't take) — otherwise every "allowed"
        assertion below passes over a hole.
  - [x] 5.3 Both directions for every limit: AC1 (email A: 5 failures allowed, 6th → 429; email B same IP
        → still 401 not 429); AC2 (email A from IP2 after exhausting on IP1 → 429); AC5 (N successes then 5
        failures still allowed); AC6 (100 distinct-email requests from one IP allowed, 101st → 429 with the
        flood limiter's log event, not strict's; a different IP still allowed); AC7 (~~200 allowed, 201st~~ 60 failures allowed, 61st → 429; successes free).
        Use unique IPs/emails per test (the memory store persists across tests in a file) or `resetKey`.
        *(⚠️ review M5/M4: the next four lines are the authoring round. AC7 IS now proven through the production stack (spray refused at 61), and the "full stack" is read from the real router, captcha included — no longer hand-built.)*
        ⚠️ **AC7 CANNOT be proven through the full stack:** the flood ceiling (100/15min) binds at request
        101, long before strict's 200/hour. Test `strictLoginRateLimit` on a SECOND app that mounts it alone
        (still in production order relative to nothing else). Likewise AC6 through the full stack is valid
        only because strict (200) sits above flood (100) — assert the 429's log event/limiter identity so the
        test cannot pass on the wrong limiter.
  - [x] 5.4 RED-VERIFY each: remove the `keyGenerator` (AC1/AC2 must fail); unmount `loginIpFloodLimit`
        from the test app (AC6's 101st request is then allowed by strict → test must fail); set strict back to
        10 (AC7's ~~"200 allowed"~~ "60 failures allowed" must fail); remove `skipSuccessfulRequests` (AC5 must fail). Restore each by
        hand; record every red output in Debug Log.
  - [x] 5.5 AC8: add a sentinel asserting the lockout constants. They are module-private `const`s in
        `auth.service.ts` today — export them (named exports, no behaviour change) and assert values, in the
        same style as `rate-limit-coverage.test.ts`'s `RESET_RATE_LIMIT` sentinel. If an existing auth.service
        test already pins lockout behaviour at 5/10, cite it instead and do not duplicate.
- [x] **Task 6 — Record: coverage test + PRD amendment (AC: 10)**
  - [x] 6.1 `rate-limit-coverage.test.ts` map: the four login routes gain `'loginIpFloodLimit'` in
        `rateLimiters`; `expectedHandlerCount.min` +1 (login 4→5, mfa 5→6). Run it; it must pass.
  - [x] 6.2 Same file, header table: `loginRateLimit` → `5/EMAIL/15min FAILED ONLY (IP fallback)`;
        `strictLoginRateLimit` → ~~`200/IP/1hr FLOOD CEILING (all counted)`~~ `60 FAILED/IP/1hr`; add
        `loginIpFloodLimit | 100/IP/15min | ~~FLOOD CEILING only~~ LOAD-BEARING (all responses)`; fix the stale `registrationRateLimit` row
        (source says 50/IP/15min + `registrationEmailRateLimit` 3/email/15min, table says 5/IP/15min).
  - [x] 6.3 PRD `_bmad-output/planning-artifacts/prd.md` NFR4.4 login block (line ~201–207): amend the
        burst limiter line (axis = submitted email, IP fallback, + the 100/IP/15min flood ceiling), the
        sustained limiter line (~~200/IP/hour flood ceiling~~ 60 FAILED/IP/hour, derived; drop "catches successful brute-forces"), and
        correct the **Cumulative block** line — it says "30-minute block **on the IP**" but
        `auth.service.ts:534` locks the **account** (`users.lockedUntil`). Add a dated
        "Rationale for the identity-axis amendment (2026-09-16)" sub-bullet in the style of the existing
        2026-06-03 `skipSuccessfulRequests` rationale, citing the 244-refusal evidence and SCP Lane A. ⛔ Do NOT
        touch the NFR4.4 preamble ("and IP Throttling") or any non-login row — that is Lane C (John).
  - [x] 6.4 Run `pnpm tsx apps/api/scripts/audit-rate-limit-keys.ts` (from `apps/api`) before and after;
        record in Completion Notes that `loginRateLimit` moved from un-keyed to keyed and the two IP
        limiters now read as ceilings ≥100.
- [x] **Task 7 — Gates (all ACs)**
  - [x] 7.1 `pnpm --filter @oslsr/api exec tsc --noEmit`; `pnpm --filter @oslsr/api lint` (drift guards green).
  - [x] 7.2 Touched suites from `apps/api` (NOT the repo root — mockReset pitfall):
        `pnpm vitest run src/middleware src/routes/__tests__/magic-link.routes.test.ts src/routes/__tests__/sms-otp.routes.test.ts`
        — confirm those two route files report real counts.
  - [x] 7.3 Full API suite against the TEST DB (`NODE_ENV=test DATABASE_URL=…app_test`, never app_db),
        free RAM > 3 GB first, one vitest process at a time, `VITEST_MAX_THREADS=1` if it flakes, never raise
        a timeout. Quote the SUITE total, not a subset, and never pipe through `tail`.
  - [x] 7.4 Web: no web code changes are expected. If none are made, say so; do not run the web suite
        as a ritual. (`useLogin.ts` already handles `AUTH_RATE_LIMIT_EXCEEDED`.)

- [x] **Task 8 — Final scope (adjudication consolidated instruction, 2026-09-16) (AC: 6, 7, 11, 12, 13)**
  - [x] 8.1 `strictLoginRateLimit`: add `skipSuccessfulRequests: true`, keep `max: 60`; docblock records
        availability-not-security and the derived 60; log reason back to `excessive_failures`. Tests first
        (RED: successes refused at 61), then mutation-verified (no skip / 200 / 10).
  - [x] 8.2 `loginIpFloodLimit`: delete every "non-binding" statement (code, routes comment, coverage table,
        PRD, story, test names); document it as LOAD-BEARING — the only all-response login ceiling. New
        production-stack test: 100 successes served, 101st refused by the flood limiter (RED when unmounted).
  - [x] 8.3 Lockout decay at both `lockedUntil` checks (`decayExpiredLockout` in `auth.service.ts`); new
        `auth.service.lockout-decay.test.ts` for both login paths. RED before implementation (counter 11 =
        re-lock); mutation-verified: remove reset → red; make reset unconditional → red.
  - [x] 8.4 `email: normalizedEmail` on both `invalid_password` log lines; asserted in the decay test file
        (RED before, and RED when removed).
  - [x] 8.5 Runbook entry (AC13); pm2 log path checked against the infra docs.
  - [x] 8.6 Residuals R2a (escalation) and R2b (dated monitor) recorded — NOT built.
  - [x] 8.7 Gates re-run: tsc, lint, full API suite.

### Review Follow-ups (AI) — adversarial code review, 2026-09-16

Ordered by severity. Each finding was checked against the tree; H1 and M1 were **proven by probe** (a throwaway
supertest harness mounting the real limiters + the real `verifyCaptcha` in production mode, deleted after the run).

- [x] [AI-Review][HIGH] **H1 — captcha-free targeted login denial.** ✅ FIXED: all four login routes mount `loginIpFloodLimit → verifyCaptcha → loginRateLimit → strictLoginRateLimit`; binding test `requests without a valid captcha never spend a person's budget` (RED at the old order and with the captcha alone moved back after the burst limiter). Docblocks, PRD and security table corrected. `loginRateLimit` (per EMAIL) ran BEFORE
      `verifyCaptcha`, so a request with no captcha (400 `AUTH_CAPTCHA_FAILED`) spent the victim's per-email budget.
      Probe: 5 token-less requests from 203.0.113.9 → the victim, from another IP with the CORRECT password, got 429.
      One IP (60 failed/hr) held 3 accounts locked continuously, with no captcha, no bcrypt, and no log line naming the
      victim. The "not a new capability — ten wrong passwords already lock the account" claim was false: the account
      lock needs 10 captcha passes. [`apps/api/src/routes/auth.routes.ts:37-42`]
- [x] [AI-Review][HIGH] **H2 — unbounded Redis key.** ✅ FIXED: `buildLoginRateLimitKey` returns `e:<sha256>` (66 chars for any input); key test `a megabyte "email" still yields a fixed-size key, and no address is ever stored in plaintext` (RED on the raw key). Same unbounded pattern in `registrationEmailRateLimit` / `wizardDraftEmailRateLimit` → residual R7. The raw email was the key; the JSON limit is 1 MB (`app.ts:331`) and
      the key is written before the captcha, so one IP could park ~60 × ~1 MB keys for 15 min in the Redis that BullMQ
      and sessions share (more with IPv6 /56 rotation). It also put plaintext emails in Redis.
      [`apps/api/src/middleware/login-rate-limit.ts` `buildLoginRateLimitKey`]
- [x] [AI-Review][MEDIUM] **M1 — the derived 60 did not survive the mount order.** ✅ FIXED by the same mount order (strict LAST); binding tests `one person's refused retries are not charged to their proxy` (RED at the old order and with strict alone moved before the burst limiter) and `captcha failures are not charged to strict either`. `strictLoginRateLimit` sat before
      `loginRateLimit`, so a person's retries into their OWN per-email 429 (and captcha 400s) were charged to the IP's
      shared failure budget. Probe: 5 real failures + 55 refused retries by one person → a stranger on the same IP with
      the CORRECT password got 429 `AUTH_IP_BLOCKED`. "20 failures per person per hour" capped what a person is
      allowed, not what they spend. [`apps/api/src/routes/auth.routes.ts:37-42, 180-196`]
- [x] [AI-Review][MEDIUM] **M2 — "not a net loosening" is false on two axes** ✅ RECORD CORRECTED (numbers unchanged — ruled): security table rows 1–2, `strictLoginRateLimit` docblock, PRD sustained-limiter line + identity-axis rationale now state both loosenings with figures. *(Original finding — ruled trade-offs, mis-recorded as tighter:
      (a) per-account sequential guesses: HEAD ≈ 10 then 1 per 30 min (≈ 58/day, the undecayed counter re-locked on each
      failure) → now ≈ 10 per lock cycle (≈ 320–480/day). (b) per-IP spray: HEAD 10/IP/hr → 60 failed/IP/hr (6×). The
      story's security table said "TIGHTER" and the PRD "attacker capacity at 60 is unchanged" — relative to a draft, not
      to prod. [story Dev Notes security table; `prd.md` NFR4.4 login block])*
- [x] [AI-Review][MEDIUM] **M3 — wrong limiter named as the enumeration bound.** ✅ CORRECTED in the security table, both limiter docblocks and the PRD flood line; the flood docblock now says outright it never binds a failure stream. A failure-only stream is refused by strict
      at 61 (< 100) and strict-refused requests never reached the flood ceiling, so `loginIpFloodLimit` can never bind a
      failure stream; the story said "flood is the only bound … do not raise it". The bound is strict (60/hr).
      [story security table; `login-rate-limit.ts` flood docblock]
- [x] [AI-Review][MEDIUM] **M4 — the binding test's "production stack" was hand-built** ✅ FIXED: the binding file reads every pre-controller middleware of `/staff/login` and `/login/mfa` from the real router (asserted equal to `/public/login` and `/login/mfa-backup`), runs in PRODUCTION mode with the captcha ENFORCED (stubbed `fetch`, sentinel test proves a token-less request is refused), AC4 uses the real MFA stack, AC3 varies the IP per variant; the mount-identity test pins the first FOUR handlers including `verifyCaptcha`., with a stub handler, no
      `verifyCaptcha`, and `NODE_ENV=development` (which skips the captcha). That is why H1/M1 were invisible (§2ak). The
      mount-identity test pinned only the first three handlers. AC3 through the stack stayed green with the email key
      removed (all variants from one IP). [`apps/api/src/middleware/__tests__/login-rate-limit.binding.test.ts`]
- [x] [AI-Review][MEDIUM] **M5 — tasks marked [x] describe superseded shapes** ✅ ANNOTATED in place (strike-through + final value) on 3.1, 3.2, 4, 4.1, 4.3, 5.3, 5.4, 6.2, 6.3; `sprint-status.yaml` comment rewritten to the final scope; audit script re-run (Debug Log → Review round).: Task 4/4.1 "200/IP/hour", 4.3
      `sustained_ip_volume`, 5.3/5.4 "200 allowed / 201st", 6.2/6.3 "200/IP/1hr flood ceiling", 3.1 prefix
      `rl:login:ip:`; the `sprint-status.yaml` 13-68 comment still says "10 → 200/IP/hr"; the audit-script "after" was
      captured at 200 and never re-run.
- [x] [AI-Review][LOW] **L1 — `keyedBy` duplicated the builder's predicate** ✅ FIXED: the handler derives `keyedBy` from `buildLoginRateLimitKey(...).startsWith('e:')`; AC1/AC4 binding tests assert `email` / `ip`. instead of deriving from the key the builder
      produced (drift risk). [`login-rate-limit.ts` `loginRateLimit.handler`]
- [x] [AI-Review][LOW] **L2 — account-existence oracle.** ✅ FIXED for the timing channel: `user_not_found` in `loginStaff` and `loginPublic` spends one bcrypt compare against a hash minted once at production cost (`spendPasswordCompareTime`); decay-file test `an unknown email still spends a password compare` ×2 (RED before). The locked / invited / suspended error codes still reveal existence → residual R8 (product copy, Lane C). `user_not_found` returns before bcrypt (timing) — pre-existing,
      now probed 6× faster per IP. [`auth.service.ts:503-511`]
- [x] [AI-Review][LOW] **L3 — PRD says the burst limiter counts "403 Account Locked"** ✅ CORRECTED to 429 Account Locked / 403 Suspended-or-Not-Activated, and that captcha failures never reach it.; the account lock returns 429
      (`auth.service.ts:522-526`). [`prd.md` NFR4.4 burst-limiter line]

## Dev Notes

### Security model — the whole argument; the reviewer should attack THIS

| threat | control | effect of this story |
|---|---|---|
| brute-force ONE account | per-email burst 5 failed/15min (AC1) + account lockout (`auth.service.ts`: 5 → warn, 10 → 30-min lock, **decays on expiry**) | ⚠️ **MIXED — corrected by adversarial review M2 (was "TIGHTER").** Tighter against a BURST: rotating IPs no longer mints a fresh budget (AC2), and the per-email Redis counter admits at most 5 failures per 15 min however many run in parallel (the account counter itself is a non-atomic read-modify-write). **Looser against a patient attacker:** at HEAD the undecayed counter re-locked on every further failure (≈ 10, then 1 per 30 min ≈ 58/day); with decay each lock costs ten fresh failures (≈ 320–480/day). Ruled acceptable at 480/day (PM ruling Addendum A; R2a). |
| credential spray (failures) across MANY accounts from one host | `strictLoginRateLimit` 60 FAILED/hr + hCaptcha (`verifyCaptcha`) | bounded at 60 failures/IP/hour. Failed-only vs all-responses at 60 changes nothing for a spray (it generates no successes) — but ⚠️ **6× the 10/IP/hour it replaced** (review M2): a ruled trade-off for the shared-proxy population, not a tightening |
| bulk SUCCESSFUL requests from one host (e.g. validating credentials already held) | `loginIpFloodLimit` 100/15min, all responses | ⭐ **load-bearing**: the only all-response login ceiling once strict is failed-only. Accepted cost (PM ruling A.1): ≤ 400/hour instead of 60 — against an attacker who already holds the password, the per-IP counter was never the control |
| ⛔ **mass account-lockout DoS** *(missed at authoring, found by the PM ruling)* | `strictLoginRateLimit` (rate) + **lockout decay** (persistence) | Before: `failedLoginAttempts` was never reset on lock expiry, so a 10-failure account re-locked on each further failure — 2 requests/hour held it locked forever. **Now (AC11)** each lock costs 10 fresh failures and expires in 30 min; rate ≤ 6 new locks/IP/hour at 60. Escalating duration not built (R2a). |
| sustained successful brute-force | per-account lockout + MFA | unchanged — never the IP counter's job; an attacker who succeeds already has the password |
| enumeration / spray of accounts that DON'T exist | ~~`loginIpFloodLimit`~~ **`strictLoginRateLimit`** (+ captcha) — *corrected by review M3* | ⚠️ **the one real gap:** `user_not_found` increments NOTHING account-side — why 36 enumerator failures left `failed_login_attempts = 0`. The per-IP bound is **strict at 60 failures/hour**: a failure stream is refused there at 61, long before the flood ceiling's 100/15min, which can never bind it. **Do not raise strict on the assumption that the flood ceiling covers this.** Response TIME no longer separates an active account from a missing one (review L2: `user_not_found` spends a bcrypt compare); locked / invited / suspended accounts still answer with their own codes (R8). |
| targeted lockout: a stranger burns a victim's per-email budget | per-email bucket is 15 min, **mounted AFTER `verifyCaptcha`** | ⛔ **As authored this WAS a net-new capability (review H1, proven by probe):** the per-email limiter ran before the captcha, so 5 requests with NO captcha held a victim's login shut — 3 accounts per IP, continuously, free, and with no log line naming the victim. **Fixed by mount order.** Now every unit of the victim's budget costs a solved captcha: holding it costs ~20 captcha passes/hour, comparable to holding the 30-minute ACCOUNT lock with decay (~13/hour), which the IP axis never prevented. Accepted by design; recorded for Lane C. |

### Lockout-counter decay — IN this story; escalation is the residual *(final scope 2026-09-16 — ⚠️ REVERSES the earlier addendum)*

An earlier addendum kept decay out. The consolidated instruction reversed that: decay removes the
*persistence* term of the mass-lockout DoS outright (PM ruling A.3), is deterministic and provable on a
mocked db, and closes today. **Built:** `decayExpiredLockout()` in `auth.service.ts`, called right after the
active-lock refusal in `loginStaff` and `loginPublic` (AC11). `loginByMagicLinkToken` also checks
`lockedUntil` but never increments the counter, so it needs no decay.

**Not built — R2a, escalating lock duration** (30 min → 1 h → 2 h → 4 h, capped). `users` has no lock-count
column and no jsonb metadata, so it needs a migration and its own security review. The reasoning for shipping
plain decay without it (PM ruling Addendum A): decay without escalation leaves ~10 guesses per 30 minutes,
~480/day, per account — immaterial against bcrypt, the password policy, and MFA on super-admins.

⛔ **Do NOT drop the IP ceiling when adding the email key.** An attacker rotating emails would mint a fresh
bucket per address — no limit at all. Two keys, two threats. `registration-rate-limit.ts` states the same
rule for the same reason.

### Failure direction (write it at each constant)

- `loginRateLimit` 5 failed/email/15min — fails CLOSED for one person who mistypes their password 5×
  (they wait ≤15 min); no longer fails closed for strangers on their proxy.
- `loginIpFloodLimit` 100/IP/15min — fails CLOSED for a whole proxy only at 100 requests in 15 min.
  Headroom: the enumerator cohort is 17 people; even every one of them failing 5× is 85. The worst
  observed Opera Mini concentration was 114 **activation** refusals on one address over two days — not
  a 15-minute login burst. Reopen trigger: any `auth.login_ip_flood_limit_exceeded` whose IP reverse-resolves
  to `opera-mini.net` or a Nigerian carrier CGNAT range. It is the only limiter that sees successful
  volume, so it is the first one a busy but honest proxy would hit.
- `strictLoginRateLimit` 60 FAILED/IP/hour — fails CLOSED for a whole proxy at 61 failures in an hour;
  successful logins are free. Derived floor: 3 strangers/address × 20 failures/person/hour = 60, i.e. room for
  three maximally-fumbling people behind one address. ⚠️ **True only because it is mounted LAST** (review M1):
  mounted first, a person's retries into their own 429 and every refused captcha were charged to it, and one
  person spent all 60 (probe: 5 real failures + 55 refused retries → a stranger with the right password got 429). Reopen trigger: any `auth.ip_blocked` from a known proxy
  range → revisit the strangers-per-address figure, not the constant.

### MFA routes — deliberate IP fallback (decision, not an oversight)

`/login/mfa` and `/login/mfa-backup` bodies are `{ mfaChallengeToken, code }` (`mfa.controller.ts:50-57`)
— there is no email. The builder therefore keys them on IP, which is **exactly today's behaviour**
(express-rate-limit 8.3.0's default `keyGenerator` returns `ipKeyGenerator(request.ip, 56)` —
verified in `node_modules/express-rate-limit/dist/index.mjs:756-768`). Why not key on the challenge token:
it is single-use (`MfaService.consumeChallengeToken` deletes on first read, `mfa.service.ts:371`), so a
per-token bucket could never reach 5 and would silently delete the burst limit on those routes. Why it is
acceptable: MFA enrolment is `requireSuperAdmin` (`auth.routes.ts:141-146`), so only super-admins ever
reach step 2 — not the enumerator cohort. The per-user MFA lockout (`users.mfa_locked_until`) and
`mfaRateLimit` are unchanged. Re-keying the MFA step is **SCP Lane C**. The new flood ceiling IS mounted
on these routes (it is IP-keyed by nature). `keyedBy: 'ip'` in the log makes the fallback visible.

### Corrections to the brief (code verified at b10ecda)

1. **"Resolve the IP via `real-ip.ts`, never raw `req.ip`."** In this app they are the same thing:
   `realIpMiddleware` (`app.ts:133`, mounted before every router) redefines `req.ip` from
   `CF-Connecting-IP` when the request came through a verified Cloudflare edge. So the destructured `ip`
   in `keyGenerator` IS the resolved client IP. What to avoid is reading headers yourself or
   `req.socket.remoteAddress`. Do not add a second resolution step.
2. **"`emailSchema` already normalises."** It does (`packages/types/src/validation/auth.ts:18-21`), but it
   runs in the CONTROLLER, after the limiter. The limiter sees the raw body, so the builder must
   normalise itself (AC3).
3. **"`/login/mfa*` carry the same pair."** They carry the limiters but not an email — see MFA section.
4. **PRD "Cumulative block … on the IP"** is wrong against the code: it is an account lock. Fix in 6.3.
5. The coverage-test table's `registrationRateLimit | 5/IP/15min` row is also stale (source: 50). Fix in 6.2.

### Traps that have already bitten this repo

- ⚠️ **`vi.mock` with a fixed export list** (Task 3.3). Adding an export makes the mocked middleware
  `undefined`; `auth.routes.ts` throws at import; the file reports **"no tests"**, not a failure. Cost a
  re-push on 2026-09-15 and again 2026-09-16.
- ⚠️ **`ipKeyGenerator` is mandatory on the IP fallback.** The library's `ERR_ERL_KEY_GEN_IPV6` warning is a
  `toString()` grep of the keyGenerator source and proves nothing (see the docblock on
  `buildRegistrationEmailRateLimitKey`). The /56-collapse unit test is the proof.
- ⚠️ **A limiter test that passes because test mode skipped the limiter** — every "allowed" assertion is
  green over a hole. Task 5.2's sentinel exists for this.
- ⚠️ **A guard that has never failed is not a guard.** RED-verify every assertion that encodes the defect.
- `apps/api/scripts/*` is outside tsconfig — RUN `audit-rate-limit-keys.ts`, don't trust tsc for it.

### Out of scope — do NOT widen

- `mfaRateLimit`, `refreshRateLimit`, `reauthRateLimit`, `editTokenRequestRateLimit`, marketplace search
  re-keys → **Lane C** (John).
- The normative NFR4.4 two-axis rule, the ≥100 floor as policy, the `axis` field in the coverage map,
  reclassifying all 32 limiters → **Lane C**.
- Renaming `AUTH_IP_BLOCKED` / `auth.ip_blocked`, or any web UI copy change.
- §0.1a plus-addressed provisioning → not code; Awwal's provisioning decision for Lane B.

### Project Structure Notes

- Middleware: `apps/api/src/middleware/login-rate-limit.ts` (edit), tests in
  `apps/api/src/middleware/__tests__/` (two new files).
- Routes: `apps/api/src/routes/auth.routes.ts` (edit — four mounts + import).
- Service: `apps/api/src/services/auth.service.ts` (export three constants only, if Task 5.5 needs it).
- Record: `rate-limit-coverage.test.ts` (map + header), `prd.md` (NFR4.4 login block only).
- The per-email Redis key is `e:<sha256 of the normalised email>` (review H2) — fixed-size, no plaintext address in Redis.
- No schema change, no migration, no new env var, no new dependency (`express-rate-limit ^8.3.0` already
  exports `ipKeyGenerator`; `supertest ^7.1.4` already a devDep). New Redis prefix ~~`rl:login:ip:`~~ `rl:login-ip-flood:` only (the specified prefix collided with `loginRateLimit`'s IP fallback — Completion Notes #2).
- Deploy note: Redis-only; old `rl:login:` IP buckets age out in ≤15 min, `rl:login:strict:` in ≤1 h.

### References

- Brief: `_bmad-output/planning-artifacts/brief-2026-09-16-story-13-68-login-rate-limit-identity-axis.md`
- SCP: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-16-rate-limit-identity-axis.md` §0, §1, §3
- Reference impls: `apps/api/src/middleware/registration-rate-limit.ts` (`buildRegistrationEmailRateLimitKey`,
  `buildActivationRateLimitKey`, `activationIpFloodLimit`); `apps/api/src/middleware/password-reset-rate-limit.ts`
  (`buildPasswordResetCompletionKey`, `passwordResetCompletionIpFloodLimit`)
- Reference tests: `middleware/__tests__/password-reset-rate-limit-key.test.ts`,
  `activation-rate-limit-key.test.ts`, `registration-email-rate-limit-key.test.ts`
- PRD NFR4.4: `_bmad-output/planning-artifacts/prd.md:199-212`
- Lockout: `apps/api/src/services/auth.service.ts:60-62, 474, 527-545`
- Real IP: `apps/api/src/middleware/real-ip.ts`, `apps/api/src/app.ts:127-133`
- Web 429 handling: `apps/web/src/features/auth/hooks/useLogin.ts:143`
- Audit script: `apps/api/scripts/audit-rate-limit-keys.ts`
- Handoff doc evidence: `docs/adjudication-agent-handoff.md` §9g–§9j

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-opus-5[1m]) — dev-story, 2026-09-16.

### Debug Log References

All runs from `apps/api` against `app_test` (`NODE_ENV=test`, db-guard engaged).

**RED before GREEN**
- `login-rate-limit-key.test.ts` before the builder existed: 9/9 `TypeError: buildLoginRateLimitKey is not a function`.
- `login-rate-limit.binding.test.ts` before `loginIpFloodLimit` existed: `Route.post() requires a callback function but got a [object Undefined]` — **"Tests: no tests"**, i.e. the silent-failure shape the brief warned about, observed live.
- `rate-limit-coverage.test.ts` mount-identity test before mounting: `/staff/login: first three middleware` mismatch → 1 failed.
- AC8 lockout sentinel before exporting the constants: `expected undefined to be 5`.
- `magic-link.routes.test.ts` / `sms-otp.routes.test.ts` after mounting, before patching their mocks: `No "loginIpFloodLimit" export is defined on the "../../middleware/login-rate-limit.js" mock` — both files collected zero tests while the run summary read "7 passed". After patching: 16 and 8, equal to the `it(` count of each file at HEAD.
- Keyspace test before the prefix fix (see Completion Notes #2): `expected 3 to be 4` ×3 IPs + nested-prefix assertion → 4 failed.

**RED-VERIFY by mutation** (scripted replace → run → restore; each mutation asserted exactly one match; tree re-run green after every restore)

| mutation | tests that went red |
|---|---|
| builder returns old IP-only key | key: two-emails-one-IP, one-email-two-IPs, keys-on-email, normalisation (4) |
| drop `ipKeyGenerator` from fallback | key: IPv6 /56 collapse (1) |
| remove `loginRateLimit.keyGenerator` | binding: AC1, AC2, AC6-spray (3) |
| remove email normalisation only | key: normalisation; binding: AC3 (2) |
| `strictLoginRateLimit` max 200 → 10 | binding: AC5, AC6 ×2, AC7 (4) |
| remove `skipSuccessfulRequests` | binding: AC5 (1) |
| strict reason back to `excessive_failures` | binding: AC7 (1) |
| log the raw email on 429 | binding: AC9 (1) |
| unmount `loginIpFloodLimit` from test app | binding: AC6 ×2 (2) |
| remove the env stubs (limiters skipped) | binding: sentinel + all 9 behavioural tests (10) |

*(The intermediate addendum round — strict 60 counting all responses — was red-verified and then superseded by the final scope; its table is removed because it described the flood ceiling as non-binding, which the final scope reverses. The rows above were run at strict = 200 and stand as history.)*

**RED-VERIFY, FINAL SCOPE (strict 60 failed-only; flood load-bearing; decay; email on invalid_password)** — this is the current proof.

RED before GREEN:
- Binding tests rewritten first; against all-response strict: `AC6 load-bearing` and `AC7 successes are free` failed (successful logins refused at request 61).
- `auth.service.lockout-decay.test.ts` before implementation: 4 failed — `expected { failedLoginAttempts: 11, … } to match { failedLoginAttempts: 0, … }` (both paths: the re-lock), and the `invalid_password` log had no `email` (both paths). The 6 guard tests (active lock untouched, accumulation, 10th locks) passed before and after, as they should.

| mutation | tests that went red |
|---|---|
| remove strict `skipSuccessfulRequests` | binding: AC6 load-bearing, AC7 successes-free (2) |
| strict max 60 → 200 | binding: AC7 successes-free, AC7 spray-at-61 (2) |
| strict max 60 → 10 | binding: AC7 successes-free, AC7 spray-at-61 (2) |
| strict log reason → `sustained_ip_volume` | binding: AC7 successes-free (1) |
| remove `loginRateLimit.skipSuccessfulRequests` | binding: AC5 (1) |
| remove `loginRateLimit.keyGenerator` | binding: AC1, AC2, AC7 spray (3) |
| unmount `loginIpFloodLimit` from the production-stack test app | binding: AC6 load-bearing (1) |
| unmount `loginIpFloodLimit` from its standalone app | binding: AC6 alone ×2 (2) |
| remove both `decayExpiredLockout(user)` calls | decay: expired-lock ×2 (loginStaff, loginPublic) |
| make the decay unconditional (drop the expiry guard) | decay: accumulates ×2, 10th-locks ×2 (4) |
| remove `email` from both `invalid_password` logs | decay: logs-email ×2 (2) |

⚠️ **Line-ending incident, found and fixed:** the Edit that exported the lockout constants rewrote the whole of
`auth.service.ts` as CRLF (1401/1401 lines; HEAD is LF). `git diff` hid it (autocrlf normalises), and an
earlier check in this story wrongly reported "no carriage returns" because Git-Bash `grep` did not match `\r`.
Found when a script anchor failed; normalised back to LF with node; every changed file re-checked: 0 CRLF.

**Audit script** (`pnpm tsx scripts/audit-rate-limit-keys.ts`) — baseline from a `git archive HEAD` export, not the working tree: `32 limiters; 19 per-IP`, `loginRateLimit 5 >>> PER-IP <<<`. After: `33 limiters; 19 per-IP`; `loginRateLimit 5 custom key`; `loginIpFloodLimit 100 PER-IP`; `strictLoginRateLimit 200 PER-IP` (now 60 after the scope addendum). ⚠️ Per the PM ruling §1.3 this script classifies by the *presence* of a keyGenerator, not what it returns, and undercounts per-IP by one (`registrationStatusRateLimit`) — the delta above is still valid for login, but the absolute counts are not.

**Gates**
- `pnpm exec tsc --noEmit` (api): exit 0 (re-run after the prefix fix: exit 0).
- `pnpm --filter @oslsr/api lint`: exit 0; registry-read, respondent-write and story-residual drift guards ✅ (re-run after the prefix fix: same).
- Touched files: key 13, binding 10, coverage 8, magic-link routes 16, sms-otp routes 8 → **55 passed**.
- Full API suite (app_test, `VITEST_MAX_THREADS=1`, one vitest process, free RAM 2.85 GB — just under the 3 GB guideline, Firefox open): **exit 0 — Test Files 322 passed | 2 skipped (324); Tests 4545 passed | 8 skipped (4553); 428.6 s.** This run is AFTER the keyspace-prefix fix. This story adds 25 tests (key 13, binding 10, coverage +2); no pre-story suite total was measured this session, so no delta is claimed. *(Superseded by the run below.)*
- *(superseded)* **After the scope addendum (strict = 60, all responses)** — tsc exit 0; lint exit 0 with all three drift guards ✅; full API suite (app_test, `VITEST_MAX_THREADS=1`, free RAM 3.47 GB, no other vitest process): **exit 0 — Test Files 322 passed | 2 skipped (324); Tests 4546 passed | 8 skipped (4554); 442.8 s.** Delta vs the previous run: **+1**, which is exactly the one test the addendum added (`AC6 non-binding`; binding file 10 → 11). Web: no web file changed, web suite not run.
- **FINAL SCOPE (current)** — tsc exit 0; `pnpm --filter @oslsr/api lint` exit 0, all three drift guards ✅; full API suite (app_test, `VITEST_MAX_THREADS=1`, free RAM 3.61 GB, no other vitest process): **exit 0 — Test Files 323 passed | 2 skipped (325); Tests 4557 passed | 8 skipped (4565); 647.3 s.** Delta vs the addendum run (4546 / 324 files): **+11 tests, +1 file** = `auth.service.lockout-decay.test.ts` (new file, 10 tests) + binding file 11 → 12 (the `AC6 non-binding` test replaced by `AC6 load-bearing`, plus `AC7 spray-at-61`). Every changed file re-checked for CRLF: 0. Web: no web file changed, web suite not run.

**ADVERSARIAL REVIEW ROUND (2026-09-16)** — findings under Tasks → Review Follow-ups (AI). All runs from `apps/api` against `app_test`.

Probes (throwaway supertest harness, real limiters + real `verifyCaptcha` in production mode, deleted after each run):
- H1: 5 token-less requests from 203.0.113.9 → `[400,400,400,400,400]`; victim from 198.51.100.7 with the correct password → **429** `AUTH_RATE_LIMIT_EXCEEDED`.
- M1: one person, 60 attempts → 5×401 + 55×429; a stranger on the same IP with the correct password → **429** `AUTH_IP_BLOCKED`.
- Pre-fix revert check (the story's own mutation claims, re-run by the reviewer): old keying + strict 10 all-responses → 6 binding tests red; decay calls removed → 2 decay tests red. Tree restored; sha1 verified.

RED before GREEN:
- Binding file rewritten to mount the real router's stacks with the captcha enforced: against the authored order **4 failed** (H1 victim budget `expected [429×5] to deeply equal [400×5]`; flood-counts-captcha `…[400×100]` mismatch; M1 stranger `expected 429 to be 200`; captcha-not-charged `…[401×60]` mismatch). ⚠️ The first run of the rewrite FAILED the captcha sentinel (a token-less request got 200): `attempt(…, undefined)` took the parameter default and SENT a valid token. The sentinel caught a harness bug that would have made the H1 test pass over a hole; token-less is now `null`.
- `rate-limit-coverage` mount-identity test after the reorder, before updating it: `first three middleware` mismatch → 1 failed.
- Key test with the digest assertions, before hashing: 3 failed (`expected 'e:user@example.com' to be 'e:b4c9a2…'`; megabyte key length 1048584 ≠ 66).
- Decay file, `user_not_found` compare test before `spendPasswordCompareTime`: 2 failed (`called 1 times, but got 0 times`).

| mutation (scripted, exact-match asserted, restored, sha1 verified) | tests that went red |
|---|---|
| all four routes back to the authored order (strict, flood, burst, captcha) | coverage mount-identity; binding: H1 budget, flood-counts-captcha, M1 stranger, captcha-not-charged-to-strict (5) |
| captcha moved after the burst limiter only (strict still last) | coverage mount-identity; binding: H1 budget (2) |
| strict moved before the burst limiter only (captcha still first) | coverage mount-identity; binding: M1 stranger (2) |
| raw email key (digest removed) | key: keys-on-email, normalisation, megabyte fixed-size (3) |

Audit script re-run (`pnpm tsx scripts/audit-rate-limit-keys.ts`): `33 limiters; 20 bucket on IP (1 of them via a hand-rolled keyGenerator)`; `loginRateLimit 5 person key`; `loginIpFloodLimit 100 >>> PER-IP <<<`; `strictLoginRateLimit 60 >>> PER-IP <<<`. (The script's classifier was corrected in `67846d0` to count binding, so its absolute counts differ from the pre-review Debug Log line above; the login rows are what matter.)

Gates after the review fixes: `pnpm --filter @oslsr/api exec tsc --noEmit` exit 0; `pnpm --filter @oslsr/api lint` exit 0, all three drift guards ✅; full API suite (app_test, `VITEST_MAX_THREADS=1`, one vitest process, free RAM 3.24 GB): **exit 0 — Test Files 323 passed | 2 skipped (325); Tests 4565 passed | 8 skipped (4573); 466.1 s.** Delta vs the final-scope run (4557 passed / 4565): **+8** = key +1 (fixed-size digest), binding 12 → 17 (+5: captcha sentinel, H1 budget, flood-counts-captcha, M1 stranger, captcha-not-charged), decay 10 → 12 (+2: `user_not_found` compare ×2). Every changed file re-checked: 0 CRLF. Web: no web file changed.

### Completion Notes List

✅ **Final scope applied 2026-09-16.** Status → `review`, handed over UNCOMMITTED for adversarial code review.

1. **How the scope settled — three rounds, recorded so the reviewer can check each reversal.**
   - **Authored:** strict 10 → 200/IP/hour, all responses. **Halted** when the PM ruling showed mass
     account-lockout DoS: `failedLoginAttempts` never reset on lock expiry (verified: `auth.service.ts:591`,
     `:1059`, `password-reset.service.ts:293` only), so the per-IP ceiling metered how many accounts one host
     could hold locked forever. My authoring security table missed this; the PM ruling caught it.
   - **Addendum:** strict 60 all-responses; flood "non-binding"; decay out of scope.
   - **Final (consolidated instruction + PM Addendum A):** strict **60 FAILED-only** (availability fix; attacker
     capacity unchanged; 60 derived 3 × 20); flood **LOAD-BEARING** (only all-response ceiling) — "non-binding"
     wording deleted everywhere; **lockout decay added** (AC11); **email on `invalid_password`** (AC12);
     **runbook entry** (AC13). Cardinality monitor **not blocking** (R2b, dated); escalation deferred (R2a).

2. **Defect found and fixed in this story's own spec: Redis keyspace collision.** Task 3.1 specified the flood prefix `rl:login:ip:`. rate-limit-redis stores at `${prefix}${key}`, and `loginRateLimit` (prefix `rl:login:`) falls back to key `ip:<addr>` — so both limiters would write `rl:login:ip:<addr>`, on **every** request to the MFA step-2 routes. The burst limiter's `skipSuccessfulRequests` decrement would subtract from the flood count, and the flood's every-request increment would push the burst limiter back to counting successes. The in-memory test store gives each limiter its own map, so no behavioural test can see this. **Fix:** prefixes exported as constants; flood prefix is `rl:login-ip-flood:`; new keyspace tests assert no two limiters can produce the same Redis key (IPv4, IPv6, `unknown`) and that the one pre-existing nesting (`rl:login:strict:` under `rl:login:`) stays safe. RED-verified at the old prefix. ⚠️ **The story's Task 3.1 text and Project Structure note still say `rl:login:ip:` — the code is authoritative.**

3. **Same collision latent in the two shipped reference implementations — NOT fixed here (out of scope), for adjudication:** `rl:activation:` + `ip:X` ≡ `rl:activation:ip:` + `X` (`registration-rate-limit.ts:200,229`) and `rl:password-reset-complete:` + `ip:X` ≡ `rl:password-reset-complete:ip:` + `X` (`password-reset-rate-limit.ts:98,131`). Both only collide on the no-token IP fallback, which activation never takes (`:token` is a path param) and reset completion takes only for a POST with no body token — so low live impact, but they are the pattern this story was told to copy.

4. Web: no web code changed; `useLogin.ts` already handles `AUTH_RATE_LIMIT_EXCEEDED`, the code the new flood limiter returns. Web suite not run (no web change).

5. Beyond the listed subtasks, recorded for the reviewer: a mount-identity test in `rate-limit-coverage.test.ts` (the handler-count check cannot detect an exported-but-unmounted limiter).

### File List

- `_bmad-output/implementation-artifacts/13-68-login-rate-limit-identity-axis.md` (new — story)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (13-68 entry added, in-progress)
- `_bmad-output/planning-artifacts/prd.md` (NFR4.4 login block amended)
- `apps/api/src/middleware/login-rate-limit.ts`
- `apps/api/src/routes/auth.routes.ts`
- `apps/api/src/services/auth.service.ts` (lockout constants exported; `decayExpiredLockout` + two call sites; `email` on both `invalid_password` logs)
- `apps/api/src/services/__tests__/auth.service.lockout-decay.test.ts` (new)
- `docs/runbooks/enumerator-prod-smoke-and-golive-gate.md` (locked-out entry)
- `apps/api/src/middleware/__tests__/login-rate-limit-key.test.ts` (new)
- `apps/api/src/middleware/__tests__/login-rate-limit.binding.test.ts` (new)
- `apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts`
- `apps/api/src/routes/__tests__/magic-link.routes.test.ts` (mock export list)
- `apps/api/src/routes/__tests__/sms-otp.routes.test.ts` (mock export list)
- NOT this story's: `_bmad-output/planning-artifacts/pm-ruling-2026-09-16-nfr4-4-rate-limit-axis.md` (untracked, John/PM, another session)

## Residuals

| # | residual | state | re-runnable evidence | owner | reopen trigger |
|---|---|---|---|---|---|
| R1 | Lockout-counter decay | ✅ **CLOSED HERE** (AC11) | `pnpm vitest run src/services/__tests__/auth.service.lockout-decay.test.ts` (10 tests; RED when the reset is removed) | — | — |
| R2a | **Escalating lockout duration** (30 min → 1 h → 2 h → 4 h, capped) | OPEN — deferred by adjudication. `users` has no lock-count column and no jsonb metadata → needs a migration + its own security review. Plain decay leaves ~10 guesses/30 min (~480/day) per account against bcrypt + password policy + MFA — assessed immaterial (PM ruling Addendum A) | `grep -n "lockCount\|lock_count" apps/api/src/db/schema/users.ts` → none | Bob (SM) — new story | any account observed re-locking repeatedly (several `account_locked` log lines for one `userId` in a day), or a password-policy weakening |
| R2 | ~~Cardinality monitor as a blocking precondition~~ | ✅ **RESOLVED by ruling** — not blocking (consolidated instruction; PM Addendum A.3 swapped it for decay) | — | — | superseded by R2b |
| R2b | **Distinct-identifier cardinality monitor**: > 20 distinct emails from one IP in one hour with > 80 % failures → alert | OPEN — **DATED 2026-10-15** (not "after the re-run settles": the re-run's login traffic is the first real data it would see, and pm2 retention is what destroyed the 9-52 window). **Acceptance = DEMONSTRATED FIRING, not shipped:** synthesise the traffic, observe the alert arrive through `alerting/telegram-channel.ts`, witness a scheduler execution (`cf-traffic-watch` shipped, was documented, and never once ran). Its query reads `email` on BOTH failure branches — AC12 makes that one field | `grep -n "reason: 'invalid_password'" -A4 apps/api/src/services/auth.service.ts` shows `email` on both | Bob (SM) — new story | **2026-10-15**, or earlier: any `auth.login_ip_flood_limit_exceeded` / `auth.ip_blocked` whose IP does not reverse-resolve to a proxy or carrier CGNAT range |
| R3 | "Staff cannot log in" runbook entry | ✅ **CLOSED HERE** (AC13) | `grep -n "Staff report they are locked out" docs/runbooks/enumerator-prod-smoke-and-golive-gate.md` | — | — |
| R4 | Stale `googleAuthRateLimit` row in the `rate-limit-coverage.test.ts` comment table (identifier does not exist) | OPEN — pre-existing, found by PM ruling §1.5; not this story's change | `grep -rn googleAuthRateLimit apps/api/src` → the comment line only | Lane C sweep story | Lane C story picked up |
| R5 | Keyspace collision latent in the activation and reset-completion limiters (Completion Notes #3) | OPEN — out of scope, low live impact | prefix pairs at `registration-rate-limit.ts:200,229` and `password-reset-rate-limit.ts:98,131` | adjudication / Lane C | any change to either limiter's key builder |
| R7 | Raw, unbounded email as a Redis key in `registrationEmailRateLimit` and `wizardDraftEmailRateLimit` (the H2 pattern, which this story copied from them) | OPEN — out of this story's routes. Bounded per IP by their flood ceilings (50 and 1,200 /IP/15min) × the 1 MB body limit — the wizard-draft ceiling makes that the larger exposure | `grep -n "return \`e:\${email.trim().toLowerCase()}\`\|return email.trim().toLowerCase()" apps/api/src/middleware/registration-rate-limit.ts apps/api/src/middleware/wizard-draft-rate-limit.ts` | Lane C sweep story | any Redis memory alert, or the Lane C limiter sweep |
| R8 | Account existence still revealed by the login error CODES for locked (`AUTH_ACCOUNT_LOCKED`), invited (`AUTH_ACCOUNT_NOT_ACTIVATED`) and suspended (`AUTH_ACCOUNT_SUSPENDED`) accounts, and by "use the public/staff login" after a correct password | OPEN — product copy decision (the specific messages help real users); the TIMING channel for active accounts is closed here (L2) | `grep -n "AUTH_ACCOUNT_NOT_ACTIVATED\|AUTH_ACCOUNT_SUSPENDED\|Please use the" apps/api/src/services/auth.service.ts` | John (PM) — Lane C | any enumeration pattern in `auth.login_failed` (many distinct `email`s per `ipAddress`) |
| R6 | ~~`AUTH_IP_BLOCKED` copy says "too many failed login attempts" though strict counted successes~~ | ✅ **RESOLVED by the final scope** — strict now counts failures only, so the copy is accurate | binding test AC7 asserts `reason: 'excessive_failures'` | — | — |

## Closing verdict

**Adversarial review complete (2026-09-16) — 10 findings, all actioned (8 fixed in code/tests, 2 record corrections); two new residuals (R7, R8). Ready for adjudication — start at "Handoff to Adjudication" below.** Deploy SHA: ⏳ PENDING. Hold condition: ~~do not deploy until the adversarial review has run on the uncommitted tree~~ (discharged 2026-09-16; full API suite re-run after the review's changes) → **do not commit or deploy until adjudication has ruled on D1 (mount order) and D2 (bcrypt on unknown emails)**; if either is reverted, re-run the full API suite. No blocking residual remains open (R2 resolved by ruling; R2a and R2b are dated/triggered follow-up stories). ⚠️ **Deploy note:** lockout decay changes behaviour for accounts currently locked or sitting at ≥ 10 failures — their next attempt after lock expiry starts from 0. Worth a `SELECT count(*) FROM users WHERE failed_login_attempts >= 10` on prod before deploy, so the change is predicted, not discovered.

## Handoff to Adjudication — adversarial review round (2026-09-16)

*From the code-review agent. Self-contained: read this section first, then verify from the sections it points to.*

### 0. TL;DR

- The review found **10 issues (2 HIGH, 5 MEDIUM, 3 LOW)**. Two were exploitable holes **this story created**, both
  **proven by probe** against the real middleware (not argued):
  - **H1** — a login request with NO captcha could spend any person's per-email budget: anyone who knows an address
    could hold that person's login shut, for free, with no log line naming the victim.
  - **M1** — one person retrying into their OWN 429 spent the whole proxy's strict budget: a stranger on the same
    Opera Mini IP with the CORRECT password got `429 AUTH_IP_BLOCKED`. The "60 = 3 × 20" derivation was false as mounted.
- **Authority:** the brief said "do not do story dev"; Awwal then instructed *"create action items (critical to low)
  and fix them all automatically"*. Everything below was done under that instruction.
- **All 10 actioned** (8 code/test fixes, 2 record corrections). New tests RED before each fix; every fix
  mutation-verified; tree restored and sha1-verified after every mutation.
- **Gates:** tsc exit 0 · lint exit 0 (3 drift guards ✅) · **full API suite on app_test exit 0 — Test Files 323 passed |
  2 skipped (325); Tests 4565 passed | 8 skipped (4573); 466.1 s.** Delta vs the last pre-review run (4557): **+8**, all
  itemised in §4.
- **Nothing committed or pushed.** `docs/adjudication-agent-handoff.md` NOT touched (yours). Status left at `review`.
- ⚠️ **Five decisions are yours (§1). D1 matters most:** the fix changes the ORDER of the login stack, which the PM ruling
  assumed but never specified.

### 1. Decisions only adjudication can make — ranked

**D1 ⭐ Ratify the new mount order on all four login routes.**

| | order |
|---|---|
| was | `strictLoginRateLimit → loginIpFloodLimit → loginRateLimit → verifyCaptcha → controller` |
| now | `loginIpFloodLimit → verifyCaptcha → loginRateLimit → strictLoginRateLimit → controller` (MFA step-2 routes: the same four, then `mfaRateLimit`) |

No NUMBER changed (5/email/15min · 100/IP/15min all responses · 60 FAILED/IP/hour are exactly as ruled). What changed is
WHO is charged: captcha-less requests now reach only the flood ceiling; a person's own 429s never reach strict. If you
ratify, you accept these — stated as numbers, not adjectives:
- (a) **Proxy-wide denial without a captcha still exists, but costs ~6.7× more.** Before: 60 captcha-less requests
  blocked a whole proxy for up to an hour (strict counted them). Now: 100 per 15 min to block it for up to 15 min
  (≈ 400/hour to hold it). Inherent to any per-IP ceiling that must sit in front of the captcha to bound the captcha
  call; the attacker must egress from the victims' proxy/CGNAT address.
- (b) **The hCaptcha siteverify call is bounded per IP by the flood ceiling** (≤ 100 per 15 min, forged tokens only — a
  MISSING token is refused before any network call); before, strict bounded it at 60/hour. ❓ Not verified: whether
  hCaptcha rate-limits siteverify at that volume.
- Does John need to see it? My view: no new policy — the ruling describes the limiters, not their order, so it is
  silent rather than contradicted. Your call.

**D2 Keep or revert L2 (bcrypt compare on `user_not_found`).** Cost: one bcrypt compare (cost 12 in prod) per login
attempt for an address with no account, plus one extra hash the first time per process (the equaliser hash is minted
lazily). Bounded per IP by captcha + 5/email/15min + strict 60 failed/hour. Not a new amplification class — attempts on
EXISTING addresses already made the server bcrypt; it removes the cheap path. ❓ Not measured on the 2 GB VPS, where
BullMQ workers share the API process's libuv threadpool.

**D3 `architecture.md` ADR-015 is STALE — found while writing this handoff, NOT fixed (outside the review brief).**
`_bmad-output/planning-artifacts/architecture.md:2814-2815` still calls the burst limiter "per-IP" and
`strictLoginRateLimit` "10 / 1 hour, All responses — catches sustained activity incl. successful brute-forces" — the
exact claim the PRD amendment removed. Planning-artifact parity: fix in the same commit (recommended) or record a residual.

**D4 Commit scope.** `git status` = 14 entries = this story's File List + `pm-ruling-2026-09-16-nfr4-4-rate-limit-axis.md`
(untracked, John's — include or not). All 14 are LF.

**D5 Owners for the two new residuals** (rows in Residuals above): **R7** — `registrationEmailRateLimit` and
`wizardDraftEmailRateLimit` still key on the raw email (the H2 defect this story copied from them; wizard-draft is the
larger exposure). Proposed: Lane C sweep. **R8** — account existence still revealed by error CODES (locked / not
activated / suspended, and "use the staff/public login" after a correct password); L2 closed only the timing channel.
Product copy → John, Lane C.

### 2. Findings → fix → proof

Full text of each finding, with its evidence, is under **Tasks → Review Follow-ups (AI)**; probe output and the RED runs
are in **Debug Log → ADVERSARIAL REVIEW ROUND**.

| id | sev | defect | established by | fix | pinned by |
|---|---|---|---|---|---|
| H1 | HIGH | per-email limiter ran before `verifyCaptcha`; a 400 counted against the victim's email | **probe** — 5 token-less requests → victim's correct password from another IP → 429 | mount order (D1) | binding: *requests without a valid captcha never spend a person's budget* |
| H2 | HIGH | raw email as Redis key; 1 MB body limit (`app.ts:331`); written before validation; plaintext addresses in Redis | code | key = `e:<sha256(normalised)>`, 66 chars always | key: *a megabyte "email" still yields a fixed-size key…* |
| M1 | MED | strict first → a person's own 429s and captcha 400s charged to the shared IP budget | **probe** — 5×401 + 55×429 by one person → stranger's correct password → `AUTH_IP_BLOCKED` | mount order (D1), strict LAST | binding: *one person's refused retries are not charged to their proxy*; *captcha failures are not charged to strict either* |
| M2 | MED | "not a net loosening" false: one account ≈ 58/day → ≈ 320–480/day (decay); spray 10 → 60/IP/hour | arithmetic, HEAD vs tree | record corrected (numbers are ruled): security table, strict docblock, PRD | — |
| M3 | MED | flood ceiling named as the enumeration bound; strict refuses a failure stream at 61, so flood can never bind it | thresholds + order | record corrected: table, both docblocks, PRD | binding AC7 spray-at-61 |
| M4 | MED | binding test hand-built "the production stack" with no captcha and `NODE_ENV=development` — **why H1/M1 were invisible** (§2ak) | read the test | test reads the pre-controller middleware FROM THE REAL ROUTER, production mode, captcha enforced (stubbed `fetch`); AC3 varies IP; mount-identity pins first FOUR incl. `verifyCaptcha` | two sentinels (limiters not skipped; token-less request refused) |
| M5 | MED | [x] tasks described superseded shapes; sprint-status said 10 → 200 | read the story | struck through in place with shipped values; sprint-status rewritten; audit script re-run | — |
| L1 | LOW | `keyedBy` duplicated the builder's predicate | code | derived from `buildLoginRateLimitKey(...).startsWith('e:')` | binding AC1 / AC4 |
| L2 | LOW | `user_not_found` returned before bcrypt → timing reveals active accounts | code | `spendPasswordCompareTime()` in `loginStaff` + `loginPublic` (D2) | decay file: *an unknown email still spends a password compare* ×2 |
| L3 | LOW | PRD: burst limiter counts "403 Account Locked"; the lock is 429 | code | PRD corrected | — |

**The review brief's questions, answered:**
- *More attempts against ONE account?* **Yes** for a patient attacker (≈ 58 → ≈ 320–480/day, via decay — ruled at
  480/day). **Fewer** for a parallel burst: the per-email Redis INCR admits ≤ 5 failures/15 min however many run
  concurrently (the account counter is a non-atomic read-modify-write — pre-existing; the limiter now bounds it).
- *Rotate emails?* Bounded by **strict** at 60 failures/IP/hour — not the flood ceiling. 6× HEAD.
- *Non-existent accounts?* Strict (plus captcha) is the only per-IP bound; 100/15min never binds a failure stream.
- *`skipSuccessfulRequests` after the re-key?* Holds — express-rate-limit 8.3.0 decrements the key computed at request
  time (`dist/index.mjs:820, :905`); AC5 goes red when it is removed.
- *Lockout untouched?* Thresholds yes (pinned). Behaviour no — decay is deliberate. The constants test alone would pass
  with the lock code deleted; the behavioural witness is *the 10th failure still locks*.
- *Tests fail on revert?* Checked by mutation (§4). *Test written from the middleware's own config?* Yes — M4, fixed.
- *Doc table matches shipped numbers?* Yes (login + registration rows); `googleAuthRateLimit` stale = R4.
- *Unpatched fixed-list `vi.mock`?* None: only magic-link and sms-otp route tests mock it; both patched, real counts 16 / 8.

### 3. Where the code is

| location | what |
|---|---|
| `apps/api/src/routes/auth.routes.ts:42, :51, :185, :195` | the four login routes — new order, with the reason in comments |
| `apps/api/src/middleware/login-rate-limit.ts:74` | `buildLoginRateLimitKey` (sha256) |
| `…/login-rate-limit.ts:105` | `loginIpFloodLimit` — first; NOT the failure bound |
| `…/login-rate-limit.ts:174, :206` | `loginRateLimit` — after the captcha; derived `keyedBy` |
| `…/login-rate-limit.ts:252` | `strictLoginRateLimit` — last; the derivation holds only there |
| `apps/api/src/services/auth.service.ts:74, :517, :738` | `spendPasswordCompareTime` and its two call sites |
| `apps/api/src/middleware/__tests__/login-rate-limit.binding.test.ts` | reads the REAL router; 17 tests |

### 4. Verify it yourself — do not take this section on trust

From `apps/api`, against `app_test` (the db-guard refuses `app_db`):

```bash
DATABASE_URL=<…/app_test> NODE_ENV=test pnpm vitest run \
  src/middleware/__tests__/login-rate-limit-key.test.ts \
  src/middleware/__tests__/login-rate-limit.binding.test.ts \
  src/middleware/__tests__/rate-limit-coverage.test.ts \
  src/services/__tests__/auth.service.lockout-decay.test.ts \
  src/routes/__tests__/magic-link.routes.test.ts \
  src/routes/__tests__/sms-otp.routes.test.ts
```

**Predict:** 6 files, **75 tests**, all pass (key 14 · binding 17 · coverage 8 · decay 12 · magic-link 16 · sms-otp 8).
*(Run by the reviewer after writing this prediction: 75 passed.)*

**The +8 suite delta, itemised:** key +1 (fixed-size digest) · binding 12 → 17 (+5: captcha sentinel, H1 budget,
flood-counts-captcha, M1 stranger, captcha-not-charged) · decay 10 → 12 (+2: `user_not_found` compare ×2).

**Mutations** (scripted replace, exact-match count asserted, restored, sha1 verified):

| mutation | red |
|---|---|
| all four routes back to the authored order | 5 — mount-identity, H1, flood-counts-captcha, M1, captcha-not-charged |
| captcha alone moved after the burst limiter | 2 — mount-identity, H1 |
| strict alone moved before the burst limiter | 2 — mount-identity, M1 |
| raw email key (digest removed) | 3 — key tests |
| *pre-review claims, re-run by the reviewer:* old keying + strict 10 all-responses | 6 binding tests |
| *pre-review claims, re-run by the reviewer:* decay calls removed | 2 decay tests |

### 5. What was NOT verified — so nobody assumes it

1. **Prod Redis `maxmemory` / `maxmemory-policy`.** H2's real-world severity depended on it (noeviction → writes fail →
   BullMQ and sessions fail; allkeys-lru → sessions evicted). The login exposure is removed either way; R7 is not.
2. **hCaptcha siteverify quota** at ≤ 100 forged tokens/IP/15 min (D1-b).
3. **bcrypt CPU cost of L2** on the VPS (D2).
4. **No running-app UAT.** Web login and MFA step 2 were NOT exercised in a browser after the reorder. Why they should be
   unaffected: both already send `captchaToken` (`useLogin`, `mfa.api.ts:106`); a valid request passes each layer once
   and its hCaptcha token is still verified once. That is reasoning, not observation.
5. Web suite not run — no web file changed.
6. `architecture.md` ADR-015 not updated (D3).

### 6. What went wrong on the reviewer's side — recorded because each is a pattern

1. **The rewritten binding test first treated a token-less request as authorised.** `attempt(…, undefined)` silently took
   the parameter's DEFAULT and sent a valid captcha token — the H1 test would have passed over a hole. The captcha
   sentinel caught it (200, expected 400); token-less is now `null`. → *Candidate lesson: a default parameter swallows
   `undefined` in a negative test; sentinel the negative path, not only the positive one.*
2. One scripted story edit aborted on an anchor that spanned a line wrap. The script throws before writing, so nothing was
   half-applied; re-run on the story only, 29/29 edits, read back.
3. One review-item line came out with broken bold markdown; caught on read-back and repaired.
4. **The pre-review binding test had been "RED-verified by mutation" and still missed H1 and M1**, because every mutation
   ran inside a harness that had already left the captcha out. Mutation testing only proves what the harness can see.
   → *Candidate playbook entry: middleware ORDER is a control; a test that re-types the order instead of reading it from
   the router cannot detect an order defect.*
5. The handoff was first written to the scratch file `zzzzzzzzzz.txt` by mistake; moved here on Awwal's instruction and
   removed from the scratch file (restored to its prior 14,860 lines).

### 7. Deploy — predictions and stop conditions (the deploy is yours; this is what the reviewer would check)

No migration · no new env var · no new dependency · Redis keyspace change only.

**Before deploy** (read-only prod, `default_transaction_read_only=on`):
- `SELECT count(*) FROM users WHERE failed_login_attempts >= 10;` and `SELECT count(*) FROM users WHERE locked_until > now();`
  — write both down. After deploy, any account with an EXPIRED lock resets to 0 on its next attempt (decay).
- `docker exec <redis> redis-cli CONFIG GET maxmemory` and `CONFIG GET maxmemory-policy` (§5.1).

**After deploy** — predict first, then compare:
1. `POST /api/v1/auth/staff/login` with `{ email: "<non-staff test address>", password: "x" }` and **no** `captchaToken`,
   6 times from one machine. **Predict: `400 AUTH_CAPTCHA_FAILED` all 6 times — NOT 429 on the 6th.** That is H1's fix
   firing on prod (before the fix the 6th was 429). Costs 6 of that IP's 100 flood slots, nothing else.
2. After any real failed login on prod: `redis-cli --scan --pattern 'rl:login:e:*' | head`. **Predict: every suffix is 64
   hex characters; `--scan --pattern 'rl:login:e:*@*'` returns nothing.** That is H2's fix on real traffic.
3. A real staff login with correct credentials → 200 (or the MFA challenge for a super-admin).
4. pm2 logs: every `auth.rate_limit_exceeded` carries `keyedBy`; `auth.ip_blocked` carries `reason: excessive_failures`.

**Stop conditions:**
- any 5xx from a login route;
- during the enumerator re-run, ANY `auth.ip_blocked` or `auth.login_ip_flood_limit_exceeded` whose IP reverse-resolves
  to `opera-mini.net` or a carrier CGNAT range → pause the re-run and pull the log window (with M1 fixed, 17 enumerators
  should not be able to reach 60 failures on one address);
- login latency for unknown addresses visibly above a normal wrong-password login (D2).

Residuals unchanged by this round: R2a (escalation; 480/day accepted), R2b (monitor, DATED 2026-10-15, acceptance =
demonstrated firing), R4, R5. New: R7, R8 (D5).

### 8. What the reviewer needs back

**D1** ratify / reject the order · **D2** keep / revert L2 · **D3** fix `architecture.md` now or residual · **D4** commit
scope · **D5** owners for R7 / R8. If D1 or D2 is rejected, name it: that change alone is reverted, the RED/mutation proof
re-run for what remains, and the full API suite re-run before handing back.

## Change Log

- 2026-09-16 — Story authored via canonical *create-story from brief b10ecda + SCP Lane A. Status ready-for-dev.
- 2026-09-16 — dev-story: Tasks 1–6 implemented test-first and RED-verified by mutation (login re-keyed to email, `loginIpFloodLimit` 100/IP/15min mounted on 4 routes, `strictLoginRateLimit` 10 → 200, `keyedBy` on every 429, lockout constants pinned, coverage map + table + PRD login block amended). Fixed a Redis keyspace collision in the story's own spec (flood prefix). **HALTED before Task 7 close** on the PM ruling of 2026-09-16, which makes 200/IP/hour conditional on lockout-decay and requires a cardinality monitor — Awwal's decision. Status in-progress.
- 2026-09-16 — Scope addendum (adjudication) applied: `strictLoginRateLimit` 200 → 60/IP/hour pinned by test; `loginIpFloodLimit` kept and recorded as non-binding (proven alone + non-binding pinned through the stack); combined per-IP login budget stated as 60/hour in code, coverage table, PRD and story; lockout decay recorded as a tracked residual (separate story). Gates re-run green (API suite 4546 passed). Residuals ledger + closing verdict added; **R2 (cardinality monitor) needs an adjudication ruling**. Status → review, handed over UNCOMMITTED for adversarial code review.
- 2026-09-16 — **Final scope** (adjudication consolidated instruction, ruling on PM Addendum A; supersedes the addendum in two places): `strictLoginRateLimit` 60 FAILED-only (availability fix, derived 60); `loginIpFloodLimit` re-documented as LOAD-BEARING (all "non-binding" wording deleted; production-stack test added); lockout decay added to `loginStaff`/`loginPublic`; `email` on both `invalid_password` logs; runbook entry. R2 resolved by ruling; R2a (escalation) and R2b (monitor, dated 2026-10-15, demonstrated-firing AC) recorded, not built. Fixed a CRLF rewrite of `auth.service.ts` introduced by this session. Status → review.
- 2026-09-16 — **Adversarial code review** (Awwal: "create action items and fix them all"). 2 HIGH, 5 MEDIUM, 3 LOW, recorded under Tasks → Review Follow-ups (AI). H1 (a request with no captcha could spend any person's per-email budget) and M1 (one person's own 429 retries were charged to their proxy's strict budget) were proven by probe and fixed by **mount order** on all four login routes (`loginIpFloodLimit → verifyCaptcha → loginRateLimit → strictLoginRateLimit`). H2: the per-email key is now a SHA-256 digest. L2: `user_not_found` spends a bcrypt compare. M4: the binding test mounts the real router's stacks with the captcha enforced. M2/M3/M5/L3: record corrected (security table, docblocks, PRD, task annotations, sprint-status). Residuals R7, R8 added. All new tests RED before the fix; every fix mutation-verified; gates re-run. Status stays **review** — adjudication owns done/deploy.
- 2026-09-16 — **Handoff to Adjudication** section added (above): five decisions (D1 mount order, D2 bcrypt on unknown emails, D3 stale `architecture.md` ADR-015, D4 commit scope, D5 owners for R7/R8), findings→fix→proof table, re-runnable verification with a prediction (75 tests — confirmed), what was not verified, reviewer-side errors, and a deploy runbook with predictions and stop conditions. Closing verdict hold condition updated: no commit/deploy until D1 and D2 are ruled.


---

## ⚖️ ADJUDICATION — 2026-09-16

*Third independent layer. Every gate re-run here; nothing below is taken from the review's report.*

### Gates, run independently

| gate | result |
|---|---|
| Full API suite (`app_test`, `VITEST_MAX_THREADS=1`) | **exit 0 — Test Files 323 passed / 2 skipped (325); Tests 4565 passed / 8 skipped (4573)**, 453 s. **Identical to the review's claim**, including the collected-file count (325), so it was not a contended run. |
| `tsc --noEmit` (api) | clean |
| The reviewer's own falsifiable prediction — 6 named files, "75 tests" | **75 passed (75).** Exact. |
| My mutation: all four routes reverted to the authored order | **4 red** — H1, flood-counts-captcha, M1, captcha-not-charged. Restored, sha256 verified. |

### ⛔ F1 — THE MUTATION TABLE OVERSTATES BY ONE, AND THE SENTINEL DOES NOT DO WHAT ITS NAME SAYS

The table predicts **5 red** for the mount-order revert and names `mount-identity` among them. **The real
number is 4.** That sentinel asserts the four login routes **equal each other** — not *which order they
agree on*. Reordering all four identically (exactly the mutation that reintroduces H1 and M1) leaves them
mutually equal and the sentinel green.

✅ **Fixed at adjudication**, because D1 ratifies a specific order and a ratified order needs an assertion
that fails when it changes: a new ordered-identity test in `login-rate-limit.binding.test.ts`. GREEN 18/18;
**RED-verified — the same mutation now yields 5 red, the number the table always claimed.**

⭐ The behavioural tests did catch the defect, so this was never a hole — it is a **record** defect, and the
same shape as §2ak: an assertion whose NAME implies a property it does not test.

### Rulings

**D1 — ✅ RATIFY the mount order** (flood → captcha → per-email → strict). Reproduced by mutation; it
strictly improves on both proven holes and makes proxy-wide denial ~6.7x costlier (60 requests/hour to hold
a proxy becomes ~400/hour). **Does John need to see it: NO** — the ruling specified the limiters, not their
order, so it is silent rather than contradicted. ⚠️ **But the order is now load-bearing security
behaviour**, so it is written into architecture ADR-015 here and must appear in NFR4.4 when Lane C lands —
a one-line addition, not a re-ruling. Ratified with residuals A1-A3.

**D2 — ✅ KEEP L2** (bcrypt compare on `user_not_found`). Bounded by `strictLoginRateLimit` at 60 failures
per IP per hour, so at most 60 bcrypt(12) per IP per hour, about **15 s CPU/hour/IP** worst case. Not a new
amplification class: attempts on EXISTING addresses already made the server bcrypt; this removes the cheap
path that distinguished them. Unmeasured VPS latency is residual **A2**.

**D3 — ✅ FIXED HERE, not deferred.** `architecture.md` ADR-015 still called the burst limiter per-IP and
the sustained one "10 / 1 hour, all responses — catches successful brute-forces", the exact claim the PRD
amendment withdrew. Planning-artifact parity on story close is a standing rule, so it is corrected in this
commit, including the load-bearing mount order and the decay.

**D4 — ✅ All 14 entries commit together**, `pm-ruling-2026-09-16-*.md` included: it is the record this
story implements, and a story whose governing ruling is untracked is not reproducible.

**D5 — ✅ Owners as proposed.** R7 to the Lane C sweep. R8 to John (PM), Lane C — it is product copy.

### New residuals from adjudication

| # | residual | why not fixed here | reopen trigger |
|---|---|---|---|
| **A1** | **The accidental proxy block.** `loginIpFloodLimit` is mounted first with no `skipFailedRequests`, so it counts the 429s the downstream limiters produce. One person: 5 failures (email budget spent) plus 95 of their OWN 429s = 100, and **their whole proxy is refused for 15 minutes**. About 7 req/min by hand; seconds for a buggy client retry loop. **M1 surviving one layer down.** | Every alternative is worse: `skipFailedRequests` would skip 401s and gut the ceiling; a person-key defeats its purpose. 100 is the ruled number and the combined-budget framing depends on it. | any `auth.login_ip_flood_limit_exceeded` where one email dominates the window, or whose IP does not resolve to a proxy/CGNAT range |
| **A2** | hCaptcha **siteverify volume per IP rises from 60/hour to 400/hour** (the ceiling now sits ahead of the captcha by design — it must, to bound the call at all). Whether hCaptcha rate-limits at that volume is **unverified**. Also unmeasured: bcrypt p95 on the 2 GB VPS where BullMQ workers share the libuv threadpool. | Both need production measurement, not argument. Real exposure is low — peak organic traffic is about 19 registrations/day. | any hCaptcha quota or error response, or a login p95 latency regression |
| **A3** | **Flood-ceiling inconsistency.** `activationIpFloodLimit` and `passwordResetCompletionIpFloodLimit` are both **300**/15min; `loginIpFloodLimit` is **100**/15min — same shared-proxy population, 3x tighter. Login's is defensible (it bounds the captcha call) but the divergence is undocumented. | A number John ruled adjacent to; it belongs with the Lane C tier table, not a late unilateral change. | Lane C story picked up, or A1 fires |

⚠️ **A1 is stated in USER terms deliberately.** The review framed D1(a) as attacker cost. **All four
incidents in this family were legitimate users tripping limiters — this project has never been attacked.**
An attacker-only framing under-weights the failure mode that has actually occurred four times.

### Deploy prediction — measured, not assumed

The story's deploy note asks for `SELECT count(*) FROM users WHERE failed_login_attempts >= 10` before
deploy. Run on prod (read-only) at adjudication:

| at >= 10 | 5-9 | currently locked | any failures at all |
|---|---|---|---|
| **0** | **0** | **0** | **1** |

**The decay change is behaviourally inert on deploy** — nobody is locked and nobody is near the threshold.
⭐ And it corroborates §0.1a hard: **exactly ONE account registry-wide carries any failed-attempt count**,
against 36 logged login failures — because a wrong ADDRESS never reaches a password check, so the counter
never moves. The plus-addressing cohort is invisible in this column by construction.

### Verdict

✅ **ACCEPTED — the work is complete and correct. Status STAYS `review` until prod verification.**

⚠️ I flipped it to `done` and reverted, because the story-residual guard refused it and was RIGHT twice over:
(1) in this repo `done` means CLOSED ON PROD (cf. 13-67 `done # ✅ CLOSED ON PROD, deploy 9e8235b`), and
13-68 is not pushed; 12-6 is the precedent — adjudicated, committed, left at `review`. (2) R2a/R2b/R4/R5/R7
are handed to stories that **do not exist yet**. Marking them ACCEPTED to satisfy the guard would be the
exact pattern that produced this whole defect family: registration → activation → password reset, each
"handed to a sweep" that never happened. ⭐ **The guard exists to stop precisely the move I was about to
make, and I only hit it because I ran lint before committing rather than after.** Both HIGH findings were holes this story created, both were
established by probe rather than argument, and both are now pinned by tests that go red on revert. The
record defect (F1) is fixed with its own RED-verified guard. No blocking residual remains: R1 and R3 closed
here, R2 resolved by ruling, R2a/R2b dated and triggered, A1-A3 recorded with reopen triggers.

⚠️ **Not yet deployed.** Push, CI, deploy, then verify on prod that two emails from ONE IP get independent
budgets — the same three-arm shape used for the activation and reset limiters.
