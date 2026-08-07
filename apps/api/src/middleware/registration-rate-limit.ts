import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import pino from 'pino';

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
    prefix: 'rl:register:',
  }),
  windowMs: 15 * 60 * 1000,
  // 50/15min: comfortably above any real venue or carrier gateway, still a hard stop on a script.
  max: 50,
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many registration attempts. Please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'registration.rate_limit_exceeded',
      ip: req.ip,
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
  if (typeof email === 'string' && email.trim()) return `e:${email.trim().toLowerCase()}`;
  return `ip:${ipKeyGenerator(ip ?? 'unknown')}`;
}

export const registrationEmailRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:register:email:',
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
    logger.warn({
      event: 'registration.email_rate_limit_exceeded',
      ip: req.ip,
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

// Story 9-12 Task 10.3 (2026-05-11 session 8) — `resendVerificationRateLimit`
// removed alongside the deleted `POST /auth/resend-verification` route.

/**
 * Rate limiter for account activation endpoints
 * - 10 attempts per 15 minutes per IP
 * - Applies to both token validation (GET) and activation completion (POST)
 * - Tokens are UUIDv7 (high entropy) so brute-force is unlikely,
 *   but rate limiting prevents resource exhaustion from spam requests
 */
export const activationRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:activation:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes per IP
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many activation attempts. Please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'activation.rate_limit_exceeded',
      ip: req.ip,
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
