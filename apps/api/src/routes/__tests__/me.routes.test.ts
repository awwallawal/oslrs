/**
 * Story 9-38 (AC#10) — route-level coverage for `GET /me/registration-status`.
 * Mocks the authenticate middleware (inject req.user) + MeService; the
 * controller runs for real so the auth-guard + response shape are exercised.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { generateValidNin } from '@oslsr/testing/helpers/nin';

const {
  mockAuthenticate,
  mockGetRegistrationStatus,
  mockUpdateMarketplaceConsent,
  mockGetEditableRegistration,
  mockUpdateRegistrationFromWizard,
  mockCompleteNinAuthenticated,
} = vi.hoisted(() => ({
  mockAuthenticate: vi.fn(),
  mockGetRegistrationStatus: vi.fn(),
  mockUpdateMarketplaceConsent: vi.fn(),
  mockGetEditableRegistration: vi.fn(),
  mockUpdateRegistrationFromWizard: vi.fn(),
  mockCompleteNinAuthenticated: vi.fn(),
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticate: (req: express.Request, res: express.Response, next: express.NextFunction) =>
    mockAuthenticate(req, res, next),
}));

vi.mock('../../services/me.service.js', () => ({
  MeService: {
    getRegistrationStatus: mockGetRegistrationStatus,
    updateMarketplaceConsent: mockUpdateMarketplaceConsent,
    getEditableRegistration: mockGetEditableRegistration,
    updateRegistrationFromWizard: mockUpdateRegistrationFromWizard,
    completeNinAuthenticated: mockCompleteNinAuthenticated,
  },
}));

const { default: router } = await import('../me.routes.js');

interface AppErrorLike { code: string; statusCode: number; message: string }
function isAppErrorLike(e: unknown): e is AppErrorLike {
  return !!e && typeof e === 'object' && 'code' in e && 'statusCode' in e;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/me', router);
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

describe('GET /me/registration-status', () => {
  it('returns 200 with the caller-own registration state when authenticated', async () => {
    mockAuthenticate.mockImplementation((req: express.Request, _res: unknown, next: () => void) => {
      (req as unknown as { user: unknown }).user = { sub: 'user-1', email: 'me@example.com', role: 'public_user' };
      next();
    });
    mockGetRegistrationStatus.mockResolvedValueOnce({
      state: 'complete',
      respondent: { id: 'resp-1', status: 'active', lgaId: 'lga-egbeda', ninStatus: 'provided', consentMarketplace: true, referenceCode: 'OSL-2026-AAA111' },
    });

    const res = await request(buildApp()).get('/me/registration-status');
    expect(res.status).toBe(200);
    expect(res.body.data.state).toBe('complete');
    expect(mockGetRegistrationStatus).toHaveBeenCalledWith({ userId: 'user-1', email: 'me@example.com' });
  });

  it('returns 401 when the request is unauthenticated', async () => {
    mockAuthenticate.mockImplementation((_req: unknown, _res: unknown, next: (e?: unknown) => void) => {
      next({ code: 'AUTH_REQUIRED', statusCode: 401, message: 'Authentication required' });
    });
    const res = await request(buildApp()).get('/me/registration-status');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
    expect(mockGetRegistrationStatus).not.toHaveBeenCalled();
  });
});

describe('PUT /me/registration (Story 9-40 AC#4)', () => {
  function authAs(user: Record<string, unknown>) {
    mockAuthenticate.mockImplementation((req: express.Request, _res: unknown, next: () => void) => {
      (req as unknown as { user: unknown }).user = user;
      next();
    });
  }

  it('updates marketplace consent and returns the refreshed summary', async () => {
    authAs({ sub: 'user-1', email: 'me@example.com', role: 'public_user' });
    mockUpdateMarketplaceConsent.mockResolvedValueOnce({
      id: 'resp-1',
      status: 'active',
      lgaId: 'lga-egbeda',
      ninStatus: 'provided',
      consentMarketplace: true,
      referenceCode: 'OSL-2026-AAA111',
    });

    const res = await request(buildApp())
      .put('/me/registration')
      .send({ consentMarketplace: true });

    expect(res.status).toBe(200);
    expect(res.body.data.consentMarketplace).toBe(true);
    expect(mockUpdateMarketplaceConsent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', consentMarketplace: true }),
    );
  });

  it('returns 400 when consentMarketplace is missing or not a boolean', async () => {
    authAs({ sub: 'user-1', email: 'me@example.com', role: 'public_user' });
    const res = await request(buildApp()).put('/me/registration').send({ consentMarketplace: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockUpdateMarketplaceConsent).not.toHaveBeenCalled();
  });

  it('propagates NO_REGISTRATION (404) from the service', async () => {
    authAs({ sub: 'user-1', email: 'me@example.com', role: 'public_user' });
    mockUpdateMarketplaceConsent.mockRejectedValueOnce({
      code: 'NO_REGISTRATION',
      statusCode: 404,
      message: 'No registration is linked to your account yet.',
    });
    const res = await request(buildApp()).put('/me/registration').send({ consentMarketplace: true });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NO_REGISTRATION');
  });
});

function authAsUser(user: Record<string, unknown>) {
  mockAuthenticate.mockImplementation((req: express.Request, _res: unknown, next: () => void) => {
    (req as unknown as { user: unknown }).user = user;
    next();
  });
}

const PUBLIC_USER = { sub: 'user-1', email: 'me@example.com', role: 'public_user' };

describe('GET /me/registration (Story 9-61 AC#1)', () => {
  it('returns the caller editable registration', async () => {
    authAsUser(PUBLIC_USER);
    mockGetEditableRegistration.mockResolvedValueOnce({
      mode: 'edit',
      respondentId: 'resp-1',
      wizardData: { givenName: 'Ada', phone: '+2348012345678', email: 'me@example.com', lgaId: 'lga-egbeda', consentMarketplace: true },
    });
    const res = await request(buildApp()).get('/me/registration');
    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('edit');
    expect(mockGetEditableRegistration).toHaveBeenCalledWith({ userId: 'user-1', email: 'me@example.com' });
  });
});

describe('PUT /me/registration/wizard (Story 9-61 AC#2)', () => {
  const validEdit = {
    givenName: 'Ada',
    phone: '+2348012345678',
    email: 'me@example.com',
    lgaId: 'lga-egbeda',
    consentMarketplace: true,
    pendingNin: true, // omit NIN → no checksum needed for this route-shape test
  };

  it('validates with the shared wizard schema and edits the caller registration', async () => {
    authAsUser(PUBLIC_USER);
    mockUpdateRegistrationFromWizard.mockResolvedValueOnce({ state: 'pending_nin' });
    const res = await request(buildApp()).put('/me/registration/wizard').send(validEdit);
    expect(res.status).toBe(200);
    expect(mockUpdateRegistrationFromWizard).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', data: expect.objectContaining({ givenName: 'Ada' }) }),
    );
  });

  it('rejects an invalid payload with 400 (shared schema)', async () => {
    authAsUser(PUBLIC_USER);
    const res = await request(buildApp()).put('/me/registration/wizard').send({ givenName: 'A' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WIZARD_EDIT_INVALID_INPUT');
    expect(mockUpdateRegistrationFromWizard).not.toHaveBeenCalled();
  });
});

describe('POST /me/registration/complete-nin (Story 9-61 AC#3)', () => {
  it('completes the NIN in-session for an authenticated caller', async () => {
    authAsUser(PUBLIC_USER);
    const nin = generateValidNin();
    mockCompleteNinAuthenticated.mockResolvedValueOnce({ state: 'complete' });
    const res = await request(buildApp()).post('/me/registration/complete-nin').send({ nin });
    expect(res.status).toBe(200);
    expect(mockCompleteNinAuthenticated).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', email: 'me@example.com', nin }),
    );
  });

  it('Story 13-15 — accepts a well-formed NIN that fails Mod-11 (format-only)', async () => {
    // 12345678901 fails the RETIRED Modulus-11 checksum — real NINs carry no
    // check digit, so any ^\d{11}$ input reaches the service.
    authAsUser(PUBLIC_USER);
    mockCompleteNinAuthenticated.mockResolvedValueOnce({ state: 'complete' });
    const res = await request(buildApp()).post('/me/registration/complete-nin').send({ nin: '12345678901' });
    expect(res.status).toBe(200);
    expect(mockCompleteNinAuthenticated).toHaveBeenCalledWith(
      expect.objectContaining({ nin: '12345678901' }),
    );
  });

  it('rejects a malformed NIN with 400 (format guard retained)', async () => {
    authAsUser(PUBLIC_USER);
    const res = await request(buildApp()).post('/me/registration/complete-nin').send({ nin: '1234567890' }); // 10 digits
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COMPLETE_NIN_INVALID_INPUT');
    expect(mockCompleteNinAuthenticated).not.toHaveBeenCalled();
  });
});
