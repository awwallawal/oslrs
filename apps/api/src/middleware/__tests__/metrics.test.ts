import { describe, it, expect, beforeEach } from 'vitest';
import {
  getP95Latency,
  resetLatencyBuffer,
  recordLatencySample,
} from '../metrics.js';

describe('getP95Latency', () => {
  beforeEach(() => {
    resetLatencyBuffer();
  });

  it('should return 0 when no requests recorded', () => {
    expect(getP95Latency()).toBe(0);
  });

  it('should return 0 when fewer than 50 samples (minimum threshold)', () => {
    // Record 49 samples — just below the MIN_SAMPLES_FOR_P95 threshold
    for (let i = 0; i < 49; i++) {
      recordLatencySample(100 + i);
    }
    expect(getP95Latency()).toBe(0);
  });

  it('should return p95 once minimum sample count is reached', () => {
    // Record exactly 50 samples: 1ms through 50ms
    for (let i = 1; i <= 50; i++) {
      recordLatencySample(i);
    }
    // p95Index = floor(50 * 0.95) = 47, sorted[47] = 48
    expect(getP95Latency()).toBe(48);
  });

  it('should compute correct p95 for 100 samples', () => {
    // 100 samples: 1ms through 100ms
    for (let i = 1; i <= 100; i++) {
      recordLatencySample(i);
    }
    // p95Index = floor(100 * 0.95) = 95, sorted[95] = 96
    expect(getP95Latency()).toBe(96);
  });

  it('should reflect p95 of the actual distribution, not max', () => {
    // 99 fast requests + 1 very slow outlier
    for (let i = 0; i < 99; i++) {
      recordLatencySample(10);
    }
    recordLatencySample(5000); // single outlier

    // p95Index = floor(100 * 0.95) = 95
    // sorted = [10, 10, ...(99x), 5000] → sorted[95] = 10
    expect(getP95Latency()).toBe(10);
  });

  it('should return the slow value when most requests are slow', () => {
    // 50 fast + 50 slow
    for (let i = 0; i < 50; i++) {
      recordLatencySample(20);
    }
    for (let i = 0; i < 50; i++) {
      recordLatencySample(800);
    }
    // p95Index = floor(100 * 0.95) = 95
    // sorted = [20x50, 800x50] → sorted[95] = 800
    expect(getP95Latency()).toBe(800);
  });

  it('should handle the low-traffic false positive scenario', () => {
    // Simulates the production issue: 20 requests, 1 slow at 631ms
    // With < 50 samples, this should return 0 instead of 631
    for (let i = 0; i < 19; i++) {
      recordLatencySample(30);
    }
    recordLatencySample(631);

    expect(getP95Latency()).toBe(0);
  });
});

describe('getP95Latency — 5-minute time-window eviction', () => {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  const SIX_MINUTES_MS = 6 * 60 * 1000;
  // Arbitrary fixed epoch ms (~Nov 2023). Value is load-bearing only relative to
  // FIVE_MINUTES_MS / SIX_MINUTES_MS — any positive integer ≥ LATENCY_WINDOW_MS works.
  const t0 = 1_700_000_000_000;

  beforeEach(() => {
    resetLatencyBuffer();
  });

  it('evicts stale outliers that would otherwise sit in the top-5%', () => {
    // 95 fresh fast + 5 stale slow.
    // Without windowing: 100 samples, sorted = [30×95, 5000×5], p95Index=95, sorted[95]=5000.
    // With windowing: only 95 fresh (>= MIN_SAMPLES_FOR_P95), sorted[floor(95*0.95)=90]=30.
    for (let i = 0; i < 5; i++) {
      recordLatencySample(5000, t0 - SIX_MINUTES_MS);
    }
    for (let i = 0; i < 95; i++) {
      recordLatencySample(30, t0);
    }
    expect(getP95Latency(t0)).toBe(30);
  });

  it('evicts a small cluster of slow samples that would otherwise dominate a thinly-populated buffer', () => {
    // Pattern occasioned by the 2026-05-10 false-alert: a worker-blocked window
    // produces ~5 samples in the 700-800ms range, followed by ~95 normal ~30ms
    // requests over the next 6 minutes.
    // Without windowing: 100 samples, sorted = [30×95, 752×5], sorted[95]=752 → false CRITICAL alert.
    // With windowing: 5 stale samples evicted; 95 fresh → p95=30 → no alert.
    for (let i = 0; i < 5; i++) {
      recordLatencySample(752, t0);
    }
    for (let i = 0; i < 95; i++) {
      recordLatencySample(30, t0 + SIX_MINUTES_MS + i);
    }
    expect(getP95Latency(t0 + SIX_MINUTES_MS + 95)).toBe(30);
  });

  it('returns 0 when in-window samples fall below MIN_SAMPLES_FOR_P95', () => {
    // 100 stale fast + 49 fresh slow.
    // Without windowing: 149 samples, sorted = [20×100, 800×49], p95Index=141, sorted[141]=800.
    // With windowing: 49 fresh < 50-sample floor → returns 0.
    for (let i = 0; i < 100; i++) {
      recordLatencySample(20, t0 - SIX_MINUTES_MS);
    }
    for (let i = 0; i < 49; i++) {
      recordLatencySample(800, t0);
    }
    expect(getP95Latency(t0)).toBe(0);
  });

  it('documents that the cutoff is inclusive (samples exactly LATENCY_WINDOW_MS old still count)', () => {
    // Non-discriminating doc test — passes against any implementation that doesn't
    // exclude `==-cutoff` samples. Paired with the `+1ms past boundary` test below
    // to pin the boundary tight from both sides.
    for (let i = 0; i < 50; i++) {
      recordLatencySample(100, t0 - FIVE_MINUTES_MS);
    }
    expect(getP95Latency(t0)).toBe(100);
  });

  it('excludes samples one millisecond past the window boundary', () => {
    // Just-past-boundary samples must NOT be counted.
    for (let i = 0; i < 50; i++) {
      recordLatencySample(100, t0 - FIVE_MINUTES_MS - 1);
    }
    expect(getP95Latency(t0)).toBe(0);
  });

  it('handles ring-buffer wrap-around: fresh writes overwrite stale slots correctly', () => {
    // Fill the entire buffer with stale slow samples (1000 slots, all slow).
    // Then write 100 fresh fast samples — these overwrite slots 0..99.
    // Buffer now: slots 0..99 = fresh fast, slots 100..999 = stale slow.
    // Without windowing: 1000 samples, sorted=[fast×100, slow×900], p95Index=950, sorted[950]=slow.
    // With windowing: only the 100 fresh in slots 0..99 count, p95=fast.
    for (let i = 0; i < 1000; i++) {
      recordLatencySample(5000, t0 - SIX_MINUTES_MS);
    }
    for (let i = 0; i < 100; i++) {
      recordLatencySample(40, t0);
    }
    expect(getP95Latency(t0)).toBe(40);
  });
});
