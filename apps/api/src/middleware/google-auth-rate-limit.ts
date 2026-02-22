import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Redis } from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'google-auth-rate-limit' });

// Check if we're in test mode
const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';

// Redis client (singleton) - only initialize if not in test mode
let redisClient: Redis | null = null;

const getRedisClient = () => {
  if (!redisClient && !isTestMode()) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
};

// Skip function used by all rate limiters in test mode
const shouldSkipRateLimit = () => isTestMode();

/**
 * Rate limiter for Google OAuth verification (AC5)
 * - 10 attempts per IP per hour
 * - Prevents brute force token submission
 */
export const googleAuthRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:google-auth:',
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 attempts per hour per IP
  message: {
    status: 'error',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many Google authentication attempts. Please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'auth.google_rate_limit_exceeded',
      ip: req.ip,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attempts: (req as any).rateLimit?.current,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});
