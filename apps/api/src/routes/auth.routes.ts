import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { verifyCaptcha } from '../middleware/captcha.js';
import { loginRateLimit, refreshRateLimit } from '../middleware/login-rate-limit.js';
import { passwordResetRateLimit, passwordResetCompletionRateLimit } from '../middleware/password-reset-rate-limit.js';

const router = Router();

// Account activation (from Story 1.4)
router.post('/activate/:token', AuthController.activate);

// Staff login - rate limited + CAPTCHA protected
router.post('/staff/login',
  loginRateLimit,
  verifyCaptcha,
  AuthController.staffLogin
);

// Public user login - rate limited + CAPTCHA protected
router.post('/public/login',
  loginRateLimit,
  verifyCaptcha,
  AuthController.publicLogin
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
