/**
 * Respondent TanStack Query hooks
 *
 * Query key factory and hooks for respondent detail + registry list.
 * Story 5.3: Individual Record PII View.
 * Story 5.5: Respondent Data Registry Table.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchRespondentDetail } from '../api/respondent.api';
import { fetchRespondentList } from '../api/registry.api';
import type { RespondentFilterParams } from '@oslsr/types';

// ── Query Key Factory ─────────────────────────────────────────────────

export const respondentKeys = {
  all: ['respondents'] as const,
  lists: () => [...respondentKeys.all, 'list'] as const,
  list: (params: RespondentFilterParams) => [...respondentKeys.lists(), params] as const,
  detail: (id: string) => [...respondentKeys.all, 'detail', id] as const,
};

// ── Query Hooks ───────────────────────────────────────────────────────

export function useRespondentDetail(id: string) {
  return useQuery({
    queryKey: respondentKeys.detail(id),
    queryFn: () => fetchRespondentDetail(id),
    enabled: !!id,
    staleTime: 60_000, // 60s — detail data changes infrequently
  });
}

/**
 * Hook for paginated respondent registry list.
 * Supports auto-refresh via refetchInterval (for Live Feed mode).
 */
export function useRespondentList(
  params: RespondentFilterParams,
  options?: { refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: respondentKeys.list(params),
    queryFn: () => fetchRespondentList(params),
    staleTime: 30_000,
    refetchInterval: options?.refetchInterval ?? false,
  });
}
