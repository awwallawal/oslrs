/**
 * OperationsService — canonical data-gathering layer for the Operations
 * Dashboard (Story 9-19).
 *
 * Part A shipped the `pnpm dashboard` CLI with the gathering logic inline.
 * Part B (AC#B2) extracts that logic here so the CLI, the Super Admin UI
 * endpoint, and the Telegram digest worker (Part C) all share ONE
 * implementation. The CLI (`apps/api/scripts/dashboard.ts`) now imports these
 * functions and only owns its ANSI rendering.
 *
 * Threshold constants + recommendation severities come from the shared
 * `@oslsr/types` `OPS_THRESHOLDS` module (AC#B1) so the CLI and UI can never
 * drift.
 *
 * Each data source is fetched in parallel and degrades independently: a single
 * failed source yields `null` for that section rather than aborting the whole
 * snapshot (AC#B6 empty-state parity with the CLI's "section unavailable").
 *
 * A 30-second in-memory cache (Risk #3) coalesces concurrent dashboard viewers
 * + the 30s TanStack poll so the funnel queries don't run multiplicatively.
 */
import { exec } from 'node:child_process';
import { Resend } from 'resend';
import {
  OPS_THRESHOLDS as T,
  opsStatusLevel,
  RESEND_FREE_TIER_DAILY,
  type OpsSystemHealth,
  type OpsTrafficSnapshot,
  type OpsResendStatus,
  type OpsQueueHealth,
  type OpsRecommendation,
  type OpsDashboardSnapshot,
  type NotificationUsage,
} from '@oslsr/types';
import { pool } from '../db/index.js';
import { getEmailQueueStats, getEmailFailedSamples } from '../queues/email.queue.js';
import { NotificationMeter } from './notification-meter.service.js';
import pino from 'pino';

const logger = pino({ name: 'operations-service' });

/** Launch date — the funnel + traffic windows count from here. */
export const LAUNCH_DATE = '2026-05-14 00:00:00';

/**
 * Run a shell command asynchronously and resolve its stdout. Uses callback-based
 * `exec` (NOT `execSync`) so the single-threaded API event loop is never blocked
 * while pm2/free/df run — a blocked loop would freeze every concurrent request
 * (logins, wizard saves) on the 2GB VPS. The CLI and the API endpoint share this.
 */
