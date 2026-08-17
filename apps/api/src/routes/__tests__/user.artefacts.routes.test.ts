/**
 * Story 13-59 (AC5, AC7, AC8) — route-level coverage for the two artefacts
 * activation now leaves in a staff member's hands.
 *
 * Mirrors the `me.routes.test.ts` harness: the authenticate middleware is
 * mocked to inject the principal EXACTLY as production does — under `.sub`,
 * per `packages/types/src/auth.ts` — and the real controller runs behind it.
 *
 * ⚠️ That single detail is why this file exists. `GET /users/id-card` read
 * `.userId` and therefore 401'd for every authenticated caller in production;
 * a test that injected `.userId` to "make it work" would have passed forever
 * over a dead endpoint. The principal shape here is not a convenience, it is
 * the assertion.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  mockAuthenticate,
  mockFindFirst,
  mockGetPhotoBuffer,
  mockGenerateIDCard,
  mockRecordDownload,
  mockGetArtefactState,
  mockRenderBriefingPdf,
} = vi.hoisted(() => ({
  mockAuthenticate: vi.fn(),
  mockFindFirst: vi.fn(),
  mockGetPhotoBuffer: vi.fn(),
  mockGenerateIDCard: vi.fn(),
  mockRecordDownload: vi.fn(),
  mockGetArtefactState: vi.fn(),
  mockRenderBriefingPdf: vi.fn(),
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticate: (req: express.Request, res: express.Response, next: express.NextFunction) =>
    mockAuthenticate(req, res, next),
}));
vi.mock('../../middleware/sensitive-action.js', () => ({
  requireFreshReAuthExceptPasswordless: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));
vi.mock('../../middleware/rate-limit.js', () => ({
  publicVerificationRateLimit: (_r: unknown, _s: unknown, n: () => void) => n(),
  profileUpdateRateLimit: (_r: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../../db/index.js', () => ({
  db: { query: { users: { findFirst: mockFindFirst } } },
}));
vi.mock('../../services/photo-processing.service.js', () => ({
  PhotoProcessingService: class {
    getPhotoBuffer = mockGetPhotoBuffer;
    getSignedUrl = vi.fn();
    processLiveSelfie = vi.fn();
  },
}));
vi.mock('../../services/id-card.service.js', () => ({
  IDCardService: class {
    generateIDCard = mockGenerateIDCard;
  },
}));
vi.mock('../../services/field-briefing.service.js', () => ({
  renderBriefingPdf: mockRenderBriefingPdf,
}));
vi.mock('../../services/staff-artefacts.service.js', () => ({
  recordArtefactDownload: mockRecordDownload,
  getStaffArtefactState: mockGetArtefactState,
}));

const { userRoutes } = await import('../user.routes.js');

interface AppErrorLike { code: string; statusCode: number; message: string }
function isAppErrorLike(e: unknown): e is AppErrorLike {
  return !!e && typeof e === 'object' && 'code' in e && 'statusCode' in e;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/users', userRoutes);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (isAppErrorLike(err)) {
      res.status(err.statusCode).json({ status: 'error', code: err.code, message: err.message });
      return;
    }
    res.status(500).json({ status: 'error', code: 'INTERNAL', message: (err as Error).message });
  });
  return app;
}

/** Inject the principal the way the real middleware does: under `.sub`. */
function authenticateAs(userId: string) {
  mockAuthenticate.mockImplementation(
    (req: express.Request, _res: unknown, next: () => void) => {
      (req as unknown as { user: unknown }).user = {
        sub: userId,
        email: 'officer@example.com',
        role: 'enumerator',
      };
      next();
    },
  );
}

const PDF_BYTES = Buffer.from('%PDF-1.3\n%fake-card\n%%EOF');

beforeEach(() => {
  vi.resetAllMocks();
  mockRecordDownload.mockResolvedValue(undefined);
});

