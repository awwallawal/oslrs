#!/usr/bin/env tsx
/**
 * UAT Smoke Test: Trigger a synthetic CRITICAL alert.
 *
 * Usage (from /root/oslrs on the VPS, post-deploy):
 *   tsx scripts/uat-trigger-critical-alert.ts                          # CPU=95 (default)
 *   tsx scripts/uat-trigger-critical-alert.ts --metric=memory          # Memory=92
 *   tsx scripts/uat-trigger-critical-alert.ts --metric=api_p95_latency # 750ms
 *   NODE_ENV=development tsx scripts/uat-trigger-critical-alert.ts     # Confirm gate skips
 *
 * Authored 2026-05-12 as the close-out UAT for Story 9-15
 * (production-gate Telegram critical alerts). Reusable for any future
 * alerting regression check, incident drill, or operator handover.
 *
 * What this exercises end-to-end:
 *   - alert.service.ts:evaluateMetric → emits `alert.critical_evaluated` warn-log
 *     (Story 9-15 AC#2 paper trail)
 *   - alert.service.ts:queueAlert → calls sendCriticalTelegramAlert
 *   - alerting/telegram-channel.ts:isAlertSendEnabled() gate
 *     (Story 9-15 AC#1 — production default-allow / non-prod opt-in)
 *   - Real fetch to api.telegram.org with prod token + chat_id
 *   - alert.service.ts:flushDigest → conditionally sends email digest
 *     (rate-limited 30-min cooldown, max 10/day)
 *
 * Side effects, by design:
 *   - In NODE_ENV=production: 1 Telegram message to the operator's phone +
 *     possibly 1 email digest to active super_admins (rate-limited; may suppress).
 *   - In NODE_ENV=development (or unset): NO Telegram, NO email — gate skips
 *     dispatch with `event:'telegram.skipped_non_production'` debug log.
 *   - Always: 1 read-only DB query for super_admin recipient list. No writes.
 *   - Always: in-memory state Map of THIS Node process only. The live PM2
 *     process's `alertStates` is untouched (separate process, separate memory).
 *
 * Exit codes:
 *   0 — synthetic alert dispatched, evidence in stdout (caller asserts)
 *   1 — caller-supplied invalid --metric flag, or evaluateAlerts threw
 *
 * Per-test isolation: AlertService.clearStates() is called first to bypass
 * any per-metric cooldown / hourly-rate-limit / hysteresis state. This makes
 * the test repeatable without waiting 5 min between runs.
 */

import { AlertService } from '../apps/api/src/services/alert.service.js';
import type { SystemHealthResponse } from '@oslsr/types';

type SyntheticMetric = 'cpu' | 'memory' | 'disk_free' | 'api_p95_latency' | 'db_status' | 'redis_status' | 'expiry';

const args = process.argv.slice(2);
const metricArg = args.find((a) => a.startsWith('--metric='))?.split('=')[1] ?? 'cpu';
const TEST_ID = `9-15-uat-${Date.now()}`;

if (!isValidMetric(metricArg)) {
  console.error(`[${TEST_ID}] FATAL: --metric must be one of: cpu, memory, disk_free, api_p95_latency, db_status, redis_status, expiry`);
  process.exit(1);
}

const metric = metricArg as SyntheticMetric;

console.log(`[${TEST_ID}] START | metric=${metric} | NODE_ENV=${process.env.NODE_ENV ?? '(unset)'} | ENABLE_TELEGRAM_ALERTS=${process.env.ENABLE_TELEGRAM_ALERTS ?? '(unset)'}`);
console.log(`[${TEST_ID}] Expected behaviour:`);
if (process.env.NODE_ENV === 'production') {
  console.log(`[${TEST_ID}]   - alert.critical_evaluated warn-log emitted (Story 9-15 AC#2)`);
  console.log(`[${TEST_ID}]   - telegram.alert_sent info-log emitted (gate=allow + fetch=200)`);
  console.log(`[${TEST_ID}]   - operator phone vibrates within ~5 sec`);
} else if (process.env.ENABLE_TELEGRAM_ALERTS === 'true') {
  console.log(`[${TEST_ID}]   - alert.critical_evaluated warn-log emitted`);
  console.log(`[${TEST_ID}]   - telegram.alert_sent info-log emitted (explicit opt-in)`);
  console.log(`[${TEST_ID}]   - operator phone vibrates within ~5 sec`);
} else {
  console.log(`[${TEST_ID}]   - alert.critical_evaluated warn-log emitted (paper trail still fires)`);
  console.log(`[${TEST_ID}]   - telegram.skipped_non_production debug-log (gate vetoes dispatch)`);
  console.log(`[${TEST_ID}]   - NO Telegram message, NO phone vibration (this is the Story 9-15 fix)`);
}

