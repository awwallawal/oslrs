/**
 * Rate limiters for the admin import endpoints (Story 11-2).
 *
 * Clones the canonical `login-rate-limit.ts` pattern (express-rate-limit +
 * RedisStore + per-endpoint `prefix:` + test-mode skip). Per AC#3/#4/#7:
 *   - dry-run : 10 / hour
 *   - confirm :  5 / hour
 *   - rollback:  5 / hour
 *
 * These are super-admin-only routes, so the limits are per-IP guardrails
 * against runaway automation / accidental double-submits, not an attacker gate.
 */

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import pino from 'pino';
import { getRedisClient, isTestMode, shouldSkipRateLimit } from './login-rate-limit.js';

const logger = pino({ name: 'import-rate-limit' });

const ONE_HOUR_MS = 60 * 60 * 1000;

function makeImportLimiter(prefix: string, max: number, code: string) {
  return rateLimit({
    store: isTestMode()
      ? undefined
      : new RedisStore({
          // @ts-expect-error - Known type mismatch with ioredis
          sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
          prefix,
        }),
    windowMs: ONE_HOUR_MS,
    max,
    message: {
      status: 'error',
      code,
      message: 'Too many import requests. Please try again later.',
    },
    handler: (req, res, _next, options) => {
      logger.warn({
        event: 'import.rate_limit_exceeded',
        prefix,
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
}

export const importDryRunRateLimit = makeImportLimiter('rl:imports:dry-run:', 10, 'IMPORT_RATE_LIMIT_EXCEEDED');
export const importConfirmRateLimit = makeImportLimiter('rl:imports:confirm:', 5, 'IMPORT_RATE_LIMIT_EXCEEDED');
export const importRollbackRateLimit = makeImportLimiter('rl:imports:rollback:', 5, 'IMPORT_RATE_LIMIT_EXCEEDED');