function execCapture(command: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { encoding: 'utf-8', timeout }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

/**
 * Human-friendly duration from milliseconds. Portable helper shared by the CLI
 * render layer + the digest worker. Exported for Part A unit tests (AC#D1).
 */
export function humanDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  const hrs = Math.floor((sec % 86400) / 3600);
  const min = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${min}m`;
  return `${min}m`;
}

// ─── Section 1: VPS resource health (runs ON the VPS) ───────────────────────

export async function getSystemHealth(): Promise<OpsSystemHealth | null> {
  try {
    const pm2Raw = await execCapture('pm2 jlist 2>/dev/null', 5000);
    const pm2List = JSON.parse(pm2Raw);
    const api = pm2List.find((p: { name: string }) => p.name === 'oslsr-api') ?? pm2List[0];
    const pm2Uptime = api ? humanDuration(Date.now() - api.pm2_env.pm_uptime) : 'unknown';
    const pm2RestartCount = api?.pm2_env?.restart_time ?? 0;
    const pm2MemoryMb = api?.monit?.memory ? Math.round(api.monit.memory / 1024 / 1024) : 0;
    const pm2CpuPct = api?.monit?.cpu ?? 0;

    const uptimeRaw = await execCapture('uptime', 2000);
    const loadMatch = uptimeRaw.match(/load average:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    const loadAvg1m = parseFloat(loadMatch?.[1] ?? '0');
    const loadAvg5m = parseFloat(loadMatch?.[2] ?? '0');
    const loadAvg15m = parseFloat(loadMatch?.[3] ?? '0');
    const osUptimeMatch = uptimeRaw.match(/up\s+(.+?),\s+\d+\s+user/);
    const osUptime = osUptimeMatch?.[1]?.trim() ?? 'unknown';

    const freeRaw = await execCapture('free -m', 2000);
    const memMatch = freeRaw.match(/Mem:\s+(\d+)\s+(\d+)/);
    const ramTotalMb = parseInt(memMatch?.[1] ?? '0', 10);
    const ramUsedMb = parseInt(memMatch?.[2] ?? '0', 10);
    const ramUsedPct = ramTotalMb ? Math.round((ramUsedMb / ramTotalMb) * 100) : 0;

    const dfRaw = await execCapture('df -BG /', 2000);
    const diskMatch = dfRaw.match(/(\d+)G\s+(\d+)G\s+(\d+)G\s+(\d+)%/);
    const diskTotalGb = parseInt(diskMatch?.[1] ?? '0', 10);
    const diskUsedGb = parseInt(diskMatch?.[2] ?? '0', 10);
    const diskUsedPct = parseInt(diskMatch?.[4] ?? '0', 10);

    return {
      pm2Uptime,
      pm2RestartCount,
      pm2Memory: `${pm2MemoryMb} MB`,
      pm2CpuPct,
      osUptime,
      loadAvg1m,
      loadAvg5m,
      loadAvg15m,
      ramUsedMb,
      ramTotalMb,
      ramUsedPct,
      diskUsedGb,
      diskTotalGb,
      diskUsedPct,
    };
  } catch (e) {
    logger.warn({ event: 'operations.system_health_unavailable', error: (e as Error).message });
    return null;
  }
}

// ─── Section 2: Traffic + funnel ────────────────────────────────────────────

export async function getTraffic(): Promise<OpsTrafficSnapshot | null> {
  try {
    const now24hAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const [resp, drafts, drafts24h, funnel, ml] = await Promise.all([
      pool.query(
        `SELECT count(*) AS total,
               count(*) FILTER (WHERE status='active') AS active,
               count(*) FILTER (WHERE status='pending_nin_capture') AS pending
        FROM respondents WHERE created_at >= $1`,
        [LAUNCH_DATE],
      ),
      pool.query(`SELECT count(*) AS total FROM wizard_drafts WHERE created_at >= $1`, [LAUNCH_DATE]),
      pool.query(`SELECT count(*) AS total FROM wizard_drafts WHERE created_at >= $1`, [now24hAgo]),
      pool.query(
        `SELECT current_step::int AS step, count(*)::int AS drafts
        FROM wizard_drafts WHERE created_at >= $1
        GROUP BY 1 ORDER BY 1`,
        [LAUNCH_DATE],
      ),
      pool.query(
        `SELECT count(*) AS issued,
               count(*) FILTER (WHERE used_at IS NOT NULL) AS consumed
        FROM magic_link_tokens WHERE created_at >= $1`,
        [LAUNCH_DATE],
      ),
    ]);

    // Audit "top actions" is the 5th data source (AC#A2) — degrade it
    // INDEPENDENTLY so an audit-query failure yields [] rather than nulling the
    // whole adoption/funnel section.
    const topAuditActions = await pool
      .query(
        `SELECT action, count(*)::int AS events
        FROM audit_logs WHERE created_at >= $1
        GROUP BY action ORDER BY count(*) DESC LIMIT 6`,
        [LAUNCH_DATE],
      )
      .then((r) => r.rows)
      .catch((e) => {
        logger.warn({ event: 'operations.audit_actions_unavailable', error: (e as Error).message });
        return [];
      });

    const totalDrafts = parseInt(drafts.rows[0]?.total ?? '0', 10);
    const step4Drafts =
      funnel.rows.find((r: { step: number; drafts: number }) => r.step === 4)?.drafts ?? 0;
    const step4StallPct = totalDrafts > 0 ? Math.round((step4Drafts / totalDrafts) * 100) : 0;

    return {
      totalRespondents: parseInt(resp.rows[0]?.total ?? '0', 10),
      respondentsActive: parseInt(resp.rows[0]?.active ?? '0', 10),
      respondentsPending: parseInt(resp.rows[0]?.pending ?? '0', 10),
      totalDrafts,
      draftsLast24h: parseInt(drafts24h.rows[0]?.total ?? '0', 10),
      funnel: funnel.rows.map((r: { step: number; drafts: number }) => ({
        step: r.step,
        drafts: r.drafts,
      })),
      step4StallPct,
      magicLinksIssued: parseInt(ml.rows[0]?.issued ?? '0', 10),
      magicLinksConsumed: parseInt(ml.rows[0]?.consumed ?? '0', 10),
      topAuditActions,
    };
  } catch (e) {
    logger.warn({ event: 'operations.traffic_unavailable', error: (e as Error).message });
    return null;
  }
}

// ─── Section 3: Resend deliverability ───────────────────────────────────────

export async function getResendStatus(): Promise<OpsResendStatus | null> {
  if (!process.env.RESEND_API_KEY) return null;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const list = await resend.emails.list({ limit: RESEND_FREE_TIER_DAILY });
    if (list.error) {
      logger.warn({ event: 'operations.resend_api_error', error: list.error.message });
      return null;
    }
    const emails = (list.data?.data ?? []) as Array<{
      created_at: string;
      to: string[] | string;
      subject?: string;
      last_event?: string;
    }>;
    const launch = new Date(LAUNCH_DATE);
    const todayStart = new Date(new Date().setUTCHours(0, 0, 0, 0));
    const recent = emails.filter((e) => new Date(e.created_at) >= launch);
    const today = emails.filter((e) => new Date(e.created_at) >= todayStart);
    // Resend's list API caps at 100 rows/page; a full page means our counts are
    // a LOWER BOUND (there may be more sends — e.g. on a cohort-blast day). Flag
    // it so the UI/digest render "100+" instead of a misleading exact count.
    const truncated = emails.length >= RESEND_FREE_TIER_DAILY;
    return {
      recentCount: recent.length,
      delivered: recent.filter((e) => e.last_event === 'delivered').length,
      bounced: recent.filter((e) => e.last_event === 'bounced').length,
      complained: recent.filter((e) => e.last_event === 'complained').length,
      todayCount: today.length,
      truncated,
      last5: emails.slice(0, 5).map((e) => ({
        when: e.created_at,
        to: Array.isArray(e.to) ? e.to[0] : e.to,
        subject: (e.subject ?? '').slice(0, 60),
        event: e.last_event ?? '?',
      })),
    };
  } catch (e) {
    logger.warn({ event: 'operations.resend_check_failed', error: (e as Error).message });
    return null;
  }
}

// ─── Section 3b: NotificationMeter usage (Story 9-63 / AC3) ─────────────────

/**
 * Per-category email + SMS usage read from the INTERNAL NotificationMeter Redis
 * counters (the source of truth — every send flows through the meter chokepoint),
 * for today + this month. Distinct from `getResendStatus()`, which reads the
 * Resend list API (capped at 100 rows → a lower bound, useful only for
 * delivery/bounce reconciliation). Degrades to `null` on failure like every
 * other section.
 */
export async function getNotificationUsage(): Promise<NotificationUsage | null> {
  try {
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const month = now.toISOString().slice(0, 7); // YYYY-MM

    const [emailToday, smsToday, emailMonth, smsMonth] = await Promise.all([
      NotificationMeter.readUsage('email', 'daily', date),
      NotificationMeter.readUsage('sms', 'daily', date),
      NotificationMeter.readUsage('email', 'monthly', month),
      NotificationMeter.readUsage('sms', 'monthly', month),
    ]);

    return {
      date,
      month,
      today: { email: emailToday, sms: smsToday },
      thisMonth: { email: emailMonth, sms: smsMonth },
    };
  } catch (e) {
    logger.warn({ event: 'operations.notification_usage_unavailable', error: (e as Error).message });
    return null;
  }
}

// ─── Section 4: BullMQ queue health ─────────────────────────────────────────

export async function getQueueHealth(): Promise<OpsQueueHealth | null> {
  try {
    // Part A's CLI queried a queue literally named 'email'; the real queue is
    // 'email-notification'. Routing through getEmailQueueStats() fixes that
    // latent always-zero bug and reuses the singleton connection.
    const stats = await getEmailQueueStats();
    const failedSamples = stats.failed > 0 ? await getEmailFailedSamples(5) : [];
    return {
      waiting: stats.waiting,
      active: stats.active,
      completed: stats.completed,
      failed: stats.failed,
      delayed: stats.delayed,
      failedSamples,
    };
  } catch (e) {
    logger.warn({ event: 'operations.queue_check_failed', error: (e as Error).message });
    return null;
  }
}

// ─── Recommendations — bind metric breaches to specific stories/actions ─────

/**
 * Derive the metric→action recommendation list from a snapshot. Plain text (no
 * ANSI / no markup); the CLI colours by `severity`, the UI colours by
 * `severity`, the Telegram digest renders them verbatim. Shared so all three
 * surfaces emit identical wording (AC#B5 / AC#C2).
 */
export function buildRecommendations(
  parts: Pick<OpsDashboardSnapshot, 'system' | 'traffic' | 'resend' | 'queue'>,
): OpsRecommendation[] {
  const { system: sys, traffic, resend, queue } = parts;
  const recs: OpsRecommendation[] = [];

  if (traffic && traffic.step4StallPct >= T.step4StallPctRed) {
    recs.push({
      severity: 'red',
      key: 'step4-stall',
      text: `Step-4 stall ${traffic.step4StallPct}% — Story 9-17 Part B (Pattern C field dedup) is critical-path. Authored questions duplicate work in Step 4; dedup eliminates the friction.`,
    });
  } else if (traffic && traffic.step4StallPct >= T.step4StallPctYellow) {
    recs.push({
      severity: 'yellow',
      key: 'step4-stall',
      text: `Step-4 stall ${traffic.step4StallPct}% — flagging Story 9-17 Part B as next-up. Add internal section-progress pill to Step 4 (1-2 day quick-win) while 9-17 is in dev.`,
    });
  }

  if (resend && resend.todayCount >= (RESEND_FREE_TIER_DAILY * T.resendDailyPctRed) / 100) {
    recs.push({
      severity: 'red',
      key: 'resend-usage',
      text: `Resend usage at ${resend.todayCount}/100 today — UPGRADE Resend to Pro tier ($20/mo, 50k/mo) now; magic-link emails will silently fail when the limit hits.`,
    });
  } else if (resend && resend.todayCount >= (RESEND_FREE_TIER_DAILY * T.resendDailyPctYellow) / 100) {
    recs.push({
      severity: 'yellow',
      key: 'resend-usage',
      text: `Resend usage trending — ${resend.todayCount}/100 today. Plan the Pro upgrade in the next 24-48h.`,
    });
  }

  if (resend && (resend.bounced > 0 || resend.complained > 0)) {
    recs.push({
      severity: 'red',
      key: 'resend-deliverability',
      text: `Resend deliverability — ${resend.bounced} bounced, ${resend.complained} complained. Inspect at resend.com/logs and check DNS DKIM/SPF.`,
    });
  }

  if (sys && sys.diskUsedPct >= T.diskUsedPctRed) {
    recs.push({
      severity: 'red',
      key: 'disk',
      text: `Disk ${sys.diskUsedPct}% — DO live-resize the droplet or rotate older PM2 logs; 100% disk = backend crashes.`,
    });
  } else if (sys && sys.diskUsedPct >= T.diskUsedPctYellow) {
    recs.push({
      severity: 'yellow',
      key: 'disk',
      text: `Disk ${sys.diskUsedPct}% — plan a cleanup; pm2-logrotate is running but PM2 history could be pruned.`,
    });
  }

  if (sys && sys.ramUsedPct >= T.ramUsedPctRed) {
    recs.push({
      severity: 'red',
      key: 'ram',
      text: `RAM ${sys.ramUsedPct}% — DO live-resize 2GB → 4GB before next deploy; tight RAM = OOM-killer risk.`,
    });
  }

  if (sys && sys.loadAvg1m >= T.cpuLoad1mRed) {
    recs.push({
      severity: 'red',
      key: 'cpu',
      text: `CPU load ${sys.loadAvg1m.toFixed(2)} — single Node thread saturating; PM2 cluster mode (2 workers) is the next lever.`,
    });
  }

  if (queue && queue.failed >= T.queueFailedRed) {
    recs.push({
      severity: 'red',
      key: 'queue-failed',
      text: `Email queue ${queue.failed} failed jobs — inspect failed job samples; retry or fix root cause before backlog grows.`,
    });
  } else if (queue && queue.failed >= T.queueFailedYellow) {
    recs.push({
      severity: 'yellow',
      key: 'queue-failed',
      text: `Email queue ${queue.failed} failed jobs — investigate; usually a Resend rate-limit or invalid recipient.`,
    });
  }

  return recs;
}

// ─── Snapshot orchestration + 30s cache ─────────────────────────────────────

let cached: { at: number; snapshot: OpsDashboardSnapshot } | null = null;
const CACHE_TTL_MS = 30_000;

export class OperationsService {
  /** Convenience for callers that want the threshold constants without a second import. */
  static readonly thresholds = T;
  static readonly statusLevel = opsStatusLevel;

  /**
   * Gather all four sections in parallel + derive recommendations.
   *
   * @param opts.force  Bypass the 30s cache (used by the UI's manual-refresh
   *                    button, AC#B4). Defaults to false → serves the cache
   *                    when warm.
   */
  static async getDashboardSnapshot(opts?: { force?: boolean }): Promise<OpsDashboardSnapshot> {
    if (!opts?.force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.snapshot;
    }

    const [system, traffic, resend, queue, notificationUsage] = await Promise.all([
      getSystemHealth(),
      getTraffic(),
      getResendStatus(),
      getQueueHealth(),
      getNotificationUsage(),
    ]);

    const snapshot: OpsDashboardSnapshot = {
      generatedAt: new Date().toISOString(),
      system,
      traffic,
      resend,
      queue,
      notificationUsage,
      recommendations: buildRecommendations({ system, traffic, resend, queue }),
    };

    cached = { at: Date.now(), snapshot };
    return snapshot;
  }

  /** Test-only — drop the memo so cache behaviour can be asserted deterministically. */
  static _clearCache(): void {
    cached = null;
  }
}
