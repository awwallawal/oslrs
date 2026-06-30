import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import type { Request } from 'express';

// In test environment, use memory store to avoid Redis dependency
const isTestEnv = process.env.NODE_ENV === 'test';

// Redis client — delegates to centralized factory, null in test mode
const getRedisClient = () => {
  if (isTestEnv) return null;
  return getFactoryRedisClient();
};

export const ninCheckRateLimit = rateLimit({
  store: isTestEnv ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute per user (AC 3.7.3)
  // OPS-RL-1 sweep (Story 9-42): IPv6-safe IP fallback via `ipKeyGenerator`.
  keyGenerator: (req) =>
    (req as Request & { user?: { sub: string } }).user?.sub ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown'),
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many NIN check requests, please try again later'
  },
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
});

export const profileUpdateRateLimit = rateLimit({
  store: isTestEnv ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 profile updates per minute per user
  // OPS-RL-1 sweep (Story 9-42): IPv6-safe IP fallback via `ipKeyGenerator`.
  keyGenerator: (req) =>
    (req as Request & { user?: { sub: string } }).user?.sub ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown'),
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many profile update requests, please try again later'
  },
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
});

// Story 13-13 (AC7) — public one-click unsubscribe endpoint. Per-IP; unauthenticated.
//
// code-review AI-2: the cap must NOT throttle legitimate RFC 8058 one-click POSTs. Those are fired
// by the mail PROVIDER's servers (Gmail/Yahoo/Apple), not the user's browser, and behind Cloudflare
// `realIpMiddleware` resolves req.ip to the provider's SHARED egress IP — so a single blast can make
// many recipients' one-click POSTs collide on one key. A 429 there silently drops the suppression
// (the provider does not retry) — the exact reputation harm the feature exists to prevent. So the cap
// is GENEROUS (default 120/min, operator-tunable via UNSUBSCRIBE_RATE_MAX) while still capping the
// cost of token-grinding (forged tokens decrypt to nothing and write nothing regardless).
const UNSUBSCRIBE_RATE_MAX = Number(process.env.UNSUBSCRIBE_RATE_MAX) || 120;
export const unsubscribeRateLimit = rateLimit({
  store: isTestEnv ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
  }),
  windowMs: 60 * 1000, // 1 minute
  max: UNSUBSCRIBE_RATE_MAX, // requests per minute per IP (default 120)
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many unsubscribe requests, please try again later',
  },
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const publicVerificationRateLimit = rateLimit({
  store: isTestEnv ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP (matches marketplace search limit)
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many verification requests, please try again later'
  },
  handler: (req, res, next, options) => {
      res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
});
