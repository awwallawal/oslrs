/**
 * Rate limiter for the Operations Dashboard endpoint (Story 9-19 AC#B2).
 *
 * Pattern cloned from `settings-rate-limit.ts`: express-rate-limit + RedisStore
 * backed by the singleton client, test-mode bypass. Keyed per AUTHENTICATED
 * USER (req.user.sub) rather than per-IP because the endpoint is super-admin
 * gated and the 30s UI poll from a single operator must fit comfortably under
 * the 60/min budget.
 */
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import type { AuthenticatedRequest } from '../types.js';
import pino from 'pino';

const logger = pino({ name: 'operations-rate-limit' });

const isTestMode = () =>
  process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';

const getRedisClient = () => {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
};

const shouldSkipRateLimit = () => isTestMode();

/** GET /admin/operations/dashboard — 60/min/user. */
export const operationsReadRateLimit = rateLimit({
  store: isTestMode()
    ? undefined
    : new RedisStore({
        // @ts-expect-error - Known type mismatch with ioredis (matches settings pattern)
        sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
        prefix: 'rl:operations:read',
      }),
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => (req as AuthenticatedRequest).user?.sub ?? req.ip ?? 'unknown',
  message: {
    status: 'error',
    code: 'OPERATIONS_RATE_LIMIT_EXCEEDED',
    message: 'Too many operations dashboard requests. Please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({ event: 'operations.rate_limit_exceeded', ip: req.ip, path: req.path });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});
