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
  formId?: string;
  exportType?: 'summary' | 'full';
}

/** Published form item for dropdown */
export interface FormListItem {
  id: string;
  title: string;
  formId: string;
  version: string;
}

/** LGA reference data */
export interface LgaItem {
  id: string;
  name: string;
  code: string;
}

/** Build URLSearchParams from ExportFilters (shared between count + download) */
function buildExportParams(filters: ExportFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.lgaId) params.set('lgaId', filters.lgaId);
  if (filters.source) params.set('source', filters.source);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.verificationStatus) params.set('verificationStatus', filters.verificationStatus);
  if (filters.formId) params.set('formId', filters.formId);
  if (filters.exportType) params.set('exportType', filters.exportType);
  return params;
}

/**
 * GET /api/v1/exports/forms — list published forms for dropdown
 */
export async function fetchPublishedForms(): Promise<FormListItem[]> {
  const result = await apiClient('/exports/forms');
  return result.data;
}

/**
 * GET /api/v1/exports/respondents/count — preview filtered count
 */
export async function fetchExportPreviewCount(filters: ExportFilters): Promise<number> {
  const params = buildExportParams(filters);
  const qs = params.toString();
  const result = await apiClient(`/exports/respondents/count${qs ? `?${qs}` : ''}`);
  return result.data.count;
}

/**
 * GET /api/v1/exports/respondents — download export as blob
 * Uses raw fetch() for binary response (not apiClient which parses JSON).
 */
export async function downloadExport(filters: ExportFilters, format: 'csv' | 'pdf'): Promise<Blob> {
  const params = buildExportParams(filters);
  params.set('format', format);

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
