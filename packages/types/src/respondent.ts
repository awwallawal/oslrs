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

/**
 * Story 9-56: plain-language registration-status labels, support-facing.
 *
 * Maps the respondent lifecycle `status` enum (active | pending_nin_capture |
 * nin_unavailable | imported_unverified) to the public-journey vocabulary a
 * support agent can read back to a registrant.
 *
 * [Source] Local mapping pending 9-38's status read-model consolidation
 * (AC3.2 — soft-dep, not blocking). When 9-38 lands a canonical read-model +
 * vocabulary, fold this into it.
 */
export const REGISTRATION_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  pending_nin_capture: 'Pending NIN',
  nin_unavailable: 'NIN unavailable',
  imported_unverified: 'Imported (unverified)',
};

/** Map a raw respondent lifecycle status → support-facing plain-language label. */
export function toRegistrationStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return REGISTRATION_STATUS_LABELS[status] ?? status;
}

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
  // Story 9-56: plain-language registration status (support traceability)
  registrationStatus: string;
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

export interface SubmissionResponseDetail {
  submissionId: string;
  respondentId: string;
  submittedAt: string;
  source: string;
  enumeratorName: string | null;
  completionTimeSeconds: number | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  fraudSeverity: string | null;
  fraudScore: number | null;
  verificationStatus: string | null;
  formTitle: string;
  formVersion: string;
  sections: Array<{
    title: string;
    fields: Array<{ label: string; value: string }>;
  }>;
  siblingSubmissionIds: string[];
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
  // Story 9-56: support traceability — plain-language registration status +
  // whether/when a login/magic-link email was issued.
  registrationStatus: string;
  /** ISO 8601 of the most-recent magic-link issuance, or null if none ever issued. */
  magicLinkIssuedAt: string | null;
  // Enriched data
  submissions: SubmissionSummary[];
  fraudSummary: FraudSummary | null;
}
