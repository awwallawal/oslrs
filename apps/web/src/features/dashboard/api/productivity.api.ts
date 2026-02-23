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
