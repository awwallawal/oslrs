import { createHash } from 'node:crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import pino from 'pino';

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
 * `rl:login:strict:` IS nested under `rl:login:` (unchanged since before Story 13-68) and is safe only
 * because `loginRateLimit` keys always begin `e:` or `ip:` — the same test asserts that.
 */
export const LOGIN_RATE_LIMIT_PREFIX = 'rl:login:';
export const LOGIN_IP_FLOOD_PREFIX = 'rl:login-ip-flood:';
export const STRICT_LOGIN_RATE_LIMIT_PREFIX = 'rl:login:strict:';

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
 * ⭐ LOAD-BEARING: this is the ONLY login limiter that counts every response (no skipSuccessfulRequests).
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
  // FAILS CLOSED for a whole proxy only at 100 requests in 15 minutes. Headroom: the enumerator
  // cohort is 17 people — every one of them failing five times is 85. Reopen trigger: any
  // `auth.login_ip_flood_limit_exceeded` whose IP reverse-resolves to opera-mini.net or a Nigerian
  // carrier CGNAT range.
  max: 100,
  message: {
    status: 'error',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many login attempts. Please try again later.',
  },
  handler: (req, res, _next, options) => {
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
  message: {
    status: 'error',
    code: 'AUTH_IP_BLOCKED',
    message: 'Your IP has been temporarily blocked due to too many failed login attempts. Please try again later.',
  },
  handler: (req, res, next, options) => {
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
    prefix: 'rl:refresh:',
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
