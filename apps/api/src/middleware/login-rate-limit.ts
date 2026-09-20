import { createHash } from 'node:crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Response } from 'express';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import pino from 'pino';
import { RATE_LIMIT_PREFIXES } from '../lib/rate-limit-prefixes.js';

const logger = pino({ name: 'login-rate-limit' });

// Check if we're in test mode (vitest sets VITEST env var)
export const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';

// Redis client — delegates to centralized factory, null in test mode
export const getRedisClient = () => {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
};

// Skip function used by all rate limiters in test mode
export const shouldSkipRateLimit = () => isTestMode();

/**
 * Redis prefixes for the three login limiters. rate-limit-redis stores each count at
 * `${prefix}${key}`, so two limiters whose prefix + key can spell the same string share ONE counter.
 *
 * ⛔ The flood ceiling must NOT live under `rl:login:`. `loginRateLimit` falls back to the key
 * `ip:<addr>`, so a flood prefix of `rl:login:ip:` (raw IP key) writes `rl:login:ip:<addr>` too —
 * on every request to the MFA step-2 routes, which carry no email. The burst limiter's
 * skipSuccessfulRequests decrement would then subtract from the flood count, and the flood's
 * every-request increment would make the burst limiter count successful logins again.
 * `login-rate-limit-key.test.ts` pins the separation; the in-memory test store cannot see it.
 *
 * ⛔ Story 13-70 FR2 — NO PREFIX MAY BE A PROPER PREFIX OF ANOTHER (PRD NFR4.4.c). The burst limiter
 * was `rl:login:`, which `rl:login:strict:` nested inside. That was SAFE, but only conditionally:
 * safe because `loginRateLimit`'s keys always begin `e:` or `ip:`, so no key could ever spell
 * `strict:`. A safety that depends on another limiter's key SHAPE is one refactor from being untrue,
 * and the same shape had already gone wrong twice in this family (`rl:activation:` and
 * `rl:password-reset-complete:`). `rl:login:burst:` and `rl:login:strict:` are now siblings, so the
 * property is structural and `rate-limit-prefix-disjointness.test.ts` enumerates EVERY limiter in
 * `middleware/` and asserts it — a limiter added tomorrow is covered without anyone remembering.
 *
 * Deploy note: Redis-only. Counters under the old prefixes are orphaned and age out with their own
 * TTL (≤15 min here), so at worst one window's budget is handed back. No migration.
 */
/* ------------------------------------------------------------------------------------------------
 * Story 13-70 FR1 — "A REFUSAL IS NOT A REQUEST" (PRD NFR4.4.d), as ONE rule applied uniformly.
 *
 * THE RULE, in two halves, and every limiter on the login routes obeys both:
 *   1. When a limiter refuses, it stamps its OWN NAME into `res.locals.rateLimitRefusedBy`.
 *   2. A limiter never counts a request that a DIFFERENT limiter refused. Its own refusals it still
 *      counts — that is what keeps `attempts` meaning "requests from this IP".
 *
 * ⛔ WHY THE MARKER CARRIES A NAME AND NOT A BOOLEAN. A boolean can only express "somebody refused
 * this", which forces every limiter to choose between discounting its own 429s (the rejected Option
 * A — the counter then pins at `max` and the reopen trigger at `loginIpFloodLimit` becomes
 * undiagnosable exactly when it fires) and counting everyone's. The NAME lets each limiter ignore
 * every refusal but its own, which is what NFR4.4.d actually says: *any OTHER limiter*.
 *
 * ⚠️ POLARITY IS PER SITE, AND THE TWO SHAPES ARE NOT INTERCHANGEABLE. `express-rate-limit`
 * consults `requestWasSuccessful` ONLY when `skipFailedRequests` or `skipSuccessfulRequests` is set
 * (8.3.0: `if (config.skipFailedRequests || config.skipSuccessfulRequests)`), and each flag reads
 * the answer the opposite way round — so the predicate alone is dead code, and the wrong flag
 * inverts the control:
 *   • `skipFailedRequests` decrements when the predicate is FALSE  → flood ceiling: "successful"
 *     means *not refused by another limiter*.
 *   • `skipSuccessfulRequests` decrements when the predicate is TRUE → burst/strict: "successful"
 *     means *a 2xx, or a refusal by another limiter*.
 *
 * ⛔ `verifyCaptcha` deliberately does NOT stamp. Its 400 stays counted, so the flood ceiling keeps
 * bounding the hCaptcha siteverify call per IP (AC2).
 * ---------------------------------------------------------------------------------------------- */

