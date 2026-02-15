import { useQuery } from '@tanstack/react-query';
import { fetchTeamOverview, fetchPendingAlerts } from '../api/supervisor.api';

export const supervisorKeys = {
  all: ['supervisor'] as const,
  teamOverview: () => [...supervisorKeys.all, 'teamOverview'] as const,
  pendingAlerts: () => [...supervisorKeys.all, 'pendingAlerts'] as const,
};

export function useTeamOverview() {
  return useQuery({
    queryKey: supervisorKeys.teamOverview(),
    queryFn: fetchTeamOverview,
  });
}

export function usePendingAlerts() {
  return useQuery({
    queryKey: supervisorKeys.pendingAlerts(),
    queryFn: fetchPendingAlerts,
  });
}
