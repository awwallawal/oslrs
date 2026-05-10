import { Request, Response, NextFunction } from 'express';
import { Registry, Histogram, collectDefaultMetrics } from 'prom-client';

const isTestMode = () =>
  process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

export const metricsRegistry = new Registry();

// Only collect default metrics (CPU, memory, event loop) outside of test mode
if (!isTestMode()) {
  collectDefaultMetrics({ register: metricsRegistry });
}

export const httpRequestDurationMs = new Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in milliseconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [metricsRegistry],
});

/**
 * Rolling ring buffer for in-memory p95 latency computation. Each slot holds a
 * `LatencySample` record (duration + completion timestamp co-resident); samples
 * older than LATENCY_WINDOW_MS are excluded from the percentile so a single slow
 * request can't dominate p95 for hours on low-traffic instances (2026-05-10
 * false-alert fix). Single-record-per-slot shape eliminates the parallel-array
 * pair-write invariant that the first-pass review flagged as a structural risk
 * (NEW-H1, 2nd-pass).
 *
 * Note on alert-input vs Prometheus-histogram divergence: the `httpRequestDurationMs`
 * histogram exported on `/metrics` records EVERY observation regardless of age,
 * while `getP95Latency()` (the alert-evaluator input) is time-windowed. This is
 * intentional — Prometheus is for offline analysis where stale samples have value;
 * the alert is for "is the API slow RIGHT NOW?" which requires recency. A future
 * operator querying both will see different p95 numbers; that's by design.
 */
type LatencySample = { duration: number; timestamp: number };
const LATENCY_BUFFER_SIZE = 1000;
const LATENCY_WINDOW_MS = 5 * 60 * 1000;
const latencyBuffer: LatencySample[] = [];
let latencyBufferIndex = 0;
let latencyBufferFull = false;

/**
 * Minimum number of in-window samples before p95 is statistically meaningful.
 * Below this threshold, getP95Latency() returns 0 to avoid false alerts on
 * low-traffic VPS instances where a single slow request dominates.
 *
 * On low-traffic instances (<10 req/min) the 5-min window may never reach this
 * floor; p95 will read 0 and the alert won't fire. That's intentional —
 * false-alert suppression > coverage at low traffic. Re-tune after field-survey
 * traffic ramps.
 */
const MIN_SAMPLES_FOR_P95 = 50;

/**
 * Single chokepoint for sample writes. Both `metricsMiddleware` (production
 * path) and `recordLatencySample` (test path) must call this. Single-record
 * slot shape means there is no parallel-array invariant to violate even if a
 * future maintainer adds another writer.
 */
function appendSample(durationMs: number, timestampMs: number): void {
  latencyBuffer[latencyBufferIndex] = { duration: durationMs, timestamp: timestampMs };
  latencyBufferIndex++;
  if (latencyBufferIndex >= LATENCY_BUFFER_SIZE) {
    latencyBufferIndex = 0;
    latencyBufferFull = true;
  }
}

/**
 * Get the current p95 API latency from the rolling buffer, restricted to samples
 * within the last LATENCY_WINDOW_MS. Returns 0 if fewer than MIN_SAMPLES_FOR_P95
 * fresh samples are available.
 *
 * Allocates a fresh `number[]` per call (worst-case ~8KB at full buffer). Called
 * every 120s by the alert evaluator — the GC pressure is invisible at this
 * cadence and a fixed scratch array would be premature optimisation.
 *
 * @param now Optional evaluation time (defaults to Date.now()) — overridable for tests.
 */
export function getP95Latency(now: number = Date.now()): number {
  const count = latencyBufferFull ? LATENCY_BUFFER_SIZE : latencyBufferIndex;
  if (count === 0) return 0;

  const cutoff = now - LATENCY_WINDOW_MS;
  const fresh: number[] = [];
  for (let i = 0; i < count; i++) {
    const sample = latencyBuffer[i];
    // Inclusive boundary: a sample exactly LATENCY_WINDOW_MS old is still counted.
    if (sample && sample.timestamp >= cutoff) fresh.push(sample.duration);
  }

  if (fresh.length < MIN_SAMPLES_FOR_P95) return 0;

  fresh.sort((a, b) => a - b);
  const p95Index = Math.floor(fresh.length * 0.95);
  return fresh[Math.min(p95Index, fresh.length - 1)];
}

/**
 * Normalize route paths to prevent metric cardinality explosion.
 * Replaces UUIDs and numeric segments with :id placeholders.
 */
function normalizeRoute(req: Request): string {
  // Use Express matched route pattern if available (e.g., /users/:id)
  if (req.route?.path) {
    return req.baseUrl + req.route.path;
  }

  // For unmatched routes (404s), normalize the raw path
  return req.path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id') // UUIDs
    .replace(/\/\d+/g, '/:id'); // Numeric segments
}

/**
 * Express middleware that records HTTP request duration for Prometheus metrics.
 * Skipped entirely in test mode to avoid side effects.
 */
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isTestMode()) {
    next();
    return;
  }

  const start = Date.now();
  const originalEnd = res.end;

  // Wrap res.end to capture timing after response completes
  res.end = function (
    this: Response,
    ...args: Parameters<Response['end']>
  ): Response {
    const duration = Date.now() - start;
    const route = normalizeRoute(req);
    httpRequestDurationMs.observe(
      {
        method: req.method,
        route,
        status_code: String(res.statusCode),
      },
      duration,
    );

    // Record in rolling buffer for p95 computation. Timestamp = response-completion
    // moment (start + duration), avoiding a redundant Date.now() and any drift
    // that would creep in if work were inserted between this and the buffer write.
    appendSample(duration, start + duration);

    return originalEnd.apply(this, args);
  } as Response['end'];

  next();
}

/** Reset rolling latency buffer (for testing) */
export function resetLatencyBuffer(): void {
  latencyBuffer.length = 0;
  latencyBufferIndex = 0;
  latencyBufferFull = false;
}

/** Inject a duration into the rolling latency buffer (for testing) */
export function recordLatencySample(
  durationMs: number,
  timestampMs: number = Date.now(),
): void {
  appendSample(durationMs, timestampMs);
}
