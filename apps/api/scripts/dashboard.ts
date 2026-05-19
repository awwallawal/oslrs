/**
 * OSLRS Operations Dashboard — CLI
 *
 * Single-command snapshot of VPS health + traffic + funnel + email + queue
 * + audit-log activity, with threshold-driven color coding and prescriptive
 * "next action" suggestions.
 *
 * Run on the production VPS via Tailscale SSH:
 *
 *   ssh root@oslsr-home-app
 *   cd /root/oslrs
 *   pnpm --filter @oslsr/api dashboard
 *
 * Implementation notes:
 *   - Each data source is fetched in parallel; a single failed source
 *     produces a "section unavailable" line instead of aborting the run.
 *   - Resend API is the canonical source for email deliverability (PM2 log
 *     buffer rotates every ~few hours and is not authoritative; see the
 *     2026-05-19 verification finding).
 *   - Thresholds are encoded as constants below and double as the source
 *     of truth for the planned Super Admin Operations Dashboard UI
 *     (Story 9-19, ready-for-dev). Keep them in sync if either side moves.
 *   - The "next action" hints bind specific metric breaches to specific
 *     stories. Step-4 stall ratio ≥ 40% means Story 9-17 Part B is
 *     critical-path; Resend usage ≥ 70% means upgrade today; etc.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { Resend } from 'resend';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// ─── Color helpers (no chalk dep) ──────────────────────────────────────────
const ESC = '\x1b[';
const c = {
  reset: `${ESC}0m`,
  bold: (s: string) => `${ESC}1m${s}${ESC}0m`,
  dim: (s: string) => `${ESC}2m${s}${ESC}0m`,
  green: (s: string) => `${ESC}32m${s}${ESC}0m`,
  yellow: (s: string) => `${ESC}33m${s}${ESC}0m`,
  red: (s: string) => `${ESC}31m${s}${ESC}0m`,
  cyan: (s: string) => `${ESC}36m${s}${ESC}0m`,
  gray: (s: string) => `${ESC}90m${s}${ESC}0m`,
};

// Threshold tiers (must mirror Story 9-19 spec when authored)
const T = {
  step4StallPctYellow: 30, step4StallPctRed: 50,
  diskUsedPctYellow:   60, diskUsedPctRed:   80,
  ramUsedPctYellow:    70, ramUsedPctRed:    85,
  cpuLoad1mYellow:    0.5, cpuLoad1mRed:    0.8,
  resendDailyPctYellow: 50, resendDailyPctRed: 80, // % of free-tier 100/day
  pm2RestartPer24hYellow: 2, pm2RestartPer24hRed: 5,
  queueFailedYellow: 1, queueFailedRed: 5,
  httpErrorsPer1hYellow: 5, httpErrorsPer1hRed: 25,
};

const LAUNCH_DATE = '2026-05-14 00:00:00';

// ─── tiny helper: status icon by threshold ─────────────────────────────────
function statusIcon(value: number, yellowAt: number, redAt: number, inverse = false) {
  // inverse=true → higher is better (e.g., headroom)
  const v = inverse ? -value : value;
  const y = inverse ? -yellowAt : yellowAt;
  const r = inverse ? -redAt : redAt;
  if (v >= r) return c.red('●');
  if (v >= y) return c.yellow('●');
  return c.green('●');
}

// ─── Section 1: VPS resource health ────────────────────────────────────────
interface SystemHealth {
  pm2Uptime: string;
  pm2RestartCount: number;
  pm2Memory: string;
  pm2CpuPct: number;
  osUptime: string;
  loadAvg1m: number;
  loadAvg5m: number;
  loadAvg15m: number;
  ramUsedMb: number;
  ramTotalMb: number;
  ramUsedPct: number;
  diskUsedGb: number;
  diskTotalGb: number;
  diskUsedPct: number;
}

function getSystemHealth(): SystemHealth | null {
  try {
    // PM2 JSON output
    const pm2Raw = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
    const pm2List = JSON.parse(pm2Raw);
    const api = pm2List.find((p: { name: string }) => p.name === 'oslsr-api') ?? pm2List[0];
    const pm2Uptime = api ? humanDuration(Date.now() - api.pm2_env.pm_uptime) : 'unknown';
    const pm2RestartCount = api?.pm2_env?.restart_time ?? 0;
    const pm2MemoryMb = api?.monit?.memory ? Math.round(api.monit.memory / 1024 / 1024) : 0;
    const pm2CpuPct = api?.monit?.cpu ?? 0;

    // uptime — load averages
    const uptimeRaw = execSync('uptime', { encoding: 'utf-8', timeout: 2000 });
    const loadMatch = uptimeRaw.match(/load average:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    const loadAvg1m = parseFloat(loadMatch?.[1] ?? '0');
    const loadAvg5m = parseFloat(loadMatch?.[2] ?? '0');
    const loadAvg15m = parseFloat(loadMatch?.[3] ?? '0');
    const osUptimeMatch = uptimeRaw.match(/up\s+(.+?),\s+\d+\s+user/);
    const osUptime = osUptimeMatch?.[1]?.trim() ?? 'unknown';

    // free — RAM
    const freeRaw = execSync('free -m', { encoding: 'utf-8', timeout: 2000 });
    const memMatch = freeRaw.match(/Mem:\s+(\d+)\s+(\d+)/);
    const ramTotalMb = parseInt(memMatch?.[1] ?? '0', 10);
    const ramUsedMb = parseInt(memMatch?.[2] ?? '0', 10);
    const ramUsedPct = ramTotalMb ? Math.round((ramUsedMb / ramTotalMb) * 100) : 0;

    // df — disk
    const dfRaw = execSync('df -BG /', { encoding: 'utf-8', timeout: 2000 });
    const diskMatch = dfRaw.match(/(\d+)G\s+(\d+)G\s+(\d+)G\s+(\d+)%/);
    const diskTotalGb = parseInt(diskMatch?.[1] ?? '0', 10);
    const diskUsedGb = parseInt(diskMatch?.[2] ?? '0', 10);
    const diskUsedPct = parseInt(diskMatch?.[4] ?? '0', 10);

    return {
      pm2Uptime, pm2RestartCount, pm2Memory: `${pm2MemoryMb} MB`, pm2CpuPct,
      osUptime, loadAvg1m, loadAvg5m, loadAvg15m,
      ramUsedMb, ramTotalMb, ramUsedPct,
      diskUsedGb, diskTotalGb, diskUsedPct,
    };
  } catch (e) {
    console.error(c.dim(`(system health unavailable: ${(e as Error).message})`));
    return null;
  }
}

function humanDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  const hrs = Math.floor((sec % 86400) / 3600);
  const min = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${min}m`;
  return `${min}m`;
}

// ─── Section 2: Traffic + funnel ───────────────────────────────────────────
interface TrafficSnapshot {
  totalRespondents: number;
  respondentsActive: number;
  respondentsPending: number;
  totalDrafts: number;
  draftsLast24h: number;
  funnel: Array<{ step: number; drafts: number }>;
  step4StallPct: number;
  magicLinksIssued: number;
  magicLinksConsumed: number;
  topAuditActions: Array<{ action: string; events: number }>;
}

async function getTraffic(pool: pg.Pool): Promise<TrafficSnapshot | null> {
  try {
    const launchClause = `created_at >= '${LAUNCH_DATE}'`;
    const now24hAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const [resp, drafts, drafts24h, funnel, ml, audit] = await Promise.all([
      pool.query(`
        SELECT count(*) AS total,
               count(*) FILTER (WHERE status='active') AS active,
               count(*) FILTER (WHERE status='pending_nin_capture') AS pending
        FROM respondents WHERE ${launchClause}`),
      pool.query(`SELECT count(*) AS total FROM wizard_drafts WHERE ${launchClause}`),
      pool.query(`SELECT count(*) AS total FROM wizard_drafts WHERE created_at >= $1`, [now24hAgo]),
      pool.query(`
        SELECT current_step::int AS step, count(*)::int AS drafts
        FROM wizard_drafts WHERE ${launchClause}
        GROUP BY 1 ORDER BY 1`),
      pool.query(`
        SELECT count(*) AS issued,
               count(*) FILTER (WHERE consumed_at IS NOT NULL) AS consumed
        FROM magic_link_tokens WHERE ${launchClause}`),
      pool.query(`
        SELECT action, count(*)::int AS events
        FROM audit_logs WHERE ${launchClause}
        GROUP BY action ORDER BY count(*) DESC LIMIT 6`),
    ]);

    const totalDrafts = parseInt(drafts.rows[0]?.total ?? '0', 10);
    const step4Drafts = funnel.rows.find((r: { step: number; drafts: number }) => r.step === 4)?.drafts ?? 0;
    const step4StallPct = totalDrafts > 0 ? Math.round((step4Drafts / totalDrafts) * 100) : 0;

    return {
      totalRespondents: parseInt(resp.rows[0]?.total ?? '0', 10),
      respondentsActive: parseInt(resp.rows[0]?.active ?? '0', 10),
      respondentsPending: parseInt(resp.rows[0]?.pending ?? '0', 10),
      totalDrafts,
      draftsLast24h: parseInt(drafts24h.rows[0]?.total ?? '0', 10),
      funnel: funnel.rows.map((r: { step: number; drafts: number }) => ({ step: r.step, drafts: r.drafts })),
      step4StallPct,
      magicLinksIssued: parseInt(ml.rows[0]?.issued ?? '0', 10),
      magicLinksConsumed: parseInt(ml.rows[0]?.consumed ?? '0', 10),
      topAuditActions: audit.rows,
    };
  } catch (e) {
    console.error(c.dim(`(traffic unavailable: ${(e as Error).message})`));
    return null;
  }
}

// ─── Section 3: Resend deliverability ──────────────────────────────────────
interface ResendStatus {
  recentCount: number;
  delivered: number;
  bounced: number;
  complained: number;
  last5: Array<{ when: string; to: string; subject: string; event: string }>;
  todayCount: number;
}

async function getResendStatus(): Promise<ResendStatus | null> {
  if (!process.env.RESEND_API_KEY) return null;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const list = await resend.emails.list({ limit: 100 });
    if (list.error) {
      console.error(c.dim(`(Resend API error: ${list.error.message})`));
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
    const recent = emails.filter(e => new Date(e.created_at) >= launch);
    const today = emails.filter(e => new Date(e.created_at) >= todayStart);
    return {
      recentCount: recent.length,
      delivered: recent.filter(e => e.last_event === 'delivered').length,
      bounced: recent.filter(e => e.last_event === 'bounced').length,
      complained: recent.filter(e => e.last_event === 'complained').length,
      todayCount: today.length,
      last5: emails.slice(0, 5).map(e => ({
        when: e.created_at,
        to: Array.isArray(e.to) ? e.to[0] : e.to,
        subject: (e.subject ?? '').slice(0, 60),
        event: e.last_event ?? '?',
      })),
    };
  } catch (e) {
    console.error(c.dim(`(Resend check failed: ${(e as Error).message})`));
    return null;
  }
}

// ─── Section 4: BullMQ queue health ────────────────────────────────────────
interface QueueHealth {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  failedSamples: Array<{ id: string | undefined; name: string; reason: string }>;
}

async function getQueueHealth(): Promise<QueueHealth | null> {
  try {
    const IORedis = (await import('ioredis')).default;
    const { Queue } = await import('bullmq');
    const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    const queue = new Queue('email', { connection: redis });
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);
    let failedSamples: Array<{ id: string | undefined; name: string; reason: string }> = [];
    if (failed > 0) {
      const jobs = await queue.getFailed(0, 4);
      failedSamples = jobs.map(j => ({
        id: j.id,
        name: j.name,
        reason: (j.failedReason ?? '').slice(0, 80),
      }));
    }
    await queue.close();
    redis.disconnect();
    return { waiting, active, completed, failed, delayed, failedSamples };
  } catch (e) {
    console.error(c.dim(`(queue check failed: ${(e as Error).message})`));
    return null;
  }
}

// ─── Rendering ─────────────────────────────────────────────────────────────
function bar(used: number, total: number, width = 20): string {
  const pct = total > 0 ? used / total : 0;
  const filled = Math.round(pct * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}

function render(
  sys: SystemHealth | null,
  traffic: TrafficSnapshot | null,
  resend: ResendStatus | null,
  queue: QueueHealth | null,
): void {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const sep = c.gray('─'.repeat(64));

  console.log();
  console.log(c.bold(c.cyan('  OSLRS Operations Dashboard')) + c.gray(`  ·  ${now} UTC`));
  console.log(sep);

  // System health
  console.log(c.bold('  System health'));
  if (sys) {
    const ramIcon = statusIcon(sys.ramUsedPct, T.ramUsedPctYellow, T.ramUsedPctRed);
    const diskIcon = statusIcon(sys.diskUsedPct, T.diskUsedPctYellow, T.diskUsedPctRed);
    const cpuIcon = statusIcon(sys.loadAvg1m, T.cpuLoad1mYellow, T.cpuLoad1mRed);
    const restartIcon = statusIcon(sys.pm2RestartCount, T.pm2RestartPer24hYellow * 365, T.pm2RestartPer24hRed * 365); // lifetime; only red on true mayhem
    console.log(`    ${restartIcon} API process     ${c.bold('online')}  uptime ${sys.pm2Uptime}, restarts ${sys.pm2RestartCount}, mem ${sys.pm2Memory}, cpu ${sys.pm2CpuPct}%`);
    console.log(`    ${cpuIcon} CPU load (1m)   ${sys.loadAvg1m.toFixed(2)} ${c.gray(`(5m ${sys.loadAvg5m.toFixed(2)}, 15m ${sys.loadAvg15m.toFixed(2)})`)}`);
    console.log(`    ${ramIcon} RAM             ${bar(sys.ramUsedMb, sys.ramTotalMb)} ${sys.ramUsedMb}/${sys.ramTotalMb} MB (${sys.ramUsedPct}%)`);
    console.log(`    ${diskIcon} Disk            ${bar(sys.diskUsedGb, sys.diskTotalGb)} ${sys.diskUsedGb}/${sys.diskTotalGb} GB (${sys.diskUsedPct}%)`);
    console.log(`    ${c.gray('·')} OS uptime       ${sys.osUptime}`);
  } else {
    console.log(c.dim('    section unavailable'));
  }
  console.log();

  // Traffic + funnel
  console.log(c.bold('  Adoption + funnel') + c.gray(`  ·  since ${LAUNCH_DATE.slice(0, 10)}`));
  if (traffic) {
    const stallIcon = statusIcon(traffic.step4StallPct, T.step4StallPctYellow, T.step4StallPctRed);
    const completePct = traffic.totalDrafts > 0
      ? Math.round((traffic.totalRespondents / traffic.totalDrafts) * 100) : 0;
    console.log(`    ${c.gray('·')} Total drafts       ${traffic.totalDrafts}  (last 24h: ${traffic.draftsLast24h})`);
    console.log(`    ${c.gray('·')} Completed regs.   ${traffic.totalRespondents}  ${c.gray(`(active: ${traffic.respondentsActive}, pending-NIN: ${traffic.respondentsPending})`)}`);
    console.log(`    ${c.gray('·')} Completion rate    ${completePct}%`);
    console.log(`    ${stallIcon} Step-4 stall      ${c.bold(traffic.step4StallPct + '%')}  of live drafts`);
    console.log(`    ${c.gray('·')} Funnel breakdown`);
    for (const f of traffic.funnel) {
      const barW = 24;
      const barFilled = traffic.totalDrafts > 0 ? Math.round((f.drafts / traffic.totalDrafts) * barW) : 0;
      const stepBar = '█'.repeat(barFilled) + c.gray('░'.repeat(barW - barFilled));
      console.log(`         Step ${f.step}  ${stepBar} ${f.drafts}`);
    }
    console.log(`    ${c.gray('·')} Magic-links        ${traffic.magicLinksIssued} issued · ${traffic.magicLinksConsumed} consumed`);
    console.log(`    ${c.gray('·')} Top audit events`);
    for (const a of traffic.topAuditActions) {
      console.log(`         ${a.action.padEnd(30)} ${a.events}`);
    }
  } else {
    console.log(c.dim('    section unavailable'));
  }
  console.log();

  // Resend
  console.log(c.bold('  Email deliverability') + c.gray('  ·  Resend API'));
  if (resend) {
    const dailyPct = Math.round((resend.todayCount / 100) * 100);
    const dailyIcon = statusIcon(dailyPct, T.resendDailyPctYellow, T.resendDailyPctRed);
    const bounceIcon = statusIcon(resend.bounced + resend.complained, 1, 5);
    console.log(`    ${dailyIcon} Today (Resend free tier 100/day)  ${resend.todayCount}/100 (${dailyPct}%)`);
    console.log(`    ${bounceIcon} Since launch    ${resend.recentCount} sent  ${c.green(`${resend.delivered} delivered`)} ${resend.bounced ? c.red(`${resend.bounced} bounced`) : ''} ${resend.complained ? c.red(`${resend.complained} complained`) : ''}`);
    console.log(c.gray('    Last 5 sends:'));
    for (const e of resend.last5) {
      const eventColor = e.event === 'delivered' ? c.green : (e.event === 'bounced' ? c.red : c.yellow);
      console.log(`         ${e.when.slice(0, 19)}  ${e.to.padEnd(30)} ${eventColor(e.event.padEnd(10))} ${c.gray(e.subject)}`);
    }
  } else {
    console.log(c.dim('    section unavailable'));
  }
  console.log();

  // Queue
  console.log(c.bold('  Email queue (BullMQ)'));
  if (queue) {
    const failedIcon = statusIcon(queue.failed, T.queueFailedYellow, T.queueFailedRed);
    console.log(`    ${failedIcon} ${queue.waiting} waiting  ·  ${queue.active} active  ·  ${queue.completed} completed  ·  ${queue.failed} ${queue.failed > 0 ? c.red('failed') : 'failed'}  ·  ${queue.delayed} delayed`);
    if (queue.failedSamples.length > 0) {
      console.log(c.red('    Failed job samples:'));
      for (const j of queue.failedSamples) {
        console.log(`         ${j.id}  ${j.name}  ${c.gray(j.reason)}`);
      }
    }
  } else {
    console.log(c.dim('    section unavailable'));
  }
  console.log();

  // Recommendations — bind metric breaches to specific stories/actions
  console.log(c.bold('  Recommendations') + c.gray('  ·  metric breaches → next action'));
  const recs: string[] = [];
  if (traffic && traffic.step4StallPct >= T.step4StallPctRed) {
    recs.push(c.red(`▲ Step-4 stall ${traffic.step4StallPct}% — Story 9-17 Part B (Pattern C field dedup) is critical-path. Authors questions duplicate work in Step 4; dedup eliminates the friction.`));
  } else if (traffic && traffic.step4StallPct >= T.step4StallPctYellow) {
    recs.push(c.yellow(`▲ Step-4 stall ${traffic.step4StallPct}% — flagging Story 9-17 Part B as next-up. Add internal section-progress pill to Step 4 (1-2 day quick-win) while 9-17 is in dev.`));
  }
  if (resend && resend.todayCount >= 100 * T.resendDailyPctRed / 100) {
    recs.push(c.red(`▲ Resend usage at ${resend.todayCount}/100 today — UPGRADE Resend to Pro tier ($20/mo, 50k/mo) now; magic-link emails will silently fail when the limit hits.`));
  } else if (resend && resend.todayCount >= 100 * T.resendDailyPctYellow / 100) {
    recs.push(c.yellow(`▲ Resend usage trending — ${resend.todayCount}/100 today. Plan the Pro upgrade in the next 24-48h.`));
  }
  if (resend && (resend.bounced > 0 || resend.complained > 0)) {
    recs.push(c.red(`▲ Resend deliverability — ${resend.bounced} bounced, ${resend.complained} complained. Inspect at resend.com/logs and check DNS DKIM/SPF.`));
  }
  if (sys && sys.diskUsedPct >= T.diskUsedPctRed) {
    recs.push(c.red(`▲ Disk ${sys.diskUsedPct}% — DO live-resize the droplet or rotate older PM2 logs; 100% disk = backend crashes.`));
  } else if (sys && sys.diskUsedPct >= T.diskUsedPctYellow) {
    recs.push(c.yellow(`▲ Disk ${sys.diskUsedPct}% — plan a cleanup; pm2-logrotate is running but PM2 history could be pruned.`));
  }
  if (sys && sys.ramUsedPct >= T.ramUsedPctRed) {
    recs.push(c.red(`▲ RAM ${sys.ramUsedPct}% — DO live-resize 2GB → 4GB before next deploy; tight RAM = OOM-killer risk.`));
  }
  if (sys && sys.loadAvg1m >= T.cpuLoad1mRed) {
    recs.push(c.red(`▲ CPU load ${sys.loadAvg1m.toFixed(2)} — single Node thread saturating; PM2 cluster mode (2 workers) is the next lever.`));
  }
  if (queue && queue.failed >= T.queueFailedRed) {
    recs.push(c.red(`▲ Email queue ${queue.failed} failed jobs — inspect failed job samples above; retry or fix root cause before backlog grows.`));
  } else if (queue && queue.failed >= T.queueFailedYellow) {
    recs.push(c.yellow(`▲ Email queue ${queue.failed} failed jobs — investigate; usually a Resend rate-limit or invalid recipient.`));
  }
  if (recs.length === 0) {
    console.log(`    ${c.green('●')} All metrics within healthy thresholds. No action required.`);
  } else {
    for (const r of recs) console.log(`    ${r}`);
  }
  console.log();
  console.log(c.gray('  Operations Dashboard UI (Story 9-19, ready-for-dev) will render the same data in the Super Admin dashboard with 30s auto-refresh.'));
  console.log();
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const [sys, traffic, resend, queue] = await Promise.all([
    Promise.resolve(getSystemHealth()),
    getTraffic(pool),
    getResendStatus(),
    getQueueHealth(),
  ]);
  render(sys, traffic, resend, queue);
  await pool.end();
}
main().catch((e) => {
  console.error(c.red(`Dashboard failed: ${(e as Error).message}`));
  process.exit(1);
});
