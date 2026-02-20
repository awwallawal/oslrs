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
  enumeratorId: string;
  computedAt: string;
  totalScore: number;
  severity: string;
  resolution: string | null;
  resolutionNotes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  enumeratorName: string;
  submittedAt: string;
}

export interface FraudDetectionDetail {
  id: string;
  submissionId: string;
  enumeratorId: string;
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
  enumeratorName: string;
  enumeratorLgaId: string | null;
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
  enumeratorId: string;
  enumeratorName: string;
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
