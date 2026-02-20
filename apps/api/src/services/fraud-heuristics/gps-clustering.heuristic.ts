/**
 * GPS Clustering Heuristic
 *
 * Detects suspicious spatial patterns using DBSCAN clustering with Haversine distance.
 * Max score: 25 points.
 *
 * Primary signal: DBSCAN cluster detection (submissions too close together)
 * Secondary signals: GPS accuracy >50m, teleportation >120km/h, duplicate coords <5m
 *
 * Created in Story 4.3 (Fraud Engine Configurable Thresholds).
 * @see ADR-003 — Fraud Detection Engine Design
 */

import type { FraudHeuristic, FraudThresholdConfig, SubmissionWithContext } from '@oslsr/types';
import { getThreshold } from './utils.js';

const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Haversine distance between two GPS coordinates in meters.
 */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Simple DBSCAN implementation for GPS coordinate clustering.
 * Returns cluster labels: -1 = noise, 0+ = cluster index.
 */
function dbscan(
  points: Array<{ lat: number; lon: number; index: number }>,
  epsilon: number,
  minSamples: number,
): number[] {
  const n = points.length;
  const labels = new Array<number>(n).fill(-2); // -2 = unvisited
  let clusterId = 0;

  function regionQuery(pointIdx: number): number[] {
    const neighbors: number[] = [];
    const p = points[pointIdx];
    for (let i = 0; i < n; i++) {
      if (i === pointIdx) continue;
      const dist = haversineDistance(p.lat, p.lon, points[i].lat, points[i].lon);
      if (dist <= epsilon) {
        neighbors.push(i);
      }
    }
    return neighbors;
  }

  for (let i = 0; i < n; i++) {
    if (labels[i] !== -2) continue; // Already processed

    const neighbors = regionQuery(i);
    if (neighbors.length < minSamples - 1) {
      // -1 = noise (not enough neighbors; -1 because the point itself counts)
      labels[i] = -1;
      continue;
    }

    // Start a new cluster
    labels[i] = clusterId;
    const seedSet = [...neighbors];
    const seedSetLookup = new Set(seedSet);
    let j = 0;

    while (j < seedSet.length) {
      const q = seedSet[j];
      if (labels[q] === -1) {
        // Noise becomes border point
        labels[q] = clusterId;
      }
      if (labels[q] !== -2) {
        j++;
        continue;
      }

      labels[q] = clusterId;
      const qNeighbors = regionQuery(q);
      if (qNeighbors.length >= minSamples - 1) {
        // Core point — expand cluster
        for (const neighbor of qNeighbors) {
          if (!seedSetLookup.has(neighbor)) {
            seedSet.push(neighbor);
            seedSetLookup.add(neighbor);
          }
        }
      }
      j++;
    }

    clusterId++;
  }

  return labels;
}

/**
 * Detect teleportation: speed between consecutive submissions exceeds threshold.
 */
function detectTeleportation(
  submissions: Array<{ submittedAt: string; gpsLatitude: number | null; gpsLongitude: number | null }>,
  speedThresholdKmh: number,
): Array<{ from: string; to: string; speedKmh: number; distanceKm: number }> {
  const teleportations: Array<{ from: string; to: string; speedKmh: number; distanceKm: number }> = [];

  // Sort by submission time
  const sorted = [...submissions]
    .filter((s) => s.gpsLatitude != null && s.gpsLongitude != null)
    .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const distMeters = haversineDistance(
      prev.gpsLatitude!, prev.gpsLongitude!,
      curr.gpsLatitude!, curr.gpsLongitude!,
    );
    const timeDiffHours =
      (new Date(curr.submittedAt).getTime() - new Date(prev.submittedAt).getTime()) / 3_600_000;

    if (timeDiffHours > 0) {
      const speedKmh = (distMeters / 1000) / timeDiffHours;
      if (speedKmh > speedThresholdKmh) {
        teleportations.push({
          from: prev.submittedAt,
          to: curr.submittedAt,
          speedKmh: Math.round(speedKmh * 10) / 10,
          distanceKm: Math.round((distMeters / 1000) * 10) / 10,
        });
      }
    }
  }

  return teleportations;
}

/**
 * Detect duplicate coordinates: <5m between different enumerators same day.
 */
