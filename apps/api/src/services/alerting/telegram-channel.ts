/**
 * Telegram Push Channel for CRITICAL Alerts
 *
 * Story 9-9 AC#6 (NOT an FRC item — see below). Sends push-notification alerts
 * to the operator's phone via a Telegram bot when a metric transitions to CRITICAL
 * severity. Layered alongside the existing email digest in alert.service.ts —
 * Telegram is instant push (phone vibrates), email is the slower audit trail.
 *
 * FRC framing note: the original Story 9-9 plan called this AC#6 = FRC item #5
 * ("alerting tier with push channel"). On 2026-04-27 the FRC was revised in
 * `_bmad-output/planning-artifacts/epics.md` — push-channel alerting was
 * DEMOTED to a Ministry hand-off recommendation (cost rejection: ~₦500-2K/mo
 * Twilio for SMS). Backup AES-256 client-side encryption (9-9 AC#5) was
 * promoted into the FRC #5 slot instead. This Telegram implementation is
 * still valuable — it closes the 19-hour detection-to-response gap from the
 * 2026-04-20 brute-force incident — but it is "above and beyond", not
 * field-blocking. Builder operates in email-attentive mode; Telegram is a
 * zero-cost upgrade on top.
 *
 * Configuration via env vars: TELEGRAM_BOT_TOKEN + TELEGRAM_OPERATOR_CHAT_ID.
 * Both must be set, OR the channel cleanly skips with no errors. This makes
 * dev/test/local environments work without ceremony — no token, no alerts.
 *
 * Setup is 5 minutes on the operator's phone (see .env.example for the recipe).
 *
 * Failure semantics: this function NEVER throws. Network errors, auth failures,
 * rate limits — all logged at `warn` level and swallowed. The alert subsystem
 * must not crash because Telegram is down.
 *
 * Environment gating (Story 9-15, post 2026-05-11 self-page incident): even when
 * TELEGRAM_BOT_TOKEN + TELEGRAM_OPERATOR_CHAT_ID are present, dispatch is gated
 * to NODE_ENV=production OR explicit ENABLE_TELEGRAM_ALERTS=true. Reason: if a
 * dev's local .env mirrors prod tokens for parity testing, any local metric
 * sample crossing 'critical' threshold (queue >200, cpu/mem >90%, p95 >350ms — Story 13-8)
 * would silently page the operator. Default-allow on production matches Express
 * conventions, requires zero deploy-time config change, and is failure-safe in
 * the right direction: a misconfigured prod is still loud; a misconfigured dev
 * is silent.
 */

import pino from 'pino';

const logger = pino({ name: 'telegram-channel' });

const TELEGRAM_API_BASE = 'https://api.telegram.org';

export interface CriticalAlertContext {
  metricKey: string;
  value: number;
  previousLevel?: string;
  timestamp: Date;
}

/**
 * Channel-send gate. Returns true iff dispatch should proceed.
 *
 * Allow when: NODE_ENV='production' OR ENABLE_TELEGRAM_ALERTS='true'.
 * Always block when: NODE_ENV='test' OR VITEST='true' (test-mode skip preserved
 * — the test guard is checked FIRST, so opt-in CANNOT override unit-test silence).
 *
 * Production is default-allow (no env-var change at deploy needed). Staging /
 * preview / QA environments must explicitly opt in via ENABLE_TELEGRAM_ALERTS.
 *
 * STRICT EQUALITY contract (review finding H1):
 * - NODE_ENV is matched EXACTLY against 'production' / 'test'. Variants like
 *   'prod', 'PRODUCTION', 'Production', or trailing whitespace will NOT match.
 *   If your platform sets a non-standard NODE_ENV value, set
 *   ENABLE_TELEGRAM_ALERTS='true' to opt in explicitly instead.
 * - ENABLE_TELEGRAM_ALERTS is matched EXACTLY against the literal string 'true'.
 *   Variants like '1', 'TRUE', 'yes', 'on' will NOT enable the channel.
 * Strictness is intentional — Boolean coercion of env strings is a recurring
 * footgun (e.g., "false" is truthy under !!), so we require the canonical value.
 */
export const isAlertSendEnabled = (): boolean => {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') return false;
  if (process.env.NODE_ENV === 'production') return true;
  return process.env.ENABLE_TELEGRAM_ALERTS === 'true';
};

export interface TelegramSendOptions {
  /** Telegram parse mode (e.g. 'MarkdownV2'). Omit for plain text. */
  parseMode?: 'MarkdownV2' | 'HTML';
  /** Send silently (no phone vibration / sound) — used for healthy digests. */
  disableNotification?: boolean;
}

/**
 * Low-level Telegram send used by all push surfaces (critical alerts + Story
 * 9-19 ops digest). Honours the same env gate + token/chat-id presence checks
 * and NEVER throws — failures are logged at `warn`/`debug` and swallowed.
 *
 * Returns `true` iff a message was actually dispatched to the Telegram API and
 * accepted (2xx). Returns `false` on any gate/config/transport failure so
 * callers (e.g. the digest worker's audit log) can record whether the send
 * really went out.
 */
export async function sendTelegramMessage(
  text: string,
  opts?: TelegramSendOptions,
): Promise<boolean> {
  if (!isAlertSendEnabled()) {
    logger.debug({ event: 'telegram.skipped_non_production' });
    return false;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_OPERATOR_CHAT_ID;

  if (!token || !chatId) {
    logger.debug({ event: 'telegram.skipped_no_config' });
    return false;
  }

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };
  if (opts?.parseMode) body.parse_mode = opts.parseMode;
  if (opts?.disableNotification) body.disable_notification = true;

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      logger.warn({ event: 'telegram.api_error', status: response.status, body: errBody.substring(0, 200) });
      return false;
    }

    logger.info({ event: 'telegram.message_sent' });
    return true;
  } catch (err) {
    logger.warn({ event: 'telegram.fetch_failed', error: (err as Error).message });
    return false;
  }
}

export async function sendCriticalTelegramAlert(
  ctx: CriticalAlertContext,
): Promise<void> {
  const sent = await sendTelegramMessage(formatAlertMessage(ctx));
  if (sent) {
    logger.info({ event: 'telegram.alert_sent', metricKey: ctx.metricKey, value: ctx.value });
  }
}

function formatAlertMessage(ctx: CriticalAlertContext): string {
  // Defensive: an Invalid Date (e.g. `new Date(NaN)`) would render as the literal
  // string "Invalid Date" in the alert. Fall back to the current time and flag
  // the substitution so a malformed caller is visible in the message itself.
  const validTimestamp =
    ctx.timestamp instanceof Date && !isNaN(ctx.timestamp.getTime());
  const ts = (validTimestamp ? ctx.timestamp : new Date()).toISOString();
  const tsNote = validTimestamp ? '' : ' (caller-supplied timestamp invalid — substituted now)';
  const escalation = ctx.previousLevel ? ` (was ${ctx.previousLevel})` : '';
  return [
    '🚨 CRITICAL ALERT — OSLRS',
    '',
    `Metric: ${ctx.metricKey}${escalation}`,
    `Value: ${ctx.value}`,
    `Time: ${ts}${tsNote}`,
    '',
    'Investigate via SSH (Tailscale) or the System Health dashboard.',
  ].join('\n');
}