/**
 * The value each limiter stamps. Named constants, so the predicates, the limiters and the tests
 * cannot drift apart, and `grep REFUSED_BY` finds every limiter that has opted in.
 */
export const REFUSED_BY_LOGIN_IP_FLOOD_LIMIT = 'loginIpFloodLimit';
export const REFUSED_BY_LOGIN_RATE_LIMIT = 'loginRateLimit';
export const REFUSED_BY_STRICT_LOGIN_RATE_LIMIT = 'strictLoginRateLimit';
export const REFUSED_BY_MFA_RATE_LIMIT = 'mfaRateLimit';

/* ------------------------------------------------------------------------------------------------
 * Story 13-70 R7 — THE OTHER FOUR ROUTE FAMILIES (adversarial review 2026-09-20, fixed 2026-09-20).
 *
 * FR1 and R3 made the rule true on the login routes. NFR4.4.d is ROUTE-GENERAL — *any other limiter
 * on the same route* — and the review found four more pairs with the identical shape the login pair
 * had: a flood ceiling mounted FIRST counting all responses, with a person-keyed limiter behind it
 * and no skip predicate anywhere. The PRD had been flipped to "IMPLEMENTED" while four fifths of
 * the clause was untrue, which is the drift class this whole arc exists to close.
 *
 *   activation         `activationIpFloodLimit`                → `activationRateLimit`
 *   password reset     `passwordResetCompletionIpFloodLimit`   → `passwordResetCompletionRateLimit`
 *   registration       `registrationRateLimit`                 → `registrationEmailRateLimit`
 *   wizard draft       `wizardDraftRateLimit`                  → `wizardDraftEmailRateLimit`
 *
 * ⛔ WHY THE CEILINGS GET THE PREDICATE AND THE SECOND LIMITERS ONLY STAMP. Every mount of all eight
 * was enumerated (`routes/auth.routes.ts:27,29,108-109,115-116`; `routes/registration.routes.ts:60,
 * 61,74-75,99`) and in every one the person-keyed limiter is LAST — `registrationBurstWatch` sits
 * behind it on `/wizard` but calls `next()` and never answers 429. So the seconds have nothing
 * behind them to be charged for, and giving them `skipFailedRequests` anyway would buy nothing and
 * cost something real: it registers the `close`/`error` decrement listeners of **R4**, and if BOTH
 * limiters on a route carry them then NOTHING on that route counts an aborted request. Login is
 * safe from that precisely because burst and strict use `skipSuccessfulRequests`, which registers
 * `finish` only. Keeping the seconds listener-free preserves the same shape here.
 *
 * ⚠️ SO THIS IS THE ONE PLACE A MOUNT-ORDER ASSUMPTION REMAINS, and R3 is the reason to say it out
 * loud: mount `mfaRateLimit`'s equivalent behind any of these seconds and it needs the predicate
 * too. `rate-limit-coverage.test.ts` asserts each route's limiter list, so adding one reds there.
 *
 * ⭐ THE BURST BREAKER GETS BETTER, NOT WORSE. `recordRegistration429` fires from each limiter's
 * `handler`, so Story 13-46's turn-away signal still counts every refusal that happens. What
 * changes is that the ceiling refuses LESS — it stops charging a registrant's own 429s to the
 * 50-per-IP budget their whole proxy shares — so the breaker stops counting a person's retries into
 * their own refusal as fresh turn-aways. The signal narrows onto real ones.
 * ---------------------------------------------------------------------------------------------- */
