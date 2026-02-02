// @vitest-environment jsdom
/**
 * useOdkHealth Hook Tests
 *
 * Story 2.5-2: Tests for ODK health hooks
 *
 * Tests query key configuration which is the critical piece
 * for cache invalidation and data fetching consistency.
 */

import { describe, it, expect } from 'vitest';
import { odkHealthKeys } from '../useOdkHealth';

describe('useOdkHealth hooks', () => {
  describe('Query Key Factory', () => {
    it('odkHealthKeys.all returns base key', () => {
      expect(odkHealthKeys.all).toEqual(['odk']);
    });

    it('odkHealthKeys.health returns correct key', () => {
      expect(odkHealthKeys.health()).toEqual(['odk', 'health']);
    });

    it('odkHealthKeys.failures returns correct key', () => {
      expect(odkHealthKeys.failures()).toEqual(['odk', 'failures']);
    });

    it('odkHealthKeys.gaps returns correct key', () => {
      expect(odkHealthKeys.gaps()).toEqual(['odk', 'gaps']);
    });

    it('odkHealthKeys.backfill returns correct key', () => {
      expect(odkHealthKeys.backfill()).toEqual(['odk', 'backfill']);
    });

    it('all keys are prefixed with odk for proper cache grouping', () => {
      const allKeys = [
        odkHealthKeys.all,
        odkHealthKeys.health(),
        odkHealthKeys.failures(),
        odkHealthKeys.gaps(),
        odkHealthKeys.backfill(),
      ];

      allKeys.forEach((key) => {
        expect(key[0]).toBe('odk');
      });
    });
  });
});