AlertService.clearStates();

const synth = buildSyntheticHealth(metric);
console.log(`[${TEST_ID}] Synthetic ${metric} payload: ${JSON.stringify(extractTestedValue(metric, synth))}`);

try {
  await AlertService.evaluateAlerts(synth);
} catch (err) {
  console.error(`[${TEST_ID}] FATAL: evaluateAlerts threw:`, err);
  process.exit(1);
}

// alert.service.ts:queueAlert calls sendCriticalTelegramAlert WITHOUT awaiting
// (fire-and-forget with .catch swallow). Sleep briefly to let the fetch settle
// before tearing down the process — otherwise Telegram dispatch may race the exit.
await new Promise((resolve) => setTimeout(resolve, 3000));

console.log(`[${TEST_ID}] END | check stdout above for "alert.critical_evaluated" + "telegram.alert_sent" markers`);
process.exit(0);

// ============================================================================

function isValidMetric(m: string): m is SyntheticMetric {
  return ['cpu', 'memory', 'disk_free', 'api_p95_latency', 'db_status', 'redis_status', 'expiry'].includes(m);
}

function buildSyntheticHealth(m: SyntheticMetric): SystemHealthResponse {
  const base: SystemHealthResponse = {
    status: 'degraded',
    timestamp: new Date().toISOString(),
    version: '9-15-uat',
    uptime: 3600,
    cpu: { usagePercent: 50, cores: 4 },
    memory: { totalMB: 8192, usedMB: 4096, usagePercent: 50 },
    disk: { totalGB: 100, usedGB: 60, usagePercent: 60 },
    database: { status: 'ok', latencyMs: 5 },
    redis: { status: 'ok', latencyMs: 2 },
    apiLatency: { p95Ms: 42 },
    queues: [],
    expiries: [],
  };

  switch (m) {
    case 'cpu':
      base.cpu = { usagePercent: 95, cores: 4 };
      break;
    case 'memory':
      base.memory = { totalMB: 8192, usedMB: 7536, usagePercent: 92 };
      break;
    case 'disk_free':
      base.disk = { totalGB: 100, usedGB: 95, usagePercent: 95 }; // disk_free = 5
      break;
    case 'api_p95_latency':
      base.apiLatency = { p95Ms: 750 };
      break;
    case 'db_status':
      base.database = { status: 'error', latencyMs: 30000 };
      break;
    case 'redis_status':
      base.redis = { status: 'error', latencyMs: 30000 };
      break;
    case 'expiry':
      // Story 9-50 — synthetic cert 10 days out → critical (below the 30-day threshold).
      base.expiries = [
        {
          name: 'uat-synthetic-cert',
          kind: 'cert',
          expiresAt: new Date(Date.now() + 10 * 86400000).toISOString(),
          daysUntilExpiry: 10,
          status: 'critical',
          detail: '9-15/9-50 UAT synthetic expiry',
        },
      ];
      break;
  }
  return base;
}

function extractTestedValue(m: SyntheticMetric, h: SystemHealthResponse): unknown {
  switch (m) {
    case 'cpu': return { usagePercent: h.cpu.usagePercent, criticalThreshold: 90 };
    case 'memory': return { usagePercent: h.memory.usagePercent, criticalThreshold: 90 };
    case 'disk_free': return { freePercent: 100 - h.disk.usagePercent, criticalThreshold: 10 };
    case 'api_p95_latency': return { p95Ms: h.apiLatency.p95Ms, criticalThreshold: 500 };
    case 'db_status': return { status: h.database.status, criticalThreshold: 'value=1 (error)' };
    case 'redis_status': return { status: h.redis.status, criticalThreshold: 'value=1 (error)' };
    case 'expiry': return { item: h.expiries[0]?.name, daysUntilExpiry: h.expiries[0]?.daysUntilExpiry, criticalThreshold: 30 };
  }
}
