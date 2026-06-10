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
 * Implementation notes (Story 9-19):
 *   - As of Part B the data-gathering logic lives in
 *     `apps/api/src/services/operations.service.ts` and is SHARED with the
 *     Super Admin UI endpoint + the Telegram digest worker. This file owns
 *     only the ANSI rendering.
 *   - Thresholds + recommendation wording come from `@oslsr/types`
 *     (`OPS_THRESHOLDS`) — the single source of truth for every surface.
 *   - Each data source degrades independently to a "section unavailable" line.
 *   - `main()` only runs when the file is executed directly (so unit tests can
 *     import the pure helpers without spinning up DB/Redis connections).
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  OPS_THRESHOLDS as T,
  opsStatusLevel,
  RESEND_FREE_TIER_DAILY,
  type OpsStatusLevel,
  type OpsSystemHealth,
  type OpsTrafficSnapshot,
  type OpsResendStatus,
  type OpsQueueHealth,
} from '@oslsr/types';
import {
  LAUNCH_DATE,
  getSystemHealth,
  getTraffic,
  getResendStatus,
  getQueueHealth,
  buildRecommendations,
} from '../src/services/operations.service.js';
import { pool } from '../src/db/index.js';
import { closeEmailQueue } from '../src/queues/email.queue.js';
import {
  getCloudflareDashboardSummary,
  type CloudflareDashboardSummary,
} from '../src/lib/cloudflare-analytics.js';

// Re-export the shared threshold object + helper so the AC#D1 unit test can
// assert the CLI and the shared module reference the same source of truth.
export { T, opsStatusLevel };

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

/** Colored dot for a status level. */
function dot(level: OpsStatusLevel): string {
  if (level === 'red') return c.red('●');
  if (level === 'yellow') return c.yellow('●');
  return c.green('●');
}

/**
 * Status dot by threshold — thin wrapper over the shared `opsStatusLevel` so
 * the CLI's colour decision is identical to the UI's. Exported for AC#D1 tests.
 */
export function statusIcon(value: number, yellowAt: number, redAt: number, inverse = false): string {
  return dot(opsStatusLevel(value, yellowAt, redAt, inverse));
}

