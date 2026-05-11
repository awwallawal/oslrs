/**
 * Story 9-12 M8 (2026-05-11 session 8) — Route-level supertest coverage for
 * the SMS OTP endpoints inside `apps/api/src/routes/auth.routes.ts`.
 *
 * Covers:
 *   - POST /api/v1/auth/public/sms-otp/request
 *   - POST /api/v1/auth/public/sms-otp/verify
 *
 * SmsOtpController + the `isSmsOtpEnabled` flag check run for real; the
 * adapter resolver + service are mocked. Other auth controllers + middleware
 * are pass-through stubs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  mockIsSmsOtpEnabled,
  mockRequestOtp,
  mockVerifyOtp,
} = vi.hoisted(() => ({
  mockIsSmsOtpEnabled: vi.fn(),
  mockRequestOtp: vi.fn(),
  mockVerifyOtp: vi.fn(),
}));

// Middleware passthrough.
vi.mock('../../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../middleware/captcha.js', () => ({
  verifyCaptcha: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../middleware/login-rate-limit.js', () => ({
  loginRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  strictLoginRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  refreshRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  isTestMode: () => true,
  shouldSkipRateLimit: () => true,
}));
vi.mock('../../middleware/mfa-rate-limit.js', () => ({
  mfaRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../middleware/require-fresh-reauth.js', () => ({
  requireFreshReAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../middleware/password-reset-rate-limit.js', () => ({
  passwordResetRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  passwordResetCompletionRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../middleware/registration-rate-limit.js', () => ({
  activationRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../middleware/reauth-rate-limit.js', () => ({
  reauthRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../middleware/magic-link-rate-limit.js', () => ({
  magicLinkRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

// Stub the other auth controllers (loaded but not invoked).
vi.mock('../../controllers/auth.controller.js', () => ({
  AuthController: {
    validateActivationToken: vi.fn(),
    activate: vi.fn(),
    staffLogin: vi.fn(),
    publicLogin: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    forgotPassword: vi.fn(),
    validateResetToken: vi.fn(),
    resetPassword: vi.fn(),
    reAuth: vi.fn(),
    me: vi.fn(),
  },
}));
vi.mock('../../controllers/mfa.controller.js', () => ({
  MfaController: {
    enroll: vi.fn(),
    verify: vi.fn(),
    disable: vi.fn(),
    regenerateCodes: vi.fn(),
    loginMfa: vi.fn(),
    loginMfaBackup: vi.fn(),
  },
}));
vi.mock('../../controllers/magic-link.controller.js', () => ({
  MagicLinkController: {
    requestMagicLink: vi.fn(),
    redeemMagicLink: vi.fn(),
    consumeMagicLink: vi.fn(),
  },
}));

// Real path: SmsOtpController + isSmsOtpEnabled flag.
vi.mock('../../services/sms-provider.adapter.js', () => ({
  isSmsOtpEnabled: mockIsSmsOtpEnabled,
}));
vi.mock('../../services/sms-otp.service.js', () => ({
  SmsOtpService: {
    requestOtp: mockRequestOtp,
    verifyOtp: mockVerifyOtp,
  },
}));

const { default: router } = await import('../auth.routes.js');

interface AppErrorLike { code: string; message: string; statusCode: number }
function isAppErrorLike(e: unknown): e is AppErrorLike {
  return !!e && typeof e === 'object' && 'code' in e && 'statusCode' in e;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', router);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (isAppErrorLike(err)) {
      res.status(err.statusCode).json({ status: 'error', code: err.code, message: err.message });
      return;
    }
    res.status(500).json({ status: 'error', code: 'INTERNAL', message: (err as Error).message });
  });
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/public/sms-otp/request
// ────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/public/sms-otp/request', () => {
  it('short-circuits with 503 SMS_OTP_DISABLED when the feature flag is off', async () => {
    mockIsSmsOtpEnabled.mockResolvedValueOnce(false);
    const res = await request(buildApp())
      .post('/api/v1/auth/public/sms-otp/request')
      .send({ phone: '+2348012345678' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SMS_OTP_DISABLED');
    expect(mockRequestOtp).not.toHaveBeenCalled();
  });

  it('returns 400 SMS_OTP_INVALID_INPUT on non-E.164 Nigerian phone format', async () => {
    mockIsSmsOtpEnabled.mockResolvedValueOnce(true);
    const res = await request(buildApp())
      .post('/api/v1/auth/public/sms-otp/request')
      .send({ phone: '08012345678' /* missing +234 prefix */ });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SMS_OTP_INVALID_INPUT');
  });

  it('returns 200 with expiresInSeconds on successful issue', async () => {
    mockIsSmsOtpEnabled.mockResolvedValueOnce(true);
    mockRequestOtp.mockResolvedValueOnce({ expiresInSeconds: 300 });
    const res = await request(buildApp())
      .post('/api/v1/auth/public/sms-otp/request')
      .send({ phone: '+2348012345678' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ expiresInSeconds: 300 });
    expect(mockRequestOtp).toHaveBeenCalledWith('+2348012345678');
  });

  it('returns 429 SMS_OTP_RATE_LIMITED when the per-phone throttle is engaged', async () => {
    mockIsSmsOtpEnabled.mockResolvedValueOnce(true);
    const { AppError } = await import('@oslsr/utils');
    mockRequestOtp.mockRejectedValueOnce(
      new AppError('SMS_OTP_RATE_LIMITED', 'A code was sent recently.', 429),
    );
    const res = await request(buildApp())
      .post('/api/v1/auth/public/sms-otp/request')
      .send({ phone: '+2348012345678' });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('SMS_OTP_RATE_LIMITED');
  });
});

// ────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/public/sms-otp/verify
// ────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/public/sms-otp/verify', () => {
  it('short-circuits with 503 SMS_OTP_DISABLED when the feature flag is off', async () => {
    mockIsSmsOtpEnabled.mockResolvedValueOnce(false);
    const res = await request(buildApp())
      .post('/api/v1/auth/public/sms-otp/verify')
      .send({ phone: '+2348012345678', code: '123456' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SMS_OTP_DISABLED');
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_INPUT on non-6-digit code', async () => {
    mockIsSmsOtpEnabled.mockResolvedValueOnce(true);
    const res = await request(buildApp())
      .post('/api/v1/auth/public/sms-otp/verify')
      .send({ phone: '+2348012345678', code: '12' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SMS_OTP_INVALID_INPUT');
  });

  it('returns 200 with verified:true on successful verification', async () => {
    mockIsSmsOtpEnabled.mockResolvedValueOnce(true);
    mockVerifyOtp.mockResolvedValueOnce({ verified: true });
    const res = await request(buildApp())
      .post('/api/v1/auth/public/sms-otp/verify')
      .send({ phone: '+2348012345678', code: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ verified: true });
    expect(mockVerifyOtp).toHaveBeenCalledWith('+2348012345678', '123456');
  });

  it('returns 400 SMS_OTP_INVALID when the code is wrong / expired', async () => {
    mockIsSmsOtpEnabled.mockResolvedValueOnce(true);
    const { AppError } = await import('@oslsr/utils');
    mockVerifyOtp.mockRejectedValueOnce(
      new AppError('SMS_OTP_INVALID', 'Invalid or expired code', 400),
    );
    const res = await request(buildApp())
      .post('/api/v1/auth/public/sms-otp/verify')
      .send({ phone: '+2348012345678', code: '999999' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SMS_OTP_INVALID');
  });
});
