import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Redis } from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'password-reset-rate-limit' });

// Check if we're in test mode (vitest sets VITEST env var)
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
 * Rate limiter for password reset requests
 * - 3 requests per hour per IP
 * - Additional per-email limiting is handled in PasswordResetService
 *
 * NFR4.4 Compliance: 3 reset requests per email per hour
 */
export const passwordResetRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:password-reset:',
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour per IP (generous for shared IPs)
  message: {
    status: 'error',
    code: 'AUTH_RESET_RATE_LIMITED',
    message: 'Too many password reset requests. Please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'auth.password_reset_rate_limited',
      ip: req.ip,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});

/**
 * Rate limiter for password reset completion (using token)
 * Prevents brute-force token guessing
 */
export const passwordResetCompletionRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:password-reset-complete:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes per IP
  message: {
    status: 'error',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many attempts. Please request a new password reset link.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'auth.password_reset_completion_rate_limited',
      ip: req.ip,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});
