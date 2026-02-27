/**
 * Alert Service
 *
 * Threshold alerting with state machine (OK -> Warning -> Critical -> Resolved)
 * and consolidated digest email delivery to active Super Admins.
 *
 * Alerts are queued per-metric during each evaluation cycle, then flushed as a
 * single digest email at most every 15 minutes, with a daily cap of 20 emails.
 * Digest send state is persisted to disk so PM2/server restarts don't reset
 * cooldowns and re-trigger a burst of alerts.
 *
 * Created in Story 6-2. Refactored to digest-based delivery to prevent
 * Resend email quota exhaustion from per-metric individual alerts.
 */

import { eq, and } from 'drizzle-orm';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { db } from '../db/index.js';
import { users, roles } from '../db/schema/index.js';
import { EmailService } from './email.service.js';
import type { SystemHealthResponse } from '@oslsr/types';
import pino from 'pino';

const logger = pino({ name: 'alert-service' });

const isNonProductionMode = () =>
  process.env.VITEST === 'true' ||
  process.env.NODE_ENV === 'test' ||
  process.env.NODE_ENV === 'development' ||
  !process.env.NODE_ENV;

export type AlertLevel = 'ok' | 'warning' | 'critical' | 'resolved';

interface AlertState {
  level: AlertLevel;
  since: Date;
  lastNotified: Date | null;
  notifyCount: number;
  consecutiveOkChecks: number;
}

interface ThresholdConfig {
  warningThreshold?: number;
  criticalThreshold?: number;
  /** 'above' means alert when value > threshold, 'below' means alert when value < threshold */
  direction: 'above' | 'below';
}

interface PendingAlert {
  level: AlertLevel;
  value: number;
  previousLevel?: AlertLevel;
}

// Per-metric gating
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between repeat alerts per metric
const MAX_ALERTS_PER_HOUR = 3;
const HYSTERESIS_CHECKS = 2; // Consecutive OK checks before resolving

// Digest delivery
const DIGEST_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes between digest emails
const MAX_DAILY_DIGEST_EMAILS = 20;
const ALERT_STATE_PATH = join(tmpdir(), 'oslrs-alert-digest-state.json');

// Threshold definitions
const THRESHOLDS: Record<string, ThresholdConfig> = {
  cpu: { warningThreshold: 70, criticalThreshold: 90, direction: 'above' },
  memory: { warningThreshold: 75, criticalThreshold: 90, direction: 'above' },
  disk_free: { warningThreshold: 20, criticalThreshold: 10, direction: 'below' },
  queue_waiting: { warningThreshold: 50, criticalThreshold: 200, direction: 'above' },
  api_p95_latency: { warningThreshold: 250, criticalThreshold: 500, direction: 'above' },
  db_status: { criticalThreshold: 0, direction: 'above' }, // value 1 = error, threshold 0 -> 1 > 0 triggers
  redis_status: { criticalThreshold: 0, direction: 'above' },
};

// In-memory per-metric state
const alertStates = new Map<string, AlertState>();
const hourlyAlertCounts = new Map<string, { count: number; windowStart: number }>();

// Digest accumulation state
const pendingDigest = new Map<string, PendingAlert>();
let lastDigestSent = 0;
let dailyEmailCount = 0;
let dailyWindowStart = 0;
let digestStateLoaded = false;

function loadDigestState(): void {
  if (digestStateLoaded) return;
  digestStateLoaded = true;
  try {
    const raw = readFileSync(ALERT_STATE_PATH, 'utf-8');
    const data = JSON.parse(raw);
    lastDigestSent = data.lastDigestSent || 0;
    dailyEmailCount = data.dailyEmailCount || 0;
    dailyWindowStart = data.dailyWindowStart || 0;
  } catch {
    // No persisted state or corrupt file — use defaults
  }
}

function persistDigestState(): void {
  try {
    writeFileSync(
      ALERT_STATE_PATH,
      JSON.stringify({ lastDigestSent, dailyEmailCount, dailyWindowStart }),
    );
  } catch (err) {
    logger.error({ event: 'alert.persist_state_failed', error: (err as Error).message });
  }
}

