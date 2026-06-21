import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
import { getRevealGuardConfig } from '../config/reveal-guard.config.js';
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

const USER_KEY = (userId: string) => `rl:reveal:user:${userId}`;
const DEVICE_KEY = (fp: string) => `rl:reveal:device:${fp}`;
const GLOBAL_KEY = 'rl:reveal:global';

export interface RevealRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
  /**
   * AC#4 — true once aggregate reveal volume across ALL viewers in the window
   * has crossed the global breaker threshold. The breaker DEGRADES (the service
   * requires step-up) rather than hard-blocking, so this never forces
   * `allowed=false`. Undefined when Redis is unavailable / test mode.
   */
  breakerTripped?: boolean;
}

/**
 * Ensure a freshly-created counter key always has the window TTL set, resilient
 * to a crash between INCR and EXPIRE.
 */
async function ensureTtl(redis: NonNullable<ReturnType<typeof getRedisClient>>, key: string): Promise<void> {
  const ttl = await redis.ttl(key);
  if (ttl < 0) {
    await redis.expire(key, REVEAL_WINDOW_SECONDS);
  }
}

/**
 * Redis-accelerated rate limiter for contact reveals.
 *
 * Three layered counters in the rolling window:
 *   - per-user (REVEAL_LIMIT = 50/24h) — the original budget (unchanged).
 *   - per-device (AC#3) — ENFORCED, not observe-only. A device fingerprint
 *     shared across multiple viewer accounts AGGREGATES toward one budget, so
 *     lazy fan-out across throwaway accounts on the same device shares (and
 *     exhausts) a single allowance. NOTE: the fingerprint is client-supplied
 *     and therefore rotatable — this is BAR-RAISING, not load-bearing. The
 *     global breaker (AC#4) is the real backstop.
 *   - global (AC#4) — aggregate across all viewers; trips the breaker.
 *
 * The SQL count in MarketplaceService.revealContact() remains the source of
 * truth for the per-user limit (Redis restart / TTL drift fallback).
 */
export async function checkRevealRateLimit(
  userId: string,
  deviceFingerprint?: string | null,
): Promise<RevealRateLimitResult> {
  if (isTestMode()) {
    return { allowed: true, remaining: REVEAL_LIMIT };
  }

  const redis = getRedisClient();
  if (!redis) {
    // Redis unavailable — fall through to SQL count in service
    return { allowed: true, remaining: REVEAL_LIMIT };
  }

  const cfg = getRevealGuardConfig();

  try {
    // 1. Per-user budget
    const userKey = USER_KEY(userId);
    const userCount = await redis.incr(userKey);
    await ensureTtl(redis, userKey);

    if (userCount > REVEAL_LIMIT) {
      await redis.decr(userKey);
      const ttl = await redis.ttl(userKey);
      return {
        allowed: false,
        remaining: 0,
        retryAfter: ttl > 0 ? ttl : REVEAL_WINDOW_SECONDS,
      };
    }

    // 2. Per-device budget (AC#3 — ENFORCED). Aggregated across all accounts
    //    sharing this fingerprint. Omitting the fingerprint no longer multiplies
    //    a viewer's effective limit — the per-user budget above still binds.
    if (deviceFingerprint) {
      const deviceKey = DEVICE_KEY(deviceFingerprint);
      const deviceCount = await redis.incr(deviceKey);
      await ensureTtl(redis, deviceKey);

      if (deviceCount > cfg.deviceMaxReveals) {
        // Roll back BOTH counters — a device-blocked attempt counts against neither.
        await redis.decr(deviceKey);
        await redis.decr(userKey);
        const ttl = await redis.ttl(deviceKey);
        logger.warn({ event: 'reveal.device_budget_exhausted', deviceFingerprint });
        return {
          allowed: false,
          remaining: 0,
          retryAfter: ttl > 0 ? ttl : REVEAL_WINDOW_SECONDS,
        };
      }
    }

    // 3. Global breaker counter (AC#4) — observe aggregate volume. Never blocks.
    let breakerTripped = false;
    const globalCount = await redis.incr(GLOBAL_KEY);
    await ensureTtl(redis, GLOBAL_KEY);
    if (globalCount > cfg.globalBreakerMax) {
      breakerTripped = true;
      logger.warn({ event: 'reveal.global_breaker_tripped', globalCount, threshold: cfg.globalBreakerMax });
    }

    return { allowed: true, remaining: REVEAL_LIMIT - userCount, breakerTripped };
  } catch (err) {
    logger.warn({ event: 'reveal.redis_rate_limit_failed', error: (err as Error).message });
    // Redis error — fall through to SQL count in service
    return { allowed: true, remaining: REVEAL_LIMIT };
  }
}

/**
 * Roll back the counters incremented by a PASSING `checkRevealRateLimit` when
 * the reveal is ultimately NOT inserted (blocked by a downstream guard:
 * per-profile cap, step-up, purpose, or the SQL 50/24h recount).
 *
 * Why this matters (F-007 review M1): `checkRevealRateLimit` optimistically
 * INCRs the user/device/global counters BEFORE the service decides whether the
 * reveal actually happens. Without this rollback:
 *   - a viewer who repeatedly hits step-up/purpose burns their fast-path budget
 *     and gets a spurious 429 well before 50 *successful* reveals; and
 *   - blocked retries keep inflating the GLOBAL counter, so once the breaker
 *     trips it can never recover within the window (a self-sustaining lockout).
 *
 * Keeping the counters aligned with *successful* reveals fixes both. No-ops in
 * test mode / when Redis is unavailable (mirrors checkRevealRateLimit). Never
 * throws — a rollback failure must not break the reveal response.
 */
export async function rollbackRevealCounters(
  userId: string,
  deviceFingerprint?: string | null,
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.decr(USER_KEY(userId));
    await redis.decr(GLOBAL_KEY);
    if (deviceFingerprint) {
      await redis.decr(DEVICE_KEY(deviceFingerprint));
    }
  } catch (err) {
    logger.warn({ event: 'reveal.rate_limit_rollback_failed', error: (err as Error).message });
  }
}
