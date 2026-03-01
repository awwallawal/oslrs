/**
 * Remuneration TanStack Query Hooks
 * Story 6.4: Custom hooks for payment batch management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../../hooks/useToast';
import {
  listPaymentBatches,
  getBatchDetail,
  createPaymentBatch,
  correctPaymentRecord,
  getEligibleStaff,
  getStaffPaymentHistory,
  openDispute,
  getDisputeQueue,
  getDisputeStats,
  getDisputeDetail,
  acknowledgeDispute,
  resolveDispute,
  reopenDispute,
} from '../api/remuneration.api';
import type { DisputeQueueFilters } from '../api/remuneration.api';

/** Query key factory */
export const remunerationKeys = {
  all: ['remuneration'] as const,
  lists: () => [...remunerationKeys.all, 'list'] as const,
  list: (params: Record<string, unknown>) => [...remunerationKeys.lists(), params] as const,
  details: () => [...remunerationKeys.all, 'detail'] as const,
  detail: (id: string) => [...remunerationKeys.details(), id] as const,
  eligibleStaff: (params: Record<string, unknown>) => [...remunerationKeys.all, 'eligible-staff', params] as const,
  // Story 6.5
  paymentHistory: (userId: string, params: Record<string, unknown>) => [...remunerationKeys.all, 'payment-history', userId, params] as const,
};

/** Fetch paginated payment batches */
export function usePaymentBatches(params: { page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: remunerationKeys.list(params),
    queryFn: () => listPaymentBatches(params),
  });
}

/** Fetch single batch detail */
export function useBatchDetail(batchId: string | null) {
  return useQuery({
    queryKey: remunerationKeys.detail(batchId || ''),
    queryFn: () => getBatchDetail(batchId!),
    enabled: !!batchId,
  });
}

/** Fetch eligible staff for payment recording */
export function useEligibleStaff(params: { roleFilter?: string; lgaId?: string } = {}) {
  return useQuery({
    queryKey: remunerationKeys.eligibleStaff(params),
    queryFn: () => getEligibleStaff(params),
  });
}

/** Create a payment batch */
export function useCreatePaymentBatch() {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: createPaymentBatch,
    onSuccess: (data) => {
      success({ message: `Payment batch created — ${data.data.staffCount} staff members recorded` });
      queryClient.invalidateQueries({ queryKey: remunerationKeys.lists() });
    },
    onError: (err: Error) => {
      error({ message: err.message || 'Failed to create payment batch' });
    },
  });
}

/** Correct a payment record */
export function useCorrectPaymentRecord() {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: ({ recordId, data }: { recordId: string; data: { newAmount: number; reason: string } }) =>
      correctPaymentRecord(recordId, data),
    onSuccess: () => {
      success({ message: 'Payment record corrected successfully' });
      queryClient.invalidateQueries({ queryKey: remunerationKeys.all });
    },
    onError: (err: Error) => {
      error({ message: err.message || 'Failed to correct payment record' });
    },
  });
}

/** Fetch staff's own payment history (Story 6.5) */
export function useMyPaymentHistory(userId: string, params: { page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: remunerationKeys.paymentHistory(userId, params),
    queryFn: () => getStaffPaymentHistory(userId, params),
    enabled: !!userId,
  });
}

/** Open a dispute on a payment record (Story 6.5) */
export function useOpenDispute() {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: openDispute,
    onSuccess: () => {
      success({ message: 'Dispute submitted. You will be notified when it is reviewed.' });
      queryClient.invalidateQueries({ queryKey: remunerationKeys.all });
    },
    onError: (err: Error) => {
      error({ message: err.message || 'Failed to submit dispute' });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Story 6.6: Admin Dispute Resolution Queue
// ═══════════════════════════════════════════════════════════════════════════

/** Query key factory for disputes */
export const disputeKeys = {
  all: ['disputes'] as const,
  queue: (filters: DisputeQueueFilters) => [...disputeKeys.all, 'queue', filters] as const,
  detail: (id: string) => [...disputeKeys.all, 'detail', id] as const,
  stats: () => [...disputeKeys.all, 'stats'] as const,
};

/** Fetch dispute queue (Super Admin) */
export function useDisputeQueue(filters: DisputeQueueFilters = {}) {
  return useQuery({
    queryKey: disputeKeys.queue(filters),
    queryFn: () => getDisputeQueue(filters),
    staleTime: 30_000,
  });
}

/** Fetch dispute queue statistics */
export function useDisputeStats() {
  return useQuery({
    queryKey: disputeKeys.stats(),
    queryFn: getDisputeStats,
    staleTime: 60_000,
  });
}

/** Fetch single dispute detail */
export function useDisputeDetail(disputeId: string | null) {
  return useQuery({
    queryKey: disputeKeys.detail(disputeId || ''),
    queryFn: () => getDisputeDetail(disputeId!),
    enabled: !!disputeId,
  });
}

/** Acknowledge a dispute */
export function useAcknowledgeDispute() {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: acknowledgeDispute,
    onSuccess: () => {
      success({ message: 'Dispute acknowledged. Staff member notified.' });
      queryClient.invalidateQueries({ queryKey: disputeKeys.all });
    },
    onError: (err: Error) => {
      error({ message: err.message || 'Failed to acknowledge dispute' });
    },
  });
}

/** Resolve a dispute */
export function useResolveDispute() {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: ({ disputeId, data }: { disputeId: string; data: { adminResponse: string; evidence?: File } }) =>
      resolveDispute(disputeId, data),
    onSuccess: () => {
      success({ message: 'Dispute resolved. Staff member notified.' });
      queryClient.invalidateQueries({ queryKey: disputeKeys.all });
    },
    onError: (err: Error) => {
      error({ message: err.message || 'Failed to resolve dispute' });
    },
  });
}

/** Reopen a dispute (Staff) */
export function useReopenDispute() {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: ({ disputeId, data }: { disputeId: string; data: { staffComment: string } }) =>
      reopenDispute(disputeId, data),
    onSuccess: () => {
      success({ message: 'Dispute reopened. Admin will be notified.' });
      queryClient.invalidateQueries({ queryKey: disputeKeys.all });
      queryClient.invalidateQueries({ queryKey: remunerationKeys.all });
    },
    onError: (err: Error) => {
      error({ message: err.message || 'Failed to reopen dispute' });
    },
  });
}
