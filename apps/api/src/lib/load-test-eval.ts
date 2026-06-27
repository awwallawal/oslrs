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
