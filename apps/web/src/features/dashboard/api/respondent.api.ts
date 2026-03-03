/**
 * Respondent API client
 *
 * Fetch functions for respondent detail endpoints.
 * Created in Story 5.3 (Individual Record PII View).
 */

import { apiClient, API_BASE_URL, getAuthHeaders } from '../../../lib/api-client';
import type { RespondentDetailResponse, SubmissionResponseDetail } from '@oslsr/types';

/**
 * Fetch full respondent detail including submission history and fraud context.
 * PII fields are null for supervisor role (server-side stripping).
 */
export async function fetchRespondentDetail(id: string): Promise<RespondentDetailResponse> {
  const response = await apiClient(`/respondents/${id}`);
  return response.data;
}

/**
 * Fetch flattened form responses for a single submission.
 * Returns structured sections with human-readable labels.
 */
export async function fetchSubmissionResponses(
  respondentId: string,
  submissionId: string,
): Promise<SubmissionResponseDetail> {
  const response = await apiClient(
    `/respondents/${respondentId}/submissions/${submissionId}/responses`,
  );
  return response.data;
}

/**
 * Download single submission response detail as CSV/PDF.
 */
export async function downloadSubmissionResponseExport(
  respondentId: string,
  submissionId: string,
  format: 'csv' | 'pdf',
): Promise<Blob> {
  const url =
    `${API_BASE_URL}/respondents/${respondentId}/submissions/${submissionId}/export?format=${format}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...getAuthHeaders(),
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: `Failed to export ${format.toUpperCase()}` }));
    throw new Error(err.message || `Failed to export ${format.toUpperCase()}`);
  }

  return response.blob();
}
