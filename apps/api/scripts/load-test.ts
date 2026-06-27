/**
 * Story 13-3 (AC1) — Radio-spike load-test runner for the home box (`oslsr-home-app`).
 *
 * Drives autocannon at the LOAD_PROFILE against the registration hot path, reads the result through
 * the PURE evaluator (apps/api/src/lib/load-test-eval.ts), and prints the green/red gate verdict.
 * Mirrors the 9-52 script shape (arg-parsed, --dry-run guard, no side effects beyond the requests).
 *
 * Usage:
 *   tsx apps/api/scripts/load-test.ts --dry-run                 # print profile/thresholds, hit nothing
 *   tsx apps/api/scripts/load-test.ts                            # smoke against http://localhost:3000/api/v1/health
 *   tsx apps/api/scripts/load-test.ts --target https://oyoskills.com --path /api/v1/registration/active-form \
 *        --i-understand-this-hits-prod                           # the real prod gate run (OPERATOR, Tailscale)
 *
 * WAF/cf-traffic-watch (9-52) awareness (AC1.4): every request carries `x-load-test: 13-3` +
 * a distinct user-agent so the operator can ALLOW-LIST the source (or expect+annotate the alert)
 * — do NOT run blind against prod or it pages as a bot flood.
 *
 * Headroom (AC1.3) is READ FROM THE EXISTING monitoring during the run — watch the Operations
 * dashboard (getSystemHealth pm2 CPU/RAM/restart + getTraffic) on a second screen; this script
 * adds NO new metrics surface.
 */
import autocannon from 'autocannon';
import {
  LOAD_PROFILE,
  LOAD_TEST_THRESHOLDS,
  summariseAutocannon,
  evaluateLoadTest,
} from '../src/lib/load-test-eval.js';

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const DRY_RUN = argv.includes('--dry-run');
const TARGET = arg('target', 'http://localhost:3000').replace(/\/$/, '');
const PATH = arg('path', '/api/v1/health');
const CONNECTIONS = Number(arg('connections', String(LOAD_PROFILE.connections)));
const DURATION = Number(arg('duration', String(LOAD_PROFILE.duration)));
const URL = `${TARGET}${PATH}`;

function isLocal(target: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(target);
}

async function main(): Promise<void> {
  console.log('=== Story 13-3 radio-spike load test ===');
  console.log(`target:      ${URL}`);
  console.log(`profile:     ${CONNECTIONS} connections × ${DURATION}s (warmup ${LOAD_PROFILE.warmupSeconds}s)`);
  console.log(`thresholds:  p95<${LOAD_TEST_THRESHOLDS.maxP95LatencyMs}ms · errors<${LOAD_TEST_THRESHOLDS.maxErrorRatePct}% · throughput>${LOAD_TEST_THRESHOLDS.minRequestsPerSec}req/s`);

  if (!isLocal(TARGET) && !argv.includes('--i-understand-this-hits-prod')) {
    console.error(
      `\n✋ REFUSING: ${TARGET} is not localhost. A prod run hits the live home box and can trip ` +
        `cf-traffic-watch (9-52). Allow-list the source IP first, then re-run with --i-understand-this-hits-prod.`,
    );
    process.exit(2);
  }
  if (DRY_RUN) {
    console.log('\n[dry-run] profile printed; no requests sent.');
    return;
  }

  console.log('\nrunning… (read headroom from the Operations dashboard — getSystemHealth/getTraffic)');
  const result = await autocannon({
    url: URL,
    connections: CONNECTIONS,
    duration: DURATION,
    warmup: { connections: CONNECTIONS, duration: LOAD_PROFILE.warmupSeconds },
    headers: { 'x-load-test': '13-3', 'user-agent': 'oslsr-load-test/13-3' },
  });

  const summary = summariseAutocannon(result as Parameters<typeof summariseAutocannon>[0]);
  const verdict = evaluateLoadTest(summary);

  console.log('\n=== result ===');
  console.log(`requests:    ${summary.totalRequests} total · ${summary.requestsPerSec.toFixed(1)} req/s`);
  console.log(`latency:     p95 ${Math.round(summary.p95LatencyMs)}ms · avg ${Math.round(summary.avgLatencyMs)}ms`);
  console.log(`failures:    ${summary.errorCount} errors/timeouts · ${summary.non2xxCount} non-2xx · ${verdict.errorRatePct.toFixed(2)}%`);
  console.log(`\nVERDICT: ${verdict.verdict.toUpperCase()}${verdict.reasons.length ? ' — ' + verdict.reasons.join('; ') : ''}`);
  process.exit(verdict.verdict === 'green' ? 0 : 1);
}

main().catch((err) => {
  console.error('load-test failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
