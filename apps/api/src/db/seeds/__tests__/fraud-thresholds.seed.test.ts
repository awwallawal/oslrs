import { describe, it, expect } from 'vitest';
import { FRAUD_THRESHOLD_DEFAULTS } from '../fraud-thresholds.seed.js';
import { ruleCategoryTypes } from '../../schema/fraud-thresholds.js';

describe('FRAUD_THRESHOLD_DEFAULTS', () => {
  it('should contain exactly 27 records', () => {
    expect(FRAUD_THRESHOLD_DEFAULTS).toHaveLength(27);
  });

  it('should have unique ruleKey for each record', () => {
    const keys = FRAUD_THRESHOLD_DEFAULTS.map(r => r.ruleKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('should have all required fields on every record', () => {
    for (const record of FRAUD_THRESHOLD_DEFAULTS) {
      expect(record.ruleKey).toBeTruthy();
      expect(record.displayName).toBeTruthy();
      expect(record.ruleCategory).toBeTruthy();
      expect(record.thresholdValue).toBeTruthy();
      expect(record.notes).toBeTruthy();
    }
  });

  it('should only use valid rule categories', () => {
    for (const record of FRAUD_THRESHOLD_DEFAULTS) {
      expect(ruleCategoryTypes).toContain(record.ruleCategory);
    }
  });

  describe('GPS category', () => {
    const gpsRecords = FRAUD_THRESHOLD_DEFAULTS.filter(r => r.ruleCategory === 'gps');

    it('should have 6 GPS records', () => {
      expect(gpsRecords).toHaveLength(6);
    });

    it('should include cluster radius, min samples, time window, accuracy, teleport, and weight', () => {
      const keys = gpsRecords.map(r => r.ruleKey);
      expect(keys).toContain('gps_cluster_radius_m');
      expect(keys).toContain('gps_cluster_min_samples');
      expect(keys).toContain('gps_cluster_time_window_h');
      expect(keys).toContain('gps_max_accuracy_m');
      expect(keys).toContain('gps_teleport_speed_kmh');
      expect(keys).toContain('gps_weight');
    });

    it('should have GPS weight of 25', () => {
      const weight = gpsRecords.find(r => r.ruleKey === 'gps_weight');
      expect(weight?.weight).toBe('25.00');
    });
  });

  describe('Speed category', () => {
    const speedRecords = FRAUD_THRESHOLD_DEFAULTS.filter(r => r.ruleCategory === 'speed');

    it('should have 4 speed records', () => {
      expect(speedRecords).toHaveLength(4);
    });

    it('should have speed weight of 25', () => {
      const weight = speedRecords.find(r => r.ruleKey === 'speed_weight');
      expect(weight?.weight).toBe('25.00');
    });
  });

  describe('Straightline category', () => {
    const straightlineRecords = FRAUD_THRESHOLD_DEFAULTS.filter(r => r.ruleCategory === 'straightline');

    it('should have 5 straightline records', () => {
      expect(straightlineRecords).toHaveLength(5);
    });

    it('should have straightline weight of 20', () => {
      const weight = straightlineRecords.find(r => r.ruleKey === 'straightline_weight');
      expect(weight?.weight).toBe('20.00');
    });

    it('should have PIR threshold of 0.80', () => {
      const pir = straightlineRecords.find(r => r.ruleKey === 'straightline_pir_threshold');
      expect(pir?.thresholdValue).toBe('0.8000');
    });
  });

  describe('Duplicate category', () => {
    const duplicateRecords = FRAUD_THRESHOLD_DEFAULTS.filter(r => r.ruleCategory === 'duplicate');

    it('should have 4 duplicate records', () => {
      expect(duplicateRecords).toHaveLength(4);
    });

    it('should include exact threshold, partial threshold, lookback days, and weight', () => {
      const keys = duplicateRecords.map(r => r.ruleKey);
      expect(keys).toContain('duplicate_exact_threshold');
      expect(keys).toContain('duplicate_partial_threshold');
      expect(keys).toContain('duplicate_lookback_days');
      expect(keys).toContain('duplicate_weight');
    });

    it('should have duplicate weight of 20', () => {
      const weight = duplicateRecords.find(r => r.ruleKey === 'duplicate_weight');
      expect(weight?.weight).toBe('20.00');
    });

    it('should have partial threshold of 0.70', () => {
      const partial = duplicateRecords.find(r => r.ruleKey === 'duplicate_partial_threshold');
      expect(partial?.thresholdValue).toBe('0.7000');
    });
  });

  describe('Timing category', () => {
    const timingRecords = FRAUD_THRESHOLD_DEFAULTS.filter(r => r.ruleCategory === 'timing');

    it('should have 4 timing records', () => {
      expect(timingRecords).toHaveLength(4);
    });

    it('should include night start, night end, weekend penalty, and weight', () => {
      const keys = timingRecords.map(r => r.ruleKey);
      expect(keys).toContain('timing_night_start_hour');
      expect(keys).toContain('timing_night_end_hour');
      expect(keys).toContain('timing_weekend_penalty');
      expect(keys).toContain('timing_weight');
    });

    it('should have timing weight of 10', () => {
      const weight = timingRecords.find(r => r.ruleKey === 'timing_weight');
      expect(weight?.weight).toBe('10.00');
    });

    it('should have night window 23:00-05:00', () => {
      const start = timingRecords.find(r => r.ruleKey === 'timing_night_start_hour');
      const end = timingRecords.find(r => r.ruleKey === 'timing_night_end_hour');
      expect(start?.thresholdValue).toBe('23.0000');
      expect(end?.thresholdValue).toBe('5.0000');
    });
  });

  describe('Composite severity cutoffs', () => {
    const compositeRecords = FRAUD_THRESHOLD_DEFAULTS.filter(r => r.ruleCategory === 'composite');

    it('should have 4 severity cutoff records', () => {
      expect(compositeRecords).toHaveLength(4);
    });

    it('should define severity boundaries at 25, 50, 70, 85', () => {
      const sorted = compositeRecords
        .map(r => parseFloat(r.thresholdValue))
        .sort((a, b) => a - b);
      expect(sorted).toEqual([25, 50, 70, 85]);
    });

    it('should have severity floors matching category names', () => {
      for (const record of compositeRecords) {
        expect(record.severityFloor).toBeTruthy();
        expect(['low', 'medium', 'high', 'critical']).toContain(record.severityFloor);
      }
    });
  });

  describe('component weights sum to 100', () => {
    it('should have weights summing to 100', () => {
      const weightRecords = FRAUD_THRESHOLD_DEFAULTS.filter(r => r.weight !== null);
      const totalWeight = weightRecords.reduce((sum, r) => sum + parseFloat(r.weight!), 0);
      expect(totalWeight).toBe(100);
    });
  });

  describe('thresholdValue format consistency', () => {
    it('should use 4-decimal precision format for all values', () => {
      for (const record of FRAUD_THRESHOLD_DEFAULTS) {
        expect(record.thresholdValue).toMatch(/^\d+\.\d{4}$/);
      }
    });
  });
});
