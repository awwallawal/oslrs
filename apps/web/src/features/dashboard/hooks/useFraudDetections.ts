import { useQuery } from '@tanstack/react-query';
import { useOptimisticMutation } from '../../../hooks/useOptimisticMutation';
import {
  fetchFraudDetections,
  fetchFraudDetectionDetail,
  submitFraudReview,
  type FraudFilterParams,
  type ReviewBody,
} from '../api/fraud.api';

export const fraudKeys = {
  all: ['fraud-detections'] as const,
  lists: () => [...fraudKeys.all, 'list'] as const,
  list: (params: FraudFilterParams) => [...fraudKeys.lists(), params] as const,
  details: () => [...fraudKeys.all, 'detail'] as const,
  detail: (id: string) => [...fraudKeys.details(), id] as const,
};

export function useFraudDetections(params: FraudFilterParams) {
  return useQuery({
    queryKey: fraudKeys.list(params),
    queryFn: () => fetchFraudDetections(params),
  });
}

export function useFraudDetectionDetail(id: string | null) {
  return useQuery({
    queryKey: fraudKeys.detail(id ?? ''),
    queryFn: () => fetchFraudDetectionDetail(id!),
    enabled: !!id,
    select: (response) => response.data,
  });
}

export function useReviewFraudDetection() {
  return useOptimisticMutation({
    mutationFn: ({ id, resolution, resolutionNotes }: ReviewBody & { id: string }) =>
      submitFraudReview(id, { resolution, resolutionNotes }),
    invalidateKeys: [[...fraudKeys.all]],
    successMessage: 'Review submitted successfully',
    errorMessage: 'Failed to submit review',
  });
}
