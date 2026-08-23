/**
 * Story 13-3 (AC1) — Radio-spike load-test runner for the home box (`oslsr-home-app`).
 * Story 13-65 (AC8) — extended from GET-only to the WRITE path (`--method` / `--body`).
 *
 * Drives autocannon at the LOAD_PROFILE, reads the result through the PURE evaluator
 * (apps/api/src/lib/load-test-eval.ts), and prints the green/red gate verdict. Mirrors the 9-52
 * script shape (arg-parsed, --dry-run guard, no side effects beyond the requests).
 *
 * ⚠️ `scripts/` is OUTSIDE tsconfig — it is RUN, never type-checked. So all of the parsing, the
 * validation and the prod refusal live in `src/lib/load-test-eval.ts`, which is type-checked AND
 * unit-tested; this file is I/O and exit codes only.
 *
 * Usage:
 *   tsx apps/api/scripts/load-test.ts --dry-run                 # print the plan, hit nothing
 *   tsx apps/api/scripts/load-test.ts                            # smoke against http://localhost:3000/api/v1/health
 *   tsx apps/api/scripts/load-test.ts --target https://oyoskills.com --path /api/v1/forms/public-active \
 *        --i-understand-this-hits-prod                           # 13-3's READ gate run (OPERATOR, Tailscale)
 *
 *   # Story 13-65 AC8 Half A — draft-save at the modelled peak (high volume, cheap teardown).
 *   # ⚠️ CORRECTED 2026-08-23 (review D6): a write run is bounded by --amount, NOT --duration, and
 *   # --amount VOIDS --duration. The old "--connections 50 --duration 60" here was refused by this
 *   # script's own validation. 3000 ≈ 50 req/s × 60s, i.e. the same profile expressed as a count.
 *   # `[<id>]` is substituted per request so each write lands on a DISTINCT row.
 *   tsx apps/api/scripts/load-test.ts --method PUT \
 *        --path /api/v1/registration/draft \
 *        --body '{"email":"zzsmoke+[<id>]@example.test","formData":{}}' \
 *        --connections 50 --amount 3000 --i-understand-this-writes-rows-and-sends-email
 *
 *   # Story 13-65 AC8 Half B — submit, deliberately SMALL N. Every request creates a respondent, a
 *   # user, a submission, a magic-link token, a marketplace profile and possibly a `campaign_sends`
 *   # row, AND SENDS REAL EMAIL. Use the ZZSMOKE / 7000000001x / 0800000001x sentinels and tear down
 *   # with the child-first chain at docs/runbooks/13-3-cutover-and-failover.md.
 *   tsx apps/api/scripts/load-test.ts --method POST --path /api/v1/registration/wizard \
 *        --body '{...,"email":"zzsmoke+[<id>]@example.test"}' \
 *        --connections 2 --amount 20 --i-understand-this-writes-rows-and-sends-email
 *
 * WAF/cf-traffic-watch (9-52) awareness (AC1.4): every request carries `x-load-test: 13-3` +
 * a distinct user-agent so the operator can ALLOW-LIST the source (or expect+annotate the alert)
 * — do NOT run blind against prod or it pages as a bot flood.
 *
 * Headroom is READ FROM THE EXISTING monitoring during the run (13-65 AC8 names both functions):
 *   - `operations.service.ts` getSystemHealth → pm2Memory / pm2CpuPct / pm2RestartCount / ramUsedPct
 *   - `MonitoringService.getSystemHealth` (monitoring.service.ts) → queues[].waiting, 10s cached
 * This script adds NO new metrics surface.
 */
import autocannon from 'autocannon';
import {
  LOAD_PROFILE,
  LOAD_TEST_THRESHOLDS,
  summariseAutocannon,
  evaluateLoadTest,
  parseLoadTestArgs,
  loadTestRefusal,
  LoadTestArgError,
} from '../src/lib/load-test-eval.js';

const argv = process.argv.slice(2);

let args;
try {
  args = parseLoadTestArgs(argv);
} catch (err) {
  if (err instanceof LoadTestArgError) {
    console.error(`\n✋ bad arguments: ${err.message}`);
    process.exit(2);
  }
  throw err;
}

/**
 * The clamp, computed ONCE. ⚠️ review D11 follow-up — the printed plan used to recompute this with a
 * different expression, so with `--connections 100 --amount 3000` the plan said 100 while the run
 * used 50. A plan that does not describe the run is the same defect class as a stale comment.
 */
