/**
 * Productivity Hooks
 *
 * Story 5.6a: TanStack Query hooks for team productivity feature.
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import {
  fetchTeamProductivity,
  fetchProductivityTargets,
  downloadProductivityExport,
} from '../api/productivity.api';
import type { ProductivityFilterParams } from '@oslsr/types';

export const productivityKeys = {
  all: ['productivity'] as const,
  team: (params: ProductivityFilterParams) => [...productivityKeys.all, 'team', params] as const,
  targets: () => [...productivityKeys.all, 'targets'] as const,
};

export function useTeamProductivity(params: ProductivityFilterParams) {
  return useQuery({
    queryKey: productivityKeys.team(params),
    queryFn: () => fetchTeamProductivity(params),
    staleTime: 30_000,
    refetchInterval: params.period === 'today' ? 60_000 : false,
  });
}

export function useProductivityTargets() {
  return useQuery({
    queryKey: productivityKeys.targets(),
    queryFn: fetchProductivityTargets,
    staleTime: 300_000, // 5 min, targets rarely change
  });
}

export function useProductivityExport() {
  return useMutation({
    mutationFn: ({ filters, format }: { filters: Omit<ProductivityFilterParams, 'page' | 'pageSize'>; format: 'csv' | 'pdf' }) =>
      downloadProductivityExport(filters, format),
    onSuccess: (blob, { format }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `oslsr-team-productivity-${dateStr}.${format === 'csv' ? 'csv' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
}
