/**
 * Assessor TanStack Query hooks
 *
 * Query key factory and hooks for the Verification Assessor audit queue.
 * Created in Story 5.2 (Verification Assessor Audit Queue).
 */

import { useQuery } from '@tanstack/react-query';
import { useOptimisticMutation } from '../../../hooks/useOptimisticMutation';
import {
  fetchAuditQueue,
  fetchCompletedReviews,
  fetchQueueStats,
  fetchRecentActivity,
  submitAssessorReview,
  type AuditQueueFilters,
  type CompletedFilters,
  type AssessorReviewBody,
} from '../api/assessor.api';

// ── Query Key Factory ─────────────────────────────────────────────────

export const assessorKeys = {
  all: ['assessor'] as const,
  auditQueue: (filters: AuditQueueFilters) => [...assessorKeys.all, 'auditQueue', filters] as const,
  completed: (filters: CompletedFilters) => [...assessorKeys.all, 'completed', filters] as const,
  stats: () => [...assessorKeys.all, 'stats'] as const,
  recentActivity: () => [...assessorKeys.all, 'recentActivity'] as const,
  detail: (id: string) => [...assessorKeys.all, 'detail', id] as const,
};

// ── Query Hooks ───────────────────────────────────────────────────────

export function useAuditQueue(filters: AuditQueueFilters) {
  return useQuery({
    queryKey: assessorKeys.auditQueue(filters),
    queryFn: () => fetchAuditQueue(filters),
    staleTime: 30_000, // 30s — assessors need reasonably fresh data
  });
}

export function useCompletedReviews(filters: CompletedFilters) {
  return useQuery({
    queryKey: assessorKeys.completed(filters),
    queryFn: () => fetchCompletedReviews(filters),
    staleTime: 30_000,
  });
}

export function useQueueStats() {
  return useQuery({
    queryKey: assessorKeys.stats(),
    queryFn: fetchQueueStats,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}

export function useRecentActivity() {
  return useQuery({
    queryKey: assessorKeys.recentActivity(),
    queryFn: fetchRecentActivity,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}

// ── Mutation Hooks ────────────────────────────────────────────────────

export function useAssessorReview() {
  return useOptimisticMutation({
    mutationFn: ({ detectionId, ...body }: AssessorReviewBody & { detectionId: string }) =>
      submitAssessorReview(detectionId, body),
    invalidateKeys: [
      [...assessorKeys.all],
    ],
    successMessage: false, // Dynamic toast handled by caller
    errorMessage: 'Failed to submit review',
  });
}
