import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authorize } from '../../middleware/rbac.js';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const {
  mockGetRevealStats, mockGetTopViewers, mockGetTopProfiles, mockGetSuspiciousDevices,
} = vi.hoisted(() => ({
  mockGetRevealStats: vi.fn(),
  mockGetTopViewers: vi.fn(),
  mockGetTopProfiles: vi.fn(),
  mockGetSuspiciousDevices: vi.fn(),
}));

vi.mock('../../services/reveal-analytics.service.js', () => ({
  RevealAnalyticsService: {
    getRevealStats: (...args: any[]) => mockGetRevealStats(...args),
    getTopViewers: (...args: any[]) => mockGetTopViewers(...args),
    getTopProfiles: (...args: any[]) => mockGetTopProfiles(...args),
    getSuspiciousDevices: (...args: any[]) => mockGetSuspiciousDevices(...args),
  },
}));

// ── Import SUT ─────────────────────────────────────────────────────────

import { RevealAnalyticsController } from '../reveal-analytics.controller.js';

// ── Helpers ────────────────────────────────────────────────────────────

function createMockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const sampleStats = {
  total24h: 5,
  total7d: 42,
  total30d: 150,
  uniqueViewers24h: 3,
  uniqueProfiles24h: 4,
};

const sampleViewers = [
  { viewerId: 'viewer-1', revealCount: 10, distinctProfiles: 5, lastRevealAt: '2026-03-07T10:00:00Z' },
];

const sampleProfiles = [
  { profileId: 'profile-1', revealCount: 8, distinctViewers: 6, lastRevealAt: '2026-03-07T09:00:00Z' },
];

const sampleDevices = [
  { deviceFingerprint: 'fp_abc', accountCount: 3, totalReveals: 15, lastSeenAt: '2026-03-07T08:00:00Z' },
];

// ── Tests ──────────────────────────────────────────────────────────────

describe('RevealAnalyticsController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getStats', () => {
    it('should return reveal stats', async () => {
      mockGetRevealStats.mockResolvedValue(sampleStats);

      const req = { query: {} } as any;
      const res = createMockRes();
      const next = vi.fn();

      await RevealAnalyticsController.getStats(req, res, next);

      expect(mockGetRevealStats).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ data: sampleStats });
    });

    it('should return correct structure with all 5 stat fields', async () => {
      mockGetRevealStats.mockResolvedValue(sampleStats);

      const req = { query: {} } as any;
      const res = createMockRes();
      const next = vi.fn();

      await RevealAnalyticsController.getStats(req, res, next);

      const data = res.json.mock.calls[0][0].data;
      expect(data).toHaveProperty('total24h');
      expect(data).toHaveProperty('total7d');
      expect(data).toHaveProperty('total30d');
      expect(data).toHaveProperty('uniqueViewers24h');
      expect(data).toHaveProperty('uniqueProfiles24h');
    });

    it('should call next on error', async () => {
      mockGetRevealStats.mockRejectedValue(new Error('DB error'));

      const req = { query: {} } as any;
      const res = createMockRes();
      const next = vi.fn();

      await RevealAnalyticsController.getStats(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getTopViewers', () => {
    it('should return top viewers with default params', async () => {
      mockGetTopViewers.mockResolvedValue(sampleViewers);

      const req = { query: {} } as any;
      const res = createMockRes();
      const next = vi.fn();

      await RevealAnalyticsController.getTopViewers(req, res, next);

      expect(mockGetTopViewers).toHaveBeenCalledWith(7, 10);
      expect(res.json).toHaveBeenCalledWith({ data: sampleViewers });
    });

    it('should pass custom days and limit', async () => {
      mockGetTopViewers.mockResolvedValue(sampleViewers);

      const req = { query: { days: '30', limit: '5' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await RevealAnalyticsController.getTopViewers(req, res, next);

      expect(mockGetTopViewers).toHaveBeenCalledWith(30, 5);
    });
  });

  describe('getTopProfiles', () => {
    it('should return top profiles with default params', async () => {
      mockGetTopProfiles.mockResolvedValue(sampleProfiles);

      const req = { query: {} } as any;
      const res = createMockRes();
      const next = vi.fn();

      await RevealAnalyticsController.getTopProfiles(req, res, next);

      expect(mockGetTopProfiles).toHaveBeenCalledWith(7, 10);
      expect(res.json).toHaveBeenCalledWith({ data: sampleProfiles });
    });
  });

  describe('getSuspiciousDevices', () => {
    it('should return suspicious devices with default params', async () => {
      mockGetSuspiciousDevices.mockResolvedValue(sampleDevices);

      const req = { query: {} } as any;
      const res = createMockRes();
      const next = vi.fn();

      await RevealAnalyticsController.getSuspiciousDevices(req, res, next);

      expect(mockGetSuspiciousDevices).toHaveBeenCalledWith(7, 10);
      expect(res.json).toHaveBeenCalledWith({ data: sampleDevices });
    });

    it('should return empty array when no suspicious patterns', async () => {
      mockGetSuspiciousDevices.mockResolvedValue([]);

      const req = { query: {} } as any;
      const res = createMockRes();
      const next = vi.fn();

      await RevealAnalyticsController.getSuspiciousDevices(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ data: [] });
    });
  });

  describe('403 authorization — rejected roles', () => {
    const rejectedRoles = [
      'enumerator',
      'supervisor',
      'data_entry_clerk',
      'verification_assessor',
      'government_official',
      'public_user',
    ] as const;

    const middleware = authorize('super_admin' as any);

    for (const role of rejectedRoles) {
      it(`rejects ${role} with 403`, () => {
        const req = { user: { sub: 'user-1', role } } as any;
        const res = createMockRes();
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        const error = next.mock.calls[0][0];
        expect(error.statusCode).toBe(403);
      });
    }

    it('allows super_admin through authorize middleware', () => {
      const req = { user: { sub: 'user-1', role: 'super_admin' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('query parameter validation', () => {
    it('should reject days > 90', async () => {
      const req = { query: { days: '91' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await RevealAnalyticsController.getTopViewers(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject limit > 50', async () => {
      const req = { query: { limit: '51' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await RevealAnalyticsController.getTopViewers(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject days < 1', async () => {
      const req = { query: { days: '0' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await RevealAnalyticsController.getTopViewers(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
