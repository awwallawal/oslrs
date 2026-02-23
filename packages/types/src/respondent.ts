/**
 * Respondent Detail Types
 *
 * Types for the individual respondent detail page (Story 5.3).
 * Shared between API and Web packages.
 */

export interface SubmissionSummary {
  id: string;
  submittedAt: string;
  formName: string | null;
  source: 'webapp' | 'mobile' | 'webhook' | 'backfill' | 'manual' | 'public' | 'enumerator' | 'clerk';
  enumeratorName: string | null;
  processed: boolean;
  processingError: string | null;
  fraudDetectionId: string | null;
  fraudSeverity: 'clean' | 'low' | 'medium' | 'high' | 'critical' | null;
  fraudTotalScore: number | null;
  fraudResolution: string | null;
}

export interface FraudSummary {
  highestSeverity: 'clean' | 'low' | 'medium' | 'high' | 'critical';
  flaggedSubmissionCount: number;
  latestResolution: string | null;
}

// --- Story 5.5: Registry Table Types ---

export interface RespondentListItem {
  id: string;
  // PII — null for supervisor
  firstName: string | null;
  lastName: string | null;
  nin: string | null;
  phoneNumber: string | null;
  // Operational — always present
  gender: string | null;
  lgaId: string | null;
  lgaName: string | null;
  source: 'enumerator' | 'public' | 'clerk';
  enumeratorId: string | null;
  enumeratorName: string | null;
  formName: string | null;
  registeredAt: string; // ISO 8601
  // Enriched from fraud_detections
  fraudSeverity: 'clean' | 'low' | 'medium' | 'high' | 'critical' | null;
  fraudTotalScore: number | null;
  verificationStatus:
    | 'unprocessed'
    | 'processing_error'
    | 'auto_clean'
    | 'pending_review'
    | 'flagged'
    | 'under_audit'
    | 'verified'
    | 'rejected';
}

export interface RespondentFilterParams {
  lgaId?: string;
  gender?: string;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  verificationStatus?: string;
  severity?: string;
  formId?: string;
  enumeratorId?: string;
  search?: string;
  cursor?: string;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  meta: {
    pagination: {
      pageSize: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      nextCursor: string | null;
      previousCursor: string | null;
      totalItems: number;
    };
  };
}

export interface RespondentDetailResponse {
  id: string;
  // PII fields - null for supervisor role
  nin: string | null;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  dateOfBirth: string | null;
  // Operational fields - always present
  lgaId: string | null;
  lgaName: string | null;
  source: 'enumerator' | 'public' | 'clerk';
  consentMarketplace: boolean;
  consentEnriched: boolean;
  createdAt: string;
  updatedAt: string;
  // Enriched data
  submissions: SubmissionSummary[];
  fraudSummary: FraudSummary | null;
}
