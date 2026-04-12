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
