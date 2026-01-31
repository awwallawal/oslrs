/**
 * ODK Alert Rate Limiter Tests (Story 2-5)
 *
 * Tests the extracted rate-limiting logic for ODK sync alerts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAlertRateLimiter,
  ALERT_LAST_SENT_KEY,
  DEFAULT_ALERT_RATE_LIMIT_SECONDS,
} from '../odk-alert-rate-limiter.js';

describe('OdkAlertRateLimiter', () => {
  // Mock Redis client
  const mockRedis = {
    get: vi.fn(),
    setex: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('canSendAlert', () => {
    it('should return true when no recent alert exists', async () => {
      mockRedis.get.mockResolvedValue(null);

      const limiter = createAlertRateLimiter({ redis: mockRedis as any });
      const result = await limiter.canSendAlert();

      expect(result).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith(ALERT_LAST_SENT_KEY);
    });

    it('should return false when recent alert exists', async () => {
      mockRedis.get.mockResolvedValue('2026-01-31T10:00:00Z');

      const limiter = createAlertRateLimiter({ redis: mockRedis as any });
      const result = await limiter.canSendAlert();

      expect(result).toBe(false);
      expect(mockRedis.get).toHaveBeenCalledWith(ALERT_LAST_SENT_KEY);
    });
  });

  describe('markAlertSent', () => {
    it('should call setex with correct key, TTL, and timestamp', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      const limiter = createAlertRateLimiter({ redis: mockRedis as any });
      await limiter.markAlertSent();

      expect(mockRedis.setex).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        ALERT_LAST_SENT_KEY,
        DEFAULT_ALERT_RATE_LIMIT_SECONDS,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) // ISO timestamp
      );
    });

    it('should use custom rate limit when provided', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      const customTtl = 3600; // 1 hour

      const limiter = createAlertRateLimiter({
        redis: mockRedis as any,
        rateLimitSeconds: customTtl,
      });
      await limiter.markAlertSent();

      expect(mockRedis.setex).toHaveBeenCalledWith(
        ALERT_LAST_SENT_KEY,
        customTtl,
        expect.any(String)
      );
    });

    it('should use default 6-hour TTL', () => {
      expect(DEFAULT_ALERT_RATE_LIMIT_SECONDS).toBe(6 * 60 * 60);
    });
  });

  describe('getLastSentTimestamp', () => {
    it('should return timestamp when alert was sent', async () => {
      const timestamp = '2026-01-31T10:00:00Z';
      mockRedis.get.mockResolvedValue(timestamp);

      const limiter = createAlertRateLimiter({ redis: mockRedis as any });
      const result = await limiter.getLastSentTimestamp();

      expect(result).toBe(timestamp);
    });

    it('should return null when no alert was sent', async () => {
      mockRedis.get.mockResolvedValue(null);

      const limiter = createAlertRateLimiter({ redis: mockRedis as any });
      const result = await limiter.getLastSentTimestamp();

      expect(result).toBeNull();
    });
  });

  describe('Integration: Full rate-limiting flow', () => {
    it('should allow first alert, block second, then allow after TTL expires', async () => {
      // First call: no existing alert
      mockRedis.get.mockResolvedValueOnce(null);
      mockRedis.setex.mockResolvedValue('OK');

      const limiter = createAlertRateLimiter({ redis: mockRedis as any });

      // First alert should be allowed
      const canSendFirst = await limiter.canSendAlert();
      expect(canSendFirst).toBe(true);

      // Mark as sent
      await limiter.markAlertSent();
      expect(mockRedis.setex).toHaveBeenCalled();

      // Second call: alert exists
      mockRedis.get.mockResolvedValueOnce('2026-01-31T10:00:00Z');

      const canSendSecond = await limiter.canSendAlert();
      expect(canSendSecond).toBe(false);

      // After TTL expires: no alert exists
      mockRedis.get.mockResolvedValueOnce(null);

      const canSendAfterExpiry = await limiter.canSendAlert();
      expect(canSendAfterExpiry).toBe(true);
    });
  });
});
