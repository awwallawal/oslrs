import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
// Story 13-46 (AC3) — a refusal is counted so the burst breaker can SEE a 429 wall. Until now the
// only trace of a turned-away listener was the `logger.warn` below, which nobody was asked to read.
import { recordRegistration429 } from './registration-burst.js';
// Story 13-70 FR3 — ONE key builder for every per-email limiter. Not a second hasher.
import {
  buildLoginRateLimitKey,
  refusedByAnotherLimiter,
  REFUSED_BY_REGISTRATION_RATE_LIMIT,
  REFUSED_BY_REGISTRATION_EMAIL_RATE_LIMIT,
  REFUSED_BY_ACTIVATION_IP_FLOOD_LIMIT,
  REFUSED_BY_ACTIVATION_RATE_LIMIT,
} from './login-rate-limit.js';
import pino from 'pino';
import { RATE_LIMIT_PREFIXES } from '../lib/rate-limit-prefixes.js';

const logger = pino({ name: 'registration-rate-limit' });

// Check if we're in test mode
const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';

// Redis client — delegates to centralized factory, null in test mode
const getRedisClient = () => {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
};

// Skip function used by all rate limiters in test mode
const shouldSkipRateLimit = () => isTestMode();

/**
 * Rate limiter for the PUBLIC WIZARD SUBMIT.
 *
 * ⚠️ RAISED 5 → 50 ON 2026-08-07 BECAUSE THE OLD LIMIT WAS TURNING CITIZENS AWAY.
 *
 * A registrant emailed to say he could not finish. He had completed all ten steps; the final submit
 * returned "Too many registration attempts". Retained logs showed **36 blocks across 5 IPs — 27 of
 * them on 2026-08-05, the morning we sent 75 re-engagement invitations.** We drove people to
 * register and then refused them for responding.
 *
 * The blocked addresses were `102.88.*`, `102.89.*`, `102.90.*`, `197.211.*` — Nigerian mobile
 * carrier ranges. **Carriers here use CGNAT: thousands of subscribers share one public IP.** So
 * "5 per IP" was never "5 attempts by one person"; it was **5 PEOPLE on one carrier gateway per
 * quarter hour** — and identically one cybercafé, one office, or one supervised registration drive
 * where everybody is on the venue's wifi. It bit hardest in exactly the situation we most want to
 * succeed.
 *
 * WHY NOT REMOVE IT. This is an unauthenticated public endpoint that writes to a government
 * register. With no limit a script could fabricate thousands of records, and **the register's
 * credibility IS the product** — that failure is far worse than a delayed registration.
 *
 * SO THE AXIS CHANGED, NOT THE PRINCIPLE. Abuse is one actor creating MANY records; CGNAT makes IP
 * a poor proxy for "one actor" while the submitted `email` is a good one. The IP ceiling stays as a
 * crude flood-stop set well above any real venue; the per-email limiter below is the real control.
 */
export const registrationRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    // Story 13-70 FR2 — was `rl:register:`, a proper prefix of `rl:register:email:` below.
    prefix: RATE_LIMIT_PREFIXES.REGISTER_IP,
  }),
  windowMs: 15 * 60 * 1000,
  // 50/15min: comfortably above any real venue or carrier gateway, still a hard stop on a script.
  max: 50,
  // ⛔ Story 13-70 R7 — A REFUSAL IS NOT A REQUEST (PRD NFR4.4.d), the same rule the login ceiling
  // got in FR1. `registrationEmailRateLimit` is mounted behind this one and stamps
  // `res.locals.rateLimitRefusedBy` before answering 429; this ceiling hands its own increment back
  // for those requests, so a person who exhausts their own 3-per-email budget and keeps
  // retrying no longer spends the shared per-IP budget on refusals they caused for themselves.
  // `requestWasSuccessful` ALONE IS DEAD CODE — express-rate-limit consults it only when a skip flag
  // is set (8.3.0 dist: `if (config.skipFailedRequests || config.skipSuccessfulRequests)`), which is
  // why `skipFailedRequests` is here; it decrements when the predicate is FALSE, i.e. exactly when
  // another limiter stamped. ⚠️ It also registers `close`/`error` listeners, so an ABORTED request is
  // no longer counted here — Story 13-70 **R4**, open and dated, now covering four more ceilings.
  skipFailedRequests: true,
  requestWasSuccessful: (_req, res) => !refusedByAnotherLimiter(res, REFUSED_BY_REGISTRATION_RATE_LIMIT),
  // ⚠️ On `/supplemental` (registration.routes.ts:99) this limiter is mounted ALONE, so nothing
  // ever stamps and the predicate never returns false: counting there is unchanged apart from the
  // abort listeners R4 covers.
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many registration attempts. Please try again later.',
  },
  handler: (req, res, next, options) => {
    // Story 13-70 R7 — this ceiling stamps too, even though it is mounted FIRST and nothing ahead
    // of it reads the flag. The rule is uniform on purpose (R3): every limiter declares itself, so a
    // limiter inserted ahead of this one inherits the behaviour instead of silently not having it,
    // and the `attempts` field logged below can be attributed.
    res.locals.rateLimitRefusedBy = REFUSED_BY_REGISTRATION_RATE_LIMIT;
    logger.warn({
      event: 'registration.rate_limit_exceeded',
      ip: req.ip,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attempts: (req as any).rateLimit?.current,
    });
    recordRegistration429(); // Story 13-46 (AC3)
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});