function detectDuplicateCoords(
  currentLat: number,
  currentLon: number,
  nearbySubmissions: SubmissionWithContext['nearbySubmissions'],
  currentEnumeratorId: string,
  thresholdMeters: number,
): Array<{ enumeratorId: string; distanceMeters: number; submissionId: string }> {
  const duplicates: Array<{ enumeratorId: string; distanceMeters: number; submissionId: string }> = [];

  for (const sub of nearbySubmissions) {
    if (sub.enumeratorId === currentEnumeratorId) continue;
    if (sub.gpsLatitude == null || sub.gpsLongitude == null) continue;

    const dist = haversineDistance(currentLat, currentLon, sub.gpsLatitude, sub.gpsLongitude);
    if (dist < thresholdMeters) {
      duplicates.push({
        enumeratorId: sub.enumeratorId,
        distanceMeters: Math.round(dist * 10) / 10,
        submissionId: sub.id,
      });
    }
  }

  return duplicates;
}

export const gpsClusteringHeuristic: FraudHeuristic = {
  key: 'gps_clustering',
  category: 'gps',

  async evaluate(
    submission: SubmissionWithContext,
    config: FraudThresholdConfig[],
  ): Promise<{ score: number; details: Record<string, unknown> }> {
    const { gpsLatitude, gpsLongitude, recentSubmissions, nearbySubmissions, enumeratorId } = submission;

    // No GPS data — no score
    if (gpsLatitude == null || gpsLongitude == null) {
      return { score: 0, details: { reason: 'no_gps_data' } };
    }

    // Load configurable thresholds
    const clusterRadiusM = getThreshold(config, 'gps_cluster_radius_m', 50);
    const clusterMinSamples = getThreshold(config, 'gps_cluster_min_samples', 3);
    const teleportSpeedKmh = getThreshold(config, 'gps_teleport_speed_kmh', 120);
    const duplicateCoordThresholdM = getThreshold(config, 'gps_duplicate_coord_threshold_m', 5);
    const weight = getThreshold(config, 'gps_weight', 25);

    // NOTE: GPS accuracy filtering (AC4.3.2 secondary signal "GPS accuracy >50m")
    // is NOT yet implemented. Requires: (1) a `gps_accuracy` column on submissions,
    // (2) client-side capture of Geolocation API's coords.accuracy, and
    // (3) propagation through the ingestion pipeline. The `gps_max_accuracy_m`
    // threshold config exists in the seed but cannot be used until the data is available.
    // TODO: Implement in a follow-up when GPS accuracy capture is added to the form filler.

    let score = 0;
    const flags: string[] = [];

    // --- Primary: DBSCAN cluster detection ---
    const gpsPoints = recentSubmissions
      .filter((s) => s.gpsLatitude != null && s.gpsLongitude != null)
      .map((s, idx) => ({
        lat: s.gpsLatitude!,
        lon: s.gpsLongitude!,
        index: idx,
      }));

    // Add current submission to the point set
    gpsPoints.push({
      lat: gpsLatitude,
      lon: gpsLongitude,
      index: gpsPoints.length,
    });

    let clusterCount = 0;
    let inCluster = false;

    if (gpsPoints.length >= clusterMinSamples) {
      const labels = dbscan(gpsPoints, clusterRadiusM, clusterMinSamples);
      const uniqueClusters = new Set(labels.filter((l) => l >= 0));
      clusterCount = uniqueClusters.size;

      // Check if current submission (last point) is in a cluster
      const currentLabel = labels[labels.length - 1];
      inCluster = currentLabel >= 0;

      if (inCluster) {
        score += weight * 0.6; // 60% of weight for being in a cluster
        flags.push('in_spatial_cluster');
      }
    }

    // --- Secondary: Teleportation detection ---
    const teleportations = detectTeleportation(
      [
        ...recentSubmissions.map((s) => ({
          submittedAt: s.submittedAt,
          gpsLatitude: s.gpsLatitude,
          gpsLongitude: s.gpsLongitude,
        })),
        {
          submittedAt: submission.submittedAt,
          gpsLatitude,
          gpsLongitude,
        },
      ],
      teleportSpeedKmh,
    );

    if (teleportations.length > 0) {
      score += weight * 0.2; // 20% of weight for teleportation
      flags.push('teleportation_detected');
    }

    // --- Secondary: Duplicate coordinates (different enumerators) ---
    const duplicateCoords = detectDuplicateCoords(
      gpsLatitude,
      gpsLongitude,
      nearbySubmissions,
      enumeratorId,
      duplicateCoordThresholdM,
    );

    if (duplicateCoords.length > 0) {
      score += weight * 0.2; // 20% of weight for duplicate coords
      flags.push('duplicate_coordinates');
    }

    // Cap at max weight
    score = Math.min(score, weight);
    score = Math.round(score * 100) / 100;

    return {
      score,
      details: {
        clusterCount,
        inCluster,
        teleportations,
        duplicateCoords,
        flags,
        gpsPointCount: gpsPoints.length,
        thresholds: {
          clusterRadiusM,
          clusterMinSamples,
          teleportSpeedKmh,
          duplicateCoordThresholdM,
        },
      },
    };
  },
};
