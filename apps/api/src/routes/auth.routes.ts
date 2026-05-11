import { Router, type RequestHandler } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { MfaController } from '../controllers/mfa.controller.js';
import { MagicLinkController } from '../controllers/magic-link.controller.js';
import { SmsOtpController } from '../controllers/sms-otp.controller.js';
import { authenticate } from '../middleware/auth.js';
import { verifyCaptcha } from '../middleware/captcha.js';
import { loginRateLimit, strictLoginRateLimit, refreshRateLimit } from '../middleware/login-rate-limit.js';
import { mfaRateLimit } from '../middleware/mfa-rate-limit.js';
import { requireFreshReAuth } from '../middleware/require-fresh-reauth.js';
import { passwordResetRateLimit, passwordResetCompletionRateLimit } from '../middleware/password-reset-rate-limit.js';
// Story 9-12 Task 10.3 (2026-05-11 session 8) — `resendVerificationRateLimit`,
// `verifyEmailRateLimit`, and `registrationRateLimit` (the auth-route consumer
// of it) deleted alongside the legacy verification routes. `registrationRateLimit`
// the middleware itself lives on in `registration-rate-limit.ts` and is used by
// `/registration/wizard` via `registration.routes.ts`. `activationRateLimit`
// retained here for the /activate routes.
import { activationRateLimit } from '../middleware/registration-rate-limit.js';
import { reauthRateLimit } from '../middleware/reauth-rate-limit.js';
import { magicLinkRateLimit } from '../middleware/magic-link-rate-limit.js';
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

// Story 9-12 Task 10.1 — Google OAuth retired per ADR-015 rewrite. Magic-link
// is the primary public-auth channel; Google OAuth was deemed misleading
// (NDPA confound — read as government-Google partnership claim) and removed.
// The route stays mounted to return a structured 404 so any in-flight
// frontend bundles get a deterministic failure rather than a network error.
// Code review L7 (2026-05-11) — rate-limit the 404 too so it can't be pounded.
router.post('/google/verify', magicLinkRateLimit, (_req, res) => {
  res.status(404).json({
    code: 'GOOGLE_OAUTH_RETIRED',
    message:
      'Google sign-in has been retired. Please use email + password, or request a magic link.',
  });
});

// Story 9-12 Task 10.3 (2026-05-11 session 8) — Legacy hybrid Magic-Link/OTP
// registration flow retired in favour of the wizard at /api/v1/registration/wizard.
// Routes removed:
//   - POST /public/register
//   - GET  /verify-email/:token
//   - POST /verify-otp
//   - POST /resend-verification
// Existing public_users continue to use /public/login (email + password).
// Magic-link primary auth path lives below (/public/magic-link + /magic + /magic/consume).

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
// Story 9-9 AC#4 (2026-05-10): added reauthRateLimit (5/IP/15min) — defense-in-depth
// against password brute-force from a stolen-token holder. See reauth-rate-limit.ts.
router.post('/reauth',
  authenticate,
  reauthRateLimit,
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

// ---------------------------------------------------------------------------
// Story 9-12 — Public Wizard magic-link auth endpoints
// ---------------------------------------------------------------------------

// POST /api/v1/auth/public/magic-link — request a magic link by email + purpose.
// Per-email rate limited (3/hour) per NFR4.4 password-reset budget pool.
// Returns 200 always (anti-enumeration); abuse is gated by the limiter.
router.post('/public/magic-link',
  magicLinkRateLimit,
  MagicLinkController.requestMagicLink
);

// GET /api/v1/auth/magic?token=<plaintext>&purpose=<purpose>
// Code review C1 (2026-05-11) — GET is PEEK-ONLY now. Email-link prefetchers
// would otherwise burn legitimate users' tokens before they click. Token
// consume happens via POST /auth/magic/consume below, driven by an explicit
// Confirm action on the frontend resume page.
router.get('/magic',
  MagicLinkController.redeemMagicLink
);

// POST /api/v1/auth/magic/consume — body { token, purpose }
// Atomically consumes the token (single-use). Audit-logged.
router.post('/magic/consume',
  magicLinkRateLimit,
  MagicLinkController.consumeMagicLink
);

// ---------------------------------------------------------------------------
// Story 9-12 AC#7 — SMS OTP infra-only / feature-flagged off by default.
// Both endpoints short-circuit with 503 SMS_OTP_DISABLED when
// `auth.sms_otp_enabled` is false in system_settings (the default).
// Per-IP rate limit (cloned from magic-link) caps abuse at the edge.
// ---------------------------------------------------------------------------
router.post('/public/sms-otp/request',
  magicLinkRateLimit,
  SmsOtpController.request
);

router.post('/public/sms-otp/verify',
  magicLinkRateLimit,
  SmsOtpController.verify
);

export default router;