/**
 * Per-EMAIL limiter — the control that actually matches the threat.
 *
 * Abuse is one actor minting many records. CGNAT makes IP a poor proxy for "one actor"; the email on
 * the submission is a good one. 3 per 15 minutes lets a genuine person retry a failed submit twice —
 * which matters, because a 422 on an incomplete form ALSO consumes an attempt — while stopping a
 * script cycling one address.
 *
 * ⚠️ Falls back to the IP when no email is present, so a payload that omits it cannot bypass the
 * limiter entirely. Keyed on the LOWERCASED, TRIMMED address: `A@x.com` and `a@x.com ` must not be
 * two buckets, or the limit is trivially evaded with a space.
 */

/**
 * The key logic, extracted so it can be TESTED — the reason it is a separate exported function.
 *
 * ⚠️ FIXED 2026-08-07. The IP fallback previously used the raw address, which meant an IPv6 client
 * could bypass the limiter entirely: a single subscriber is normally handed a whole prefix, so
 * rotating the low bits of their own address mints a fresh bucket every request. `ipKeyGenerator`
 * collapses an IPv6 address to its `/56` prefix and passes IPv4 (and any non-IP string, like our
 * `'unknown'`) straight through.
 *
 * ⚠️ **The library's own warning is NOT what makes this correct, and must not be trusted as proof.**
 * `ERR_ERL_KEY_GEN_IPV6` is a `toString()` grep over the keyGenerator source looking for `req.ip`
 * without `ipKeyGenerator` — so merely NAMING the helper, or writing the property access in a way
 * the regex misses, silences it while changing nothing. That is
 * [[pattern-test-that-passes-over-a-hole]] handed to us by a dependency. **The proof is the unit
 * test asserting two addresses in one /56 collapse to ONE key**; delete the `ipKeyGenerator` call
 * and that test fails, which is the only property worth having.
 */
export function buildRegistrationEmailRateLimitKey(email: unknown, ip: string | undefined): string {
  // ⛔ Story 13-70 FR3 — DELEGATES to the shipped login key builder; it does not re-implement it.
  //
  // This used to return `e:${email.trim().toLowerCase()}` — the ADDRESS ITSELF as the Redis key. The
  // wizard submit body is unvalidated at this point and the body limit is 1 MB, so one IP could park
  // megabyte-sized keys in the Redis that BullMQ and the sessions share, and every registrant's
  // address sat in Redis in plaintext. `buildLoginRateLimitKey` answers `e:<sha256>` — a fixed 64
  // hex characters, unsalted on purpose so the same address always reaches the same bucket.
  //
  // The normalisation (trim + lowercase) and the `ipKeyGenerator` fallback both live there too, so
  // the two limiters cannot drift apart — which is the actual deliverable
  // [[feedback_canonical_primitive_backlog_sweep]]. The IPv6 /56 tests below still pass because the
  // fallback is the same call; delete `ipKeyGenerator` from the shared builder and they still red.
  return buildLoginRateLimitKey(email, ip);
}

