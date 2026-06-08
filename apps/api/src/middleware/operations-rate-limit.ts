/**
 * Rate limiter for the Operations Dashboard endpoint (Story 9-19 AC#B2).
 *
 * Pattern cloned from `settings-rate-limit.ts`: express-rate-limit + RedisStore
 * backed by the singleton client, test-mode bypass. Keyed per AUTHENTICATED
 * USER (req.user.sub) rather than per-IP because the endpoint is super-admin
 * gated and the 30s UI poll from a single operator must fit comfortably under
 * the 60/min budget.
 */
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../types.js';
import pino from 'pino';

const logger = pino({ name: 'operations-rate-limit' });

/**
 * OPS-RL-1 (Story 9-42): keys the operations-dashboard limiter per authenticated
 * super-admin (`req.user.sub`); falls back to an IPv6-SAFE subnet bucket via
 * express-rate-limit@8's `ipKeyGenerator`. The prior bare-`req.ip` form let an
 * IPv6 client rotate within its subnet to bypass the limit AND tripped
 * ERR_ERL_KEY_GEN_IPV6 validation noise at boot. Exported for the regression test.
 */
export const operationsRateLimitKeyGenerator = (req: Request): string => {
  const sub = (req as AuthenticatedRequest).user?.sub;
  if (sub) return sub;
  return req.ip ? ipKeyGenerator(req.ip) : 'unknown';
};

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
  // OPS-RL-1 (Story 9-42): IPv6-safe keying (see operationsRateLimitKeyGenerator).
  keyGenerator: operationsRateLimitKeyGenerator,
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
