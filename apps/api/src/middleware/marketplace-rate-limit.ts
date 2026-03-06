import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import pino from 'pino';
import { isTestMode, getRedisClient, shouldSkipRateLimit } from './login-rate-limit.js';

const logger = pino({ name: 'marketplace-rate-limit' });

/** Exported for contract testing (rate limiter skips in test mode) */
export const RATE_LIMIT_MESSAGE = {
  status: 'error',
  code: 'RATE_LIMIT_EXCEEDED',
  message: 'Too many search requests. Please try again later.',
} as const;

/**
 * Rate limiter for marketplace search: 30 requests per minute per IP.
 * Architecture spec: architecture.md line 912.
 */
export const marketplaceSearchRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:marketplace:search:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: RATE_LIMIT_MESSAGE,
  handler: (req, res, _next, options) => {
    logger.warn({
      event: 'marketplace.search_rate_limit_exceeded',
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
