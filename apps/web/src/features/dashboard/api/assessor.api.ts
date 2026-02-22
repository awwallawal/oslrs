/**
 * Assessor API client
 *
 * Fetch functions for the Verification Assessor audit queue endpoints.
 * Created in Story 5.2 (Verification Assessor Audit Queue).
 */

import { apiClient } from '../../../lib/api-client';

// ── Types ─────────────────────────────────────────────────────────────

export interface AuditQueueItem {
  id: string;
  submissionId: string;
  enumeratorId: string;
  computedAt: string;
  totalScore: number;
  severity: string;
  resolution: string | null;
  resolutionNotes: string | null;
  reviewedAt: string | null;
  enumeratorName: string;
  submittedAt: string;
  lgaId: string | null;
}

export interface CompletedReviewItem {
  id: string;
  submissionId: string;
  enumeratorId: string;
  computedAt: string;
  totalScore: number;
  severity: string;
  resolution: string | null;
  resolutionNotes: string | null;
  assessorResolution: string;
  assessorNotes: string | null;
  assessorReviewedAt: string;
  enumeratorName: string;
  submittedAt: string;
  lgaId: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
}

export interface QueueStats {
  totalPending: number;
  severityBreakdown: Record<string, number>;
  reviewedToday: number;
}

export interface RecentActivityItem {
  id: string;
  action: string;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditQueueFilters {
  lgaId?: string;
  severity?: string[];
  supervisorResolution?: string;
  dateFrom?: string;
  dateTo?: string;
  enumeratorName?: string;
  page?: number;
  pageSize?: number;
}

export interface CompletedFilters {
  assessorDecision?: string;
  dateFrom?: string;
  dateTo?: string;
  severity?: string[];
  page?: number;
  pageSize?: number;
}

export interface AssessorReviewBody {
  assessorResolution: 'final_approved' | 'final_rejected';
  assessorNotes?: string;
}

// ── API Functions ─────────────────────────────────────────────────────

export async function fetchAuditQueue(filters: AuditQueueFilters): Promise<PaginatedResponse<AuditQueueItem>> {
  const params = new URLSearchParams();
  if (filters.lgaId) params.set('lgaId', filters.lgaId);
  if (filters.severity && filters.severity.length > 0) params.set('severity', filters.severity.join(','));
  if (filters.supervisorResolution) params.set('supervisorResolution', filters.supervisorResolution);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.enumeratorName) params.set('enumeratorName', filters.enumeratorName);
  params.set('page', String(filters.page || 1));
  params.set('pageSize', String(filters.pageSize || 20));
  return apiClient(`/assessor/audit-queue?${params.toString()}`);
}

export async function fetchCompletedReviews(filters: CompletedFilters): Promise<PaginatedResponse<CompletedReviewItem>> {
  const params = new URLSearchParams();
  if (filters.assessorDecision) params.set('assessorDecision', filters.assessorDecision);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.severity && filters.severity.length > 0) params.set('severity', filters.severity.join(','));
  params.set('page', String(filters.page || 1));
  params.set('pageSize', String(filters.pageSize || 20));
  return apiClient(`/assessor/completed?${params.toString()}`);
}

export async function fetchQueueStats(): Promise<{ data: QueueStats }> {
  return apiClient('/assessor/stats');
}

export async function fetchRecentActivity(): Promise<{ data: RecentActivityItem[] }> {
  return apiClient('/assessor/recent-activity');
}

export async function submitAssessorReview(
  detectionId: string,
  body: AssessorReviewBody,
): Promise<{ data: Record<string, unknown> }> {
  return apiClient(`/assessor/review/${detectionId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