describe('GET /users/id-card — the endpoint the modal is built on (AC5.4)', () => {
  /**
   * ⛔ THE REGRESSION LOCK. This test fails against the pre-13-59 controller,
   * which read `.userId` and returned 401 for a perfectly valid session. It is
   * the whole reason AC8.1 says the assertion must be "the PDF opens" and not
   * "the button is there".
   */
  it('serves the PDF to an authenticated caller — it does NOT 401', async () => {
    authenticateAs('user-1');
    mockFindFirst.mockResolvedValue({
      id: 'user-1',
      fullName: 'Adewale Johnson',
      phone: '+2348012345678',
      liveSelfieIdCardUrl: 'staff-photos/id-card/user-1.jpg',
      role: { name: 'enumerator' },
      lga: { name: 'Ibadan North' },
    });
    mockGetPhotoBuffer.mockResolvedValue(Buffer.from('jpeg'));
    mockGenerateIDCard.mockResolvedValue(PDF_BYTES);

    const res = await request(buildApp()).get('/users/id-card');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    // AC8.1 — "the PDF opens". A body that does not start with %PDF is not one.
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('AC5.3 — refuses rather than serving a card with an empty photo box', async () => {
    authenticateAs('user-1');
    mockFindFirst.mockResolvedValue({
      id: 'user-1',
      fullName: 'No Photo',
      phone: null,
      liveSelfieIdCardUrl: null, // 13-60's swallow leaves this NULL
      role: { name: 'enumerator' },
      lga: null,
    });

    const res = await request(buildApp()).get('/users/id-card');

    expect(res.status).toBe(400);
    // A specific code, so the client never has to string-match a message.
    expect(res.body.code).toBe('ID_CARD_PHOTO_MISSING');
    expect(mockGenerateIDCard).not.toHaveBeenCalled();
    // Nothing was delivered, so nothing may be recorded as delivered.
    expect(mockRecordDownload).not.toHaveBeenCalled();
  });

  it('AC7.2 — records the download, keyed to the person who took it', async () => {
    authenticateAs('user-1');
    mockFindFirst.mockResolvedValue({
      id: 'user-1',
      fullName: 'Adewale Johnson',
      phone: null,
      liveSelfieIdCardUrl: 'staff-photos/id-card/user-1.jpg',
      role: { name: 'enumerator' },
      lga: null,
    });
    mockGetPhotoBuffer.mockResolvedValue(Buffer.from('jpeg'));
    mockGenerateIDCard.mockResolvedValue(PDF_BYTES);

    await request(buildApp()).get('/users/id-card');

    expect(mockRecordDownload).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', kind: 'id_card' }),
    );
  });

  it('still 401s when there is genuinely no principal', async () => {
    mockAuthenticate.mockImplementation(
      (_req: express.Request, _res: unknown, next: () => void) => next(),
    );

    const res = await request(buildApp()).get('/users/id-card');
    expect(res.status).toBe(401);
  });
});

describe('GET /users/field-briefing (AC5.1)', () => {
  /** The caller row the staff gate reads (review L1). */
  function callerIs(roleName: string) {
    mockFindFirst.mockResolvedValue({ id: 'user-2', role: { name: roleName } });
  }

  it('serves the briefing PDF and records that it was taken', async () => {
    authenticateAs('user-2');
    callerIs('enumerator');
    mockRenderBriefingPdf.mockResolvedValue(Buffer.from('%PDF-1.3\n%briefing\n%%EOF'));

    const res = await request(buildApp()).get('/users/field-briefing');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(res.headers['content-disposition']).toContain('field-briefing.pdf');
    expect(mockRecordDownload).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-2', kind: 'briefing' }),
    );
  });

  /**
   * ⚠️ Review L1 — "authenticated" is not "staff" on this platform.
   *
   * The endpoint was gated on authentication alone, which includes every
   * registered citizen — a population three orders of magnitude larger than the
   * staff list and about to be blasted. Two things followed, one of them quiet:
   * an internal runbook served to the public, and a `staff.briefing_downloaded`
   * audit row written against an actor who is not staff, which is the audit
   * vocabulary telling a small lie about who did what.
   *
   * The gate is on PUBLIC_USER specifically, not on BRIEFING_ROLES: a clerk or
   * supervisor who follows the link should get the document rather than a 403
   * they will read as a bug. Who is PROMPTED remains a separate question.
   */
  it('L1 — REFUSES a citizen, and records nothing when it does', async () => {
    authenticateAs('citizen-1');
    callerIs('public_user');
    mockRenderBriefingPdf.mockResolvedValue(Buffer.from('%PDF-1.3\n%briefing\n%%EOF'));

    const res = await request(buildApp()).get('/users/field-briefing');

    expect(res.status).toBe(403);
    expect(mockRenderBriefingPdf).not.toHaveBeenCalled();
    // The row that would have named a citizen as staff.
    expect(mockRecordDownload).not.toHaveBeenCalled();
  });

  it('L1 — a non-enumerator staff role still gets it (the gate is on citizens)', async () => {
    authenticateAs('user-2');
    callerIs('data_entry_clerk');
    mockRenderBriefingPdf.mockResolvedValue(Buffer.from('%PDF-1.3\n%briefing\n%%EOF'));

    const res = await request(buildApp()).get('/users/field-briefing');

    expect(res.status).toBe(200);
  });

  it('a render failure surfaces as an error, never as an empty download', async () => {
    authenticateAs('user-2');
    callerIs('enumerator');
    mockRenderBriefingPdf.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'BRIEFING_UNAVAILABLE', statusCode: 500 }),
    );

    const res = await request(buildApp()).get('/users/field-briefing');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('BRIEFING_UNAVAILABLE');
    // Nothing was delivered, so nothing is recorded.
    expect(mockRecordDownload).not.toHaveBeenCalled();
  });
});

describe('GET /users/artefacts (AC5, AC7.4)', () => {
  it('returns the caller-own artefact state', async () => {
    authenticateAs('user-3');
    mockFindFirst.mockResolvedValue({
      id: 'user-3',
      liveSelfieIdCardUrl: 'staff-photos/id-card/user-3.jpg',
      role: { name: 'enumerator' },
    });
    mockGetArtefactState.mockResolvedValue({
      idCard: { applicable: true, available: true, unavailableReason: null, downloadedAt: null },
      briefing: { applicable: true, available: true, unavailableReason: null, downloadedAt: null },
      promptRequired: true,
    });

    const res = await request(buildApp()).get('/users/artefacts');

    expect(res.status).toBe(200);
    expect(res.body.data.promptRequired).toBe(true);
    // The state is derived from the CALLER's own row, never from a query param.
    expect(mockGetArtefactState).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-3', roleName: 'enumerator', hasIdCardPhoto: true }),
    );
  });

  it('reports hasIdCardPhoto=false when the photo never saved (13-60)', async () => {
    authenticateAs('user-4');
    mockFindFirst.mockResolvedValue({
      id: 'user-4',
      liveSelfieIdCardUrl: null,
      role: { name: 'enumerator' },
    });
    mockGetArtefactState.mockResolvedValue({
      idCard: { applicable: true, available: false, unavailableReason: 'photo_missing', downloadedAt: null },
      briefing: { applicable: true, available: true, unavailableReason: null, downloadedAt: null },
      promptRequired: true,
    });

    const res = await request(buildApp()).get('/users/artefacts');

    expect(res.status).toBe(200);
    expect(res.body.data.idCard.unavailableReason).toBe('photo_missing');
    expect(mockGetArtefactState).toHaveBeenCalledWith(
      expect.objectContaining({ hasIdCardPhoto: false }),
    );
  });
});
