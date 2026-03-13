import { useQuery } from '@tanstack/react-query';
import { fetchPublicInsights, fetchPublicTrends } from '../api/publicInsights.api';

export function usePublicInsights() {
  return useQuery({
    queryKey: ['public', 'insights'],
    queryFn: fetchPublicInsights,
    staleTime: 5 * 60 * 1000, // 5 min client-side (server caches 1hr)
  });
}

export function usePublicTrends() {
  return useQuery({
    queryKey: ['public', 'insights', 'trends'],
    queryFn: fetchPublicTrends,
    staleTime: 5 * 60 * 1000,
  });
}
