import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { PasswordResetService } from '../services/password-reset.service.js';
import { EmailService } from '../services/email.service.js';
import { setReAuthValid } from '../middleware/sensitive-action.js';
// Story 9-12 Task 10.3 (2026-05-11 session 8) — `RegistrationService` import
// removed alongside the deleted controller methods (publicRegister /
// verifyEmail / verifyOtp / resendVerification). `publicRegistrationRequestSchema`,
// `resendVerificationRequestSchema`, `verifyOtpRequestSchema` also removed.
import {
  activationWithSelfieSchema,
  backOfficeActivationSchema,
  loginRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  reAuthRequestSchema,
  isBackOfficeRole,
} from '@oslsr/types';
import { AppError } from '@oslsr/utils';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import pino from 'pino';
// Story 9-16 — cookie config extracted to a shared module so the magic-link
// login controller can reuse the identical name + options + max-age policy.
import { REFRESH_TOKEN_COOKIE_NAME, COOKIE_OPTIONS, refreshCookieMaxAge } from '../lib/cookie-config.js';

const logger = pino({ name: 'auth-controller' });

export class AuthController {
  /**
   * GET /api/v1/auth/activate/:token/validate
   * Validates activation token before showing the wizard
   * Returns user info if valid, or error state if invalid/expired
   */
  static async validateActivationToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;

      if (!token || token.length < 32) {
        return res.status(200).json({
          data: { valid: false, expired: false },
        });
      }

      const result = await AuthService.validateActivationToken(token);

