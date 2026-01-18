import { db } from '../db/index.js';
import { users, auditLogs, roles } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { AppError, hashPassword, comparePassword } from '@oslsr/utils';
import type { ActivationPayload, AuthUser, LoginResponse } from '@oslsr/types';
import { UserRole } from '@oslsr/types';
import { TokenService } from './token.service.js';
import { SessionService } from './session.service.js';
import pino from 'pino';

const logger = pino({ name: 'auth-service' });

// Login attempt tracking constants
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const EXTENDED_LOCKOUT_THRESHOLD = 10;

export class AuthService {
  /**
   * Activates a staff account using an invitation token.
   * @param token Secure invitation token
   * @param data Profile data and password
   * @param ipAddress Client IP address for audit logging
   * @param userAgent Client user agent for audit logging
   */
  static async activateAccount(
    token: string,
    data: ActivationPayload,
    ipAddress?: string,
    userAgent?: string
  ): Promise<any> {
    // 1. Find user by token
    const user = await db.query.users.findFirst({
      where: eq(users.invitationToken, token)
    });

    if (!user) {
      throw new AppError('AUTH_INVALID_TOKEN', 'The invitation token is invalid or has already been used.', 401);
    }

    if (user.status !== 'invited') {
        throw new AppError('AUTH_ALREADY_ACTIVATED', 'This account has already been activated.', 400);
    }

    // Check expiry (24 hours)
    if (user.invitedAt) {
      const expiryDate = new Date(user.invitedAt);
      expiryDate.setHours(expiryDate.getHours() + 24);
      if (new Date() > expiryDate) {
        throw new AppError('AUTH_TOKEN_EXPIRED', 'Invitation token has expired.', 401);
      }
    }

    // 2. Hash password
    const passwordHash = await hashPassword(data.password);

    try {
      // 3. Update user and log audit in a transaction
      return await db.transaction(async (tx) => {
        // Double check NIN uniqueness within transaction
        const existingNin = await tx.query.users.findFirst({
            where: and(eq(users.nin, data.nin))
        });
        
        if (existingNin && existingNin.id !== user.id) {
            throw new AppError('PROFILE_NIN_DUPLICATE', 'This NIN is already registered to another account.', 409);
        }

        const [updatedUser] = await tx.update(users)
          .set({
            passwordHash,
            nin: data.nin,
            dateOfBirth: data.dateOfBirth,
            homeAddress: data.homeAddress,
            bankName: data.bankName,
            accountNumber: data.accountNumber,
            accountName: data.accountName,
            nextOfKinName: data.nextOfKinName,
            nextOfKinPhone: data.nextOfKinPhone,
            status: 'active',
            invitationToken: null, // Invalidate token
            updatedAt: new Date()
          })
          .where(eq(users.id, user.id))
          .returning();

        await tx.insert(auditLogs).values({
          actorId: user.id,
          action: 'user.activated',
          targetResource: 'users',
          targetId: user.id,
          details: { activatedAt: new Date().toISOString() },
          ipAddress: ipAddress || 'unknown',
          userAgent: userAgent || 'unknown'
        });

        return updatedUser;
      });
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      
      // Handle unique constraint violations
      if (err.code === '23505') {
        if (err.constraint_name === 'users_nin_unique') {
            throw new AppError('PROFILE_NIN_DUPLICATE', 'This NIN is already registered.', 409);
        }
        if (err.constraint_name === 'users_email_unique') {
            throw new AppError('EMAIL_EXISTS', 'Email already exists.', 409);
        }
        // Fallback for other unique constraints
        throw new AppError('CONFLICT', 'A conflict occurred with existing data.', 409);
      }
      throw err;
    }
  }

  /**
   * Staff login - validates credentials and creates session
   */
  static async loginStaff(
    email: string,
    password: string,
    rememberMe = false,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResponse & { refreshToken: string; sessionId: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Find user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
      with: {
        role: true,
      },
    });

    // Generic error to prevent email enumeration
    const genericError = new AppError(
      'AUTH_INVALID_CREDENTIALS',
      'Invalid email or password',
      401
    );

    if (!user) {
      logger.warn({
        event: 'auth.login_failed',
        reason: 'user_not_found',
        email: normalizedEmail,
        ipAddress,
      });
      throw genericError;
    }

