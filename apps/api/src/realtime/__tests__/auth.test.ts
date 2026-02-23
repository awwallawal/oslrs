/**
 * Realtime Auth Tests
 * Story prep-6: Tests for Socket.io handshake authentication
 *
 * Verifies that verifySocketToken replicates the REST auth flow
 * (JWT verify, blacklist check, revocation check) for transport connections.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JwtPayload } from '@oslsr/types';
import { UserRole } from '@oslsr/types';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockVerifyAccessToken = vi.fn();
const mockIsBlacklisted = vi.fn();
const mockIsTokenRevokedByTimestamp = vi.fn();

vi.mock('../../services/token.service.js', () => ({
  TokenService: {
    verifyAccessToken: (...args: unknown[]) => mockVerifyAccessToken(...args),
    isBlacklisted: (...args: unknown[]) => mockIsBlacklisted(...args),
    isTokenRevokedByTimestamp: (...args: unknown[]) => mockIsTokenRevokedByTimestamp(...args),
  },
}));

// ── Import under test (after mocks) ────────────────────────────────────────

import { verifySocketToken } from '../auth.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const validPayload: JwtPayload = {
  sub: 'user-001',
  jti: 'jti-001',
  role: UserRole.SUPERVISOR,
  lgaId: 'ibadan_north',
  email: 'supervisor@dev.local',
  rememberMe: false,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900, // 15 min
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('verifySocketToken', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAccessToken.mockReturnValue(validPayload);
    mockIsBlacklisted.mockResolvedValue(false);
    mockIsTokenRevokedByTimestamp.mockResolvedValue(false);
  });

  it('should return decoded payload for a valid token', async () => {
    const result = await verifySocketToken('valid-token');

    expect(result).toEqual(validPayload);
    expect(mockVerifyAccessToken).toHaveBeenCalledWith('valid-token');
    expect(mockIsBlacklisted).toHaveBeenCalledWith('jti-001');
    expect(mockIsTokenRevokedByTimestamp).toHaveBeenCalledWith('user-001', validPayload.iat);
  });

  it('should throw AUTH_REQUIRED when no token provided', async () => {
    await expect(verifySocketToken('')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      statusCode: 401,
    });
  });

  it('should throw AUTH_REQUIRED when token is undefined', async () => {
    await expect(verifySocketToken(undefined as unknown as string)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      statusCode: 401,
    });
  });

  it('should propagate AUTH_INVALID_TOKEN when JWT verification fails', async () => {
    const { AppError } = await import('@oslsr/utils');
    mockVerifyAccessToken.mockImplementation(() => {
      throw new AppError('AUTH_INVALID_TOKEN', 'Invalid token', 401);
    });

    await expect(verifySocketToken('bad-token')).rejects.toMatchObject({
      code: 'AUTH_INVALID_TOKEN',
      statusCode: 401,
    });
  });

  it('should throw AUTH_TOKEN_REVOKED when token is blacklisted', async () => {
    mockIsBlacklisted.mockResolvedValue(true);

    await expect(verifySocketToken('blacklisted-token')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_REVOKED',
      statusCode: 401,
    });
  });

  it('should throw AUTH_TOKEN_REVOKED when token is revoked by timestamp', async () => {
    mockIsTokenRevokedByTimestamp.mockResolvedValue(true);

    await expect(verifySocketToken('revoked-token')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_REVOKED',
      statusCode: 401,
    });
  });

  it('should call verification steps in correct order', async () => {
    const callOrder: string[] = [];
    mockVerifyAccessToken.mockImplementation(() => {
      callOrder.push('verify');
      return validPayload;
    });
    mockIsBlacklisted.mockImplementation(async () => {
      callOrder.push('blacklist');
      return false;
    });
    mockIsTokenRevokedByTimestamp.mockImplementation(async () => {
      callOrder.push('revocation');
      return false;
    });

    await verifySocketToken('token');

    expect(callOrder).toEqual(['verify', 'blacklist', 'revocation']);
  });
});
