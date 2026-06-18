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

/** Exported for contract testing (rate limiter skips in test mode) */
export const PROFILE_RATE_LIMIT_MESSAGE = {
  status: 'error',
  code: 'RATE_LIMIT_EXCEEDED',
  message: 'Too many profile view requests. Please try again later.',
} as const;

/** Exported for contract testing (rate limiter skips in test mode) */
export const EDIT_TOKEN_RATE_LIMIT_MESSAGE = {
  status: 'error',
  code: 'RATE_LIMIT_EXCEEDED',
  message: 'Too many edit token requests. Please try again later.',
} as const;

/** Exported for contract testing (rate limiter skips in test mode) */
export const EDIT_TOKEN_USE_RATE_LIMIT_MESSAGE = {
  status: 'error',
  code: 'RATE_LIMIT_EXCEEDED',
  message: 'Too many requests. Please try again later.',
} as const;

/** Exported for contract testing (rate limiter skips in test mode) */
export const REVEAL_STEP_UP_RATE_LIMIT_MESSAGE = {
  status: 'error',
  code: 'RATE_LIMIT_EXCEEDED',
  message: 'Too many verification attempts. Please try again later.',
} as const;

/**
 * Rate limiter for marketplace profile view: 100 requests per minute per IP.
 * Architecture spec: profile views are cheaper than search, higher limit.
 */
export const marketplaceProfileRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:marketplace:profile:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: PROFILE_RATE_LIMIT_MESSAGE,
  handler: (req, res, _next, options) => {
    logger.warn({
      event: 'marketplace.profile_rate_limit_exceeded',
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

/**
 * Rate limiter for edit token requests: 10 requests per hour per IP.
 * Prevents brute-force phone enumeration via token request endpoint.
 * Story 7-5: architecture.md line 274.
 */
export const editTokenRequestRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:marketplace:edit-token-request:',
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour per IP
  message: EDIT_TOKEN_RATE_LIMIT_MESSAGE,
  handler: (req, res, _next, options) => {
    logger.warn({
      event: 'marketplace.edit_token_rate_limit_exceeded',
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

/**
 * Rate limiter for edit token validate/apply: 30 requests per minute per IP.
 * Prevents resource consumption via repeated token probing.
 * Code review fix M3: GET /edit/:token and PUT /edit were previously unthrottled.
 */
export const editTokenUseRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:marketplace:edit-token-use:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: EDIT_TOKEN_USE_RATE_LIMIT_MESSAGE,
  handler: (req, res, _next, options) => {
    logger.warn({
      event: 'marketplace.edit_token_use_rate_limit_exceeded',
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

/**
 * Rate limiter for reveal step-up request/verify: 15 requests per 5 min per IP.
 * Story 9-41 review fix (M3): the AC#5 step-up endpoints were mounted with
 * `authenticate` only — no reveal-layer throttle on OTP-request / OTP+TOTP
 * verification. The OTP service has its own per-phone cooldown, but this adds
 * per-IP defense-in-depth against code-guessing / OTP-trigger churn, matching
 * every other marketplace route's posture.
 */
export const revealStepUpRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:marketplace:reveal-step-up:',
  }),
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 15, // 15 attempts per 5 minutes per IP
  message: REVEAL_STEP_UP_RATE_LIMIT_MESSAGE,
  handler: (req, res, _next, options) => {
    logger.warn({
      event: 'marketplace.reveal_step_up_rate_limit_exceeded',
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
