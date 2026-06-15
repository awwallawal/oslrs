import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import { isTestMode, shouldSkipRateLimit } from './login-rate-limit.js';
import pino from 'pino';

const logger = pino({ name: 'registration-status-rate-limit' });

const getRedisClient = () => {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
};

/**
 * Story 9-58 (AC7.2) — rate limiter for `POST /api/v1/registration-status/request`.
 *
 * Per-IP (the request body carries the registrant's own identifier, which we
 * must NOT use as a rate-limit key — that would itself leak existence via
 * differential 429s and create a PII key in Redis). A conservative self-service
 * cap: 10 requests / IP / 15 min — generous for a human checking once or twice,
 * tight enough that, combined with the server-side captcha + the neutral
 * constant response (AC2), enumeration is economically pointless.
 *
 * IPv6-safe key via `ipKeyGenerator` (OPS-RL-1 sweep, Story 9-42). Skipped in
 * test mode (NODE_ENV=test / VITEST / E2E) like every other limiter.
 */
export const registrationStatusRateLimit = rateLimit({
  store: isTestMode()
    ? undefined
    : new RedisStore({
        // @ts-expect-error - Known type mismatch with ioredis
        sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
        prefix: 'rl:registration-status:',
      }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per 15 min per IP
  keyGenerator: (req, _res) => (req.ip ? ipKeyGenerator(req.ip) : 'unknown'),
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({ event: 'registration_status.rate_limit_exceeded', ip: req.ip });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});
