/**
 * Export Rate Limiter — Per-user export throttling
 *
 * Story 5.4 AC#5: 5 exports per hour per user.
 * Prevents PII data scraping via repeated exports.
 * Applied to export download endpoint only (not count preview).
 */

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Redis } from 'ioredis';
import type { Request } from 'express';

// Lazy-initialized Redis client to avoid connection during test imports
let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
}

const isTestEnv = process.env.NODE_ENV === 'test';

export const exportRateLimit = rateLimit({
  store: isTestEnv ? undefined : new RedisStore({
    // ioredis .call() signature differs from rate-limit-redis sendCommand expectation
    // but is runtime-compatible (both accept string args and return Promise)
    sendCommand: ((...args: string[]) =>
      getRedisClient().call(args[0], ...args.slice(1))) as (...args: string[]) => Promise<number>,
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 exports per hour per user (AC#5)
  keyGenerator: (req) => (req as Request & { user?: { sub: string } }).user?.sub ?? req.ip ?? 'unknown',
  message: {
    status: 'error',
    code: 'EXPORT_RATE_LIMIT',
    message: 'Maximum 5 exports per hour. Please try again later.',
  },
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
});
