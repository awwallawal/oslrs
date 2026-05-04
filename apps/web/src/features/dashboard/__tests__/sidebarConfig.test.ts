/**
 * Sidebar Configuration Tests
 *
 * Story 2.5-1 AC5: Dynamic Sidebar Items
 *
 * Tests the sidebar configuration module.
 */

import { describe, it, expect } from 'vitest';
import type { UserRole } from '@oslsr/types';
import {
  sidebarConfig,
  roleRouteMap,
  ROLE_DISPLAY_NAMES,
  getSidebarItems,
  getDashboardRoute,
  getRoleDisplayName,
  ALL_ROLES,
} from '../config/sidebarConfig';

describe('sidebarConfig', () => {
  describe('Configuration completeness', () => {
    it('has sidebar config for all roles', () => {
      ALL_ROLES.forEach((role) => {
        expect(sidebarConfig[role]).toBeDefined();
        expect(Array.isArray(sidebarConfig[role])).toBe(true);
        expect(sidebarConfig[role].length).toBeGreaterThan(0);
      });
    });

    it('has route mapping for all roles', () => {
      ALL_ROLES.forEach((role) => {
        expect(roleRouteMap[role]).toBeDefined();
        expect(roleRouteMap[role].startsWith('/dashboard/')).toBe(true);
      });
    });

    it('has display name for all roles', () => {
      ALL_ROLES.forEach((role) => {
        expect(ROLE_DISPLAY_NAMES[role]).toBeDefined();
        expect(ROLE_DISPLAY_NAMES[role].length).toBeGreaterThan(0);
      });
    });
  });

  describe('AC5: Sidebar item counts per role', () => {
    it('enumerator has 7 sidebar items (mobile-first + messages + payments + stats)', () => {
      const items = sidebarConfig.enumerator;
      expect(items.length).toBe(7);
    });

    it('public_user has 3-4 sidebar items (mobile-first)', () => {
      const items = sidebarConfig.public_user;
      expect(items.length).toBeGreaterThanOrEqual(3);
      expect(items.length).toBeLessThanOrEqual(4);
    });

    it('supervisor has exactly 8 sidebar items (AC3 + Registry + Productivity + Payments + Team Analytics)', () => {
      const items = sidebarConfig.supervisor;
      expect(items.length).toBe(8);
    });

    it('data_entry_clerk has exactly 4 sidebar items', () => {
      const items = sidebarConfig.data_entry_clerk;
      expect(items.length).toBe(4);
    });

    it('verification_assessor has exactly 7 sidebar items', () => {
      const items = sidebarConfig.verification_assessor;
      expect(items.length).toBe(7);
    });

    it('government_official has exactly 6 sidebar items', () => {
      const items = sidebarConfig.government_official;
      expect(items.length).toBe(6);
    });

    it('super_admin has exactly 15 sidebar items', () => {
      // 13 base items + MFA Settings (Story 9-13) + Audit Log (Story 9-11)
      const items = sidebarConfig.super_admin;
      expect(items.length).toBe(15);
    });

    it('super_admin has Audit Log sidebar item between System Health and MFA Settings', () => {
      const items = sidebarConfig.super_admin;
      const auditIdx = items.findIndex((i) => i.label === 'Audit Log');
      const systemIdx = items.findIndex((i) => i.label === 'System Health');
      const mfaIdx = items.findIndex((i) => i.label === 'MFA Settings');
      expect(auditIdx).toBeGreaterThan(-1);
      expect(items[auditIdx].href).toBe('/dashboard/super-admin/audit-log');
      expect(auditIdx).toBeGreaterThan(systemIdx);
      expect(auditIdx).toBeLessThan(mfaIdx);
    });

    // Story 6.5: Payments sidebar item for enumerator and supervisor
    it('enumerator has Payments sidebar item', () => {
      const payments = sidebarConfig.enumerator.find(i => i.label === 'Payments');
      expect(payments).toBeDefined();
      expect(payments?.href).toBe('/dashboard/enumerator/payments');
    });

    it('supervisor has Payments sidebar item', () => {
      const payments = sidebarConfig.supervisor.find(i => i.label === 'Payments');
      expect(payments).toBeDefined();
      expect(payments?.href).toBe('/dashboard/supervisor/payments');
    });

    it('super_admin has Fraud Thresholds sidebar item', () => {
      const thresholds = sidebarConfig.super_admin.find(i => i.label === 'Fraud Thresholds');
      expect(thresholds).toBeDefined();
      expect(thresholds?.href).toBe('/dashboard/super-admin/settings/fraud-thresholds');
    });

    it('super_admin has Survey Analytics sidebar item after Reveal Analytics', () => {
      const items = sidebarConfig.super_admin;
      const surveyIdx = items.findIndex(i => i.label === 'Survey Analytics');
      const revealIdx = items.findIndex(i => i.label === 'Reveal Analytics');
      expect(surveyIdx).toBeGreaterThan(-1);
      expect(items[surveyIdx].href).toBe('/dashboard/super-admin/survey-analytics');
      expect(surveyIdx).toBeGreaterThan(revealIdx);
    });

    // Story 8.3: Team Analytics + My Stats sidebar items
    it('supervisor has Team Analytics sidebar item', () => {
      const item = sidebarConfig.supervisor.find(i => i.label === 'Team Analytics');
      expect(item).toBeDefined();
      expect(item?.href).toBe('/dashboard/supervisor/analytics');
    });

    it('enumerator has My Stats sidebar item', () => {
      const item = sidebarConfig.enumerator.find(i => i.label === 'My Stats');
      expect(item).toBeDefined();
      expect(item?.href).toBe('/dashboard/enumerator/stats');
    });

    it('clerk has My Stats sidebar item', () => {
      const item = sidebarConfig.data_entry_clerk.find(i => i.label === 'My Stats');
      expect(item).toBeDefined();
      expect(item?.href).toBe('/dashboard/clerk/stats');
    });

    // Story 8.4: Assessor Analytics sidebar item
    it('verification_assessor has Analytics sidebar item', () => {
      const item = sidebarConfig.verification_assessor.find(i => i.label === 'Analytics');
      expect(item).toBeDefined();
      expect(item?.href).toBe('/dashboard/assessor/analytics');
    });

    it('verification_assessor Analytics item is positioned after Audit Queue', () => {
      const items = sidebarConfig.verification_assessor;
      const queueIdx = items.findIndex(i => i.label === 'Audit Queue');
      const analyticsIdx = items.findIndex(i => i.label === 'Analytics');
      expect(analyticsIdx).toBeGreaterThan(queueIdx);
    });
  });

  describe('Nav item structure', () => {
    it('each nav item has required properties', () => {
      ALL_ROLES.forEach((role) => {
        sidebarConfig[role].forEach((item) => {
          expect(item.label).toBeDefined();
          expect(typeof item.label).toBe('string');
          expect(item.href).toBeDefined();
          expect(typeof item.href).toBe('string');
          expect(item.icon).toBeDefined();
        });
      });
    });

    it('all hrefs start with the correct role route prefix', () => {
      ALL_ROLES.forEach((role) => {
        const baseRoute = roleRouteMap[role];
        sidebarConfig[role].forEach((item) => {
          expect(item.href.startsWith(baseRoute.split('/').slice(0, 3).join('/'))).toBe(true);
        });
      });
    });

    it('each role has a Home item as first nav item', () => {
      ALL_ROLES.forEach((role) => {
        const firstItem = sidebarConfig[role][0];
        expect(firstItem.label).toBe('Home');
      });
    });
  });

  describe('Helper functions', () => {
    describe('getSidebarItems', () => {
      it('returns correct items for valid role', () => {
        const items = getSidebarItems('super_admin');
        expect(items).toBe(sidebarConfig.super_admin);
      });

      it('returns empty array for invalid role', () => {
        const items = getSidebarItems('invalid_role');
        expect(items).toEqual([]);
      });
    });

    describe('getDashboardRoute', () => {
      it('returns correct route for valid role', () => {
        expect(getDashboardRoute('super_admin')).toBe('/dashboard/super-admin');
        expect(getDashboardRoute('enumerator')).toBe('/dashboard/enumerator');
        expect(getDashboardRoute('public_user')).toBe('/dashboard/public');
      });

      it('returns /unauthorized for invalid role', () => {
        expect(getDashboardRoute('invalid_role')).toBe('/unauthorized');
      });
    });

    describe('getRoleDisplayName', () => {
      it('returns correct display name for valid role', () => {
        expect(getRoleDisplayName('super_admin')).toBe('Super Admin');
        expect(getRoleDisplayName('public_user')).toBe('Public User');
        expect(getRoleDisplayName('data_entry_clerk')).toBe('Data Entry Clerk');
      });

      it('returns sentence-cased fallback for invalid role', () => {
        expect(getRoleDisplayName('invalid_role')).toBe('Invalid Role');
      });
    });
  });

  describe('Route mapping consistency', () => {
    const expectedRoutes: Record<UserRole, string> = {
      super_admin: '/dashboard/super-admin',
      supervisor: '/dashboard/supervisor',
      enumerator: '/dashboard/enumerator',
      data_entry_clerk: '/dashboard/clerk',
      verification_assessor: '/dashboard/assessor',
      government_official: '/dashboard/official',
      public_user: '/dashboard/public',
    };

    Object.entries(expectedRoutes).forEach(([role, expectedRoute]) => {
      it(`${role} maps to ${expectedRoute}`, () => {
        expect(roleRouteMap[role as UserRole]).toBe(expectedRoute);
      });
    });
  });
});
