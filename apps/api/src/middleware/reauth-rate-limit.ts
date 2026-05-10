import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import { isTestMode, shouldSkipRateLimit } from './login-rate-limit.js';
import pino from 'pino';

const logger = pino({ name: 'reauth-rate-limit' });

const getRedisClient = () => {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
};

/**
 * Rate limiter for `POST /auth/reauth` — Story 9-9 AC#4 audit fix (2026-05-10).
 *
 * Why this exists: `/auth/reauth` accepts a password and verifies it via bcrypt
 * to bump the 5-minute `reauth:<userId>` Redis key (gating sensitive actions).
 * Without a per-IP limiter, an attacker holding a stolen access token could
 * brute-force the password without tripping `loginRateLimit` (which is wired
 * to `/staff/login` only). The 5-minute lockout in `auth.service.ts` is per-
 * account, not per-IP, so high-volume attempts against many accounts could
 * still leak signal at scale.
 *
 * Threshold: 5 attempts per 15 minutes per IP — matches `loginRateLimit`.
 * Defense-in-depth pairs with `requireFreshReAuth` on MFA mutations and the
 * 5-min sensitive-action window in `sensitive-action.ts`.
 */
export const reauthRateLimit = rateLimit({
  store: isTestMode()
    ? undefined
    : new RedisStore({
        // @ts-expect-error - Known type mismatch with ioredis
        sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
        prefix: 'rl:reauth:',
      }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes per IP
  message: {
    status: 'error',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many re-authentication attempts. Please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'auth.reauth_rate_limit_exceeded',
      ip: req.ip,
      userId: req.user?.sub,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attempts: (req as any).rateLimit?.current,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Same rationale as mfa-rate-limit.ts F14 fix — realIpMiddleware canonicalises
  // req.ip from CF-Connecting-IP / verified X-F-F before this middleware runs.
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});
