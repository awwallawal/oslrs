/**
 * Realtime Room Management Tests
 * Story prep-6: Tests for LGA-scoped room assignment and boundary validation
 */

import { describe, it, expect } from 'vitest';
import type { JwtPayload } from '@oslsr/types';
import { UserRole } from '@oslsr/types';
import { getRoomName, canJoinRoom, REALTIME_ROLES } from '../rooms.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-001',
    jti: 'jti-001',
    role: UserRole.SUPERVISOR,
    lgaId: 'ibadan_north',
    email: 'supervisor@dev.local',
    rememberMe: false,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  };
}

// ── Tests: getRoomName ──────────────────────────────────────────────────────

describe('getRoomName', () => {
  it('should return lga-prefixed room name', () => {
    expect(getRoomName('ibadan_north')).toBe('lga:ibadan_north');
  });

  it('should handle different LGA IDs', () => {
    expect(getRoomName('akinyele')).toBe('lga:akinyele');
    expect(getRoomName('egbeda')).toBe('lga:egbeda');
  });
});

// ── Tests: canJoinRoom ──────────────────────────────────────────────────────

describe('canJoinRoom', () => {
  it('should allow supervisor to join their LGA room', () => {
    const user = makeUser({ role: UserRole.SUPERVISOR, lgaId: 'ibadan_north' });
    expect(canJoinRoom(user, 'lga:ibadan_north')).toBe(true);
  });

  it('should allow enumerator to join their LGA room', () => {
    const user = makeUser({ role: UserRole.ENUMERATOR, lgaId: 'ibadan_north' });
    expect(canJoinRoom(user, 'lga:ibadan_north')).toBe(true);
  });

  it('should reject supervisor from different LGA room', () => {
    const user = makeUser({ role: UserRole.SUPERVISOR, lgaId: 'ibadan_north' });
    expect(canJoinRoom(user, 'lga:akinyele')).toBe(false);
  });

  it('should reject enumerator from different LGA room', () => {
    const user = makeUser({ role: UserRole.ENUMERATOR, lgaId: 'akinyele' });
    expect(canJoinRoom(user, 'lga:ibadan_north')).toBe(false);
  });

  it('should reject user without lgaId', () => {
    const user = makeUser({ lgaId: undefined });
    expect(canJoinRoom(user, 'lga:ibadan_north')).toBe(false);
  });

  it('should reject unauthorized roles', () => {
    const admin = makeUser({ role: UserRole.SUPER_ADMIN, lgaId: 'ibadan_north' });
    expect(canJoinRoom(admin, 'lga:ibadan_north')).toBe(false);

    const clerk = makeUser({ role: UserRole.DATA_ENTRY_CLERK, lgaId: 'ibadan_north' });
    expect(canJoinRoom(clerk, 'lga:ibadan_north')).toBe(false);

    const publicUser = makeUser({ role: UserRole.PUBLIC_USER, lgaId: 'ibadan_north' });
    expect(canJoinRoom(publicUser, 'lga:ibadan_north')).toBe(false);
  });
});

// ── Tests: REALTIME_ROLES ───────────────────────────────────────────────────

describe('REALTIME_ROLES', () => {
  it('should include supervisor and enumerator', () => {
    expect(REALTIME_ROLES).toContain(UserRole.SUPERVISOR);
    expect(REALTIME_ROLES).toContain(UserRole.ENUMERATOR);
  });

  it('should not include other roles', () => {
    expect(REALTIME_ROLES).not.toContain(UserRole.SUPER_ADMIN);
    expect(REALTIME_ROLES).not.toContain(UserRole.DATA_ENTRY_CLERK);
    expect(REALTIME_ROLES).not.toContain(UserRole.PUBLIC_USER);
  });
});
