/**
 * Productivity API Client
 *
 * Story 5.6a: API functions for team productivity feature.
 */

import { apiClient, ApiError, API_BASE_URL, getAuthHeaders } from '../../../lib/api-client';
import type {
  ProductivityFilterParams,
  StaffProductivityRow,
  ProductivitySummary,
  ProductivityTarget,
  TeamProductivityResponse,
  CrossLgaFilterParams,
  CrossLgaStaffResponse,
  LgaComparisonResponse,
  LgaSummaryResponse,
} from '@oslsr/types';

export type { ProductivityFilterParams, StaffProductivityRow, ProductivitySummary, ProductivityTarget };

/**
 * GET /api/v1/productivity/team — team productivity data with pagination
 */
export async function fetchTeamProductivity(
  params: ProductivityFilterParams,
): Promise<TeamProductivityResponse> {
  const searchParams = new URLSearchParams();
  if (params.period) searchParams.set('period', params.period);
  if (params.dateFrom) searchParams.set('dateFrom', params.dateFrom);
  if (params.dateTo) searchParams.set('dateTo', params.dateTo);
  if (params.status) searchParams.set('status', params.status);
  if (params.search) searchParams.set('search', params.search);
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));

  const qs = searchParams.toString();
  const result = await apiClient(`/productivity/team${qs ? `?${qs}` : ''}`);
  return result;
}

/**
 * GET /api/v1/productivity/targets — get active targets
 */
export async function fetchProductivityTargets(): Promise<ProductivityTarget> {
  const result = await apiClient('/productivity/targets');
  return result.data;
}

/**
 * POST /api/v1/productivity/export — download filtered data as CSV/PDF blob
 * Uses raw fetch() for binary response.
 */
export async function downloadProductivityExport(
  filters: Omit<ProductivityFilterParams, 'page' | 'pageSize'>,
  format: 'csv' | 'pdf',
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/productivity/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ ...filters, format }),
  });

  if (!response.ok) {
    let data: { message?: string; code?: string; details?: unknown } = {};
    try {
      data = await response.json();
    } catch {
      // Non-JSON error
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
 * Story 5.6b: Cross-LGA API functions
 */

/** Helper to serialize CrossLgaFilterParams to URLSearchParams */
function serializeCrossLgaParams(params: CrossLgaFilterParams): string {
  const sp = new URLSearchParams();
  if (params.period) sp.set('period', params.period);
  if (params.dateFrom) sp.set('dateFrom', params.dateFrom);
  if (params.dateTo) sp.set('dateTo', params.dateTo);
  if (params.lgaIds && params.lgaIds.length > 0) sp.set('lgaIds', params.lgaIds.join(','));
  if (params.roleId) sp.set('roleId', params.roleId);
  if (params.supervisorId) sp.set('supervisorId', params.supervisorId);
  if (params.staffingModel) sp.set('staffingModel', params.staffingModel);
  if (params.status) sp.set('status', params.status);
  if (params.search) sp.set('search', params.search);
  if (params.sortBy) sp.set('sortBy', params.sortBy);
  if (params.sortOrder) sp.set('sortOrder', params.sortOrder);
  if (params.page) sp.set('page', String(params.page));
  if (params.pageSize) sp.set('pageSize', String(params.pageSize));
  return sp.toString();
}

/** GET /api/v1/productivity/staff — Super Admin: all staff across all LGAs */
export async function fetchAllStaffProductivity(
  params: CrossLgaFilterParams,
): Promise<CrossLgaStaffResponse> {
  const qs = serializeCrossLgaParams(params);
  return apiClient(`/productivity/staff${qs ? `?${qs}` : ''}`);
}

/** GET /api/v1/productivity/lga-comparison — Super Admin: LGA comparison */
export async function fetchLgaComparison(
  params: CrossLgaFilterParams,
): Promise<LgaComparisonResponse> {
  const qs = serializeCrossLgaParams(params);
  return apiClient(`/productivity/lga-comparison${qs ? `?${qs}` : ''}`);
}

/** GET /api/v1/productivity/lga-summary — Government Official + Super Admin */
export async function fetchLgaSummary(
  params: { period?: string; dateFrom?: string; dateTo?: string; lgaId?: string; sortBy?: string; sortOrder?: string },
): Promise<LgaSummaryResponse> {
  const sp = new URLSearchParams();
  if (params.period) sp.set('period', params.period);
  if (params.dateFrom) sp.set('dateFrom', params.dateFrom);
  if (params.dateTo) sp.set('dateTo', params.dateTo);
  if (params.lgaId) sp.set('lgaId', params.lgaId);
  if (params.sortBy) sp.set('sortBy', params.sortBy);
  if (params.sortOrder) sp.set('sortOrder', params.sortOrder);
  const qs = sp.toString();
  return apiClient(`/productivity/lga-summary${qs ? `?${qs}` : ''}`);
}

/** POST /api/v1/productivity/cross-lga-export — Super Admin only */
export async function downloadCrossLgaExport(
  tab: 'staff' | 'lga-comparison',
  filters: CrossLgaFilterParams,
  format: 'csv' | 'pdf',
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/productivity/cross-lga-export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ tab, format, ...filters }),
  });

  if (!response.ok) {
    let data: { message?: string; code?: string; details?: unknown } = {};
    try {
      data = await response.json();
    } catch {
      // Non-JSON error
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
