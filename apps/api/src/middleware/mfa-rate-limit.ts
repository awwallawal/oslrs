import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import { isTestMode, shouldSkipRateLimit } from './login-rate-limit.js';
import pino from 'pino';

const logger = pino({ name: 'mfa-rate-limit' });

const getRedisClient = () => {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
};

/**
 * Per-IP rate limiter for `/auth/mfa/verify` and the login step-2 challenge endpoints.
 *
 * Story 9-13 AC#7 — runs BEFORE the per-user lockout to prevent attacker-induced DoS:
 * an attacker spamming wrong codes against a victim's account would trip the
 * per-user lockout (15 min on 5 strikes) and lock the legitimate operator out.
 * Per-IP gating (10/min) drops the attacker's bursts at the edge so the per-user
 * counter only ever sees legitimate operator traffic.
 */
export const mfaRateLimit = rateLimit({
  store: isTestMode()
    ? undefined
    : new RedisStore({
        // @ts-expect-error - Known type mismatch with ioredis
        sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
        prefix: 'rl:mfa:',
      }),
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per IP
  message: {
    status: 'error',
    code: 'MFA_RATE_LIMIT_EXCEEDED',
    message: 'Too many MFA attempts. Please slow down.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'mfa.rate_limit_exceeded',
      ip: req.ip,
      path: req.path,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attempts: (req as any).rateLimit?.current,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  // F14 (code-review 2026-05-02): we disable express-rate-limit's built-in
  // X-Forwarded-For warning because `realIpMiddleware` (apps/api/src/middleware/
  // real-ip.ts) already canonicalizes req.ip from CF-Connecting-IP / verified
  // X-F-F BEFORE this middleware runs. Express's trust proxy + our middleware
  // chain handle the spoofing concern; no need for the extra warning noise.
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});
