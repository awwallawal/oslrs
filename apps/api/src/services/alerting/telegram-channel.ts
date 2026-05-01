/**
 * Telegram Push Channel for CRITICAL Alerts
 *
 * Story 9-9 AC#6 (FRC item #5). Sends push-notification alerts to the operator's
 * phone via a Telegram bot when a metric transitions to CRITICAL severity. Layered
 * alongside the existing email digest in alert.service.ts — Telegram is instant
 * push (phone vibrates), email is the slower audit trail.
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
  const ts = ctx.timestamp.toISOString();
  const escalation = ctx.previousLevel ? ` (was ${ctx.previousLevel})` : '';
  return [
    '🚨 CRITICAL ALERT — OSLRS',
    '',
    `Metric: ${ctx.metricKey}${escalation}`,
    `Value: ${ctx.value}`,
    `Time: ${ts}`,
    '',
    'Investigate via SSH (Tailscale) or the System Health dashboard.',
  ].join('\n');
}
