/**
 * Reveal Step-Up Proof — Story 9-41 AC#4 / AC#5 (F-007 remediation).
 *
 * Records and reads a short-lived "this viewer has satisfied a step-up rung"
 * marker so the reveal flow can DEGRADE to step-up (rather than hard-block) when
 * a viewer's volume climbs (AC#5) or the global breaker trips (AC#4).
 *
 * Reuse, no net-new auth primitive (AC#5): satisfaction is established by the
 * EXISTING OTP (SmsOtpService) / MFA (MfaService) verification — this module only
 * persists the OUTCOME as a rank, keyed per viewer, with a short TTL. The marker
 * is stored in Redis (no migration; the lifecycle is minutes).
 *
 * Rank-monotonic: recording a weaker rung never downgrades a stronger one that
 * is still live within the window.
 */

import { getRedisClient } from '../lib/redis.js';
import {
  REVEAL_RUNG_RANK,
  type RevealVerificationLevel,
} from '../config/reveal-guard.config.js';
import pino from 'pino';

const logger = pino({ name: 'reveal-step-up' });

/** Step-up proof lifetime — long enough to complete a burst of reveals, short
 *  enough that it must be re-earned for a later session. */
const STEP_UP_TTL_SECONDS = 30 * 60; // 30 minutes

const MARKER_KEY = (viewerId: string) => `reveal:stepup:${viewerId}`;

const isTestMode = () =>
  process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';

export class RevealStepUpService {
  /**
   * Persist that `viewerId` satisfied `level`. Refreshes the TTL. Never
   * downgrades a stronger live marker. No-op (returns silently) in test mode or
   * if Redis is unavailable — callers treat absence as 'captcha' (baseline).
   */
  static async recordSatisfied(
    viewerId: string,
    level: RevealVerificationLevel,
  ): Promise<void> {
    if (isTestMode()) return;
    try {
      const redis = getRedisClient();
      const existing = await redis.get(MARKER_KEY(viewerId));
      const existingRank = existing ? REVEAL_RUNG_RANK[existing as RevealVerificationLevel] ?? 0 : 0;
      const next: RevealVerificationLevel =
        REVEAL_RUNG_RANK[level] >= existingRank ? level : (existing as RevealVerificationLevel);
      await redis.set(MARKER_KEY(viewerId), next, 'EX', STEP_UP_TTL_SECONDS);
      logger.info({ event: 'reveal.step_up_recorded', viewerId, level: next });
    } catch (err) {
      logger.warn({ event: 'reveal.step_up_record_failed', error: (err as Error).message });
    }
  }

  /**
   * Read the highest step-up rung `viewerId` currently holds. Returns 'captcha'
   * (the baseline every reveal already meets via verifyCaptcha) when no marker
   * exists, in test mode, or on any Redis error — failing toward the baseline so
   * a Redis outage cannot silently grant elevated access.
   */
  static async getSatisfiedLevel(viewerId: string): Promise<RevealVerificationLevel> {
    if (isTestMode()) return 'captcha';
    try {
      const redis = getRedisClient();
      const raw = await redis.get(MARKER_KEY(viewerId));
      if (raw && raw in REVEAL_RUNG_RANK) {
        return raw as RevealVerificationLevel;
      }
      return 'captcha';
    } catch (err) {
      logger.warn({ event: 'reveal.step_up_read_failed', error: (err as Error).message });
      return 'captcha';
    }
  }
}
