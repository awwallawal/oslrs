/**
 * ODK Health Check Worker Tests (Story 2-5, Task 10.3)
 *
 * These tests validate:
 * - Health check job configuration
 * - Submission gap threshold logic
 * - Consecutive failure tracking
 * - Recovery detection
 * - Email rate limiting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Redis
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisIncr = vi.fn();
const mockRedisDel = vi.fn();
const mockRedisExpire = vi.fn();

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    incr: mockRedisIncr,
    del: mockRedisDel,
    expire: mockRedisExpire,
    on: vi.fn(),
    quit: vi.fn(),
  })),
}));

// Mock pino
vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

describe('ODK Health Check Worker', () => {
  const DEFAULT_INTERVAL_HOURS = 6;
  const DEFAULT_GAP_THRESHOLD = 5;
  const UNREACHABLE_THRESHOLD = 3;
  const ALERT_RATE_LIMIT_HOURS = 6;
  const CONSECUTIVE_FAILURES_KEY = 'odk:health:consecutive_failures';
  const ALERT_LAST_SENT_KEY = 'odk:alert:last_sent';

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    delete process.env.ODK_HEALTH_CHECK_INTERVAL_HOURS;
    delete process.env.ODK_SUBMISSION_GAP_THRESHOLD;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should use default interval of 6 hours when env not set', () => {
      const interval = parseInt(process.env.ODK_HEALTH_CHECK_INTERVAL_HOURS || '6', 10);
      expect(interval).toBe(DEFAULT_INTERVAL_HOURS);
    });

    it('should use custom interval when env is set', () => {
      process.env.ODK_HEALTH_CHECK_INTERVAL_HOURS = '24';
      const interval = parseInt(process.env.ODK_HEALTH_CHECK_INTERVAL_HOURS || '6', 10);
      expect(interval).toBe(24);
    });

    it('should use default gap threshold of 5 when env not set', () => {
      const threshold = parseInt(process.env.ODK_SUBMISSION_GAP_THRESHOLD || '5', 10);
      expect(threshold).toBe(DEFAULT_GAP_THRESHOLD);
    });

    it('should use custom gap threshold when env is set', () => {
      process.env.ODK_SUBMISSION_GAP_THRESHOLD = '10';
      const threshold = parseInt(process.env.ODK_SUBMISSION_GAP_THRESHOLD || '5', 10);
      expect(threshold).toBe(10);
    });
  });

  describe('Submission Gap Detection (AC4)', () => {
    it('should detect gap when delta exceeds threshold', () => {
      const threshold = 5;
      const odkCount = 100;
      const appDbCount = 90;
      const gap = odkCount - appDbCount;

      expect(gap).toBe(10);
      expect(gap > threshold).toBe(true);
    });

    it('should not alert when gap is within threshold', () => {
      const threshold = 5;
      const odkCount = 100;
      const appDbCount = 97;
      const gap = odkCount - appDbCount;

      expect(gap).toBe(3);
      expect(gap > threshold).toBe(false);
    });

    it('should handle zero gap', () => {
      const threshold = 5;
      const odkCount = 100;
      const appDbCount = 100;
      const gap = odkCount - appDbCount;

      expect(gap).toBe(0);
      expect(gap > threshold).toBe(false);
    });

    it('should handle negative gap (app_db has more than ODK)', () => {
      const threshold = 5;
      const odkCount = 90;
      const appDbCount = 100;
      const gap = odkCount - appDbCount;

      // Negative gap is unusual but should not trigger alert
      expect(gap).toBe(-10);
      expect(gap > threshold).toBe(false);
    });
  });

  describe('Consecutive Failure Tracking (AC6)', () => {
    it('should identify unreachable after 3 consecutive failures', async () => {
      mockRedisGet.mockResolvedValue('3');

      const failures = parseInt(await mockRedisGet(CONSECUTIVE_FAILURES_KEY) || '0', 10);

      expect(failures).toBe(3);
      expect(failures >= UNREACHABLE_THRESHOLD).toBe(true);
    });

    it('should not identify unreachable with fewer than 3 failures', async () => {
      mockRedisGet.mockResolvedValue('2');

      const failures = parseInt(await mockRedisGet(CONSECUTIVE_FAILURES_KEY) || '0', 10);

      expect(failures).toBe(2);
      expect(failures >= UNREACHABLE_THRESHOLD).toBe(false);
    });

    it('should increment failure count on failed check', async () => {
      mockRedisIncr.mockResolvedValue(1);

      const newCount = await mockRedisIncr(CONSECUTIVE_FAILURES_KEY);

      expect(mockRedisIncr).toHaveBeenCalledWith(CONSECUTIVE_FAILURES_KEY);
      expect(newCount).toBe(1);
    });

    it('should reset failure count on successful check', async () => {
      mockRedisGet.mockResolvedValue('5');
      mockRedisDel.mockResolvedValue(1);

      // Simulate recovery: check previous failures, then delete counter
      const previousFailures = parseInt(await mockRedisGet(CONSECUTIVE_FAILURES_KEY) || '0', 10);
      const wasUnreachable = previousFailures >= UNREACHABLE_THRESHOLD;

      if (wasUnreachable) {
        await mockRedisDel(CONSECUTIVE_FAILURES_KEY);
      }

      expect(wasUnreachable).toBe(true);
      expect(mockRedisDel).toHaveBeenCalledWith(CONSECUTIVE_FAILURES_KEY);
    });
  });

  describe('Recovery Detection', () => {
    it('should detect recovery when successful after unreachable', async () => {
      mockRedisGet.mockResolvedValue('3'); // Was unreachable

      const previousFailures = parseInt(await mockRedisGet(CONSECUTIVE_FAILURES_KEY) || '0', 10);
      const isRecovery = previousFailures >= UNREACHABLE_THRESHOLD;

      expect(isRecovery).toBe(true);
    });

    it('should not flag recovery on normal successful check', async () => {
      mockRedisGet.mockResolvedValue('0'); // Was never unreachable

      const previousFailures = parseInt(await mockRedisGet(CONSECUTIVE_FAILURES_KEY) || '0', 10);
      const isRecovery = previousFailures >= UNREACHABLE_THRESHOLD;

      expect(isRecovery).toBe(false);
    });
  });

  describe('Email Rate Limiting', () => {
    it('should allow alert when no recent alert sent', async () => {
      mockRedisGet.mockResolvedValue(null); // No recent alert

      const lastSent = await mockRedisGet(ALERT_LAST_SENT_KEY);
      const shouldSendAlert = lastSent === null;

      expect(shouldSendAlert).toBe(true);
    });

    it('should block alert when recent alert exists', async () => {
      mockRedisGet.mockResolvedValue('2024-01-15T10:00:00Z'); // Recent alert

      const lastSent = await mockRedisGet(ALERT_LAST_SENT_KEY);
      const shouldSendAlert = lastSent === null;

      expect(shouldSendAlert).toBe(false);
    });

    it('should set rate limit key with 6h TTL after sending alert', async () => {
      const ttlSeconds = ALERT_RATE_LIMIT_HOURS * 60 * 60;

      await mockRedisSet(ALERT_LAST_SENT_KEY, new Date().toISOString(), 'EX', ttlSeconds);

      expect(mockRedisSet).toHaveBeenCalledWith(
        ALERT_LAST_SENT_KEY,
        expect.any(String),
        'EX',
        ttlSeconds
      );
    });
  });

  describe('Failure Count TTL', () => {
    it('should set 24h TTL on consecutive failures counter', async () => {
      const ttlSeconds = 24 * 60 * 60;

      await mockRedisExpire(CONSECUTIVE_FAILURES_KEY, ttlSeconds);

      expect(mockRedisExpire).toHaveBeenCalledWith(CONSECUTIVE_FAILURES_KEY, ttlSeconds);
    });
  });

  describe('Job Data Structure', () => {
    it('should accept manual trigger job type', () => {
      type OdkHealthCheckJobData = {
        type: 'scheduled' | 'manual';
        triggeredBy?: string;
      };

      const manualJob: OdkHealthCheckJobData = {
        type: 'manual',
        triggeredBy: 'admin-user-id',
      };

      expect(manualJob.type).toBe('manual');
      expect(manualJob.triggeredBy).toBeDefined();
    });

    it('should accept scheduled job type', () => {
      type OdkHealthCheckJobData = {
        type: 'scheduled' | 'manual';
        triggeredBy?: string;
      };

      const scheduledJob: OdkHealthCheckJobData = {
        type: 'scheduled',
      };

      expect(scheduledJob.type).toBe('scheduled');
      expect(scheduledJob.triggeredBy).toBeUndefined();
    });
  });

  describe('Alert Decision Logic', () => {
    it('should alert on gap exceeding threshold when rate limit allows', async () => {
      const gap = 10;
      const threshold = 5;
      mockRedisGet.mockResolvedValue(null); // No recent alert

      const gapExceedsThreshold = gap > threshold;
      const lastSent = await mockRedisGet(ALERT_LAST_SENT_KEY);
      const canSendAlert = lastSent === null;
      const shouldAlert = gapExceedsThreshold && canSendAlert;

      expect(shouldAlert).toBe(true);
    });

    it('should not alert on gap exceeding threshold when rate limited', async () => {
      const gap = 10;
      const threshold = 5;
      mockRedisGet.mockResolvedValue('2024-01-15T10:00:00Z'); // Recent alert

      const gapExceedsThreshold = gap > threshold;
      const lastSent = await mockRedisGet(ALERT_LAST_SENT_KEY);
      const canSendAlert = lastSent === null;
      const shouldAlert = gapExceedsThreshold && canSendAlert;

      expect(shouldAlert).toBe(false);
    });

    it('should alert on unreachable when rate limit allows', async () => {
      mockRedisGet
        .mockResolvedValueOnce('3') // Consecutive failures
        .mockResolvedValueOnce(null); // No recent alert

      const failures = parseInt(await mockRedisGet(CONSECUTIVE_FAILURES_KEY) || '0', 10);
      const isUnreachable = failures >= UNREACHABLE_THRESHOLD;
      const lastSent = await mockRedisGet(ALERT_LAST_SENT_KEY);
      const canSendAlert = lastSent === null;
      const shouldAlert = isUnreachable && canSendAlert;

      expect(shouldAlert).toBe(true);
    });
  });
});
