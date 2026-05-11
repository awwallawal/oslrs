/**
 * Story 9-12 M8 (2026-05-11 session 8) — Route-level supertest coverage for
 * the magic-link endpoints inside `apps/api/src/routes/auth.routes.ts`.
 *
 * Covers:
 *   - POST /api/v1/auth/public/magic-link  (request + send)
 *   - GET  /api/v1/auth/magic              (PEEK ONLY, prefetcher-safe per C1)
 *   - POST /api/v1/auth/magic/consume      (atomic single-use consume)
 *
 * MagicLinkController + MagicLinkService run as real code; all other auth
 * controllers + middleware are pass-through stubs so this file isolates the
 * magic-link path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  mockIssueToken,
  mockPeekToken,
  mockRedeemToken,
  mockSendMagicLinkEmail,
  mockLogAction,
} = vi.hoisted(() => ({
  mockIssueToken: vi.fn(),
  mockPeekToken: vi.fn(),
  mockRedeemToken: vi.fn(),
  mockSendMagicLinkEmail: vi.fn(),
  mockLogAction: vi.fn(),
}));

// ── Middleware: pass-through ─────────────────────────────────────────────
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

// ── Stub the other auth controllers (loaded but not invoked) ─────────────
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
vi.mock('../../controllers/sms-otp.controller.js', () => ({
  SmsOtpController: {
    request: vi.fn(),
    verify: vi.fn(),
  },
}));

// ── MagicLinkService runs through these mocks ────────────────────────────
vi.mock('../../services/magic-link.service.js', () => ({
  MagicLinkService: {
    issueToken: mockIssueToken,
    peekToken: mockPeekToken,
    redeemToken: mockRedeemToken,
    consumeToken: mockRedeemToken,
    sendMagicLinkEmail: mockSendMagicLinkEmail,
  },
}));

vi.mock('../../services/audit.service.js', () => ({
  AuditService: { logAction: mockLogAction },
  AUDIT_ACTIONS: {
    MAGIC_LINK_ISSUED: 'magic_link.issued',
    MAGIC_LINK_REDEEMED: 'magic_link.redeemed',
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
// POST /api/v1/auth/public/magic-link
// ────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/public/magic-link', () => {
  it('returns 200 with sent=false on invalid email (anti-enumeration; never 4xx)', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/public/magic-link')
      .send({ email: 'not-an-email', purpose: 'login' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ sent: false, reason: 'invalid_input' });
    expect(mockIssueToken).not.toHaveBeenCalled();
  });

  it('returns 200 with sent=false on invalid purpose (anti-enumeration)', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/public/magic-link')
      .send({ email: 'awwal@example.com', purpose: 'not-a-purpose' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ sent: false, reason: 'invalid_input' });
  });

  it('returns 200 with sent=true on valid request; issues + sends; audits MAGIC_LINK_ISSUED', async () => {
    mockIssueToken.mockResolvedValueOnce({
      id: 'tok-new',
      tokenPlaintext: 'plain',
      expiresAt: new Date('2026-05-14T10:00:00Z'),
    });
    mockSendMagicLinkEmail.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .post('/api/v1/auth/public/magic-link')
      .send({ email: 'awwal@example.com', purpose: 'login' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ sent: true });
    expect(mockIssueToken).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'awwal@example.com', purpose: 'login' }),
    );
    expect(mockSendMagicLinkEmail).toHaveBeenCalled();
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'magic_link.issued' }),
    );
  });

  it('NEVER includes the plaintext token in the response (Architecture Decision 2.5)', async () => {
    mockIssueToken.mockResolvedValueOnce({
      id: 'tok-new',
      tokenPlaintext: 'super-secret-plaintext-do-not-leak',
      expiresAt: new Date('2026-05-14T10:00:00Z'),
    });
    mockSendMagicLinkEmail.mockResolvedValueOnce(undefined);
    const res = await request(buildApp())
      .post('/api/v1/auth/public/magic-link')
      .send({ email: 'awwal@example.com', purpose: 'wizard_resume' });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('super-secret-plaintext-do-not-leak');
  });
});

// ────────────────────────────────────────────────────────────────────────
// GET /api/v1/auth/magic — PEEK ONLY (C1 fix)
// ────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/magic (PEEK ONLY, C1)', () => {
  it('returns 400 MAGIC_LINK_INVALID when token query param is missing', async () => {
    const res = await request(buildApp()).get('/api/v1/auth/magic?purpose=login');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MAGIC_LINK_INVALID');
  });

  it('returns 400 MAGIC_LINK_INVALID when purpose query param is missing', async () => {
    const res = await request(buildApp()).get('/api/v1/auth/magic?token=good-token-here');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MAGIC_LINK_INVALID');
  });

  it('PEEKS (not consumes) on success; returns email + purpose + requiresConsume=true', async () => {
    mockPeekToken.mockResolvedValueOnce({
      id: 'tok-1',
      purpose: 'wizard_resume',
      email: 'awwal@example.com',
      userId: null,
      respondentId: null,
    });

    const res = await request(buildApp())
      .get('/api/v1/auth/magic?token=valid-token-here&purpose=wizard_resume');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      tokenId: 'tok-1',
      email: 'awwal@example.com',
      requiresConsume: true,
    });
    // Crucial: GET MUST NOT consume the token. RedeemToken should never fire.
    expect(mockRedeemToken).not.toHaveBeenCalled();
    expect(mockPeekToken).toHaveBeenCalledTimes(1);
  });

  it('does NOT audit MAGIC_LINK_REDEEMED on GET (peek is not redemption)', async () => {
    mockPeekToken.mockResolvedValueOnce({
      id: 'tok-2',
      purpose: 'login',
      email: 'awwal@example.com',
      userId: 'user-1',
      respondentId: null,
    });
    await request(buildApp()).get('/api/v1/auth/magic?token=valid-token-here&purpose=login');
    expect(mockLogAction).not.toHaveBeenCalled();
  });

  it('returns 400 MAGIC_LINK_EXPIRED on expired token (passthrough from peek)', async () => {
    const { AppError } = await import('@oslsr/utils');
    mockPeekToken.mockRejectedValueOnce(
      new AppError('MAGIC_LINK_EXPIRED', 'This magic link has expired', 400),
    );
    const res = await request(buildApp())
      .get('/api/v1/auth/magic?token=expired-token&purpose=login');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MAGIC_LINK_EXPIRED');
  });
});

// ────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/magic/consume — CONSUME (C1 fix)
// ────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/magic/consume (CONSUME, C1)', () => {
  it('returns 400 MAGIC_LINK_INVALID on malformed body', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/magic/consume')
      .send({ token: 'short' /* missing purpose */ });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MAGIC_LINK_INVALID');
  });

  it('atomically consumes + audits MAGIC_LINK_REDEEMED + returns the consumed token info', async () => {
    mockRedeemToken.mockResolvedValueOnce({
      id: 'tok-3',
      purpose: 'wizard_resume',
      email: 'awwal@example.com',
      userId: null,
      respondentId: null,
    });
    const res = await request(buildApp())
      .post('/api/v1/auth/magic/consume')
      .send({ token: 'valid-token-here', purpose: 'wizard_resume' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      tokenId: 'tok-3',
      email: 'awwal@example.com',
    });
    expect(mockRedeemToken).toHaveBeenCalledTimes(1);
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'magic_link.redeemed' }),
    );
  });

  it('returns 400 MAGIC_LINK_ALREADY_USED on a second consume of the same token', async () => {
    const { AppError } = await import('@oslsr/utils');
    mockRedeemToken.mockRejectedValueOnce(
      new AppError('MAGIC_LINK_ALREADY_USED', 'This magic link has already been used', 400),
    );
    const res = await request(buildApp())
      .post('/api/v1/auth/magic/consume')
      .send({ token: 'already-used-token', purpose: 'login' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MAGIC_LINK_ALREADY_USED');
  });
});
