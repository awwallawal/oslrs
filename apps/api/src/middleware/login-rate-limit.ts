import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import pino from 'pino';

const logger = pino({ name: 'login-rate-limit' });

// Check if we're in test mode (vitest sets VITEST env var)
export const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';

// Redis client — delegates to centralized factory, null in test mode
export const getRedisClient = () => {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
};

// Skip function used by all rate limiters in test mode
export const shouldSkipRateLimit = () => isTestMode();

/**
 * Rate limiter for login attempts
 * - 5 FAILED attempts per 15 minutes per IP (successful logins do NOT count)
 * - 30-minute block after 10 failed attempts (handled in AuthService)
 *
 * Story 9-13 close-out UAT 2026-06-02 surfaced that the original config counted
 * ALL requests (including successful logins). An operator iterating on the
 * MFA-pending skeleton bug fix hit the 5/15min limit on the 4th-5th successful
 * TOTP verify (`mfa.verify_success` audit rows confirm 3 successes in 35 min →
 * 4th-5th attempts tripped the limit despite all being legitimate). Adding
 * `skipSuccessfulRequests: true` means only FAILED logins count against the
 * counter (any 4xx/5xx response from the wrapped route). Attacker defense is
 * preserved: brute-force attackers spam wrong passwords/codes which return
 * 401/403/429 and DO count. Legitimate operators iterating on real credentials
 * are not penalised. Defense-in-depth: `strictLoginRateLimit` (10/hour, all
 * requests counted) still catches sustained activity including successful
 * brute-forces; per-user `users.mfa_locked_until` (5 failures/15min) still
 * locks accounts on credential abuse.
 */
export const loginRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:login:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 FAILED requests per window (successful logins skipped — see docblock)
  // Story 9-13 close-out — only count failed responses (4xx/5xx). Successful
  // 2xx logins do not increment the counter. Operator iteration friendly;
  // attacker defense preserved (failed brute-force attempts still counted).
  skipSuccessfulRequests: true,
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
