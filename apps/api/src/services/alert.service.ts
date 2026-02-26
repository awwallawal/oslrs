/**
 * Alert Service
 *
 * Threshold alerting with state machine (OK → Warning → Critical → Resolved)
 * and email delivery to active Super Admins via BullMQ email queue.
 *
 * Created in Story 6-2.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, roles } from '../db/schema/index.js';
import { EmailService } from './email.service.js';
import type { SystemHealthResponse } from '@oslsr/types';
import pino from 'pino';

const logger = pino({ name: 'alert-service' });

const isTestMode = () =>
  process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

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

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between repeat alerts
const MAX_ALERTS_PER_HOUR = 3;
const HYSTERESIS_CHECKS = 2; // Consecutive OK checks before resolving

// Threshold definitions
const THRESHOLDS: Record<string, ThresholdConfig> = {
  cpu: { warningThreshold: 70, criticalThreshold: 90, direction: 'above' },
  memory: { warningThreshold: 75, criticalThreshold: 90, direction: 'above' },
  disk_free: { warningThreshold: 20, criticalThreshold: 10, direction: 'below' },
  queue_waiting: { warningThreshold: 50, criticalThreshold: 200, direction: 'above' },
  api_p95_latency: { warningThreshold: 250, criticalThreshold: 500, direction: 'above' },
  db_status: { criticalThreshold: 0, direction: 'above' }, // value 1 = error, threshold 0 → 1 > 0 triggers
  redis_status: { criticalThreshold: 0, direction: 'above' },
};

// In-memory state map
const alertStates = new Map<string, AlertState>();
// Hourly alert count tracking
const hourlyAlertCounts = new Map<string, { count: number; windowStart: number }>();

export class AlertService {
  /**
   * Evaluate health data against thresholds, transition state machine, send alerts
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
      await this.evaluateMetric(metric.key, metric.value);
    }
  }

  /**
   * Evaluate a single metric against its threshold config
   */
  private static async evaluateMetric(key: string, value: number): Promise<void> {
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

        await this.sendAlert(key, 'resolved', value, previousLevel);
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
        await this.sendAlertWithCooldown(key, newLevel, value, state);
      } else if (state.level === newLevel) {
        // Same level — check cooldown for repeat alert
        await this.sendAlertWithCooldown(key, newLevel, value, state);
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
   * Send alert respecting cooldown and hourly rate limit
   */
  private static async sendAlertWithCooldown(
    key: string,
    level: AlertLevel,
    value: number,
    state: AlertState,
  ): Promise<void> {
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

    await this.sendAlert(key, level, value);

    state.lastNotified = new Date();
    state.notifyCount++;
    hourly.count++;
    hourlyAlertCounts.set(key, hourly);
  }

  /**
   * Send alert email to all active Super Admins
   */
  private static async sendAlert(
    metricKey: string,
    level: AlertLevel,
    value: number,
    previousLevel?: AlertLevel,
  ): Promise<void> {
    if (isTestMode()) {
      logger.info({ event: 'alert.test_mode', metricKey, level, value });
      return;
    }

    try {
      const superAdminEmails = await this.getActiveSuperAdminEmails();
      if (superAdminEmails.length === 0) {
        logger.warn({ event: 'alert.no_recipients' });
        return;
      }

      const subject = level === 'resolved'
        ? `[RESOLVED] OSLRS Alert: ${metricKey} recovered`
        : `[${level.toUpperCase()}] OSLRS Alert: ${metricKey}`;

      const body = this.formatAlertEmail(metricKey, level, value, previousLevel);

      for (const email of superAdminEmails) {
        await EmailService.sendGenericEmail({
          to: email,
          subject,
          html: body,
          text: `OSLRS System Alert\n\nMetric: ${metricKey}\nLevel: ${level}\nValue: ${value}\n\nPlease check the System Health dashboard.`,
        });
      }

      logger.info({
        event: 'alert.sent',
        metricKey,
        level,
        value,
        recipientCount: superAdminEmails.length,
      });
    } catch (err) {
      logger.error({
        event: 'alert.send_failed',
        metricKey,
        level,
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

  private static formatAlertEmail(
    metricKey: string,
    level: AlertLevel,
    value: number,
    previousLevel?: AlertLevel,
  ): string {
    const levelColor = level === 'critical' ? '#dc2626' : level === 'warning' ? '#f59e0b' : '#22c55e';
    const statusText = level === 'resolved'
      ? `Resolved (was ${previousLevel})`
      : level.charAt(0).toUpperCase() + level.slice(1);

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #9C1E23; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">OSLRS System Alert</h2>
        </div>
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Metric:</td>
              <td style="padding: 8px 0;">${metricKey}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Level:</td>
              <td style="padding: 8px 0;">
                <span style="background: ${levelColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 14px;">
                  ${statusText}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Current Value:</td>
              <td style="padding: 8px 0;">${value}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Time:</td>
              <td style="padding: 8px 0;">${new Date().toISOString()}</td>
            </tr>
          </table>
          <p style="margin-top: 16px; color: #6b7280; font-size: 14px;">
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
  }
}
