/**
 * Remuneration API Client
 * Story 6.4: API functions for bulk payment recording and management.
 */

import { apiClient, API_BASE_URL, getAuthHeaders } from '../../../lib/api-client';

export interface PaymentBatch {
  id: string;
  trancheNumber: number;
  trancheName: string;
  description: string | null;
  bankReference: string | null;
  staffCount: number;
  totalAmount: number; // in kobo
  status: string;
  lgaId: string | null;
  roleFilter: string | null;
  recordedBy: string;
  createdAt: string;
  recordedByName: string | null;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  amount: number; // in kobo
  status: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdAt: string;
  staffName: string | null;
  staffEmail: string | null;
}

export interface BatchDetail extends PaymentBatch {
  records: PaymentRecord[];
  receiptFile: {
    id: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
  } | null;
}

export interface EligibleStaff {
  id: string;
  fullName: string | null;
  email: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  lgaId: string | null;
  lgaName: string | null;
  roleId: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * List payment batches with pagination.
 * GET /api/v1/remuneration
 */
export async function listPaymentBatches(params: { page?: number; limit?: number } = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString();
  return apiClient(`/remuneration${query ? `?${query}` : ''}`) as Promise<PaginatedResponse<PaymentBatch>>;
}

/**
 * Get batch detail with individual records.
 * GET /api/v1/remuneration/:batchId
 */
export async function getBatchDetail(batchId: string) {
  return apiClient(`/remuneration/${batchId}`) as Promise<{ success: boolean; data: BatchDetail }>;
}

/**
 * Create a payment batch.
 * POST /api/v1/remuneration (multipart/form-data)
 */
export async function createPaymentBatch(data: {
  trancheName: string;
  trancheNumber: number;
  amount: number;
  staffIds: string[];
  bankReference?: string;
  description?: string;
  lgaId?: string;
  roleFilter?: string;
  receipt?: File;
}) {
  const formData = new FormData();
  formData.append('trancheName', data.trancheName);
  formData.append('trancheNumber', String(data.trancheNumber));
  formData.append('amount', String(data.amount));
  formData.append('staffIds', JSON.stringify(data.staffIds));
  if (data.bankReference) formData.append('bankReference', data.bankReference);
  if (data.description) formData.append('description', data.description);
  if (data.lgaId) formData.append('lgaId', data.lgaId);
  if (data.roleFilter) formData.append('roleFilter', data.roleFilter);
  if (data.receipt) formData.append('receipt', data.receipt);

  const response = await fetch(`${API_BASE_URL}/remuneration`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<{ success: boolean; data: PaymentBatch }>;
}

/**
 * Correct a payment record (temporal versioning).
 * PATCH /api/v1/remuneration/records/:recordId
 */
export async function correctPaymentRecord(recordId: string, data: { newAmount: number; reason: string }) {
  return apiClient(`/remuneration/records/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Get eligible staff for payment recording.
 * GET /api/v1/remuneration/eligible-staff
 */
export async function getEligibleStaff(params: { roleFilter?: string; lgaId?: string } = {}) {
  const searchParams = new URLSearchParams();
  if (params.roleFilter) searchParams.set('roleFilter', params.roleFilter);
  if (params.lgaId) searchParams.set('lgaId', params.lgaId);
  const query = searchParams.toString();
  return apiClient(`/remuneration/eligible-staff${query ? `?${query}` : ''}`) as Promise<{ success: boolean; data: EligibleStaff[] }>;
}

/**
 * Get staff payment history.
 * GET /api/v1/remuneration/staff/:userId/history
 */
export async function getStaffPaymentHistory(userId: string, params: { page?: number; limit?: number } = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString();
  return apiClient(`/remuneration/staff/${userId}/history${query ? `?${query}` : ''}`);
}
