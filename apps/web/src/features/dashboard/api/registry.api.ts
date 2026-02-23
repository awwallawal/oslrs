/**
 * Registry API Client — Respondent Registry Table
 *
 * Story 5.5: API functions for the server-paginated registry table.
 * Reuses LGA and form list endpoints from Story 5.4.
 */

import { apiClient } from '../../../lib/api-client';
import type {
  RespondentFilterParams,
  RespondentListItem,
  CursorPaginatedResponse,
} from '@oslsr/types';

/**
 * GET /api/v1/respondents — paginated respondent list with filters
 */
export async function fetchRespondentList(
  params: RespondentFilterParams,
): Promise<CursorPaginatedResponse<RespondentListItem>> {
  const searchParams = new URLSearchParams();

  if (params.lgaId) searchParams.set('lgaId', params.lgaId);
  if (params.gender) searchParams.set('gender', params.gender);
  if (params.source) searchParams.set('source', params.source);
  if (params.dateFrom) searchParams.set('dateFrom', params.dateFrom);
  if (params.dateTo) searchParams.set('dateTo', params.dateTo);
  if (params.verificationStatus) searchParams.set('verificationStatus', params.verificationStatus);
  if (params.severity) searchParams.set('severity', params.severity);
  if (params.formId) searchParams.set('formId', params.formId);
  if (params.enumeratorId) searchParams.set('enumeratorId', params.enumeratorId);
  if (params.search) searchParams.set('search', params.search);
  if (params.cursor) searchParams.set('cursor', params.cursor);
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);

  const qs = searchParams.toString();
  return apiClient(`/respondents${qs ? `?${qs}` : ''}`);
}

/** Form reference for filter dropdowns */
export interface FormListItem {
  id: string;
  title: string;
}

/** Enumerator reference for filter dropdowns */
export interface EnumeratorListItem {
  id: string;
  fullName: string;
}

/**
 * GET /api/v1/forms/published — list published forms for filter dropdown
 */
export async function fetchFormList(): Promise<FormListItem[]> {
  const result = await apiClient('/forms/published');
  return result.data;
}

/**
 * GET /api/v1/staff?roleFilter=enumerator — list enumerators for filter dropdown
 * Falls back to empty array if unauthorized.
 */
export async function fetchEnumeratorList(): Promise<EnumeratorListItem[]> {
  try {
    const result = await apiClient('/staff?roleFilter=enumerator&pageSize=500');
    return (result.data || []).map((s: { id: string; fullName: string }) => ({
      id: s.id,
      fullName: s.fullName,
    }));
  } catch {
    return [];
  }
}
