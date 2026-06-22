/**
 * Story 9-63 (Task 6 / AC5) — notification abuse / anomaly detection.
 *
 * Reads the NotificationMeter counters (the source of truth — every send flows
 * through the chokepoint) and produces a list of threshold breaches to push to
 * Telegram. Four signals, all config-driven:
 *
 *   (a) daily volume above a configurable ceiling
 *   (b) a single recipient hit ≥ N times in the day (single-target hammering)
 *   (c) a public-triggered category spiking vs a trailing baseline
 *   (d) a send attempted to an undeliverable/reserved domain
 *
 * Gating mirrors the existing alert surfaces: the SWEEP itself runs anywhere, but
 * the digest worker only DISPATCHES to Telegram via `sendTelegramMessage`, which
 * is already non-prod-suppressed (`isAlertSendEnabled`). A per-signal cooldown
 * (Redis-backed, mirrors `alert.service`'s per-metric cooldown) prevents the same
 * finding from paging every digest tick.
 *
 * Thresholds (env, with safe defaults):
 *   NOTIFY_ABUSE_DAILY_CEILING_EMAIL   (default 500)
 *   NOTIFY_ABUSE_DAILY_CEILING_SMS     (default 200)
 *   NOTIFY_ABUSE_RECIPIENT_MAX         (default 20)  — per-recipient/day
 *   NOTIFY_ABUSE_SPIKE_BASELINE_DAYS   (default 7)
 *   NOTIFY_ABUSE_SPIKE_MULTIPLIER      (default 5)   — today ≥ mult × baseline avg
 *   NOTIFY_ABUSE_SPIKE_MIN_VOLUME      (default 50)  — ignore low-volume noise
 *   NOTIFY_ABUSE_COOLDOWN_MINUTES      (default 360) — per-signal re-alert cooldown
 */
import type { Redis } from 'ioredis';
import pino from 'pino';
import { getRedisClient } from '../lib/redis.js';
import { NotificationMeter } from './notification-meter.service.js';
import {
  PUBLIC_TRIGGERED_CATEGORIES,
  type NotificationCategory,
} from './notification-category.js';

const logger = pino({ name: 'notification-abuse' });

export type AbuseSignalKey =
  | 'daily-ceiling-email'
  | 'daily-ceiling-sms'
  | 'recipient-hammer-email'
  | 'recipient-hammer-sms'
  | 'undeliverable-email'
  | `category-spike-${string}`;

export interface AbuseFinding {
  key: AbuseSignalKey;
  /** Plain-text, no markup — the Telegram layer escapes it. */
  text: string;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getAbuseThresholds() {
  return {
    dailyCeilingEmail: intEnv('NOTIFY_ABUSE_DAILY_CEILING_EMAIL', 500),
    dailyCeilingSms: intEnv('NOTIFY_ABUSE_DAILY_CEILING_SMS', 200),
    recipientMax: intEnv('NOTIFY_ABUSE_RECIPIENT_MAX', 20),
    baselineDays: intEnv('NOTIFY_ABUSE_SPIKE_BASELINE_DAYS', 7),
    spikeMultiplier: intEnv('NOTIFY_ABUSE_SPIKE_MULTIPLIER', 5),
    spikeMinVolume: intEnv('NOTIFY_ABUSE_SPIKE_MIN_VOLUME', 50),
    cooldownMinutes: intEnv('NOTIFY_ABUSE_COOLDOWN_MINUTES', 360),
  };
}

function dateKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** The UTC date string `n` days before `now`. */
function priorDate(now: Date, n: number): string {
  const d = new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  return dateKey(d);
}

export class NotificationAbuseService {
  private static redisOverride: Redis | null = null;

  /** Test seam — inject ioredis-mock (also wires the meter's own seam). */
  static setRedisForTesting(redis: Redis | null): void {
    this.redisOverride = redis;
    NotificationMeter.setRedisForTesting(redis);
  }

  private static resolveRedis(): Redis | null {
    if (this.redisOverride) return this.redisOverride;
    try {
      return getRedisClient();
    } catch {
      return null;
    }
  }

  /**
   * Per-signal cooldown so the same finding doesn't re-page every digest tick.
   * `SET key 1 EX <cooldown> NX` — returns true iff we WON the slot (i.e. not in
   * cooldown). Fail-OPEN: on a Redis error allow the alert (loud-on-failure).
   */
  private static async claimAlertSlot(key: string): Promise<boolean> {
    const redis = this.resolveRedis();
    if (!redis) return true;
    const cooldownSec = getAbuseThresholds().cooldownMinutes * 60;
    try {
      const res = await redis.set(`notify:abuse:cooldown:${key}`, '1', 'EX', cooldownSec, 'NX');
      return res === 'OK';
    } catch {
      return true;
    }
  }

