import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { AppError, hashPassword, comparePassword } from '@oslsr/utils';
import type { ActivationWithSelfiePayload, BackOfficeActivationPayload, AuthUser, LoginResponse } from '@oslsr/types';
import { UserRole, isBackOfficeRole } from '@oslsr/types';
import { TokenService } from './token.service.js';
import { SessionService } from './session.service.js';
import { PhotoProcessingService } from './photo-processing.service.js';
import { AuditService } from './audit.service.js';
import pino from 'pino';

const logger = pino({ name: 'auth-service' });

// Login attempt tracking constants
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const EXTENDED_LOCKOUT_THRESHOLD = 10;

export class AuthService {
  /**
   * Validates an activation token without consuming it.
   * Returns user info if valid, or specific error states.
   * @param token Secure invitation token
   */
  static async validateActivationToken(token: string): Promise<{
    valid: boolean;
    email?: string;
    fullName?: string;
    expired?: boolean;
    roleName?: string;
  }> {
    const user = await db.query.users.findFirst({
      where: eq(users.invitationToken, token),
      with: {
        role: true,
      },
    });

    if (!user) {
      return { valid: false, expired: false };
    }

    if (user.status !== 'invited') {
      // Already activated
      return { valid: false, expired: false };
    }

    // Check expiry (24 hours)
    if (user.invitedAt) {
      const expiryDate = new Date(user.invitedAt);
      expiryDate.setHours(expiryDate.getHours() + 24);
      if (new Date() > expiryDate) {
        return { valid: false, expired: true };
      }
    }

    return {
      valid: true,
      email: user.email,
      fullName: user.fullName,
      roleName: user.role.name,
    };
  }

  /**
   * Activates a staff account using an invitation token.
   * @param token Secure invitation token
   * @param data Profile data, password, and optional selfie
   * @param ipAddress Client IP address for audit logging
   * @param userAgent Client user agent for audit logging
   */
  static async activateAccount(
    token: string,
    data: ActivationWithSelfiePayload | BackOfficeActivationPayload,
    roleName: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ id: string; email: string; fullName: string; status: string }> {
    // 1. Find user by token (role already known from prior validateActivationToken call)
    const user = await db.query.users.findFirst({
      where: eq(users.invitationToken, token),
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

    // Determine if this is a back-office activation (password only)
    const backOffice = isBackOfficeRole(roleName);

    // 2. Hash password
    const passwordHash = await hashPassword(data.password);

    // 3. Process selfie if provided (field roles only)
    let selfieData: { originalUrl: string; idCardUrl: string; livenessScore: number } | null = null;
    if (!backOffice && 'selfieBase64' in data && data.selfieBase64) {
      try {
        const imageBuffer = this.decodeBase64Image(data.selfieBase64);
        const photoService = new PhotoProcessingService();
        selfieData = await photoService.processLiveSelfie(imageBuffer);

        logger.info({
          event: 'activation.selfie_processed',
          userId: user.id,
          livenessScore: selfieData.livenessScore,
        });
      } catch (err: unknown) {
        logger.warn({
          event: 'activation.selfie_failed',
          userId: user.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        if (err instanceof AppError && err.code === 'VALIDATION_ERROR') {
          throw err;
        }
        selfieData = null;
      }
    }

    let updatedUser;
    try {
      // 4. Update user and log audit in a transaction
      updatedUser = await db.transaction(async (tx) => {
        // Build update object — back-office gets password only, field roles get full profile
        const updateData: Record<string, unknown> = {
          passwordHash,
          status: 'active',
          invitationToken: null, // Invalidate token
          updatedAt: new Date(),
        };

        if (!backOffice) {
          // Field role: include all profile fields
          const fullData = data as ActivationWithSelfiePayload;

          // Double check NIN uniqueness within transaction
          const existingNin = await tx.query.users.findFirst({
              where: and(eq(users.nin, fullData.nin))
          });

          if (existingNin && existingNin.id !== user.id) {
              throw new AppError('PROFILE_NIN_DUPLICATE', 'This NIN is already registered to another account.', 409);
          }

          updateData.nin = fullData.nin;
          updateData.dateOfBirth = fullData.dateOfBirth;
          updateData.homeAddress = fullData.homeAddress;
          updateData.bankName = fullData.bankName;
          updateData.accountNumber = fullData.accountNumber;
          updateData.accountName = fullData.accountName;
          updateData.nextOfKinName = fullData.nextOfKinName;
          updateData.nextOfKinPhone = fullData.nextOfKinPhone;

          // Add selfie data if processed successfully
          if (selfieData) {
            updateData.liveSelfieOriginalUrl = selfieData.originalUrl;
            updateData.liveSelfieIdCardUrl = selfieData.idCardUrl;
            updateData.livenessScore = selfieData.livenessScore.toString();
          }
        }

        const [result] = await tx.update(users)
          .set(updateData)
          .where(eq(users.id, user.id))
          .returning();

        await AuditService.logActionTx(tx, {
          actorId: user.id,
          action: 'user.activated',
          targetResource: 'users',
          targetId: user.id,
          details: {
            activatedAt: new Date().toISOString(),
            selfieUploaded: !!selfieData,
            backOfficeActivation: backOffice,
          },
          ipAddress: ipAddress || 'unknown',
          userAgent: userAgent || 'unknown',
        });

        return result;
      });
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;

      // Handle unique constraint violations
      const dbError = err as { code?: string; constraint_name?: string };
      if (dbError.code === '23505') {
        if (dbError.constraint_name === 'users_nin_unique') {
            throw new AppError('PROFILE_NIN_DUPLICATE', 'This NIN is already registered.', 409);
        }
        if (dbError.constraint_name === 'users_email_unique') {
            throw new AppError('EMAIL_EXISTS', 'Email already exists.', 409);
        }
        throw new AppError('CONFLICT', 'A conflict occurred with existing data.', 409);
      }
      throw err instanceof Error ? err : new Error(String(err));
    }

    logger.info({
      event: 'activation.complete',
      userId: user.id,
      role: roleName,
      backOfficeActivation: backOffice,
    });

    return updatedUser;
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

    // Check if user registered via Google OAuth BEFORE password validation (Story 3.0)
    // Google users have null passwordHash, so this must come first to return the correct error
    if (user.authProvider === 'google') {
      logger.warn({
        event: 'auth.login_failed',
        reason: 'google_only_account',
        userId: user.id,
        ipAddress,
        loginType: 'public',
      });
      throw new AppError(
        'AUTH_GOOGLE_ONLY',
        "This account uses Google Sign-In. Please use 'Continue with Google' to access your account.",
        400
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // Audit log (fire-and-forget — login succeeds even if audit fails)
    AuditService.logAction({
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

    // Audit log (fire-and-forget — logout succeeds even if audit fails)
    AuditService.logAction({
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

  /**
   * Decodes a base64 image string to a Buffer
   * Handles both data URL format (data:image/jpeg;base64,...) and raw base64
   */
  private static decodeBase64Image(base64String: string): Buffer {
    // Remove data URL prefix if present
    let base64Data = base64String;
    const dataUrlMatch = base64String.match(/^data:image\/\w+;base64,(.+)$/);
    if (dataUrlMatch) {
      base64Data = dataUrlMatch[1];
    }

    // Decode base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Basic validation - ensure we got actual data
    if (buffer.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Invalid base64 image data', 400);
    }

    return buffer;
  }
}
