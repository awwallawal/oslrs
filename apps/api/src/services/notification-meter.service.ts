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
  isUnclassifiedSubject,
  isUndeliverableRecipient,
} from './notification-category.js';
// Story 13-46 (AC1) — the cap keys off the SAME marketing taxonomy the List-Unsubscribe headers
// use (13-13). One set, one meaning: if a category is marketing enough to carry an unsubscribe
// link, it is marketing enough to be capped.
import { MARKETING_CATEGORIES, isMarketingCategory } from './list-unsubscribe.js';
// A refusal PAGES. The channel self-vetoes in dev/test via `isAlertSendEnabled`, so importing it
// here cannot make the meter page from a unit test (9-15 self-page incident).
import { sendTelegramMessage, isAlertSendEnabled } from './alerting/telegram-channel.js';

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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Story 13-46 (AC1) — MARKETING SEND CAPS. The meter now ENFORCES, not just counts.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Why these exist: every public registration fires an outbound thank-you SYNCHRONOUSLY
 * (`submission-processing.service.ts` → `EmailService.dispatch`). A radio jingle pointed at
 * the public wizard therefore converts a registration burst directly into a send burst, and
 * the asset at risk is the SENDING DOMAIN — which, unlike a database row, cannot be deleted
 * and re-earned. Rows are cheap and revocable; a burned domain takes every cohort blast,
 * every magic link and every password reset with it.
 *
 * ⚠️ MARKETING ONLY. Transactional mail keeps the module's fail-OPEN contract (`:23-25`)
 * completely unchanged — blocking a magic link on a counter is a WORSE outcome than an
 * uncounted send. `checkCap` returns `not-marketing` for everything outside
 * `MARKETING_CATEGORIES`, so the transactional path cannot be reached by this ceiling.
 *
 * ⚠️ ONE bucket for all three marketing categories, not one cap each. The domain burns from
 * combined marketing volume; three per-category caps would let the system send 3× the ceiling.
 */

/**
 * Daily marketing ceiling.
 *
 * DERIVATION — MEASURED ON PROD 2026-08-21 (AC7), not invented at the keyboard:
 *   busiest marketing day in the register's history .... 177 sends (2026-08-04)
 *   second busiest ..................................... 86 sends (2026-08-05)
 *   busiest registration day ever ...................... 168 submissions (2026-08-04)
 *   register size ...................................... 327 respondents
 *
 *   2,000/day = ~11× the observed peak marketing day, and enough for a FULL-register blast (327)
 *   plus ~1,670 auto thank-yous in the same day — ~10× the busiest registration day ever.
 *
 * ✅ THE CAP WOULD NOT HAVE BOUND ON THE BUSIEST DAY THIS SYSTEM HAS EVER HAD (177 ≪ 2,000).
 * That is the check that matters: a cap which would have blocked real history is a cap that will
 * block real users.
 *
 * ⚠️ WHAT IS STILL UNKNOWN: the JINGLE's peak. No campaign of that shape has ever run, so the
 * headroom multiple above is a judgement, not an extrapolation. AC7's AFTER count (first jingle
 * window) is the input that closes this, and it cannot exist until the jingle airs.
 *
 * FAILS TOWARD: refusing a real thank-you to a real registrant. That direction is deliberate
 * and is made survivable by two things — the registration itself still succeeds (the send is
 * fail-soft downstream), and every refusal is LOUD (logged + paged), so a cap set too low is
 * visible within minutes instead of silently costing goodwill. The opposite direction (set too
 * high) is invisible until the domain is already burned.
 *
 * REOPEN TRIGGER: the register passes ~5,000 people, OR a planned blast cohort exceeds 2,000
 * addresses, OR this cap refuses on a day with no incident. Any of those means re-derive against a
 * fresh `campaign_sends` day-count, the same query AC7 used.
 */
export const MARKETING_DAILY_CAP = 2_000;

