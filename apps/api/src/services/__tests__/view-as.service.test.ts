import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks (required because vi.mock is hoisted to top of file) ───
const { mockRedisGet, mockRedisSet, mockRedisDel, mockLogAction } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisDel: vi.fn(),
  mockLogAction: vi.fn(),
}));

vi.mock('ioredis', () => ({
  Redis: class MockRedis {
    get(...args: unknown[]) { return mockRedisGet(...args); }
    set(...args: unknown[]) { return mockRedisSet(...args); }
    del(...args: unknown[]) { return mockRedisDel(...args); }
  },
}));

vi.mock('../audit.service.js', () => ({
  AuditService: {
    logAction: mockLogAction,
  },
  AUDIT_ACTIONS: {
    VIEW_AS_START: 'view_as.start',
    VIEW_AS_END: 'view_as.end',
  },
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { ViewAsService } from '../view-as.service.js';

// ── Test Fixtures ────────────────────────────────────────────────────────
const ADMIN_ID = '01234567-0000-7000-8000-000000000001';
const LGA_ID = '01234567-0000-7000-8000-000000000010';

const makeReq = (overrides: Record<string, unknown> = {}) => ({
  ip: '127.0.0.1',
  headers: { 'user-agent': 'test-agent' },
  ...overrides,
});

describe('ViewAsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startViewAs', () => {
    it('stores session in Redis with correct TTL', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');

      const result = await ViewAsService.startViewAs({
        adminId: ADMIN_ID,
        targetRole: 'enumerator',
        targetLgaId: LGA_ID,
        reason: 'Debugging reported issue',
        req: makeReq(),
      });

      expect(mockRedisSet).toHaveBeenCalledWith(
        `view_as:${ADMIN_ID}`,
        expect.any(String),
        'EX',
        1800,
      );

      const storedData = JSON.parse(mockRedisSet.mock.calls[0][1]);
      expect(storedData).toMatchObject({
        targetRole: 'enumerator',
        targetLgaId: LGA_ID,
        reason: 'Debugging reported issue',
        startedAt: '2026-03-01T10:00:00.000Z',
      });

      expect(result).toMatchObject({
        targetRole: 'enumerator',
        targetLgaId: LGA_ID,
      });
      expect(result.expiresAt).toBeDefined();
    });

    it('rejects super_admin as target role', async () => {
      await expect(
        ViewAsService.startViewAs({
          adminId: ADMIN_ID,
          targetRole: 'super_admin',
          req: makeReq(),
        }),
      ).rejects.toThrow('Cannot view-as Super Admin');
    });

    it('rejects public_user as target role', async () => {
      await expect(
        ViewAsService.startViewAs({
          adminId: ADMIN_ID,
          targetRole: 'public_user',
          req: makeReq(),
        }),
      ).rejects.toThrow('Cannot view-as Public User');
    });

    it('requires LGA for field roles (enumerator)', async () => {
      await expect(
        ViewAsService.startViewAs({
          adminId: ADMIN_ID,
          targetRole: 'enumerator',
          req: makeReq(),
        }),
      ).rejects.toThrow('LGA selection is required');
    });

    it('requires LGA for field roles (supervisor)', async () => {
      await expect(
        ViewAsService.startViewAs({
          adminId: ADMIN_ID,
          targetRole: 'supervisor',
          req: makeReq(),
        }),
      ).rejects.toThrow('LGA selection is required');
    });

    it('rejects if View-As session already active', async () => {
      mockRedisGet.mockResolvedValue(JSON.stringify({
        targetRole: 'enumerator',
        targetLgaId: LGA_ID,
        startedAt: '2026-03-01T09:00:00.000Z',
        expiresAt: '2026-03-01T09:30:00.000Z',
      }));

      await expect(
        ViewAsService.startViewAs({
          adminId: ADMIN_ID,
          targetRole: 'supervisor',
          targetLgaId: LGA_ID,
          req: makeReq(),
        }),
      ).rejects.toThrow('View-As session already active');
    });

    it('creates audit log on start', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');

      await ViewAsService.startViewAs({
        adminId: ADMIN_ID,
        targetRole: 'data_entry_clerk',
        reason: 'Demo',
        req: makeReq(),
      });

      expect(mockLogAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: ADMIN_ID,
          action: 'view_as.start',
          targetResource: 'user',
          details: expect.objectContaining({
            targetRole: 'data_entry_clerk',
            reason: 'Demo',
          }),
        }),
      );
    });

    it('does not require LGA for non-field roles', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');

      const result = await ViewAsService.startViewAs({
        adminId: ADMIN_ID,
        targetRole: 'verification_assessor',
        req: makeReq(),
      });

      expect(result.targetRole).toBe('verification_assessor');
      expect(result.targetLgaId).toBeNull();
    });
  });

  describe('endViewAs', () => {
    it('removes session from Redis and returns duration', async () => {
      mockRedisGet.mockResolvedValue(JSON.stringify({
        targetRole: 'enumerator',
        targetLgaId: LGA_ID,
        startedAt: '2026-03-01T09:45:00.000Z',
        expiresAt: '2026-03-01T10:15:00.000Z',
      }));
      mockRedisDel.mockResolvedValue(1);

      const result = await ViewAsService.endViewAs(ADMIN_ID, makeReq());

      expect(mockRedisDel).toHaveBeenCalledWith(`view_as:${ADMIN_ID}`);
      expect(result.duration).toBe(900);
    });

    it('throws when no session active', async () => {
      mockRedisGet.mockResolvedValue(null);

      await expect(
        ViewAsService.endViewAs(ADMIN_ID, makeReq()),
      ).rejects.toThrow('No active View-As session');
    });

    it('creates audit log on end with duration', async () => {
      mockRedisGet.mockResolvedValue(JSON.stringify({
        targetRole: 'supervisor',
        targetLgaId: LGA_ID,
        startedAt: '2026-03-01T09:50:00.000Z',
        expiresAt: '2026-03-01T10:20:00.000Z',
      }));
      mockRedisDel.mockResolvedValue(1);

      await ViewAsService.endViewAs(ADMIN_ID, makeReq());

      expect(mockLogAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: ADMIN_ID,
          action: 'view_as.end',
          details: expect.objectContaining({
            targetRole: 'supervisor',
            duration: 600,
          }),
        }),
      );
    });
  });

  describe('getViewAsState', () => {
    it('returns null when no session active', async () => {
      mockRedisGet.mockResolvedValue(null);

      const result = await ViewAsService.getViewAsState(ADMIN_ID);
      expect(result).toBeNull();
    });

    it('returns session data when active', async () => {
      const session = {
        targetRole: 'enumerator',
        targetLgaId: LGA_ID,
        startedAt: '2026-03-01T10:00:00.000Z',
        expiresAt: '2026-03-01T10:30:00.000Z',
        reason: 'Testing',
      };
      mockRedisGet.mockResolvedValue(JSON.stringify(session));

      const result = await ViewAsService.getViewAsState(ADMIN_ID);
      expect(result).toEqual(session);
    });
  });

  describe('isViewingAs', () => {
    it('returns false when no session active', async () => {
      mockRedisGet.mockResolvedValue(null);
      expect(await ViewAsService.isViewingAs(ADMIN_ID)).toBe(false);
    });

    it('returns true when session active', async () => {
      mockRedisGet.mockResolvedValue(JSON.stringify({ targetRole: 'enumerator' }));
      expect(await ViewAsService.isViewingAs(ADMIN_ID)).toBe(true);
    });
  });
});
