/**
 * Export API Client — PII-Rich CSV/PDF Downloads
 *
 * Story 5.4: API functions for export operations.
 * Uses raw fetch() for blob downloads (not apiClient which parses JSON).
 */

import { apiClient, ApiError, API_BASE_URL, getAuthHeaders } from '../../../lib/api-client';

/** Filter parameters for export queries */
export interface ExportFilters {
  lgaId?: string;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  severity?: string;
  verificationStatus?: string;
}

/** LGA reference data */
export interface LgaItem {
  id: string;
  name: string;
  code: string;
}

/**
 * GET /api/v1/exports/respondents/count — preview filtered count
 */
export async function fetchExportPreviewCount(filters: ExportFilters): Promise<number> {
  const params = new URLSearchParams();
  if (filters.lgaId) params.set('lgaId', filters.lgaId);
  if (filters.source) params.set('source', filters.source);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.verificationStatus) params.set('verificationStatus', filters.verificationStatus);

  const qs = params.toString();
  const result = await apiClient(`/exports/respondents/count${qs ? `?${qs}` : ''}`);
  return result.data.count;
}

/**
 * GET /api/v1/exports/respondents — download export as blob
 * Uses raw fetch() for binary response (not apiClient which parses JSON).
 */
export async function downloadExport(filters: ExportFilters, format: 'csv' | 'pdf'): Promise<Blob> {
  const params = new URLSearchParams({ format });
  if (filters.lgaId) params.set('lgaId', filters.lgaId);
  if (filters.source) params.set('source', filters.source);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.verificationStatus) params.set('verificationStatus', filters.verificationStatus);

  const response = await fetch(`${API_BASE_URL}/exports/respondents?${params}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    let data: { message?: string; code?: string; details?: unknown } = {};
    try {
      data = await response.json();
    } catch {
      // Non-JSON error response (e.g., nginx 502, rate limiter raw response)
    }
    throw new ApiError(
      data.message || `Export failed (${response.status})`,
      response.status,
      data.code,
      data.details,
    );
  }

  return response.blob();
}

/**
 * GET /api/v1/lgas — permissive LGA list for filter dropdowns
 */
export async function fetchLgas(): Promise<LgaItem[]> {
  const result = await apiClient('/lgas');
  return result.data;
}
