import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────
const { mockStartViewAs, mockEndViewAs, mockGetViewAsState } = vi.hoisted(() => ({
  mockStartViewAs: vi.fn(),
  mockEndViewAs: vi.fn(),
  mockGetViewAsState: vi.fn(),
}));

vi.mock('../../services/view-as.service.js', () => ({
  ViewAsService: {
    startViewAs: (...args: any[]) => mockStartViewAs(...args),
    endViewAs: (...args: any[]) => mockEndViewAs(...args),
    getViewAsState: (...args: any[]) => mockGetViewAsState(...args),
  },
}));

import { ViewAsController } from '../view-as.controller.js';
import { AppError } from '@oslsr/utils';

// ── Helpers ────────────────────────────────────────────────────────────
const ADMIN_ID = '01234567-0000-7000-8000-000000000001';
const LGA_ID = '01234567-0000-7000-8000-000000000010';

function createMockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function createMockReq(overrides: Record<string, any> = {}): any {
  return {
    user: { sub: ADMIN_ID, role: 'super_admin', email: 'admin@test.local' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' },
    body: {},
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────
describe('ViewAsController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('startViewAs', () => {
    it('returns session info for valid request', async () => {
      const session = {
        targetRole: 'enumerator',
        targetLgaId: LGA_ID,
        startedAt: '2026-03-01T10:00:00.000Z',
        expiresAt: '2026-03-01T10:30:00.000Z',
      };
      mockStartViewAs.mockResolvedValue(session);

      const req = createMockReq({
        body: { targetRole: 'enumerator', targetLgaId: LGA_ID },
      });
      const res = createMockRes();
      const next = vi.fn();

      await ViewAsController.startViewAs(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          active: true,
          targetRole: 'enumerator',
          targetLgaId: LGA_ID,
        }),
      });
    });

    it('returns validation error for invalid targetRole', async () => {
      const req = createMockReq({
        body: { targetRole: 'invalid_role' },
      });
      const res = createMockRes();
      const next = vi.fn();

      await ViewAsController.startViewAs(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('returns validation error when field role lacks LGA', async () => {
      const req = createMockReq({
        body: { targetRole: 'supervisor' },
      });
      const res = createMockRes();
      const next = vi.fn();

      await ViewAsController.startViewAs(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(400);
    });

    it('passes service errors to next', async () => {
      mockStartViewAs.mockRejectedValue(
        new AppError('VIEW_AS_ALREADY_ACTIVE', 'View-As session already active', 409),
      );

      const req = createMockReq({
        body: { targetRole: 'data_entry_clerk' },
      });
      const res = createMockRes();
      const next = vi.fn();

      await ViewAsController.startViewAs(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(409);
    });
  });

  describe('endViewAs', () => {
    it('returns duration on successful end', async () => {
      mockEndViewAs.mockResolvedValue({ duration: 600 });

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      await ViewAsController.endViewAs(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { active: false, duration: 600 },
      });
    });

    it('passes 404 error when no session active', async () => {
      mockEndViewAs.mockRejectedValue(
        new AppError('VIEW_AS_NOT_FOUND', 'No active View-As session', 404),
      );

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      await ViewAsController.endViewAs(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(404);
    });
  });

  describe('getCurrentState', () => {
    it('returns active: false when no session', async () => {
      mockGetViewAsState.mockResolvedValue(null);

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      await ViewAsController.getCurrentState(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { active: false },
      });
    });

    it('returns session data when active', async () => {
      const state = {
        targetRole: 'enumerator',
        targetLgaId: LGA_ID,
        startedAt: '2026-03-01T10:00:00.000Z',
        expiresAt: '2026-03-01T10:30:00.000Z',
      };
      mockGetViewAsState.mockResolvedValue(state);

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      await ViewAsController.getCurrentState(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          active: true,
          targetRole: 'enumerator',
        }),
      });
    });
  });
});
