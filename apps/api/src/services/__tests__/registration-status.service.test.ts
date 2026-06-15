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

vi.mock('../../db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
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
vi.mock('../audit.service.js', () => ({
  AuditService: { logAction: (...args: unknown[]) => mockLogAction(...args) },
  AUDIT_ACTIONS: { REGISTRATION_STATUS_REQUESTED: 'registration_status.requested' },
}));
vi.mock('../../lib/redis.js', () => ({
  getRedisClient: () => mockRedisClient,
}));

const {
  classifyIdentifier,
  statusToPlainLanguage,
  RegistrationStatusService,
} = await import('../registration-status.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  mockIssueToken.mockResolvedValue({ id: 'tok-1', tokenPlaintext: 'PLAINTEXT', expiresAt: new Date() });
  mockBuildUrl.mockReturnValue('https://oyoskills.com/auth/magic?token=PLAINTEXT&purpose=wizard_resume');
  mockSendEmail.mockResolvedValue({ success: true });
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

describe('RegistrationStatusService.handleRequest', () => {
  const ctx = { ipAddress: '1.2.3.4', userAgent: 'jest' };

  it('on an email match: issues a magic-link, sends email, audits dispatched=true', async () => {
    // resolveRespondent(email) → one row
    mockExecute.mockResolvedValueOnce({
      rows: [{ id: 'r-1', status: 'active', reference_code: 'OSL-2026-7F3K9Q' }],
    });

    await RegistrationStatusService.handleRequest({ identifier: 'Jane@Example.com', ...ctx });

    expect(mockIssueToken).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jane@example.com', purpose: 'wizard_resume', respondentId: 'r-1' }),
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
