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
import { NotificationAbuseService, type AbuseFinding } from '../services/notification-abuse.service.js';
import {
  RESEND_MONTHLY_QUOTA,
  type OpsDashboardSnapshot,
  type NotificationUsage,
  type FieldStaffPhotoHealth,
  type IngestionHealth,
  INGESTION_RED_AFTER_HOURS,
} from '@oslsr/types';
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
 * Story 9-63 (AC4) — format the once-daily notification-usage lines (total +
 * top categories + bounced/complained) for the digest. Pure; returns escaped
 * MarkdownV2 lines. Empty array when usage is unavailable (caller renders the
 * "unavailable" placeholder).
 */
export function formatNotificationUsageLines(usage: NotificationUsage | null | undefined): string[] {
  if (!usage) return ['⚪ *Notifications*: section unavailable'];
  const e = usage.today.email;
  const s = usage.today.sms;
  const topCats = e.byCategory
    .slice(0, 3)
    .map((cat) => `${cat.category} ${cat.count}`)
    .join(', ');
  const negative = e.bounced + e.complained + s.bounced + s.complained;
  const negGlyph = negative > 0 ? '🟡' : '📨';
  const lines: string[] = [];
  lines.push(
    `${negGlyph} *Notifications* \\(today\\): ${escapeMarkdownV2(
      `email ${e.total} sent, sms ${s.total} sent, ${e.bounced + s.bounced} bounced, ${e.complained + s.complained} complained`,
    )}`,
  );
  if (topCats) {
    lines.push(`   ${escapeMarkdownV2(`top: ${topCats}`)}`);
  }
  return lines;
}

/**
 * Story 9-63 (AC5) — format abuse/anomaly findings for the digest. Each finding
 * gets a 🚨 marker so it stands apart from the routine recommendations.
 */
export function formatAbuseLines(findings: AbuseFinding[]): string[] {
  if (findings.length === 0) return [];
  const lines: string[] = ['', '*Abuse / anomaly alerts*'];
  for (const f of findings) {
    lines.push(`🚨 ${escapeMarkdownV2(f.text)}`);
  }
  return lines;
}

/**
 * Story 13-60 (AC3.2) — field staff who cannot be issued an ID card.
 *
 * ⚠️ SILENT WHEN ZERO, on purpose (13-42's discipline: fire on the real shape,
 * say nothing when there is nothing). A permanent "0 missing" line is a line
 * the operator learns to skip, and this one has to be readable on the morning
 * somebody is about to print twelve cards.
 *
 * Also silent when the section is unavailable — an absent count is not a
 * finding, and rendering "unavailable" here would train the same blindness.
 *
 * Pure; returns escaped MarkdownV2 lines.
 */
export function formatFieldStaffPhotoLines(health: FieldStaffPhotoHealth | null | undefined): string[] {
  if (!health) return [];
  if (health.missingPhoto === 0) return [];

  // A system-caused failure is worse than a deliberate skip, so it drives the
  // glyph: red when we broke it, yellow when they chose it.
  const glyph = health.failed > 0 ? '🔴' : '🟡';
  const lines: string[] = [
    `${glyph} *ID cards*: ${escapeMarkdownV2(
      `${health.missingPhoto} of ${health.activeFieldStaff} active field staff have no photo — no card can be printed for them`,
    )}`,
  ];

  const breakdown: string[] = [];
  if (health.failed > 0) breakdown.push(`${health.failed} failed (our fault, they were told)`);
  if (health.skipped > 0) breakdown.push(`${health.skipped} skipped the step`);
  const unknown = health.missingPhoto - health.failed - health.skipped;
  // Pre-13-60 accounts carry no status. Say "not recorded" rather than folding
  // them into skipped — inventing the distinction is the defect, not the fix.
  if (unknown > 0) breakdown.push(`${unknown} not recorded (pre-13-60)`);
  if (breakdown.length > 0) {
    lines.push(`   ${escapeMarkdownV2(breakdown.join(', '))}`);
  }

  if (health.fromUpload > 0) {
    lines.push(
      `   ${escapeMarkdownV2(`${health.fromUpload} of ${health.withPhoto} stored photos came from an upload, not a live capture`)}`,
    );
  }

  return lines;
}