export const REFUSED_BY_ACTIVATION_IP_FLOOD_LIMIT = 'activationIpFloodLimit';
export const REFUSED_BY_ACTIVATION_RATE_LIMIT = 'activationRateLimit';
export const REFUSED_BY_PASSWORD_RESET_COMPLETION_IP_FLOOD_LIMIT = 'passwordResetCompletionIpFloodLimit';
export const REFUSED_BY_PASSWORD_RESET_COMPLETION_RATE_LIMIT = 'passwordResetCompletionRateLimit';
export const REFUSED_BY_REGISTRATION_RATE_LIMIT = 'registrationRateLimit';
export const REFUSED_BY_REGISTRATION_EMAIL_RATE_LIMIT = 'registrationEmailRateLimit';
export const REFUSED_BY_WIZARD_DRAFT_RATE_LIMIT = 'wizardDraftRateLimit';
export const REFUSED_BY_WIZARD_DRAFT_EMAIL_RATE_LIMIT = 'wizardDraftEmailRateLimit';

/**
 * Did a limiter OTHER than `self` refuse this request?
 *
 * `undefined` means nobody refused it — an ordinary 401, 400 or 200, all of which stay counted.
 */
export function refusedByAnotherLimiter(res: Response, self: string): boolean {
  const by = res.locals.rateLimitRefusedBy;
  return by !== undefined && by !== self;
}

export const LOGIN_RATE_LIMIT_PREFIX = RATE_LIMIT_PREFIXES.LOGIN_BURST;
export const LOGIN_IP_FLOOD_PREFIX = RATE_LIMIT_PREFIXES.LOGIN_IP_FLOOD;
export const STRICT_LOGIN_RATE_LIMIT_PREFIX = RATE_LIMIT_PREFIXES.LOGIN_STRICT;

/**
 * Story 13-68 — key for `loginRateLimit`: the SUBMITTED EMAIL, falling back to the IP.
 *
 * Why not the IP: Opera Mini proxies every user through a handful of servers (the activation
 * limiter logged 244 refusals from SIX of them on 2026-09-07/08, reverse DNS `opera-mini.net`)
 * and carrier CGNAT does the same. A per-IP login budget is therefore shared between strangers —
 * one enumerator typing the wrong address five times locked out everyone behind their proxy.
 * Keying the email makes the budget one person's, and caps a BURST against one account: rotating IPs
 * no longer mints a fresh budget, and at most five failures per 15 minutes reach the (non-atomic)
 * account counter in AuthService however many requests are sent in parallel.
 *
 * The body is already parsed here: app.ts mounts express.json before the router, and this is
 * route-level middleware. It is the RAW body, though — `emailSchema`'s lowercase/trim runs later,
 * in the controller — so the builder normalises itself, or `A@x.com` and `a@x.com ` would be two
 * buckets and the limit would be evaded with a space.
 *
 * ⛔ The key is a SHA-256 DIGEST of the normalised address, never the address (adversarial review
 * 2026-09-16, H2). The body limit is 1 MB and nothing has validated the email yet, so a raw key let
 * one IP park megabyte-sized keys in the Redis that BullMQ and the sessions share — and kept every
 * login address in Redis in plaintext. A digest is a fixed 64 characters. It is unsalted on purpose:
 * the same address must always reach the same bucket, and anyone who can read Redis can already read
 * the users table.
 *
 * Falls back to the IP when there is no usable email. That covers a malformed body (which must not
 * bypass the limiter) and, deliberately, the MFA step-2 routes, whose body is
 * `{ mfaChallengeToken, code }`: that is exactly today's behaviour there. A challenge token is
 * single-use (consumed on first read), so keying it would silently delete the burst limit on those
 * routes; they are super-admin-only, and re-keying them is SCP Lane C.
 *
 * `ipKeyGenerator` is mandatory on the fallback — an IPv6 subscriber holds a whole prefix and
 * could mint a bucket per request by rotating low bits. The library's ERR_ERL_KEY_GEN_IPV6 warning
 * is a toString() grep and proves nothing; `login-rate-limit-key.test.ts` is the proof. The `ip`
 * passed in is `req.ip`, which `realIpMiddleware` (app.ts) has already resolved from a verified
 * Cloudflare edge — do not read headers here.
 */
