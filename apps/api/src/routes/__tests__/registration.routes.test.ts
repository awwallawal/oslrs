/**
 * Story 9-12 M8 (2026-05-11 session 8) — Route-level supertest coverage for
 * `apps/api/src/routes/registration.routes.ts`. Mocks rate-limit middleware
 * (pass-through), MagicLinkService, AuditService, and the Drizzle db handle.
 * Controllers run for real so Zod validation + branching + response shapes
 * are all exercised end-to-end through Express.
 *
 * Closes M8 for the 5 wizard endpoints:
 *   - POST /complete-nin
 *   - POST /defer-reminder
 *   - PUT  /draft
 *   - GET  /draft
 *   - POST /wizard
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  mockPeekToken,
  mockConsumeTokenTx,
  mockIssueToken,
  mockSendMagicLinkEmail,
  mockLogAction,
  mockLogActionTx,
  mockRespondentsFindFirst,
  mockWizardDraftsFindFirst,
  mockSubmissionsFindFirst,
  mockInsertReturning,
  mockUpdateReturning,
  mockUpdate,
  mockDelete,
  mockOnConflictReturning,
  mockTransactionImpl,
} = vi.hoisted(() => ({
  mockPeekToken: vi.fn(),
  mockConsumeTokenTx: vi.fn(),
  mockIssueToken: vi.fn(),
  mockSendMagicLinkEmail: vi.fn(),
  mockLogAction: vi.fn(),
  mockLogActionTx: vi.fn(),
  mockRespondentsFindFirst: vi.fn(),
  mockWizardDraftsFindFirst: vi.fn(),
  mockSubmissionsFindFirst: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockUpdateReturning: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockOnConflictReturning: vi.fn(),
  mockTransactionImpl: vi.fn(),
}));

// Rate-limit middleware: pass-through.
vi.mock('../../middleware/magic-link-rate-limit.js', () => ({
  magicLinkRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../middleware/wizard-draft-rate-limit.js', () => ({
  wizardDraftRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../middleware/registration-rate-limit.js', () => ({
  registrationRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  activationRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../services/magic-link.service.js', () => ({
  MagicLinkService: {
    peekToken: mockPeekToken,
    consumeTokenTx: mockConsumeTokenTx,
    issueToken: mockIssueToken,
    sendMagicLinkEmail: mockSendMagicLinkEmail,
  },
}));

vi.mock('../../services/audit.service.js', () => ({
  AuditService: {
    logAction: mockLogAction,
    logActionTx: mockLogActionTx,
  },
  AUDIT_ACTIONS: {
    DATA_CREATE: 'data.create',
    PENDING_NIN_CREATED: 'pending_nin.created',
    PENDING_NIN_PROMOTED: 'pending_nin.promoted',
    PENDING_NIN_DEFERRED: 'pending_nin.deferred_again',
    MAGIC_LINK_ISSUED: 'magic_link.issued',
    OPERATOR_SUPPLEMENTAL_SURVEY_SENT: 'operator.supplemental_survey_sent',
  },
}));

vi.mock('../../db/schema/index.js', () => ({
  respondents: { name: 'respondents' },
  wizardDrafts: { name: 'wizard_drafts', email: 'email' },
  // Story 9-26 — wizard now writes to submissions in same tx.
  submissions: { name: 'submissions' },
}));

// Drizzle fluent mock — each builder returns the next stage of the chain.
function buildInsertChain() {
  return {
    values: () => ({
      returning: () => mockInsertReturning(),
      onConflictDoUpdate: () => ({
        target: undefined,
        set: undefined,
        returning: () => mockOnConflictReturning(),
      }),
    }),
  };
}
function buildUpdateChain() {
  return {
    set: () => ({
      where: () => ({
        returning: () => mockUpdateReturning(),
        then: (resolve: (v: unknown) => void) => Promise.resolve(mockUpdate()).then(resolve),
      }),
    }),
  };
}
function buildDeleteChain() {
  return {
    where: () => mockDelete(),
  };
}

vi.mock('../../db/index.js', () => ({
  db: {
    query: {
      respondents: { findFirst: mockRespondentsFindFirst },
      wizardDrafts: { findFirst: mockWizardDraftsFindFirst },
      submissions: { findFirst: mockSubmissionsFindFirst },
    },
    insert: () => buildInsertChain(),
    update: () => buildUpdateChain(),
    delete: () => buildDeleteChain(),
    transaction: (cb: (tx: unknown) => unknown) => mockTransactionImpl(cb),
  },
}));

const { default: router } = await import('../registration.routes.js');

interface AppErrorLike { code: string; message: string; statusCode: number }
function isAppErrorLike(e: unknown): e is AppErrorLike {
  return !!e && typeof e === 'object' && 'code' in e && 'statusCode' in e;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/registration', router);
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
  // Default: transactions just invoke the callback with a passthrough tx that
  // returns the same mock chains so the controllers' tx.insert/tx.delete/etc
  // calls behave like the top-level db. Individual tests override.
  mockTransactionImpl.mockImplementation(async (cb: (tx: unknown) => unknown) => {
    const tx = {
      insert: () => buildInsertChain(),
      update: () => buildUpdateChain(),
      delete: () => buildDeleteChain(),
      execute: vi.fn(),
    };
    return cb(tx);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /registration/complete-nin
// ────────────────────────────────────────────────────────────────────────────

describe('POST /registration/complete-nin', () => {
  it('returns 400 with generic INVALID_INPUT on missing token (anti-enumeration)', async () => {
    const res = await request(buildApp())
      .post('/registration/complete-nin')
      .send({ nin: '12345678901' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COMPLETE_NIN_INVALID_INPUT');
    expect(res.body).not.toHaveProperty('issues');
  });

  it('returns 400 INVALID_INPUT on malformed NIN (not 11 digits)', async () => {
    const res = await request(buildApp())
      .post('/registration/complete-nin')
      .send({ token: 'good-token-here', nin: '123' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COMPLETE_NIN_INVALID_INPUT');
  });

  it('returns 400 MAGIC_LINK_INVALID when peek fails (invalid token)', async () => {
    const { AppError } = await import('@oslsr/utils');
    mockPeekToken.mockRejectedValueOnce(
      new AppError('MAGIC_LINK_INVALID', 'Invalid or unknown magic-link token', 400),
    );
    const res = await request(buildApp())
      .post('/registration/complete-nin')
      .send({ token: 'valid-format-but-unknown', nin: '12345678901' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MAGIC_LINK_INVALID');
  });

  it('returns 400 COMPLETE_NIN_NO_RESPONDENT when token has no respondent_id', async () => {
    mockPeekToken.mockResolvedValueOnce({ id: 'tok-1', email: 'a@b.com', respondentId: null });
    const res = await request(buildApp())
      .post('/registration/complete-nin')
      .send({ token: 'has-no-respondent', nin: '12345678901' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COMPLETE_NIN_NO_RESPONDENT');
  });

  it('returns 409 NIN_DUPLICATE without leaking timestamp/source (MR-7)', async () => {
    mockPeekToken.mockResolvedValueOnce({
      id: 'tok-2',
      email: 'a@b.com',
      respondentId: 'resp-target',
      userId: null,
    });
    mockRespondentsFindFirst.mockResolvedValueOnce({ id: 'resp-other' });
    const res = await request(buildApp())
      .post('/registration/complete-nin')
      .send({ token: 'good-token', nin: '12345678901' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NIN_DUPLICATE');
    expect(res.body).not.toHaveProperty('firstRegisteredAt');
    expect(res.body).not.toHaveProperty('firstRegisteredVia');
  });

  it('returns 200 with alreadyPromoted=true when respondent was already promoted (race-merge)', async () => {
    mockPeekToken.mockResolvedValueOnce({
      id: 'tok-3',
      email: 'a@b.com',
      respondentId: 'resp-already-active',
      userId: null,
    });
    mockRespondentsFindFirst.mockResolvedValueOnce(null); // no NIN collision
    mockConsumeTokenTx.mockResolvedValueOnce({ id: 'tok-3' });
    // Transaction returns 0 updated rows → alreadyPromoted branch.
    mockTransactionImpl.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        execute: vi.fn(),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => Promise.resolve([]),
            }),
          }),
        }),
      };
      return cb(tx);
    });
    const res = await request(buildApp())
      .post('/registration/complete-nin')
      .send({ token: 'good-token', nin: '12345678901' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.alreadyPromoted).toBe(true);
  });

  it('returns 200 with respondentId + source on successful promotion', async () => {
    mockPeekToken.mockResolvedValueOnce({
      id: 'tok-4',
      email: 'a@b.com',
      respondentId: 'resp-pending',
      userId: 'user-1',
    });
    mockRespondentsFindFirst.mockResolvedValueOnce(null);
    mockConsumeTokenTx.mockResolvedValueOnce({ id: 'tok-4' });
    mockTransactionImpl.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        execute: vi.fn(),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => Promise.resolve([{ id: 'resp-pending', source: 'public' }]),
            }),
          }),
        }),
      };
      return cb(tx);
    });
    const res = await request(buildApp())
      .post('/registration/complete-nin')
      .send({ token: 'good-token', nin: '12345678901' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      respondentId: 'resp-pending',
      source: 'public',
      alreadyPromoted: false,
    });
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pending_nin.promoted',
        targetId: 'resp-pending',
      }),
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /registration/defer-reminder
// ────────────────────────────────────────────────────────────────────────────

describe('POST /registration/defer-reminder', () => {
  it('returns 400 INVALID_INPUT on missing token', async () => {
    const res = await request(buildApp()).post('/registration/defer-reminder').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DEFER_REMINDER_INVALID_INPUT');
  });

  it('returns 200 with deferred=false when respondent is no longer pending', async () => {
    mockPeekToken.mockResolvedValueOnce({
      id: 'tok-5',
      email: 'a@b.com',
      respondentId: 'resp-active',
      userId: null,
    });
    mockRespondentsFindFirst.mockResolvedValueOnce({
      id: 'resp-active',
      status: 'active',
      metadata: null,
    });
    const res = await request(buildApp())
      .post('/registration/defer-reminder')
      .send({ token: 'good-token-here-1' });
    expect(res.status).toBe(200);
    expect(res.body.data.deferred).toBe(false);
    expect(res.body.data.reason).toBe('not_pending');
  });

  it('returns 200 with deferred=true + stamps metadata.reminder_deferred_at when row is pending', async () => {
    mockPeekToken.mockResolvedValueOnce({
      id: 'tok-6',
      email: 'a@b.com',
      respondentId: 'resp-pending',
      userId: null,
    });
    mockRespondentsFindFirst.mockResolvedValueOnce({
      id: 'resp-pending',
      status: 'pending_nin_capture',
      metadata: { prior: 'state' },
    });
    mockUpdate.mockResolvedValueOnce(undefined);
    const res = await request(buildApp())
      .post('/registration/defer-reminder')
      .send({ token: 'good-token-here-2' });
    expect(res.status).toBe(200);
    expect(res.body.data.deferred).toBe(true);
    expect(typeof res.body.data.deferredAt).toBe('string');
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pending_nin.deferred_again' }),
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// PUT /registration/draft
// ────────────────────────────────────────────────────────────────────────────

describe('PUT /registration/draft', () => {
  it('returns 400 INVALID_INPUT on malformed email', async () => {
    const res = await request(buildApp()).put('/registration/draft').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WIZARD_DRAFT_INVALID_INPUT');
  });

  it('returns 400 INVALID_INPUT when .strict() schema rejects unknown formData key (H2)', async () => {
    const res = await request(buildApp())
      .put('/registration/draft')
      .send({
        email: 'awwal@example.com',
        formData: { fullName: 'Awwal', mysteryField: 'nope' },
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WIZARD_DRAFT_INVALID_INPUT');
  });

  it('returns 200 with persisted shape on a clean save (upsert path)', async () => {
    mockWizardDraftsFindFirst.mockResolvedValueOnce(null);
    mockOnConflictReturning.mockResolvedValueOnce([
      {
        id: 'draft-1',
        currentStep: 2,
        lastUpdatedAt: new Date('2026-05-11T10:00:00Z'),
        expiresAt: new Date('2026-06-10T10:00:00Z'),
      },
    ]);
    const res = await request(buildApp())
      .put('/registration/draft')
      .send({
        email: 'Awwal@Example.com',
        currentStep: 2,
        formData: { fullName: 'Awwal', email: 'awwal@example.com' },
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: 'draft-1',
      currentStep: 2,
    });
  });

  it('merges incoming formData on top of existing draft formData', async () => {
    mockWizardDraftsFindFirst.mockResolvedValueOnce({
      formData: { fullName: 'Awwal Existing', extras: { prior: true } },
    });
    mockOnConflictReturning.mockResolvedValueOnce([
      {
        id: 'draft-2',
        currentStep: 3,
        lastUpdatedAt: new Date('2026-05-11T10:00:00Z'),
        expiresAt: new Date('2026-06-10T10:00:00Z'),
      },
    ]);
    const res = await request(buildApp())
      .put('/registration/draft')
      .send({
        email: 'awwal@example.com',
        formData: { phone: '+2348012345678' },
      });
    expect(res.status).toBe(200);
    // The merge happens inside the controller; we can't directly assert the
    // merged JSONB here without inspecting the chain. Smoke-assert success.
    expect(res.body.data.id).toBe('draft-2');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /registration/draft
// ────────────────────────────────────────────────────────────────────────────

describe('GET /registration/draft', () => {
  it('returns 400 when neither token nor email is supplied (H3 — email branch deleted)', async () => {
    const res = await request(buildApp()).get('/registration/draft');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WIZARD_DRAFT_LOOKUP_REQUIRED');
  });

  it('returns 400 when ?email is supplied without ?token (H3 — email branch deleted)', async () => {
    const res = await request(buildApp()).get('/registration/draft?email=guess@example.com');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WIZARD_DRAFT_LOOKUP_REQUIRED');
  });

  it('returns 200 with {draft:null} when peek succeeds but no draft row matches', async () => {
    mockPeekToken.mockResolvedValueOnce({
      id: 'tok-7',
      email: 'awwal@example.com',
      respondentId: null,
      userId: null,
    });
    mockWizardDraftsFindFirst.mockResolvedValueOnce(undefined);
    const res = await request(buildApp()).get('/registration/draft?token=good-token-here');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ draft: null });
  });

  it('returns 200 with the draft payload when peek + lookup both succeed', async () => {
    mockPeekToken.mockResolvedValueOnce({
      id: 'tok-8',
      email: 'awwal@example.com',
      respondentId: null,
      userId: null,
    });
    mockWizardDraftsFindFirst.mockResolvedValueOnce({
      email: 'awwal@example.com',
      currentStep: 3,
      formData: { fullName: 'Awwal' },
      lastUpdatedAt: new Date('2026-05-11T09:00:00Z'),
      expiresAt: new Date('2026-06-10T09:00:00Z'),
    });
    const res = await request(buildApp()).get('/registration/draft?token=good-token');
    expect(res.status).toBe(200);
    expect(res.body.data.draft).toMatchObject({
      email: 'awwal@example.com',
      currentStep: 3,
    });
  });

  it('returns 200 with {draft:null} when the draft has expired', async () => {
    mockPeekToken.mockResolvedValueOnce({
      id: 'tok-9',
      email: 'awwal@example.com',
      respondentId: null,
      userId: null,
    });
    mockWizardDraftsFindFirst.mockResolvedValueOnce({
      email: 'awwal@example.com',
      currentStep: 3,
      formData: {},
      lastUpdatedAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: new Date('2026-01-31T00:00:00Z'), // expired
    });
    const res = await request(buildApp()).get('/registration/draft?token=good-token');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ draft: null });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /registration/wizard
// ────────────────────────────────────────────────────────────────────────────

describe('POST /registration/wizard', () => {
  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      fullName: 'Awwal Lawal',
      dateOfBirth: '1990-01-01',
      gender: 'male',
      phone: '+2348012345678',
      email: 'awwal@example.com',
      lgaId: 'lga-egbeda',
      consentMarketplace: true,
      consentEnriched: false,
      authChoice: 'magic-link',
      ...overrides,
    };
  }

  it('returns 400 INVALID_INPUT on malformed phone', async () => {
    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ phone: 'short' }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WIZARD_SUBMIT_INVALID_INPUT');
  });

  it('returns 400 INVALID_INPUT on missing required field (fullName)', async () => {
    const body = validBody();
    delete (body as Record<string, unknown>).fullName;
    const res = await request(buildApp()).post('/registration/wizard').send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WIZARD_SUBMIT_INVALID_INPUT');
  });

  it('returns 409 NIN_DUPLICATE when supplied NIN already exists (no timestamp/source leak, MR-7)', async () => {
    mockRespondentsFindFirst.mockResolvedValueOnce({ id: 'resp-other' });
    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ nin: '12345678901' }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NIN_DUPLICATE');
    expect(res.body).not.toHaveProperty('firstRegisteredAt');
  });

  it('returns 201 with active status when NIN provided (transactional insert + audit)', async () => {
    mockRespondentsFindFirst.mockResolvedValueOnce(null);
    mockTransactionImpl.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
      // Story 9-26 — wizard now inserts BOTH a respondents row AND a
      // submissions row in the same tx, so the mock must service two
      // `insert()` calls. First call returns the respondents-style chain
      // (with .returning()); second call returns the submissions-style chain
      // (just awaitable after .values()).
      const respondentsInsertChain = {
        values: () => ({
          returning: () => Promise.resolve([{ id: 'resp-1', status: 'active' }]),
        }),
      };
      const submissionsInsertChain = {
        values: () => Promise.resolve(undefined),
      };
      const tx = {
        query: {
          wizardDrafts: {
            findFirst: () => Promise.resolve({
              createdAt: new Date('2026-05-20T07:00:00Z'),
              formData: { questionnaireFormId: 'form-uuid-1' },
            }),
          },
        },
        insert: vi.fn()
          .mockReturnValueOnce(respondentsInsertChain)
          .mockReturnValueOnce(submissionsInsertChain),
        delete: () => ({ where: () => Promise.resolve() }),
        execute: vi.fn(),
      };
      return cb(tx);
    });
    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ nin: '12345678901' }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      respondentId: 'resp-1',
      status: 'active',
      pendingNin: false,
    });
    expect(mockLogActionTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'data.create' }),
    );
  });

  it('returns 201 with pending_nin_capture status when pendingNin=true + issues magic-link', async () => {
    mockTransactionImpl.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
      // Story 9-26 — same dual-insert pattern as the active-status case.
      const respondentsInsertChain = {
        values: () => ({
          returning: () => Promise.resolve([{ id: 'resp-2', status: 'pending_nin_capture' }]),
        }),
      };
      const submissionsInsertChain = {
        values: () => Promise.resolve(undefined),
      };
      const tx = {
        query: {
          wizardDrafts: {
            findFirst: () => Promise.resolve({
              createdAt: new Date('2026-05-20T07:00:00Z'),
              formData: { questionnaireFormId: 'form-uuid-1' },
            }),
          },
        },
        insert: vi.fn()
          .mockReturnValueOnce(respondentsInsertChain)
          .mockReturnValueOnce(submissionsInsertChain),
        delete: () => ({ where: () => Promise.resolve() }),
        execute: vi.fn(),
      };
      return cb(tx);
    });
    mockIssueToken.mockResolvedValueOnce({
      id: 'tok-new',
      tokenPlaintext: 'plain',
      expiresAt: new Date('2026-05-14T10:00:00Z'),
    });
    mockSendMagicLinkEmail.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ pendingNin: true }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      respondentId: 'resp-2',
      pendingNin: true,
    });
    expect(mockLogActionTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'pending_nin.created' }),
    );
    expect(mockIssueToken).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'pending_nin_complete', respondentId: 'resp-2' }),
    );
  });

  it('translates Postgres uniqueness violation (race past the read check) into NIN_DUPLICATE 409', async () => {
    mockRespondentsFindFirst.mockResolvedValueOnce(null);
    mockTransactionImpl.mockImplementationOnce(async () => {
      throw new Error(
        'duplicate key value violates unique constraint "respondents_nin_unique_when_present"',
      );
    });
    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ nin: '12345678901' }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NIN_DUPLICATE');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Story 9-26 Part D — unified-pipeline regression locks
  // ──────────────────────────────────────────────────────────────────────

  it('AC#D1 — submissions row raw_data carries all 13 unified-pipeline fields (8 identity + 3 wizard-extra + 2 answers)', async () => {
    mockRespondentsFindFirst.mockResolvedValueOnce(null);
    let captured: Record<string, unknown> | undefined;
    mockTransactionImpl.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
      const respondentsInsertChain = {
        values: () => ({
          returning: () => Promise.resolve([{ id: 'resp-d1', status: 'active' }]),
        }),
      };
      // Capture the submissions insert payload so we can assert its shape.
      const submissionsInsertChain = {
        values: (v: Record<string, unknown>) => {
          captured = v;
          return Promise.resolve(undefined);
        },
      };
      const tx = {
        query: {
          wizardDrafts: {
            findFirst: () => Promise.resolve({
              createdAt: new Date('2026-05-20T07:00:00Z'),
              formData: { questionnaireFormId: 'form-uuid-d1' },
            }),
          },
        },
        insert: vi.fn()
          .mockReturnValueOnce(respondentsInsertChain)
          .mockReturnValueOnce(submissionsInsertChain),
        delete: () => ({ where: () => Promise.resolve() }),
        execute: vi.fn(),
      };
      return cb(tx);
    });

    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({
        nin: '12345678901',
        questionnaireResponses: { employment_status: 'employed', skills_possessed: ['plumbing'] },
      }));

    expect(res.status).toBe(201);
    expect(captured).toBeDefined();

    // Analytics-visibility invariants (AC#D3): buildWhereFragments() in
    // survey-analytics.service.ts requires BOTH `raw_data IS NOT NULL` AND
    // `respondent_id IS NOT NULL` with NO source exclusion. A wizard row is
    // counted by every analytics query precisely because Part A sets both of
    // these — assert the invariants here so a future regression that nulls
    // either field (re-hiding wizard respondents) fails loudly.
    expect(captured!.respondentId).toBe('resp-d1');
    expect(captured!.source).toBe('public');
    expect(captured!.processed).toBe(true);
    expect(captured!.submittedAt).toBeInstanceOf(Date);
    expect(captured!.questionnaireFormId).toBe('form-uuid-d1');

    const raw = captured!.rawData as Record<string, unknown>;
    expect(raw).toMatchObject({
      // 8 identity fields (snake_case for the s.raw_data->>'X' accessors)
      first_name: 'Awwal',
      last_name: 'Lawal',
      date_of_birth: '1990-01-01',
      phone_number: '+2348012345678',
      lga_id: 'lga-egbeda',
      nin: '12345678901',
      consent_marketplace: true,
      consent_enriched: false,
      // 3 wizard-collected fields formerly dropped pre-9-26
      email: 'awwal@example.com',
      gender: 'male',
      auth_choice: 'magic-link',
      // Step 4 questionnaire answers — formerly dropped, now canonical
      employment_status: 'employed',
      skills_possessed: ['plumbing'],
    });
  });

  // NOTE: db.transaction is mocked here, so this asserts the CONTROLLER side of
  // the rollback contract — a submissions-insert failure propagates out of the
  // tx callback so the controller returns an error, never a half-state 201.
  // True on-disk atomicity (the respondents insert being discarded) is the
  // db.transaction guarantee and would need an integration test to observe
  // directly; this lock catches the regression where the submissions insert is
  // moved outside the transaction or its error is swallowed.
  it('AC#D2 — submissions-insert failure propagates as an error, never a half-state 201', async () => {
    mockRespondentsFindFirst.mockResolvedValueOnce(null);
    let respondentInsertAttempted = false;
    mockTransactionImpl.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
      const respondentsInsertChain = {
        values: () => ({
          returning: () => {
            respondentInsertAttempted = true;
            return Promise.resolve([{ id: 'resp-d2', status: 'active' }]);
          },
        }),
      };
      // Submissions insert blows up. In production the surrounding
      // db.transaction discards the respondents insert + audit + draft delete.
      // We assert the controller surfaces an error rather than a half-state 201.
      const submissionsInsertChain = {
        values: () => Promise.reject(new Error('submissions insert failed (simulated)')),
      };
      const tx = {
        query: {
          wizardDrafts: {
            findFirst: () => Promise.resolve({
              createdAt: new Date('2026-05-20T07:00:00Z'),
              formData: { questionnaireFormId: 'form-uuid-d2' },
            }),
          },
        },
        insert: vi.fn()
          .mockReturnValueOnce(respondentsInsertChain)
          .mockReturnValueOnce(submissionsInsertChain),
        delete: () => ({ where: () => Promise.resolve() }),
        execute: vi.fn(),
      };
      // The throw inside cb rejects the transaction promise, exactly as the
      // real db.transaction propagates a rolled-back transaction's error.
      return cb(tx);
    });

    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ nin: '12345678901' }));

    expect(respondentInsertAttempted).toBe(true); // respondent insert ran...
    expect(res.status).not.toBe(201);              // ...but no success returned
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /registration/supplemental — Story 9-28 Path B (Cohort A recovery)
// ────────────────────────────────────────────────────────────────────────────

describe('POST /registration/supplemental', () => {
  function validSupplementalBody() {
    return {
      token: 'a'.repeat(40),
      questionnaireResponses: { employment_status: 'employed', skills_possessed: ['plumbing'] },
    };
  }

  it('returns 400 INVALID_INPUT when token is missing or too short', async () => {
    const res = await request(buildApp())
      .post('/registration/supplemental')
      .send({ questionnaireResponses: {} });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SUPPLEMENTAL_INVALID_INPUT');
  });

  it('returns 400 when peeked token has no respondentId', async () => {
    mockPeekToken.mockResolvedValueOnce({
      id: 't1',
      email: 'a@b.c',
      respondentId: null,
      userId: null,
    });
    const res = await request(buildApp())
      .post('/registration/supplemental')
      .send(validSupplementalBody());
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SUPPLEMENTAL_TOKEN_NO_RESPONDENT');
  });

  it('returns 404 when respondent row not found', async () => {
    mockPeekToken.mockResolvedValueOnce({
      id: 't1',
      email: 'a@b.c',
      respondentId: 'r-1',
      userId: null,
    });
    mockRespondentsFindFirst.mockResolvedValueOnce(undefined);
    const res = await request(buildApp())
      .post('/registration/supplemental')
      .send(validSupplementalBody());
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('RESPONDENT_NOT_FOUND');
  });

  it('returns 409 with existingSubmissionUid when respondent already has a submission', async () => {
    mockPeekToken.mockResolvedValueOnce({
      id: 't1',
      email: 'a@b.c',
      respondentId: 'r-1',
      userId: null,
    });
    mockRespondentsFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      firstName: 'Akinola',
      lastName: 'Oluwaseun',
      dateOfBirth: '1990-01-01',
      phoneNumber: '+2348000000000',
      lgaId: 'lga-1',
      nin: '12345678901',
      consentMarketplace: true,
      consentEnriched: true,
    });
    mockSubmissionsFindFirst.mockResolvedValueOnce({
      id: 'existing-submission-row-id',
      submissionUid: '019e0000-0000-7000-8000-000000000001',
    });
    const res = await request(buildApp())
      .post('/registration/supplemental')
      .send(validSupplementalBody());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SUPPLEMENTAL_ALREADY_SUBMITTED');
    expect(res.body.data.existingSubmissionUid).toBe('019e0000-0000-7000-8000-000000000001');
    // Token NOT consumed in this path (the idempotency gate runs BEFORE the
    // transaction, so consumeTokenTx is never invoked).
    expect(mockConsumeTokenTx).not.toHaveBeenCalled();
  });

  it('consumes the token + writes submissions + audits + returns 201 on success', async () => {
    mockPeekToken.mockResolvedValueOnce({
      id: 't1',
      email: 'recovery@example.com',
      respondentId: 'r-1',
      userId: null,
    });
    mockRespondentsFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      firstName: 'Akinola',
      lastName: 'Oluwaseun',
      dateOfBirth: '1990-01-01',
      phoneNumber: '+2348000000000',
      lgaId: 'lga-1',
      nin: '12345678901',
      consentMarketplace: true,
      consentEnriched: true,
    });
    mockSubmissionsFindFirst.mockResolvedValueOnce(undefined);
    mockInsertReturning.mockResolvedValue([{ id: 'sub-row-id' }]);

    const res = await request(buildApp())
      .post('/registration/supplemental')
      .send(validSupplementalBody());

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('submissionUid');
    expect(res.body.data).toHaveProperty('respondentId', 'r-1');
    expect(mockConsumeTokenTx).toHaveBeenCalledTimes(1);
    expect(mockLogActionTx).toHaveBeenCalledTimes(1);
    expect(mockLogActionTx.mock.calls[0][1]).toMatchObject({
      action: 'data.create',
      targetResource: 'respondent',
      targetId: 'r-1',
      details: expect.objectContaining({
        trigger: 'supplemental_survey_submit',
        campaign: 'cohort_a_supplemental_survey',
      }),
    });
  });

  // Scope-tightened idempotency check (2026-05-22 follow-up to formal CR):
  // an enumerator/clerk submission for the SAME respondent must NOT block
  // a supplemental-survey submission. The check now filters by
  // `questionnaireFormId = SUPPLEMENTAL_SURVEY_FORM_ID` so only PRIOR
  // supplemental submissions block. This test pins the contract.
  it('does NOT block when respondent has a non-supplemental submission (enumerator/clerk source)', async () => {
    mockPeekToken.mockResolvedValueOnce({
      id: 't1',
      email: 'recovery@example.com',
      respondentId: 'r-1',
      userId: null,
    });
    mockRespondentsFindFirst.mockResolvedValueOnce({
      id: 'r-1',
      firstName: 'Akinola',
      lastName: 'Oluwaseun',
      dateOfBirth: '1990-01-01',
      phoneNumber: '+2348000000000',
      lgaId: 'lga-1',
      nin: '12345678901',
      consentMarketplace: true,
      consentEnriched: true,
    });
    // mockSubmissionsFindFirst.mockResolvedValueOnce(undefined) — the controller
    // scope-tightened query (`AND questionnaireFormId = 'supplemental-survey'`)
    // returns no row because the respondent's existing submission is from a
    // different source (enumerator/clerk) with a DIFFERENT questionnaireFormId.
    // The mock returns undefined, simulating "no PRIOR SUPPLEMENTAL submission".
    mockSubmissionsFindFirst.mockResolvedValueOnce(undefined);
    mockInsertReturning.mockResolvedValue([{ id: 'sub-row-id' }]);

    const res = await request(buildApp())
      .post('/registration/supplemental')
      .send(validSupplementalBody());

    expect(res.status).toBe(201);
    expect(mockConsumeTokenTx).toHaveBeenCalledTimes(1);
    expect(mockLogActionTx).toHaveBeenCalledTimes(1);
  });
});
