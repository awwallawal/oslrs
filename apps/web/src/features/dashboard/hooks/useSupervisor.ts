import { useQuery } from '@tanstack/react-query';
import {
  fetchTeamOverview,
  fetchPendingAlerts,
  fetchTeamMetrics,
  fetchTeamGps,
} from '../api/supervisor.api';

export const supervisorKeys = {
  all: ['supervisor'] as const,
  teamOverview: () => [...supervisorKeys.all, 'teamOverview'] as const,
  pendingAlerts: () => [...supervisorKeys.all, 'pendingAlerts'] as const,
  teamMetrics: () => [...supervisorKeys.all, 'teamMetrics'] as const,
  teamGps: () => [...supervisorKeys.all, 'teamGps'] as const,
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

export function useTeamMetrics() {
  return useQuery({
    queryKey: supervisorKeys.teamMetrics(),
    queryFn: fetchTeamMetrics,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useTeamGps() {
  return useQuery({
    queryKey: supervisorKeys.teamGps(),
    queryFn: fetchTeamGps,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
