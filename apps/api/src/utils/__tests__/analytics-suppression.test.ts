import { describe, it, expect } from 'vitest';
import { suppressSmallBuckets, suppressIfTooFew, bandSmallBuckets, toBuckets } from '../analytics-suppression.js';
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

describe('bandSmallBuckets (Story 13-33 AC3 — banded disclosure)', () => {
  const rows = [
    { label: 'Ibadan North', count: 16 },
    { label: 'Egbeda', count: 10 }, // exactly at floor → exact
    { label: 'Lagelu', count: 9 },  // below floor → banded
    { label: 'Ido', count: 1 },     // present, tiny → banded
  ];

  it('keeps exact counts for buckets >= minN (graduated, banded:false)', () => {
    const out = bandSmallBuckets(toBuckets(rows, 40), 10);
    const north = out.find((b) => b.label === 'Ibadan North')!;
    expect(north.count).toBe(16);
    expect(north.banded).toBe(false);

    const egbeda = out.find((b) => b.label === 'Egbeda')!;
    expect(egbeda.count).toBe(10); // at the floor → still exact
    expect(egbeda.banded).toBe(false);
  });

  it('bands (present, exact number withheld) for 0 < count < minN', () => {
    const out = bandSmallBuckets(toBuckets(rows, 40), 10);
    for (const label of ['Lagelu', 'Ido']) {
      const b = out.find((x) => x.label === label)!;
      expect(b.banded).toBe(true);
      expect(b.suppressed).toBe(true);
      // k-anon floor: the exact small number never leaves the server.
      expect(b.count).toBeNull();
      expect(b.percentage).toBeNull();
    }
  });

  it('never emits a 0 bucket (absent LGAs are not in the GROUP BY)', () => {
    const out = bandSmallBuckets(toBuckets(rows, 40), 10);
    expect(out.every((b) => b.count === null || b.count > 0)).toBe(true);
  });

  it('differs from suppressSmallBuckets: only banded marks the bucket present', () => {
    const banded = bandSmallBuckets(toBuckets(rows, 40), 10);
    const suppressed = suppressSmallBuckets(toBuckets(rows, 40), 10);
    expect(banded.find((b) => b.label === 'Lagelu')!.banded).toBe(true);
    expect((suppressed.find((b) => b.label === 'Lagelu') as FrequencyBucket).banded).toBeUndefined();
  });

  it('defaults minN to 10', () => {
    const out = bandSmallBuckets([{ label: 'x', count: 9, percentage: 100 }]);
    expect(out[0].banded).toBe(true);
    expect(out[0].count).toBeNull();
  });

  it('passes a pre-nulled bucket through untouched (no incoherent suppressed+banded:false)', () => {
    // review M2: a bucket already suppressed upstream (count null) must not be
    // stamped banded:false — it is returned exactly as received.
    const pre: FrequencyBucket = { label: 'y', count: null, percentage: null, suppressed: true };
    const [out] = bandSmallBuckets([pre]);
    expect(out).toBe(pre); // same reference — untouched
    expect(out.banded).toBeUndefined();
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
