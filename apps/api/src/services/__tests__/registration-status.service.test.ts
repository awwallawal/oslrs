import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockExecute = vi.fn();
const mockIssueToken = vi.fn();
const mockBuildUrl = vi.fn();
const mockSendEmail = vi.fn();
const mockLogAction = vi.fn();
const mockRedisIncr = vi.fn();
const mockRedisExpire = vi.fn();
// Returned by getRedisClient(); null disables the throttle (fail-open) like other limiters in test mode.
let mockRedisClient: { incr: typeof mockRedisIncr; expire: typeof mockRedisExpire } | null = null;

// CODE REVIEW 2026-08-24 (C1) — `ensureSignInAccount` now reads the SAME `users` row
// `loginByMagicLinkToken` reads, so the mock has to be able to answer that question.
const mockFindUser = vi.fn();
vi.mock('../../db/index.js', () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
    query: { users: { findFirst: (...args: unknown[]) => mockFindUser(...args) } },
  },
}));
vi.mock('../email.service.js', () => ({
  EmailService: { sendGenericEmail: (...args: unknown[]) => mockSendEmail(...args) },
}));
vi.mock('../magic-link.service.js', () => ({
  MagicLinkService: {
    issueToken: (...args: unknown[]) => mockIssueToken(...args),
    buildMagicLinkUrl: (...args: unknown[]) => mockBuildUrl(...args),
  },
}));
// 13-50 AC1.3 — the `login` branch provisions a sign-in account when the respondent has none.
const mockProvisionPublicUser = vi.fn();
vi.mock('../auth.service.js', () => ({
  AuthService: {
    provisionPublicUserForWizard: (...args: unknown[]) => mockProvisionPublicUser(...args),
  },
}));
vi.mock('../audit.service.js', () => ({
  AuditService: { logAction: (...args: unknown[]) => mockLogAction(...args) },
  AUDIT_ACTIONS: { REGISTRATION_STATUS_REQUESTED: 'registration_status.requested' },
}));
vi.mock('../../lib/redis.js', () => ({
  getRedisClient: () => mockRedisClient,
}));
// 13-4 review H2 — the ambiguity refusal is an OPS SIGNAL as well as a behaviour, so the event
// name is pinned rather than left to drift away from whatever the operator greps for.
const mockLoggerInfo = vi.fn();
vi.mock('pino', () => ({
  default: () => ({
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const {
  classifyIdentifier,
  statusToPlainLanguage,
  statusLinkPurposeFor,
  RegistrationStatusService,
} = await import('../registration-status.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  mockIssueToken.mockResolvedValue({ id: 'tok-1', tokenPlaintext: 'PLAINTEXT', expiresAt: new Date() });
  mockBuildUrl.mockReturnValue('https://oyoskills.com/auth/magic?token=PLAINTEXT&purpose=login');
  mockSendEmail.mockResolvedValue({ success: true });
  mockProvisionPublicUser.mockResolvedValue({ userId: 'u-1', created: true });
  // Default: a healthy public_user account exists for the address.
  mockFindUser.mockResolvedValue({
    id: 'u-1', status: 'active', lockedUntil: null, role: { name: 'public_user' },
  });
  // Default: no Redis client → throttle fails open (matches test-mode limiters).
  mockRedisClient = null;
  mockRedisIncr.mockResolvedValue(1);
  mockRedisExpire.mockResolvedValue(1);
});

describe('classifyIdentifier (Story 9-58)', () => {
  it('detects a reference code (case-insensitive)', () => {
    expect(classifyIdentifier('OSL-2026-7F3K9Q')).toBe('reference_code');
    expect(classifyIdentifier('osl-2026-7f3k9q')).toBe('reference_code');
  });
  it('detects an email by @', () => {
    expect(classifyIdentifier('jane@example.com')).toBe('email');
  });
  it('falls back to phone for anything else', () => {
    expect(classifyIdentifier('08012345678')).toBe('phone');
    expect(classifyIdentifier('+2348012345678')).toBe('phone');
  });
});

describe('statusToPlainLanguage', () => {
  it('maps known statuses to registrant-friendly text', () => {
    expect(statusToPlainLanguage('active')).toMatch(/Active/i);
    expect(statusToPlainLanguage('pending_nin_capture')).toMatch(/Pending/i);
    expect(statusToPlainLanguage('nin_unavailable')).toMatch(/Pending/i);
    expect(statusToPlainLanguage('imported_unverified')).toMatch(/file/i);
  });
});

/**
 * ── 13-50 AC1 — A COMPLETED REGISTRANT MUST NOT BE HANDED A WIZARD ─────────────────────────
 *
 * `/check-registration` used to mint `wizard_resume` for EVERY match. For someone whose
 * registration is already complete that link is a trap that ends in `409 NIN_DUPLICATE` —
 * which reads, to the person receiving it, as "the Registry has lost me".
 *
 * The branch is on REGISTRATION COMPLETENESS, not on the purpose (AC1.3). These tests assert
 * the BRANCH — the purpose actually handed to `issueToken` — not merely that an email went out.
 * A test that asserts the happy outcome without exercising the branch is
 * [[pattern-test-that-passes-over-a-hole]].
 */
describe('13-50 AC1 — statusLinkPurposeFor (the branch itself)', () => {
  it('a COMPLETE registration never resolves to wizard_resume', () => {
    expect(statusLinkPurposeFor('active')).toBe('login');
    expect(statusLinkPurposeFor('imported_unverified')).toBe('login');
  });

  it('pending_nin_capture resolves to the 9-12 ladder purpose, not the wizard', () => {
    // Pinned against registration.controller.ts `allowedStatuses: ['pending_nin_capture']` —
    // that endpoint accepts this status ALONE, so it is the only status for which
    // `pending_nin_complete` is a valid link.
    expect(statusLinkPurposeFor('pending_nin_capture')).toBe('pending_nin_complete');
  });

  it('does NOT blanket-disable wizard_resume (AC1.3)', () => {
    expect(statusLinkPurposeFor('nin_unavailable')).toBe('wizard_resume');
    expect(statusLinkPurposeFor('some_future_status')).toBe('wizard_resume');
  });
});

describe('RegistrationStatusService.handleRequest', () => {
  const ctx = { ipAddress: '1.2.3.4', userAgent: 'jest' };

  it('on an email match: issues a magic-link, sends email, audits dispatched=true', async () => {
    // resolveRespondent(email) → one row
    mockExecute.mockResolvedValueOnce({
      rows: [{ id: 'r-1', status: 'active', reference_code: 'OSL-2026-7F3K9Q', user_id: 'u-1' }],
    });

    await RegistrationStatusService.handleRequest({ identifier: 'Jane@Example.com', ...ctx });

    expect(mockIssueToken).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jane@example.com', purpose: 'login', respondentId: 'r-1' }),
    );
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const audit = mockLogAction.mock.calls[0][0];
    expect(audit.action).toBe('registration_status.requested');
    expect(audit.details).toEqual({ identifierClass: 'email', dispatched: true, throttled: false });
    // AC8 — no raw identifier value anywhere in the audit payload.
    expect(JSON.stringify(audit)).not.toContain('jane@example.com');
  });

  it('on no match: no magic-link, no email, audits dispatched=false', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });

    await RegistrationStatusService.handleRequest({ identifier: 'nobody@example.com', ...ctx });

    expect(mockIssueToken).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    const audit = mockLogAction.mock.calls[0][0];
    expect(audit.details).toEqual({ identifierClass: 'email', dispatched: false, throttled: false });
  });

  it('on a phone match with an email on file: resolves the email and dispatches', async () => {
    mockExecute
      // resolveRespondent(phone)
      .mockResolvedValueOnce({ rows: [{ id: 'r-9', status: 'pending_nin_capture', reference_code: null }] })
      // resolveEmail
      .mockResolvedValueOnce({ rows: [{ email: 'phoneuser@example.com' }] });

    await RegistrationStatusService.handleRequest({ identifier: '08012345678', ...ctx });

    expect(mockIssueToken).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'phoneuser@example.com', respondentId: 'r-9' }),
    );
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockLogAction.mock.calls[0][0].details).toEqual({ identifierClass: 'phone', dispatched: true, throttled: false });
  });

  it('on a reference-code match with NO email on file: no send, audits dispatched=false', async () => {
    mockExecute
      // resolveRespondent(reference_code)
      .mockResolvedValueOnce({ rows: [{ id: 'r-5', status: 'active', reference_code: 'OSL-2026-ABCDEF' }] })
      // resolveEmail → none
      .mockResolvedValueOnce({ rows: [] });

    await RegistrationStatusService.handleRequest({ identifier: 'OSL-2026-ABCDEF', ...ctx });

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLogAction.mock.calls[0][0].details).toEqual({
      identifierClass: 'reference_code',
      dispatched: false,
      throttled: false,
    });
  });

  /**
   * ── 13-4 code review H2 — A SHARED HANDSET MUST NOT RESOLVE TO SOMEBODY ELSE ──────────────
   *
   * 13-4 AC1b deliberately stopped the ingestion pipeline from collapsing a household captured
   * on one phone into a single respondent. The direct consequence is that "N respondents share
   * this phone" became the EXPECTED shape of enumerator data — and this service used to answer
   * such a lookup with `ORDER BY created_at DESC LIMIT 1` and then mint a `wizard_resume` magic
   * link bound to that id. A mother checking her status on the family handset would have been
   * handed a link into her daughter's record, with the NIN-completion flow attached to it.
   *
   * Refusing is strictly better than confidently answering about the wrong person: the neutral
   * public response is unchanged, and the reference code remains a unique way in.
   */
  describe('13-4 H2 — an ambiguous identifier resolves to nothing', () => {
    it('refuses a phone shared by a household instead of picking the newest row', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [
          { id: 'daughter-r', status: 'pending_nin_capture', reference_code: 'OSL-2026-DAUGHT' },
          { id: 'mother-r', status: 'active', reference_code: 'OSL-2026-MOTHER' },
        ],
      });

      await RegistrationStatusService.handleRequest({ identifier: '08012345678', ...ctx });

      // The whole point: NO token bound to an arbitrary household member, and no email telling
      // one person about another person's registration.
      expect(mockIssueToken).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockLogAction.mock.calls[0][0].details).toEqual({
        identifierClass: 'phone',
        dispatched: false,
        throttled: false,
      });
    });

    it('refuses a shared email the same way', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [
          { id: 'son-r', status: 'active', reference_code: 'OSL-2026-SONNNN' },
          { id: 'father-r', status: 'active', reference_code: 'OSL-2026-FATHER' },
        ],
      });

      await RegistrationStatusService.handleRequest({ identifier: 'household@example.com', ...ctx });

      expect(mockIssueToken).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    /**
     * 13-4 R2 (adjudication, 2026-08-06) — THE QUERY THAT FEEDS THE GUARD IS ALSO LOAD-BEARING.
     *
     * Every test above mocks `db.execute`, so the mock returns whatever rows it likes and the
     * `LIMIT` in the SQL string is invisible to all of them. **If that value regressed to
     * `LIMIT 1` — which is exactly what it was before this story — the second row could never
     * arrive, `rows.length > 1` could never be true, the ambiguity guard would silently never
     * fire on prod, and all of these tests would stay green.**
     *
     * Found by accident during adjudication: neutering the SQL failed nothing, which looked like
     * a test passing over a hole and was really proof the SQL layer had no cover at all. Same
     * move as `respondent-identity.test.ts` asserting `INTERSECT` — pin the shape of the query,
     * because a mock cannot evaluate it.
     */
    it('issues a query that can RETURN a second row — LIMIT must not be 1', async () => {
      for (const identifier of ['08012345678', 'household@example.com']) {
        mockExecute.mockReset();
        mockExecute.mockResolvedValueOnce({ rows: [] });
        await RegistrationStatusService.handleRequest({ identifier, ...ctx });

        const issued = JSON.stringify(mockExecute.mock.calls[0]?.[0] ?? {});
        // The guard needs at least two rows to detect ambiguity at all.
        expect(issued).toMatch(/LIMIT\s+2/i);
        // Soft-deleted rows must not resolve, and must not inflate the ambiguity count either.
        expect(issued).toMatch(/rolled_back/);
      }
    });

    /** A reference code IS unique, so it is exempt from the ambiguity check by design. */
    it('leaves the unique reference-code lookup on LIMIT 1', async () => {
      mockExecute.mockReset();
      mockExecute.mockResolvedValueOnce({ rows: [] });
      await RegistrationStatusService.handleRequest({ identifier: 'OSL-2026-ABC123', ...ctx });
      const issued = JSON.stringify(mockExecute.mock.calls[0]?.[0] ?? {});
      expect(issued).toMatch(/LIMIT\s+1/i);
    });

    it('emits the ambiguity event with the count but NEVER the identifier (AC8)', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [
          { id: 'a', status: 'active', reference_code: null },
          { id: 'b', status: 'active', reference_code: null },
        ],
      });

      await RegistrationStatusService.handleRequest({ identifier: '08012345678', ...ctx });

      const ambiguous = mockLoggerInfo.mock.calls.find(
        (c) => (c[0] as { event?: string })?.event === 'registration_status.identifier_ambiguous',
      );
      expect(ambiguous).toBeDefined();
      expect(ambiguous?.[0]).toMatchObject({ identifierClass: 'phone', matchCount: 2 });
      expect(JSON.stringify(ambiguous?.[0])).not.toContain('08012345678');
    });

    it('a UNIQUE phone still resolves and dispatches — the refusal is not a blanket block', async () => {
      mockExecute
        .mockResolvedValueOnce({ rows: [{ id: 'only-r', status: 'active', reference_code: 'OSL-2026-ONLYYY' }] })
        .mockResolvedValueOnce({ rows: [{ email: 'solo@example.com' }] });

      await RegistrationStatusService.handleRequest({ identifier: '08012345678', ...ctx });

      expect(mockIssueToken).toHaveBeenCalledWith(
        expect.objectContaining({ respondentId: 'only-r' }),
      );
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });
  });

  // ── 13-50 AC1 — the branch, end to end ────────────────────────────────────
  describe('13-50 AC1 — a completed registrant is not sent back into the wizard', () => {
    it('a COMPLETE registration is emailed a login link, never wizard_resume', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: 'r-1', status: 'active', reference_code: 'OSL-2026-COMPLETE', user_id: 'u-7' }],
      });

      await RegistrationStatusService.handleRequest({ identifier: 'done@example.com', ...ctx });

      // Assert the BRANCH: the purpose handed to issueToken, not just "an email went out".
      const issuedWith = mockIssueToken.mock.calls[0][0];
      expect(issuedWith.purpose).toBe('login');
      expect(issuedWith.purpose).not.toBe('wizard_resume');
      // ...and the URL is built for the SAME purpose. Issuing `login` but building a
      // `wizard_resume` URL would put the person back in the wizard with a token the
      // resume page cannot redeem — the dead-end wearing a different hat.
      expect(mockBuildUrl).toHaveBeenCalledWith('PLAINTEXT', 'login');
    });

    it('already-linked respondent: no account is provisioned (idempotent, no side effect)', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: 'r-1', status: 'active', reference_code: 'OSL-2026-LINKED', user_id: 'u-7' }],
      });

      await RegistrationStatusService.handleRequest({ identifier: 'linked@example.com', ...ctx });

      expect(mockProvisionPublicUser).not.toHaveBeenCalled();
      expect(mockIssueToken.mock.calls[0][0].purpose).toBe('login');
    });

    /**
     * THE ADOPTED-174 CASE. `_draft-adoption-programme.ts` creates respondents with
     * `source: 'public'` and never calls `provisionPublicUserForWizard`, so these people have a
     * COMPLETE registration and NO account. Without provisioning, a `login` link fails
     * `AUTH_INVALID_CREDENTIALS`, whose frontend copy is "Let's get you registered first" — a
     * registered citizen told to register. A second dead-end is not a fix for the first.
     */
    it('complete but ACCOUNTLESS: provisions a sign-in account, then issues login', async () => {
      mockExecute
        // resolveRespondent
        .mockResolvedValueOnce({
          rows: [{
            id: 'r-adopted', status: 'active', reference_code: 'OSL-2026-ADOPTD',
            user_id: null, first_name: 'Bisi', last_name: 'Adeyemi',
          }],
        })
        // user_id stamp
        .mockResolvedValueOnce({ rows: [] });
      // No account yet, then the freshly provisioned one.
      mockFindUser
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          id: 'u-1', status: 'active', lockedUntil: null, role: { name: 'public_user' },
        });

      await RegistrationStatusService.handleRequest({ identifier: 'adopted@example.com', ...ctx });

      expect(mockProvisionPublicUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'adopted@example.com', fullName: 'Bisi Adeyemi' }),
      );
      expect(mockIssueToken.mock.calls[0][0].purpose).toBe('login');
      // The durable respondent↔account link is stamped, guarded on user_id IS NULL.
      // NOTE: `JSON.stringify` of a drizzle `sql` object escapes the identifier quotes, so the
      // assertion must not expect a bare `"respondents"`.
      const stampSql = JSON.stringify(mockExecute.mock.calls[1]?.[0] ?? {});
      expect(stampSql).toMatch(/UPDATE\s+\\?"?respondents/i);
      expect(stampSql).toMatch(/user_id\\?"?\s+IS\s+NULL/i);
    });

    it('provisioning failure degrades to a LINKLESS status email — never a dead-end link', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: 'r-2', status: 'active', reference_code: 'OSL-2026-NOACCT', user_id: null }],
      });
      mockFindUser.mockResolvedValue(undefined);
      mockProvisionPublicUser.mockRejectedValueOnce(new Error('public_user role missing'));

      await RegistrationStatusService.handleRequest({ identifier: 'noacct@example.com', ...ctx });

      // No token of ANY purpose — emphatically not a wizard_resume fallback.
      expect(mockIssueToken).not.toHaveBeenCalled();
      // The status email still goes out: it carries the status text + reference code, which is
      // the answer the person actually asked for.
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      const [{ html, text }] = mockSendEmail.mock.calls[0];
      expect(text).toContain('OSL-2026-NOACCT');
      expect(html).toContain('OSL-2026-NOACCT');
      expect(html).not.toContain('/auth/magic');
      expect(mockLogAction.mock.calls[0][0].details).toMatchObject({ dispatched: true });
    });

    it('pending_nin_capture is emailed the 9-12 ladder link, not the wizard', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: 'r-3', status: 'pending_nin_capture', reference_code: 'OSL-2026-PENDNG', user_id: null }],
      });

      await RegistrationStatusService.handleRequest({ identifier: 'pending@example.com', ...ctx });

      expect(mockIssueToken.mock.calls[0][0].purpose).toBe('pending_nin_complete');
      expect(mockBuildUrl).toHaveBeenCalledWith('PLAINTEXT', 'pending_nin_complete');
      // A pending-NIN person needs no account to use their link — do not provision one.
      expect(mockProvisionPublicUser).not.toHaveBeenCalled();
    });

    /**
     * ── CODE REVIEW 2026-08-24 (C1) — THE SECOND DEAD-END ─────────────────────────────────
     *
     * `ensureSignInAccount` used to conclude "a link is redeemable" from "a users row exists".
     * `loginByMagicLinkToken` disagrees on three counts, and each one produces a burnt token and
     * an error screen instead of the person's record. The staff case was reproduced against real
     * Postgres before this test was written: the link minted, `respondents.user_id` was stamped
     * with the ENUMERATOR's id, and redemption returned "Please use the staff login for staff
     * accounts" — rendered to the citizen as "Let's get you registered first" + Register CTA.
     *
     * These assert the BRANCH — that no token is minted at all — not merely that an email went
     * out, because an email carrying an unusable link is the defect, not the fix.
     */
    it.each([
      ['a STAFF account on the same address', { id: 'u-staff', status: 'active', lockedUntil: null, role: { name: 'enumerator' } }],
      ['a SUSPENDED account', { id: 'u-s', status: 'suspended', lockedUntil: null, role: { name: 'public_user' } }],
      ['a DEACTIVATED account', { id: 'u-d', status: 'deactivated', lockedUntil: null, role: { name: 'public_user' } }],
      ['a LOCKED account', { id: 'u-l', status: 'active', lockedUntil: new Date(Date.now() + 60_000), role: { name: 'public_user' } }],
    ])('%s gets a LINKLESS status email, never an unredeemable login link', async (_label, account) => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: 'r-x', status: 'active', reference_code: 'OSL-2026-UNRDMB', user_id: null }],
      });
      mockFindUser.mockResolvedValue(account);

      await RegistrationStatusService.handleRequest({ identifier: 'staffy@example.com', ...ctx });

      expect(mockIssueToken).not.toHaveBeenCalled();
      // ...and the durable link is NOT stamped onto the respondent either: only the
      // resolveRespondent SELECT should have run, never the UPDATE.
      expect(mockExecute).toHaveBeenCalledTimes(1);
      // The person still gets their answer.
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      const [{ html }] = mockSendEmail.mock.calls[0];
      expect(html).not.toContain('/auth/magic');
    });

    it('an account under a DIFFERENT address than the respondent link is resolved by EMAIL', async () => {
      // respondent.user_id points at an old account; the address on file now resolves to a
      // different, healthy public_user row. The link must be minted for the row the redeemer
      // will read — and the stale user_id must NOT be re-stamped over.
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: 'r-y', status: 'active', reference_code: 'OSL-2026-MOVEDD', user_id: 'u-old' }],
      });
      mockFindUser.mockResolvedValue({
        id: 'u-current', status: 'active', lockedUntil: null, role: { name: 'public_user' },
      });

      await RegistrationStatusService.handleRequest({ identifier: 'moved@example.com', ...ctx });

      expect(mockIssueToken.mock.calls[0][0].purpose).toBe('login');
      expect(mockExecute).toHaveBeenCalledTimes(1); // no re-stamp
    });

    it('every mint from this surface names its trigger (AC2.2)', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: 'r-4', status: 'active', reference_code: null, user_id: 'u-4' }],
      });

      await RegistrationStatusService.handleRequest({ identifier: 'trig@example.com', ...ctx });

      expect(mockIssueToken.mock.calls[0][0].trigger).toBe('check_registration_status');
    });
  });

  it('never throws to the caller even if resolution errors (fire-and-forget safe)', async () => {
    mockExecute.mockRejectedValueOnce(new Error('db down'));
    await expect(
      RegistrationStatusService.handleRequest({ identifier: 'x@y.com', ...ctx }),
    ).resolves.toBeUndefined();
    // still audits (dispatched=false)
    expect(mockLogAction).toHaveBeenCalledTimes(1);
    expect(mockLogAction.mock.calls[0][0].details.dispatched).toBe(false);
  });

  // ── H2 (code review): per-email magic-link send throttle ───────────────────
  describe('per-email send throttle (H2 — email-bombing)', () => {
    beforeEach(() => {
      // Enable the throttle by wiring a fake Redis client.
      mockRedisClient = { incr: mockRedisIncr, expire: mockRedisExpire };
    });

    it('skips issueToken once the per-email cap is exceeded, but stays neutral', async () => {
      // resolveRespondent(email) → a match every time.
      mockExecute.mockResolvedValue({
        rows: [{ id: 'r-1', status: 'active', reference_code: 'OSL-2026-7F3K9Q' }],
      });
      // 1..3 allowed, 4th INCR returns 4 → over the cap of 3.
      mockRedisIncr
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4);

      const same = { identifier: 'victim@example.com', ...ctx };
      await RegistrationStatusService.handleRequest(same);
      await RegistrationStatusService.handleRequest(same);
      await RegistrationStatusService.handleRequest(same);
      // First three sends go through.
      expect(mockIssueToken).toHaveBeenCalledTimes(3);
      expect(mockSendEmail).toHaveBeenCalledTimes(3);

      // Fourth request for the SAME email is throttled.
      await expect(RegistrationStatusService.handleRequest(same)).resolves.toBeUndefined();

      // issueToken NOT called again (still 3), no extra email sent.
      expect(mockIssueToken).toHaveBeenCalledTimes(3);
      expect(mockSendEmail).toHaveBeenCalledTimes(3);

      // Neutral response + audit records the class-level throttled flag, no PII.
      const lastAudit = mockLogAction.mock.calls[mockLogAction.mock.calls.length - 1][0];
      expect(lastAudit.details).toEqual({
        identifierClass: 'email',
        dispatched: false,
        throttled: true,
      });
      expect(JSON.stringify(lastAudit)).not.toContain('victim@example.com');
    });

    it('sets a rolling TTL on the first send of the window only', async () => {
      mockExecute.mockResolvedValue({
        rows: [{ id: 'r-1', status: 'active', reference_code: null }],
      });
      mockRedisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

      await RegistrationStatusService.handleRequest({ identifier: 'a@b.com', ...ctx });
      await RegistrationStatusService.handleRequest({ identifier: 'a@b.com', ...ctx });

      // EXPIRE only on the first INCR (count === 1).
      expect(mockRedisExpire).toHaveBeenCalledTimes(1);
      // Key is a hash, never the raw email.
      const [key] = mockRedisIncr.mock.calls[0];
      expect(key).toMatch(/^rl:regstatus-email:[0-9a-f]{64}$/);
      expect(key).not.toContain('a@b.com');
    });

    it('fails OPEN if Redis errors (send still goes through)', async () => {
      mockExecute.mockResolvedValue({
        rows: [{ id: 'r-1', status: 'active', reference_code: null }],
      });
      mockRedisIncr.mockRejectedValueOnce(new Error('redis down'));

      await RegistrationStatusService.handleRequest({ identifier: 'c@d.com', ...ctx });

      // Throttle unavailable → do not block legitimate sends.
      expect(mockIssueToken).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockLogAction.mock.calls[0][0].details).toEqual({
        identifierClass: 'email',
        dispatched: true,
        throttled: false,
      });
    });
  });
});