export function buildLoginRateLimitKey(email: unknown, ip: string | undefined): string {
  if (typeof email === 'string' && email.trim()) {
    return `e:${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}`;
  }
  return `ip:${ipKeyGenerator(ip ?? 'unknown')}`;
}

/**
 * Story 13-68 — per-IP FLOOD CEILING for the login routes: 100 requests / IP / 15 min.
 *
 * This is the only login key strangers share, so it is sized for the worst legitimate case behind
 * ONE address — an Opera Mini proxy or a carrier CGNAT gateway carrying many people — not for one
 * person. It exists to stop a spray: an attacker cycling emails mints a fresh per-email bucket each
 * time. ⛔ Do not remove it because a person key exists; that is a regression, not a simplification.
 *
 * MOUNTED FIRST on every login route (flood → verifyCaptcha → loginRateLimit → strictLoginRateLimit;
 * adversarial review 2026-09-16). Being first, it counts everything behind it — including requests the
 * captcha refuses — so it is also what bounds the hCaptcha verification call per IP.
 *
 * ⚠️ It is NOT the bound on a stream of FAILURES (a credential spray, or enumeration of accounts that do not
 * exist — a `user_not_found` login increments nothing account-side, which is why 36 wrong-address enumerator
 * failures left `failed_login_attempts = 0`). Failures are refused by `strictLoginRateLimit` at 61 per hour,
 * long before this ceiling's 100 per 15 minutes; that is the constant not to raise for enumeration.
 *
 * ⭐ LOAD-BEARING: this is the ONLY login limiter that counts SUCCESSFUL responses (no
 * skipSuccessfulRequests — and Story 13-70 did not add one; what it added is `skipFailedRequests`
 * bound to a marker predicate, which discounts only the 429s OTHER limiters emit).
 * `loginRateLimit` and `strictLoginRateLimit` both count failures only, so without this ceiling nothing
 * would bound the volume of SUCCESSFUL requests from one IP — e.g. an attacker who already holds valid
 * credentials validating them in bulk. The binding test pins it through the production stack: 100
 * successful logins from one IP are served, the 101st is refused here. It retains the all-response property
 * the stack used to get from strict; do not add skipSuccessfulRequests to it.
 */
