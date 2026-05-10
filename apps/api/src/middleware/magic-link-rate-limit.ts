import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import { isTestMode, shouldSkipRateLimit } from './login-rate-limit.js';
import pino from 'pino';

const logger = pino({ name: 'magic-link-rate-limit' });

const getRedisClient = () => {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
};

/**
 * Rate limiter for `POST /api/v1/auth/public/magic-link` — Story 9-12 AC#6.
 *
 * Per NFR4.4 password-reset 3/email/hour pattern (shared discipline budget):
 * keyed by lowercased email, with IP fallback when email is missing or
 * malformed (anti-bypass). Rate-limit is on the EMAIL not the IP because:
 *  - A single home WiFi might serve multiple legitimate registrants.
 *  - Per-IP would force operator support churn during shared-network registration drives.
 *  - Per-email caps the abuse vector (mail-bomb a known email) while letting
 *    legitimate volumes through.
 */
export const magicLinkRateLimit = rateLimit({
  store: isTestMode()
    ? undefined
    : new RedisStore({
        // @ts-expect-error - Known type mismatch with ioredis
        sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
        prefix: 'rl:magic-link:',
      }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour per email
  keyGenerator: (req, _res) => {
    // Primary key: lowercased email; fall back to IP if email is missing or non-string
    // (defensive — schema validation runs AFTER middleware in some Express stacks).
    const rawEmail = req.body?.email;
    if (typeof rawEmail === 'string' && rawEmail.includes('@')) {
      return rawEmail.toLowerCase().trim();
    }
    return req.ip || 'unknown';
  },
  message: {
    status: 'error',
    code: 'MAGIC_LINK_RATE_LIMIT_EXCEEDED',
    message: 'Too many magic-link requests for this email. Please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'magic_link.rate_limit_exceeded',
      ip: req.ip,
      email: typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : undefined,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Same rationale as mfa-rate-limit.ts F14 — realIpMiddleware canonicalises
  // req.ip from CF-Connecting-IP / verified X-F-F before this middleware runs.
  // Per-email keying disables the IP-fallback validation explicitly.
  validate: isTestMode() ? false : { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  skip: shouldSkipRateLimit,
});
