import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

// Chainable query builder — Drizzle builders are thenable
function chainableSelect(finalResult: any[]) {
  const obj: any = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: any, reject: any) => Promise.resolve(finalResult).then(resolve, reject);
      }
      return vi.fn().mockReturnValue(chainableSelect(finalResult));
    },
  });
  return obj;
}

vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: any[]) => mockDbSelect(...args),
  },
}));

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual('drizzle-orm');
  return {
    ...actual as any,
  };
});

vi.mock('../../db/schema/contact-reveals.js', () => ({
  contactReveals: {
    viewerId: 'viewer_id',
    profileId: 'profile_id',
    createdAt: 'created_at',
    deviceFingerprint: 'device_fingerprint',
  },
}));

// ── Import SUT ─────────────────────────────────────────────────────────

import { RevealAnalyticsService } from '../reveal-analytics.service.js';

// ── Tests ──────────────────────────────────────────────────────────────

describe('RevealAnalyticsService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getRevealStats', () => {
    it('should return correct counts for 24h/7d/30d windows', async () => {
      mockDbSelect.mockReturnValue(chainableSelect([{
        total24h: 5,
        total7d: 42,
        total30d: 150,
        uniqueViewers24h: 3,
        uniqueProfiles24h: 4,
      }]));

      const stats = await RevealAnalyticsService.getRevealStats();

      expect(stats).toEqual({
        total24h: 5,
        total7d: 42,
        total30d: 150,
        uniqueViewers24h: 3,
        uniqueProfiles24h: 4,
      });
    });

    it('should return zeros when counts are null', async () => {
      mockDbSelect.mockReturnValue(chainableSelect([{
        total24h: null,
        total7d: null,
        total30d: null,
        uniqueViewers24h: null,
        uniqueProfiles24h: null,
      }]));

      const stats = await RevealAnalyticsService.getRevealStats();

      expect(stats).toEqual({
        total24h: 0,
        total7d: 0,
        total30d: 0,
        uniqueViewers24h: 0,
        uniqueProfiles24h: 0,
      });
    });
  });

  describe('getTopViewers', () => {
    it('should return viewers ordered by reveal count DESC', async () => {
      const mockRows = [
        { viewerId: 'v-1', revealCount: '10', distinctProfiles: '5', lastRevealAt: '2026-03-07T10:00:00Z' },
        { viewerId: 'v-2', revealCount: '3', distinctProfiles: '2', lastRevealAt: '2026-03-06T09:00:00Z' },
      ];
      mockDbSelect.mockReturnValue(chainableSelect(mockRows));

      const viewers = await RevealAnalyticsService.getTopViewers(7, 10);

      expect(viewers).toEqual([
        { viewerId: 'v-1', revealCount: 10, distinctProfiles: 5, lastRevealAt: '2026-03-07T10:00:00Z' },
        { viewerId: 'v-2', revealCount: 3, distinctProfiles: 2, lastRevealAt: '2026-03-06T09:00:00Z' },
      ]);
    });

    it('should respect days and limit parameters', async () => {
      mockDbSelect.mockReturnValue(chainableSelect([]));

      const viewers = await RevealAnalyticsService.getTopViewers(30, 5);

      expect(viewers).toEqual([]);
      expect(mockDbSelect).toHaveBeenCalled();
    });

    it('should return empty array when no reveals in period', async () => {
      mockDbSelect.mockReturnValue(chainableSelect([]));

      const viewers = await RevealAnalyticsService.getTopViewers();

      expect(viewers).toEqual([]);
    });
  });

  describe('getTopProfiles', () => {
    it('should return profiles ordered by reveal count DESC', async () => {
      const mockRows = [
        { profileId: 'p-1', revealCount: '8', distinctViewers: '6', lastRevealAt: '2026-03-07T09:00:00Z' },
      ];
      mockDbSelect.mockReturnValue(chainableSelect(mockRows));

      const profiles = await RevealAnalyticsService.getTopProfiles(7, 10);

      expect(profiles).toEqual([
        { profileId: 'p-1', revealCount: 8, distinctViewers: 6, lastRevealAt: '2026-03-07T09:00:00Z' },
      ]);
    });

    it('should return empty array when no reveals in period', async () => {
      mockDbSelect.mockReturnValue(chainableSelect([]));

      const profiles = await RevealAnalyticsService.getTopProfiles();

      expect(profiles).toEqual([]);
    });
  });

  describe('getSuspiciousDevices', () => {
    it('should return devices used by 2+ accounts', async () => {
      const mockRows = [
        { deviceFingerprint: 'fp_abc', accountCount: '3', totalReveals: '15', lastSeenAt: '2026-03-07T08:00:00Z' },
        { deviceFingerprint: 'fp_def', accountCount: '2', totalReveals: '5', lastSeenAt: '2026-03-06T12:00:00Z' },
      ];
      mockDbSelect.mockReturnValue(chainableSelect(mockRows));

      const devices = await RevealAnalyticsService.getSuspiciousDevices(7, 10);

      expect(devices).toEqual([
        { deviceFingerprint: 'fp_abc', accountCount: 3, totalReveals: 15, lastSeenAt: '2026-03-07T08:00:00Z' },
        { deviceFingerprint: 'fp_def', accountCount: 2, totalReveals: 5, lastSeenAt: '2026-03-06T12:00:00Z' },
      ]);
    });

    it('should return empty array when no suspicious patterns', async () => {
      mockDbSelect.mockReturnValue(chainableSelect([]));

      const devices = await RevealAnalyticsService.getSuspiciousDevices();

      expect(devices).toEqual([]);
    });
  });
});
