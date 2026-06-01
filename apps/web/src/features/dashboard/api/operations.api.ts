/**
 * Operations Dashboard API + TanStack Query hook (Story 9-19 Part B).
 *
 * Wraps `GET /api/v1/admin/operations/dashboard` (super-admin only).
 *
 * Polls every 30s (AC#B4) and pauses when the tab is backgrounded. The manual
 * refresh button calls the same endpoint with `?force=1` to bypass the server's
 * 30s cache, then writes the fresh snapshot straight into the query cache.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OpsDashboardSnapshot } from '@oslsr/types';
import { apiClient } from '../../../lib/api-client';

export const OPERATIONS_QUERY_KEY = ['operations', 'dashboard'] as const;

export async function fetchOperationsDashboard(force = false): Promise<OpsDashboardSnapshot> {
  const result = await apiClient(`/admin/operations/dashboard${force ? '?force=1' : ''}`);
  return result.data as OpsDashboardSnapshot;
}

export function useOperationsDashboard() {
  const queryClient = useQueryClient();

  const query = useQuery<OpsDashboardSnapshot>({
    queryKey: OPERATIONS_QUERY_KEY,
    queryFn: () => fetchOperationsDashboard(false),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const refreshMutation = useMutation({
    mutationFn: () => fetchOperationsDashboard(true),
    onSuccess: (data) => queryClient.setQueryData(OPERATIONS_QUERY_KEY, data),
  });

  return {
    ...query,
    refresh: () => refreshMutation.mutate(),
    isRefreshing: refreshMutation.isPending,
  };
}