/**
 * Monthly marketing ceiling — THE ceiling that actually binds.
 *
 * DERIVATION: the daily cap alone does not bind under the plan quota (2,000 × 30 = 60,000 >
 * the Resend Pro 50,000/month ceiling), so a month of sustained daily-cap traffic would exhaust
 * the QUOTA rather than trip a control of ours. 20,000 is 40% of the plan, deliberately leaving
 * ~30,000/month for TRANSACTIONAL mail, which this cap never touches and which must never be
 * squeezed by marketing volume.
 *
 * MEASURED ON PROD 2026-08-21 (AC7): the busiest calendar month of marketing sending in the
 * system's history is 2026-08 with **300 sends**. 20,000 is ~67× that. The remaining ~30,000 of
 * the plan is left for TRANSACTIONAL mail, which this cap never touches; today's transactional
 * volume is orders of magnitude below that (the register is 327 people).
 *
 * FAILS TOWARD: refusing marketing mail for the remainder of a calendar month once 20,000 have
 * gone out. Loud, and recoverable by an operator raising `MARKETING_MONTHLY_CAP`. Context §6:
 * a bigger quota makes this cap MORE important, not less — the quota was never the control.
 */
export const MARKETING_MONTHLY_CAP = 20_000;

/** Cap resolution — env override with committed defaults. Invalid/zero/negative → the default. */
export function resolveMarketingCaps(): { daily: number; monthly: number } {
  return {
    daily: positiveIntEnv('MARKETING_DAILY_CAP', MARKETING_DAILY_CAP),
    monthly: positiveIntEnv('MARKETING_MONTHLY_CAP', MARKETING_MONTHLY_CAP),
  };
}

/**
 * ⚠️ NEVER falls back to 0. A zero cap would refuse EVERY marketing send while looking like a
 * configured value — the inverse failure of `resolveGapDays` (`campaign-contact.service.ts:41`),
 * where 0 would silently DISABLE the guard. Both round-trip to the committed default instead.
 */
function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Why a send was allowed or refused — carried into the log line and the operator page. */
export type CapReason =
  | 'not-marketing'
  | 'within-cap'
  | 'meter-unavailable'
  | 'daily-cap-exceeded'
  | 'monthly-cap-exceeded';

export interface CapDecision {
  allowed: boolean;
  reason: CapReason;
  category?: NotificationCategory;
  window?: 'daily' | 'monthly';
  /** Marketing sends already counted in that window (the whole bucket, not one category). */
  count?: number;
  cap?: number;
}