export const registrationEmailRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: RATE_LIMIT_PREFIXES.REGISTER_EMAIL,
  }),
  windowMs: 15 * 60 * 1000,
  max: 3,
  // Destructured, not `req.ip` — see the note on the builder. The library's validator greps this
  // function's SOURCE TEXT, so where the property access is written changes whether it warns. That
  // makes the warning a lint on spelling, not on behaviour; the unit test is the real guard.
  keyGenerator: ({ body, ip }) =>
    buildRegistrationEmailRateLimitKey((body as { email?: unknown } | undefined)?.email, ip),
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message:
      'We have already received several attempts for this email in the last few minutes. ' +
      'Please wait a moment and try again — your answers are saved.',
  },
  handler: (req, res, next, options) => {
    // Story 13-70 R7 — tell the ceiling mounted ahead of this one that the response is a REFUSAL,
    // not a request. Set before the response is written, because the ceiling reads it from a
    // `finish` listener. ⚠️ This limiter needs no predicate of its own: it is mounted LAST on every
    // route it appears on, so no other limiter's 429 can reach its counter. Mount one behind it and
    // that stops being true — see the R7 block in `login-rate-limit.ts`.
    res.locals.rateLimitRefusedBy = REFUSED_BY_REGISTRATION_EMAIL_RATE_LIMIT;
    logger.warn({
      event: 'registration.email_rate_limit_exceeded',
      ip: req.ip,
      // Story 13-70 FR3 (3.3) — the axis actually keyed on, derived from the KEY rather than from a
      // re-reading of the body, so the log and the limiter cannot disagree. The address itself is
      // never logged; it is a digest in the key and absent from here.
      keyedBy: buildRegistrationEmailRateLimitKey(
        (req.body as { email?: unknown } | undefined)?.email,
        req.ip,
      ).startsWith('e:')
        ? 'email'
        : 'ip',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attempts: (req as any).rateLimit?.current,
    });
    recordRegistration429(); // Story 13-46 (AC3)
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});

// Story 9-12 Task 10.3 (2026-05-11 session 8) — `resendVerificationRateLimit`
// removed alongside the deleted `POST /auth/resend-verification` route.

/**
 * Key for the activation limiter: the INVITATION TOKEN, falling back to IP.
 *
 * ⛔ WHY NOT IP — measured on prod 2026-09-14/15, and it was blocking real
 * enumerators. The old limiter was 10 attempts / 15 min **per IP**, and on
 * 2026-09-07/08 it produced **244 `activation.rate_limit_exceeded` refusals from
 * SIX addresses**:
 *
 *     114  185.26.181.66   →  n17-04-01-v04.opera-mini.net   (NO-OPERA-AMS-LB)
 *      85  141.0.12.87     →  n24-01-11.opera-mini.net       (NO-OPERA-AMS-MINI)
 *      22  141.0.13.64     →  opera-mini.net
 *
 * Confirmed by reverse DNS, not inferred. **Opera Mini proxies every user
 * through a handful of servers**, and it is one of the most-used mobile browsers
 * in Nigeria — so a per-IP budget is shared by strangers. The 17 field
 * enumerators were invited on 2026-09-06; a few of them activating at once
 * exhausted the allowance for everyone behind that proxy. The activation photo
 * defect (fixed 2026-09-14) made it far worse by forcing repeated failed POSTs
 * per person.
 *
 * ⚠️ AND KEYING ON THE TOKEN ALONE WOULD BE A REGRESSION, which is why the IP
 * limiter below still exists. A token key gives an attacker spraying 1,000
 * random tokens 1,000 separate buckets — i.e. no limit at all. The two run
 * together: the token key protects the PERSON's experience, the IP key stops a
 * FLOOD, and only the second is shared between strangers so only it is generous.
 *
 * ⚠️ `ipKeyGenerator` is mandatory for the fallback: an IPv6 subscriber holds a
 * whole prefix, so keying the raw address lets them mint a fresh bucket per
 * request. The library's `ERR_ERL_KEY_GEN_IPV6` warning is a `toString()` grep
 * for `req.ip` and proves nothing — see `buildRegistrationEmailRateLimitKey`.
 */
export function buildActivationRateLimitKey(token: unknown, ip: string | undefined): string {
  if (typeof token === 'string' && token.trim()) return `t:${token.trim()}`;
  return `ip:${ipKeyGenerator(ip ?? 'unknown')}`;
}

/**
 * Per-IP flood ceiling for activation — deliberately HIGH.
 *
 * This is the only activation key that strangers share, so it is sized for the
 * worst legitimate case (many people behind one Opera Mini / CGNAT address),
 * not for one person. It exists to stop a spray, not to shape a user's
 * experience — that is the per-token limiter's job.
 */
