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

/** Staff payment history record with dispute info (Story 6.5) */
export interface StaffPaymentRecord {
  id: string;
  batchId: string;
  amount: number; // in kobo
  status: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdAt: string;
  trancheName: string;
  trancheNumber: number;
  bankReference: string | null;
  // Dispute info (from LEFT JOIN)
  disputeId: string | null;
  disputeStatus: string | null;
  disputeComment: string | null;
  disputeAdminResponse: string | null;
  disputeResolvedAt: string | null;
  disputeReopenCount: number | null;
  disputeCreatedAt: string | null;
}

/**
 * Get staff payment history.
 * GET /api/v1/remuneration/staff/:userId/history
 */
export async function getStaffPaymentHistory(
  userId: string,
  params: { page?: number; limit?: number } = {},
) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString();
  return apiClient(`/remuneration/staff/${userId}/history${query ? `?${query}` : ''}`) as Promise<PaginatedResponse<StaffPaymentRecord>>;
}

/**
 * Open a dispute on a payment record (Story 6.5).
 * POST /api/v1/remuneration/disputes
 */
export async function openDispute(data: { paymentRecordId: string; staffComment: string }) {
  return apiClient('/remuneration/disputes', {
    method: 'POST',
    body: JSON.stringify(data),
  }) as Promise<{ success: boolean; data: { id: string } }>;
}

/**
 * Get own disputes (Story 6.5).
 * GET /api/v1/remuneration/disputes/mine
 */
export async function getMyDisputes(params: { page?: number; limit?: number } = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString();
  return apiClient(`/remuneration/disputes/mine${query ? `?${query}` : ''}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Story 6.6: Admin Dispute Resolution Queue
// ═══════════════════════════════════════════════════════════════════════════

/** Dispute queue filters */
export interface DisputeQueueFilters {
  status?: string[];
  lgaId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/** Dispute queue item */
export interface DisputeQueueItem {
  id: string;
  paymentRecordId: string;
  status: string;
  staffComment: string;
  adminResponse: string | null;
  reopenCount: number;
  createdAt: string;
  resolvedAt: string | null;
  amount: number; // in kobo
  trancheName: string;
  trancheNumber: number;
  bankReference: string | null;
  batchDate: string;
  staffName: string | null;
  staffEmail: string | null;
  openedBy: string; // Staff user ID — used for ownership checks, not displayed in queue table
}

/** Dispute detail (full context) */
export interface DisputeDetail extends DisputeQueueItem {
  evidenceFileId: string | null;
  updatedAt: string;
  resolvedBy: string | null;
  recordStatus: string;
  staffLgaId: string | null;
  staffRoleId: string | null;
  staffLgaName: string | null;
  staffRoleName: string | null;
  resolvedByName: string | null;
  evidenceFile: {
    id: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    s3Key: string;
  } | null;
}

/** Dispute queue statistics */
export interface DisputeStats {
  totalOpen: number;
  pending: number;
  resolvedThisMonth: number;
  closed: number;
}

/**
 * Get dispute queue for Super Admin.
 * GET /api/v1/remuneration/disputes
 */
export async function getDisputeQueue(params: DisputeQueueFilters = {}) {
  const searchParams = new URLSearchParams();
  if (params.status?.length) {
    params.status.forEach((s) => searchParams.append('status', s));
  }
  if (params.lgaId) searchParams.set('lgaId', params.lgaId);
  if (params.dateFrom) searchParams.set('dateFrom', params.dateFrom);
  if (params.dateTo) searchParams.set('dateTo', params.dateTo);
  if (params.search) searchParams.set('search', params.search);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString();
  return apiClient(`/remuneration/disputes${query ? `?${query}` : ''}`) as Promise<PaginatedResponse<DisputeQueueItem>>;
}

/**
 * Get dispute queue statistics.
 * GET /api/v1/remuneration/disputes/stats
 */
export async function getDisputeStats() {
  return apiClient('/remuneration/disputes/stats') as Promise<{ success: boolean; data: DisputeStats }>;
}

/**
 * Get dispute detail.
 * GET /api/v1/remuneration/disputes/:disputeId
 */
export async function getDisputeDetail(disputeId: string) {
  return apiClient(`/remuneration/disputes/${disputeId}`) as Promise<{ success: boolean; data: DisputeDetail }>;
}

/**
 * Acknowledge a dispute.
 * PATCH /api/v1/remuneration/disputes/:disputeId/acknowledge
 */
export async function acknowledgeDispute(disputeId: string) {
  return apiClient(`/remuneration/disputes/${disputeId}/acknowledge`, {
    method: 'PATCH',
  }) as Promise<{ success: boolean }>;
}

/**
 * Resolve a dispute with admin response and optional evidence.
 * PATCH /api/v1/remuneration/disputes/:disputeId/resolve (multipart)
 */
export async function resolveDispute(disputeId: string, data: { adminResponse: string; evidence?: File }) {
  const formData = new FormData();
  formData.append('adminResponse', data.adminResponse);
  if (data.evidence) formData.append('evidence', data.evidence);

  const response = await fetch(`${API_BASE_URL}/remuneration/disputes/${disputeId}/resolve`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<{ success: boolean }>;
}

/**
 * Reopen a dispute.
 * PATCH /api/v1/remuneration/disputes/:disputeId/reopen
 */
export async function reopenDispute(disputeId: string, data: { staffComment: string }) {
  return apiClient(`/remuneration/disputes/${disputeId}/reopen`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }) as Promise<{ success: boolean }>;
}