export interface MarketingHeadroom {
  dailyUsed: number;
  dailyRemaining: number;
  dailyCap: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  monthlyCap: number;
}

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

    // Story 13-51 (➕ ADDED §2) — MAKE THE FALLBACK OBSERVABLE.
    //
    // `classifyEmailSubject` always returns something, so an unmatched subject falls to 'other'
    // silently and a brand-new send type looks exactly like a send legitimately bucketed 'other'.
    // A RISING count of this line is the signal that a send type exists with no word for it —
    // which is how the operator-reply gap went unnoticed until a human read one line of script
    // output. ⚠️ WARN, never throw: a taxonomy gap must not be able to block a citizen's email.
    // Code-review L1 — asks the exported predicate rather than re-deriving `=== 'other'` here, so
    // `isUnclassifiedSubject` has a production consumer instead of only its own test. The
    // `!args.category` half still matters: a caller that DECLARED its bucket has not fallen
    // through anything, even when the bucket it declared is `other`.
    if (!args.category && isUnclassifiedSubject(args.subject)) {
      logger.warn(
        { event: 'notification_meter.unclassified_subject', subject: args.subject },
        'email subject matched no category rule — counted as "other" (13-51)',
      );
    }
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
   * Story 13-46 (AC1) — THE PRE-SEND CHECK. Read-only and side-effect-free, so it is unit-testable
   * and so consulting it can never itself change what is counted.
   *
   * Consulted by `EmailService.dispatch` **BEFORE** `getProvider().send(...)` — which is the whole
   * point. `recordEmailSend` runs AFTER the provider returns and discards its result, so the meter
   * as it stood could never refuse anything: by the time it counted, the send had happened
   * ("Counted, not blocked: the send already happened", `:150-153`).
   *
   * Two failure directions, deliberately opposite:
   * - **Infrastructure** (no Redis / read throws) → ALLOW. Preserves the module's fail-OPEN
   *   contract; a Redis hiccup must never block mail.
   * - **The limit itself** (cap evaluated and exceeded) → REFUSE. A cap that fails open on its
   *   own limit is not a cap.
   */
  static async checkCap(
    category?: NotificationCategory,
    now: Date = new Date(),
  ): Promise<CapDecision> {
    // Transactional / ops / uncategorised mail never reaches the ceiling.
    if (!isMarketingCategory(category)) return { allowed: true, reason: 'not-marketing' };

    const redis = this.resolveRedis();
    if (!redis) return { allowed: true, reason: 'meter-unavailable', category };

    const caps = resolveMarketingCaps();
    try {
      const { dailyUsed, monthlyUsed } = await this.readMarketingUsage(redis, now);

      if (dailyUsed >= caps.daily) {
        return {
          allowed: false,
          reason: 'daily-cap-exceeded',
          category,
          window: 'daily',
          count: dailyUsed,
          cap: caps.daily,
        };
      }
      if (monthlyUsed >= caps.monthly) {
        return {
          allowed: false,
          reason: 'monthly-cap-exceeded',
          category,
          window: 'monthly',
          count: monthlyUsed,
          cap: caps.monthly,
        };
      }
      return { allowed: true, reason: 'within-cap', category };
    } catch (err) {
      // Fail OPEN on infrastructure — same principle as `record`'s catch.
      logger.warn({
        event: 'notification.cap_check_failed',
        category,
        error: err instanceof Error ? err.message : String(err),
        note: 'cap could not be evaluated — allowing the send (fail-open on infrastructure)',
      });
      return { allowed: true, reason: 'meter-unavailable', category };
    }
  }

  /**
   * Story 13-46 (AC1) — A REFUSAL IS LOUD.
   *
   * ⚠️ Silence here would reproduce [[pattern-ship-a-fix-that-never-fires]] in its worst form: a
   * cap that refuses mail while nobody learns the mail stopped. That is exactly the failure
   * `recordCampaignSend`'s fail-soft catch already demonstrates in this codebase
   * (`campaign-contact.service.ts:89-96` — "dedupe for this address is degraded", logged and
   * forgotten). A structured ERROR log plus an operator page is the minimum.
   *
   * COOLDOWN, per window not per send: a burst that trips the cap trips it on EVERY subsequent
   * send. Paging per refusal would put thousands of Telegram messages behind one incident and
   * bury the signal it exists to raise — the same per-kind discipline as `cf-traffic-watch.ts:39-49`.
   * Fail-OPEN: a cooldown read error lets the page through (loud-on-failure).
   */
  static async reportCapRefusal(decision: CapDecision, recipient: string): Promise<void> {
    logger.error({
      event: 'notification.cap_exceeded',
      category: decision.category,
      window: decision.window,
      count: decision.count,
      cap: decision.cap,
      reason: decision.reason,
      recipientHash: hashRecipient(recipient),
      note: 'MARKETING send refused at the cap — the send did NOT happen',
    });

    // AC1 — page THROUGH the existing 9-15 gate. Checked explicitly (and BEFORE the cooldown, so a
    // suppressed dev page cannot burn the slot that a real prod page would need).
    if (!isAlertSendEnabled()) return;
    if (!(await this.winCapAlertCooldown(decision.reason))) return;

    const cooldownMinutes = positiveIntEnv('NOTIFY_CAP_COOLDOWN_MINUTES', 360);
    const delivered = await sendTelegramMessage(
      `🔴 MARKETING SEND CAP REACHED\n\n` +
        `Category: ${decision.category}\n` +
        `Window: ${decision.window} — ${decision.count} sent, cap ${decision.cap}\n\n` +
        `Marketing mail is now being REFUSED. Transactional mail (magic links, password resets) ` +
        `is unaffected.\n\n` +
        `If this is a legitimate volume day, raise MARKETING_${decision.window === 'daily' ? 'DAILY' : 'MONTHLY'}_CAP. ` +
        `If it is not, the send path is looping — check registration volume.\n` +
        `(Further cap pages suppressed for ${cooldownMinutes} min.)`,
    );

    /**
     * Story 13-46 (review A7 / finding M5) — DO NOT BURN THE SLOT ON A PAGE THAT NEVER LANDED.
     *
     * `winCapAlertCooldown` claims the slot BEFORE the send, and `sendTelegramMessage` never
     * throws — it returns `false` on a missing token, a non-2xx from Telegram, or a fetch failure.
     * Discarding that boolean meant one transient failure, at the exact moment the cap first binds,
     * cost the operator the page for the whole cooldown (default 6h) while `logger.error` kept
     * firing per refused send. That is the "logged and forgotten" shape this method exists to
     * prevent, reproduced inside the method itself.
     *
     * Releasing the key is fail-soft: if the DEL fails we are no worse off than before.
     */
    if (!delivered) {
      try {
        await this.resolveRedis()?.del(`notify:cap:cooldown:${decision.reason}`);
        logger.warn({
          event: 'notification.cap_page_undelivered',
          reason: decision.reason,
          note: 'Telegram dispatch returned false — cooldown slot released so the next refusal can retry the page',
        });
      } catch {
        /* fail-soft: a stuck cooldown is bad, an exception here would be worse */
      }
    }
  }

  /** `SET key 1 EX <cooldown> NX` — true iff we WON the slot. Fail-OPEN → allow the page. */
  private static async winCapAlertCooldown(kind: string): Promise<boolean> {
    const redis = this.resolveRedis();
    if (!redis) return true;
    try {
      const seconds = positiveIntEnv('NOTIFY_CAP_COOLDOWN_MINUTES', 360) * 60;
      const res = await redis.set(`notify:cap:cooldown:${kind}`, '1', 'EX', seconds, 'NX');
      return res === 'OK';
    } catch {
      return true;
    }
  }

  /**
   * Story 13-46 (AC1/AC3) — current marketing headroom. AC3's burst alert carries this so the
   * operator sees, in the same message, both how big the burst is and how much sending budget
   * is left to absorb it. Fail-OPEN → reports full headroom (never fabricates pressure).
   */
  static async marketingHeadroom(now: Date = new Date()): Promise<MarketingHeadroom> {
    const caps = resolveMarketingCaps();
    const redis = this.resolveRedis();
    const empty: MarketingHeadroom = {
      dailyUsed: 0,
      dailyRemaining: caps.daily,
      dailyCap: caps.daily,
      monthlyUsed: 0,
      monthlyRemaining: caps.monthly,
      monthlyCap: caps.monthly,
    };
    if (!redis) return empty;

    try {
      const { dailyUsed, monthlyUsed } = await this.readMarketingUsage(redis, now);
      return {
        dailyUsed,
        dailyRemaining: Math.max(0, caps.daily - dailyUsed),
        dailyCap: caps.daily,
        monthlyUsed,
        monthlyRemaining: Math.max(0, caps.monthly - monthlyUsed),
        monthlyCap: caps.monthly,
      };
    } catch {
      return empty;
    }
  }

  /**
   * Sum the marketing bucket for the current day + month. ONE `mget` over the six known keys
   * (3 categories × 2 windows) — no SCAN, because this runs on the send hot path and a SCAN per
   * email would put an unbounded Redis walk in front of every marketing send.
   */
  private static async readMarketingUsage(
    redis: Redis,
    now: Date,
  ): Promise<{ dailyUsed: number; monthlyUsed: number }> {
    const date = dateKey(now);
    const month = monthKey(now);
    const cats = [...MARKETING_CATEGORIES];

    const dailyKeys = cats.map((c) => METER_KEYS.daily('email', c, date));
    const monthlyKeys = cats.map((c) => METER_KEYS.monthly('email', c, month));
    const values = await redis.mget(...dailyKeys, ...monthlyKeys);

    const sum = (slice: Array<string | null>): number =>
      slice.reduce<number>((acc, v) => acc + (parseInt(v || '0', 10) || 0), 0);

    return {
      dailyUsed: sum(values.slice(0, dailyKeys.length)),
      monthlyUsed: sum(values.slice(dailyKeys.length)),
    };
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
