import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '@oslsr/utils';

// Story 9-16 — mock the magic-link + MFA services and the db query layer so
// `loginByMagicLinkToken` can be unit-tested in isolation. The token/session
// services are only reached via the private `createLoginSession`, which the
// happy-path test spies (so we never touch Redis/JWT here).
const { mockConsumeToken, mockMintChallengeToken, mockFindFirst } = vi.hoisted(() => ({
  mockConsumeToken: vi.fn(),
  mockMintChallengeToken: vi.fn(),
  mockFindFirst: vi.fn(),
}));

vi.mock('../magic-link.service.js', () => ({
  MagicLinkService: { consumeToken: mockConsumeToken },
}));
vi.mock('../mfa.service.js', () => ({
  MfaService: { mintChallengeToken: mockMintChallengeToken },
}));
vi.mock('../../db/index.js', () => ({
  db: {
    query: { users: { findFirst: mockFindFirst } },
    update: vi.fn(),
  },
}));

import { AuthService } from '../auth.service.js';

/** Build a public_user row in the shape `db.query.users.findFirst` returns. */
function makePublicUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'returning@example.com',
    fullName: 'Returning Respondent',
    status: 'active',
    role: { name: 'public_user' },
    lockedUntil: null,
    mfaEnabled: false,
    passwordHash: 'hashed-password',
    lgaId: null,
    ...overrides,
  };
}