  /**
   * Run all four abuse checks for "today" and return the findings that are NOT
   * in cooldown. Pure-read against the meter — never blocks or mutates a send.
   */
  static async detect(now: Date = new Date()): Promise<AbuseFinding[]> {
    const t = getAbuseThresholds();
    const today = dateKey(now);
    const findings: AbuseFinding[] = [];

    const [
      emailUsage,
      smsUsage,
      emailMaxRecipient,
      smsMaxRecipient,
      emailUndeliverable,
    ] = await Promise.all([
      NotificationMeter.readUsage('email', 'daily', today),
      NotificationMeter.readUsage('sms', 'daily', today),
      NotificationMeter.maxRecipientCount('email', today),
      NotificationMeter.maxRecipientCount('sms', today),
      NotificationMeter.undeliverableCount('email', today),
    ]);

    // (a) daily volume above ceiling
    if (emailUsage.total >= t.dailyCeilingEmail) {
      findings.push({
        key: 'daily-ceiling-email',
        text: `Email daily volume ${emailUsage.total} ≥ ceiling ${t.dailyCeilingEmail}. Possible blast/bot run — verify before the provider throttles or suspends.`,
      });
    }
    if (smsUsage.total >= t.dailyCeilingSms) {
      findings.push({
        key: 'daily-ceiling-sms',
        text: `SMS daily volume ${smsUsage.total} ≥ ceiling ${t.dailyCeilingSms}. Verify — SMS spend is metered per-message.`,
      });
    }

    // (b) single recipient hammered
    if (emailMaxRecipient >= t.recipientMax) {
      findings.push({
        key: 'recipient-hammer-email',
        text: `A single email recipient received ${emailMaxRecipient} sends today (≥ ${t.recipientMax}). Likely a retry loop or a targeted abuse attempt.`,
      });
    }
    if (smsMaxRecipient >= t.recipientMax) {
      findings.push({
        key: 'recipient-hammer-sms',
        text: `A single phone received ${smsMaxRecipient} SMS today (≥ ${t.recipientMax}). Investigate — SMS pumping is costly.`,
      });
    }

    // (d) undeliverable/reserved-domain send attempted
    if (emailUndeliverable > 0) {
      findings.push({
        key: 'undeliverable-email',
        text: `${emailUndeliverable} email send(s) attempted to an undeliverable/reserved domain (e.g. example.com) today. This is the 2026-06-21 quota-bleed signature — find the source.`,
      });
    }

    // (c) public-triggered category spiking vs trailing baseline
    const spikeFindings = await this.detectCategorySpikes(now, emailUsage.byCategory);
    findings.push(...spikeFindings);

    // Apply per-signal cooldown (skip findings still cooling down).
    const passed: AbuseFinding[] = [];
    for (const f of findings) {
      if (await this.claimAlertSlot(f.key)) {
        passed.push(f);
      } else {
        logger.debug({ event: 'notification.abuse.cooldown_suppressed', key: f.key });
      }
    }
    return passed;
  }

  /**
   * (c) For each public-triggered category, compare today's volume to the
   * average over the prior `baselineDays` days. Flags a spike when today ≥
   * `spikeMultiplier × baselineAvg` AND today ≥ `spikeMinVolume` (so a jump from
   * 1→6 doesn't page).
   */
  private static async detectCategorySpikes(
    now: Date,
    todayByCategory: Array<{ category: string; count: number }>,
  ): Promise<AbuseFinding[]> {
    const t = getAbuseThresholds();
    const out: AbuseFinding[] = [];
    const todayMap = new Map(todayByCategory.map((c) => [c.category, c.count]));

    for (const category of PUBLIC_TRIGGERED_CATEGORIES) {
      const todayCount = todayMap.get(category) ?? 0;
      if (todayCount < t.spikeMinVolume) continue;

      // Trailing baseline (exclude today).
      const priorCounts = await Promise.all(
        Array.from({ length: t.baselineDays }, (_, i) =>
          NotificationMeter.categoryDailyCount('email', category, priorDate(now, i + 1)),
        ),
      );
      const baselineSum = priorCounts.reduce((a, b) => a + b, 0);
      const baselineAvg = baselineSum / t.baselineDays;

      // A zero baseline + above-min volume today is itself a spike.
      const isSpike =
        baselineAvg === 0 ? todayCount >= t.spikeMinVolume : todayCount >= t.spikeMultiplier * baselineAvg;

      if (isSpike) {
        out.push({
          key: `category-spike-${category}` as AbuseSignalKey,
          text: `Public category "${category}" spiking: ${todayCount} today vs ${baselineAvg.toFixed(1)}/day baseline (${t.baselineDays}d). Confirm it isn't a referral-loop or enumeration attack.`,
        });
      }
    }
    return out;
  }
}

export type { NotificationCategory };
