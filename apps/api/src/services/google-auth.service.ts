import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js';
import { users, roles } from '../db/schema/index.js';
import { AuditService } from './audit.service.js';
import { eq } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import type { AuthUser, LoginResponse } from '@oslsr/types';
import { UserRole } from '@oslsr/types';
import { TokenService } from './token.service.js';
import { SessionService } from './session.service.js';
import pino from 'pino';

type UserRow = InferSelectModel<typeof users>;
type RoleRow = InferSelectModel<typeof roles>;
type UserWithRole = UserRow & { role: RoleRow | null };

const logger = pino({ name: 'google-auth-service' });

const getGoogleClientId = () => process.env.GOOGLE_CLIENT_ID || '';

let oauthClient: OAuth2Client | null = null;
const getOAuthClient = () => {
  if (!oauthClient) {
    oauthClient = new OAuth2Client(getGoogleClientId());
  }
  return oauthClient;
};

export interface GooglePayload {
  googleId: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export class GoogleAuthService {
  /**
   * Verifies a Google ID token and extracts user payload.
   * Validates token signature, audience, and email verification status.
   */
  static async verifyGoogleToken(idToken: string): Promise<GooglePayload> {
    const clientId = getGoogleClientId();
    if (!clientId) {
      throw new AppError(
        'AUTH_GOOGLE_TOKEN_INVALID',
        'Google OAuth is not configured',
        500
      );
    }

    try {
      const ticket = await getOAuthClient().verifyIdToken({
        idToken,
        audience: clientId,
      });
      const payload = ticket.getPayload();

      if (!payload || !payload.email || !payload.email_verified) {
        throw new AppError(
          'AUTH_GOOGLE_TOKEN_INVALID',
          'Google authentication failed. Please try again.',
          401
        );
      }

      return {
        googleId: payload.sub,
        email: payload.email.toLowerCase().trim(),
        name: payload.name || '',
        emailVerified: payload.email_verified,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.warn({
        event: 'auth.google_token_verification_failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw new AppError(
        'AUTH_GOOGLE_TOKEN_INVALID',
        'Google authentication failed. Please try again.',
        401
      );
    }
  }

  /**
   * Registers a new user with Google or logs in an existing Google user.
   * Handles account conflict detection.
   */
  static async registerOrLoginWithGoogle(
    googlePayload: GooglePayload,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResponse & { refreshToken: string; sessionId: string }> {
    const { googleId, email } = googlePayload;

    // Check if user exists by Google ID first
    const existingByGoogleId = await db.query.users.findFirst({
      where: eq(users.googleId, googleId),
      with: { role: true },
    });

    if (existingByGoogleId) {
      // Existing Google user — login
      return this.loginGoogleUser(existingByGoogleId, ipAddress, userAgent);
    }

    // Check if email exists with a different provider
    const existingByEmail = await db.query.users.findFirst({
      where: eq(users.email, email),
      with: { role: true },
    });

    if (existingByEmail) {
      if (existingByEmail.authProvider === 'email') {
        logger.warn({
          event: 'auth.google_signup_email_conflict',
          email,
          ipAddress,
        });
        throw new AppError(
          'AUTH_EMAIL_ONLY',
          'This email is already registered with email/password. Please use email login.',
          409
        );
      }
      // If auth_provider is 'google' but googleId doesn't match — shouldn't happen
      // but handle defensively
      throw new AppError(
        'AUTH_PROVIDER_CONFLICT',
        'Account conflict detected. Please contact support.',
        409
      );
    }

    // New user — register with Google
    return this.createGoogleUser(googlePayload, ipAddress, userAgent);
  }

  /**
   * Creates a new user with Google OAuth provider.
   */
  private static async createGoogleUser(
    googlePayload: GooglePayload,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResponse & { refreshToken: string; sessionId: string }> {
    const { googleId, email, name } = googlePayload;

    // Get public_user role
    const publicRole = await db.query.roles.findFirst({
      where: eq(roles.name, 'public_user'),
    });

    if (!publicRole) {
      throw new AppError('CONFIG_ERROR', 'Public user role not found', 500);
    }

    const now = new Date();

    const [newUser] = await db.insert(users).values({
      email,
      fullName: name || email.split('@')[0],
      authProvider: 'google',
      googleId,
      emailVerifiedAt: now,
      roleId: publicRole.id,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }).returning();

    logger.info({
      event: 'auth.google_registration_success',
      userId: newUser.id,
      email,
      ipAddress,
    });

    // Audit log (fire-and-forget)
    AuditService.logAction({
      actorId: newUser.id,
      action: 'auth.google_registration_success',
      targetResource: 'users',
      targetId: newUser.id,
      details: { authProvider: 'google' },
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown',
    });

    // Create session — Google users get rememberMe: true by default (30-day session)
    return this.createGoogleSession(
      { ...newUser, role: publicRole },
      ipAddress,
      userAgent
    );
  }

  /**
   * Logs in an existing Google user.
   */
  private static async loginGoogleUser(
    user: UserWithRole,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResponse & { refreshToken: string; sessionId: string }> {
    // Check account status
    if (user.status === 'suspended' || user.status === 'deactivated') {
      throw new AppError(
        'AUTH_ACCOUNT_SUSPENDED',
        'Your account has been suspended. Please contact support.',
        403
      );
    }

    logger.info({
      event: 'auth.google_login_success',
      userId: user.id,
      ipAddress,
    });

    // Audit log (fire-and-forget)
    AuditService.logAction({
      actorId: user.id,
      action: 'auth.google_login_success',
      targetResource: 'users',
      targetId: user.id,
      details: { authProvider: 'google' },
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown',
    });

    return this.createGoogleSession(user, ipAddress, userAgent);
  }

  /**
   * Creates a session for a Google user (shared between register and login).
   * Google users get rememberMe: true by default.
   */
  private static async createGoogleSession(
    user: UserWithRole,
    _ipAddress?: string,
    _userAgent?: string
  ): Promise<LoginResponse & { refreshToken: string; sessionId: string }> {
    const rememberMe = true; // Google users get 30-day sessions

    // Create session (invalidates previous sessions - single session enforcement)
    const sessionInfo = await SessionService.createSession(user.id, rememberMe);

    // Create auth user object
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: (user.role?.name || UserRole.PUBLIC_USER) as UserRole,
      lgaId: user.lgaId || undefined,
      status: user.status,
      authProvider: 'google',
    };

    // Generate access token
    const { token: accessToken, jti, expiresIn } = TokenService.generateAccessToken(
      authUser,
      rememberMe
    );

    // Generate refresh token
    const refreshToken = await TokenService.generateRefreshToken(
      user.id,
      sessionInfo.sessionId,
      rememberMe
    );

    // Link token to session
    await SessionService.linkTokenToSession(sessionInfo.sessionId, jti);

    // Reset failed login attempts and update last login
    await db.update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        currentSessionId: sessionInfo.sessionId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return {
      accessToken,
      user: authUser,
      expiresIn,
      refreshToken,
      sessionId: sessionInfo.sessionId,
    };
  }
}
