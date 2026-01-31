/**
 * ODK Alert Rate Limiter (Story 2-5)
 *
 * Extracted from odk-health-check.worker.ts for testability.
 * Handles rate-limiting of ODK sync alert emails.
 */

import type { Redis } from 'ioredis';

// Redis key for tracking last alert sent
export const ALERT_LAST_SENT_KEY = 'odk:alert:last_sent';

// Default rate limit: 6 hours between alerts
export const DEFAULT_ALERT_RATE_LIMIT_SECONDS = 6 * 60 * 60;

export interface AlertRateLimiterDeps {
  redis: Redis;
  rateLimitSeconds?: number;
}

export interface AlertRateLimiter {
  /**
   * Check if an alert can be sent (not rate-limited)
   */
  canSendAlert(): Promise<boolean>;

  /**
   * Mark that an alert was sent (sets rate limit)
   */
  markAlertSent(): Promise<void>;

  /**
   * Get the timestamp of the last sent alert
   */
  getLastSentTimestamp(): Promise<string | null>;
}

/**
 * Create an alert rate limiter instance
 */
export function createAlertRateLimiter(deps: AlertRateLimiterDeps): AlertRateLimiter {
  const { redis, rateLimitSeconds = DEFAULT_ALERT_RATE_LIMIT_SECONDS } = deps;

  return {
    async canSendAlert(): Promise<boolean> {
      const lastSent = await redis.get(ALERT_LAST_SENT_KEY);
      return lastSent === null;
    },

    async markAlertSent(): Promise<void> {
      const timestamp = new Date().toISOString();
      // setex(key, seconds, value) - Redis command for SET with EX
      await redis.setex(ALERT_LAST_SENT_KEY, rateLimitSeconds, timestamp);
    },

    async getLastSentTimestamp(): Promise<string | null> {
      return redis.get(ALERT_LAST_SENT_KEY);
    },
  };
}
