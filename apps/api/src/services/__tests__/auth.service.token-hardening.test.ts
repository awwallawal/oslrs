/**
 * Story 9-42 — Auth/token/session hardening orchestration tests.
 *
 * Covers the AuthService side of:
 *  - F-012 (AC#3): logout positively invalidates the refresh token.
 *  - F-022 (AC#4): /refresh rotates the refresh token, and replay of a
 *    consumed (tombstoned) token revokes the entire token family.
 *
 * TokenService + SessionService are mocked so this exercises the orchestration
 * (which collaborators are called, in what shape) without Redis/JWT.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const tok = vi.hoisted(() => ({
  addToBlacklist: vi.fn(() => Promise.resolve()),
  invalidateUserRefreshTokens: vi.fn(() => Promise.resolve(1)),
  validateRefreshToken: vi.fn(),
  getConsumedRefreshTokenUser: vi.fn(),
  revokeAllUserTokens: vi.fn(() => Promise.resolve(1)),
  clearConsumedRefreshToken: vi.fn(() => Promise.resolve()),
  isTokenRevokedByTimestamp: vi.fn(() => Promise.resolve(false)),
  generateAccessToken: vi.fn(() => ({ token: 'new-access', jti: 'jti-new', expiresIn: 900 })),
  rotateRefreshToken: vi.fn(() => Promise.resolve('rotated-refresh-token')),
}));
const sess = vi.hoisted(() => ({
  invalidateSession: vi.fn(() => Promise.resolve()),
  validateSession: vi.fn(() => Promise.resolve({ valid: true, session: {} })),
  linkTokenToSession: vi.fn(() => Promise.resolve()),
  updateLastActivity: vi.fn(() => Promise.resolve(true)),
}));
const mockFindFirst = vi.hoisted(() => vi.fn());

vi.mock('../token.service.js', () => ({ TokenService: tok }));
vi.mock('../session.service.js', () => ({ SessionService: sess }));
vi.mock('../audit.service.js', () => ({ AuditService: { logAction: vi.fn() } }));
vi.mock('../../db/index.js', () => ({
  db: {
    query: { users: { findFirst: mockFindFirst } },
    update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve() }) })),
  },
}));

import { AuthService } from '../auth.service.js';

const activeUser = {
  id: 'user-1',
  email: 'u@example.com',
  fullName: 'U',
  status: 'active',
  role: { name: 'public_user' },
  lgaId: null,
};

describe('AuthService — F-012 logout invalidation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('positively invalidates the refresh token (not just the session)', async () => {
    await AuthService.logout('user-1', 'jti-1', 'sess-1', '1.2.3.4', 'jest');

    expect(tok.addToBlacklist).toHaveBeenCalledWith('jti-1');
    // The core F-012 assertion: refresh token is explicitly killed.
    expect(tok.invalidateUserRefreshTokens).toHaveBeenCalledWith('user-1');
    expect(sess.invalidateSession).toHaveBeenCalledWith('sess-1', 'logout');
  });
});

describe('AuthService — F-022 refresh rotation + reuse detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tok.isTokenRevokedByTimestamp.mockResolvedValue(false);
    sess.validateSession.mockResolvedValue({ valid: true, session: {} });
    tok.generateAccessToken.mockReturnValue({ token: 'new-access', jti: 'jti-new', expiresIn: 900 });
    tok.rotateRefreshToken.mockResolvedValue('rotated-refresh-token');
  });

  it('rotates the refresh token on a valid /refresh and returns the new token', async () => {
    tok.validateRefreshToken.mockResolvedValueOnce({
      userId: 'user-1',
      sessionId: 'sess-1',
      rememberMe: false,
      createdAt: new Date().toISOString(),
    });
    mockFindFirst.mockResolvedValueOnce(activeUser);

    const result = await AuthService.refreshToken('old-refresh', '1.2.3.4');

    expect(tok.rotateRefreshToken).toHaveBeenCalledWith('old-refresh', 'user-1', 'sess-1', false);
    expect(result).toEqual({
      accessToken: 'new-access',
      expiresIn: 900,
      refreshToken: 'rotated-refresh-token',
      rememberMe: false,
    });
  });

  it('replay of a consumed (tombstoned) token → family revoked + 401', async () => {
    tok.validateRefreshToken.mockResolvedValueOnce(null); // no longer active
    tok.getConsumedRefreshTokenUser.mockResolvedValueOnce('user-1'); // but tombstoned

    await expect(AuthService.refreshToken('replayed-refresh', '9.9.9.9')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_REUSE_DETECTED',
      statusCode: 401,
    });

    expect(tok.revokeAllUserTokens).toHaveBeenCalledWith('user-1');
    expect(tok.clearConsumedRefreshToken).toHaveBeenCalledWith('replayed-refresh');
    // No new token issued on a reuse event.
    expect(tok.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it('genuinely invalid/expired token (no tombstone) → 401 without family revoke', async () => {
    tok.validateRefreshToken.mockResolvedValueOnce(null);
    tok.getConsumedRefreshTokenUser.mockResolvedValueOnce(null);

    await expect(AuthService.refreshToken('expired-refresh')).rejects.toMatchObject({
      code: 'AUTH_INVALID_TOKEN',
      statusCode: 401,
    });

    expect(tok.revokeAllUserTokens).not.toHaveBeenCalled();
  });
});
