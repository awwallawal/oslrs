import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import pino from 'pino';

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
    prefix: 'rl:password-reset:',
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
    prefix: 'rl:password-reset-complete:ip:',
  }),
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: {
    status: 'error',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many attempts. Please try again later.',
  },
  handler: (req, res, _next, options) => {
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
    prefix: 'rl:password-reset-complete:',
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
