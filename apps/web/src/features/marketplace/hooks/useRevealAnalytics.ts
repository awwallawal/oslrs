import { useQuery } from '@tanstack/react-query';
import { getRevealStats, getTopViewers, getTopProfiles, getSuspiciousDevices } from '../api/reveal-analytics.api';

const analyticsKeys = {
  all: ['reveal-analytics'] as const,
  stats: () => [...analyticsKeys.all, 'stats'] as const,
  topViewers: (days: number) => [...analyticsKeys.all, 'top-viewers', days] as const,
  topProfiles: (days: number) => [...analyticsKeys.all, 'top-profiles', days] as const,
  suspiciousDevices: (days: number) => [...analyticsKeys.all, 'suspicious-devices', days] as const,
};

export function useRevealStats() {
  return useQuery({
    queryKey: analyticsKeys.stats(),
    queryFn: getRevealStats,
    refetchInterval: 60_000,
  });
}

export function useTopViewers(days: number = 7) {
  return useQuery({
    queryKey: analyticsKeys.topViewers(days),
    queryFn: () => getTopViewers(days),
  });
}

export function useTopProfiles(days: number = 7) {
  return useQuery({
    queryKey: analyticsKeys.topProfiles(days),
    queryFn: () => getTopProfiles(days),
  });
}

export function useSuspiciousDevices(days: number = 7) {
  return useQuery({
    queryKey: analyticsKeys.suspiciousDevices(days),
    queryFn: () => getSuspiciousDevices(days),
  });
}
