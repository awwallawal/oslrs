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

const isTestMode = (): boolean =>
  process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

export async function sendCriticalTelegramAlert(
  ctx: CriticalAlertContext,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_OPERATOR_CHAT_ID;

  if (!token || !chatId) {
    logger.debug({ event: 'telegram.skipped_no_config', metricKey: ctx.metricKey });
    return;
  }

  if (isTestMode()) {
    logger.debug({ event: 'telegram.skipped_test_mode', metricKey: ctx.metricKey });
    return;
  }

  const text = formatAlertMessage(ctx);

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.warn({
        event: 'telegram.api_error',
        status: response.status,
        body: body.substring(0, 200),
        metricKey: ctx.metricKey,
      });
      return;
    }

    logger.info({
      event: 'telegram.alert_sent',
      metricKey: ctx.metricKey,
      value: ctx.value,
    });
  } catch (err) {
    logger.warn({
      event: 'telegram.fetch_failed',
      error: (err as Error).message,
      metricKey: ctx.metricKey,
    });
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
