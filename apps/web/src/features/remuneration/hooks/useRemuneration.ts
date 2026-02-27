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
} from '../api/remuneration.api';

/** Query key factory */
export const remunerationKeys = {
  all: ['remuneration'] as const,
  lists: () => [...remunerationKeys.all, 'list'] as const,
  list: (params: Record<string, unknown>) => [...remunerationKeys.lists(), params] as const,
  details: () => [...remunerationKeys.all, 'detail'] as const,
  detail: (id: string) => [...remunerationKeys.details(), id] as const,
  eligibleStaff: (params: Record<string, unknown>) => [...remunerationKeys.all, 'eligible-staff', params] as const,
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
      success(`Payment batch created — ${data.data.staffCount} staff members recorded`);
      queryClient.invalidateQueries({ queryKey: remunerationKeys.lists() });
    },
    onError: (err: Error) => {
      error(err.message || 'Failed to create payment batch');
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
      success('Payment record corrected successfully');
      queryClient.invalidateQueries({ queryKey: remunerationKeys.all });
    },
    onError: (err: Error) => {
      error(err.message || 'Failed to correct payment record');
    },
  });
}
