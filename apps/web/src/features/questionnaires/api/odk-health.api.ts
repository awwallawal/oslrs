/**
 * ODK Health API Client
 *
 * API functions for interacting with the ODK health monitoring endpoints.
 * Used by the Super Admin dashboard to display ODK Central status and
 * manage sync failures.
 *
 * @see Story 2.5-2: Super Admin Dashboard - Questionnaire & ODK Integration
 */

import { apiClient } from '../../../lib/api-client';

/**
 * ODK Central health status
 */
export type OdkHealthStatus = 'healthy' | 'warning' | 'error';

/**
 * ODK health dashboard data returned by the API
 */
export interface OdkHealthData {
  /** Current health status of ODK Central connection */
  status: OdkHealthStatus;
  /** ISO 8601 timestamp of last successful health check */
  lastCheckAt: string;
  /** Number of consecutive failed health checks */
  consecutiveFailures: number;
  /** ODK Central project ID being monitored */
  projectId: string;
  /** Count of unresolved sync failures */
  unresolvedFailures: number;
}

/**
 * Sync failure record from ODK Central
 */
export interface SyncFailure {
  /** Unique identifier for the failure record */
  id: string;
  /** Type of sync operation that failed */
  type: string;
  /** Error message describing the failure */
  message: string;
  /** ISO 8601 timestamp when failure occurred */
  createdAt: string;
  /** Number of retry attempts made */
  retryCount: number;
}

/**
 * Submission gap analysis data
 */
export interface SubmissionGap {
  /** Form ID with gaps */
  formId: string;
  /** Number of missing submissions */
  missingCount: number;
  /** Oldest missing submission timestamp */
  oldestGap: string;
  /** Newest missing submission timestamp */
  newestGap: string;
}

/**
 * Backfill status response
 */
export interface BackfillStatus {
  /** Whether a backfill is currently running */
  isRunning: boolean;
  /** Progress percentage (0-100) */
  progress: number;
  /** Number of submissions pulled so far */
  pulledCount: number;
  /** Total submissions to pull */
  totalCount: number;
  /** ISO 8601 timestamp when backfill started */
  startedAt?: string;
}

/**
 * Get auth headers for authenticated requests
 */
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('accessToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Get ODK health dashboard data (cached)
 */
export async function getOdkHealth(): Promise<{ data: OdkHealthData }> {
  return apiClient('/admin/odk/health', {
    headers: getAuthHeaders(),
  });
}

/**
 * Trigger a manual health check
 */
export async function triggerHealthCheck(): Promise<{ data: OdkHealthData }> {
  return apiClient('/admin/odk/health/check', {
    method: 'POST',
    headers: getAuthHeaders(),
  });
}

/**
 * Get list of unresolved sync failures
 */
export async function getSyncFailures(): Promise<{ data: SyncFailure[] }> {
  return apiClient('/admin/odk/failures', {
    headers: getAuthHeaders(),
  });
}

/**
 * Retry a failed sync operation
 */
export async function retrySyncFailure(id: string): Promise<{ data: { success: boolean } }> {
  return apiClient(`/admin/odk/failures/${id}/retry`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
}

/**
 * Dismiss/resolve a sync failure
 */
export async function dismissSyncFailure(id: string): Promise<void> {
  return apiClient(`/admin/odk/failures/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
}

/**
 * Get submission gap analysis
 */
export async function getSubmissionGaps(): Promise<{ data: SubmissionGap[] }> {
  return apiClient('/admin/odk/backfill/gap', {
    headers: getAuthHeaders(),
  });
}

/**
 * Trigger backfill for missing submissions
 */
export async function triggerBackfill(): Promise<{ data: BackfillStatus }> {
  return apiClient('/admin/odk/backfill', {
    method: 'POST',
    headers: getAuthHeaders(),
  });
}

/**
 * Get current backfill progress
 */
export async function getBackfillStatus(): Promise<{ data: BackfillStatus }> {
  return apiClient('/admin/odk/backfill/status', {
    headers: getAuthHeaders(),
  });
}
