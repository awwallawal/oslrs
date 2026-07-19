import { describe, it, expect } from 'vitest';
import type { FrequencyBucket } from '@oslsr/types';
import { lgaDistributionToMapData } from '../analytics-transforms';

describe('lgaDistributionToMapData (Story 13-33 AC3)', () => {
  it('returns [] for undefined', () => {
    expect(lgaDistributionToMapData(undefined)).toEqual([]);
  });

  it('maps exact buckets to {value, banded:false}', () => {
    const dist: FrequencyBucket[] = [
      { label: 'Ibadan North', count: 16, percentage: 40, suppressed: false, banded: false },
    ];
    expect(lgaDistributionToMapData(dist)).toEqual([
      { lgaName: 'Ibadan North', value: 16, banded: false },
    ]);
  });

  it('INCLUDES banded buckets as present (value 0, banded:true) — not dropped to blank', () => {
    const dist: FrequencyBucket[] = [
      { label: 'Lagelu', count: null, percentage: null, suppressed: true, banded: true },
    ];
    expect(lgaDistributionToMapData(dist)).toEqual([
      { lgaName: 'Lagelu', value: 0, banded: true },
    ]);
  });

  it('excludes legacy suppressed-but-not-banded buckets', () => {
    const dist: FrequencyBucket[] = [
      { label: 'Old', count: null, percentage: null, suppressed: true },
    ];
    expect(lgaDistributionToMapData(dist)).toEqual([]);
  });

  it('mixed set: exact kept with count, banded kept as present, absent-from-list stays out', () => {
    const dist: FrequencyBucket[] = [
      { label: 'Ibadan North', count: 16, percentage: 40, banded: false },
      { label: 'Lagelu', count: null, percentage: null, suppressed: true, banded: true },
    ];
    const out = lgaDistributionToMapData(dist);
    expect(out).toHaveLength(2);
    expect(out.find((d) => d.lgaName === 'Ibadan North')).toEqual({ lgaName: 'Ibadan North', value: 16, banded: false });
    expect(out.find((d) => d.lgaName === 'Lagelu')).toEqual({ lgaName: 'Lagelu', value: 0, banded: true });
  });
});
