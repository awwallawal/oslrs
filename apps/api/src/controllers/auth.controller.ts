import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { PasswordResetService } from '../services/password-reset.service.js';
import { RegistrationService } from '../services/registration.service.js';
import { EmailService } from '../services/email.service.js';
import { setReAuthValid } from '../middleware/sensitive-action.js';
import {
  activationSchema,
  loginRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  reAuthRequestSchema,
  publicRegistrationRequestSchema,
  verifyEmailRequestSchema,
  resendVerificationRequestSchema,
} from '@oslsr/types';
import { AppError } from '@oslsr/utils';

// Cookie configuration
const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
};

export class AuthController {
  /**
   * POST /api/v1/auth/activate/:token
   */
  static async activate(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;

      const validation = activationSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid profile data', 400, { errors: validation.error.errors });
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.get('user-agent');

      const user = await AuthService.activateAccount(
        token,
        validation.data,
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

      // Set refresh token as httpOnly cookie
      const refreshCookieMaxAge = rememberMe
        ? 30 * 24 * 60 * 60 * 1000 // 30 days
        : 7 * 24 * 60 * 60 * 1000;  // 7 days

      res.cookie(REFRESH_TOKEN_COOKIE_NAME, result.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: refreshCookieMaxAge,
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
      const refreshCookieMaxAge = rememberMe
        ? 30 * 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;

      res.cookie(REFRESH_TOKEN_COOKIE_NAME, result.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: refreshCookieMaxAge,
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

      // Send email if token was generated (user exists)
      if (result.token) {
        const resetUrl = EmailService.generateResetUrl(result.token);
        await EmailService.sendPasswordResetEmail({
          email,
          fullName: email.split('@')[0], // Fallback, could lookup user name
          resetUrl,
          expiresInHours: 1,
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

  /**
   * GET /api/v1/auth/me
   * Get current authenticated user info
   */
  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      res.status(200).json({
        data: {
          id: req.user.sub,
          email: req.user.email,
          role: req.user.role,
          lgaId: req.user.lgaId,
          rememberMe: req.user.rememberMe,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/public/register
   * Public user self-registration
   */
  static async publicRegister(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = publicRegistrationRequestSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid registration data', 400, { errors: validation.error.errors });
      }

      const { fullName, email, phone, nin, password } = validation.data;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';

      const result = await RegistrationService.registerPublicUser({
        fullName,
        email,
        phone,
        nin,
        password,
        ipAddress,
        userAgent,
      });

      res.status(201).json({
        data: {
          message: result.message,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/auth/verify-email/:token
   * Verify email address using token from email link
   */
  static async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;

      if (!token || token.length !== 64) {
        throw new AppError('VALIDATION_ERROR', 'Invalid verification token', 400);
      }

      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';

      const result = await RegistrationService.verifyEmail(token, ipAddress, userAgent);

      res.status(200).json({
        data: {
          message: result.message,
          success: result.success,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/resend-verification
   * Resend verification email
   */
  static async resendVerification(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = resendVerificationRequestSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid request data', 400, { errors: validation.error.errors });
      }

      const { email } = validation.data;

      const result = await RegistrationService.resendVerificationEmail(email);

      res.status(200).json({
        data: {
          message: result.message,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
