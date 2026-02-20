/**
 * Fraud Threshold hooks
 *
 * TanStack Query hooks for fraud threshold management.
 * Created in Story 4.3 (Fraud Engine Configurable Thresholds).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFraudThresholds, updateFraudThreshold } from '../api/fraud-thresholds.api';
import { useToast } from '../../../hooks/useToast';

export const fraudThresholdKeys = {
  all: ['fraud-thresholds'] as const,
};

/**
 * Query hook: load all active thresholds grouped by category.
 */
export function useFraudThresholds() {
  return useQuery({
    queryKey: fraudThresholdKeys.all,
    queryFn: getFraudThresholds,
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Mutation hook: update a threshold value (creates new version).
 */
export function useUpdateFraudThreshold() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({
      ruleKey,
      data,
    }: {
      ruleKey: string;
      data: { thresholdValue: number; notes?: string };
    }) => updateFraudThreshold(ruleKey, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fraudThresholdKeys.all });
      toast.success({ message: 'Threshold updated successfully' });
    },
    onError: () => {
      toast.error({ message: 'Failed to update threshold' });
    },
  });
}
