import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Redis } from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'registration-rate-limit' });

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
 * Rate limiter for registration attempts
 * - 5 registrations per 15 minutes per IP
 * - Prevents mass account creation
 */
export const registrationRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:register:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 registrations per 15 minutes per IP
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many registration attempts. Please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'registration.rate_limit_exceeded',
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

/**
 * Rate limiter for resend verification email
 * - 3 resends per hour per email
 * - Prevents email bombing
 */
export const resendVerificationRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:resend-verify:',
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 resend attempts per hour per email
  keyGenerator: (req, _res) => {
    // Rate limit by email address (normalized) or fall back to IP
    // Note: We intentionally use email as primary key with IP fallback.
    // The keyGeneratorIpFallback validation is disabled because email is
    // the main rate-limiting factor for preventing email bombing.
    const email = req.body?.email?.toLowerCase?.()?.trim?.();
    return email || req.ip || 'unknown';
  },
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many resend attempts. Please wait before trying again.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'resend_verification.rate_limit_exceeded',
      ip: req.ip,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  skip: shouldSkipRateLimit,
});

/**
 * Rate limiter for email verification endpoint
 * - 10 verification attempts per 15 minutes per IP
 * - Prevents brute force token guessing
 */
export const verifyEmailRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:verify-email:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes per IP
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many verification attempts. Please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'verify_email.rate_limit_exceeded',
      ip: req.ip,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});
