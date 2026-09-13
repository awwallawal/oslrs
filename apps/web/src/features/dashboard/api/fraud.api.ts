import { apiClient } from '../../../lib/api-client';
import type { GpsDetails, SpeedDetails, StraightlineDetails, DuplicateDetails, TimingDetails } from '@oslsr/types';

export type { GpsDetails, SpeedDetails, StraightlineDetails, DuplicateDetails, TimingDetails };

export interface FraudFilterParams {
  severity?: string[];
  reviewed?: boolean;
  page?: number;
  limit?: number;
}

export interface FraudDetectionListItem {
  id: string;
  submissionId: string;
  /** Null for an imported detection (13-2 R-A2). */
  enumeratorId: string | null;
  computedAt: string;
  totalScore: number;
  severity: string;
  resolution: string | null;
  resolutionNotes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  /**
   * ⛔ NULLABLE SINCE 13-2 R-A2. An imported detection has no enumerator — the API
   * LEFT JOINs `users` now — so this comes back null and `importBatchId` says who
   * is accountable instead. Render it through `fraudSubjectLabel`, never raw: typed
   * as non-null, the table showed a blank cell and an aria-label reading
   * "Select null".
   */
  enumeratorName: string | null;
  /** Optional: shapes that reuse this type (the assessor queue) never carry one. */
  importBatchId?: string | null;
  submittedAt: string;
}

export interface FraudDetectionDetail {
  id: string;
  submissionId: string;
  /** Null for an imported detection (13-2 R-A2). */
  enumeratorId: string | null;
  computedAt: string;
  configSnapshotVersion: number;
  gpsScore: number;
  speedScore: number;
  straightlineScore: number;
  duplicateScore: number;
  timingScore: number;
  totalScore: number;
  severity: string;
  gpsDetails: GpsDetails | null;
  speedDetails: SpeedDetails | null;
  straightlineDetails: StraightlineDetails | null;
  duplicateDetails: DuplicateDetails | null;
  timingDetails: TimingDetails | null;
  resolution: string | null;
  resolutionNotes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  submittedAt: string;
  /** Null for an imported detection — see the note above. */
  enumeratorName: string | null;
  enumeratorLgaId: string | null;
  importBatchId?: string | null;
  formName: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
}

export interface ReviewBody {
  resolution: string;
  resolutionNotes?: string;
}

export async function fetchFraudDetections(params: FraudFilterParams): Promise<PaginatedResponse<FraudDetectionListItem>> {
  const searchParams = new URLSearchParams();
  if (params.severity && params.severity.length > 0) searchParams.set('severity', params.severity.join(','));
  if (params.reviewed !== undefined) searchParams.set('reviewed', String(params.reviewed));
  searchParams.set('page', String(params.page || 1));
  searchParams.set('pageSize', String(params.limit || 20));
  return apiClient(`/fraud-detections?${searchParams.toString()}`);
}

export async function fetchFraudDetectionDetail(id: string): Promise<{ data: FraudDetectionDetail }> {
  return apiClient(`/fraud-detections/${id}`);
}

export async function submitFraudReview(id: string, body: ReviewBody): Promise<{ data: unknown }> {
  return apiClient(`/fraud-detections/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

// ── Story 4.5: Bulk Verification of Mass-Events ──────────────────────────

export interface ClusterMemberItem {
  id: string;
  submissionId: string;
  /** Null for an imported detection (13-2 R-A2). */
  enumeratorId: string | null;
  enumeratorName: string | null;
  computedAt: string;
  submittedAt: string;
  totalScore: number;
  severity: string;
  resolution: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
}

export interface FraudClusterSummary {
  clusterId: string;
  center: { lat: number; lng: number };
  radiusMeters: number;
  detectionCount: number;
  detectionIds: string[];
  timeRange: { earliest: string | null; latest: string | null };
  severityRange: { min: string; max: string };
  enumerators: Array<{ id: string; name: string }>;
  totalScoreAvg: number;
  members: ClusterMemberItem[];
}

export interface BulkReviewBody {
  ids: string[];
  resolution: string;
  resolutionNotes: string;
}

export async function fetchFraudClusters(): Promise<{ data: FraudClusterSummary[] }> {
  return apiClient('/fraud-detections/clusters');
}

export async function submitBulkFraudReview(body: BulkReviewBody): Promise<{ data: { count: number; resolution: string } }> {
  return apiClient('/fraud-detections/bulk-review', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/**
 * Story 13-2 R-A2 — what to show where an enumerator name used to be.
 *
 * A detection now has one of two accountable parties: a field enumerator, or an
 * import batch. Rendering `enumeratorName` raw produced "null" on screen for the
 * second kind — the same shape of defect as the rest of this story, just in the UI.
 *
 * Deliberately NOT "Unknown": the subject is not unknown, it is a different KIND of
 * subject, and a reviewer needs to know that before deciding what to do about it —
 * the resolutions include "warn enumerator" and "suspend enumerator", neither of
 * which means anything for an import.
 */
export function fraudSubjectLabel(detection: {
  enumeratorName: string | null;
  importBatchId?: string | null;
}): string {
  if (detection.enumeratorName) return detection.enumeratorName;
  return detection.importBatchId ? 'Imported batch' : 'Unattributed';
}