/**
 * ⭐ STORY 13-57 (AC3) — submissions that never became respondents.
 *
 * This is the line that would have caught Rosemary and Adekemi on 4 August
 * rather than on the 9th, and its shape is chosen from what went wrong:
 *
 *  - It names the PEOPLE, not the rows. "2 unprocessable submissions" is a
 *    database fact; "2 people filled in the form and are not on the register"
 *    is the thing an operator will act on before lunch.
 *  - It splits DEAD (a reason was recorded) from STUCK (none ever was),
 *    because the two need different actions: read the reason, versus go and
 *    look. Merging them is how the dead hid among the busy for five days.
 *  - It carries the AGE of the oldest, which is the only part that answers
 *    "is this new, or has it been sitting here?"
 *
 * ⚠️ SILENT WHEN ZERO, on purpose (13-42 AC4, and 13-60's line does the same).
 * A permanent "0 unprocessable" trains the operator to skip the line, and this
 * one has to be readable on the morning it is not zero. Silent when the section
 * is unavailable too — an absent count is not a finding.
 *
 * Pure; returns escaped MarkdownV2 lines.
 */
export function formatIngestionHealthLines(health: IngestionHealth | null | undefined): string[] {
  if (!health) return [];
  /**
   * ⚠️ `deduplicated` AND `acknowledged` ARE EXCLUDED FROM THE TOTAL (code
   * review 2026-08-14, H1 + H2). A duplicate-NIN rejection means the person IS
   * on the register — putting it under the sentence below would print the
   * opposite of the truth about a real citizen, which is the error this story
   * had to retract three times. An acknowledged row has already been dealt
   * with. They are shown as context ONLY when the section is already speaking,
   * so the operator can see why `processing_error` holds more rows than the
   * count claims — never as a standing line of their own.
   */
  const total = health.dead + health.stuck;
  if (total === 0) return [];

  // Red once the oldest has survived a full digest cycle — the same rule the
  // recommendation uses, from the same constant, so the glyph and the
  // recommendation can never disagree with each other.
  const glyph =
    health.oldestAgeHours !== null && health.oldestAgeHours >= INGESTION_RED_AFTER_HOURS
      ? '🔴'
      : '🟡';

  const age =
    health.oldestAgeHours === null
      ? 'age unknown'
      : health.oldestAgeHours < 1
        ? 'oldest under 1h'
        : `oldest ${health.oldestAgeHours}h`;

  const lines: string[] = [
    `${glyph} *Ingestion*: ${escapeMarkdownV2(
      `${total} submission(s) never became a respondent — those people are NOT on the register (${age})`,
    )}`,
  ];

  const breakdown: string[] = [];
  if (health.dead > 0) breakdown.push(`${health.dead} with a recorded reason (processing_error)`);
  if (health.stuck > 0) {
    breakdown.push(
      `${health.stuck} stuck >${health.stuckAfterMinutes}m with no reason recorded`,
    );
  }
  lines.push(`   ${escapeMarkdownV2(breakdown.join(', '))}`);

  // Context, not findings — and each says plainly why it is NOT in the count
  // above, so nobody re-derives "the numbers don't add up" as a bug.
  const context: string[] = [];
  if (health.deduplicated > 0) {
    context.push(
      `${health.deduplicated} refused as a duplicate NIN (those people ARE on the register — not counted)`,
    );
  }
  if (health.acknowledged > 0) {
    context.push(`${health.acknowledged} already acknowledged by an operator (not counted)`);
  }
  if (context.length > 0) lines.push(`   ${escapeMarkdownV2(context.join(', '))}`);

  return lines;
}

/**
 * Build the digest message body (MarkdownV2). Exported for unit tests (AC#D4).
 * Pure — takes a snapshot (+ optional notification usage & abuse findings),
 * returns a string ≤ TELEGRAM_MAX_CHARS.
 */
