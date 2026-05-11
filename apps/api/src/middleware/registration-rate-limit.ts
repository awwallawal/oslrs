import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import pino from 'pino';

const logger = pino({ name: 'registration-rate-limit' });

// Check if we're in test mode
const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';

// Redis client — delegates to centralized factory, null in test mode
const getRedisClient = () => {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
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

// Story 9-12 Task 10.3 (2026-05-11 session 8) — `resendVerificationRateLimit`
// removed alongside the deleted `POST /auth/resend-verification` route.

/**
 * Rate limiter for account activation endpoints
 * - 10 attempts per 15 minutes per IP
 * - Applies to both token validation (GET) and activation completion (POST)
 * - Tokens are UUIDv7 (high entropy) so brute-force is unlikely,
 *   but rate limiting prevents resource exhaustion from spam requests
 */
export const activationRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:activation:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes per IP
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many activation attempts. Please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'activation.rate_limit_exceeded',
      ip: req.ip,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});

// Story 9-12 Task 10.3 (2026-05-11 session 8) — `verifyEmailRateLimit`
// removed alongside the deleted `GET /auth/verify-email/:token` route.
