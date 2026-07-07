import { describe, it, expect } from 'vitest';

import { isViewAsManagementRoute, viewAsReadOnlyError } from '../view-as.middleware.js';
import { AppError } from '@oslsr/utils';

// (2026-07-07 hygiene) The standalone `attachViewAsState` / `blockMutationsInViewAs`
// middleware were removed as dead code (mounted on no route — enforcement is the
// inline `authenticate` path). These tests now exercise the shared PURE decision
// (`viewAsReadOnlyError` / `isViewAsManagementRoute`) that `authenticate` calls,
// so the read-only + F-010 bypass coverage is preserved without the dead wrappers.

describe('View-As read-only enforcement', () => {
  describe('viewAsReadOnlyError — mutation blocking', () => {
    it('blocks POST requests when View-As active', () => {
      const req = { viewAs: { targetRole: 'enumerator' }, method: 'POST' } as any;
      const err = viewAsReadOnlyError(req);
      expect(err).toBeInstanceOf(AppError);
      expect(err?.statusCode).toBe(403);
      expect(err?.message).toBe('Actions disabled in View-As mode');
    });

    it('blocks PUT/PATCH/DELETE requests when View-As active', () => {
      for (const method of ['PUT', 'PATCH', 'DELETE']) {
        const req = { viewAs: { targetRole: 'enumerator' }, method } as any;
        expect(viewAsReadOnlyError(req)).toBeInstanceOf(AppError);
      }
    });

    it('allows GET requests when View-As active', () => {
      const req = { viewAs: { targetRole: 'enumerator' }, method: 'GET' } as any;
      expect(viewAsReadOnlyError(req)).toBeNull();
    });

    it('does nothing when no View-As session', () => {
      const req = { method: 'POST' } as any;
      expect(viewAsReadOnlyError(req)).toBeNull();
    });

    // ── Story 9-45 AC#2 (F-010) — query-string bypass closed ───────────

    it('BLOCKS a mutation whose query string spoofs a view-as path (the F-010 bypass)', () => {
      const req = {
        viewAs: { targetRole: 'enumerator' },
        method: 'POST',
        originalUrl: '/api/v1/staff/abc/deactivate?x=/view-as/end',
      } as any;
      const err = viewAsReadOnlyError(req);
      expect(err).toBeInstanceOf(AppError);
      expect(err?.statusCode).toBe(403);
    });

    it('ALLOWS the legitimate POST /view-as/end while View-As is active', () => {
      const req = {
        viewAs: { targetRole: 'enumerator' },
        method: 'POST',
        originalUrl: '/api/v1/view-as/end',
      } as any;
      expect(viewAsReadOnlyError(req)).toBeNull();
    });

    it('ALLOWS POST /view-as/start (with a trailing slash / query)', () => {
      const req = {
        viewAs: { targetRole: 'enumerator' },
        method: 'POST',
        originalUrl: '/api/v1/view-as/start?foo=bar',
      } as any;
      expect(viewAsReadOnlyError(req)).toBeNull();
    });
  });

  describe('isViewAsManagementRoute / viewAsReadOnlyError (F-010 exact-path)', () => {
    it('matches exact management pathnames, not query-string substrings', () => {
      expect(isViewAsManagementRoute({ originalUrl: '/api/v1/view-as/end' } as any)).toBe(true);
      expect(isViewAsManagementRoute({ originalUrl: '/api/v1/view-as/start?x=1' } as any)).toBe(true);
      expect(isViewAsManagementRoute({ originalUrl: '/api/v1/staff/x/deactivate?x=/view-as/end' } as any)).toBe(false);
      expect(isViewAsManagementRoute({ originalUrl: '/api/v1/staff/view-as/end-run' } as any)).toBe(false);
    });

    it('viewAsReadOnlyError returns null for non-mutations and when not in view-as', () => {
      expect(viewAsReadOnlyError({ method: 'GET', viewAs: {}, originalUrl: '/api/v1/x' } as any)).toBeNull();
      expect(viewAsReadOnlyError({ method: 'POST', originalUrl: '/api/v1/x' } as any)).toBeNull();
    });
  });
});
