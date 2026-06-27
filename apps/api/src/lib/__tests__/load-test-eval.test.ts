import { describe, it, expect } from 'vitest';
import {
  evaluateLoadTest,
  summariseAutocannon,
  LOAD_TEST_THRESHOLDS,
  type LoadTestSummary,
} from '../load-test-eval.js';

const green: LoadTestSummary = {
  p95LatencyMs: 400,
  avgLatencyMs: 120,
  errorCount: 0,
  non2xxCount: 2,
  totalRequests: 5000,
  requestsPerSec: 80,
};

describe('evaluateLoadTest (Story 13-3 AC1)', () => {
  it('GREEN when latency, error rate, and throughput all clear thresholds', () => {
    const v = evaluateLoadTest(green);
    expect(v.verdict).toBe('green');
    expect(v.reasons).toEqual([]);
    expect(v.errorRatePct).toBeCloseTo(0.04, 2); // 2/5000
  });

  it('RED on p95 latency over the ceiling', () => {
    const v = evaluateLoadTest({ ...green, p95LatencyMs: 2200 });
    expect(v.verdict).toBe('red');
    expect(v.reasons[0]).toMatch(/p95 latency 2200ms > 1500ms/);
  });

  it('RED on error rate over 1% (errors + non-2xx)', () => {
    const v = evaluateLoadTest({ ...green, errorCount: 40, non2xxCount: 30 }); // 70/5000 = 1.4%
    expect(v.verdict).toBe('red');
    expect(v.reasons.some((r) => /error rate 1.40% > 1%/.test(r))).toBe(true);
  });

  it('RED on throughput stalling below the floor', () => {
    const v = evaluateLoadTest({ ...green, requestsPerSec: 8 });
    expect(v.verdict).toBe('red');
    expect(v.reasons.some((r) => /throughput 8.0 req\/s < 20 req\/s/.test(r))).toBe(true);
  });

  it('RED — NOT a vacuous green — when zero requests completed (origin down/unreachable)', () => {
    const v = evaluateLoadTest({ ...green, totalRequests: 0, errorCount: 0, non2xxCount: 0 });
    expect(v.verdict).toBe('red');
    expect(v.reasons[0]).toMatch(/no requests completed/);
  });

  it('accumulates multiple breach reasons', () => {
    const v = evaluateLoadTest({ ...green, p95LatencyMs: 3000, requestsPerSec: 5 });
    expect(v.verdict).toBe('red');
    expect(v.reasons).toHaveLength(2);
  });

  it('honours custom thresholds', () => {
    const v = evaluateLoadTest({ ...green, p95LatencyMs: 800 }, { ...LOAD_TEST_THRESHOLDS, maxP95LatencyMs: 500 });
    expect(v.verdict).toBe('red');
  });
});

describe('summariseAutocannon (Story 13-3)', () => {
  it('maps an autocannon result into the evaluated summary (p97_5 → p95 proxy; errors+timeouts)', () => {
    const s = summariseAutocannon({
      latency: { p97_5: 640, average: 110 },
      errors: 3,
      timeouts: 2,
      non2xx: 7,
      requests: { total: 12000, average: 95 },
    });
    expect(s).toEqual({
      p95LatencyMs: 640,
      avgLatencyMs: 110,
      errorCount: 5,
      non2xxCount: 7,
      totalRequests: 12000,
      requestsPerSec: 95,
    });
  });

  it('is total — missing fields default to 0 (so an empty result evaluates RED, not crash)', () => {
    const s = summariseAutocannon({});
    expect(s.totalRequests).toBe(0);
    expect(evaluateLoadTest(s).verdict).toBe('red');
  });
});
