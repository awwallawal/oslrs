/**
 * Story 9-11 — Rate-limit middleware for the Audit Log Viewer endpoints.
 *
 * Two rate-limiters per AC#9:
 *   - LIST/DETAIL/DISTINCT/SEARCH: 60 requests / minute / super-admin
 *   - EXPORT: 10 requests / hour / super-admin
 *
 * Pattern matches `apps/api/src/middleware/rate-limit.ts` (express-rate-limit
 * + Redis store; memory fallback in test env). Per-super-admin keying via
 * `req.user.sub` so each operator gets their own bucket — prevents one
 * operator's automation from blocking another.
 */
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import type { Request } from 'express';
import pino from 'pino';

const logger = pino({ name: 'audit-log-rate-limit' });
const isTestEnv = process.env.NODE_ENV === 'test';

const getRedisClient = () => {
  if (isTestEnv) return null;
  return getFactoryRedisClient();
};

/**
 * `req.user` is augmented globally by the JWT auth middleware; we only need
 * `.sub` here, but cast through `unknown` to avoid colliding with the full
 * `JwtPayload` type's other required fields.
 *
 * R2-H2: defence-in-depth. The route registration ensures `authenticate +
 * authorize(SUPER_ADMIN)` always runs before this limiter, so `req.user.sub`
 * should always be populated. If a regression mounts this limiter on an
 * unauthenticated route by mistake, the prior fallback (`req.ip ?? 'unknown'`)
 * silently bucketed all such requests into a shared `'unknown'` quota — one
 * misconfigured route could exhaust the limit for every other caller. The
 * thrown error short-circuits to a 500 instead, making the misconfiguration
 * loud and immediately diagnosable from logs.
 */
const keyByUser = (req: Request) => {
  const user = (req as unknown as { user?: { sub?: string } }).user;
  if (user?.sub) return user.sub;
  if (req.ip) {
    logger.warn(
      { path: req.path, ip: req.ip },
      'audit-log rate-limit fell back to req.ip — auth middleware may not have run before this limiter (regression?)'
    );
    return req.ip;
  }
  // Both missing means the auth middleware did not populate req.user AND
  // express's trust-proxy chain did not resolve req.ip. Either is a
  // misconfiguration; we cannot bucket safely so deny the request loudly
  // rather than silently sharing a 'unknown' bucket with other callers.
  logger.error(
    { path: req.path },
    'audit-log rate-limit key missing — neither req.user.sub nor req.ip resolved; denying request to surface misconfiguration'
  );
  throw new Error('AUDIT_LOG_RATE_LIMIT_KEY_MISSING');
};

/**
 * 60 requests / minute / super-admin. Covers the audit-log list, detail,
 * distinct-values, and principal-search endpoints.
 */
export const auditLogReadRateLimit = rateLimit({
  store: isTestEnv
    ? undefined
    : new RedisStore({
        // @ts-expect-error - Known type mismatch with ioredis
        sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
      }),
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  keyGenerator: keyByUser,
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message:
      'Too many audit-log requests; please wait a minute before retrying.',
  },
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
});

/**
 * 10 requests / hour / super-admin. CSV exports run a full filtered scan +
 * 10K-row materialisation; the lower limit reflects the higher cost AND the
 * compliance posture (export-of-export is itself audit-logged per AC#8).
 */
export const auditLogExportRateLimit = rateLimit({
  store: isTestEnv
    ? undefined
    : new RedisStore({
        // @ts-expect-error - Known type mismatch with ioredis
        sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
      }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: keyByUser,
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message:
      'Audit-log export rate limit reached (10/hour). Try again later.',
  },
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
});
