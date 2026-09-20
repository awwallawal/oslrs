import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import pino from 'pino';
import { RATE_LIMIT_PREFIXES } from '../lib/rate-limit-prefixes.js';
import {
  refusedByAnotherLimiter,
  REFUSED_BY_PASSWORD_RESET_COMPLETION_IP_FLOOD_LIMIT,
  REFUSED_BY_PASSWORD_RESET_COMPLETION_RATE_LIMIT,
} from './login-rate-limit.js';

const logger = pino({ name: 'password-reset-rate-limit' });

// Check if we're in test mode (vitest sets VITEST env var)
const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';

// Redis client — delegates to centralized factory, null in test mode
const getRedisClient = () => {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
};

// Skip function used by all rate limiters in test mode
const shouldSkipRateLimit = () => isTestMode();

/**
 * Rate limiter for password reset requests
 * - 3 requests per hour per IP
 * - Additional per-email limiting is handled in PasswordResetService
 *
 * NFR4.4 Compliance: 3 reset requests per email per hour
 */
export const passwordResetRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: RATE_LIMIT_PREFIXES.PASSWORD_RESET,
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  // 2026-09-16: was 10/hour, described in-code as "generous for shared IPs". It is not.
  // Opera Mini proxies every Nigerian user through a handful of addresses (244 activation
  // refusals came from SIX of them), and CGNAT does the same -- so 10/hour was ten requests
  // shared between strangers. This limiter is ONLY a flood ceiling: the real per-person
  // budget is NFR4.4's 3/email/hour, enforced on the normalised EMAIL in
  // PasswordResetService.checkRateLimit (RESET_RATE_LIMIT), which this change does not touch.
  // Sized for the worst legitimate case behind one address, not for one person.
  max: 200,
  message: {
    status: 'error',
    code: 'AUTH_RESET_RATE_LIMITED',
    message: 'Too many password reset requests. Please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'auth.password_reset_rate_limited',
      ip: req.ip,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});

/**
 * Key for the reset-completion limiter: the RESET TOKEN, falling back to the IP.
 *
 * The token arrives two ways and both are already parsed when this runs:
 *   GET  /reset-password/:token  -> req.params.token (route matched)
 *   POST /reset-password         -> req.body.token   (app.ts mounts express.json
 *                                   at line 331, the router at 350)
 *
 * Why not the IP: a reset token is 32 random bytes, so it cannot be guessed -- keying
 * the IP defends against nothing here while charging strangers behind one proxy for
 * each other's attempts. This repo already reached that conclusion in May for the
 * magic-link peek endpoint ("a per-IP limiter would need careful tuning to avoid
 * blocking legitimate users on shared NATs"); the reset routes never got the same read.
 * A per-IP flood ceiling still exists below -- that is the part an IP is good for.
 */
export function buildPasswordResetCompletionKey(
  paramsToken: unknown,
  bodyToken: unknown,
  ip: string | undefined,
): string {
  const token = [paramsToken, bodyToken].find(
    (t): t is string => typeof t === 'string' && t.trim() !== '',
  );
  if (token) return `t:${token.trim()}`;
  return `ip:${ipKeyGenerator(ip ?? 'unknown')}`;
}

/**
 * Per-IP flood ceiling for reset completion -- deliberately HIGH.
 *
 * This is the only key strangers share, so it is sized for many people behind one
 * Opera Mini / CGNAT address. It exists to stop a spray, not to shape one user's
 * experience -- that is the per-token limiter's job.
 */
export const passwordResetCompletionIpFloodLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: RATE_LIMIT_PREFIXES.PASSWORD_RESET_COMPLETE_IP,
  }),
  windowMs: 15 * 60 * 1000,
  max: 300,
  // ⛔ Story 13-70 R7 — A REFUSAL IS NOT A REQUEST (PRD NFR4.4.d), the same rule the login ceiling
  // got in FR1. `passwordResetCompletionRateLimit` is mounted behind this one and stamps
  // `res.locals.rateLimitRefusedBy` before answering 429; this ceiling hands its own increment back
  // for those requests, so a person who exhausts their own 20-per-token budget and keeps retrying no
  // longer spends the shared per-IP budget on refusals they caused for themselves.
  // `requestWasSuccessful` ALONE IS DEAD CODE — express-rate-limit consults it only when a skip flag
  // is set (8.3.0 dist: `if (config.skipFailedRequests || config.skipSuccessfulRequests)`), which is
  // why `skipFailedRequests` is here; it decrements when the predicate is FALSE, i.e. exactly when
  // another limiter stamped. ⚠️ It also registers `close`/`error` listeners, so an ABORTED request is
  // no longer counted here — Story 13-70 **R4**, open and dated, now covering four more ceilings.
  skipFailedRequests: true,
  requestWasSuccessful: (_req, res) => !refusedByAnotherLimiter(res, REFUSED_BY_PASSWORD_RESET_COMPLETION_IP_FLOOD_LIMIT),

  message: {
    status: 'error',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many attempts. Please try again later.',
  },
  handler: (req, res, _next, options) => {
    // Story 13-70 R7 — this ceiling stamps too, even though it is mounted FIRST and nothing ahead of
    // it reads the flag. The rule is uniform on purpose (R3): every limiter declares itself, so a
    // limiter inserted ahead of this one inherits the behaviour instead of silently not having it.
    res.locals.rateLimitRefusedBy = REFUSED_BY_PASSWORD_RESET_COMPLETION_IP_FLOOD_LIMIT;
    logger.warn({ event: 'auth.password_reset_ip_flood_limit_exceeded', ip: req.ip });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});

/**
 * Rate limiter for password reset completion, keyed on the TOKEN.
 *
 * 2026-09-16: was 5/IP/15min, and it is mounted on BOTH the GET validate and the
 * POST complete -- so simply OPENING the reset page spent a slot, and a page refresh
 * spent another. Three `auth.password_reset_completion_rate_limited` events on 09-15
 * were exactly that, amplified by the confirmPassword defect (6284d19): every rejected
 * retry burned a slot until the error silently changed to "Too many attempts. Please
 * request a new password reset link." -- which sends the user round the same loop.
 */
export const passwordResetCompletionRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    // ⛔ Story 13-70 FR2 — was `rl:password-reset-complete:`, the same live collision as activation:
    // the IP fallback key `ip:<addr>` spelled `rl:password-reset-complete:ip:<addr>`, which is exactly
    // what `passwordResetCompletionIpFloodLimit` writes. A 20-per-token budget and a 300-per-IP flood
    // ceiling shared one counter on every tokenless request.
    prefix: RATE_LIMIT_PREFIXES.PASSWORD_RESET_COMPLETE_TOKEN,
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Per TOKEN now, not per IP. A token is single-use and lives one hour; this bounds
  // how hard one link can be hammered, and leaves room for a page load, a refresh or
  // two, and a couple of genuine submits.
  max: 20,
  message: {
    status: 'error',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many attempts. Please request a new password reset link.',
  },
  // Destructured rather than touching `req.ip` -- mirrors buildActivationRateLimitKey.
  keyGenerator: ({ params, body, ip }) =>
    buildPasswordResetCompletionKey(
      (params as { token?: unknown } | undefined)?.token,
      (body as { token?: unknown } | undefined)?.token,
      ip,
    ),
  handler: (req, res, next, options) => {
    const paramsToken = (req.params as { token?: unknown } | undefined)?.token;
    const bodyToken = (req.body as { token?: unknown } | undefined)?.token;
    const keyedByToken = [paramsToken, bodyToken].some(
      (t) => typeof t === 'string' && t.trim() !== '',
    );
    // Story 13-70 R7 — tell the ceiling mounted ahead of this one that the response is a REFUSAL,
    // not a request. Set before the response is written, because the ceiling reads it from a
    // `finish` listener. ⚠️ This limiter needs no predicate of its own: it is mounted LAST on every
    // route it appears on, so no other limiter's 429 can reach its counter. Mount one behind it and
    // that stops being true — see the R7 block in `login-rate-limit.ts`.
    res.locals.rateLimitRefusedBy = REFUSED_BY_PASSWORD_RESET_COMPLETION_RATE_LIMIT;
    logger.warn({
      event: 'auth.password_reset_completion_rate_limited',
      ip: req.ip,
      // The key actually used, so a future investigation can tell a per-person limit
      // from a per-proxy one WITHOUT reverse-DNSing a handful of addresses first.
      keyedBy: keyedByToken ? 'token' : 'ip',
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});
