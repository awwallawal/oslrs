/**
 * Story 13-3 (AC1) — Radio-spike load-test profile + verdict evaluation for the capacity gate.
 *
 * PURE evaluation (mirrors 9-52 `cf-watch.ts`): the runner `apps/api/scripts/load-test.ts` drives
 * autocannon against the hot path, normalises the result via `summariseAutocannon` here, and this
 * module returns the green/red gate verdict. Single source of truth for the modelling profile AND
 * the thresholds — referenced by the script, the tests, and the runbook (Task 4).
 */

/**
 * The radio-spike modelling profile (AC1.1). DEFAULT assumptions for a state-wide jingle hitting
 * the single home box (`oslsr-home-app`); the operator confirms/tunes `connections` to the expected
 * reach before the prod run. Rationale: radio reaches a large audience but only a fraction act in
 * the first minutes, spread over time — 50 sustained concurrent clients for 60s models a realistic
 * early-peak on one box without assuming an unrealistic instantaneous thundering herd.
 */
export const LOAD_PROFILE = {
  connections: 50, // concurrent virtual users held at peak
  duration: 60, // seconds at peak
  warmupSeconds: 5, // ramp before measuring
} as const;

/** Gate thresholds (AC1.2) — the box must clear ALL of these for a GREEN verdict. */
export const LOAD_TEST_THRESHOLDS = {
  maxP95LatencyMs: 1500, // p95 under 1.5s at peak (a registration form staying responsive)
  maxErrorRatePct: 1, // <1% failed requests = (errors + timeouts + non-2xx) / total
  minRequestsPerSec: 20, // the box must sustain at least this throughput, else it's stalling
} as const;

export type LoadTestThresholds = typeof LOAD_TEST_THRESHOLDS;

export interface LoadTestSummary {
  p95LatencyMs: number;
  avgLatencyMs: number;
  errorCount: number; // connection errors + timeouts
  non2xxCount: number; // HTTP responses outside 2xx/3xx
  totalRequests: number;
  requestsPerSec: number;
}

export interface LoadTestVerdict {
  verdict: 'green' | 'red';
  errorRatePct: number;
  reasons: string[]; // one per breached threshold; empty when green
}

/** Normalise an autocannon result into the summary this module evaluates. PURE + total. */
export function summariseAutocannon(result: {
  latency?: { p97_5?: number; average?: number };
  errors?: number;
  timeouts?: number;
  non2xx?: number;
  requests?: { total?: number; average?: number };
}): LoadTestSummary {
  return {
    p95LatencyMs: result.latency?.p97_5 ?? 0, // autocannon's nearest reported percentile to p95
    avgLatencyMs: result.latency?.average ?? 0,
    errorCount: (result.errors ?? 0) + (result.timeouts ?? 0),
    non2xxCount: result.non2xx ?? 0,
    totalRequests: result.requests?.total ?? 0,
    requestsPerSec: result.requests?.average ?? 0,
  };
}

/** Evaluate a load-test summary against thresholds → green/red gate verdict. PURE + total. */
export function evaluateLoadTest(
  s: LoadTestSummary,
  thresholds: LoadTestThresholds = LOAD_TEST_THRESHOLDS,
): LoadTestVerdict {
  // Zero requests = the origin never responded (down / unreachable / misconfigured) — that is a
  // RED gate, NOT a vacuous green. Guard first so the absence of errors can't read as success.
  if (s.totalRequests <= 0) {
    return {
      verdict: 'red',
      errorRatePct: 0,
      reasons: ['no requests completed — origin unreachable or test misconfigured'],
    };
  }

  const failed = s.errorCount + s.non2xxCount;
  const errorRatePct = (failed / s.totalRequests) * 100;
  const reasons: string[] = [];

  if (s.p95LatencyMs > thresholds.maxP95LatencyMs)
    reasons.push(`p95 latency ${Math.round(s.p95LatencyMs)}ms > ${thresholds.maxP95LatencyMs}ms`);
  if (errorRatePct > thresholds.maxErrorRatePct)
    reasons.push(`error rate ${errorRatePct.toFixed(2)}% > ${thresholds.maxErrorRatePct}%`);
  if (s.requestsPerSec < thresholds.minRequestsPerSec)
    reasons.push(`throughput ${s.requestsPerSec.toFixed(1)} req/s < ${thresholds.minRequestsPerSec} req/s`);

  return { verdict: reasons.length === 0 ? 'green' : 'red', errorRatePct, reasons };
}


