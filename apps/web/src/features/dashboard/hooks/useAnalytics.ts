/**
 * Survey Analytics TanStack Query Hooks
 *
 * Story 8.2: Super Admin & Government Official Survey Analytics Dashboard
 * Analytics dashboard — 60s stale time since data is not real-time operational.
 */

import { useQuery } from '@tanstack/react-query';
import type { AnalyticsQueryParams } from '@oslsr/types';
import {
  fetchDemographics,
  fetchEmployment,
  fetchHousehold,
  fetchSkillsFrequency,
  fetchTrends,
  fetchRegistrySummary,
  fetchPipelineSummary,
} from '../api/analytics.api';

export const analyticsKeys = {
  all: ['analytics'] as const,
  demographics: (params?: AnalyticsQueryParams) => [...analyticsKeys.all, 'demographics', params] as const,
  employment: (params?: AnalyticsQueryParams) => [...analyticsKeys.all, 'employment', params] as const,
  household: (params?: AnalyticsQueryParams) => [...analyticsKeys.all, 'household', params] as const,
  skills: (params?: AnalyticsQueryParams) => [...analyticsKeys.all, 'skills', params] as const,
  trends: (params?: AnalyticsQueryParams) => [...analyticsKeys.all, 'trends', params] as const,
  registrySummary: (params?: AnalyticsQueryParams) => [...analyticsKeys.all, 'registrySummary', params] as const,
  pipelineSummary: (params?: AnalyticsQueryParams) => [...analyticsKeys.all, 'pipelineSummary', params] as const,
};

export function useDemographics(params?: AnalyticsQueryParams, enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.demographics(params),
    queryFn: () => fetchDemographics(params),
    staleTime: 60_000,
    enabled,
  });
}

export function useEmployment(params?: AnalyticsQueryParams, enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.employment(params),
    queryFn: () => fetchEmployment(params),
    staleTime: 60_000,
    enabled,
  });
}

export function useHousehold(params?: AnalyticsQueryParams, enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.household(params),
    queryFn: () => fetchHousehold(params),
    staleTime: 60_000,
    enabled,
  });
}

export function useSkillsFrequency(params?: AnalyticsQueryParams, enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.skills(params),
    queryFn: () => fetchSkillsFrequency(params),
    staleTime: 60_000,
    enabled,
  });
}

export function useTrends(params?: AnalyticsQueryParams, enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.trends(params),
    queryFn: () => fetchTrends(params),
    staleTime: 60_000,
    enabled,
  });
}

export function useRegistrySummary(params?: AnalyticsQueryParams, enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.registrySummary(params),
    queryFn: () => fetchRegistrySummary(params),
    staleTime: 60_000,
    enabled,
  });
}

export function usePipelineSummary(params?: AnalyticsQueryParams, enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.pipelineSummary(params),
    queryFn: () => fetchPipelineSummary(params),
    staleTime: 60_000,
    enabled,
  });
}
