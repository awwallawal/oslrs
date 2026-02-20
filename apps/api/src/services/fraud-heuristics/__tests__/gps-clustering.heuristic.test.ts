import { describe, it, expect } from 'vitest';
import { haversineDistance, gpsClusteringHeuristic } from '../gps-clustering.heuristic.js';
import type { SubmissionWithContext, FraudThresholdConfig } from '@oslsr/types';

// Default GPS thresholds matching seed data
const defaultConfig: FraudThresholdConfig[] = [
  { id: '1', ruleKey: 'gps_cluster_radius_m', displayName: 'Cluster Radius', ruleCategory: 'gps', thresholdValue: 50, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '2', ruleKey: 'gps_cluster_min_samples', displayName: 'Min Samples', ruleCategory: 'gps', thresholdValue: 3, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '3', ruleKey: 'gps_cluster_time_window_h', displayName: 'Time Window', ruleCategory: 'gps', thresholdValue: 4, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '4', ruleKey: 'gps_max_accuracy_m', displayName: 'Max Accuracy', ruleCategory: 'gps', thresholdValue: 50, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '5', ruleKey: 'gps_teleport_speed_kmh', displayName: 'Teleport Speed', ruleCategory: 'gps', thresholdValue: 120, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  { id: '6', ruleKey: 'gps_weight', displayName: 'GPS Weight', ruleCategory: 'gps', thresholdValue: 25, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
];

function makeSubmission(overrides: Partial<SubmissionWithContext> = {}): SubmissionWithContext {
  return {
    submissionId: 'sub-1',
    enumeratorId: 'enum-1',
    questionnaireFormId: 'form-1',
    submittedAt: '2026-02-20T10:00:00Z',
    gpsLatitude: 7.3775,
    gpsLongitude: 3.9470,
    completionTimeSeconds: null,
    rawData: null,
    formSchema: null,
    recentSubmissions: [],
    nearbySubmissions: [],
    ...overrides,
  };
}

describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistance(7.3775, 3.9470, 7.3775, 3.9470)).toBe(0);
  });

  it('calculates distance between Ibadan and Lagos (~128km)', () => {
    const dist = haversineDistance(7.3775, 3.9470, 6.5244, 3.3792);
    expect(dist).toBeGreaterThan(100000);
    expect(dist).toBeLessThan(150000);
  });

  it('handles small distances (<100m)', () => {
    // ~10 meters offset
    const dist = haversineDistance(7.3775, 3.9470, 7.37759, 3.94700);
    expect(dist).toBeLessThan(100);
    expect(dist).toBeGreaterThan(0);
  });
});

describe('gpsClusteringHeuristic', () => {
  it('returns 0 when no GPS data', async () => {
    const sub = makeSubmission({ gpsLatitude: null, gpsLongitude: null });
    const result = await gpsClusteringHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(0);
    expect(result.details.reason).toBe('no_gps_data');
  });

  it('returns 0 when no recent submissions (no cluster possible)', async () => {
    const sub = makeSubmission({ recentSubmissions: [] });
    const result = await gpsClusteringHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(0);
  });

  it('detects cluster when multiple submissions at same location', async () => {
    const baseLat = 7.3775;
    const baseLon = 3.9470;
    const recent = Array.from({ length: 5 }, (_, i) => ({
      id: `sub-${i}`,
      submittedAt: new Date(Date.now() - i * 600000).toISOString(),
      gpsLatitude: baseLat + (Math.random() - 0.5) * 0.0001, // ~10m variation
      gpsLongitude: baseLon + (Math.random() - 0.5) * 0.0001,
      completionTimeSeconds: null,
      rawData: null,
      enumeratorId: 'enum-1',
      questionnaireFormId: 'form-1',
    }));

    const sub = makeSubmission({ recentSubmissions: recent });
    const result = await gpsClusteringHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBeGreaterThan(0);
    expect(result.details.inCluster).toBe(true);
  });

  it('does not flag when submissions are spread far apart', async () => {
    const recent = [
      { id: 's1', submittedAt: '2026-02-20T09:00:00Z', gpsLatitude: 7.38, gpsLongitude: 3.95, completionTimeSeconds: null, rawData: null, enumeratorId: 'enum-1', questionnaireFormId: 'form-1' },
      { id: 's2', submittedAt: '2026-02-20T09:30:00Z', gpsLatitude: 7.40, gpsLongitude: 3.97, completionTimeSeconds: null, rawData: null, enumeratorId: 'enum-1', questionnaireFormId: 'form-1' },
    ];
    const sub = makeSubmission({ gpsLatitude: 7.42, gpsLongitude: 3.99, recentSubmissions: recent });
    const result = await gpsClusteringHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBe(0);
    expect(result.details.inCluster).toBe(false);
  });

  it('detects teleportation between consecutive submissions', async () => {
    // ~128km in 10 minutes = ~768 km/h >> 120 km/h threshold
    const recent = [
      { id: 's1', submittedAt: '2026-02-20T09:50:00Z', gpsLatitude: 6.5244, gpsLongitude: 3.3792, completionTimeSeconds: null, rawData: null, enumeratorId: 'enum-1', questionnaireFormId: 'form-1' },
    ];
    const sub = makeSubmission({
      gpsLatitude: 7.3775,
      gpsLongitude: 3.9470,
      submittedAt: '2026-02-20T10:00:00Z',
      recentSubmissions: recent,
    });
    const result = await gpsClusteringHeuristic.evaluate(sub, defaultConfig);
    expect(result.details.teleportations).toHaveLength(1);
    expect((result.details.flags as string[])).toContain('teleportation_detected');
  });

  it('detects duplicate coordinates from different enumerators', async () => {
    const sub = makeSubmission({
      gpsLatitude: 7.3775,
      gpsLongitude: 3.9470,
      nearbySubmissions: [
        { id: 'other-1', enumeratorId: 'enum-2', submittedAt: '2026-02-20T09:55:00Z', gpsLatitude: 7.3775, gpsLongitude: 3.9470 },
      ],
    });
    const result = await gpsClusteringHeuristic.evaluate(sub, defaultConfig);
    expect((result.details.duplicateCoords as unknown[]).length).toBeGreaterThan(0);
    expect((result.details.flags as string[])).toContain('duplicate_coordinates');
  });

  it('caps score at max weight (25)', async () => {
    // Trigger all flags simultaneously
    const baseLat = 7.3775;
    const baseLon = 3.9470;
    const recent = Array.from({ length: 5 }, (_, i) => ({
      id: `sub-${i}`,
      submittedAt: new Date(Date.now() - i * 600000).toISOString(),
      gpsLatitude: baseLat + (Math.random() - 0.5) * 0.00005,
      gpsLongitude: baseLon + (Math.random() - 0.5) * 0.00005,
      completionTimeSeconds: null,
      rawData: null,
      enumeratorId: 'enum-1',
      questionnaireFormId: 'form-1',
    }));

    const sub = makeSubmission({
      recentSubmissions: recent,
      nearbySubmissions: [
        { id: 'other-1', enumeratorId: 'enum-2', submittedAt: '2026-02-20T09:55:00Z', gpsLatitude: baseLat, gpsLongitude: baseLon },
      ],
    });
    const result = await gpsClusteringHeuristic.evaluate(sub, defaultConfig);
    expect(result.score).toBeLessThanOrEqual(25);
  });

  it('reports correct heuristic metadata', () => {
    expect(gpsClusteringHeuristic.key).toBe('gps_clustering');
    expect(gpsClusteringHeuristic.category).toBe('gps');
  });
});