export class AlertService {
  /**
   * Evaluate health data against thresholds, transition state machine, flush digest
   */
  static async evaluateAlerts(health: SystemHealthResponse): Promise<void> {
    const metrics: Array<{ key: string; value: number }> = [
      { key: 'cpu', value: health.cpu.usagePercent },
      { key: 'memory', value: health.memory.usagePercent },
      // Disk: report free% (100 - usage) for 'below' direction threshold
      { key: 'disk_free', value: health.disk.usagePercent > 0 ? 100 - health.disk.usagePercent : 100 },
      { key: 'db_status', value: health.database.status === 'error' ? 1 : 0 },
      { key: 'redis_status', value: health.redis.status === 'error' ? 1 : 0 },
    ];

    // API p95 latency (only evaluate if we have data)
    if (health.apiLatency.p95Ms > 0) {
      metrics.push({ key: 'api_p95_latency', value: health.apiLatency.p95Ms });
    }

    // Add per-queue waiting counts
    for (const queue of health.queues) {
      metrics.push({ key: `queue_waiting:${queue.name}`, value: queue.waiting });
    }

    for (const metric of metrics) {
      this.evaluateMetric(metric.key, metric.value);
    }

    // Flush accumulated alerts as a single consolidated digest email
    await this.flushDigest();
  }

  /**
   * Evaluate a single metric against its threshold config
   */
  private static evaluateMetric(key: string, value: number): void {
    // Resolve threshold config (queue metrics share 'queue_waiting' config)
    const configKey = key.startsWith('queue_waiting:') ? 'queue_waiting' : key;
    const config = THRESHOLDS[configKey];
    if (!config) return;

    const state = alertStates.get(key) || {
      level: 'ok' as AlertLevel,
      since: new Date(),
      lastNotified: null,
      notifyCount: 0,
      consecutiveOkChecks: 0,
    };

    const isBreached = this.isThresholdBreached(value, config);
    const isCritical = this.isCriticalBreached(value, config);

    if (!isBreached) {
      // Value is within normal range
      state.consecutiveOkChecks++;

      if (
        (state.level === 'warning' || state.level === 'critical') &&
        state.consecutiveOkChecks >= HYSTERESIS_CHECKS
      ) {
        // Resolve after hysteresis period
        const previousLevel = state.level;
        state.level = 'ok';
        state.since = new Date();
        state.notifyCount = 0;
        state.consecutiveOkChecks = 0;

        this.queueAlert(key, 'resolved', value, previousLevel);
      }
    } else {
      // Threshold breached
      state.consecutiveOkChecks = 0;

      const newLevel: AlertLevel = isCritical ? 'critical' : 'warning';
      const levelChanged = state.level !== newLevel && state.level !== 'resolved';
      const isEscalation = newLevel === 'critical' && state.level === 'warning';

      if (state.level === 'ok' || levelChanged || isEscalation) {
        state.level = newLevel;
        state.since = new Date();
        this.queueAlertWithCooldown(key, newLevel, value, state);
      } else if (state.level === newLevel) {
        // Same level — check cooldown for repeat alert
        this.queueAlertWithCooldown(key, newLevel, value, state);
      }
    }

    alertStates.set(key, state);
  }

  private static isThresholdBreached(value: number, config: ThresholdConfig): boolean {
    const threshold = config.warningThreshold ?? config.criticalThreshold;
    if (threshold === undefined) return false;

    return config.direction === 'above' ? value > threshold : value < threshold;
  }

  private static isCriticalBreached(value: number, config: ThresholdConfig): boolean {
    if (config.criticalThreshold === undefined) return false;
    return config.direction === 'above'
      ? value > config.criticalThreshold
      : value < config.criticalThreshold;
  }

  /**
   * Gate alert queueing with per-metric cooldown and hourly rate limit
   */
  private static queueAlertWithCooldown(
    key: string,
    level: AlertLevel,
    value: number,
    state: AlertState,
  ): void {
    const now = Date.now();

    // Check cooldown
    if (state.lastNotified && now - state.lastNotified.getTime() < COOLDOWN_MS) {
      return;
    }

    // Check hourly rate limit
    const hourly = hourlyAlertCounts.get(key) || { count: 0, windowStart: now };
    if (now - hourly.windowStart > 3600_000) {
      // Reset window
      hourly.count = 0;
      hourly.windowStart = now;
    }
    if (hourly.count >= MAX_ALERTS_PER_HOUR) {
      return;
    }

    this.queueAlert(key, level, value);

    state.lastNotified = new Date();
    state.notifyCount++;
    hourly.count++;
    hourlyAlertCounts.set(key, hourly);
  }

  /**
   * Add alert to pending digest batch (replaces immediate email sending)
   */
  private static queueAlert(
    metricKey: string,
    level: AlertLevel,
    value: number,
    previousLevel?: AlertLevel,
  ): void {
    pendingDigest.set(metricKey, { level, value, previousLevel });
  }

