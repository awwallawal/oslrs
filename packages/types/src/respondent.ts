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
