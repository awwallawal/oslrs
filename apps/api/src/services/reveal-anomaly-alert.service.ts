/**
 * Reveal Anomaly Alerting — Story 9-41 AC#1 (F-007 remediation).
 *
 * Turns the EXISTING pull-only reveal analytics (RevealAnalyticsService) into an
 * operational PUSH capability by routing two anomaly signals into the EXISTING
 * Telegram channel (alerting/telegram-channel.ts, Story 9-15):
 *
 *   1. Suspicious devices — one device fingerprint used by >= 2 distinct viewer
 *      accounts (getSuspiciousDevices).
 *   2. Viewer velocity — a single viewer whose reveal count in the rolling
 *      window has climbed into the MFA-friction band (getTopViewers).
 *
 * This is the prerequisite for AC#4's circuit-breaker: the breaker escalates to
 * a HUMAN, and that human must already be receiving real-time pages. AC#2 and
 * AC#4 also call `alertRevealAnomaly` inline on a breach.
 *
 * Reuse, don't rebuild: dispatch goes through `sendTelegramMessage` (same gate +
 * token/chat-id checks as the critical-alert path). No new alert channel.
 *
 * Cooldown: mirrors the per-metric cooldown pattern from Story 9-15 — an
 * in-memory Map keyed by anomaly metric, suppressing repeat pages within the
 * cooldown window so a sustained anomaly does not flood the operator's phone.
 *
 * Env gating: `isAlertSendEnabled()` is checked first so dev/test never self-page
 * (the 2026-05-11 self-page lesson). NEVER throws — a Telegram/analytics outage
 * must not break the reveal path or a scheduled sweep.
 */

import {
  isAlertSendEnabled,
  sendTelegramMessage,
} from './alerting/telegram-channel.js';
import { RevealAnalyticsService } from './reveal-analytics.service.js';
import { getRevealGuardConfig } from '../config/reveal-guard.config.js';
import pino from 'pino';

const logger = pino({ name: 'reveal-anomaly-alert' });

/** Repeat-page suppression window per anomaly metric key. */
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

const lastAlertedAt = new Map<string, number>();

function onCooldown(metricKey: string, now: number): boolean {
  const last = lastAlertedAt.get(metricKey);
  return last !== undefined && now - last < COOLDOWN_MS;
}

export interface AnomalySweepResult {
  suspiciousDeviceCount: number;
  velocityOffenderCount: number;
  alertsDispatched: number;
}

export class RevealAnomalyAlertService {
  /**
   * Dispatch a single anomaly alert to Telegram, gated by env + per-metric
   * cooldown. Returns true iff a page was actually dispatched. Fire-and-forget
   * safe — never throws.
   *
   * `nowMs` is injectable for deterministic cooldown tests.
   */
  static async alertRevealAnomaly(
    metricKey: string,
    message: string,
    nowMs: number = Date.now(),
  ): Promise<boolean> {
    if (!isAlertSendEnabled()) {
      logger.debug({ event: 'reveal_anomaly.skipped_non_production', metricKey });
      return false;
    }
    if (onCooldown(metricKey, nowMs)) {
      logger.debug({ event: 'reveal_anomaly.cooldown_suppressed', metricKey });
      return false;
    }

    // Mark BEFORE dispatch so a slow/failing send cannot let a concurrent call
    // through the cooldown gate. A failed send simply means no page this window.
    lastAlertedAt.set(metricKey, nowMs);

    try {
      const sent = await sendTelegramMessage(message);
      if (sent) {
        logger.warn({ event: 'reveal_anomaly.alert_sent', metricKey });
      }
      return sent;
    } catch (err) {
      logger.warn({
        event: 'reveal_anomaly.dispatch_failed',
        metricKey,
        error: (err as Error).message,
      });
      return false;
    }
  }

  /**
   * Scheduled/triggered sweep: pull the existing anomaly analytics and page on
   * anything that crosses threshold. Safe to call on a timer or after a reveal.
   * Never throws.
   */
  static async runChecks(nowMs: number = Date.now()): Promise<AnomalySweepResult> {
    const result: AnomalySweepResult = {
      suspiciousDeviceCount: 0,
      velocityOffenderCount: 0,
      alertsDispatched: 0,
    };

    // Short-circuit before touching the DB if we could never dispatch anyway.
    if (!isAlertSendEnabled()) {
      logger.debug({ event: 'reveal_anomaly.sweep_skipped_non_production' });
      return result;
    }

    const cfg = getRevealGuardConfig();
    const windowDays = Math.max(1, Math.round(cfg.windowSeconds / 86_400));

    try {
      const devices = await RevealAnalyticsService.getSuspiciousDevices(windowDays);
      result.suspiciousDeviceCount = devices.length;
      if (devices.length > 0) {
        const top = devices[0];
        const dispatched = await this.alertRevealAnomaly(
          'reveal.suspicious_devices',
          formatSuspiciousDeviceMessage(devices.length, top.accountCount, top.totalReveals),
          nowMs,
        );
        if (dispatched) result.alertsDispatched++;
      }
    } catch (err) {
      logger.warn({ event: 'reveal_anomaly.devices_query_failed', error: (err as Error).message });
    }

    try {
      const viewers = await RevealAnalyticsService.getTopViewers(windowDays);
      const offenders = viewers.filter((v) => v.revealCount >= cfg.frictionMfaThreshold);
      result.velocityOffenderCount = offenders.length;
      if (offenders.length > 0) {
        const worst = offenders[0];
        const dispatched = await this.alertRevealAnomaly(
          `reveal.viewer_velocity:${worst.viewerId}`,
          formatVelocityMessage(worst.viewerId, worst.revealCount, worst.distinctProfiles),
          nowMs,
        );
        if (dispatched) result.alertsDispatched++;
      }
    } catch (err) {
      logger.warn({ event: 'reveal_anomaly.viewers_query_failed', error: (err as Error).message });
    }

    return result;
  }

  /** Clear cooldown state — test seam. */
  static clearCooldowns(): void {
    lastAlertedAt.clear();
  }
}

function formatSuspiciousDeviceMessage(
  deviceCount: number,
  topAccountCount: number,
  topTotalReveals: number,
): string {
  return [
    '⚠️ REVEAL ANOMALY — suspicious devices',
    '',
    `${deviceCount} device fingerprint(s) shared across multiple accounts.`,
    `Worst: ${topAccountCount} accounts / ${topTotalReveals} reveals on one device.`,
    '',
    'Review Marketplace → Reveal Analytics → Suspicious Devices.',
  ].join('\n');
}

function formatVelocityMessage(
  viewerId: string,
  revealCount: number,
  distinctProfiles: number,
): string {
  return [
    '⚠️ REVEAL ANOMALY — viewer velocity',
    '',
    `Viewer ${viewerId} revealed ${revealCount} contacts (${distinctProfiles} distinct profiles) in-window.`,
    '',
    'Review Marketplace → Reveal Analytics → Top Viewers.',
  ].join('\n');
}
