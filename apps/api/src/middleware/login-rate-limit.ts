import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Redis } from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'login-rate-limit' });

// Check if we're in test mode (vitest sets VITEST env var)
const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

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
 * Rate limiter for login attempts
 * - 5 attempts per 15 minutes per IP
 * - 30-minute block after 10 failed attempts (handled in AuthService)
 */
export const loginRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:login:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    status: 'error',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many login attempts. Please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'auth.rate_limit_exceeded',
      ip: req.ip,
      path: req.path,
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

/**
 * Stricter rate limiter for sustained attacks
 * - 10 attempts per 1 hour per IP
 * - After 10 attempts, IP is blocked until the hour window resets
 * - Combined with loginRateLimit (5/15min), provides layered protection
 */
export const strictLoginRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:login:strict:',
  }),
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // 10 attempts per hour before blocking
  message: {
    status: 'error',
    code: 'AUTH_IP_BLOCKED',
    message: 'Your IP has been temporarily blocked due to too many failed login attempts. Please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'auth.ip_blocked',
      ip: req.ip,
      reason: 'excessive_failures',
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

/**
 * Rate limiter for token refresh
 * More permissive than login rate limit
 */
export const refreshRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:refresh:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 refresh attempts per minute
  message: {
    status: 'error',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});