export const loginIpFloodLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: LOGIN_IP_FLOOD_PREFIX,
  }),
  windowMs: 15 * 60 * 1000,
  // ⛔ 100 REQUESTS / IP / 15 MIN — ACCEPTED 2026-09-20 (Awwal, Story 13-70 R1). The derivation
  // below REPLACES the one that stood here, which was wrong on its own terms twice over.
  //
  // IT USED TO SAY: *"the enumerator cohort is 17 people — every one of them failing five times is
  // 85."* Measured read-only on prod 2026-09-20: there are **28 enumerator accounts and NINE of them
  // are the operator's own harness logins** (`lawalkolade+demo1/2/3`, `+enum1`, `+test`, …), leaving
  // **19 real field accounts**. So "17" mixed field staff with the test harness. And "failing five
  // times is 85" counted only failures, while this is the one login limiter with no
  // `skipSuccessfulRequests` — it counts successes too.
  //
  // THE DERIVATION, per person per window, of what THIS ceiling actually counts after Story 13-70
  // FR1: 5 failures (their whole per-email budget) + 1 success = **6**. Their own 429s are no longer
  // counted; a refused CAPTCHA still is, so a person who also fumbles the captcha costs more.
  //   • measured concurrency per shared address — 17 enumerators across SIX Opera Mini addresses on
  //     2026-09-07/08, so ≈3 per address:            3 × 6 =  18
  //   • absolute worst case, the whole field force behind ONE carrier gateway at once:
  //                                                 19 × 6 = 114
  //   • what 100 buys:                              ≈16 concurrent people behind one address
  //
  // ⭐ WHY THAT IS ACCEPTABLE NOW AND WAS NOT BEFORE, which is the whole reason this row could be
  // closed: until FR1 the binding constraint was ONE PERSON — five real attempts plus up to 95 of
  // their OWN refusals reached 100 and shut their entire proxy for fifteen minutes. It now takes
  // roughly seventeen simultaneous people to spend the same budget, against a measured concurrency
  // of three. FR1 did not raise the number; it changed who can spend it.
  //
  // ⚠️ THE NUMBER ITSELF IS STILL UNDER A DATED REVIEW, and it is not this comment's to move. The
  // PRD's flood-ceiling divergence ruling (2026-09-17) permits login's 100 against its Tier-1 peers'
  // 300 only because this ceiling also bounds the hCaptcha `siteverify` call and the bcrypt work
  // behind it — and it requires BOTH costs to be measured by **2026-10-15**, harmonising to 300 if
  // neither constrains. Story 13-70 **R5** carries that date. ⛔ And Story 13-70 **R6** records that
  // FR1 moved the two halves of that justification in OPPOSITE directions: bcrypt is bounded better
  // (a request refused downstream never reaches it), siteverify worse (it already made the call).
  // Measured in `login-rate-limit.binding.test.ts`: 40 captcha-passing requests refused by the burst
  // limiter cost 40 siteverify calls while this counter peaked at 6.
  //
  // REOPEN TRIGGER: any `auth.login_ip_flood_limit_exceeded` whose IP reverse-resolves to
  // opera-mini.net or a Nigerian carrier CGNAT range, **or the operator's own IP during a dev/UAT
  // session** (nine harness accounts share one desk), **or the count of real field accounts
  // exceeding 19** — 13-71 grows the cohort by design.
  max: 100,
  // ⛔ STORY 13-70 FR1 — A REFUSAL IS NOT A REQUEST (PRD NFR4.4.d). Ruled by Awwal, adjudication
  // 2026-09-20: mark and ignore (Option B), not a status filter (Option A).
  //
  // `loginRateLimit` and `strictLoginRateLimit` are mounted BEHIND this ceiling and stamp
  // `res.locals.rateLimitRefusedBy` before answering 429. This ceiling is mounted FIRST, so its
  // response listener is the only one that observes every other limiter's refusal; it hands its own
  // increment back for those requests. One enumerator mistyping a password five times used to spend
  // five real attempts PLUS up to ninety-five refusals OF those attempts against a budget their
  // whole Opera Mini proxy shares — every incident in this family was a legitimate person.
  //
  // ⚠️ `requestWasSuccessful` ALONE IS DEAD CODE — it is consulted only when `skipFailedRequests`
  // or `skipSuccessfulRequests` is set (express-rate-limit 8.3.0 dist, `if (config.skipFailedRequests
  // || config.skipSuccessfulRequests)`); with neither, no response listener is registered and the
  // predicate never runs. `skipFailedRequests` is the half that pairs with THIS predicate: it
  // decrements when the predicate returns false, which is exactly when a downstream limiter stamped
  // the marker. Read the option name through the predicate — "failed" here means "refused by another
  // limiter", and nothing else.
  //
  // ⭐ THE ALL-RESPONSE PROPERTY IS INTACT: `skipSuccessfulRequests` is still absent, so successful
  // logins are still counted and this is still the only login ceiling that bounds request VOLUME.
  //
  // ⛔ NOT `res.statusCode !== 429` (Option A, rejected): that also discounts this ceiling's OWN
  // 429s, so the counter pins at `max` and `attempts` below stops meaning "requests from this IP" —
  // the reopen trigger above becomes undiagnosable precisely when it fires. `verifyCaptcha`
  // deliberately does NOT stamp, so a refused captcha is still counted and this ceiling still bounds
  // the hCaptcha siteverify call per IP.
  //
  // ⚠️ KNOWN CONSEQUENCE, recorded not hidden: `skipFailedRequests` also registers `close` and
  // `error` listeners, and the `close` one decrements when the response did not finish writing — a
  // request aborted mid-flight is no longer counted. That is the right answer for a dropping mobile
  // connection (this cohort's normal condition) and a narrow evasion otherwise; Story 13-70 R4.
  skipFailedRequests: true,
  requestWasSuccessful: (_req, res) => !refusedByAnotherLimiter(res, REFUSED_BY_LOGIN_IP_FLOOD_LIMIT),
  message: {
    status: 'error',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many login attempts. Please try again later.',
  },
  handler: (req, res, _next, options) => {
    // Story 13-70 FR1 — stamp even though this limiter is mounted FIRST and nothing upstream reads
    // it. The rule is uniform on purpose: every limiter declares itself, so `attempts` in the log
    // below can be attributed, and a limiter inserted ahead of this one inherits the behaviour.
    res.locals.rateLimitRefusedBy = REFUSED_BY_LOGIN_IP_FLOOD_LIMIT;
    logger.warn({
      event: 'auth.login_ip_flood_limit_exceeded',
      ip: req.ip,
      path: req.path,
      keyedBy: 'ip',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attempts: (req as any).rateLimit?.current,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});

/**
 * Rate limiter for login attempts — 5 FAILED attempts per 15 minutes per EMAIL (Story 13-68).
 *
 * Keyed on the submitted email via `buildLoginRateLimitKey`, falling back to the IP when the body
 * has none (the MFA step-2 routes — see the builder). Until 2026-09-16 it was keyed on the IP, which
 * made five failures a budget shared by everyone behind one Opera Mini / CGNAT address: one person's
 * typos locked out strangers. Per email it caps a burst against one account, because rotating IPs no
 * longer buys a fresh budget. A failure spray across many accounts is bounded by
 * `strictLoginRateLimit` (60 failed/IP/hour); total request volume per IP, successes included, by
 * `loginIpFloodLimit` (100/15min); the account itself by the lockout in AuthService (10 failures →
 * 30-minute lock, cleared when it expires; 5 only logs a warning).
 *
 * ⛔ MOUNT ORDER IS PART OF THIS CONTROL (adversarial review 2026-09-16):
 * - AFTER `verifyCaptcha` (H1). Before it, a request with no captcha — a 400 — spent the victim's budget,
 *   so anyone who knew an address could hold that person's login shut for free, without a log line naming
 *   them. After it, every unit of someone's budget costs a solved captcha.
 * - BEFORE `strictLoginRateLimit` (M1). A person's retries into their OWN 429 then never reach the shared
 *   per-IP failure budget, so one person spends at most their 20 failures an hour of it.
 *
 * Known and accepted: anyone who knows an email and solves a captcha per attempt can spend its 5 failures
 * and hold its login for up to 15 minutes. That is the same capability, at a comparable captcha cost, as
 * submitting ten wrong passwords to trigger the 30-minute ACCOUNT lock, which the IP key never prevented.
 *
 * Story 9-13 close-out UAT 2026-06-02 surfaced that the original config counted
 * ALL requests (including successful logins). An operator iterating on the
 * MFA-pending skeleton bug fix hit the 5/15min limit on the 4th-5th successful
 * TOTP verify (`mfa.verify_success` audit rows confirm 3 successes in 35 min →
 * 4th-5th attempts tripped the limit despite all being legitimate). Adding
 * `skipSuccessfulRequests: true` means only FAILED logins count against the
 * counter (any 4xx/5xx response from the wrapped route). Attacker defense is
 * preserved: brute-force attackers spam wrong passwords/codes which return
 * 401/403/429 and DO count. Legitimate operators iterating on real credentials
 * are not penalised. Per-user `users.mfa_locked_until` (5 failures/15min) still
 * locks accounts on MFA credential abuse.
 */
export const loginRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: LOGIN_RATE_LIMIT_PREFIX,
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  // 5 FAILED requests per EMAIL per window. FAILS CLOSED for one person who mistypes their password
  // five times (they wait up to 15 minutes) — no longer for strangers sharing their proxy.
  max: 5,
  // Story 9-13 close-out — only count failed responses (4xx/5xx). Successful
  // 2xx logins do not increment the counter. Operator iteration friendly;
  // attacker defense preserved (failed brute-force attempts still counted).
  skipSuccessfulRequests: true,
  // ⛔ Story 13-70 R3 (ruled by Awwal 2026-09-20, after the FR1 pass measured the gap). This limiter
  // is mounted BEFORE `strictLoginRateLimit` and before `mfaRateLimit`, so it has already
  // incremented by the time either of them answers 429 — and its `skipSuccessfulRequests` decrements
  // only on a 2xx. A strict refusal therefore used to spend a unit of the per-EMAIL budget of
  // whoever happened to send it. MEASURED before the fix: once strict's 60/IP/hour was exhausted, an
  // address that had NEVER been given a single login attempt on that IP lost its whole 5-failure
  // budget to refusals it did not cause, and the sixth request was refused by THIS limiter.
  // "A 2xx, or a refusal by someone else" — its own 429s are still counted (see the docblock above).
  requestWasSuccessful: (_req, res) =>
    res.statusCode < 400 || refusedByAnotherLimiter(res, REFUSED_BY_LOGIN_RATE_LIMIT),
  // Destructured rather than touching `req.ip` — mirrors buildRegistrationEmailRateLimitKey. The
  // library's IPv6 validator greps this source text; the key-builder unit test is the real guard.
  keyGenerator: ({ body, ip }) =>
    buildLoginRateLimitKey((body as { email?: unknown } | undefined)?.email, ip),
  message: {
    status: 'error',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many login attempts. Please try again later.',
  },
  handler: (req, res, next, options) => {
    // Story 13-70 FR1 — tell the flood ceiling this response is a REFUSAL, not a request. Set before
    // the response is written, because the ceiling reads it from a `finish` listener.
    res.locals.rateLimitRefusedBy = REFUSED_BY_LOGIN_RATE_LIMIT;
    const key = buildLoginRateLimitKey((req.body as { email?: unknown } | undefined)?.email, req.ip);
    logger.warn({
      event: 'auth.rate_limit_exceeded',
      ip: req.ip,
      path: req.path,
      // The key actually used — derived from the builder itself, so the two cannot drift — so a future
      // investigation can tell a per-person limit from a per-proxy one without reverse-DNSing addresses
      // first. The email itself is NOT logged.
      keyedBy: key.startsWith('e:') ? 'email' : 'ip',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attempts: (req as any).rateLimit?.current,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});

/**
 * Sustained per-IP FAILURE ceiling for the login routes: 60 FAILED requests / IP / hour (Story 13-68).
 *
 * It was 10/IP/hour counting ALL responses, and described as catching "sustained activity including
 * successful brute-forces". A per-IP counter cannot do that job — an attacker whose login succeeds already
 * has the password; what stops that is the per-account lockout and MFA. What it did do was refuse the 11th
 * person behind one Opera Mini proxy in an hour for logging in SUCCESSFULLY.
 *
 * FAILED-ONLY (skipSuccessfulRequests) is an AVAILABILITY fix, not a security one. An attacker generates no
 * successes — a spray and a lockout run are failures by construction — so all-response counting never
 * throttled either. Attacker capacity at 60 is the same as counting all responses at 60 — but it is SIX TIMES
 * the 10/IP/hour this replaced (adversarial review 2026-09-16, M2: a ruled trade-off for the shared-proxy
 * population, not a tightening). Legitimate successes are simply no longer charged against a budget that exists
 * to meter failure. Total request volume (successes included) is bounded by `loginIpFloodLimit`.
 *
 * ⭐ THIS is the per-IP bound on a failure stream — a credential spray, and enumeration of accounts that do not
 * exist (which increments nothing account-side). The flood ceiling's 100/15min never binds a failure stream;
 * this limiter refuses it first. Do not raise 60 on the assumption that the flood ceiling covers enumeration.
 *
 * WHY 60 — derived, not chosen (PM ruling 2026-09-16, Addendum A): budget ≥ strangers behind one address ×
 * one person's failure allowance. Measured: 17 enumerators across 6 Opera Mini addresses ≈ 3 per address;
 * `loginRateLimit` allows 5 failures per email per 15 min = 20/hour. 3 × 20 = 60. Change the population
 * model, not the constant. It must never be set at or below one person's own allowance (20) — that is the
 * shared-proxy defect class by definition.
 *
 * ⛔ The derivation holds ONLY because this limiter is mounted LAST — after `verifyCaptcha` and after
 * `loginRateLimit` (adversarial review 2026-09-16, M1). Mounted first, it was charged for a person's retries
 * into their own 429 and for every refused captcha: one person could spend all 60 and lock a whole proxy out,
 * successful logins included. Behind the per-email limiter, what one person can spend here IS their 20/hour.
 *
 * It is also the meter on a mass account-lockout run: 60 failures/IP/hour = at most 6 new locks per IP per
 * hour. Lockout decay (AuthService) means each lock now costs ten fresh failures and expires in 30 minutes,
 * rather than one failure holding an account locked forever.
 */
export const strictLoginRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: STRICT_LOGIN_RATE_LIMIT_PREFIX,
  }),
  windowMs: 60 * 60 * 1000, // 1 hour window
  // FAILS CLOSED for a whole proxy at 61 FAILED logins in an hour; successful logins are free. Derived:
  // 3 strangers per address × 20 failures per person per hour (see docblock). Evidence for moving off 10:
  // 244 activation refusals from six Opera Mini addresses (2026-09-07/08). Reopen trigger: any
  // `auth.ip_blocked` whose IP reverse-resolves to opera-mini.net or a carrier CGNAT range → revisit the
  // strangers-per-address figure, not this number directly.
  max: 60,
  // Story 13-68 — failures only. Availability, not security: see the docblock.
  skipSuccessfulRequests: true,
  // Story 13-70 R3 — same rule as the burst limiter. Mounted LAST of the four, but `mfaRateLimit`
  // sits behind it on the two MFA step-2 routes, so there IS a limiter whose 429 it would otherwise
  // charge to the shared per-IP failure budget.
  requestWasSuccessful: (_req, res) =>
    res.statusCode < 400 || refusedByAnotherLimiter(res, REFUSED_BY_STRICT_LOGIN_RATE_LIMIT),
  message: {
    status: 'error',
    code: 'AUTH_IP_BLOCKED',
    message: 'Your IP has been temporarily blocked due to too many failed login attempts. Please try again later.',
  },
  handler: (req, res, next, options) => {
    // Story 13-70 FR1 — see the ceiling's `skipFailedRequests` block.
    res.locals.rateLimitRefusedBy = REFUSED_BY_STRICT_LOGIN_RATE_LIMIT;
    logger.warn({
      event: 'auth.ip_blocked',
      ip: req.ip,
      // True again since Story 13-68: this limiter counts failed logins only.
      reason: 'excessive_failures',
      keyedBy: 'ip',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attempts: (req as any).rateLimit?.current,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});

/**
 * Rate limiter for token refresh
 * More permissive than login rate limit
 */
export const refreshRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: RATE_LIMIT_PREFIXES.REFRESH,
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 refresh attempts per minute
  message: {
    status: 'error',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});