export function formatDigest(
  snapshot: OpsDashboardSnapshot,
  abuseFindings: AbuseFinding[] = [],
): string {
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
    const tr = snapshot.traffic;
    /**
     * REFRAMED 2026-08-05. This line used to read
     *   "🟡 Adoption: 278 drafts (24h 4), 307 done, Step-4 stall 32%"
     * and every number in it was answering a question nobody was asking any more.
     *
     * 13-49 sorted the drafts into buckets: 167 ADOPTED (their person is in the
     * register; the row is retained under the keep-forever ruling) and 164 expired.
     * "278 drafts" therefore read as a backlog of 278 abandoned people when the real
     * in-flight number was 79 — and 58 of the 88 rows "stalled at step 4" belonged to
     * people who had already finished. **A solved problem was still alarming.**
     *
     * Two separate facts now, because they are separate:
     *   REGISTER  — the outcome, which only goes up.
     *   IN-FLIGHT — people actually mid-wizard, with retained rows named as retained
     *               so a large total never again reads as failure.
     */
    const stallGlyph = tierGlyph(tr.step4StallPct, T.step4StallPctYellow, T.step4StallPctRed);
    lines.push(
      `🟢 *Register*: ${escapeMarkdownV2(`${tr.totalRespondents} registered (${tr.respondentsActive} active, ${tr.respondentsPending} pending NIN)`)}`,
    );
    lines.push(
      `${stallGlyph} *In flight*: ${escapeMarkdownV2(
        `${tr.draftsLive} live draft(s), ${tr.step4LiveDrafts} at step 4 (${tr.step4StallPct}%) · +${tr.draftsLast24h} new in 24h`,
      )}`,
    );
    lines.push(
      `   ${escapeMarkdownV2(`${tr.draftsRetained} retained (already registered, or expired) — kept by policy, not a backlog`)}`,
    );
  } else {
    lines.push('⚪ *Register*: section unavailable');
  }

  // Email — quota from the METER (uncapped), delivery from Resend (page-limited).
  // These are two different sources on purpose and the line says which is which:
  // `resend.todayCount` cannot exceed the 100-row page and must never drive the
  // glyph. See the comment on RESEND_LIST_PAGE_SIZE.
  const monthEmail = snapshot.notificationUsage?.thisMonth.email.total ?? null;
  if (monthEmail !== null) {
    const monthPct = Math.round((monthEmail / RESEND_MONTHLY_QUOTA) * 100);
    const glyph = tierGlyph(monthPct, T.resendMonthlyPctYellow, T.resendMonthlyPctRed);
    const delivery = snapshot.resend
      ? `, ${snapshot.resend.delivered}${snapshot.resend.truncated ? '+' : ''} delivered, ${snapshot.resend.bounced}${snapshot.resend.truncated ? '+' : ''} bounced`
      : '';
    lines.push(
      `${glyph} *Email*: ${escapeMarkdownV2(
        `${monthEmail}/${RESEND_MONTHLY_QUOTA} this month (${monthPct}%)${delivery}`,
      )}`,
    );
    if (snapshot.resend?.truncated) {
      lines.push(
        `   ${escapeMarkdownV2('delivery figures are a lower bound — Resend list API returns one 100-row page')}`,
      );
    }
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

  // Notification usage (AC4) — internal meter, per-category.
  for (const l of formatNotificationUsageLines(snapshot.notificationUsage)) {
    lines.push(l);
  }

  // Story 13-60 (AC3.2) — field staff with no ID-card photo. Emits nothing at
  // all when every active field officer has one.
  for (const l of formatFieldStaffPhotoLines(snapshot.fieldStaffPhotos)) {
    lines.push(l);
  }

  // Story 13-57 (AC3) — submissions that never became respondents. Silent when
  // there are none; the paired recommendation is what makes the phone buzz.
  for (const l of formatIngestionHealthLines(snapshot.ingestion)) {
    lines.push(l);
  }

  // Abuse / anomaly alerts (AC5).
  for (const l of formatAbuseLines(abuseFindings)) {
    lines.push(l);
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
  abuseFindingCount: number;
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

  // Story 9-63 (AC5) — sweep the meter for abuse/anomaly findings. Never throws
  // into the digest tick (the service is pure-read + fail-open).
  let abuseFindings: AbuseFinding[] = [];
  try {
    abuseFindings = await NotificationAbuseService.detect();
  } catch (err) {
    logger.warn({ event: 'ops_digest.abuse_detect_failed', error: (err as Error).message });
  }

  // Healthy snapshot → silent push (no buzz). Any recommendation OR abuse
  // finding → audible (abuse is always worth a vibration).
  const silent = recommendationCount === 0 && abuseFindings.length === 0;
  const message = formatDigest(snapshot, abuseFindings);

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
      abuseFindingCount: abuseFindings.length,
      gateEnabled: isAlertSendEnabled(),
    },
  });

  logger.info({
    event: 'ops_digest.tick_complete',
    sent,
    silent,
    recommendationCount,
    abuseFindingCount: abuseFindings.length,
  });
  return { sent, silent, recommendationCount, abuseFindingCount: abuseFindings.length };
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
