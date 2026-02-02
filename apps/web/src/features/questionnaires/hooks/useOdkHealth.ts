/**
 * ODK Health Hooks
 *
 * TanStack Query hooks for ODK health monitoring functionality.
 * Provides reactive data fetching and mutations for the ODK health dashboard.
 *
 * @see Story 2.5-2: Super Admin Dashboard - Questionnaire & ODK Integration
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../../hooks/useToast';
import {
  getOdkHealth,
  triggerHealthCheck,
  getSyncFailures,
  retrySyncFailure,
  dismissSyncFailure,
  getSubmissionGaps,
  triggerBackfill,
  getBackfillStatus,
} from '../api/odk-health.api';

/**
 * Query key factory for ODK health queries
 */
export const odkHealthKeys = {
  all: ['odk'] as const,
  health: () => [...odkHealthKeys.all, 'health'] as const,
  failures: () => [...odkHealthKeys.all, 'failures'] as const,
  gaps: () => [...odkHealthKeys.all, 'gaps'] as const,
  backfill: () => [...odkHealthKeys.all, 'backfill'] as const,
};

/**
 * Hook for fetching ODK health status
 *
 * @param options.enabled - Whether to enable the query (default: true)
 * @returns Query result with ODK health data
 *
 * @example
 * const { data, isLoading } = useOdkHealth();
 * if (data?.data.consecutiveFailures >= 3) {
 *   // Show warning banner
 * }
 */
export function useOdkHealth(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: odkHealthKeys.health(),
    queryFn: getOdkHealth,
    refetchInterval: 60000, // Refetch every 60 seconds
    enabled: options?.enabled ?? true,
  });
}

/**
 * Hook for triggering manual health check
 *
 * @returns Mutation for triggering health check with toast notifications
 *
 * @example
 * const triggerCheck = useTriggerHealthCheck();
 * <button onClick={() => triggerCheck.mutate()}>Retry Now</button>
 */
export function useTriggerHealthCheck() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  return useMutation({
    mutationFn: triggerHealthCheck,
    onSuccess: (data) => {
      const status = data.data.status;
      if (status === 'healthy') {
        success({ message: 'ODK Central is healthy' });
      } else if (status === 'warning') {
        success({ message: 'Health check complete - some issues detected' });
      } else {
        showError({ message: 'ODK Central connection failed' });
      }
      queryClient.invalidateQueries({ queryKey: odkHealthKeys.health() });
    },
    onError: (err: Error) => {
      showError({ message: err.message || 'Health check failed' });
    },
  });
}

/**
 * Hook for fetching unresolved sync failures
 *
 * @returns Query result with sync failures list
 *
 * @example
 * const { data, isLoading } = useSyncFailures();
 * const failures = data?.data ?? [];
 */
export function useSyncFailures() {
  return useQuery({
    queryKey: odkHealthKeys.failures(),
    queryFn: getSyncFailures,
  });
}

/**
 * Hook for retrying a failed sync operation
 *
 * @returns Mutation for retrying sync failures
 *
 * @example
 * const retry = useRetrySyncFailure();
 * <button onClick={() => retry.mutate(failureId)}>Retry</button>
 */
export function useRetrySyncFailure() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  return useMutation({
    mutationFn: retrySyncFailure,
    onSuccess: () => {
      success({ message: 'Retry initiated' });
      queryClient.invalidateQueries({ queryKey: odkHealthKeys.failures() });
    },
    onError: (err: Error) => {
      showError({ message: err.message || 'Retry failed' });
    },
  });
}

/**
 * Hook for dismissing/resolving a sync failure
 *
 * @returns Mutation for dismissing sync failures
 *
 * @example
 * const dismiss = useDismissSyncFailure();
 * <button onClick={() => dismiss.mutate(failureId)}>Dismiss</button>
 */
export function useDismissSyncFailure() {
  const queryClient = useQueryClient();
  const { success } = useToast();

  return useMutation({
    mutationFn: dismissSyncFailure,
    onSuccess: () => {
      success({ message: 'Failure dismissed' });
      queryClient.invalidateQueries({ queryKey: odkHealthKeys.failures() });
      queryClient.invalidateQueries({ queryKey: odkHealthKeys.health() });
    },
  });
}

/**
 * Hook for fetching submission gap analysis
 *
 * @returns Query result with submission gaps
 */
export function useSubmissionGaps() {
  return useQuery({
    queryKey: odkHealthKeys.gaps(),
    queryFn: getSubmissionGaps,
  });
}

/**
 * Hook for triggering submission backfill
 *
 * @returns Mutation for triggering backfill
 */
export function useTriggerBackfill() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  return useMutation({
    mutationFn: triggerBackfill,
    onSuccess: () => {
      success({ message: 'Backfill started' });
      queryClient.invalidateQueries({ queryKey: odkHealthKeys.backfill() });
    },
    onError: (err: Error) => {
      showError({ message: err.message || 'Failed to start backfill' });
    },
  });
}

/**
 * Hook for fetching backfill progress
 *
 * @param options.enabled - Whether to enable polling
 * @returns Query result with backfill status
 */
export function useBackfillStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: odkHealthKeys.backfill(),
    queryFn: getBackfillStatus,
    refetchInterval: options?.enabled ? 5000 : false, // Poll every 5s when enabled
    enabled: options?.enabled ?? false,
  });
}