function effectiveConnections(): number {
  return args.amount > 0
    ? Math.max(1, Math.min(args.connections, args.amount, LOAD_PROFILE.connections))
    : args.connections;
}

async function main(): Promise<void> {
  console.log('=== Story 13-3 radio-spike load test (13-65: write-path capable) ===');
  console.log(`target:      ${args.method} ${args.url}`);
  console.log(
    args.amount > 0
      ? `profile:     ${effectiveConnections()} connections × ${args.amount} requests TOTAL ` +
        `(--amount bounds the run; --duration is IGNORED; no warmup on a bounded/write run)`
      : `profile:     ${args.connections} connections × ${args.duration}s (warmup ${LOAD_PROFILE.warmupSeconds}s)`,
  );
  console.log(`body:        ${args.body ? `${args.body.length} bytes of JSON` : '(none — read-only run)'}`);
  console.log(`thresholds:  p95<${LOAD_TEST_THRESHOLDS.maxP95LatencyMs}ms · errors<${LOAD_TEST_THRESHOLDS.maxErrorRatePct}% · throughput>${LOAD_TEST_THRESHOLDS.minRequestsPerSec}req/s`);

  /**
   * Story 13-65 (review D6 / finding T6) — A DRY RUN MUST BE ABLE TO PREVIEW A WRITE RUN.
   *
   * ⚠️ The refusals used to be evaluated BEFORE the dry-run return, so `--dry-run` on a write
   * profile was rejected outright — while the runbook says "always start with --dry-run" and the
   * script's own usage examples begin with it. A dry run sends nothing, so refusing it protects
   * nobody and blocks the one step that exists to catch a bad command before it runs.
   *
   * The refusal is still COMPUTED and SHOWN on a dry run — the operator must see what would stop
   * the real invocation — it simply does not abort the preview.
   */
  const refusal = loadTestRefusal(args);
  if (refusal && args.dryRun) {
    console.log(
      `\n⚠️  WOULD REFUSE (this is a dry run, so the plan is still printed below):\n    ${refusal}`,
    );
  }
  if (refusal && !args.dryRun) {
    console.error(`\n✋ REFUSING: ${refusal}`);
    process.exit(2);
  }

  if (args.method !== 'GET') {
    console.log(
      '\n⚠️  WRITE RUN — these requests LEAVE ROWS and can SEND REAL EMAIL. Use the smoke sentinels\n' +
        '    (surname ZZSMOKE, NIN 7000000001x, phone 0800000001x, a +tag address you control) and\n' +
        '    tear down with the CHILD-FIRST chain in docs/runbooks/13-3-cutover-and-failover.md,\n' +
        '    reading every `DELETE n`. campaign_sends above all: a leftover row silently suppresses\n' +
        "    that address's next real thank-you for the whole 5-day window.",
    );
  }

  if (args.dryRun) {
    console.log('\n[dry-run] plan printed; no requests sent.');
    return;
  }

  console.log('\nrunning… (read headroom from the Operations dashboard + MonitoringService queue depths)');
  /**
   * Story 13-65 (review B5 / finding H3b) — PER-REQUEST BODY VARIATION.
   *
   * ⚠️ A single static `body` makes every request BYTE-IDENTICAL, which measures the wrong thing
   * twice over: on the draft path all successful writes hit the SAME `wizard_drafts` row (that is
   * single-row contention, not 50 concurrent drafts), and on the submit path the first request
   * creates a respondent and the rest are duplicate-NIN rejections. The memory profile AC8 exists
   * to measure is the profile of MANY DISTINCT rows.
   *
   * `[<id>]` is the per-request placeholder. The caller puts it in the fields that must differ —
   * email, phone, reference — and the sentinel prefixes from the smoke convention keep teardown a
   * single `WHERE`. ⚠️ It is substituted BY US in `setupRequest` below, not by autocannon's
   * `idReplacement`, which mis-sizes `Content-Length` (review D1 / finding T1).
   */
  /** Monotonic per-request suffix, so two requests in the same millisecond still differ. */
  let requestSeq = 0;
  const varies = Boolean(args.body && args.body.includes('[<id>]'));
  if (args.method !== 'GET' && !varies) {
    console.log(
      '\n⚠️  --body contains no `[<id>]` placeholder, so EVERY request will be byte-identical.\n' +
        '    On /draft that measures single-row contention; on /wizard it is one insert followed by\n' +
        '    duplicate rejections. Put `[<id>]` in the email/phone/reference fields.',
    );
  }

  /**
   * Story 13-65 (review C1 / finding R2) — 🔴 NO WARMUP ON A BOUNDED WRITE RUN. THIS SENT DOUBLE.
   *
   * autocannon builds its warmup as `{...opts, ...opts.warmup}` (`lib/init.js`), so the warmup
   * INHERITS `amount`; and `amount` disables the duration timer (`lib/run.js`). The warmup therefore
   * ran a full `amount`, and then the main run ran another. Measured against a counting server:
   * **16 requests for `--amount 8`.**
   *
   * On the AC8 Half-B profile that is not a benchmarking curiosity. `--amount 20` would have created
   * **40** respondents, users, submissions, magic-link tokens and marketplace profiles, and sent
   * **40 real emails** — from the flag added specifically to make a write run SAFE to bound.
   *
   * ⚠️ A warmup that WRITES is wrong independent of the doubling: it creates real rows that no
   * verdict counts and no teardown list knows about. So bounded/write runs get no warmup at all,
   * and the read profiles 13-3 built keep theirs.
   */
  const useWarmup = args.method === 'GET' && args.amount <= 0;

  /**
   * review C3 / finding R3 — autocannon THROWS `connections cannot be greater than amount`, and
   * `--connections` defaults to 50 while a bounded write run is deliberately small. Clamp rather
   * than fail: the operator asked for N requests, and the concurrency is the adjustable half.
   * ⚠️ review D11 — clamping to `amount` maximises concurrency on precisely the run that wants the
   * LEAST of it (a 20-request submit run would have gone out 20-at-once, i.e. 20 simultaneous
   * registrations). Clamp to the smaller of the two instead, so a small bounded run stays gentle.
   */
  const connections = effectiveConnections();
  if (connections !== args.connections) {
    console.log(
      `\nnote: --connections clamped ${args.connections} → ${connections} (must not exceed --amount ${args.amount}).`,
    );
  }

  const result = await autocannon({
    url: args.url,
    connections,
    /**
     * ⚠️ `amount` and `duration` do not compose: `amount` disables the duration timer, so passing
     * both is at best redundant and at worst misleading in the printed plan. `amount` is therefore
     * the only bound on a bounded run and `duration` is omitted rather than passed and ignored.
     * (review D12 — an earlier version of this comment blamed the pairing for "8 attempted, 8
     * errors". That was NOT autocannon: Git Bash had rewritten `--path /` into a Windows path, so
     * the requests went to a nonsense URL. Use MSYS_NO_PATHCONV=1.)
     */
    ...(args.amount > 0 ? { amount: args.amount } : { duration: args.duration }),
    method: args.method,
    /**
     * 🔴 Story 13-65 (review D1 / finding T1) — `idReplacement` IS NOT USABLE HERE. DO NOT RESTORE IT.
     *
     * autocannon computes `Content-Length` from the template body, substituting a FIXED 33-character
     * allowance for each `[<id>]`. The id it actually emits (hyperid) is 24 characters. So every
     * request under-declares its length: captured on a raw socket, declared 41 and sent 32 bytes.
     * The server waits forever for a body that never completes — `bodyComplete=0`, `responded=0` —
     * and the rig reports `requests: 0 total … VERDICT: RED`.
     *
     * ⚠️ THE AC8 WRITE RIG THEREFORE CREATED NOTHING AND ALWAYS FAILED, while the runbook told the
     * operator to run exactly that command and read the verdict.
     *
     * ⚠️ It was "verified by running" in review C1 — but with a body containing NO `[<id>]`, so the
     * placeholder path was never exercised. Running the wrong configuration is not verification.
     *
     * `requests: [{ setupRequest }]` builds each body in our own code, so autocannon sizes what we
     * actually send. Proved WITH a `[<id>]` body: 4/4 complete, 0 errors.
     */
    ...(varies
      ? {
          requests: [
            {
              setupRequest: (req: { body?: string }) => ({
                ...req,
                body: (args.body ?? '').replace(/\[<id>\]/g, `${Date.now()}-${requestSeq++}`),
              }),
            },
          ],
        }
      : { body: args.body }),
    ...(useWarmup
      ? { warmup: { connections, duration: LOAD_PROFILE.warmupSeconds } }
      : {}),
    headers: args.headers,
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