  /**
   * Send accumulated alerts as a single consolidated digest email.
   * Respects a 15-minute global cooldown and 20 emails/day cap.
   * State is persisted to disk so server restarts don't reset counters.
   */
  private static async flushDigest(): Promise<void> {
    if (isNonProductionMode()) {
      if (pendingDigest.size > 0) {
        logger.info({
          event: 'alert.digest_suppressed_non_production',
          alertCount: pendingDigest.size,
        });
        pendingDigest.clear();
      }
      return;
    }

    if (pendingDigest.size === 0) return;

    loadDigestState();
    const now = Date.now();

    // Reset daily counter if 24h window expired
    if (now - dailyWindowStart > 24 * 60 * 60 * 1000) {
      dailyEmailCount = 0;
      dailyWindowStart = now;
    }

    // Check daily cap
    if (dailyEmailCount >= MAX_DAILY_DIGEST_EMAILS) {
      logger.warn({ event: 'alert.daily_cap_reached', dailyEmailCount });
      pendingDigest.clear();
      return;
    }

    // Check global cooldown — keep pending alerts for next flush cycle
    if (now - lastDigestSent < DIGEST_INTERVAL_MS) {
      return;
    }

    try {
      const superAdminEmails = await this.getActiveSuperAdminEmails();
      if (superAdminEmails.length === 0) {
        logger.warn({ event: 'alert.no_recipients' });
        pendingDigest.clear();
        return;
      }

      const alerts = Array.from(pendingDigest.entries()).map(([key, data]) => ({
        metricKey: key,
        ...data,
      }));

      const hasCritical = alerts.some((a) => a.level === 'critical');
      const hasWarning = alerts.some((a) => a.level === 'warning');
      const severity = hasCritical ? 'CRITICAL' : hasWarning ? 'WARNING' : 'RESOLVED';
      const subject = `[${severity}] OSLRS System Health Digest (${alerts.length} alert${alerts.length > 1 ? 's' : ''})`;

      const html = this.formatDigestEmail(alerts);
      const text = `OSLRS System Health Digest\n\n${alerts.map((a) => `${a.level.toUpperCase()}: ${a.metricKey} = ${a.value}`).join('\n')}\n\nPlease check the System Health dashboard.`;

      for (const email of superAdminEmails) {
        await EmailService.sendGenericEmail({ to: email, subject, html, text });
      }

      logger.info({
        event: 'alert.digest_sent',
        alertCount: alerts.length,
        recipientCount: superAdminEmails.length,
        dailyEmailCount: dailyEmailCount + 1,
      });

      pendingDigest.clear();
      lastDigestSent = now;
      dailyEmailCount++;
      persistDigestState();
    } catch (err) {
      logger.error({
        event: 'alert.digest_send_failed',
        error: (err as Error).message,
      });
    }
  }

  /**
   * Query active Super Admin email addresses
   */
  private static async getActiveSuperAdminEmails(): Promise<string[]> {
    try {
      const result = await db
        .select({ email: users.email })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(and(eq(roles.name, 'super_admin'), eq(users.status, 'active')));

      return result.map((r) => r.email);
    } catch (err) {
      logger.error({ event: 'alert.query_admins_failed', error: (err as Error).message });
      return [];
    }
  }

  /**
   * Format a digest email containing multiple alert rows
   */
  private static formatDigestEmail(
    alerts: Array<{ metricKey: string; level: AlertLevel; value: number; previousLevel?: AlertLevel }>,
  ): string {
    const rows = alerts
      .map((a) => {
        const levelColor =
          a.level === 'critical' ? '#dc2626' : a.level === 'warning' ? '#f59e0b' : '#22c55e';
        const statusText =
          a.level === 'resolved'
            ? `Resolved (was ${a.previousLevel})`
            : a.level.charAt(0).toUpperCase() + a.level.slice(1);
        return `
            <tr>
              <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${a.metricKey}</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">
                <span style="background: ${levelColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 13px;">
                  ${statusText}
                </span>
              </td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${a.value}</td>
            </tr>`;
      })
      .join('');

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #9C1E23; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">OSLRS System Health Digest</h2>
          <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">
            ${alerts.length} alert${alerts.length > 1 ? 's' : ''} &middot; ${new Date().toISOString()}
          </p>
        </div>
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 0; border-radius: 0 0 8px 8px;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f9fafb;">
                <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #6b7280;">Metric</th>
                <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #6b7280;">Level</th>
                <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #6b7280;">Value</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
          <p style="padding: 16px 12px; margin: 0; color: #6b7280; font-size: 14px;">
            Please check the <strong>System Health</strong> dashboard for full details.
          </p>
        </div>
      </div>
    `;
  }

  /** Get current alert states (for dashboard display) */
  static getAlertStates(): Map<string, AlertState> {
    return new Map(alertStates);
  }

  /** Clear all alert states (for testing) */
  static clearStates(): void {
    alertStates.clear();
    hourlyAlertCounts.clear();
    pendingDigest.clear();
    lastDigestSent = 0;
    dailyEmailCount = 0;
    dailyWindowStart = 0;
    digestStateLoaded = false;
  }
}
