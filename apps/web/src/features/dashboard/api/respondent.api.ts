/**
 * Respondent API client
 *
 * Fetch functions for respondent detail endpoints.
 * Created in Story 5.3 (Individual Record PII View).
 */

import { apiClient } from '../../../lib/api-client';
import type { RespondentDetailResponse } from '@oslsr/types';

/**
 * Fetch full respondent detail including submission history and fraud context.
 * PII fields are null for supervisor role (server-side stripping).
 */
export async function fetchRespondentDetail(id: string): Promise<RespondentDetailResponse> {
  const response = await apiClient(`/respondents/${id}`);
  return response.data;
}
