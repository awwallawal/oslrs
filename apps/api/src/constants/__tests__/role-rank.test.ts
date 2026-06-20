import { describe, it, expect } from 'vitest';
import { ROLE_RANK, rankOf, assertCanAssignRole } from '../role-rank.js';
import { AppError } from '@oslsr/utils';

describe('role-rank (F-021 rank cap primitives)', () => {
  it('super_admin is the strict ceiling', () => {
    const max = Math.max(...Object.values(ROLE_RANK));
    expect(ROLE_RANK.super_admin).toBe(max);
    for (const [role, rank] of Object.entries(ROLE_RANK)) {
      if (role !== 'super_admin') expect(rank).toBeLessThan(ROLE_RANK.super_admin);
    }
  });

  it('rankOf returns the rank for known roles', () => {
    expect(rankOf('super_admin')).toBe(ROLE_RANK.super_admin);
    expect(rankOf('enumerator')).toBe(ROLE_RANK.enumerator);
  });

  it('rankOf fails closed (null) for unknown / empty roles', () => {
    expect(rankOf('totally_made_up')).toBeNull();
    expect(rankOf('')).toBeNull();
    expect(rankOf(null)).toBeNull();
    expect(rankOf(undefined)).toBeNull();
  });

  it('a lower actor cannot out-rank super_admin (cap invariant)', () => {
    const actor = rankOf('supervisor')!;
    const target = rankOf('super_admin')!;
    expect(target > actor).toBe(true); // would be rejected by updateRole
  });
});

describe('assertCanAssignRole (F-021 enforcement)', () => {
  it('allows assigning a role at or below the actor', () => {
    expect(() => assertCanAssignRole('super_admin', 'super_admin')).not.toThrow();
    expect(() => assertCanAssignRole('super_admin', 'enumerator')).not.toThrow();
    expect(() => assertCanAssignRole('government_official', 'supervisor')).not.toThrow();
  });

  it('REJECTS assigning a role more privileged than the actor (escalation)', () => {
    expect(() => assertCanAssignRole('supervisor', 'super_admin')).toThrow(AppError);
    try {
      assertCanAssignRole('supervisor', 'super_admin');
    } catch (e) {
      expect((e as AppError).statusCode).toBe(403);
      expect((e as AppError).code).toBe('FORBIDDEN');
    }
  });

  it('fails closed when either role is unrecognized', () => {
    expect(() => assertCanAssignRole('mystery', 'enumerator')).toThrow(AppError);
    expect(() => assertCanAssignRole('super_admin', 'mystery')).toThrow(AppError);
    expect(() => assertCanAssignRole(undefined, 'enumerator')).toThrow(AppError);
  });
});