describe('AuthService', () => {
  describe('decodeBase64Image (private method via reflection)', () => {
    // Access private method for unit testing
    const decodeBase64Image = (AuthService as any).decodeBase64Image.bind(AuthService);

    it('should decode raw base64 string to buffer', () => {
      // Small 1x1 red pixel JPEG as base64
      const rawBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

      const buffer = decodeBase64Image(rawBase64);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should decode data URL format base64 to buffer', () => {
      const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

      const buffer = decodeBase64Image(dataUrl);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle PNG data URL format', () => {
      const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const buffer = decodeBase64Image(pngDataUrl);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle WebP data URL format', () => {
      const webpDataUrl = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';

      const buffer = decodeBase64Image(webpDataUrl);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should throw error for empty base64 data', () => {
      // Empty string decodes to empty buffer, which should throw
      expect(() => decodeBase64Image('')).toThrow('Invalid base64 image data');
    });

    it('should return same buffer for raw base64 and data URL of same image', () => {
      const rawBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const dataUrl = `data:image/png;base64,${rawBase64}`;

      const bufferFromRaw = decodeBase64Image(rawBase64);
      const bufferFromDataUrl = decodeBase64Image(dataUrl);

      expect(bufferFromRaw.equals(bufferFromDataUrl)).toBe(true);
    });
  });

  // Story 9-16 — magic-link login (login-purpose JWT issuance).
  describe('loginByMagicLinkToken', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Default: a valid 'login' token resolving to the canonical email.
      mockConsumeToken.mockResolvedValue({ email: 'returning@example.com' });
    });

    it('happy path: consumes the login token and returns a full session', async () => {
      mockFindFirst.mockResolvedValueOnce(makePublicUser());
      const session = {
        accessToken: 'access-1',
        user: { id: 'user-1', email: 'returning@example.com' },
        expiresIn: 900,
        refreshToken: 'refresh-1',
        sessionId: 'sess-1',
      };
      const createSpy = vi
        .spyOn(AuthService as unknown as { createLoginSession: (...a: unknown[]) => unknown }, 'createLoginSession')
        .mockResolvedValueOnce(session as never);

      const result = await AuthService.loginByMagicLinkToken({
        plaintext: 'good-login-token',
        rememberMe: false,
        ipAddress: '1.2.3.4',
        userAgent: 'jest',
      });

      expect(mockConsumeToken).toHaveBeenCalledWith({ plaintext: 'good-login-token', purpose: 'login' });
      // The 'magic_link' trigger MUST be threaded so the audit viewer can filter.
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1' }),
        false,
        '1.2.3.4',
        'jest',
        'magic_link',
      );
      expect(result).toEqual(session);
      createSpy.mockRestore();
    });

    it('forward-compat: a passwordless public_user (passwordHash null) is allowed through', async () => {
      mockFindFirst.mockResolvedValueOnce(makePublicUser({ passwordHash: null }));
      const createSpy = vi
        .spyOn(AuthService as unknown as { createLoginSession: (...a: unknown[]) => unknown }, 'createLoginSession')
        .mockResolvedValueOnce({ accessToken: 'a', user: {}, expiresIn: 900, refreshToken: 'r', sessionId: 's' } as never);

      await expect(
        AuthService.loginByMagicLinkToken({ plaintext: 'tok' }),
      ).resolves.toMatchObject({ accessToken: 'a' });
      expect(createSpy).toHaveBeenCalled();
      createSpy.mockRestore();
    });

    it('suspended account → AUTH_ACCOUNT_SUSPENDED 403', async () => {
      mockFindFirst.mockResolvedValueOnce(makePublicUser({ status: 'suspended' }));
      await expect(AuthService.loginByMagicLinkToken({ plaintext: 'tok' })).rejects.toMatchObject({
        code: 'AUTH_ACCOUNT_SUSPENDED',
        statusCode: 403,
      });
    });

    it('deactivated account → AUTH_ACCOUNT_SUSPENDED 403', async () => {
      mockFindFirst.mockResolvedValueOnce(makePublicUser({ status: 'deactivated' }));
      await expect(AuthService.loginByMagicLinkToken({ plaintext: 'tok' })).rejects.toMatchObject({
        code: 'AUTH_ACCOUNT_SUSPENDED',
        statusCode: 403,
      });
    });

    it('locked account → AUTH_ACCOUNT_LOCKED 429', async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000);
      mockFindFirst.mockResolvedValueOnce(makePublicUser({ lockedUntil: future }));
      await expect(AuthService.loginByMagicLinkToken({ plaintext: 'tok' })).rejects.toMatchObject({
        code: 'AUTH_ACCOUNT_LOCKED',
        statusCode: 429,
      });
    });

    it('user not found → AUTH_INVALID_CREDENTIALS 401 (anti-enumeration)', async () => {
      mockFindFirst.mockResolvedValueOnce(undefined);
      await expect(AuthService.loginByMagicLinkToken({ plaintext: 'tok' })).rejects.toMatchObject({
        code: 'AUTH_INVALID_CREDENTIALS',
        statusCode: 401,
      });
    });

    it('staff-role account → AUTH_INVALID_CREDENTIALS 401 (public-only channel)', async () => {
      mockFindFirst.mockResolvedValueOnce(makePublicUser({ role: { name: 'super_admin' } }));
      await expect(AuthService.loginByMagicLinkToken({ plaintext: 'tok' })).rejects.toMatchObject({
        code: 'AUTH_INVALID_CREDENTIALS',
        statusCode: 401,
      });
    });

    it('MFA-enrolled user → returns the requiresMfa challenge branch (no session yet)', async () => {
      mockFindFirst.mockResolvedValueOnce(makePublicUser({ mfaEnabled: true }));
      mockMintChallengeToken.mockResolvedValueOnce('challenge-token-xyz');
      const createSpy = vi.spyOn(
        AuthService as unknown as { createLoginSession: (...a: unknown[]) => unknown },
        'createLoginSession',
      );

      const result = await AuthService.loginByMagicLinkToken({ plaintext: 'tok', rememberMe: true });

      expect(mockMintChallengeToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', rememberMe: true }),
      );
      expect(result).toEqual({
        requiresMfa: true,
        mfaChallengeToken: 'challenge-token-xyz',
        expiresIn: 5 * 60,
      });
      // Critical: MFA must NOT be bypassed — no session issued on this branch.
      expect(createSpy).not.toHaveBeenCalled();
      createSpy.mockRestore();
    });

    it('propagates MAGIC_LINK_* errors from the consume step (invalid/expired/used)', async () => {
      mockConsumeToken.mockRejectedValueOnce(
        new AppError('MAGIC_LINK_ALREADY_USED', 'This magic link has already been used', 400),
      );
      await expect(AuthService.loginByMagicLinkToken({ plaintext: 'used' })).rejects.toMatchObject({
        code: 'MAGIC_LINK_ALREADY_USED',
        statusCode: 400,
      });
      expect(mockFindFirst).not.toHaveBeenCalled();
    });
  });
});
