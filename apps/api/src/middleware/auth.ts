import { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { UserRole, JwtPayload } from '@oslsr/types';
import { TokenService } from '../services/token.service.js';
import { SessionService } from '../services/session.service.js';
import pino from 'pino';

const logger = pino({ name: 'auth-middleware' });

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      sessionId?: string;
    }
  }
}

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

    // MOCK AUTH for development - keep for backward compatibility
    // TODO: Remove after full auth implementation testing
    if (process.env.NODE_ENV !== 'production' && token === 'superadmin') {
      req.user = {
        sub: 'mock-super-admin-id',
        jti: 'mock-jti',
        role: UserRole.SUPER_ADMIN,
        email: 'admin@oslsr.gov.ng',
        rememberMe: false,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      return next();
    }

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
