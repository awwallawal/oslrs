import { Router, type RequestHandler } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { MfaController } from '../controllers/mfa.controller.js';
import { authenticate } from '../middleware/auth.js';
import { verifyCaptcha } from '../middleware/captcha.js';
import { loginRateLimit, strictLoginRateLimit, refreshRateLimit } from '../middleware/login-rate-limit.js';
import { mfaRateLimit } from '../middleware/mfa-rate-limit.js';
import { requireFreshReAuth } from '../middleware/require-fresh-reauth.js';
import { passwordResetRateLimit, passwordResetCompletionRateLimit } from '../middleware/password-reset-rate-limit.js';
import { registrationRateLimit, resendVerificationRateLimit, verifyEmailRateLimit, activationRateLimit } from '../middleware/registration-rate-limit.js';
import { googleAuthRateLimit } from '../middleware/google-auth-rate-limit.js';
import { AppError } from '@oslsr/utils';

const router = Router();

// Account activation (from Story 1.4) — rate limited to prevent resource exhaustion
// Validate activation token - for frontend to check before showing wizard
router.get('/activate/:token/validate', activationRateLimit, AuthController.validateActivationToken);
// Complete activation with profile data
router.post('/activate/:token', activationRateLimit, AuthController.activate);

// Staff login - rate limited + CAPTCHA protected
// Layer 1: strictLoginRateLimit (10/hour) - blocks sustained attacks
// Layer 2: loginRateLimit (5/15min) - blocks burst attacks
router.post('/staff/login',
  strictLoginRateLimit,
  loginRateLimit,
  verifyCaptcha,
  AuthController.staffLogin
);

// Public user login - rate limited + CAPTCHA protected
router.post('/public/login',
  strictLoginRateLimit,
  loginRateLimit,
  verifyCaptcha,
  AuthController.publicLogin
);

// Google OAuth verification - rate limited, no CAPTCHA needed (Story 3.0)
router.post('/google/verify',
  googleAuthRateLimit,
  AuthController.googleVerify
);

// Public user registration - rate limited + CAPTCHA protected (Story 1.8)
router.post('/public/register',
  registrationRateLimit,
  verifyCaptcha,
  AuthController.publicRegister
);

// Email verification - rate limited (Story 1.8)
router.get('/verify-email/:token',
  verifyEmailRateLimit,
  AuthController.verifyEmail
);

// OTP verification - rate limited + CAPTCHA protected (ADR-015)
router.post('/verify-otp',
  verifyEmailRateLimit,
  verifyCaptcha,
  AuthController.verifyOtp
);

// Resend verification email - rate limited + CAPTCHA protected (Story 1.8)
router.post('/resend-verification',
  resendVerificationRateLimit,
  verifyCaptcha,
  AuthController.resendVerification
);

// Logout - requires authentication
router.post('/logout',
  authenticate,
  AuthController.logout
);

// Token refresh - rate limited
router.post('/refresh',
  refreshRateLimit,
  AuthController.refresh
);

// Password reset request - rate limited + CAPTCHA protected
router.post('/forgot-password',
  passwordResetRateLimit,
  verifyCaptcha,
  AuthController.forgotPassword
);

// Validate password reset token
router.get('/reset-password/:token',
  passwordResetCompletionRateLimit,
  AuthController.validateResetToken
);

// Complete password reset - rate limited
router.post('/reset-password',
  passwordResetCompletionRateLimit,
  AuthController.resetPassword
);

// Re-authenticate for sensitive actions
router.post('/reauth',
  authenticate,
  AuthController.reAuth
);

// Get current user info
router.get('/me',
  authenticate,
  AuthController.me
);

// ---------------------------------------------------------------------------
// Story 9-13 — TOTP MFA endpoints
// ---------------------------------------------------------------------------

// Story 9-13 AC#1 says "requires authenticated super_admin session" — gate
// enroll/disable/regenerate-codes on the role explicitly. Verify endpoint is
// open to any authenticated session because once MFA is enrolled, the user
// must always be able to verify regardless of role (mfa_enabled flag is
// enforced at login, not at /verify).
const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    return next(new AppError('AUTH_REQUIRED', 'Authentication required', 401));
  }
  if (req.user.role !== 'super_admin') {
    return next(new AppError('FORBIDDEN', 'MFA mutations are restricted to super_admin accounts', 403));
  }
  next();
};

// Enrollment: authenticated super_admin + fresh re-auth window
router.post('/mfa/enroll',
  authenticate,
  requireSuperAdmin,
  requireFreshReAuth,
  MfaController.enroll
);

// Authenticated verify (post-enrollment confirmation). Per-IP rate limited (10/min).
router.post('/mfa/verify',
  authenticate,
  mfaRateLimit,
  MfaController.verify
);

// Disable MFA: authenticated super_admin + fresh re-auth + current TOTP
router.post('/mfa/disable',
  authenticate,
  requireSuperAdmin,
  requireFreshReAuth,
  mfaRateLimit,
  MfaController.disable
);

// Regenerate backup codes: authenticated super_admin + fresh re-auth + current TOTP
router.post('/mfa/regenerate-codes',
  authenticate,
  requireSuperAdmin,
  requireFreshReAuth,
  mfaRateLimit,
  MfaController.regenerateCodes
);

// Login step-2 with TOTP — UNAUTHENTICATED, gated by challenge token + rate limits + CAPTCHA.
// Mirrors the /staff/login layering: strict + standard rate limits + CAPTCHA + per-IP MFA limit.
router.post('/login/mfa',
  strictLoginRateLimit,
  loginRateLimit,
  mfaRateLimit,
  verifyCaptcha,
  MfaController.loginMfa
);

// Login step-2 with backup code — same protection layering.
router.post('/login/mfa-backup',
  strictLoginRateLimit,
  loginRateLimit,
  mfaRateLimit,
  verifyCaptcha,
  MfaController.loginMfaBackup
);

export default router;
