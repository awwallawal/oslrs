import { describe, it, expect } from 'vitest';
import { suppressSmallBuckets, suppressIfTooFew } from '../analytics-suppression.js';
import type { FrequencyBucket } from '@oslsr/types';

describe('suppressSmallBuckets', () => {
  it('passes through buckets at or above threshold', () => {
    const buckets: FrequencyBucket[] = [
      { label: 'male', count: 10, percentage: 50 },
      { label: 'female', count: 5, percentage: 25 },
    ];
    const result = suppressSmallBuckets(buckets, 5);
    expect(result).toEqual([
      { label: 'male', count: 10, percentage: 50 },
      { label: 'female', count: 5, percentage: 25 },
    ]);
  });

  it('suppresses buckets below threshold (edge at 4)', () => {
    const buckets: FrequencyBucket[] = [
      { label: 'male', count: 10, percentage: 66.7 },
      { label: 'other', count: 4, percentage: 26.7 },
    ];
    const result = suppressSmallBuckets(buckets, 5);
    expect(result[0].count).toBe(10);
    expect(result[1]).toEqual({ label: 'other', count: null, percentage: null, suppressed: true });
  });

  it('returns empty array for empty input', () => {
    expect(suppressSmallBuckets([], 5)).toEqual([]);
  });

  it('handles mixed above and below threshold', () => {
    const buckets: FrequencyBucket[] = [
      { label: 'a', count: 100, percentage: 80 },
      { label: 'b', count: 2, percentage: 1.6 },
      { label: 'c', count: 5, percentage: 4 },
      { label: 'd', count: 1, percentage: 0.8 },
    ];
    const result = suppressSmallBuckets(buckets, 5);
    expect(result[0].count).toBe(100);
    expect(result[1].suppressed).toBe(true);
    expect(result[2].count).toBe(5); // exactly at threshold, not suppressed
    expect(result[3].suppressed).toBe(true);
  });

  it('uses default minN=5 when not specified', () => {
    const buckets: FrequencyBucket[] = [
      { label: 'x', count: 4, percentage: 100 },
    ];
    const result = suppressSmallBuckets(buckets);
    expect(result[0].suppressed).toBe(true);
  });
});

describe('suppressIfTooFew', () => {
  it('returns value at or above threshold', () => {
    expect(suppressIfTooFew(5, 5)).toBe(5);
    expect(suppressIfTooFew(100, 5)).toBe(100);
  });

  it('returns null below threshold', () => {
    expect(suppressIfTooFew(4, 5)).toBeNull();
    expect(suppressIfTooFew(0, 5)).toBeNull();
  });

  it('uses default minN=5', () => {
    expect(suppressIfTooFew(4)).toBeNull();
    expect(suppressIfTooFew(5)).toBe(5);
  });
});