      res.status(200).json({
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/activate/:token
   * Activates staff account with profile data and optional selfie.
   * Back-office roles (Super Admin, Official, Assessor) only require password.
   * Field roles (Enumerator, Supervisor, Clerk) require all 5 steps.
   */
  static async activate(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;

      // Determine user's role to choose the correct validation schema
      const tokenInfo = await AuthService.validateActivationToken(token);
      if (!tokenInfo.valid) {
        if (tokenInfo.expired) {
          throw new AppError('AUTH_TOKEN_EXPIRED', 'Invitation token has expired.', 401);
        }
        throw new AppError('AUTH_INVALID_TOKEN', 'The invitation token is invalid or has already been used.', 401);
      }

      // Choose validation schema based on role
      const backOffice = isBackOfficeRole(tokenInfo.roleName || '');
      const schema = backOffice ? backOfficeActivationSchema : activationWithSelfieSchema;

      const validation = schema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid profile data', 400, { errors: validation.error.errors });
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.get('user-agent');

      const user = await AuthService.activateAccount(
        token,
        validation.data,
        tokenInfo.roleName!,
        ipAddress,
        userAgent
      );

      res.status(200).json({
        data: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          status: user.status,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/staff/login
   * Staff login with email/password + CAPTCHA
   */
  static async staffLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = loginRequestSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid login data', 400, { errors: validation.error.errors });
      }

      const { email, password, rememberMe } = validation.data;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.get('user-agent');

      const result = await AuthService.loginStaff(
        email,
        password,
        rememberMe,
        ipAddress,
        userAgent
      );

      // Story 9-13 — 2-step pending: hand the challenge token back to the
      // client, no JWT yet. Step-2 issues the actual access/refresh tokens.
      if ('requiresMfa' in result && result.requiresMfa) {
        res.status(200).json({
          data: {
            requiresMfa: true,
            mfaChallengeToken: result.mfaChallengeToken,
            expiresIn: result.expiresIn,
          },
        });
        return;
      }

      // Set refresh token as httpOnly cookie
      res.cookie(REFRESH_TOKEN_COOKIE_NAME, result.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: refreshCookieMaxAge(rememberMe),
      });

      // Don't expose refresh token in response body
      res.status(200).json({
        data: {
          accessToken: result.accessToken,
          user: result.user,
          expiresIn: result.expiresIn,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/public/login
   * Public user login with email/password + CAPTCHA
   */
  static async publicLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = loginRequestSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid login data', 400, { errors: validation.error.errors });
      }

      const { email, password, rememberMe } = validation.data;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.get('user-agent');

      const result = await AuthService.loginPublic(
        email,
        password,
        rememberMe,
        ipAddress,
        userAgent
      );

      // Set refresh token as httpOnly cookie
      res.cookie(REFRESH_TOKEN_COOKIE_NAME, result.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: refreshCookieMaxAge(rememberMe),
      });

      res.status(200).json({
        data: {
          accessToken: result.accessToken,
          user: result.user,
          expiresIn: result.expiresIn,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/logout
   * Logout - invalidates session and blacklists token
   */
  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.get('user-agent');

      await AuthService.logout(
        req.user.sub,
        req.user.jti,
        req.sessionId || '',
        ipAddress,
        userAgent
      );

      // Clear refresh token cookie
      res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
        ...COOKIE_OPTIONS,
      });

      res.status(200).json({
        data: {
          message: 'Logged out successfully',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/refresh
   * Refresh access token using refresh token from cookie
   */
  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE_NAME];

      if (!refreshToken) {
        throw new AppError('AUTH_INVALID_TOKEN', 'No refresh token provided', 401);
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const result = await AuthService.refreshToken(refreshToken, ipAddress);

      // F-022 (Story 9-42): refresh tokens are now rotated on every use. Set the
      // freshly-minted refresh token as the httpOnly cookie (replacing the
      // consumed one), preserving the original session's Remember-Me lifetime.
      res.cookie(REFRESH_TOKEN_COOKIE_NAME, result.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: refreshCookieMaxAge(result.rememberMe),
      });

      res.status(200).json({
        data: {
          accessToken: result.accessToken,
          expiresIn: result.expiresIn,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/forgot-password
   * Request password reset email
   */
  static async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = forgotPasswordRequestSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid request data', 400, { errors: validation.error.errors });
      }

      const { email } = validation.data;
      const result = await PasswordResetService.requestReset(email);

      // Send email if token was generated (user exists).
      // F-018 (Story 9-42): dispatch the email OFF the response path (setImmediate,
      // not awaited) so the existing-email and non-existing-email branches return
      // on the same latency envelope. Awaiting the network send only on the
      // exists branch was a timing oracle for account enumeration. Send failures
      // are logged, never surfaced (the anti-enumeration response is identical
      // regardless of outcome).
      if (result.token) {
        const resetUrl = EmailService.generateResetUrl(result.token);
        setImmediate(() => {
          EmailService.sendPasswordResetEmail({
            email,
            fullName: email.split('@')[0], // Fallback, could lookup user name
            resetUrl,
            expiresInHours: 1,
          }).catch((err) => {
            logger.error({
              event: 'auth.password_reset_email_failed',
              error: err instanceof Error ? err.message : String(err),
            });
          });
        });
      }

      // Always return same response to prevent email enumeration
      res.status(200).json({
        data: {
          message: 'If this email exists, a password reset link has been sent.',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/auth/reset-password/:token
   * Validate password reset token (for frontend to check before showing form)
   */
  static async validateResetToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;

      await PasswordResetService.validateToken(token);

      res.status(200).json({
        data: {
          valid: true,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/reset-password
   * Complete password reset
   */
  static async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = resetPasswordRequestSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid request data', 400, { errors: validation.error.errors });
      }

      const { token, newPassword } = validation.data;

      await PasswordResetService.resetPassword(token, newPassword);

      // Clear any existing refresh token cookie
      res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
        ...COOKIE_OPTIONS,
      });

      res.status(200).json({
        data: {
          message: 'Password reset successful. Please log in with your new password.',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/reauth
   * Re-authenticate for sensitive actions (Remember Me sessions)
   */
  static async reAuth(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const validation = reAuthRequestSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid request data', 400, { errors: validation.error.errors });
      }

      const { password } = validation.data;
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await AuthService.reAuthenticate(
        req.user.sub,
        password,
        ipAddress
      );

      // Mark user as re-authenticated in Redis
      await setReAuthValid(req.user.sub);

      res.status(200).json({
        data: {
          verified: result.verified,
          expiresIn: result.expiresIn,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // Story 9-12 Task 10.1 — `googleVerify` controller method retired.
  // Route at `POST /api/v1/auth/google/verify` now returns 404 inline.
  // GoogleAuthService + google-auth-rate-limit middleware + their tests were
  // deleted in the same commit. ADR-015 rewrite — magic-link primary.

  /**
   * GET /api/v1/auth/me
   * Get current authenticated user info
   */
  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      // Query DB for full user record (Story 9.1: /auth/me must return profile fields)
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          phone: users.phone,
          status: users.status,
          lgaId: users.lgaId,
          createdAt: users.createdAt,
          // Story 9-13 — MFA state surfaced for the dashboard grace banner.
          mfaEnabled: users.mfaEnabled,
          mfaGraceUntil: users.mfaGraceUntil,
        })
        .from(users)
        .where(eq(users.id, req.user.sub));

      if (!user) {
        throw new AppError('AUTH_REQUIRED', 'User not found', 401);
      }

      // Resolve role name from JWT (already available, no extra query)
      res.status(200).json({
        data: {
          ...user,
          role: req.user.role,
          rememberMe: req.user.rememberMe,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // Story 9-12 Task 10.3 (2026-05-11 session 8) — Legacy public-registration
  // controller methods removed:
  //   - publicRegister  (POST /api/v1/auth/public/register)
  //   - verifyEmail     (GET  /api/v1/auth/verify-email/:token)
  //   - resendVerification (POST /api/v1/auth/resend-verification)
  //   - verifyOtp       (POST /api/v1/auth/verify-otp)
  //
  // The wizard at /api/v1/registration/wizard is the canonical entry-point.
  // Existing public_users continue to use POST /api/v1/auth/public/login
  // (email + password) — that path is unchanged.
}
