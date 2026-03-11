/**
 * Government Official Dashboard TanStack Query Hooks
 *
 * Story 5.1: High-Level Policy Dashboard
 * Reporting dashboard — 60s stale time since data is not real-time operational.
 *
 * NOTE (Story 8.2 review): These hooks call the /reports/* endpoints which are
 * state-wide aggregates with no query-param filtering support. The API's
 * ReportService methods (getOverviewStats, getSkillsDistribution, getLgaBreakdown)
 * query all respondents without WHERE clauses for lgaId, dateFrom, dateTo, or source.
 * Adding filter support requires API-side changes to the ReportService. The global
 * AnalyticsFilters on OfficialStatsPage only affect the analytics hooks (8-1 endpoints),
 * not these Overview-tab endpoints. This is an upstream API limitation, not a frontend bug.
 */

import { useQuery } from '@tanstack/react-query';
import {
  fetchOverviewStats,
  fetchSkillsDistribution,
  fetchLgaBreakdown,
  fetchRegistrationTrends,
} from '../api/official.api';

export const officialKeys = {
  all: ['official'] as const,
  overview: () => [...officialKeys.all, 'overview'] as const,
  skills: () => [...officialKeys.all, 'skills'] as const,
  lgaBreakdown: () => [...officialKeys.all, 'lgaBreakdown'] as const,
  trends: (days: number) => [...officialKeys.all, 'trends', days] as const,
};

export function useOverviewStats() {
  return useQuery({
    queryKey: officialKeys.overview(),
    queryFn: fetchOverviewStats,
    staleTime: 60_000,
  });
}

export function useSkillsDistribution() {
  return useQuery({
    queryKey: officialKeys.skills(),
    queryFn: fetchSkillsDistribution,
    staleTime: 60_000,
  });
}

export function useLgaBreakdown() {
  return useQuery({
    queryKey: officialKeys.lgaBreakdown(),
    queryFn: fetchLgaBreakdown,
    staleTime: 60_000,
  });
}

export function useRegistrationTrends(days: number = 7) {
  return useQuery({
    queryKey: officialKeys.trends(days),
    queryFn: () => fetchRegistrationTrends(days),
    staleTime: 60_000,
  });
}
