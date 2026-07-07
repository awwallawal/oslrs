import { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { eq } from 'drizzle-orm';
import { getRedisClient } from '../lib/redis.js';
import { REAUTH_KEY_PREFIX } from '../lib/reauth-grace.js';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import pino from 'pino';

const logger = pino({ name: 'sensitive-action-middleware' });

// 13-18 review L4 — the grace lifecycle (set/clear/ttl of the `reauth:` key)
// lives in lib/reauth-grace.ts; re-exported here so existing import paths and
// route-test mocks of this module stay stable.
export { setReAuthValid, clearReAuth, getReAuthValidity } from '../lib/reauth-grace.js';

/**
 * Story 13-18 — canonical inventory of step-up-gated routes.
 *
 * Every route that mounts a fresh-reauth gate MUST be listed here, and every
 * entry MUST correspond to a really-registered route + method. The anti-drift
 * test (`__tests__/security.reauth-routes.test.ts`) asserts BOTH directions
 * against the live Express router stack, so a route rename can no longer
 * silently un-gate a sensitive action — and a gate can no longer be added
 * without being inventoried.
 *
 * This list is documentation + test fixture, NOT runtime dispatch: enforcement
 * is the explicit per-route middleware mount (grep the `gate` name).
 *
 * Removed phantom intents from the pre-13-18 regex list (they matched NO
 * registered route — the middleware that consumed them, `requireReAuth`, was
 * additionally never mounted, so the old list was doubly dead):
 *   - `PUT /users/:id/password`, `POST /auth/change-password` — no
 *     authenticated change-password route exists today; the only password
 *     routes are the UNauthenticated forgot/reset flow (auth.routes.ts).
 *     GAP (accepted): if an authenticated change-password route is ever
 *     added, it must be gated + inventoried here.
 *   - `PUT|PATCH /users/:id/bank-details` — no such route; bank fields
 *     (bankName/accountNumber/accountName) are part of the
 *     `PATCH /users/profile` payload, which IS gated below.
 *   - `POST|PUT /payments/disputes*` — no payments routes exist.
 *   - `PUT /users/:id/security`, `DELETE /users/:id/sessions` — no such
 *     routes; MFA mutations (the real "security settings") are gated below,
 *     and session invalidation happens via logout / staff deactivate.
 */
export const SENSITIVE_ACTIONS = [
  // Own-profile mutation — includes staff bank details in its payload.
  // Passwordless-exempt: see requireFreshReAuthExceptPasswordless below.
  { method: 'PATCH', path: '/api/v1/users/profile', gate: 'requireFreshReAuthExceptPasswordless' },

  // System settings write (includes the wizard.public_form_id pin — 13-17).
  { method: 'PATCH', path: '/api/v1/admin/settings/:key', gate: 'requireFreshReAuth' },

  // Destructive admin action.
  { method: 'POST', path: '/api/v1/admin/email-queue/drain', gate: 'requireFreshReAuth' },

  // Privileged staff-account mutations (F-014, Story 9-45).
  { method: 'PATCH', path: '/api/v1/staff/:userId/role', gate: 'requireFreshReAuth' },
  { method: 'POST', path: '/api/v1/staff/:userId/deactivate', gate: 'requireFreshReAuth' },
  { method: 'POST', path: '/api/v1/staff/:userId/reactivate', gate: 'requireFreshReAuth' },

  // MFA mutations (Story 9-13).
  { method: 'POST', path: '/api/v1/auth/mfa/enroll', gate: 'requireFreshReAuth' },
  { method: 'POST', path: '/api/v1/auth/mfa/disable', gate: 'requireFreshReAuth' },
  { method: 'POST', path: '/api/v1/auth/mfa/regenerate-codes', gate: 'requireFreshReAuth' },
] as const;

// Story 13-18 — `requireReAuth` (the old Remember-Me-conditional middleware
// that pattern-matched req.path against a regex list) was DELETED: it was
// never mounted anywhere, and its patterns matched no registered route. Its
// intent is now served by the explicit per-route gates below plus the
// login-grace lifecycle (see setReAuthValid / auth.service.ts): a fresh
// interactive password login grants the 5-minute grace, so only stale /
// resumed / token-only sessions get re-prompted — which is the behaviour the
// old "Remember Me" framing was reaching for, without the dead plumbing.

/**
 * UNCONDITIONAL step-up re-auth for privileged/sensitive mutations
 * (Story 9-45 AC#3 / F-014; consolidated single implementation in 13-18).
 *
 * ALWAYS requires a recent re-authentication regardless of session type, so a
 * stolen-but-valid access token cannot perform the gated mutation unless the
 * actor re-proved their password within the 5-minute window — OR logged in
 * with their password within that window (login grants the same grace; see
 * AC4 ruling in story 13-18).
 *
 * Apply directly on the route, AFTER `authenticate`. Every mount must be
 * listed in SENSITIVE_ACTIONS (anti-drift test enforces this).
 */
export const requireFreshReAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
    }

    const redis = getRedisClient();
    const reAuthKey = `${REAUTH_KEY_PREFIX}${req.user.sub}`;
    const reAuthTime = await redis.get(reAuthKey);

    if (reAuthTime) {
      logger.info({ event: 'privileged_action.reauth_valid', userId: req.user.sub, action: req.path });
      return next();
    }

    logger.info({
      event: 'privileged_action.reauth_required',
      userId: req.user.sub,
      action: req.path,
      method: req.method,
    });

    throw new AppError(
      'AUTH_REAUTH_REQUIRED',
      'Please re-enter your password to continue with this action',
      403,
      { action: req.path, reason: 'privileged_action' },
    );
  } catch (error) {
    if (error instanceof AppError) return next(error);
    logger.error({ event: 'privileged_action.error', error: (error as Error).message });
    next(error);
  }
};

