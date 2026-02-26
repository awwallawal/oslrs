/**
 * System Health TanStack Query hook
 * Polls every 30 seconds, pauses when tab is backgrounded.
 * Created in Story 6-2.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchSystemHealth } from '../api/system-health.api';

export const systemHealthKeys = {
  all: ['systemHealth'] as const,
  metrics: () => [...systemHealthKeys.all, 'metrics'] as const,
};

export function useSystemHealth(enabled = true) {
  return useQuery({
    queryKey: systemHealthKeys.metrics(),
    queryFn: fetchSystemHealth,
    staleTime: 30_000,
    refetchInterval: enabled ? 30_000 : false,
    refetchIntervalInBackground: false,
    enabled,
  });
}
