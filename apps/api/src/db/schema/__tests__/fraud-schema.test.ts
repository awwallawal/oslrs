import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { fraudThresholds, ruleCategoryTypes } from '../fraud-thresholds.js';
import { fraudDetections, fraudResolutionTypes, fraudSeverityTypes } from '../fraud-detections.js';

describe('fraud-thresholds schema', () => {
  it('should define the fraud_thresholds table with correct name', () => {
    const config = getTableConfig(fraudThresholds);
    expect(config.name).toBe('fraud_thresholds');
  });

  it('should have all required columns in snake_case', () => {
    const config = getTableConfig(fraudThresholds);
    const columnNames = config.columns.map(c => c.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('rule_key');
    expect(columnNames).toContain('display_name');
    expect(columnNames).toContain('rule_category');
    expect(columnNames).toContain('threshold_value');
    expect(columnNames).toContain('weight');
    expect(columnNames).toContain('severity_floor');
    expect(columnNames).toContain('is_active');
    expect(columnNames).toContain('effective_from');
    expect(columnNames).toContain('effective_until');
    expect(columnNames).toContain('version');
    expect(columnNames).toContain('created_by');
    expect(columnNames).toContain('created_at');
    expect(columnNames).toContain('notes');
  });

  it('should use UUID primary key', () => {
    const config = getTableConfig(fraudThresholds);
    const idCol = config.columns.find(c => c.name === 'id');
    expect(idCol).toBeDefined();
    expect(idCol!.primary).toBe(true);
    expect(idCol!.dataType).toBe('string'); // UUID maps to string in Drizzle
  });

  it('should define all 6 rule categories', () => {
    expect(ruleCategoryTypes).toEqual(['gps', 'speed', 'straightline', 'duplicate', 'timing', 'composite']);
  });

  it('should have unique constraint on (rule_key, version)', () => {
    const config = getTableConfig(fraudThresholds);
    const uniqueConstraints = config.uniqueConstraints;
    const ruleKeyVersionConstraint = uniqueConstraints.find(
      uc => uc.name === 'uq_fraud_thresholds_rule_key_version'
    );
    expect(ruleKeyVersionConstraint).toBeDefined();
  });

  it('should export inferred types', () => {
    // Type-level check — these will fail compilation if types are wrong
    const _selectType: typeof fraudThresholds.$inferSelect = {} as any;
    const _insertType: typeof fraudThresholds.$inferInsert = {} as any;
    expect(_selectType).toBeDefined();
    expect(_insertType).toBeDefined();
  });
});

describe('fraud-detections schema', () => {
  it('should define the fraud_detections table with correct name', () => {
    const config = getTableConfig(fraudDetections);
    expect(config.name).toBe('fraud_detections');
  });

  it('should have all required columns in snake_case', () => {
    const config = getTableConfig(fraudDetections);
    const columnNames = config.columns.map(c => c.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('submission_id');
    expect(columnNames).toContain('enumerator_id');
    expect(columnNames).toContain('computed_at');
    expect(columnNames).toContain('config_snapshot_version');
    expect(columnNames).toContain('gps_score');
    expect(columnNames).toContain('speed_score');
    expect(columnNames).toContain('straightline_score');
    expect(columnNames).toContain('duplicate_score');
    expect(columnNames).toContain('timing_score');
    expect(columnNames).toContain('total_score');
    expect(columnNames).toContain('severity');
    expect(columnNames).toContain('gps_details');
    expect(columnNames).toContain('speed_details');
    expect(columnNames).toContain('straightline_details');
    expect(columnNames).toContain('duplicate_details');
    expect(columnNames).toContain('timing_details');
    expect(columnNames).toContain('reviewed_by');
    expect(columnNames).toContain('reviewed_at');
    expect(columnNames).toContain('resolution');
    expect(columnNames).toContain('resolution_notes');
  });

  it('should use UUID primary key', () => {
    const config = getTableConfig(fraudDetections);
    const idCol = config.columns.find(c => c.name === 'id');
    expect(idCol).toBeDefined();
    expect(idCol!.primary).toBe(true);
  });

  it('should have 5 component score columns', () => {
    const config = getTableConfig(fraudDetections);
    const scoreColumns = config.columns.filter(c =>
      c.name.endsWith('_score') && c.name !== 'total_score'
    );
    expect(scoreColumns).toHaveLength(5);
    expect(scoreColumns.map(c => c.name).sort()).toEqual([
      'duplicate_score',
      'gps_score',
      'speed_score',
      'straightline_score',
      'timing_score',
    ]);
  });

  it('should define resolution types', () => {
    expect(fraudResolutionTypes).toContain('confirmed_fraud');
    expect(fraudResolutionTypes).toContain('false_positive');
    expect(fraudResolutionTypes).toContain('needs_investigation');
    expect(fraudResolutionTypes).toContain('dismissed');
    expect(fraudResolutionTypes).toContain('enumerator_warned');
    expect(fraudResolutionTypes).toContain('enumerator_suspended');
  });

  it('should have indexes for supervisor queue queries', () => {
    const config = getTableConfig(fraudDetections);
    const indexes = config.indexes;
    const severityResolutionIdx = indexes.find(
      idx => idx.config.name === 'idx_fraud_detections_severity_resolution'
    );
    expect(severityResolutionIdx).toBeDefined();
  });

  it('should have 4 foreign key references (submissionId, enumeratorId, reviewedBy, assessorReviewedBy)', () => {
    const config = getTableConfig(fraudDetections);
    const foreignKeys = config.foreignKeys;
    // submissionId → submissions, enumeratorId → users, reviewedBy → users, assessorReviewedBy → users
    expect(foreignKeys.length).toBe(4);
  });

  it('should define severity levels as enum', () => {
    expect(fraudSeverityTypes).toEqual(['clean', 'low', 'medium', 'high', 'critical']);
  });

  it('should export inferred types', () => {
    const _selectType: typeof fraudDetections.$inferSelect = {} as any;
    const _insertType: typeof fraudDetections.$inferInsert = {} as any;
    expect(_selectType).toBeDefined();
    expect(_insertType).toBeDefined();
  });
});
