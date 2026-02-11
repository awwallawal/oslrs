import { describe, it, expect } from 'vitest';
import { UserRole } from '../constants.js';
import {
  ALL_ROLES,
  ROLE_DISPLAY_NAMES,
  FIELD_ROLES,
  getRoleDisplayName,
} from '../roles.js';

describe('Shared Role Constants', () => {
  describe('ALL_ROLES', () => {
    it('contains exactly 7 entries', () => {
      expect(ALL_ROLES).toHaveLength(7);
    });

    it('matches Object.values(UserRole)', () => {
      expect(ALL_ROLES).toEqual(expect.arrayContaining(Object.values(UserRole)));
      expect(Object.values(UserRole)).toEqual(expect.arrayContaining([...ALL_ROLES]));
    });
  });

  describe('ROLE_DISPLAY_NAMES', () => {
    it('has entry for every UserRole value', () => {
      for (const role of Object.values(UserRole)) {
        expect(ROLE_DISPLAY_NAMES).toHaveProperty(role);
        expect(typeof ROLE_DISPLAY_NAMES[role]).toBe('string');
        expect(ROLE_DISPLAY_NAMES[role].length).toBeGreaterThan(0);
      }
    });
  });

  describe('FIELD_ROLES', () => {
    it('contains exactly ENUMERATOR and SUPERVISOR', () => {
      expect(FIELD_ROLES).toHaveLength(2);
      expect(FIELD_ROLES).toContain(UserRole.ENUMERATOR);
      expect(FIELD_ROLES).toContain(UserRole.SUPERVISOR);
    });
  });

  describe('getRoleDisplayName()', () => {
    it('returns correct display names for all 7 roles', () => {
      expect(getRoleDisplayName('super_admin')).toBe('Super Admin');
      expect(getRoleDisplayName('supervisor')).toBe('Supervisor');
      expect(getRoleDisplayName('enumerator')).toBe('Enumerator');
      expect(getRoleDisplayName('data_entry_clerk')).toBe('Data Entry Clerk');
      expect(getRoleDisplayName('verification_assessor')).toBe('Verification Assessor');
      expect(getRoleDisplayName('government_official')).toBe('Government Official');
      expect(getRoleDisplayName('public_user')).toBe('Public User');
    });

    it('returns sentence-cased fallback for unknown input', () => {
      expect(getRoleDisplayName('unknown_role')).toBe('Unknown Role');
      expect(getRoleDisplayName('some_weird_value')).toBe('Some Weird Value');
    });

    it('handles single word input', () => {
      expect(getRoleDisplayName('admin')).toBe('Admin');
    });

    it('returns empty string for empty input', () => {
      expect(getRoleDisplayName('')).toBe('');
    });
  });
});
