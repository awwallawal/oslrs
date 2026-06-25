#!/usr/bin/env tsx
/**
 * Story 9-52 — Cloudflare traffic-watch (cron script).
 *
 * Thin wiring around lib/cf-watch.ts `runCfTrafficWatch` (which holds the testable
 * degradation + cooldown + dispatch logic). Pages the operator via the existing Telegram
 * channel (Story 9-15, isAlertSendEnabled-gated) when edge traffic looks like a bot-flood /
 * attack rather than real virality. Best-effort: no token or a fetch error → log + exit 0.
 *
 * Run (system cron on the VPS, every 15 min — exact crontab line in
 * docs/runbooks/pre-viral-push-checklist.md, kept out of this JSDoc so the cron's
 * slash-star doesn't close the block comment):
 *   cd /root/oslrs && pnpm --filter @oslsr/api exec tsx apps/api/scripts/cf-traffic-watch.ts
 *   tsx apps/api/scripts/cf-traffic-watch.ts --dry-run   # print findings, dispatch nothing
 *
 * NEVER pages from dev/test — sendTelegramMessage self-vetoes via isAlertSendEnabled
 * (Story 9-15 incident: ungated dispatch paged the operator from local).
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pino from 'pino';
import { getCloudflareDashboardSummary } from '../src/lib/cloudflare-analytics.js';
import { runCfTrafficWatch } from '../src/lib/cf-watch.js';
import { sendTelegramMessage } from '../src/services/alerting/telegram-channel.js';
import { getRedisClient } from '../src/lib/redis.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

const logger = pino({ name: 'cf-traffic-watch' });
const DRY_RUN = process.argv.includes('--dry-run');
const COOLDOWN_MINUTES = Number(process.env.CF_WATCH_COOLDOWN_MINUTES ?? '360'); // one page / 6h / kind
const WINDOW_DAYS = Number(process.env.CF_WATCH_WINDOW_DAYS ?? '7');

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Per-kind Redis cooldown — returns true iff we WON the slot (not currently in cooldown). Fail-open. */
async function winCooldown(kind: string): Promise<boolean> {
  try {
    const res = await getRedisClient().set(`cf-watch:cooldown:${kind}`, '1', 'EX', COOLDOWN_MINUTES * 60, 'NX');
    return res === 'OK';
  } catch (err) {
    // No Redis / error → allow the alert (loud-on-failure), mirroring alert.service's cooldown.
    logger.warn({ event: 'cf_watch.cooldown_check_failed', kind, error: errMsg(err) });
    return true;
  }
}

runCfTrafficWatch({
  hasToken: () => Boolean(process.env.CLOUDFLARE_API_TOKEN),
  fetchSummary: () => getCloudflareDashboardSummary(WINDOW_DAYS),
  winCooldown,
  dispatch: (msg) => sendTelegramMessage(msg),
  dryRun: DRY_RUN,
  logger,
})
  .then((result) => {
    if (DRY_RUN) {
      for (const f of result.findings) {
        console.log(`[dry-run] ${f.kind} (${f.severity}): ${f.detail}`);
      }
    }
    process.exit(0);
  })
  .catch((err) => {
    // L4: best-effort cron. Degradation (no token / fetch error) is handled INSIDE runCfTrafficWatch
    // (it returns, never throws), so this catch only fires on an UNEXPECTED bug — we still log it for
    // forensics but exit 0 so cron never spams failures or pages noise.
    logger.error({ event: 'cf_watch.fatal', error: errMsg(err) });
    process.exit(0);
  });
