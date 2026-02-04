/**
 * Staff API Client
 * Story 2.5-3: API functions for Staff Management
 */

import { apiClient, ApiError } from '../../../lib/api-client';
import type {
  ListStaffParams,
  StaffListResponse,
  StaffResponse,
  RolesListResponse,
  ResendInvitationResponse,
  ImportJobResponse,
  LgasListResponse,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

/**
 * Get auth headers from localStorage
 */
function getAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('oslsr_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * List staff with pagination, filtering, and search
 * GET /api/v1/staff
 */
export async function listStaff(params: ListStaffParams = {}): Promise<StaffListResponse> {
  const searchParams = new URLSearchParams();

  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.status) searchParams.set('status', params.status);
  if (params.roleId) searchParams.set('roleId', params.roleId);
  if (params.lgaId) searchParams.set('lgaId', params.lgaId);
  if (params.search) searchParams.set('search', params.search);

  const query = searchParams.toString();
  return apiClient(`/staff${query ? `?${query}` : ''}`, {
    headers: getAuthHeaders(),
  });
}

/**
 * Update a user's role
 * PATCH /api/v1/staff/:userId/role
 */
export async function updateStaffRole(
  userId: string,
  roleId: string
): Promise<StaffResponse> {
  return apiClient(`/staff/${userId}/role`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ roleId }),
  });
}

/**
 * Deactivate a user
 * POST /api/v1/staff/:userId/deactivate
 */
export async function deactivateStaff(userId: string): Promise<StaffResponse> {
  return apiClient(`/staff/${userId}/deactivate`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
}

/**
 * Resend invitation email to a pending user
 * POST /api/v1/staff/:userId/resend-invitation
 */
export async function resendInvitation(
  userId: string
): Promise<ResendInvitationResponse> {
  return apiClient(`/staff/${userId}/resend-invitation`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
}

/**
 * Download ID card for a staff member
 * GET /api/v1/staff/:userId/id-card
 */
export async function downloadStaffIdCard(userId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/staff/${userId}/id-card`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new ApiError(
      data.message || 'Failed to download ID card',
      response.status,
      data.code,
      data.details
    );
  }

  return response.blob();
}

/**
 * Get list of all roles for dropdown
 * GET /api/v1/roles
 */
export async function listRoles(): Promise<RolesListResponse> {
  return apiClient('/roles', {
    headers: getAuthHeaders(),
  });
}

/**
 * Get list of all LGAs for dropdown
 * GET /api/v1/admin/lgas
 */
export async function listLgas(): Promise<LgasListResponse> {
  return apiClient('/admin/lgas', {
    headers: getAuthHeaders(),
  });
}

/**
 * Create a single staff member manually
 * POST /api/v1/staff/manual
 */
export async function createStaffManual(data: {
  fullName: string;
  email: string;
  phone?: string;
  roleId: string;
  lgaId?: string;
}): Promise<StaffResponse> {
  return apiClient('/staff/manual', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
}

/**
 * Import staff from CSV file
 * POST /api/v1/staff/import
 */
export async function importStaffCsv(file: File): Promise<ImportJobResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/staff/import`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.message || 'Import failed',
      response.status,
      data.code,
      data.details
    );
  }

  return data;
}

/**
 * Get import job status
 * GET /api/v1/staff/import/:jobId
 */
export async function getImportStatus(jobId: string): Promise<ImportJobResponse> {
  return apiClient(`/staff/import/${jobId}`, {
    headers: getAuthHeaders(),
  });
}
