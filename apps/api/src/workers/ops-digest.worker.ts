/**
 * Story 9-19 Part C — Operations Dashboard Telegram digest worker.
 *
 * Twice-daily sweep (07:00 + 19:00 WAT). For each tick:
 *   - Gather a fresh ops snapshot (force-bypass the 30s cache).
 *   - Format a condensed, one-line-per-section digest + the full
 *     recommendation block, in Telegram MarkdownV2.
 *   - Send via Story 9-15's `sendTelegramMessage` (same env gate +
 *     token/chat-id checks; the worker never opens its own credentials).
 *   - On a healthy snapshot (no red/yellow recommendations) the message is
 *     sent SILENTLY (`disable_notification`) so the operator only gets a buzz
 *     on days that need attention (Risk #4).
 *   - Audit-log each *attempted* send via `OPS_DIGEST_SENT`.
 *
 * Worker is created lazily inside `startOpsDigestWorker()` so test mode does
 * not open a Redis connection at import time (matches reminder.worker.ts).
 */
import { Worker } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import { OperationsService } from '../services/operations.service.js';
import { sendTelegramMessage, isAlertSendEnabled } from '../services/alerting/telegram-channel.js';
import { AuditService, AUDIT_ACTIONS } from '../services/audit.service.js';
import { RESEND_FREE_TIER_DAILY, type OpsDashboardSnapshot } from '@oslsr/types';
import pino from 'pino';

const logger = pino({ name: 'ops-digest-worker' });

const QUEUE_NAME = 'ops-digest';

/** Telegram hard limit on a single message. We trim well below it. */
const TELEGRAM_MAX_CHARS = 4096;

/**
 * Escape a string for Telegram MarkdownV2. Every reserved char must be
 * backslash-escaped or the send is rejected with a 400. Applied to ALL dynamic
 * content; static `*headers*` are composed from already-escaped pieces.
 */
export function escapeMarkdownV2(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (ch) => `\\${ch}`);
}

/** Status glyph for a 0/1/2-tier comparison, used inline in the digest. */
function tierGlyph(value: number, yellowAt: number, redAt: number): string {
  const level = OperationsService.statusLevel(value, yellowAt, redAt);
  return level === 'red' ? '🔴' : level === 'yellow' ? '🟡' : '🟢';
}

/**
 * Build the digest message body (MarkdownV2). Exported for unit tests (AC#D4).
 * Pure — takes a snapshot, returns a string ≤ TELEGRAM_MAX_CHARS.
 */