// ============================================================================
// Story 13-65 (AC8) — argument parsing for the WRITE-path halves of the rig
// ============================================================================

/**
 * 13-3's runner drove autocannon with `{ url, connections, duration, warmup, headers }` only — no
 * `method`, no `body` — so every request it has ever made was a GET, and gate item 7's write path
 * has never been load-tested. AC8 adds both.
 *
 * 🔴 A WRITE-PATH TEST IS NOT THE READ TEST WITH A DIFFERENT PATH, AND THE DIFFERENCE IS NOT THE
 * HTTP VERB — IT IS THAT THE REQUESTS LEAVE ROWS. That is why AC8 splits the halves and why this
 * parser lives in `src/lib` (type-checked, unit-tested) rather than in `scripts/` (neither).
 */
export const LOAD_TEST_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type LoadTestMethod = (typeof LOAD_TEST_METHODS)[number];

export interface LoadTestArgs {
  target: string;
  path: string;
  url: string;
  connections: number;
  duration: number;
  method: LoadTestMethod;
  /** Raw request body (JSON string) for a write half; `undefined` for a GET. */
  body?: string;
  /** Content-Type is set only when a body is present, so a GET run is byte-identical to 13-3's. */
  headers: Record<string, string>;
  dryRun: boolean;
  acknowledgedProd: boolean;
  /** review B5 — a write run's own, separately-named consent. */
  acknowledgedWrite: boolean;
  /** review B5 — hard request-count bound; required for any non-GET run. */
  amount: number;
}

export class LoadTestArgError extends Error {}

function argValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
}

/** Localhost detection — the prod-refusal guard's only input. Unchanged from 13-3. */
export function isLocalTarget(target: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(target);
}

/**
 * PURE + total. Parses the runner's argv into a validated plan, or throws `LoadTestArgError`.
 *
 * Defaults reproduce 13-3's behaviour EXACTLY when neither `--method` nor `--body` is passed: GET,
 * `/api/v1/health`, `LOAD_PROFILE`, and the `x-load-test: 13-3` + distinct user-agent headers that
 * let the operator allow-list the source in cf-traffic-watch (9-52).
 */
