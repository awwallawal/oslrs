import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetViewAsState } = vi.hoisted(() => ({
  mockGetViewAsState: vi.fn(),
}));

vi.mock('../../services/view-as.service.js', () => ({
  ViewAsService: {
    getViewAsState: mockGetViewAsState,
  },
}));

import { attachViewAsState, blockMutationsInViewAs } from '../view-as.middleware.js';
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
  });
});
