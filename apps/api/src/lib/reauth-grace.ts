import { getRedisClient } from './redis.js';
import pino from 'pino';

const logger = pino({ name: 'reauth-grace' });

/**
 * Step-up re-auth grace lifecycle (Redis `reauth:<userId>` marker).
 *
 * Extracted from middleware/sensitive-action.ts (13-18 review L4): the
 * lifecycle is consumed by services (auth.service login/logout) and the
 * auth controller, not just the gate middleware — it's infrastructure, not
 * middleware. The gates in sensitive-action.ts read the same key and
 * re-export these helpers for existing import paths.
 *
 * Policy doc: docs/security/step-up-reauth.md
 */
export const REAUTH_KEY_PREFIX = 'reauth:';

/** Time window (seconds) during which re-authentication is valid. */
export const REAUTH_VALIDITY = 5 * 60;

/**
 * Marks a user as recently re-authenticated (5-minute grace window).
 *
 * Called after:
 *   - successful re-auth (`POST /api/v1/auth/reauth`)
 *   - successful INTERACTIVE PASSWORD login (staff, public, and MFA step-2
 *     completion when step-1 was a password) — Story 13-18 AC4 ruling: a user
 *     who just proved their password shouldn't be re-prompted seconds later.
 *     NOT set on silent token refresh, and NOT on magic-link login (no
 *     password proof).
 */
export async function setReAuthValid(userId: string): Promise<void> {
  const redis = getRedisClient();
  const reAuthKey = `${REAUTH_KEY_PREFIX}${userId}`;
  await redis.setex(reAuthKey, REAUTH_VALIDITY, Date.now().toString());

  logger.info({
    event: 'sensitive_action.reauth_granted',
    userId,
    validFor: REAUTH_VALIDITY,
  });
}

/**
 * Clears re-auth status for a user. Called on logout (13-18): the grace
 * window must not outlive the session that earned it.
 */
export async function clearReAuth(userId: string): Promise<void> {
  const redis = getRedisClient();
  const reAuthKey = `${REAUTH_KEY_PREFIX}${userId}`;
  await redis.del(reAuthKey);
}

/**
 * Gets the remaining validity time for a user's re-auth (in seconds)
 */
export async function getReAuthValidity(userId: string): Promise<number | null> {
  const redis = getRedisClient();
  const reAuthKey = `${REAUTH_KEY_PREFIX}${userId}`;
  const ttl = await redis.ttl(reAuthKey);
  return ttl > 0 ? ttl : null;
}