export function formatDigest(snapshot: OpsDashboardSnapshot): string {
  const T = OperationsService.thresholds;
  const lines: string[] = [];

  const ts = snapshot.generatedAt.replace('T', ' ').slice(0, 16);
  lines.push(`*OSLRS Ops Digest* — ${escapeMarkdownV2(ts)} UTC`);
  lines.push('');

  // System
  if (snapshot.system) {
    const s = snapshot.system;
    const glyph = tierGlyph(s.ramUsedPct, T.ramUsedPctYellow, T.ramUsedPctRed);
    lines.push(
      `${glyph} *System*: ${escapeMarkdownV2(`up ${s.pm2Uptime}, RAM ${s.ramUsedPct}%, disk ${s.diskUsedPct}%, CPU ${s.loadAvg1m.toFixed(2)}`)}`,
    );
  } else {
    lines.push('⚪ *System*: section unavailable');
  }

  // Adoption
  if (snapshot.traffic) {
    const t = snapshot.traffic;
    const glyph = tierGlyph(t.step4StallPct, T.step4StallPctYellow, T.step4StallPctRed);
    lines.push(
      `${glyph} *Adoption*: ${escapeMarkdownV2(`${t.totalDrafts} drafts (24h ${t.draftsLast24h}), ${t.totalRespondents} done, Step-4 stall ${t.step4StallPct}%`)}`,
    );
  } else {
    lines.push('⚪ *Adoption*: section unavailable');
  }

  // Email
  if (snapshot.resend) {
    const r = snapshot.resend;
    const dailyPct = Math.round((r.todayCount / RESEND_FREE_TIER_DAILY) * 100);
    const glyph = tierGlyph(dailyPct, T.resendDailyPctYellow, T.resendDailyPctRed);
    const todayLabel = `${r.todayCount}${r.truncated ? '+' : ''}/${RESEND_FREE_TIER_DAILY}`;
    lines.push(
      `${glyph} *Email*: ${escapeMarkdownV2(`${todayLabel} today, ${r.delivered} delivered, ${r.bounced} bounced`)}`,
    );
  } else {
    lines.push('⚪ *Email*: section unavailable');
  }

  // Queue
  if (snapshot.queue) {
    const q = snapshot.queue;
    const glyph = tierGlyph(q.failed, T.queueFailedYellow, T.queueFailedRed);
    lines.push(
      `${glyph} *Queue*: ${escapeMarkdownV2(`${q.waiting} waiting, ${q.failed} failed, ${q.delayed} delayed`)}`,
    );
  } else {
    lines.push('⚪ *Queue*: section unavailable');
  }

  lines.push('');
  lines.push('*Recommendations*');
  if (snapshot.recommendations.length === 0) {
    lines.push(escapeMarkdownV2('✅ All metrics healthy — no action required.'));
  } else {
    for (const r of snapshot.recommendations) {
      const marker = r.severity === 'red' ? '🔴' : '🟡';
      lines.push(`${marker} ${escapeMarkdownV2(r.text)}`);
    }
  }

  let message = lines.join('\n');
  if (message.length > TELEGRAM_MAX_CHARS) {
    // Trim on WHOLE-LINE boundaries (never mid-line) so we don't cut a
    // backslash-escape sequence in half or leave an unbalanced `*bold*` — either
    // of which makes Telegram reject the whole digest with a 400. Drop trailing
    // lines until the body + an escaped truncation note fits.
    const note = escapeMarkdownV2('… (truncated)');
    while (lines.length > 0 && `${lines.join('\n')}\n${note}`.length > TELEGRAM_MAX_CHARS) {
      lines.pop();
    }
    message = `${lines.join('\n')}\n${note}`;
  }
  return message;
}

interface DigestResult {
  sent: boolean;
  silent: boolean;
  recommendationCount: number;
}

/**
 * Run one digest tick. Exported for tests.
 *
 * Returns early without contacting Telegram when the channel is disabled
 * (dev/test/no-config) — but STILL records the gathered snapshot's outcome so
 * the caller can assert behaviour.
 */
export async function runOpsDigest(): Promise<DigestResult> {
  const snapshot = await OperationsService.getDashboardSnapshot({ force: true });
  const recommendationCount = snapshot.recommendations.length;
  // Healthy snapshot → silent push (no buzz). Any recommendation → audible.
  const silent = recommendationCount === 0;
  const message = formatDigest(snapshot);

  const sent = await sendTelegramMessage(message, {
    parseMode: 'MarkdownV2',
    disableNotification: silent,
  });

  // Audit every attempt (actorId null = system). Fire-and-forget.
  AuditService.logAction({
    actorId: null,
    action: AUDIT_ACTIONS.OPS_DIGEST_SENT,
    targetResource: 'operations_dashboard',
    targetId: null,
    details: {
      sent,
      silent,
      recommendationCount,
      gateEnabled: isAlertSendEnabled(),
    },
  });

  logger.info({ event: 'ops_digest.tick_complete', sent, silent, recommendationCount });
  return { sent, silent, recommendationCount };
}

let workerInstance: Worker | null = null;

export function startOpsDigestWorker(): Worker {
  if (workerInstance) return workerInstance;
  const connection = createRedisConnection();
  workerInstance = new Worker(
    QUEUE_NAME,
    async () => {
      return runOpsDigest();
    },
    { connection, concurrency: 1 },
  );

  workerInstance.on('failed', (job, err) => {
    logger.error({ event: 'ops_digest.job_failed', jobId: job?.id, error: err.message });
  });

  return workerInstance;
}

export async function closeOpsDigestWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
}

// Side-effect at module load matches the existing worker convention. Test mode
// skips to avoid opening a Redis connection.
const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
export const opsDigestWorker = isTestMode() ? null : startOpsDigestWorker();