export function parseLoadTestArgs(argv: string[]): LoadTestArgs {
  const target = (argValue(argv, 'target') ?? 'http://localhost:3000').replace(/\/$/, '');
  const path = argValue(argv, 'path') ?? '/api/v1/health';

  const rawMethod = (argValue(argv, 'method') ?? 'GET').toUpperCase();
  if (!(LOAD_TEST_METHODS as readonly string[]).includes(rawMethod)) {
    throw new LoadTestArgError(
      `unsupported --method ${rawMethod} (expected one of ${LOAD_TEST_METHODS.join(', ')})`,
    );
  }
  const method = rawMethod as LoadTestMethod;

  const body = argValue(argv, 'body');
  if (body !== undefined) {
    try {
      JSON.parse(body);
    } catch {
      throw new LoadTestArgError('--body must be valid JSON');
    }
    if (method === 'GET') {
      // Autocannon would send it and most servers would ignore it — a silently-empty write test is
      // the worst outcome here, so it is a hard error rather than a warning.
      throw new LoadTestArgError('--body was given with method GET; pass --method POST/PUT/PATCH');
    }
  }

  const connections = Number(argValue(argv, 'connections') ?? LOAD_PROFILE.connections);
  const duration = Number(argValue(argv, 'duration') ?? LOAD_PROFILE.duration);
  if (!Number.isFinite(connections) || connections <= 0) {
    throw new LoadTestArgError('--connections must be a positive number');
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new LoadTestArgError('--duration must be a positive number');
  }

  /**
   * 🔴 Story 13-65 (review D2 / finding T2) — GUARD `amount` LIKE ITS SIBLINGS.
   *
   * `--amount abc` (or a typo'd `2O`) produced `NaN`. `NaN <= 0` is FALSE, so the mandatory-bound
   * refusal in `loadTestRefusal` was skipped entirely — and because `amount > 0` is also false, the
   * run fell through to the DURATION branch and became **50 connections × 60 seconds, unbounded,
   * against `POST /api/v1/registration/wizard`**: exactly the unbounded write run `--amount` was
   * added to prevent. `connections` and `duration` were guarded from the start; `amount` was added
   * by review C3 without one, and without a test.
   */
  const amount = Number(argValue(argv, 'amount') ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new LoadTestArgError('--amount must be a non-negative number');
  }

  const headers: Record<string, string> = {
    'x-load-test': '13-3',
    'user-agent': 'oslsr-load-test/13-3',
  };
  if (body !== undefined) headers['content-type'] = 'application/json';

  return {
    target,
    path,
    url: `${target}${path}`,
    connections,
    duration,
    method,
    body,
    headers,
    dryRun: argv.includes('--dry-run'),
    acknowledgedProd: argv.includes('--i-understand-this-hits-prod'),
    // Story 13-65 (review B5 / finding H3-related) — a SEPARATE acknowledgement for a WRITE run.
    acknowledgedWrite: argv.includes('--i-understand-this-writes-rows-and-sends-email'),
    amount,
  };
}

/**
 * The non-localhost refusal, as a PURE function so it is testable and so the write halves cannot
 * accidentally ship without it. Returns the refusal message, or `null` when the run may proceed.
 */
export function loadTestRefusal(args: LoadTestArgs): string | null {
  /**
   * ⚠️ ORDER MATTERS: the BROADEST refusal first. "You are pointing at prod" is the fact that makes
   * every other consideration serious, so it must be what the operator is told first — otherwise a
   * `POST` at prod without either flag reports the write problem and hides the prod problem, and
   * the operator fixes the one they were shown.
   */
  if (!isLocalTarget(args.target) && !args.acknowledgedProd) {
    return (
      `${args.target} is not localhost. A prod run hits the live home box and can trip ` +
      `cf-traffic-watch (9-52). Allow-list the source IP first, then re-run with ` +
      `--i-understand-this-hits-prod.`
    );
  }

  /**
   * Story 13-65 (review B5) — A WRITE RUN NEEDS ITS OWN ACKNOWLEDGEMENT.
   *
   * `--i-understand-this-hits-prod` was minted by 13-3 for a READ profile
   * (`GET /api/v1/forms/public-active`). That one flag would now also unlock a run that CREATES
   * REGISTRY ROWS and SENDS REAL EMAIL to real addresses — a materially different consent, on a flag
   * whose wording says nothing about either. An operator who has typed it a dozen times for read
   * profiles would type it again without registering the change. A second flag whose NAME states
   * the consequence is one line and cannot be typed by habit.
   */
  if (args.method !== 'GET' && !args.acknowledgedWrite) {
    return (
      `a ${args.method} run CREATES ROWS and can SEND REAL EMAIL. ` +
      `Re-run with --i-understand-this-writes-rows-and-sends-email, and bound it with --amount. ` +
      `Teardown is the CHILD-FIRST chain in docs/runbooks/13-3-cutover-and-failover.md.`
    );
  }

  /**
   * ⚠️ A WRITE RUN MUST BE BOUNDED BY COUNT, NOT ONLY BY TIME. `--duration` alone means "keep
   * writing for 60 seconds", which on the submit path is an unbounded number of respondents. AC8's
   * Half B says "bounded and SMALL", and that was not expressible before.
   */
  if (args.method !== 'GET' && args.amount <= 0) {
    return `a ${args.method} run must be bounded: pass --amount <n> (AC8 Half B is deliberately small).`;
  }

  return null;
}
