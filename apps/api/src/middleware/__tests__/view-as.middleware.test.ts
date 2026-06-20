import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetViewAsState } = vi.hoisted(() => ({
  mockGetViewAsState: vi.fn(),
}));

vi.mock('../../services/view-as.service.js', () => ({
  ViewAsService: {
    getViewAsState: mockGetViewAsState,
  },
}));

import {
  attachViewAsState,
  blockMutationsInViewAs,
  isViewAsManagementRoute,
  viewAsReadOnlyError,
} from '../view-as.middleware.js';
import { AppError } from '@oslsr/utils';

const ADMIN_ID = '01234567-0000-7000-8000-000000000001';
const LGA_ID = '01234567-0000-7000-8000-000000000010';

describe('View-As Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('attachViewAsState', () => {
    it('populates req.viewAs when session active', async () => {
      const viewAsState = {
        targetRole: 'enumerator',
        targetLgaId: LGA_ID,
        startedAt: '2026-03-01T10:00:00.000Z',
        expiresAt: '2026-03-01T10:30:00.000Z',
      };
      mockGetViewAsState.mockResolvedValue(viewAsState);

      const req = { user: { sub: ADMIN_ID } } as any;
      const res = {} as any;
      const next = vi.fn();

      await attachViewAsState(req, res, next);

      expect(req.viewAs).toEqual(viewAsState);
      expect(next).toHaveBeenCalledWith();
    });

    it('does nothing when no session active', async () => {
      mockGetViewAsState.mockResolvedValue(null);

      const req = { user: { sub: ADMIN_ID } } as any;
      const res = {} as any;
      const next = vi.fn();

      await attachViewAsState(req, res, next);

      expect(req.viewAs).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });

    it('does nothing when no user on request', async () => {
      const req = {} as any;
      const res = {} as any;
      const next = vi.fn();

      await attachViewAsState(req, res, next);

      expect(mockGetViewAsState).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('blockMutationsInViewAs', () => {
    it('blocks POST requests when View-As active', () => {
      const req = { viewAs: { targetRole: 'enumerator' }, method: 'POST' } as any;
      const res = {} as any;
      const next = vi.fn();

      blockMutationsInViewAs(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Actions disabled in View-As mode');
    });

    it('blocks PUT requests when View-As active', () => {
      const req = { viewAs: { targetRole: 'enumerator' }, method: 'PUT' } as any;
      const res = {} as any;
      const next = vi.fn();

      blockMutationsInViewAs(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });

    it('blocks PATCH requests when View-As active', () => {
      const req = { viewAs: { targetRole: 'enumerator' }, method: 'PATCH' } as any;
      const res = {} as any;
      const next = vi.fn();

      blockMutationsInViewAs(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });

    it('blocks DELETE requests when View-As active', () => {
      const req = { viewAs: { targetRole: 'enumerator' }, method: 'DELETE' } as any;
      const res = {} as any;
      const next = vi.fn();

      blockMutationsInViewAs(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });

    it('allows GET requests when View-As active', () => {
      const req = { viewAs: { targetRole: 'enumerator' }, method: 'GET' } as any;
      const res = {} as any;
      const next = vi.fn();

      blockMutationsInViewAs(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('does nothing when no View-As session', () => {
      const req = { method: 'POST' } as any;
      const res = {} as any;
      const next = vi.fn();

      blockMutationsInViewAs(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    // ── Story 9-45 AC#2 (F-010) — query-string bypass closed ───────────

    it('BLOCKS a mutation whose query string spoofs a view-as path (the F-010 bypass)', () => {
      const req = {
        viewAs: { targetRole: 'enumerator' },
        method: 'POST',
        originalUrl: '/api/v1/staff/abc/deactivate?x=/view-as/end',
      } as any;
      const next = vi.fn();

      blockMutationsInViewAs(req, {} as any, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect((next.mock.calls[0][0] as AppError).statusCode).toBe(403);
    });

    it('ALLOWS the legitimate POST /view-as/end while View-As is active', () => {
      const req = {
        viewAs: { targetRole: 'enumerator' },
        method: 'POST',
        originalUrl: '/api/v1/view-as/end',
      } as any;
      const next = vi.fn();

      blockMutationsInViewAs(req, {} as any, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('ALLOWS POST /view-as/start (with a trailing slash / query)', () => {
      const req = {
        viewAs: { targetRole: 'enumerator' },
        method: 'POST',
        originalUrl: '/api/v1/view-as/start?foo=bar',
      } as any;
      const next = vi.fn();

      blockMutationsInViewAs(req, {} as any, next);

      expect(next).toHaveBeenCalledWith();
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
