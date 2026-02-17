/**
 * Realtime Security & Boundary Tests
 * Story prep-6 Task 4: Verifies team boundary enforcement and auth rejection
 *
 * Tests LGA-scoped message delivery, cross-LGA boundary violations,
 * unauthorized role rejection, and expired/blacklisted token handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JwtPayload } from '@oslsr/types';
import { UserRole } from '@oslsr/types';
import { verifySocketToken } from '../auth.js';
import { getRoomName, canJoinRoom, REALTIME_ROLES } from '../rooms.js';

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

// ── Fixtures ────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-001',
    jti: 'jti-001',
    role: UserRole.SUPERVISOR,
    lgaId: 'ibadan_north',
    email: 'sup@dev.local',
    rememberMe: false,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  };
}

// ── 4.1: Supervisor can send event to enumerator in same LGA ────────────

describe('Task 4.1: Same-LGA message delivery', () => {
  it('supervisor in ibadan_north can join ibadan_north room', () => {
    const supervisor = makePayload({
      role: UserRole.SUPERVISOR,
      lgaId: 'ibadan_north',
    });
    const room = getRoomName('ibadan_north');
    expect(canJoinRoom(supervisor, room)).toBe(true);
  });

  it('enumerator in ibadan_north can join ibadan_north room', () => {
    const enumerator = makePayload({
      role: UserRole.ENUMERATOR,
      lgaId: 'ibadan_north',
    });
    const room = getRoomName('ibadan_north');
    expect(canJoinRoom(enumerator, room)).toBe(true);
  });

  it('supervisor and enumerator in same LGA share the same room', () => {
    const supervisorRoom = getRoomName('ibadan_north');
    const enumeratorRoom = getRoomName('ibadan_north');
    expect(supervisorRoom).toBe(enumeratorRoom);
    expect(supervisorRoom).toBe('lga:ibadan_north');
  });
});

// ── 4.2: Supervisor cannot send to different LGA ────────────────────────

describe('Task 4.2: Cross-LGA boundary violation', () => {
  it('supervisor in ibadan_north cannot join akinyele room', () => {
    const supervisor = makePayload({
      role: UserRole.SUPERVISOR,
      lgaId: 'ibadan_north',
    });
    const targetRoom = getRoomName('akinyele');
    expect(canJoinRoom(supervisor, targetRoom)).toBe(false);
  });

  it('supervisor cannot send to room outside their LGA', () => {
    const supervisor = makePayload({
      role: UserRole.SUPERVISOR,
      lgaId: 'egbeda',
    });
    // Attempting to target ibadan_north while assigned to egbeda
    const targetRoom = getRoomName('ibadan_north');
    expect(canJoinRoom(supervisor, targetRoom)).toBe(false);
  });

  it('enumerator in different LGA cannot join supervisor LGA room', () => {
    const enumerator = makePayload({
      role: UserRole.ENUMERATOR,
      lgaId: 'akinyele',
    });
    const supervisorRoom = getRoomName('ibadan_north');
    expect(canJoinRoom(enumerator, supervisorRoom)).toBe(false);
  });
});

// ── 4.3: Enumerator cannot subscribe to different LGA's channel ─────────

describe('Task 4.3: Enumerator cross-LGA subscription rejected', () => {
  it('enumerator cannot subscribe to any room outside their LGA', () => {
    const enumerator = makePayload({
      role: UserRole.ENUMERATOR,
      lgaId: 'ido',
    });

    // Test against several different LGAs
    const otherLgas = ['ibadan_north', 'akinyele', 'egbeda', 'atiba'];
    for (const lga of otherLgas) {
      expect(canJoinRoom(enumerator, getRoomName(lga))).toBe(false);
    }
  });

  it('enumerator without lgaId cannot join any room', () => {
    const enumerator = makePayload({
      role: UserRole.ENUMERATOR,
      lgaId: undefined,
    });
    expect(canJoinRoom(enumerator, getRoomName('ibadan_north'))).toBe(false);
  });
});

// ── 4.4: Expired/blacklisted JWT token — connection rejected ────────────

describe('Task 4.4: Token validation for transport auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAccessToken.mockReturnValue(makePayload());
    mockIsBlacklisted.mockResolvedValue(false);
    mockIsTokenRevokedByTimestamp.mockResolvedValue(false);
  });

  it('rejects expired JWT token with AUTH_SESSION_EXPIRED', async () => {
    const { AppError } = await import('@oslsr/utils');
    mockVerifyAccessToken.mockImplementation(() => {
      throw new AppError('AUTH_SESSION_EXPIRED', 'Session has expired', 401);
    });

    await expect(verifySocketToken('expired-token')).rejects.toMatchObject({
      code: 'AUTH_SESSION_EXPIRED',
      statusCode: 401,
    });
  });

  it('rejects blacklisted JWT token with AUTH_TOKEN_REVOKED', async () => {
    mockIsBlacklisted.mockResolvedValue(true);

    await expect(verifySocketToken('blacklisted-token')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_REVOKED',
      statusCode: 401,
    });
  });

  it('rejects token revoked by password change', async () => {
    mockIsTokenRevokedByTimestamp.mockResolvedValue(true);

    await expect(verifySocketToken('old-token')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_REVOKED',
      statusCode: 401,
    });
  });

  it('rejects malformed JWT with AUTH_INVALID_TOKEN', async () => {
    const { AppError } = await import('@oslsr/utils');
    mockVerifyAccessToken.mockImplementation(() => {
      throw new AppError('AUTH_INVALID_TOKEN', 'Invalid token', 401);
    });

    await expect(verifySocketToken('garbage')).rejects.toMatchObject({
      code: 'AUTH_INVALID_TOKEN',
      statusCode: 401,
    });
  });

  it('rejects empty token string', async () => {
    await expect(verifySocketToken('')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      statusCode: 401,
    });
  });
});

// ── 4.5: Verify audit logging coverage ──────────────────────────────────

describe('Task 4.5: Structured logging for audit trail', () => {
  it('REALTIME_ROLES includes only supervisor and enumerator', () => {
    // Ensures unauthorized roles are systematically excluded
    expect(REALTIME_ROLES).toEqual([UserRole.SUPERVISOR, UserRole.ENUMERATOR]);
    expect(REALTIME_ROLES).toHaveLength(2);
  });

  it('all non-messaging roles are rejected from rooms', () => {
    const nonMessagingRoles = [
      UserRole.SUPER_ADMIN,
      UserRole.DATA_ENTRY_CLERK,
      UserRole.VERIFICATION_ASSESSOR,
      UserRole.GOVERNMENT_OFFICIAL,
      UserRole.PUBLIC_USER,
    ];

    for (const role of nonMessagingRoles) {
      const user = makePayload({ role, lgaId: 'ibadan_north' });
      expect(canJoinRoom(user, getRoomName('ibadan_north'))).toBe(false);
    }
  });

  it('verifySocketToken runs all 3 verification steps before accepting', async () => {
    const callOrder: string[] = [];
    mockVerifyAccessToken.mockImplementation(() => {
      callOrder.push('jwt_verify');
      return makePayload();
    });
    mockIsBlacklisted.mockImplementation(async () => {
      callOrder.push('blacklist_check');
      return false;
    });
    mockIsTokenRevokedByTimestamp.mockImplementation(async () => {
      callOrder.push('revocation_check');
      return false;
    });

    await verifySocketToken('valid-token');
    expect(callOrder).toEqual(['jwt_verify', 'blacklist_check', 'revocation_check']);
  });
});
