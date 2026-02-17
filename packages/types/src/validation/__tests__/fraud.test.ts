import { describe, it, expect } from 'vitest';
import {
  fraudThresholdConfigSchema,
  updateThresholdSchema,
  fraudDetectionResultSchema,
  fraudComponentScoreSchema,
  reviewFraudDetectionSchema,
} from '../fraud.js';
import {
  fraudSeverities,
  heuristicCategories,
  fraudResolutions,
  type FraudSeverity,
  type HeuristicCategory,
  type FraudThresholdConfig,
  type FraudComponentScore,
  type FraudDetectionResult,
  type FraudHeuristic,
} from '../../fraud.js';

// ── Enum / Union Type Tests ──────────────────────────────────────────

describe('fraud type constants', () => {
  it('should define 5 severity levels', () => {
    expect(fraudSeverities).toEqual(['clean', 'low', 'medium', 'high', 'critical']);
  });

  it('should define 6 heuristic categories', () => {
    expect(heuristicCategories).toEqual(['gps', 'speed', 'straightline', 'duplicate', 'timing', 'composite']);
  });

  it('should define 6 resolution types', () => {
    expect(fraudResolutions).toHaveLength(6);
    expect(fraudResolutions).toContain('confirmed_fraud');
    expect(fraudResolutions).toContain('false_positive');
    expect(fraudResolutions).toContain('enumerator_suspended');
  });
});

// ── Interface Type Checks ──────────────────────────────────────────

describe('fraud interfaces (compile-time checks)', () => {
  it('FraudThresholdConfig should have all required fields', () => {
    const config: FraudThresholdConfig = {
      id: '018e5f2a-1234-7890-abcd-1234567890ab',
      ruleKey: 'gps_cluster_radius_m',
      displayName: 'GPS Cluster Radius (m)',
      ruleCategory: 'gps',
      thresholdValue: 50,
      weight: 25,
      severityFloor: null,
      isActive: true,
      effectiveFrom: '2026-02-17T00:00:00.000Z',
      effectiveUntil: null,
      version: 1,
      createdBy: '018e5f2a-0000-7890-abcd-1234567890ab',
      createdAt: '2026-02-17T00:00:00.000Z',
      notes: null,
    };
    expect(config.ruleKey).toBe('gps_cluster_radius_m');
  });

  it('FraudComponentScore should have all 5 components', () => {
    const scores: FraudComponentScore = {
      gps: 15,
      speed: 12,
      straightline: 10,
      duplicate: 0,
      timing: 5,
    };
    expect(scores.gps + scores.speed + scores.straightline + scores.duplicate + scores.timing).toBe(42);
  });

  it('FraudDetectionResult should include component scores and severity', () => {
    const result: FraudDetectionResult = {
      submissionId: '018e5f2a-1234-7890-abcd-1234567890ab',
      enumeratorId: '018e5f2a-0000-7890-abcd-1234567890ab',
      configVersion: 1,
      componentScores: { gps: 25, speed: 25, straightline: 20, duplicate: 0, timing: 0 },
      totalScore: 70,
      severity: 'high',
      details: { gps: null, speed: null, straightline: null, duplicate: null, timing: null },
    };
    expect(result.severity).toBe('high');
  });

  it('FraudHeuristic should define the pluggable contract', () => {
    const heuristic: FraudHeuristic = {
      key: 'gps_cluster',
      category: 'gps',
      evaluate: async () => ({ score: 15, details: { clusters: 2 } }),
    };
    expect(heuristic.key).toBe('gps_cluster');
    expect(heuristic.category).toBe('gps');
  });
});

// ── Zod Schema Validation Tests ──────────────────────────────────────