/**
 * Story 13-18 — fresh-reauth gate for `PATCH /users/profile`, which is used
 * by EVERY role including public_user.
 *
 * Passwordless accounts exist (wizard-provisioned public users with
 * `passwordHash: null`, magic-link login only — Story 9-16/9-38). They cannot
 * answer a password re-auth modal (`POST /auth/reauth` bcrypt-compares and
 * 401s on a null hash), so an unconditional gate would permanently lock them
 * out of profile self-service (an NDPA data-subject-rights problem). Their
 * single-use magic-link possession at login is their identity proof; the risk
 * delta vs the pre-13-18 state (route fully ungated) is zero for that cohort.
 *
 * Behaviour: identical to `requireFreshReAuth`, except a passwordless account
 * passes with an audit-visible log event instead of a 403.
 */
export const requireFreshReAuthExceptPasswordless = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
    }

    const redis = getRedisClient();
    const reAuthKey = `${REAUTH_KEY_PREFIX}${req.user.sub}`;
    const reAuthTime = await redis.get(reAuthKey);

    if (reAuthTime) {
      logger.info({ event: 'privileged_action.reauth_valid', userId: req.user.sub, action: req.path });
      return next();
    }

    // No fresh grace — exempt passwordless accounts (they cannot re-auth).
    const [account] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, req.user.sub));

    if (account && account.passwordHash === null) {
      logger.info({
        event: 'privileged_action.passwordless_exemption',
        userId: req.user.sub,
        action: req.path,
        method: req.method,
      });
      return next();
    }

    logger.info({
      event: 'privileged_action.reauth_required',
      userId: req.user.sub,
      action: req.path,
      method: req.method,
    });

    throw new AppError(
      'AUTH_REAUTH_REQUIRED',
      'Please re-enter your password to continue with this action',
      403,
      { action: req.path, reason: 'privileged_action' },
    );
  } catch (error) {
    if (error instanceof AppError) return next(error);
    logger.error({ event: 'privileged_action.error', error: (error as Error).message });
    next(error);
  }
};

