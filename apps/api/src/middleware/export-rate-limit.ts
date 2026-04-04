/**
 * Export Rate Limiter — Per-user, role-tiered export throttling
 *
 * Story 5.4 AC#5 + role-based enhancement:
 * - Super Admin: 20 exports/hour
 * - Government Official: 10 exports/hour
 * - Verification Assessor: 5 exports/hour
 * - Other roles: 5 exports/hour (fallback)
 *
 * Prevents PII data scraping via repeated exports.
 * Applied to export download endpoint only (not count preview).
 */

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../lib/redis.js';
import type { Request } from 'express';

type AuthRequest = Request & { user?: { sub: string; role?: string } };

/** Role-based export rate limits (per hour) */
export const ROLE_RATE_LIMITS: Record<string, number> = {
  super_admin: 20,
  government_official: 10,
  verification_assessor: 5,
};

const DEFAULT_RATE_LIMIT = 5;

const isTestEnv = process.env.NODE_ENV === 'test';

export const exportRateLimit = rateLimit({
  store: isTestEnv ? undefined : new RedisStore({
    // ioredis .call() signature differs from rate-limit-redis sendCommand expectation
    // but is runtime-compatible (both accept string args and return Promise)
    sendCommand: ((...args: string[]) =>
      getRedisClient().call(args[0], ...args.slice(1))) as (...args: string[]) => Promise<number>,
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req) => {
    const role = (req as AuthRequest).user?.role ?? '';
    return ROLE_RATE_LIMITS[role] ?? DEFAULT_RATE_LIMIT;
  },
  keyGenerator: (req) => (req as AuthRequest).user?.sub ?? req.ip ?? 'unknown',
  handler: (req, res) => {
    const role = (req as AuthRequest).user?.role ?? '';
    const limit = ROLE_RATE_LIMITS[role] ?? DEFAULT_RATE_LIMIT;
    res.status(429).json({
      status: 'error',
      code: 'EXPORT_RATE_LIMIT',
      message: `Maximum ${limit} exports per hour for your role. Please try again later.`,
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
});