describe('fraudThresholdConfigSchema', () => {
  const validConfig = {
    id: '018e5f2a-1234-7890-abcd-1234567890ab',
    ruleKey: 'gps_cluster_radius_m',
    displayName: 'GPS Cluster Radius (m)',
    ruleCategory: 'gps',
    thresholdValue: 50,
    weight: 25,
    severityFloor: null,
    isActive: true,
    effectiveFrom: '2026-02-17T00:00:00.000Z',
    effectiveUntil: null,
    version: 1,
    createdBy: '018e5f2a-0000-7890-abcd-1234567890ab',
    createdAt: '2026-02-17T00:00:00.000Z',
    notes: null,
  };

  it('should accept a valid threshold config', () => {
    const result = fraudThresholdConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should reject invalid rule category', () => {
    const result = fraudThresholdConfigSchema.safeParse({
      ...validConfig,
      ruleCategory: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing ruleKey', () => {
    const { ruleKey: _, ...withoutRuleKey } = validConfig;
    const result = fraudThresholdConfigSchema.safeParse(withoutRuleKey);
    expect(result.success).toBe(false);
  });

  it('should accept nullable weight', () => {
    const result = fraudThresholdConfigSchema.safeParse({
      ...validConfig,
      weight: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('updateThresholdSchema', () => {
  it('should accept valid update with only thresholdValue', () => {
    const result = updateThresholdSchema.safeParse({ thresholdValue: 75 });
    expect(result.success).toBe(true);
  });

  it('should accept update with all optional fields', () => {
    const result = updateThresholdSchema.safeParse({
      thresholdValue: 75,
      weight: 30,
      severityFloor: 'medium',
      isActive: true,
      notes: 'Adjusted for urban areas',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing thresholdValue', () => {
    const result = updateThresholdSchema.safeParse({ notes: 'no value' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid severity floor', () => {
    const result = updateThresholdSchema.safeParse({
      thresholdValue: 50,
      severityFloor: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('should reject weight above 100', () => {
    const result = updateThresholdSchema.safeParse({
      thresholdValue: 50,
      weight: 150,
    });
    expect(result.success).toBe(false);
  });
});

describe('fraudComponentScoreSchema', () => {
  it('should accept valid component scores', () => {
    const result = fraudComponentScoreSchema.safeParse({
      gps: 15, speed: 12, straightline: 10, duplicate: 0, timing: 5,
    });
    expect(result.success).toBe(true);
  });

  it('should reject GPS score above 25', () => {
    const result = fraudComponentScoreSchema.safeParse({
      gps: 30, speed: 0, straightline: 0, duplicate: 0, timing: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative scores', () => {
    const result = fraudComponentScoreSchema.safeParse({
      gps: -5, speed: 0, straightline: 0, duplicate: 0, timing: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject timing score above 10', () => {
    const result = fraudComponentScoreSchema.safeParse({
      gps: 0, speed: 0, straightline: 0, duplicate: 0, timing: 15,
    });
    expect(result.success).toBe(false);
  });
});

describe('fraudDetectionResultSchema', () => {
  const validResult = {
    submissionId: '018e5f2a-1234-7890-abcd-1234567890ab',
    enumeratorId: '018e5f2a-0000-7890-abcd-1234567890ab',
    configVersion: 1,
    componentScores: { gps: 25, speed: 0, straightline: 0, duplicate: 0, timing: 0 },
    totalScore: 25,
    severity: 'low',
    details: { gps: { clusters: 2 }, speed: null, straightline: null, duplicate: null, timing: null },
  };

  it('should accept a valid detection result', () => {
    const result = fraudDetectionResultSchema.safeParse(validResult);
    expect(result.success).toBe(true);
  });

  it('should reject invalid severity', () => {
    const result = fraudDetectionResultSchema.safeParse({
      ...validResult,
      severity: 'extreme',
    });
    expect(result.success).toBe(false);
  });

  it('should reject totalScore above 100', () => {
    const result = fraudDetectionResultSchema.safeParse({
      ...validResult,
      totalScore: 150,
    });
    expect(result.success).toBe(false);
  });
});

describe('reviewFraudDetectionSchema', () => {
  it('should accept valid review with resolution only', () => {
    const result = reviewFraudDetectionSchema.safeParse({
      resolution: 'confirmed_fraud',
    });
    expect(result.success).toBe(true);
  });

  it('should accept review with notes', () => {
    const result = reviewFraudDetectionSchema.safeParse({
      resolution: 'false_positive',
      resolutionNotes: 'Enumerator confirmed in dense urban area',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid resolution', () => {
    const result = reviewFraudDetectionSchema.safeParse({
      resolution: 'invalid_resolution',
    });
    expect(result.success).toBe(false);
  });

  it('should reject notes exceeding 1000 characters', () => {
    const result = reviewFraudDetectionSchema.safeParse({
      resolution: 'dismissed',
      resolutionNotes: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});
