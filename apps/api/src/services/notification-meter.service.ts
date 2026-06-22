/**
 * Story 9-63 (Task 2 / AC1, AC7) — NotificationMeter.
 *
 * The single counted, classified chokepoint for EVERY notification send (email
 * today, SMS forward-looking). Records `(channel, category, recipient, event)`
 * to Redis counters so the operator can see exactly what traffic the system is
 * sending and abuse detection (Task 6 / AC5) has a source of truth that the
 * Resend list API (capped at 100 rows/page) cannot provide.
 *
 * Counter keys (per channel + category, with a daily key carrying a TTL and a
 * monthly rollup):
 *   email:daily:count:<category>:<YYYY-MM-DD>
 *   email:monthly:count:<category>:<YYYY-MM>
 *   sms:daily:count:<category>:<YYYY-MM-DD>
 *   sms:monthly:count:<category>:<YYYY-MM>
 *
 * Design notes:
 * - **Increment on EVERY send regardless of queueing.** The meter is called from
 *   the email-send chokepoint (`EmailService` private dispatch) so a send cannot
 *   reach the provider without being counted. This is what closes the AC1 gap:
 *   most high-volume sends (magic-link, reminder, status, backup, blasts)
 *   previously bypassed `EmailBudgetService` entirely.
 * - **Fail-OPEN.** A Redis hiccup must never block a notification. Errors are
 *   logged at warn and swallowed — the send already happened (or is about to);
 *   losing a count is strictly less bad than dropping mail.
 * - The category vocabulary + subject→category mapping is the SHARED classifier
 *   in `notification-category.ts` (the reference is the `_diagnose-email-usage.ts`
 *   diagnostic), so the meter, the diagnostic, and the future dashboard all bucket
 *   identically.
 */
import type { Redis } from 'ioredis';
import pino from 'pino';
import { sha256Hex } from '@oslsr/utils';
import { getRedisClient } from '../lib/redis.js';
import {
  type NotificationCategory,
  classifyEmailSubject,
  isUndeliverableRecipient,
} from './notification-category.js';

const logger = pino({ name: 'notification-meter' });

export type NotificationChannel = 'email' | 'sms';

/**
 * A delivery event. `sent` is the default (a real artefact left the building).
 * `bounced` / `complained` are reserved for delivery-webhook reconciliation
 * (Task 6 hygiene) so the same counter namespace tallies negative outcomes too.
 */
export type NotificationEvent = 'sent' | 'bounced' | 'complained';

interface RecordArgs {
  channel: NotificationChannel;
  category: NotificationCategory;
  recipient: string;
  event?: NotificationEvent;
}

/** TTL (seconds) for the per-day key — 48h covers timezone-edge reads. */
const DAILY_TTL_SECONDS = 48 * 60 * 60;
/** TTL (seconds) for the per-month key — 35 days covers a full month + slack. */
const MONTHLY_TTL_SECONDS = 35 * 24 * 60 * 60;

