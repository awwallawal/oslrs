import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import { isTestMode, shouldSkipRateLimit } from './login-rate-limit.js';
import pino from 'pino';

const logger = pino({ name: 'wizard-draft-rate-limit' });

const getRedisClient = () => {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
};

/**
 * Rate limiter for `PUT/GET /api/v1/registration/draft` — Story 9-12 Task 4.4
 * server-side wizard draft auto-save + hydration endpoints.
 *
 * Code review MR-11 (2026-05-11, session 7) — the initial H2 fix wired
 * `magicLinkRateLimit` (3/email/hour) onto these endpoints, but:
 *  - useWizardDraft does 2-second-debounced auto-save → typical 20-60 saves
 *    per active wizard session. 3/hour locks users out within seconds.
 *  - Per-email keying gives an attacker who floods with random emails a
 *    fresh bucket per email — doesn't defend against the actual H2 threat.
 *
 * This limiter swaps to per-IP keying at 120/IP/15min. That gives ~8/min
 * average — generous enough for legitimate 2s-debounced auto-save while
 * bounding single-IP flooding. Shared NATs (~5 wizards concurrently) stay
 * well inside budget; abusive bots from a single source hit the cap fast.
 */
export const wizardDraftRateLimit = rateLimit({
  store: isTestMode()
    ? undefined
    : new RedisStore({
        // @ts-expect-error - Known type mismatch with ioredis
        sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
        prefix: 'rl:wizard-draft:',
      }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120, // 120 requests per 15 minutes per IP (~8/min)
  message: {
    status: 'error',
    code: 'WIZARD_DRAFT_RATE_LIMIT_EXCEEDED',
    message: 'Too many draft updates from this network. Please slow down and try again.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'wizard_draft.rate_limit_exceeded',
      ip: req.ip,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  // realIpMiddleware canonicalises req.ip before this runs, per the same
  // discipline as `magicLinkRateLimit` / `reauthRateLimit`.
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});
