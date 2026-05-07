/**
 * Rate limiters for the settings admin endpoints.
 *
 * Pattern cloned from `apps/api/src/middleware/login-rate-limit.ts:25-110`:
 * - express-rate-limit with RedisStore backed by the singleton client
 * - `prefix:` namespacing per limiter
 * - Test-mode bypass via shared `isTestMode()` / `shouldSkipRateLimit()`
 *
 * Read endpoints: 60/min/IP. Write endpoints: 30/min/IP. Both are super-
 * admin-gated so the IP-based bucket is plenty wide.
 */
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import pino from 'pino';

const logger = pino({ name: 'settings-rate-limit' });

const isTestMode = () =>
  process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';

const getRedisClient = () => {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
};

const shouldSkipRateLimit = () => isTestMode();

/**
 * Read endpoints: GET /admin/settings, GET /admin/settings/:key — 60/min/IP.
 */
export const settingsListRateLimit = rateLimit({
  store: isTestMode()
    ? undefined
    : new RedisStore({
        // @ts-expect-error - Known type mismatch with ioredis (matches login-rate-limit pattern)
        sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
        prefix: 'rl:settings:list',
      }),
  windowMs: 60 * 1000,
  max: 60,
  message: {
    status: 'error',
    code: 'SETTINGS_RATE_LIMIT_EXCEEDED',
    message: 'Too many settings requests. Please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'settings.rate_limit_exceeded',
      bucket: 'list',
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});

/**
 * Write endpoint: PATCH /admin/settings/:key — 30/min/IP.
 */
export const settingsWriteRateLimit = rateLimit({
  store: isTestMode()
    ? undefined
    : new RedisStore({
        // @ts-expect-error - Known type mismatch with ioredis
        sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
        prefix: 'rl:settings:write',
      }),
  windowMs: 60 * 1000,
  max: 30,
  message: {
    status: 'error',
    code: 'SETTINGS_RATE_LIMIT_EXCEEDED',
    message: 'Too many settings write requests. Please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'settings.rate_limit_exceeded',
      bucket: 'write',
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});
