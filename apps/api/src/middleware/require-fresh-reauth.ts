import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { getRedisClient } from '../lib/redis.js';

const REAUTH_KEY_PREFIX = 'reauth:';

/**
 * Story 9-13 — defence-in-depth on MFA enroll / disable / regenerate-codes.
 *
 * The existing `requireReAuth` (`sensitive-action.ts:61`) only kicks in for
 * Remember-Me sessions. For these MFA mutation endpoints we want re-auth on
 * EVERY session, Remember-Me or not — a stolen access token alone must not be
 * enough to enroll, disable, or regenerate codes.
 *
 * Behaviour:
 *   - 401 if not authenticated
 *   - 403 (`AUTH_REAUTH_REQUIRED`) if no fresh `reauth:<userId>` key in Redis
 *   - next() if a re-auth window is currently valid
 *
 * The frontend already knows how to handle `AUTH_REAUTH_REQUIRED` (it shows
 * `ReAuthModal`, then retries) — this is the same code path, just stricter.
 */
export const requireFreshReAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
    }

    const redis = getRedisClient();
    const reAuthTime = await redis.get(`${REAUTH_KEY_PREFIX}${req.user.sub}`);

    if (!reAuthTime) {
      throw new AppError(
        'AUTH_REAUTH_REQUIRED',
        'Please re-enter your password to continue with this action',
        403,
        { action: req.path, reason: 'mfa_mutation' },
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};
