import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { verifyCaptcha } from '../middleware/captcha.js';
import { loginRateLimit, strictLoginRateLimit, refreshRateLimit } from '../middleware/login-rate-limit.js';
import { passwordResetRateLimit, passwordResetCompletionRateLimit } from '../middleware/password-reset-rate-limit.js';
import { registrationRateLimit, resendVerificationRateLimit, verifyEmailRateLimit } from '../middleware/registration-rate-limit.js';

const router = Router();

// Account activation (from Story 1.4)
router.post('/activate/:token', AuthController.activate);

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

export default router;
