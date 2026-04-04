import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import pino from 'pino';

const logger = pino({ name: 'reveal-rate-limit' });

const isTestMode = () =>
  process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';

const getRedisClient = () => {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
};

const REVEAL_LIMIT = 50;
const REVEAL_WINDOW_SECONDS = 86400; // 24 hours

/**
 * Redis-accelerated rate limiter for contact reveals.
 * Fast-path check: Redis INCR with 24h TTL.
 * The SQL count in MarketplaceService.revealContact() remains as fallback
 * (source of truth for edge cases: Redis restart, TTL drift).
 */
export async function checkRevealRateLimit(
  userId: string,
  deviceFingerprint?: string | null,
): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
  if (isTestMode()) {
    return { allowed: true, remaining: REVEAL_LIMIT };
  }

  const redis = getRedisClient();
  if (!redis) {
    // Redis unavailable — fall through to SQL count in service
    return { allowed: true, remaining: REVEAL_LIMIT };
  }

  try {
    // Primary key: per-user
    const userKey = `rl:reveal:user:${userId}`;
    const count = await redis.incr(userKey);

    // Ensure TTL is always set (resilient to crash between INCR and EXPIRE)
    const userTtl = await redis.ttl(userKey);
    if (userTtl < 0) {
      await redis.expire(userKey, REVEAL_WINDOW_SECONDS);
    }

    if (count > REVEAL_LIMIT) {
      // Decrement back — we shouldn't count a blocked attempt
      await redis.decr(userKey);
      const ttl = await redis.ttl(userKey);
      return {
        allowed: false,
        remaining: 0,
        retryAfter: ttl > 0 ? ttl : REVEAL_WINDOW_SECONDS,
      };
    }

    // Optional: track per-device for analytics (don't enforce, just observe)
    if (deviceFingerprint) {
      const deviceKey = `rl:reveal:device:${deviceFingerprint}`;
      await redis.incr(deviceKey);
      const deviceTtl = await redis.ttl(deviceKey);
      if (deviceTtl < 0) {
        await redis.expire(deviceKey, REVEAL_WINDOW_SECONDS);
      }
    }

    return { allowed: true, remaining: REVEAL_LIMIT - count };
  } catch (err) {
    logger.warn({ event: 'reveal.redis_rate_limit_failed', error: (err as Error).message });
    // Redis error — fall through to SQL count in service
    return { allowed: true, remaining: REVEAL_LIMIT };
  }
}
