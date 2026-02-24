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
  fetchAllStaffProductivity,
  fetchLgaComparison,
  fetchLgaSummary,
  downloadCrossLgaExport,
} from '../api/productivity.api';
import type { ProductivityFilterParams, CrossLgaFilterParams } from '@oslsr/types';

export const productivityKeys = {
  all: ['productivity'] as const,
  team: (params: ProductivityFilterParams) => [...productivityKeys.all, 'team', params] as const,
  targets: () => [...productivityKeys.all, 'targets'] as const,
  allStaff: (params: CrossLgaFilterParams) => [...productivityKeys.all, 'allStaff', params] as const,
  lgaComparison: (params: CrossLgaFilterParams) => [...productivityKeys.all, 'lgaComparison', params] as const,
  lgaSummary: (params: Record<string, unknown>) => [...productivityKeys.all, 'lgaSummary', params] as const,
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

/**
 * Story 5.6b: Cross-LGA hooks
 */

export function useAllStaffProductivity(params: CrossLgaFilterParams) {
  return useQuery({
    queryKey: productivityKeys.allStaff(params),
    queryFn: () => fetchAllStaffProductivity(params),
    staleTime: 30_000,
    refetchInterval: params.period === 'today' ? 60_000 : false,
  });
}

export function useLgaComparison(params: CrossLgaFilterParams) {
  return useQuery({
    queryKey: productivityKeys.lgaComparison(params),
    queryFn: () => fetchLgaComparison(params),
    staleTime: 30_000,
    refetchInterval: params.period === 'today' ? 60_000 : false,
  });
}

export function useLgaSummary(params: { period?: string; dateFrom?: string; dateTo?: string; lgaId?: string; sortBy?: string; sortOrder?: string }) {
  return useQuery({
    queryKey: productivityKeys.lgaSummary(params as Record<string, unknown>),
    queryFn: () => fetchLgaSummary(params),
    staleTime: 30_000,
    refetchInterval: params.period === 'today' ? 60_000 : false,
  });
}

export function useCrossLgaExport() {
  return useMutation({
    mutationFn: ({ tab, filters, format }: { tab: 'staff' | 'lga-comparison'; filters: CrossLgaFilterParams; format: 'csv' | 'pdf' }) =>
      downloadCrossLgaExport(tab, filters, format),
    onSuccess: (blob, { tab, format }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `oslsr-productivity-${tab}-${dateStr}.${format === 'csv' ? 'csv' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
}
