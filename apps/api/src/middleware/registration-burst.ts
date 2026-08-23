/**
 * Story 13-46 (AC3) — Redis + Express wiring for the registration-burst breaker.
 *
 * The decision logic is the pure, unit-tested `lib/registration-burst.ts`. This file owns only the
 * counters and the mount point.
 *
 * ⚠️ THE MIDDLEWARE CALLS `next()` FIRST AND MEASURES AFTERWARDS. Observability must never sit in
 * front of a citizen's registration: a slow or unreachable Redis has to cost the registrant
 * nothing, and a bug in the watcher must not be able to produce a 500 on the write path. Every
 * counter write and every evaluation is fire-and-forget with its own catch.
 *
 * ROLLING WINDOW: one counter key per minute, summed over the last `windowMinutes`. Cheap
 * (`MGET` of 5 keys), self-expiring, and genuinely rolling — a single fixed-window counter would
 * reset mid-burst and under-report exactly when it matters.
 */
import type { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import { getRedisClient } from '../lib/redis.js';
import {
  BURST_THRESHOLDS,
  runBurstWatch,
  type BurstCounts,
  type MarketingHeadroomView,
} from '../lib/registration-burst.js';
import { NotificationMeter } from '../services/notification-meter.service.js';
// Story 13-65 (AC5) — the burst alert now carries the email queue's WAITING depth, because 13-65
// moved the registration sends onto that queue. No new alert, no new threshold, no new cooldown.
import { getEmailQueueStats } from '../queues/email.queue.js';
import { sendTelegramMessage } from '../services/alerting/telegram-channel.js';

const logger = pino({ name: 'registration-burst' });

type Signal = 'submits' | 'blocked429' | 'blocked429draft' | 'autosends' | 'suppressed';

/** Counter TTL — two windows of slack so a summed bucket is never expired mid-read. */
const BUCKET_TTL_SECONDS = BURST_THRESHOLDS.windowMinutes * 60 * 2;

/** `registration:burst:<signal>:<YYYY-MM-DDTHH:MM>` — minute-resolution buckets. */
function bucketKey(signal: Signal, minuteOffset: number, now: Date): string {
  const t = new Date(now.getTime() - minuteOffset * 60_000);
  return `registration:burst:${signal}:${t.toISOString().slice(0, 16)}`;
}

/** Best-effort counter increment. Swallows everything — a lost count is not worth an error path. */
async function bump(signal: Signal, now: Date = new Date()): Promise<void> {
  try {
    const key = bucketKey(signal, 0, now);
    const redis = getRedisClient();
    await redis.pipeline().incr(key).expire(key, BUCKET_TTL_SECONDS).exec();
  } catch {
    // Deliberately silent: this is instrumentation on the citizen write path.
  }
}

async function readWindow(now: Date = new Date()): Promise<BurstCounts> {
  const redis = getRedisClient();
  const offsets = Array.from({ length: BURST_THRESHOLDS.windowMinutes }, (_, i) => i);
  const signals: Signal[] = ['submits', 'blocked429', 'blocked429draft', 'autosends'];
  const keys = signals.flatMap((s) => offsets.map((o) => bucketKey(s, o, now)));

  const values = await redis.mget(...keys);
  const per = offsets.length;
  const sum = (slice: Array<string | null>): number =>
    slice.reduce<number>((acc, v) => acc + (parseInt(v || '0', 10) || 0), 0);

  return {
    submits: sum(values.slice(0, per)),
    blocked429: sum(values.slice(per, per * 2)),
    blocked429Draft: sum(values.slice(per * 2, per * 3)),
    autoSends: sum(values.slice(per * 3)),
    ...(await readEmailQueueState()),
  };
}

/**
 * Story 13-65 (AC5) — the `email-notification` waiting depth, or `null` if it cannot be read.
 *
 * ⚠️ ITS OWN try/catch, DELIBERATELY. `readWindow` throwing degrades the whole watch to
 * `read_failed` and no alert fires at all. A depth field is an ANNOTATION on the burst alert; losing
 * it must never be able to swallow the page it was only meant to annotate — the same reasoning
 * `runBurstWatch` already applies to the marketing-headroom read.
 */
async function readEmailQueueState(): Promise<Pick<BurstCounts, 'emailQueueWaiting' | 'emailQueuePaused'>> {
  try {
    const stats = await getEmailQueueStats();
    /**
     * Story 13-65 (review B12 / finding L12) — `paused` is the single most diagnostic field during a
     * queue stall, and it was being read and discarded. A deep queue that is PAUSED reads identically
     * to one that is draining, and the operator's remedy is completely different: resume it, versus
     * wait. Story 13-65 B1 removed the automatic pause, but an admin can still pause deliberately
     * (`admin.routes.ts`), and a paused queue holding citizen mail is exactly the state nobody should
     * have to infer.
     */
    return { emailQueueWaiting: stats.waiting, emailQueuePaused: Boolean(stats.paused) };
  } catch (err) {
    // review C12 / finding R12 — a silent catch made a persistently failing queue read
    // indistinguishable from a healthy empty queue. The alert already prints "unavailable"; this is
    // so the CAUSE is recoverable from the logs.
    logger.warn({
      event: 'registration_burst.queue_stats_unavailable',
      error: err instanceof Error ? err.message : String(err),
    });
    return { emailQueueWaiting: null, emailQueuePaused: null };
  }
}

/**
 * Story 13-46 (review A13 / finding L4) — bound how often the window is EVALUATED.
 *
 * The evaluation costs a 20-key MGET plus a 6-key headroom read, and it now runs on refusals as
 * well as on served submits — i.e. it is busiest exactly when the box is. It all happens after
 * `next()`, so it can never delay a response, but a burst should not pay for its own measurement
 * per request. One evaluation per 10s is full fidelity against a 5-MINUTE rolling window.
 *
 * Fail-OPEN: if the lock cannot be read, evaluate (losing an alert is worse than a spare MGET).
 */
async function winEvaluationSlot(): Promise<boolean> {
  try {
    const res = await getRedisClient().set('registration:burst:eval-lock', '1', 'EX', 10, 'NX');
    return res === 'OK';
  } catch {
    return true;
  }
}

/** Per-kind cooldown — one page per kind per cooldown, mirroring `cf-traffic-watch.ts:39-49`. */
async function winCooldown(kind: string): Promise<boolean> {
  const minutes = positiveIntEnv('REGISTRATION_BURST_COOLDOWN_MINUTES', 30);
  const res = await getRedisClient().set(
    `registration:burst:cooldown:${kind}`,
    '1',
    'EX',
    minutes * 60,
    'NX',
  );
  return res === 'OK';
}

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function readHeadroom(): Promise<MarketingHeadroomView> {
  return NotificationMeter.marketingHeadroom();
}

/** Run one watch pass with the real dependencies. Never throws. */
export async function evaluateRegistrationBurst(): Promise<void> {
  try {
    if (!(await winEvaluationSlot())) return; // review A13 / L4
    await runBurstWatch({
      readWindow: () => readWindow(),
      readHeadroom,
      winCooldown,
      dispatch: (msg) => sendTelegramMessage(msg),
      logger,
    });
  } catch (err) {
    logger.warn({
      event: 'registration_burst.watch_failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * AC3 — count a wizard submit and evaluate the window. Mounted AFTER the rate limiters, so it sees
 * only requests that were actually served; the refused ones are counted by `recordRegistration429`
 * from inside the limiter handlers (a limiter's `handler` responds without calling `next()`, so a
 * middleware could never see them).
 *
 * ⚠️ `next()` IS CALLED SYNCHRONOUSLY, FIRST. Nothing below it can delay, reject or fail the
 * registration.
 */
export function registrationBurstWatch(_req: Request, _res: Response, next: NextFunction): void {
  next();
  void (async () => {
    await bump('submits');
    await evaluateRegistrationBurst();
  })().catch(() => {
    /* unreachable — both halves swallow their own errors — but belt-and-braces on the write path */
  });
}

/**
 * Count a registration refusal (HTTP 429) **and evaluate the window**. Called from the limiters'
 * own handlers.
 *
 * ⚠️ Story 13-46 (review A1 / finding H1) — THE EVALUATION HERE IS THE WHOLE POINT, AND IT WAS
 * MISSING. This used to only bump a counter, while evaluation ran solely from the served-submit
 * path. So a PURE 429 WALL — the exact August shape: 27 refusals in one morning against 1-8 served
 * submits a day — incremented a number nobody read, and the minute buckets expired 10 minutes
 * later. The turn-away signal, which is the one thing 9-52's edge watch is structurally blind to,
 * could not fire from the event that defines it. Worse for drafts: their refusals happen on
 * `/draft`, where the burst middleware is not mounted at all, so nothing on that route could ever
 * have triggered an evaluation.
 *
 * `[[pattern-ship-a-fix-that-never-fires]]`, inside the story that cites it. Caught by the
 * adversarial review, not by the tests — hence the 429-only test that now accompanies this.
 *
 * Fire-and-forget: both halves swallow their own errors, and this is called from inside a rate
 * limiter's `handler`, where an exception would reach a citizen.
 */
export function recordRegistration429(dimension: 'submit' | 'draft' = 'submit'): void {
  void (async () => {
    await bump(dimension === 'draft' ? 'blocked429draft' : 'blocked429');
    await evaluateRegistrationBurst();
  })().catch(() => {
    /* unreachable — both halves are self-contained — but never throw at a limiter handler */
  });
}

/** Count a dispatched registration auto thank-you, for the alert's "auto-sends in window". */
export function recordRegistrationAutoSend(): void {
  void bump('autosends');
}

/**
 * Story 13-46 (review A3) — count a thank-you SUPPRESSED by the per-address gap.
 *
 * This is the falsifier for the A3 ruling. Scoping the gap to `thankyou-referral` means the only
 * thing suppressed should be a genuine duplicate; a rising count on a day with no
 * duplicate-registration activity is the evidence that the ruling was wrong, and it arrives from a
 * counter rather than from a citizen who never received their referral link.
 */
export function recordThankYouSuppressed(): void {
  void bump('suppressed');
}

/** Test seam — the pure window read, exposed so an integration test can assert the counters. */
export const __burstInternals = { readWindow, bucketKey };
