/**
 * Story 13-21 (AC4 — the KEYSTONE) — registration auto-send failure visibility.
 *
 * The 9-58 confirmation + 13-12 thank-you/referral auto-sends are fire-and-forget
 * + fail-soft (correct: a comms failure must never sink an ingestion/registration).
 * But the swallowed `logger.warn` gave ZERO operator signal — a critical mechanism
 * (the referral growth loop) failed silently for the ENTIRE public channel and only
 * surfaced when one registrant was hand-checked. This module is the durable fix:
 *
 *   1. log every auto-send failure at ERROR (not warn) — a counted, greppable signal
 *      even when Redis is down;
 *   2. increment a Redis DAILY failure counter (fail-open — a Redis hiccup never
 *      blocks a send);
 *   3. when the day's failures cross a threshold, PAGE the operator on Telegram
 *      (9-15 channel) ONCE per day (SET NX cooldown) — this is what would have
 *      caught 140 silent failures on day one.
 *
 * NEVER throws. Callers `await` it inside their own fail-soft try/catch, so a
 * monitor failure cannot change send behaviour or fail the registration.
 */
import type { Redis } from 'ioredis';
import pino from 'pino';
import { getRedisClient } from '../lib/redis.js';
import { sendTelegramMessage } from './alerting/telegram-channel.js';

const logger = pino({ name: 'email-autosend-monitor' });

export type AutoSendKind = 'confirmation' | 'thankyou';

/** Default daily failure count that trips a page. Overridable via env. */
const DEFAULT_THRESHOLD = 5;
/** TTL for the daily failure key — 48h covers timezone-edge reads. */
const FAIL_TTL_SECONDS = 48 * 60 * 60;
/** TTL for the once-a-day alert cooldown key. */
const ALERT_TTL_SECONDS = 24 * 60 * 60;

function dateKey(now: Date): string {
  // Story 13-21 (review L4) — UTC day. Nigeria is WAT (UTC+1), so the daily
  // failure counter + the once-per-day page cooldown roll over at 01:00 local.
  // Intentional (simple + consistent across the fleet) — not a local-day bug.
  return now.toISOString().split('T')[0]; // YYYY-MM-DD (UTC)
}

/** Redis key builders — exported so tests assert the exact namespace. */
export const AUTOSEND_KEYS = {
  fail: (date: string) => `email:autosend:fail:${date}`,
  alerted: (date: string) => `email:autosend:alerted:${date}`,
} as const;

function threshold(): number {
  const raw = process.env.AUTOSEND_FAILURE_ALERT_THRESHOLD;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_THRESHOLD;
}

// Test seam: inject a Redis (e.g. ioredis-mock) instead of the shared singleton,
// mirroring NotificationMeter.setRedisForTesting.
let redisOverride: Redis | null = null;
export function setRedisForTesting(redis: Redis | null): void {
  redisOverride = redis;
}
function resolveRedis(): Redis | null {
  if (redisOverride) return redisOverride;
  try {
    return getRedisClient();
  } catch {
    // No Redis configured (test/misconfig) → monitor still logs at ERROR, but
    // the counter/alert path is a no-op. Fail open.
    return null;
  }
}

export interface AutoSendFailureResult {
  /** The day's failure count after this increment (0 when Redis is unavailable). */
  failuresToday: number;
  /** True iff THIS call decided to page the operator (threshold crossed + cooldown won). */
  alerted: boolean;
}

/**
 * Record ONE registration auto-send failure. See module doc. Never throws.
 */
export async function recordAutoSendFailure(args: {
  kind: AutoSendKind;
  respondentId: string;
  error?: string;
}): Promise<AutoSendFailureResult> {
  // The ERROR log is the durable metric — it lands even when Redis is down, and
  // it replaces the swallowed warn that hid the original 140-failure incident.
  logger.error({
    event: 'registration_autosend.failure',
    kind: args.kind,
    respondentId: args.respondentId,
    error: args.error ?? 'unknown',
  });

  const redis = resolveRedis();
  if (!redis) {
    // Story 13-21 (review M2) — LIMITATION: the daily counter AND the Telegram
    // page both require Redis. With no Redis, the ERROR log above is the ONLY
    // signal — no page can fire. Tracked in the story's operator residuals as a
    // known degradation. Fail open (a missing Redis must never block a send).
    return { failuresToday: 0, alerted: false };
  }

  const date = dateKey(new Date());
  let failuresToday = 0;
  try {
    const failKey = AUTOSEND_KEYS.fail(date);
    failuresToday = await redis.incr(failKey);
    await redis.expire(failKey, FAIL_TTL_SECONDS);
  } catch (err) {
    logger.warn({
      event: 'registration_autosend.metric_failed',
      error: err instanceof Error ? err.message : String(err),
    });
    return { failuresToday: 0, alerted: false };
  }

  const limit = threshold();
  if (failuresToday < limit) return { failuresToday, alerted: false };

  // Threshold crossed — page ONCE per day. SET NX on the cooldown key: only the
  // first crosser today acquires it, so subsequent failures don't spam the phone.
  let acquired = false;
  try {
    const res = await redis.set(AUTOSEND_KEYS.alerted(date), '1', 'EX', ALERT_TTL_SECONDS, 'NX');
    acquired = res === 'OK';
  } catch {
    acquired = false;
  }
  if (!acquired) return { failuresToday, alerted: false };

  const message = [
    '🚨 CRITICAL ALERT — OSLRS',
    '',
    'Registration auto-emails are FAILING.',
    `${failuresToday} auto-send failure(s) today (threshold ${limit}).`,
    `Latest: ${args.kind} for respondent ${args.respondentId}.`,
    '',
    'The confirmation + thank-you/referral loop may be down.',
    'Check pino `registration_autosend.failure` logs + the Resend dashboard.',
  ].join('\n');
  // Fire-and-forget: sendTelegramMessage never throws and is env/test-gated
  // (a no-op outside production unless ENABLE_TELEGRAM_ALERTS=true).
  await sendTelegramMessage(message).catch(() => {});
  logger.error({ event: 'registration_autosend.alert_paged', failuresToday, threshold: limit });
  return { failuresToday, alerted: true };
}
