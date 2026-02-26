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
 * Rolling buffer for computing p95 API latency in-memory.
 * Keeps the last 1000 request durations for percentile calculation.
 */
const LATENCY_BUFFER_SIZE = 1000;
const latencyBuffer: number[] = [];
let latencyBufferIndex = 0;
let latencyBufferFull = false;

/**
 * Get the current p95 API latency from the rolling buffer.
 * Returns 0 if no requests have been recorded yet.
 */
export function getP95Latency(): number {
  const count = latencyBufferFull ? LATENCY_BUFFER_SIZE : latencyBufferIndex;
  if (count === 0) return 0;

  const sorted = latencyBuffer.slice(0, count).sort((a, b) => a - b);
  const p95Index = Math.floor(count * 0.95);
  return sorted[Math.min(p95Index, count - 1)];
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

    // Record in rolling buffer for p95 computation
    latencyBuffer[latencyBufferIndex] = duration;
    latencyBufferIndex++;
    if (latencyBufferIndex >= LATENCY_BUFFER_SIZE) {
      latencyBufferIndex = 0;
      latencyBufferFull = true;
    }

    return originalEnd.apply(this, args);
  } as Response['end'];

  next();
}
