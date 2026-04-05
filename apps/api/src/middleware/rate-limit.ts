import rateLimit from 'express-rate-limit';
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
  keyGenerator: (req) => (req as Request & { user?: { sub: string } }).user?.sub ?? req.ip ?? 'unknown',
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
  keyGenerator: (req) => (req as Request & { user?: { sub: string } }).user?.sub ?? req.ip ?? 'unknown',
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