function dateKey(now: Date): string {
  return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

function monthKey(now: Date): string {
  return now.toISOString().slice(0, 7); // YYYY-MM
}

/**
 * Redis key builders — exported so tests + the dashboard read the exact same
 * namespace the meter writes.
 */
export const METER_KEYS = {
  daily: (channel: NotificationChannel, category: string, date: string) =>
    `${channel}:daily:count:${category}:${date}`,
  monthly: (channel: NotificationChannel, category: string, month: string) =>
    `${channel}:monthly:count:${category}:${month}`,
  /** Per-recipient daily frequency — single-target hammering signal (AC5b). */
  recipientDaily: (channel: NotificationChannel, recipientHash: string, date: string) =>
    `${channel}:recipient:count:${recipientHash}:${date}`,
  /** Daily count of sends ATTEMPTED to an undeliverable/reserved domain (AC5d). */
  undeliverableDaily: (channel: NotificationChannel, date: string) =>
    `${channel}:undeliverable:count:${date}`,
} as const;

/**
 * NotificationMeter — static chokepoint. Stateless except for a lazily-resolved
 * Redis client (the shared singleton), so it can be called from services and
 * workers without wiring a connection through every constructor.
 */
export class NotificationMeter {
  /** Test seam: inject a Redis (e.g. ioredis-mock) instead of the singleton. */
  private static redisOverride: Redis | null = null;

  static setRedisForTesting(redis: Redis | null): void {
    this.redisOverride = redis;
  }

  private static resolveRedis(): Redis | null {
    if (this.redisOverride) return this.redisOverride;
    try {
      return getRedisClient();
    } catch {
      // No Redis configured (test/misconfig) → meter is a no-op, fail open.
      return null;
    }
  }

  /**
   * Record one notification send into the per-category daily + monthly counters
   * (and a per-recipient daily frequency counter for abuse detection). Fail-open.
   *
   * @returns the resolved category (handy for callers that want to log it).
   */
  static async record(args: RecordArgs): Promise<NotificationCategory> {
    const { channel, category, recipient, event = 'sent' } = args;
    const redis = this.resolveRedis();
    if (!redis) return category;

    const now = new Date();
    const date = dateKey(now);
    const month = monthKey(now);

    // Suffix non-`sent` events so a bounce never inflates the positive volume
    // (e.g. `magiclink-login:bounced`). `sent` keeps the bare category key so
    // existing dashboards reading `<category>` see real delivered volume.
    const counterCat = event === 'sent' ? category : `${category}:${event}`;

    try {
      const pipeline = redis.pipeline();

      const dKey = METER_KEYS.daily(channel, counterCat, date);
      pipeline.incr(dKey);
      pipeline.expire(dKey, DAILY_TTL_SECONDS);

      const mKey = METER_KEYS.monthly(channel, counterCat, month);
      pipeline.incr(mKey);
      pipeline.expire(mKey, MONTHLY_TTL_SECONDS);

      // Per-recipient daily frequency (only for real sends). Hash the recipient
      // so no raw PII lands in Redis (mirrors registration-status throttle).
      if (event === 'sent' && recipient) {
        const rKey = METER_KEYS.recipientDaily(channel, hashRecipient(recipient), date);
        pipeline.incr(rKey);
        pipeline.expire(rKey, DAILY_TTL_SECONDS);

        // AC5d — flag a send attempted to an undeliverable/reserved domain (the
        // 2026-06-21 `example.com` quota-bleed signal). Counted, not blocked: the
        // send already happened; the abuse sweep alerts on a non-zero count.
        if (isUndeliverableRecipient(recipient)) {
          const uKey = METER_KEYS.undeliverableDaily(channel, date);
          pipeline.incr(uKey);
          pipeline.expire(uKey, DAILY_TTL_SECONDS);
        }
      }

      await pipeline.exec();
    } catch (err) {
      // Fail open — the send is more important than the count.
      logger.warn({
        event: 'notification.meter.record_failed',
        channel,
        category,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return category;
  }

  /**
   * Email chokepoint — derive the category from the subject (shared classifier)
   * and record. Called from inside `EmailService`'s private dispatch so no email
   * send can bypass counting (AC1).
   */
  static async recordEmailSend(args: {
    subject: string;
    recipient: string;
    event?: NotificationEvent;
    /** Optional explicit category override (e.g. blast scripts know their own). */
    category?: NotificationCategory;
  }): Promise<NotificationCategory> {
    const category = args.category ?? classifyEmailSubject(args.subject);
    return this.record({
      channel: 'email',
      category,
      recipient: args.recipient,
      event: args.event,
    });
  }

  /**
   * SMS chokepoint — mirror of the email path, wired at the `getSmsProvider()`
   * send boundary (Task 8). Lights up automatically when Termii is bound; today
   * the NoopSmsProvider rejects, but a real send increments here first.
   */
  static async recordSmsSend(args: {
    category: NotificationCategory;
    recipient: string;
    event?: NotificationEvent;
  }): Promise<NotificationCategory> {
    return this.record({
      channel: 'sms',
      category: args.category,
      recipient: args.recipient,
      event: args.event,
    });
  }

  /**
   * Story 9-63 (Task 5 / AC3) — read a channel's per-category usage for a period
   * from the meter counters. Uses the same non-blocking SCAN-sum pattern the
   * budget guard uses (`email-budget.service.ts`), reading the `daily` keys for a
   * date or the `monthly` keys for a month. Returns positive `total` + per-category
   * breakdown (sorted desc) with `bounced` / `complained` split out so they never
   * inflate volume. Fail-OPEN: on a Redis error returns an empty usage shape.
   */
  static async readUsage(
    channel: NotificationChannel,
    period: 'daily' | 'monthly',
    periodSuffix: string,
  ): Promise<ChannelUsage> {
    const empty: ChannelUsage = { total: 0, byCategory: [], bounced: 0, complained: 0 };
    const redis = this.resolveRedis();
    if (!redis) return empty;

    // `email:daily:count:<category>:<date>` — match the period segment + suffix.
    const pattern = `${channel}:${period}:count:*:${periodSuffix}`;
    const prefixLen = `${channel}:${period}:count:`.length;
    const suffixLen = periodSuffix.length + 1; // include the leading ':'

    try {
      const byCategory = new Map<string, number>();
      let bounced = 0;
      let complained = 0;
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (keys.length === 0) continue;
        const values = await redis.mget(...keys);
        for (let i = 0; i < keys.length; i++) {
          const n = parseInt(values[i] || '0', 10);
          if (!n) continue;
          // The category segment is between the fixed prefix and the period suffix.
          const cat = keys[i].slice(prefixLen, keys[i].length - suffixLen);
          if (cat.endsWith(':bounced')) {
            bounced += n;
          } else if (cat.endsWith(':complained')) {
            complained += n;
          } else {
            byCategory.set(cat, (byCategory.get(cat) ?? 0) + n);
          }
        }
      } while (cursor !== '0');

      const sorted = [...byCategory.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);
      const total = sorted.reduce((acc, c) => acc + c.count, 0);

      return { total, byCategory: sorted, bounced, complained };
    } catch (err) {
      logger.warn({
        event: 'notification.meter.read_failed',
        channel,
        period,
        error: err instanceof Error ? err.message : String(err),
      });
      return empty;
    }
  }

  /**
   * Story 9-63 (Task 6 / AC5b) — the maximum per-recipient send count for a
   * channel on a date (the single-target-hammer signal). Reads the hashed
   * `<channel>:recipient:count:<hash>:<date>` keys and returns the largest.
   * Fail-OPEN → 0.
   */
  static async maxRecipientCount(channel: NotificationChannel, date: string): Promise<number> {
    const redis = this.resolveRedis();
    if (!redis) return 0;
    const pattern = `${channel}:recipient:count:*:${date}`;
    try {
      let cursor = '0';
      let max = 0;
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (keys.length === 0) continue;
        const values = await redis.mget(...keys);
        for (const v of values) {
          const n = parseInt(v || '0', 10);
          if (n > max) max = n;
        }
      } while (cursor !== '0');
      return max;
    } catch {
      return 0;
    }
  }

  /**
   * Story 9-63 (Task 6 / AC5d) — count of sends ATTEMPTED to an
   * undeliverable/reserved domain for a channel on a date. Fail-OPEN → 0.
   */
  static async undeliverableCount(channel: NotificationChannel, date: string): Promise<number> {
    const redis = this.resolveRedis();
    if (!redis) return 0;
    try {
      const v = await redis.get(METER_KEYS.undeliverableDaily(channel, date));
      return parseInt(v || '0', 10);
    } catch {
      return 0;
    }
  }

  /**
   * Story 9-63 (Task 6 / AC5c) — total positive sends for a single category on a
   * given date (used to compare today vs a trailing baseline for a spiking
   * public category). Reads the bare category daily key. Fail-OPEN → 0.
   */
  static async categoryDailyCount(
    channel: NotificationChannel,
    category: string,
    date: string,
  ): Promise<number> {
    const redis = this.resolveRedis();
    if (!redis) return 0;
    try {
      const v = await redis.get(METER_KEYS.daily(channel, category, date));
      return parseInt(v || '0', 10);
    } catch {
      return 0;
    }
  }
}

/** Per-channel usage read result (mirrors `@oslsr/types` NotificationChannelUsage). */
export interface ChannelUsage {
  total: number;
  byCategory: Array<{ category: string; count: number }>;
  bounced: number;
  complained: number;
}

/**
 * Hash a recipient (email or phone) for the per-recipient frequency counter.
 * Lightweight, non-cryptographic intent — only needs to avoid storing raw PII in
 * Redis while keeping a stable key per recipient within a day. Uses the shared
 * sha256 to avoid a second hashing dependency.
 */
function hashRecipient(recipient: string): string {
  return sha256Hex(recipient.trim().toLowerCase()).slice(0, 32);
}