    // Check if account is locked
    if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
      logger.warn({
        event: 'auth.login_failed',
        reason: 'account_locked',
        userId: user.id,
        lockedUntil: user.lockedUntil,
        ipAddress,
      });
      throw new AppError(
        'AUTH_ACCOUNT_LOCKED',
        'Account is temporarily locked due to too many failed login attempts. Please try again later.',
        429
      );
    }

    // Check account status
    if (user.status === 'invited') {
      throw new AppError(
        'AUTH_ACCOUNT_NOT_ACTIVATED',
        'Please complete your account activation first',
        403
      );
    }

    if (user.status === 'suspended' || user.status === 'deactivated') {
      logger.warn({
        event: 'auth.login_failed',
        reason: 'account_suspended',
        userId: user.id,
        status: user.status,
        ipAddress,
      });
      throw new AppError(
        'AUTH_ACCOUNT_SUSPENDED',
        'Your account has been suspended. Please contact support.',
        403
      );
    }

    // Validate password
    if (!user.passwordHash) {
      throw genericError;
    }

    const isValidPassword = await comparePassword(password, user.passwordHash);

    if (!isValidPassword) {
      // Increment failed login attempts
      const newFailedAttempts = (user.failedLoginAttempts || 0) + 1;
      let lockUntil = null;

      // Lock account after threshold
      if (newFailedAttempts >= EXTENDED_LOCKOUT_THRESHOLD) {
        lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      } else if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        // Warning - close to lockout
        logger.warn({
          event: 'auth.login_failed',
          reason: 'approaching_lockout',
          userId: user.id,
          failedAttempts: newFailedAttempts,
          ipAddress,
        });
      }

      await db.update(users)
        .set({
          failedLoginAttempts: newFailedAttempts,
          lockedUntil: lockUntil,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      logger.warn({
        event: 'auth.login_failed',
        reason: 'invalid_password',
        userId: user.id,
        failedAttempts: newFailedAttempts,
        ipAddress,
      });

      throw genericError;
    }

    // Verify this is a staff user (not public)
    const staffRoles = [
      UserRole.SUPER_ADMIN,
      UserRole.SUPERVISOR,
      UserRole.ENUMERATOR,
      UserRole.DATA_ENTRY_CLERK,
      UserRole.VERIFICATION_ASSESSOR,
      UserRole.GOVERNMENT_OFFICIAL,
    ];

    if (!staffRoles.includes(user.role.name as UserRole)) {
      throw new AppError(
        'AUTH_INVALID_CREDENTIALS',
        'Please use the public login for non-staff accounts',
        401
      );
    }

    // Success - create session and tokens
    return this.createLoginSession(user, rememberMe, ipAddress, userAgent);
  }

  /**
   * Public user login - validates credentials and creates session
   */
  static async loginPublic(
    email: string,
    password: string,
    rememberMe = false,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResponse & { refreshToken: string; sessionId: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Find user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
      with: {
        role: true,
      },
    });

    const genericError = new AppError(
      'AUTH_INVALID_CREDENTIALS',
      'Invalid email or password',
      401
    );

    if (!user) {
      logger.warn({
        event: 'auth.login_failed',
        reason: 'user_not_found',
        email: normalizedEmail,
        ipAddress,
        loginType: 'public',
      });
      throw genericError;
    }

    // Same validation as staff (locked, suspended, password)
    if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
      throw new AppError(
        'AUTH_ACCOUNT_LOCKED',
        'Account is temporarily locked. Please try again later.',
        429
      );
    }

    if (user.status === 'suspended' || user.status === 'deactivated') {
      throw new AppError(
        'AUTH_ACCOUNT_SUSPENDED',
        'Your account has been suspended.',
        403
      );
    }

    if (!user.passwordHash) {
      throw genericError;
    }

    const isValidPassword = await comparePassword(password, user.passwordHash);

    if (!isValidPassword) {
      const newFailedAttempts = (user.failedLoginAttempts || 0) + 1;
      let lockUntil = null;

      if (newFailedAttempts >= EXTENDED_LOCKOUT_THRESHOLD) {
        lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      }

      await db.update(users)
        .set({
          failedLoginAttempts: newFailedAttempts,
          lockedUntil: lockUntil,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      logger.warn({
        event: 'auth.login_failed',
        reason: 'invalid_password',
        userId: user.id,
        ipAddress,
        loginType: 'public',
      });

      throw genericError;
    }

    // Verify this is a public user
    if (user.role.name !== UserRole.PUBLIC_USER) {
      throw new AppError(
        'AUTH_INVALID_CREDENTIALS',
        'Please use the staff login for staff accounts',
        401
      );
    }

    return this.createLoginSession(user, rememberMe, ipAddress, userAgent);
  }

  /**
   * Creates login session and tokens (shared between staff and public login)
   */
  private static async createLoginSession(
    user: any,
    rememberMe: boolean,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResponse & { refreshToken: string; sessionId: string }> {
    // Create session (invalidates previous sessions - single session enforcement)
    const sessionInfo = await SessionService.createSession(user.id, rememberMe);

    // Create auth user object
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name as UserRole,
      lgaId: user.lgaId || undefined,
      status: user.status,
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

    // Log successful login
    logger.info({
      event: 'auth.login_success',
      userId: user.id,
      role: user.role.name,
      rememberMe,
      ipAddress,
    });

    // Audit log
    await db.insert(auditLogs).values({
      actorId: user.id,
      action: 'auth.login_success',
      targetResource: 'users',
      targetId: user.id,
      details: {
        rememberMe,
        sessionId: sessionInfo.sessionId,
      },
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown',
    });

    return {
      accessToken,
      user: authUser,
      expiresIn,
      refreshToken,
      sessionId: sessionInfo.sessionId,
    };
  }

  /**
   * Logout - invalidates session and blacklists token
   */
  static async logout(
    userId: string,
    jti: string,
    sessionId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    // Blacklist the access token
    await TokenService.addToBlacklist(jti);

    // Invalidate the session
    await SessionService.invalidateSession(sessionId, 'logout');

    // Clear session ID from user record
    await db.update(users)
      .set({
        currentSessionId: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Log logout
    logger.info({
      event: 'auth.logout',
      userId,
      sessionId,
      ipAddress,
    });

    // Audit log
    await db.insert(auditLogs).values({
      actorId: userId,
      action: 'auth.logout',
      targetResource: 'users',
      targetId: userId,
      details: { sessionId },
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown',
    });
  }

  /**
   * Refresh token - generates new access token using refresh token
   */
  static async refreshToken(
    refreshToken: string,
    ipAddress?: string
  ): Promise<{ accessToken: string; expiresIn: number }> {
    // Validate refresh token
    const tokenData = await TokenService.validateRefreshToken(refreshToken);

    if (!tokenData) {
      throw new AppError('AUTH_INVALID_TOKEN', 'Invalid or expired refresh token', 401);
    }

    // Validate session
    const sessionValidation = await SessionService.validateSession(tokenData.sessionId);

    if (!sessionValidation.valid) {
      // Invalidate refresh token if session is invalid
      await TokenService.invalidateRefreshToken(refreshToken);

      const reason = sessionValidation.reason;
      if (reason === 'inactivity') {
        throw new AppError('AUTH_SESSION_EXPIRED', 'Session expired due to inactivity', 401);
      }
      if (reason === 'absolute_timeout') {
        throw new AppError('AUTH_SESSION_EXPIRED', 'Session has expired. Please log in again.', 401);
      }
      throw new AppError('AUTH_SESSION_EXPIRED', 'Session is no longer valid', 401);
    }

    // Get user data for new token
    const user = await db.query.users.findFirst({
      where: eq(users.id, tokenData.userId),
      with: {
        role: true,
      },
    });

    if (!user) {
      throw new AppError('AUTH_INVALID_TOKEN', 'User not found', 401);
    }

    // Check user status
    if (user.status === 'suspended' || user.status === 'deactivated') {
      await TokenService.invalidateRefreshToken(refreshToken);
      throw new AppError('AUTH_ACCOUNT_SUSPENDED', 'Your account has been suspended', 403);
    }

    // Create auth user object
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name as UserRole,
      lgaId: user.lgaId || undefined,
      status: user.status,
    };

    // Generate new access token
    const { token: accessToken, jti, expiresIn } = TokenService.generateAccessToken(
      authUser,
      tokenData.rememberMe
    );

    // Update session with new token JTI
    await SessionService.linkTokenToSession(tokenData.sessionId, jti);

    // Update last activity
    await SessionService.updateLastActivity(tokenData.sessionId);

    logger.info({
      event: 'auth.token_refreshed',
      userId: user.id,
      sessionId: tokenData.sessionId,
      ipAddress,
    });

    return { accessToken, expiresIn };
  }

  /**
   * Re-authenticate for sensitive actions (Remember Me sessions)
   */
  static async reAuthenticate(
    userId: string,
    password: string,
    ipAddress?: string
  ): Promise<{ verified: boolean; expiresIn: number }> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user || !user.passwordHash) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'Invalid credentials', 401);
    }

    const isValid = await comparePassword(password, user.passwordHash);

    if (!isValid) {
      logger.warn({
        event: 'auth.reauth_failed',
        userId,
        ipAddress,
      });
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'Invalid password', 401);
    }

    logger.info({
      event: 'auth.reauth_success',
      userId,
      ipAddress,
    });

    // Re-auth is valid for 5 minutes
    const REAUTH_EXPIRY = 5 * 60;

    return {
      verified: true,
      expiresIn: REAUTH_EXPIRY,
    };
  }
}
