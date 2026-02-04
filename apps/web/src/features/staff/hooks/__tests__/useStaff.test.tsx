// @vitest-environment jsdom
/**
 * useStaff Hook Tests
 *
 * Story 2.5-3: Tests for staff management hooks
 *
 * Tests query key factory configuration which is critical for
 * cache invalidation and data fetching consistency.
 */

import { describe, it, expect } from 'vitest';
import { staffKeys, rolesKeys } from '../useStaff';

describe('useStaff hooks', () => {
  describe('staffKeys Query Key Factory', () => {
    it('staffKeys.all returns base key', () => {
      expect(staffKeys.all).toEqual(['staff']);
    });

    it('staffKeys.lists returns correct key', () => {
      expect(staffKeys.lists()).toEqual(['staff', 'list']);
    });

    it('staffKeys.list includes params in key for proper caching', () => {
      const params = { page: 1, limit: 20, status: 'active' as const };
      expect(staffKeys.list(params)).toEqual(['staff', 'list', params]);
    });

    it('staffKeys.list with different params produces different keys', () => {
      const params1 = { page: 1 };
      const params2 = { page: 2 };

      const key1 = staffKeys.list(params1);
      const key2 = staffKeys.list(params2);

      expect(key1).not.toEqual(key2);
    });

    it('staffKeys.details returns correct key', () => {
      expect(staffKeys.details()).toEqual(['staff', 'detail']);
    });

    it('staffKeys.detail includes id in key', () => {
      const userId = 'user-123';
      expect(staffKeys.detail(userId)).toEqual(['staff', 'detail', userId]);
    });

    it('all staffKeys are prefixed with staff for proper cache grouping', () => {
      const allKeys = [
        staffKeys.all,
        staffKeys.lists(),
        staffKeys.list({}),
        staffKeys.details(),
        staffKeys.detail('test-id'),
      ];

      allKeys.forEach((key) => {
        expect(key[0]).toBe('staff');
      });
    });
  });

  describe('rolesKeys Query Key Factory', () => {
    it('rolesKeys.all returns correct key', () => {
      expect(rolesKeys.all).toEqual(['roles']);
    });
  });

  describe('Query key consistency', () => {
    it('staffKeys.list produces consistent keys for same params', () => {
      const params = { page: 1, limit: 10, search: 'test' };

      const key1 = staffKeys.list(params);
      const key2 = staffKeys.list(params);

      expect(key1).toEqual(key2);
    });

    it('staffKeys.list with empty params works correctly', () => {
      const key = staffKeys.list({});
      expect(key).toEqual(['staff', 'list', {}]);
    });
  });
});