// ─── Rendering ─────────────────────────────────────────────────────────────
function bar(used: number, total: number, width = 20): string {
  const pct = total > 0 ? used / total : 0;
  const filled = Math.round(pct * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}

/** Cloudflare edge-traffic section. Reuses the shared lib so the CLI and the
 * standalone cf-analytics deep-dive read the same data. CLI-only (does NOT
 * touch the live API ops endpoint or the Telegram digest). */
function renderCloudflare(cf: CloudflareDashboardSummary | null): void {
  console.log(c.bold('  Edge traffic') + c.gray('  ·  Cloudflare (oyoskills.com zone)'));
  if (!cf) {
    console.log(c.dim('    section unavailable') + c.gray('  (set CLOUDFLARE_API_TOKEN in .env)'));
    console.log();
    return;
  }

  const z = cf.zone;
  if (z) {
    // Cache low / threats present are the two operator signals worth a colour.
    const cacheIcon = z.cacheHitPct >= 40 ? c.green('●') : z.cacheHitPct >= 15 ? c.yellow('●') : c.red('●');
    const threatIcon = z.threats === 0 ? c.green('●') : z.threats < 200 ? c.yellow('●') : c.red('●');
    console.log(`    ${c.gray('·')} Requests        ${c.bold(z.requests.toLocaleString('en-US'))}  ${c.gray(`(${z.windowLabel}, daily)`)}  ·  uniques ${z.uniques.toLocaleString('en-US')}`);
    console.log(`    ${cacheIcon} Cache hit ratio ${z.cacheHitPct}%  ${c.gray('(higher = less droplet load)')}`);
    console.log(`    ${threatIcon} Threats blocked ${z.threats.toLocaleString('en-US')}`);
    const errStatuses = z.status.filter((s) => s.code >= 400);
    if (errStatuses.length) {
      const errLine = errStatuses.slice(0, 4).map((s) => `${s.code}:${s.count.toLocaleString('en-US')}`).join('  ');
      console.log(`    ${c.gray('·')} Errors          ${errLine}`);
    }
    const top = z.countries.slice(0, 5).map((x) => `${x.country} ${x.count.toLocaleString('en-US')}`).join('  ·  ');
    console.log(`    ${c.gray('·')} Top countries   ${top}`);
  } else {
    console.log(c.dim('    zone data unavailable') + (cf.zoneError ? c.gray(`  (${cf.zoneError.slice(0, 60)})`) : ''));
  }

  const r = cf.rum;
  if (r) {
    const topPages = r.topPages.slice(0, 3).map((p) => p.page.replace(/^www\.|^oyoskills\.com/, '')).filter(Boolean);
    console.log(`    ${c.gray('·')} Page views      ${r.pageViews.toLocaleString('en-US')}  ·  visits ${r.visits.toLocaleString('en-US')}  ${c.gray(`(top: ${topPages.join(', ') || '—'})`)}`);
  } else if (cf.rumError) {
    console.log(c.gray(`    · RUM unavailable (${cf.rumError.includes('access') ? 'token lacks Account Analytics:Read' : cf.rumError.slice(0, 50)})`));
  }
  console.log();
}

function render(
  sys: OpsSystemHealth | null,
  traffic: OpsTrafficSnapshot | null,
  resend: OpsResendStatus | null,
  queue: OpsQueueHealth | null,
  cf: CloudflareDashboardSummary | null,
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
    const dailyPct = Math.round((resend.todayCount / RESEND_FREE_TIER_DAILY) * 100);
    const dailyIcon = statusIcon(dailyPct, T.resendDailyPctYellow, T.resendDailyPctRed);
    const bounceIcon = statusIcon(resend.bounced + resend.complained, 1, 5);
    const todayLabel = `${resend.todayCount}${resend.truncated ? '+' : ''}/${RESEND_FREE_TIER_DAILY}`;
    console.log(`    ${dailyIcon} Today (Resend free tier ${RESEND_FREE_TIER_DAILY}/day)  ${todayLabel} (${dailyPct}%)`);
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

  // Cloudflare edge traffic (CLI-only; reuses shared lib).
  renderCloudflare(cf);

  // Recommendations — bind metric breaches to specific stories/actions.
  // Wording is derived by the SHARED buildRecommendations() so the CLI, UI,
  // and Telegram digest are always identical (Story 9-19 AC#B5 / AC#C2).
  console.log(c.bold('  Recommendations') + c.gray('  ·  metric breaches → next action'));
  const recs = buildRecommendations({ system: sys, traffic, resend, queue });
  if (recs.length === 0) {
    console.log(`    ${c.green('●')} All metrics within healthy thresholds. No action required.`);
  } else {
    for (const r of recs) {
      const paint = r.severity === 'red' ? c.red : c.yellow;
      console.log(`    ${paint(`▲ ${r.text}`)}`);
    }
  }
  console.log();
  console.log(c.gray('  Operations Dashboard UI: /dashboard/super-admin/operations (Story 9-19 Part B) renders the same data with 30s auto-refresh.'));
  console.log();
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const [sys, traffic, resend, queue, cf] = await Promise.all([
    getSystemHealth(),
    getTraffic(),
    getResendStatus(),
    getQueueHealth(),
    getCloudflareDashboardSummary(7).catch(() => null), // best-effort; never block the dashboard
  ]);
  render(sys, traffic, resend, queue, cf);
  await closeEmailQueue().catch(() => { /* best-effort */ });
  await pool.end().catch(() => { /* best-effort */ });
}

// Only run when executed directly (`tsx scripts/dashboard.ts`), NOT on import.
const __filename = fileURLToPath(import.meta.url);
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly || import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(c.red(`Dashboard failed: ${(e as Error).message}`));
    process.exit(1);
  });
}
