/**
 * Constants Tests
 *
 * Validates the centralized constants for consistency and correctness.
 */

import { describe, it, expect } from 'vitest';
import { APP_VERSION, LAYOUT } from '../constants';

describe('constants', () => {
  describe('APP_VERSION', () => {
    it('matches semver format (X.Y.Z)', () => {
      expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('is a non-empty string', () => {
      expect(APP_VERSION.length).toBeGreaterThan(0);
    });
  });

  describe('LAYOUT', () => {
    describe('sidebar dimensions', () => {
      it('desktop sidebar width is 240px', () => {
        expect(LAYOUT.SIDEBAR_WIDTH).toBe(240);
        expect(LAYOUT.SIDEBAR_WIDTH_CLASS).toBe('w-60');
      });

      it('collapsed sidebar width is 72px', () => {
        expect(LAYOUT.SIDEBAR_COLLAPSED_WIDTH).toBe(72);
        expect(LAYOUT.SIDEBAR_COLLAPSED_WIDTH_CLASS).toBe('w-[72px]');
      });

      it('mobile sheet width is wider than collapsed sidebar', () => {
        expect(LAYOUT.MOBILE_SHEET_WIDTH).toBeGreaterThan(LAYOUT.SIDEBAR_COLLAPSED_WIDTH);
      });

      it('mobile sheet width is 288px', () => {
        expect(LAYOUT.MOBILE_SHEET_WIDTH).toBe(288);
        expect(LAYOUT.MOBILE_SHEET_WIDTH_CLASS).toBe('w-72');
      });
    });

    describe('header dimensions', () => {
      it('desktop header is 64px', () => {
        expect(LAYOUT.HEADER_HEIGHT_DESKTOP).toBe(64);
        expect(LAYOUT.HEADER_HEIGHT_DESKTOP_CLASS).toBe('h-16');
      });

      it('mobile header is 56px', () => {
        expect(LAYOUT.HEADER_HEIGHT_MOBILE).toBe(56);
        expect(LAYOUT.HEADER_HEIGHT_MOBILE_CLASS).toBe('h-14');
      });
    });

    describe('bottom nav dimensions', () => {
      it('bottom nav is 56px (same as mobile header)', () => {
        expect(LAYOUT.BOTTOM_NAV_HEIGHT).toBe(56);
        expect(LAYOUT.BOTTOM_NAV_HEIGHT_CLASS).toBe('h-14');
        expect(LAYOUT.BOTTOM_NAV_HEIGHT).toBe(LAYOUT.HEADER_HEIGHT_MOBILE);
      });
    });

    describe('Tailwind class consistency', () => {
      it('width classes use correct Tailwind values', () => {
        // w-60 = 15rem = 240px
        // w-72 = 18rem = 288px
        // w-[72px] = 72px
        expect(LAYOUT.SIDEBAR_WIDTH / 16).toBe(15); // 240px / 16 = 15rem = w-60
        expect(LAYOUT.MOBILE_SHEET_WIDTH / 16).toBe(18); // 288px / 16 = 18rem = w-72
      });

      it('height classes use correct Tailwind values', () => {
        // h-14 = 3.5rem = 56px
        // h-16 = 4rem = 64px
        expect(LAYOUT.HEADER_HEIGHT_MOBILE / 16).toBe(3.5); // 56px / 16 = 3.5rem = h-14
        expect(LAYOUT.HEADER_HEIGHT_DESKTOP / 16).toBe(4); // 64px / 16 = 4rem = h-16
      });
    });
  });
});
