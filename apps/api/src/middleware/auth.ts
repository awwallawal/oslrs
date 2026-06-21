import { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { TokenService } from '../services/token.service.js';
import { SessionService } from '../services/session.service.js';
import { viewAsReadOnlyError } from './view-as.middleware.js';
import pino from 'pino';

const logger = pino({ name: 'auth-middleware' });

// Express Request type extensions are in ../types.d.ts

/**
 * Authentication middleware - validates JWT and session
 * Implements:
 * - JWT verification
 * - Token blacklist check
 * - Session validation (inactivity + absolute timeout)
 * - Token revocation by timestamp (for password change)
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify JWT
    const decoded = TokenService.verifyAccessToken(token);

    // Check if token is blacklisted
    const isBlacklisted = await TokenService.isBlacklisted(decoded.jti);
    if (isBlacklisted) {
      logger.warn({
        event: 'auth.token_blacklisted',
        userId: decoded.sub,
        jti: decoded.jti,
      });
      throw new AppError('AUTH_TOKEN_REVOKED', 'Token has been revoked', 401);
    }

    // Check if token was revoked by timestamp (e.g., after password change)
    const isRevokedByTimestamp = await TokenService.isTokenRevokedByTimestamp(
      decoded.sub,
      decoded.iat
    );
    if (isRevokedByTimestamp) {
      logger.warn({
        event: 'auth.token_revoked_by_timestamp',
        userId: decoded.sub,
        issuedAt: decoded.iat,
      });
      throw new AppError('AUTH_TOKEN_REVOKED', 'Please log in again', 401);
    }

    // Get user's current session ID from Redis
    const session = await SessionService.getUserSession(decoded.sub);

    if (session) {
      // Validate session (inactivity + absolute timeout)
      const validation = await SessionService.validateSession(session.sessionId);

      if (!validation.valid) {
        logger.info({
          event: 'auth.session_expired',
          userId: decoded.sub,
          reason: validation.reason,
        });

        if (validation.reason === 'inactivity') {
          throw new AppError(
            'AUTH_SESSION_EXPIRED',
            'Session expired due to inactivity. Please log in again.',
            401
          );
        }

        throw new AppError(
          'AUTH_SESSION_EXPIRED',
          'Session has expired. Please log in again.',
          401
        );
      }

      // Update last activity
      await SessionService.updateLastActivity(session.sessionId);
      req.sessionId = session.sessionId;
    }

    // Attach user to request
    req.user = decoded;

    // Story 9-13 — MFA grace-period gate. After grace expires for a super_admin
    // who hasn't enrolled, every route is blocked except the MFA enrollment +
    // session-basic endpoints. Skip the DB hit for non-super_admin roles.
    if (decoded.role === 'super_admin') {
      const { mfaGraceCheck } = await import('./mfa-grace.js');
      const graceError = await mfaGraceCheck(req);
      if (graceError) return next(graceError);
    }

    // Attach View-As state for Super Admins (Story 6-7 — server-side safety net)
    // Only Super Admins can have View-As sessions; skip Redis lookup for all other roles
    if (decoded.role === 'super_admin') {
      let viewAsState = null;
      try {
        const { ViewAsService } = await import('../services/view-as.service.js');
        viewAsState = await ViewAsService.getViewAsState(decoded.sub);
      } catch (stateErr) {
        // F-010 (review M3) — FAIL CLOSED: if View-As state can't be determined
        // (e.g. a Redis blip), block mutations rather than risk letting a View-As
        // session perform a write. Reads proceed.
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          logger.warn({ event: 'view_as.state_check_failed_blocking', userId: decoded.sub, error: (stateErr as Error).message });
          return next(new AppError('VIEW_AS_STATE_UNAVAILABLE', 'Could not verify View-As state; action blocked', 503));
        }
        logger.warn({ event: 'view_as.state_check_failed', userId: decoded.sub });
      }
      if (viewAsState) {
        req.viewAs = viewAsState;
        // F-010 — enforce read-only via the SHARED decision (exact-pathname,
        // method-aware), STATICALLY imported so the control can't fail open on a
        // dynamic-import error. Same code path as `blockMutationsInViewAs`.
        const viewAsErr = viewAsReadOnlyError(req);
        if (viewAsErr) return next(viewAsErr);
      }
    }

    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    logger.error({
      event: 'auth.middleware_error',
      error: (error as Error).message,
    });

    next(new AppError('AUTH_INVALID_TOKEN', 'Invalid token', 401));
  }
};

/**
 * Optional authentication - doesn't fail if no token provided
 * Useful for routes that work with or without auth
 */
export const optionalAuthenticate = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  return authenticate(req, res, next);
};
