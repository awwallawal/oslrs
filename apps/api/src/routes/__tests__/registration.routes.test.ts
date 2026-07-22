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
import { AppError } from '@oslsr/utils';

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
  mockGetPublicActiveForm,
  mockProvisionPublicUser,
  mockSendRegistrationAutoEmails,
  mockRunPostSubmissionSideEffects,
  mockLoggerWarn,
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
  mockGetPublicActiveForm: vi.fn(),
  mockProvisionPublicUser: vi.fn(),
  mockSendRegistrationAutoEmails: vi.fn(),
  mockRunPostSubmissionSideEffects: vi.fn(),
  // Story 13-23 (AC3) — spy the controller's pino logger so the loud
  // `wizard.form_binding_missing` fallback WARN is ASSERTED, not just visually
  // present in the log output. This is the story's keystone observability; a
  // silent removal must fail the suite (the 13-21 silent-fallback lesson).
  mockLoggerWarn: vi.fn(),
}));

// Story 13-23 (AC3) — the controller creates `const logger = pino(...)` at
// module load; mock pino so `logger.warn` is our spy. Mirrors the established
// controller-test pattern (export.controller.test.ts). Only warn is asserted;
// the rest are no-op sinks.
vi.mock('pino', () => ({
  default: () => ({ warn: mockLoggerWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
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
    MINOR_GUARDIAN_CONSENT_CAPTURED: 'minor.guardian_consent_captured',
  },
  // Story 9-34 — registration.controller.ts now reads AUDIT_TARGETS.RESPONDENT
  // for every audit emission (post-9-33 F1 constant-extraction). Explicit-
  // factory mocks must mirror the real audit.service.ts export shape; without
  // this entry, production code throws `Cannot read properties of undefined
  // (reading 'RESPONDENT')` and every wizard/supplemental route returns 500.
  // (Tests asserting `targetResource: 'respondent'` literal still match this
  // mock value — they're checking value contracts, not constant references.)
  AUDIT_TARGETS: {
    RESPONDENT: 'respondent',
  },
}));

// Story 9-58 — submitWizard mints a reference code (uniqueness SELECT via
// db.execute) before the tx. Mock it to a fixed code so the route tests don't
// need a db.execute stub + so the success response carries a deterministic code.
// Plain function (NOT vi.fn) so the beforeEach `vi.resetAllMocks()` can't wipe
// the return value back to undefined.
vi.mock('../../services/reference-code.service.js', () => ({
  ReferenceCodeService: {
    generateUnique: () => Promise.resolve('OSL-2026-TEST00'),
  },
}));

// Story 9-54 H1/NG1 — the wizard submit gate resolves the canonical pinned form
// via NativeFormService.getPublicActiveForm() (NOT the client draft). Partial-
// mock it; the real validateSubmissionCompleteness runs against whatever form
// this returns. Default (set in beforeEach) rejects → gate skipped, so every
// pre-existing wizard test keeps its prior behaviour.
vi.mock('../../services/native-form.service.js', () => ({
  NativeFormService: {
    getPublicActiveForm: mockGetPublicActiveForm,
  },
}));

// Story 9-38 — submitWizard provisions a passwordless public_user after the
// respondent commits. Mock the service so the route tests can assert it is
// called (account-when-email) + that the wizard survives a provisioning throw
// (non-fatal, AC#4). The real provisioning + audit is covered by the
// auth.service integration test.
vi.mock('../../services/auth.service.js', () => ({
  AuthService: {
    provisionPublicUserForWizard: mockProvisionPublicUser,
  },
}));

// Story 13-21 (AC2) — submitWizard fires the shared registration auto-send
// entrypoint after commit, because the public channel bypasses processSubmission
// (where the confirmation + thank-you live). Override ONLY that method so the
// route tests assert the CALL without actually sending. We preserve the module's
// OTHER exports via importActual — `form-submission-validation.service` imports
// `RESPONDENT_FIELD_MAP` from here, so a blanket mock would null it and break the
// wizard completeness gate. (The queues this module imports create their Redis
// connection lazily, so importActual opens nothing at import time.)
vi.mock('../../services/submission-processing.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/submission-processing.service.js')>(
    '../../services/submission-processing.service.js',
  );
  return {
    ...actual,
    SubmissionProcessingService: {
      sendRegistrationAutoEmails: mockSendRegistrationAutoEmails,
      // Story 13-27 — submitWizard now fires the SHARED post-submission
      // side-effects entrypoint (emails + consent-gated marketplace extraction),
      // superseding the direct sendRegistrationAutoEmails call.
      runPostSubmissionSideEffects: mockRunPostSubmissionSideEffects,
    },
  };
});

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
  // Story 9-54 — default: no public form pinned, so the completeness gate is
  // skipped (mirrors pre-H1 behaviour where the unmocked settings DB threw).
  // NG1 tests override this with a resolved form to exercise the real gate.
  // Story 13-21 — reject with the REAL AppError prod throws (was a plain Error,
  // which mis-logged as reason:'unknown'), so the test exercises the expected
  // warn-level `PUBLIC_FORM_NOT_CONFIGURED` path, not the new ERROR crash branch.
  mockGetPublicActiveForm.mockRejectedValue(
    new AppError('PUBLIC_FORM_NOT_CONFIGURED', 'No public-wizard form is currently configured.', 404),
  );
  // Story 9-38 — default: provisioning succeeds and links a new account.
  mockProvisionPublicUser.mockResolvedValue({ userId: 'user-prov-1', created: true });
  // Story 13-21 (AC2) — auto-send entrypoint is fire-and-forget (`void`); resolve.
  mockSendRegistrationAutoEmails.mockResolvedValue(undefined);
  // Story 13-27 (AC1) — shared post-submission side-effects entrypoint is fired
  // fire-and-forget (`void ...catch`); resolve so the .catch never triggers.
  mockRunPostSubmissionSideEffects.mockResolvedValue(undefined);
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

  it('Story 13-23 (AC1 root cause) — ACCEPTS a draft carrying `prefilledQuestionNames` (was silently 400ing)', async () => {
    // Step 4 stamps `prefilledQuestionNames` into the draft in the SAME
    // mergeFields call as `questionnaireFormId` (9-18 Part B). The field was
    // never added to the .strict() schema, so every post-Step-4 autosave 400'd —
    // silently dropping the form-id stamp for the whole public channel. It must
    // now round-trip through the draft PUT.
    mockWizardDraftsFindFirst.mockResolvedValueOnce(null);
    mockOnConflictReturning.mockResolvedValueOnce([
      {
        id: 'draft-pfn',
        currentStep: 4,
        lastUpdatedAt: new Date('2026-07-11T10:00:00Z'),
        expiresAt: new Date('2026-08-10T10:00:00Z'),
      },
    ]);
    const res = await request(buildApp())
      .put('/registration/draft')
      .send({
        email: 'awwal@example.com',
        currentStep: 4,
        formData: {
          email: 'awwal@example.com',
          questionnaireFormId: '019f48c2-0001-7000-8000-000000000001',
          questionnaireFormVersionId: '1.0.0',
          prefilledQuestionNames: ['full_name', 'email', 'phone'],
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('draft-pfn');
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
      // Relative future so the test never expires (was a hardcoded
      // 2026-06-10T09:00:00Z that lapsed on 2026-06-10).
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
      givenName: 'Awwal',
      familyName: 'Lawal',
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

  it('returns 400 INVALID_INPUT on missing required field (givenName)', async () => {
    const body = validBody();
    delete (body as Record<string, unknown>).givenName;
    const res = await request(buildApp()).post('/registration/wizard').send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WIZARD_SUBMIT_INVALID_INPUT');
  });

  it('Story 13-15 — ACCEPTS a well-formed NIN that fails Mod-11 (format-only, no checksum gate)', async () => {
    // 12345678901 is 11 digits but fails the RETIRED Modulus-11 check digit.
    // Real NINs carry no check digit (NIMC; 74% of prod NINs fail Mod-11), so
    // the server accepts any ^\d{11}$ NIN and proceeds to dup-check + insert.
    mockRespondentsFindFirst.mockResolvedValueOnce(null);
    mockTransactionImpl.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
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
              formData: { questionnaireFormId: '019f48c2-0001-7000-8000-000000000001' },
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
    expect(res.body.data).toMatchObject({ respondentId: 'resp-1', status: 'active' });
  });

  it('Story 13-15 — still rejects a malformed NIN (format guard retained)', async () => {
    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ nin: '1234567890' })); // 10 digits — not ^\d{11}$
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WIZARD_SUBMIT_INVALID_INPUT');
  });

  it('returns 409 NIN_DUPLICATE when supplied NIN already exists (no timestamp/source leak, MR-7)', async () => {
    mockRespondentsFindFirst.mockResolvedValueOnce({ id: 'resp-other' });
    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ nin: '12345678919' }));
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
              formData: { questionnaireFormId: '019f48c2-0001-7000-8000-000000000001' },
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
      .send(validBody({ nin: '12345678919' }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      respondentId: 'resp-1',
      status: 'active',
      pendingNin: false,
      // Story 9-58 (AC5.1 / AC9.2e) — the wizard success response echoes the
      // human-friendly reference code.
      referenceCode: 'OSL-2026-TEST00',
    });
    expect(mockLogActionTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'data.create' }),
    );
    // Story 13-27 (AC1/AC2) — the wizard fires the SHARED post-submission
    // side-effects entrypoint after commit (isNew:true + the minted reference code
    // + the normalised email + consentMarketplace + a real submissionId + gps:null),
    // so the public channel finally gets the confirmation + thank-you (13-21) AND a
    // marketplace profile (13-27) it never did. Supersedes the direct
    // sendRegistrationAutoEmails call.
    expect(mockRunPostSubmissionSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({
        respondentId: 'resp-1',
        email: 'awwal@example.com',
        referenceCode: 'OSL-2026-TEST00',
        isNew: true,
        consentMarketplace: true,
        gps: null,
        submissionId: expect.any(String),
      }),
    );
  });

  it('Story 13-21 — an UNEXPECTED validator crash is logged at ERROR but the submit still proceeds (no 500)', async () => {
    // A NON-AppError from the completeness gate must not sink the submit: it is
    // swallowed + logged at error level (wizard.completeness_error), then the
    // wizard proceeds with empty computed fields. Distinct from the expected
    // PUBLIC_FORM_NOT_CONFIGURED AppError (warn-level) default.
    mockGetPublicActiveForm.mockRejectedValueOnce(new Error('validator boom'));
    mockRespondentsFindFirst.mockResolvedValueOnce(null);
    mockTransactionImpl.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
      const respondentsInsertChain = {
        values: () => ({ returning: () => Promise.resolve([{ id: 'resp-crash', status: 'pending_nin_capture' }]) }),
      };
      const submissionsInsertChain = { values: () => Promise.resolve(undefined) };
      const tx = {
        query: { wizardDrafts: { findFirst: () => Promise.resolve({ createdAt: new Date('2026-07-10T00:00:00Z'), formData: {} }) } },
        insert: vi.fn().mockReturnValueOnce(respondentsInsertChain).mockReturnValueOnce(submissionsInsertChain),
        delete: () => ({ where: () => Promise.resolve() }),
        execute: vi.fn(),
      };
      return cb(tx);
    });
    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ pendingNin: true }));
    expect(res.status).toBe(201);
  });

  it('Story 13-1 (AC5.1) — merges campaign_source into submission raw_data from the draft extras', async () => {
    mockRespondentsFindFirst.mockResolvedValueOnce(null);
    const capturedSubmissionValues = vi.fn();
    mockTransactionImpl.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
      const respondentsInsertChain = {
        values: () => ({ returning: () => Promise.resolve([{ id: 'resp-1', status: 'active' }]) }),
      };
      const submissionsInsertChain = {
        values: (v: unknown) => {
          capturedSubmissionValues(v);
          return Promise.resolve(undefined);
        },
      };
      const tx = {
        query: {
          wizardDrafts: {
            findFirst: () =>
              Promise.resolve({
                createdAt: new Date('2026-05-20T07:00:00Z'),
                formData: {
                  questionnaireFormId: '019f48c2-0001-7000-8000-000000000001',
                  extras: { acquisition: { channel: 'Radio' }, utm: { source: 'facebook' } },
                },
              }),
          },
        },
        insert: vi.fn().mockReturnValueOnce(respondentsInsertChain).mockReturnValueOnce(submissionsInsertChain),
        delete: () => ({ where: () => Promise.resolve() }),
        execute: vi.fn(),
      };
      return cb(tx);
    });
    const res = await request(buildApp()).post('/registration/wizard').send(validBody({ nin: '12345678919' }));
    expect(res.status).toBe(201);
    expect(capturedSubmissionValues).toHaveBeenCalledWith(
      expect.objectContaining({
        rawData: expect.objectContaining({
          campaign_source: { channel: 'Radio', utm: { source: 'facebook' } },
        }),
      }),
    );
  });

  it('Story 13-1 (AC3.4) — OMITS campaign_source when the draft carries no attribution extras', async () => {
    mockRespondentsFindFirst.mockResolvedValueOnce(null);
    const capturedSubmissionValues = vi.fn();
    mockTransactionImpl.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
      const respondentsInsertChain = {
        values: () => ({ returning: () => Promise.resolve([{ id: 'resp-1', status: 'active' }]) }),
      };
      const submissionsInsertChain = {
        values: (v: unknown) => {
          capturedSubmissionValues(v);
          return Promise.resolve(undefined);
        },
      };
      const tx = {
        query: {
          wizardDrafts: {
            findFirst: () => Promise.resolve({ createdAt: new Date('2026-05-20T07:00:00Z'), formData: {} }),
          },
        },
        insert: vi.fn().mockReturnValueOnce(respondentsInsertChain).mockReturnValueOnce(submissionsInsertChain),
        delete: () => ({ where: () => Promise.resolve() }),
        execute: vi.fn(),
      };
      return cb(tx);
    });
    const res = await request(buildApp()).post('/registration/wizard').send(validBody({ nin: '12345678919' }));
    expect(res.status).toBe(201); // never blocks the submit (AC2.2/AC3.4)
    expect(capturedSubmissionValues.mock.calls[0][0]).not.toHaveProperty('rawData.campaign_source');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Story 9-38 — passwordless public_user provisioning after the wizard commit.
  // ──────────────────────────────────────────────────────────────────────

  /** Build a success transaction (respondents + submissions inserts). */
  function successWizardTx() {
    return async (cb: (tx: unknown) => unknown) => {
      const respondentsInsertChain = {
        values: () => ({ returning: () => Promise.resolve([{ id: 'resp-1', status: 'active' }]) }),
      };
      const submissionsInsertChain = { values: () => Promise.resolve(undefined) };
      const tx = {
        query: {
          wizardDrafts: {
            findFirst: () => Promise.resolve({ createdAt: new Date('2026-05-20T07:00:00Z'), formData: {} }),
          },
        },
        insert: vi.fn().mockReturnValueOnce(respondentsInsertChain).mockReturnValueOnce(submissionsInsertChain),
        delete: () => ({ where: () => Promise.resolve() }),
        execute: vi.fn(),
      };
      return cb(tx);
    };
  }

  it('provisions a passwordless public_user with the registrant email + full name (AC#1/#3)', async () => {
    mockRespondentsFindFirst.mockResolvedValueOnce(null);
    mockTransactionImpl.mockImplementationOnce(successWizardTx());
    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ givenName: 'Awwal', familyName: 'Lawal', email: 'Awwal@Example.com' }));
    expect(res.status).toBe(201);
    expect(mockProvisionPublicUser).toHaveBeenCalledTimes(1);
    expect(mockProvisionPublicUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'awwal@example.com', fullName: 'Awwal Lawal' }),
    );
  });

  it('does NOT provision an account when email is absent (400 before provisioning) (AC#8b)', async () => {
    const body = validBody();
    delete (body as Record<string, unknown>).email;
    const res = await request(buildApp()).post('/registration/wizard').send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WIZARD_SUBMIT_INVALID_INPUT');
    expect(mockProvisionPublicUser).not.toHaveBeenCalled();
  });

  it('still returns 201 when account provisioning throws (non-fatal, AC#4)', async () => {
    mockRespondentsFindFirst.mockResolvedValueOnce(null);
    mockTransactionImpl.mockImplementationOnce(successWizardTx());
    mockProvisionPublicUser.mockRejectedValueOnce(new Error('provision boom'));
    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ respondentId: 'resp-1', status: 'active' });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Story 9-54 NG1 (code-review follow-up) — the SERVER-side completeness gate
  // (AC5, hardened by H1) must reject an incomplete wizard submission against
  // the CANONICAL pinned form, independent of the client-stamped draft. The
  // pre-existing wizard tests skip this gate (no form pinned), so without these
  // two locks an H1/AC5 regression would ship silently.
  // ──────────────────────────────────────────────────────────────────────

  /** A pinned public form with a single required, non-NIN question. */
  function pinnedFormWithRequiredOccupation() {
    return {
      formId: '019f48c2-0002-7000-8000-000000000002',
      title: 'Public Survey',
      version: '1.0.0',
      questions: [
        {
          id: 'q-occ',
          type: 'text',
          name: 'occupation',
          label: 'Occupation',
          required: true,
          sectionId: 's1',
          sectionTitle: 'S1',
        },
      ],
      choiceLists: {},
      sectionShowWhen: {},
      calculations: [],
    };
  }

  it('NG1 — rejects an INCOMPLETE wizard submission (422 INCOMPLETE_SUBMISSION) against the canonical pinned form', async () => {
    // H1: the form is resolved server-side via getPublicActiveForm, NOT the
    // draft — so this fires even though no draft is set up for this request.
    mockGetPublicActiveForm.mockResolvedValueOnce(pinnedFormWithRequiredOccupation());

    const res = await request(buildApp())
      .post('/registration/wizard')
      // No questionnaireResponses → required `occupation` is missing. The gate
      // runs BEFORE any respondent/submission insert, so no tx mock is needed.
      .send(validBody({ pendingNin: true }));

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INCOMPLETE_SUBMISSION');
  });

  it('NG1 — a COMPLETE wizard submission passes the gate and persists the answer (201)', async () => {
    mockGetPublicActiveForm.mockResolvedValueOnce(pinnedFormWithRequiredOccupation());
    mockRespondentsFindFirst.mockResolvedValueOnce(null);
    let capturedRaw: Record<string, unknown> | undefined;
    mockTransactionImpl.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
      const respondentsInsertChain = {
        values: () => ({ returning: () => Promise.resolve([{ id: 'resp-ng1', status: 'active' }]) }),
      };
      const submissionsInsertChain = {
        values: (v: Record<string, unknown>) => {
          capturedRaw = v.rawData as Record<string, unknown>;
          return Promise.resolve(undefined);
        },
      };
      const tx = {
        query: {
          wizardDrafts: {
            findFirst: () => Promise.resolve({
              createdAt: new Date('2026-06-12T07:00:00Z'),
              formData: { questionnaireFormId: '019f48c2-0002-7000-8000-000000000002' },
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
      .send(validBody({ nin: '12345678919', questionnaireResponses: { occupation: 'tailor' } }));

    expect(res.status).toBe(201);
    expect(capturedRaw?.occupation).toBe('tailor');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Story 13-34 AC2 (code-review H1) — the public wizard renders with
  // `FormRenderer.suppressGeopoint`, so a geopoint question is never shown and
  // can never be answered by a public respondent. The controller must therefore
  // pass `excludeGeopoint` to the authoritative gate; otherwise a re-upload that
  // re-introduces a REQUIRED geopoint 422s every public registration over a
  // field nobody can see — a hard launch-blocking regression, and exactly the
  // scenario the client guard exists to survive. This test asserts the WIRING
  // (controller → gate), not just the service option.
  // ──────────────────────────────────────────────────────────────────────
  it('13-34 — a public wizard submission is NOT blocked by an unanswered REQUIRED geopoint on the pinned form', async () => {
    const form = pinnedFormWithRequiredOccupation();
    form.questions.push({
      id: 'q-gps',
      type: 'geopoint',
      name: 'gps_location',
      label: 'GPS Location',
      required: true,
      sectionId: 's1',
      sectionTitle: 'S1',
    });
    mockGetPublicActiveForm.mockResolvedValueOnce(form);
    mockRespondentsFindFirst.mockResolvedValueOnce(null);
    mockTransactionImpl.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        query: { wizardDrafts: { findFirst: () => Promise.resolve(null) } },
        insert: vi.fn()
          .mockReturnValueOnce({
            values: () => ({ returning: () => Promise.resolve([{ id: 'resp-gps', status: 'active' }]) }),
          })
          .mockReturnValueOnce({ values: () => Promise.resolve(undefined) }),
        delete: () => ({ where: () => Promise.resolve() }),
        execute: vi.fn(),
      };
      return cb(tx);
    });

    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ nin: '12345678920', questionnaireResponses: { occupation: 'tailor' } }));

    expect(res.status).toBe(201);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Story 9-55 — the minor age-gate + guardian consent, enforced server-side
  // at submitWizard against the canonical pinned form. Uses a dob that yields
  // a stable age < 15 against the real clock.
  // ──────────────────────────────────────────────────────────────────────

  /** A pinned form with an age calc + an age<15 guardian group. */
  function pinnedFormWithGuardianGroup() {
    const guardianQ = (name: string) => ({
      id: `q-${name}`,
      type: 'text',
      name,
      label: name,
      required: true,
      sectionId: 'grp_guardian',
      sectionTitle: 'Parent / Guardian Consent',
    });
    return {
      formId: '019f48c2-0003-7000-8000-000000000003',
      title: 'Public Survey',
      version: '1.0.0',
      questions: [
        { id: 'q-dob', type: 'date', name: 'dob', label: 'DOB', required: true, sectionId: 's1', sectionTitle: 'Identity' },
        guardianQ('guardian_name'),
        guardianQ('guardian_relationship'),
        guardianQ('guardian_phone'),
        guardianQ('guardian_consent'),
        guardianQ('is_supervised_apprentice'),
      ],
      choiceLists: {},
      sectionShowWhen: { grp_guardian: { field: 'age', operator: 'less_than', value: 15 } },
      calculations: [{ name: 'age', expression: 'int((today() - ${dob}) div 365.25)' }],
    };
  }

  // dob ~11 years ago — stays < 15 for years, robust to the real clock.
  const MINOR_DOB = '2015-01-01';
  const completeGuardianResponses = {
    guardian_name: 'Adunni Okafor',
    guardian_relationship: 'parent',
    guardian_phone: '08031234567',
    is_supervised_apprentice: 'yes',
  };

  it('9-55 — rejects an under-15 submission whose guardian DECLINED consent (422 MINOR_GUARDIAN_CONSENT_REQUIRED)', async () => {
    mockGetPublicActiveForm.mockResolvedValueOnce(pinnedFormWithGuardianGroup());

    const res = await request(buildApp())
      .post('/registration/wizard')
      // All guardian fields PRESENT (so generic completeness passes) but consent
      // is "no" — only the minor rule catches this.
      .send(
        validBody({
          pendingNin: true,
          questionnaireResponses: {
            dob: MINOR_DOB,
            ...completeGuardianResponses,
            guardian_consent: 'no',
          },
        }),
      );

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('MINOR_GUARDIAN_CONSENT_REQUIRED');
  });

  it('9-55 — a complete under-15 submission passes, persists metadata.guardian + writes the consent audit (201)', async () => {
    mockGetPublicActiveForm.mockResolvedValueOnce(pinnedFormWithGuardianGroup());
    mockRespondentsFindFirst.mockResolvedValueOnce(null);
    let capturedMetadata: Record<string, unknown> | undefined;
    mockTransactionImpl.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
      const respondentsInsertChain = {
        values: (v: Record<string, unknown>) => {
          capturedMetadata = v.metadata as Record<string, unknown>;
          return { returning: () => Promise.resolve([{ id: 'resp-minor', status: 'active' }]) };
        },
      };
      const submissionsInsertChain = { values: () => Promise.resolve(undefined) };
      const tx = {
        query: {
          wizardDrafts: {
            findFirst: () => Promise.resolve({
              createdAt: new Date('2026-06-12T07:00:00Z'),
              formData: { questionnaireFormId: '019f48c2-0003-7000-8000-000000000003' },
            }),
          },
        },
        insert: vi.fn().mockReturnValueOnce(respondentsInsertChain).mockReturnValueOnce(submissionsInsertChain),
        delete: () => ({ where: () => Promise.resolve() }),
        execute: vi.fn(),
      };
      return cb(tx);
    });

    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(
        validBody({
          nin: '12345678919',
          questionnaireResponses: { dob: MINOR_DOB, ...completeGuardianResponses, guardian_consent: 'yes' },
        }),
      );

    expect(res.status).toBe(201);
    expect(capturedMetadata?.guardian).toMatchObject({
      name: 'Adunni Okafor',
      relationship: 'parent',
      phone: '08031234567',
      consent: 'yes',
      isSupervisedApprentice: 'yes',
    });
    expect(mockLogActionTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'minor.guardian_consent_captured' }),
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
              formData: { questionnaireFormId: '019f48c2-0001-7000-8000-000000000001' },
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
      .send(validBody({ nin: '12345678919' }));
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
              formData: { questionnaireFormId: '019f48c2-0004-7000-8000-000000000004' },
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
        nin: '12345678919',
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
    expect(captured!.questionnaireFormId).toBe('019f48c2-0004-7000-8000-000000000004');

    const raw = captured!.rawData as Record<string, unknown>;
    expect(raw).toMatchObject({
      // 8 identity fields (snake_case for the s.raw_data->>'X' accessors)
      first_name: 'Awwal',
      last_name: 'Lawal',
      date_of_birth: '1990-01-01',
      phone_number: '+2348012345678',
      lga_id: 'lga-egbeda',
      nin: '12345678919',
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
              formData: { questionnaireFormId: '019f48c2-0005-7000-8000-000000000005' },
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
      .send(validBody({ nin: '12345678919' }));

    expect(respondentInsertAttempted).toBe(true); // respondent insert ran...
    expect(res.status).not.toBe(201);              // ...but no success returned
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Story 13-23 — the submission binds to the form UUID the wizard rendered,
  // via payload → server-resolved pin → draft → loud sentinel. Before this,
  // the server read the form id ONLY from the debounced best-effort draft (a
  // .strict() schema silently 400'd every post-Step-4 autosave since 9-18 Part
  // B), so the WHOLE public channel bound to `no-form-pinned-at-submit`.
  // ──────────────────────────────────────────────────────────────────────
  const PAYLOAD_FORM_UUID = '019f48c2-1111-7000-8000-000000000011';
  const SERVER_FORM_UUID = '019f48c2-2222-7000-8000-000000000022';
  const DRAFT_FORM_UUID = '019f48c2-3333-7000-8000-000000000033';
  const FORM_UNBOUND_SENTINEL = 'no-form-pinned-at-submit';

  /** Wire a tx that captures the submissions insert payload for assertion. */
  function captureSubmissionTx(
    draftFormData: Record<string, unknown>,
    capture: (v: Record<string, unknown>) => void,
  ) {
    mockRespondentsFindFirst.mockResolvedValueOnce(null);
    mockTransactionImpl.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
      const respondentsInsertChain = {
        values: () => ({ returning: () => Promise.resolve([{ id: 'resp-fb', status: 'active' }]) }),
      };
      const submissionsInsertChain = {
        values: (v: Record<string, unknown>) => {
          capture(v);
          return Promise.resolve(undefined);
        },
      };
      const tx = {
        query: {
          wizardDrafts: {
            findFirst: () =>
              Promise.resolve({ createdAt: new Date('2026-07-11T00:00:00Z'), formData: draftFormData }),
          },
        },
        insert: vi
          .fn()
          .mockReturnValueOnce(respondentsInsertChain)
          .mockReturnValueOnce(submissionsInsertChain),
        delete: () => ({ where: () => Promise.resolve() }),
        execute: vi.fn(),
      };
      return cb(tx);
    });
  }

  it('AC2 — binds to the PAYLOAD form UUID, overriding a stale draft value', async () => {
    let captured: Record<string, unknown> | undefined;
    captureSubmissionTx({ questionnaireFormId: DRAFT_FORM_UUID }, (v) => (captured = v));

    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ nin: '12345678919', questionnaireFormId: PAYLOAD_FORM_UUID }));

    expect(res.status).toBe(201);
    expect(captured!.questionnaireFormId).toBe(PAYLOAD_FORM_UUID);
  });

  it('AC2 — binds to the SERVER-RESOLVED pinned form when the payload is absent', async () => {
    // The completeness gate resolves the pinned form server-side; its UUID is the
    // authoritative backstop even with an empty draft + no payload id.
    mockGetPublicActiveForm.mockResolvedValueOnce({
      formId: SERVER_FORM_UUID,
      title: 'Public Survey',
      version: '1.0.0',
      questions: [],
      choiceLists: {},
      sectionShowWhen: {},
      calculations: [],
    });
    let captured: Record<string, unknown> | undefined;
    captureSubmissionTx({}, (v) => (captured = v));

    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ nin: '12345678919' }));

    expect(res.status).toBe(201);
    expect(captured!.questionnaireFormId).toBe(SERVER_FORM_UUID);
  });

  it('AC2 — falls back to the DRAFT form UUID (in-flight-draft back-compat) when payload + server pin are absent', async () => {
    // Default beforeEach: getPublicActiveForm rejects (no pin) → no server value.
    let captured: Record<string, unknown> | undefined;
    captureSubmissionTx({ questionnaireFormId: DRAFT_FORM_UUID }, (v) => (captured = v));

    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ nin: '12345678919' }));

    expect(res.status).toBe(201);
    expect(captured!.questionnaireFormId).toBe(DRAFT_FORM_UUID);
  });

  it('AC3 — stamps the loud sentinel (not a silent slug) when NO joinable form id is available', async () => {
    let captured: Record<string, unknown> | undefined;
    // No payload id, no server pin (default reject), draft carries no form id.
    captureSubmissionTx({}, (v) => (captured = v));

    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ nin: '12345678919' }));

    expect(res.status).toBe(201);
    expect(captured!.questionnaireFormId).toBe(FORM_UNBOUND_SENTINEL);
    // AC3 keystone — the sentinel MUST emit the loud, counted fallback WARN so a
    // future whole-channel regression is visible/alertable (not silently
    // sentinel'd as it was since 9-18 Part B). Asserting the log call means a
    // silent removal of the WARN fails the suite.
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'wizard.form_binding_missing',
        reason: 'no_public_form_pinned',
      }),
    );
  });

  it('AC3 — a bound (non-sentinel) submission does NOT emit the form_binding_missing WARN', async () => {
    // The keystone WARN must be specific to the unbound case — a healthy
    // payload-bound submission stays quiet, so the counter/alert is meaningful.
    let captured: Record<string, unknown> | undefined;
    captureSubmissionTx({ questionnaireFormId: DRAFT_FORM_UUID }, (v) => (captured = v));

    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ nin: '12345678919', questionnaireFormId: PAYLOAD_FORM_UUID }));

    expect(res.status).toBe(201);
    expect(captured!.questionnaireFormId).toBe(PAYLOAD_FORM_UUID);
    expect(mockLoggerWarn).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'wizard.form_binding_missing' }),
    );
  });

  it('AC2 — a non-UUID payload id is REJECTED at the schema (400), never persisted as a slug', async () => {
    const res = await request(buildApp())
      .post('/registration/wizard')
      .send(validBody({ nin: '12345678919', questionnaireFormId: 'oslsr_public_core_v1' }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WIZARD_SUBMIT_INVALID_INPUT');
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
