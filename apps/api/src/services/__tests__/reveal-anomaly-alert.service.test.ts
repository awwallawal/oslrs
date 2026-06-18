import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const {
  mockSendTelegramMessage,
  mockIsAlertSendEnabled,
  mockGetSuspiciousDevices,
  mockGetTopViewers,
} = vi.hoisted(() => ({
  mockSendTelegramMessage: vi.fn(),
  mockIsAlertSendEnabled: vi.fn(),
  mockGetSuspiciousDevices: vi.fn(),
  mockGetTopViewers: vi.fn(),
}));

vi.mock('../alerting/telegram-channel.js', () => ({
  isAlertSendEnabled: () => mockIsAlertSendEnabled(),
  sendTelegramMessage: (...args: any[]) => mockSendTelegramMessage(...args),
}));

vi.mock('../reveal-analytics.service.js', () => ({
  RevealAnalyticsService: {
    getSuspiciousDevices: (...args: any[]) => mockGetSuspiciousDevices(...args),
    getTopViewers: (...args: any[]) => mockGetTopViewers(...args),
  },
}));

import { RevealAnomalyAlertService } from '../reveal-anomaly-alert.service.js';

const T0 = 1_700_000_000_000;

describe('RevealAnomalyAlertService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    RevealAnomalyAlertService.clearCooldowns();
    mockSendTelegramMessage.mockResolvedValue(true);
  });

  describe('alertRevealAnomaly — env gate + cooldown', () => {
    it('does NOT dispatch when alerts are disabled (dev/test)', async () => {
      mockIsAlertSendEnabled.mockReturnValue(false);

      const sent = await RevealAnomalyAlertService.alertRevealAnomaly('reveal.x', 'msg', T0);

      expect(sent).toBe(false);
      expect(mockSendTelegramMessage).not.toHaveBeenCalled();
    });

    it('dispatches when enabled', async () => {
      mockIsAlertSendEnabled.mockReturnValue(true);

      const sent = await RevealAnomalyAlertService.alertRevealAnomaly('reveal.x', 'hello', T0);

      expect(sent).toBe(true);
      expect(mockSendTelegramMessage).toHaveBeenCalledWith('hello');
    });

    it('honours the per-metric cooldown (no repeat page within window)', async () => {
      mockIsAlertSendEnabled.mockReturnValue(true);

      await RevealAnomalyAlertService.alertRevealAnomaly('reveal.x', 'm1', T0);
      // 10 min later — still inside 30 min cooldown
      const second = await RevealAnomalyAlertService.alertRevealAnomaly('reveal.x', 'm2', T0 + 10 * 60 * 1000);

      expect(second).toBe(false);
      expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);
    });

    it('re-pages after the cooldown elapses', async () => {
      mockIsAlertSendEnabled.mockReturnValue(true);

      await RevealAnomalyAlertService.alertRevealAnomaly('reveal.x', 'm1', T0);
      const later = await RevealAnomalyAlertService.alertRevealAnomaly('reveal.x', 'm2', T0 + 31 * 60 * 1000);

      expect(later).toBe(true);
      expect(mockSendTelegramMessage).toHaveBeenCalledTimes(2);
    });

    it('cooldown is per-metric (distinct keys page independently)', async () => {
      mockIsAlertSendEnabled.mockReturnValue(true);

      await RevealAnomalyAlertService.alertRevealAnomaly('reveal.a', 'm', T0);
      const other = await RevealAnomalyAlertService.alertRevealAnomaly('reveal.b', 'm', T0);

      expect(other).toBe(true);
      expect(mockSendTelegramMessage).toHaveBeenCalledTimes(2);
    });

    it('never throws when the channel rejects', async () => {
      mockIsAlertSendEnabled.mockReturnValue(true);
      mockSendTelegramMessage.mockRejectedValue(new Error('telegram down'));

      const sent = await RevealAnomalyAlertService.alertRevealAnomaly('reveal.x', 'm', T0);
      expect(sent).toBe(false);
    });
  });

  describe('runChecks — sweep', () => {
    it('skips DB queries entirely when alerts are disabled', async () => {
      mockIsAlertSendEnabled.mockReturnValue(false);

      const result = await RevealAnomalyAlertService.runChecks(T0);

      expect(mockGetSuspiciousDevices).not.toHaveBeenCalled();
      expect(mockGetTopViewers).not.toHaveBeenCalled();
      expect(result.alertsDispatched).toBe(0);
    });

    it('alerts on a seeded >=2-accounts/device pattern', async () => {
      mockIsAlertSendEnabled.mockReturnValue(true);
      mockGetSuspiciousDevices.mockResolvedValue([
        { deviceFingerprint: 'fp1', accountCount: 4, totalReveals: 30, lastSeenAt: 'x' },
      ]);
      mockGetTopViewers.mockResolvedValue([]);

      const result = await RevealAnomalyAlertService.runChecks(T0);

      expect(result.suspiciousDeviceCount).toBe(1);
      expect(result.alertsDispatched).toBe(1);
      expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);
      expect(mockSendTelegramMessage.mock.calls[0][0]).toContain('suspicious devices');
    });

    it('alerts on a viewer whose velocity reaches the MFA-friction band (default 40)', async () => {
      mockIsAlertSendEnabled.mockReturnValue(true);
      mockGetSuspiciousDevices.mockResolvedValue([]);
      mockGetTopViewers.mockResolvedValue([
        { viewerId: 'v1', revealCount: 45, distinctProfiles: 45, lastRevealAt: 'x' },
        { viewerId: 'v2', revealCount: 3, distinctProfiles: 3, lastRevealAt: 'x' },
      ]);

      const result = await RevealAnomalyAlertService.runChecks(T0);

      expect(result.velocityOffenderCount).toBe(1);
      expect(result.alertsDispatched).toBe(1);
      expect(mockSendTelegramMessage.mock.calls[0][0]).toContain('viewer velocity');
    });

    it('does NOT alert when no viewer crosses the velocity band', async () => {
      mockIsAlertSendEnabled.mockReturnValue(true);
      mockGetSuspiciousDevices.mockResolvedValue([]);
      mockGetTopViewers.mockResolvedValue([
        { viewerId: 'v1', revealCount: 10, distinctProfiles: 10, lastRevealAt: 'x' },
      ]);

      const result = await RevealAnomalyAlertService.runChecks(T0);

      expect(result.velocityOffenderCount).toBe(0);
      expect(result.alertsDispatched).toBe(0);
    });

    it('does not let an analytics query failure break the sweep', async () => {
      mockIsAlertSendEnabled.mockReturnValue(true);
      mockGetSuspiciousDevices.mockRejectedValue(new Error('db down'));
      mockGetTopViewers.mockResolvedValue([]);

      await expect(RevealAnomalyAlertService.runChecks(T0)).resolves.toBeDefined();
    });
  });
});
