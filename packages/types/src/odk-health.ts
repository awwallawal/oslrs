/**
 * ODK Health Monitoring Types (Story 2-5)
 *
 * Per ADR-009: Health monitoring and backfill for ODK Central integration.
 * All ODK health operations are encapsulated within @oslsr/odk-integration.
 */

/**
 * ODK operation types that can fail and need tracking
 */
export type OdkOperation =
  | 'form_deploy'
  | 'form_unpublish'
  | 'app_user_create'
  | 'submission_fetch';

/**
 * ODK sync failure record
 */
export interface OdkSyncFailure {
  id: string;
  operation: OdkOperation;
  errorMessage: string;
  errorCode: string;
  context?: Record<string, unknown>;
  retryCount: number;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * ODK connectivity status
 */
export interface OdkConnectivityStatus {
  reachable: boolean;
  latencyMs: number;
  lastChecked: string; // ISO timestamp
  consecutiveFailures: number;
}

/**
 * Submission count comparison between ODK and app_db
 */
export interface OdkSubmissionSyncStatus {
  odkCount: number;
  appDbCount: number;
  delta: number;
  byForm: Array<{
    formId: string;
    xmlFormId: string;
    odkCount: number;
    appDbCount: number;
  }>;
  lastSynced: string; // ISO timestamp
}

/**
 * Admin API response for ODK health dashboard widget
 */
export interface OdkHealthResponse {
  connectivity: OdkConnectivityStatus;
  submissions: OdkSubmissionSyncStatus;
  failures: OdkSyncFailure[];
  backfillInProgress: boolean;
}

/**
 * ODK form info from GET /v1/projects/{projectId}/forms
 */
export interface OdkFormInfo {
  xmlFormId: string;
  name: string;
  version: string;
  state: 'open' | 'closing' | 'closed';
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

/**
 * ODK submission info from GET /v1/projects/{projectId}/forms/{xmlFormId}/submissions
 */
export interface OdkSubmissionInfo {
  instanceId: string;
  submitterId: number;
  createdAt: string;
  updatedAt: string;
  reviewState?: string;
}

/**
 * Input for recording a sync failure
 */
export interface RecordSyncFailureInput {
  operation: OdkOperation;
  errorMessage: string;
  errorCode: string;
  context?: Record<string, unknown>;
}

/**
 * Result of retrying a sync failure
 */
export interface RetrySyncFailureResult {
  success: boolean;
  failureId: string;
  message: string;
}