export const activationIpFloodLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: RATE_LIMIT_PREFIXES.ACTIVATION_IP,
  }),
  windowMs: 15 * 60 * 1000,
  max: 300,
  // ⛔ Story 13-70 R7 — A REFUSAL IS NOT A REQUEST (PRD NFR4.4.d), the same rule the login ceiling
  // got in FR1. `activationRateLimit` is mounted behind this one and stamps
  // `res.locals.rateLimitRefusedBy` before answering 429; this ceiling hands its own increment back
  // for those requests, so a person who exhausts their own 20-per-token budget and keeps
  // retrying no longer spends the shared per-IP budget on refusals they caused for themselves.
  // `requestWasSuccessful` ALONE IS DEAD CODE — express-rate-limit consults it only when a skip flag
  // is set (8.3.0 dist: `if (config.skipFailedRequests || config.skipSuccessfulRequests)`), which is
  // why `skipFailedRequests` is here; it decrements when the predicate is FALSE, i.e. exactly when
  // another limiter stamped. ⚠️ It also registers `close`/`error` listeners, so an ABORTED request is
  // no longer counted here — Story 13-70 **R4**, open and dated, now covering four more ceilings.
  skipFailedRequests: true,
  requestWasSuccessful: (_req, res) => !refusedByAnotherLimiter(res, REFUSED_BY_ACTIVATION_IP_FLOOD_LIMIT),

  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many activation attempts. Please try again later.',
  },
  handler: (req, res, _next, options) => {
    // Story 13-70 R7 — this ceiling stamps too, even though it is mounted FIRST and nothing ahead
    // of it reads the flag. The rule is uniform on purpose (R3): every limiter declares itself, so a
    // limiter inserted ahead of this one inherits the behaviour instead of silently not having it.
    res.locals.rateLimitRefusedBy = REFUSED_BY_ACTIVATION_IP_FLOOD_LIMIT;
    logger.warn({ event: 'activation.ip_flood_limit_exceeded', ip: req.ip });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
});

/**
 * Rate limiter for account activation endpoints
 * - 20 attempts per 15 minutes per INVITATION TOKEN (not per IP — see above)
 * - Applies to both token validation (GET) and activation completion (POST)
 * - Tokens are UUIDv7 (high entropy) so brute-force is unlikely,
 *   but rate limiting prevents resource exhaustion from spam requests
 */
export const activationRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    // ⛔ Story 13-70 FR2 — was `rl:activation:`. This limiter falls back to the key `ip:<addr>`, so
    // under that prefix it spelled `rl:activation:ip:<addr>` — byte for byte the key
    // `activationIpFloodLimit` writes at prefix `rl:activation:ip:`. A 20-per-token budget and a
    // 300-per-IP ceiling would then be ONE counter incremented twice.
    //
    // ⚠️ CORRECTED BY THE ADVERSARIAL REVIEW, 2026-09-20 — the story called this LIVE and it is NOT,
    // and the correction matters more than the fix. Both mounts are `/activate/:token` and
    // `/activate/:token/validate` (`auth.routes.ts:27,29`), so express cannot match either route
    // without a token segment, and `buildActivationRateLimitKey` only falls back to `ip:` when the
    // token is absent or blank — see the note twelve lines below, which said so all along. The IP
    // fallback is therefore unreachable here and this pair was LATENT. `passwordResetCompletion*` is
    // the one that was genuinely live: its POST route has no path param and takes the token from the
    // BODY, which a malformed request can omit. One live, one latent — not "two live".
    //
    // The rename is right either way: the property AC4 pins is structural, so no future key SHAPE
    // can turn the latent pair into the live one. The in-memory test store gives each limiter its
    // own map and can never see any of this.
    prefix: RATE_LIMIT_PREFIXES.ACTIVATION_TOKEN,
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  // 20, not 10: the budget is now PER PERSON rather than per shared proxy, and a
  // field officer legitimately spends several requests here — the page validates
  // the token on load, and a photo that fails validation is a retry, not abuse.
  max: 20,
  // Destructured, not `req.ip` — see the note on `buildRegistrationEmailRateLimitKey`.
  // `params.token` is populated because this is ROUTE-level middleware on
  // `/activate/:token`, so express has already matched and parsed the path.
  keyGenerator: ({ params, ip }) =>
    buildActivationRateLimitKey((params as { token?: unknown } | undefined)?.token, ip),
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many activation attempts. Please try again later.',
  },
  handler: (req, res, next, options) => {
    // Story 13-70 R7 — tell the ceiling mounted ahead of this one that the response is a REFUSAL,
    // not a request. Set before the response is written, because the ceiling reads it from a
    // `finish` listener. ⚠️ This limiter needs no predicate of its own: it is mounted LAST on every
    // route it appears on, so no other limiter's 429 can reach its counter. Mount one behind it and
    // that stops being true — see the R7 block in `login-rate-limit.ts`.
    res.locals.rateLimitRefusedBy = REFUSED_BY_ACTIVATION_RATE_LIMIT;
    logger.warn({
      event: 'activation.rate_limit_exceeded',
      ip: req.ip,
      // The key actually used, so a future investigation can tell a per-person
      // limit from a per-proxy one WITHOUT reverse-DNSing six addresses first.
      keyedBy: typeof req.params?.token === 'string' && req.params.token.trim() ? 'token' : 'ip',
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});

// Story 9-12 Task 10.3 (2026-05-11 session 8) — `verifyEmailRateLimit`
// removed alongside the deleted `GET /auth/verify-email/:token` route.
